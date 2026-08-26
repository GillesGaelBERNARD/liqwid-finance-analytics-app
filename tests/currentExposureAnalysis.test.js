import assert from "node:assert/strict";
import test from "node:test";

import {
  buildConcentrationComparisonSeries,
  buildCurrentExposureAnalysis,
  classifyLoanRowCoverage,
  isPolLoan,
  LIQWID_POL_PUBLIC_KEY,
  summarizeLoanRowCoverageNotices
} from "../src/browser/currentExposureAnalysis.js";

function history(marketId, date, utilization, overrides = {}) {
  return {
    marketId,
    marketDisplayName: marketId,
    date,
    supplyInUsd: 1_000,
    borrowInUsd: utilization * 1_000,
    liquidityInUsd: (1 - utilization) * 1_000,
    utilizationPercentage: utilization,
    debtRepaidInUsd: 10,
    interestAccruedInUsd: 4,
    interestRepaidInUsd: 3,
    ...overrides
  };
}

function collateral(marketId, amount) {
  return { id: `${marketId}-${amount}`, qTokenName: `q${marketId}`, amount, market: { id: marketId, displayName: marketId } };
}

const activeLoans = [
  { marketId: "ADA", publicKey: "alpha", amount: 100, healthFactor: 1.20, collateral: 200, collaterals: [collateral("ADA", 160), collateral("NIGHT", 40)] },
  { marketId: "DJED", publicKey: "alpha", amount: 50, healthFactor: 1.20, collateral: 100, collaterals: [collateral("ADA", 100)] },
  { marketId: "ADA", publicKey: "beta", amount: 30, healthFactor: 1.05, collateral: 60, collaterals: [collateral("NIGHT", 60)] },
  { marketId: "DJED", publicKey: "beta", amount: 10, healthFactor: 1.40, collateral: 20, collaterals: [collateral("ADA", 20)] },
  { marketId: "ADA", publicKey: "gamma", amount: 20, healthFactor: 1.10, collateral: 40, collaterals: [collateral("ADA", 40)] }
];

const collateralLoans = [
  ...activeLoans,
  { marketId: "ADA", publicKey: "delta", amount: 0, healthFactor: null, collateral: 50, collaterals: [collateral("ADA", 50)] },
  { marketId: "ADA", publicKey: "", amount: 0, healthFactor: null, collateral: 30, collaterals: [collateral("ADA", 30)] }
];

test("cross-market concentration series follow first cumulative share with an ordered gradient", () => {
  const comparisonSeries = buildConcentrationComparisonSeries([
    { marketId: "LOW", marketDisplayName: "Low", observedKeyRank: 1, cumulativeShare: 0.25 },
    { marketId: "HIGH", marketDisplayName: "High", observedKeyRank: 0, cumulativeShare: 0 },
    { marketId: "MID", marketDisplayName: "Mid", observedKeyRank: 1, cumulativeShare: 0.50 },
    { marketId: "HIGH", marketDisplayName: "High", observedKeyRank: 1, cumulativeShare: 0.75 }
  ], { shareKey: "cumulativeShare" });

  assert.deepEqual(comparisonSeries.map(({ key, legendDetail }) => ({ key, legendDetail })), [
    { key: "HIGH", legendDetail: "1st key 75.0%" },
    { key: "MID", legendDetail: "1st key 50.0%" },
    { key: "LOW", legendDetail: "1st key 25.0%" }
  ]);
  assert.deepEqual(comparisonSeries.map(({ color }) => color), [
    "hsl(155 78% 64%)",
    "hsl(215 78% 64%)",
    "hsl(275 78% 64%)"
  ]);
});

