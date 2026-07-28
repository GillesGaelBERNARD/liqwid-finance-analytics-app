import { addDays, filterRowsByDate } from "../shared/dates.js";
import { numberOrZero, summarizeMarket } from "../shared/metrics.js";
import { buildMarketStressChartData } from "./chartData.js";
import { csvToRows } from "./dataWorkflow.js";
import { buildCurrentExposureAnalysis } from "./currentExposureAnalysis.js";
import { buildDataStatus } from "./dataStatus.js";
import { buildLoanSnapshotHistory, LOAN_HEALTH_BUCKETS } from "./loanSnapshotHistory.js";

const REVENUE_RUN_RATE_WINDOW_DAYS = 90;
const ANNUALIZATION_DAYS = 365.25;

export async function buildCompleteAnalysisFromStore(store, bundle) {
  if (!store || typeof store.readText !== "function") throw new Error("A readable Liqwid data folder is required.");
  const dailyOverview = csvToRows(await store.readText("clean/protocol-overview-daily.csv", ""));
  const allLoans = csvToRows(await store.readText("clean/current-all-loans.csv", ""));
  const loanPopulations = deriveLoanPopulations(allLoans);
  return buildCompleteAnalysis({
    bundle,
    monthlyLiquidations: csvToRows(await store.readText("clean/protocol-liquidation-monthly.csv", "")),
    dailyLiquidations: dailyOverview,
    dailyRevenue: dailyOverview,
    dailyAllocatedFees: csvToRows(await store.readText("clean/protocol-fees-daily.csv", "")),
    monthlyFees: [],
    ...loanPopulations,
    loanSnapshotHistory: {
      participation: csvToRows(await store.readText("computed/loan-participation-history.csv", "")),
      health: csvToRows(await store.readText("computed/loan-health-history.csv", "")),
      reconciliation: normalizeReconciliationRows(csvToRows(await store.readText("computed/loan-reconciliation-history.csv", "")))
    }
  });
}

function normalizeReconciliationRows(rows) {
  return (Array.isArray(rows) ? rows : []).map((row) => ({
    ...row,
    marketBorrowNative: numberOrZero(row.marketBorrowNative),
    loanDebtNative: numberOrZero(row.loanDebtNative),
    loanAdjustedDebtNative: numberOrZero(row.loanAdjustedDebtNative),
    minInterestFloorNative: numberOrZero(row.minInterestFloorNative),
    marketBorrowInUsd: numberOrZero(row.marketBorrowInUsd),
    loanDebtInUsd: numberOrZero(row.loanDebtInUsd),
    loanAdjustedDebtInUsd: numberOrZero(row.loanAdjustedDebtInUsd),
    minInterestFloorInUsd: numberOrZero(row.minInterestFloorInUsd),
    adjustedDifferenceInUsd: numberOrZero(row.adjustedDifferenceInUsd),
    adjustedCoveragePercent: finiteNumber(row.adjustedCoveragePercent)
  }));
}

export function deriveLoanPopulations(allLoanRows) {
  const sourceRows = Array.isArray(allLoanRows) ? allLoanRows : [];
  const hasSavedClassification = sourceRows.length > 0 && sourceRows.every((row) =>
    typeof row.hasDebt === "boolean"
      && typeof row.canBeLiquidated === "boolean"
      && typeof row.hasCollateral === "boolean"
  );

  const allLoans = sourceRows.map((row) => {
    if (hasSavedClassification) return { ...row };
    const adjustedDebt = Number(row.adjustedAmount ?? row.amount);
    const hasDebt = Number.isFinite(adjustedDebt) && adjustedDebt > 0;
    const hasCollateral = Number.isFinite(Number(row.collateral)) && Number(row.collateral) > 0;
    const canBeLiquidated = hasDebt && Number.isFinite(Number(row.healthFactor)) && Number(row.healthFactor) <= 1;
    return { ...row, hasDebt, canBeLiquidated, hasCollateral };
  });
  return {
    allLoans,
    activeLoans: allLoans.filter((row) => row.hasDebt),
    liquidatableLoans: allLoans.filter((row) => row.canBeLiquidated),
    collateralLoans: allLoans.filter((row) => row.hasCollateral)
  };
}

export function buildCompleteAnalysis(input) {
  const bundle = input.bundle;
  if (!bundle?.protocolSeries?.length || !bundle?.markets?.length) throw new Error("Complete analysis requires fetched market history.");

  const marketSummaries = (bundle.summaries || []).map((base) => buildMarketSummary(bundle, base));
  const loanContext = buildLoanContext(input.activeLoans || [], input.liquidatableLoans || []);
  attachLoanState(marketSummaries, loanContext.loanState);
  const revenue = buildRevenueContext(
    bundle,
    marketSummaries,
    input.dailyRevenue || [],
    input.dailyAllocatedFees || [],
    input.monthlyFees || []
  );
  const marketStress = buildStressContext(bundle, loanContext.loanState);
  const protocolSummary = buildProtocolSummary(bundle, marketStress);
  const liquidation = buildLiquidationContext(
    input.monthlyLiquidations || [],
    input.dailyLiquidations || [],
    loanContext
  );
  const currentExposure = buildCurrentExposureAnalysis({
    bundle,
    activeLoans: input.activeLoans || [],
    collateralLoans: input.collateralLoans || []
  });
  const loanSnapshotHistory = activeDebtLoanSnapshotHistory(input, bundle);
  const lqToken = buildLqTokenAnalysis(bundle, revenue);
  const dataStatus = buildDataStatus({
    bundle,
    allLoans: input.allLoans || [],
    activeLoans: input.activeLoans || [],
    collateralLoans: input.collateralLoans || [],
    loanSnapshotHistory,
    liquidation,
    revenue,
    currentExposure
  });

  return {
    generatedAt: bundle.generatedAt || new Date().toISOString(),
    liveDataGeneratedAt: bundle.generatedAt || null,
    protocolSummary,
    marketSummaries,
    liquidation,
    loanState: loanContext.loanState,
    loanSnapshotHistory,
    marketStress,
    currentExposure,
    revenue,
    lqToken,
    dataStatus
  };
}

