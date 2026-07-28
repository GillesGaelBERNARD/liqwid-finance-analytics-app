import assert from "node:assert/strict";
import test from "node:test";
import { computeLoanAggregateReconciliation, classifyReconciliationState } from "../src/shared/metrics.js";

test("classifyReconciliationState classifies USD difference correctly", () => {
  assert.equal(classifyReconciliationState(0), "reconciled");
  assert.equal(classifyReconciliationState(0.50), "reconciled");
  assert.equal(classifyReconciliationState(-0.75), "reconciled");
  assert.equal(classifyReconciliationState(1.50), "overcoverage");
  assert.equal(classifyReconciliationState(-2.00), "undercoverage");
  assert.equal(classifyReconciliationState(NaN), "unavailable");
});

test("computeLoanAggregateReconciliation computes native and USD reconciliation metrics correctly", () => {
  const market = {
    id: "SNEK",
    displayName: "SNEK",
    borrow: "1000",
    asset: { price: "0.002" }
  };
  const loans = [
    { marketId: "SNEK", amount: 600, adjustedAmount: 650 },
    { marketId: "SNEK", amount: 400, adjustedAmount: 420 }
  ];

  const result = computeLoanAggregateReconciliation({ market, loans });

  assert.equal(result.marketId, "SNEK");
  assert.equal(result.marketBorrowNative, 1000);
  assert.equal(result.loanDebtNative, 1000);
  assert.equal(result.loanAdjustedDebtNative, 1070);
  assert.equal(result.minInterestFloorNative, 70);

  assert.equal(result.marketBorrowInUsd, 2);
  assert.equal(result.loanDebtInUsd, 2);
  assert.equal(Number(result.loanAdjustedDebtInUsd.toFixed(2)), 2.14);
  assert.equal(Number(result.minInterestFloorInUsd.toFixed(2)), 0.14);
  assert.equal(Number(result.adjustedDifferenceInUsd.toFixed(2)), 0.14);
  assert.equal(result.classification, "reconciled");
});

test("computeLoanAggregateReconciliation handles overcoverage state", () => {
  const market = {
    id: "ADA",
    displayName: "ADA",
    borrow: "100",
    asset: { price: "0.50" }
  };
  const loans = [
    { marketId: "ADA", amount: 120, adjustedAmount: 130 }
  ];

  const result = computeLoanAggregateReconciliation({ market, loans });

  assert.equal(result.marketBorrowInUsd, 50);
  assert.equal(result.loanAdjustedDebtInUsd, 65);
  assert.equal(result.adjustedDifferenceInUsd, 15);
  assert.equal(result.classification, "overcoverage");
});

test("computeLoanAggregateReconciliation falls back safely when raw debt is missing or unprovided", () => {
  const market = {
    id: "DJED",
    displayName: "DJED",
    borrow: "1000000",
    asset: { price: "1.00" }
  };
  const loans = [
    { marketId: "DJED", debtInUsd: 911196.9 }
  ];

  const result = computeLoanAggregateReconciliation({ market, loans });

  assert.equal(result.loanDebtInUsd, 911196.9);
  assert.equal(result.loanAdjustedDebtInUsd, 911196.9);
  assert.equal(result.minInterestFloorInUsd, 0);
});
