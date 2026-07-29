import assert from "node:assert/strict";
import test from "node:test";

import { buildProtocolFeesBatchRequest, buildProtocolFeesRequest, buildProtocolOverviewRequest, fetchProtocolOverviewBatch, LOANS_QUERY, refreshCompleteDataset } from "../src/browser/completeDataWorkflow.js";
import { csvToRows, rowsToCsv } from "../src/browser/dataWorkflow.js";
import { buildCompleteAnalysisFromStore } from "../src/browser/fullAnalysis.js";
import { createPortableDataStore } from "../src/browser/portableArchive.js";
import { toUtcApiRange } from "../src/shared/dates.js";

function currentMarket() {
  return { id: "ADA", displayName: "ADA", symbol: "ADA", supply: 100, borrow: 20, liquidity: 80 };
}

function completeApi(overrides = {}) {
  return {
    async fetchPublicMarkets() {
      return { totals: { supplyInUsd: 100, borrowInUsd: 20, liquidityInUsd: 80 }, markets: [currentMarket()] };
    },
    async fetchMarketHistory() {
      return [{
        timestamp: "2026-01-12T00:00:00.000Z", supplyInUsd: 100, borrowInUsd: 20,
        liquidityInUsd: 80, utilizationPercentage: 0.2, debtRepaidInUsd: 3,
        interestAccruedInUsd: 2, interestRepaidInUsd: 1
      }];
    },
    async fetchMarketParamsHistory() {
      return [{ timestamp: "2026-01-12T00:00:00.000Z", incomeRatioSum: 100, incomeRatioSuppliers: 70, incomeRatioDividends: 10 }];
    },
    async fetchProtocolOverview(input) {
      const variables = toUtcApiRange(input);
      const daily = input.startDay === input.endDay;
      return {
        fromDate: variables.startDate,
        toDate: variables.endDate,
        liquidationProfitInUsd: daily ? 1 : 12,
        debtRepaidInUsd: 3,
        interestAccruedInUsd: 2,
        interestRepaidInUsd: 1,
        revenueFromRepaidInterestInUsd: 6,
        loanOriginationFeesInUsd: 2,
        loanOriginationFeesMinAdaInUsd: 1
      };
    },
    async fetchProtocolFees(input) {
      const variables = toUtcApiRange(input);
      return {
        fromDate: variables.startDate,
        toDate: variables.endDate,
        totalRevenueInUsd: 8,
        protocolRevenueInUsd: 5,
        holdersRevenueInUsd: 3,
        feeBreakdown: {
          borrowInterestAccruedForProtocol: 4,
          borrowInterestAccruedForHolders: 2,
          loanOriginationFeesForProtocol: 1,
          loanOriginationFeesForHolders: 1
        }
      };
    },
    async fetchLoans({ filters = [] }) {
      const results = filters.includes("CAN_BE_LIQUIDATED")
        ? []
        : [{
          marketId: "ADA", publicKey: "key-ada", amount: 10, adjustedAmount: 10, collateral: 20, healthFactor: 1.4, LTV: 0.5, APY: 0.03,
          collaterals: [{ id: "ADA-collateral", qTokenName: "qADA", amountInUsd: 20, market: { id: "ADA", displayName: "ADA" } }]
        }];
      return { totalCount: results.length, results };
    },
    ...overrides
  };
}

