import { computeLoanAggregateReconciliation, classifyReconciliationState } from "../shared/metrics.js";
import { isPolLoan } from "./currentExposureAnalysis.js";

export const LOAN_HEALTH_BUCKETS = Object.freeze([
  ["hf_le_100", "HF <= 1.00", -Infinity, 1.00, "#991b1b"],
  ["hf_100_110", "HF 1.00-1.10", 1.00, 1.10, "#c2410c"],
  ["hf_110_125", "HF 1.10-1.25", 1.10, 1.25, "#f97316"],
  ["hf_125_150", "HF 1.25-1.50", 1.25, 1.50, "#facc15"],
  ["hf_150_200", "HF 1.50-2.00", 1.50, 2.00, "#34d399"],
  ["hf_gt_200", "HF > 2.00", 2.00, Infinity, "#a7f3d0"]
]);

export function buildLoanSnapshotHistory(input = {}) {
  const timestamp = normalizeSnapshotTimestamp(input.timestamp);
  const allLoans = Array.isArray(input.allLoans) ? input.allLoans : [];
  const activeLoans = (Array.isArray(input.activeLoans) ? input.activeLoans : [])
    .filter((loan) => snapshotNumber(loan?.debtInUsd ?? loan?.amount) > 0);
  const markets = Array.isArray(input.markets) ? input.markets : [];
  const marketIds = snapshotMarketIds(input.marketIds, allLoans, activeLoans, markets);
  const scopes = [
    { scope: "protocol", marketId: "", activeLoans },
    ...marketIds.map((marketId) => ({
      scope: "market",
      marketId,
      activeLoans: activeLoans.filter((loan) => snapshotMarketId(loan?.marketId) === marketId)
    }))
  ];

  const totalProtocolBorrowInUsd = activeLoans.reduce((sum, loan) => sum + snapshotNumber(loan?.debtInUsd ?? loan?.amount), 0);
  return {
    participation: scopes.map(({ scope, marketId, activeLoans: scopedLoans }) => ({
      timestamp,
      scope,
      marketId,
      activeDebtLoanCount: scopedLoans.length,
      distinctActiveDebtObservedKeyCount: distinctObservedKeyCount(scopedLoans)
    })),
    health: scopes.map(({ scope, marketId, activeLoans: scopedLoans }) => healthObservationRow(timestamp, scope, marketId, scopedLoans)),
    pol: scopes.map(({ scope, marketId, activeLoans: scopedLoans }) => polObservationRow(timestamp, scope, marketId, scopedLoans, markets, totalProtocolBorrowInUsd)),
    reconciliation: scopes.map(({ scope, marketId, activeLoans: scopedLoans }) => {
      const marketObj = markets.find((m) => String(m?.id ?? m?.marketId) === marketId) || { id: marketId };
      if (scope === "protocol") {
        const marketReconciliations = marketIds.map((mId) => {
          const mObj = markets.find((m) => String(m?.id ?? m?.marketId) === mId) || { id: mId };
          const mLoans = activeLoans.filter((loan) => snapshotMarketId(loan?.marketId) === mId);
          return computeLoanAggregateReconciliation({ market: mObj, loans: mLoans, valuesInUsd: true });
        });
        const marketBorrowNative = marketReconciliations.reduce((acc, r) => acc + r.marketBorrowNative, 0);
        const loanDebtNative = marketReconciliations.reduce((acc, r) => acc + r.loanDebtNative, 0);
        const loanAdjustedDebtNative = marketReconciliations.reduce((acc, r) => acc + r.loanAdjustedDebtNative, 0);
        const minInterestFloorNative = loanAdjustedDebtNative - loanDebtNative;
        const marketBorrowInUsd = marketReconciliations.reduce((acc, r) => acc + r.marketBorrowInUsd, 0);
        const loanDebtInUsd = marketReconciliations.reduce((acc, r) => acc + r.loanDebtInUsd, 0);
        const loanAdjustedDebtInUsd = marketReconciliations.reduce((acc, r) => acc + r.loanAdjustedDebtInUsd, 0);
        const minInterestFloorInUsd = loanAdjustedDebtInUsd - loanDebtInUsd;
        const adjustedDifferenceInUsd = loanAdjustedDebtInUsd - marketBorrowInUsd;
        const adjustedCoveragePercent = marketBorrowInUsd > 0 ? (loanAdjustedDebtInUsd / marketBorrowInUsd) * 100 : null;
        return {
          timestamp,
          scope: "protocol",
          marketId: "",
          marketBorrowNative,
          loanDebtNative,
          loanAdjustedDebtNative,
          minInterestFloorNative,
          marketBorrowInUsd,
          loanDebtInUsd,
          loanAdjustedDebtInUsd,
          minInterestFloorInUsd,
          adjustedDifferenceInUsd,
          adjustedCoveragePercent: snapshotFiniteNumber(adjustedCoveragePercent),
          classification: classifyReconciliationState(adjustedDifferenceInUsd)
        };
      }
      const r = computeLoanAggregateReconciliation({ market: marketObj, loans: scopedLoans, valuesInUsd: true });
      return {
        timestamp,
        scope: "market",
        marketId,
        marketBorrowNative: r.marketBorrowNative,
        loanDebtNative: r.loanDebtNative,
        loanAdjustedDebtNative: r.loanAdjustedDebtNative,
        minInterestFloorNative: r.minInterestFloorNative,
        marketBorrowInUsd: r.marketBorrowInUsd,
        loanDebtInUsd: r.loanDebtInUsd,
        loanAdjustedDebtInUsd: r.loanAdjustedDebtInUsd,
        minInterestFloorInUsd: r.minInterestFloorInUsd,
        adjustedDifferenceInUsd: r.adjustedDifferenceInUsd,
        adjustedCoveragePercent: snapshotFiniteNumber(r.adjustedCoveragePercent),
        classification: r.classification
      };
    })
  };
}

