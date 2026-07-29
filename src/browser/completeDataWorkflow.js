import {
  fetchLqStats,
  fetchMarketHistory,
  fetchMarketParamsHistory,
  fetchPublicMarkets,
  postGraphql,
  refreshDataset,
  csvToRows,
  rowsToCsv,
  safeMarketFileId
} from "./dataWorkflow.js";
import { aggregateDailyProtocolFeeAllocations, buildArchiveAudit, buildCompleteAnalysis, deriveLoanPopulations } from "./fullAnalysis.js";
import { appendLoanSnapshotHistory, buildLoanSnapshotHistory } from "./loanSnapshotHistory.js";
import { addDays, toUtcApiRange } from "../shared/dates.js";

const PROTOCOL_FEES_COVERAGE_START = "2026-01-01";
const PROTOCOL_FEES_DAILY_PROVENANCE = "analytics-fees-daily-v1";
const PROTOCOL_FEES_DAILY_BATCH_SIZE = 4;

const PROTOCOL_FEES_SELECTION = `
  fromDate
  toDate
  totalFeesInUsd: dailyFees
  userFeesInUsd: dailyUserFees
  supplySideRevenueInUsd: dailySupplySideRevenue
  totalRevenueInUsd: dailyRevenue
  protocolRevenueInUsd: dailyProtocolRevenue
  holdersRevenueInUsd: dailyHoldersRevenue
  feeBreakdown: breakdown {
    borrowInterestAccrued
    borrowInterestAccruedForSupplySide
    borrowInterestAccruedForHolders
    borrowInterestAccruedForProtocol
    loanOriginationFees
    loanOriginationFeesForProtocol
    loanOriginationFeesForHolders
  }
`;

const PROTOCOL_FEES_NATIVE_SELECTION = `
  fromDate
  toDate
  dailyFees
  dailyUserFees
  dailySupplySideRevenue
  dailyRevenue
  dailyProtocolRevenue
  dailyHoldersRevenue
  breakdown {
    borrowInterestAccrued
    borrowInterestAccruedForSupplySide
    borrowInterestAccruedForHolders
    borrowInterestAccruedForProtocol
    loanOriginationFees
    loanOriginationFeesForProtocol
    loanOriginationFeesForHolders
  }
`;

export const PROTOCOL_OVERVIEW_QUERY = `
query ProtocolOverview($startDate: String!, $endDate: String!) {
  analytics {
    overview(startDate: $startDate, endDate: $endDate) {
      current {
        fromDate
        toDate
        liquidationProfitInUsd
        debtRepaidInUsd
        interestAccruedInUsd
        interestRepaidInUsd
        revenueFromRepaidInterestInUsd
        loanOriginationFeesInUsd
        loanOriginationFeesMinAdaInUsd
      }
    }
  }
}
`;

export const PROTOCOL_FEES_QUERY = `
query ProtocolFees($startDate: String!, $endDate: String!) {
  analytics {
    fees(startDate: $startDate, endDate: $endDate) {
      ${PROTOCOL_FEES_SELECTION}
    }
  }
}
`;

export const LOANS_QUERY = `
query LoanSnapshot($input: LoansInput) {
  liqwid {
    data {
      loans(input: $input) {
        totalCount
        page
        perPage
        pagesCount
        results {
          id
          marketId
          publicKey
          amount(input: { currency: USD })
          adjustedAmount(input: { currency: USD })
          collateral(input: { currency: USD })
          healthFactor
          LTV
          APY
          collaterals {
            id
            qTokenName
            qTokenAmount
            amountInUsd: amount(input: { currency: USD })
            market {
              id
              displayName
            }
          }
        }
      }
    }
  }
}
`;

export function buildProtocolOverviewRequest({ startDay, endDay }) {
  return { query: PROTOCOL_OVERVIEW_QUERY, variables: toUtcApiRange({ startDay, endDay }) };
}

export function buildProtocolFeesRequest({ startDay, endDay }) {
  return { query: PROTOCOL_FEES_QUERY, variables: toUtcApiRange({ startDay, endDay }) };
}