test("zero-data refresh fetches every required surface and writes reloadable CSV analysis data", async () => {
  const store = createPortableDataStore([], { name: "liqwid" });

  const { bundle, analysis } = await refreshCompleteDataset({
    store,
    api: completeApi(),
    startDate: "2026-01-01",
    endDate: "2026-01-12",
    runId: "complete-first-run",
    now: () => new Date("2026-01-12T12:00:00.000Z")
  });

  assert.equal(bundle.protocolSeries.at(-1).date, "2026-01-12");
  assert.equal(analysis.loanState.summary.activeDebtLoanCount, 1);
  assert.equal(analysis.loanState.byMarket[0].marketId, "ADA");
  assert.equal(analysis.loanState.byMarket[0].debt125To150InUsd, 10);
  assert.equal(analysis.loanState.healthBuckets.find((row) => row.bucket === "hf_125_150").debtInUsd, 10);
  for (const path of [
    "clean/protocol-liquidation-monthly.csv",
    "clean/protocol-overview-daily.csv",
    "clean/protocol-fees-daily.csv",
    "clean/current-all-loans.csv",
    "clean/market-params-history/ada.csv",
    "metadata/market-params-cursors.csv",
    "computed/loan-participation-history.csv",
    "computed/loan-health-history.csv",
    "computed/loan-reconciliation-history.csv"
  ]) {
    assert.ok(store.listPaths().includes(path), `missing ${path}`);
  }
  assert.deepEqual(
    store.listPaths().filter((path) => path.startsWith("computed/")),
    ["computed/loan-health-history.csv", "computed/loan-participation-history.csv", "computed/loan-reconciliation-history.csv"]
  );
  assert.deepEqual(
    store.listPaths().filter((path) => /^clean\/current-.*-loans\.csv$/.test(path)),
    ["clean/current-all-loans.csv"]
  );
  assert.equal(store.listPaths().some((path) => /^raw\/api\/(?!fetches\/)/.test(path)), false);
  assert.equal(store.listPaths().some((path) => /^(clean|computed)\/.*\.json$/i.test(path)), false);
  assert.ok(store.listPaths().some((path) => /raw\/api\/fetches\/complete-first-run\/protocol-overview\/monthly/.test(path)));
  assert.ok(store.listPaths().some((path) => /raw\/api\/fetches\/complete-first-run\/protocol-overview\/daily/.test(path)));
  assert.ok(store.listPaths().some((path) => /raw\/api\/fetches\/complete-first-run\/protocol-fees\/daily/.test(path)));
  assert.ok(store.listPaths().some((path) => /raw\/api\/fetches\/complete-first-run\/loans/.test(path)));
  assert.ok(store.listPaths().includes("raw/api/fetches/complete-first-run/loans/all.json"));
  assert.deepEqual(
    store.listPaths().filter((path) => path.startsWith("raw/api/fetches/complete-first-run/loans/")),
    ["raw/api/fetches/complete-first-run/loans/all.json"]
  );
  assert.deepEqual(csvToRows(await store.readText("clean/current-all-loans.csv", ""))[0], {
    marketId: "ADA",
    publicKey: "key-ada",
    amount: 10,
    adjustedAmount: 10,
    collateral: 20,
    healthFactor: 1.4,
    LTV: 0.5,
    APY: 0.03,
    collaterals: [{ id: "ADA-collateral", qTokenName: "qADA", amountInUsd: 20, market: { id: "ADA", displayName: "ADA" } }],
    hasDebt: true,
    canBeLiquidated: false,
    hasCollateral: true
  });
  assert.equal(analysis.loanSnapshotHistory.participation[0].activeDebtLoanCount, 1);
  assert.equal(analysis.loanSnapshotHistory.participation[0].distinctActiveDebtObservedKeyCount, 1);
  assert.equal(analysis.dataStatus.coverageCards.find((card) => card.id === "loan-observations").value, "1 saved observation");
  assert.equal(analysis.dataStatus.coverageCards.find((card) => card.id === "liquidations").status, "pass");
  assert.equal(analysis.dataStatus.checks.find((check) => check.id === "liquidations").status, "pass");
});

