import assert from "node:assert/strict";
import test from "node:test";

import {
  buildAnalysisBundle,
  buildAnalysisBundleFromStore,
  buildPublicMarketsRequest,
  csvToRows,
  refreshDataset,
  rowsToCsv,
  shouldLoadSavedBundle
} from "../src/browser/dataWorkflow.js";
import {
  createPortableDataStore,
  loadPortableDataArchive,
  savePortableDataArchive
} from "../src/browser/portableArchive.js";

class MemoryStore {
  constructor(entries = {}) {
    this.files = new Map(Object.entries(entries));
    this.writes = [];
  }

  async ensureLayout() {}

  async readJson(path, fallback = null) {
    return this.files.has(path) ? structuredClone(this.files.get(path)) : fallback;
  }

  async readText(path, fallback = null) {
    return this.files.has(path) ? String(this.files.get(path)) : fallback;
  }

  async writeJson(path, value, options = {}) {
    if (options.overwrite === false && this.files.has(path)) throw new Error(`Refusing to overwrite ${path}`);
    this.files.set(path, structuredClone(value));
    this.writes.push({ path, type: "json", value: structuredClone(value) });
  }

  async writeText(path, value, options = {}) {
    if (options.overwrite === false && this.files.has(path)) throw new Error(`Refusing to overwrite ${path}`);
    this.files.set(path, String(value));
    this.writes.push({ path, type: "text", value: String(value) });
  }

  async deletePath(path) {
    this.files.delete(path);
  }

  listPaths() {
    return [...this.files.keys()].sort();
  }
}

function market(id) {
  return { id, displayName: id, symbol: id, supply: 100, borrow: 20, liquidity: 80 };
}

test("browser refresh captures immutable raw responses before writing canonical clean data", async () => {
  const store = new MemoryStore();
  const calls = [];
  const api = {
    async fetchPublicMarkets() {
      return {
        totals: { supplyInUsd: 100, borrowInUsd: 20, liquidityInUsd: 80 },
        markets: [market("DJED")],
        rawPages: [{
          page: 0,
          request: buildPublicMarketsRequest(0, 100),
          payload: { liqwid: { data: { markets: { results: [market("DJED")] } } } }
        }]
      };
    },
    async fetchMarketHistory(input) {
      calls.push(["history", input]);
      return [{ timestamp: "2026-01-03T00:00:00.000Z", supplyInUsd: "100", borrowInUsd: "20", liquidityInUsd: "80", utilizationPercentage: "20" }];
    },
    async fetchMarketParamsHistory(input) {
      calls.push(["params", input]);
      return [{ timestamp: "2026-01-03T00:00:00.000Z", kink: 0.8 }];
    }
  };

  const bundle = await refreshDataset({
    store,
    api,
    startDate: "2020-01-01",
    endDate: "2026-01-04",
    runId: "20260104T120000000Z",
    now: () => new Date("2026-01-04T12:00:00.000Z")
  });

  const rawPath = "raw/api/fetches/20260104T120000000Z/market-history/djed.json";
  const paramsPath = "raw/api/fetches/20260104T120000000Z/market-params-history/djed.json";
  const cleanPath = "clean/market-history/djed.csv";
  assert.ok(store.files.has("raw/api/fetches/20260104T120000000Z/markets/page-0000.json"));
  assert.ok(store.files.has(rawPath));
  assert.ok(store.files.has(paramsPath));
  assert.ok(store.files.has(cleanPath));
  assert.ok(store.files.has("clean/market-params-history/djed.csv"));
  assert.ok(store.files.has("metadata/market-params-cursors.csv"));
  assert.equal([...store.files.keys()].some((path) => path.startsWith("computed/")), false);
  assert.equal([...store.files.keys()].some((path) => /^raw\/api\/(?!fetches\/)/.test(path)), false);
  assert.equal([...store.files.keys()].some((path) => /^(clean|computed)\/.*\.json$/i.test(path)), false);
  assert.ok(store.writes.findIndex((write) => write.path === rawPath) < store.writes.findIndex((write) => write.path === cleanPath));
  assert.equal(store.files.get(rawPath).source, "https://v2.api.liqwid.finance/graphql");
  assert.equal(store.files.get(rawPath).variables.startDate, "2020-01-01T00:00:00Z");
  assert.equal(store.files.get(rawPath).variables.endDate, "2026-01-04T23:59:59Z");
  assert.equal(store.files.get(rawPath).rowCount, 1);
  assert.equal(store.files.get(rawPath).payload.rows[0].supplyInUsd, "100");
  assert.equal(bundle.marketSeries.DJED[0].utilizationPercentage, 0.2);
  assert.equal(bundle.statuses[0].firstActiveDate, "2026-01-03");
  const reopenedBundle = await buildAnalysisBundleFromStore(store, { dataRootLabel: "reopened.zip" });
  assert.equal(reopenedBundle.protocolSeries.at(-1).date, "2026-01-03");
  assert.equal(reopenedBundle.dataRoot, "reopened.zip");
  assert.deepEqual(calls[0][1], { marketId: "DJED", startDay: "2020-01-01", endDay: "2026-01-04", interval: "DAY" });
});

