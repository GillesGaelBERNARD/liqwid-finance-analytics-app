import assert from "node:assert/strict";
import test from "node:test";
import {
  categorizeMarketAsset,
  isMatchingMarketCollateral,
  buildMarketCollateralUsageAnalysis
} from "../src/browser/marketCollateralUsage.js";

test("categorizeMarketAsset accurately identifies stables, LPs, and volatile tokens", () => {
  assert.equal(categorizeMarketAsset("USDM", "USDM"), "Stablecoin");
  assert.equal(categorizeMarketAsset("DJED", "DJED"), "Stablecoin");
  assert.equal(categorizeMarketAsset("USDCx", "USDCx"), "Stablecoin");
  assert.equal(categorizeMarketAsset("USDT", "wanUSDT"), "Stablecoin");
  assert.equal(categorizeMarketAsset("USDCx-USDM-SUNDAE-LP-STABLESWAP", "LPS-USDCx-USDM"), "Stableswap LP");
  assert.equal(categorizeMarketAsset("USDM-USDA-MINSWAP-LP-STABLE", "LPM-USDM-USDA"), "Stableswap LP");
  assert.equal(categorizeMarketAsset("Ada", "ADA"), "Volatile Crypto");
  assert.equal(categorizeMarketAsset("BTC", "wanBTC"), "Volatile Crypto");
  assert.equal(categorizeMarketAsset("SNEK", "SNEK"), "Volatile Crypto");
  assert.equal(categorizeMarketAsset("NIGHT", "NIGHT"), "Volatile Crypto");
});

test("isMatchingMarketCollateral correctly matches collateral items to markets", () => {
  const adaMarket = { id: "Ada", symbol: "ADA", displayName: "ADA" };
  const djedMarket = { id: "DJED", symbol: "DJED", displayName: "DJED" };
  const btcMarket = { id: "BTC", symbol: "wanBTC", displayName: "wanBTC" };

  assert.ok(isMatchingMarketCollateral({ market: { id: "Ada" }, qTokenName: "qADA" }, adaMarket));
  assert.ok(isMatchingMarketCollateral({ marketId: "Ada", qTokenName: "qADA" }, adaMarket));
  assert.ok(isMatchingMarketCollateral({ qTokenName: "qDJED" }, djedMarket));
  assert.ok(isMatchingMarketCollateral({ qTokenName: "qwanBTC" }, btcMarket));
  assert.ok(!isMatchingMarketCollateral({ qTokenName: "qADA" }, djedMarket));
  // Ensure no false-positive matching between USDCx and wanUSDC (USDC)
  const usdcxItem = { qTokenName: "qUSDCx", market: { id: "USDCx", displayName: "USDCx" } };
  const wanUsdcMarket = { id: "USDC", symbol: "wanUSDC", displayName: "wanUSDC" };
  assert.equal(isMatchingMarketCollateral(usdcxItem, wanUsdcMarket), false);
});