export function appendLoanSnapshotHistory(existing = {}, observation = {}) {
  return {
    participation: appendObservationRows(existing.participation, observation.participation),
    health: appendObservationRows(existing.health, observation.health),
    pol: appendObservationRows(existing.pol, observation.pol),
    reconciliation: appendObservationRows(existing.reconciliation, observation.reconciliation)
  };
}

function polObservationRow(timestamp, scope, marketId, loans, markets = [], totalProtocolBorrow = 0) {
  const polLoans = loans.filter((loan) => isPolLoan(loan));
  const marketMap = new Map((markets || []).map((m) => [m.id || m.marketId, m]));

  if (scope === "protocol") {
    let totalDebtInUsd = 0;
    let totalCollateralInUsd = 0;
    let totalCollateralTokens = 0;
    let totalAnnualInterestCostInUsd = 0;

    let djedDebtInUsd = 0;
    let usdmDebtInUsd = 0;
    let usdcDebtInUsd = 0;
    let iusdDebtInUsd = 0;

    for (const loan of polLoans) {
      const debt = snapshotNumber(loan?.adjustedAmount ?? loan?.debtInUsd ?? loan?.amount);
      const collateral = snapshotNumber(loan?.collateralInUsd ?? loan?.collateral);
      let collaterals = loan.collaterals;
      if (typeof collaterals === "string") {
        try { collaterals = JSON.parse(collaterals); } catch { collaterals = []; }
      }
      const polCol = Array.isArray(collaterals) ? collaterals.find((c) => {
        const q = String(c?.qTokenName || c?.displayName || "").toUpperCase();
        const m = String(c?.market?.id || c?.marketId || "").toUpperCase();
        return q === "QPOL" || m === "POL";
      }) : null;
      const colTokens = polCol ? snapshotNumber(polCol.qTokenAmount) : 0;
      const market = marketMap.get(loan.marketId) || {};
      const apy = snapshotNumber(loan?.APY ?? market?.borrowAPY ?? market?.borrowAPR);
      const annualInterest = debt * apy;

      totalDebtInUsd += debt;
      totalCollateralInUsd += collateral;
      totalCollateralTokens += colTokens;
      totalAnnualInterestCostInUsd += annualInterest;

      const mUpper = String(loan.marketId || "").toUpperCase();
      if (mUpper === "DJED") djedDebtInUsd += debt;
      else if (mUpper === "USDM") usdmDebtInUsd += debt;
      else if (mUpper === "USDC" || mUpper === "WANUSDC") usdcDebtInUsd += debt;
      else if (mUpper === "IUSD") iusdDebtInUsd += debt;
    }

    const protocolBorrowShare = totalProtocolBorrow > 0 ? totalDebtInUsd / totalProtocolBorrow : 0;
    const weightedAverageApy = totalDebtInUsd > 0 ? totalAnnualInterestCostInUsd / totalDebtInUsd : 0;

    return {
      timestamp,
      scope: "protocol",
      marketId: "",
      debtInUsd: 0,
      collateralInUsd: 0,
      collateralTokens: 0,
      borrowApy: 0,
      annualInterestCostInUsd: 0,
      nominalLtv: 0,
      healthFactor: null,
      marketBorrowShare: 0,
      loanCount: polLoans.length,
      totalDebtInUsd,
      totalCollateralInUsd,
      totalCollateralTokens,
      totalAnnualInterestCostInUsd,
      weightedAverageApy,
      protocolBorrowShare,
      djedDebtInUsd,
      usdmDebtInUsd,
      usdcDebtInUsd,
      iusdDebtInUsd
    };
  }

  const loan = polLoans.find((l) => snapshotMarketId(l?.marketId) === marketId);
  if (!loan) {
    return {
      timestamp,
      scope: "market",
      marketId,
      debtInUsd: 0,
      collateralInUsd: 0,
      collateralTokens: 0,
      borrowApy: 0,
      annualInterestCostInUsd: 0,
      nominalLtv: 0,
      healthFactor: null,
      marketBorrowShare: 0,
      loanCount: 0,
      totalDebtInUsd: 0,
      totalCollateralInUsd: 0,
      totalCollateralTokens: 0,
      totalAnnualInterestCostInUsd: 0,
      weightedAverageApy: 0,
      protocolBorrowShare: 0,
      djedDebtInUsd: 0,
      usdmDebtInUsd: 0,
      usdcDebtInUsd: 0,
      iusdDebtInUsd: 0
    };
  }

  const market = marketMap.get(marketId) || {};
  const debtInUsd = snapshotNumber(loan?.adjustedAmount ?? loan?.debtInUsd ?? loan?.amount);
  const collateralInUsd = snapshotNumber(loan?.collateralInUsd ?? loan?.collateral);
  let collaterals = loan.collaterals;
  if (typeof collaterals === "string") {
    try { collaterals = JSON.parse(collaterals); } catch { collaterals = []; }
  }
  const polCol = Array.isArray(collaterals) ? collaterals.find((c) => {
    const q = String(c?.qTokenName || c?.displayName || "").toUpperCase();
    const m = String(c?.market?.id || c?.marketId || "").toUpperCase();
    return q === "QPOL" || m === "POL";
  }) : null;
  const collateralTokens = polCol ? snapshotNumber(polCol.qTokenAmount) : 0;
  const borrowApy = snapshotNumber(loan?.APY ?? market?.borrowAPY ?? market?.borrowAPR);
  const healthFactor = snapshotFiniteNumber(loan?.healthFactor);
  const nominalLtv = collateralInUsd > 0 ? debtInUsd / collateralInUsd : 0;
  const annualInterestCostInUsd = debtInUsd * borrowApy;
  const marketTotalBorrowInUsd = snapshotNumber(market?.borrow ?? market?.borrowInUsd ?? debtInUsd);
  const marketBorrowShare = marketTotalBorrowInUsd > 0 ? Math.min(1, debtInUsd / marketTotalBorrowInUsd) : 1;

  return {
    timestamp,
    scope: "market",
    marketId,
    debtInUsd,
    collateralInUsd,
    collateralTokens,
    borrowApy,
    annualInterestCostInUsd,
    nominalLtv,
    healthFactor,
    marketBorrowShare,
    loanCount: 1,
    totalDebtInUsd: 0,
    totalCollateralInUsd: 0,
    totalCollateralTokens: 0,
    totalAnnualInterestCostInUsd: 0,
    weightedAverageApy: 0,
    protocolBorrowShare: 0,
    djedDebtInUsd: 0,
    usdmDebtInUsd: 0,
    usdcDebtInUsd: 0,
    iusdDebtInUsd: 0
  };
}


