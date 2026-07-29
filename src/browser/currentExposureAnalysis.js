import { computeLoanAggregateReconciliation, classifyReconciliationState } from "../shared/metrics.js";

const HEALTH_BANDS = [
  ["debtBelow100InUsd", -Infinity, 1.00],
  ["debt100To110InUsd", 1.00, 1.10],
  ["debt110To125InUsd", 1.10, 1.25],
  ["debt125To150InUsd", 1.25, 1.50],
  ["debt150To200InUsd", 1.50, 2.00],
  ["debtAbove200InUsd", 2.00, Infinity]
];

export const EXPOSURE_HEALTH_TRANCHES = Object.freeze([
  { key: "debtBelow100InUsd", label: "HF < 1.0", lower: -Infinity, upper: 1.00 },
  { key: "debt100To110InUsd", label: "1 - 1.1", lower: 1.00, upper: 1.10 },
  { key: "debt110To125InUsd", label: "1.1 - 1.25", lower: 1.10, upper: 1.25 },
  { key: "debt125To150InUsd", label: "1.25 - 1.5", lower: 1.25, upper: 1.50 },
  { key: "debt150To200InUsd", label: "1.5 - 2.0", lower: 1.50, upper: 2.00 },
  { key: "debtAbove200InUsd", label: "> 2.0", lower: 2.00, upper: Infinity }
]);

export function buildHealthTranches(activeLoans) {
  const loans = Array.isArray(activeLoans) ? activeLoans : [];
  const totalActiveDebt = sumValues(loans.map((loan) => loan.debtInUsd));
  return EXPOSURE_HEALTH_TRANCHES.map((tranche) => {
    const matching = loans.filter((loan) => {
      const hf = loan.healthFactor;
      const isBadDebt = (loan.debtInUsd || 0) > (loan.collateralInUsd || 0);
      if (tranche.lower === -Infinity) return (Number.isFinite(hf) && hf < tranche.upper) || isBadDebt;
      if (!Number.isFinite(hf)) return false;
      if (tranche.upper === Infinity) return hf > tranche.lower && !isBadDebt;
      if (tranche.lower === 1.00) return hf >= 1.00 && hf <= 1.10 && !isBadDebt;
      return hf > tranche.lower && hf <= tranche.upper && !isBadDebt;
    });
    const debtInUsd = matching.reduce((sum, loan) => sum + loan.debtInUsd, 0);
    return {
      tranche: tranche.label,
      label: tranche.label,
      thresholdLabel: tranche.label,
      debtInUsd,
      loanCount: matching.length,
      shareOfTotalDebt: totalActiveDebt > 0 ? debtInUsd / totalActiveDebt : 0
    };
  });
}

const SHOCKS = [0.10, 0.20, 0.30, 0.40];
const OBSERVED_KEY_HF_THRESHOLDS = [1.00, 1.05, 1.10, 1.15, 1.20, 1.25, 1.30, 1.40, 1.50];
const DEFAULT_OBSERVED_KEY_HF_THRESHOLD = 1.25;
const DEFAULT_LOAN_ROW_NOTICE_MARGIN = 0.005;

export function classifyLoanRowCoverage(loanRowDebtInUsd, marketBorrowInUsd) {
  const loanRowDebt = Number(loanRowDebtInUsd);
  const marketBorrow = Number(marketBorrowInUsd);
  if (!Number.isFinite(loanRowDebt) || !Number.isFinite(marketBorrow) || marketBorrow <= 0) {
    return { state: "unavailable", differenceInUsd: null, coverage: null };
  }
  const differenceInUsd = loanRowDebt - marketBorrow;
  return {
    state: differenceInUsd < 0 ? "undercoverage" : differenceInUsd > 0 ? "overcoverage" : "reconciled",
    differenceInUsd,
    coverage: loanRowDebt / marketBorrow
  };
}

export function summarizeLoanRowCoverageNotices(rows, options = {}) {
  const requestedMargin = Number(options.margin ?? DEFAULT_LOAN_ROW_NOTICE_MARGIN);
  const margin = Number.isFinite(requestedMargin) && requestedMargin >= 0
    ? requestedMargin
    : DEFAULT_LOAN_ROW_NOTICE_MARGIN;
  const undercovered = [];
  const overcovered = [];

  for (const row of Array.isArray(rows) ? rows : []) {
    const marketBorrowInUsd = Number(row?.marketBorrowInUsd);
    const loanRowDebtInUsd = Number(row?.loanRowDebtInUsd);
    if (!Number.isFinite(marketBorrowInUsd) || marketBorrowInUsd <= 0 || !Number.isFinite(loanRowDebtInUsd)) continue;
    const differenceInUsd = loanRowDebtInUsd - marketBorrowInUsd;
    const acceptedDifferenceInUsd = marketBorrowInUsd * margin;
    const comparable = {
      marketId: String(row?.marketId || ""),
      marketDisplayName: String(row?.marketDisplayName || row?.marketId || "Unknown market"),
      differenceInUsd
    };
    if (differenceInUsd < -acceptedDifferenceInUsd) undercovered.push(comparable);
    if (differenceInUsd > acceptedDifferenceInUsd) overcovered.push(comparable);
  }

  return {
    margin,
    acceptedCoverage: { min: 1 - margin, max: 1 + margin },
    undercoverage: loanRowCoverageNoticeGroup(undercovered),
    overcoverage: loanRowCoverageNoticeGroup(overcovered)
  };
}

