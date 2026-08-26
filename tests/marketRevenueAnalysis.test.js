import assert from "node:assert/strict";
import test from "node:test";

import { buildMarketRevenueAnalysis } from "../src/browser/marketRevenueAnalysis.js";

function history(marketId, date, overrides = {}) {
  return {
    marketId,
    marketDisplayName: marketId,
    timestamp: `${date}T00:00:00.000Z`,
    date,
    borrowInUsd: 1000,
    borrowApr: 0.1,
    interestAccruedInUsd: 10,
    interestRepaidInUsd: 0,
    loanOriginationFeesInUsd: 0,
    loanOriginationFeesMinAdaInUsd: 0,
    ...overrides
  };
}

function parameters(marketId, timestamp, supplierRatio = 8, ratioSum = 10) {
  return {
    marketId,
    timestamp,
    txHash: `${marketId}-${timestamp}`,
    incomeRatioSum: ratioSum,
    incomeRatioSuppliers: supplierRatio,
    incomeRatioDividends: 0,
    incomeRatioTreasury: 0
  };
}

test("market interest accrual and annualized run rate use the effective supplier and non-supplier shares", () => {
  const analysis = buildMarketRevenueAnalysis({
    markets: [{ id: "DJED", displayName: "DJED" }],
    marketSeriesById: {
      DJED: [
        history("DJED", "2026-07-27", {
          borrowInUsd: 2200397.9066088796,
          borrowApr: 0.2432402493,
          interestAccruedInUsd: 496.56754357676
        }),
        history("DJED", "2026-07-28", {
          borrowInUsd: 2204643.3521107505,
          borrowApr: 0.23542279185,
          interestAccruedInUsd: 563.38775314414
        })
      ]
    },
    marketParamsById: {
      DJED: [parameters("DJED", "2026-07-01T00:00:00.000Z")]
    },
    protocolRevenueDaily: [],
    generatedAt: "2026-07-29T08:00:00.000Z"
  });

  const market = analysis.byMarket.DJED;
  assert.equal(market.daily.length, 2);
  assert.equal(market.daily[0].supplierInterestShare, 0.8);
  assert.equal(market.daily[0].protocolInterestShare, 0.2);
  assert.ok(Math.abs(market.summary.accruedInterestInUsd - 1059.9552967209) < 1e-9);
  assert.ok(Math.abs(market.summary.accruedSupplierInterestIncomeInUsd - 847.96423737672) < 1e-9);
  assert.ok(Math.abs(market.summary.accruedProtocolInterestRevenueInUsd - 211.99105934418) < 1e-9);

  const expectedAnnualized = 2204643.3521107505 * 0.23542279185;
  assert.ok(Math.abs(market.summary.projectedAnnualizedInterestIncomeInUsd - expectedAnnualized) < 1e-9);
  assert.ok(Math.abs(market.summary.projectedAnnualizedSupplierInterestIncomeInUsd - expectedAnnualized * 0.8) < 1e-9);
  assert.ok(Math.abs(market.summary.projectedAnnualizedProtocolInterestRevenueInUsd - expectedAnnualized * 0.2) < 1e-9);
});

test("collected retained-interest attribution reconciles the official protocol total using parameter-weighted market repayments", () => {
  const analysis = buildMarketRevenueAnalysis({
    markets: [{ id: "A" }, { id: "B" }],
    marketSeriesById: {
      A: [history("A", "2026-07-20", {
        interestRepaidInUsd: 80,
        loanOriginationFeesInUsd: 3
      })],
      B: [history("B", "2026-07-20", {
        interestRepaidInUsd: 20,
        loanOriginationFeesMinAdaInUsd: 1
      })]
    },
    marketParamsById: {
      A: [parameters("A", "2026-01-01T00:00:00.000Z", 8)],
      B: [parameters("B", "2026-01-01T00:00:00.000Z", 9)]
    },
    protocolRevenueDaily: [{
      date: "2026-07-20",
      revenueFromRepaidInterestInUsd: 18,
      isComplete: true
    }],
    generatedAt: "2026-07-21T08:00:00.000Z"
  });

  const a = analysis.byMarket.A;
  const b = analysis.byMarket.B;
  assert.equal(a.daily[0].retainedInterestAttributionWeightInUsd, 16);
  assert.equal(b.daily[0].retainedInterestAttributionWeightInUsd, 2);
  assert.equal(a.daily[0].attributedCollectedInterestRevenueInUsd, 16);
  assert.equal(b.daily[0].attributedCollectedInterestRevenueInUsd, 2);
  assert.equal(a.daily[0].attributedCollectedMarketRevenueInUsd, 19);
  assert.equal(b.daily[0].attributedCollectedMarketRevenueInUsd, 3);
  assert.equal(a.summary.ytdAttributedCollectedInterestRevenueInUsd, 16);
  assert.equal(a.summary.ytdAttributedCollectedMarketRevenueInUsd, 19);
  assert.equal(analysis.protocolReconciliation.daily[0].officialCollectedInterestRevenueInUsd, 18);
  assert.equal(analysis.protocolReconciliation.daily[0].attributedCollectedInterestRevenueInUsd, 18);
  assert.equal(analysis.protocolReconciliation.daily[0].differenceInUsd, 0);
});

