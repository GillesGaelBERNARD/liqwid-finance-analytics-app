import { addDays, todayDateKey, toDateKey, toUtcApiRange, UTC_INCLUSIVE_DAY_CONTRACT } from "../shared/dates.js";
import { aggregateProtocolSeries, firstActiveDate, normalizeMarketHistoryRows, summarizeMarket, withDerivedMarketMetrics } from "../shared/metrics.js";
import { appendLqStatsHistory, buildLqStatsSnapshot } from "./lqStatsHistory.js";

export const LIQWID_GRAPHQL_ENDPOINT = "https://v2.api.liqwid.finance/graphql";
export const DEFAULT_HISTORY_START_DATE = "2020-01-01";

export const PUBLIC_MARKETS_QUERY = `
query PublicMarkets($page: Int!, $perPage: Int!) {
  liqwid {
    data {
      supply(input: { currency: USD })
      borrow(input: { currency: USD })
      liquidity(input: { currency: USD })
      interpolatedDeposits(input: { currency: USD })
      markets(input: { page: $page, perPage: $perPage }) {
        page
        perPage
        pagesCount
        totalCount
        results {
          id
          displayName
          symbol
          supply(input: { currency: USD })
          borrow(input: { currency: USD })
          liquidity(input: { currency: USD })
          supplyAPY
          borrowAPY
          borrowAPR
          utilization
          loanOriginationFeePercentage
          frozen
          private
          delisting
          prime
          updatedAt
          parameters {
            borrowCap
            supplyCap
            minValue
            minHealthFactor
            actionCount
            maxCollateralCount
            maxBatchTime
            minBatchSize
            minBatchTime
            closeFactor0
            incomeParameters {
              reserve
              supplier
              staker
              treasury
            }
            interestModelParameters {
              baseRate
              kinkRate
              utilMultiplier
              utilMultiplierJump
            }
            collateralParameters {
              collateral {
                id
                displayName
                symbol
              }
              maxLoanToValue
              weightedMaxLoanToValue
              liquidationThreshold
              weightedLiquidationThreshold
              liquidationPenalty
              liquidationProfitability
              collateralWeight
            }
          }
          asset {
            id
            name
            symbol
            displayName
            decimals
            currencySymbol
            logo
            price
            priceUpdatedAt
          }
        }
      }
    }
  }
}
`;

export const MARKET_HISTORY_QUERY = `
query MarketHistory(
  $marketId: String!,
  $startDate: String,
  $endDate: String,
  $interval: MarketHistoryInterval
) {
  analytics {
    marketHistory(
      marketId: $marketId,
      startDate: $startDate,
      endDate: $endDate,
      interval: $interval
    ) {
      timestamp
      supply
      supplyInUsd
      borrow
      borrowInUsd
      liquidity
      liquidityInUsd
      debtRepaid
      debtRepaidInUsd
      interestAccrued
      interestAccruedInUsd
      interestRepaid
      interestRepaidInUsd
      borrowApr
      supplyApy
      utilizationPercentage
      loanOriginationFees
      loanOriginationFeesInUsd
      loanOriginationFeesMinAda
      loanOriginationFeesMinAdaInUsd
    }
  }
}
`;

export const MARKET_PARAMS_HISTORY_QUERY = `
query MarketParamsHistory($marketId: String!, $startDate: String, $endDate: String) {
  analytics {
    marketParamsHistory(marketId: $marketId, startDate: $startDate, endDate: $endDate) {
      timestamp
      txHash
      baseRate
      utilMultiplier
      utilMultiplierJump
      kink
      supplyCap
      borrowCap
      incomeRatioSum
      incomeRatioSuppliers
      incomeRatioDividends
      incomeRatioTreasury
      baseBorrowerAPR
      baseSupplierAPY
      optimalBorrowerAPR
      optimalSupplierAPY
      maxBorrowerAPR
      maxSupplierAPY
    }
  }
}
`;

