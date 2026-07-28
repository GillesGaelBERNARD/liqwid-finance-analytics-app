import assert from "node:assert/strict";
import test from "node:test";

import { formatRefreshProgress } from "../src/browser/refreshProgress.js";

test("refresh progress switches from one-based monthly progress to daily batch progress", () => {
  assert.deepEqual(formatRefreshProgress({
    phase: "liquidation-monthly",
    index: 41,
    total: 42,
    date: "2026-07-01"
  }), {
    text: "Updating monthly liquidation history (42/42)",
    step: "updating monthly liquidation history"
  });

  assert.deepEqual(formatRefreshProgress({ phase: "protocol-overview-daily" }), {
    text: "Preparing daily liquidation and revenue history...",
    step: "preparing daily liquidation and revenue history"
  });

  assert.deepEqual(formatRefreshProgress({
    phase: "protocol-fees-daily",
    index: 28,
    total: 197,
    date: "2026-01-29"
  }), {
    text: "Updating daily official protocol and staker allocations (28/197 days) - 2026-01-29",
    step: "updating daily official protocol and staker allocations"
  });

  assert.deepEqual(formatRefreshProgress({
    phase: "protocol-overview-daily",
    index: 25,
    total: 1247,
    date: "2023-02-18"
  }), {
    text: "Updating daily liquidation and revenue history (25/1,247 days) — batch starting 2023-02-18",
    step: "updating daily liquidation and revenue history"
  });

});

test("refresh progress gives unknown phases a readable fallback", () => {
  assert.deepEqual(formatRefreshProgress({ phase: "protocol-fees-history" }), {
    text: "Updating protocol fees history...",
    step: "updating protocol fees history"
  });
});