export function buildLqTokenAnalysis(bundle, revenue) {
  const lqMarket = (bundle?.markets || []).find((m) => String(m.id).toUpperCase() === "LQ");
  const lqSeries = bundle?.marketSeries?.LQ || bundle?.marketSeries?.lq || [];
  const lqStats = bundle?.lqStats || bundle?.lq || null;
  const lqStatsHistory = Array.isArray(bundle?.lqStatsHistory)
    ? bundle.lqStatsHistory
    : (Array.isArray(bundle?.lqStatsHistory?.series) ? bundle.lqStatsHistory.series : []);

  const TOTAL_LQ_SUPPLY = Number(lqStats?.totalSupply) || 21000000;
  const currentAssetPrice = lqStats?.price ?? lqMarket?.asset?.price ?? lqMarket?.price ?? null;

  const protocolDates = bundle?.protocolSeries || [];
  const lqRowsByDate = new Map(lqSeries.map((r) => [r.date, r]));
  const lqStatsByDate = new Map(lqStatsHistory.map((r) => [r.date || (r.timestamp ? r.timestamp.slice(0, 10) : ""), r]));

  const series = (protocolDates.length ? protocolDates : (lqStatsHistory.length ? lqStatsHistory : lqSeries)).map((pRow, index, arr) => {
    const date = pRow.date || (pRow.timestamp ? pRow.timestamp.slice(0, 10) : "");
    const statsSnap = lqStatsByDate.get(date);
    const lqRow = lqRowsByDate.get(date) || (pRow.marketId === "LQ" ? pRow : null);
    
    const supply = Number(lqRow?.supply ?? 0);
    const supplyInUsd = Number(lqRow?.supplyInUsd ?? 0);
    const explicitPrice = Number(lqRow?.price ?? lqRow?.assetPrice ?? 0);
    const moneyMarketPriceInUsd = explicitPrice > 0
      ? explicitPrice
      : (supply > 0 && supplyInUsd > 0 ? supplyInUsd / supply : null);

    const lqPriceInUsd = statsSnap?.lqPriceInUsd ?? statsSnap?.price ?? moneyMarketPriceInUsd;
    const isLatest = index === arr.length - 1;
    
    const stakedLqAmount = statsSnap
      ? Number(statsSnap.stakedLqAmount ?? statsSnap.staked ?? 0)
      : (isLatest && lqStats?.staked != null ? Number(lqStats.staked) : null);

    const stakingRatio = stakedLqAmount != null ? stakedLqAmount / TOTAL_LQ_SUPPLY : null;
    const totalStakedValueInUsd = stakedLqAmount != null && lqPriceInUsd != null ? stakedLqAmount * lqPriceInUsd : null;

    const daoTreasuryLqAmount = statsSnap
      ? Number(statsSnap.daoTreasuryLqAmount ?? statsSnap.treasury ?? 0)
      : (isLatest && lqStats?.treasury != null ? Number(lqStats.treasury) : null);

    const daoTreasuryUsdValue = daoTreasuryLqAmount != null && lqPriceInUsd != null ? daoTreasuryLqAmount * lqPriceInUsd : null;

    return {
      date,
      lqPriceInUsd,
      stakedLqAmount,
      stakingRatio,
      totalStakedValueInUsd,
      daoTreasuryLqAmount,
      daoTreasuryUsdValue
    };
  });

  const validPriceRows = series.filter((r) => typeof r.lqPriceInUsd === "number" && Number.isFinite(r.lqPriceInUsd) && r.lqPriceInUsd > 0);
  const latestPriceRow = validPriceRows.at(-1);

  const fallbackPrice = lqStats?.price ?? latestPriceRow?.lqPriceInUsd ?? currentAssetPrice ?? null;
  const latestStakedLq = lqStats?.staked ?? (series.findLast?.((r) => r.stakedLqAmount != null)?.stakedLqAmount ?? null);
  const latestStakingRatio = latestStakedLq != null ? latestStakedLq / TOTAL_LQ_SUPPLY : null;
  const latestTotalStakedValueInUsd = latestStakedLq != null && fallbackPrice != null ? latestStakedLq * fallbackPrice : null;
  const latestDaoTreasuryLq = lqStats?.treasury ?? (series.findLast?.((r) => r.daoTreasuryLqAmount != null)?.daoTreasuryLqAmount ?? null);
  const latestDaoTreasuryUsdValue = latestDaoTreasuryLq != null && fallbackPrice != null ? latestDaoTreasuryLq * fallbackPrice : null;

  return {
    currentPriceInUsd: fallbackPrice,
    currentStakedLq: latestStakedLq,
    currentStakingRatio: latestStakingRatio,
    currentTotalStakedValueInUsd: latestTotalStakedValueInUsd,
    currentDaoTreasuryLq: latestDaoTreasuryLq,
    currentDaoTreasuryUsdValue: latestDaoTreasuryUsdValue,
    series
  };
}

function activeDebtLoanSnapshotHistory(input, bundle) {
  const sortRows = (rows) => [...rows].sort((left, right) =>
    String(left.timestamp).localeCompare(String(right.timestamp))
      || String(left.scope).localeCompare(String(right.scope))
      || String(left.marketId).localeCompare(String(right.marketId))
  );
  const health = sortRows(input.loanSnapshotHistory?.health || []);
  const reconciliation = sortRows(input.loanSnapshotHistory?.reconciliation || []);
  let participation = sortRows((input.loanSnapshotHistory?.participation || []).filter((row) =>
    numericObservationField(row.activeDebtLoanCount)
      && numericObservationField(row.distinctActiveDebtObservedKeyCount)
  ));
  if (!participation.length && (input.activeLoans || []).length) {
    const latestTimestamp = health.filter((row) => row.scope === "protocol").at(-1)?.timestamp;
    if (latestTimestamp) {
      const snap = buildLoanSnapshotHistory({
        timestamp: latestTimestamp,
        marketIds: (bundle.markets || []).map((market) => market.id),
        activeLoans: input.activeLoans || [],
        markets: bundle.markets || []
      });
      participation = snap.participation;
    }
  }
  return { participation, health, reconciliation };
}

function numericObservationField(value) {
  return value !== null && value !== undefined && String(value).trim() !== "" && Number.isFinite(Number(value));
}

