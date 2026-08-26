import assert from "node:assert/strict";
import test from "node:test";

import { buildAnalysisBundle } from "../src/browser/dataWorkflow.js";
import { aggregateDailyProtocolFeeAllocations, buildArchiveAudit, buildCompleteAnalysis, buildLqTokenAnalysis, buildPolAnalysisContext, buildProtocolRevenueRunRateSeries, deriveLoanPopulations } from "../src/browser/fullAnalysis.js";

function history(date, overrides = {}) {
  return {
    marketId: "ADA",
    marketDisplayName: "ADA",
    timestamp: `${date}T00:00:00.000Z`,
    date,
    supplyInUsd: 100,
    borrowInUsd: 20,
    liquidityInUsd: 80,
    utilizationPercentage: 0.2,
    debtRepaidInUsd: 1,
    interestAccruedInUsd: 2,
    interestRepaidInUsd: 1,
    loanOriginationFeesInUsd: 0,
    loanOriginationFeesMinAdaInUsd: 0,
    borrowApr: 0.05,
    supplyApy: 0.02,
    ...overrides
  };
}

test("archive audit reconciles current markets and historical raw captures with canonical rows", async () => {
  const capture = "raw/api/fetches/20260729T111547642Z";
  const jsonByPath = new Map([
    [`${capture}/markets/page-0000.json`, {
      source: "https://v2.api.liqwid.finance/graphql",
      rowCount: 2,
      payload: {
        liqwid: {
          data: {
            markets: {
              totalCount: 2,
              results: [{ id: "ADA" }, { id: "DJED" }]
            }
          }
        }
      }
    }],
    [`${capture}/market-history/ada.json`, {
      source: "https://v2.api.liqwid.finance/graphql",
      rowCount: 2,
      payload: { rows: [{ date: "2026-01-01" }, { date: "2026-01-02" }] }
    }],
    [`${capture}/market-history/djed.json`, {
      source: "https://v2.api.liqwid.finance/graphql",
      rowCount: 1,
      payload: { rows: [{ date: "2026-01-02" }] }
    }],
    [`${capture}/market-params-history/ada.json`, {
      source: "https://v2.api.liqwid.finance/graphql",
      rowCount: 1,
      payload: { rows: [{ timestamp: "2026-01-01T00:00:00Z" }] }
    }],
    [`${capture}/market-params-history/djed.json`, {
      source: "https://v2.api.liqwid.finance/graphql",
      rowCount: 1,
      payload: { rows: [{ timestamp: "2026-01-01T00:00:00Z" }] }
    }],
    [`${capture}/loans/all.json`, {
      source: "https://v2.api.liqwid.finance/graphql",
      rowCount: 1,
      payload: { totalCount: 1, results: [{ marketId: "ADA" }] }
    }]
  ]);
  const store = {
    listPaths: () => [...jsonByPath.keys(), "metadata/market-params-cursors.csv"],
    readJson: async (path, fallback) => jsonByPath.get(path) ?? fallback,
    readText: async (path, fallback) => path === "metadata/market-params-cursors.csv"
      ? "marketId,requestedThrough\nADA,2026-01-02\nDJED,2026-01-02\n"
      : fallback,
    archiveValidation: {
      manifestValidated: true,
      archiveFormat: "liqwid-portable-data",
      archiveVersion: "1",
      entryCount: 7
    }
  };
  const bundle = {
    source: "https://v2.api.liqwid.finance/graphql",
    rawCapture: capture,
    requestedRange: { endDate: "2026-01-02" },
    markets: [{ id: "ADA" }, { id: "DJED" }],
    marketSeries: {
      ADA: [{ date: "2026-01-01" }, { date: "2026-01-02" }],
      DJED: [{ date: "2026-01-02" }]
    }
  };

  const audit = await buildArchiveAudit(store, bundle, 1, {
    ADA: [{ timestamp: "2026-01-01T00:00:00Z" }],
    DJED: [{ timestamp: "2026-01-01T00:00:00Z" }]
  });

  assert.deepEqual(audit.currentMarkets, {
    rawEnvelopeRowCount: 2,
    rawTotalCount: 2,
    rawResultCount: 2,
    cleanRowCount: 2
  });
  assert.deepEqual(audit.historicalTables, {
    expectedMarketFiles: 2,
    rawMarketHistoryFiles: 2,
    rawMarketHistoryRows: 3,
    cleanMarketHistoryRows: 3,
    marketHistoryMismatches: [],
    rawMarketParameterFiles: 2,
    rawMarketParameterRows: 2,
    cleanMarketParameterRows: 2,
    marketParameterMismatches: []
  });
});

test("one canonical loan table reconstructs the official filtered populations", () => {
  const populations = deriveLoanPopulations([
    { id: "active", amount: 10, adjustedAmount: 10, collateral: 20, healthFactor: 1.2 },
    { id: "liquidatable", amount: 8, adjustedAmount: 8, collateral: 0, healthFactor: 0 },
    { id: "repaid", amount: 0.1, adjustedAmount: 0, collateral: 5, healthFactor: 0 },
    { id: "empty", amount: 0, adjustedAmount: 0, collateral: 0, healthFactor: 0 }
  ]);

  assert.deepEqual(populations.activeLoans.map((row) => row.id), ["active", "liquidatable"]);
  assert.deepEqual(populations.liquidatableLoans.map((row) => row.id), ["liquidatable"]);
  assert.deepEqual(populations.collateralLoans.map((row) => row.id), ["active", "repaid"]);
  assert.deepEqual(populations.allLoans.map((row) => [row.id, row.hasDebt, row.canBeLiquidated, row.hasCollateral]), [
    ["active", true, false, true],
    ["liquidatable", true, true, false],
    ["repaid", false, false, true],
    ["empty", false, false, false]
  ]);
});

