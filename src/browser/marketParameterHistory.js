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
  const row = normalizeMarketParameterRows([parameters])[0];
  if (!row) return emptyRateCurve();

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

  const utilizationPoints = new Set([0, utilizationCap]);
  for (let utilization = 0; utilization <= utilizationCap + 1e-10; utilization += 0.01) {
    utilizationPoints.add(roundParameter(Math.min(utilization, utilizationCap)));
  }
  if (kink <= utilizationCap) utilizationPoints.add(roundParameter(kink));
  if (currentUtilization != null && currentUtilization >= 0 && currentUtilization <= utilizationCap) {
    utilizationPoints.add(roundParameter(currentUtilization));
  }

  const rows = [];
  for (const utilization of [...utilizationPoints].sort((left, right) => left - right)) {
    const borrowerRate = parameterBorrowRate({
      utilization,
      utilizationCap,
      kink,
      baseBorrowerAPR,
      optimalBorrowerAPR,
      maxBorrowerAPR
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
      rateCurve: buildRateCurve(currentRow, { currentUtilization })
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

function parameterBorrowRate(input) {
  const {
    utilization,
    utilizationCap,
    kink,
    baseBorrowerAPR,
    optimalBorrowerAPR,
    maxBorrowerAPR
  } = input;
  if (utilizationCap <= 0) return baseBorrowerAPR;
  if (utilizationCap <= kink || kink <= 0) {
    return interpolateParameter(baseBorrowerAPR, maxBorrowerAPR, utilization / utilizationCap);
  }
  if (utilization <= kink) {
    return interpolateParameter(baseBorrowerAPR, optimalBorrowerAPR, utilization / kink);
  }
  return interpolateParameter(
    optimalBorrowerAPR,
    maxBorrowerAPR,
    (utilization - kink) / (utilizationCap - kink)
  );
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
