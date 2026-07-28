import assert from "node:assert/strict";
import test from "node:test";

import { buildDataStatus } from "../src/browser/dataStatus.js";

function statusInput(overrides = {}) {
  return {
    bundle: {
      generatedAt: "2026-07-18T08:46:41.225Z",
      source: "https://v2.api.liqwid.finance/graphql",
      rawCapture: "raw/api/fetches/20260718T084629082Z",
      requestedRange: { startDate: "2020-01-01", endDate: "2026-07-18" },
      markets: [{ id: "ADA" }, { id: "DJED" }],
      marketSeries: {
        ADA: [{ date: "2023-02-02" }, { date: "2026-07-17" }],
        DJED: [{ date: "2023-03-02" }, { date: "2026-07-17" }]
      },
      protocolSeries: [{ date: "2023-02-02" }, { date: "2026-07-17" }],
      currentTotals: { borrowInUsd: 300 },
      summedCurrentTotals: { borrowInUsd: 300 }
    },
    allLoans: [
      { marketId: "ADA", amount: 100 },
      { marketId: "DJED", amount: 200 },
      { marketId: "DJED", amount: 0 },
      { marketId: "DJED", amount: 0.25 }
    ],
    activeLoans: [
      { marketId: "ADA", amount: 100 },
      { marketId: "DJED", amount: 200 }
    ],
    loanSnapshotHistory: {
      participation: [
        { timestamp: "2026-07-17T08:00:00Z", scope: "protocol" },
        { timestamp: "2026-07-18T08:46:41Z", scope: "protocol" }
      ]
    },
    liquidation: {
      dailyLiquidationCoverage: {
        firstDate: "2023-02-02", lastDate: "2026-07-17", missingDays: 0,
        reconciliationFailures: 0, complete: true
      }
    },
    revenue: {
      dailyAllocation: [{
        date: "2026-01-01", periodStartDay: "2026-01-01", periodEndDay: "2026-01-01", isComplete: true,
        allocatedProtocolRevenueInUsd: 5, allocatedProtocolInterestRevenueInUsd: 4, allocatedProtocolOriginationRevenueInUsd: 1,
        allocatedHoldersRevenueInUsd: 3, allocatedHoldersInterestRevenueInUsd: 2, allocatedHoldersOriginationRevenueInUsd: 1
      }],
      monthlyAllocation: [
        { periodStartDay: "2026-01-01", periodEndDay: "2026-01-31", isComplete: true },
        { periodStartDay: "2026-02-01", periodEndDay: "2026-02-18", isComplete: false }
      ]
    },
    currentExposure: {
      borrowerConcentration: {
        observedKeyExposure: { protocolLoanRowCoverage: 0.72 },
        marketDependence: [
          { marketId: "ADA", marketDisplayName: "ADA", marketBorrowInUsd: 100, loanRowDebtInUsd: 100 },
          { marketId: "DJED", marketDisplayName: "DJED", marketBorrowInUsd: 200, loanRowDebtInUsd: 116 }
        ]
      }
    },
    ...overrides
  };
}

test("data status centralizes visible coverage, populations, checks, and boundaries", () => {
  const status = buildDataStatus(statusInput());

  assert.deepEqual(status.coverageCards.map((card) => card.id), [
    "market-history", "liquidations", "protocol-revenue", "loan-observations", "loan-reconciliation"
  ]);
  assert.equal(status.coverageCards[0].value, "2 / 2 markets");
  assert.equal(status.coverageCards[1].status, "pass");
  assert.equal(status.coverageCards[1].value, "Complete daily coverage");
  assert.match(status.coverageCards[1].detail, /No missing days/);
  assert.equal(status.loanPopulation.totalPositions, 4);
  assert.equal(status.loanPopulation.activeDebtPositions, 2);
  assert.equal(status.loanPopulation.zeroDebtPositions, 1);
  assert.equal(status.loanPopulation.excludedDustPositions, 1);

  const checks = Object.fromEntries(status.checks.map((check) => [check.id, check]));
  assert.equal(checks["protocol-borrow"].status, "pass");
  assert.equal(checks["protocol-borrow"].differenceInUsd, 0);
  assert.equal(checks.liquidations.status, "pass");
  assert.equal(checks.liquidations.value, "All covered months reconcile");
  assert.match(checks.liquidations.detail, /No missing days/);
  assert.equal(checks.revenue.status, "pass");
  assert.equal(checks["loan-row-undercoverage"].status, "fail");
  assert.equal(checks["loan-row-undercoverage"].totalDifferenceInUsd, 84);
  assert.deepEqual(checks["loan-row-undercoverage"].affectedMarkets, ["DJED"]);
  assert.equal(checks["loan-row-overcoverage"].status, "pass");
  assert.equal(checks["loan-aggregate-reconciliation"].status, "pass");

  assert.equal(status.headline.state, "attention");
  assert.equal(status.headline.failedChecks, 1);
  assert.equal(status.headline.partialChecks, 0);
  assert.equal(status.limitations.length, 3);
  assert.equal(status.technical.rawCapture, "raw/api/fetches/20260718T084629082Z");
  assert.deepEqual(status.technical.inventory.map((item) => item.id), [
    "markets", "protocol-history", "market-history", "liquidations", "revenue-allocation", "current-loans", "loan-observations"
  ]);
  assert.equal(status.technical.inventory.find((item) => item.id === "protocol-history").rowCount, 2);
  assert.equal(status.technical.inventory.find((item) => item.id === "market-history").rowCount, 4);
  assert.equal(status.technical.inventory.find((item) => item.id === "current-loans").rowCount, 4);
  assert.deepEqual(status.technical.evidence.map((item) => item.id), [
    "protocol-borrow", "liquidations", "revenue", "loan-row-undercoverage", "loan-row-overcoverage", "loan-aggregate-reconciliation"
  ]);
  const liquidationEvidence = status.technical.evidence.find((item) => item.id === "liquidations");
  assert.equal(liquidationEvidence.status, "pass");
  assert.match(liquidationEvidence.detail, /No missing days; 0 monthly totals checked; no failures\./);
  assert.ok(status.technical.rules.length >= 4);
  assert.match(status.technical.rules.find((rule) => rule.id === "liquidation-tolerance").detail, /\$0\.01/);
  assert.match(status.technical.rules.find((rule) => rule.id === "loan-row-reconciliation").detail, /99\.5% through 100\.5%/i);
});

