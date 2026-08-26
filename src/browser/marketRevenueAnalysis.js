import { normalizeMarketParameterRows } from "./marketParameterHistory.js";

const RECONCILIATION_ABSOLUTE_TOLERANCE_USD = 0.01;
const RECONCILIATION_RELATIVE_TOLERANCE = 0.0001;

export function buildMarketRevenueAnalysis(input = {}) {
  const markets = Array.isArray(input.markets) ? input.markets : [];
  const marketSeriesById = input.marketSeriesById || {};
  const marketParamsById = input.marketParamsById || {};
  const generatedDate = String(input.generatedAt || "").slice(0, 10);
  const byMarket = {};
  const rowsByDate = new Map();

  for (const market of markets) {
    const marketId = String(market?.id || market?.marketId || "");
    if (!marketId) continue;
    const parameterRows = normalizeMarketParameterRows(marketRevenueRowsForMarket(marketParamsById, marketId));
    const daily = marketRevenueRowsForMarket(marketSeriesById, marketId)
      .filter((row) => row?.date && row.isComplete !== false && !row.fetchError)
      .filter((row) => !generatedDate || String(row.date) < generatedDate)
      .sort((left, right) => String(left.date).localeCompare(String(right.date)))
      .map((row) => buildMarketRevenueDay(marketId, row, effectiveParameters(parameterRows, row.date)));

    for (const row of daily) {
      if (!rowsByDate.has(row.date)) rowsByDate.set(row.date, []);
      rowsByDate.get(row.date).push(row);
    }
    byMarket[marketId] = {
      marketId,
      marketDisplayName: market?.displayName || market?.symbol || marketId,
      daily,
      summary: null
    };
  }

  const protocolReconciliation = reconcileCollectedInterestRevenue(
    rowsByDate,
    input.protocolRevenueDaily || [],
    generatedDate
  );

  for (const market of markets) {
    const marketId = String(market?.id || market?.marketId || "");
    if (!byMarket[marketId]) continue;
    byMarket[marketId].summary = summarizeMarketRevenue(byMarket[marketId].daily);
  }

  const protocolYtdRevenue = protocolYtdCollectedRevenue(input.protocolRevenueDaily || [], generatedDate);
  const ytdContributions = buildMarketYtdRevenueContributions(byMarket, protocolYtdRevenue);

  return {
    byMarket,
    protocolReconciliation,
    ytdMarketContributions: ytdContributions.contributions,
    topYtdMarket: ytdContributions.topMarket
  };
}

function buildMarketRevenueDay(marketId, source, parameters) {
  const allocation = interestAllocation(parameters);
  const interestAccruedInUsd = marketRevenueNumber(source.interestAccruedInUsd);
  const interestRepaidInUsd = marketRevenueNumber(source.interestRepaidInUsd);
  const directOriginationRevenueInUsd = (
    marketRevenueNumber(source.loanOriginationFeesInUsd)
    + marketRevenueNumber(source.loanOriginationFeesMinAdaInUsd)
  );
  const grossAnnualizedInterestIncomeInUsd = marketRevenueNumber(source.borrowInUsd) * marketRevenueNumber(source.borrowApr);
  const hasAllocation = allocation !== null;
  return {
    marketId,
    date: String(source.date),
    timestamp: source.timestamp || `${source.date}T00:00:00.000Z`,
    parameterEffectiveAt: parameters?.timestamp ?? null,
    supplierInterestShare: allocation?.supplierShare ?? null,
    protocolInterestShare: allocation?.protocolShare ?? null,
    interestAccruedInUsd,
    interestRepaidInUsd,
    directOriginationRevenueInUsd,
    accruedSupplierInterestIncomeInUsd: hasAllocation
      ? interestAccruedInUsd * allocation.supplierShare
      : null,
    accruedProtocolInterestRevenueInUsd: hasAllocation
      ? interestAccruedInUsd * allocation.protocolShare
      : null,
    projectedAnnualizedInterestIncomeInUsd: hasAllocation
      ? grossAnnualizedInterestIncomeInUsd
      : null,
    projectedAnnualizedSupplierInterestIncomeInUsd: hasAllocation
      ? grossAnnualizedInterestIncomeInUsd * allocation.supplierShare
      : null,
    projectedAnnualizedProtocolInterestRevenueInUsd: hasAllocation
      ? grossAnnualizedInterestIncomeInUsd * allocation.protocolShare
      : null,
    retainedInterestAttributionWeightInUsd: hasAllocation
      ? interestRepaidInUsd * allocation.protocolShare
      : null,
    collectedInterestAttributionAvailable: false,
    attributedCollectedInterestRevenueInUsd: null,
    attributedCollectedMarketRevenueInUsd: null
  };
}