test("successful refreshes append irregular loan observations and archive reload preserves them", async () => {
  const store = createPortableDataStore([], { name: "liqwid" });
  let snapshot = 1;
  const api = completeApi({
    async fetchLoans({ filters = [] }) {
      const all = snapshot === 1
        ? [
          { marketId: "ADA", publicKey: "key-a", amount: 10, adjustedAmount: 10, collateral: 20, healthFactor: 1.2 },
          { marketId: "ADA", publicKey: "key-a", amount: 0, adjustedAmount: 0, collateral: 0, healthFactor: 9 },
          { marketId: "ADA", publicKey: "key-dust", amount: 0.1, adjustedAmount: 0, collateral: 0, healthFactor: 9 }
        ]
        : [
          { marketId: "ADA", publicKey: "key-a", amount: 12, adjustedAmount: 12, collateral: 22, healthFactor: 1.18 },
          { marketId: "ADA", publicKey: "key-a", amount: 0, adjustedAmount: 0, collateral: 0, healthFactor: 9 },
          { marketId: "ADA", publicKey: "key-dust", amount: 0.1, adjustedAmount: 0, collateral: 0, healthFactor: 9 },
          { marketId: "ADA", publicKey: "key-b", amount: 8, adjustedAmount: 8, collateral: 15, healthFactor: 1.55 }
        ];
      const results = filters.includes("CAN_BE_LIQUIDATED")
        ? []
        : filters.includes("HAS_COLLATERAL")
          ? all.filter((row) => row.collateral > 0)
          : filters.includes("HAS_DEBT")
            ? all.filter((row) => row.amount >= 1)
            : all;
      return { totalCount: results.length, results };
    }
  });

  const firstRefresh = await refreshCompleteDataset({
    store, api, startDate: "2026-01-01", endDate: "2026-01-12", runId: "loan-history-one",
    now: () => new Date("2026-07-18T09:00:00.000Z")
  });
  snapshot = 2;
  const refreshed = await refreshCompleteDataset({
    store, api, startDate: "2026-01-01", endDate: "2026-01-12", runId: "loan-history-two",
    now: () => new Date("2026-07-18T16:47:12.000Z")
  });

  const participation = csvToRows(await store.readText("computed/loan-participation-history.csv", ""));
  const protocolRows = participation.filter((row) => row.scope === "protocol");
  assert.deepEqual(protocolRows.map((row) => [row.timestamp, row.activeDebtLoanCount, row.distinctActiveDebtObservedKeyCount]), [
    ["2026-07-18T09:00:00.000Z", 1, 1],
    ["2026-07-18T16:47:12.000Z", 2, 2]
  ]);
  assert.equal(refreshed.analysis.loanSnapshotHistory.health.filter((row) => row.scope === "protocol").length, 2);
  assert.ok(store.listPaths().includes("raw/api/fetches/loan-history-one/loans/all.json"));
  assert.ok(store.listPaths().includes("raw/api/fetches/loan-history-two/loans/all.json"));

  const reopened = await buildCompleteAnalysisFromStore(store, refreshed.bundle);
  assert.deepEqual(reopened.loanSnapshotHistory, refreshed.analysis.loanSnapshotHistory);
  assert.deepEqual(reopened.marketParameters, refreshed.analysis.marketParameters);
  assert.deepEqual(refreshed.analysis.dataStatus.loanPopulation, reopened.dataStatus.loanPopulation);
  assert.equal(firstRefresh.analysis.dataStatus.coverageCards.find((card) => card.id === "loan-observations").value, "1 saved observation");
  assert.equal(refreshed.analysis.dataStatus.coverageCards.find((card) => card.id === "loan-observations").value, "2 saved observations");
  assert.equal(reopened.dataStatus.coverageCards.find((card) => card.id === "loan-observations").value, "2 saved observations");
  for (const lifecycleAnalysis of [firstRefresh.analysis, refreshed.analysis, reopened]) {
    assert.equal(lifecycleAnalysis.dataStatus.coverageCards.find((card) => card.id === "liquidations").status, "pass");
    assert.equal(lifecycleAnalysis.dataStatus.checks.find((check) => check.id === "liquidations").status, "pass");
  }
  assert.deepEqual(refreshed.analysis.dataStatus.loanPopulation, {
    totalPositions: 4,
    activeDebtPositions: 2,
    zeroDebtPositions: 1,
    excludedDustPositions: 1,
    liquidatablePositions: 0,
    collateralPositions: 2,
    missingObservedKeyPositions: 0,
    missingHealthFactorPositions: 0,
    activeDebtInUsd: 20,
    representedBorrowShare: 1,
    activeDebtShare: 0.5,
    hasUnfilteredSnapshot: true
  });
});

