import { computeLoanAggregateReconciliation, classifyReconciliationState } from "../shared/metrics.js";

const DATA_STATUS_USD_TOLERANCE = 0.01;
const DATA_STATUS_LOAN_ROW_MARGIN = 0.005;

export function buildDataStatus(input = {}) {
  const bundle = input.bundle || {};
  const allLoans = rows(input.allLoans);
  const activeLoans = rows(input.activeLoans).filter((loan) => dataStatusNumber(loan.amount ?? loan.debtInUsd) > 0);
  const liquidationCoverage = input.liquidation?.dailyLiquidationCoverage || {};
  const liquidationReconciliations = rows(input.liquidation?.dailyLiquidationReconciliations);
  const dailyAllocation = rows(input.revenue?.dailyAllocation);
  const monthlyAllocation = rows(input.revenue?.monthlyAllocation);
  const marketDependence = rows(input.currentExposure?.borrowerConcentration?.marketDependence);

  const coverageCards = buildCoverageCards({
    bundle,
    liquidationCoverage,
    dailyAllocation,
    monthlyAllocation,
    loanSnapshotHistory: input.loanSnapshotHistory || {},
    marketDependence
  });
  const loanPopulation = buildLoanPopulation(allLoans, activeLoans);
  const checks = [
    protocolBorrowCheck(bundle),
    liquidationCheck(liquidationCoverage),
    revenueCheck(dailyAllocation),
    loanRowUndercoverageCheck(marketDependence),
    loanRowOvercoverageCheck(marketDependence),
    loanAggregateReconciliationCheck(marketDependence, bundle, activeLoans)
  ];
  const failedChecks = checks.filter((check) => check.status === "fail").length;
  const partialChecks = checks.filter((check) => check.status === "partial").length;
  const passedChecks = checks.filter((check) => check.status === "pass").length;
  const unavailableChecks = checks.filter((check) => check.status === "unavailable").length;

  return {
    headline: {
      state: failedChecks ? "attention" : "healthy",
      label: failedChecks ? "Some data needs attention" : "No integrity failures detected",
      passedChecks,
      partialChecks,
      failedChecks,
      unavailableChecks
    },
    generatedAt: bundle.generatedAt || null,
    source: bundle.source || null,
    latestHistoryDate: bundle.protocolSeries?.at(-1)?.date || null,
    coverageCards,
    loanPopulation,
    checks,
    limitations: [
      {
        id: "loan-history",
        title: "Loan history is observation-based",
        detail: "Position counts, observed-key counts, and health-factor history exist only at saved Fetch + Save timestamps; missing intervals are not filled."
      },
      {
        id: "market-liquidations",
        title: "Historical liquidations cannot be attributed by market",
        detail: "The official API exposes historical liquidation profit only at protocol level. Repayment activity is never relabelled as liquidation activity."
      },
      {
        id: "supply-ownership",
        title: "Supply ownership is only partly observable",
        detail: "The API shows receipt-token claims deposited as loan collateral, not every supplier balance. Unrepresented supply remains explicit."
      }
    ],
    technical: buildTechnicalAudit({
      bundle,
      allLoans,
      activeLoans,
      liquidationCoverage,
      liquidationReconciliations,
      dailyAllocation,
      monthlyAllocation,
      loanSnapshotHistory: input.loanSnapshotHistory || {},
      checks
    })
  };
}

