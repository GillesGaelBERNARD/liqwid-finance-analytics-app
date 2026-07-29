const PROTOCOL_PARAMETER_CHANGE_FIELDS = Object.freeze([
  "baseBorrowerAPR",
  "baseRate",
  "baseSupplierAPY",
  "borrowCap",
  "incomeRatioDividends",
  "incomeRatioSum",
  "incomeRatioSuppliers",
  "incomeRatioTreasury",
  "kink",
  "maxBorrowerAPR",
  "maxSupplierAPY",
  "optimalBorrowerAPR",
  "optimalSupplierAPY",
  "supplyCap",
  "utilMultiplier",
  "utilMultiplierJump"
]);

const RATE_ATLAS_MARKET_LIMIT = 8;

export function buildProtocolParameterLandscape(input = {}) {
  const markets = (Array.isArray(input.markets) ? input.markets : [])
    .filter((market) => String(market?.id || "").toUpperCase() !== "POL");
  const marketParameters = input.marketParameters?.byMarket || {};
  const marketSeriesById = input.marketSeriesById || {};
  const marketRows = markets
    .map((market) => currentProtocolMarketRow(
      market,
      parameterStateForMarket(marketParameters, market.id),
      rowsForMarket(marketSeriesById, market.id)
    ))
    .sort((left, right) => right.borrowInUsd - left.borrowInUsd || left.marketId.localeCompare(right.marketId));
  const collateralRows = markets
    .flatMap((market) => currentCollateralRows(market))
    .sort((left, right) =>
      left.borrowMarketName.localeCompare(right.borrowMarketName)
        || left.collateralName.localeCompare(right.collateralName)
    );
  const governanceEvents = protocolGovernanceEvents(markets, marketParameters);
  const governanceActivity = protocolGovernanceActivity(governanceEvents);
  const collateralSummaryRows = summarizeCollateralRows(collateralRows);
  const history = buildProtocolParameterHistory(markets, marketParameters, marketSeriesById);
  const rateCurveAtlas = buildRateCurveAtlas(marketRows, marketParameters);

  const totalBorrowInUsd = sumFinite(marketRows.map((row) => row.borrowInUsd));
  const parameterizedRows = marketRows.filter((row) => row.hasHistoricalParameters);
  const parameterizedBorrowInUsd = sumFinite(parameterizedRows.map((row) => row.borrowInUsd));
  const cappedRows = marketRows.filter((row) => row.supplyCapInUsd != null);
  const borrowAboveKinkInUsd = sumFinite(parameterizedRows.map((row) => row.borrowAboveKinkInUsd));

  return {
    current: {
      totalMarketCount: marketRows.length,
      parameterizedMarketCount: parameterizedRows.length,
      totalBorrowInUsd,
      parameterizedBorrowInUsd,
      parameterCoverage: safeDivide(parameterizedBorrowInUsd, totalBorrowInUsd),
      borrowWeightedKink: weightedAverage(parameterizedRows, "kink", "borrowInUsd"),
      borrowWeightedUtilizationCap: weightedAverage(parameterizedRows, "utilizationCap", "borrowInUsd"),
      borrowWeightedSupplierSplit: weightedAverage(parameterizedRows, "supplierSplit", "borrowInUsd"),
      borrowWeightedDividendSplit: weightedAverage(parameterizedRows, "dividendSplit", "borrowInUsd"),
      borrowWeightedTreasurySplit: weightedAverage(parameterizedRows, "treasurySplit", "borrowInUsd"),
      borrowWeightedReserveSplit: weightedAverage(parameterizedRows, "reserveSplit", "borrowInUsd"),
      borrowAboveKinkInUsd,
      borrowAboveKinkShare: safeDivide(borrowAboveKinkInUsd, totalBorrowInUsd),
      cappedMarketCount: cappedRows.length,
      cappedSupplyInUsd: sumFinite(cappedRows.map((row) => row.supplyInUsd)),
      totalSupplyCapInUsd: sumFinite(cappedRows.map((row) => row.supplyCapInUsd)),
      supplyCapHeadroomInUsd: sumFinite(cappedRows.map((row) => row.supplyCapHeadroomInUsd)),
      collateralPairCount: collateralRows.length,
      latestGovernanceEvent: governanceEvents[0] || null
    },
    marketRows,
    collateralRows,
    collateralSummaryRows,
    history,
    governanceEvents,
    governanceActivity,
    rateCurveAtlas,
    availability: {
      historical: "Rate landmarks, utilization and supply caps, income allocation, and raw rate-model coefficients are reconstructed from exact analytics.marketParamsHistory governance events.",
      currentOnly: "Liquidation, collateral, fee, and batching guardrails come from the current liqwid.data.markets.parameters snapshot and are not backfilled historically."
    }
  };
}

