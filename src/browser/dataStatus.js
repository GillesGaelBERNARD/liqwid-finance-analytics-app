import { computeLoanAggregateReconciliation, classifyReconciliationState } from "../shared/metrics.js";

const DATA_STATUS_USD_TOLERANCE = 0.01;
const DATA_STATUS_LOAN_ROW_MARGIN = 0.005;
const OFFICIAL_LIQWID_GRAPHQL_ENDPOINT = "https://v2.api.liqwid.finance/graphql";
const SUPPORTED_ARCHIVE_SCHEMA_VERSION = 4;

export function buildDataStatus(input = {}) {
  const bundle = input.bundle || {};
  const allLoans = rows(input.allLoans);
  const activeLoans = rows(input.activeLoans).filter((loan) =>
    loan.hasDebt === true
      || dataStatusNumber(loan.adjustedAmountInUsd ?? loan.adjustedAmount ?? loan.debtInUsd ?? loan.amountInUsd ?? loan.amount) > 0
  );
  const liquidationCoverage = input.liquidation?.dailyLiquidationCoverage || {};
  const liquidationReconciliations = rows(input.liquidation?.dailyLiquidationReconciliations);
  const dailyAllocation = rows(input.revenue?.dailyAllocation);
  const monthlyAllocation = rows(input.revenue?.monthlyAllocation);
  const marketDependence = rows(input.currentExposure?.borrowerConcentration?.marketDependence);
  const marketHistory = auditMarketHistory(bundle);

  const coverageCards = buildCoverageCards({
    bundle,
    marketHistory,
    liquidationCoverage,
    dailyAllocation,
    monthlyAllocation,
    loanSnapshotHistory: input.loanSnapshotHistory || {},
    marketDependence,
    marketRevenue: input.marketRevenue || {},
    marketParameters: input.marketParameters || {},
    protocolParameters: input.protocolParameters || {},
    lqToken: input.lqToken || {}
  });
  const loanPopulation = buildLoanPopulation(
    allLoans,
    activeLoans,
    rows(input.liquidatableLoans),
    rows(input.collateralLoans),
    bundle
  );
  const checks = [
    archiveProvenanceCheck(bundle),
    protocolTotalCheck(bundle, "supply"),
    protocolBorrowCheck(bundle),
    protocolTotalCheck(bundle, "liquidity"),
    currentMarketSnapshotCheck(bundle),
    currentLoanSnapshotCheck(bundle, allLoans),
    historicalRawCleanCheck(bundle),
    debtFlowIdentityCheck(bundle),
    liquidationCheck(liquidationCoverage),
    revenueCheck(dailyAllocation),
    loanRowUndercoverageCheck(marketDependence),
    loanRowOvercoverageCheck(marketDependence),
    loanAggregateReconciliationCheck(marketDependence, bundle, activeLoans)
  ];
  const assessments = [...coverageCards, ...checks];
  const failedChecks = assessments.filter((item) => item.status === "fail").length;
  const partialChecks = assessments.filter((item) => item.status === "partial").length;
  const passedChecks = assessments.filter((item) => item.status === "pass").length;
  const unavailableChecks = assessments.filter((item) => item.status === "unavailable").length;
  const headlineState = failedChecks
    ? "attention"
    : partialChecks || unavailableChecks
      ? "limited"
      : "healthy";

  return {
    headline: {
      state: headlineState,
      label: headlineState === "attention"
        ? "Some data needs attention"
        : headlineState === "limited"
          ? "Data is usable with known limitations"
          : "All available integrity checks passed",
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
      },
      {
        id: "history-origin",
        title: "History starts at the earliest observed active row",
        detail: "Continuity is checked from each market's first saved official row onward. The API does not provide an independent launch-date registry that could prove an earlier inactive boundary."
      },
      {
        id: "debt-flow-classification",
        title: "Borrow reductions are not fully classified",
        detail: "Official market history reports debt repayment but does not identify the cause of every borrow decrease. The unclassified reduction term completes the balance identity only; it is not labelled as liquidation, repayment, migration, or settlement."
      },
      {
        id: "interest-balance-unavailable",
        title: "Current interest receivable is unavailable",
        detail: "Historical interest accrued and repaid flows do not expose the current split between principal and interest. Their cumulative reported flow difference is not a current interest balance."
      },
      {
        id: "lq-history",
        title: "LQ history is observation-based",
        detail: "LQ price, staking, and treasury values appear only at authentic saved API observation times. The app never backfills or interpolates daily values."
      },
      {
        id: "price-age",
        title: "Price timestamps report age, not correctness",
        detail: "A current-market price older than 24 hours is flagged as partial coverage. Freshness alone does not validate the quoted price."
      },
      {
        id: "market-revenue-attribution",
        title: "Market revenue attribution is conditional",
        detail: "Collected interest revenue is attributed to markets only on days when official protocol repayments, market repayments, and effective income parameters reconcile."
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
      checks,
      coverageCards,
      loanPopulation
    })
  };
}

function protocolTotalCheck(bundle, metric) {
  const title = metric[0].toUpperCase() + metric.slice(1);
  const field = `${metric}InUsd`;
  const officialInUsd = dataStatusFinite(bundle?.currentTotals?.[field]);
  const summedMarketInUsd = dataStatusFinite(bundle?.summedCurrentTotals?.[field]);
  if (officialInUsd === null || summedMarketInUsd === null) {
    return {
      id: `protocol-${metric}`,
      label: `Protocol ${metric} vs market totals`,
      status: "unavailable",
      value: "Unavailable",
      detail: `Both official protocol ${metric} and summed market ${metric} are required.`
    };
  }
  const differenceInUsd = officialInUsd - summedMarketInUsd;
  return {
    id: `protocol-${metric}`,
    label: `Protocol ${metric} vs market totals`,
    status: withinUsdTolerance(differenceInUsd, officialInUsd) ? "pass" : "fail",
    value: `${formatUsdDifference(differenceInUsd)} difference`,
    detail: `Official protocol ${metric} compared with the sum returned for every market.`,
    [`official${title}InUsd`]: officialInUsd,
    [`summedMarket${title}InUsd`]: summedMarketInUsd,
    differenceInUsd
  };
}

