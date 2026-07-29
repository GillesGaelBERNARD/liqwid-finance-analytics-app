import fs from "node:fs/promises";
import path from "node:path";
import { refreshCompleteDataset } from "../src/browser/completeDataWorkflow.js";
import { createMemoryDataStore } from "../src/browser/memoryDataStore.js";

const GENERATED_ROOTS = ["clean", "computed", "metadata"];
const PRESERVED_ROOTS = ["raw"];
const DEFAULT_START_DATE = "2020-01-01";

async function refreshOfficialData(options = {}) {
  const dataRoot = validatedDataRoot(options.dataRoot ?? path.resolve("data/liqwid"));
  const runStartedAt = new Date();
  const runId = runStartedAt.toISOString().replace(/[-:.]/g, "");
  const endDate = options.endDate ?? localDateKey(runStartedAt);
  const initialEntries = await readDataEntries(dataRoot, [...PRESERVED_ROOTS, ...GENERATED_ROOTS]);
  const previousGeneratedPaths = new Set(
    initialEntries
      .map((entry) => entry.path)
      .filter((entryPath) => isUnderAnyRoot(entryPath, GENERATED_ROOTS))
  );
  const stagedEntries = options.resume
    ? initialEntries
    : initialEntries.filter((entry) => !isUnderAnyRoot(entry.path, GENERATED_ROOTS));
  const store = createMemoryDataStore(stagedEntries, { name: path.basename(dataRoot) });
  const progress = createProgressReporter();

  console.log(`Staging a ${options.resume ? "resume" : "full"} official Liqwid refresh in ${dataRoot}`);
  console.log(`Date range: ${DEFAULT_START_DATE} through ${endDate}`);
  console.log(`Existing data entries staged: ${stagedEntries.length}`);

  const result = await refreshCompleteDataset({
    store,
    mode: options.resume ? "update" : "initial",
    startDate: DEFAULT_START_DATE,
    endDate,
    runId,
    requestDelayMs: options.requestDelayMs ?? 1_250,
    apiOptions: {
      retries: 8,
      retryDelayMs: 2_000
    },
    onProgress: progress
  });

  const exportedEntries = store.exportEntries();
  const generatedEntries = exportedEntries.filter(
    (entry) => isUnderAnyRoot(entry.path, GENERATED_ROOTS)
  );
  const rawEntries = exportedEntries.filter((entry) => entry.path.startsWith("raw/"));
  const existingRawPaths = new Set(stagedEntries.map((entry) => entry.path));
  const newRawEntries = rawEntries.filter((entry) => !existingRawPaths.has(entry.path));

  await writeEntriesAtomically(dataRoot, [...generatedEntries, ...newRawEntries], runId);

  const nextGeneratedPaths = new Set(generatedEntries.map((entry) => entry.path));
  const staleGeneratedPaths = [...previousGeneratedPaths].filter(
    (entryPath) => !nextGeneratedPaths.has(entryPath)
  );
  await removeStaleGeneratedFiles(dataRoot, staleGeneratedPaths);

  console.log(`Committed ${generatedEntries.length} generated files and ${newRawEntries.length} new raw captures.`);
  if (staleGeneratedPaths.length) {
    console.log(`Removed ${staleGeneratedPaths.length} stale generated files.`);
  }
  console.log(`Markets refreshed: ${result.bundle.markets.length}`);
  console.log(`Latest market-history day: ${result.bundle.protocolSeries.at(-1)?.date ?? "none"}`);
  console.log(`Raw capture: ${result.bundle.rawCapture}`);
}

async function readDataEntries(dataRoot, roots) {
  const entries = [];
  for (const rootName of roots) {
    const absoluteRoot = path.join(dataRoot, rootName);
    const files = await walkFiles(absoluteRoot);
    for (const filePath of files) {
      const relativePath = toPortablePath(path.relative(dataRoot, filePath));
      entries.push({ path: relativePath, text: await fs.readFile(filePath, "utf8") });
    }
  }
  return entries.sort((left, right) => left.path.localeCompare(right.path));
}