test("buildMarketCollateralUsageAnalysis computes accurate collateral usage and pro-rata debt attribution", () => {
  const markets = [
    { id: "Ada", symbol: "ADA", displayName: "ADA", supply: 1000 },
    { id: "DJED", symbol: "DJED", displayName: "DJED", supply: 500 },
    { id: "USDCx", symbol: "USDCx", displayName: "USDCx", supply: 200 }
  ];

  const allLoans = [
    // Loan 1: Pure ADA collateral ($100), borrowing $40 DJED
    {
      id: "loan-1",
      marketId: "DJED",
      hasDebt: true,
      amount: 40,
      adjustedAmount: 40,
      LTV: 0.4,
      healthFactor: 2.0,
      collaterals: [
        { market: { id: "Ada" }, qTokenName: "qADA", amountInUsd: 100 }
      ]
    },
    // Loan 2: 50% ADA ($50) + 50% DJED ($50) collateral ($100 total), borrowing $50 USDCx
    {
      id: "loan-2",
      marketId: "USDCx",
      hasDebt: true,
      amount: 50,
      adjustedAmount: 50,
      LTV: 0.5,
      healthFactor: 1.6,
      collaterals: [
        { market: { id: "Ada" }, qTokenName: "qADA", amountInUsd: 50 },
        { market: { id: "DJED" }, qTokenName: "qDJED", amountInUsd: 50 }
      ]
    },
    // Loan 3: Idle ADA collateral ($30), 0 debt
    {
      id: "loan-3",
      marketId: "Ada",
      hasDebt: false,
      amount: 0,
      adjustedAmount: 0,
      LTV: 0,
      healthFactor: 0,
      collaterals: [
        { market: { id: "Ada" }, qTokenName: "qADA", amountInUsd: 30 }
      ]
    }
  ];

  const analysis = buildMarketCollateralUsageAnalysis({ markets, allLoans });
  const adaUsage = analysis.byMarket.Ada;

  assert.ok(adaUsage, "ADA collateral usage should be computed");
  // Total collateral = 100 (Loan 1) + 50 (Loan 2) + 30 (Loan 3) = 180
  assert.equal(adaUsage.totalCollateralInUsd, 180);
  // Active collateral = 100 + 50 = 150
  assert.equal(adaUsage.activeCollateralInUsd, 150);
  // Idle collateral = 30
  assert.equal(adaUsage.idleCollateralInUsd, 30);
  assert.equal(adaUsage.loanCount, 3);
  assert.equal(adaUsage.activeLoanCount, 2);
  assert.equal(adaUsage.idleLoanCount, 1);
  assert.equal(adaUsage.activeUtilization, 150 / 180);

  // Attributed debt:
  // Loan 1: 40 * (100 / 100) = 40 (DJED)
  // Loan 2: 50 * (50 / 100) = 25 (USDCx)
  // Total attributed debt = 40 + 25 = 65
  assert.equal(adaUsage.totalAttributedDebtInUsd, 65);
  assert.equal(adaUsage.effectiveLtv, 65 / 150);

  // Borrows breakdown:
  assert.equal(adaUsage.borrows.length, 2);
  const topBorrow = adaUsage.borrows[0];
  assert.equal(topBorrow.borrowedMarketId, "DJED");
  assert.equal(topBorrow.attributedDebtInUsd, 40);
  assert.equal(topBorrow.shareOfDebt, 40 / 65);

  const secondBorrow = adaUsage.borrows[1];
  assert.equal(secondBorrow.borrowedMarketId, "USDCx");
  assert.equal(secondBorrow.attributedDebtInUsd, 25);
  assert.equal(secondBorrow.shareOfDebt, 25 / 65);

  // Top loans list:
  assert.equal(adaUsage.topLoans.length, 2);
  assert.equal(adaUsage.topLoans[0].id, "loan-1");
  assert.equal(adaUsage.topLoans[0].attributedDebtInUsd, 40);

  // Dual-format property aliases and categoryBreakdown array verification:
  assert.equal(adaUsage.totalCollateralUsd, 180);
  assert.equal(adaUsage.activeCollateralUsd, 150);
  assert.equal(adaUsage.idleCollateralUsd, 30);
  assert.equal(adaUsage.activeCollateralUtilization, 150 / 180);
  assert.equal(adaUsage.totalAttributedDebtUsd, 65);
  assert.equal(adaUsage.effectiveCollateralLtv, 65 / 150);
  assert.ok(Array.isArray(adaUsage.categoryBreakdown), "categoryBreakdown must be an array for .map()");
  assert.equal(typeof adaUsage.categoryBreakdown.map, "function");
  assert.equal(adaUsage.categoryBreakdown.length, 3);
  assert.ok(adaUsage.categoryBreakdown.stablecoins, "categoryBreakdown must support object key lookup");
  assert.equal(adaUsage.borrowedAssets.length, 2);
  assert.equal(adaUsage.topLoans[0].collateralUsd, 100);
  assert.equal(adaUsage.topLoans[0].attributedDebtUsd, 40);
  assert.equal(adaUsage.marketSupplyUsd, 1000);
  assert.equal(adaUsage.collateralShareOfSupply, 180 / 1000);
  assert.equal(adaUsage.supplyUsedAsCollateral, 180 / 1000);
  assert.equal(adaUsage.uncollateralizedSupplyUsd, 820);

  // Protocol aggregation verification:
  const protocol = analysis.protocol;
  assert.ok(protocol, "protocol rollup must be present in analysis");
  assert.equal(protocol.totalCollateralUsd, 230); // 180 (Ada) + 50 (DJED)
  assert.equal(protocol.activeCollateralUsd, 200); // 150 (Ada) + 50 (DJED)
  assert.equal(protocol.idleCollateralUsd, 30);
  assert.equal(protocol.totalMarketSupplyUsd, 1700); // 1000 (Ada) + 500 (DJED) + 200 (USDCx)
  assert.equal(protocol.protocolCollateralShareOfSupply, 230 / 1700);
  assert.equal(protocol.totalAttributedDebtUsd, 90); // 40 (DJED) + 50 (USDCx)
  assert.equal(protocol.effectiveProtocolLtv, 90 / 230);
  assert.equal(protocol.activeLoansCount, 2); // loan-1, loan-2
  assert.equal(protocol.topCollateralAsset.symbol, "ADA");
  assert.ok(protocol.marketCollateralList.length >= 2);
  assert.ok(protocol.collateralSpectrum.length >= 2);
  assert.ok(protocol.crossAssetPairings.length >= 2);
  assert.ok(protocol.categoryFlowRows.length >= 1);
});