function bundle() {
  const dates = ["2026-01-01", "2026-01-02", "2026-01-03", "2026-01-04", "2026-01-05", "2026-01-06", "2026-01-07", "2026-01-08"];
  const ada = dates.map((date, index) => history("ADA", date, 0.60 + index * 0.04, {
    interestAccruedInUsd: index === 7 ? 8 : 4,
    interestRepaidInUsd: index === 7 ? 2 : 3
  }));
  const djed = dates.map((date, index) => history("DJED", date, 0.40 - index * 0.01));
  return {
    markets: [
      { id: "ADA", displayName: "ADA", supply: 1_000, borrow: 880, liquidity: 120 },
      { id: "DJED", displayName: "DJED", supply: 800, borrow: 264, liquidity: 536 },
      { id: "NIGHT", displayName: "NIGHT", supply: 500, borrow: 100, liquidity: 400 }
    ],
    currentTotals: { supplyInUsd: 2_300, borrowInUsd: 1_244, liquidityInUsd: 1_056 },
    marketSeriesById: { ADA: ada, DJED: djed, NIGHT: [] },
    protocolSeries: dates.map((date, index) => ({
      date,
      debtAccruedInUsd: 25,
      debtRepaidInUsd: 20,
      interestAccruedInUsd: 8 + (index === 7 ? 4 : 0),
      interestRepaidInUsd: 6 - (index === 7 ? 2 : 0)
    }))
  };
}

test("collateral exposure attributes every loan dollar proportionally and orders low-HF exposure first", () => {
  const exposure = buildCurrentExposureAnalysis({ bundle: bundle(), activeLoans, collateralLoans });
  const rows = exposure.collateralRisk.byCollateral;

  assert.equal(rows.reduce((total, row) => total + row.attributedDebtInUsd, 0), 210);
  assert.equal(rows[0].collateralMarketId, "ADA");
  assert.equal(rows[0].debtAtOrBelow125InUsd, 150);
  assert.equal(rows[1].collateralMarketId, "NIGHT");
  assert.equal(rows[1].debtAtOrBelow125InUsd, 50);
  assert.ok(exposure.collateralRisk.shockScenarios.some((row) => row.shockPercent === 40 && row.exposedDebtInUsd > 0));
});

test("observed-key exposure ranks every key against official protocol borrow", () => {
  const exposure = buildCurrentExposureAnalysis({ bundle: bundle(), activeLoans, collateralLoans });
  const ranking = exposure.borrowerConcentration.observedKeyExposure;
  const alpha = ranking.rows[0];
  const gamma = ranking.rows.find((row) => row.observedKeyLabel === "Observed key 3");
  const alpha125 = alpha.thresholdRows.find((row) => row.threshold === 1.25);

  assert.equal(ranking.protocolBorrowInUsd, 1_244);
  assert.equal(ranking.rows.length, 3);
  assert.equal(alpha.observedKeyLabel, "Observed key 1");
  assert.equal(alpha.totalDebtInUsd, 150);
  assert.equal(alpha.protocolBorrowShare, 150 / 1_244);
  assert.equal(alpha125.lowHfDebtInUsd, 150);
  assert.equal(alpha125.lowHfShareOfKeyDebt, 1);
  assert.equal(gamma.totalDebtInUsd, 20, "single-market keys are retained");
});

test("market dependence uses total market borrow and leaves the uncovered portion explicit", () => {
  const exposure = buildCurrentExposureAnalysis({ bundle: bundle(), activeLoans, collateralLoans });
  const ada = exposure.borrowerConcentration.marketDependence.find((row) => row.marketId === "ADA");

  assert.equal(ada.marketBorrowInUsd, 880);
  assert.equal(ada.loanRowDebtInUsd, 150);
  assert.equal(ada.loanRowCoverage, 150 / 880);
  assert.equal(ada.loanRowCoverageState, "undercoverage");
  assert.equal(ada.loanRowDifferenceInUsd, -730);
  assert.equal(ada.largestKeyDebtShareOfMarketBorrow, 100 / 880);
  assert.equal(ada.nextTwoKeysDebtShareOfMarketBorrow, 50 / 880);
  assert.equal(ada.otherMappedKeysDebtShareOfMarketBorrow, 0);
  assert.equal(ada.unmappedBorrowShare, 730 / 880);
  assert.equal(
    ada.largestKeyDebtShareOfMarketBorrow + ada.nextTwoKeysDebtShareOfMarketBorrow + ada.otherMappedKeysDebtShareOfMarketBorrow + ada.unmappedBorrowShare,
    1
  );
});