function loanRowCoverageNoticeGroup(rows) {
  return {
    affectedCount: rows.length,
    affectedMarkets: rows.map((row) => row.marketDisplayName),
    affectedMarketIds: rows.map((row) => row.marketId),
    totalDifferenceInUsd: rows.reduce((total, row) => total + Math.abs(row.differenceInUsd), 0)
  };
}

export function buildConcentrationComparisonSeries(rows, options = {}) {
  const marketKey = String(options.marketKey ?? "marketId");
  const labelKey = String(options.labelKey ?? "marketDisplayName");
  const rankKey = String(options.rankKey ?? "observedKeyRank");
  const shareKey = String(options.shareKey ?? "cumulativeShare");
  const markets = new Map();

  for (const row of Array.isArray(rows) ? rows : []) {
    const rawMarket = row?.[marketKey];
    if (rawMarket == null || !String(rawMarket).trim()) continue;
    const key = String(rawMarket);
    const rawLabel = row?.[labelKey];
    const current = markets.get(key) || {
      key,
      label: rawLabel == null || !String(rawLabel).trim() ? key : String(rawLabel),
      firstRank: null,
      firstShare: null
    };
    const rank = nullableNumber(row?.[rankKey]);
    const share = nullableNumber(row?.[shareKey]);
    if (rank != null && rank > 0 && share != null && (current.firstRank == null || rank < current.firstRank)) {
      current.firstRank = rank;
      current.firstShare = share;
    }
    markets.set(key, current);
  }

  const ordered = [...markets.values()].sort((a, b) => {
    if (a.firstShare == null && b.firstShare == null) return a.label.localeCompare(b.label);
    if (a.firstShare == null) return 1;
    if (b.firstShare == null) return -1;
    return b.firstShare - a.firstShare || a.label.localeCompare(b.label);
  });
  const denominator = Math.max(1, ordered.length - 1);
  return ordered.map((market, index) => ({
    key: market.key,
    label: market.label,
    color: `hsl(${Math.round(155 + index / denominator * 120)} 78% 64%)`,
    legendDetail: market.firstShare == null
      ? "1st key n/a"
      : `1st key ${(market.firstShare * 100).toFixed(1)}%`
  }));
}

export function buildCurrentExposureAnalysis(input) {
  const bundle = input.bundle || {};
  const marketNames = new Map((bundle.markets || []).map((market) => [market.id, market.displayName || market.symbol || market.id]));
  const activeLoans = normalizeLoans(input.activeLoans || [], marketNames).filter((loan) => loan.debtInUsd > 0);
  const collateralLoans = normalizeLoans(input.collateralLoans || [], marketNames);

  const badDebtLoans = activeLoans.filter((loan) => (loan.debtInUsd || 0) > (loan.collateralInUsd || 0));
  const badDebtInUsd = badDebtLoans.reduce((sum, loan) => sum + loan.debtInUsd, 0);
  const badDebtCollateralInUsd = badDebtLoans.reduce((sum, loan) => sum + loan.collateralInUsd, 0);
  const badDebtShortfallInUsd = Math.max(0, badDebtInUsd - badDebtCollateralInUsd);
  const badDebtLoanCount = badDebtLoans.length;

  const rawDebtBelowHf100InUsd = activeLoans
    .filter((loan) => (Number.isFinite(loan.healthFactor) && loan.healthFactor < 1.0) || ((loan.debtInUsd || 0) > (loan.collateralInUsd || 0)))
    .reduce((sum, loan) => sum + loan.debtInUsd, 0);
  const debtBelowHf100InUsd = Math.max(rawDebtBelowHf100InUsd, badDebtInUsd);

  return {
    summary: {
      debtBelowHf100InUsd,
      badDebtInUsd,
      badDebtCollateralInUsd,
      badDebtShortfallInUsd,
      badDebtLoanCount
    },
    alerts: buildAlertAnalysis(bundle),
    collateralRisk: buildCollateralRisk(activeLoans),
    borrowerConcentration: buildBorrowerConcentration(bundle, activeLoans),
    supplySide: buildSupplySide(bundle, collateralLoans),
    healthTranches: buildHealthTranches(activeLoans)
  };
}

