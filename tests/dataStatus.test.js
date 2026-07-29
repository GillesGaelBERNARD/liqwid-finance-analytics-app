import assert from "node:assert/strict";
import test from "node:test";

import { buildDataStatus } from "../src/browser/dataStatus.js";

function marketHistoryRow(date, overrides = {}) {
  return {
    date,
    borrow: 300,
    debtAccrued: 0,
    debtRepaid: 0,
    unclassifiedBorrowReduction: 0,
    supplyInUsd: 400,
    borrowInUsd: 300,
    liquidityInUsd: 100,
    utilizationPercentage: 0.75,
    ...overrides
  };
}

function dateRange(startDate, endDate) {
  const rows = [];
  for (
    let cursor = Date.parse(`${startDate}T00:00:00Z`);
    cursor <= Date.parse(`${endDate}T00:00:00Z`);
    cursor += 86_400_000
  ) {
    rows.push(new Date(cursor).toISOString().slice(0, 10));
  }
  return rows;
}

function allocationRow(date) {
  return {
    date,
    periodStartDay: date,
    periodEndDay: date,
    isComplete: true,
    allocatedProtocolRevenueInUsd: 5,
    allocatedProtocolInterestRevenueInUsd: 4,
    allocatedProtocolOriginationRevenueInUsd: 1,
    allocatedHoldersRevenueInUsd: 3,
    allocatedHoldersInterestRevenueInUsd: 2,
    allocatedHoldersOriginationRevenueInUsd: 1
  };
}