test("loan-row reconciliation classifies every nonzero difference without a tolerance band", () => {
  assert.deepEqual(classifyLoanRowCoverage(100, 100), {
    state: "reconciled",
    differenceInUsd: 0,
    coverage: 1
  });
  assert.equal(classifyLoanRowCoverage(99.999999999, 100).state, "undercoverage");
  assert.equal(classifyLoanRowCoverage(100.000000001, 100).state, "overcoverage");
  assert.equal(classifyLoanRowCoverage(100, 0).state, "unavailable");
});

test("loan-row coverage notices use the inclusive 0.5 percentage-point margin in both directions", () => {
  const summary = summarizeLoanRowCoverageNotices([
    { marketId: "UNDER", marketDisplayName: "Under", marketBorrowInUsd: 100, loanRowDebtInUsd: 99.499999999 },
    { marketId: "LOWER_BOUND", marketDisplayName: "Lower bound", marketBorrowInUsd: 100, loanRowDebtInUsd: 99.5 },
    { marketId: "EXACT", marketDisplayName: "Exact", marketBorrowInUsd: 100, loanRowDebtInUsd: 100 },
    { marketId: "UPPER_BOUND", marketDisplayName: "Upper bound", marketBorrowInUsd: 100, loanRowDebtInUsd: 100.5 },
    { marketId: "OVER", marketDisplayName: "Over", marketBorrowInUsd: 100, loanRowDebtInUsd: 100.500000001 },
    { marketId: "NO_BORROW", marketDisplayName: "No borrow", marketBorrowInUsd: 0, loanRowDebtInUsd: 5 }
  ]);

  assert.equal(summary.margin, 0.005);
  assert.deepEqual(summary.undercoverage.affectedMarkets, ["Under"]);
  assert.ok(Math.abs(summary.undercoverage.totalDifferenceInUsd - 0.500000001) < 1e-9);
  assert.deepEqual(summary.overcoverage.affectedMarkets, ["Over"]);
  assert.ok(Math.abs(summary.overcoverage.totalDifferenceInUsd - 0.500000001) < 1e-9);
});

test("market cumulative concentration adds observed-key debt from largest to smallest against total market borrow", () => {
  const exposure = buildCurrentExposureAnalysis({ bundle: bundle(), activeLoans, collateralLoans });
  const points = exposure.borrowerConcentration.marketCumulativeConcentration
    .filter((row) => row.marketId === "ADA");

  assert.deepEqual(points.map((row) => row.observedKeyRank), [0, 1, 2, 3]);
  assert.deepEqual(points.map((row) => row.observedKeyLabel), ["Start", "Observed key 1", "Observed key 2", "Observed key 3"]);
  assert.deepEqual(points.map((row) => row.keyDebtInUsd), [0, 100, 30, 20]);
  assert.deepEqual(points.map((row) => row.cumulativeObservedKeyDebtInUsd), [0, 100, 130, 150]);
  assert.deepEqual(points.map((row) => row.cumulativeShareOfMarketBorrow), [0, 100 / 880, 130 / 880, 150 / 880]);
  assert.ok(points.every((row) => row.marketBorrowInUsd === 880));
  assert.ok(points.every((row) => !JSON.stringify(row).includes("alpha")));
});

test("HF sensitivity uses all observed keys and recalculates its denominator at every cutoff", () => {
  const exposure = buildCurrentExposureAnalysis({ bundle: bundle(), activeLoans, collateralLoans });
  const rows = exposure.borrowerConcentration.concentrationSensitivity;
  const hf110 = rows.find((row) => row.threshold === 1.10);
  const hf120 = rows.find((row) => row.threshold === 1.20);

  assert.equal(hf110.totalLowHfDebtInUsd, 50);
  assert.equal(hf110.top1DebtShare, 30 / 50);
  assert.equal(hf110.top3DebtShare, 1);
  assert.equal(hf120.totalLowHfDebtInUsd, 200);
  assert.equal(hf120.top1DebtShare, 150 / 200);
  assert.equal(hf120.top3DebtShare, 1);
  assert.equal(hf120.qualifyingObservedKeyCount, 3);
});