function currentMarketSnapshotCheck(bundle) {
  const audit = bundle?.archiveAudit?.currentMarkets;
  if (!audit) {
    return {
      id: "current-market-snapshot",
      label: "Current market raw-to-clean counts",
      status: "unavailable",
      value: "Unavailable",
      detail: "Raw market envelopes, API total, result rows, and clean market rows are all required.",
      mismatches: []
    };
  }
  const rawEnvelopeRowCount = dataStatusFinite(audit.rawEnvelopeRowCount);
  const rawTotalCount = dataStatusFinite(audit.rawTotalCount);
  const rawResultCount = dataStatusFinite(audit.rawResultCount);
  const cleanRowCount = dataStatusFinite(audit.cleanRowCount);
  if ([rawEnvelopeRowCount, rawTotalCount, rawResultCount, cleanRowCount].some((value) => value === null)) {
    return {
      id: "current-market-snapshot",
      label: "Current market raw-to-clean counts",
      status: "unavailable",
      value: "Unavailable",
      detail: "Raw market envelopes, API total, result rows, and clean market rows are all required.",
      mismatches: []
    };
  }
  const mismatches = [];
  if (rawEnvelopeRowCount !== rawResultCount) mismatches.push("raw envelopes vs raw results");
  if (rawResultCount !== rawTotalCount) mismatches.push("raw results vs API total");
  if (cleanRowCount !== rawTotalCount) mismatches.push("clean rows vs API total");
  return {
    id: "current-market-snapshot",
    label: "Current market raw-to-clean counts",
    status: mismatches.length ? "fail" : "pass",
    value: `${dataStatusInteger(cleanRowCount)} clean rows · ${dataStatusInteger(rawTotalCount)} API total`,
    detail: mismatches.length
      ? `${mismatches.length} count ${mismatches.length === 1 ? "mismatch" : "mismatches"}: ${mismatches.join("; ")}.`
      : "Raw market envelope rowCounts, API totalCount, result rows, and canonical clean market rows agree.",
    rawEnvelopeRowCount,
    rawTotalCount,
    rawResultCount,
    cleanRowCount,
    mismatches
  };
}

function currentLoanSnapshotCheck(bundle, allLoans) {
  const audit = bundle?.archiveAudit?.currentLoans || {};
  const rawEnvelopeRowCount = dataStatusFinite(audit.rawEnvelopeRowCount);
  const rawTotalCount = dataStatusFinite(audit.rawTotalCount);
  const rawResultCount = dataStatusFinite(audit.rawResultCount);
  const cleanRowCount = dataStatusFinite(audit.cleanRowCount) ?? (allLoans.length ? allLoans.length : null);
  if ([rawEnvelopeRowCount, rawTotalCount, rawResultCount, cleanRowCount].some((value) => value === null)) {
    return {
      id: "current-loan-snapshot",
      label: "Current loan raw-to-clean counts",
      status: "unavailable",
      value: "Unavailable",
      detail: "Raw envelope, API total, result-array, and clean-row counts are all required.",
      mismatches: []
    };
  }
  const mismatches = [];
  if (rawEnvelopeRowCount !== rawResultCount) mismatches.push("raw envelope vs raw results");
  if (rawResultCount !== rawTotalCount) mismatches.push("raw results vs API total");
  if (cleanRowCount !== rawTotalCount) mismatches.push("clean rows vs API total");
  return {
    id: "current-loan-snapshot",
    label: "Current loan raw-to-clean counts",
    status: mismatches.length ? "fail" : "pass",
    value: `${dataStatusInteger(cleanRowCount)} clean rows · ${dataStatusInteger(rawTotalCount)} API total`,
    detail: mismatches.length
      ? `${mismatches.length} count ${mismatches.length === 1 ? "mismatch" : "mismatches"}: ${mismatches.join("; ")}.`
      : "Raw envelope rowCount, API totalCount, result rows, and canonical clean rows agree.",
    rawEnvelopeRowCount,
    rawTotalCount,
    rawResultCount,
    cleanRowCount,
    mismatches
  };
}

function historicalRawCleanCheck(bundle) {
  const audit = bundle?.archiveAudit?.historicalTables;
  if (!audit) {
    return {
      id: "historical-raw-clean",
      label: "Historical raw-to-clean row counts",
      status: "unavailable",
      value: "Unavailable",
      detail: "Latest-capture market-history and parameter-history row counts are required.",
      affectedMarkets: []
    };
  }
  const requiredCounts = [
    "expectedMarketFiles",
    "rawMarketHistoryFiles",
    "rawMarketHistoryRows",
    "cleanMarketHistoryRows",
    "rawMarketParameterFiles",
    "rawMarketParameterRows",
    "cleanMarketParameterRows"
  ];
  if (requiredCounts.some((field) => dataStatusFinite(audit[field]) === null)) {
    return {
      id: "historical-raw-clean",
      label: "Historical raw-to-clean row counts",
      status: "unavailable",
      value: "Unavailable",
      detail: "Latest-capture market-history and parameter-history row counts are incomplete.",
      affectedMarkets: []
    };
  }
  const expectedMarketFiles = dataStatusInteger(audit.expectedMarketFiles);
  const marketHistoryMismatches = rows(audit.marketHistoryMismatches).map(String);
  const marketParameterMismatches = rows(audit.marketParameterMismatches).map(String);
  const affectedMarkets = [...new Set([...marketHistoryMismatches, ...marketParameterMismatches])].sort();
  const failures = [
    dataStatusInteger(audit.rawMarketHistoryFiles) !== expectedMarketFiles,
    dataStatusInteger(audit.rawMarketParameterFiles) !== expectedMarketFiles,
    dataStatusInteger(audit.rawMarketHistoryRows) !== dataStatusInteger(audit.cleanMarketHistoryRows),
    dataStatusInteger(audit.rawMarketParameterRows) !== dataStatusInteger(audit.cleanMarketParameterRows),
    affectedMarkets.length > 0
  ].filter(Boolean).length;
  return {
    id: "historical-raw-clean",
    label: "Historical raw-to-clean row counts",
    status: failures ? "fail" : "pass",
    value: failures ? `${failures} lineage ${failures === 1 ? "failure" : "failures"}` : "Raw and clean historical rows agree",
    detail: failures
      ? `${affectedMarkets.length} affected ${affectedMarkets.length === 1 ? "market" : "markets"}; latest raw history or parameter counts do not match canonical clean tables.`
      : `${dataStatusInteger(audit.rawMarketHistoryRows)} market-history rows and ${dataStatusInteger(audit.rawMarketParameterRows)} parameter-history rows reconcile across ${expectedMarketFiles} markets.`,
    expectedMarketFiles,
    rawMarketHistoryFiles: dataStatusInteger(audit.rawMarketHistoryFiles),
    rawMarketHistoryRows: dataStatusInteger(audit.rawMarketHistoryRows),
    cleanMarketHistoryRows: dataStatusInteger(audit.cleanMarketHistoryRows),
    rawMarketParameterFiles: dataStatusInteger(audit.rawMarketParameterFiles),
    rawMarketParameterRows: dataStatusInteger(audit.rawMarketParameterRows),
    cleanMarketParameterRows: dataStatusInteger(audit.cleanMarketParameterRows),
    affectedMarkets
  };
}