function reconcileCollectedInterestRevenue(rowsByDate, protocolRows, generatedDate) {
  const daily = [];
  const source = [...(Array.isArray(protocolRows) ? protocolRows : [])]
    .filter((row) => row?.date && row.isComplete !== false && !row.fetchError)
    .filter((row) => !generatedDate || String(row.date) < generatedDate)
    .sort((left, right) => String(left.date).localeCompare(String(right.date)));

  for (const protocolRow of source) {
    const date = String(protocolRow.date);
    const marketRows = rowsByDate.get(date) || [];
    const officialCollectedInterestRevenueInUsd = marketRevenueNumber(protocolRow.revenueFromRepaidInterestInUsd);
    const positiveRepaymentRows = marketRows.filter((row) => row.interestRepaidInUsd > 0);
    const missingParameters = positiveRepaymentRows.filter((row) =>
      !marketRevenueFinite(row.retainedInterestAttributionWeightInUsd)
    );
    const attributedWeightInUsd = marketRevenueSum(marketRows, "retainedInterestAttributionWeightInUsd");
    const marketInterestRepaidInUsd = marketRevenueSum(marketRows, "interestRepaidInUsd");
    const officialInterestRepaidInUsd = marketRevenueOptionalNumber(protocolRow.interestRepaidInUsd);
    const repaymentMismatch = officialInterestRepaidInUsd !== null
      && !marketRevenueReconciles(marketInterestRepaidInUsd, officialInterestRepaidInUsd);

    let reason = "";
    if (missingParameters.length) reason = "Missing effective market parameters for a market with positive interest repayment.";
    else if (repaymentMismatch) reason = "Market interest repayments do not reconcile with the official protocol repayment total.";
    else if (officialCollectedInterestRevenueInUsd > 0 && attributedWeightInUsd <= 0) {
      reason = "The official retained-interest total is positive but parameter-weighted market repayments are zero.";
    }
    const isComplete = !reason;

    for (const row of marketRows) {
      row.collectedInterestAttributionAvailable = isComplete;
      row.attributedCollectedInterestRevenueInUsd = isComplete
        ? attributedWeightInUsd > 0
          ? officialCollectedInterestRevenueInUsd * marketRevenueNumber(row.retainedInterestAttributionWeightInUsd) / attributedWeightInUsd
          : 0
        : null;
      row.attributedCollectedMarketRevenueInUsd = isComplete
        ? row.directOriginationRevenueInUsd + row.attributedCollectedInterestRevenueInUsd
        : null;
    }

    const attributedCollectedInterestRevenueInUsd = isComplete
      ? marketRevenueSum(marketRows, "attributedCollectedInterestRevenueInUsd")
      : null;
    daily.push({
      date,
      officialCollectedInterestRevenueInUsd,
      attributedCollectedInterestRevenueInUsd,
      differenceInUsd: isComplete
        ? attributedCollectedInterestRevenueInUsd - officialCollectedInterestRevenueInUsd
        : null,
      marketInterestRepaidInUsd,
      officialInterestRepaidInUsd,
      attributedWeightInUsd,
      contributingMarketCount: positiveRepaymentRows.length,
      isComplete,
      reason
    });
  }

  return {
    daily,
    completeDays: daily.filter((row) => row.isComplete).length,
    incompleteDays: daily.filter((row) => !row.isComplete).length
  };
}