test("supply-side analysis stays scoped to receipt-token claims represented in loan collateral", () => {
  const exposure = buildCurrentExposureAnalysis({ bundle: bundle(), activeLoans, collateralLoans });
  const ada = exposure.supplySide.byMarket.find((row) => row.marketId === "ADA");

  assert.equal(ada.activeDebtCollateralInUsd, 320);
  assert.equal(ada.zeroDebtCollateralInUsd, 80);
  assert.equal(ada.supplyNotRepresentedAsLoanCollateralInUsd, 600);
  assert.equal(ada.liquidityInUsd, 120);
  assert.equal(ada.representedObservedKeyCount, 4);
  assert.equal(ada.top1RepresentedShare, 260 / 370);
  assert.match(exposure.supplySide.scope, /not total supplier concentration/i);
  assert.doesNotMatch(JSON.stringify(exposure), /alpha|beta|gamma|delta/);
});

test("market cumulative collateralized-supply concentration adds observed keys against all represented collateral", () => {
  const exposure = buildCurrentExposureAnalysis({ bundle: bundle(), activeLoans, collateralLoans });
  const points = exposure.supplySide.marketCumulativeConcentration
    .filter((row) => row.marketId === "ADA");

  assert.deepEqual(points.map((row) => row.observedKeyRank), [0, 1, 2, 3, 4]);
  assert.deepEqual(points.map((row) => row.observedKeyLabel), ["Start", "Observed key 1", "Observed key 2", "Observed key 3", "Observed key 4"]);
  assert.deepEqual(points.map((row) => row.keyCollateralInUsd), [0, 260, 50, 40, 20]);
  assert.deepEqual(points.map((row) => row.cumulativeObservedKeyCollateralInUsd), [0, 260, 310, 350, 370]);
  assert.deepEqual(points.map((row) => row.cumulativeShareOfRepresentedCollateralizedSupply), [0, 260 / 400, 310 / 400, 350 / 400, 370 / 400]);
  assert.ok(points.every((row) => row.representedCollateralInUsd === 400));
  assert.ok(points.every((row) => row.representedObservedKeyCoverage === 370 / 400));
  assert.ok(points.every((row) => !JSON.stringify(row).match(/alpha|beta|gamma|delta/)));
});

test("rising-pressure rows expose utilization momentum and multiple coverage windows", () => {
  const exposure = buildCurrentExposureAnalysis({ bundle: bundle(), activeLoans, collateralLoans });
  const ada = exposure.alerts.marketPressure.find((row) => row.marketId === "ADA");

  assert.equal(ada.currentUtilization, 0.88);
  assert.equal(ada.utilizationChange7d, 0.28);
  assert.ok(ada.pressureScore > 0.8);
  assert.deepEqual(exposure.alerts.coverageWindows.map((row) => row.windowDays), [7, 30, 90]);
  assert.equal(exposure.alerts.coverageWindows.find((row) => row.windowDays === 90).debtCoverageRatio, 0.8);
  assert.ok(exposure.alerts.flowComparison.some((row) => row.metric === "debtAccruedInUsd"));
  assert.ok(exposure.alerts.flowComparison.every((row) => "recent30InUsd" in row && "prior30InUsd" in row));
});

test("protocol exposure coverage consumes current-valued market aggregates when available", () => {
  const input = bundle();
  Object.assign(input.protocolSeries.at(-1), {
    gapAggregation: "market-usd-sum",
    debtAccrued7dInUsd: 70,
    debtRepaid7dInUsd: 35,
    debtCoverage7d: 0.5,
    interestAccrued7dInUsd: 40,
    interestRepaid7dInUsd: 30,
    interestCoverage7d: 0.75
  });

  const exposure = buildCurrentExposureAnalysis({ bundle: input, activeLoans, collateralLoans });
  const coverage7 = exposure.alerts.coverageWindows.find((row) => row.windowDays === 7);

  assert.equal(coverage7.debtAccruedInUsd, 70);
  assert.equal(coverage7.debtRepaidInUsd, 35);
  assert.equal(coverage7.debtCoverageRatio, 0.5);
  assert.equal(coverage7.interestAccruedInUsd, 40);
  assert.equal(coverage7.interestRepaidInUsd, 30);
  assert.equal(coverage7.coverageRatio, 0.75);
  assert.equal(coverage7.valuationMode, "market-usd-sum");
});