export function buildProtocolFeesBatchRequest(dateKeys) {
  if (dateKeys.length > PROTOCOL_FEES_DAILY_BATCH_SIZE) {
    throw new RangeError(`Daily protocol fee batches are limited to ${PROTOCOL_FEES_DAILY_BATCH_SIZE} dates.`);
  }
  const fields = dateKeys.map((date, index) => {
    const { startDate, endDate } = toUtcApiRange({ startDay: date, endDay: date });
    return `d${index}: fees(startDate: "${startDate}", endDate: "${endDate}") { ${PROTOCOL_FEES_NATIVE_SELECTION} }`;
  });
  return { query: `query DailyProtocolFeesBatch { analytics { ${fields.join(" ")} } }`, variables: {} };
}

export function buildProtocolOverviewBatchRequest(dateKeys) {
  const fields = dateKeys.map((date, index) => {
    const { startDate, endDate } = toUtcApiRange({ startDay: date, endDay: date });
    return `d${index}: overview(startDate: "${startDate}", endDate: "${endDate}") { current { fromDate toDate liquidationProfitInUsd debtRepaidInUsd interestAccruedInUsd interestRepaidInUsd revenueFromRepaidInterestInUsd loanOriginationFeesInUsd loanOriginationFeesMinAdaInUsd } }`;
  });
  return { query: `query DailyProtocolOverviewBatch { analytics { ${fields.join(" ")} } }`, variables: {} };
}

const completeDefaultApi = Object.freeze({
  fetchPublicMarkets,
  fetchMarketHistory,
  fetchMarketParamsHistory,
  fetchLqStats,
  fetchProtocolOverview,
  fetchProtocolOverviewBatch,
  fetchProtocolFees,
  fetchProtocolFeesBatch,
  fetchLoans
});

export async function fetchProtocolOverview(input, options = {}) {
  const data = await postGraphql(buildProtocolOverviewRequest(input), options);
  return data.analytics.overview.current;
}

export async function fetchProtocolOverviewBatch(dateKeys, options = {}) {
  if (!dateKeys.length) return [];
  const data = await postGraphql(buildProtocolOverviewBatchRequest(dateKeys), options);
  return dateKeys.map((date, index) => ({ date, ...data.analytics[`d${index}`].current }));
}

export async function fetchProtocolFees(input, options = {}) {
  const data = await postGraphql(buildProtocolFeesRequest(input), options);
  return data.analytics.fees;
}

export async function fetchProtocolFeesBatch(dateKeys, options = {}) {
  if (!dateKeys.length) return [];
  const data = await postGraphql(buildProtocolFeesBatchRequest(dateKeys), options);
  return dateKeys.map((date, index) => normalizeNativeProtocolFees(date, data.analytics[`d${index}`]));
}

function normalizeNativeProtocolFees(date, row) {
  return {
    date,
    fromDate: row.fromDate,
    toDate: row.toDate,
    totalFeesInUsd: row.dailyFees,
    userFeesInUsd: row.dailyUserFees,
    supplySideRevenueInUsd: row.dailySupplySideRevenue,
    totalRevenueInUsd: row.dailyRevenue,
    protocolRevenueInUsd: row.dailyProtocolRevenue,
    holdersRevenueInUsd: row.dailyHoldersRevenue,
    feeBreakdown: row.breakdown
  };
}

export async function fetchLoans(input, options = {}) {
  const perPage = input.perPage ?? 1000;
  let page = 0;
  let pagesCount = 1;
  let totalCount = 0;
  const results = [];
  while (page < pagesCount) {
    const queryInput = { page, perPage };
    if (Array.isArray(input.filters) && input.filters.length) queryInput.filters = input.filters;
    const variables = { input: queryInput };
    const data = await postGraphql({ query: LOANS_QUERY, variables }, options);
    const loans = data.liqwid.data.loans;
    totalCount = Number(loans.totalCount || 0);
    pagesCount = Number(loans.pagesCount || 1);
    results.push(...(loans.results || []));
    page += 1;
  }
  return { totalCount, page: 0, perPage, pagesCount, results };
}