function buildCoverageCards({ bundle, liquidationCoverage, dailyAllocation, monthlyAllocation, loanSnapshotHistory }) {
  const markets = rows(bundle.markets);
  const coveredMarkets = markets.filter((market) => rows(bundle.marketSeries?.[market.id]).length > 0).length;
  const latestHistoryDate = bundle.protocolSeries?.at(-1)?.date || null;
  const completeAllocationMonths = monthlyAllocation.filter((row) => row.isComplete !== false && !row.fetchError);
  const latestAllocationMonth = monthlyAllocation.at(-1);
  const allocationFrom = dailyAllocation[0]?.periodStartDay || dailyAllocation[0]?.date || null;
  const allocationTo = dailyAllocation.at(-1)?.periodEndDay || dailyAllocation.at(-1)?.date || null;
  const observationTimestamps = protocolObservationTimestamps(loanSnapshotHistory);
  const missingDays = dataStatusInteger(liquidationCoverage.missingDays);
  const reconciliationFailures = dataStatusInteger(liquidationCoverage.reconciliationFailures);
  const hasLiquidationCoverage = Boolean(liquidationCoverage.firstDate || liquidationCoverage.lastDate || liquidationCoverage.complete !== undefined);

  return [
    {
      id: "market-history",
      label: "Market history",
      value: `${coveredMarkets} / ${markets.length} markets`,
      detail: latestHistoryDate ? `History through ${latestHistoryDate}` : "No historical endpoint rows available",
      status: markets.length > 0 && coveredMarkets === markets.length ? "pass" : "fail"
    },
    {
      id: "liquidations",
      label: "Liquidations",
      value: !hasLiquidationCoverage
        ? "Unavailable"
        : missingDays || reconciliationFailures
          ? `${missingDays} missing ${missingDays === 1 ? "day" : "days"}`
          : "Complete daily coverage",
      detail: hasLiquidationCoverage
        ? missingDays || reconciliationFailures
          ? `${reconciliationFailures} reconciliation ${reconciliationFailures === 1 ? "failure" : "failures"}; ${dateSpan(liquidationCoverage.firstDate, liquidationCoverage.lastDate)}`
          : `No missing days; no reconciliation failures; ${dateSpan(liquidationCoverage.firstDate, liquidationCoverage.lastDate)}`
        : "No daily liquidation coverage is available",
      status: !hasLiquidationCoverage ? "unavailable" : missingDays || reconciliationFailures ? "fail" : "pass"
    },
    {
      id: "protocol-revenue",
      label: "Protocol revenue",
      value: `${completeAllocationMonths.length} complete ${completeAllocationMonths.length === 1 ? "month" : "months"}`,
      detail: allocationFrom
        ? `Official allocation ${dateSpan(allocationFrom, allocationTo)}${latestAllocationMonth?.isComplete === false ? " · current month partial" : ""}`
        : "Official allocation is unavailable in this dataset",
      status: dailyAllocation.length ? "pass" : "unavailable"
    },
    {
      id: "loan-observations",
      label: "Loan observations",
      value: `${observationTimestamps.size} saved ${observationTimestamps.size === 1 ? "observation" : "observations"}`,
      detail: bundle.generatedAt ? `Current snapshot ${formatTimestamp(bundle.generatedAt)} · not daily history` : "Current snapshot time unavailable",
      status: observationTimestamps.size ? "pass" : "unavailable"
    },
    {
      id: "loan-reconciliation",
      label: "Loan aggregate reconciliation",
      value: `${rows(loanSnapshotHistory?.reconciliation).length} saved ${rows(loanSnapshotHistory?.reconciliation).length === 1 ? "observation" : "observations"}`,
      detail: `Real-time loan debt vs 4h batch cycle state across ${markets.length} markets`,
      status: rows(loanSnapshotHistory?.reconciliation).length ? "pass" : "unavailable"
    }
  ];
}

function buildLoanPopulation(allLoans, activeLoans) {
  const hasAllPositions = allLoans.length > 0;
  const totalPositions = hasAllPositions ? allLoans.length : activeLoans.length;
  const activeDebtPositions = activeLoans.length;
  const zeroDebtPositions = hasAllPositions
    ? allLoans.filter((loan) => Math.abs(dataStatusNumber(loan.amount ?? loan.debtInUsd)) <= 1e-12).length
    : 0;
  const excludedPositions = Math.max(0, totalPositions - activeDebtPositions);
  const excludedDustPositions = Math.max(0, excludedPositions - zeroDebtPositions);
  return {
    totalPositions,
    activeDebtPositions,
    zeroDebtPositions,
    excludedDustPositions,
    activeDebtShare: totalPositions ? activeDebtPositions / totalPositions : null,
    hasUnfilteredSnapshot: hasAllPositions
  };
}

