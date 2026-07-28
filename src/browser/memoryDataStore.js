const DEFAULT_MEMORY_STORE_NAME = "Liqwid data folder staging";

export function createMemoryDataStore(initialEntries = [], options = {}) {
  const entries = new Map();
  for (const entry of initialEntries) entries.set(memoryRelativePath(entry.path), String(entry.text));

  const store = {
    name: options.name ?? DEFAULT_MEMORY_STORE_NAME,
    async ensureLayout() {
      return store;
    },
    async readText(path, fallback = null) {
      const key = memoryRelativePath(path);
      return entries.has(key) ? entries.get(key) : fallback;
    },
    async readJson(path, fallback = null) {
      const text = await store.readText(path, null);
      return text === null ? fallback : JSON.parse(text);
    },
    async writeText(path, value, writeOptions = {}) {
      const key = memoryRelativePath(path);
      if (writeOptions.overwrite === false && entries.has(key)) {
        throw new Error(`Refusing to overwrite immutable staged data entry: ${key}`);
      }
      entries.set(key, String(value));
    },
    async writeJson(path, value, writeOptions = {}) {
      await store.writeText(path, `${JSON.stringify(value)}\n`, writeOptions);
    },
    async deletePath(path) {
      entries.delete(memoryRelativePath(path));
    },
    listPaths() {
      return [...entries.keys()].sort();
    },
    exportEntries() {
      return store.listPaths().map((path) => ({ path, text: entries.get(path) }));
    },
    clone() {
      return createMemoryDataStore(store.exportEntries(), { name: store.name });
    }
  };

  return store;
}

function memoryRelativePath(value) {
  const path = typeof value === "string" ? value : "";
  const segments = path.split("/");
  const unsafe = !path || path.startsWith("/") || path.startsWith("\\") || path.includes("\\")
    || path.includes(":") || /[\u0000-\u001f\u007f]/.test(path)
    || segments.some((segment) => !segment || segment === "." || segment === "..");
  if (unsafe) throw new Error(`Data paths must be safe relative paths: ${JSON.stringify(path)}`);
  return path;
}
