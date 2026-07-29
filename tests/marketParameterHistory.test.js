import assert from "node:assert/strict";
import test from "node:test";

import {
  buildMarketParametersAnalysis,
  buildParameterStepSeries,
  buildRateCurve,
  normalizeMarketParameterRows
} from "../src/browser/marketParameterHistory.js";

function params(timestamp, overrides = {}) {
  return {
    timestamp,
    txHash: `tx-${timestamp}`,
    baseRate: "0.000001",
    utilMultiplier: "0.000002",
    utilMultiplierJump: "0.000100",
    kink: "0.80",
    supplyCap: "",
    borrowCap: "0.90",
    incomeRatioSum: "10",
    incomeRatioSuppliers: "8",
    incomeRatioDividends: "1",
    incomeRatioTreasury: "0",
    baseBorrowerAPR: "0.05",
    baseSupplierAPY: "0.02",
    optimalBorrowerAPR: "0.10",
    optimalSupplierAPY: "0.068",
    maxBorrowerAPR: "0.60",
    maxSupplierAPY: "0.434",
    ...overrides
  };
}

test("parameter rows normalize nullable fields, numbers, ordering, and duplicate timestamps", () => {
  const rows = normalizeMarketParameterRows([
    params("2026-03-01T12:00:00.000Z", { kink: "0.85" }),
    params("2026-01-01T12:00:00.000Z", { supplyCap: null, borrowCap: null }),
    params("2026-03-01T12:00:00.000Z", { kink: "0.90", txHash: "replacement" })
  ]);

  assert.equal(rows.length, 2);
  assert.equal(rows[0].timestamp, "2026-01-01T12:00:00.000Z");
  assert.equal(rows[0].supplyCap, null);
  assert.equal(rows[0].borrowCap, null);
  assert.equal(rows[1].kink, 0.9);
  assert.equal(rows[1].txHash, "replacement");
  assert.equal(rows[1].incomeRatioSuppliers, 8);
});

test("parameter history draws exact effective-time steps without inventing daily changes", () => {
  const first = params("2026-01-01T12:00:00.000Z", { kink: "0.70" });
  const second = params("2026-02-10T18:30:15.000Z", { kink: "0.85" });
  const series = buildParameterStepSeries([first, second]);

  assert.equal(series.length, 3);
  assert.equal(series[0].timestamp, first.timestamp);
  assert.equal(series[1].timestamp, "2026-02-10T18:30:14.999Z");
  assert.equal(series[1].kink, 0.7);
  assert.equal(series[1].syntheticStepBoundary, true);
  assert.equal(series[2].timestamp, second.timestamp);
  assert.equal(series[2].kink, 0.85);
  assert.equal(series[2].syntheticStepBoundary, false);
});

test("current rate curve uses official landmark rates, supplier split, and utilization cap", () => {
  const current = normalizeMarketParameterRows([
    params("2026-01-01T12:00:00.000Z")
  ])[0];
  const curve = buildRateCurve(current, { currentUtilization: 0.42 });

  assert.equal(curve.utilizationCap, 0.9);
  assert.equal(curve.kink, 0.8);
  assert.equal(curve.currentUtilization, 0.42);
  assert.ok(curve.rows.every((row) => row.utilization >= 0 && row.utilization <= 0.9));
  assert.ok(curve.rows.some((row) => row.utilization === 0.42));

  const borrowerAtKink = curve.rows.find((row) => row.curve === "borrower" && row.utilization === 0.8);
  const supplierAtKink = curve.rows.find((row) => row.curve === "supplier" && row.utilization === 0.8);
  const borrowerAtCap = curve.rows.find((row) => row.curve === "borrower" && row.utilization === 0.9);
  const supplierAtCap = curve.rows.find((row) => row.curve === "supplier" && row.utilization === 0.9);

  assert.equal(borrowerAtKink.rate, 0.1);
  assert.equal(supplierAtKink.rate, 0.068);
  assert.equal(borrowerAtCap.rate, 0.6);
  assert.equal(supplierAtCap.rate, 0.434);
});

test("market parameter analysis exposes current groups, allocation shares, curve, and exact events", () => {
  const analysis = buildMarketParametersAnalysis({
    markets: [{ id: "ADA", displayName: "ADA" }],
    marketParamsById: {
      ada: [
        params("2026-01-01T12:00:00.000Z"),
        params("2026-02-01T12:00:00.000Z", {
          incomeRatioSuppliers: "7",
          incomeRatioDividends: "1",
          incomeRatioTreasury: "1"
        })
      ]
    },
    marketSeriesById: {
      ADA: [{ timestamp: "2026-02-02T00:00:00.000Z", utilizationPercentage: "0.42" }]
    }
  });

  const market = analysis.byMarket.ADA;
  assert.equal(market.current.effectiveAt, "2026-02-01T12:00:00.000Z");
  assert.equal(market.current.txHash, "tx-2026-02-01T12:00:00.000Z");
  assert.deepEqual(market.current.incomeAllocation, {
    suppliers: 0.7,
    dividends: 0.1,
    treasury: 0.1,
    reserve: 0.1
  });
  assert.equal(market.current.rateLandmarks.kink, 0.8);
  assert.equal(market.current.capacity.utilizationCap, 0.9);
  assert.equal(market.current.modelCoefficients.utilMultiplierJump, 0.0001);
  assert.equal(market.events.length, 2);
  assert.equal(market.history.length, 3);
  assert.equal(market.rateCurve.currentUtilization, 0.42);
});

test("markets with no official parameter row stay explicitly unavailable", () => {
  const analysis = buildMarketParametersAnalysis({
    markets: [{ id: "EMPTY", displayName: "Empty" }],
    marketParamsById: {},
    marketSeriesById: {}
  });

  assert.equal(analysis.byMarket.EMPTY.current, null);
  assert.deepEqual(analysis.byMarket.EMPTY.events, []);
  assert.deepEqual(analysis.byMarket.EMPTY.rateCurve.rows, []);
});
