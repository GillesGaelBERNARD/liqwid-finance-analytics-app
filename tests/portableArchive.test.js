import assert from "node:assert/strict";
import test from "node:test";

import {
  createPortableDataStore,
  decodeZip,
  decodeZipArchive,
  encodeZip,
  loadPortableDataArchive,
  pickPortableDataSaveHandle,
  PORTABLE_DATA_MANIFEST_PATH,
  savePortableDataArchive
} from "../src/browser/portableArchive.js";

test("portable data store preserves UTF-8 text and explicit JSON entries", async () => {
  const store = createPortableDataStore();

  await store.ensureLayout();
  await store.writeText("clean/market-history/ada.csv", "market,café\nADA,€\n");
  await store.writeJson("raw/api/markets-current.json", { market: "ADA", label: "Liqwid ✓" });

  assert.equal(await store.readText("clean/market-history/ada.csv"), "market,café\nADA,€\n");
  assert.deepEqual(await store.readJson("raw/api/markets-current.json"), {
    market: "ADA",
    label: "Liqwid ✓"
  });
  assert.deepEqual(store.listPaths(), [
    "clean/market-history/ada.csv",
    "raw/api/markets-current.json"
  ]);
});

test("portable data store exports and clones independent snapshots", async () => {
  const store = createPortableDataStore();
  await store.writeText("computed/sample-data.txt", "original");

  const clone = store.clone();
  await clone.writeText("computed/sample-data.txt", "changed");
  await clone.writeText("metadata/summary.txt", "new");
  const exported = store.exportEntries();
  exported[0].text = "tampered";

  assert.equal(await store.readText("computed/sample-data.txt"), "original");
  assert.equal(await store.readText("metadata/summary.txt", "missing"), "missing");
  assert.deepEqual(store.exportEntries(), [
    { path: "computed/sample-data.txt", text: "original" }
  ]);
});

test("portable data store can remove redundant entries before save", async () => {
  const store = createPortableDataStore();
  await store.writeText("clean/current-all-loans.csv", "id\n1\n");
  await store.writeText("clean/current-active-loans.csv", "id\n1\n");

  await store.deletePath("clean/current-active-loans.csv");

  assert.deepEqual(store.listPaths(), ["clean/current-all-loans.csv"]);
});

test("portable data store rejects unsafe relative paths", async () => {
  const store = createPortableDataStore();
  const unsafePaths = [
    "",
    "../outside.txt",
    "raw/../outside.txt",
    "/absolute.txt",
    "C:/absolute.txt",
    "raw\\api\\response.json",
    "raw//response.json",
    "raw/./response.json",
    "raw/file:stream",
    "raw/line\nbreak.txt"
  ];

  for (const path of unsafePaths) {
    await assert.rejects(() => store.writeText(path, "unsafe"), /safe relative path/i, path);
  }
  assert.deepEqual(store.listPaths(), []);
});

test("portable data store can refuse to overwrite immutable captures", async () => {
  const store = createPortableDataStore();
  const path = "raw/api/fetches/run-1/markets-current.json";
  await store.writeText(path, "first", { overwrite: false });

  await assert.rejects(
    () => store.writeText(path, "second", { overwrite: false }),
    /refusing to overwrite/i
  );
  assert.equal(await store.readText(path), "first");

  await store.writeText(path, "updated");
  assert.equal(await store.readText(path), "updated");
});

test("uncompressed ZIP round-trip preserves UTF-8 text entries", () => {
  const bytes = encodeZip([
    { path: "metadata/summary.txt", text: "Liqwid café ☕" },
    { path: "clean/market-history/ada.csv", text: "date,value\n2026-01-01,€1\n" }
  ]);

  assert.ok(bytes instanceof Uint8Array);
  assert.equal(new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint16(8, true), 0);
  assert.deepEqual(decodeZip(bytes), [
    { path: "clean/market-history/ada.csv", text: "date,value\n2026-01-01,€1\n" },
    { path: "metadata/summary.txt", text: "Liqwid café ☕" }
  ]);
});

test("ZIP decoder rejects payloads that fail CRC validation", () => {
  const bytes = encodeZip([{ path: "computed/sample-data.txt", text: "untampered" }]);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const dataOffset = 30 + view.getUint16(26, true) + view.getUint16(28, true);
  bytes[dataOffset] ^= 0xff;

  assert.throws(() => decodeZip(bytes), /CRC validation failed/i);
});

test("ZIP encoder and decoder reject traversal paths", () => {
  assert.throws(() => encodeZip([{ path: "../x.txt", text: "unsafe" }]), /safe relative path/i);

  const bytes = encodeZip([{ path: "safe.txt", text: "payload" }]);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const centralOffset = view.getUint32(bytes.length - 22 + 16, true);
  const unsafeName = new TextEncoder().encode("../x.txt");
  bytes.set(unsafeName, 30);
  bytes.set(unsafeName, centralOffset + 46);

  assert.throws(() => decodeZip(bytes), /safe relative path/i);
});