export async function refreshCompleteDataset(options = {}) {
  const store = options.store;
  if (!store || typeof store.readText !== "function" || typeof store.writeText !== "function") {
    throw new Error("refreshCompleteDataset requires a staged data store.");
  }
  const api = options.api ?? completeDefaultApi;
  const apiOptions = options.apiOptions ?? {};
  const paceMs = options.requestDelayMs ?? (options.api ? 0 : 250);
  const onProgress = options.onProgress ?? (() => {});
  const bundle = await refreshDataset({ ...options, store, api, apiOptions, onProgress });
  const captureRoot = bundle.rawCapture;
  const fetchedAt = options.now?.().toISOString() ?? new Date().toISOString();
  const firstDate = bundle.protocolSeries[0]?.date ?? options.startDate;
  const endDate = bundle.protocolSeries.at(-1)?.date ?? options.endDate;

  onProgress({ phase: "liquidation-monthly" });
  const monthlyLiquidations = await refreshMonthlyOverview({ store, api, apiOptions, captureRoot, fetchedAt, firstDate, endDate, paceMs, onProgress });
  onProgress({ phase: "protocol-overview-daily" });
  const dailyOverview = await refreshDailyOverview({ store, api, apiOptions, captureRoot, fetchedAt, firstDate, endDate, paceMs, onProgress });
  onProgress({ phase: "protocol-fees-daily" });
  const dailyAllocatedFees = await refreshDailyFees({ store, api, apiOptions, captureRoot, fetchedAt, firstDate, endDate, paceMs, onProgress });
  const monthlyFees = aggregateDailyProtocolFeeAllocations(dailyAllocatedFees);
  onProgress({ phase: "loans" });
  const loanSnapshotAt = options.now?.().toISOString() ?? new Date().toISOString();
  const { allLoans, activeLoans, liquidatableLoans, collateralLoans } = await refreshLoanSnapshots({ store, api, apiOptions, captureRoot, fetchedAt: loanSnapshotAt });
  const loanSnapshotHistory = await appendCurrentLoanSnapshotHistory({
    store,
    fetchedAt: loanSnapshotAt,
    marketIds: bundle.markets.map((market) => market.id),
    allLoans,
    activeLoans,
    markets: bundle.markets
  });
  const marketParamsById = {};
  for (const market of bundle.markets) {
    marketParamsById[market.id] = csvToRows(
      await store.readText(`clean/market-params-history/${safeMarketFileId(market.id)}.csv`, "")
    );
  }

  onProgress({ phase: "analysis" });
  bundle.archiveAudit = await buildArchiveAudit(store, bundle, allLoans.length);
  const analysis = buildCompleteAnalysis({
    bundle,
    monthlyLiquidations,
    dailyLiquidations: dailyOverview,
    allLoans,
    activeLoans,
    liquidatableLoans,
    collateralLoans,
    loanSnapshotHistory,
    dailyRevenue: dailyOverview,
    dailyAllocatedFees,
    monthlyFees,
    marketParamsById
  });
  onProgress({ phase: "complete", latestDate: bundle.protocolSeries.at(-1)?.date ?? null });
  return { bundle, analysis };
}