function buildTechnicalAudit({
  bundle,
  allLoans,
  activeLoans,
  liquidationCoverage,
  liquidationReconciliations,
  dailyAllocation,
  monthlyAllocation,
  loanSnapshotHistory,
  checks
}) {
  const markets = rows(bundle.markets);
  const protocolHistory = rows(bundle.protocolSeries);
  const marketHistoryRowCount = markets.reduce((total, market) => total + rows(bundle.marketSeries?.[market.id]).length, 0);
  const coveredMarketCount = markets.filter((market) => rows(bundle.marketSeries?.[market.id]).length > 0).length;
  const participationRows = rows(loanSnapshotHistory.participation);
  const healthRows = rows(loanSnapshotHistory.health);
  const reconciliationRows = rows(loanSnapshotHistory.reconciliation);
  const observationTimestamps = protocolObservationTimestamps(loanSnapshotHistory);
  const completeAllocationDays = dailyAllocation.filter((row) => row.isComplete !== false && !row.fetchError).length;
  const completeAllocationMonths = monthlyAllocation.filter((row) => row.isComplete !== false && !row.fetchError).length;
  const missingLiquidationDays = dataStatusInteger(liquidationCoverage.missingDays);
  const liquidationFailureCount = dataStatusInteger(liquidationCoverage.reconciliationFailures);
  const currentLoanRowCount = allLoans.length || activeLoans.length;
  const checksById = Object.fromEntries(checks.map((check) => [check.id, check]));
  const protocolBorrow = checksById["protocol-borrow"] || {};
  const liquidation = checksById.liquidations || {};
  const revenue = checksById.revenue || {};
  const undercoverage = checksById["loan-row-undercoverage"] || {};
  const overcoverage = checksById["loan-row-overcoverage"] || {};
  const loanReconCheck = checksById["loan-aggregate-reconciliation"] || {};
  const requestedStartDate = bundle.requestedRange?.startDate || null;
  const requestedEndDate = bundle.requestedRange?.endDate || null;
  const observedStartDate = protocolHistory[0]?.date || null;
  const observedEndDate = protocolHistory.at(-1)?.date || null;

  return {
    source: bundle.source || null,
    generatedAt: bundle.generatedAt || null,
    rawCapture: bundle.rawCapture || null,
    requestedStartDate,
    requestedEndDate,
    provenance: [
      { id: "source", label: "Official source", value: bundle.source || "Unavailable" },
      { id: "generated-at", label: "Archive generated at", value: bundle.generatedAt || "Unavailable" },
      { id: "requested-history", label: "Requested history", value: requestedStartDate && requestedEndDate ? `${requestedStartDate} to ${requestedEndDate}` : "Unavailable" },
      { id: "observed-history", label: "Observed protocol history", value: observedStartDate && observedEndDate ? `${observedStartDate} to ${observedEndDate}` : "Unavailable" },
      { id: "raw-capture", label: "Raw API capture", value: bundle.rawCapture || "Unavailable" }
    ],
    inventory: [
      {
        id: "markets",
        label: "Current markets",
        rowCount: markets.length,
        value: `${markets.length} market rows`,
        detail: `${coveredMarketCount} have historical rows.`
      },
      {
        id: "protocol-history",
        label: "Protocol history",
        rowCount: protocolHistory.length,
        value: `${protocolHistory.length} daily rows`,
        detail: observedStartDate ? dateSpan(observedStartDate, observedEndDate) : "No protocol history rows."
      },
      {
        id: "market-history",
        label: "Market history",
        rowCount: marketHistoryRowCount,
        value: `${marketHistoryRowCount} daily rows`,
        detail: `Across ${coveredMarketCount} of ${markets.length} markets.`
      },
      {
        id: "liquidations",
        label: "Liquidation history",
        rowCount: dataStatusInteger(liquidationCoverage.availableDays),
        value: `${dataStatusInteger(liquidationCoverage.availableDays)} daily rows; ${liquidationReconciliations.length} monthly checks`,
        detail: `${dataStatusInteger(liquidationCoverage.fetchedDays)} fetched daily; ${dataStatusInteger(liquidationCoverage.inferredZeroDays)} confirmed-zero days; ${dataStatusInteger(liquidationCoverage.expectedDays)} expected.`
      },
      {
        id: "revenue-allocation",
        label: "Revenue allocation",
        rowCount: dailyAllocation.length,
        value: `${dailyAllocation.length} daily rows; ${monthlyAllocation.length} monthly rows`,
        detail: `${completeAllocationDays} complete days; ${completeAllocationMonths} complete months.`
      },
      {
        id: "current-loans",
        label: "Current loan snapshot",
        rowCount: currentLoanRowCount,
        value: `${currentLoanRowCount} all-position rows; ${activeLoans.length} active-debt rows`,
        detail: allLoans.length ? "Unfiltered and active snapshots are both available." : "Only the active-debt snapshot is available."
      },
      {
        id: "loan-observations",
        label: "Saved loan observations",
        rowCount: participationRows.length + healthRows.length + reconciliationRows.length,
        value: `${observationTimestamps.size} timestamps; ${participationRows.length + healthRows.length + reconciliationRows.length} computed rows`,
        detail: `${participationRows.length} participation rows; ${healthRows.length} health rows; ${reconciliationRows.length} reconciliation rows.`
      }
    ],
    evidence: [
      {
        id: "protocol-borrow",
        label: "Protocol borrow operands",
        status: protocolBorrow.status || "unavailable",
        value: `${formatUsdValue(protocolBorrow.officialBorrowInUsd)} official; ${formatUsdValue(protocolBorrow.summedMarketBorrowInUsd)} market sum`,
        detail: `${formatUsdDifference(protocolBorrow.differenceInUsd || 0)} difference.`
      },
      {
        id: "liquidations",
        label: "Liquidation coverage operands",
        status: liquidation.status || "unavailable",
        value: `${dataStatusInteger(liquidationCoverage.availableDays)} of ${dataStatusInteger(liquidationCoverage.expectedDays)} expected daily rows`,
        detail: missingLiquidationDays || liquidationFailureCount
          ? `${missingLiquidationDays} missing; ${liquidationReconciliations.length} monthly totals checked; ${liquidationFailureCount} failures.`
          : `No missing days; ${liquidationReconciliations.length} monthly totals checked; no failures.`
      },
      {
        id: "revenue",
        label: "Revenue reconciliation operands",
        status: revenue.status || "unavailable",
        value: `${dataStatusInteger(revenue.checkedDays)} complete daily allocations checked`,
        detail: `${dataStatusInteger(revenue.reconciliationFailures)} component-sum failures.`
      },
      {
        id: "loan-row-undercoverage",
        label: "Loan rows below market aggregates",
        status: undercoverage.status || "unavailable",
        value: undercoverage.value || "Unavailable",
        detail: undercoverage.detail || "Current position-level attribution is unavailable."
      },
      {
        id: "loan-row-overcoverage",
        label: "Loan rows above market aggregates",
        status: overcoverage.status || "unavailable",
        value: overcoverage.value || "Unavailable",
        detail: overcoverage.detail || "Current position-level attribution is unavailable."
      },
      {
        id: "loan-aggregate-reconciliation",
        label: "Loan aggregate vs market state lag (±$1.00 USD)",
        status: loanReconCheck.status || "unavailable",
        value: loanReconCheck.value || "Unavailable",
        detail: loanReconCheck.detail || "Loan aggregate reconciliation is unavailable.",
        operands: loanReconCheck.operands || []
      }
    ],
    rules: [
      {
        id: "official-source",
        label: "Source boundary",
        detail: "Every dataset comes from the official Liqwid v2 GraphQL API; unavailable fields are not substituted from another source."
      },
      {
        id: "borrow-tolerance",
        label: "Protocol and market borrow tolerance",
        detail: "Passes when the absolute difference is at most the larger of $0.01 or 0.000001% of official protocol borrow."
      },
      {
        id: "liquidation-tolerance",
        label: "Liquidation reconciliation tolerance",
        detail: "A complete month's daily liquidation profit must differ from its monthly total by no more than the larger of $0.01 or 0.0001% of the monthly total."
      },
      {
        id: "revenue-tolerance",
        label: "Revenue component tolerance",
        detail: "Protocol and holder totals must each equal interest plus origination components within the larger of $0.01 or 0.000001% of the total."
      },
      {
        id: "loan-row-reconciliation",
        label: "Loan-row reconciliation acceptance",
        detail: "For each market, the sum of HAS_DEBT Loan.amount(USD) is compared with Market.borrow(USD). The two Data status checks accept coverage from 99.5% through 100.5%, inclusive; analytics retain the exact values."
      },
      {
        id: "batch-cycle-reconciliation",
        label: "Loan aggregate reconciliation & batch state lag",
        detail: "User actions and compounding loan interest update real-time loan positions instantly (capitalizing past due interest into baseline debt upon each user transaction), whereas global market state (Market.borrow) is updated on a 4-hour batch cycle schedule. The loan-aggregate-reconciliation check compares sum(Loan.adjustedAmount * price) against Market.borrow * price using a $1.00 USD exact tolerance (reconciled, overcoverage, undercoverage) and isolates the un-batched accrued interest floor. Reconciliation differences can stem from 4-hour batch cycle lag, snapshot timing differences, or unmapped positions omitted by the API."
      },
      {
        id: "loan-population-rules",
        label: "Loan population membership",
        detail: "Active-debt rows come from the active-loan snapshot. Exact-zero rows have zero debt; dust rows are other all-position rows omitted from the active snapshot."
      }
    ]
  };
}

