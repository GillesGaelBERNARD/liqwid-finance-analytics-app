import { toDateKey } from "../shared/dates.js";

export function normalizeLqStatsTimestamp(rawTimestamp) {
  if (!rawTimestamp) return new Date().toISOString();
  const d = new Date(rawTimestamp);
  return Number.isNaN(d.getTime()) ? new Date().toISOString() : d.toISOString();
}

export function buildLqStatsSnapshot(input = {}) {
  const timestamp = normalizeLqStatsTimestamp(input.timestamp);
  const date = toDateKey(timestamp);
  const price = Number(input.price ?? input.lqPriceInUsd ?? 0);
  const staked = Number(input.staked ?? input.stakedLqAmount ?? 0);
  const totalSupply = Number(input.totalSupply ?? 21000000) || 21000000;
  const circulatingSupply = Number(input.circulatingSupply ?? 0);
  const treasury = Number(input.treasury ?? input.daoTreasuryLqAmount ?? 0);

  const stakingRatio = staked / totalSupply;
  const totalStakedValueInUsd = staked * price;

  return {
    timestamp,
    date,
    lqPriceInUsd: price,
    stakedLqAmount: staked,
    totalSupply,
    circulatingSupply,
    daoTreasuryLqAmount: treasury,
    stakingRatio,
    totalStakedValueInUsd
  };
}

export function appendLqStatsHistory(existing = [], observation = {}) {
  const existingList = Array.isArray(existing) ? existing : (Array.isArray(existing?.series) ? existing.series : []);
  const obsList = Array.isArray(observation)
    ? observation.map(buildLqStatsSnapshot)
    : (observation && typeof observation === "object" && (observation.staked != null || observation.stakedLqAmount != null || observation.price != null || observation.timestamp != null)
        ? [buildLqStatsSnapshot(observation)]
        : []);

  const byTimestamp = new Map();
  for (const item of existingList) {
    if (!item) continue;
    const snap = buildLqStatsSnapshot(item);
    byTimestamp.set(snap.timestamp, snap);
  }
  for (const snap of obsList) {
    byTimestamp.set(snap.timestamp, snap);
  }

  const sorted = Array.from(byTimestamp.values()).sort((a, b) => a.timestamp.localeCompare(b.timestamp));
  return sorted;
}
