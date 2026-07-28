const RECENT_LOCATION_DATABASE = "liqwid-analysis-viewer";
const RECENT_LOCATION_DATABASE_VERSION = 1;
const RECENT_LOCATION_STORE = "data-locations";
const RECENT_LOCATION_KEY = "most-recent";

export async function rememberRecentDataLocation(location, options = {}) {
  const storage = recentLocationStorage(options);
  if (!storage) return false;
  if (!isReopenableLocation(location)) {
    try { await storage.clear(); } catch { /* Remembering a location is best effort. */ }
    return false;
  }
  const record = {
    kind: location.kind,
    name: String(location.name || location.handle.name || "Liqwid data"),
    handle: location.handle
  };
  try {
    await storage.write(record);
    return true;
  } catch {
    return false;
  }
}

export async function readRecentDataLocation(options = {}) {
  const storage = recentLocationStorage(options);
  if (!storage) return null;
  try {
    const record = await storage.read();
    if (isReopenableLocation(record)) {
      return { kind: record.kind, name: String(record.name || record.handle.name || "Liqwid data"), handle: record.handle };
    }
    if (record != null) await storage.clear();
    return null;
  } catch {
    return null;
  }
}

export async function clearRecentDataLocation(options = {}) {
  const storage = recentLocationStorage(options);
  if (!storage) return false;
  try {
    await storage.clear();
    return true;
  } catch {
    return false;
  }
}

function isReopenableLocation(location) {
  if (!location?.handle) return false;
  return location.kind === "archive"
    ? location.handle.kind === "file"
    : location.kind === "directory" && location.handle.kind === "directory";
}

function recentLocationStorage(options) {
  if (options.storage) return options.storage;
  const indexedDb = options.indexedDB ?? options.host?.indexedDB ?? globalThis.indexedDB;
  if (!indexedDb || typeof indexedDb.open !== "function") return null;
  return {
    read: () => indexedDbOperation(indexedDb, "readonly", store => store.get(RECENT_LOCATION_KEY)),
    write: value => indexedDbOperation(indexedDb, "readwrite", store => store.put(value, RECENT_LOCATION_KEY)),
    clear: () => indexedDbOperation(indexedDb, "readwrite", store => store.delete(RECENT_LOCATION_KEY))
  };
}

async function indexedDbOperation(indexedDb, mode, operation) {
  const database = await openRecentLocationDatabase(indexedDb);
  try {
    return await new Promise((resolve, reject) => {
      let request;
      let result;
      const transaction = database.transaction(RECENT_LOCATION_STORE, mode);
      transaction.oncomplete = () => resolve(result);
      transaction.onerror = () => reject(transaction.error || new Error("Could not access the recent Liqwid data location."));
      transaction.onabort = () => reject(transaction.error || new Error("Recent Liqwid data location access was aborted."));
      try {
        request = operation(transaction.objectStore(RECENT_LOCATION_STORE));
        request.onsuccess = () => { result = request.result; };
        request.onerror = () => reject(request.error || new Error("Could not access the recent Liqwid data location."));
      } catch (error) {
        reject(error);
      }
    });
  } finally {
    database.close?.();
  }
}

function openRecentLocationDatabase(indexedDb) {
  return new Promise((resolve, reject) => {
    let request;
    try {
      request = indexedDb.open(RECENT_LOCATION_DATABASE, RECENT_LOCATION_DATABASE_VERSION);
    } catch (error) {
      reject(error);
      return;
    }
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(RECENT_LOCATION_STORE)) database.createObjectStore(RECENT_LOCATION_STORE);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("Could not open recent Liqwid data location storage."));
    request.onblocked = () => reject(new Error("Recent Liqwid data location storage is blocked by another tab."));
  });
}