test("protocol and market summaries use native-first current-valued interest coverage", () => {
  const market = { id: "ASSET-A", displayName: "Asset A", symbol: "A" };
  const rows = [
    history("2026-01-01", { marketId: "ASSET-A", marketDisplayName: "Asset A", borrow: 10, borrowInUsd: 100 }),
    history("2026-01-02", {
      marketId: "ASSET-A",
      marketDisplayName: "Asset A",
      borrow: 20,
      borrowInUsd: 200,
      interestAccrued: 2,
      interestAccruedInUsd: 20,
      interestRepaid: 0,
      interestRepaidInUsd: 0
    }),
    history("2026-01-03", {
      marketId: "ASSET-A",
      marketDisplayName: "Asset A",
      borrow: 10,
      borrowInUsd: 50,
      debtRepaid: 10,
      debtRepaidInUsd: 50,
      interestAccrued: 0,
      interestAccruedInUsd: 0,
      interestRepaid: 2,
      interestRepaidInUsd: 10
    })
  ];
  const bundle = buildAnalysisBundle({
    markets: [market],
    marketSeriesById: { "ASSET-A": rows },
    dataRoot: "liqwid",
    startDate: "2026-01-01",
    endDate: "2026-01-03"
  });

  const analysis = buildCompleteAnalysis({
    bundle,
    allLoans: [],
    activeLoans: [],
    collateralLoans: [],
    liquidatableLoans: [],
    monthlyLiquidations: [],
    dailyLiquidations: [],
    dailyRevenue: [],
    dailyAllocatedFees: [],
    monthlyFees: []
  });

  assert.equal(bundle.protocolSeries.at(-1).interestCoverage90d, 1);
  assert.equal(analysis.protocolSummary.interestCoverage90d, 1);
  assert.equal(analysis.marketSummaries[0].interestCoverage90d, 1);
});

test("complete analysis carries current and historical market parameters into a selected-market view model", () => {
  const market = {
    id: "ADA",
    displayName: "ADA",
    symbol: "ADA",
    supply: 100,
    borrow: 42,
    liquidity: 58,
    utilization: 0.42,
    asset: { price: 1 },
    parameters: {
      minHealthFactor: 1.15,
      closeFactor0: 0.5,
      collateralParameters: [{
        collateral: { id: "DJED", displayName: "DJED" },
        maxLoanToValue: 0.7,
        liquidationThreshold: 0.8,
        liquidationPenalty: 0.1
      }]
    }
  };
  const bundle = buildAnalysisBundle({
    markets: [market],
    marketSeriesById: { ADA: [history("2026-01-01", { utilizationPercentage: 0.42 })] },
    dataRoot: "liqwid",
    startDate: "2026-01-01",
    endDate: "2026-01-01"
  });
  const analysis = buildCompleteAnalysis({
    bundle,
    allLoans: [],
    activeLoans: [],
    collateralLoans: [],
    liquidatableLoans: [],
    marketParamsById: {
      ADA: [{
        timestamp: "2025-12-01T10:15:00.000Z",
        txHash: "governance-update",
        baseRate: 0.000001,
        utilMultiplier: 0.000002,
        utilMultiplierJump: 0.0001,
        kink: 0.8,
        supplyCap: null,
        borrowCap: 0.9,
        incomeRatioSum: 10,
        incomeRatioSuppliers: 8,
        incomeRatioDividends: 1,
        incomeRatioTreasury: 0,
        baseBorrowerAPR: 0.05,
        baseSupplierAPY: 0.02,
        optimalBorrowerAPR: 0.1,
        optimalSupplierAPY: 0.068,
        maxBorrowerAPR: 0.6,
        maxSupplierAPY: 0.434
      }]
    }
  });

  const parameters = analysis.marketParameters.byMarket.ADA;
  assert.equal(parameters.current.txHash, "governance-update");
  assert.equal(parameters.current.capacity.utilizationCap, 0.9);
  assert.equal(parameters.rateCurve.currentUtilization, 0.42);
  assert.ok(parameters.rateCurve.rows.length > 100);
  assert.equal(analysis.protocolParameters.current.totalMarketCount, 1);
  assert.equal(analysis.protocolParameters.current.borrowWeightedKink, 0.8);
  assert.equal(analysis.protocolParameters.current.collateralPairCount, 1);
  assert.equal(analysis.protocolParameters.marketRows[0].minHealthFactor, 1.15);
});

test("complete analysis exposes reconciled market collections and parameter-derived accruals beside market summaries", () => {
  const markets = [
    { id: "A", displayName: "A", symbol: "A" },
    { id: "B", displayName: "B", symbol: "B" }
  ];
  const bundle = buildAnalysisBundle({
    markets,
    marketSeriesById: {
      A: [history("2026-07-20", {
        marketId: "A",
        interestAccruedInUsd: 50,
        interestRepaidInUsd: 80,
        loanOriginationFeesInUsd: 3
      })],
      B: [history("2026-07-20", {
        marketId: "B",
        interestAccruedInUsd: 20,
        interestRepaidInUsd: 20,
        loanOriginationFeesInUsd: 1
      })]
    },
    dataRoot: "liqwid",
    startDate: "2026-07-20",
    endDate: "2026-07-20"
  });
  bundle.generatedAt = "2026-07-21T08:00:00.000Z";
  const parameter = (supplierRatio) => ({
    timestamp: "2026-01-01T00:00:00.000Z",
    incomeRatioSum: 10,
    incomeRatioSuppliers: supplierRatio,
    incomeRatioDividends: 0,
    incomeRatioTreasury: 0
  });

  const analysis = buildCompleteAnalysis({
    bundle,
    allLoans: [],
    activeLoans: [],
    collateralLoans: [],
    liquidatableLoans: [],
    monthlyLiquidations: [],
    dailyLiquidations: [],
    dailyRevenue: [{
      date: "2026-07-20",
      interestRepaidInUsd: 100,
      revenueFromRepaidInterestInUsd: 18,
      isComplete: true
    }],
    dailyAllocatedFees: [],
    monthlyFees: [],
    marketParamsById: {
      A: [parameter(8)],
      B: [parameter(9)]
    }
  });

  assert.equal(analysis.marketRevenue.protocolReconciliation.daily[0].differenceInUsd, 0);
  assert.equal(analysis.marketRevenue.byMarket.A.summary.ytdAttributedCollectedInterestRevenueInUsd, 16);
  assert.equal(analysis.marketRevenue.byMarket.A.summary.ytdAttributedCollectedMarketRevenueInUsd, 19);
  assert.equal(analysis.marketRevenue.byMarket.A.summary.ytdAccruedProtocolInterestRevenueInUsd, 10);
  assert.equal(analysis.marketSummaries.find((row) => row.marketId === "A").retainedInterestRevenueAvailable, true);
  assert.ok(analysis.revenue.summary.topRevenueMarket);
  assert.equal(analysis.revenue.summary.topRevenueMarket.marketId, "A");
  assert.equal(analysis.revenue.summary.topRevenueMarket.totalRevenueInUsd, 19);
  assert.ok(Array.isArray(analysis.revenue.marketYtdContributions));
  assert.equal(analysis.revenue.marketYtdContributions[0].marketId, "A");
});