function protocolBorrowCheck(bundle) {
  const officialBorrowInUsd = dataStatusFinite(bundle.currentTotals?.borrowInUsd);
  const summedMarketBorrowInUsd = dataStatusFinite(bundle.summedCurrentTotals?.borrowInUsd);
  if (officialBorrowInUsd === null || summedMarketBorrowInUsd === null) {
    return {
      id: "protocol-borrow",
      label: "Protocol borrow vs market totals",
      status: "unavailable",
      value: "Unavailable",
      detail: "Both official protocol borrow and market totals are required."
    };
  }
  const differenceInUsd = officialBorrowInUsd - summedMarketBorrowInUsd;
  return {
    id: "protocol-borrow",
    label: "Protocol borrow vs market totals",
    status: withinUsdTolerance(differenceInUsd, officialBorrowInUsd) ? "pass" : "fail",
    value: `${formatUsdDifference(differenceInUsd)} difference`,
    detail: "Official protocol borrow compared with the sum returned for every market.",
    officialBorrowInUsd,
    summedMarketBorrowInUsd,
    differenceInUsd
  };
}

function liquidationCheck(coverage) {
  const available = Boolean(coverage?.firstDate || coverage?.lastDate || coverage?.complete !== undefined);
  if (!available) {
    return {
      id: "liquidations",
      label: "Daily vs monthly liquidations",
      status: "unavailable",
      value: "Unavailable",
      detail: "No daily liquidation coverage is available."
    };
  }
  const missingDays = dataStatusInteger(coverage.missingDays);
  const reconciliationFailures = dataStatusInteger(coverage.reconciliationFailures);
  return {
    id: "liquidations",
    label: "Daily vs monthly liquidations",
    status: missingDays || reconciliationFailures ? "fail" : "pass",
    value: missingDays || reconciliationFailures
      ? `${reconciliationFailures} reconciliation ${reconciliationFailures === 1 ? "failure" : "failures"}`
      : "All covered months reconcile",
    detail: missingDays || reconciliationFailures
      ? `${missingDays} missing ${missingDays === 1 ? "day" : "days"} across ${dateSpan(coverage.firstDate, coverage.lastDate)}.`
      : `No missing days across ${dateSpan(coverage.firstDate, coverage.lastDate)}.`,
    missingDays,
    reconciliationFailures
  };
}