test("a complete refresh survives portable save and rebuilds analysis from canonical CSV tables", async () => {
  const store = createPortableDataStore([], { name: "chosen-by-user.zip" });
  const api = {
    async fetchPublicMarkets() {
      const currentMarket = market("DJED");
      return {
        totals: { supplyInUsd: 100, borrowInUsd: 20, liquidityInUsd: 80 },
        markets: [currentMarket],
        rawPages: [{
          page: 0,
          request: buildPublicMarketsRequest(0, 100),
          payload: { liqwid: { data: { markets: { results: [currentMarket] } } } }
        }]
      };
    },
    async fetchMarketHistory() {
      return [{
        timestamp: "2026-07-13T00:00:00.000Z",
        supplyInUsd: "100",
        borrowInUsd: "20",
        liquidityInUsd: "80",
        utilizationPercentage: "20"
      }];
    },
    async fetchMarketParamsHistory() { return []; }
  };

  await refreshDataset({
    store,
    api,
    startDate: "2020-01-01",
    endDate: "2026-07-13",
    runId: "portable-round-trip",
    now: () => new Date("2026-07-13T12:00:00.000Z")
  });

  let downloadedBytes;
  await savePortableDataArchive(store, {
    suggestedName: "chosen-by-user.zip",
    pickSaveHandle: async () => null,
    download: async (bytes) => { downloadedBytes = bytes; }
  });
  const reopened = await loadPortableDataArchive(downloadedBytes);
  const rebuilt = await buildAnalysisBundleFromStore(reopened, { dataRootLabel: "chosen-by-user.zip" });

  assert.equal(rebuilt.protocolSeries.at(-1).date, "2026-07-13");
  assert.equal(rebuilt.marketSeries.DJED.at(-1).borrowInUsd, 20);
  assert.equal(
    (await reopened.readJson("raw/api/fetches/portable-round-trip/market-history/djed.json")).source,
    "https://v2.api.liqwid.finance/graphql"
  );
  assert.equal(await reopened.readText("clean/market-history/djed.csv").then((csv) => csv.includes("2026-07-13")), true);
  assert.equal(reopened.listPaths().some((path) => path.startsWith("computed/")), false);
  assert.equal(reopened.listPaths().some((path) => /^(clean|computed)\/.*\.json$/i.test(path)), false);
});

test("incremental refresh starts after the latest clean date and skips current markets", async () => {
  const existingA = [{ marketId: "A", marketDisplayName: "A", timestamp: "2026-01-02T00:00:00.000Z", date: "2026-01-02", supplyInUsd: 10, borrowInUsd: 2, liquidityInUsd: 8 }];
  const existingB = [{ marketId: "B", marketDisplayName: "B", timestamp: "2026-01-04T00:00:00.000Z", date: "2026-01-04", supplyInUsd: 20, borrowInUsd: 4, liquidityInUsd: 16 }];
  const store = new MemoryStore({
    "clean/market-history/a.csv": rowsToCsv(existingA),
    "clean/market-history/b.csv": rowsToCsv(existingB)
  });
  const historyCalls = [];
  const api = {
    async fetchPublicMarkets() {
      return { totals: { supplyInUsd: 30, borrowInUsd: 6, liquidityInUsd: 24 }, markets: [market("A"), market("B")] };
    },
    async fetchMarketHistory(input) {
      historyCalls.push(input);
      return [{ timestamp: "2026-01-03T00:00:00.000Z", supplyInUsd: 11, borrowInUsd: 3, liquidityInUsd: 8 }];
    },
    async fetchMarketParamsHistory() { return []; }
  };

  const bundle = await refreshDataset({ store, api, mode: "update", endDate: "2026-01-04", runId: "incremental" });

  assert.equal(historyCalls.length, 1);
  assert.equal(historyCalls[0].marketId, "A");
  assert.equal(historyCalls[0].startDay, "2026-01-03");
  assert.deepEqual(csvToRows(store.files.get("clean/market-history/a.csv")).map((row) => row.date), ["2026-01-02", "2026-01-03"]);
  assert.equal(bundle.statuses.find((row) => row.marketId === "B").skipped, true);
  assert.equal(bundle.statuses.find((row) => row.marketId === "B").latestSavedDate, "2026-01-04");
});