async function refreshDailyFees({ store, api, apiOptions, captureRoot, fetchedAt, firstDate, endDate, paceMs, onProgress }) {
  const existing = csvToRows(await store.readText("clean/protocol-fees-daily.csv", ""));
  const byDate = new Map(existing.map((row) => [row.date, row]));
  const coverageStart = feeCoverageStart(firstDate);
  const dates = workflowDateRange(coverageStart, endDate);
  const fetchDates = dates.filter((date) => !validCachedDailyFeeRow(byDate.get(date), date));
  const batchSize = typeof api.fetchProtocolFeesBatch === "function" ? PROTOCOL_FEES_DAILY_BATCH_SIZE : 1;

  for (let start = 0; start < fetchDates.length; start += batchSize) {
    const batchDates = fetchDates.slice(start, start + batchSize);
    onProgress({
      phase: "protocol-fees-daily",
      index: Math.min(start + batchDates.length, fetchDates.length),
      total: fetchDates.length,
      date: batchDates[0]
    });
    let currents;
    let rawRequest;
    try {
      if (typeof api.fetchProtocolFeesBatch === "function") {
        rawRequest = buildProtocolFeesBatchRequest(batchDates);
        currents = await api.fetchProtocolFeesBatch(batchDates, apiOptions);
      } else {
        rawRequest = buildProtocolFeesRequest({ startDay: batchDates[0], endDay: batchDates[0] });
        currents = await Promise.all(batchDates.map(async (date) => ({
          date,
          ...await api.fetchProtocolFees({ startDay: date, endDay: date }, apiOptions)
        })));
      }
    } catch (error) {
      await writeRawError(
        store,
        `${captureRoot}/protocol-fees/daily/${batchDates[0]}.json`,
        fetchedAt,
        rawRequest?.query || "Daily protocol fees",
        rawRequest?.variables || { dates: batchDates },
        error
      );
      throw error;
    }
    for (const current of currents) {
      const date = String(current.date || current.fromDate).slice(0, 10);
      const row = protocolFeeRow(current, {
        date,
        startDay: date,
        endDay: date,
        isComplete: date < String(fetchedAt).slice(0, 10),
        provenance: PROTOCOL_FEES_DAILY_PROVENANCE
      });
      assertProtocolFeeAllocationReconciles(row);
      byDate.set(date, row);
    }
    const suffix = batchDates.length > 1 ? `--${batchDates.at(-1)}` : "";
    await writeRawSuccess(
      store,
      `${captureRoot}/protocol-fees/daily/${batchDates[0]}${suffix}.json`,
      fetchedAt,
      rawRequest.query,
      rawRequest.variables,
      currents,
      currents.length
    );
    if (paceMs) await workflowPause(paceMs);
  }

  const required = new Set(dates);
  const rows = [...byDate.values()].filter((row) => required.has(row.date)).sort(byDateAscending);
  await store.writeText("clean/protocol-fees-daily.csv", rowsToCsv(rows));
  return rows;
}

async function refreshMonthlyOverview({ store, api, apiOptions, captureRoot, fetchedAt, firstDate, endDate, paceMs, onProgress }) {
  const existing = csvToRows(await store.readText("clean/protocol-liquidation-monthly.csv", ""));
  const byDate = new Map(existing.map((row) => [row.date, row]));
  const periods = monthPeriods(firstDate, endDate);
  for (let index = 0; index < periods.length; index += 1) {
    const period = periods[index];
    const cached = byDate.get(period.date);
    if (cached?.isComplete && period.isComplete && periodMatches(cached, period)) continue;
    onProgress({ phase: "liquidation-monthly", index, total: periods.length, date: period.date });
    const input = { startDay: period.startDay, endDay: period.endDay };
    const request = buildProtocolOverviewRequest(input);
    let current;
    try {
      current = await api.fetchProtocolOverview(input, apiOptions);
    } catch (error) {
      await writeRawError(store, `${captureRoot}/protocol-overview/monthly/${period.date}.json`, fetchedAt, request.query, request.variables, error);
      throw error;
    }
    const row = {
      date: period.date,
      periodStartDay: period.startDay,
      periodEndDay: period.endDay,
      fromDate: current.fromDate || request.variables.startDate,
      toDate: current.toDate || request.variables.endDate,
      liquidationProfitInUsd: numeric(current.liquidationProfitInUsd),
      debtRepaidInUsd: numeric(current.debtRepaidInUsd),
      interestAccruedInUsd: numeric(current.interestAccruedInUsd),
      interestRepaidInUsd: numeric(current.interestRepaidInUsd),
      isComplete: period.isComplete
    };
    byDate.set(row.date, row);
    await writeRawSuccess(store, `${captureRoot}/protocol-overview/monthly/${period.date}.json`, fetchedAt, request.query, request.variables, current, 1);
    if (paceMs) await workflowPause(paceMs);
  }
  const rows = [...byDate.values()].filter((row) => periods.some((period) => period.date === row.date)).sort(byDateAscending);
  await store.writeText("clean/protocol-liquidation-monthly.csv", rowsToCsv(rows));
  return rows;
}

