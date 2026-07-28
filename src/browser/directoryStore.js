import { createMemoryDataStore } from "./memoryDataStore.js";

const DATA_ROOTS = ["raw", "clean", "computed", "metadata"];
const CSV_FILE_PATTERN = /\.csv$/i;
const RAW_JSON_FILE_PATTERN = /^raw\/.+\.json$/i;
const REQUIRED_DIRECTORIES = [
  "raw/api",
  "clean/market-history",
  "clean/market-params-history",
  "computed",
  "metadata"
];

export async function pickDataDirectory(options = {}) {
  const host = options.host ?? globalThis;
  if (typeof host?.showDirectoryPicker !== "function") {
    throw new Error("This browser does not expose the native writable-folder picker. Open this HTML file in a current Chrome, Edge, or Brave tab.");
  }
  return host.showDirectoryPicker({
    id: "liqwid-analysis-data",
    mode: "readwrite",
    startIn: options.startIn ?? "documents"
  });
}

export async function openDirectoryDataStore(rootHandle) {
  assertDirectoryHandle(rootHandle);
  const entries = [];
  for (const rootName of DATA_ROOTS) {
    const directory = await optionalDirectory(rootHandle, rootName);
    if (directory) await collectTextEntries(directory, rootName, entries);
  }
  return createMemoryDataStore(entries, { name: rootHandle.name || "Liqwid data folder" });
}

export async function commitDataStoreToDirectory(store, rootHandle, options = {}) {
  if (!store || typeof store.exportEntries !== "function") throw new TypeError("A staged Liqwid data store is required.");
  assertDirectoryHandle(rootHandle);
  for (const path of REQUIRED_DIRECTORIES) await ensureDirectoryPath(rootHandle, path);
  const rollbackStore = options.rollbackStore ?? null;
  const previousPaths = new Set(rollbackStore?.listPaths?.() || []);
  const nextEntries = store.exportEntries().filter((entry) => isPersistedTextPath(entry.path));
  const nextPaths = new Set(nextEntries.map((entry) => entry.path));
  const existingHandles = new Map();
  for (const rootName of DATA_ROOTS) {
    const directory = await optionalDirectory(rootHandle, rootName);
    if (directory) await collectManagedFileHandles(directory, rootName, existingHandles);
  }
  const stalePaths = [...existingHandles.keys()].filter((path) => !nextPaths.has(path)).sort();
  const changes = [];
  try {
    for (const entry of nextEntries) {
      const previousText = previousPaths.has(entry.path)
        ? await rollbackStore.readText(entry.path, "")
        : await directoryFileText(existingHandles.get(entry.path));
      if (previousText !== null && previousText === entry.text) continue;
      changes.push({ path: entry.path, existed: previousText !== null, previousText });
      await writeDirectoryText(rootHandle, entry.path, entry.text);
    }
    for (const path of stalePaths) {
      const previousText = previousPaths.has(path)
        ? await rollbackStore.readText(path, "")
        : await directoryFileText(existingHandles.get(path));
      changes.push({ path, existed: previousText !== null, previousText });
      await removeDirectoryFile(rootHandle, path);
    }
  } catch (error) {
    let rollbackError = null;
    for (const change of changes.reverse()) {
      try {
        if (change.existed) {
          await writeDirectoryText(rootHandle, change.path, change.previousText);
        } else {
          await removeDirectoryFile(rootHandle, change.path);
        }
      } catch (failure) {
        rollbackError ??= failure;
      }
    }
    if (rollbackError) throw new Error(`${error.message} Folder rollback also failed: ${rollbackError.message}`);
    throw error;
  }
  return rootHandle;
}

async function writeDirectoryText(rootHandle, path, text) {
  const segments = safeSegments(path);
  const fileName = segments.pop();
  let directory = rootHandle;
  for (const segment of segments) directory = await directory.getDirectoryHandle(segment, { create: true });
  const fileHandle = await directory.getFileHandle(fileName, { create: true });
  const writable = await fileHandle.createWritable();
  try {
    await writable.write(text);
    await writable.close();
  } catch (error) {
    if (typeof writable.abort === "function") {
      try { await writable.abort(); } catch { /* Preserve the original failure. */ }
    }
    throw error;
  }
}

async function removeDirectoryFile(rootHandle, path) {
  const segments = safeSegments(path);
  const fileName = segments.pop();
  let directory = rootHandle;
  for (const segment of segments) directory = await directory.getDirectoryHandle(segment);
  if (typeof directory.removeEntry === "function") {
    try { await directory.removeEntry(fileName); } catch (error) { if (error?.name !== "NotFoundError") throw error; }
  } else {
    await writeDirectoryText(rootHandle, path, "");
  }
}

async function collectTextEntries(directory, prefix, entries) {
  for await (const [name, handle] of directory.entries()) {
    const path = `${prefix}/${name}`;
    if (handle.kind === "directory") {
      await collectTextEntries(handle, path, entries);
    } else if (handle.kind === "file" && isPersistedTextPath(path)) {
      const file = await handle.getFile();
      entries.push({ path, text: await file.text() });
    }
  }
}

async function collectManagedFileHandles(directory, prefix, handles) {
  for await (const [name, handle] of directory.entries()) {
    const path = `${prefix}/${name}`;
    if (handle.kind === "directory") {
      await collectManagedFileHandles(handle, path, handles);
    } else if (handle.kind === "file" && /\.(?:csv|json)$/i.test(path)) {
      handles.set(path, handle);
    }
  }
}

async function directoryFileText(handle) {
  if (!handle) return null;
  const file = await handle.getFile();
  return file.text();
}

function isPersistedTextPath(path) {
  return CSV_FILE_PATTERN.test(path) || RAW_JSON_FILE_PATTERN.test(path);
}

async function optionalDirectory(rootHandle, name) {
  try {
    return await rootHandle.getDirectoryHandle(name);
  } catch (error) {
    if (error?.name === "NotFoundError") return null;
    throw error;
  }
}

async function ensureDirectoryPath(rootHandle, path) {
  let directory = rootHandle;
  for (const segment of safeSegments(path)) directory = await directory.getDirectoryHandle(segment, { create: true });
  return directory;
}

function safeSegments(value) {
  const path = String(value ?? "");
  const segments = path.split("/");
  if (!path || path.startsWith("/") || path.includes("\\") || path.includes(":")
    || segments.some((segment) => !segment || segment === "." || segment === "..")) {
    throw new Error(`Unsafe data-folder path: ${JSON.stringify(path)}`);
  }
  return segments;
}

function assertDirectoryHandle(handle) {
  if (handle?.kind !== "directory" || typeof handle.getDirectoryHandle !== "function") {
    throw new TypeError("A writable directory handle is required.");
  }
}
