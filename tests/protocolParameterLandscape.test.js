import assert from "node:assert/strict";
import test from "node:test";

import { buildMarketParametersAnalysis } from "../src/browser/marketParameterHistory.js";
import { buildProtocolParameterLandscape } from "../src/browser/protocolParameterLandscape.js";

function parameterEvent(timestamp, overrides = {}) {
  return {
    timestamp,
    txHash: `tx-${timestamp}`,
    baseRate: 0.000001,
    utilMultiplier: 0.000002,
    utilMultiplierJump: 0.0001,
    kink: 0.5,
    supplyCap: null,
    borrowCap: 0.8,
    incomeRatioSum: 100,
    incomeRatioSuppliers: 80,
    incomeRatioDividends: 10,
    incomeRatioTreasury: 5,
    baseBorrowerAPR: 0.02,
    baseSupplierAPY: 0,
    optimalBorrowerAPR: 0.1,
    optimalSupplierAPY: 0.04,
    maxBorrowerAPR: 0.6,
    maxSupplierAPY: 0.4,
    ...overrides
  };
}

function currentMarket(id, overrides = {}) {
  return {
    id,
    displayName: id,
    symbol: id,
    supply: 1000,
    borrow: 800,
    liquidity: 200,
    utilization: 0.8,
    loanOriginationFeePercentage: 0,
    asset: { id, displayName: id, symbol: id, price: 2 },
    parameters: {
      minValue: 30,
      minHealthFactor: 1.15,
      actionCount: 4,
      maxCollateralCount: 5,
      maxBatchTime: 15000000,
      minBatchSize: 4,
      minBatchTime: 300000,
      closeFactor0: 0.5,
      collateralParameters: [{
        collateral: { id: "COLL-A", displayName: "Collateral A", symbol: "CA" },
        maxLoanToValue: 0.7,
        weightedMaxLoanToValue: 0.65,
        liquidationThreshold: 0.8,
        weightedLiquidationThreshold: 0.75,
        liquidationPenalty: 0.1,
        liquidationProfitability: 0.05,
        collateralWeight: 0.9
      }]
    },
    ...overrides
  };
}

function daily(marketId, date, supplyInUsd, borrowInUsd) {
  return {
    marketId,
    date,
    timestamp: `${date}T00:00:00.000Z`,
    supplyInUsd,
    borrowInUsd,
    utilizationPercentage: supplyInUsd > 0 ? borrowInUsd / supplyInUsd : 0
  };
}

test("protocol parameter landscape separates current official settings from derived protocol roll-ups", () => {
  const markets = [
    currentMarket("A"),
    currentMarket("B", {
      supply: 500,
      borrow: 100,
      liquidity: 400,
      utilization: 0.2,
      asset: { id: "B", displayName: "B", symbol: "B", price: 1 },
      parameters: {
        minValue: 10,
        minHealthFactor: 1.1,
        actionCount: 3,
        maxCollateralCount: 4,
        maxBatchTime: 20000000,
        minBatchSize: 2,
        minBatchTime: 300000,
        closeFactor0: 0.4,
        collateralParameters: [{
          collateral: { id: "COLL-B", displayName: "Collateral B", symbol: "CB" },
          maxLoanToValue: 0.6,
          weightedMaxLoanToValue: 0.55,
          liquidationThreshold: 0.72,
          weightedLiquidationThreshold: 0.68,
          liquidationPenalty: 0.12,
          liquidationProfitability: 0.06,
          collateralWeight: 0.8
        }]
      }
    }),
    currentMarket("POL", { supply: 9000, borrow: 9000 })
  ];
  const marketParamsById = {
    A: [
      parameterEvent("2026-01-01T12:00:00.000Z"),
      parameterEvent("2026-01-03T12:00:00.000Z", {
        kink: 0.7,
        borrowCap: 0.9,
        supplyCap: 700
      })
    ],
    B: [parameterEvent("2026-01-01T08:00:00.000Z", {
      kink: 0.4,
      borrowCap: null,
      incomeRatioSuppliers: 70,
      incomeRatioDividends: 15,
      incomeRatioTreasury: 10
    })],
    POL: [parameterEvent("2026-01-01T08:00:00.000Z")]
  };
  const marketSeriesById = {
    A: [
      daily("A", "2026-01-01", 1000, 600),
      daily("A", "2026-01-02", 1000, 650),
      daily("A", "2026-01-03", 1000, 800)
    ],
    B: [
      daily("B", "2026-01-01", 500, 100),
      daily("B", "2026-01-02", 500, 100),
      daily("B", "2026-01-03", 500, 100)
    ],
    POL: [daily("POL", "2026-01-03", 9000, 9000)]
  };
  const marketParameters = buildMarketParametersAnalysis({
    markets,
    marketParamsById,
    marketSeriesById
  });

  const landscape = buildProtocolParameterLandscape({
    markets,
    marketParameters,
    marketSeriesById
  });

  assert.equal(landscape.current.totalMarketCount, 2);
  assert.equal(landscape.current.parameterizedMarketCount, 2);
  assert.equal(landscape.current.totalBorrowInUsd, 900);
  assert.equal(landscape.current.parameterizedBorrowInUsd, 900);
  assert.equal(landscape.current.parameterCoverage, 1);
  assert.equal(landscape.current.borrowWeightedKink, 2 / 3);
  assert.equal(landscape.current.borrowWeightedUtilizationCap, (800 * 0.9 + 100) / 900);
  assert.equal(landscape.current.borrowAboveKinkInUsd, 100);
  assert.equal(landscape.current.borrowAboveKinkShare, 1 / 9);
  assert.equal(landscape.current.cappedMarketCount, 1);
  assert.equal(landscape.current.supplyCapHeadroomInUsd, 400);
  assert.equal(landscape.current.collateralPairCount, 2);
  assert.equal(landscape.current.latestGovernanceEvent.marketId, "A");
  assert.equal(landscape.current.latestGovernanceEvent.timestamp, "2026-01-03T12:00:00.000Z");

  assert.equal(landscape.marketRows.length, 2);
  assert.equal(landscape.marketRows[0].marketId, "A");
  assert.equal(landscape.marketRows[0].supplyCapInUsd, 1400);
  assert.equal(landscape.marketRows[0].supplyCapHeadroomInUsd, 400);
  assert.equal(landscape.marketRows[0].minHealthFactor, 1.15);
  assert.equal(landscape.marketRows[0].closeFactor, 0.5);
  assert.equal(landscape.collateralRows.length, 2);
  assert.deepEqual(
    landscape.collateralRows.map((row) => row.collateralMarketId),
    ["COLL-A", "COLL-B"]
  );
  assert.equal(landscape.collateralSummaryRows.length, 2);
  assert.equal(landscape.collateralSummaryRows[0].marketId, "A");
  assert.equal(landscape.collateralSummaryRows[0].minimumMaxLoanToValue, 0.7);
  assert.equal(landscape.collateralSummaryRows[0].maximumLiquidationPenalty, 0.1);
  assert.ok(landscape.rateCurveAtlas.rows.some((row) =>
    row.marketId === "A" && row.utilization === 0.7 && row.rate === 0.1
  ));
  assert.deepEqual(landscape.rateCurveAtlas.marketIds, ["A", "B"]);
});