function buildAlertAnalysis(bundle) {
  const marketPressure = (bundle.markets || []).map((market) => {
    const rows = sortedRows(bundle.marketSeries?.[market.id] || bundle.marketSeriesById?.[market.id] || []);
    const latest = rows.at(-1) || {};
    const currentUtilization = finite(latest.utilizationPercentage, market.utilization, ratio(latest.borrowInUsd, latest.supplyInUsd));
    const sevenDayReference = observationAtOrBefore(rows, daysBefore(latest.date, 7));
    const thirtyDayReference = observationAtOrBefore(rows, daysBefore(latest.date, 30));
    const utilizationChange7d = sevenDayReference ? currentUtilization - finite(sevenDayReference.utilizationPercentage, 0) : null;
    const utilizationChange30d = thirtyDayReference ? currentUtilization - finite(thirtyDayReference.utilizationPercentage, 0) : null;
    const utilizationPressure = clamp((currentUtilization - 0.50) / 0.50, 0, 1);
    const risingPressure = utilizationChange7d === null ? 0 : clamp(utilizationChange7d / 0.10, 0, 1);
    return {
      marketId: market.id,
      marketDisplayName: market.displayName || market.symbol || market.id,
      currentUtilization,
      utilizationChange7d,
      utilizationChange30d,
      currentBorrowInUsd: finite(latest.borrowInUsd, market.borrow),
      currentLiquidityInUsd: finite(latest.liquidityInUsd, market.liquidity),
      pressureScore: clamp(utilizationPressure * 0.70 + risingPressure * 0.30, 0, 1),
      consecutiveDaysAbove80: trailingCount(rows, (row) => finite(row.utilizationPercentage, 0) >= 0.80)
    };
  }).filter((row) => row.currentBorrowInUsd > 0 || row.currentLiquidityInUsd > 0)
    .sort((a, b) => b.pressureScore - a.pressureScore || b.currentBorrowInUsd - a.currentBorrowInUsd);

  const protocolRows = sortedRows(bundle.protocolSeries || []);
  const coverageWindows = [7, 30, 90].map((windowDays) => {
    const rows = trailingCalendarRows(protocolRows, windowDays);
    const current = rows.at(-1) || {};
    const interestAccruedInUsd = nullableNumber(current[`interestAccrued${windowDays}dInUsd`])
      ?? total(rows, "interestAccruedInUsd");
    const interestRepaidInUsd = nullableNumber(current[`interestRepaid${windowDays}dInUsd`])
      ?? total(rows, "interestRepaidInUsd");
    const debtAccruedInUsd = nullableNumber(current[`debtAccrued${windowDays}dInUsd`])
      ?? total(rows, "debtAccruedInUsd");
    const debtRepaidInUsd = nullableNumber(current[`debtRepaid${windowDays}dInUsd`])
      ?? total(rows, "debtRepaidInUsd");
    return {
      windowDays,
      label: `Trailing ${windowDays} days`,
      interestAccruedInUsd,
      interestRepaidInUsd,
      coverageRatio: nullableNumber(current[`interestCoverage${windowDays}d`])
        ?? (interestAccruedInUsd > 0 ? interestRepaidInUsd / interestAccruedInUsd : null),
      debtAccruedInUsd,
      debtRepaidInUsd,
      debtCoverageRatio: nullableNumber(current[`debtCoverage${windowDays}d`])
        ?? (debtAccruedInUsd > 0 ? debtRepaidInUsd / debtAccruedInUsd : null),
      observedDays: rows.length,
      valuationMode: current.gapAggregation === "market-usd-sum"
        ? "market-usd-sum"
        : "historical-usd-fallback"
    };
  });
  const recentRows = trailingCalendarRows(protocolRows, 30);
  const recentStart = recentRows[0]?.date;
  const priorRows = recentStart
    ? protocolRows.filter((row) => row.date >= daysBefore(recentStart, 30) && row.date < recentStart)
    : [];
  const flowComparison = [
    ["Interest accrued", "interestAccruedInUsd"],
    ["Interest repaid", "interestRepaidInUsd"],
    ["Debt accrued", "debtAccruedInUsd"],
    ["Debt repaid", "debtRepaidInUsd"]
  ].map(([label, key]) => ({
    metric: key,
    label,
    recent30InUsd: total(recentRows, key),
    prior30InUsd: total(priorRows, key),
    recentObservedDays: recentRows.length,
    priorObservedDays: priorRows.length
  }));

  return {
    marketPressure,
    coverageWindows,
    flowComparison,
    methodology: "Pressure combines 70% current utilization above 50% with 30% positive 7-day utilization change, capped at 100%. It is a triage score, not a liquidation probability."
  };
}