function revenueCheck(dailyAllocation) {
  const completeRows = dailyAllocation.filter((row) => row.isComplete !== false && !row.fetchError);
  if (!completeRows.length) {
    return {
      id: "revenue",
      label: "Revenue totals vs components",
      status: "unavailable",
      value: "Unavailable",
      detail: "No complete official allocation days are available."
    };
  }
  const failedRows = completeRows.filter((row) => {
    const protocolDifference = dataStatusNumber(row.allocatedProtocolRevenueInUsd)
      - dataStatusNumber(row.allocatedProtocolInterestRevenueInUsd)
      - dataStatusNumber(row.allocatedProtocolOriginationRevenueInUsd);
    const holdersDifference = dataStatusNumber(row.allocatedHoldersRevenueInUsd)
      - dataStatusNumber(row.allocatedHoldersInterestRevenueInUsd)
      - dataStatusNumber(row.allocatedHoldersOriginationRevenueInUsd);
    return !withinUsdTolerance(protocolDifference, dataStatusNumber(row.allocatedProtocolRevenueInUsd))
      || !withinUsdTolerance(holdersDifference, dataStatusNumber(row.allocatedHoldersRevenueInUsd));
  });
  return {
    id: "revenue",
    label: "Revenue totals vs components",
    status: failedRows.length ? "fail" : "pass",
    value: `${failedRows.length} ${failedRows.length === 1 ? "failure" : "failures"}`,
    detail: `${completeRows.length} complete allocation ${completeRows.length === 1 ? "day" : "days"} checked.`,
    checkedDays: completeRows.length,
    reconciliationFailures: failedRows.length
  };
}