test("daily liquidation batches use explicit full-day UTC boundaries", async () => {
  let request;
  const rows = await fetchProtocolOverviewBatch(["2026-06-05"], {
    retries: 0,
    async fetchImpl(_url, init) {
      request = JSON.parse(init.body);
      return {
        ok: true,
        async json() {
          return { data: { analytics: { d0: { current: { fromDate: "2026-06-05", toDate: "2026-06-06", liquidationProfitInUsd: 9566.64 } } } } };
        }
      };
    }
  });

  assert.match(request.query, /d0: overview\(startDate: "2026-06-05T00:00:00Z", endDate: "2026-06-05T23:59:59Z"\)/);
  assert.equal(rows[0].liquidationProfitInUsd, 9566.64);
});

test("daily overview batches request observed fee components with full UTC boundaries", async () => {
  let request;
  const rows = await fetchProtocolOverviewBatch(["2026-06-05"], {
    retries: 0,
    async fetchImpl(_url, init) {
      request = JSON.parse(init.body);
      return {
        ok: true,
        async json() {
          return { data: { analytics: { d0: { current: { fromDate: "2026-06-05", toDate: "2026-06-05", revenueFromRepaidInterestInUsd: 42, loanOriginationFeesInUsd: 3, loanOriginationFeesMinAdaInUsd: 1 } } } } };
        }
      };
    }
  });

  assert.match(request.query, /d0: overview\(startDate: "2026-06-05T00:00:00Z", endDate: "2026-06-05T23:59:59Z"\)/);
  assert.match(request.query, /revenueFromRepaidInterestInUsd/);
  assert.match(request.query, /loanOriginationFeesInUsd/);
  assert.match(request.query, /loanOriginationFeesMinAdaInUsd/);
  assert.equal(rows[0].revenueFromRepaidInterestInUsd, 42);
  assert.equal(rows[0].loanOriginationFeesInUsd, 3);
  assert.equal(rows[0].loanOriginationFeesMinAdaInUsd, 1);
});

test("a legacy zero-length daily cache row is invalidated and refetched", async () => {
  const store = createPortableDataStore([], { name: "liqwid" });
  const calls = [];
  const api = completeApi({
    async fetchProtocolOverview(input) {
      calls.push(input);
      const variables = toUtcApiRange(input);
      const days = Math.round((Date.parse(`${input.endDay}T00:00:00Z`) - Date.parse(`${input.startDay}T00:00:00Z`)) / 86400000) + 1;
      return {
        fromDate: variables.startDate,
        toDate: variables.endDate,
        liquidationProfitInUsd: days === 1 ? 1 : days
      };
    }
  });

  await refreshCompleteDataset({ store, api, startDate: "2026-01-01", endDate: "2026-01-12", runId: "boundary-one" });
  const rows = csvToRows(await store.readText("clean/protocol-overview-daily.csv", ""));
  const legacyDate = rows[0].date;
  delete rows[0].fromDate;
  delete rows[0].toDate;
  await store.writeText("clean/protocol-overview-daily.csv", rowsToCsv(rows));
  calls.length = 0;

  await refreshCompleteDataset({ store, api, startDate: "2026-01-01", endDate: "2026-01-12", runId: "boundary-two" });

  const dailyCalls = calls.filter((input) => input.startDay === input.endDay);
  assert.deepEqual(dailyCalls.at(-1), { startDay: legacyDate, endDay: legacyDate });
  assert.equal(dailyCalls.length, 2, "one incomplete monthly refresh plus one invalidated daily row");
});