function healthObservationRow(timestamp, scope, marketId, loans) {
  const organicLoans = loans.filter((loan) => !isPolLoan(loan));
  const polLoans = loans.filter((loan) => isPolLoan(loan));

  const row = {
    timestamp,
    scope,
    marketId,
    activeDebtLoanCount: organicLoans.length,
    activeDebtInUsd: organicLoans.reduce((sum, loan) => sum + snapshotNumber(loan?.debtInUsd ?? loan?.amount), 0),
    polLoanCount: polLoans.length,
    polDebtInUsd: polLoans.reduce((sum, loan) => sum + snapshotNumber(loan?.debtInUsd ?? loan?.amount), 0)
  };
  for (const [bucket, , lower, upper] of LOAN_HEALTH_BUCKETS) {
    const matching = organicLoans.filter((loan) => healthFactorInBucket(snapshotFiniteNumber(loan?.healthFactor), lower, upper));
    row[`${bucket}LoanCount`] = matching.length;
    row[`${bucket}DebtInUsd`] = matching.reduce((sum, loan) => sum + snapshotNumber(loan?.debtInUsd ?? loan?.amount), 0);
  }
  const badDebtLoans = organicLoans.filter((loan) => isBadDebtLoan(loan));
  row.badDebtLoanCount = badDebtLoans.length;
  row.badDebtInUsd = badDebtLoans.reduce((sum, loan) => sum + snapshotNumber(loan?.debtInUsd ?? loan?.amount), 0);
  row.badDebtShortfallInUsd = badDebtLoans.reduce((sum, loan) => {
    const debt = snapshotNumber(loan?.debtInUsd ?? loan?.amount);
    const collateral = snapshotNumber(loan?.collateralInUsd ?? loan?.collateral);
    return sum + Math.max(0, debt - collateral);
  }, 0);
  return row;
}