function loanRowUndercoverageCheck(marketDependence) {
  const comparable = comparableLoanRows(marketDependence);
  if (!comparable.length) {
    return {
      id: "loan-row-undercoverage",
      label: "Loan rows below market aggregates",
      status: "unavailable",
      value: "Unavailable",
      detail: "Current position-level attribution is unavailable.",
      totalDifferenceInUsd: null,
      affectedMarkets: []
    };
  }
  const affected = comparable.filter((market) => market.differenceInUsd < -market.acceptedDifferenceInUsd)
    .sort((left, right) => left.differenceInUsd - right.differenceInUsd || left.label.localeCompare(right.label));
  const totalDifferenceInUsd = affected.reduce((total, market) => total - market.differenceInUsd, 0);
  const affectedMarkets = affected.slice(0, 3).map((market) => market.label);
  return {
    id: "loan-row-undercoverage",
    label: "Loan rows below market aggregates",
    status: affected.length ? "fail" : "pass",
    value: affected.length ? `${affected.length} undercovered ${affected.length === 1 ? "market" : "markets"}` : "No undercoverage beyond 0.5%",
    detail: affected.length
      ? `${formatUsdValue(totalDifferenceInUsd)} of Market.borrow(USD) is not represented by summed HAS_DEBT Loan.amount(USD). Largest: ${affectedMarkets.join(", ")}.`
      : "No market is below the accepted 99.5% coverage boundary.",
    totalDifferenceInUsd,
    affectedMarkets
  };
}

function loanRowOvercoverageCheck(marketDependence) {
  const comparable = comparableLoanRows(marketDependence);
  if (!comparable.length) {
    return {
      id: "loan-row-overcoverage",
      label: "Loan rows above market aggregates",
      status: "unavailable",
      value: "Unavailable",
      detail: "Current position-level attribution is unavailable.",
      totalDifferenceInUsd: null,
      affectedMarkets: []
    };
  }
  const affected = comparable.filter((market) => market.differenceInUsd > market.acceptedDifferenceInUsd)
    .sort((left, right) => right.differenceInUsd - left.differenceInUsd || left.label.localeCompare(right.label));
  const totalDifferenceInUsd = affected.reduce((total, market) => total + market.differenceInUsd, 0);
  const affectedMarkets = affected.slice(0, 3).map((market) => market.label);
  return {
    id: "loan-row-overcoverage",
    label: "Loan rows above market aggregates",
    status: affected.length ? "partial" : "pass",
    value: affected.length ? `${affected.length} overcovered ${affected.length === 1 ? "market" : "markets"}` : "No overcoverage beyond 0.5%",
    detail: affected.length
      ? `Summed HAS_DEBT Loan.amount(USD) exceeds Market.borrow(USD) by ${formatUsdValue(totalDifferenceInUsd)}. The official loan-detail and market-aggregate API surfaces may not have refreshed to the same snapshot. Largest: ${affectedMarkets.join(", ")}.`
      : "No market is above the accepted 100.5% coverage boundary.",
    totalDifferenceInUsd,
    affectedMarkets
  };
}

