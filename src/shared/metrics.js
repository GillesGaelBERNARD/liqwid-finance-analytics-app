import { compareDateKeys, filterRowsByDate, toDateKey } from "./dates.js";

const HISTORY_NUMERIC_FIELDS = [
  "supply",
  "supplyInUsd",
  "borrow",
  "borrowInUsd",
  "liquidity",
  "liquidityInUsd",
  "debtRepaid",
  "debtRepaidInUsd",
  "interestAccrued",
  "interestAccruedInUsd",
  "interestRepaid",
  "interestRepaidInUsd",
  "borrowApr",
  "supplyApy",
  "utilizationPercentage",
  "loanOriginationFees",
  "loanOriginationFeesInUsd",
  "loanOriginationFeesMinAda",
  "loanOriginationFeesMinAdaInUsd"
];

const ACTIVITY_FIELDS = [
  "supplyInUsd",
  "borrowInUsd",
  "liquidityInUsd",
  "debtRepaidInUsd",
  "interestAccruedInUsd",
  "interestRepaidInUsd",
  "loanOriginationFeesInUsd"
];

const GAP_WINDOWS = [7, 30, 90];

export function numberOrZero(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

export function normalizeMarketHistoryRows(rows, market = {}) {
  return [...rows]
    .map((row) => {
      const normalized = {
        marketId: row.marketId ?? market.id,
        marketDisplayName: row.marketDisplayName ?? market.displayName ?? row.marketId ?? market.id,
        timestamp: row.timestamp,
        date: toDateKey(row.date ?? row.timestamp)
      };

      for (const field of HISTORY_NUMERIC_FIELDS) {
        normalized[field] = numberOrZero(row[field]);
      }

      normalized.utilizationPercentage =
        normalized.utilizationPercentage > 1
          ? normalized.utilizationPercentage / 100
          : normalized.utilizationPercentage;

      return normalized;
    })
    .filter((row) => row.date)
    .sort((a, b) => compareDateKeys(a.date, b.date));
}

export function firstActiveDate(rows) {
  const row = rows.find((entry) => ACTIVITY_FIELDS.some((field) => Math.abs(numberOrZero(entry[field])) > 0));
  return row ? row.date ?? toDateKey(row.timestamp) : null;
}

export function withDerivedMarketMetrics(rows, options = {}) {
  const activeMedianWindow = options.activeMedianWindow ?? 30;
  const protocolAggregate = options.protocolAggregate === true
    || rows.some((row) => row.gapAggregation === "market-usd-sum");
  const nativeDebtAvailable = !protocolAggregate && nativeSeriesAvailable(
    rows,
    ["borrow", "debtRepaid"],
    ["borrowInUsd", "debtRepaidInUsd"]
  );
  const nativeInterestAvailable = !protocolAggregate && nativeSeriesAvailable(
    rows,
    ["interestAccrued", "interestRepaid"],
    ["interestAccruedInUsd", "interestRepaidInUsd"]
  );
  let cumulativeDebtFlowGap = 0;
  let cumulativeDebtFlowGapInUsdFallback = 0;
  let cumulativeUnclassifiedBorrowReduction = 0;
  let cumulativeUnclassifiedBorrowReductionInUsdFallback = 0;
  let cumulativeInterestGap = 0;
  let cumulativeInterestGapInUsdFallback = 0;
  const debtGapHistory = [];
  const interestGapHistory = [];
  const debtAccruedHistory = [];
  const debtRepaidHistory = [];
  const interestAccruedHistory = [];
  const interestRepaidHistory = [];
  let cumulativeDebtAccrued = 0;
  let cumulativeDebtRepaid = 0;
  let cumulativeInterestAccrued = 0;
  let cumulativeInterestRepaid = 0;
  let cumulativeDebtAccruedInUsdFallback = 0;
  let cumulativeDebtRepaidInUsdFallback = 0;
  let cumulativeInterestAccruedInUsdFallback = 0;
  let cumulativeInterestRepaidInUsdFallback = 0;
  const activeRepayments = [];

  return rows.map((row, index) => {
    const price = protocolAggregate
      ? { assetPriceInUsd: null, assetPriceSource: null }
      : impliedAssetPriceInUsd(row);
    const debtAccrual = deriveDebtAccrued(rows, index, price.assetPriceInUsd);
    let unclassifiedBorrowReduction = null;
    let unclassifiedBorrowReductionInUsd = optionalNumber(row.unclassifiedBorrowReductionInUsd);
    let cumulativeUnclassifiedBorrowReductionValue = null;
    let cumulativeUnclassifiedBorrowReductionInUsd = optionalNumber(
      row.cumulativeUnclassifiedBorrowReductionInUsd
    );
    let debtFlowGap = null;
    let debtFlowGapInUsd = optionalNumber(row.dailyDebtFlowGapInUsd ?? row.debtFlowGapInUsd);
    let cumulativeDebtFlowGapValue = null;
    let cumulativeDebtFlowGapInUsd = optionalNumber(row.cumulativeDebtFlowGapInUsd);
    let interestGap = null;
    let interestGapInUsd = optionalNumber(row.dailyInterestGapInUsd ?? row.interestGapInUsd);
    let cumulativeInterestGapValue = null;
    let cumulativeInterestGapInUsd = optionalNumber(row.cumulativeInterestGapInUsd);
    const debtAccruedNative = nativeDebtAvailable ? debtAccrual.debtAccrued : null;
    const debtRepaidNative = nativeDebtAvailable ? numberOrZero(row.debtRepaid) : null;
    const interestAccruedNative = nativeInterestAvailable ? numberOrZero(row.interestAccrued) : null;
    const interestRepaidNative = nativeInterestAvailable ? numberOrZero(row.interestRepaid) : null;

    if (protocolAggregate) {
      cumulativeDebtFlowGapInUsd = optionalNumber(row.cumulativeDebtFlowGapInUsd);
      cumulativeUnclassifiedBorrowReductionInUsd = optionalNumber(
        row.cumulativeUnclassifiedBorrowReductionInUsd
      );
      cumulativeInterestGapInUsd = optionalNumber(row.cumulativeInterestGapInUsd);
    } else {
      if (nativeDebtAvailable) {
        unclassifiedBorrowReduction = deriveUnclassifiedBorrowReduction(rows, index, false);
        if (unclassifiedBorrowReduction !== null) {
          cumulativeUnclassifiedBorrowReduction += unclassifiedBorrowReduction;
        }
        cumulativeUnclassifiedBorrowReductionValue = cumulativeUnclassifiedBorrowReduction;
        unclassifiedBorrowReductionInUsd = valueNativeAmountInUsd(
          unclassifiedBorrowReduction,
          price.assetPriceInUsd
        );
        cumulativeUnclassifiedBorrowReductionInUsd = valueNativeAmountInUsd(
          cumulativeUnclassifiedBorrowReduction,
          price.assetPriceInUsd
        );
        debtFlowGap = debtAccrual.debtAccrued === null
          ? null
          : debtAccrual.debtAccrued - numberOrZero(row.debtRepaid);
        if (debtFlowGap !== null) cumulativeDebtFlowGap += debtFlowGap;
        cumulativeDebtFlowGapValue = cumulativeDebtFlowGap;
        debtFlowGapInUsd = valueNativeAmountInUsd(debtFlowGap, price.assetPriceInUsd);
        cumulativeDebtFlowGapInUsd = valueNativeAmountInUsd(cumulativeDebtFlowGap, price.assetPriceInUsd);
      } else {
        unclassifiedBorrowReductionInUsd = deriveUnclassifiedBorrowReduction(rows, index, true);
        if (unclassifiedBorrowReductionInUsd !== null) {
          cumulativeUnclassifiedBorrowReductionInUsdFallback += unclassifiedBorrowReductionInUsd;
        }
        cumulativeUnclassifiedBorrowReductionInUsd =
          cumulativeUnclassifiedBorrowReductionInUsdFallback;
        debtFlowGapInUsd = debtAccrual.debtAccruedInUsd === null
          ? null
          : debtAccrual.debtAccruedInUsd - numberOrZero(row.debtRepaidInUsd);
        if (debtFlowGapInUsd !== null) cumulativeDebtFlowGapInUsdFallback += debtFlowGapInUsd;
        cumulativeDebtFlowGapInUsd = cumulativeDebtFlowGapInUsdFallback;
      }

      if (nativeInterestAvailable) {
        interestGap = numberOrZero(row.interestAccrued) - numberOrZero(row.interestRepaid);
        cumulativeInterestGap += interestGap;
        cumulativeInterestGapValue = cumulativeInterestGap;
        interestGapInUsd = valueNativeAmountInUsd(interestGap, price.assetPriceInUsd);
        cumulativeInterestGapInUsd = valueNativeAmountInUsd(cumulativeInterestGap, price.assetPriceInUsd);
      } else {
        interestGapInUsd = numberOrZero(row.interestAccruedInUsd) - numberOrZero(row.interestRepaidInUsd);
        cumulativeInterestGapInUsdFallback += interestGapInUsd;
        cumulativeInterestGapInUsd = cumulativeInterestGapInUsdFallback;
      }
    }

    debtGapHistory.push(debtFlowGap);
    interestGapHistory.push(interestGap);
    debtAccruedHistory.push(debtAccruedNative);
    debtRepaidHistory.push(debtRepaidNative);
    interestAccruedHistory.push(interestAccruedNative);
    interestRepaidHistory.push(interestRepaidNative);
    if (debtAccruedNative !== null) cumulativeDebtAccrued += debtAccruedNative;
    if (debtRepaidNative !== null) cumulativeDebtRepaid += debtRepaidNative;
    if (interestAccruedNative !== null) cumulativeInterestAccrued += interestAccruedNative;
    if (interestRepaidNative !== null) cumulativeInterestRepaid += interestRepaidNative;
    if (debtAccrual.debtAccruedInUsd !== null) cumulativeDebtAccruedInUsdFallback += debtAccrual.debtAccruedInUsd;
    cumulativeDebtRepaidInUsdFallback += numberOrZero(row.debtRepaidInUsd);
    cumulativeInterestAccruedInUsdFallback += numberOrZero(row.interestAccruedInUsd);
    cumulativeInterestRepaidInUsdFallback += numberOrZero(row.interestRepaidInUsd);
    const rollingGaps = {};
    const rollingCoverage = {};
    for (const window of GAP_WINDOWS) {
      if (protocolAggregate) {
        rollingGaps[`debtFlowGap${window}d`] = null;
        rollingGaps[`debtFlowGap${window}dInUsd`] = optionalNumber(row[`debtFlowGap${window}dInUsd`]);
        rollingGaps[`interestGap${window}d`] = null;
        rollingGaps[`interestGap${window}dInUsd`] = optionalNumber(row[`interestGap${window}dInUsd`]);
        rollingCoverage[`debtAccrued${window}d`] = null;
        rollingCoverage[`debtRepaid${window}d`] = null;
        rollingCoverage[`debtAccrued${window}dInUsd`] = optionalNumber(row[`debtAccrued${window}dInUsd`]);
        rollingCoverage[`debtRepaid${window}dInUsd`] = optionalNumber(row[`debtRepaid${window}dInUsd`]);
        rollingCoverage[`debtCoverage${window}d`] = optionalNumber(row[`debtCoverage${window}d`]);
        rollingCoverage[`interestAccrued${window}d`] = null;
        rollingCoverage[`interestRepaid${window}d`] = null;
        rollingCoverage[`interestAccrued${window}dInUsd`] = optionalNumber(row[`interestAccrued${window}dInUsd`]);
        rollingCoverage[`interestRepaid${window}dInUsd`] = optionalNumber(row[`interestRepaid${window}dInUsd`]);
        rollingCoverage[`interestCoverage${window}d`] = optionalNumber(row[`interestCoverage${window}d`]);
        continue;
      }
      const rollingDebtGap = nativeDebtAvailable ? rollingFiniteSum(debtGapHistory, window) : null;
      const rollingInterestGap = nativeInterestAvailable ? rollingFiniteSum(interestGapHistory, window) : null;
      const rollingDebtAccrued = nativeDebtAvailable ? rollingFiniteSum(debtAccruedHistory, window) : null;
      const rollingDebtRepaid = nativeDebtAvailable ? rollingFiniteSum(debtRepaidHistory, window) : null;
      const rollingInterestAccrued = nativeInterestAvailable ? rollingFiniteSum(interestAccruedHistory, window) : null;
      const rollingInterestRepaid = nativeInterestAvailable ? rollingFiniteSum(interestRepaidHistory, window) : null;
      rollingGaps[`debtFlowGap${window}d`] = rollingDebtGap;
      rollingGaps[`debtFlowGap${window}dInUsd`] = nativeDebtAvailable
        ? valueNativeAmountInUsd(rollingDebtGap, price.assetPriceInUsd)
        : rollingFiniteSum(rows.slice(0, index + 1).map((entry, entryIndex) => {
            const accrued = deriveDebtAccrued(rows, entryIndex, impliedAssetPriceInUsd(entry).assetPriceInUsd).debtAccruedInUsd;
            return accrued === null ? null : accrued - numberOrZero(entry.debtRepaidInUsd);
          }), window);
      rollingGaps[`interestGap${window}d`] = rollingInterestGap;
      rollingGaps[`interestGap${window}dInUsd`] = nativeInterestAvailable
        ? valueNativeAmountInUsd(rollingInterestGap, price.assetPriceInUsd)
        : rollingFiniteSum(
            rows.slice(0, index + 1).map((entry) =>
              numberOrZero(entry.interestAccruedInUsd) - numberOrZero(entry.interestRepaidInUsd)
            ),
            window
          );
      rollingCoverage[`debtAccrued${window}d`] = rollingDebtAccrued;
      rollingCoverage[`debtRepaid${window}d`] = rollingDebtRepaid;
      rollingCoverage[`debtAccrued${window}dInUsd`] = nativeDebtAvailable
        ? valueNativeAmountInUsd(rollingDebtAccrued, price.assetPriceInUsd)
        : rollingFiniteSum(
            rows.slice(0, index + 1).map((entry, entryIndex) =>
              deriveDebtAccrued(rows, entryIndex, impliedAssetPriceInUsd(entry).assetPriceInUsd).debtAccruedInUsd
            ),
            window
          );
      rollingCoverage[`debtRepaid${window}dInUsd`] = nativeDebtAvailable
        ? valueNativeAmountInUsd(rollingDebtRepaid, price.assetPriceInUsd)
        : rollingFiniteSum(rows.slice(0, index + 1).map((entry) => numberOrZero(entry.debtRepaidInUsd)), window);
      rollingCoverage[`debtCoverage${window}d`] = coverageRatio(
        nativeDebtAvailable ? rollingDebtRepaid : rollingCoverage[`debtRepaid${window}dInUsd`],
        nativeDebtAvailable ? rollingDebtAccrued : rollingCoverage[`debtAccrued${window}dInUsd`]
      );
      rollingCoverage[`interestAccrued${window}d`] = rollingInterestAccrued;
      rollingCoverage[`interestRepaid${window}d`] = rollingInterestRepaid;
      rollingCoverage[`interestAccrued${window}dInUsd`] = nativeInterestAvailable
        ? valueNativeAmountInUsd(rollingInterestAccrued, price.assetPriceInUsd)
        : rollingFiniteSum(rows.slice(0, index + 1).map((entry) => numberOrZero(entry.interestAccruedInUsd)), window);
      rollingCoverage[`interestRepaid${window}dInUsd`] = nativeInterestAvailable
        ? valueNativeAmountInUsd(rollingInterestRepaid, price.assetPriceInUsd)
        : rollingFiniteSum(rows.slice(0, index + 1).map((entry) => numberOrZero(entry.interestRepaidInUsd)), window);
      rollingCoverage[`interestCoverage${window}d`] = coverageRatio(
        nativeInterestAvailable ? rollingInterestRepaid : rollingCoverage[`interestRepaid${window}dInUsd`],
        nativeInterestAvailable ? rollingInterestAccrued : rollingCoverage[`interestAccrued${window}dInUsd`]
      );
    }

    const debtCoverageRatio = coverageRatio(
      nativeDebtAvailable ? debtRepaidNative : row.debtRepaidInUsd,
      nativeDebtAvailable ? debtAccruedNative : debtAccrual.debtAccruedInUsd
    );
    const interestCoverageRatio = coverageRatio(
      nativeInterestAvailable ? interestRepaidNative : row.interestRepaidInUsd,
      nativeInterestAvailable ? interestAccruedNative : row.interestAccruedInUsd
    );
    const cumulativeCoverage = protocolAggregate
      ? {
          debtAccruedCumulative: null,
          debtRepaidCumulative: null,
          debtAccruedCumulativeInUsd: optionalNumber(row.debtAccruedCumulativeInUsd),
          debtRepaidCumulativeInUsd: optionalNumber(row.debtRepaidCumulativeInUsd),
          debtCoverageCumulative: optionalNumber(row.debtCoverageCumulative),
          interestAccruedCumulative: null,
          interestRepaidCumulative: null,
          interestAccruedCumulativeInUsd: optionalNumber(row.interestAccruedCumulativeInUsd),
          interestRepaidCumulativeInUsd: optionalNumber(row.interestRepaidCumulativeInUsd),
          interestCoverageCumulative: optionalNumber(row.interestCoverageCumulative)
        }
      : {
          debtAccruedCumulative: nativeDebtAvailable ? cumulativeDebtAccrued : null,
          debtRepaidCumulative: nativeDebtAvailable ? cumulativeDebtRepaid : null,
          debtAccruedCumulativeInUsd: nativeDebtAvailable
            ? valueNativeAmountInUsd(cumulativeDebtAccrued, price.assetPriceInUsd)
            : cumulativeDebtAccruedInUsdFallback,
          debtRepaidCumulativeInUsd: nativeDebtAvailable
            ? valueNativeAmountInUsd(cumulativeDebtRepaid, price.assetPriceInUsd)
            : cumulativeDebtRepaidInUsdFallback,
          debtCoverageCumulative: coverageRatio(
            nativeDebtAvailable ? cumulativeDebtRepaid : cumulativeDebtRepaidInUsdFallback,
            nativeDebtAvailable ? cumulativeDebtAccrued : cumulativeDebtAccruedInUsdFallback
          ),
          interestAccruedCumulative: nativeInterestAvailable ? cumulativeInterestAccrued : null,
          interestRepaidCumulative: nativeInterestAvailable ? cumulativeInterestRepaid : null,
          interestAccruedCumulativeInUsd: nativeInterestAvailable
            ? valueNativeAmountInUsd(cumulativeInterestAccrued, price.assetPriceInUsd)
            : cumulativeInterestAccruedInUsdFallback,
          interestRepaidCumulativeInUsd: nativeInterestAvailable
            ? valueNativeAmountInUsd(cumulativeInterestRepaid, price.assetPriceInUsd)
            : cumulativeInterestRepaidInUsdFallback,
          interestCoverageCumulative: coverageRatio(
            nativeInterestAvailable ? cumulativeInterestRepaid : cumulativeInterestRepaidInUsdFallback,
            nativeInterestAvailable ? cumulativeInterestAccrued : cumulativeInterestAccruedInUsdFallback
          )
        };

    const trailingActive = activeRepayments.slice(-activeMedianWindow);
    const activeMedian = median(trailingActive);
    const repaymentBurstScore =
      row.debtRepaidInUsd > 0 && activeMedian && activeMedian > 0
        ? row.debtRepaidInUsd / activeMedian
        : null;

    if (row.debtRepaidInUsd > 0) {
      activeRepayments.push(row.debtRepaidInUsd);
    }

    return {
      ...row,
      ...debtAccrual,
      ...price,
      debtFlowGap,
      debtFlowGapInUsd,
      dailyDebtFlowGapInUsd: debtFlowGapInUsd,
      cumulativeDebtFlowGap: cumulativeDebtFlowGapValue,
      cumulativeDebtFlowGapInUsd,
      unclassifiedBorrowReduction,
      unclassifiedBorrowReductionInUsd,
      cumulativeUnclassifiedBorrowReduction: cumulativeUnclassifiedBorrowReductionValue,
      cumulativeUnclassifiedBorrowReductionInUsd,
      interestGap,
      interestGapInUsd,
      dailyInterestGapInUsd: interestGapInUsd,
      cumulativeInterestGap: cumulativeInterestGapValue,
      cumulativeInterestGapInUsd,
      ...rollingGaps,
      ...rollingCoverage,
      ...cumulativeCoverage,
      debtCoverageRatio,
      interestCoverageRatio,
      liquidityBuffer: row.borrowInUsd > 0 ? row.liquidityInUsd / row.borrowInUsd : null,
      repaymentActive: row.debtRepaidInUsd > 0,
      repaymentBurstScore
    };
  });
}

export function summarizeMarket(market, rows, options = {}) {
  const windowed = withDerivedMarketMetrics(
    filterRowsByDate(rows, options.startDate, options.endDate)
  );
  const current = windowed.at(-1) ?? null;
  const repaymentValues = windowed.map((row) => row.debtRepaidInUsd);
  const activeRepaymentValues = repaymentValues.filter((value) => value > 0);
  const totalDebtRepaidInUsd = sum(windowed, "debtRepaidInUsd");
  const totalInterestAccrued = sum(windowed, "interestAccrued");
  const totalInterestRepaid = sum(windowed, "interestRepaid");
  const totalInterestAccruedInUsd = sum(windowed, "interestAccruedInUsd");
  const totalInterestRepaidInUsd = sum(windowed, "interestRepaidInUsd");
  const currentInterestGapInUsd = optionalNumber(current?.cumulativeInterestGapInUsd)
    ?? totalInterestAccruedInUsd - totalInterestRepaidInUsd;
  const currentInterestGap = optionalNumber(current?.cumulativeInterestGap);
  const currentValuedInterestAccruedInUsd = currentInterestGap !== null
    && current?.assetPriceInUsd !== null
    ? totalInterestAccrued * current.assetPriceInUsd
    : totalInterestAccruedInUsd;
  const protocolInterestCoverage = current?.gapAggregation === "market-usd-sum"
    ? optionalNumber(current.interestCoverageCumulative)
    : null;
  const drySpells = computeDrySpells(windowed);
  const highUtilizationThreshold = options.highUtilizationThreshold ?? 0.85;
  const groupName = market.group?.name ?? market.group?.id ?? (typeof market.group === "string" ? market.group : null);
  const isIsolated = Boolean(groupName || market.group);
  const borrowCap = market.parameters?.borrowCap !== undefined ? market.parameters.borrowCap : null;
  const supplyCap = market.parameters?.supplyCap !== undefined ? market.parameters.supplyCap : null;
  const collateralCount = Array.isArray(market.parameters?.collateralParameters)
    ? market.parameters.collateralParameters.length
    : (market.collaterals?.length ?? 0);

  return {
    marketId: market.id,
    displayName: market.displayName ?? market.id,
    symbol: market.symbol ?? market.id,
    group: groupName,
    isIsolated,
    borrowCap,
    supplyCap,
    collateralCount,
    rows: windowed.length,
    firstDate: windowed[0]?.date ?? null,
    lastDate: current?.date ?? null,
    firstActiveDate: firstActiveDate(rows),
    currentSupplyInUsd: current?.supplyInUsd ?? 0,
    currentBorrowInUsd: current?.borrowInUsd ?? 0,
    currentLiquidityInUsd: current?.liquidityInUsd ?? 0,
    currentUtilization: current?.utilizationPercentage ?? 0,
    currentBorrowApr: current?.borrowApr ?? 0,
    currentSupplyApy: current?.supplyApy ?? 0,
    totalDebtRepaidInUsd,
    totalInterestAccrued,
    totalInterestRepaid,
    totalInterestAccruedInUsd,
    totalInterestRepaidInUsd,
    netInterestGap: currentInterestGap,
    netInterestGapInUsd: currentInterestGapInUsd,
    currentValuedInterestAccruedInUsd,
    interestCoverageRatio:
      protocolInterestCoverage !== null
        ? protocolInterestCoverage
        : totalInterestAccrued > 0
        ? totalInterestRepaid / totalInterestAccrued
        : totalInterestAccruedInUsd > 0
          ? totalInterestRepaidInUsd / totalInterestAccruedInUsd
          : null,
    repaymentActivityDays: activeRepaymentValues.length,
    repaymentActivityRate: windowed.length ? activeRepaymentValues.length / windowed.length : 0,
    maxDrySpellDays: drySpells.length ? Math.max(...drySpells.map((spell) => spell.length)) : 0,
    repaymentConcentrationHhi: normalizedHhi(activeRepaymentValues),
    repaymentHalfLifeDays: repaymentHalfLifeDays(windowed),
    highUtilizationDays: windowed.filter((row) => row.utilizationPercentage >= highUtilizationThreshold).length,
    liquidityBuffer: current && current.borrowInUsd > 0 ? current.liquidityInUsd / current.borrowInUsd : null,
    medianActiveRepaymentInUsd: median(activeRepaymentValues),
    maxDailyDebtRepaidInUsd: Math.max(0, ...repaymentValues),
    maxRepaymentBurstScore: Math.max(0, ...windowed.map((row) => row.repaymentBurstScore ?? 0))
  };
}

export function aggregateProtocolSeries(marketSeriesById) {
  const byDate = new Map();

  for (const [marketId, rows] of Object.entries(marketSeriesById)) {
    for (const row of withDerivedMarketMetrics(rows)) {
      const existing = byDate.get(row.date) ?? {
        date: row.date,
        timestamp: row.timestamp,
        marketCount: 0,
        supplyInUsd: 0,
        borrowInUsd: 0,
        liquidityInUsd: 0,
        debtAccruedInUsd: 0,
        debtAccruedObservedMarkets: 0,
        debtRepaidInUsd: 0,
        interestAccruedInUsd: 0,
        interestRepaidInUsd: 0,
        dailyDebtFlowGapInUsd: 0,
        dailyDebtFlowGapObservedMarkets: 0,
        cumulativeDebtFlowGapInUsd: 0,
        cumulativeDebtFlowGapObservedMarkets: 0,
        unclassifiedBorrowReductionInUsd: 0,
        unclassifiedBorrowReductionObservedMarkets: 0,
        cumulativeUnclassifiedBorrowReductionInUsd: 0,
        cumulativeUnclassifiedBorrowReductionObservedMarkets: 0,
        dailyInterestGapInUsd: 0,
        dailyInterestGapObservedMarkets: 0,
        cumulativeInterestGapInUsd: 0,
        cumulativeInterestGapObservedMarkets: 0,
        debtAccruedCumulativeInUsd: 0,
        debtRepaidCumulativeInUsd: 0,
        debtCoverageCumulativeObservedMarkets: 0,
        interestAccruedCumulativeInUsd: 0,
        interestRepaidCumulativeInUsd: 0,
        interestCoverageCumulativeObservedMarkets: 0,
        loanOriginationFeesInUsd: 0,
        gapAggregation: "market-usd-sum",
        markets: []
      };
      for (const window of GAP_WINDOWS) {
        existing[`debtFlowGap${window}dInUsd`] ??= 0;
        existing[`debtFlowGap${window}dObservedMarkets`] ??= 0;
        existing[`interestGap${window}dInUsd`] ??= 0;
        existing[`interestGap${window}dObservedMarkets`] ??= 0;
        existing[`debtAccrued${window}dInUsd`] ??= 0;
        existing[`debtRepaid${window}dInUsd`] ??= 0;
        existing[`debtCoverage${window}dObservedMarkets`] ??= 0;
        existing[`interestAccrued${window}dInUsd`] ??= 0;
        existing[`interestRepaid${window}dInUsd`] ??= 0;
        existing[`interestCoverage${window}dObservedMarkets`] ??= 0;
      }

      existing.marketCount += 1;
      existing.supplyInUsd += numberOrZero(row.supplyInUsd);
      existing.borrowInUsd += numberOrZero(row.borrowInUsd);
      existing.liquidityInUsd += numberOrZero(row.liquidityInUsd);
      if (Number.isFinite(row.debtAccruedInUsd)) {
        existing.debtAccruedInUsd += row.debtAccruedInUsd;
        existing.debtAccruedObservedMarkets += 1;
      }
      existing.debtRepaidInUsd += numberOrZero(row.debtRepaidInUsd);
      existing.interestAccruedInUsd += numberOrZero(row.interestAccruedInUsd);
      existing.interestRepaidInUsd += numberOrZero(row.interestRepaidInUsd);
      addObservedGap(existing, "dailyDebtFlowGap", row.dailyDebtFlowGapInUsd);
      addObservedGap(existing, "cumulativeDebtFlowGap", row.cumulativeDebtFlowGapInUsd);
      addObservedGap(
        existing,
        "unclassifiedBorrowReduction",
        row.unclassifiedBorrowReductionInUsd
      );
      addObservedGap(
        existing,
        "cumulativeUnclassifiedBorrowReduction",
        row.cumulativeUnclassifiedBorrowReductionInUsd
      );
      addObservedGap(existing, "dailyInterestGap", row.dailyInterestGapInUsd);
      addObservedGap(existing, "cumulativeInterestGap", row.cumulativeInterestGapInUsd);
      addCoveragePair(
        existing,
        "debt",
        "Cumulative",
        row.debtAccruedCumulativeInUsd,
        row.debtRepaidCumulativeInUsd
      );
      addCoveragePair(
        existing,
        "interest",
        "Cumulative",
        row.interestAccruedCumulativeInUsd,
        row.interestRepaidCumulativeInUsd
      );
      for (const window of GAP_WINDOWS) {
        addObservedGap(existing, `debtFlowGap${window}d`, row[`debtFlowGap${window}dInUsd`]);
        addObservedGap(existing, `interestGap${window}d`, row[`interestGap${window}dInUsd`]);
        addCoveragePair(
          existing,
          "debt",
          `${window}d`,
          row[`debtAccrued${window}dInUsd`],
          row[`debtRepaid${window}dInUsd`]
        );
        addCoveragePair(
          existing,
          "interest",
          `${window}d`,
          row[`interestAccrued${window}dInUsd`],
          row[`interestRepaid${window}dInUsd`]
        );
      }
      existing.loanOriginationFeesInUsd += numberOrZero(row.loanOriginationFeesInUsd);
      existing.markets.push(marketId);
      byDate.set(row.date, existing);
    }
  }

  return withDerivedMarketMetrics(
    [...byDate.values()]
      .map(finalizeProtocolGapRow)
      .sort((a, b) => compareDateKeys(a.date, b.date)),
    { protocolAggregate: true }
  );
}

function deriveDebtAccrued(rows, index, assetPriceInUsd = null) {
  const row = rows[index] || {};
  const existingUsd = optionalNumber(row.debtAccruedInUsd);
  if (existingUsd !== null) {
    const existingNative = optionalNumber(row.debtAccrued);
    return {
      debtAccrued: existingNative,
      debtAccruedInUsd: existingNative === null
        ? existingUsd
        : valueNativeAmountInUsd(existingNative, assetPriceInUsd) ?? existingUsd,
      debtAccruedSource: row.debtAccruedSource || "provided"
    };
  }
  if (index === 0) return { debtAccrued: null, debtAccruedInUsd: null, debtAccruedSource: null };

  const previous = rows[index - 1] || {};
  const currentNativeBorrow = numberOrZero(row.borrow);
  const previousNativeBorrow = numberOrZero(previous.borrow);
  const nativeRepaid = numberOrZero(row.debtRepaid);
  const nativeFieldsAvailable = currentNativeBorrow !== 0 || previousNativeBorrow !== 0 || nativeRepaid !== 0;
  if (nativeFieldsAvailable) {
    const debtAccrued = Math.max(0, currentNativeBorrow - previousNativeBorrow + nativeRepaid);
    if (assetPriceInUsd !== null || debtAccrued === 0) {
      return {
        debtAccrued,
        debtAccruedInUsd: valueNativeAmountInUsd(debtAccrued, assetPriceInUsd),
        debtAccruedSource: "native-balance-identity"
      };
    }
  }

  return {
    debtAccrued: null,
    debtAccruedInUsd: Math.max(0, numberOrZero(row.borrowInUsd) - numberOrZero(previous.borrowInUsd) + numberOrZero(row.debtRepaidInUsd)),
    debtAccruedSource: "usd-balance-identity-fallback"
  };
}

function deriveUnclassifiedBorrowReduction(rows, index, useUsdAmounts) {
  if (index === 0) return null;
  const row = rows[index] || {};
  const previous = rows[index - 1] || {};
  const suffix = useUsdAmounts ? "InUsd" : "";
  const borrowChange = numberOrZero(row[`borrow${suffix}`])
    - numberOrZero(previous[`borrow${suffix}`]);
  const reportedRepayment = numberOrZero(row[`debtRepaid${suffix}`]);
  return Math.max(0, -(borrowChange + reportedRepayment));
}

function optionalNumber(value) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function coverageRatio(repaid, accrued) {
  const repaidValue = optionalNumber(repaid);
  const accruedValue = optionalNumber(accrued);
  return accruedValue !== null && accruedValue > 0 && repaidValue !== null
    ? repaidValue / accruedValue
    : null;
}

export function impliedAssetPriceInUsd(row) {
  const candidates = [
    ["borrow", "borrowInUsd"],
    ["supply", "supplyInUsd"],
    ["liquidity", "liquidityInUsd"],
    ["debtRepaid", "debtRepaidInUsd"],
    ["interestAccrued", "interestAccruedInUsd"],
    ["interestRepaid", "interestRepaidInUsd"]
  ];
  for (const [nativeField, usdField] of candidates) {
    const nativeAmount = optionalNumber(row?.[nativeField]);
    const usdAmount = optionalNumber(row?.[usdField]);
    if (nativeAmount === null || usdAmount === null || nativeAmount <= 0 || usdAmount < 0) continue;
    const price = usdAmount / nativeAmount;
    if (Number.isFinite(price) && price >= 0) {
      return { assetPriceInUsd: price, assetPriceSource: `${usdField}/${nativeField}` };
    }
  }
  return { assetPriceInUsd: null, assetPriceSource: null };
}

function nativeSeriesAvailable(rows, nativeFields, usdFields) {
  const nativeObserved = rows.some((row) =>
    nativeFields.some((field) => Math.abs(numberOrZero(row[field])) > 0)
  );
  const usdObserved = rows.some((row) =>
    usdFields.some((field) => Math.abs(numberOrZero(row[field])) > 0)
  );
  return nativeObserved || !usdObserved;
}

function valueNativeAmountInUsd(value, priceInUsd) {
  if (value === null || value === undefined || !Number.isFinite(Number(value))) return null;
  const nativeValue = Number(value);
  if (nativeValue === 0) return 0;
  return Number.isFinite(priceInUsd) ? nativeValue * priceInUsd : null;
}

function rollingFiniteSum(values, window) {
  const observed = values.slice(-window).filter((value) => Number.isFinite(value));
  return observed.length ? observed.reduce((total, value) => total + value, 0) : null;
}

function addObservedGap(target, field, value) {
  const numeric = optionalNumber(value);
  if (numeric === null) return;
  target[`${field}InUsd`] += numeric;
  target[`${field}ObservedMarkets`] += 1;
}

function addCoveragePair(target, family, suffix, accruedValue, repaidValue) {
  const accrued = optionalNumber(accruedValue);
  const repaid = optionalNumber(repaidValue);
  if (accrued === null || repaid === null) return;
  target[`${family}Accrued${suffix}InUsd`] += accrued;
  target[`${family}Repaid${suffix}InUsd`] += repaid;
  target[`${family}Coverage${suffix}ObservedMarkets`] += 1;
}

function finalizeProtocolGapRow(row) {
  const finalized = {
    ...row,
    debtAccruedInUsd: row.debtAccruedObservedMarkets > 0 ? row.debtAccruedInUsd : null,
    debtAccruedSource: row.debtAccruedObservedMarkets > 0 ? "market-native-balance-identity" : null,
    dailyDebtFlowGapInUsd: observedGapOrNull(row, "dailyDebtFlowGap"),
    debtFlowGapInUsd: observedGapOrNull(row, "dailyDebtFlowGap"),
    cumulativeDebtFlowGapInUsd: observedGapOrNull(row, "cumulativeDebtFlowGap"),
    unclassifiedBorrowReductionInUsd: observedGapOrNull(
      row,
      "unclassifiedBorrowReduction"
    ),
    cumulativeUnclassifiedBorrowReductionInUsd: observedGapOrNull(
      row,
      "cumulativeUnclassifiedBorrowReduction"
    ),
    dailyInterestGapInUsd: observedGapOrNull(row, "dailyInterestGap"),
    interestGapInUsd: observedGapOrNull(row, "dailyInterestGap"),
    cumulativeInterestGapInUsd: observedGapOrNull(row, "cumulativeInterestGap"),
    debtAccruedCumulativeInUsd: observedCoverageAmountOrNull(row, "debt", "Cumulative", "Accrued"),
    debtRepaidCumulativeInUsd: observedCoverageAmountOrNull(row, "debt", "Cumulative", "Repaid"),
    debtCoverageCumulative: observedCoverageRatioOrNull(row, "debt", "Cumulative"),
    interestAccruedCumulativeInUsd: observedCoverageAmountOrNull(row, "interest", "Cumulative", "Accrued"),
    interestRepaidCumulativeInUsd: observedCoverageAmountOrNull(row, "interest", "Cumulative", "Repaid"),
    interestCoverageCumulative: observedCoverageRatioOrNull(row, "interest", "Cumulative"),
    debtCoverageRatio: coverageRatio(row.debtRepaidInUsd, row.debtAccruedInUsd),
    interestCoverageRatio: coverageRatio(row.interestRepaidInUsd, row.interestAccruedInUsd),
    utilizationPercentage: row.supplyInUsd > 0 ? row.borrowInUsd / row.supplyInUsd : 0,
    borrowApr: 0,
    supplyApy: 0,
    supply: 0,
    borrow: 0,
    liquidity: 0,
    debtRepaid: 0,
    interestAccrued: 0,
    interestRepaid: 0,
    loanOriginationFees: 0,
    loanOriginationFeesMinAda: 0,
    loanOriginationFeesMinAdaInUsd: 0
  };
  for (const window of GAP_WINDOWS) {
    finalized[`debtFlowGap${window}dInUsd`] = observedGapOrNull(row, `debtFlowGap${window}d`);
    finalized[`interestGap${window}dInUsd`] = observedGapOrNull(row, `interestGap${window}d`);
    finalized[`debtAccrued${window}dInUsd`] = observedCoverageAmountOrNull(row, "debt", `${window}d`, "Accrued");
    finalized[`debtRepaid${window}dInUsd`] = observedCoverageAmountOrNull(row, "debt", `${window}d`, "Repaid");
    finalized[`debtCoverage${window}d`] = observedCoverageRatioOrNull(row, "debt", `${window}d`);
    finalized[`interestAccrued${window}dInUsd`] = observedCoverageAmountOrNull(row, "interest", `${window}d`, "Accrued");
    finalized[`interestRepaid${window}dInUsd`] = observedCoverageAmountOrNull(row, "interest", `${window}d`, "Repaid");
    finalized[`interestCoverage${window}d`] = observedCoverageRatioOrNull(row, "interest", `${window}d`);
  }
  for (const key of Object.keys(finalized)) {
    if (key.endsWith("ObservedMarkets")) delete finalized[key];
  }
  return finalized;
}

function observedGapOrNull(row, field) {
  return numberOrZero(row[`${field}ObservedMarkets`]) > 0 ? row[`${field}InUsd`] : null;
}

function observedCoverageAmountOrNull(row, family, suffix, amount) {
  return numberOrZero(row[`${family}Coverage${suffix}ObservedMarkets`]) > 0
    ? row[`${family}${amount}${suffix}InUsd`]
    : null;
}

function observedCoverageRatioOrNull(row, family, suffix) {
  return coverageRatio(
    observedCoverageAmountOrNull(row, family, suffix, "Repaid"),
    observedCoverageAmountOrNull(row, family, suffix, "Accrued")
  );
}

export function computeDrySpells(rows) {
  const spells = [];
  let current = null;

  for (const row of rows) {
    if (row.debtRepaidInUsd > 0) {
      if (current) spells.push(current);
      current = null;
      continue;
    }

    if (!current) {
      current = { startDate: row.date, endDate: row.date, length: 1 };
    } else {
      current.endDate = row.date;
      current.length += 1;
    }
  }

  if (current) spells.push(current);
  return spells;
}


export function sum(rows, field) {
  return rows.reduce((total, row) => total + numberOrZero(row[field]), 0);
}

export function median(values) {
  const sorted = values.filter((value) => Number.isFinite(value)).sort((a, b) => a - b);
  if (!sorted.length) return null;
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1
    ? sorted[middle]
    : (sorted[middle - 1] + sorted[middle]) / 2;
}

export function normalizedHhi(values) {
  const positive = values.filter((value) => Number.isFinite(value) && value > 0);
  if (!positive.length) return null;
  if (positive.length === 1) return 1;
  const total = positive.reduce((acc, value) => acc + value, 0);
  const hhi = positive.reduce((acc, value) => acc + (value / total) ** 2, 0);
  const minimum = 1 / positive.length;
  return Math.max(0, Math.min(1, (hhi - minimum) / (1 - minimum)));
}

function repaymentHalfLifeDays(rows) {
  const total = sum(rows, "debtRepaidInUsd");
  if (!total) return null;
  let running = 0;
  for (let index = 0; index < rows.length; index += 1) {
    running += rows[index].debtRepaidInUsd;
    if (running >= total / 2) return index + 1;
  }
  return rows.length;
}

function clamp01(value) {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

export function classifyReconciliationState(differenceInUsd, toleranceUsd = 1.0) {
  const diff = Number(differenceInUsd);
  if (!Number.isFinite(diff)) return "unavailable";
  const tol = Math.max(0, Number(toleranceUsd) || 1.0);
  if (diff < -tol) return "undercoverage";
  if (diff > tol) return "overcoverage";
  return "reconciled";
}

export function computeLoanAggregateReconciliation({
  market = {},
  loans = [],
  assetPriceInUsd = null,
  toleranceUsd = 1.0,
  valuesInUsd = false
}) {
  const activeLoans = (Array.isArray(loans) ? loans : []).filter((loan) => {
    const amt = Number(valuesInUsd
      ? loan?.adjustedAmountInUsd ?? loan?.adjustedAmount ?? loan?.debtInUsd ?? loan?.amountInUsd ?? loan?.amount ?? 0
      : loan?.amount ?? loan?.adjustedAmount ?? loan?.debtInUsd ?? 0);
    return Number.isFinite(amt) && amt > 0;
  });

  const marketBorrowNative = valuesInUsd
    ? numberOrZero(market.marketBorrowNative)
    : numberOrZero(market.borrow ?? market.marketBorrowNative);
  let price = assetPriceInUsd !== null && Number.isFinite(Number(assetPriceInUsd))
    ? Number(assetPriceInUsd)
    : numberOrZero(market.asset?.price ?? market.marketAssetPriceInUsd);

  let marketBorrowInUsd = valuesInUsd
    ? numberOrZero(market.borrowInUsd ?? market.borrow)
    : market.borrowInUsd !== undefined && market.borrowInUsd !== null
    ? numberOrZero(market.borrowInUsd)
    : marketBorrowNative * price;

  if (price <= 0 && marketBorrowNative > 0 && marketBorrowInUsd > 0) {
    price = marketBorrowInUsd / marketBorrowNative;
  }

  const loanDebtNative = activeLoans.reduce((acc, l) => acc + numberOrZero(
    valuesInUsd ? l.amountNative ?? l.principalAmountNative : l.amount ?? l.principalAmount
  ), 0);
  const loanAdjustedDebtNative = activeLoans.reduce((acc, l) => acc + numberOrZero(
    valuesInUsd ? l.adjustedAmountNative ?? l.adjustedDebtNative : l.adjustedAmount ?? l.adjustedDebt ?? l.amount
  ), 0);
  const minInterestFloorNative = loanAdjustedDebtNative - loanDebtNative;

  let loanDebtInUsd = activeLoans.reduce((acc, l) => {
    if (l.amountInUsd !== undefined && l.amountInUsd !== null) return acc + numberOrZero(l.amountInUsd);
    if (valuesInUsd && l.amount !== undefined && l.amount !== null) return acc + numberOrZero(l.amount);
    if (l.amount !== undefined && l.amount !== null && price > 0) return acc + numberOrZero(l.amount) * price;
    if (l.loanUnadjustedDebtInUsd !== undefined && l.loanUnadjustedDebtInUsd !== null) return acc + numberOrZero(l.loanUnadjustedDebtInUsd);
    return acc;
  }, 0);

  let loanAdjustedDebtInUsd = activeLoans.reduce((acc, l) => {
    if (l.adjustedAmountInUsd !== undefined && l.adjustedAmountInUsd !== null) return acc + numberOrZero(l.adjustedAmountInUsd);
    if (l.debtInUsd !== undefined && l.debtInUsd !== null) return acc + numberOrZero(l.debtInUsd);
    if (valuesInUsd && l.adjustedAmount !== undefined && l.adjustedAmount !== null) return acc + numberOrZero(l.adjustedAmount);
    if (valuesInUsd && l.amount !== undefined && l.amount !== null) return acc + numberOrZero(l.amount);
    if (l.adjustedAmount !== undefined && l.adjustedAmount !== null && price > 0) return acc + numberOrZero(l.adjustedAmount) * price;
    return acc;
  }, 0);

  if (loanDebtInUsd === 0 && loanDebtNative > 0 && price > 0) {
    loanDebtInUsd = loanDebtNative * price;
  }
  if (loanAdjustedDebtInUsd === 0 && loanAdjustedDebtNative > 0 && price > 0) {
    loanAdjustedDebtInUsd = loanAdjustedDebtNative * price;
  }

  if (loanDebtInUsd === 0 && loanDebtNative === 0 && loanAdjustedDebtInUsd > 0) {
    loanDebtInUsd = loanAdjustedDebtInUsd;
  }

  const minInterestFloorInUsd = loanAdjustedDebtInUsd - loanDebtInUsd;
  const adjustedDifferenceInUsd = loanAdjustedDebtInUsd - marketBorrowInUsd;
  const adjustedCoverage = marketBorrowInUsd > 0 ? loanAdjustedDebtInUsd / marketBorrowInUsd : null;
  const adjustedCoveragePercent = adjustedCoverage !== null ? adjustedCoverage * 100 : null;
  const classification = classifyReconciliationState(adjustedDifferenceInUsd, toleranceUsd);
  const normalizedToleranceUsd = Math.max(0, Number(toleranceUsd) || 1.0);

  return {
    marketId: String(market.id ?? market.marketId ?? ""),
    marketDisplayName: String(market.displayName ?? market.marketDisplayName ?? market.id ?? market.marketId ?? ""),
    marketBorrowNative,
    loanDebtNative,
    loanAdjustedDebtNative,
    minInterestFloorNative,
    marketBorrowInUsd,
    loanDebtInUsd,
    loanAdjustedDebtInUsd,
    minInterestFloorInUsd,
    adjustedDifferenceInUsd,
    adjustedCoverage,
    adjustedCoveragePercent,
    toleranceUsd: normalizedToleranceUsd,
    marketAssetPriceInUsd: price,
    classification
  };
}
