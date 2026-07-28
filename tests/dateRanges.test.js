import assert from "node:assert/strict";
import test from "node:test";

import { toUtcApiRange } from "../src/shared/dates.js";

test("one logical day becomes one complete UTC API day", () => {
  assert.deepEqual(toUtcApiRange({ startDay: "2026-06-05", endDay: "2026-06-05" }), {
    startDate: "2026-06-05T00:00:00Z",
    endDate: "2026-06-05T23:59:59Z"
  });
});

test("complete and partial months preserve inclusive logical endpoints", () => {
  assert.deepEqual(toUtcApiRange({ startDay: "2026-06-01", endDay: "2026-06-30" }), {
    startDate: "2026-06-01T00:00:00Z",
    endDate: "2026-06-30T23:59:59Z"
  });
  assert.deepEqual(toUtcApiRange({ startDay: "2026-07-01", endDay: "2026-07-16" }), {
    startDate: "2026-07-01T00:00:00Z",
    endDate: "2026-07-16T23:59:59Z"
  });
});

test("leap days and year rollovers are valid calendar endpoints", () => {
  assert.equal(
    toUtcApiRange({ startDay: "2024-02-29", endDay: "2025-01-01" }).endDate,
    "2025-01-01T23:59:59Z"
  );
});

test("invalid and reversed logical ranges are rejected", () => {
  for (const input of [
    {},
    { startDay: "2026-6-05", endDay: "2026-06-05" },
    { startDay: "2026-02-29", endDay: "2026-03-01" },
    { startDay: "not-a-date", endDay: "2026-06-05" },
    { startDay: "2026-06-06", endDay: "2026-06-05" }
  ]) {
    assert.throws(() => toUtcApiRange(input), /date|range|startDay|endDay/i);
  }
});

test("conversion is independent of the host timezone", () => {
  const originalTimezone = process.env.TZ;
  try {
    for (const timezone of ["Pacific/Honolulu", "Pacific/Kiritimati", "Europe/Paris"]) {
      process.env.TZ = timezone;
      assert.equal(
        toUtcApiRange({ startDay: "2026-06-05", endDay: "2026-06-05" }).startDate,
        "2026-06-05T00:00:00Z"
      );
    }
  } finally {
    if (originalTimezone === undefined) delete process.env.TZ;
    else process.env.TZ = originalTimezone;
  }
});