function summarizeMarketRevenue(daily) {
  const rows = [...daily].sort((left, right) => left.date.localeCompare(right.date));
  const coverageToDate = rows.at(-1)?.date ?? null;
  const ytdStartDate = coverageToDate ? `${coverageToDate.slice(0, 4)}-01-01` : null;
  const ytdRows = ytdStartDate
    ? rows.filter((row) => row.date >= ytdStartDate && row.date <= coverageToDate)
    : [];
  const allocationRows = rows.filter(hasInterestAllocation);
  const ytdAllocationRows = ytdRows.filter(hasInterestAllocation);
  const attributedRows = rows.filter((row) => row.collectedInterestAttributionAvailable);
  const ytdAttributedRows = ytdRows.filter((row) => row.collectedInterestAttributionAvailable);
  const latest = [...allocationRows].at(-1) || null;
  const ytdAttributionComplete = ytdRows.length > 0 && ytdAttributedRows.length === ytdRows.length;
  const attributionComplete = rows.length > 0 && attributedRows.length === rows.length;

  return {
    coverageFromDate: rows[0]?.date ?? null,
    coverageToDate,
    completeDays: rows.length,
    ytdCoverageFromDate: ytdRows[0]?.date ?? null,
    ytdCoverageToDate: ytdRows.at(-1)?.date ?? null,
    ytdCompleteDays: ytdRows.length,
    directOriginationRevenueInUsd: marketRevenueSum(rows, "directOriginationRevenueInUsd"),
    ytdDirectOriginationRevenueInUsd: marketRevenueSum(ytdRows, "directOriginationRevenueInUsd"),
    attributedCollectedInterestRevenueInUsd: attributionComplete
      ? marketRevenueSum(attributedRows, "attributedCollectedInterestRevenueInUsd")
      : null,
    attributedCollectedMarketRevenueInUsd: attributionComplete
      ? marketRevenueSum(attributedRows, "attributedCollectedMarketRevenueInUsd")
      : null,
    attributedCoverageFromDate: attributedRows[0]?.date ?? null,
    attributedCoverageToDate: attributedRows.at(-1)?.date ?? null,
    attributedCompleteDays: attributedRows.length,
    attributedAllHistoryComplete: attributionComplete,
    ytdAttributedCollectedInterestRevenueInUsd: ytdAttributionComplete
      ? marketRevenueSum(ytdAttributedRows, "attributedCollectedInterestRevenueInUsd")
      : null,
    ytdAttributedCollectedMarketRevenueInUsd: ytdAttributionComplete
      ? marketRevenueSum(ytdAttributedRows, "attributedCollectedMarketRevenueInUsd")
      : null,
    ytdAttributedCompleteDays: ytdAttributedRows.length,
    ytdAttributionComplete,
    allocationCoverageFromDate: allocationRows[0]?.date ?? null,
    allocationCoverageToDate: allocationRows.at(-1)?.date ?? null,
    allocationCompleteDays: allocationRows.length,
    accruedInterestInUsd: marketRevenueSum(allocationRows, "interestAccruedInUsd"),
    accruedSupplierInterestIncomeInUsd: marketRevenueSum(allocationRows, "accruedSupplierInterestIncomeInUsd"),
    accruedProtocolInterestRevenueInUsd: marketRevenueSum(allocationRows, "accruedProtocolInterestRevenueInUsd"),
    ytdAccruedInterestInUsd: marketRevenueSum(ytdAllocationRows, "interestAccruedInUsd"),
    ytdAccruedSupplierInterestIncomeInUsd: marketRevenueSum(ytdAllocationRows, "accruedSupplierInterestIncomeInUsd"),
    ytdAccruedProtocolInterestRevenueInUsd: marketRevenueSum(ytdAllocationRows, "accruedProtocolInterestRevenueInUsd"),
    projectedAnnualizedInterestIncomeInUsd: latest?.projectedAnnualizedInterestIncomeInUsd ?? null,
    projectedAnnualizedSupplierInterestIncomeInUsd: latest?.projectedAnnualizedSupplierInterestIncomeInUsd ?? null,
    projectedAnnualizedProtocolInterestRevenueInUsd: latest?.projectedAnnualizedProtocolInterestRevenueInUsd ?? null,
    projectedAnnualizedAsOfDate: latest?.date ?? null,
    currentSupplierInterestShare: latest?.supplierInterestShare ?? null,
    currentProtocolInterestShare: latest?.protocolInterestShare ?? null
  };
}

function effectiveParameters(parameterRows, date) {
  const endOfDay = Date.parse(`${String(date).slice(0, 10)}T23:59:59.999Z`);
  let effective = null;
  for (const row of parameterRows) {
    if (Date.parse(row.timestamp) > endOfDay) break;
    effective = row;
  }
  return effective;
}

function interestAllocation(parameters) {
  const ratioSum = marketRevenueOptionalNumber(parameters?.incomeRatioSum);
  const supplierRatio = marketRevenueOptionalNumber(parameters?.incomeRatioSuppliers);
  if (ratioSum === null || supplierRatio === null || ratioSum <= 0) return null;
  const supplierShare = marketRevenueClamp(supplierRatio / ratioSum, 0, 1);
  return {
    supplierShare: marketRevenueRounded(supplierShare),
    protocolShare: marketRevenueRounded(1 - supplierShare)
  };
}

function hasInterestAllocation(row) {
  return marketRevenueFinite(row.supplierInterestShare) && marketRevenueFinite(row.protocolInterestShare);
}