function buildMarketSummary(bundle, base) {
  const rows = bundle.marketSeries?.[base.marketId] || [];
  const last = rows.at(-1) || {};
  const lastDate = last.date || base.lastDate;
  const coverage90 = lastDate
    ? summarizeMarket(bundle.marketById?.[base.marketId] || { id: base.marketId }, rows, { startDate: addDays(lastDate, -89), endDate: lastDate }).interestCoverageRatio
    : null;
  const maximum = rows.reduce((best, row) => numberOrZero(row.borrowInUsd) > numberOrZero(best?.borrowInUsd) ? row : best, null);
  const currentBorrow = numberOrZero(base.currentBorrowInUsd);
  const maxBorrow = numberOrZero(maximum?.borrowInUsd);
  return {
    ...base,
    lastDate,
    interestCoverage90d: coverage90,
    cumulativeInterestGapInUsd: numberOrZero(last.cumulativeInterestGapInUsd),
    maxBorrowInUsd: maxBorrow,
    maxBorrowDate: maximum?.date ?? null,
    borrowDrawdownFromPeakInUsd: Math.max(0, maxBorrow - currentBorrow),
    currentBorrowToPeak: maxBorrow > 0 ? currentBorrow / maxBorrow : null,
    narrative: marketNarrative(base, coverage90, lastDate)
  };
}

function buildProtocolSummary(bundle, marketStress) {
  const rows = bundle.protocolSeries || [];
  const last = rows.at(-1) || {};
  const lastDate = last.date || null;
  const rows90 = lastDate ? filterRowsByDate(rows, addDays(lastDate, -89), lastDate) : [];
  const accrued = total(rows90, "interestAccruedInUsd");
  const repaid = total(rows90, "interestRepaidInUsd");
  const currentValuedCoverage90 = finiteNumber(last.interestCoverage90d);
  const totals = bundle.currentTotals || {};
  const top = marketStress.currentMarketStress?.[0];
  return {
    ...summarizeMarket({ id: "protocol", displayName: "Protocol" }, rows),
    lastDate,
    currentSupplyInUsd: numberOrZero(totals.supplyInUsd ?? last.supplyInUsd),
    currentBorrowInUsd: numberOrZero(totals.borrowInUsd ?? last.borrowInUsd),
    currentLiquidityInUsd: numberOrZero(totals.liquidityInUsd ?? last.liquidityInUsd),
    currentUtilization: numberOrZero(totals.utilization ?? last.utilizationPercentage),
    interestCoverage90d: currentValuedCoverage90 ?? (accrued > 0 ? repaid / accrued : null),
    cumulativeInterestGapInUsd: numberOrZero(last.cumulativeInterestGapInUsd),
    narrative: top
      ? `${top.marketId} is the largest current market-stress contributor. All browser analysis is current through ${lastDate}.`
      : `All browser analysis is current through ${lastDate}.`
  };
}

function buildStressContext(bundle, loanState) {
  const marketSeries = Object.fromEntries(Object.entries(bundle.marketSeries || {}).filter(([marketId]) => String(marketId).toUpperCase() !== "POL"));
  const chartData = buildMarketStressChartData(marketSeries, { topN: Object.keys(marketSeries).length });
  const loansByMarket = new Map((loanState.byMarket || []).map((row) => [row.marketId, row]));
  const currentMarketStress = chartData.currentRows.map((row) => {
    const loan = loansByMarket.get(row.marketId) || {};
    return {
      ...row,
      activeDebtLoanCount: loan.loanCount || 0,
      activeLoanDebtInUsd: loan.debtInUsd || 0,
      activeLoanMinHealthFactor: loan.minHealthFactor ?? null,
      loanHealthPressure: loan.loanHealthPressure || 0
    };
  });
  const topStressMarketsFullPeriod = [...currentMarketStress].sort((a, b) => b.averageStressContributionShare - a.averageStressContributionShare);
  const names = currentMarketStress.slice(0, 4).map((row) => row.marketId).join(", ");
  return {
    currentMarketStress,
    topStressMarketsFullPeriod,
    modelFormula: "A logistic stress index combines utilization, borrow-to-liquidity pressure, weak 30-day interest coverage, and positive 30-day borrow growth; contribution weights that score by protocol borrow share.",
    narrative: names ? `The largest current stress contributors are ${names}. This is an attribution lens, not a default-probability forecast.` : "No market stress ranking is available."
  };
}

function buildLoanContext(activeLoans, liquidatableLoans) {
  const loans = activeLoans.map(normalizeLoan).filter((loan) => loan.debtInUsd > 0);
  const totalDebt = total(loans, "debtInUsd");
  const totalCollateral = total(loans, "collateralInUsd");
  const health = loans.map((loan) => loan.healthFactor).filter(Number.isFinite).sort((a, b) => a - b);
  const healthBuckets = healthBucketRows(loans, totalDebt);
  const byMarket = [...groupBy(loans, "marketId")].map(([marketId, rows]) => loanMarketRow(marketId, rows, totalDebt))
    .sort((a, b) => b.loanHealthPressure - a.loanHealthPressure || b.debtInUsd - a.debtInUsd);
  const liquidatableActiveDebtByMarket = [...groupBy(liquidatableLoans.map(normalizeLoan), "marketId")].map(([marketId, rows]) => ({
    marketId,
    liquidatableLoanCount: rows.length,
    liquidatableDebtInUsd: total(rows, "debtInUsd"),
    liquidatableCollateralInUsd: total(rows, "collateralInUsd")
  })).sort((a, b) => b.liquidatableLoanCount - a.liquidatableLoanCount);
  const summary = loans.length ? {
    activeDebtLoanCount: loans.length,
    liquidatableActiveDebtLoanCount: liquidatableLoans.length,
    totalActiveDebtInUsd: totalDebt,
    totalActiveCollateralInUsd: totalCollateral,
    collateralCoverage: totalDebt ? totalCollateral / totalDebt : null,
    minHealthFactor: health[0] ?? null,
    p05HealthFactor: quantile(health, 0.05),
    p10HealthFactor: quantile(health, 0.10),
    medianHealthFactor: quantile(health, 0.50),
    debtWeightedHealthFactor: weightedAverage(loans, "healthFactor", "debtInUsd"),
    debtBelow100InUsd: Math.max(total(loans.filter((loan) => (Number.isFinite(loan.healthFactor) && loan.healthFactor < 1.0) || ((loan.debtInUsd || 0) > (loan.collateralInUsd || 0))), "debtInUsd"), total(loans.filter((loan) => (loan.debtInUsd || 0) > (loan.collateralInUsd || 0)), "debtInUsd")),
    debtAtOrBelow110InUsd: total(loans.filter((loan) => (Number.isFinite(loan.healthFactor) && loan.healthFactor <= 1.10) || ((loan.debtInUsd || 0) > (loan.collateralInUsd || 0))), "debtInUsd"),
    debtAtOrBelow125InUsd: total(loans.filter((loan) => (Number.isFinite(loan.healthFactor) && loan.healthFactor <= 1.25) || ((loan.debtInUsd || 0) > (loan.collateralInUsd || 0))), "debtInUsd"),
    debtAtOrBelow150InUsd: total(loans.filter((loan) => (Number.isFinite(loan.healthFactor) && loan.healthFactor <= 1.50) || ((loan.debtInUsd || 0) > (loan.collateralInUsd || 0))), "debtInUsd")
  } : { activeDebtLoanCount: 0, liquidatableActiveDebtLoanCount: liquidatableLoans.length };
  summary.debtAtOrBelow125Share = totalDebt ? numberOrZero(summary.debtAtOrBelow125InUsd) / totalDebt : null;
  summary.debtAtOrBelow150Share = totalDebt ? numberOrZero(summary.debtAtOrBelow150InUsd) / totalDebt : null;
  const summaryTakeaway = loans.length
    ? `Current active-debt data contains ${loans.length} loans and ${formatMoney(totalDebt)} of debt; the minimum health factor is ${formatNumber(summary.minHealthFactor)}.`
    : "No active-debt loans were returned by the current loan snapshot.";
  return {
    activeDebtLoanCount: loans.length,
    activeDebtMinHealthFactor: health[0] ?? null,
    liquidatableActiveDebtLoanCount: liquidatableLoans.length,
    liquidatableActiveDebtByMarket,
    loanState: {
      summary,
      healthBuckets,
      byMarket,
      summaryTakeaway,
      apiScope: "Current loan state uses freshly fetched liqwid.data.loans active-debt rows. Historical loan-health time series are not exposed by this API surface."
    }
  };
}