function summarizeCollateralRows(rows) {
  const groups = new Map();
  for (const row of Array.isArray(rows) ? rows : []) {
    if (!groups.has(row.borrowMarketId)) groups.set(row.borrowMarketId, []);
    groups.get(row.borrowMarketId).push(row);
  }
  return [...groups.entries()].map(([marketId, marketRows]) => ({
    marketId,
    marketName: marketRows[0]?.borrowMarketName || marketId,
    collateralPairCount: marketRows.length,
    minimumMaxLoanToValue: finiteMinimum(marketRows.map((row) => row.maxLoanToValue)),
    minimumWeightedMaxLoanToValue: finiteMinimum(marketRows.map((row) => row.weightedMaxLoanToValue)),
    minimumLiquidationThreshold: finiteMinimum(marketRows.map((row) => row.liquidationThreshold)),
    minimumWeightedLiquidationThreshold: finiteMinimum(marketRows.map((row) => row.weightedLiquidationThreshold)),
    maximumLiquidationPenalty: finiteMaximum(marketRows.map((row) => row.liquidationPenalty)),
    maximumLiquidationProfitability: finiteMaximum(marketRows.map((row) => row.liquidationProfitability)),
    maximumCollateralWeight: finiteMaximum(marketRows.map((row) => row.collateralWeight))
  })).sort((left, right) =>
    right.collateralPairCount - left.collateralPairCount
      || left.marketName.localeCompare(right.marketName)
  );
}

function currentProtocolMarketRow(market, parameterState, series) {
  const latestSeries = (Array.isArray(series) ? series : []).at(-1) || null;
  const current = parameterState?.current || null;
  const rateLandmarks = current?.rateLandmarks || {};
  const capacity = current?.capacity || {};
  const allocation = current?.incomeAllocation || {};
  const officialParameters = market?.parameters || {};
  const supplyInUsd = finiteNumber(market?.supply) ?? finiteNumber(latestSeries?.supplyInUsd) ?? 0;
  const borrowInUsd = finiteNumber(market?.borrow) ?? finiteNumber(latestSeries?.borrowInUsd) ?? 0;
  const priceInUsd = finiteNumber(market?.asset?.price);
  const supplyCap = finiteNumber(capacity.supplyCap);
  const supplyCapInUsd = supplyCap != null && priceInUsd != null ? supplyCap * priceInUsd : null;
  const utilization = ratioNumber(
    market?.utilization
      ?? latestSeries?.utilizationPercentage
      ?? (supplyInUsd > 0 ? borrowInUsd / supplyInUsd : null)
  );
  const kink = ratioNumber(rateLandmarks.kink);
  const utilizationCap = current
    ? (capacity.utilizationCap == null ? 1 : ratioNumber(capacity.utilizationCap))
    : null;
  const minHealthFactor = finiteNumber(officialParameters.minHealthFactor);

  return {
    marketId: String(market?.id || ""),
    marketName: market?.displayName || market?.symbol || market?.id || "",
    symbol: market?.symbol || market?.id || "",
    borrowInUsd,
    supplyInUsd,
    liquidityInUsd: finiteNumber(market?.liquidity) ?? finiteNumber(latestSeries?.liquidityInUsd) ?? 0,
    currentUtilization: utilization,
    hasHistoricalParameters: Boolean(current),
    effectiveAt: current?.effectiveAt || null,
    kink,
    utilizationCap,
    baseBorrowerAPR: finiteNumber(rateLandmarks.baseBorrowerAPR),
    optimalBorrowerAPR: finiteNumber(rateLandmarks.optimalBorrowerAPR),
    maxBorrowerAPR: finiteNumber(rateLandmarks.maxBorrowerAPR),
    supplierSplit: finiteNumber(allocation.suppliers),
    dividendSplit: finiteNumber(allocation.dividends),
    treasurySplit: finiteNumber(allocation.treasury),
    reserveSplit: finiteNumber(allocation.reserve),
    borrowAboveKinkInUsd: kink == null
      ? null
      : Math.max(0, borrowInUsd - kink * supplyInUsd),
    supplyCap,
    supplyCapInUsd,
    supplyCapHeadroomInUsd: supplyCapInUsd == null
      ? null
      : Math.max(0, supplyCapInUsd - supplyInUsd),
    supplyCapUsage: supplyCapInUsd != null && supplyCapInUsd > 0
      ? supplyInUsd / supplyCapInUsd
      : null,
    minValue: finiteNumber(officialParameters.minValue),
    minHealthFactor,
    minimumHealthBuffer: minHealthFactor == null ? null : Math.max(0, minHealthFactor - 1),
    actionCount: finiteNumber(officialParameters.actionCount),
    maxCollateralCount: finiteNumber(officialParameters.maxCollateralCount),
    maxBatchTime: finiteNumber(officialParameters.maxBatchTime),
    minBatchSize: finiteNumber(officialParameters.minBatchSize),
    minBatchTime: finiteNumber(officialParameters.minBatchTime),
    closeFactor: ratioNumber(officialParameters.closeFactor0),
    loanOriginationFee: ratioNumber(market?.loanOriginationFeePercentage),
    frozen: market?.frozen === true,
    private: market?.private === true,
    delisting: market?.delisting === true,
    prime: market?.prime === true
  };
}

