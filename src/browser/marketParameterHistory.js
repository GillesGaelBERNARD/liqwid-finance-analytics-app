const MARKET_PARAMETER_NUMBER_FIELDS = Object.freeze([
  "baseRate",
  "utilMultiplier",
  "utilMultiplierJump",
  "kink",
  "supplyCap",
  "borrowCap",
  "incomeRatioSum",
  "incomeRatioSuppliers",
  "incomeRatioDividends",
  "incomeRatioTreasury",
  "baseBorrowerAPR",
  "baseSupplierAPY",
  "optimalBorrowerAPR",
  "optimalSupplierAPY",
  "maxBorrowerAPR",
  "maxSupplierAPY"
]);

const NULLABLE_MARKET_PARAMETER_FIELDS = new Set(["supplyCap", "borrowCap"]);

export function normalizeMarketParameterRows(rows) {
  const byTimestamp = new Map();
  for (const source of Array.isArray(rows) ? rows : []) {
    const timestamp = normalizeParameterTimestamp(source?.timestamp);
    if (!timestamp) continue;
    const row = { ...source, timestamp, txHash: String(source?.txHash || "") };
    for (const field of MARKET_PARAMETER_NUMBER_FIELDS) {
      row[field] = parameterNumber(source?.[field], NULLABLE_MARKET_PARAMETER_FIELDS.has(field));
    }
    byTimestamp.set(timestamp, row);
  }
  return [...byTimestamp.values()].sort((left, right) =>
    Date.parse(left.timestamp) - Date.parse(right.timestamp)
      || left.timestamp.localeCompare(right.timestamp)
  );
}

export function buildParameterStepSeries(rows) {
  const events = normalizeMarketParameterRows(rows);
  if (!events.length) return [];
  const result = [{ ...events[0], syntheticStepBoundary: false }];
  for (let index = 1; index < events.length; index += 1) {
    const previous = events[index - 1];
    const current = events[index];
    result.push({
      ...previous,
      timestamp: new Date(Date.parse(current.timestamp) - 1).toISOString(),
      txHash: "",
      syntheticStepBoundary: true
    });
    result.push({ ...current, syntheticStepBoundary: false });
  }
  return result;
}

export function buildRateCurve(parameters, options = {}) {
  if (!parameters) return emptyRateCurve();
  const row = normalizeMarketParameterRows(Array.isArray(parameters) ? parameters : [parameters]).at(-1);
  if (!row) return emptyRateCurve();

  const events = Array.isArray(options.events) && options.events.length > 0
    ? normalizeMarketParameterRows(options.events)
    : (Array.isArray(parameters) ? normalizeMarketParameterRows(parameters) : [row]);

  const baseBorrowerAPR = finiteParameterNumber(row.baseBorrowerAPR);
  const optimalBorrowerAPR = finiteParameterNumber(row.optimalBorrowerAPR);
  const maxBorrowerAPR = finiteParameterNumber(row.maxBorrowerAPR);
  const baseSupplierAPY = finiteParameterNumber(row.baseSupplierAPY) ?? 0;
  const kink = clampParameter(row.kink, 0, 1);
  const utilizationCap = row.borrowCap == null ? 1 : clampParameter(row.borrowCap, 0, 1);
  const currentUtilization = finiteParameterNumber(options.currentUtilization);
  const incomeAllocation = parameterIncomeAllocation(row);
  const supplierSplit = incomeAllocation.suppliers ?? 0;

  if (baseBorrowerAPR == null || optimalBorrowerAPR == null || maxBorrowerAPR == null || kink == null || utilizationCap == null) {
    return {
      ...emptyRateCurve(),
      kink,
      utilizationCap,
      currentUtilization
    };
  }

  const jumpSlope = resolveBorrowJumpSlope(row, events);

  const utilizationPoints = new Set([0, 1]);
  for (let utilization = 0; utilization <= 1.0 + 1e-10; utilization += 0.01) {
    utilizationPoints.add(roundParameter(Math.min(utilization, 1)));
  }
  if (kink != null && kink >= 0 && kink <= 1) utilizationPoints.add(roundParameter(kink));
  if (utilizationCap != null && utilizationCap >= 0 && utilizationCap <= 1) {
    utilizationPoints.add(roundParameter(utilizationCap));
  }
  if (currentUtilization != null && currentUtilization >= 0 && currentUtilization <= 1) {
    utilizationPoints.add(roundParameter(currentUtilization));
  }

  const rows = [];
  for (const utilization of [...utilizationPoints].sort((left, right) => left - right)) {
    const borrowerRate = parameterBorrowRate({
      utilization,
      kink,
      baseBorrowerAPR,
      optimalBorrowerAPR,
      jumpSlope
    });
    const supplierRate = (1 - utilization) * baseSupplierAPY
      + utilization * borrowerRate * supplierSplit;
    rows.push({
      curve: "borrower",
      curveLabel: "Borrow APR",
      utilization,
      rate: roundParameter(borrowerRate),
      pointLabel: `${roundParameter(utilization * 100)}% utilization`
    });
    rows.push({
      curve: "supplier",
      curveLabel: "Supply APY",
      utilization,
      rate: roundParameter(supplierRate),
      pointLabel: `${roundParameter(utilization * 100)}% utilization`
    });
  }

  return {
    rows,
    kink,
    utilizationCap,
    currentUtilization,
    supplierSplit,
    baseSupplierAPY
  };
}