test("debt below HF 1.0 and bad debt metrics are calculated correctly for active loans", () => {
  const customLoans = [
    { marketId: "ADA", publicKey: "key1", amount: 100, healthFactor: 0.95, collateral: 150, collaterals: [collateral("ADA", 150)] },
    { marketId: "DJED", publicKey: "key2", amount: 200, healthFactor: 0.80, collateral: 120, collaterals: [collateral("DJED", 120)] },
    { marketId: "ADA", publicKey: "key3", amount: 50, healthFactor: 1.15, collateral: 100, collaterals: [collateral("ADA", 100)] }
  ];
  const exposure = buildCurrentExposureAnalysis({ bundle: bundle(), activeLoans: customLoans, collateralLoans: customLoans });
  assert.equal(exposure.summary.debtBelowHf100InUsd, 300);
  assert.equal(exposure.summary.badDebtInUsd, 200);
  assert.equal(exposure.summary.badDebtCollateralInUsd, 120);
  assert.equal(exposure.summary.badDebtLoanCount, 1);
});

test("health tranches categorize active protocol debt across exact HF ranges", () => {
  const exposure = buildCurrentExposureAnalysis({ bundle: bundle(), activeLoans, collateralLoans });
  const tranches = exposure.healthTranches;
  assert.deepEqual(tranches.map((t) => t.label), ["HF < 1.0", "1 - 1.1", "1.1 - 1.25", "1.25 - 1.5", "1.5 - 2.0", "> 2.0"]);
  assert.equal(tranches.find((t) => t.label === "HF < 1.0").debtInUsd, 0);
  assert.equal(tranches.find((t) => t.label === "1 - 1.1").debtInUsd, 50);
  assert.equal(tranches.find((t) => t.label === "1.1 - 1.25").debtInUsd, 150);
  assert.equal(tranches.find((t) => t.label === "1.25 - 1.5").debtInUsd, 10);
  assert.equal(tranches.find((t) => t.label === "1.5 - 2.0").debtInUsd, 0);
  assert.equal(tranches.find((t) => t.label === "> 2.0").debtInUsd, 0);
});

test("bad debt is mathematically a subset of debt below HF 1.0 even when healthFactor is null, missing, or zero collateral", () => {
  const badDebtMissingHfLoans = [
    { marketId: "ADA", publicKey: "key1", amount: 500, healthFactor: null, collateral: 200, collaterals: [collateral("ADA", 200)] },
    { marketId: "DJED", publicKey: "key2", amount: 300, healthFactor: undefined, collateral: 0, collaterals: [] },
    { marketId: "iUSD", publicKey: "key3", amount: 100, healthFactor: 0.70, collateral: 80, collaterals: [collateral("iUSD", 80)] },
    { marketId: "ADA", publicKey: "key4", amount: 200, healthFactor: 1.30, collateral: 400, collaterals: [collateral("ADA", 400)] }
  ];
  const exposure = buildCurrentExposureAnalysis({ bundle: bundle(), activeLoans: badDebtMissingHfLoans, collateralLoans: badDebtMissingHfLoans });
  assert.equal(exposure.summary.badDebtInUsd, 900);
  assert.equal(exposure.summary.debtBelowHf100InUsd, 900);
  assert.equal(exposure.summary.badDebtInUsd <= exposure.summary.debtBelowHf100InUsd, true);

  const lowHfTranche = exposure.healthTranches.find((t) => t.label === "HF < 1.0");
  assert.equal(lowHfTranche.debtInUsd, 900);
});

