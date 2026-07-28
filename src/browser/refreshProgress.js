const REFRESH_PHASE_LABELS = Object.freeze({
  markets: "Refreshing the public market list",
  loans: "Refreshing current active-debt position health",
  analysis: "Recomputing every analysis and graph input",
  complete: "Finalizing refreshed data"
});

export function formatRefreshProgress(progress = {}) {
  const phase = String(progress.phase || "").trim();

  if (phase === "market") return formatMarketProgress(progress);
  if (phase === "liquidation-monthly") return formatMonthlyLiquidationProgress(progress);
  if (phase === "protocol-overview-daily") return formatDailyOverviewProgress(progress);
  if (phase === "protocol-fees-daily") return formatDailyProtocolFeesProgress(progress);

  const knownLabel = REFRESH_PHASE_LABELS[phase];
  if (knownLabel) return progressResult(`${knownLabel}...`, knownLabel);

  const readablePhase = humanizeRefreshPhase(phase || "data");
  return progressResult(`Updating ${readablePhase}...`, `Updating ${readablePhase}`);
}

function formatDailyProtocolFeesProgress(progress) {
  const label = "Updating daily official protocol and staker allocations";
  const suffix = countSuffix(progress.index, progress.total, { unit: "days" });
  const date = progress.date ? ` - ${String(progress.date).slice(0, 10)}` : "";
  return progressResult(
    suffix ? `${label}${suffix}${date}` : "Preparing daily official protocol and staker allocations...",
    suffix ? label : "Preparing daily official protocol and staker allocations"
  );
}

function formatMarketProgress(progress) {
  const market = progress.market || {};
  const marketName = market.displayName || market.id || "Market";
  const action = progress.skipped && progress.paramsSkipped
    ? "already current"
    : progress.skipped
      ? `history current; fetching parameters from ${progress.paramsStartDate}`
      : `fetching history from ${progress.startDate}`;
  const suffix = countSuffix(progress.index, progress.total, { oneBased: true });
  return progressResult(
    `${marketName}: ${action}${suffix}`,
    `Refreshing ${marketName} market history and parameters`
  );
}

function formatMonthlyLiquidationProgress(progress) {
  const label = "Updating monthly liquidation history";
  const suffix = countSuffix(progress.index, progress.total, { oneBased: true });
  return progressResult(suffix ? `${label}${suffix}` : "Preparing monthly liquidation history...", label);
}

function formatDailyOverviewProgress(progress) {
  const updatingLabel = "Updating daily liquidation and revenue history";
  const suffix = countSuffix(progress.index, progress.total, { unit: "days" });
  if (!suffix) {
    return progressResult(
      "Preparing daily liquidation and revenue history...",
      "Preparing daily liquidation and revenue history"
    );
  }
  const date = String(progress.date || "").slice(0, 10);
  const batch = date ? ` — batch starting ${date}` : "";
  return progressResult(`${updatingLabel}${suffix}${batch}`, updatingLabel);
}

function countSuffix(indexValue, totalValue, options = {}) {
  const total = Number(totalValue);
  const index = Number(indexValue);
  if (!Number.isFinite(total) || total <= 0 || !Number.isFinite(index)) return "";
  const offset = options.oneBased ? 1 : 0;
  const current = Math.min(total, Math.max(0, Math.trunc(index) + offset));
  const unit = options.unit ? ` ${options.unit}` : "";
  return ` (${formatRefreshCount(current)}/${formatRefreshCount(total)}${unit})`;
}

function formatRefreshCount(value) {
  return Math.trunc(value).toLocaleString("en-US");
}

function humanizeRefreshPhase(phase) {
  return phase
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[-_]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function progressResult(text, step) {
  return { text, step: step.toLowerCase() };
}