test("data status accepts a 0.5 percentage-point margin before separating undercoverage and overcoverage", () => {
  const input = statusInput();
  input.currentExposure.borrowerConcentration.marketDependence = [
    { marketId: "UNDER", marketDisplayName: "Under", marketBorrowInUsd: 100, loanRowDebtInUsd: 99.499999999 },
    { marketId: "LOWER_BOUND", marketDisplayName: "Lower bound", marketBorrowInUsd: 100, loanRowDebtInUsd: 99.5 },
    { marketId: "EXACT", marketDisplayName: "Exact", marketBorrowInUsd: 100, loanRowDebtInUsd: 100 },
    { marketId: "UPPER_BOUND", marketDisplayName: "Upper bound", marketBorrowInUsd: 100, loanRowDebtInUsd: 100.5 },
    { marketId: "OVER", marketDisplayName: "Over", marketBorrowInUsd: 100, loanRowDebtInUsd: 100.500000001 }
  ];

  const status = buildDataStatus(input);
  const checks = Object.fromEntries(status.checks.map((check) => [check.id, check]));

  assert.equal(checks["loan-row-undercoverage"].status, "fail");
  assert.deepEqual(checks["loan-row-undercoverage"].affectedMarkets, ["Under"]);
  assert.equal(checks["loan-row-overcoverage"].status, "partial");
  assert.deepEqual(checks["loan-row-overcoverage"].affectedMarkets, ["Over"]);
  assert.match(checks["loan-row-overcoverage"].detail, /summed HAS_DEBT Loan\.amount\(USD\) exceeds Market\.borrow\(USD\)/i);
  assert.match(checks["loan-row-overcoverage"].detail, /loan-detail and market-aggregate API surfaces may not have refreshed to the same snapshot/i);
  assert.equal(status.headline.state, "attention");
  assert.equal(status.headline.failedChecks, 1);
  assert.equal(status.headline.partialChecks, 1);
});

test("both loan-row checks pass when every market is inside the inclusive acceptance band", () => {
  const input = statusInput();
  input.currentExposure.borrowerConcentration.marketDependence = [
    { marketId: "LOWER_BOUND", marketBorrowInUsd: 200, loanRowDebtInUsd: 199 },
    { marketId: "EXACT", marketBorrowInUsd: 200, loanRowDebtInUsd: 200 },
    { marketId: "UPPER_BOUND", marketBorrowInUsd: 200, loanRowDebtInUsd: 201 }
  ];

  const checks = Object.fromEntries(buildDataStatus(input).checks.map((check) => [check.id, check]));

  assert.equal(checks["loan-row-undercoverage"].status, "pass");
  assert.equal(checks["loan-row-undercoverage"].value, "No undercoverage beyond 0.5%");
  assert.equal(checks["loan-row-overcoverage"].status, "pass");
  assert.equal(checks["loan-row-overcoverage"].value, "No overcoverage beyond 0.5%");
});

test("saved observation coverage counts every protocol timestamp visible in loan history graphs", () => {
  const input = statusInput();
  input.loanSnapshotHistory = {
    participation: [
      { timestamp: "2026-07-18T14:14:57.487Z", scope: "protocol" },
      { timestamp: "2026-07-18T15:55:57.165Z", scope: "protocol" }
    ],
    health: [
      { timestamp: "2026-07-18T08:46:41.233Z", scope: "protocol" },
      { timestamp: "2026-07-18T14:14:57.487Z", scope: "protocol" },
      { timestamp: "2026-07-18T15:55:57.165Z", scope: "protocol" },
      { timestamp: "2026-07-18T08:46:41.233Z", scope: "market", marketId: "ADA" }
    ]
  };

  const status = buildDataStatus(input);
  const observationCard = status.coverageCards.find((card) => card.id === "loan-observations");
  const observationInventory = status.technical.inventory.find((item) => item.id === "loan-observations");

  assert.equal(observationCard.value, "3 saved observations");
  assert.match(observationInventory.value, /^3 timestamps;/);
});

test("data status elevates failed coverage and reconciliation checks", () => {
  const input = statusInput();
  input.bundle.currentTotals.borrowInUsd = 310;
  input.liquidation.dailyLiquidationCoverage.missingDays = 2;
  input.liquidation.dailyLiquidationCoverage.complete = false;
  input.revenue.dailyAllocation[0].allocatedProtocolRevenueInUsd = 9;

  const status = buildDataStatus(input);
  const checks = Object.fromEntries(status.checks.map((check) => [check.id, check]));

  assert.equal(checks["protocol-borrow"].status, "fail");
  assert.equal(checks.liquidations.status, "fail");
  assert.equal(checks.revenue.status, "fail");
  assert.equal(status.headline.state, "attention");
  assert.equal(status.headline.failedChecks, 4);
});
