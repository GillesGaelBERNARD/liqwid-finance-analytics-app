import assert from "node:assert/strict";
import test from "node:test";

import {
  commitDataStoreToDirectory,
  openDirectoryDataStore,
  pickDataDirectory
} from "../src/browser/directoryStore.js";
import { createPortableDataStore } from "../src/browser/portableArchive.js";

class MockFileHandle {
  constructor(name, text = "") {
    this.kind = "file";
    this.name = name;
    this.text = text;
  }

  async getFile() {
    return { text: async () => this.text };
  }

  async createWritable() {
    let next = "";
    return {
      write: async (value) => {
        if (this.failNextWrite) {
          this.failNextWrite = false;
          throw new Error("simulated folder write failure");
        }
        next = String(value);
      },
      close: async () => { this.text = next; }
    };
  }
}

class MockDirectoryHandle {
  constructor(name) {
    this.kind = "directory";
    this.name = name;
    this.children = new Map();
  }

  async getDirectoryHandle(name, options = {}) {
    const current = this.children.get(name);
    if (current?.kind === "directory") return current;
    if (!options.create) throw Object.assign(new Error("missing directory"), { name: "NotFoundError" });
    const directory = new MockDirectoryHandle(name);
    this.children.set(name, directory);
    return directory;
  }

  async getFileHandle(name, options = {}) {
    const current = this.children.get(name);
    if (current?.kind === "file") return current;
    if (!options.create) throw Object.assign(new Error("missing file"), { name: "NotFoundError" });
    const file = new MockFileHandle(name);
    this.children.set(name, file);
    return file;
  }

  async *entries() {
    yield* this.children.entries();
  }

  async removeEntry(name) {
    if (!this.children.delete(name)) throw Object.assign(new Error("missing entry"), { name: "NotFoundError" });
  }
}

test("native directory picker is the only authority needed to select the data folder", async () => {
  const expected = new MockDirectoryHandle("liqwid");
  let options;
  const selected = await pickDataDirectory({
    host: {
      async showDirectoryPicker(value) {
        options = value;
        return expected;
      }
    }
  });

  assert.equal(selected, expected);
  assert.equal(options.mode, "readwrite");
});

test("folder data opens as a staged in-memory store and ignores non-data binaries", async () => {
  const root = new MockDirectoryHandle("liqwid");
  const clean = await root.getDirectoryHandle("clean", { create: true });
  clean.children.set("markets.csv", new MockFileHandle("markets.csv", "id,displayName\nADA,ADA\n"));
  const computed = await root.getDirectoryHandle("computed", { create: true });
  computed.children.set("obsolete-analysis.json", new MockFileHandle("obsolete-analysis.json", '{"stale":true}'));
  const raw = await root.getDirectoryHandle("raw", { create: true });
  raw.children.set("old.png", new MockFileHandle("old.png", "not text data"));

  const store = await openDirectoryDataStore(root);

  assert.equal(store.name, "liqwid");
  assert.match(await store.readText("clean/markets.csv"), /ADA/);
  assert.equal(store.listPaths().includes("computed/obsolete-analysis.json"), false);
  assert.equal(store.listPaths().includes("raw/old.png"), false);
});

test("a completed staged refresh commits nested raw, clean, computed, and metadata files", async () => {
  const root = new MockDirectoryHandle("liqwid");
  const store = createPortableDataStore([], { name: "liqwid" });
  await store.writeJson("raw/api/fetches/run/markets-current.json", { rowCount: 1 });
  await store.writeText("clean/markets.csv", "id\nADA\n");
  await store.writeText("computed/market-summaries.csv", "marketId\nADA\n");
  await store.writeText("metadata/settings.csv", "schemaVersion\n2\n");

  await commitDataStoreToDirectory(store, root);
  const reopened = await openDirectoryDataStore(root);

  assert.deepEqual(await reopened.readJson("raw/api/fetches/run/markets-current.json"), { rowCount: 1 });
  assert.match(await reopened.readText("clean/markets.csv"), /ADA/);
  assert.match(await reopened.readText("computed/market-summaries.csv"), /ADA/);
  assert.match(await reopened.readText("metadata/settings.csv"), /2/);
});

test("a completed directory commit removes files pruned from the staged archive", async () => {
  const root = new MockDirectoryHandle("liqwid");
  const previous = createPortableDataStore([], { name: "liqwid" });
  await previous.writeText("clean/current-all-loans.csv", "id\n1\n");
  await previous.writeText("clean/current-active-loans.csv", "id\n1\n");
  await commitDataStoreToDirectory(previous, root);

  const next = previous.clone();
  await next.deletePath("clean/current-active-loans.csv");
  await commitDataStoreToDirectory(next, root, { rollbackStore: previous });

  const reopened = await openDirectoryDataStore(root);
  assert.deepEqual(reopened.listPaths(), ["clean/current-all-loans.csv"]);
});

test("a folder write failure restores every file from the previous good generation", async () => {
  const root = new MockDirectoryHandle("liqwid");
  const previous = createPortableDataStore([], { name: "liqwid" });
  await previous.writeText("clean/markets.csv", "id\nOLD\n");
  await previous.writeText("computed/market-summaries.csv", "marketId\nOLD\n");
  await commitDataStoreToDirectory(previous, root);

  const next = previous.clone();
  await next.writeText("clean/markets.csv", "id\nNEW\n");
  await next.writeText("computed/market-summaries.csv", "marketId\nNEW\n");
  const computed = await root.getDirectoryHandle("computed");
  const failingFile = await computed.getFileHandle("market-summaries.csv");
  failingFile.failNextWrite = true;

  await assert.rejects(
    () => commitDataStoreToDirectory(next, root, { rollbackStore: previous }),
    /simulated folder write failure/
  );
  const reopened = await openDirectoryDataStore(root);
  assert.match(await reopened.readText("clean/markets.csv"), /OLD/);
  assert.match(await reopened.readText("computed/market-summaries.csv"), /OLD/);
});
