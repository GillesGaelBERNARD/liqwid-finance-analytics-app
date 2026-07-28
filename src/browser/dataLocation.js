import {
  commitDataStoreToDirectory,
  openDirectoryDataStore,
  pickDataDirectory
} from "./directoryStore.js";
import { createMemoryDataStore } from "./memoryDataStore.js";
import {
  loadPortableDataArchive,
  pickPortableDataOpenHandle,
  pickPortableDataSaveHandle,
  savePortableDataArchive
} from "./portableArchive.js";
import {
  readRecentDataLocation,
  rememberRecentDataLocation
} from "./recentDataLocation.js";

const DATA_LOCATION_ARCHIVE_NAME = "liqwid-data.zip";

export async function chooseNewDataLocation(options = {}) {
  const host = options.host ?? globalThis;
  const suggestedName = options.suggestedName ?? DATA_LOCATION_ARCHIVE_NAME;
  if (typeof host?.showDirectoryPicker === "function") {
    try {
      const handle = await (options.pickDirectory ?? pickDataDirectory)({ host });
      const store = await (options.openDirectory ?? openDirectoryDataStore)(handle);
      return { kind: "directory", handle, name: handle.name || "Liqwid data folder", store };
    } catch (error) {
      if (error?.name === "AbortError" || !isPickerCompatibilityError(error)) throw error;
    }
  }

  let handle = null;
  try {
    handle = await (options.pickArchiveSaveHandle ?? pickPortableDataSaveHandle)({ host, suggestedName });
  } catch (error) {
    if (error?.name === "AbortError" || !isPickerCompatibilityError(error)) throw error;
  }
  const name = handle?.name || suggestedName;
  return {
    kind: handle ? "archive" : "download",
    handle,
    name,
    store: createMemoryDataStore([], { name })
  };
}

export async function openDataArchive(source, options = {}) {
  const store = await (options.loadArchive ?? loadPortableDataArchive)(source);
  const name = source?.name || store.name || DATA_LOCATION_ARCHIVE_NAME;
  store.name = name;
  const handle = source?.kind === "file" ? source : null;
  return { kind: "archive", handle, name, store };
}

export async function chooseExistingDataLocation(options = {}) {
  const host = options.host ?? globalThis;
  let handle = null;
  try {
    handle = await (options.pickArchiveOpenHandle ?? pickPortableDataOpenHandle)({ host });
  } catch (error) {
    if (error?.name === "AbortError" || !isPickerCompatibilityError(error)) throw error;
  }
  if (!handle) return null;
  return openDataArchive(handle, { loadArchive: options.loadArchive });
}

export async function rememberDataLocation(location, options = {}) {
  return (options.rememberRecentLocation ?? rememberRecentDataLocation)(location, options);
}

export async function restoreRememberedDataLocation(options = {}) {
  const recent = await (options.readRememberedLocation ?? readRecentDataLocation)(options);
  if (!recent?.handle) return { status: "none", location: null };

  const permission = await readPermission(recent.handle, "read", Boolean(options.requestPermission));
  if (permission !== "granted") {
    return {
      status: "permission-required",
      location: null,
      recent,
      kind: recent.kind,
      name: recent.name || recent.handle.name || "Liqwid data"
    };
  }

  const location = recent.kind === "directory"
    ? {
        kind: "directory",
        handle: recent.handle,
        name: recent.name || recent.handle.name || "Liqwid data folder",
        store: await (options.openDirectory ?? openDirectoryDataStore)(recent.handle)
      }
    : await openDataArchive(recent.handle, { loadArchive: options.loadArchive });
  return { status: "opened", location, recent };
}

export async function prepareDataLocationForUpdate(location, options = {}) {
  if (!location) return location;
  if (location.kind === "directory" || location.handle) {
    const permission = await readPermission(location.handle, "readwrite", true);
    if (permission !== "granted") {
      throw Object.assign(new Error(`Write access to ${location.name || "the Liqwid data location"} was not granted.`), {
        name: "NotAllowedError"
      });
    }
    return location;
  }
  const host = options.host ?? globalThis;
  const suggestedName = location.name || DATA_LOCATION_ARCHIVE_NAME;
  let handle = null;
  try {
    handle = await (options.pickArchiveSaveHandle ?? pickPortableDataSaveHandle)({ host, suggestedName });
  } catch (error) {
    if (error?.name === "AbortError" || !isPickerCompatibilityError(error)) throw error;
  }
  return handle
    ? { ...location, kind: "archive", handle, name: handle.name || suggestedName }
    : { ...location, kind: "download", handle: null, name: suggestedName };
}

export async function commitDataLocation(store, location, options = {}) {
  if (!location) throw new Error("Choose a Liqwid data location before saving.");
  if (location.kind === "directory") {
    await (options.commitDirectory ?? commitDataStoreToDirectory)(store, location.handle, {
      rollbackStore: options.rollbackStore
    });
    return location;
  }

  const saveArchive = options.saveArchive ?? savePortableDataArchive;
  const result = await saveArchive(store, {
    fileHandle: location.handle ?? null,
    host: options.host,
    suggestedName: location.name || DATA_LOCATION_ARCHIVE_NAME
  });
  return {
    ...location,
    kind: result.fileHandle ? "archive" : "download",
    handle: result.fileHandle ?? null,
    name: result.fileHandle?.name || result.suggestedName || location.name || DATA_LOCATION_ARCHIVE_NAME
  };
}

function isPickerCompatibilityError(error) {
  return ["SecurityError", "NotSupportedError", "InvalidStateError", "TypeError"].includes(error?.name);
}

async function readPermission(handle, mode, requestPermission) {
  if (!handle || typeof handle.queryPermission !== "function") return "granted";
  let permission = await handle.queryPermission({ mode });
  if (permission !== "granted" && requestPermission && typeof handle.requestPermission === "function") {
    permission = await handle.requestPermission({ mode });
  }
  return permission;
}