export function buildMarketParametersAnalysis(input = {}) {
  const markets = Array.isArray(input.markets) ? input.markets : [];
  const parameterRowsById = input.marketParamsById || {};
  const marketSeriesById = input.marketSeriesById || {};
  const byMarket = {};

  for (const market of markets) {
    const marketId = String(market?.id || "");
    if (!marketId) continue;
    const events = normalizeMarketParameterRows(rowsForMarket(parameterRowsById, marketId));
    const currentRow = events.at(-1) || null;
    const marketRows = rowsForMarket(marketSeriesById, marketId);
    const currentMarketRow = marketRows.at(-1) || null;
    const currentUtilization = finiteParameterNumber(
      currentMarketRow?.utilizationPercentage
        ?? currentMarketRow?.utilization
        ?? market?.utilization
    );

    byMarket[marketId] = {
      marketId,
      marketDisplayName: market?.displayName || market?.symbol || marketId,
      current: currentRow ? currentParameterGroups(currentRow) : null,
      events,
      history: buildParameterStepSeries(events),
      rateCurve: buildRateCurve(currentRow, { currentUtilization, events })
    };
  }

  return { byMarket };
}

function currentParameterGroups(row) {
  return {
    effectiveAt: row.timestamp,
    txHash: row.txHash,
    rateLandmarks: {
      baseBorrowerAPR: row.baseBorrowerAPR,
      optimalBorrowerAPR: row.optimalBorrowerAPR,
      maxBorrowerAPR: row.maxBorrowerAPR,
      baseSupplierAPY: row.baseSupplierAPY,
      optimalSupplierAPY: row.optimalSupplierAPY,
      maxSupplierAPY: row.maxSupplierAPY,
      kink: row.kink
    },
    capacity: {
      supplyCap: row.supplyCap,
      utilizationCap: row.borrowCap
    },
    incomeAllocation: parameterIncomeAllocation(row),
    modelCoefficients: {
      baseRate: row.baseRate,
      utilMultiplier: row.utilMultiplier,
      utilMultiplierJump: row.utilMultiplierJump
    }
  };
}

function parameterIncomeAllocation(row) {
  const sum = finiteParameterNumber(row?.incomeRatioSum);
  if (sum == null || sum === 0) {
    return { suppliers: null, dividends: null, treasury: null, reserve: null };
  }
  const suppliers = (finiteParameterNumber(row?.incomeRatioSuppliers) ?? 0) / sum;
  const dividends = (finiteParameterNumber(row?.incomeRatioDividends) ?? 0) / sum;
  const treasury = (finiteParameterNumber(row?.incomeRatioTreasury) ?? 0) / sum;
  return {
    suppliers: roundParameter(suppliers),
    dividends: roundParameter(dividends),
    treasury: roundParameter(treasury),
    reserve: roundParameter(1 - suppliers - dividends - treasury)
  };
}