async function refreshDailyOverview({ store, api, apiOptions, captureRoot, fetchedAt, firstDate, endDate, paceMs, onProgress }) {
  const existing = csvToRows(await store.readText("clean/protocol-overview-daily.csv", ""));
  const byDate = new Map(existing.map((row) => [row.date, row]));
  const dates = workflowDateRange(firstDate, endDate);
  const fetchDates = dates.filter((date) => !(byDate.get(date)?.isComplete && hasCurrentDailyOverviewBoundary(byDate.get(date), date)));

  const batchSize = typeof api.fetchProtocolOverviewBatch === "function" ? 5 : 1;
  for (let start = 0; start < fetchDates.length; start += batchSize) {
    const batchDates = fetchDates.slice(start, start + batchSize);
    onProgress({ phase: "protocol-overview-daily", index: Math.min(start + batchDates.length, fetchDates.length), total: fetchDates.length, date: batchDates[0] });
    let currents;
    let rawRequest;
    try {
      if (typeof api.fetchProtocolOverviewBatch === "function") {
        rawRequest = buildProtocolOverviewBatchRequest(batchDates);
        currents = await api.fetchProtocolOverviewBatch(batchDates, apiOptions);
      } else {
        rawRequest = buildProtocolOverviewRequest({ startDay: batchDates[0], endDay: batchDates[0] });
        currents = await Promise.all(batchDates.map(async (date) => ({ date, ...await api.fetchProtocolOverview({ startDay: date, endDay: date }, apiOptions) })));
      }
    } catch (error) {
      await writeRawError(
        store,
        `${captureRoot}/protocol-overview/daily/${batchDates[0]}.json`,
        fetchedAt,
        rawRequest?.query || "Daily protocol overview",
        rawRequest?.variables || { dates: batchDates },
        error
      );
      throw error;
    }
    for (const current of currents) {
      const date = String(current.date || current.fromDate).slice(0, 10);
      const request = buildProtocolOverviewRequest({ startDay: date, endDay: date });
      const revenueFromRepaidInterestInUsd = numeric(current.revenueFromRepaidInterestInUsd);
      const loanOriginationFeesInUsd = numeric(current.loanOriginationFeesInUsd);
      const loanOriginationFeesMinAdaInUsd = numeric(current.loanOriginationFeesMinAdaInUsd);
      const row = {
        date,
        periodStartDay: date,
        periodEndDay: date,
        fromDate: current.fromDate || request.variables.startDate,
        toDate: current.toDate || request.variables.endDate,
        liquidationProfitInUsd: numeric(current.liquidationProfitInUsd),
        debtRepaidInUsd: numeric(current.debtRepaidInUsd),
        interestAccruedInUsd: numeric(current.interestAccruedInUsd),
        interestRepaidInUsd: numeric(current.interestRepaidInUsd),
        revenueFromRepaidInterestInUsd,
        loanOriginationFeesInUsd,
        loanOriginationFeesMinAdaInUsd,
        combinedObservedFeeFlowInUsd: revenueFromRepaidInterestInUsd + loanOriginationFeesInUsd + loanOriginationFeesMinAdaInUsd,
        isComplete: date < String(fetchedAt).slice(0, 10),
        provenance: "daily-api"
      };
      byDate.set(date, row);
    }
    const suffix = batchDates.length > 1 ? `--${batchDates.at(-1)}` : "";
    await writeRawSuccess(
      store,
      `${captureRoot}/protocol-overview/daily/${batchDates[0]}${suffix}.json`,
      fetchedAt,
      rawRequest.query,
      rawRequest.variables,
      currents,
      currents.length
    );
    if (paceMs) await workflowPause(paceMs);
  }
  const required = new Set(dates);
  const rows = [...byDate.values()].filter((row) => required.has(row.date)).sort(byDateAscending);
  await store.writeText("clean/protocol-overview-daily.csv", rowsToCsv(rows));
  return rows;
}

async function refreshLoanSnapshots({ store, api, apiOptions, captureRoot, fetchedAt }) {
  const allInput = {};
  let all;
  try {
    all = await api.fetchLoans(allInput, apiOptions);
  } catch (error) {
    await writeRawError(store, `${captureRoot}/loans/error.json`, fetchedAt, LOANS_QUERY, { allInput }, error);
    throw error;
  }
  await writeRawSuccess(store, `${captureRoot}/loans/all.json`, fetchedAt, LOANS_QUERY, allInput, all, all.results?.length || 0);
  const { allLoans, activeLoans, liquidatableLoans, collateralLoans } = deriveLoanPopulations(all.results || []);
  await store.writeText("clean/current-all-loans.csv", rowsToCsv(allLoans));
  return { allLoans, activeLoans, liquidatableLoans, collateralLoans };
}