function comparableLoanRows(marketDependence) {
  return marketDependence.flatMap((market) => {
    const marketBorrowInUsd = dataStatusFinite(market.marketBorrowInUsd);
    const loanRowDebtInUsd = dataStatusFinite(market.loanRowDebtInUsd);
    if (marketBorrowInUsd === null || marketBorrowInUsd <= 0 || loanRowDebtInUsd === null) return [];
    return [{
      label: String(market.marketDisplayName || market.marketId || "Unknown market"),
      differenceInUsd: loanRowDebtInUsd - marketBorrowInUsd,
      acceptedDifferenceInUsd: marketBorrowInUsd * DATA_STATUS_LOAN_ROW_MARGIN
    }];
  });
}

function dateSpan(fromDate, toDate) {
  if (fromDate && toDate) return `${String(fromDate).slice(0, 10)} to ${String(toDate).slice(0, 10)}`;
  return String(fromDate || toDate || "an unavailable period").slice(0, 10);
}

function rows(value) {
  return Array.isArray(value) ? value : [];
}

function protocolObservationTimestamps(loanSnapshotHistory = {}) {
  return new Set([
    ...rows(loanSnapshotHistory.participation),
    ...rows(loanSnapshotHistory.health)
  ]
    .filter((row) => row.scope === "protocol" && row.timestamp)
    .map((row) => String(row.timestamp)));
}

function dataStatusFinite(value) {
  if (value === null || value === undefined || String(value).trim() === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function dataStatusNumber(value) {
  return dataStatusFinite(value) ?? 0;
}

function dataStatusInteger(value) {
  return Math.max(0, Math.round(dataStatusNumber(value)));
}

function withinUsdTolerance(difference, reference) {
  return Math.abs(difference) <= Math.max(DATA_STATUS_USD_TOLERANCE, Math.abs(reference) * 1e-8);
}

function formatUsdDifference(value) {
  const magnitude = Math.abs(value) < DATA_STATUS_USD_TOLERANCE ? 0 : value;
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(magnitude);
}

function formatUsdValue(value) {
  const numeric = dataStatusFinite(value);
  if (numeric === null) return "Unavailable";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(numeric);
}

function formatPercent(value) {
  return new Intl.NumberFormat("en-US", { style: "percent", maximumFractionDigits: 1 }).format(value);
}

function formatTimestamp(value) {
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) return String(value);
  return `${new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "UTC"
  }).format(new Date(timestamp))} UTC`;
}

function loanAggregateReconciliationCheck(marketDependence, bundle, activeLoansInput) {
  const markets = rows(bundle?.markets);
  if (!markets.length) {
    return {
      id: "loan-aggregate-reconciliation",
      label: "Loan aggregate vs market state lag",
      status: "unavailable",
      value: "Unavailable",
      detail: "Market metadata is unavailable.",
      operands: []
    };
  }
  const activeLoans = rows(activeLoansInput);
  const reconciliations = markets.map((market) => {
    const marketLoans = activeLoans.filter((loan) => String(loan.marketId) === String(market.id));
    return computeLoanAggregateReconciliation({ market, loans: marketLoans });
  });

  const lagging = reconciliations.filter((r) => r.classification !== "reconciled");
  const overcovered = reconciliations.filter((r) => r.classification === "overcoverage");
  const undercovered = reconciliations.filter((r) => r.classification === "undercoverage");
  const totalDifferenceInUsd = reconciliations.reduce((total, r) => total + Math.abs(r.adjustedDifferenceInUsd), 0);

  return {
    id: "loan-aggregate-reconciliation",
    label: "Loan aggregate vs market state lag",
    status: lagging.length ? "partial" : "pass",
    value: lagging.length
      ? `${lagging.length} ${lagging.length === 1 ? "market" : "markets"} lagging batch cycle`
      : "All markets reconciled with 4h batch cycle (±$1.00 USD)",
    detail: lagging.length
      ? `${overcovered.length} overcovered (pending batch state update); ${undercovered.length} undercovered. Total drift delta: ${formatUsdValue(totalDifferenceInUsd)}.`
      : "Sum of open active-debt positions matches market aggregate state within $1.00 USD for all markets.",
    reconciledCount: reconciliations.length - lagging.length,
    laggingCount: lagging.length,
    totalDifferenceInUsd,
    operands: reconciliations
  };
}