test("complete analysis is rebuilt exclusively from the current refresh generation", () => {
  const rows = Array.from({ length: 12 }, (_, index) => history(`2026-01-${String(index + 1).padStart(2, "0")}`, {
    debtRepaidInUsd: index === 11 ? 100 : index + 1
  }));
  const market = { id: "ADA", displayName: "ADA", symbol: "ADA", supply: 100, borrow: 20, liquidity: 80 };
  const bundle = buildAnalysisBundle({
    markets: [market],
    marketSeriesById: { ADA: rows },
    dataRoot: "liqwid",
    startDate: "2026-01-01",
    endDate: "2026-01-12",
    apiTotals: { supplyInUsd: 100, borrowInUsd: 20, liquidityInUsd: 80 }
  });
  const analysis = buildCompleteAnalysis({
    bundle,
    allLoans: [
      { marketId: "ADA", publicKey: "key-ada", amount: 10, collateral: 20, healthFactor: 1.4 },
      { marketId: "ADA", publicKey: "key-zero-debt", amount: 0, collateral: 5, healthFactor: 0 }
    ],
    monthlyLiquidations: [{
      date: "2026-01-01",
      periodStartDay: "2026-01-01",
      periodEndDay: "2026-01-12",
      fromDate: "2026-01-01T00:00:00Z",
      toDate: "2026-01-12T23:59:59Z",
      liquidationProfitInUsd: 12,
      isComplete: false
    }],
    dailyLiquidations: rows.map((row) => ({ date: row.date, liquidationProfitInUsd: 1, provenance: "daily-api" })),
    activeLoans: [
      {
        marketId: "ADA", publicKey: "key-ada", amount: 10, collateral: 20, healthFactor: 1.4, LTV: 0.5, APY: 0.03,
        collaterals: [{ amountInUsd: 20, market: { id: "ADA", displayName: "ADA" } }]
      },
      {
        marketId: "ADA", publicKey: "key-zero-debt", amount: 0, collateral: 5, healthFactor: 0, LTV: 0, APY: 0,
        collaterals: [{ amountInUsd: 5, market: { id: "ADA", displayName: "ADA" } }]
      }
    ],
    collateralLoans: [
      {
        marketId: "ADA", publicKey: "key-ada", amount: 10, collateral: 20, healthFactor: 1.4,
        collaterals: [{ amountInUsd: 20, market: { id: "ADA", displayName: "ADA" } }]
      },
      {
        marketId: "ADA", publicKey: "key-zero-debt", amount: 0, collateral: 5, healthFactor: 0,
        collaterals: [{ amountInUsd: 5, market: { id: "ADA", displayName: "ADA" } }]
      }
    ],
    liquidatableLoans: [],
    dailyRevenue: [
      {
        date: "2025-12-31", fromDate: "2025-12-31T00:00:00Z", toDate: "2025-12-31T23:59:59Z", isComplete: true,
        revenueFromRepaidInterestInUsd: 60, loanOriginationFeesInUsd: 20, loanOriginationFeesMinAdaInUsd: 10
      },
      {
        date: "2026-01-01", fromDate: "2026-01-01T00:00:00Z", toDate: "2026-01-01T23:59:59Z", isComplete: true,
        revenueFromRepaidInterestInUsd: 6, loanOriginationFeesInUsd: 2, loanOriginationFeesMinAdaInUsd: 1
      }
    ],
    dailyAllocatedFees: [
      {
        date: "2026-01-01", periodStartDay: "2026-01-01", periodEndDay: "2026-01-01", isComplete: true,
        protocolRevenueInUsd: 5, holdersRevenueInUsd: 3,
        borrowInterestAccruedForProtocolInUsd: 4, loanOriginationFeesForProtocolInUsd: 1,
        borrowInterestAccruedForHoldersInUsd: 2, loanOriginationFeesForHoldersInUsd: 1
      },
      {
        date: "2026-01-02", periodStartDay: "2026-01-02", periodEndDay: "2026-01-02", isComplete: false,
        protocolRevenueInUsd: 500, holdersRevenueInUsd: 300,
        borrowInterestAccruedForProtocolInUsd: 400, loanOriginationFeesForProtocolInUsd: 100,
        borrowInterestAccruedForHoldersInUsd: 200, loanOriginationFeesForHoldersInUsd: 100
      }
    ],
    monthlyFees: [{
      date: "2026-01-01", periodStartDay: "2026-01-01", periodEndDay: "2026-01-31", isComplete: true,
      protocolRevenueInUsd: 5, holdersRevenueInUsd: 3,
      borrowInterestAccruedForProtocolInUsd: 4, loanOriginationFeesForProtocolInUsd: 1
    }],
    loanSnapshotHistory: {
      participation: [{
        timestamp: "2026-07-18T08:46:41.233Z", scope: "protocol", marketId: "",
        totalLoanCount: 2, distinctObservedKeyCount: 2,
        activeDebtLoanCount: "", distinctActiveDebtObservedKeyCount: ""
      }],
      health: [
        { timestamp: "2026-07-18T08:46:41.233Z", scope: "protocol", marketId: "", activeDebtLoanCount: 1 },
        { timestamp: "2026-07-18T08:46:41.233Z", scope: "market", marketId: "ADA", activeDebtLoanCount: 1 }
      ]
    },
  });

  assert.equal(analysis.protocolSummary.currentBorrowInUsd, 20);
  assert.equal(analysis.loanState.summary.activeDebtLoanCount, 1);
  assert.equal(analysis.liquidation.monthlyProtocolLiquidationProfit[0].liquidationProfitInUsd, 12);
  assert.equal(analysis.revenue.daily[1].combinedObservedFeeFlowInUsd, 9);
  assert.equal(analysis.revenue.daily[1].collectedInterestRevenueInUsd, 6);
  assert.equal(analysis.revenue.daily[1].collectedOriginationRevenueInUsd, 3);
  assert.equal(analysis.revenue.daily[1].collectedRevenueInUsd, 9);
  assert.equal("realizedProtocolRevenueInUsd" in analysis.revenue.daily[0], false);
  assert.equal(analysis.revenue.summary.combinedObservedFeeFlowInUsd, 99);
  assert.equal(analysis.revenue.summary.collectedRevenueInUsd, 99);
  assert.equal(analysis.revenue.summary.collectedInterestRevenueInUsd, 66);
  assert.equal(analysis.revenue.summary.collectedOriginationRevenueInUsd, 33);
  assert.equal(analysis.revenue.summary.collectedCoverageFromDate, "2025-12-31");
  assert.equal(analysis.revenue.summary.collectedCoverageToDate, "2026-01-01");
  assert.equal(analysis.revenue.summary.ytdCollectedRevenueInUsd, 9);
  assert.equal(analysis.revenue.summary.ytdCollectedInterestRevenueInUsd, 6);
  assert.equal(analysis.revenue.summary.ytdCollectedOriginationRevenueInUsd, 3);
  assert.equal(analysis.revenue.summary.ytdCollectedCoverageFromDate, "2026-01-01");
  assert.equal(analysis.revenue.summary.ytdCollectedCoverageToDate, "2026-01-01");
  assert.equal(analysis.revenue.summary.ytdCollectedCompleteDays, 1);
  assert.equal(analysis.revenue.monthlyCollectedRevenue[0].collectedRevenueInUsd, 90);
  assert.equal(analysis.revenue.monthlyCollectedRevenue[1].collectedRevenueInUsd, 9);
  assert.equal(analysis.revenue.summary.allocatedProtocolRevenueInUsd, 5);
  assert.equal(analysis.revenue.summary.allocatedHoldersRevenueInUsd, 3);
  assert.equal(analysis.revenue.summary.cumulativeAllocationFromDate, "2026-01-01");
  assert.equal(analysis.revenue.summary.cumulativeAllocationToDate, "2026-01-01");
  assert.equal(analysis.revenue.dailyAllocation[0].date, "2026-01-01");
  assert.equal(analysis.revenue.dailyAllocation[1].isComplete, false);
  assert.equal(analysis.revenue.dailyAllocation[0].allocatedProtocolInterestRevenueInUsd, 4);
  assert.equal(analysis.revenue.dailyAllocation[0].allocatedHoldersOriginationRevenueInUsd, 1);
  assert.equal(analysis.revenue.summary.topRevenueMarket, null);
  assert.ok(Array.isArray(analysis.revenue.marketYtdContributions));
  assert.equal("currentParameterProtocolInterestShare" in analysis.marketSummaries[0], false);
  assert.equal("estimatedProtocolRevenue90dInUsd" in analysis.marketSummaries[0], false);
  assert.equal(analysis.marketSummaries[0].activeDebtLoanCount, 1);
  assert.equal(analysis.liquidation.dailyLiquidationCoverage.complete, true);
  assert.equal(analysis.liquidation.currentDaysWithoutLiquidations, 0);
  assert.equal(analysis.dataStatus.loanPopulation.totalPositions, 2);
  assert.equal(analysis.dataStatus.loanPopulation.activeDebtPositions, 1);
  assert.equal(analysis.dataStatus.loanPopulation.zeroDebtPositions, 1);
  assert.equal(analysis.dataStatus.checks.find((row) => row.id === "protocol-borrow").status, "pass");
  assert.ok(analysis.marketStress.currentMarketStress.length);
  assert.equal(analysis.currentExposure.collateralRisk.byCollateral[0].collateralMarketId, "ADA");
  assert.equal(analysis.currentExposure.collateralRisk.byCollateral[0].activeLoanCount, 1);
  assert.equal(analysis.currentExposure.collateralRisk.byCollateral[0].attributedDebtInUsd, 10);
  assert.equal(analysis.currentExposure.borrowerConcentration.observedKeyExposure.rows[0].observedKeyLabel, "Observed key 1");
  assert.equal(analysis.currentExposure.borrowerConcentration.observedKeyExposure.rows[0].totalDebtInUsd, 10);
  assert.equal(analysis.currentExposure.borrowerConcentration.marketDependence[0].observedKeyCount, 1);
  assert.equal(analysis.currentExposure.supplySide.byMarket[0].activeDebtCollateralInUsd, 20);
  assert.equal(analysis.currentExposure.supplySide.byMarket[0].zeroDebtCollateralInUsd, 5);
  assert.equal(analysis.currentExposure.supplySide.byMarket[0].representedObservedKeyCount, 2);
  assert.deepEqual(analysis.loanSnapshotHistory.participation, [
    {
      timestamp: "2026-07-18T08:46:41.233Z", scope: "protocol", marketId: "",
      activeDebtLoanCount: 1, distinctActiveDebtObservedKeyCount: 1
    },
    {
      timestamp: "2026-07-18T08:46:41.233Z", scope: "market", marketId: "ADA",
      activeDebtLoanCount: 1, distinctActiveDebtObservedKeyCount: 1
    }
  ]);
  assert.doesNotMatch(JSON.stringify(analysis.currentExposure), /key-ada/);
});