async function appendCurrentLoanSnapshotHistory({ store, fetchedAt, marketIds, allLoans, activeLoans, markets }) {
  const existing = {
    participation: csvToRows(await store.readText("computed/loan-participation-history.csv", "")),
    health: csvToRows(await store.readText("computed/loan-health-history.csv", "")),
    reconciliation: csvToRows(await store.readText("computed/loan-reconciliation-history.csv", ""))
  };
  const observation = buildLoanSnapshotHistory({ timestamp: fetchedAt, marketIds, allLoans, activeLoans, markets });
  const history = appendLoanSnapshotHistory(existing, observation);
  await store.writeText("computed/loan-participation-history.csv", rowsToCsv(history.participation));
  await store.writeText("computed/loan-health-history.csv", rowsToCsv(history.health));
  await store.writeText("computed/loan-reconciliation-history.csv", rowsToCsv(history.reconciliation || []));
  return history;
}

function monthPeriods(startValue, endValue) {
  const firstDay = String(startValue).slice(0, 10);
  const lastDay = String(endValue).slice(0, 10);
  const start = new Date(`${firstDay.slice(0, 7)}-01T00:00:00Z`);
  const endExclusive = new Date(`${addDays(lastDay, 1)}T00:00:00Z`);
  const periods = [];
  for (let current = start; current < endExclusive; current = new Date(Date.UTC(current.getUTCFullYear(), current.getUTCMonth() + 1, 1))) {
    const nextMonth = new Date(Date.UTC(current.getUTCFullYear(), current.getUTCMonth() + 1, 1));
    const date = current.toISOString().slice(0, 10);
    const startDay = date < firstDay ? firstDay : date;
    const monthEndDay = addDays(nextMonth.toISOString().slice(0, 10), -1);
    const endDay = monthEndDay < lastDay ? monthEndDay : lastDay;
    periods.push({
      date,
      startDay,
      endDay,
      isComplete: startDay === date && endDay === monthEndDay
    });
  }
  return periods;
}

function feeCoverageStart(firstDate) {
  const candidate = String(firstDate).slice(0, 10);
  return candidate < PROTOCOL_FEES_COVERAGE_START ? PROTOCOL_FEES_COVERAGE_START : candidate;
}

function protocolFeeRow(current, { date, startDay, endDay, isComplete, provenance }) {
  const breakdown = current.feeBreakdown || {};
  const expected = toUtcApiRange({ startDay, endDay });
  return {
    date,
    periodStartDay: startDay,
    periodEndDay: endDay,
    fromDate: current.fromDate || expected.startDate,
    toDate: current.toDate || expected.endDate,
    totalFeesInUsd: numeric(current.totalFeesInUsd),
    userFeesInUsd: numeric(current.userFeesInUsd),
    supplySideRevenueInUsd: numeric(current.supplySideRevenueInUsd),
    totalRevenueInUsd: numeric(current.totalRevenueInUsd),
    protocolRevenueInUsd: numeric(current.protocolRevenueInUsd),
    holdersRevenueInUsd: numeric(current.holdersRevenueInUsd),
    borrowInterestAccruedInUsd: numeric(breakdown.borrowInterestAccrued),
    borrowInterestAccruedForSupplySideInUsd: numeric(breakdown.borrowInterestAccruedForSupplySide),
    borrowInterestAccruedForHoldersInUsd: numeric(breakdown.borrowInterestAccruedForHolders),
    borrowInterestAccruedForProtocolInUsd: numeric(breakdown.borrowInterestAccruedForProtocol),
    loanOriginationFeesInUsd: numeric(breakdown.loanOriginationFees),
    loanOriginationFeesForProtocolInUsd: numeric(breakdown.loanOriginationFeesForProtocol),
    loanOriginationFeesForHoldersInUsd: numeric(breakdown.loanOriginationFeesForHolders),
    isComplete,
    provenance
  };
}