export const LQ_STATS_QUERY = `
query LQStats {
  lq {
    price(input: { currency: USD })
    staked
    totalSupply
    circulatingSupply
    treasury
    currencySymbol
  }
}
`;

export function buildPublicMarketsRequest(page = 0, perPage = 100) {
  return { query: PUBLIC_MARKETS_QUERY, variables: { page, perPage } };
}

export function buildLqStatsRequest() {
  return { query: LQ_STATS_QUERY, variables: {} };
}

export function buildMarketHistoryRequest({ marketId, startDay, endDay, interval = "DAY" }) {
  return {
    query: MARKET_HISTORY_QUERY,
    variables: { marketId, ...toUtcApiRange({ startDay, endDay }), interval }
  };
}

export function buildMarketParamsHistoryRequest({ marketId, startDay, endDay }) {
  return {
    query: MARKET_PARAMS_HISTORY_QUERY,
    variables: { marketId, ...toUtcApiRange({ startDay, endDay }) }
  };
}


export async function postGraphql(request, options = {}) {
  if (options.endpoint && options.endpoint !== LIQWID_GRAPHQL_ENDPOINT) {
    throw new Error(`Only the official Liqwid endpoint is permitted: ${LIQWID_GRAPHQL_ENDPOINT}`);
  }
  const fetchImpl = options.fetchImpl ?? globalThis.fetch;
  const retries = options.retries ?? 4;
  const retryDelayMs = options.retryDelayMs ?? 500;
  const operation = String(request?.query || "").match(/\b(?:query|mutation)\s+([A-Za-z_][A-Za-z0-9_]*)/)?.[1] || "GraphQL request";
  if (typeof fetchImpl !== "function") throw new Error("This browser does not provide fetch().");

  let lastError = null;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      const response = await fetchImpl(LIQWID_GRAPHQL_ENDPOINT, {
        method: "POST",
        headers: {
          accept: "application/json",
          "content-type": "application/json",
          "x-app-source": "codex-liqwid-market-dynamics"
        },
        body: JSON.stringify(request)
      });
      if (!response.ok) {
        const body = await response.text().catch(() => "");
        throw new Error(`Liqwid API HTTP ${response.status}: ${body.slice(0, 500)}`);
      }
      const payload = await response.json();
      if (payload.errors?.length) {
        throw new Error(`Liqwid GraphQL error: ${payload.errors.map((error) => error.message).join("; ")}`);
      }
      if (!payload.data) throw new Error("Liqwid API response did not contain a data object.");
      return payload.data;
    } catch (error) {
      lastError = error;
      if (attempt < retries && retryDelayMs > 0) await wait(retryDelayMs * (2 ** attempt));
    }
  }
  throw new Error(`${operation} failed after ${retries + 1} attempts: ${lastError?.message || String(lastError)}`, { cause: lastError });
}

export async function fetchPublicMarkets(options = {}) {
  const markets = [];
  const rawPages = [];
  let totals = null;
  let page = 0;
  let pagesCount = 1;
  while (page < pagesCount) {
    const request = buildPublicMarketsRequest(page, options.perPage ?? 100);
    const data = await postGraphql(request, options);
    const rawPage = { page, request, payload: data };
    rawPages.push(rawPage);
    await options.onPage?.(rawPage);
    if (!totals) {
      totals = {
        supplyInUsd: data.liqwid.data.supply,
        borrowInUsd: data.liqwid.data.borrow,
        liquidityInUsd: data.liqwid.data.liquidity,
        interpolatedDepositsInUsd: data.liqwid.data.interpolatedDeposits
      };
    }
    const pagination = data.liqwid.data.markets;
    markets.push(...pagination.results);
    pagesCount = pagination.pagesCount;
    page += 1;
  }
  return { totals, markets: markets.sort((a, b) => a.id.localeCompare(b.id)), rawPages };
}

export async function fetchMarketHistory(input, options = {}) {
  const data = await postGraphql(buildMarketHistoryRequest(input), options);
  return data.analytics.marketHistory;
}