function attachLoanState(marketSummaries, loanState) {
  const byMarket = new Map((loanState.byMarket || []).map((row) => [row.marketId, row]));
  marketSummaries.forEach((summary) => {
    const loan = byMarket.get(summary.marketId) || {};
    Object.assign(summary, {
      activeDebtLoanCount: loan.loanCount || 0,
      activeLoanDebtInUsd: loan.debtInUsd || 0,
      activeLoanCollateralInUsd: loan.collateralInUsd || 0,
      activeLoanMinHealthFactor: loan.minHealthFactor ?? null,
      activeLoanP10HealthFactor: loan.p10HealthFactor ?? null,
      activeLoanMedianHealthFactor: loan.medianHealthFactor ?? null,
      activeLoanDebtWeightedHealthFactor: loan.debtWeightedHealthFactor ?? null,
      activeDebtLoanCountBelow100: loan.loanCountBelow100 || 0,
      activeDebtLoanCountAtOrBelow110: loan.loanCountAtOrBelow110 || 0,
      activeDebtLoanCountAtOrBelow125: loan.loanCountAtOrBelow125 || 0,
      activeLoanDebtBelow100InUsd: loan.debtBelow100InUsd || 0,
      activeLoanDebtAtOrBelow110InUsd: loan.debtAtOrBelow110InUsd || 0,
      activeLoanDebtAtOrBelow125InUsd: loan.debtAtOrBelow125InUsd || 0,
      activeLoanDebtAtOrBelow150InUsd: loan.debtAtOrBelow150InUsd || 0,
      activeLoanBadDebtLoanCount: loan.badDebtLoanCount || 0,
      activeLoanBadDebtInUsd: loan.badDebtInUsd || 0,
      activeLoanBadDebtCollateralInUsd: loan.badDebtCollateralInUsd || 0,
      activeLoanBadDebtShortfallInUsd: loan.badDebtShortfallInUsd || 0,
      activeLoanHealthPressure: loan.loanHealthPressure || 0,
      activeLoanHealthBuckets: loan.healthBuckets || []
    });
  });
}

function buildLiquidationContext(monthlyInput, dailyInput, loanContext) {
  const monthly = [...monthlyInput].sort((a, b) => String(a.date).localeCompare(String(b.date)));
  const daily = [...dailyInput].sort((a, b) => String(a.date).localeCompare(String(b.date)));
  const dailySeries = dailyLiquidationCoverage(monthly, daily);
  const successful = monthly.filter((row) => !row.fetchError);
  const totalProfit = total(successful, "liquidationProfitInUsd");
  const currentMarkets = loanContext.liquidatableActiveDebtByMarket;
  const currentDaysWithoutLiquidations = ongoingDrySpellDays(daily, "liquidationProfitInUsd", { threshold: 0.01, absolute: true });
  const quietRead = currentDaysWithoutLiquidations === null
    ? "The ongoing no-liquidation duration is unavailable."
    : `The latest observation ends a ${currentDaysWithoutLiquidations}-day period without material liquidation profit.`;
  const takeaway = `Official protocol liquidation profit totals ${formatMoney(totalProfit)} across the available monthly history. ${quietRead} Current active-debt data returns ${loanContext.liquidatableActiveDebtLoanCount} liquidatable loans.`;
  return {
    apiScope: "analytics.overview exposes liquidationProfitInUsd only at protocol level. Per-market repayment intensity remains a separate repayment-flow analysis and is never presented as confirmed liquidation activity.",
    fullPeriodProtocolLiquidationProfit: {
      fromDate: successful[0]?.fromDate ?? null,
      toDate: successful.at(-1)?.toDate ?? null,
      liquidationProfitInUsd: totalProfit
    },
    monthlyProtocolLiquidationProfit: monthly,
    dailyProtocolLiquidationProfit: daily,
    currentDaysWithoutLiquidations,
    dailyLiquidationCoverage: dailySeries.coverage,
    dailyLiquidationReconciliations: dailySeries.reconciliations,
    currentLiquidatableByMarket: currentMarkets,
    currentLoanHealth: loanContext,
    liquidationTakeaway: takeaway,
    fetchErrorSummary: {}
  };
}

