import assert from "node:assert/strict";
import test from "node:test";

import {
  aggregateProtocolSeries,
  computeDrySpells,
  firstActiveDate,
  normalizedHhi,
  normalizeMarketHistoryRows,
  summarizeMarket,
  withDerivedMarketMetrics
} from "../src/shared/metrics.js";
import { filterRowsByDate } from "../src/shared/dates.js";

const market = { id: "DJED", displayName: "DJED", symbol: "DJED" };

test("market history rows normalize dates, numbers, market id, and utilization scale", () => {
  const rows = normalizeMarketHistoryRows(
    [
      {
        timestamp: "2026-01-02T00:00:00.000Z",
        supplyInUsd: "100",
        borrowInUsd: "25",
        liquidityInUsd: "75",
        utilizationPercentage: "25"
      }
    ],
    market
  );

  assert.deepEqual(rows[0], {
    marketId: "DJED",
    marketDisplayName: "DJED",
    timestamp: "2026-01-02T00:00:00.000Z",
    date: "2026-01-02",
    supply: 0,
    supplyInUsd: 100,
    borrow: 0,
    borrowInUsd: 25,
    liquidity: 0,
    liquidityInUsd: 75,
    debtRepaid: 0,
    debtRepaidInUsd: 0,
    interestAccrued: 0,
    interestAccruedInUsd: 0,
    interestRepaid: 0,
    interestRepaidInUsd: 0,
    borrowApr: 0,
    supplyApy: 0,
    utilizationPercentage: 0.25,
    loanOriginationFees: 0,
    loanOriginationFeesInUsd: 0,
    loanOriginationFeesMinAda: 0,
    loanOriginationFeesMinAdaInUsd: 0
  });
});

test("first active date ignores fully empty history rows", () => {
  const rows = normalizeMarketHistoryRows(
    [
      { timestamp: "2026-01-01T00:00:00.000Z" },
      { timestamp: "2026-01-02T00:00:00.000Z", supplyInUsd: 0, borrowInUsd: 0 },
      { timestamp: "2026-01-03T00:00:00.000Z", supplyInUsd: 10 }
    ],
    market
  );

  assert.equal(firstActiveDate(rows), "2026-01-03");
});

test("interest gap and coverage handle positive and zero accrual days", () => {
  const derived = withDerivedMarketMetrics(
    normalizeMarketHistoryRows(
      [
        {
          timestamp: "2026-01-01T00:00:00.000Z",
          interestAccruedInUsd: 10,
          interestRepaidInUsd: 4
        },
        {
          timestamp: "2026-01-02T00:00:00.000Z",
          interestAccruedInUsd: 0,
          interestRepaidInUsd: 2
        }
      ],
      market
    )
  );

  assert.equal(derived[0].interestGapInUsd, 6);
  assert.equal(derived[0].cumulativeInterestGapInUsd, 6);
  assert.equal(derived[0].interestCoverageRatio, 0.4);
  assert.equal(derived[1].interestGapInUsd, -2);
  assert.equal(derived[1].cumulativeInterestGapInUsd, 4);
  assert.equal(derived[1].interestCoverageRatio, null);
});

test("dry spells count consecutive no-repayment rows", () => {
  const rows = normalizeMarketHistoryRows(
    [
      { timestamp: "2026-01-01T00:00:00.000Z", debtRepaidInUsd: 0 },
      { timestamp: "2026-01-02T00:00:00.000Z", debtRepaidInUsd: 0 },
      { timestamp: "2026-01-03T00:00:00.000Z", debtRepaidInUsd: 5 },
      { timestamp: "2026-01-04T00:00:00.000Z", debtRepaidInUsd: 0 }
    ],
    market
  );

  assert.deepEqual(computeDrySpells(rows), [
    { startDate: "2026-01-01", endDate: "2026-01-02", length: 2 },
    { startDate: "2026-01-04", endDate: "2026-01-04", length: 1 }
  ]);
});