function archiveProvenanceCheck(bundle) {
  const metadata = bundle?.archiveMetadata || {};
  const audit = bundle?.archiveAudit || {};
  const endpoint = metadata.endpoint || bundle?.source || null;
  const schemaVersion = dataStatusFinite(metadata.schemaVersion);
  const failedRules = [];
  const unavailableRules = [];

  if (!endpoint) unavailableRules.push("endpoint");
  else if (endpoint !== OFFICIAL_LIQWID_GRAPHQL_ENDPOINT) failedRules.push("endpoint");
  if (schemaVersion === null) unavailableRules.push("schema-version");
  else if (schemaVersion !== SUPPORTED_ARCHIVE_SCHEMA_VERSION) failedRules.push("schema-version");
  if (audit.latestRawCapturePresent === false) failedRules.push("latest-raw-capture");
  else if (audit.latestRawCapturePresent !== true) unavailableRules.push("latest-raw-capture");
  if (dataStatusInteger(audit.rawSourceMismatchCount) > 0) failedRules.push("raw-envelope-source");
  else if (audit.rawSourceMismatchCount === null || audit.rawSourceMismatchCount === undefined) unavailableRules.push("raw-envelope-source");
  if (audit.manifestValidated === false) failedRules.push("portable-manifest");

  const status = failedRules.length ? "fail" : unavailableRules.length ? "partial" : "pass";
  return {
    id: "archive-provenance",
    label: "Archive source and lineage",
    status,
    value: failedRules.length
      ? `${failedRules.length} provenance ${failedRules.length === 1 ? "failure" : "failures"}`
      : unavailableRules.length
        ? `${unavailableRules.length} unverified ${unavailableRules.length === 1 ? "rule" : "rules"}`
        : "Official source and raw lineage verified",
    detail: failedRules.length
      ? `${failedRules.length} provenance ${failedRules.length === 1 ? "failure requires" : "failures require"} attention: ${failedRules.join(", ")}.`
      : unavailableRules.length
        ? `Available metadata is valid, but these rules could not be verified: ${unavailableRules.join(", ")}.`
        : `${dataStatusInteger(audit.rawCaptureCount)} raw capture roots; ${dataStatusInteger(audit.latestRawEnvelopeCount)} latest-capture envelopes checked.`,
    failedRules,
    unavailableRules,
    endpoint,
    schemaVersion,
    rawCaptureCount: dataStatusInteger(audit.rawCaptureCount),
    latestRawEnvelopeCount: dataStatusInteger(audit.latestRawEnvelopeCount),
    rawSourceMismatchCount: dataStatusInteger(audit.rawSourceMismatchCount),
    manifestValidated: audit.manifestValidated ?? null
  };
}