function buildRevenueContext(bundle, marketSummaries, dailyInput, dailyAllocatedFeesInput, monthlyFeesInput) {
  const daily = dailyInput.map((row) => {
    const observedRepaidInterestFeeFlowInUsd = numberOrZero(row.revenueFromRepaidInterestInUsd);
    const observedOriginationFeeFlowInUsd = numberOrZero(row.loanOriginationFeesInUsd);
    const clean = { ...row };
    delete clean.realizedProtocolRevenueInUsd;
    return {
      ...clean,
      observedRepaidInterestFeeFlowInUsd,
      observedOriginationFeeFlowInUsd,
      combinedObservedFeeFlowInUsd: observedRepaidInterestFeeFlowInUsd + observedOriginationFeeFlowInUsd
    };
  }).sort((a, b) => String(a.date).localeCompare(String(b.date)));
  const dailyAllocation = dailyAllocatedFeesInput
    .map((row) => normalizeProtocolFeeAllocation(row, "day"))
    .sort((a, b) => String(a.date).localeCompare(String(b.date)));
  const monthlySource = monthlyFeesInput.length ? monthlyFeesInput : aggregateDailyProtocolFeeAllocations(dailyAllocatedFeesInput);
  const monthlyAllocation = monthlySource
    .map((row) => normalizeProtocolFeeAllocation(row, "month"))
    .sort((a, b) => String(a.date).localeCompare(String(b.date)));
  const completeDays = daily.filter((row) => row.isComplete !== false && !row.fetchError);
  const completeAllocationDays = dailyAllocation.filter((row) => row.isComplete !== false && !row.fetchError);
  const completeAllocationMonths = monthlyAllocation.filter((row) => row.isComplete !== false && !row.fetchError);
  const runRateSeries = buildProtocolRevenueRunRateSeries(dailyAllocation);
  const latestRunRate = runRateSeries.at(-1) || null;
  const previous90 = latestRunRate
    ? allocationDaysInWindow(
      completeAllocationDays,
      addDays(latestRunRate.windowStartDate, -REVENUE_RUN_RATE_WINDOW_DAYS),
      REVENUE_RUN_RATE_WINDOW_DAYS
    )
    : [];
  const trailing12 = completeAllocationMonths.length >= 12 && consecutiveMonths(completeAllocationMonths.slice(-12)) ? completeAllocationMonths.slice(-12) : [];
  const recent90Total = latestRunRate?.trailing90DaysProtocolRevenueInUsd ?? null;
  const previous90Total = previous90.length === REVENUE_RUN_RATE_WINDOW_DAYS
    ? total(previous90, "allocatedProtocolRevenueInUsd")
    : null;
  const marketRows = marketSummaries.map((summary) => {
    const rows = bundle.marketSeries?.[summary.marketId] || [];
    const generatedDate = String(bundle.generatedAt || "").slice(0, 10);
    const completeRevenueRows = generatedDate ? rows.filter((row) => row.date < generatedDate) : rows;
    const revenueEndDate = completeRevenueRows.at(-1)?.date ?? null;
    const tail90 = revenueEndDate
      ? filterRowsByDate(completeRevenueRows, addDays(revenueEndDate, -(REVENUE_RUN_RATE_WINDOW_DAYS - 1)), revenueEndDate)
      : [];
    const metrics = revenueMetrics(rows, tail90);
    Object.assign(summary, metrics);
    return {
      marketId: summary.marketId,
      currentBorrowInUsd: summary.currentBorrowInUsd,
      grossRealizedRevenueProxy90dInUsd: metrics.grossRealizedRevenueProxy90dInUsd,
      repaidInterestFeeFlow90dInUsd: metrics.repaidInterestFeeFlow90dInUsd,
      originationFeeFlow90dInUsd: metrics.originationFeeFlow90dInUsd,
      marketRevenueState: metrics.marketRevenueState
    };
  }).sort((a, b) => numberOrZero(b.grossRealizedRevenueProxy90dInUsd) - numberOrZero(a.grossRealizedRevenueProxy90dInUsd));
  const runRate = latestRunRate?.annualizedRunRateInUsd ?? null;
  const change = recent90Total !== null && previous90Total > 0 ? recent90Total / previous90Total - 1 : null;
  const positiveOriginationDays = completeDays.filter((row) => row.observedOriginationFeeFlowInUsd > 0);
  return {
    daily,
    dailyAllocation,
    monthlyAllocation,
    annualizedRunRateSeries: runRateSeries,
    summary: {
      coverageFromDate: daily[0]?.date ?? null,
      coverageToDate: daily.at(-1)?.date ?? null,
      completeDays: completeDays.length,
      dailyAllocationCoverageFromDate: dailyAllocation[0]?.periodStartDay ?? null,
      dailyAllocationCoverageToDate: dailyAllocation.at(-1)?.periodEndDay ?? null,
      allocationCoverageFromDate: monthlyAllocation[0]?.periodStartDay ?? null,
      allocationCoverageToDate: monthlyAllocation.at(-1)?.periodEndDay ?? null,
      completeAllocationDays: completeAllocationDays.length,
      completeAllocationMonths: completeAllocationMonths.length,
      combinedObservedFeeFlowInUsd: completeDays.length ? total(completeDays, "combinedObservedFeeFlowInUsd") : null,
      observedRepaidInterestFeeFlowInUsd: completeDays.length ? total(completeDays, "observedRepaidInterestFeeFlowInUsd") : null,
      observedOriginationFeeFlowInUsd: completeDays.length ? total(completeDays, "observedOriginationFeeFlowInUsd") : null,
      latestPositiveOriginationFeeDate: positiveOriginationDays.at(-1)?.date ?? null,
      allocatedProtocolRevenueInUsd: completeAllocationMonths.length ? total(completeAllocationMonths, "allocatedProtocolRevenueInUsd") : null,
      allocatedProtocolInterestRevenueInUsd: completeAllocationMonths.length ? total(completeAllocationMonths, "allocatedProtocolInterestRevenueInUsd") : null,
      allocatedProtocolOriginationRevenueInUsd: completeAllocationMonths.length ? total(completeAllocationMonths, "allocatedProtocolOriginationRevenueInUsd") : null,
      allocatedHoldersRevenueInUsd: completeAllocationMonths.length ? total(completeAllocationMonths, "allocatedHoldersRevenueInUsd") : null,
      allocatedProtocolRevenueTrailing90DaysInUsd: recent90Total,
      allocatedProtocolRevenueTrailing12MonthsInUsd: trailing12.length ? total(trailing12, "allocatedProtocolRevenueInUsd") : null,
      allocatedProtocolRevenueAnnualizedRunRateInUsd: runRate,
      allocatedProtocolRevenueChangeVsPrior90Days: change,
      zeroAllocatedProtocolRevenueMonths: completeAllocationMonths.length ? completeAllocationMonths.filter((row) => numberOrZero(row.allocatedProtocolRevenueInUsd) <= 1).length : null,
      operatingCostCoverageAvailable: false
    },
    marketRows,
    narrative: !completeAllocationDays.length
      ? "Official allocated protocol revenue is unavailable for this dataset. The full-history overview fields remain useful as fee-flow activity, but cannot establish how much the DAO retained."
      : runRate === null
        ? "Official allocated protocol revenue is refreshed, but fewer than 90 consecutive complete UTC days prevent a stable annualized run-rate comparison."
        : `The latest 90 consecutive complete UTC days annualize to ${formatMoney(runRate)} of official DAO/treasury revenue. The current UTC day is excluded until closed. LQ-staker allocation is reported separately, and operating costs are not exposed, so profitability is not inferred.`,
    scope: `Official DAO/treasury and LQ-staker allocation comes only from analytics.fees beginning 2026-01-01. Closed days are preserved individually; rolling run rates use those daily rows, while calendar-month totals are rebuilt from the same source.`,
    fetchErrorSummary: {}
  };
}