test("collateral risk calculates bad debt excess per asset for both collateral and borrowed assets", () => {
  const customLoans = [
    { marketId: "ADA", publicKey: "key1", amount: 150, healthFactor: 0.80, collateral: 100, collaterals: [collateral("ADA", 100)] },
    { marketId: "DJED", publicKey: "key2", amount: 300, healthFactor: 0.50, collateral: 100, collaterals: [collateral("NIGHT", 100)] }
  ];
  const exposure = buildCurrentExposureAnalysis({ bundle: bundle(), activeLoans: customLoans, collateralLoans: customLoans });
  const byCollateral = exposure.collateralRisk.byCollateral;
  const nightRow = byCollateral.find((row) => row.collateralMarketId === "NIGHT");
  const adaRow = byCollateral.find((row) => row.collateralMarketId === "ADA");

  assert.equal(nightRow.badDebtInUsd, 300); // Gross underwater debt
  assert.equal(nightRow.badDebtShortfallInUsd, 200); // 300 - 100 net shortfall
  assert.equal(adaRow.badDebtInUsd, 150);   // Gross underwater debt
  assert.equal(adaRow.badDebtShortfallInUsd, 50);   // 150 - 100 net shortfall
  const highestBadDebtAsset = (byCollateral || []).reduce((best, row) => (row.badDebtInUsd || 0) > (best?.badDebtInUsd || 0) ? row : best, null);
  assert.equal(highestBadDebtAsset.collateralMarketId, "NIGHT");

  const byBorrowed = exposure.collateralRisk.byBorrowed;
  const djedBorrowed = byBorrowed.find((row) => row.borrowedMarketId === "DJED");
  const adaBorrowed = byBorrowed.find((row) => row.borrowedMarketId === "ADA");
  assert.equal(djedBorrowed.badDebtInUsd, 300);
  assert.equal(djedBorrowed.badDebtShortfallInUsd, 200);
  assert.equal(adaBorrowed.badDebtInUsd, 150);
  assert.equal(adaBorrowed.badDebtShortfallInUsd, 50);
  assert.equal(byBorrowed[0].borrowedMarketId, "DJED");
});

test("isolated silos are dynamically discovered and segmented with ring-fenced metrics", () => {
  const customBundle = {
    markets: [
      { id: "ADA", displayName: "ADA", supply: 10_000, borrow: 5_000, group: null, parameters: { borrowCap: 0.95 } },
      { id: "SNEK2", displayName: "SNEK", supply: 500, borrow: 0, group: { id: "SNEK", name: "SNEK" }, parameters: { borrowCap: 0 } },
      { id: "SNEK2-ADA", displayName: "SNEK-ADA", supply: 1_000, borrow: 300, group: { id: "SNEK", name: "SNEK" }, parameters: { borrowCap: 0.95 } },
      { id: "STRIKE", displayName: "STRIKE", supply: 2_000, borrow: 0, group: { id: "STRIKE", name: "STRIKE" }, parameters: { borrowCap: 0 } },
      { id: "STRIKE-USDCx", displayName: "STRIKE-USDCx", supply: 1_500, borrow: 400, group: { id: "STRIKE", name: "STRIKE" }, parameters: { borrowCap: 0.95 } }
    ],
    marketSeriesById: {}
  };

  const customLoans = [
    { marketId: "ADA", publicKey: "key1", amount: 100, healthFactor: 1.5, collateral: 200, collaterals: [collateral("ADA", 200)] },
    { marketId: "SNEK2-ADA", publicKey: "key2", amount: 150, healthFactor: 1.3, collateral: 300, collaterals: [collateral("SNEK2", 300)] },
    { marketId: "STRIKE-USDCx", publicKey: "key3", amount: 200, healthFactor: 1.2, collateral: 500, collaterals: [collateral("STRIKE", 500)] }
  ];

  const exposure = buildCurrentExposureAnalysis({ bundle: customBundle, activeLoans: customLoans, collateralLoans: customLoans });
  assert.equal(exposure.isolatedSilos?.length, 2);

  const snekSilo = exposure.isolatedSilos.find((s) => s.groupName === "SNEK");
  const strikeSilo = exposure.isolatedSilos.find((s) => s.groupName === "STRIKE");

  assert.ok(snekSilo);
  assert.equal(snekSilo.collateralDisplayName, "SNEK");
  assert.equal(snekSilo.totalCollateralInUsd, 500);
  assert.equal(snekSilo.totalDebtInUsd, 150);
  assert.equal(snekSilo.activeLoanCount, 1);
  assert.equal(snekSilo.coverageRatio, 500 / 150);

  assert.ok(strikeSilo);
  assert.equal(strikeSilo.collateralDisplayName, "STRIKE");
  assert.equal(strikeSilo.totalCollateralInUsd, 2_000);
  assert.equal(strikeSilo.totalDebtInUsd, 200);
  assert.equal(strikeSilo.activeLoanCount, 1);
  assert.equal(strikeSilo.coverageRatio, 2_000 / 200);
});