test("a positive repayment from a market without an effective parameter makes that day's attribution unavailable", () => {
  const analysis = buildMarketRevenueAnalysis({
    markets: [{ id: "A" }, { id: "B" }],
    marketSeriesById: {
      A: [history("A", "2026-07-20", { interestRepaidInUsd: 80 })],
      B: [history("B", "2026-07-20", { interestRepaidInUsd: 20 })]
    },
    marketParamsById: {
      A: [parameters("A", "2026-01-01T00:00:00.000Z", 8)]
    },
    protocolRevenueDaily: [{
      date: "2026-07-20",
      revenueFromRepaidInterestInUsd: 20,
      isComplete: true
    }],
    generatedAt: "2026-07-21T08:00:00.000Z"
  });

  assert.equal(analysis.byMarket.A.daily[0].collectedInterestAttributionAvailable, false);
  assert.equal(analysis.byMarket.B.daily[0].collectedInterestAttributionAvailable, false);
  assert.equal(analysis.byMarket.A.summary.ytdAttributedCollectedInterestRevenueInUsd, null);
  assert.equal(analysis.protocolReconciliation.daily[0].isComplete, false);
  assert.match(analysis.protocolReconciliation.daily[0].reason, /missing effective market parameters/i);
});

test("the latest parameter effective by the UTC day end controls that day's accrual split", () => {
  const analysis = buildMarketRevenueAnalysis({
    markets: [{ id: "A" }],
    marketSeriesById: {
      A: [
        history("A", "2026-07-19", { interestAccruedInUsd: 100 }),
        history("A", "2026-07-20", { interestAccruedInUsd: 100 })
      ]
    },
    marketParamsById: {
      A: [
        parameters("A", "2026-01-01T00:00:00.000Z", 8),
        parameters("A", "2026-07-20T12:00:00.000Z", 7)
      ]
    },
    protocolRevenueDaily: [],
    generatedAt: "2026-07-21T08:00:00.000Z"
  });

  assert.equal(analysis.byMarket.A.daily[0].protocolInterestShare, 0.2);
  assert.equal(analysis.byMarket.A.daily[0].accruedProtocolInterestRevenueInUsd, 20);
  assert.equal(analysis.byMarket.A.daily[1].protocolInterestShare, 0.3);
  assert.equal(analysis.byMarket.A.daily[1].accruedProtocolInterestRevenueInUsd, 30);
});

test("market revenue analysis aggregates and sorts YTD revenue contributions across markets and identifies the top market", () => {
  const analysis = buildMarketRevenueAnalysis({
    markets: [{ id: "A", displayName: "Market A" }, { id: "B", displayName: "Market B" }, { id: "C", displayName: "Market C" }],
    marketSeriesById: {
      A: [history("A", "2026-07-20", {
        interestRepaidInUsd: 80,
        loanOriginationFeesInUsd: 3
      })],
      B: [history("B", "2026-07-20", {
        interestRepaidInUsd: 20,
        loanOriginationFeesMinAdaInUsd: 1
      })],
      C: [history("C", "2026-07-20", {
        interestRepaidInUsd: 0,
        loanOriginationFeesInUsd: 0
      })]
    },
    marketParamsById: {
      A: [parameters("A", "2026-01-01T00:00:00.000Z", 8)],
      B: [parameters("B", "2026-01-01T00:00:00.000Z", 9)],
      C: [parameters("C", "2026-01-01T00:00:00.000Z", 8)]
    },
    protocolRevenueDaily: [{
      date: "2026-07-20",
      revenueFromRepaidInterestInUsd: 18,
      loanOriginationFeesInUsd: 3,
      loanOriginationFeesMinAdaInUsd: 1,
      isComplete: true
    }],
    generatedAt: "2026-07-21T08:00:00.000Z"
  });

  assert.ok(Array.isArray(analysis.ytdMarketContributions));
  assert.equal(analysis.ytdMarketContributions.length, 3);
  assert.equal(analysis.ytdMarketContributions[0].marketId, "A");
  assert.equal(analysis.ytdMarketContributions[0].totalRevenueInUsd, 19);
  assert.equal(analysis.ytdMarketContributions[0].attributedCollectedInterestRevenueInUsd, 16);
  assert.equal(analysis.ytdMarketContributions[0].directOriginationRevenueInUsd, 3);
  assert.ok(Math.abs(analysis.ytdMarketContributions[0].revenueShare - (19 / 22)) < 1e-6);

  assert.equal(analysis.ytdMarketContributions[1].marketId, "B");
  assert.equal(analysis.ytdMarketContributions[1].totalRevenueInUsd, 3);
  assert.ok(Math.abs(analysis.ytdMarketContributions[1].revenueShare - (3 / 22)) < 1e-6);

  assert.equal(analysis.ytdMarketContributions[2].marketId, "C");
  assert.equal(analysis.ytdMarketContributions[2].totalRevenueInUsd, 0);
  assert.equal(analysis.ytdMarketContributions[2].revenueShare, 0);

  assert.ok(analysis.topYtdMarket);
  assert.equal(analysis.topYtdMarket.marketId, "A");
  assert.equal(analysis.topYtdMarket.marketDisplayName, "Market A");
  assert.equal(analysis.topYtdMarket.totalRevenueInUsd, 19);
  assert.ok(Math.abs(analysis.topYtdMarket.revenueShare - (19 / 22)) < 1e-6);
});