export function buildProtocolRevenueRunRateSeries(dailyRows) {
  const days = dailyRows
    .map((row) => normalizeProtocolFeeAllocation(row, "day"))
    .filter((row) => row.isComplete !== false && !row.fetchError)
    .sort((a, b) => String(a.date).localeCompare(String(b.date)));
  const series = [];
  for (let index = REVENUE_RUN_RATE_WINDOW_DAYS - 1; index < days.length; index += 1) {
    const window = days.slice(index - (REVENUE_RUN_RATE_WINDOW_DAYS - 1), index + 1);
    if (!consecutiveDays(window)) continue;
    const trailing90DaysProtocolRevenueInUsd = total(window, "allocatedProtocolRevenueInUsd");
    series.push({
      date: window.at(-1).periodEndDay,
      windowStartDate: window[0].periodStartDay,
      windowEndDate: window.at(-1).periodEndDay,
      observedDays: REVENUE_RUN_RATE_WINDOW_DAYS,
      trailing90DaysProtocolRevenueInUsd,
      annualizedRunRateInUsd: trailing90DaysProtocolRevenueInUsd * (ANNUALIZATION_DAYS / REVENUE_RUN_RATE_WINDOW_DAYS)
    });
  }
  return series;
}

function normalizeProtocolFeeAllocation(row, granularity = "month") {
  const breakdown = row.feeBreakdown || {};
  const date = String(row.date || row.periodStartDay || row.fromDate || "").slice(0, 10);
  return {
    ...row,
    date: granularity === "day" ? date : `${date.slice(0, 7)}-01`,
    periodStartDay: String(row.periodStartDay || row.fromDate || date).slice(0, 10),
    periodEndDay: String(row.periodEndDay || row.toDate || date).slice(0, 10),
    allocatedProtocolRevenueInUsd: numberOrZero(row.allocatedProtocolRevenueInUsd ?? row.protocolRevenueInUsd),
    allocatedHoldersRevenueInUsd: numberOrZero(row.allocatedHoldersRevenueInUsd ?? row.holdersRevenueInUsd),
    allocatedProtocolInterestRevenueInUsd: numberOrZero(row.allocatedProtocolInterestRevenueInUsd ?? row.borrowInterestAccruedForProtocolInUsd ?? row.borrowInterestAccruedForProtocol ?? breakdown.borrowInterestAccruedForProtocol),
    allocatedProtocolOriginationRevenueInUsd: numberOrZero(row.allocatedProtocolOriginationRevenueInUsd ?? row.loanOriginationFeesForProtocolInUsd ?? row.loanOriginationFeesForProtocol ?? breakdown.loanOriginationFeesForProtocol),
    allocatedHoldersInterestRevenueInUsd: numberOrZero(row.allocatedHoldersInterestRevenueInUsd ?? row.borrowInterestAccruedForHoldersInUsd ?? row.borrowInterestAccruedForHolders ?? breakdown.borrowInterestAccruedForHolders),
    allocatedHoldersOriginationRevenueInUsd: numberOrZero(row.allocatedHoldersOriginationRevenueInUsd ?? row.loanOriginationFeesForHoldersInUsd ?? row.loanOriginationFeesForHolders ?? breakdown.loanOriginationFeesForHolders)
  };
}

export function aggregateDailyProtocolFeeAllocations(dailyRows) {
  const groups = new Map();
  for (const sourceRow of dailyRows) {
    const row = normalizeProtocolFeeAllocation(sourceRow, "day");
    const month = row.date.slice(0, 7);
    if (!groups.has(month)) groups.set(month, []);
    groups.get(month).push(row);
  }
  return [...groups.entries()].sort(([left], [right]) => left.localeCompare(right)).map(([month, rows]) => {
    rows.sort((left, right) => left.date.localeCompare(right.date));
    const monthStart = `${month}-01`;
    const nextMonth = monthOffset(monthStart, 1);
    const monthEnd = new Date(Date.parse(`${nextMonth}T00:00:00Z`) - 86400000).toISOString().slice(0, 10);
    const periodStartDay = rows[0].date;
    const periodEndDay = rows.at(-1).date;
    const expectedDays = Math.round((Date.parse(`${periodEndDay}T00:00:00Z`) - Date.parse(`${periodStartDay}T00:00:00Z`)) / 86400000) + 1;
    const consecutiveDays = rows.every((row, index) => index === 0 || addDays(rows[index - 1].date, 1) === row.date);
    const isComplete = periodStartDay === monthStart
      && periodEndDay === monthEnd
      && rows.length === expectedDays
      && consecutiveDays
      && rows.every((row) => row.isComplete !== false && !row.fetchError);
    const sum = (key) => total(rows, key);
    return {
      date: monthStart,
      periodStartDay,
      periodEndDay,
      fromDate: rows[0].fromDate,
      toDate: rows.at(-1).toDate,
      protocolRevenueInUsd: sum("allocatedProtocolRevenueInUsd"),
      holdersRevenueInUsd: sum("allocatedHoldersRevenueInUsd"),
      borrowInterestAccruedForProtocolInUsd: sum("allocatedProtocolInterestRevenueInUsd"),
      loanOriginationFeesForProtocolInUsd: sum("allocatedProtocolOriginationRevenueInUsd"),
      borrowInterestAccruedForHoldersInUsd: sum("allocatedHoldersInterestRevenueInUsd"),
      loanOriginationFeesForHoldersInUsd: sum("allocatedHoldersOriginationRevenueInUsd"),
      isComplete,
      sourceRowCount: rows.length,
      provenance: "analytics-fees-daily-aggregate-v1"
    };
  });
}