test("a negative nontrivial liquidation month fetches daily detail instead of becoming inferred zero", async () => {
  const store = createPortableDataStore([], { name: "liqwid" });
  const calls = [];
  const api = completeApi({
    async fetchMarketHistory() {
      return ["2024-05-01", "2024-05-02", "2024-05-03"].map((date) => ({
        timestamp: `${date}T00:00:00.000Z`, supplyInUsd: 100, borrowInUsd: 20,
        liquidityInUsd: 80, utilizationPercentage: 0.2, debtRepaidInUsd: 3,
        interestAccruedInUsd: 2, interestRepaidInUsd: 1
      }));
    },
    async fetchMarketParamsHistory() { return []; },
    async fetchProtocolOverview(input) {
      calls.push(input);
      const variables = toUtcApiRange(input);
      const daily = input.startDay === input.endDay;
      return {
        fromDate: variables.startDate,
        toDate: variables.endDate,
        liquidationProfitInUsd: daily ? -10 : -30
      };
    }
  });

  const { analysis } = await refreshCompleteDataset({ store, api, startDate: "2024-05-01", endDate: "2024-05-03", runId: "negative-month" });

  const dailyCalls = calls.filter((input) => input.startDay === input.endDay);
  assert.equal(dailyCalls.length, 3);
  assert.equal(analysis.liquidation.dailyLiquidationCoverage.complete, true);
  assert.equal(analysis.liquidation.dailyProtocolLiquidationProfit.reduce((sum, row) => sum + row.liquidationProfitInUsd, 0), -30);
  assert.equal(analysis.revenue.summary.allocatedProtocolRevenueInUsd, null);
});

test("a required overview API failure prevents a complete analysis generation", async () => {
  const store = createPortableDataStore([], { name: "liqwid" });
  const api = completeApi({ async fetchProtocolOverview() { throw new Error("overview unavailable"); } });

  await assert.rejects(() => refreshCompleteDataset({
    store,
    api,
    startDate: "2026-01-01",
    endDate: "2026-01-12",
    runId: "incomplete-run"
  }), /overview unavailable/);

  assert.equal(store.listPaths().includes("computed/analysis-generation.csv"), false);
});