test("market loan-health summaries include debt and position counts at both low-HF thresholds", () => {
  const market = { id: "ADA", displayName: "ADA", symbol: "ADA", supply: 100, borrow: 60, liquidity: 40 };
  const bundle = buildAnalysisBundle({
    markets: [market],
    marketSeriesById: { ADA: [history("2026-01-01", { borrowInUsd: 60, liquidityInUsd: 40 })] },
    dataRoot: "liqwid",
    startDate: "2026-01-01",
    endDate: "2026-01-01",
    apiTotals: { supplyInUsd: 100, borrowInUsd: 60, liquidityInUsd: 40 }
  });
  const activeLoans = [
    { marketId: "ADA", amount: 5, collateral: 3, healthFactor: 0.85 },
    { marketId: "ADA", amount: 10, collateral: 20, healthFactor: 1.05 },
    { marketId: "ADA", amount: 20, collateral: 30, healthFactor: 1.20 },
    { marketId: "ADA", amount: 30, collateral: 60, healthFactor: 1.40 }
  ];
  const analysis = buildCompleteAnalysis({
    bundle,
    allLoans: activeLoans,
    activeLoans,
    collateralLoans: [],
    liquidatableLoans: []
  });
  const summary = analysis.marketSummaries[0];

  assert.equal(summary.activeLoanDebtBelow100InUsd, 5);
  assert.equal(summary.activeDebtLoanCountBelow100, 1);
  assert.equal(summary.activeLoanBadDebtLoanCount, 1);
  assert.equal(summary.activeLoanBadDebtInUsd, 5);
  assert.equal(summary.activeLoanDebtAtOrBelow110InUsd, 15);
  assert.equal(analysis.loanState.byMarket[0].debt100To110InUsd, 10);
  assert.equal(summary.activeDebtLoanCountAtOrBelow110, 2);
  assert.equal(summary.activeLoanDebtAtOrBelow125InUsd, 35);
  assert.equal(summary.activeDebtLoanCountAtOrBelow125, 3);
  assert.equal(summary.activeLoanHealthPressure, (15 + 0.30 * 20 + 0.05 * 30) / 65);
});