function buildCollateralRisk(activeLoans) {
  const rowsByCollateral = new Map();
  const rowsByBorrowed = new Map();
  const shockRows = new Map();
  for (const loan of activeLoans) {
    const collateralTotal = loan.collaterals.reduce((sum, item) => sum + item.amountInUsd, 0);
    const isBadDebt = (loan.debtInUsd || 0) > (loan.collateralInUsd || 0);
    const badDebtExcessInUsd = isBadDebt ? (loan.debtInUsd || 0) - (loan.collateralInUsd || 0) : 0;
    if (isBadDebt) {
      const borrowedMarketId = String(loan.marketId || "");
      const borrowedDisplayName = String(loan.marketDisplayName || loan.marketId || "Unknown market");
      if (!rowsByBorrowed.has(borrowedMarketId)) {
        rowsByBorrowed.set(borrowedMarketId, {
          borrowedMarketId,
          borrowedDisplayName,
          badDebtInUsd: 0,
          badDebtShortfallInUsd: 0,
          badDebtCollateralInUsd: 0,
          badDebtLoanCount: 0,
          totalDebtInUsd: 0
        });
      }
      const borrowedRow = rowsByBorrowed.get(borrowedMarketId);
      borrowedRow.badDebtInUsd += loan.debtInUsd;
      borrowedRow.badDebtShortfallInUsd += badDebtExcessInUsd;
      borrowedRow.badDebtCollateralInUsd += loan.collateralInUsd || 0;
      borrowedRow.badDebtLoanCount += 1;
      borrowedRow.totalDebtInUsd += loan.debtInUsd;
    }
    if (!(collateralTotal > 0)) {
      if (badDebtExcessInUsd > 0) {
        const fallbackItem = { marketId: loan.marketId, marketDisplayName: loan.marketId };
        const row = getCollateralRow(rowsByCollateral, fallbackItem);
        row.badDebtInUsd += loan.debtInUsd;
        row.badDebtShortfallInUsd += badDebtExcessInUsd;
      }
      continue;
    }
    for (const item of loan.collaterals) {
      if (!(item.amountInUsd > 0)) continue;
      const share = item.amountInUsd / collateralTotal;
      const row = getCollateralRow(rowsByCollateral, item);
      const attributedDebt = loan.debtInUsd * share;
      row.attributedDebtInUsd += attributedDebt;
      row.activeLoanCount += 1;
      row.collateralInUsd += item.amountInUsd;
      if (isBadDebt) {
        row.badDebtInUsd += loan.debtInUsd * share;
        row.badDebtShortfallInUsd += badDebtExcessInUsd * share;
      }
      const band = healthBandKey(loan.healthFactor);
      if (band) row[band] += attributedDebt;

      for (const shock of SHOCKS) {
        const key = `${item.marketId}|${shock}`;
        if (!shockRows.has(key)) {
          shockRows.set(key, {
            collateralMarketId: item.marketId,
            collateralDisplayName: item.marketDisplayName,
            shockPercent: shock * 100,
            exposedDebtInUsd: 0,
            exposedLoanCount: 0
          });
        }
        const shockedHealthFactor = Number.isFinite(loan.healthFactor)
          ? loan.healthFactor * (1 - share * shock)
          : Infinity;
        if (shockedHealthFactor <= 1) {
          shockRows.get(key).exposedDebtInUsd += loan.debtInUsd;
          shockRows.get(key).exposedLoanCount += 1;
        }
      }
    }
  }
  const byCollateral = [...rowsByCollateral.values()].map((row) => {
    const debtAtOrBelow110InUsd = row.debtBelow100InUsd + row.debt100To110InUsd;
    const debtAtOrBelow125InUsd = debtAtOrBelow110InUsd + row.debt110To125InUsd;
    return {
      ...row,
      debtAtOrBelow110InUsd,
      debtAtOrBelow125InUsd
    };
  }).sort((a, b) => b.debtAtOrBelow125InUsd - a.debtAtOrBelow125InUsd || b.attributedDebtInUsd - a.attributedDebtInUsd);
  const byBorrowed = [...rowsByBorrowed.values()].sort((a, b) => b.badDebtInUsd - a.badDebtInUsd || b.totalDebtInUsd - a.totalDebtInUsd || a.borrowedDisplayName.localeCompare(b.borrowedDisplayName));
  const order = new Map(byCollateral.map((row, index) => [row.collateralMarketId, index]));
  const shockScenarios = [...shockRows.values()].sort((a, b) =>
    (order.get(a.collateralMarketId) ?? Infinity) - (order.get(b.collateralMarketId) ?? Infinity) || a.shockPercent - b.shockPercent
  );
  return {
    byCollateral,
    byBorrowed,
    shockScenarios,
    methodology: "Each loan's debt is attributed across collateral assets in proportion to their current USD values. A single-asset shock applies independently as HF × (1 - collateral share × shock); scenario totals must not be added together."
  };
}