function consecutiveMonths(rows) {
  return rows.every((row, index) => index === 0 || monthOffset(rows[index - 1].date, 1) === row.date);
}

function consecutiveDays(rows) {
  return rows.every((row, index) => index === 0 || addDays(rows[index - 1].date, 1) === row.date);
}

function allocationDaysInWindow(rows, startDate, length) {
  const endDate = addDays(startDate, length - 1);
  const window = rows.filter((row) => row.date >= startDate && row.date <= endDate);
  return window.length === length
    && window[0]?.date === startDate
    && window.at(-1)?.date === endDate
    && consecutiveDays(window)
    ? window
    : [];
}

function monthOffset(value, offset) {
  const date = new Date(`${String(value).slice(0, 7)}-01T00:00:00Z`);
  date.setUTCMonth(date.getUTCMonth() + offset);
  return date.toISOString().slice(0, 10);
}

function ongoingDrySpellDays(rows, field, options = {}) {
  if (!rows.length) return null;
  const threshold = Math.max(0, Number(options.threshold) || 0);
  let count = 0;
  for (let index = rows.length - 1; index >= 0; index -= 1) {
    if (index < rows.length - 1 && addDays(rows[index].date, 1) !== rows[index + 1].date) break;
    const value = numberOrZero(rows[index][field]);
    const magnitude = options.absolute ? Math.abs(value) : value;
    if (magnitude > threshold) break;
    count += 1;
  }
  return count;
}

function revenueMetrics(rows, tail90) {
  const repaidInterest = (row) => numberOrZero(row.interestRepaidInUsd);
  const origination = (row) => numberOrZero(row.loanOriginationFeesInUsd) + numberOrZero(row.loanOriginationFeesMinAdaInUsd);
  const realized = (row) => repaidInterest(row) + origination(row);
  const realizedFull = rows.reduce((value, row) => value + realized(row), 0);
  const realized90 = tail90.reduce((value, row) => value + realized(row), 0);
  return {
    grossRealizedRevenueProxyInUsd: realizedFull,
    grossRealizedRevenueProxy30dInUsd: rows.slice(-30).reduce((value, row) => value + realized(row), 0),
    grossRealizedRevenueProxy90dInUsd: realized90,
    repaidInterestFeeFlowInUsd: rows.reduce((value, row) => value + repaidInterest(row), 0),
    repaidInterestFeeFlow30dInUsd: rows.slice(-30).reduce((value, row) => value + repaidInterest(row), 0),
    repaidInterestFeeFlow90dInUsd: tail90.reduce((value, row) => value + repaidInterest(row), 0),
    originationFeeFlowInUsd: rows.reduce((value, row) => value + origination(row), 0),
    originationFeeFlow30dInUsd: rows.slice(-30).reduce((value, row) => value + origination(row), 0),
    originationFeeFlow90dInUsd: tail90.reduce((value, row) => value + origination(row), 0),
    marketRevenueState: realizedFull <= 1 ? "no_observable_revenue" : realized90 <= 1 ? "no_recent_revenue" : realized90 < 100 ? "very_low_recent_revenue" : "revenue_generating"
  };
}

function dailyLiquidationCoverage(monthly, daily) {
  const byDate = new Map(daily.map((row) => [row.date, row]));
  const missingDates = [];
  const reconciliations = [];
  let expectedDays = 0;
  for (const month of monthly) {
    const dates = dateRange(month.periodStartDay || month.fromDate, month.periodEndDay || month.toDate);
    expectedDays += dates.length;
    const rows = dates.map((date) => byDate.get(date)).filter(Boolean);
    dates.filter((date) => !byDate.has(date)).forEach((date) => missingDates.push(date));
    const monthlyProfit = numberOrZero(month.liquidationProfitInUsd);
    const dailyProfit = total(rows, "liquidationProfitInUsd");
    const complete = rows.length === dates.length;
    reconciliations.push({
      month: month.date,
      monthlyProfitInUsd: monthlyProfit,
      dailyProfitInUsd: dailyProfit,
      differenceInUsd: dailyProfit - monthlyProfit,
      complete,
      reconciled: complete && Math.abs(dailyProfit - monthlyProfit) <= Math.max(0.01, Math.abs(monthlyProfit) * 1e-6)
    });
  }
  const failures = reconciliations.filter((row) => row.complete && !row.reconciled).length;
  return {
    coverage: {
      firstDate: daily[0]?.date ?? null,
      lastDate: daily.at(-1)?.date ?? null,
      expectedDays,
      availableDays: daily.length,
      fetchedDays: daily.filter((row) => row.provenance === "daily-api").length,
      inferredZeroDays: daily.filter((row) => row.provenance === "monthly-zero").length,
      missingDays: missingDates.length,
      missingDates,
      reconciliationFailures: failures,
      complete: missingDates.length === 0 && failures === 0
    },
    reconciliations
  };
}

function normalizeLoan(loan) {
  return {
    marketId: loan.marketId || "Unknown",
    marketDisplayName: loan.marketDisplayName || loan.market?.displayName || loan.market?.symbol || loan.marketId || "Unknown",
    debtInUsd: numberOrZero(loan.debtInUsd ?? loan.amount),
    collateralInUsd: numberOrZero(loan.collateralInUsd ?? loan.collateral),
    healthFactor: finiteNumber(loan.healthFactor),
    LTV: finiteNumber(loan.LTV),
    APY: finiteNumber(loan.APY)
  };
}