export async function fetchMarketParamsHistory(input, options = {}) {
  const data = await postGraphql(buildMarketParamsHistoryRequest(input), options);
  return data.analytics.marketParamsHistory;
}

export async function fetchLqStats(options = {}) {
  const data = await postGraphql(buildLqStatsRequest(), options);
  return data.lq;
}

const defaultApi = Object.freeze({ fetchPublicMarkets, fetchMarketHistory, fetchMarketParamsHistory, fetchLqStats });
const activeRefreshStores = new WeakSet();

export async function refreshDataset(options = {}) {
  const store = options.store;
  if (!store || typeof store.readJson !== "function" || typeof store.writeJson !== "function" || typeof store.readText !== "function" || typeof store.writeText !== "function") {
    throw new Error("refreshDataset requires a data store.");
  }
  if (activeRefreshStores.has(store)) throw new Error("A refresh is already in progress for this data folder.");
  activeRefreshStores.add(store);
  try {
    return await runRefresh({
      ...options,
      store,
      api: options.api ?? defaultApi
    });
  } finally {
    activeRefreshStores.delete(store);
  }
}

async function runRefresh({
  store,
  api,
  apiOptions = {},
  mode = "update",
  startDay: explicitStartDay,
  endDay: explicitEndDay,
  startDate = DEFAULT_HISTORY_START_DATE,
  endDate = todayDateKey(),
  fetchParamsHistory = true,
  onProgress = () => {},
  now = () => new Date(),
  runId = null,
  dataRootLabel = null
}) {
  const startDay = explicitStartDay ?? startDate;
  const endDay = explicitEndDay ?? endDate;
  await store.ensureLayout?.();
  const fetchedAt = now().toISOString();
  const captureId = validateRunId(runId ?? fetchedAt.replace(/[-:.]/g, ""));
  const captureRoot = `raw/api/fetches/${captureId}`;
  const capturedMarketPages = new Set();
  const captureMarketPage = async (page) => {
    const resultCount = page.payload?.liqwid?.data?.markets?.results?.length ?? 0;
    await store.writeJson(
      `${captureRoot}/markets/page-${String(page.page).padStart(4, "0")}.json`,
      captureEnvelope({ fetchedAt, request: page.request, rowCount: resultCount, payload: page.payload }),
      { overwrite: false }
    );
    capturedMarketPages.add(page.page);
  };
  onProgress({ phase: "markets" });
  const currentData = await api.fetchPublicMarkets({ ...apiOptions, onPage: captureMarketPage });
  const markets = currentData.markets ?? [];
  const rawMarketPages = currentData.rawPages ?? [];
  for (const page of rawMarketPages) {
    if (!capturedMarketPages.has(page.page)) await captureMarketPage(page);
  }
  const marketsRequest = {
    query: PUBLIC_MARKETS_QUERY,
    variables: {
      pages: rawMarketPages.length
        ? rawMarketPages.map((page) => page.request.variables)
        : [buildPublicMarketsRequest(0, apiOptions.perPage ?? 100).variables]
    }
  };
  const marketsCapture = captureEnvelope({
    fetchedAt,
    request: marketsRequest,
    rowCount: markets.length,
    payload: { totals: currentData.totals, markets }
  });
  if (!capturedMarketPages.size) {
    await store.writeJson(`${captureRoot}/markets-current.json`, marketsCapture, { overwrite: false });
  }
  await store.writeText("metadata/settings.csv", rowsToCsv([{
    schemaVersion: 4,
    endpoint: LIQWID_GRAPHQL_ENDPOINT,
    historyStartDate: startDay,
    historyEndDate: endDay,
    generatedAt: fetchedAt,
    latestRawCapture: captureRoot,
    dataFolderName: store.name ?? dataRootLabel ?? "Liqwid data folder"
  }]));
  await store.writeText("clean/markets.csv", rowsToCsv(markets));
  await store.writeText("clean/protocol-totals.csv", rowsToCsv([currentData.totals ?? {}]));

  const marketSeriesById = {};
  const statuses = [];
  const parameterCursorRows = csvToRows(await store.readText("metadata/market-params-cursors.csv", ""));
  const parameterCursors = new Map(parameterCursorRows.map((row) => [String(row.marketId), row]));
  for (let index = 0; index < markets.length; index += 1) {
    const market = markets[index];
    const id = safeMarketFileId(market.id);
    const cleanCsvPath = `clean/market-history/${id}.csv`;
    const cleanParamsPath = `clean/market-params-history/${id}.csv`;
    const existingRows = mode === "initial" ? [] : csvToRows(await store.readText(cleanCsvPath, ""));
    const latestExistingDate = existingRows.at(-1)?.date ?? null;
    const marketStartDay = latestExistingDate ? addDays(latestExistingDate, 1) : startDay;
    const skipped = Boolean(latestExistingDate && marketStartDay > endDay);
    const existingParamRows = mode === "initial"
      ? []
      : csvToRows(await store.readText(cleanParamsPath, ""));
    const mergedExistingParamRows = existingParamRows;
    const paramsCursor = parameterCursors.get(String(market.id)) || null;
    const paramsRequestedThrough = paramsCursor?.requestedThrough ?? null;
    const paramsStartDay = paramsRequestedThrough
      ? (paramsCursor?.dateRangeContract === UTC_INCLUSIVE_DAY_CONTRACT ? addDays(paramsRequestedThrough, 1) : paramsRequestedThrough)
      : startDay;
    const paramsSkipped = !fetchParamsHistory || Boolean(paramsRequestedThrough && paramsStartDay > endDay);
    let fetchedRows = [];
    let fetchedParamRows = [];
    let paramsFetchedRows = 0;

    onProgress({ phase: "market", market, index, total: markets.length, skipped, startDate: marketStartDay, endDate: endDay, paramsSkipped, paramsStartDate: paramsStartDay });
    if (!skipped) {
      const historyInput = { marketId: market.id, startDay: marketStartDay, endDay, interval: "DAY" };
      const historyRequest = buildMarketHistoryRequest(historyInput);
      const historyCapturePath = `${captureRoot}/market-history/${id}.json`;
      try {
        fetchedRows = await api.fetchMarketHistory(historyInput, apiOptions);
      } catch (error) {
        await store.writeJson(historyCapturePath, captureErrorEnvelope({ fetchedAt, marketId: market.id, request: historyRequest, error }), { overwrite: false });
        throw error;
      }
      const historyCapture = captureEnvelope({
        fetchedAt,
        marketId: market.id,
        request: historyRequest,
        rowCount: fetchedRows.length,
        payload: { rows: fetchedRows }
      });
      await store.writeJson(historyCapturePath, historyCapture, { overwrite: false });
    }

    if (!paramsSkipped) {
      const paramsInput = { marketId: market.id, startDay: paramsStartDay, endDay };
      const paramsRequest = buildMarketParamsHistoryRequest(paramsInput);
      const paramsCapturePath = `${captureRoot}/market-params-history/${id}.json`;
      try {
        fetchedParamRows = await api.fetchMarketParamsHistory(paramsInput, apiOptions);
      } catch (error) {
        await store.writeJson(paramsCapturePath, captureErrorEnvelope({ fetchedAt, marketId: market.id, request: paramsRequest, error }), { overwrite: false });
        throw error;
      }
      paramsFetchedRows = fetchedParamRows.length;
      const paramsCapture = captureEnvelope({
        fetchedAt,
        marketId: market.id,
        request: paramsRequest,
        rowCount: fetchedParamRows.length,
        payload: { rows: fetchedParamRows }
      });
      await store.writeJson(paramsCapturePath, paramsCapture, { overwrite: false });
      parameterCursors.set(String(market.id), {
        marketId: market.id,
        requestedThrough: endDay,
        dateRangeContract: UTC_INCLUSIVE_DAY_CONTRACT
      });
    }

    const normalizedFetchedRows = normalizeMarketHistoryRows(fetchedRows, market);
    const mergedRows = mergeRowsByDate(existingRows, normalizedFetchedRows);
    const normalizedRows = normalizeMarketHistoryRows(mergedRows, market);
    const mergedParamRows = mergeRows(mergedExistingParamRows, fetchedParamRows, "timestamp");
    await store.writeText(cleanCsvPath, rowsToCsv(normalizedRows));
    await store.writeText(cleanParamsPath, rowsToCsv(mergedParamRows));
    marketSeriesById[market.id] = normalizedRows;
    statuses.push({
      marketId: market.id,
      displayName: market.displayName,
      mode,
      skipped,
      requestedStartDate: marketStartDay,
      requestedEndDate: endDay,
      fetchedRows: fetchedRows.length,
      paramsFetchedRows,
      paramsSkipped,
      requestedParamsStartDate: paramsStartDay,
      savedRows: normalizedRows.length,
      firstActiveDate: firstActiveDate(normalizedRows),
      latestSavedDate: normalizedRows.at(-1)?.date ?? null,
      rawCapture: skipped ? null : `${captureRoot}/market-history/${id}.json`,
      paramsRawCapture: paramsSkipped ? null : `${captureRoot}/market-params-history/${id}.json`
    });
  }
  await store.writeText(
    "metadata/market-params-cursors.csv",
    rowsToCsv([...parameterCursors.values()].sort((left, right) => String(left.marketId).localeCompare(String(right.marketId))))
  );

  let lqStats = null;
  let lqStatsHistory = [];
  if (typeof api.fetchLqStats === "function") {
    try {
      const lqData = await api.fetchLqStats(apiOptions);
      if (lqData) {
        lqStats = lqData;
        const snap = buildLqStatsSnapshot({ timestamp: fetchedAt, ...lqData });
        const lqStatsCapture = captureEnvelope({ fetchedAt, request: buildLqStatsRequest(), rowCount: 1, payload: lqData });
        await store.writeJson(`${captureRoot}/lq-stats.json`, lqStatsCapture, { overwrite: false }).catch(() => {});
        await store.writeJson("raw/api/lq-stats.json", lqStatsCapture, { overwrite: true }).catch(() => {});

        const existingHistoryEnv = await store.readJson("raw/api/lq-stats-history.json", null).catch(() => null);
        const existingSeries = existingHistoryEnv?.payload?.series ?? existingHistoryEnv?.series ?? (Array.isArray(existingHistoryEnv) ? existingHistoryEnv : []);
        lqStatsHistory = appendLqStatsHistory(existingSeries, snap);
        await store.writeJson("raw/api/lq-stats-history.json", captureEnvelope({ fetchedAt, request: buildLqStatsRequest(), rowCount: lqStatsHistory.length, payload: { series: lqStatsHistory } }), { overwrite: true }).catch(() => {});
      }
    } catch (err) {
      // Non-fatal if lqStats fetch fails
    }
  }

  const bundle = buildAnalysisBundle({
    markets,
    marketSeriesById,
    statuses,
    dataRoot: dataRootLabel ?? store.name ?? "Liqwid data folder",
    startDate: startDay,
    endDate: endDay,
    apiTotals: currentData.totals,
    lqStats,
    lqStatsHistory
  });
  bundle.rawCapture = captureRoot;
  bundle.archiveMetadata = {
    schemaVersion: 4,
    endpoint: LIQWID_GRAPHQL_ENDPOINT,
    latestRawCapture: captureRoot
  };
  onProgress({ phase: "complete", total: markets.length, latestDate: bundle.protocolSeries.at(-1)?.date ?? null });
  return bundle;
}

