import assert from "node:assert/strict";
import test from "node:test";

import {
  chooseExistingDataLocation,
  chooseNewDataLocation,
  commitDataLocation,
  prepareDataLocationForUpdate,
  restoreRememberedDataLocation
} from "../src/browser/dataLocation.js";
import { createMemoryDataStore } from "../src/browser/memoryDataStore.js";

test("new data location falls back to a Save As archive when writable folders are unavailable", async () => {
  const fileHandle = { kind: "file", name: "my-liqwid-data.zip" };
  let pickerOptions;
  const location = await chooseNewDataLocation({
    host: {
      async showSaveFilePicker(options) {
        pickerOptions = options;
        return fileHandle;
      }
    }
  });

  assert.equal(location.kind, "archive");
  assert.equal(location.handle, fileHandle);
  assert.equal(location.name, "my-liqwid-data.zip");
  assert.equal(location.store.listPaths().length, 0);
  assert.equal(pickerOptions.suggestedName, "liqwid-data.zip");
});

test("new data location falls back to a normal archive download when no native picker exists", async () => {
  const location = await chooseNewDataLocation({ host: {} });

  assert.equal(location.kind, "download");
  assert.equal(location.handle, null);
  assert.equal(location.name, "liqwid-data.zip");
  assert.equal(location.store.listPaths().length, 0);
});

test("a blocked directory picker falls through to the compatible Save As path", async () => {
  const fileHandle = { kind: "file", name: "fallback.zip" };
  let savePickerCalls = 0;
  const location = await chooseNewDataLocation({
    host: {
      async showDirectoryPicker() {
        throw Object.assign(new Error("blocked by this origin"), { name: "SecurityError" });
      },
      async showSaveFilePicker() {
        savePickerCalls += 1;
        return fileHandle;
      }
    }
  });

  assert.equal(location.kind, "archive");
  assert.equal(location.handle, fileHandle);
  assert.equal(savePickerCalls, 1);
});

test("cancelling a directory picker cancels first start instead of opening another prompt", async () => {
  let savePickerCalls = 0;
  await assert.rejects(
    () => chooseNewDataLocation({
      host: {
        async showDirectoryPicker() {
          throw Object.assign(new Error("cancelled"), { name: "AbortError" });
        },
        async showSaveFilePicker() {
          savePickerCalls += 1;
          return { kind: "file", name: "unexpected.zip" };
        }
      }
    }),
    { name: "AbortError" }
  );
  assert.equal(savePickerCalls, 0);
});

test("archive commit uses the already selected handle without reopening a picker", async () => {
  const store = createMemoryDataStore([{ path: "clean/markets.csv", text: "id\nADA\n" }]);
  const handle = { kind: "file", name: "liqwid-data.zip" };
  let received;
  const location = await commitDataLocation(store, { kind: "archive", handle, name: handle.name }, {
    async saveArchive(receivedStore, options) {
      received = { receivedStore, options };
      return { fileHandle: handle, downloaded: false, suggestedName: handle.name };
    }
  });

  assert.equal(received.receivedStore, store);
  assert.equal(received.options.fileHandle, handle);
  assert.equal(location.kind, "archive");
  assert.equal(location.handle, handle);
});

test("an imported read-only archive gets a Save As handle before its update begins", async () => {
  const handle = { kind: "file", name: "updated-liqwid.zip" };
  let pickerCalls = 0;
  const location = await prepareDataLocationForUpdate({
    kind: "archive",
    handle: null,
    name: "old-liqwid.zip"
  }, {
    async pickArchiveSaveHandle() {
      pickerCalls += 1;
      return handle;
    }
  });

  assert.equal(pickerCalls, 1);
  assert.equal(location.kind, "archive");
  assert.equal(location.handle, handle);
  assert.equal(location.name, "updated-liqwid.zip");
});

test("an existing picker handle renews write permission before update or save", async () => {
  const permissionModes = [];
  const handle = {
    kind: "file",
    name: "recent.zip",
    async queryPermission(options) {
      permissionModes.push(["query", options.mode]);
      return "prompt";
    },
    async requestPermission(options) {
      permissionModes.push(["request", options.mode]);
      return "granted";
    }
  };

  const location = await prepareDataLocationForUpdate({ kind: "archive", handle, name: handle.name });

  assert.equal(location.handle, handle);
  assert.deepEqual(permissionModes, [["query", "readwrite"], ["request", "readwrite"]]);
});

test("a denied remembered handle is not updated", async () => {
  const handle = {
    kind: "file",
    name: "denied.zip",
    async queryPermission() { return "denied"; },
    async requestPermission() { return "denied"; }
  };

  await assert.rejects(
    () => prepareDataLocationForUpdate({ kind: "archive", handle, name: handle.name }),
    { name: "NotAllowedError" }
  );
});

test("existing archive picker retains its writable file handle", async () => {
  const store = createMemoryDataStore([{ path: "computed/protocol-series.csv", text: "date,value\n2026-07-16,1\n" }]);
  const handle = { kind: "file", name: "remember-me.zip", async getFile() {} };
  const location = await chooseExistingDataLocation({
    host: {
      async showOpenFilePicker(options) {
        assert.equal(options.multiple, false);
        return [handle];
      }
    },
    async loadArchive(source) {
      assert.equal(source, handle);
      return store;
    }
  });

  assert.equal(location.kind, "archive");
  assert.equal(location.handle, handle);
  assert.equal(location.name, "remember-me.zip");
  assert.equal(location.store, store);
});

test("remembered locations auto-open only while read permission remains granted", async () => {
  const store = createMemoryDataStore();
  const handle = {
    kind: "file",
    name: "recent.zip",
    async queryPermission() { return "granted"; }
  };
  const result = await restoreRememberedDataLocation({
    async readRememberedLocation() { return { kind: "archive", name: handle.name, handle }; },
    async loadArchive() { return store; }
  });

  assert.equal(result.status, "opened");
  assert.equal(result.location.handle, handle);
  assert.equal(result.location.store, store);
});

test("remembered locations wait for a user gesture when permission must be renewed", async () => {
  let requests = 0;
  const handle = {
    kind: "file",
    name: "recent.zip",
    async queryPermission() { return "prompt"; },
    async requestPermission() { requests += 1; return "granted"; }
  };
  const options = {
    async readRememberedLocation() { return { kind: "archive", name: handle.name, handle }; },
    async loadArchive() { return createMemoryDataStore(); }
  };

  const passive = await restoreRememberedDataLocation(options);
  assert.equal(passive.status, "permission-required");
  assert.equal(requests, 0);

  const reopened = await restoreRememberedDataLocation({ ...options, requestPermission: true });
  assert.equal(reopened.status, "opened");
  assert.equal(requests, 1);
});