function currentCollateralRows(market) {
  const parameters = Array.isArray(market?.parameters?.collateralParameters)
    ? market.parameters.collateralParameters
    : [];
  return parameters.map((row) => ({
    borrowMarketId: String(market?.id || ""),
    borrowMarketName: market?.displayName || market?.symbol || market?.id || "",
    collateralMarketId: String(row?.collateral?.id || ""),
    collateralName: row?.collateral?.displayName
      || row?.collateral?.symbol
      || row?.collateral?.id
      || "Unknown collateral",
    maxLoanToValue: ratioNumber(row?.maxLoanToValue),
    weightedMaxLoanToValue: ratioNumber(row?.weightedMaxLoanToValue),
    liquidationThreshold: ratioNumber(row?.liquidationThreshold),
    weightedLiquidationThreshold: ratioNumber(row?.weightedLiquidationThreshold),
    liquidationPenalty: ratioNumber(row?.liquidationPenalty),
    liquidationProfitability: ratioNumber(row?.liquidationProfitability),
    collateralWeight: ratioNumber(row?.collateralWeight)
  }));
}

function buildRateCurveAtlas(marketRows, marketParameters) {
  const marketIds = marketRows
    .filter((row) => row.borrowInUsd > 0 && parameterStateForMarket(marketParameters, row.marketId)?.rateCurve?.rows?.length)
    .slice(0, RATE_ATLAS_MARKET_LIMIT)
    .map((row) => row.marketId);
  const byId = new Map(marketRows.map((row) => [row.marketId, row]));
  const rows = marketIds.flatMap((marketId) => {
    const market = byId.get(marketId);
    const curve = parameterStateForMarket(marketParameters, marketId)?.rateCurve?.rows || [];
    return curve
      .filter((row) => row.curve === "borrower")
      .map((row) => ({
        marketId,
        marketLabel: market?.marketName || marketId,
        curve: marketId,
        curveLabel: `${market?.marketName || marketId} borrow APR`,
        utilization: finiteNumber(row.utilization),
        rate: finiteNumber(row.rate),
        pointLabel: row.pointLabel
      }));
  });
  return { marketIds, rows, limit: RATE_ATLAS_MARKET_LIMIT };
}