function loanMarketRow(marketId, rows, protocolDebt) {
  const marketDisplayName = rows[0]?.marketDisplayName || marketId;
  const debt = total(rows, "debtInUsd");
  const health = rows.map((row) => row.healthFactor).filter(Number.isFinite).sort((a, b) => a - b);
  const badDebtLoans = rows.filter((row) => (row.debtInUsd || 0) > (row.collateralInUsd || 0));
  const badDebtInUsd = total(badDebtLoans, "debtInUsd");
  const badDebtCollateralInUsd = total(badDebtLoans, "collateralInUsd");
  const badDebtShortfallInUsd = Math.max(0, badDebtInUsd - badDebtCollateralInUsd);
  const loansLt100 = rows.filter((row) => (Number.isFinite(row.healthFactor) && row.healthFactor < 1.0) || ((row.debtInUsd || 0) > (row.collateralInUsd || 0)));
  const loansLe110 = rows.filter((row) => (Number.isFinite(row.healthFactor) && row.healthFactor <= 1.10) || ((row.debtInUsd || 0) > (row.collateralInUsd || 0)));
  const loansLe125 = rows.filter((row) => (Number.isFinite(row.healthFactor) && row.healthFactor <= 1.25) || ((row.debtInUsd || 0) > (row.collateralInUsd || 0)));
  const debtLt100 = Math.max(total(loansLt100, "debtInUsd"), badDebtInUsd);
  const debtLe110 = Math.max(total(loansLe110, "debtInUsd"), badDebtInUsd);
  const debt100To110 = Math.max(0, debtLe110 - debtLt100);
  const debt110To125 = total(rows.filter((row) => row.healthFactor > 1.10 && row.healthFactor <= 1.25), "debtInUsd");
  const debt125To150 = total(rows.filter((row) => row.healthFactor > 1.25 && row.healthFactor <= 1.50), "debtInUsd");
  const debtAbove150 = total(rows.filter((row) => row.healthFactor > 1.50), "debtInUsd");
  return {
    marketId,
    marketDisplayName,
    loanCount: rows.length,
    debtInUsd: debt,
    collateralInUsd: total(rows, "collateralInUsd"),
    debtShare: protocolDebt ? debt / protocolDebt : null,
    minHealthFactor: health[0] ?? null,
    p10HealthFactor: quantile(health, 0.10),
    medianHealthFactor: quantile(health, 0.50),
    debtWeightedHealthFactor: weightedAverage(rows, "healthFactor", "debtInUsd"),
    weightedLtv: weightedAverage(rows, "LTV", "debtInUsd"),
    weightedApy: weightedAverage(rows, "APY", "debtInUsd"),
    loanCountBelow100: loansLt100.length,
    loanCount100To110: Math.max(0, loansLe110.length - loansLt100.length),
    loanCountAtOrBelow110: loansLe110.length,
    loanCountAtOrBelow125: loansLe125.length,
    debtBelow100InUsd: debtLt100,
    debt100To110InUsd: debt100To110,
    debtAtOrBelow110InUsd: debtLe110,
    debt110To125InUsd: debt110To125,
    debtAtOrBelow125InUsd: debtLe110 + debt110To125,
    debt125To150InUsd: debt125To150,
    debtAtOrBelow150InUsd: debtLe110 + debt110To125 + debt125To150,
    debtAbove150InUsd: debtAbove150,
    badDebtLoanCount: badDebtLoans.length,
    badDebtInUsd,
    badDebtCollateralInUsd,
    badDebtShortfallInUsd,
    loanHealthPressure: debt ? (debtLe110 + 0.30 * debt110To125 + 0.05 * debt125To150) / debt : 0,
    healthBuckets: healthBucketRows(rows, debt)
  };
}

function healthBucketRows(rows, totalDebt) {
  return LOAN_HEALTH_BUCKETS.map(([bucket, label, lower, upper, color]) => {
    const part = rows.filter((row) => Number.isFinite(row.healthFactor) && (lower === -Infinity ? row.healthFactor <= upper : upper === Infinity ? row.healthFactor > lower : row.healthFactor > lower && row.healthFactor <= upper));
    const debtInUsd = total(part, "debtInUsd");
    return { bucket, label, loanCount: part.length, debtInUsd, debtShare: totalDebt ? debtInUsd / totalDebt : null, color };
  });
}

function weightedAverage(rows, valueKey, weightKey) {
  const valid = rows.filter((row) => Number.isFinite(row[valueKey]) && numberOrZero(row[weightKey]) > 0);
  const weight = total(valid, weightKey);
  return weight ? valid.reduce((sum, row) => sum + row[valueKey] * row[weightKey], 0) / weight : null;
}

function groupBy(rows, key) {
  const grouped = new Map();
  rows.forEach((row) => {
    const value = row[key];
    const group = grouped.get(value) || [];
    group.push(row);
    grouped.set(value, group);
  });
  return grouped;
}

function dateRange(startValue, endValue) {
  const start = Date.parse(`${String(startValue).slice(0, 10)}T00:00:00Z`);
  const end = Date.parse(`${String(endValue).slice(0, 10)}T00:00:00Z`);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return [];
  const dates = [];
  for (let value = start; value <= end; value += 86400000) dates.push(new Date(value).toISOString().slice(0, 10));
  return dates;
}

function quantile(values, fraction) {
  const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (!sorted.length) return null;
  const index = (sorted.length - 1) * fraction;
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  if (lower === upper) return sorted[lower];
  return sorted[lower] + (sorted[upper] - sorted[lower]) * (index - lower);
}

function total(rows, key) {
  return rows.reduce((value, row) => value + numberOrZero(row[key]), 0);
}

function finiteNumber(value) {
  if (value === "" || value === null || value === undefined) return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function marketNarrative(summary, coverage90, lastDate) {
  const coverage = Number.isFinite(coverage90) ? `${coverage90.toFixed(2)}x` : "unavailable";
  return `${summary.marketId} currently has ${formatMoney(summary.currentBorrowInUsd)} borrowed at ${(numberOrZero(summary.currentUtilization) * 100).toFixed(1)}% utilization. Latest 90-day interest coverage is ${coverage}; all displayed analysis is current through ${lastDate}.`;
}

function formatMoney(value) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(numberOrZero(value));
}

function formatNumber(value) {
  return Number.isFinite(value) ? value.toFixed(2) : "unavailable";
}