function marketRevenueRowsForMarket(source, marketId) {
  const direct = source?.[marketId];
  if (Array.isArray(direct)) return direct;
  const matchingKey = Object.keys(source || {}).find((key) =>
    String(key).toUpperCase() === String(marketId).toUpperCase()
  );
  return matchingKey && Array.isArray(source[matchingKey]) ? source[matchingKey] : [];
}

function marketRevenueReconciles(left, right) {
  const difference = Math.abs(left - right);
  const scale = Math.max(Math.abs(left), Math.abs(right), 1);
  return difference <= Math.max(RECONCILIATION_ABSOLUTE_TOLERANCE_USD, scale * RECONCILIATION_RELATIVE_TOLERANCE);
}

function marketRevenueSum(rows, key) {
  return rows.reduce((sum, row) => sum + (marketRevenueFinite(row?.[key]) ? Number(row[key]) : 0), 0);
}

function marketRevenueOptionalNumber(value) {
  if (value === null || value === undefined || value === "") return null;
  const result = Number(value);
  return Number.isFinite(result) ? result : null;
}

function marketRevenueNumber(value) {
  return marketRevenueOptionalNumber(value) ?? 0;
}

function marketRevenueFinite(value) {
  return marketRevenueOptionalNumber(value) !== null;
}

function marketRevenueClamp(value, minimum, maximum) {
  return Math.max(minimum, Math.min(maximum, value));
}

function marketRevenueRounded(value) {
  return Math.round(value * 1e12) / 1e12;
}

export function buildMarketYtdRevenueContributions(byMarket = {}, protocolYtdCollectedRevenueInUsd = null) {
  const markets = Object.values(byMarket || {});
  const rawRows = markets.map((entry) => {
    const summary = entry?.summary || {};
    const directOrigination = marketRevenueNumber(summary.ytdDirectOriginationRevenueInUsd);
    const attributedInterest = marketRevenueNumber(summary.ytdAttributedCollectedInterestRevenueInUsd);
    const totalRevenue = marketRevenueOptionalNumber(summary.ytdAttributedCollectedMarketRevenueInUsd)
      ?? (directOrigination + attributedInterest);
    return {
      marketId: String(entry?.marketId || ""),
      marketDisplayName: String(entry?.marketDisplayName || entry?.marketId || ""),
      directOriginationRevenueInUsd: directOrigination,
      attributedCollectedInterestRevenueInUsd: attributedInterest,
      totalRevenueInUsd: totalRevenue,
      ytdAttributionComplete: summary.ytdAttributionComplete === true
    };
  });

  const sumMarketTotals = rawRows.reduce((sum, row) => sum + row.totalRevenueInUsd, 0);
  const totalProtocolYtd = marketRevenueOptionalNumber(protocolYtdCollectedRevenueInUsd) ?? sumMarketTotals;

  const sorted = rawRows
    .map((row) => ({
      ...row,
      revenueShare: totalProtocolYtd > 0 ? row.totalRevenueInUsd / totalProtocolYtd : 0
    }))
    .sort((a, b) => b.totalRevenueInUsd - a.totalRevenueInUsd || a.marketDisplayName.localeCompare(b.marketDisplayName));

  const top = sorted.find((r) => r.totalRevenueInUsd > 0) || null;

  return {
    contributions: sorted,
    topMarket: top ? {
      marketId: top.marketId,
      marketDisplayName: top.marketDisplayName,
      totalRevenueInUsd: top.totalRevenueInUsd,
      attributedCollectedInterestRevenueInUsd: top.attributedCollectedInterestRevenueInUsd,
      directOriginationRevenueInUsd: top.directOriginationRevenueInUsd,
      revenueShare: top.revenueShare
    } : null
  };
}

function protocolYtdCollectedRevenue(protocolRows, generatedDate) {
  const source = [...(Array.isArray(protocolRows) ? protocolRows : [])]
    .filter((row) => row?.date && row.isComplete !== false && !row.fetchError)
    .filter((row) => !generatedDate || String(row.date) < generatedDate)
    .sort((left, right) => String(left.date).localeCompare(String(right.date)));
  const latestDate = source.at(-1)?.date ?? null;
  if (!latestDate) return null;
  const ytdStart = `${String(latestDate).slice(0, 4)}-01-01`;
  const ytdRows = source.filter((row) => row.date >= ytdStart && row.date <= latestDate);
  if (!ytdRows.length) return null;
  return ytdRows.reduce((sum, row) => (
    sum
    + marketRevenueNumber(row.revenueFromRepaidInterestInUsd)
    + marketRevenueNumber(row.loanOriginationFeesInUsd)
    + marketRevenueNumber(row.loanOriginationFeesMinAdaInUsd)
  ), 0);
}