function buildBorrowerConcentration(bundle, activeLoans) {
  const marketNames = new Map((bundle.markets || []).map((market) => [market.id, market.displayName || market.symbol || market.id]));
  const currentBorrow = new Map((bundle.markets || []).map((market) => [market.id, finite(market.borrow, 0)]));
  const marketKeyDebt = new Map();
  const marketLoanRowDebt = new Map();
  const marketLoanRowAmount = new Map();
  const missingByMarket = new Map();
  const allKeyState = new Map();
  for (const loan of activeLoans) {
    marketLoanRowDebt.set(loan.marketId, (marketLoanRowDebt.get(loan.marketId) || 0) + loan.debtInUsd);
    marketLoanRowAmount.set(loan.marketId, (marketLoanRowAmount.get(loan.marketId) || 0) + loan.amountInUsd);
    if (!loan.observedKey) {
      missingByMarket.set(loan.marketId, (missingByMarket.get(loan.marketId) || 0) + loan.debtInUsd);
      continue;
    }
    addNestedDebt(marketKeyDebt, loan.marketId, loan.observedKey, loan.debtInUsd);
    if (!allKeyState.has(loan.observedKey)) allKeyState.set(loan.observedKey, { marketIds: new Set(), loans: [] });
    allKeyState.get(loan.observedKey).marketIds.add(loan.marketId);
    allKeyState.get(loan.observedKey).loans.push(loan);
  }

  const protocolBorrowInUsd = finite(
    bundle.currentTotals?.borrowInUsd,
    sumValues((bundle.markets || []).map((market) => finite(market.borrow, 0))),
    sumValues(activeLoans.map((loan) => loan.debtInUsd))
  );
  const rankedKeys = [...allKeyState.entries()].map(([observedKey, state]) => ({
    observedKey,
    state,
    totalDebtInUsd: state.loans.reduce((sum, loan) => sum + loan.debtInUsd, 0)
  })).sort((a, b) => b.totalDebtInUsd - a.totalDebtInUsd || a.observedKey.localeCompare(b.observedKey));

  const observedKeyRows = rankedKeys.map((entry, index) => ({
    observedKeyLabel: `Observed key ${index + 1}`,
    totalDebtInUsd: entry.totalDebtInUsd,
    protocolBorrowShare: protocolBorrowInUsd > 0 ? entry.totalDebtInUsd / protocolBorrowInUsd : null,
    loanCount: entry.state.loans.length,
    marketCount: entry.state.marketIds.size,
    thresholdRows: OBSERVED_KEY_HF_THRESHOLDS.map((threshold) => {
      const lowHfDebtInUsd = entry.state.loans
        .filter((loan) => Number.isFinite(loan.healthFactor) && loan.healthFactor <= threshold)
        .reduce((sum, loan) => sum + loan.debtInUsd, 0);
      return {
        threshold,
        lowHfDebtInUsd,
        lowHfShareOfKeyDebt: entry.totalDebtInUsd > 0 ? lowHfDebtInUsd / entry.totalDebtInUsd : null
      };
    })
  }));

  const concentrationSensitivity = OBSERVED_KEY_HF_THRESHOLDS.map((threshold) => {
    const qualifyingByKey = rankedKeys.map((entry) => entry.state.loans
      .filter((loan) => Number.isFinite(loan.healthFactor) && loan.healthFactor <= threshold)
      .reduce((sum, loan) => sum + loan.debtInUsd, 0)
    ).filter((debt) => debt > 0).sort((a, b) => b - a);
    const totalLowHfDebtInUsd = sumValues(qualifyingByKey);
    return {
      threshold,
      thresholdLabel: `HF <= ${threshold.toFixed(2)}`,
      totalLowHfDebtInUsd,
      qualifyingObservedKeyCount: qualifyingByKey.length,
      top1DebtInUsd: qualifyingByKey[0] || 0,
      top3DebtInUsd: sumValues(qualifyingByKey.slice(0, 3)),
      top1DebtShare: totalLowHfDebtInUsd > 0 ? (qualifyingByKey[0] || 0) / totalLowHfDebtInUsd : null,
      top3DebtShare: totalLowHfDebtInUsd > 0 ? sumValues(qualifyingByKey.slice(0, 3)) / totalLowHfDebtInUsd : null
    };
  });

  const marketIds = new Set([...(bundle.markets || []).map((market) => market.id), ...marketLoanRowDebt.keys()]);
  const marketDependence = [...marketIds].map((marketId) => {
    const keyEntries = [...(marketKeyDebt.get(marketId)?.entries() || [])].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
    const observedKeyDebtInUsd = keyEntries.reduce((sum, [, debt]) => sum + debt, 0);
    const loanRowDebtInUsd = marketLoanRowDebt.get(marketId) || 0;
    const marketBorrow = currentBorrow.get(marketId) || 0;
    const loanRowReconciliation = classifyLoanRowCoverage(loanRowDebtInUsd, marketBorrow);
    const largestKeyDebtInUsd = keyEntries[0]?.[1] || 0;
    const nextTwoKeysDebtInUsd = (keyEntries[1]?.[1] || 0) + (keyEntries[2]?.[1] || 0);
    const otherMappedKeysDebtInUsd = keyEntries.slice(3).reduce((sum, [, debt]) => sum + debt, 0);
    const unmappedBorrowInUsd = Math.max(0, marketBorrow - observedKeyDebtInUsd);
    const observedDebts = keyEntries.map(([, debt]) => debt);
    const hhi = observedKeyDebtInUsd > 0
      ? observedDebts.reduce((sum, debt) => sum + (debt / observedKeyDebtInUsd) ** 2, 0)
      : null;
    const marketObj = (bundle.markets || []).find((m) => m.id === marketId) || { id: marketId, borrowInUsd: marketBorrow };
    const marketLoans = activeLoans.filter((loan) => loan.marketId === marketId);
    const recon = computeLoanAggregateReconciliation({ market: marketObj, loans: marketLoans, valuesInUsd: true });

    return {
      marketId,
      marketDisplayName: marketNames.get(marketId) || marketId,
      marketBorrowInUsd: marketBorrow,
      loanRowAmountInUsd: marketLoanRowAmount.get(marketId) || 0,
      loanRowDebtInUsd,
      loanAdjustedDebtInUsd: recon.loanAdjustedDebtInUsd,
      loanUnadjustedDebtInUsd: recon.loanDebtInUsd,
      minInterestFloorInUsd: recon.minInterestFloorInUsd,
      minInterestFloorNative: recon.minInterestFloorNative,
      loanAdjustedDebtNative: recon.loanAdjustedDebtNative,
      loanDebtNative: recon.loanDebtNative,
      marketBorrowNative: recon.marketBorrowNative,
      reconciliationDifferenceInUsd: recon.adjustedDifferenceInUsd,
      reconciliationCoveragePercent: recon.adjustedCoveragePercent,
      reconciliationClassification: recon.classification,
      observedKeyDebtInUsd,
      missingKeyDebtInUsd: missingByMarket.get(marketId) || 0,
      observedKeyCount: keyEntries.length,
      loanRowCoverage: loanRowReconciliation.coverage,
      loanRowCoverageState: loanRowReconciliation.state,
      loanRowDifferenceInUsd: loanRowReconciliation.differenceInUsd,
      observedKeyCoverage: marketBorrow > 0 ? observedKeyDebtInUsd / marketBorrow : null,
      largestKeyDebtInUsd,
      nextTwoKeysDebtInUsd,
      otherMappedKeysDebtInUsd,
      unmappedBorrowInUsd,
      largestKeyDebtShareOfMarketBorrow: marketBorrow > 0 ? largestKeyDebtInUsd / marketBorrow : null,
      nextTwoKeysDebtShareOfMarketBorrow: marketBorrow > 0 ? nextTwoKeysDebtInUsd / marketBorrow : null,
      otherMappedKeysDebtShareOfMarketBorrow: marketBorrow > 0 ? otherMappedKeysDebtInUsd / marketBorrow : null,
      unmappedBorrowShare: marketBorrow > 0 ? unmappedBorrowInUsd / marketBorrow : null,
      hhi,
      effectiveObservedKeyCount: hhi > 0 ? 1 / hhi : null,
      medianObservedKeyDebtInUsd: quantile(observedDebts, 0.50),
      p90ObservedKeyDebtInUsd: quantile(observedDebts, 0.90)
    };
  }).filter((row) => row.marketBorrowInUsd > 0 || row.loanRowDebtInUsd > 0)
    .sort((a, b) => b.largestKeyDebtShareOfMarketBorrow - a.largestKeyDebtShareOfMarketBorrow || b.marketBorrowInUsd - a.marketBorrowInUsd);

  const marketCumulativeConcentration = marketDependence.flatMap((market) => {
    const keyEntries = [...(marketKeyDebt.get(market.marketId)?.entries() || [])]
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
    if (!keyEntries.length) return [];
    let cumulativeDebt = 0;
    const shared = {
      marketId: market.marketId,
      marketDisplayName: market.marketDisplayName,
      marketBorrowInUsd: market.marketBorrowInUsd,
      loanRowCoverage: market.loanRowCoverage,
      loanRowCoverageState: market.loanRowCoverageState,
      loanRowDifferenceInUsd: market.loanRowDifferenceInUsd,
      observedKeyCoverage: market.observedKeyCoverage,
      observedKeyCount: keyEntries.length
    };
    return [
      {
        ...shared,
        observedKeyRank: 0,
        observedKeyLabel: "Start",
        keyDebtInUsd: 0,
        cumulativeObservedKeyDebtInUsd: 0,
        cumulativeShareOfMarketBorrow: 0
      },
      ...keyEntries.map(([, debt], index) => {
        cumulativeDebt += debt;
        return {
          ...shared,
          observedKeyRank: index + 1,
          observedKeyLabel: `Observed key ${index + 1}`,
          keyDebtInUsd: debt,
          cumulativeObservedKeyDebtInUsd: cumulativeDebt,
          cumulativeShareOfMarketBorrow: market.marketBorrowInUsd > 0 ? cumulativeDebt / market.marketBorrowInUsd : null
        };
      })
    ];
  });

  return {
    observedKeyExposure: {
      protocolBorrowInUsd,
      activeLoanRowDebtInUsd: sumValues(activeLoans.map((loan) => loan.debtInUsd)),
      protocolLoanRowCoverage: protocolBorrowInUsd > 0 ? sumValues(activeLoans.map((loan) => loan.debtInUsd)) / protocolBorrowInUsd : null,
      defaultThreshold: DEFAULT_OBSERVED_KEY_HF_THRESHOLD,
      thresholds: [...OBSERVED_KEY_HF_THRESHOLDS],
      rows: observedKeyRows
    },
    marketDependence,
    marketCumulativeConcentration,
    concentrationSensitivity,
    scope: "Observed keys are exact publicKey groupings from current loan rows. They are not identified people, entities, wallets, or inferred actors. Protocol and market shares use official current borrow as their denominator; unmapped borrow remains explicit."
  };
}