export async function buildAnalysisBundleFromStore(store, options = {}) {
  if (!store || typeof store.readText !== "function") throw new Error("A readable Liqwid data folder is required.");
  const markets = csvToRows(await store.readText("clean/markets.csv", ""));
  if (!markets.length) throw new Error("This folder does not contain clean/markets.csv data.");
  const apiTotals = csvToRows(await store.readText("clean/protocol-totals.csv", ""))[0] ?? null;
  const settings = csvToRows(await store.readText("metadata/settings.csv", ""))[0] ?? {};
  const marketSeriesById = {};
  for (const market of markets) {
    const path = `clean/market-history/${safeMarketFileId(market.id)}.csv`;
    marketSeriesById[market.id] = csvToRows(await store.readText(path, ""));
  }

  const lqStatsPayload = typeof store.readJson === "function" ? await store.readJson("raw/api/lq-stats.json", null).catch(() => null) : null;
  const lqStatsHistoryPayload = typeof store.readJson === "function" ? await store.readJson("raw/api/lq-stats-history.json", null).catch(() => null) : null;
  const lqStats = lqStatsPayload?.payload ?? lqStatsPayload ?? null;
  const lqStatsHistory = lqStatsHistoryPayload?.payload?.series ?? lqStatsHistoryPayload?.series ?? (Array.isArray(lqStatsHistoryPayload) ? lqStatsHistoryPayload : []);

  const bundle = buildAnalysisBundle({
    markets,
    marketSeriesById,
    statuses: [],
    dataRoot: options.dataRootLabel ?? store.name ?? "Liqwid data folder",
    startDate: settings.historyStartDate ?? DEFAULT_HISTORY_START_DATE,
    endDate: settings.historyEndDate ?? todayDateKey(),
    apiTotals,
    lqStats,
    lqStatsHistory
  });
  const generatedAt = settings.generatedAt;
  const rawCapture = settings.latestRawCapture;
  bundle.source = settings.endpoint || null;
  bundle.archiveMetadata = {
    schemaVersion: settings.schemaVersion ?? null,
    endpoint: settings.endpoint || null,
    latestRawCapture: rawCapture || null
  };
  if (generatedAt) bundle.generatedAt = generatedAt;
  if (rawCapture) bundle.rawCapture = rawCapture;
  return bundle;
}