function assertProtocolFeeAllocationReconciles(row) {
  const protocolComponents = numeric(row.borrowInterestAccruedForProtocolInUsd) + numeric(row.loanOriginationFeesForProtocolInUsd);
  const holderComponents = numeric(row.borrowInterestAccruedForHoldersInUsd) + numeric(row.loanOriginationFeesForHoldersInUsd);
  if (!approximatelyEqual(row.protocolRevenueInUsd, protocolComponents)) {
    throw new Error(`Protocol fee allocation does not reconcile for ${row.date}: protocol total differs from its interest and origination components.`);
  }
  if (!approximatelyEqual(row.holdersRevenueInUsd, holderComponents)) {
    throw new Error(`Protocol fee allocation does not reconcile for ${row.date}: holder total differs from its interest and origination components.`);
  }
  if (!approximatelyEqual(row.totalRevenueInUsd, numeric(row.protocolRevenueInUsd) + numeric(row.holdersRevenueInUsd))) {
    throw new Error(`Protocol fee allocation does not reconcile for ${row.date}: total revenue differs from protocol plus holder allocations.`);
  }
}

function approximatelyEqual(left, right) {
  const a = numeric(left);
  const b = numeric(right);
  return Math.abs(a - b) <= Math.max(1e-6, Math.abs(a), Math.abs(b)) * 1e-9;
}

function validCachedDailyFeeRow(row, date) {
  if (!row || row.provenance !== PROTOCOL_FEES_DAILY_PROVENANCE || row.isComplete !== true) return false;
  const expected = toUtcApiRange({ startDay: date, endDay: date });
  return sameUtcSecond(row.fromDate, expected.startDate)
    && sameUtcSecond(row.toDate, expected.endDate)
    && approximatelyEqual(row.protocolRevenueInUsd, numeric(row.borrowInterestAccruedForProtocolInUsd) + numeric(row.loanOriginationFeesForProtocolInUsd))
    && approximatelyEqual(row.holdersRevenueInUsd, numeric(row.borrowInterestAccruedForHoldersInUsd) + numeric(row.loanOriginationFeesForHoldersInUsd));
}

function workflowDateRange(startValue, endValue) {
  const start = Date.parse(`${String(startValue).slice(0, 10)}T00:00:00Z`);
  const end = Date.parse(`${String(endValue).slice(0, 10)}T00:00:00Z`);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return [];
  const rows = [];
  for (let value = start; value <= end; value += 86400000) rows.push(new Date(value).toISOString().slice(0, 10));
  return rows;
}

function periodMatches(row, period) {
  const expected = toUtcApiRange({ startDay: period.startDay, endDay: period.endDay });
  return sameUtcSecond(row?.fromDate, expected.startDate) && sameUtcSecond(row?.toDate, expected.endDate);
}

function hasCurrentDailyOverviewBoundary(row, date) {
  const expected = toUtcApiRange({ startDay: date, endDay: date });
  return row?.provenance === "daily-api"
    && row.revenueFromRepaidInterestInUsd !== undefined
    && row.loanOriginationFeesInUsd !== undefined
    && row.loanOriginationFeesMinAdaInUsd !== undefined
    && sameUtcSecond(row.fromDate, expected.startDate)
    && sameUtcSecond(row.toDate, expected.endDate);
}

function sameUtcSecond(left, right) {
  return String(left || "").replace(".000Z", "Z") === String(right || "").replace(".000Z", "Z");
}

async function writeRawSuccess(store, path, fetchedAt, query, variables, payload, rowCount) {
  await store.writeJson(path, { fetchedAt, source: "https://v2.api.liqwid.finance/graphql", query: String(query).trim(), variables, rowCount, payload }, { overwrite: false });
}

async function writeRawError(store, path, fetchedAt, query, variables, error) {
  await store.writeJson(path, {
    fetchedAt,
    source: "https://v2.api.liqwid.finance/graphql",
    query: String(query).trim(),
    variables,
    rowCount: 0,
    payload: null,
    error: { name: error?.name || "Error", message: error?.message || String(error) }
  }, { overwrite: false });
}

function numeric(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function byDateAscending(left, right) {
  return String(left.date).localeCompare(String(right.date));
}

function workflowPause(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