test("observed fee flow covers every protocol day while allocated DAO revenue starts at the fees endpoint floor", async () => {
  const store = createPortableDataStore([], { name: "liqwid" });
  const overviewCalls = [];
  const api = completeApi({
    async fetchMarketHistory() {
      return ["2025-12-29", "2025-12-30", "2025-12-31", "2026-01-01", "2026-01-02"].map((date) => ({
        timestamp: `${date}T00:00:00Z`, borrow: 10, borrowInUsd: 20, debtRepaid: 1, debtRepaidInUsd: 2,
        supplyInUsd: 100, liquidityInUsd: 80, utilizationPercentage: 0.2, interestAccruedInUsd: 2, interestRepaidInUsd: 1
      }));
    },
    async fetchProtocolOverview(input) {
      overviewCalls.push(input);
      const variables = toUtcApiRange(input);
      const daily = input.startDay === input.endDay;
      return {
        fromDate: variables.startDate,
        toDate: variables.endDate,
        liquidationProfitInUsd: daily ? 0 : 1,
        revenueFromRepaidInterestInUsd: daily ? 5 : 25,
        loanOriginationFeesInUsd: 0,
        loanOriginationFeesMinAdaInUsd: 99
      };
    }
  });

  const { analysis } = await refreshCompleteDataset({ store, api, startDate: "2025-12-29", endDate: "2026-01-02", runId: "realized-revenue" });

  assert.equal(analysis.revenue.summary.coverageFromDate, "2025-12-29");
  assert.deepEqual(analysis.revenue.daily.map((row) => row.date), ["2025-12-29", "2025-12-30", "2025-12-31", "2026-01-01", "2026-01-02"]);
  assert.ok(overviewCalls.some((input) => input.startDay === "2025-12-29" && input.endDay === "2025-12-29"));
  assert.equal(analysis.revenue.daily[0].observedRepaidInterestFeeFlowInUsd, 5);
  assert.equal(analysis.revenue.daily[0].observedOriginationFeeFlowInUsd, 99);
  assert.equal(analysis.revenue.daily[0].combinedObservedFeeFlowInUsd, 104);
  assert.equal(analysis.revenue.daily[0].collectedInterestRevenueInUsd, 5);
  assert.equal(analysis.revenue.daily[0].collectedOriginationRevenueInUsd, 99);
  assert.equal(analysis.revenue.daily[0].collectedRevenueInUsd, 104);
  assert.equal(analysis.revenue.summary.collectedRevenueInUsd, 520);
  assert.equal(analysis.revenue.summary.collectedInterestRevenueInUsd, 25);
  assert.equal(analysis.revenue.summary.collectedOriginationRevenueInUsd, 495);
  assert.equal(analysis.revenue.monthlyCollectedRevenue[0].collectedRevenueInUsd, 312);
  assert.equal(analysis.revenue.monthlyAllocation[0].periodStartDay, "2026-01-01");
  assert.equal(analysis.revenue.monthlyAllocation[0].allocatedProtocolInterestRevenueInUsd, 8);
  assert.equal(analysis.revenue.monthlyAllocation[0].allocatedProtocolOriginationRevenueInUsd, 2);
  assert.equal(analysis.revenue.monthlyAllocation[0].allocatedHoldersRevenueInUsd, 6);
});

test("monthly official allocation is aggregated from canonical daily rows", async () => {
  const store = createPortableDataStore([], { name: "liqwid" });
  const monthlyCalls = [];
  const api = completeApi({
    async fetchMarketHistory() {
      return ["2026-01-01", "2026-04-15"].map((date) => ({
        timestamp: `${date}T00:00:00.000Z`, supplyInUsd: 100, borrowInUsd: 20,
        liquidityInUsd: 80, utilizationPercentage: 0.2, interestAccruedInUsd: 2, interestRepaidInUsd: 1
      }));
    },
    async fetchProtocolFees(input) {
      if (input.startDay !== input.endDay) monthlyCalls.push(input);
      const variables = toUtcApiRange(input);
      const month = Number(input.startDay.slice(5, 7));
      return {
        fromDate: variables.startDate,
        toDate: variables.endDate,
        totalRevenueInUsd: month * 11,
        protocolRevenueInUsd: month * 10,
        holdersRevenueInUsd: month,
        feeBreakdown: {
          borrowInterestAccruedForProtocol: month * 7,
          loanOriginationFeesForProtocol: month * 3,
          borrowInterestAccruedForHolders: month * 0.75,
          loanOriginationFeesForHolders: month * 0.25
        }
      };
    }
  });

  const { analysis } = await refreshCompleteDataset({
    store,
    api,
    startDate: "2026-01-01",
    endDate: "2026-04-15",
    runId: "monthly-fee-periods",
    now: () => new Date("2026-04-16T00:00:00.000Z")
  });

  assert.deepEqual(monthlyCalls, []);
  assert.deepEqual(analysis.revenue.monthlyAllocation.map((row) => row.allocatedProtocolRevenueInUsd), [310, 560, 930, 600]);
  assert.deepEqual(analysis.revenue.monthlyAllocation.map((row) => row.allocatedHoldersRevenueInUsd), [31, 56, 93, 60]);
  assert.deepEqual(analysis.revenue.monthlyAllocation.map((row) => row.isComplete), [true, true, true, false]);
  assert.equal(analysis.revenue.summary.allocatedProtocolRevenueInUsd, 2400);
  assert.equal(analysis.revenue.summary.allocatedProtocolInterestRevenueInUsd, 1680);
  assert.equal(analysis.revenue.summary.allocatedProtocolOriginationRevenueInUsd, 720);
  assert.equal(analysis.revenue.summary.allocatedHoldersRevenueInUsd, 240);
  assert.equal(analysis.revenue.summary.allocatedHoldersInterestRevenueInUsd, 180);
  assert.equal(analysis.revenue.summary.allocatedHoldersOriginationRevenueInUsd, 60);
  assert.equal(analysis.revenue.summary.cumulativeAllocationFromDate, "2026-01-01");
  assert.equal(analysis.revenue.summary.cumulativeAllocationToDate, "2026-04-15");
  assert.equal(analysis.revenue.summary.completeAllocationDays, 105);
});