function buildCoverageCards({
  bundle,
  marketHistory,
  liquidationCoverage,
  dailyAllocation,
  monthlyAllocation,
  loanSnapshotHistory,
  marketRevenue,
  marketParameters,
  protocolParameters,
  lqToken
}) {
  const markets = rows(bundle.markets);
  const completeAllocationMonths = monthlyAllocation.filter((row) => row.isComplete !== false && !row.fetchError);
  const latestAllocationMonth = monthlyAllocation.at(-1);
  const missingDays = dataStatusInteger(liquidationCoverage.missingDays);
  const reconciliationFailures = dataStatusInteger(liquidationCoverage.reconciliationFailures);
  const hasLiquidationCoverage = Boolean(liquidationCoverage.firstDate || liquidationCoverage.lastDate || liquidationCoverage.complete !== undefined);
  const revenueCoverage = protocolRevenueCoverage(bundle, dailyAllocation, completeAllocationMonths, latestAllocationMonth);
  const revenueAttribution = marketRevenueAttributionCoverage(marketRevenue);
  const parameterCoverage = marketParameterCoverage(bundle, marketParameters, protocolParameters);
  const lqCoverage = lqObservationCoverage(lqToken, bundle);
  const priceCoverage = priceObservationCoverage(bundle);
  const loanObservations = loanObservationCoverage(bundle, loanSnapshotHistory);
  const loanReconciliation = loanReconciliationObservationCoverage(bundle, loanSnapshotHistory, markets);

  return [
    {
      id: "market-history",
      label: "Market history",
      value: marketHistory.value,
      detail: marketHistory.detail,
      status: marketHistory.status,
      coveredMarkets: marketHistory.coveredMarkets,
      missingCalendarDays: marketHistory.missingCalendarDays,
      marketsWithGaps: marketHistory.marketsWithGaps,
      affectedMarkets: marketHistory.affectedMarkets,
      duplicateDates: marketHistory.duplicateDates,
      outOfOrderRows: marketHistory.outOfOrderRows,
      invalidDateRows: marketHistory.invalidDateRows,
      invalidMetricRows: marketHistory.invalidMetricRows,
      staleMarkets: marketHistory.staleMarkets,
      expectedLatestDate: marketHistory.expectedLatestDate
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
    revenueCoverage,
    revenueAttribution,
    parameterCoverage,
    lqCoverage,
    priceCoverage,
    loanObservations,
    loanReconciliation
  ];
}

function auditMarketHistory(bundle) {
  const markets = rows(bundle?.markets);
  const expectedLatestDate = expectedLatestCompleteDate(bundle);
  let coveredMarkets = 0;
  let missingCalendarDays = 0;
  let duplicateDates = 0;
  let outOfOrderRows = 0;
  let invalidDateRows = 0;
  let invalidMetricRows = 0;
  let staleMarkets = 0;
  const gapMarkets = new Set();
  const affectedMarkets = new Set();

  for (const market of markets) {
    const marketId = String(market.id ?? "");
    const label = String(market.displayName || market.symbol || marketId || "Unknown market");
    const history = rows(bundle?.marketSeries?.[marketId]);
    if (!history.length) {
      affectedMarkets.add(label);
      continue;
    }
    coveredMarkets += 1;
    const validDates = [];
    let previousInputDay = null;
    for (const row of history) {
      const missingRequiredMetric = ["supplyInUsd", "borrowInUsd", "liquidityInUsd", "utilizationPercentage"]
        .some((field) => dataStatusFinite(row?.[field]) === null);
      if (missingRequiredMetric) {
        invalidMetricRows += 1;
        affectedMarkets.add(label);
      }
      const date = normalizeDateKey(row?.date ?? row?.timestamp);
      if (!date) {
        invalidDateRows += 1;
        affectedMarkets.add(label);
        continue;
      }
      if (previousInputDay && date < previousInputDay) {
        outOfOrderRows += 1;
        affectedMarkets.add(label);
      }
      previousInputDay = date;
      validDates.push(date);
    }
    const uniqueDates = [...new Set(validDates)].sort();
    duplicateDates += validDates.length - uniqueDates.length;
    if (validDates.length !== uniqueDates.length) affectedMarkets.add(label);
    for (let index = 1; index < uniqueDates.length; index += 1) {
      const missing = calendarDayDistance(uniqueDates[index - 1], uniqueDates[index]) - 1;
      if (missing > 0) {
        missingCalendarDays += missing;
        gapMarkets.add(label);
        affectedMarkets.add(label);
      }
    }
    const latestDate = uniqueDates.at(-1);
    if (!market.delisting && expectedLatestDate && latestDate && latestDate < expectedLatestDate) {
      const missing = calendarDayDistance(latestDate, expectedLatestDate);
      missingCalendarDays += missing;
      staleMarkets += 1;
      gapMarkets.add(label);
      affectedMarkets.add(label);
    }
  }

  const missingSeries = markets.length - coveredMarkets;
  const integrityFailures = missingSeries + duplicateDates + outOfOrderRows + invalidDateRows + invalidMetricRows;
  const status = !markets.length || integrityFailures
    ? "fail"
    : missingCalendarDays || staleMarkets
      ? "partial"
      : "pass";
  const value = !markets.length
    ? "No market history"
    : integrityFailures
      ? `${coveredMarkets} / ${markets.length} markets · ${integrityFailures} integrity ${integrityFailures === 1 ? "issue" : "issues"}`
      : missingCalendarDays
        ? `${coveredMarkets} / ${markets.length} markets · ${missingCalendarDays} missing ${missingCalendarDays === 1 ? "day" : "days"}`
        : `${coveredMarkets} / ${markets.length} markets · continuous`;
  const detailParts = [
    expectedLatestDate ? `Expected through ${expectedLatestDate}` : "Expected latest date unavailable",
    gapMarkets.size ? `${gapMarkets.size} ${gapMarkets.size === 1 ? "market has" : "markets have"} calendar gaps or stale tails` : "no calendar gaps",
    integrityFailures ? `${integrityFailures} structural integrity ${integrityFailures === 1 ? "issue" : "issues"}` : "no duplicate, invalid, or out-of-order dates"
  ];
  return {
    status,
    value,
    detail: `${detailParts.join("; ")}.`,
    coveredMarkets,
    missingSeries,
    missingCalendarDays,
    marketsWithGaps: gapMarkets.size,
    duplicateDates,
    outOfOrderRows,
    invalidDateRows,
    invalidMetricRows,
    staleMarkets,
    expectedLatestDate,
    affectedMarkets: [...affectedMarkets].sort((left, right) => left.localeCompare(right))
  };
}

function protocolRevenueCoverage(bundle, dailyAllocation, completeAllocationMonths, latestAllocationMonth) {
  if (!dailyAllocation.length) {
    return {
      id: "protocol-revenue",
      label: "Protocol revenue",
      value: "Unavailable",
      detail: "No official daily allocation rows are available.",
      status: "unavailable",
      missingCalendarDays: 0,
      invalidDateRows: 0,
      duplicateDates: 0,
      outOfOrderRows: 0,
      incompleteClosedDays: 0
    };
  }

  const expectedStartDate = "2026-01-01";
  const expectedLatestDate = expectedLatestCompleteDate(bundle);
  const validDates = [];
  let invalidDateRows = 0;
  let outOfOrderRows = 0;
  let previousInputDay = null;
  let incompleteClosedDays = 0;
  for (const row of dailyAllocation) {
    const date = normalizeDateKey(row?.date ?? row?.periodStartDay);
    if (!date) {
      invalidDateRows += 1;
      continue;
    }
    if (previousInputDay && date < previousInputDay) outOfOrderRows += 1;
    previousInputDay = date;
    validDates.push(date);
    if ((!expectedLatestDate || date <= expectedLatestDate) && (row.isComplete === false || row.fetchError)) {
      incompleteClosedDays += 1;
    }
  }
  const uniqueDates = [...new Set(validDates)].sort();
  const duplicateDates = validDates.length - uniqueDates.length;
  let missingCalendarDays = 0;
  if (uniqueDates.length) {
    if (uniqueDates[0] > expectedStartDate) {
      missingCalendarDays += calendarDayDistance(expectedStartDate, uniqueDates[0]);
    }
    for (let index = 1; index < uniqueDates.length; index += 1) {
      missingCalendarDays += Math.max(0, calendarDayDistance(uniqueDates[index - 1], uniqueDates[index]) - 1);
    }
    const latestDate = uniqueDates.at(-1);
    if (expectedLatestDate && latestDate < expectedLatestDate) {
      missingCalendarDays += calendarDayDistance(latestDate, expectedLatestDate);
    }
  }
  const integrityFailures = invalidDateRows + duplicateDates + outOfOrderRows + incompleteClosedDays;
  const status = integrityFailures ? "fail" : missingCalendarDays ? "partial" : "pass";
  const allocationFrom = uniqueDates[0] || null;
  const allocationTo = uniqueDates.at(-1) || null;
  const monthSummary = `${completeAllocationMonths.length} complete ${completeAllocationMonths.length === 1 ? "month" : "months"}`;
  return {
    id: "protocol-revenue",
    label: "Protocol revenue",
    value: integrityFailures
      ? `${integrityFailures} integrity ${integrityFailures === 1 ? "issue" : "issues"}`
      : missingCalendarDays
        ? `${missingCalendarDays} missing ${missingCalendarDays === 1 ? "day" : "days"}`
        : monthSummary,
    detail: `Official allocation ${dateSpan(allocationFrom, allocationTo)}; expected ${dateSpan(expectedStartDate, expectedLatestDate)}${latestAllocationMonth?.isComplete === false ? " · current month partial" : ""}.`,
    status,
    completeMonths: completeAllocationMonths.length,
    missingCalendarDays,
    invalidDateRows,
    duplicateDates,
    outOfOrderRows,
    incompleteClosedDays,
    expectedStartDate,
    expectedLatestDate
  };
}

function marketRevenueAttributionCoverage(marketRevenue) {
  const marketRows = Object.values(marketRevenue?.byMarket || {}).filter(Boolean);
  if (!marketRows.length) {
    return {
      id: "market-revenue-attribution",
      label: "Market revenue attribution",
      value: "Unavailable",
      detail: "No market-level revenue attribution analysis is available.",
      status: "unavailable"
    };
  }
  const allHistoryComplete = marketRows.filter((market) => market.summary?.attributedAllHistoryComplete).length;
  const ytdComplete = marketRows.filter((market) => market.summary?.ytdAttributionComplete).length;
  const incompleteProtocolDays = dataStatusInteger(marketRevenue?.protocolReconciliation?.incompleteDays);
  return {
    id: "market-revenue-attribution",
    label: "Market revenue attribution",
    value: `${allHistoryComplete} / ${marketRows.length} all-history · ${ytdComplete} / ${marketRows.length} YTD`,
    detail: incompleteProtocolDays
      ? `${incompleteProtocolDays} protocol ${incompleteProtocolDays === 1 ? "day is" : "days are"} not attributable to markets.`
      : "Collected interest is attributed only on days where market repayments and effective parameters reconcile.",
    status: allHistoryComplete === marketRows.length && ytdComplete === marketRows.length && !incompleteProtocolDays
      ? "pass"
      : "partial",
    totalMarkets: marketRows.length,
    allHistoryCompleteMarkets: allHistoryComplete,
    ytdCompleteMarkets: ytdComplete,
    incompleteProtocolDays
  };
}

function marketParameterCoverage(bundle, marketParameters, protocolParameters) {
  const current = protocolParameters?.current || {};
  const totalMarkets = dataStatusInteger(current.totalMarketCount);
  const parameterizedMarkets = dataStatusInteger(current.parameterizedMarketCount);
  const eventCount = Object.values(marketParameters?.byMarket || {})
    .reduce((total, market) => total + rows(market?.events).length, 0);
  const cursorAudit = bundle?.archiveAudit?.parameterCursors || {};
  const cursorRows = dataStatusInteger(cursorAudit.rowCount);
  const cursorsThroughEnd = dataStatusInteger(cursorAudit.requestedThroughEndCount);
  if (!totalMarkets) {
    return {
      id: "market-parameters",
      label: "Market parameters",
      value: "Unavailable",
      detail: "No parameter-history analysis is available.",
      status: "unavailable"
    };
  }
  const fullParameterCoverage = parameterizedMarkets === totalMarkets;
  const expectedCursorRows = rows(bundle?.markets).length || totalMarkets;
  const fullCursorCoverage = cursorRows === expectedCursorRows && cursorsThroughEnd === cursorRows;
  const cursorDetail = !cursorRows
    ? "parameter cursor metadata is unavailable"
    : `${cursorsThroughEnd} / ${expectedCursorRows} market cursors reach the requested end`;
  return {
    id: "market-parameters",
    label: "Market parameters",
    value: `${parameterizedMarkets} / ${totalMarkets} markets · ${eventCount} events`,
    detail: `${formatPercent(dataStatusNumber(current.parameterCoverage))} of current borrow has historical parameters; ${cursorDetail}.`,
    status: fullParameterCoverage && fullCursorCoverage ? "pass" : "partial",
    totalMarkets,
    parameterizedMarkets,
    eventCount,
    parameterizedBorrowShare: dataStatusFinite(current.parameterCoverage),
    cursorRows,
    cursorsThroughEnd,
    expectedCursorRows
  };
}

function lqObservationCoverage(lqToken, bundle) {
  const series = rows(lqToken?.series);
  const observed = series.filter((row) =>
    dataStatusFinite(row?.lqPriceInUsd) !== null
      || dataStatusFinite(row?.stakedLqAmount) !== null
      || dataStatusFinite(row?.daoTreasuryLqAmount) !== null
  );
  if (!observed.length) {
    return {
      id: "lq-observations",
      label: "LQ token observations",
      value: "Unavailable",
      detail: "No authentic LQ statistics observations are saved.",
      status: "unavailable"
    };
  }
  const observedDates = observed
    .map((row) => normalizeDateKey(row?.date || row?.timestamp))
    .filter(Boolean)
    .sort();
  const invalidDateRows = observed.length - observedDates.length;
  const expectedLatestDate = expectedLatestCompleteDate(bundle);
  const latestObservation = observedDates.at(-1) || null;
  const staleDays = expectedLatestDate && latestObservation && latestObservation < expectedLatestDate
    ? calendarDayDistance(latestObservation, expectedLatestDate)
    : 0;
  const status = invalidDateRows ? "fail" : staleDays ? "partial" : "pass";
  return {
    id: "lq-observations",
    label: "LQ token observations",
    value: `${observed.length} saved ${observed.length === 1 ? "observation" : "observations"}`,
    detail: `${dateSpan(observedDates[0], latestObservation)} · observation-based, not daily-filled${staleDays ? ` · latest is ${staleDays} ${staleDays === 1 ? "day" : "days"} behind the expected closed day` : ""}.`,
    status,
    observationCount: observed.length,
    firstObservation: observedDates[0] || null,
    latestObservation,
    expectedLatestDate,
    staleDays,
    invalidDateRows
  };
}

function loanObservationCoverage(bundle, loanSnapshotHistory) {
  const participationTimestamps = protocolTableTimestamps(loanSnapshotHistory?.participation);
  const healthTimestamps = protocolTableTimestamps(loanSnapshotHistory?.health);
  const observationTimestamps = new Set([...participationTimestamps, ...healthTimestamps]);
  if (!observationTimestamps.size) {
    return {
      id: "loan-observations",
      label: "Loan observations",
      value: "Unavailable",
      detail: "No protocol participation or health observations are saved.",
      status: "unavailable",
      missingOrStaleTables: ["participation", "health"]
    };
  }

  const generatedDay = normalizeDateKey(bundle?.generatedAt);
  const latestParticipation = [...participationTimestamps].sort().at(-1) || null;
  const latestHealth = [...healthTimestamps].sort().at(-1) || null;
  const missingOrStaleTables = [];
  if (!latestParticipation || (generatedDay && normalizeDateKey(latestParticipation) !== generatedDay)) {
    missingOrStaleTables.push("participation");
  }
  if (!latestHealth || (generatedDay && normalizeDateKey(latestHealth) !== generatedDay)) {
    missingOrStaleTables.push("health");
  }
  const aligned = latestParticipation && latestHealth && latestParticipation === latestHealth;
  const status = missingOrStaleTables.length || !aligned ? "partial" : "pass";
  return {
    id: "loan-observations",
    label: "Loan observations",
    value: `${observationTimestamps.size} saved ${observationTimestamps.size === 1 ? "observation" : "observations"}`,
    detail: status === "pass"
      ? `Latest participation and health snapshot ${formatTimestamp(latestParticipation)} · not daily history`
      : `Participation and health snapshots are missing, stale, or not aligned at the archive generation timestamp.`,
    status,
    participationTimestamps: participationTimestamps.size,
    healthTimestamps: healthTimestamps.size,
    latestParticipation,
    latestHealth,
    missingOrStaleTables
  };
}

function loanReconciliationObservationCoverage(bundle, loanSnapshotHistory, markets) {
  const reconciliationRows = rows(loanSnapshotHistory?.reconciliation);
  const timestamps = reconciliationObservationTimestamps(loanSnapshotHistory);
  if (!reconciliationRows.length || !timestamps.size) {
    return {
      id: "loan-reconciliation",
      label: "Loan aggregate reconciliation",
      value: "Unavailable",
      detail: "No saved loan-reconciliation observations are available.",
      status: "unavailable",
      coveredMarketsAtLatest: 0
    };
  }
  const latestTimestamp = [...timestamps].sort().at(-1);
  const generatedDay = normalizeDateKey(bundle?.generatedAt);
  const latestDay = normalizeDateKey(latestTimestamp);
  const coveredMarketsAtLatest = new Set(reconciliationRows
    .filter((row) => String(row.timestamp) === latestTimestamp && row.scope === "market" && row.marketId)
    .map((row) => String(row.marketId))).size;
  const expectedMarketIds = markets
    .filter((market) => dataStatusNumber(market?.borrowInUsd ?? market?.borrow) > 0)
    .map((market) => String(market.id));
  const expectedMarkets = expectedMarketIds.length;
  const stale = Boolean(generatedDay && latestDay !== generatedDay);
  const incomplete = coveredMarketsAtLatest !== expectedMarkets;
  return {
    id: "loan-reconciliation",
    label: "Loan aggregate reconciliation",
    value: `${timestamps.size} snapshot ${timestamps.size === 1 ? "timestamp" : "timestamps"} · ${reconciliationRows.length} scope rows`,
    detail: stale || incomplete
      ? `Latest saved snapshot covers ${coveredMarketsAtLatest} / ${expectedMarkets} markets${stale ? " and is not from the archive generation day" : ""}.`
      : `Real-time loan debt vs 4h batch cycle state across ${expectedMarkets} currently borrowed markets`,
    status: stale || incomplete ? "partial" : "pass",
    latestTimestamp,
    coveredMarketsAtLatest,
    expectedMarkets
  };
}

function priceObservationCoverage(bundle) {
  const generatedAt = Date.parse(bundle?.generatedAt);
  const activeMarkets = rows(bundle?.markets).filter((market) =>
    !market.delisting && (dataStatusNumber(market.borrowInUsd ?? market.borrow) > 0 || dataStatusNumber(market.supplyInUsd ?? market.supply) > 0)
  );
  if (!activeMarkets.length || !Number.isFinite(generatedAt)) {
    return {
      id: "price-observations",
      label: "Current price observations",
      value: "Unavailable",
      detail: "Current active markets or the archive generation timestamp is unavailable.",
      status: "unavailable"
    };
  }
  const stale = activeMarkets.filter((market) => {
    const observedAt = Date.parse(market?.asset?.priceUpdatedAt);
    return !Number.isFinite(observedAt) || generatedAt - observedAt > 86_400_000;
  });
  const totalBorrow = activeMarkets.reduce((total, market) => total + dataStatusNumber(market.borrowInUsd ?? market.borrow), 0);
  const staleBorrow = stale.reduce((total, market) => total + dataStatusNumber(market.borrowInUsd ?? market.borrow), 0);
  const staleBorrowShare = totalBorrow > 0 ? staleBorrow / totalBorrow : 0;
  return {
    id: "price-observations",
    label: "Current price observations",
    value: stale.length
      ? `${stale.length} stale or missing active-market ${stale.length === 1 ? "timestamp" : "timestamps"}`
      : `${activeMarkets.length} / ${activeMarkets.length} active markets current`,
    detail: stale.length
      ? `${formatPercent(staleBorrowShare)} of current borrow is in affected markets; this reports API observation age, not price correctness.`
      : "Every active market price timestamp is within 24 hours of archive generation.",
    status: stale.length ? "partial" : "pass",
    activeMarkets: activeMarkets.length,
    staleActiveMarkets: stale.length,
    staleBorrowShare,
    affectedMarkets: stale.map((market) => String(market.displayName || market.symbol || market.id)).sort()
  };
}

function buildLoanPopulation(allLoans, activeLoans, liquidatableLoans, collateralLoans, bundle) {
  const hasAllPositions = allLoans.length > 0;
  const totalPositions = hasAllPositions ? allLoans.length : activeLoans.length;
  const activeDebtPositions = activeLoans.length;
  const excludedPositions = Math.max(0, totalPositions - activeDebtPositions);
  const zeroDebtPositions = hasAllPositions
    ? Math.min(excludedPositions, allLoans.filter((loan) => {
      const adjustedDebt = dataStatusFinite(loan.adjustedAmountInUsd ?? loan.adjustedAmount ?? loan.debtInUsd);
      return loan.hasDebt !== true
        && !(adjustedDebt !== null && adjustedDebt > 0)
        && Math.abs(dataStatusNumber(loan.amountInUsd ?? loan.amount)) <= 1e-12;
    }).length)
    : 0;
  const excludedDustPositions = Math.max(0, excludedPositions - zeroDebtPositions);
  const activeDebtInUsd = activeLoans.reduce((total, loan) =>
    total + dataStatusNumber(loan.adjustedAmountInUsd ?? loan.adjustedAmount ?? loan.debtInUsd ?? loan.amountInUsd ?? loan.amount), 0
  );
  const currentBorrowInUsd = dataStatusFinite(bundle?.currentTotals?.borrowInUsd);
  return {
    totalPositions,
    activeDebtPositions,
    zeroDebtPositions,
    excludedDustPositions,
    liquidatablePositions: liquidatableLoans.length,
    collateralPositions: collateralLoans.length,
    missingObservedKeyPositions: activeLoans.filter((loan) => !String(loan.publicKey || loan.observedKey || "").trim()).length,
    missingHealthFactorPositions: activeLoans.filter((loan) => dataStatusFinite(loan.healthFactor) === null).length,
    activeDebtInUsd,
    representedBorrowShare: currentBorrowInUsd > 0 ? activeDebtInUsd / currentBorrowInUsd : null,
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
  checks,
  coverageCards,
  loanPopulation
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
  const coverageById = Object.fromEntries(coverageCards.map((card) => [card.id, card]));
  const archiveProvenance = checksById["archive-provenance"] || {};
  const marketHistory = coverageById["market-history"] || {};
  const protocolSupply = checksById["protocol-supply"] || {};
  const protocolBorrow = checksById["protocol-borrow"] || {};
  const protocolLiquidity = checksById["protocol-liquidity"] || {};
  const currentMarketSnapshot = checksById["current-market-snapshot"] || {};
  const currentLoanSnapshot = checksById["current-loan-snapshot"] || {};
  const historicalRawClean = checksById["historical-raw-clean"] || {};
  const debtFlowIdentity = checksById["debt-flow-identity"] || {};
  const liquidation = checksById.liquidations || {};
  const revenue = checksById.revenue || {};
  const protocolRevenueCoverage = coverageById["protocol-revenue"] || {};
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
      { id: "schema-version", label: "Archive schema", value: bundle.archiveMetadata?.schemaVersion ?? "Unavailable" },
      { id: "generated-at", label: "Archive generated at", value: bundle.generatedAt || "Unavailable" },
      { id: "requested-history", label: "Requested history", value: requestedStartDate && requestedEndDate ? `${requestedStartDate} to ${requestedEndDate}` : "Unavailable" },
      { id: "observed-history", label: "Observed protocol history", value: observedStartDate && observedEndDate ? `${observedStartDate} to ${observedEndDate}` : "Unavailable" },
      { id: "raw-capture", label: "Latest raw API capture", value: bundle.rawCapture || "Unavailable" },
      { id: "raw-capture-count", label: "Raw capture roots", value: bundle.archiveAudit?.rawCaptureCount ?? "Unavailable" },
      { id: "portable-manifest", label: "Portable manifest", value: bundle.archiveAudit?.manifestValidated === true ? "CRC and entry set validated" : bundle.archiveAudit?.manifestValidated === false ? "Validation failed" : "Not applicable to this folder/store" }
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
        detail: `${allLoans.length ? "Unfiltered and active snapshots are both available." : "Only the active-debt snapshot is available."} ${loanPopulation.liquidatablePositions} liquidatable; ${loanPopulation.collateralPositions} collateral-bearing; ${loanPopulation.missingObservedKeyPositions} active rows missing observed keys; ${loanPopulation.missingHealthFactorPositions} active rows missing health factor.`
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
        ...archiveProvenance,
        label: "Archive source and lineage evidence"
      },
      {
        ...marketHistory,
        id: "market-history",
        label: "Market-history continuity evidence"
      },
      {
        id: "protocol-supply",
        label: "Protocol supply operands",
        status: protocolSupply.status || "unavailable",
        value: `${formatUsdValue(protocolSupply.officialSupplyInUsd)} official; ${formatUsdValue(protocolSupply.summedMarketSupplyInUsd)} market sum`,
        detail: `${formatUsdDifference(protocolSupply.differenceInUsd || 0)} difference.`
      },
      {
        id: "protocol-borrow",
        label: "Protocol borrow operands",
        status: protocolBorrow.status || "unavailable",
        value: `${formatUsdValue(protocolBorrow.officialBorrowInUsd)} official; ${formatUsdValue(protocolBorrow.summedMarketBorrowInUsd)} market sum`,
        detail: `${formatUsdDifference(protocolBorrow.differenceInUsd || 0)} difference.`
      },
      {
        id: "protocol-liquidity",
        label: "Protocol liquidity operands",
        status: protocolLiquidity.status || "unavailable",
        value: `${formatUsdValue(protocolLiquidity.officialLiquidityInUsd)} official; ${formatUsdValue(protocolLiquidity.summedMarketLiquidityInUsd)} market sum`,
        detail: `${formatUsdDifference(protocolLiquidity.differenceInUsd || 0)} difference.`
      },
      {
        ...currentMarketSnapshot,
        label: "Current market raw-to-clean count evidence"
      },
      {
        ...currentLoanSnapshot,
        label: "Current loan raw-to-clean count evidence"
      },
      {
        ...historicalRawClean,
        label: "Historical raw-to-clean lineage evidence"
      },
      {
        ...debtFlowIdentity,
        label: "Native debt-flow balance identity evidence"
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
        ...protocolRevenueCoverage,
        label: "Protocol revenue date coverage evidence"
      },
      {
        id: "revenue",
        label: "Revenue reconciliation operands",
        status: revenue.status || "unavailable",
        value: `${dataStatusInteger(revenue.checkedDays)} complete daily allocations checked`,
        detail: `${dataStatusInteger(revenue.invalidOperandDays)} days with missing or invalid operands; ${dataStatusInteger(revenue.reconciliationFailures)} component-sum failures.${rows(revenue.failedDates).length ? ` Affected: ${rows(revenue.failedDates).join(", ")}.` : ""}`
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
        id: "raw-clean-lineage",
        label: "Raw-to-clean lineage",
        detail: "The latest full market-history and parameter-history raw envelope rowCounts must match their canonical clean table rows market by market; current market and loan API totals must also match their clean snapshots."
      },
      {
        id: "debt-flow-identity",
        label: "Debt-flow balance identity",
        detail: "Every eligible market-day is checked in native units: Borrow change = inferred formation - reported repayment - unclassified reduction. The tolerance is the larger of 1e-9 native units or 1e-12 times the largest operand."
      },
      {
        id: "revenue-date-coverage",
        label: "Protocol revenue date coverage",
        detail: "Official daily allocation coverage is expected for every closed UTC day from 2026-01-01 through the earlier of the requested end and the last complete UTC day; missing days are partial and invalid, duplicate, out-of-order, or incomplete closed rows fail."
      },
      {
        id: "loan-row-reconciliation",
        label: "Loan-row reconciliation acceptance",
        detail: "For each market, the sum of HAS_DEBT Loan.amount(USD) is compared with Market.borrow(USD). The two Data status checks accept coverage from 99.5% through 100.5%, inclusive; analytics retain the exact values."
      },
      {
        id: "batch-cycle-reconciliation",
        label: "Loan aggregate reconciliation & batch state lag",
        detail: "User actions and compounding loan interest update real-time loan positions instantly (capitalizing past due interest into baseline debt upon each user transaction), whereas global market state (Market.borrow) is updated on a 4-hour batch cycle schedule. The loan-aggregate-reconciliation check compares sum(Loan.adjustedAmount in USD) against Market.borrow in USD using a $1.00 USD exact tolerance (reconciled, overcoverage, undercoverage) and isolates the un-batched accrued interest floor. Reconciliation differences can stem from 4-hour batch cycle lag, snapshot timing differences, or unmapped positions omitted by the API."
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

function debtFlowIdentityCheck(bundle) {
  const marketSeries = bundle?.marketSeries || {};
  const failures = [];
  const checkedMarkets = new Set();
  let checkedRows = 0;

  for (const [marketId, marketRows] of Object.entries(marketSeries)) {
    const series = rows(marketRows);
    for (let index = 1; index < series.length; index += 1) {
      const previousBorrow = dataStatusFinite(series[index - 1]?.borrow);
      const currentBorrow = dataStatusFinite(series[index]?.borrow);
      const inferredFormation = dataStatusFinite(series[index]?.debtAccrued);
      const reportedRepayment = dataStatusFinite(series[index]?.debtRepaid);
      const unclassifiedReduction = dataStatusFinite(
        series[index]?.unclassifiedBorrowReduction
      );
      if (
        previousBorrow === null
        || currentBorrow === null
        || inferredFormation === null
        || reportedRepayment === null
        || unclassifiedReduction === null
      ) {
        continue;
      }

      checkedRows += 1;
      checkedMarkets.add(marketId);
      const borrowChange = currentBorrow - previousBorrow;
      const reconciledChange =
        inferredFormation - reportedRepayment - unclassifiedReduction;
      const residual = borrowChange - reconciledChange;
      const scale = Math.max(
        1,
        Math.abs(borrowChange),
        Math.abs(inferredFormation),
        Math.abs(reportedRepayment),
        Math.abs(unclassifiedReduction)
      );
      const tolerance = Math.max(1e-9, scale * 1e-12);
      if (Math.abs(residual) > tolerance) {
        failures.push({
          marketId,
          date: series[index]?.date || null,
          borrowChange,
          inferredFormation,
          reportedRepayment,
          unclassifiedReduction,
          residual,
          tolerance
        });
      }
    }
  }

  if (!checkedRows) {
    return {
      id: "debt-flow-identity",
      label: "Debt-flow balance identity",
      status: "unavailable",
      value: "Unavailable",
      detail: "Derived native debt-flow operands are unavailable.",
      checkedRows: 0,
      failedRows: 0,
      affectedMarkets: [],
      failures: []
    };
  }

  const affectedMarkets = [...new Set(failures.map((failure) => failure.marketId))].sort();
  const affectedDates = failures
    .slice(0, 5)
    .map((failure) => `${failure.marketId} ${failure.date || "unknown date"}`)
    .join(", ");
  return {
    id: "debt-flow-identity",
    label: "Debt-flow balance identity",
    status: failures.length ? "fail" : "pass",
    value: failures.length
      ? `${failures.length} of ${checkedRows} market-days fail`
      : `${checkedRows} market-days reconcile`,
    detail: failures.length
      ? `Borrow change differs from inferred formation minus reported repayment minus unclassified reduction at ${affectedDates}${failures.length > 5 ? ` and ${failures.length - 5} more` : ""}.`
      : `All ${checkedRows} eligible rows across ${checkedMarkets.size} markets satisfy the native debt-flow identity.`,
    checkedRows,
    failedRows: failures.length,
    affectedMarkets,
    failures
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
  const requiredOperands = [
    "allocatedProtocolRevenueInUsd",
    "allocatedProtocolInterestRevenueInUsd",
    "allocatedProtocolOriginationRevenueInUsd",
    "allocatedHoldersRevenueInUsd",
    "allocatedHoldersInterestRevenueInUsd",
    "allocatedHoldersOriginationRevenueInUsd"
  ];
  const invalidOperandRows = completeRows.filter((row) =>
    requiredOperands.some((field) => dataStatusFinite(row[field]) === null)
  );
  const invalidRows = new Set(invalidOperandRows);
  const failedRows = completeRows.filter((row) => {
    if (invalidRows.has(row)) return false;
    const protocolTotal = dataStatusFinite(row.allocatedProtocolRevenueInUsd);
    const holdersTotal = dataStatusFinite(row.allocatedHoldersRevenueInUsd);
    const protocolDifference = protocolTotal
      - dataStatusFinite(row.allocatedProtocolInterestRevenueInUsd)
      - dataStatusFinite(row.allocatedProtocolOriginationRevenueInUsd);
    const holdersDifference = holdersTotal
      - dataStatusFinite(row.allocatedHoldersInterestRevenueInUsd)
      - dataStatusFinite(row.allocatedHoldersOriginationRevenueInUsd);
    return !withinUsdTolerance(protocolDifference, protocolTotal)
      || !withinUsdTolerance(holdersDifference, holdersTotal);
  });
  const failedDates = [...new Set([...invalidOperandRows, ...failedRows]
    .map((row) => String(row.date || row.periodStartDay || "Unknown date")))];
  const failureCount = failedDates.length;
  return {
    id: "revenue",
    label: "Revenue totals vs components",
    status: failureCount ? "fail" : "pass",
    value: `${failureCount} ${failureCount === 1 ? "failure" : "failures"}`,
    detail: invalidOperandRows.length
      ? `${invalidOperandRows.length} complete allocation ${invalidOperandRows.length === 1 ? "day has" : "days have"} missing or invalid required operands.`
      : `${completeRows.length} complete allocation ${completeRows.length === 1 ? "day" : "days"} checked.`,
    checkedDays: completeRows.length,
    invalidOperandDays: invalidOperandRows.length,
    reconciliationFailures: failedRows.length,
    failedDates
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
    const loanRowAmountInUsd = dataStatusFinite(market.loanRowAmountInUsd ?? market.loanRowDebtInUsd);
    if (marketBorrowInUsd === null || marketBorrowInUsd <= 0 || loanRowAmountInUsd === null) return [];
    return [{
      label: String(market.marketDisplayName || market.marketId || "Unknown market"),
      differenceInUsd: loanRowAmountInUsd - marketBorrowInUsd,
      acceptedDifferenceInUsd: marketBorrowInUsd * DATA_STATUS_LOAN_ROW_MARGIN
    }];
  });
}

function dateSpan(fromDate, toDate) {
  if (fromDate && toDate) return `${String(fromDate).slice(0, 10)} to ${String(toDate).slice(0, 10)}`;
  return String(fromDate || toDate || "an unavailable period").slice(0, 10);
}

function expectedLatestCompleteDate(bundle) {
  const requestedEndDate = normalizeDateKey(bundle?.requestedRange?.endDate);
  const generatedTimestamp = Date.parse(bundle?.generatedAt);
  const priorUtcDate = Number.isFinite(generatedTimestamp)
    ? new Date(Date.UTC(
      new Date(generatedTimestamp).getUTCFullYear(),
      new Date(generatedTimestamp).getUTCMonth(),
      new Date(generatedTimestamp).getUTCDate() - 1
    )).toISOString().slice(0, 10)
    : null;
  if (requestedEndDate && priorUtcDate) return requestedEndDate < priorUtcDate ? requestedEndDate : priorUtcDate;
  return requestedEndDate || priorUtcDate;
}

function normalizeDateKey(value) {
  if (value === null || value === undefined || String(value).trim() === "") return null;
  const candidate = String(value).slice(0, 10);
  const timestamp = Date.parse(`${candidate}T00:00:00.000Z`);
  return Number.isFinite(timestamp) && new Date(timestamp).toISOString().slice(0, 10) === candidate
    ? candidate
    : null;
}

function calendarDayDistance(fromDate, toDate) {
  return Math.max(0, Math.round(
    (Date.parse(`${toDate}T00:00:00.000Z`) - Date.parse(`${fromDate}T00:00:00.000Z`)) / 86_400_000
  ));
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

function protocolTableTimestamps(tableRows) {
  return new Set(rows(tableRows)
    .filter((row) => row.scope === "protocol" && row.timestamp)
    .map((row) => String(row.timestamp)));
}

function reconciliationObservationTimestamps(loanSnapshotHistory = {}) {
  return new Set(rows(loanSnapshotHistory.reconciliation)
    .filter((row) => row.timestamp)
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
    return computeLoanAggregateReconciliation({ market, loans: marketLoans, valuesInUsd: true });
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
