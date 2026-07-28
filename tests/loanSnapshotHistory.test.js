import assert from "node:assert/strict";
import test from "node:test";

import {
  appendLoanSnapshotHistory,
  buildLoanSnapshotHistory,
  LOAN_HEALTH_BUCKETS
} from "../src/browser/loanSnapshotHistory.js";

function loan(marketId, publicKey, amount, healthFactor) {
  return { marketId, publicKey, amount, healthFactor };
}

test("loan snapshot participation counts only active-debt positions and their observed keys", () => {
  const history = buildLoanSnapshotHistory({
    timestamp: "2026-07-18T09:15:30.000Z",
    marketIds: ["Ada", "USDC", "EMPTY"],
    allLoans: [
      loan("Ada", "key-a", 10, 1.2),
      loan("Ada", "key-a", 0, 9),
      loan("Ada", "key-b", 5, 1.4),
      loan("USDC", "key-a", 2, 1.1),
      loan("USDC", "", 0, 2)
    ],
    activeLoans: [
      loan("Ada", "key-a", 10, 1.2),
      loan("Ada", "key-b", 5, 1.4),
      loan("USDC", "key-a", 2, 1.1)
    ]
  });

  assert.deepEqual(history.participation, [
    { timestamp: "2026-07-18T09:15:30.000Z", scope: "protocol", marketId: "", activeDebtLoanCount: 3, distinctActiveDebtObservedKeyCount: 2 },
    { timestamp: "2026-07-18T09:15:30.000Z", scope: "market", marketId: "Ada", activeDebtLoanCount: 2, distinctActiveDebtObservedKeyCount: 2 },
    { timestamp: "2026-07-18T09:15:30.000Z", scope: "market", marketId: "EMPTY", activeDebtLoanCount: 0, distinctActiveDebtObservedKeyCount: 0 },
    { timestamp: "2026-07-18T09:15:30.000Z", scope: "market", marketId: "USDC", activeDebtLoanCount: 1, distinctActiveDebtObservedKeyCount: 1 }
  ]);
});

test("loan snapshot history preserves active-debt counts and debt in the established health-factor buckets", () => {
  const history = buildLoanSnapshotHistory({
    timestamp: "2026-07-18T12:00:00.000Z",
    marketIds: ["Ada", "USDC"],
    allLoans: [],
    activeLoans: [
      loan("Ada", "key-a", 10, 1.0),
      loan("Ada", "key-b", 20, 1.1),
      loan("Ada", "key-c", 30, 1.25),
      loan("USDC", "key-d", 40, 2.01)
    ]
  });

  assert.deepEqual(LOAN_HEALTH_BUCKETS.map(([key]) => key), [
    "hf_le_100", "hf_100_110", "hf_110_125", "hf_125_150", "hf_150_200", "hf_gt_200"
  ]);
  const protocol = history.health.find((row) => row.scope === "protocol");
  assert.equal(protocol.activeDebtLoanCount, 4);
  assert.equal(protocol.activeDebtInUsd, 100);
  assert.equal(protocol.hf_le_100LoanCount, 1);
  assert.equal(protocol.hf_le_100DebtInUsd, 10);
  assert.equal(protocol.badDebtLoanCount, 1);
  assert.equal(protocol.badDebtInUsd, 10);
  assert.equal(protocol.hf_100_110LoanCount, 1);
  assert.equal(protocol.hf_100_110DebtInUsd, 20);
  assert.equal(protocol.hf_110_125LoanCount, 1);
  assert.equal(protocol.hf_110_125DebtInUsd, 30);
  assert.equal(protocol.hf_gt_200LoanCount, 1);
  assert.equal(protocol.hf_gt_200DebtInUsd, 40);

  const usdc = history.health.find((row) => row.marketId === "USDC");
  assert.equal(usdc.activeDebtLoanCount, 1);
  assert.equal(usdc.hf_gt_200DebtInUsd, 40);
});

test("loan snapshot history tracks bad debt when debt exceeds collateral value", () => {
  const history = buildLoanSnapshotHistory({
    timestamp: "2026-07-18T12:00:00.000Z",
    marketIds: ["Ada"],
    allLoans: [],
    activeLoans: [
      { marketId: "Ada", publicKey: "key-1", debtInUsd: 100, collateralInUsd: 50, healthFactor: 1.2 },
      { marketId: "Ada", publicKey: "key-2", debtInUsd: 200, collateralInUsd: 300, healthFactor: 1.5 }
    ]
  });
  const protocol = history.health.find((row) => row.scope === "protocol");
  assert.equal(protocol.badDebtLoanCount, 1);
  assert.equal(protocol.badDebtInUsd, 100);
});

test("append-only loan snapshot history keeps irregular same-day observations and is idempotent by timestamp and scope", () => {
  const first = buildLoanSnapshotHistory({
    timestamp: "2026-07-18T09:00:00.000Z",
    marketIds: ["Ada"],
    allLoans: [loan("Ada", "key-a", 10, 1.3)],
    activeLoans: [loan("Ada", "key-a", 10, 1.3)]
  });
  const second = buildLoanSnapshotHistory({
    timestamp: "2026-07-18T16:47:12.000Z",
    marketIds: ["Ada"],
    allLoans: [loan("Ada", "key-a", 10, 1.3), loan("Ada", "key-b", 8, 1.6)],
    activeLoans: [loan("Ada", "key-a", 10, 1.3), loan("Ada", "key-b", 8, 1.6)]
  });

  const appended = appendLoanSnapshotHistory(first, second);
  assert.deepEqual(
    appended.participation.filter((row) => row.scope === "protocol").map((row) => row.timestamp),
    ["2026-07-18T09:00:00.000Z", "2026-07-18T16:47:12.000Z"]
  );
  assert.equal(appended.participation.length, 4);
  assert.equal(appended.health.length, 4);

  const replayed = appendLoanSnapshotHistory(appended, second);
  assert.deepEqual(replayed, appended);
});