test("protocol parameter history uses end-of-day effective events and borrow-value weights", () => {
  const markets = [
    currentMarket("A"),
    currentMarket("B", {
      supply: 500,
      borrow: 100,
      utilization: 0.2,
      asset: { id: "B", displayName: "B", symbol: "B", price: 1 }
    })
  ];
  const marketParamsById = {
    A: [
      parameterEvent("2026-01-01T12:00:00.000Z"),
      parameterEvent("2026-01-03T12:00:00.000Z", { kink: 0.7, borrowCap: 0.9 })
    ],
    B: [parameterEvent("2026-01-01T08:00:00.000Z", { kink: 0.4, borrowCap: null })]
  };
  const marketSeriesById = {
    A: [
      daily("A", "2026-01-01", 1000, 600),
      daily("A", "2026-01-02", 1000, 650),
      daily("A", "2026-01-03", 1000, 800)
    ],
    B: [
      daily("B", "2026-01-01", 500, 100),
      daily("B", "2026-01-02", 500, 100),
      daily("B", "2026-01-03", 500, 100)
    ]
  };
  const marketParameters = buildMarketParametersAnalysis({
    markets,
    marketParamsById,
    marketSeriesById
  });

  const landscape = buildProtocolParameterLandscape({
    markets,
    marketParameters,
    marketSeriesById
  });

  assert.deepEqual(landscape.history.map((row) => row.date), [
    "2026-01-01",
    "2026-01-02",
    "2026-01-03"
  ]);
  assert.equal(landscape.history[0].borrowWeightedKink, (600 * 0.5 + 100 * 0.4) / 700);
  assert.equal(landscape.history[0].borrowAboveKinkInUsd, 100);
  assert.equal(landscape.history[1].borrowAboveKinkInUsd, 150);
  assert.equal(landscape.history[2].borrowWeightedKink, 2 / 3);
  assert.equal(landscape.history[2].borrowAboveKinkInUsd, 100);
  assert.equal(landscape.history.every((row) => row.parameterCoverage === 1), true);

  assert.equal(landscape.governanceEvents.length, 3);
  assert.equal(landscape.governanceEvents[0].timestamp, "2026-01-03T12:00:00.000Z");
  assert.deepEqual(landscape.governanceEvents[0].changedFields, ["borrowCap", "kink"]);
  assert.equal(landscape.governanceEvents[0].changedFieldCount, 2);
  assert.deepEqual(landscape.governanceActivity.map((row) => ({
    date: row.date,
    updateCount: row.updateCount,
    changedParameterCount: row.changedParameterCount
  })), [
    { date: "2026-01-01", updateCount: 2, changedParameterCount: 0 },
    { date: "2026-01-03", updateCount: 1, changedParameterCount: 2 }
  ]);
});

test("legacy archives without current guardrail fields remain explicitly unavailable", () => {
  const markets = [currentMarket("A", { parameters: undefined })];
  const marketSeriesById = { A: [daily("A", "2026-01-01", 1000, 800)] };
  const marketParameters = buildMarketParametersAnalysis({
    markets,
    marketParamsById: { A: [parameterEvent("2026-01-01T00:00:00.000Z")] },
    marketSeriesById
  });

  const landscape = buildProtocolParameterLandscape({
    markets,
    marketParameters,
    marketSeriesById
  });

  assert.equal(landscape.current.collateralPairCount, 0);
  assert.equal(landscape.marketRows[0].minHealthFactor, null);
  assert.equal(landscape.marketRows[0].closeFactor, null);
  assert.deepEqual(landscape.collateralRows, []);
});