test("debt accrued is inferred in native units before conversion to USD", () => {
  const rows = withDerivedMarketMetrics(normalizeMarketHistoryRows([
    { timestamp: "2026-01-01T00:00:00Z", borrow: 10, borrowInUsd: 20, debtRepaid: 0, debtRepaidInUsd: 0 },
    { timestamp: "2026-01-02T00:00:00Z", borrow: 13, borrowInUsd: 39, debtRepaid: 2, debtRepaidInUsd: 6 },
    { timestamp: "2026-01-03T00:00:00Z", borrow: 11, borrowInUsd: 44, debtRepaid: 2, debtRepaidInUsd: 8 }
  ], { id: "TEST" }));

  assert.equal(rows[0].debtAccruedInUsd, null);
  assert.equal(rows[1].debtAccrued, 5);
  assert.equal(rows[1].debtAccruedInUsd, 15);
  assert.equal(rows[2].debtAccrued, 0);
  assert.equal(rows[2].debtAccruedInUsd, 0);
  assert.equal(rows[1].debtAccruedSource, "native-balance-identity");
});

test("unclassified borrow reductions complete the native debt balance identity", () => {
  const rows = withDerivedMarketMetrics(normalizeMarketHistoryRows([
    { timestamp: "2026-01-01T00:00:00Z", borrow: 100, borrowInUsd: 100 },
    {
      timestamp: "2026-01-02T00:00:00Z",
      borrow: 60,
      borrowInUsd: 60,
      debtRepaid: 10,
      debtRepaidInUsd: 10
    }
  ], { id: "ASSET-A" }));

  const previous = rows[0];
  const current = rows[1];
  assert.equal(current.debtAccrued, 0);
  assert.equal(current.unclassifiedBorrowReduction, 30);
  assert.equal(current.unclassifiedBorrowReductionInUsd, 30);
  assert.equal(current.cumulativeUnclassifiedBorrowReduction, 30);
  assert.equal(current.cumulativeUnclassifiedBorrowReductionInUsd, 30);
  assert.equal(
    current.borrow - previous.borrow,
    current.debtAccrued - current.debtRepaid - current.unclassifiedBorrowReduction
  );
});

test("cumulative native debt and interest gaps are valued at every observation's price", () => {
  const rows = withDerivedMarketMetrics(normalizeMarketHistoryRows([
    {
      timestamp: "2026-01-01T00:00:00Z",
      borrow: 10,
      borrowInUsd: 100
    },
    {
      timestamp: "2026-01-02T00:00:00Z",
      borrow: 20,
      borrowInUsd: 200,
      interestAccrued: 2,
      interestAccruedInUsd: 20
    },
    {
      timestamp: "2026-01-03T00:00:00Z",
      borrow: 20,
      borrowInUsd: 100
    },
    {
      timestamp: "2026-01-04T00:00:00Z",
      borrow: 10,
      borrowInUsd: 50,
      debtRepaid: 10,
      debtRepaidInUsd: 50,
      interestRepaid: 2,
      interestRepaidInUsd: 10
    }
  ], { id: "ASSET-A" }));

  assert.equal(rows[1].assetPriceInUsd, 10);
  assert.equal(rows[1].debtFlowGap, 10);
  assert.equal(rows[1].cumulativeDebtFlowGapInUsd, 100);
  assert.equal(rows[1].interestGap, 2);
  assert.equal(rows[1].cumulativeInterestGapInUsd, 20);

  assert.equal(rows[2].assetPriceInUsd, 5);
  assert.equal(rows[2].debtFlowGap, 0);
  assert.equal(rows[2].cumulativeDebtFlowGap, 10);
  assert.equal(rows[2].cumulativeDebtFlowGapInUsd, 50);
  assert.equal(rows[2].interestGap, 0);
  assert.equal(rows[2].cumulativeInterestGap, 2);
  assert.equal(rows[2].cumulativeInterestGapInUsd, 10);

  assert.equal(rows[3].debtFlowGap, -10);
  assert.equal(rows[3].cumulativeDebtFlowGap, 0);
  assert.equal(rows[3].cumulativeDebtFlowGapInUsd, 0);
  assert.equal(rows[3].interestGap, -2);
  assert.equal(rows[3].cumulativeInterestGap, 0);
  assert.equal(rows[3].cumulativeInterestGapInUsd, 0);
});