function buildProtocolParameterHistory(markets, marketParameters, marketSeriesById) {
  const dates = [...new Set(markets.flatMap((market) =>
    rowsForMarket(marketSeriesById, market.id)
      .map((row) => dateKey(row?.date ?? row?.timestamp))
      .filter(Boolean)
  ))].sort();
  const seriesMaps = new Map(markets.map((market) => [
    String(market.id),
    new Map(rowsForMarket(marketSeriesById, market.id)
      .map((row) => [dateKey(row?.date ?? row?.timestamp), row])
      .filter(([date]) => date))
  ]));

  return dates.map((date) => {
    const weightedRows = [];
    let totalBorrowInUsd = 0;
    for (const market of markets) {
      const marketId = String(market.id);
      const dailyRow = seriesMaps.get(marketId)?.get(date);
      if (!dailyRow) continue;
      const borrowInUsd = finiteNumber(dailyRow.borrowInUsd) ?? 0;
      const supplyInUsd = finiteNumber(dailyRow.supplyInUsd) ?? 0;
      totalBorrowInUsd += borrowInUsd;
      const event = effectiveParameterEvent(
        parameterStateForMarket(marketParameters, marketId)?.events || [],
        date
      );
      if (!event) continue;
      const allocation = eventIncomeAllocation(event);
      const kink = ratioNumber(event.kink);
      weightedRows.push({
        borrowInUsd,
        kink,
        utilizationCap: event.borrowCap == null ? 1 : ratioNumber(event.borrowCap),
        baseBorrowerAPR: finiteNumber(event.baseBorrowerAPR),
        optimalBorrowerAPR: finiteNumber(event.optimalBorrowerAPR),
        maxBorrowerAPR: finiteNumber(event.maxBorrowerAPR),
        supplierSplit: allocation.supplierSplit,
        dividendSplit: allocation.dividendSplit,
        treasurySplit: allocation.treasurySplit,
        reserveSplit: allocation.reserveSplit,
        borrowAboveKinkInUsd: kink == null
          ? null
          : Math.max(0, borrowInUsd - kink * supplyInUsd)
      });
    }
    const parameterizedBorrowInUsd = sumFinite(weightedRows.map((row) => row.borrowInUsd));
    return {
      date,
      timestamp: `${date}T23:59:59.999Z`,
      totalBorrowInUsd,
      parameterizedBorrowInUsd,
      parameterCoverage: safeDivide(parameterizedBorrowInUsd, totalBorrowInUsd),
      borrowWeightedKink: weightedAverage(weightedRows, "kink", "borrowInUsd"),
      borrowWeightedUtilizationCap: weightedAverage(weightedRows, "utilizationCap", "borrowInUsd"),
      borrowWeightedBaseBorrowerAPR: weightedAverage(weightedRows, "baseBorrowerAPR", "borrowInUsd"),
      borrowWeightedOptimalBorrowerAPR: weightedAverage(weightedRows, "optimalBorrowerAPR", "borrowInUsd"),
      borrowWeightedMaxBorrowerAPR: weightedAverage(weightedRows, "maxBorrowerAPR", "borrowInUsd"),
      borrowWeightedSupplierSplit: weightedAverage(weightedRows, "supplierSplit", "borrowInUsd"),
      borrowWeightedDividendSplit: weightedAverage(weightedRows, "dividendSplit", "borrowInUsd"),
      borrowWeightedTreasurySplit: weightedAverage(weightedRows, "treasurySplit", "borrowInUsd"),
      borrowWeightedReserveSplit: weightedAverage(weightedRows, "reserveSplit", "borrowInUsd"),
      borrowAboveKinkInUsd: sumFinite(weightedRows.map((row) => row.borrowAboveKinkInUsd)),
      borrowAboveKinkShare: safeDivide(
        sumFinite(weightedRows.map((row) => row.borrowAboveKinkInUsd)),
        totalBorrowInUsd
      )
    };
  });
}

function protocolGovernanceEvents(markets, marketParameters) {
  return markets.flatMap((market) => {
    const events = parameterStateForMarket(marketParameters, market.id)?.events || [];
    return events.map((event, index) => {
      const previous = events[index - 1] || null;
      const changedFields = previous
        ? PROTOCOL_PARAMETER_CHANGE_FIELDS.filter((field) => !sameParameterValue(previous[field], event[field]))
        : [];
      return {
        timestamp: event.timestamp,
        date: dateKey(event.timestamp),
        marketId: String(market.id),
        marketName: market.displayName || market.symbol || market.id,
        txHash: event.txHash || "",
        changedFields,
        changedFieldCount: previous ? changedFields.length : null,
        initialObservableEvent: previous == null
      };
    });
  }).sort((left, right) =>
    Date.parse(right.timestamp) - Date.parse(left.timestamp)
      || left.marketId.localeCompare(right.marketId)
  );
}