function buildSupplySide(bundle, collateralLoans) {
  const marketNames = new Map((bundle.markets || []).map((market) => [market.id, market.displayName || market.symbol || market.id]));
  const represented = new Map();
  for (const loan of collateralLoans) {
    for (const item of loan.collaterals) {
      if (!(item.amountInUsd > 0)) continue;
      if (!represented.has(item.marketId)) represented.set(item.marketId, { active: 0, zero: 0, keyAmounts: new Map(), missingKey: 0 });
      const state = represented.get(item.marketId);
      if (loan.debtInUsd > 0) state.active += item.amountInUsd;
      else state.zero += item.amountInUsd;
      if (loan.observedKey) state.keyAmounts.set(loan.observedKey, (state.keyAmounts.get(loan.observedKey) || 0) + item.amountInUsd);
      else state.missingKey += item.amountInUsd;
    }
  }
  const byMarket = (bundle.markets || []).map((market) => {
    const state = represented.get(market.id) || { active: 0, zero: 0, keyAmounts: new Map(), missingKey: 0 };
    const debts = sortedDebts(state.keyAmounts);
    const representedWithObservedKeyInUsd = sumValues(debts);
    const representedCollateralInUsd = state.active + state.zero;
    const hhi = representedWithObservedKeyInUsd > 0
      ? debts.reduce((sum, amount) => sum + (amount / representedWithObservedKeyInUsd) ** 2, 0)
      : null;
    const supplyInUsd = finite(market.supply, 0);
    return {
      marketId: market.id,
      marketDisplayName: marketNames.get(market.id) || market.id,
      supplyInUsd,
      borrowInUsd: finite(market.borrow, 0),
      liquidityInUsd: finite(market.liquidity, 0),
      activeDebtCollateralInUsd: state.active,
      zeroDebtCollateralInUsd: state.zero,
      representedCollateralInUsd,
      supplyNotRepresentedAsLoanCollateralInUsd: Math.max(0, supplyInUsd - representedCollateralInUsd),
      representedCollateralShare: supplyInUsd > 0 ? representedCollateralInUsd / supplyInUsd : null,
      representedWithObservedKeyInUsd,
      representedMissingKeyInUsd: state.missingKey,
      representedObservedKeyCoverage: representedCollateralInUsd > 0 ? representedWithObservedKeyInUsd / representedCollateralInUsd : null,
      representedObservedKeyCount: debts.length,
      top1RepresentedShare: shareOfFirst(debts, 1),
      top3RepresentedShare: shareOfFirst(debts, 3),
      top10RepresentedShare: shareOfFirst(debts, 10),
      representedHhi: hhi,
      effectiveRepresentedObservedKeyCount: hhi > 0 ? 1 / hhi : null
    };
  }).filter((row) => row.supplyInUsd > 0 || row.representedCollateralInUsd > 0)
    .sort((a, b) => b.representedCollateralInUsd - a.representedCollateralInUsd);
  const marketCumulativeConcentration = byMarket.flatMap((market) => {
    const state = represented.get(market.marketId);
    const amounts = sortedDebts(state?.keyAmounts);
    if (!amounts.length || !(market.representedCollateralInUsd > 0)) return [];
    let cumulativeCollateral = 0;
    const shared = {
      marketId: market.marketId,
      marketDisplayName: market.marketDisplayName,
      representedCollateralInUsd: market.representedCollateralInUsd,
      representedWithObservedKeyInUsd: market.representedWithObservedKeyInUsd,
      representedObservedKeyCoverage: market.representedObservedKeyCoverage,
      representedObservedKeyCount: market.representedObservedKeyCount
    };
    return [
      {
        ...shared,
        observedKeyRank: 0,
        observedKeyLabel: "Start",
        keyCollateralInUsd: 0,
        cumulativeObservedKeyCollateralInUsd: 0,
        cumulativeShareOfRepresentedCollateralizedSupply: 0
      },
      ...amounts.map((amount, index) => {
        cumulativeCollateral += amount;
        return {
          ...shared,
          observedKeyRank: index + 1,
          observedKeyLabel: `Observed key ${index + 1}`,
          keyCollateralInUsd: amount,
          cumulativeObservedKeyCollateralInUsd: cumulativeCollateral,
          cumulativeShareOfRepresentedCollateralizedSupply: cumulativeCollateral / market.representedCollateralInUsd
        };
      })
    ];
  });
  return {
    byMarket,
    marketCumulativeConcentration,
    scope: "This is concentration only inside supply represented as loan collateral, not total supplier concentration. Supply not represented as loan collateral is not leftover liquidity; official market liquidity is shown separately."
  };
}