test("an old monthly cache is ignored in favor of canonical daily aggregation", async () => {
  const store = createPortableDataStore([], { name: "liqwid" });
  await store.writeText("clean/protocol-fees-monthly.csv", rowsToCsv([{
    date: "2026-01-01",
    periodStartDay: "2026-01-01",
    periodEndDay: "2026-01-31",
    fromDate: "2026-01-01T00:00:00Z",
    toDate: "2026-01-31T23:59:59Z",
    protocolRevenueInUsd: 0,
    holdersRevenueInUsd: 0,
    isComplete: true
  }]));
  const monthlyCalls = [];
  const api = completeApi({
    async fetchMarketHistory() {
      return ["2026-01-01", "2026-01-31"].map((date) => ({
        timestamp: `${date}T00:00:00.000Z`, supplyInUsd: 100, borrowInUsd: 20,
        liquidityInUsd: 80, utilizationPercentage: 0.2, interestAccruedInUsd: 2, interestRepaidInUsd: 1
      }));
    },
    async fetchProtocolFees(input) {
      if (input.startDay !== input.endDay) monthlyCalls.push(input);
      return completeApi().fetchProtocolFees(input);
    }
  });

  const { analysis } = await refreshCompleteDataset({
    store,
    api,
    startDate: "2026-01-01",
    endDate: "2026-01-31",
    runId: "monthly-fee-contract-refresh",
    now: () => new Date("2026-02-01T00:00:00.000Z")
  });

  assert.deepEqual(monthlyCalls, []);
  assert.equal(analysis.revenue.monthlyAllocation[0].allocatedProtocolRevenueInUsd, 155);
  assert.equal(analysis.revenue.monthlyAllocation[0].allocatedHoldersRevenueInUsd, 93);
  assert.match(String(analysis.revenue.monthlyAllocation[0].provenance), /daily-aggregate/);
});

test("incremental complete refresh never requests already saved closed-period data", async () => {
  const store = createPortableDataStore([], { name: "liqwid" });
  const calls = { history: [], params: [], overview: [], loans: 0 };
  const api = completeApi({
    async fetchMarketHistory(input) {
      calls.history.push(input);
      return [{
        timestamp: `${input.endDay}T00:00:00.000Z`, supplyInUsd: 100, borrowInUsd: 20,
        liquidityInUsd: 80, utilizationPercentage: 0.2, debtRepaidInUsd: 3,
        interestAccruedInUsd: 2, interestRepaidInUsd: 1
      }];
    },
    async fetchMarketParamsHistory(input) {
      calls.params.push(input);
      return [{ timestamp: `${input.endDay}T00:00:00.000Z`, incomeRatioSum: 100, incomeRatioSuppliers: 70, incomeRatioDividends: 10 }];
    },
    async fetchProtocolOverview(input) {
      calls.overview.push(input);
      const variables = toUtcApiRange(input);
      const days = Math.round((Date.parse(`${input.endDay}T00:00:00Z`) - Date.parse(`${input.startDay}T00:00:00Z`)) / 86400000) + 1;
      return { fromDate: variables.startDate, toDate: variables.endDate, liquidationProfitInUsd: days };
    },
    async fetchLoans(input) {
      calls.loans += 1;
      return completeApi().fetchLoans(input);
    }
  });

  await refreshCompleteDataset({ store, api, startDate: "2026-01-01", endDate: "2026-01-12", runId: "efficient-one" });
  calls.history.length = 0;
  calls.params.length = 0;
  calls.overview.length = 0;
  calls.loans = 0;

  await refreshCompleteDataset({ store, api, startDate: "2026-01-01", endDate: "2026-01-13", runId: "efficient-two" });

  assert.deepEqual(calls.history.map((input) => [input.startDay, input.endDay]), [["2026-01-13", "2026-01-13"]]);
  assert.deepEqual(calls.params.map((input) => [input.startDay, input.endDay]), [["2026-01-13", "2026-01-13"]]);
  assert.deepEqual(calls.overview.map((input) => [input.startDay, input.endDay]), [
    ["2026-01-12", "2026-01-13"],
    ["2026-01-13", "2026-01-13"]
  ]);
  assert.equal(calls.loans, 1);
});