function protocolGovernanceActivity(events) {
  const groups = new Map();
  for (const event of Array.isArray(events) ? events : []) {
    if (!event.date) continue;
    if (!groups.has(event.date)) groups.set(event.date, []);
    groups.get(event.date).push(event);
  }
  return [...groups.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([date, dateEvents]) => ({
      date,
      timestamp: `${date}T23:59:59.999Z`,
      updateCount: dateEvents.length,
      changedParameterCount: sumFinite(dateEvents.map((event) => event.changedFieldCount ?? 0)),
      marketCount: new Set(dateEvents.map((event) => event.marketId)).size
    }));
}

function effectiveParameterEvent(events, date) {
  const boundary = Date.parse(`${date}T23:59:59.999Z`);
  let effective = null;
  for (const event of Array.isArray(events) ? events : []) {
    const timestamp = Date.parse(event?.timestamp);
    if (!Number.isFinite(timestamp) || timestamp > boundary) break;
    effective = event;
  }
  return effective;
}

function eventIncomeAllocation(event) {
  const sum = finiteNumber(event?.incomeRatioSum);
  if (sum == null || sum === 0) {
    return {
      supplierSplit: null,
      dividendSplit: null,
      treasurySplit: null,
      reserveSplit: null
    };
  }
  const supplierSplit = (finiteNumber(event.incomeRatioSuppliers) ?? 0) / sum;
  const dividendSplit = (finiteNumber(event.incomeRatioDividends) ?? 0) / sum;
  const treasurySplit = (finiteNumber(event.incomeRatioTreasury) ?? 0) / sum;
  return {
    supplierSplit,
    dividendSplit,
    treasurySplit,
    reserveSplit: 1 - supplierSplit - dividendSplit - treasurySplit
  };
}

function weightedAverage(rows, valueKey, weightKey) {
  let numerator = 0;
  let denominator = 0;
  for (const row of Array.isArray(rows) ? rows : []) {
    const value = finiteNumber(row?.[valueKey]);
    const weight = finiteNumber(row?.[weightKey]);
    if (value == null || weight == null || weight <= 0) continue;
    numerator += value * weight;
    denominator += weight;
  }
  return denominator > 0 ? numerator / denominator : null;
}

function parameterStateForMarket(source, marketId) {
  const direct = source?.[marketId];
  if (direct) return direct;
  const matchingKey = Object.keys(source || {}).find((key) =>
    String(key).toUpperCase() === String(marketId).toUpperCase()
  );
  return matchingKey ? source[matchingKey] : null;
}

function rowsForMarket(source, marketId) {
  const direct = source?.[marketId];
  if (Array.isArray(direct)) return direct;
  const matchingKey = Object.keys(source || {}).find((key) =>
    String(key).toUpperCase() === String(marketId).toUpperCase()
  );
  return matchingKey && Array.isArray(source[matchingKey]) ? source[matchingKey] : [];
}

function ratioNumber(value) {
  const numeric = finiteNumber(value);
  if (numeric == null) return null;
  return Math.abs(numeric) > 1 ? numeric / 100 : numeric;
}

function finiteNumber(value) {
  if (value === null || value === undefined || value === "") return null;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function sumFinite(values) {
  return (Array.isArray(values) ? values : []).reduce((sum, value) => {
    const numeric = finiteNumber(value);
    return numeric == null ? sum : sum + numeric;
  }, 0);
}

function finiteMinimum(values) {
  const numbers = (Array.isArray(values) ? values : [])
    .map(finiteNumber)
    .filter((value) => value != null);
  return numbers.length ? Math.min(...numbers) : null;
}

function finiteMaximum(values) {
  const numbers = (Array.isArray(values) ? values : [])
    .map(finiteNumber)
    .filter((value) => value != null);
  return numbers.length ? Math.max(...numbers) : null;
}

function safeDivide(numerator, denominator) {
  const top = finiteNumber(numerator);
  const bottom = finiteNumber(denominator);
  return top != null && bottom != null && bottom > 0 ? top / bottom : null;
}

function dateKey(value) {
  const timestamp = Date.parse(String(value || ""));
  return Number.isFinite(timestamp) ? new Date(timestamp).toISOString().slice(0, 10) : null;
}

function sameParameterValue(left, right) {
  if ((left === null || left === undefined || left === "")
      && (right === null || right === undefined || right === "")) return true;
  const leftNumber = finiteNumber(left);
  const rightNumber = finiteNumber(right);
  if (leftNumber != null && rightNumber != null) return leftNumber === rightNumber;
  return String(left ?? "") === String(right ?? "");
}