export function buildAnalysisBundle({ markets, marketSeriesById, statuses = [], dataRoot, startDate, endDate, apiTotals = null, lqStats = null, lqStatsHistory = [] }) {
  const marketSeries = Object.fromEntries(
    Object.entries(marketSeriesById).map(([marketId, rows]) => [marketId, withDerivedMarketMetrics(rows)])
  );
  const marketById = Object.fromEntries(markets.map((market) => [market.id, market]));
  const summaries = markets
    .filter((market) => String(market.id).toUpperCase() !== "POL")
    .map((market) => summarizeMarket(market, marketSeriesById[market.id] ?? []));
  const protocolSeries = aggregateProtocolSeries(marketSeries);
  const summedCurrentTotals = markets.reduce(
    (totals, market) => ({
      supplyInUsd: totals.supplyInUsd + Number(market.supply ?? 0),
      borrowInUsd: totals.borrowInUsd + Number(market.borrow ?? 0),
      liquidityInUsd: totals.liquidityInUsd + Number(market.liquidity ?? 0)
    }),
    { supplyInUsd: 0, borrowInUsd: 0, liquidityInUsd: 0 }
  );
  const totals = apiTotals ?? summedCurrentTotals;
  return {
    generatedAt: new Date().toISOString(),
    source: LIQWID_GRAPHQL_ENDPOINT,
    dataRoot,
    requestedRange: { startDate, endDate },
    currentTotals: {
      ...totals,
      utilization: Number(totals.supplyInUsd ?? 0) > 0 ? Number(totals.borrowInUsd ?? 0) / Number(totals.supplyInUsd) : 0
    },
    summedCurrentTotals,
    markets,
    marketById,
    statuses,
    summaries,
    protocolSeries,
    marketSeries,
    lqStats,
    lqStatsHistory
  };
}

