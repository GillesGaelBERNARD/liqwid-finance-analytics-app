import assert from "node:assert/strict";
import test from "node:test";

import {
  aggregateMonthlyChartRows,
  buildContributionChartData,
  buildCurrentContributionChartData,
  buildDrySpellChartData,
  buildFlowIntensityChartData,
  buildMarketStressChartData,
  buildTrailingCoverageWindows,
  contributionKeysByLatest,
  enrichChartTimeSeries,
  fillMonthlyChartGaps,
  summarizeDebtFlowReconciliation
} from "../src/browser/chartData.js";
import { normalizeMarketHistoryRows, withDerivedMarketMetrics } from "../src/shared/metrics.js";

function closeTo(actual, expected, tolerance = 1e-12) {
  assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} should be within ${tolerance} of ${expected}`);
}

test("flow intensity uses a 1.5-day EWMA and a same-unit 30-day average without mutating input", () => {
  const rows = [
    { date: "2026-01-01", debtRepaidInUsd: 0 },
    { date: "2026-01-02", debtRepaidInUsd: 100 },
    { date: "2026-01-03", debtRepaidInUsd: 0 }
  ];
  const untouched = structuredClone(rows);
  const alpha = 1 - 2 ** (-1 / 1.5);

  const intensity = buildFlowIntensityChartData(rows, "debtRepaidInUsd");

  assert.deepEqual(rows, untouched);
  assert.deepEqual(intensity.map((row) => row.date), rows.map((row) => row.date));
  closeTo(intensity[0].flowEwma, 0);
  closeTo(intensity[1].flowEwma, 100 * alpha);
  closeTo(intensity[2].flowEwma, 100 * alpha * (1 - alpha));
  closeTo(intensity[0].flowAverage, 0);
  closeTo(intensity[1].flowAverage, 50);
  closeTo(intensity[2].flowAverage, 100 / 3);
});

test("flow intensity inserts missing calendar days and breaks both smoothed series across the gap", () => {
  const intensity = buildFlowIntensityChartData([
    { date: "2026-01-01", liquidationProfitInUsd: 10 },
    { date: "2026-01-03", liquidationProfitInUsd: 20 }
  ], "liquidationProfitInUsd");

  assert.equal(intensity.length, 3);
  assert.deepEqual(intensity.map((row) => row.date), ["2026-01-01", "2026-01-02", "2026-01-03"]);
  assert.equal(intensity[1].liquidationProfitInUsd, null);
  assert.equal(intensity[1].flowEwma, null);
  assert.equal(intensity[1].flowAverage, null);
  assert.equal(intensity[2].flowEwma, 20);
  assert.equal(intensity[2].flowAverage, null);
});

test("dry-spell chart data counts consecutive quiet days for debt and interest and preserves gaps", () => {
  const rows = buildDrySpellChartData([
    { date: "2026-01-01", debtRepaidInUsd: 0, interestRepaidInUsd: 5 },
    { date: "2026-01-02", debtRepaidInUsd: 0, interestRepaidInUsd: 0 },
    { date: "2026-01-03", debtRepaidInUsd: 7, interestRepaidInUsd: 0 },
    { date: "2026-01-05", debtRepaidInUsd: 0, interestRepaidInUsd: 0 }
  ], [
    { field: "debtRepaidInUsd", key: "debtDrySpellDays" },
    { field: "interestRepaidInUsd", key: "interestDrySpellDays" }
  ]);

  assert.deepEqual(rows.map((row) => [row.date, row.debtDrySpellDays, row.interestDrySpellDays]), [
    ["2026-01-01", 1, 0],
    ["2026-01-02", 2, 1],
    ["2026-01-03", 0, 2],
    ["2026-01-04", null, null],
    ["2026-01-05", 1, 1]
  ]);
});

test("time-series enrichment produces rolling and cumulative calculations without mutating input", () => {
  const rows = [
    { date: "2026-01-03", borrowInUsd: 30, supplyInUsd: 100, liquidityInUsd: 70, debtAccruedInUsd: 10, debtRepaidInUsd: 5, interestAccruedInUsd: 10, interestRepaidInUsd: 10, utilizationPercentage: 0.3, borrowApr: 0.12, supplyApy: 0.06 },
    { date: "2026-01-01", borrowInUsd: 20, supplyInUsd: 100, liquidityInUsd: 80, debtAccruedInUsd: null, debtRepaidInUsd: 2, interestAccruedInUsd: 10, interestRepaidInUsd: 4, utilizationPercentage: 0.2, borrowApr: 0.10, supplyApy: 0.05 },
    { date: "2026-01-02", borrowInUsd: 25, supplyInUsd: 100, liquidityInUsd: 75, debtAccruedInUsd: 8, debtRepaidInUsd: 3, interestAccruedInUsd: 0, interestRepaidInUsd: 6, utilizationPercentage: 0.4, borrowApr: 0.14, supplyApy: 0.07 }
  ];
  const untouched = structuredClone(rows);

  const enriched = enrichChartTimeSeries(rows, { windows: [2] });

  assert.deepEqual(rows, untouched);
  assert.deepEqual(enriched.map((row) => row.date), ["2026-01-01", "2026-01-02", "2026-01-03"]);
  assert.equal(enriched[0].debtChange1d, null);
  assert.equal(enriched[1].debtChange1d, 5);
  assert.equal(enriched[2].cumulativeDebtRepaid, 10);
  assert.equal(enriched[2].cumulativeDebtAccrued, 18);
  assert.equal(enriched[1].debtAccrued2d, 8);
  assert.equal(enriched[2].debtCoverage2d, 8 / 18);
  assert.equal(enriched[2].debtGap2d, 10);
  assert.equal(enriched[1].dailyInterestGap, -6);
  assert.equal(enriched[1].dailyInterestCoverage, null);
  assert.equal(enriched[2].cumulativeInterestAccrued, 20);
  assert.equal(enriched[2].cumulativeInterestRepaid, 20);
  assert.equal(enriched[2].cumulativeInterestGap, 0);
  assert.equal(enriched[1].debtRepaid2d, 5);
  assert.equal(enriched[1].interestAccrued2d, 10);
  assert.equal(enriched[1].interestRepaid2d, 10);
  assert.equal(enriched[1].interestCoverage2d, 1);
  assert.equal(enriched[1].interestGap2d, 0);
  closeTo(enriched[1].utilization2d, 0.3);
  closeTo(enriched[1].borrowApr2d, 0.12);
  closeTo(enriched[1].supplyApy2d, 0.06);
  assert.equal(enriched[0].liquidityRatio, 0.8);
  assert.equal(enriched[0].borrowToLiquidity, 0.25);
});

test("chart gaps expose native units and current USD values without price-timing distortion", () => {
  const derived = withDerivedMarketMetrics(normalizeMarketHistoryRows([
    { timestamp: "2026-01-01T00:00:00Z", borrow: 10, borrowInUsd: 100 },
    { timestamp: "2026-01-02T00:00:00Z", borrow: 20, borrowInUsd: 200, interestAccrued: 2, interestAccruedInUsd: 20 },
    { timestamp: "2026-01-03T00:00:00Z", borrow: 10, borrowInUsd: 50, debtRepaid: 10, debtRepaidInUsd: 50, interestRepaid: 2, interestRepaidInUsd: 10 }
  ], { id: "ASSET-A" }));

  const enriched = enrichChartTimeSeries(derived, { windows: [2] });

  assert.equal(enriched[2].dailyDebtGapAsset, -10);
  assert.equal(enriched[2].dailyDebtGap, -50);
  assert.equal(enriched[2].debtGapAsset2d, 0);
  assert.equal(enriched[2].debtGap2d, 0);
  assert.equal(enriched[2].cumulativeDebtGapAsset, 0);
  assert.equal(enriched[2].cumulativeDebtGap, 0);
  assert.equal(enriched[2].dailyInterestGapAsset, -2);
  assert.equal(enriched[2].dailyInterestGap, -10);
  assert.equal(enriched[2].interestGapAsset2d, 0);
  assert.equal(enriched[2].interestGap2d, 0);
  assert.equal(enriched[2].cumulativeInterestGapAsset, 0);
  assert.equal(enriched[2].cumulativeInterestGap, 0);
  assert.equal(enriched[2].debtAccruedAsset2d, 10);
  assert.equal(enriched[2].debtRepaidAsset2d, 10);
  assert.equal(enriched[2].debtAccrued2d, 50);
  assert.equal(enriched[2].debtRepaid2d, 50);
  assert.equal(enriched[2].debtCoverage2d, 1);
  assert.equal(enriched[2].interestAccruedAsset2d, 2);
  assert.equal(enriched[2].interestRepaidAsset2d, 2);
  assert.equal(enriched[2].interestAccrued2d, 10);
  assert.equal(enriched[2].interestRepaid2d, 10);
  assert.equal(enriched[2].interestCoverage2d, 1);
});

test("market cumulative gap charts enforce each observation's price", () => {
  const enriched = enrichChartTimeSeries([
    {
      date: "2026-01-01",
      assetPriceInUsd: 10,
      cumulativeDebtFlowGap: 3,
      cumulativeDebtFlowGapInUsd: 999,
      cumulativeInterestGap: 2,
      cumulativeInterestGapInUsd: 888
    },
    {
      date: "2026-01-02",
      assetPriceInUsd: 4,
      cumulativeDebtFlowGap: 3,
      cumulativeDebtFlowGapInUsd: 999,
      cumulativeInterestGap: 2,
      cumulativeInterestGapInUsd: 888
    }
  ]);

  assert.equal(enriched[0].cumulativeDebtGap, 30);
  assert.equal(enriched[1].cumulativeDebtGap, 12);
  assert.equal(enriched[0].cumulativeInterestGap, 20);
  assert.equal(enriched[1].cumulativeInterestGap, 8);
});

test("trailing coverage exposes native flows first and current-price USD values second", () => {
  const derived = withDerivedMarketMetrics(normalizeMarketHistoryRows([
    { timestamp: "2026-01-01T00:00:00Z", borrow: 10, borrowInUsd: 100 },
    { timestamp: "2026-01-02T00:00:00Z", borrow: 20, borrowInUsd: 200, interestAccrued: 2, interestAccruedInUsd: 20 },
    { timestamp: "2026-01-03T00:00:00Z", borrow: 10, borrowInUsd: 50, debtRepaid: 10, debtRepaidInUsd: 50, interestRepaid: 2, interestRepaidInUsd: 10 }
  ], { id: "ASSET-A" }));

  const coverage = buildTrailingCoverageWindows(derived, { windows: [7] })[0];

  assert.equal(coverage.debtAccrued, 10);
  assert.equal(coverage.debtRepaid, 10);
  assert.equal(coverage.debtAccruedInUsd, 50);
  assert.equal(coverage.debtRepaidInUsd, 50);
  assert.equal(coverage.debtCoverageRatio, 1);
  assert.equal(coverage.interestAccrued, 2);
  assert.equal(coverage.interestRepaid, 2);
  assert.equal(coverage.interestAccruedInUsd, 10);
  assert.equal(coverage.interestRepaidInUsd, 10);
  assert.equal(coverage.coverageRatio, 1);
  assert.equal(coverage.assetPriceInUsd, 5);
  assert.equal(coverage.valuationMode, "market-current-price");
});

test("trailing coverage windows anchor to the latest market day and disclose observed calendar rows", () => {
  const rows = [
    { date: "2026-01-12", debtAccruedInUsd: 20, debtRepaidInUsd: 5, interestAccruedInUsd: 10, interestRepaidInUsd: 2 },
    { date: "2026-03-20", debtAccruedInUsd: 30, debtRepaidInUsd: 15, interestAccruedInUsd: 10, interestRepaidInUsd: 4 },
    { date: "2026-04-04", debtAccruedInUsd: 40, debtRepaidInUsd: 20, interestAccruedInUsd: 20, interestRepaidInUsd: 10 },
    { date: "2026-04-10", debtAccruedInUsd: 60, debtRepaidInUsd: 30, interestAccruedInUsd: 20, interestRepaidInUsd: 30 }
  ];
  const untouched = structuredClone(rows);

  const coverage = buildTrailingCoverageWindows(rows);

  assert.deepEqual(rows, untouched);
  assert.deepEqual(coverage.map((row) => row.windowDays), [7, 30, 90]);
  assert.deepEqual(coverage.map((row) => row.observedDays), [2, 3, 4]);
  assert.deepEqual(coverage.map((row) => row.debtCoverageRatio), [0.5, 0.5, 70 / 150]);
  assert.deepEqual(coverage.map((row) => row.coverageRatio), [1, 44 / 50, 46 / 60]);
});

test("debt-flow reconciliation separates the cumulative flow gap from outstanding borrow", () => {
  const rows = [
    {
      date: "2026-01-01",
      borrowInUsd: 100,
      debtAccruedInUsd: null,
      debtRepaidInUsd: 10,
      interestAccruedInUsd: 4,
      interestRepaidInUsd: 1
    },
    {
      date: "2026-01-02",
      borrowInUsd: 80,
      debtAccruedInUsd: 0,
      debtRepaidInUsd: 5,
      interestAccruedInUsd: 5,
      interestRepaidInUsd: 2
    },
    {
      date: "2026-01-03",
      borrowInUsd: 110,
      debtAccruedInUsd: 50,
      debtRepaidInUsd: 20,
      interestAccruedInUsd: 6,
      interestRepaidInUsd: 3
    }
  ];

  assert.deepEqual(summarizeDebtFlowReconciliation(rows), {
    fromDate: "2026-01-01",
    toDate: "2026-01-03",
    openingBorrowInUsd: 100,
    currentBorrowInUsd: 110,
    cumulativeDebtAccruedInUsd: 50,
    cumulativeDebtRepaidInUsd: 35,
    cumulativeDebtFlowGapInUsd: 15,
    observedBorrowChangeInUsd: 10,
    flowVsBalanceResidualInUsd: 5,
    cumulativeInterestAccruedInUsd: 15,
    cumulativeInterestRepaidInUsd: 6,
    cumulativeInterestFlowGapInUsd: 9
  });
});

test("monthly chart rows aggregate only directly reported market fee activity", () => {
  const rows = [
    { date: "2026-01-02", interestAccruedInUsd: 10, interestRepaidInUsd: 4, loanOriginationFeesInUsd: 2, loanOriginationFeesMinAdaInUsd: 1 },
    { date: "2026-01-20", interestAccruedInUsd: 20, interestRepaidInUsd: 5, loanOriginationFeesInUsd: 3, loanOriginationFeesMinAdaInUsd: 0 },
    { date: "2026-02-01", interestAccruedInUsd: 5, interestRepaidInUsd: 1, loanOriginationFeesInUsd: 0, loanOriginationFeesMinAdaInUsd: 2 }
  ];
  const untouched = structuredClone(rows);

  const monthly = aggregateMonthlyChartRows(rows);

  assert.deepEqual(rows, untouched);
  assert.deepEqual(monthly, [
    {
      date: "2026-01-01",
      observations: 2,
      interestRepaidInUsd: 9,
      observableOriginationFeeFlowInUsd: 6,
      grossRealizedRevenueProxyInUsd: 15
    },
    {
      date: "2026-02-01",
      observations: 1,
      interestRepaidInUsd: 1,
      observableOriginationFeeFlowInUsd: 2,
      grossRealizedRevenueProxyInUsd: 3
    }
  ]);
  assert.equal("estimatedProtocolRevenueInUsd" in monthly[0], false);
  assert.equal("grossAccruedRevenueProxyInUsd" in monthly[0], false);
});

test("monthly saved rows preserve missing months as null gaps", () => {
  const rows = fillMonthlyChartGaps([
    { date: "2026-04-01", value: 10, isComplete: true },
    { date: "2026-06-01", value: 20, isComplete: true },
    { date: "2026-07-01", value: 3, isComplete: false }
  ], ["value"], { startDate: "2026-03-01", endDate: "2026-07-31" });

  assert.deepEqual(rows, [
    { date: "2026-03-01", value: null, isMissing: true },
    { date: "2026-04-01", value: 10, isComplete: true },
    { date: "2026-05-01", value: null, isMissing: true },
    { date: "2026-06-01", value: 20, isComplete: true },
    { date: "2026-07-01", value: 3, isComplete: false }
  ]);
});

test("contribution data excludes POL and rolls top markets plus Other into shares that sum to one", () => {
  const marketSeries = {
    A: [
      { date: "2026-01-01", flow: 10 },
      { date: "2026-01-02", flow: 0 },
      { date: "2026-01-03", flow: 10 }
    ],
    B: [
      { date: "2026-01-01", flow: 0 },
      { date: "2026-01-02", flow: 10 },
      { date: "2026-01-03", flow: 0 }
    ],
    C: [
      { date: "2026-01-01", flow: 1 },
      { date: "2026-01-02", flow: 1 },
      { date: "2026-01-03", flow: 1 }
    ],
    POL: [
      { date: "2026-01-01", flow: 1000 },
      { date: "2026-01-02", flow: 1000 },
      { date: "2026-01-03", flow: 1000 }
    ]
  };

  const rows = buildContributionChartData(marketSeries, "flow", { window: 2, topN: 1 });

  assert.deepEqual(rows.map((row) => Object.keys(row)), [
    ["date", "A", "Other"],
    ["date", "A", "Other"],
    ["date", "A", "Other"]
  ]);
  closeTo(rows[0].A, 10 / 11);
  closeTo(rows[0].Other, 1 / 11);
  for (const row of rows) closeTo(row.A + row.Other, 1);
});

test("contribution timelines select and order markets by the latest rolling values", () => {
  const dates = ["2026-01-01", "2026-01-02", "2026-01-03", "2026-01-04"];
  const rows = buildContributionChartData({
    Historical: dates.map((date, index) => ({ date, flow: index === 0 ? 1000 : 0 })),
    Current: dates.map((date, index) => ({ date, flow: index === 3 ? 100 : 0 })),
    Second: dates.map((date, index) => ({ date, flow: index === 3 ? 50 : 0 }))
  }, "flow", { window: 1, topN: 2 });

  assert.deepEqual(Object.keys(rows[0]), ["date", "Current", "Second", "Other"]);
  assert.deepEqual(contributionKeysByLatest(rows), ["Current", "Second", "Other"]);
  closeTo(rows.at(-1).Current, 2 / 3);
  closeTo(rows.at(-1).Second, 1 / 3);
  assert.equal(rows.at(-1).Other, 0);

  assert.deepEqual(contributionKeysByLatest([
    { date: "2026-01-01", A: 0.9, B: 0.1, Other: 0 },
    { date: "2026-01-02", A: 0.2, B: 0.8, Other: 0 }
  ]), ["B", "A", "Other"]);
});

test("positive-only contribution data clips negative daily gaps before rolling", () => {
  const rows = buildContributionChartData({
    A: [{ date: "2026-01-01", gap: -5 }],
    B: [{ date: "2026-01-01", gap: 2 }]
  }, "gap", { positiveOnly: true, topN: 2 });

  assert.equal(rows[0].A, 0);
  assert.equal(rows[0].B, 1);
});

test("current contribution bars combine latest debt share with trailing flow and positive-gap shares", () => {
  const marketSeries = {
    A: [
      { date: "2026-01-01", borrowInUsd: 10, debtAccruedInUsd: null, debtRepaidInUsd: 0, interestAccruedInUsd: 2, interestRepaidInUsd: 1 },
      { date: "2026-01-02", borrowInUsd: 20, debtAccruedInUsd: 15, debtRepaidInUsd: 10, interestAccruedInUsd: 8, interestRepaidInUsd: 4 }
    ],
    B: [
      { date: "2026-01-01", borrowInUsd: 20, debtAccruedInUsd: null, debtRepaidInUsd: 10, interestAccruedInUsd: 10, interestRepaidInUsd: 4 },
      { date: "2026-01-02", borrowInUsd: 80, debtAccruedInUsd: 5, debtRepaidInUsd: 10, interestAccruedInUsd: 20, interestRepaidInUsd: 16 }
    ],
    POL: [
      { date: "2026-01-02", borrowInUsd: 900, debtAccruedInUsd: 900, debtRepaidInUsd: 900, interestAccruedInUsd: 900, interestRepaidInUsd: 900 }
    ]
  };

  const rows = buildCurrentContributionChartData(marketSeries);

  assert.deepEqual(rows.map((row) => row.metric), [
    "Interest accrued \u00b7 trailing 30d",
    "Interest repaid \u00b7 trailing 30d",
    "Positive interest gap \u00b7 trailing 30d",
    "Outstanding debt \u00b7 current",
    "Debt repaid \u00b7 trailing 30d",
    "Positive debt gap \u00b7 trailing 30d"
  ]);
  assert.equal(rows[3].A, 0.2, "debt uses the latest stock instead of a rolling sum");
  assert.equal(rows[3].B, 0.8);
  assert.equal(rows[5].A, 1, "negative debt gaps are clipped before contribution shares");
  assert.equal(rows[5].B, 0);
  assert.ok(rows.every((row) => Math.abs(row.A + row.B - 1) < 1e-12));
  assert.ok(rows.every((row) => !("POL" in row)));
});

test("market stress data applies the documented coefficients and returns protocol, current, and contribution rows", () => {
  const dates = Array.from({ length: 31 }, (_, index) => `2026-01-${String(index + 1).padStart(2, "0")}`);
  const marketSeries = {
    A: dates.map((date, index) => ({
      date,
      marketDisplayName: "Market A",
      borrowInUsd: index === 30 ? 20 : 10,
      liquidityInUsd: 2,
      utilizationPercentage: 0.9,
      interestAccruedInUsd: 1,
      interestRepaidInUsd: 0
    })),
    B: dates.map((date) => ({
      date,
      marketDisplayName: "Market B",
      borrowInUsd: 10,
      liquidityInUsd: 90,
      utilizationPercentage: 0.1,
      interestAccruedInUsd: 1,
      interestRepaidInUsd: 1
    })),
    POL: dates.map((date) => ({ date, borrowInUsd: 1000, liquidityInUsd: 1, utilizationPercentage: 1 }))
  };
  const untouched = structuredClone(marketSeries);

  const result = buildMarketStressChartData(marketSeries, { topN: 1 });

  assert.deepEqual(marketSeries, untouched);
  assert.equal(result.protocolRows.length, 31);
  assert.equal(result.currentRows.length, 2);
  assert.deepEqual(result.currentRows.map((row) => row.marketId), ["A", "B"]);
  const currentA = result.currentRows[0];
  const expectedLinear = -2.4 + 2.1 * (0.9 / 1.1) + 1.25 + 1.15 + 0.85;
  const expectedScore = 1 / (1 + Math.exp(-expectedLinear));
  closeTo(currentA.currentBorrowShare, 2 / 3);
  closeTo(currentA.utilizationStress, 0.9 / 1.1);
  closeTo(currentA.liquidityStress, 1);
  closeTo(currentA.interestCoverageStress, 1);
  closeTo(currentA.borrowGrowthStress, 1);
  closeTo(currentA.currentMarketStressScore, expectedScore);

  const currentB = result.currentRows[1];
  const expectedProtocolStress = Math.min(1,
    (2 / 3) * expectedScore + (1 / 3) * currentB.currentMarketStressScore
  );
  closeTo(result.protocolRows.at(-1).protocolBorrowInUsd, 30);
  closeTo(result.protocolRows.at(-1).protocolStressIndex, expectedProtocolStress);
  assert.deepEqual(Object.keys(result.contributionRows.at(-1)), ["date", "A", "Other"]);
  closeTo(result.contributionRows.at(-1).A + result.contributionRows.at(-1).Other, 1);
});

test("rolled stress contribution rows renormalize after markets enter at different dates", () => {
  const dates = Array.from({ length: 6 }, (_, index) => `2026-02-0${index + 1}`);
  const marketSeries = {
    A: dates.map(date => ({ date, borrowInUsd: 10, liquidityInUsd: 10, utilizationPercentage: 0.5, interestAccruedInUsd: 1, interestRepaidInUsd: 1 })),
    B: dates.slice(2).map(date => ({ date, borrowInUsd: 10, liquidityInUsd: 10, utilizationPercentage: 0.5, interestAccruedInUsd: 1, interestRepaidInUsd: 1 }))
  };

  const { contributionRows } = buildMarketStressChartData(marketSeries, { topN: 2 });

  for (const row of contributionRows) {
    closeTo(Object.entries(row).filter(([key]) => key !== "date").reduce((sum, [, value]) => sum + value, 0), 1);
  }
});

test("stress contribution timelines choose top markets from the latest rolling situation", () => {
  const dates = Array.from({ length: 60 }, (_, index) => {
    const date = new Date(Date.UTC(2026, 0, index + 1));
    return date.toISOString().slice(0, 10);
  });
  const marketRows = (active) => dates.map((date, index) => ({
    date,
    borrowInUsd: active(index) ? 100 : 0,
    liquidityInUsd: active(index) ? 10 : 100,
    utilizationPercentage: active(index) ? 0.9 : 0,
    interestAccruedInUsd: 1,
    interestRepaidInUsd: active(index) ? 0 : 1
  }));

  const { contributionRows } = buildMarketStressChartData({
    Historical: marketRows(index => index < 40),
    Current: marketRows(index => index >= 40)
  }, { topN: 1 });

  assert.deepEqual(Object.keys(contributionRows.at(-1)), ["date", "Current", "Other"]);
  assert.ok(contributionRows.at(-1).Current > contributionRows.at(-1).Other);
});