test("portable archive saves and reopens through a file handle with a CSV manifest", async () => {
  const store = createPortableDataStore();
  await store.writeText("clean/market-history/ada.csv", "date,value\n2026-01-01,42\n");
  await store.writeJson("raw/api/markets-current.json", { source: "official-api", rows: [1, 2] });

  let writtenBytes = null;
  let closed = false;
  const fileHandle = {
    name: "liqwid-data.zip",
    async createWritable() {
      return {
        async write(value) {
          writtenBytes = new Uint8Array(value);
        },
        async close() {
          closed = true;
        }
      };
    }
  };

  const result = await savePortableDataArchive(store, { fileHandle });

  assert.equal(result.fileHandle, fileHandle);
  assert.equal(result.downloaded, false);
  assert.equal(closed, true);
  const archiveEntries = await decodeZipArchive(writtenBytes);
  const manifest = archiveEntries.find((entry) => entry.path === PORTABLE_DATA_MANIFEST_PATH)?.text;
  assert.match(manifest, /^archive_format,archive_version,path,utf8_bytes,crc32\n/);
  assert.match(manifest, /liqwid-portable-data,1,"clean\/market-history\/ada\.csv"/);
  assert.doesNotMatch(manifest, /^\s*[\[{]/);

  const reopened = await loadPortableDataArchive(writtenBytes);
  assert.deepEqual(reopened.listPaths(), [
    "clean/market-history/ada.csv",
    "raw/api/markets-current.json"
  ]);
  assert.equal(await reopened.readText("clean/market-history/ada.csv"), "date,value\n2026-01-01,42\n");
  assert.deepEqual(await reopened.readJson("raw/api/markets-current.json"), {
    source: "official-api",
    rows: [1, 2]
  });
});

test("portable archive save deflates compressible entries when browser streams are available", async () => {
  const store = createPortableDataStore();
  await store.writeText("clean/repeated.csv", `value\n${"repeated-value\n".repeat(2000)}`);
  let writtenBytes;

  await savePortableDataArchive(store, {
    fileHandle: null,
    async download(bytes) { writtenBytes = bytes; }
  });

  const view = new DataView(writtenBytes.buffer, writtenBytes.byteOffset, writtenBytes.byteLength);
  const centralOffset = view.getUint32(writtenBytes.length - 22 + 16, true);
  assert.equal(view.getUint16(centralOffset + 10, true), 8);
  const reopened = await loadPortableDataArchive(writtenBytes);
  assert.match(await reopened.readText("clean/repeated.csv"), /repeated-value/);
});

test("portable archive save picker uses MTG-style feature detection", async () => {
  assert.equal(await pickPortableDataSaveHandle({ host: {} }), null);

  const expectedHandle = { name: "selected.zip" };
  let receivedOptions = null;
  const host = {
    async showSaveFilePicker(options) {
      assert.equal(this, host);
      receivedOptions = options;
      return expectedHandle;
    }
  };

  assert.equal(await pickPortableDataSaveHandle({ host, suggestedName: "history.zip" }), expectedHandle);
  assert.equal(receivedOptions.suggestedName, "history.zip");
  assert.deepEqual(receivedOptions.types[0].accept, { "application/zip": [".zip"] });
});

test("portable archive falls back to an injected download", async () => {
  const store = createPortableDataStore();
  await store.writeText("metadata/summary.txt", "portable");
  let download = null;

  const result = await savePortableDataArchive(store, {
    suggestedName: "liqwid-history.zip",
    async pickSaveHandle() {
      return null;
    },
    async download(bytes, metadata) {
      download = { bytes, metadata };
    }
  });

  assert.equal(result.fileHandle, null);
  assert.equal(result.downloaded, true);
  assert.deepEqual(download.metadata, {
    suggestedName: "liqwid-history.zip",
    mimeType: "application/zip"
  });
  const reopened = await loadPortableDataArchive(download.bytes);
  assert.equal(await reopened.readText("metadata/summary.txt"), "portable");
});

test("an explicitly unavailable save handle does not reopen the picker after fetching", async () => {
  const store = createPortableDataStore();
  await store.writeText("computed/protocol-series.csv", "date,value\n2026-07-13,42\n");
  let pickerCalls = 0;
  let downloadedBytes = null;

  const result = await savePortableDataArchive(store, {
    fileHandle: null,
    host: {
      async showSaveFilePicker() {
        pickerCalls += 1;
        throw new Error("user activation already expired");
      }
    },
    async download(bytes) { downloadedBytes = bytes; }
  });

  assert.equal(pickerCalls, 0);
  assert.equal(result.downloaded, true);
  assert.ok(downloadedBytes instanceof Uint8Array);
});

test("portable archive default download clicks and cleans up a browser link", async () => {
  const store = createPortableDataStore();
  await store.writeText("computed/sample-data.txt", "browser download");
  const events = [];
  let createdBlob = null;
  const link = {
    click() { events.push("click"); },
    remove() { events.push("remove"); }
  };
  const host = {
    Blob,
    URL: {
      createObjectURL(blob) {
        createdBlob = blob;
        return "blob:archive";
      },
      revokeObjectURL(url) { events.push(`revoke:${url}`); }
    },
    document: {
      body: { appendChild(value) { assert.equal(value, link); events.push("append"); } },
      createElement(tag) { assert.equal(tag, "a"); return link; }
    },
    setTimeout(callback) { callback(); }
  };

  const result = await savePortableDataArchive(store, { host });

  assert.equal(result.downloaded, true);
  assert.equal(link.href, "blob:archive");
  assert.equal(link.download, "liqwid-data.zip");
  assert.equal(createdBlob.type, "application/zip");
  assert.deepEqual(events, ["append", "click", "remove", "revoke:blob:archive"]);
});