export function mergeRowsByDate(existingRows, newRows) {
  const byDate = new Map();
  for (const row of [...existingRows, ...newRows]) {
    const date = toDateKey(row.date ?? row.timestamp);
    if (date) byDate.set(date, { ...row, date });
  }
  return [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
}

export function rowsToCsv(rows) {
  if (!rows.length) return "";
  const columns = [...new Set(rows.flatMap((row) => Object.keys(row)))];
  const lines = [
    columns.join(","),
    ...rows.map((row) => columns.map((column) => escapeCsvCell(row[column])).join(","))
  ];
  return `${lines.join("\n")}\n`;
}

export function csvToRows(value) {
  const source = String(value ?? "");
  if (!source.trim()) return [];
  const records = [];
  let record = [];
  let field = "";
  let quoted = false;
  for (let index = 0; index < source.length; index += 1) {
    const character = source[index];
    if (quoted) {
      if (character === '"' && source[index + 1] === '"') {
        field += '"';
        index += 1;
      } else if (character === '"') {
        quoted = false;
      } else {
        field += character;
      }
    } else if (character === '"') {
      quoted = true;
    } else if (character === ",") {
      record.push(field);
      field = "";
    } else if (character === "\n") {
      record.push(field.endsWith("\r") ? field.slice(0, -1) : field);
      records.push(record);
      record = [];
      field = "";
    } else {
      field += character;
    }
  }
  if (quoted) throw new Error("Invalid CSV: unterminated quoted field.");
  if (field || record.length) {
    record.push(field.endsWith("\r") ? field.slice(0, -1) : field);
    records.push(record);
  }
  const columns = records.shift() ?? [];
  return records
    .filter((row) => row.some((cell) => cell !== ""))
    .map((row) => Object.fromEntries(columns.map((column, index) => [column, parseCsvValue(row[index] ?? "")])));
}

export function safeMarketFileId(marketId) {
  return String(marketId).replace(/[^a-z0-9_-]+/gi, "_").toLowerCase();
}

export function latestBundleDate(bundle) {
  return bundle?.protocolSeries?.at(-1)?.date ?? null;
}

export function shouldLoadSavedBundle(currentBundle, savedBundle) {
  if (!savedBundle) return false;
  const savedDate = latestBundleDate(savedBundle);
  const currentDate = latestBundleDate(currentBundle);
  if (!savedDate) return false;
  return !currentDate || savedDate >= currentDate;
}

function captureEnvelope({ fetchedAt, marketId = null, request, rowCount, payload }) {
  return {
    fetchedAt,
    source: LIQWID_GRAPHQL_ENDPOINT,
    ...(marketId ? { marketId } : {}),
    query: request.query.trim(),
    variables: request.variables,
    rowCount,
    payload
  };
}

function captureErrorEnvelope({ fetchedAt, marketId, request, error }) {
  return {
    fetchedAt,
    source: LIQWID_GRAPHQL_ENDPOINT,
    marketId,
    query: request.query.trim(),
    variables: request.variables,
    rowCount: 0,
    payload: null,
    error: { name: error?.name ?? "Error", message: error?.message ?? String(error) }
  };
}

function mergeRows(existingRows, newRows, key) {
  const values = new Map();
  for (const row of [...existingRows, ...newRows]) {
    const value = row[key] ?? row.txHash ?? JSON.stringify(row);
    values.set(String(value), row);
  }
  return [...values.values()].sort((a, b) => String(a[key] ?? "").localeCompare(String(b[key] ?? "")));
}

function escapeCsvCell(value) {
  if (value === null || value === undefined) return "";
  const text = typeof value === "object" ? JSON.stringify(value) : String(value);
  return /[",\n\r]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function parseCsvValue(value) {
  if (value === "true") return true;
  if (value === "false") return false;
  if (/^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:e[+-]?\d+)?$/i.test(value)) return Number(value);
  if ((value.startsWith("{") && value.endsWith("}")) || (value.startsWith("[") && value.endsWith("]"))) {
    try {
      return JSON.parse(value);
    } catch {
      return value;
    }
  }
  return value;
}

function validateRunId(value) {
  const text = String(value);
  if (!/^[a-z0-9_-]+$/i.test(text)) throw new Error("Invalid raw-capture run id.");
  return text;
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