test("full analysis ensures activeLoanDebtBelow100InUsd is at least activeLoanBadDebtInUsd even when healthFactor is null", () => {
  const market = { id: "ADA", displayName: "ADA", symbol: "ADA", supply: 100, borrow: 60, liquidity: 40 };
  const bundle = buildAnalysisBundle({
    markets: [market],
    marketSeriesById: { ADA: [history("2026-01-01", { borrowInUsd: 60, liquidityInUsd: 40 })] },
    dataRoot: "liqwid",
    startDate: "2026-01-01",
    endDate: "2026-01-01",
    apiTotals: { supplyInUsd: 100, borrowInUsd: 60, liquidityInUsd: 40 }
  });
  const activeLoans = [
    { marketId: "ADA", amount: 50, collateral: 20, healthFactor: null },
    { marketId: "ADA", amount: 10, collateral: 20, healthFactor: 1.05 }
  ];
  const analysis = buildCompleteAnalysis({
    bundle,
    allLoans: activeLoans,
    activeLoans,
    collateralLoans: [],
    liquidatableLoans: []
  });
  const summary = analysis.marketSummaries[0];

  assert.equal(summary.activeLoanBadDebtInUsd, 50);
  assert.equal(summary.activeLoanDebtBelow100InUsd, 50);
  assert.equal(summary.activeLoanBadDebtInUsd <= summary.activeLoanDebtBelow100InUsd, true);
});


test("market revenue evidence reports collected origination revenue separately from interest repayment activity", () => {
  const rows = Array.from({ length: 93 }, (_, index) => {
    const date = new Date(Date.UTC(2025, 11, 30 + index)).toISOString().slice(0, 10);
    return history(date, {
      interestAccruedInUsd: 1000,
      interestRepaidInUsd: index < 92 ? 10 : 1000,
      loanOriginationFeesInUsd: index < 92 ? 2 : 1000,
      loanOriginationFeesMinAdaInUsd: index < 92 ? 1 : 1000
    });
  });
  const market = { id: "ADA", displayName: "ADA", symbol: "ADA", supply: 100, borrow: 20, liquidity: 80 };
  const bundle = buildAnalysisBundle({
    markets: [market],
    marketSeriesById: { ADA: rows },
    dataRoot: "liqwid",
    startDate: rows[0].date,
    endDate: rows.at(-1).date,
    apiTotals: { supplyInUsd: 100, borrowInUsd: 20, liquidityInUsd: 80 }
  });
  bundle.generatedAt = "2026-04-01T12:00:00.000Z";

  const analysis = buildCompleteAnalysis({
    bundle,
    monthlyLiquidations: [],
    dailyLiquidations: [],
    dailyRevenue: [],
    dailyAllocatedFees: [],
    allLoans: [],
    activeLoans: [],
    liquidatableLoans: [],
    collateralLoans: []
  });

  const summary = analysis.marketSummaries[0];
  assert.equal(summary.marketRevenueCoverageFromDate, "2025-12-30");
  assert.equal(summary.marketRevenueCoverageToDate, "2026-03-31");
  assert.equal(summary.marketRevenueCompleteDays, 92);
  assert.equal(summary.marketRevenueYtdCoverageFromDate, "2026-01-01");
  assert.equal(summary.marketRevenueYtdCoverageToDate, "2026-03-31");
  assert.equal(summary.marketRevenueYtdCompleteDays, 90);
  assert.equal(summary.collectedOriginationRevenueInUsd, 276);
  assert.equal(summary.ytdCollectedOriginationRevenueInUsd, 270);
  assert.equal(summary.collectedOriginationRevenue30dInUsd, 90);
  assert.equal(summary.collectedOriginationRevenue90dInUsd, 270);
  assert.equal(summary.interestRepaidActivityInUsd, 920);
  assert.equal(summary.ytdInterestRepaidActivityInUsd, 900);
  assert.equal(summary.interestRepaidActivity30dInUsd, 300);
  assert.equal(summary.interestRepaidActivity90dInUsd, 900);
  assert.equal(summary.latestPositiveOriginationRevenueDate, "2026-03-31");
  assert.equal(summary.retainedInterestRevenueAvailable, false);
  assert.equal(summary.totalCollectedRevenueAvailable, false);
  assert.equal("grossRealizedRevenueProxy90dInUsd" in summary, false);
  assert.equal("repaidInterestFeeFlow90dInUsd" in summary, false);
  assert.equal("estimatedProtocolRevenue90dInUsd" in summary, false);
});