test("rolling debt and interest coverage use native flows and value both sides at the current price", () => {
  const rows = withDerivedMarketMetrics(normalizeMarketHistoryRows([
    {
      timestamp: "2026-01-01T00:00:00Z",
      borrow: 10,
      borrowInUsd: 100
    },
    {
      timestamp: "2026-01-02T00:00:00Z",
      borrow: 20,
      borrowInUsd: 200,
      interestAccrued: 2,
      interestAccruedInUsd: 20
    },
    {
      timestamp: "2026-01-03T00:00:00Z",
      borrow: 10,
      borrowInUsd: 50,
      debtRepaid: 10,
      debtRepaidInUsd: 50,
      interestRepaid: 2,
      interestRepaidInUsd: 10
    }
  ], { id: "ASSET-A" }));

  const current = rows.at(-1);
  assert.equal(current.debtAccrued7d, 10);
  assert.equal(current.debtRepaid7d, 10);
  assert.equal(current.debtAccrued7dInUsd, 50);
  assert.equal(current.debtRepaid7dInUsd, 50);
  assert.equal(current.debtCoverage7d, 1);
  assert.equal(current.interestAccrued7d, 2);
  assert.equal(current.interestRepaid7d, 2);
  assert.equal(current.interestAccrued7dInUsd, 10);
  assert.equal(current.interestRepaid7dInUsd, 10);
  assert.equal(current.interestCoverage7d, 1);
});

test("protocol gaps sum current-valued market gaps instead of historical USD differences", () => {
  const marketA = normalizeMarketHistoryRows([
    { timestamp: "2026-01-01T00:00:00Z", borrow: 10, borrowInUsd: 100 },
    { timestamp: "2026-01-02T00:00:00Z", borrow: 20, borrowInUsd: 200, interestAccrued: 2, interestAccruedInUsd: 20 },
    { timestamp: "2026-01-03T00:00:00Z", borrow: 10, borrowInUsd: 50, debtRepaid: 10, debtRepaidInUsd: 50, interestRepaid: 2, interestRepaidInUsd: 10 }
  ], { id: "A" });
  const marketB = normalizeMarketHistoryRows([
    { timestamp: "2026-01-01T00:00:00Z", borrow: 10, borrowInUsd: 20 },
    { timestamp: "2026-01-02T00:00:00Z", borrow: 15, borrowInUsd: 30, interestAccrued: 2, interestAccruedInUsd: 4 },
    { timestamp: "2026-01-03T00:00:00Z", borrow: 15, borrowInUsd: 45 }
  ], { id: "B" });

  const protocol = aggregateProtocolSeries({ A: marketA, B: marketB });

  assert.equal(protocol[2].dailyDebtFlowGapInUsd, -50);
  assert.equal(protocol[2].cumulativeDebtFlowGapInUsd, 15);
  assert.equal(protocol[2].dailyInterestGapInUsd, -10);
  assert.equal(protocol[2].cumulativeInterestGapInUsd, 6);
  assert.equal(protocol[2].gapAggregation, "market-usd-sum");
  assert.equal(protocol[2].debtAccrued7dInUsd, 65);
  assert.equal(protocol[2].debtRepaid7dInUsd, 50);
  assert.equal(protocol[2].debtCoverage7d, 50 / 65);
  assert.equal(protocol[2].interestAccrued7dInUsd, 16);
  assert.equal(protocol[2].interestRepaid7dInUsd, 10);
  assert.equal(protocol[2].interestCoverage7d, 10 / 16);
});

test("protocol unclassified borrow reductions sum current-valued market amounts", () => {
  const marketA = normalizeMarketHistoryRows([
    { timestamp: "2026-01-01T00:00:00Z", borrow: 100, borrowInUsd: 100 },
    {
      timestamp: "2026-01-02T00:00:00Z",
      borrow: 60,
      borrowInUsd: 120,
      debtRepaid: 10,
      debtRepaidInUsd: 20
    }
  ], { id: "A" });
  const marketB = normalizeMarketHistoryRows([
    { timestamp: "2026-01-01T00:00:00Z", borrow: 50, borrowInUsd: 500 },
    {
      timestamp: "2026-01-02T00:00:00Z",
      borrow: 40,
      borrowInUsd: 400,
      debtRepaid: 5,
      debtRepaidInUsd: 50
    }
  ], { id: "B" });

  const protocol = aggregateProtocolSeries({ A: marketA, B: marketB });

  assert.equal(protocol[1].unclassifiedBorrowReductionInUsd, 110);
  assert.equal(protocol[1].cumulativeUnclassifiedBorrowReductionInUsd, 110);
  assert.equal(protocol[1].unclassifiedBorrowReduction, null);
  assert.equal(protocol[1].gapAggregation, "market-usd-sum");
});

