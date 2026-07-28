import assert from "node:assert/strict";
import test from "node:test";

import {
  clearRecentDataLocation,
  readRecentDataLocation,
  rememberRecentDataLocation
} from "../src/browser/recentDataLocation.js";

function memoryStorage() {
  let value = null;
  return {
    async read() { return value; },
    async write(next) { value = next; },
    async clear() { value = null; }
  };
}

test("recent data location stores picker-granted handles without serializing a path", async () => {
  const storage = memoryStorage();
  const handle = { kind: "file", name: "liqwid-history.zip" };

  assert.equal(await rememberRecentDataLocation({ kind: "archive", name: handle.name, handle }, { storage }), true);
  assert.deepEqual(await readRecentDataLocation({ storage }), {
    kind: "archive",
    name: "liqwid-history.zip",
    handle
  });
});

test("a non-reopenable location clears the previously remembered handle", async () => {
  const storage = memoryStorage();
  await rememberRecentDataLocation({ kind: "archive", name: "old.zip", handle: { kind: "file" } }, { storage });

  assert.equal(await rememberRecentDataLocation({ kind: "download", name: "new.zip", handle: null }, { storage }), false);
  assert.equal(await readRecentDataLocation({ storage }), null);
  await clearRecentDataLocation({ storage });
  assert.equal(await readRecentDataLocation({ storage }), null);
});