test("protocol revenue run rate uses 90 consecutive complete UTC days and excludes the incomplete current day", () => {
  const rows = Array.from({ length: 91 }, (_, index) => {
    const date = new Date(Date.UTC(2026, 0, 1 + index)).toISOString().slice(0, 10);
    return {
      date,
      periodStartDay: date,
      periodEndDay: date,
      protocolRevenueInUsd: index < 90 ? 1 : 1000,
      isComplete: index < 90
    };
  });

  const series = buildProtocolRevenueRunRateSeries(rows);

  assert.deepEqual(series, [{
    date: "2026-03-31",
    windowStartDate: "2026-01-01",
    windowEndDate: "2026-03-31",
    observedDays: 90,
    trailing90DaysProtocolRevenueInUsd: 90,
    annualizedRunRateInUsd: 90 * (365.25 / 90)
  }]);
});

test("daily official allocations aggregate by calendar month and preserve completeness", () => {
  const rows = [];
  for (let day = 1; day <= 31; day += 1) {
    const date = `2026-01-${String(day).padStart(2, "0")}`;
    rows.push({
      date, fromDate: `${date}T00:00:00Z`, toDate: `${date}T23:59:59Z`, isComplete: true,
      protocolRevenueInUsd: 5, holdersRevenueInUsd: 3,
      borrowInterestAccruedForProtocolInUsd: 4, loanOriginationFeesForProtocolInUsd: 1,
      borrowInterestAccruedForHoldersInUsd: 2, loanOriginationFeesForHoldersInUsd: 1
    });
  }
  rows.push({
    date: "2026-02-01", fromDate: "2026-02-01T00:00:00Z", toDate: "2026-02-01T23:59:59Z", isComplete: true,
    protocolRevenueInUsd: 7, holdersRevenueInUsd: 2,
    borrowInterestAccruedForProtocolInUsd: 7, loanOriginationFeesForProtocolInUsd: 0,
    borrowInterestAccruedForHoldersInUsd: 2, loanOriginationFeesForHoldersInUsd: 0
  });

  const months = aggregateDailyProtocolFeeAllocations(rows);

  assert.equal(months[0].protocolRevenueInUsd, 155);
  assert.equal(months[0].holdersRevenueInUsd, 93);
  assert.equal(months[0].borrowInterestAccruedForProtocolInUsd, 124);
  assert.equal(months[0].loanOriginationFeesForProtocolInUsd, 31);
  assert.equal(months[0].isComplete, true);
  assert.equal(months[1].protocolRevenueInUsd, 7);
  assert.equal(months[1].isComplete, false);
});

test("protocol revenue run rate resumes only after 90 complete days following a coverage gap", () => {
  const dates = [
    ...Array.from({ length: 89 }, (_, index) => new Date(Date.UTC(2026, 0, 1 + index)).toISOString().slice(0, 10)),
    ...Array.from({ length: 90 }, (_, index) => new Date(Date.UTC(2026, 3, 1 + index)).toISOString().slice(0, 10))
  ];
  const rows = dates.map((date) => ({
    date,
    periodStartDay: date,
    periodEndDay: date,
    protocolRevenueInUsd: 2,
    isComplete: true
  }));

  const series = buildProtocolRevenueRunRateSeries(rows);

  assert.deepEqual(series.map((row) => row.date), ["2026-06-29"]);
  assert.equal(series[0].trailing90DaysProtocolRevenueInUsd, 180);
  assert.equal(series[0].annualizedRunRateInUsd, 180 * (365.25 / 90));
});