function resolveBorrowJumpSlope(row, events) {
  const kink = clampParameter(row?.kink, 0, 1);
  const baseBorrowerAPR = finiteParameterNumber(row?.baseBorrowerAPR);
  const optimalBorrowerAPR = finiteParameterNumber(row?.optimalBorrowerAPR);
  const maxBorrowerAPR = finiteParameterNumber(row?.maxBorrowerAPR);
  const borrowCap = row?.borrowCap == null ? null : finiteParameterNumber(row?.borrowCap);
  const utilMultiplier = finiteParameterNumber(row?.utilMultiplier);
  const utilMultiplierJump = finiteParameterNumber(row?.utilMultiplierJump);

  if (kink == null || optimalBorrowerAPR == null) return 0;
  if (kink >= 1) return 0;

  // Case 1: borrowCap is null or >= 1.0 -> maxBorrowerAPR was evaluated at 1.0
  if (borrowCap == null || borrowCap >= 1.0) {
    if (maxBorrowerAPR != null && maxBorrowerAPR >= optimalBorrowerAPR) {
      return (maxBorrowerAPR - optimalBorrowerAPR) / (1.0 - kink);
    }
  }

  // Case 2: borrowCap > kink -> maxBorrowerAPR was evaluated at borrowCap
  if (borrowCap != null && borrowCap > kink) {
    if (maxBorrowerAPR != null && maxBorrowerAPR >= optimalBorrowerAPR) {
      return (maxBorrowerAPR - optimalBorrowerAPR) / (borrowCap - kink);
    }
  }

  // Case 3: borrowCap <= kink -> maxBorrowerAPR is at or before kink, so jump rate isn't directly in this row
  // 3a. Search historical events for matching kink & utilMultiplierJump where cap was null or cap > kink
  if (Array.isArray(events) && events.length > 0) {
    for (let i = events.length - 1; i >= 0; i--) {
      const e = events[i];
      const eKink = clampParameter(e?.kink, 0, 1);
      const eCap = e?.borrowCap == null ? null : finiteParameterNumber(e?.borrowCap);
      const eJump = finiteParameterNumber(e?.utilMultiplierJump);
      const eOpt = finiteParameterNumber(e?.optimalBorrowerAPR);
      const eMax = finiteParameterNumber(e?.maxBorrowerAPR);
      if (eKink === kink && eJump === utilMultiplierJump && eMax != null && eOpt != null && eMax >= eOpt) {
        if (eCap == null || eCap >= 1.0) {
          return (eMax - eOpt) / (1.0 - kink);
        } else if (eCap > kink) {
          return (eMax - eOpt) / (eCap - kink);
        }
      }
    }
  }

  // 3b. Use model coefficients multiplier ratio:
  if (kink > 0 && baseBorrowerAPR != null && utilMultiplier != null && utilMultiplier > 0 && utilMultiplierJump != null && utilMultiplierJump > 0) {
    const slope1 = (optimalBorrowerAPR - baseBorrowerAPR) / kink;
    return slope1 * (utilMultiplierJump / utilMultiplier);
  }

  return 0;
}

function parameterBorrowRate(input) {
  const {
    utilization,
    kink,
    baseBorrowerAPR,
    optimalBorrowerAPR,
    jumpSlope
  } = input;
  if (baseBorrowerAPR == null) return 0;
  const opt = optimalBorrowerAPR ?? baseBorrowerAPR;
  if (kink == null || kink <= 0) return opt;
  if (utilization <= kink) {
    return interpolateParameter(baseBorrowerAPR, opt, utilization / kink);
  }
  return opt + (utilization - kink) * (jumpSlope ?? 0);
}

function interpolateParameter(start, end, progress) {
  return start + (end - start) * Math.max(0, Math.min(1, progress));
}

function rowsForMarket(source, marketId) {
  const direct = source?.[marketId];
  if (Array.isArray(direct)) return direct;
  const matchingKey = Object.keys(source || {}).find((key) =>
    String(key).toUpperCase() === String(marketId).toUpperCase()
  );
  return matchingKey && Array.isArray(source[matchingKey]) ? source[matchingKey] : [];
}

function normalizeParameterTimestamp(value) {
  const timestamp = String(value || "").trim();
  const milliseconds = Date.parse(timestamp);
  return Number.isFinite(milliseconds) ? new Date(milliseconds).toISOString() : null;
}

function parameterNumber(value, nullable = false) {
  if (value === null || value === undefined || value === "") return nullable ? null : 0;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : (nullable ? null : 0);
}

function finiteParameterNumber(value) {
  if (value === null || value === undefined || value === "") return null;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function clampParameter(value, min, max) {
  const numeric = finiteParameterNumber(value);
  return numeric == null ? null : Math.max(min, Math.min(max, numeric));
}

function roundParameter(value) {
  return Math.round(value * 1e10) / 1e10;
}

function emptyRateCurve() {
  return {
    rows: [],
    kink: null,
    utilizationCap: null,
    currentUtilization: null,
    supplierSplit: null,
    baseSupplierAPY: null
  };
}