function normalizeLoans(rows, marketNames) {
  return rows.map((row) => {
    const collaterals = normalizeCollaterals(row.collaterals || [], marketNames);
    const collateralsSum = collaterals.reduce((sum, item) => sum + item.amountInUsd, 0);
    const collateralInUsd = collateralsSum > 0 ? collateralsSum : finite(row.collateralInUsd, row.collateral);
    const marketId = String(row.marketId || row.market?.id || "Unknown");
    const marketDisplayName = String(
      row.marketDisplayName || row.market?.displayName || row.market?.symbol || marketNames?.get(marketId) || marketId
    );
    const rawAmount = finite(row.amount, row.amountInUsd);
    const adjustedAmount = finite(row.adjustedAmount, row.adjustedDebt, row.adjustedAmountInUsd, row.debtInUsd, rawAmount);
    return {
      marketId,
      marketDisplayName,
      observedKey: row.publicKey ? String(row.publicKey) : "",
      amount: rawAmount,
      adjustedAmount: adjustedAmount,
      amountInUsd: rawAmount,
      adjustedAmountInUsd: adjustedAmount,
      debtInUsd: adjustedAmount,
      healthFactor: nullableNumber(row.healthFactor),
      collaterals,
      collateralInUsd
    };
  });
}

function normalizeCollaterals(rows, marketNames) {
  const byMarket = new Map();
  for (const row of rows) {
    const marketId = String(row.market?.id || row.marketId || row.id || row.qTokenName || "Unknown");
    const marketDisplayName = String(
      row.marketDisplayName || row.market?.displayName || row.market?.symbol || row.qTokenName || marketNames?.get(marketId) || marketId
    );
    if (!byMarket.has(marketId)) {
      byMarket.set(marketId, {
        marketId,
        marketDisplayName,
        amountInUsd: 0
      });
    }
    byMarket.get(marketId).amountInUsd += finite(row.amount, row.amountUSD, row.amountInUsd);
  }
  return [...byMarket.values()];
}