test("buildLqTokenAnalysis computes LQ price, staking ratio, and DAO treasury metrics", () => {
  const lqMarket = { id: "LQ", displayName: "LQ", symbol: "LQ", price: 0.25, supply: 5000000, supplyInUsd: 1250000 };
  const bundle = {
    markets: [lqMarket],
    lqStats: { price: 0.25, staked: 4200000, totalSupply: 21000000, treasury: 1000000 },
    lqStatsHistory: [
      { date: "2026-01-01", lqPriceInUsd: 0.20, stakedLqAmount: 4000000, daoTreasuryLqAmount: 1000000 },
      { date: "2026-01-02", lqPriceInUsd: 0.25, stakedLqAmount: 4200000, daoTreasuryLqAmount: 1001000 }
    ],
    marketSeries: {
      LQ: [
        { date: "2026-01-01", supply: 500000, supplyInUsd: 100000 },
        { date: "2026-01-02", supply: 600000, supplyInUsd: 150000 }
      ]
    },
    protocolSeries: [
      { date: "2026-01-01" },
      { date: "2026-01-02" }
    ]
  };
  const revenue = {
    dailyAllocation: [
      { date: "2026-01-01", allocatedProtocolRevenueInUsd: 100 },
      { date: "2026-01-02", allocatedProtocolRevenueInUsd: 250 }
    ]
  };

  const analysis = buildLqTokenAnalysis(bundle, revenue);

  assert.equal(analysis.currentPriceInUsd, 0.25);
  assert.equal(analysis.currentStakedLq, 4200000);
  assert.equal(analysis.currentStakingRatio, 4200000 / 21000000);
  assert.equal(analysis.currentTotalStakedValueInUsd, 4200000 * 0.25);
  assert.equal(analysis.series.length, 2);
  assert.equal(analysis.series[0].lqPriceInUsd, 0.2);
  assert.equal(analysis.series[0].stakedLqAmount, 4000000);
  assert.equal(analysis.series[1].lqPriceInUsd, 0.25);
  assert.equal(analysis.series[1].stakedLqAmount, 4200000);
  assert.equal(analysis.currentDaoTreasuryLq, 1000000);
});

test("buildLqTokenAnalysis returns null lqPriceInUsd and stakedLqAmount for dates prior to authentic API observations", () => {
  const bundle = {
    markets: [{ id: "LQ", displayName: "LQ", symbol: "LQ", supply: 5000000, supplyInUsd: 1250000 }],
    lqStatsHistory: [
      { date: "2024-07-01", lqPriceInUsd: 0.25, stakedLqAmount: 3000000 }
    ],
    marketSeries: {
      LQ: [
        { date: "2024-07-01", supply: 5000000, supplyInUsd: 1250000 }
      ]
    },
    protocolSeries: [
      { date: "2023-05-01" },
      { date: "2024-07-01" }
    ]
  };

  const analysis = buildLqTokenAnalysis(bundle, { dailyAllocation: [] });

  assert.equal(analysis.series.length, 2);
  assert.equal(analysis.series[0].date, "2023-05-01");
  assert.equal(analysis.series[0].lqPriceInUsd, null);
  assert.equal(analysis.series[0].stakedLqAmount, null);
  assert.equal(analysis.series[1].date, "2024-07-01");
  assert.equal(analysis.series[1].lqPriceInUsd, 0.25);
  assert.equal(analysis.series[1].stakedLqAmount, 3000000);
});

test("buildPolAnalysisContext aggregates active POL positions with governance rules", () => {
  const activeLoans = [
    {
      id: "pol-djed",
      marketId: "DJED",
      publicKey: "7ac5878231522baf2972231d1a587e20a0d814c164fa7fea28ee459f",
      amount: 2000000,
      collateral: 800000,
      healthFactor: 39.28,
      APY: 0.30,
      collaterals: [{ id: "qpol", qTokenName: "qPOL", qTokenAmount: 3670000, amount: 800000, market: { id: "POL", displayName: "POL" } }]
    },
    {
      id: "pol-usdm",
      marketId: "USDM",
      publicKey: "7ac5878231522baf2972231d1a587e20a0d814c164fa7fea28ee459f",
      amount: 900000,
      collateral: 500000,
      healthFactor: 58.40,
      APY: 0.25,
      collaterals: [{ id: "qpol", qTokenName: "qPOL", qTokenAmount: 2500000, amount: 500000, market: { id: "POL", displayName: "POL" } }]
    },
    {
      id: "user-loan",
      marketId: "ADA",
      publicKey: "user-123",
      amount: 100000,
      collateral: 200000,
      healthFactor: 1.5,
      APY: 0.05,
      collaterals: [{ id: "qada", qTokenName: "qADA", qTokenAmount: 200000, amount: 200000, market: { id: "ADA", displayName: "ADA" } }]
    }
  ];

  const markets = [
    { id: "DJED", displayName: "DJED", borrow: 2000000, borrowAPY: 0.30 },
    { id: "USDM", displayName: "USDM", borrow: 900000, borrowAPY: 0.25 },
    { id: "ADA", displayName: "ADA", borrow: 100000, borrowAPY: 0.05 }
  ];

  const pol = buildPolAnalysisContext({ activeLoans, markets });

  assert.equal(pol.summary.loanCount, 2);
  assert.equal(pol.summary.totalDebtInUsd, 2900000);
  assert.equal(pol.summary.totalCollateralInUsd, 1300000);
  assert.equal(pol.summary.totalCollateralTokens, 6170000);
  assert.equal(pol.summary.totalProtocolBorrowInUsd, 3000000);
  assert.equal(pol.summary.protocolBorrowShare, 2900000 / 3000000);
  assert.equal(pol.positions.length, 2);
  assert.equal(pol.positions[0].marketId, "DJED");
  assert.equal(pol.positions[0].nominalLTV, 2000000 / 800000);
  assert.equal(pol.positions[0].nominalHealthFactor, 800000 / 2000000);
  assert.equal(pol.positions[0].canBeLiquidated, false);
  assert.equal(pol.positions[0].governanceProtection.collateralWeight, 100);
  assert.equal(pol.governanceRules.liquidationPenalty, 0);
});