async function walkFiles(root) {
  let directoryEntries;
  try {
    directoryEntries = await fs.readdir(root, { withFileTypes: true });
  } catch (error) {
    if (error?.code === "ENOENT") return [];
    throw error;
  }
  const files = [];
  for (const entry of directoryEntries) {
    const absolutePath = path.join(root, entry.name);
    if (entry.isDirectory()) files.push(...await walkFiles(absolutePath));
    else if (entry.isFile()) files.push(absolutePath);
  }
  return files;
}

async function writeEntriesAtomically(dataRoot, entries, runId) {
  for (const entry of entries) {
    const target = safeDataPath(dataRoot, entry.path);
    await fs.mkdir(path.dirname(target), { recursive: true });
    const temporary = `${target}.tmp-${runId}`;
    try {
      await fs.writeFile(temporary, entry.text, "utf8");
      await fs.rename(temporary, target);
    } finally {
      await fs.rm(temporary, { force: true }).catch(() => {});
    }
  }
}

async function removeStaleGeneratedFiles(dataRoot, relativePaths) {
  for (const relativePath of relativePaths) {
    if (!isUnderAnyRoot(relativePath, GENERATED_ROOTS)) {
      throw new Error(`Refusing to remove a non-generated path: ${relativePath}`);
    }
    await fs.rm(safeDataPath(dataRoot, relativePath), { force: true });
  }
}

function validatedDataRoot(value) {
  const resolved = path.resolve(value);
  const normalized = resolved.replaceAll("\\", "/").toLowerCase();
  if (!normalized.endsWith("/data/liqwid")) {
    throw new Error(`Data root must end with data/liqwid: ${resolved}`);
  }
  return resolved;
}

function safeDataPath(dataRoot, relativePath) {
  if (!relativePath || path.isAbsolute(relativePath)) {
    throw new Error(`Expected a safe relative data path: ${relativePath}`);
  }
  const target = path.resolve(dataRoot, relativePath);
  const expectedPrefix = `${path.resolve(dataRoot)}${path.sep}`.toLowerCase();
  if (!target.toLowerCase().startsWith(expectedPrefix)) {
    throw new Error(`Data path escapes the intended root: ${relativePath}`);
  }
  return target;
}

function isUnderAnyRoot(relativePath, roots) {
  return roots.some((root) => relativePath === root || relativePath.startsWith(`${root}/`));
}

function toPortablePath(value) {
  return value.replaceAll("\\", "/");
}

function localDateKey(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function createProgressReporter() {
  let lastMessage = "";
  let lastPrintedAt = 0;
  return (event) => {
    const now = Date.now();
    const details = [
      event.market?.id,
      Number.isFinite(event.index) && Number.isFinite(event.total)
        ? `${event.index}/${event.total}`
        : null,
      event.date,
      event.latestDate
    ].filter(Boolean).join(" ");
    const message = `${event.phase}${details ? ` ${details}` : ""}`;
    if (message !== lastMessage && (now - lastPrintedAt >= 4_000 || event.phase === "complete")) {
      console.log(message);
      lastMessage = message;
      lastPrintedAt = now;
    }
  };
}

function parseArguments(argv) {
  const options = {
    dataRoot: argv[0] && !argv[0].startsWith("--") ? argv[0] : path.resolve("data/liqwid")
  };
  for (let index = options.dataRoot === argv[0] ? 1 : 0; index < argv.length; index += 1) {
    if (argv[index] === "--end-date") options.endDate = argv[++index];
    else if (argv[index] === "--request-delay-ms") options.requestDelayMs = Number(argv[++index]);
    else if (argv[index] === "--resume") options.resume = true;
    else throw new Error(`Unknown argument: ${argv[index]}`);
  }
  if (options.endDate && !/^\d{4}-\d{2}-\d{2}$/.test(options.endDate)) {
    throw new Error(`--end-date must use YYYY-MM-DD: ${options.endDate}`);
  }
  if (options.requestDelayMs !== undefined && (!Number.isFinite(options.requestDelayMs) || options.requestDelayMs < 0)) {
    throw new Error(`--request-delay-ms must be a non-negative number.`);
  }
  return options;
}

refreshOfficialData(parseArguments(process.argv.slice(2))).catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