function getCollateralRow(map, item) {
  if (!map.has(item.marketId)) {
    map.set(item.marketId, {
      collateralMarketId: item.marketId,
      collateralDisplayName: item.marketDisplayName,
      attributedDebtInUsd: 0,
      collateralInUsd: 0,
      activeLoanCount: 0,
      badDebtInUsd: 0,
      badDebtShortfallInUsd: 0,
      debtBelow100InUsd: 0,
      debt100To110InUsd: 0,
      debtAtOrBelow110InUsd: 0,
      debt110To125InUsd: 0,
      debt125To150InUsd: 0,
      debt150To200InUsd: 0,
      debtAbove200InUsd: 0
    });
  }
  return map.get(item.marketId);
}

function healthBandKey(hfOrLoan, debtInUsd = 0, collateralInUsd = 0) {
  const hf = typeof hfOrLoan === "object" && hfOrLoan !== null ? hfOrLoan.healthFactor : hfOrLoan;
  const debt = typeof hfOrLoan === "object" && hfOrLoan !== null ? hfOrLoan.debtInUsd : debtInUsd;
  const collateral = typeof hfOrLoan === "object" && hfOrLoan !== null ? hfOrLoan.collateralInUsd : collateralInUsd;

  if ((debt || 0) > (collateral || 0)) {
    return "debtBelow100InUsd";
  }
  if (!Number.isFinite(hf)) return null;
  if (hf < 1.00) return "debtBelow100InUsd";
  if (hf >= 1.00 && hf <= 1.10) return "debt100To110InUsd";
  if (hf > 1.10 && hf <= 1.25) return "debt110To125InUsd";
  if (hf > 1.25 && hf <= 1.50) return "debt125To150InUsd";
  if (hf > 1.50 && hf <= 2.00) return "debt150To200InUsd";
  if (hf > 2.00) return "debtAbove200InUsd";
  return null;
}

function addNestedDebt(map, outerKey, innerKey, amount) {
  if (!map.has(outerKey)) map.set(outerKey, new Map());
  const nested = map.get(outerKey);
  nested.set(innerKey, (nested.get(innerKey) || 0) + amount);
}

function sortedDebts(map) {
  return [...(map?.entries() || [])]
    .filter(([, value]) => value > 0)
    .sort((a, b) => b[1] - a[1] || String(a[0]).localeCompare(String(b[0])))
    .map(([, value]) => value);
}

function shareOfFirst(values, count) {
  const totalValue = sumValues(values);
  return totalValue > 0 ? sumValues(values.slice(0, count)) / totalValue : 0;
}

function quantile(valuesDescending, q) {
  if (!valuesDescending.length) return null;
  const values = [...valuesDescending].sort((a, b) => a - b);
  const position = (values.length - 1) * q;
  const lower = Math.floor(position);
  const upper = Math.ceil(position);
  if (lower === upper) return values[lower];
  return values[lower] + (values[upper] - values[lower]) * (position - lower);
}

function sortedRows(rows) {
  return [...rows].filter((row) => row?.date).sort((a, b) => String(a.date).localeCompare(String(b.date)));
}

function observationAtOrBefore(rows, date) {
  if (!date) return null;
  return [...rows].reverse().find((row) => row.date <= date) || null;
}

function trailingCalendarRows(rows, days) {
  const latest = rows.at(-1)?.date;
  if (!latest) return [];
  const start = daysBefore(latest, days - 1);
  return rows.filter((row) => row.date >= start && row.date <= latest);
}

function trailingCount(rows, predicate) {
  let count = 0;
  for (let index = rows.length - 1; index >= 0 && predicate(rows[index]); index -= 1) count += 1;
  return count;
}

function daysBefore(value, days) {
  if (!value) return null;
  const date = new Date(`${String(value).slice(0, 10)}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() - days);
  return date.toISOString().slice(0, 10);
}

function total(rows, key) {
  return rows.reduce((sum, row) => sum + finite(row[key], 0), 0);
}

function sumValues(values) {
  return values.reduce((sum, value) => sum + value, 0);
}

function minimumFinite(values) {
  const finiteValues = values.filter(Number.isFinite);
  return finiteValues.length ? Math.min(...finiteValues) : null;
}

function ratio(numerator, denominator) {
  const bottom = finite(denominator, 0);
  return bottom > 0 ? finite(numerator, 0) / bottom : 0;
}

function finite(...values) {
  for (const value of values) {
    if (value === null || value === undefined || value === "") continue;
    const number = Number(value);
    if (Number.isFinite(number)) return number;
  }
  return 0;
}

function nullableNumber(value) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function clamp(value, minimum, maximum) {
  return Math.min(maximum, Math.max(minimum, value));
}
