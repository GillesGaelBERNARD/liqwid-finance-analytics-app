import assert from "node:assert/strict";
import test from "node:test";

import {
  appendLqStatsHistory,
  buildLqStatsSnapshot,
  normalizeLqStatsTimestamp
} from "../src/browser/lqStatsHistory.js";

test("buildLqStatsSnapshot normalizes input and calculates derived metrics", () => {
  const snap = buildLqStatsSnapshot({
    timestamp: "2026-07-27T12:00:00.000Z",
    price: 0.20,
    staked: 4200000,
    totalSupply: 21000000,
    circulatingSupply: 20000000,
    treasury: 1000000
  });

  assert.equal(snap.timestamp, "2026-07-27T12:00:00.000Z");
  assert.equal(snap.date, "2026-07-27");
  assert.equal(snap.lqPriceInUsd, 0.20);
  assert.equal(snap.stakedLqAmount, 4200000);
  assert.equal(snap.totalSupply, 21000000);
  assert.equal(snap.daoTreasuryLqAmount, 1000000);
  assert.equal(snap.stakingRatio, 0.20); // 4.2M / 21M
  assert.equal(snap.totalStakedValueInUsd, 840000); // 4.2M * 0.2
});

test("appendLqStatsHistory accumulates observations idempotently by timestamp", () => {
  const first = buildLqStatsSnapshot({
    timestamp: "2026-07-26T12:00:00.000Z",
    price: 0.18,
    staked: 3000000
  });

  const second = buildLqStatsSnapshot({
    timestamp: "2026-07-27T12:00:00.000Z",
    price: 0.20,
    staked: 3100000
  });

  const appended = appendLqStatsHistory([first], second);
  assert.equal(appended.length, 2);
  assert.equal(appended[0].timestamp, "2026-07-26T12:00:00.000Z");
  assert.equal(appended[1].timestamp, "2026-07-27T12:00:00.000Z");

  const replayed = appendLqStatsHistory(appended, second);
  assert.equal(replayed.length, 2);
});