test("buildMarketCollateralUsageAnalysis handles markets with zero collateral deposits gracefully", () => {
  const markets = [{ id: "EMPTY", symbol: "EMPTY", displayName: "Empty Market" }];
  const allLoans = [];

  const analysis = buildMarketCollateralUsageAnalysis({ markets, allLoans });
  const usage = analysis.byMarket.EMPTY;

  assert.ok(usage);
  assert.equal(usage.totalCollateralInUsd, 0);
  assert.equal(usage.activeCollateralInUsd, 0);
  assert.equal(usage.totalAttributedDebtInUsd, 0);
  assert.equal(usage.effectiveLtv, 0);
  assert.equal(usage.loanCount, 0);
  assert.equal(usage.borrows.length, 0);
});

test("isMatchingMarketCollateral prevents cross-market false positives when collateral specifies market ID (e.g. SNEK vs SNEK2)", () => {
  const snekMarket = { id: "SNEK", symbol: "SNEK", displayName: "SNEK" };
  const snek2Market = { id: "SNEK2", symbol: "SNEK", displayName: "SNEK" };
  const snekCollateral = { market: { id: "SNEK" }, qTokenName: "qSNEK" };

  assert.ok(isMatchingMarketCollateral(snekCollateral, snekMarket), "SNEK collateral must match SNEK market");
  assert.equal(isMatchingMarketCollateral(snekCollateral, snek2Market), false, "SNEK collateral must NOT match SNEK2 market even though symbols match");
});

test("buildMarketCollateralUsageAnalysis isolates same-symbol markets, caps collateralShareOfSupply at 100%, and deduplicates spectrum", () => {
  const markets = [
    { id: "SNEK", symbol: "SNEK", displayName: "SNEK", supply: 40000 },
    { id: "SNEK2", symbol: "SNEK", displayName: "SNEK", supply: 0.0004 },
    { id: "POL", symbol: "POL", displayName: "POL", supply: 100 },
    { id: "ADA", symbol: "ADA", displayName: "ADA", supply: 1000 }
  ];

  const allLoans = [
    // SNEK collateral in a loan borrowing ADA
    {
      id: "loan-snek",
      marketId: "ADA",
      hasDebt: true,
      amount: 1000,
      adjustedAmount: 1000,
      collaterals: [
        { market: { id: "SNEK" }, qTokenName: "qSNEK", amountInUsd: 10000 }
      ]
    },
    // POL collateral with 110 USD locked on 100 USD supply (batch lag artifact)
    {
      id: "loan-pol",
      marketId: "ADA",
      hasDebt: true,
      amount: 50,
      adjustedAmount: 50,
      collaterals: [
        { market: { id: "POL" }, qTokenName: "qPOL", amountInUsd: 110 }
      ]
    }
  ];

  const analysis = buildMarketCollateralUsageAnalysis({ markets, allLoans });

  // SNEK must have 10,000 USD collateral and 25% share of supply
  const snekUsage = analysis.byMarket.SNEK;
  assert.ok(snekUsage);
  assert.equal(snekUsage.totalCollateralInUsd, 10000);
  assert.equal(snekUsage.collateralShareOfSupply, 10000 / 40000);

  // SNEK2 must have 0 collateral and 0% share
  const snek2Usage = analysis.byMarket.SNEK2;
  assert.ok(snek2Usage);
  assert.equal(snek2Usage.totalCollateralInUsd, 0);
  assert.equal(snek2Usage.collateralShareOfSupply, 0);

  // POL must be capped at 1.0 (100%) despite 110 / 100 raw ratio
  const polUsage = analysis.byMarket.POL;
  assert.ok(polUsage);
  assert.equal(polUsage.totalCollateralInUsd, 110);
  assert.equal(polUsage.collateralShareOfSupply, 1.0, "collateralShareOfSupply must be capped at 1.0");

  // Spectrum must deduplicate and not include SNEK2
  const spectrum = analysis.protocol.collateralSpectrum;
  const snekEntries = spectrum.filter((m) => m.symbol === "SNEK" || m.displayName === "SNEK");
  assert.equal(snekEntries.length, 1, "Spectrum must contain exactly one SNEK entry");
  assert.equal(snekEntries[0].marketId, "SNEK");
  assert.equal(snekEntries[0].collateralShareOfSupply, 0.25);

  const snek2Entries = spectrum.filter((m) => m.marketId === "SNEK2");
  assert.equal(snek2Entries.length, 0, "Spectrum must not contain 0-collateral SNEK2");
});