test("loanHealthPressure and loanState market rows strictly exclude governance-protected POL loans", () => {
  const polLoan = {
    id: "pol-djed-loan",
    marketId: "DJED",
    publicKey: "7ac5878231522baf2972231d1a587e20a0d814c164fa7fea28ee459f",
    amount: 2000000,
    debtInUsd: 2000000,
    collateral: 800000,
    healthFactor: 39.28,
    collaterals: [{ id: "qpol", qTokenName: "qPOL", qTokenAmount: 3670000, amount: 800000, market: { id: "POL", displayName: "POL" } }]
  };

  const organicDjedLoan = {
    id: "organic-djed-1",
    marketId: "DJED",
    publicKey: "user-abc",
    amount: 1000,
    debtInUsd: 1000,
    collateral: 1100,
    healthFactor: 1.05, // HF <= 1.10 -> 100% weight
    collaterals: [{ id: "qada-1", qTokenName: "qADA", amount: 1100, market: { id: "ADA", displayName: "ADA" } }]
  };

  const bundle = buildAnalysisBundle({
    markets: [{ id: "DJED", displayName: "DJED", assetPrice: 1.0, borrow: 2001000, borrowInUsd: 2001000, supply: 5000000, supplyInUsd: 5000000 }],
    marketSeriesById: { "DJED": [history("2026-01-01", { marketId: "DJED", borrow: 2001000, borrowInUsd: 2001000 })] },
    dataRoot: "liqwid",
    startDate: "2026-01-01",
    endDate: "2026-01-01"
  });

  const analysis = buildCompleteAnalysis({
    bundle,
    allLoans: [polLoan, organicDjedLoan],
    activeLoans: [polLoan, organicDjedLoan],
    collateralLoans: [polLoan, organicDjedLoan],
    liquidatableLoans: [],
    monthlyLiquidations: [],
    dailyLiquidations: [],
    rates: []
  });

  const djedLoanRow = analysis.loanState.byMarket.find((m) => m.marketId === "DJED");
  assert.ok(djedLoanRow, "DJED loan row must exist");
  assert.equal(djedLoanRow.debtInUsd, 2001000);
  assert.equal(djedLoanRow.organicDebtInUsd, 1000);
  assert.equal(djedLoanRow.polDebtInUsd, 2000000);
  assert.equal(djedLoanRow.minHealthFactor, 1.05);
  // Loan health pressure: organic HF 1.05 gets 1.0 weight -> 1000 / 1000 = 1.0 (100%), excluding POL's 2M debt
  assert.equal(djedLoanRow.loanHealthPressure, 1.0);

  // In stress context currentMarketStress
  const djedStressRow = analysis.marketStress.currentMarketStress.find((m) => m.marketId === "DJED");
  assert.ok(djedStressRow, "DJED stress loan row must exist");
  assert.equal(djedStressRow.loanHealthPressure, 1.0);
});

test("buildCompleteAnalysis populates POL historical trajectory across all snapshot observations", () => {
  const polLoan = {
    id: "pol-djed",
    marketId: "DJED",
    publicKey: "7ac5878231522baf2972231d1a587e20a0d814c164fa7fea28ee459f",
    amount: 2000000,
    collateral: 800000,
    healthFactor: 39.28,
    APY: 0.30,
    collaterals: [{ id: "qpol", qTokenName: "qPOL", qTokenAmount: 3670000, amount: 800000, market: { id: "POL", displayName: "POL" } }]
  };

  const polHistoryRows = [
    {
      timestamp: "2026-07-16T15:49:00.420Z", scope: "protocol", marketId: "",
      totalDebtInUsd: 0, totalCollateralInUsd: 0, djedDebtInUsd: 0, usdmDebtInUsd: 0, usdcDebtInUsd: 0, iusdDebtInUsd: 0, loanCount: 0
    },
    {
      timestamp: "2026-08-25T15:41:36.303Z", scope: "protocol", marketId: "",
      totalDebtInUsd: 3022393, totalCollateralInUsd: 2981277, djedDebtInUsd: 2022574, usdmDebtInUsd: 929437, usdcDebtInUsd: 0, iusdDebtInUsd: 70381, loanCount: 3
    },
    {
      timestamp: "2026-08-26T07:53:55.334Z", scope: "protocol", marketId: "",
      totalDebtInUsd: 3189927, totalCollateralInUsd: 1506924, djedDebtInUsd: 2029470, usdmDebtInUsd: 929893, usdcDebtInUsd: 160039, iusdDebtInUsd: 70524, loanCount: 4
    }
  ];

  const market = { id: "DJED", displayName: "DJED", symbol: "DJED", supply: 3000000, borrow: 2029470, liquidity: 970530, borrowAPY: 0.30 };
  const djedHistory = [history("2026-08-26", { marketId: "DJED", marketDisplayName: "DJED", borrowInUsd: 2029470, supplyInUsd: 3000000 })];
  const bundle = buildAnalysisBundle({
    markets: [market],
    marketSeriesById: { DJED: djedHistory },
    dataRoot: "liqwid",
    startDate: "2026-08-26",
    endDate: "2026-08-26",
    apiTotals: { supplyInUsd: 3000000, borrowInUsd: 2029470, liquidityInUsd: 970530 }
  });

  const analysis = buildCompleteAnalysis({
    bundle,
    allLoans: [polLoan],
    activeLoans: [polLoan],
    collateralLoans: [polLoan],
    liquidatableLoans: [],
    monthlyLiquidations: [],
    dailyLiquidations: [],
    loanSnapshotHistory: {
      participation: [],
      health: [],
      pol: polHistoryRows,
      reconciliation: []
    }
  });

  assert.ok(analysis.pol, "POL context must exist");
  assert.equal(analysis.pol.history.length, 3, "POL history must retain all 3 historical observations");
  assert.equal(analysis.pol.history[0].date, "2026-07-16");
  assert.equal(analysis.pol.history[0].totalDebtInUsd, 0);
  assert.equal(analysis.pol.history[1].date, "2026-08-25");
  assert.equal(analysis.pol.history[1].totalDebtInUsd, 3022393);
  assert.equal(analysis.pol.history[2].date, "2026-08-26");
  assert.equal(analysis.pol.history[2].totalDebtInUsd, 3189927);
  assert.equal(analysis.pol.history[2].usdcDebtInUsd, 160039);
  assert.equal(analysis.loanSnapshotHistory.pol.length, 3, "loanSnapshotHistory.pol must be preserved on output");
});