test("repayment burst score compares active repayment against prior active median", () => {
  const rows = withDerivedMarketMetrics(
    normalizeMarketHistoryRows(
      [
        { timestamp: "2026-01-01T00:00:00.000Z", debtRepaidInUsd: 10 },
        { timestamp: "2026-01-02T00:00:00.000Z", debtRepaidInUsd: 20 },
        { timestamp: "2026-01-03T00:00:00.000Z", debtRepaidInUsd: 90 }
      ],
      market
    )
  );

  assert.equal(rows[0].repaymentBurstScore, null);
  assert.equal(rows[1].repaymentBurstScore, 2);
  assert.equal(rows[2].repaymentBurstScore, 6);
});

test("date filtering is inclusive", () => {
  const rows = normalizeMarketHistoryRows(
    [
      { timestamp: "2026-01-01T00:00:00.000Z" },
      { timestamp: "2026-01-02T00:00:00.000Z" },
      { timestamp: "2026-01-03T00:00:00.000Z" }
    ],
    market
  );

  assert.deepEqual(filterRowsByDate(rows, "2026-01-02", "2026-01-03").map((row) => row.date), [
    "2026-01-02",
    "2026-01-03"
  ]);
});

test("protocol aggregate sums market-level amounts by date", () => {
  const a = normalizeMarketHistoryRows(
    [{ timestamp: "2026-01-01T00:00:00.000Z", supplyInUsd: 100, borrowInUsd: 30, liquidityInUsd: 70 }],
    { id: "A" }
  );
  const b = normalizeMarketHistoryRows(
    [{ timestamp: "2026-01-01T00:00:00.000Z", supplyInUsd: 50, borrowInUsd: 20, liquidityInUsd: 30 }],
    { id: "B" }
  );

  const aggregate = aggregateProtocolSeries({ A: a, B: b });
  assert.equal(aggregate[0].supplyInUsd, 150);
  assert.equal(aggregate[0].borrowInUsd, 50);
  assert.equal(aggregate[0].liquidityInUsd, 100);
  assert.equal(aggregate[0].utilizationPercentage, 50 / 150);
});

test("market summary calculates duration-normalized repayment concentration and high-utilization days", () => {
  const rows = normalizeMarketHistoryRows(
    [
      { timestamp: "2026-01-01T00:00:00.000Z", supplyInUsd: 100, borrowInUsd: 90, liquidityInUsd: 10, utilizationPercentage: 0.9, debtRepaidInUsd: 100, interestAccruedInUsd: 10, interestRepaidInUsd: 5 },
      { timestamp: "2026-01-02T00:00:00.000Z", supplyInUsd: 100, borrowInUsd: 50, liquidityInUsd: 50, utilizationPercentage: 0.5, debtRepaidInUsd: 50, interestAccruedInUsd: 10, interestRepaidInUsd: 15 }
    ],
    market
  );

  const summary = summarizeMarket(market, rows, { highUtilizationThreshold: 0.85 });
  assert.equal(summary.totalDebtRepaidInUsd, 150);
  assert.equal(summary.interestCoverageRatio, 1);
  assert.equal(summary.highUtilizationDays, 1);
  assert.ok(Math.abs(summary.repaymentConcentrationHhi - (1 / 9)) < 1e-12);
  assert.equal(summary.liquidityBuffer, 1);
});

test("normalized repayment HHI is unchanged by the number of equal active days", () => {
  assert.equal(normalizedHhi([10, 10, 10]), 0);
  assert.equal(normalizedHhi(Array(30).fill(10)), 0);
  assert.equal(normalizedHhi([0, 0, 25]), 1);
});