test("current loan query requests observed keys and per-asset collateral composition", () => {
  assert.match(LOANS_QUERY, /publicKey/);
  assert.match(LOANS_QUERY, /adjustedAmount\(input:\s*\{\s*currency:\s*USD\s*\}\)/);
  assert.match(LOANS_QUERY, /collaterals\s*\{/);
  assert.match(LOANS_QUERY, /amountInUsd:\s*amount/);
  assert.match(LOANS_QUERY, /market\s*\{[\s\S]*displayName/);
});

test("protocol overview requests use full inclusive UTC boundaries", () => {
  assert.deepEqual(buildProtocolOverviewRequest({ startDay: "2026-06-01", endDay: "2026-06-30" }).variables, {
    startDate: "2026-06-01T00:00:00Z",
    endDate: "2026-06-30T23:59:59Z"
  });
});

test("protocol fee allocation requests use full inclusive UTC boundaries and official split fields", () => {
  const request = buildProtocolFeesRequest({ startDay: "2026-06-01", endDay: "2026-06-30" });
  assert.deepEqual(request.variables, {
    startDate: "2026-06-01T00:00:00Z",
    endDate: "2026-06-30T23:59:59Z"
  });
  assert.match(request.query, /protocolRevenueInUsd/);
  assert.match(request.query, /protocolRevenueInUsd:\s*dailyProtocolRevenue/);
  assert.match(request.query, /holdersRevenueInUsd/);
  assert.match(request.query, /feeBreakdown:\s*breakdown/);
  assert.match(request.query, /borrowInterestAccruedForProtocol/);
  assert.match(request.query, /loanOriginationFeesForProtocol/);
});

test("daily fee allocation batches preserve one exact UTC day per aliased result", () => {
  const request = buildProtocolFeesBatchRequest(["2026-07-13", "2026-07-14", "2026-07-15", "2026-07-16"]);
  for (const [index, day] of ["2026-07-13", "2026-07-14", "2026-07-15", "2026-07-16"].entries()) {
    const { startDate, endDate } = toUtcApiRange({ startDay: day, endDay: day });
    assert.match(request.query, new RegExp(`d${index}: fees\\(startDate: "${startDate.replaceAll(".", "\\.")}", endDate: "${endDate.replaceAll(".", "\\.")}"\\)`));
  }
  assert.match(request.query, /dailyProtocolRevenue/);
  assert.match(request.query, /borrowInterestAccruedForProtocol/);
  assert.match(request.query, /loanOriginationFeesForHolders/);
  assert.throws(() => buildProtocolFeesBatchRequest(["2026-07-12", "2026-07-13", "2026-07-14", "2026-07-15", "2026-07-16"]), /limited to 4 dates/);
});