function isBadDebtLoan(loan) {
  if (isPolLoan(loan)) {
    return false;
  }
  const debt = snapshotNumber(loan?.debtInUsd ?? loan?.amount);
  const collateral = snapshotNumber(loan?.collateralInUsd ?? loan?.collateral);
  const hf = snapshotFiniteNumber(loan?.healthFactor);
  if (debt > 0 && debt > collateral && (loan?.collateralInUsd !== undefined || loan?.collateral !== undefined)) {
    return true;
  }
  if (hf !== null && hf <= 1.00) {
    return true;
  }
  return false;
}

function appendObservationRows(existingRows, newRows) {
  const byIdentity = new Map();
  for (const row of [...(Array.isArray(existingRows) ? existingRows : []), ...(Array.isArray(newRows) ? newRows : [])]) {
    const timestamp = normalizeSnapshotTimestamp(row?.timestamp);
    const scope = row?.scope === "protocol" ? "protocol" : "market";
    const marketId = scope === "protocol" ? "" : snapshotMarketId(row?.marketId);
    const cleaned = { ...row, timestamp, scope, marketId };
    if ("classification" in cleaned) {
      cleaned.marketBorrowNative = snapshotNumber(cleaned.marketBorrowNative);
      cleaned.loanDebtNative = snapshotNumber(cleaned.loanDebtNative);
      cleaned.loanAdjustedDebtNative = snapshotNumber(cleaned.loanAdjustedDebtNative);
      cleaned.minInterestFloorNative = snapshotNumber(cleaned.minInterestFloorNative);
      cleaned.marketBorrowInUsd = snapshotNumber(cleaned.marketBorrowInUsd);
      cleaned.loanDebtInUsd = snapshotNumber(cleaned.loanDebtInUsd);
      cleaned.loanAdjustedDebtInUsd = snapshotNumber(cleaned.loanAdjustedDebtInUsd);
      cleaned.minInterestFloorInUsd = snapshotNumber(cleaned.minInterestFloorInUsd);
      cleaned.adjustedDifferenceInUsd = snapshotNumber(cleaned.adjustedDifferenceInUsd);
      cleaned.adjustedCoveragePercent = snapshotFiniteNumber(cleaned.adjustedCoveragePercent);
    }
    byIdentity.set(`${timestamp}\u0000${scope}\u0000${marketId}`, cleaned);
  }
  return [...byIdentity.values()].sort((left, right) =>
    left.timestamp.localeCompare(right.timestamp)
      || left.scope.localeCompare(right.scope)
      || left.marketId.localeCompare(right.marketId)
  );
}

function snapshotMarketIds(inputIds, ...loanGroups) {
  const ids = new Set();
  for (const value of Array.isArray(inputIds) ? inputIds : []) {
    const marketId = snapshotMarketId(value);
    if (marketId) ids.add(marketId);
  }
  for (const loan of loanGroups.flat()) {
    const marketId = snapshotMarketId(loan?.marketId);
    if (marketId) ids.add(marketId);
  }
  return [...ids].sort((left, right) => left.localeCompare(right));
}

function distinctObservedKeyCount(loans) {
  return new Set(loans.map((loan) => String(loan?.publicKey ?? "").trim()).filter(Boolean)).size;
}

function healthFactorInBucket(value, lower, upper) {
  if (!Number.isFinite(value)) return false;
  if (lower === -Infinity) return value <= upper;
  if (upper === Infinity) return value > lower;
  return value > lower && value <= upper;
}

function normalizeSnapshotTimestamp(value) {
  const timestamp = value instanceof Date ? value.toISOString() : String(value ?? "").trim();
  if (!timestamp || !Number.isFinite(Date.parse(timestamp))) throw new TypeError("A valid loan snapshot timestamp is required.");
  return new Date(timestamp).toISOString();
}

function snapshotMarketId(value) {
  return String(value ?? "").trim();
}

function snapshotFiniteNumber(value) {
  if (value === "" || value === null || value === undefined) return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function snapshotNumber(value) {
  return snapshotFiniteNumber(value) ?? 0;
}