test("parameter history uses an independent requested-through cursor", async () => {
  const currentRows = [{ marketId: "A", marketDisplayName: "A", timestamp: "2026-01-04T00:00:00.000Z", date: "2026-01-04", supplyInUsd: 10, borrowInUsd: 2, liquidityInUsd: 8 }];
  const store = new MemoryStore({
    "clean/market-history/a.csv": rowsToCsv(currentRows),
    "metadata/market-params-cursors.csv": rowsToCsv([{
      marketId: "A",
      requestedThrough: "2026-01-02",
      dateRangeContract: "utc-inclusive-day-v1"
    }])
  });
  const historyCalls = [];
  const paramsCalls = [];
  const api = {
    async fetchPublicMarkets() { return { totals: {}, markets: [market("A")] }; },
    async fetchMarketHistory(input) { historyCalls.push(input); return []; },
    async fetchMarketParamsHistory(input) { paramsCalls.push(input); return []; }
  };

  const first = await refreshDataset({ store, api, endDate: "2026-01-04", runId: "params-one" });

  assert.equal(historyCalls.length, 0);
  assert.deepEqual(paramsCalls[0], { marketId: "A", startDay: "2026-01-03", endDay: "2026-01-04" });
  assert.deepEqual(csvToRows(store.files.get("metadata/market-params-cursors.csv")), [{
    marketId: "A",
    requestedThrough: "2026-01-04",
    dateRangeContract: "utc-inclusive-day-v1"
  }]);
  assert.equal(first.statuses[0].paramsSkipped, false);

  await refreshDataset({ store, api, endDate: "2026-01-04", runId: "params-two" });
  assert.equal(paramsCalls.length, 1);
});

test("a second refresh for the same store is rejected while the first is active", async () => {
  const store = new MemoryStore();
  let release;
  const waiting = new Promise((resolve) => { release = resolve; });
  const api = {
    async fetchPublicMarkets() { await waiting; return { totals: {}, markets: [] }; },
    async fetchMarketHistory() { return []; },
    async fetchMarketParamsHistory() { return []; }
  };

  const first = refreshDataset({ store, api, runId: "one" });
  await assert.rejects(() => refreshDataset({ store, api, runId: "two" }), /already in progress/);
  release();
  await first;
});

test("failed market retrieval preserves an error capture and the last computed snapshot", async () => {
  const lastGood = "date,borrowInUsd\n2026-01-03,20\n";
  const store = new MemoryStore({ "computed/protocol-series.csv": lastGood });
  const api = {
    async fetchPublicMarkets() { return { totals: {}, markets: [market("FAIL")] }; },
    async fetchMarketHistory() { throw new Error("upstream timeout"); },
    async fetchMarketParamsHistory() { return []; }
  };

  await assert.rejects(
    () => refreshDataset({ store, api, runId: "failed-run", now: () => new Date("2026-01-04T12:00:00.000Z") }),
    /upstream timeout/
  );

  const capture = store.files.get("raw/api/fetches/failed-run/market-history/fail.json");
  assert.equal(capture.error.message, "upstream timeout");
  assert.equal(capture.rowCount, 0);
  assert.equal(store.files.get("computed/protocol-series.csv"), lastGood);
  assert.equal(store.files.has("clean/market-history/fail.csv"), false);
});

test("CSV round trips numeric and quoted tabular values", () => {
  const rows = [{
    date: "2026-01-03",
    amount: 12.5,
    label: "a, b",
    active: true,
    asset: { id: "asset-1", displayName: "DJED" },
    tags: ["stablecoin", "Cardano"]
  }];
  assert.deepEqual(csvToRows(rowsToCsv(rows)), rows);
});

test("CSV keeps columns first encountered in later rows", () => {
  const csv = rowsToCsv([{ marketId: "A" }, { marketId: "B", borrowInUsd: 20 }]);
  assert.deepEqual(csvToRows(csv), [
    { marketId: "A", borrowInUsd: "" },
    { marketId: "B", borrowInUsd: 20 }
  ]);
});

test("POL remains in protocol totals but is excluded from detailed summaries", () => {
  const rows = (id, supply, borrow) => [{
    marketId: id,
    marketDisplayName: id,
    timestamp: "2026-01-01T00:00:00.000Z",
    date: "2026-01-01",
    supplyInUsd: supply,
    borrowInUsd: borrow,
    liquidityInUsd: supply - borrow,
    utilizationPercentage: borrow / supply,
    debtRepaidInUsd: 0,
    interestAccruedInUsd: 0,
    interestRepaidInUsd: 0
  }];
  const bundle = buildAnalysisBundle({
    markets: [market("ADA"), market("POL")],
    marketSeriesById: { ADA: rows("ADA", 100, 20), POL: rows("POL", 50, 10) },
    dataRoot: "liqwid",
    startDate: "2020-01-01",
    endDate: "2026-01-01",
    apiTotals: { supplyInUsd: 150, borrowInUsd: 30, liquidityInUsd: 120 }
  });

  assert.equal(bundle.protocolSeries[0].supplyInUsd, 150);
  assert.deepEqual(bundle.summaries.map((summary) => summary.marketId), ["ADA"]);
  assert.ok(bundle.marketSeries.POL);
});

test("saved data is loaded only when it is at least as recent as the displayed snapshot", () => {
  const bundle = (date) => ({ protocolSeries: [{ date }] });
  assert.equal(shouldLoadSavedBundle(bundle("2026-01-04"), bundle("2026-01-05")), true);
  assert.equal(shouldLoadSavedBundle(bundle("2026-01-04"), bundle("2026-01-04")), true);
  assert.equal(shouldLoadSavedBundle(bundle("2026-01-04"), bundle("2026-01-03")), false);
  assert.equal(shouldLoadSavedBundle(bundle("2026-01-04"), null), false);
});