function statusInput(overrides = {}) {
  return {
    bundle: {
      generatedAt: "2026-07-18T08:46:41.225Z",
      source: "https://v2.api.liqwid.finance/graphql",
      rawCapture: "raw/api/fetches/20260718T084629082Z",
      archiveMetadata: {
        schemaVersion: 4,
        endpoint: "https://v2.api.liqwid.finance/graphql",
        latestRawCapture: "raw/api/fetches/20260718T084629082Z"
      },
      archiveAudit: {
        rawCaptureCount: 1,
        latestRawCapturePresent: true,
        latestRawEnvelopeCount: 4,
        rawSourceMismatchCount: 0,
        manifestValidated: true,
        currentLoans: {
          rawEnvelopeRowCount: 4,
          rawTotalCount: 4,
          rawResultCount: 4,
          cleanRowCount: 4
        },
        currentMarkets: {
          rawEnvelopeRowCount: 2,
          rawTotalCount: 2,
          rawResultCount: 2,
          cleanRowCount: 2
        },
        historicalTables: {
          expectedMarketFiles: 2,
          rawMarketHistoryFiles: 2,
          rawMarketHistoryRows: 4,
          cleanMarketHistoryRows: 4,
          marketHistoryMismatches: [],
          rawMarketParameterFiles: 2,
          rawMarketParameterRows: 2,
          cleanMarketParameterRows: 2,
          marketParameterMismatches: []
        },
        parameterCursors: {
          rowCount: 2,
          requestedThroughEndCount: 2,
          requestedEndDate: "2026-07-18"
        }
      },
      requestedRange: { startDate: "2020-01-01", endDate: "2026-07-18" },
      markets: [
        { id: "ADA", borrow: 100, supply: 180, liquidity: 80, asset: { priceUpdatedAt: "2026-07-18T08:00:00Z" } },
        { id: "DJED", borrow: 200, supply: 220, liquidity: 20, asset: { priceUpdatedAt: "2026-07-18T08:00:00Z" } }
      ],
      marketSeries: {
        ADA: [marketHistoryRow("2026-07-16"), marketHistoryRow("2026-07-17")],
        DJED: [marketHistoryRow("2026-07-16"), marketHistoryRow("2026-07-17")]
      },
      protocolSeries: [{ date: "2026-07-16" }, { date: "2026-07-17" }],
      currentTotals: { supplyInUsd: 400, borrowInUsd: 300, liquidityInUsd: 100 },
      summedCurrentTotals: { supplyInUsd: 400, borrowInUsd: 300, liquidityInUsd: 100 }
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
    liquidatableLoans: [{ marketId: "ADA", amount: 100 }],
    collateralLoans: [
      { marketId: "ADA", amount: 100 },
      { marketId: "DJED", amount: 0 }
    ],
    loanSnapshotHistory: {
      participation: [
        { timestamp: "2026-07-17T08:00:00Z", scope: "protocol" },
        { timestamp: "2026-07-18T08:46:41Z", scope: "protocol" }
      ],
      health: [
        { timestamp: "2026-07-17T08:00:00Z", scope: "protocol" },
        { timestamp: "2026-07-18T08:46:41Z", scope: "protocol" }
      ],
      reconciliation: [
        { timestamp: "2026-07-18T08:46:41Z", scope: "market", marketId: "ADA" },
        { timestamp: "2026-07-18T08:46:41Z", scope: "market", marketId: "DJED" }
      ]
    },
    liquidation: {
      dailyLiquidationCoverage: {
        firstDate: "2023-02-02", lastDate: "2026-07-17", missingDays: 0,
        reconciliationFailures: 0, complete: true
      }
    },
    revenue: {
      dailyAllocation: dateRange("2026-01-01", "2026-07-17").map(allocationRow),
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
    lqToken: {
      series: [
        { date: "2026-07-17", lqPriceInUsd: 0.2, stakedLqAmount: 10 },
        { date: "2026-07-18", lqPriceInUsd: 0.21, stakedLqAmount: 11 }
      ]
    },
    marketParameters: {
      byMarket: {
        ADA: { events: [{ timestamp: "2026-01-01T00:00:00Z" }] },
        DJED: { events: [{ timestamp: "2026-01-02T00:00:00Z" }] }
      }
    },
    protocolParameters: {
      current: {
        totalMarketCount: 2,
        parameterizedMarketCount: 2,
        totalBorrowInUsd: 300,
        parameterizedBorrowInUsd: 300,
        parameterCoverage: 1
      }
    },
    marketRevenue: {
      byMarket: {
        ADA: { summary: { attributedAllHistoryComplete: true, ytdAttributionComplete: true } },
        DJED: { summary: { attributedAllHistoryComplete: true, ytdAttributionComplete: true } }
      },
      protocolReconciliation: { completeDays: 1, incompleteDays: 0 }
    },
    ...overrides
  };
}

test("data status centralizes visible coverage, populations, checks, and boundaries", () => {
  const status = buildDataStatus(statusInput());

  assert.deepEqual(status.coverageCards.map((card) => card.id), [
    "market-history", "liquidations", "protocol-revenue", "market-revenue-attribution",
    "market-parameters", "lq-observations", "price-observations", "loan-observations", "loan-reconciliation"
  ]);
  assert.equal(status.coverageCards[0].value, "2 / 2 markets · continuous");
  assert.equal(status.coverageCards[1].status, "pass");
  assert.equal(status.coverageCards[1].value, "Complete daily coverage");
  assert.match(status.coverageCards[1].detail, /No missing days/);
  assert.equal(status.loanPopulation.totalPositions, 4);
  assert.equal(status.loanPopulation.activeDebtPositions, 2);
  assert.equal(status.loanPopulation.zeroDebtPositions, 1);
  assert.equal(status.loanPopulation.excludedDustPositions, 1);
  assert.equal(status.loanPopulation.liquidatablePositions, 1);
  assert.equal(status.loanPopulation.collateralPositions, 2);

  const checks = Object.fromEntries(status.checks.map((check) => [check.id, check]));
  assert.equal(checks["protocol-supply"].status, "pass");
  assert.equal(checks["protocol-borrow"].status, "pass");
  assert.equal(checks["protocol-liquidity"].status, "pass");
  assert.equal(checks["protocol-borrow"].differenceInUsd, 0);
  assert.equal(checks["current-market-snapshot"].status, "pass");
  assert.equal(checks["current-loan-snapshot"].status, "pass");
  assert.equal(checks["historical-raw-clean"].status, "pass");
  assert.equal(checks["debt-flow-identity"].status, "pass");
  assert.equal(checks["debt-flow-identity"].checkedRows, 2);
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
  assert.equal(status.limitations.length, 9);
  assert.ok(status.limitations.some((item) => item.id === "debt-flow-classification"));
  assert.ok(status.limitations.some((item) => item.id === "interest-balance-unavailable"));
  assert.equal(status.technical.rawCapture, "raw/api/fetches/20260718T084629082Z");
  assert.deepEqual(status.technical.inventory.map((item) => item.id), [
    "markets", "protocol-history", "market-history", "liquidations", "revenue-allocation", "current-loans", "loan-observations"
  ]);
  assert.equal(status.technical.inventory.find((item) => item.id === "protocol-history").rowCount, 2);
  assert.equal(status.technical.inventory.find((item) => item.id === "market-history").rowCount, 4);
  assert.equal(status.technical.inventory.find((item) => item.id === "current-loans").rowCount, 4);
  assert.deepEqual(status.technical.evidence.map((item) => item.id), [
    "archive-provenance", "market-history", "protocol-supply", "protocol-borrow",
    "protocol-liquidity", "current-market-snapshot", "current-loan-snapshot",
    "historical-raw-clean", "debt-flow-identity", "liquidations", "protocol-revenue", "revenue",
    "loan-row-undercoverage", "loan-row-overcoverage", "loan-aggregate-reconciliation"
  ]);
  const liquidationEvidence = status.technical.evidence.find((item) => item.id === "liquidations");
  assert.equal(liquidationEvidence.status, "pass");
  assert.match(liquidationEvidence.detail, /No missing days; 0 monthly totals checked; no failures\./);
  assert.ok(status.technical.rules.length >= 4);
  assert.match(status.technical.rules.find((rule) => rule.id === "liquidation-tolerance").detail, /\$0\.01/);
  assert.match(status.technical.rules.find((rule) => rule.id === "loan-row-reconciliation").detail, /99\.5% through 100\.5%/i);
  assert.match(status.technical.rules.find((rule) => rule.id === "debt-flow-identity").detail, /Borrow change = inferred formation - reported repayment - unclassified reduction/i);
});

test("debt-flow identity check fails when a derived market row does not reconcile", () => {
  const input = statusInput();
  input.bundle.marketSeries.ADA[1] = marketHistoryRow("2026-07-17", {
    borrow: 250,
    debtAccrued: 0,
    debtRepaid: 0,
    unclassifiedBorrowReduction: 0
  });

  const check = buildDataStatus(input).checks.find((item) => item.id === "debt-flow-identity");

  assert.equal(check.status, "fail");
  assert.equal(check.checkedRows, 2);
  assert.equal(check.failedRows, 1);
  assert.deepEqual(check.affectedMarkets, ["ADA"]);
  assert.match(check.detail, /2026-07-17/);
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
  assert.equal(status.headline.failedChecks, 5);
});

test("headline includes coverage cards and does not report healthy when data is partial or unavailable", () => {
  const partialInput = statusInput();
  partialInput.currentExposure.borrowerConcentration.marketDependence = [
    { marketId: "ADA", marketBorrowInUsd: 100, loanRowDebtInUsd: 100.6 },
    { marketId: "DJED", marketBorrowInUsd: 200, loanRowDebtInUsd: 200 }
  ];

  const partialStatus = buildDataStatus(partialInput);

  assert.equal(partialStatus.headline.state, "limited");
  assert.equal(partialStatus.headline.label, "Data is usable with known limitations");
  assert.ok(partialStatus.headline.partialChecks >= 1);

  const emptyStatus = buildDataStatus({
    bundle: {},
    allLoans: [],
    activeLoans: [],
    loanSnapshotHistory: {},
    liquidation: {},
    revenue: {},
    currentExposure: {}
  });

  assert.equal(emptyStatus.coverageCards.find((card) => card.id === "market-history").status, "fail");
  assert.equal(emptyStatus.headline.state, "attention");
  assert.ok(emptyStatus.headline.failedChecks >= 1);
});

test("revenue reconciliation rejects complete rows with missing required operands", () => {
  const input = statusInput();
  delete input.revenue.dailyAllocation[0].allocatedProtocolOriginationRevenueInUsd;
  delete input.revenue.dailyAllocation[0].allocatedHoldersOriginationRevenueInUsd;

  const revenue = buildDataStatus(input).checks.find((check) => check.id === "revenue");

  assert.equal(revenue.status, "fail");
  assert.equal(revenue.checkedDays, input.revenue.dailyAllocation.length);
  assert.equal(revenue.invalidOperandDays, 1);
  assert.equal(revenue.reconciliationFailures, 0);
  assert.deepEqual(revenue.failedDates, ["2026-01-01"]);
  assert.match(revenue.detail, /missing or invalid required operands/i);
});

test("protocol revenue coverage reports missing closed days independently of component reconciliation", () => {
  const input = statusInput();
  input.bundle.generatedAt = "2026-01-06T08:00:00Z";
  input.bundle.requestedRange.endDate = "2026-01-05";
  input.revenue.dailyAllocation = [
    allocationRow("2026-01-01"),
    allocationRow("2026-01-03"),
    allocationRow("2026-01-05")
  ];
  input.revenue.monthlyAllocation = [];

  const status = buildDataStatus(input);
  const card = status.coverageCards.find((item) => item.id === "protocol-revenue");
  const check = status.checks.find((item) => item.id === "revenue");

  assert.equal(card.status, "partial");
  assert.equal(card.missingCalendarDays, 2);
  assert.equal(card.invalidDateRows, 0);
  assert.equal(card.duplicateDates, 0);
  assert.match(card.value, /2 missing days/i);
  assert.equal(check.status, "pass");
});

test("loan aggregate status treats cleaned market and loan amounts as USD without applying asset price twice", () => {
  const input = statusInput();
  input.bundle.markets = [{
    id: "wanBTC",
    displayName: "wanBTC",
    borrow: 100,
    asset: { price: 100_000 }
  }];
  input.activeLoans = [{
    marketId: "wanBTC",
    amount: 100,
    adjustedAmount: 100.02,
    hasDebt: true
  }];
  input.currentExposure.borrowerConcentration.marketDependence = [{
    marketId: "wanBTC",
    marketDisplayName: "wanBTC",
    marketBorrowInUsd: 100,
    loanRowDebtInUsd: 100
  }];

  const reconciliation = buildDataStatus(input).checks.find((check) => check.id === "loan-aggregate-reconciliation");

  assert.equal(reconciliation.status, "pass");
  assert.ok(Math.abs(reconciliation.totalDifferenceInUsd - 0.02) < 1e-9);
  assert.equal(reconciliation.operands[0].marketBorrowInUsd, 100);
  assert.equal(reconciliation.operands[0].loanAdjustedDebtInUsd, 100.02);
  assert.equal(reconciliation.operands[0].classification, "reconciled");
});

test("market-history coverage reports calendar gaps and affected markets", () => {
  const input = statusInput();
  input.bundle.generatedAt = "2026-01-04T08:00:00Z";
  input.bundle.requestedRange.endDate = "2026-01-03";
  input.bundle.marketSeries = {
    ADA: [marketHistoryRow("2026-01-01"), marketHistoryRow("2026-01-03")],
    DJED: [marketHistoryRow("2026-01-01"), marketHistoryRow("2026-01-02"), marketHistoryRow("2026-01-03")]
  };
  input.bundle.protocolSeries = [
    { date: "2026-01-01" },
    { date: "2026-01-02" },
    { date: "2026-01-03" }
  ];

  const card = buildDataStatus(input).coverageCards.find((item) => item.id === "market-history");

  assert.equal(card.status, "partial");
  assert.equal(card.missingCalendarDays, 1);
  assert.equal(card.marketsWithGaps, 1);
  assert.deepEqual(card.affectedMarkets, ["ADA"]);
  assert.match(card.value, /1 missing day/i);
  assert.match(card.detail, /expected through 2026-01-03/i);
});

test("archive provenance fails closed for an untrusted endpoint, schema, or raw lineage", () => {
  const input = statusInput();
  input.bundle.source = "https://example.invalid/graphql";
  input.bundle.archiveMetadata = {
    schemaVersion: 99,
    endpoint: "https://example.invalid/graphql",
    latestRawCapture: "raw/api/fetches/untrusted"
  };
  input.bundle.archiveAudit = {
    rawCaptureCount: 1,
    latestRawCapturePresent: false,
    latestRawEnvelopeCount: 2,
    rawSourceMismatchCount: 2,
    manifestValidated: false
  };

  const provenance = buildDataStatus(input).checks.find((check) => check.id === "archive-provenance");

  assert.equal(provenance.status, "fail");
  assert.deepEqual(provenance.failedRules, [
    "endpoint",
    "schema-version",
    "latest-raw-capture",
    "raw-envelope-source",
    "portable-manifest"
  ]);
  assert.match(provenance.detail, /5 provenance failures/i);
});

test("coverage registry exposes parameters, revenue attribution, LQ observations, and price freshness", () => {
  const input = statusInput();
  input.marketRevenue.byMarket.DJED.summary.attributedAllHistoryComplete = false;
  input.bundle.markets[0].asset.priceUpdatedAt = "2026-07-15T00:00:00Z";

  const status = buildDataStatus(input);
  const cards = Object.fromEntries(status.coverageCards.map((card) => [card.id, card]));

  assert.equal(cards["market-parameters"].status, "pass");
  assert.match(cards["market-parameters"].value, /2 \/ 2 markets .* 2 events/);
  assert.equal(cards["market-revenue-attribution"].status, "partial");
  assert.match(cards["market-revenue-attribution"].value, /1 \/ 2 all-history/);
  assert.equal(cards["lq-observations"].status, "pass");
  assert.match(cards["lq-observations"].value, /2 saved observations/);
  assert.equal(cards["price-observations"].status, "partial");
  assert.equal(cards["price-observations"].staleActiveMarkets, 1);
  assert.ok(cards["price-observations"].staleBorrowShare > 0);
});

test("market parameter coverage is partial when cursor metadata is absent or incomplete", () => {
  const missingInput = statusInput();
  delete missingInput.bundle.archiveAudit.parameterCursors;

  const missing = buildDataStatus(missingInput).coverageCards.find((item) => item.id === "market-parameters");

  assert.equal(missing.status, "partial");
  assert.match(missing.detail, /cursor metadata is unavailable/i);

  const incompleteInput = statusInput();
  incompleteInput.bundle.archiveAudit.parameterCursors = {
    rowCount: 1,
    requestedThroughEndCount: 1,
    requestedEndDate: "2026-07-18"
  };

  const incomplete = buildDataStatus(incompleteInput).coverageCards.find((item) => item.id === "market-parameters");

  assert.equal(incomplete.status, "partial");
  assert.match(incomplete.detail, /1 \/ 2 market cursors/i);
});

test("LQ and loan observation coverage becomes partial when the latest saved snapshots are stale or incomplete", () => {
  const input = statusInput();
  input.lqToken.series = [{ date: "2026-07-15", lqPriceInUsd: 0.2, stakedLqAmount: 10 }];
  input.loanSnapshotHistory = {
    participation: [{ timestamp: "2026-07-18T08:00:00Z", scope: "protocol" }],
    health: [{ timestamp: "2026-07-16T08:00:00Z", scope: "protocol" }],
    reconciliation: [{ timestamp: "2026-07-17T08:00:00Z", scope: "market", marketId: "ADA" }]
  };

  const cards = Object.fromEntries(buildDataStatus(input).coverageCards.map((card) => [card.id, card]));

  assert.equal(cards["lq-observations"].status, "partial");
  assert.equal(cards["lq-observations"].staleDays, 2);
  assert.equal(cards["loan-observations"].status, "partial");
  assert.deepEqual(cards["loan-observations"].missingOrStaleTables, ["health"]);
  assert.equal(cards["loan-reconciliation"].status, "partial");
  assert.equal(cards["loan-reconciliation"].coveredMarketsAtLatest, 1);
});

test("current loan snapshot check reconciles raw envelope, API total, results, and clean rows", () => {
  const input = statusInput();
  input.bundle.archiveAudit.currentLoans.rawTotalCount = 5;

  const check = buildDataStatus(input).checks.find((item) => item.id === "current-loan-snapshot");

  assert.equal(check.status, "fail");
  assert.equal(check.value, "4 clean rows · 5 API total");
  assert.deepEqual(check.mismatches, ["raw results vs API total", "clean rows vs API total"]);
  assert.match(check.detail, /2 count mismatches/i);
});

test("current market and historical raw-to-clean checks fail closed on lineage count mismatches", () => {
  const input = statusInput();
  input.bundle.archiveAudit.currentMarkets.rawTotalCount = 3;
  input.bundle.archiveAudit.historicalTables.cleanMarketHistoryRows = 3;
  input.bundle.archiveAudit.historicalTables.marketHistoryMismatches = ["DJED"];

  const checks = Object.fromEntries(buildDataStatus(input).checks.map((check) => [check.id, check]));

  assert.equal(checks["current-market-snapshot"].status, "fail");
  assert.deepEqual(checks["current-market-snapshot"].mismatches, [
    "raw results vs API total",
    "clean rows vs API total"
  ]);
  assert.equal(checks["historical-raw-clean"].status, "fail");
  assert.deepEqual(checks["historical-raw-clean"].affectedMarkets, ["DJED"]);
});

test("loan population segments stay mutually exclusive when adjusted debt makes a raw-zero row active", () => {
  const input = statusInput({
    allLoans: [
      { id: "adjusted-only", amount: 0, adjustedAmount: 1, hasDebt: true },
      { id: "zero", amount: 0, adjustedAmount: 0, hasDebt: false },
      { id: "dust", amount: 0.1, adjustedAmount: 0, hasDebt: false }
    ],
    activeLoans: [
      { id: "adjusted-only", amount: 0, adjustedAmount: 1, hasDebt: true }
    ],
    liquidatableLoans: [],
    collateralLoans: []
  });
  input.bundle.archiveAudit.currentLoans = {
    rawEnvelopeRowCount: 3,
    rawTotalCount: 3,
    rawResultCount: 3,
    cleanRowCount: 3
  };

  const population = buildDataStatus(input).loanPopulation;

  assert.equal(population.totalPositions, 3);
  assert.equal(population.activeDebtPositions, 1);
  assert.equal(population.zeroDebtPositions, 1);
  assert.equal(population.excludedDustPositions, 1);
  assert.equal(
    population.activeDebtPositions + population.zeroDebtPositions + population.excludedDustPositions,
    population.totalPositions
  );
});

test("loan-row percentage checks use raw Loan.amount while batch reconciliation uses adjusted debt", () => {
  const input = statusInput();
  input.currentExposure.borrowerConcentration.marketDependence = [
    {
      marketId: "ADA",
      marketBorrowInUsd: 100,
      loanRowAmountInUsd: 100,
      loanRowDebtInUsd: 120
    },
    {
      marketId: "DJED",
      marketBorrowInUsd: 200,
      loanRowAmountInUsd: 200,
      loanRowDebtInUsd: 250
    }
  ];

  const checks = Object.fromEntries(buildDataStatus(input).checks.map((check) => [check.id, check]));

  assert.equal(checks["loan-row-undercoverage"].status, "pass");
  assert.equal(checks["loan-row-overcoverage"].status, "pass");
});

test("market-history coverage fails when a required metric is missing or non-numeric", () => {
  const input = statusInput();
  input.bundle.marketSeries.ADA[1].borrowInUsd = "";

  const card = buildDataStatus(input).coverageCards.find((item) => item.id === "market-history");

  assert.equal(card.status, "fail");
  assert.equal(card.invalidMetricRows, 1);
  assert.deepEqual(card.affectedMarkets, ["ADA"]);
  assert.match(card.detail, /structural integrity issue/i);
});