test("POL loans are identified, excluded from organic bad debt, and labeled in concentration analysis", () => {
  const customBundle = {
    markets: [
      { id: "ADA", displayName: "ADA", supply: 10_000, borrow: 5_000, parameters: { borrowCap: 0.95 } },
      { id: "DJED", displayName: "DJED", supply: 5_000, borrow: 3_000, parameters: { borrowCap: 0.95 } }
    ],
    marketSeriesById: {}
  };

  const polLoan = {
    id: "pol-loan-1",
    marketId: "DJED",
    publicKey: LIQWID_POL_PUBLIC_KEY,
    amount: 2_000,
    healthFactor: 39.28,
    collateral: 800,
    collaterals: [{ id: "qpol-col", qTokenName: "qPOL", amount: 800, market: { id: "POL", displayName: "POL" } }]
  };

  const organicLoan = {
    id: "user-loan-1",
    marketId: "ADA",
    publicKey: "user-key-1",
    amount: 100,
    healthFactor: 1.5,
    collateral: 200,
    collaterals: [collateral("ADA", 200)]
  };

  assert.equal(isPolLoan(polLoan), true);
  assert.equal(isPolLoan(organicLoan), false);

  const customLoans = [polLoan, organicLoan];
  const exposure = buildCurrentExposureAnalysis({ bundle: customBundle, activeLoans: customLoans, collateralLoans: customLoans });

  // POL should not trigger organic bad debt despite nominal shortfall (2000 debt > 800 collateral)
  assert.equal(exposure.summary.badDebtInUsd, 0);
  assert.equal(exposure.summary.badDebtShortfallInUsd, 0);
  assert.equal(exposure.summary.badDebtLoanCount, 0);
  assert.equal(exposure.summary.polDebtInUsd, 2_000);
  assert.equal(exposure.summary.polCollateralInUsd, 800);
  assert.equal(exposure.summary.polLoanCount, 1);

  // Key 1 (the POL key) should be labeled as Liqwid POL (Team/Protocol)
  const polKeyRow = exposure.borrowerConcentration.observedKeyExposure?.rows?.find((r) => r.isPolKey);
  assert.ok(polKeyRow);
  assert.equal(polKeyRow.observedKeyLabel, "Liqwid POL (Team/Protocol)");
  assert.equal(polKeyRow.totalDebtInUsd, 2_000);

  // Collateral risk and price decline shock scenarios must strictly exclude POL loans
  const shockCollaterals = exposure.collateralRisk.shockScenarios.map((s) => s.collateralMarketId);
  assert.equal(shockCollaterals.includes("POL"), false, "POL collateral must be excluded from shock scenarios");
  const collateralMarketIds = exposure.collateralRisk.byCollateral.map((c) => c.marketId);
  assert.equal(collateralMarketIds.includes("POL"), false, "POL collateral must be excluded from collateral risk byCollateral");
  const totalAttributedCollateralDebt = exposure.collateralRisk.byCollateral.reduce((sum, c) => sum + c.attributedDebtInUsd, 0);
  assert.equal(totalAttributedCollateralDebt, 100, "Collateral risk total attributed debt must reflect only organic loans ($100)");
});




