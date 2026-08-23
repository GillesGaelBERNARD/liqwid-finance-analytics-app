function chartDataNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function chartDataDivide(numerator, denominator) {
  const top = Number(numerator);
  const bottom = Number(denominator);
  return Number.isFinite(top) && Number.isFinite(bottom) && bottom !== 0 ? top / bottom : null;
}

function chartDataClamp(value, minimum, maximum) {
  return Math.min(maximum, Math.max(minimum, value));
}

function chartDataDate(row) {
  const direct = typeof row?.date === "string" ? row.date.slice(0, 10) : "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(direct)) return direct;
  const timestamp = Date.parse(row?.timestamp);
  return Number.isFinite(timestamp) ? new Date(timestamp).toISOString().slice(0, 10) : null;
}

function chartDataRows(rows) {
  const sorted = (Array.isArray(rows) ? rows : [])
    .map((row, index) => ({ row: { ...row }, date: chartDataDate(row), index }))
    .filter((entry) => entry.date)
    .sort((a, b) => a.date.localeCompare(b.date) || a.index - b.index);
  const seen = new Set();
  return sorted
    .filter((entry) => {
      if (seen.has(entry.date)) return false;
      seen.add(entry.date);
      return true;
    })
    .map((entry) => ({ ...entry.row, date: entry.date }));
}

function chartDataWindows(windows) {
  return [...new Set((Array.isArray(windows) ? windows : [7, 30, 90])
    .map((value) => Math.trunc(Number(value)))
    .filter((value) => value > 0))];
}

function chartDataPrefix(values) {
  const prefix = [0];
  for (const value of values) prefix.push(prefix.at(-1) + value);
  return prefix;
}

function chartDataRollingValue(prefix, index, window) {
  const start = Math.max(0, index - window + 1);
  return prefix[index + 1] - prefix[start];
}

function chartDataOptionalNumber(value) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function chartDataProvidedNumber(row, fields, fallback = null) {
  for (const field of Array.isArray(fields) ? fields : [fields]) {
    if (Object.prototype.hasOwnProperty.call(row ?? {}, field)) {
      return chartDataOptionalNumber(row[field]);
    }
  }
  return fallback;
}

function chartDataRollingOptional(values, index, window) {
  const observed = values
    .slice(Math.max(0, index - window + 1), index + 1)
    .filter((value) => Number.isFinite(value));
  return observed.length ? observed.reduce((total, value) => total + value, 0) : null;
}

function chartDataValueAtPrice(value, price) {
  if (!Number.isFinite(value)) return null;
  if (value === 0) return 0;
  return Number.isFinite(price) ? value * price : null;
}

function chartDataNativeSeriesAvailable(rows, nativeFields, usdFields) {
  const nativeObserved = rows.some((row) =>
    nativeFields.some((field) => Math.abs(chartDataNumber(row[field])) > 0)
  );
  const usdObserved = rows.some((row) =>
    usdFields.some((field) => Math.abs(chartDataNumber(row[field])) > 0)
  );
  return nativeObserved || !usdObserved;
}

export function buildFlowIntensityChartData(rows, field, options = {}) {
  if (!String(field || "").trim()) throw new Error("Flow intensity requires a numeric field name.");
  const source = chartDataRows(rows);
  if (!source.length) return [];
  const rawHalfLife = Number(options.halfLifeDays ?? 1.5);
  const halfLifeDays = Number.isFinite(rawHalfLife) && rawHalfLife > 0 ? rawHalfLife : 1.5;
  const rawAverageWindow = Math.trunc(Number(options.averageWindowDays ?? 30));
  const averageWindowDays = rawAverageWindow > 0 ? rawAverageWindow : 30;
  const alpha = 1 - 2 ** (-1 / halfLifeDays);
  const dayMilliseconds = 86400000;
  const firstTimestamp = Date.parse(`${source[0].date}T00:00:00Z`);
  const lastTimestamp = Date.parse(`${source.at(-1).date}T00:00:00Z`);
  const byDate = new Map(source.map((row) => [row.date, row]));
  const window = [];
  let windowSum = 0;
  let ewma = null;
  const enriched = [];

  for (let timestamp = firstTimestamp; timestamp <= lastTimestamp; timestamp += dayMilliseconds) {
    const date = new Date(timestamp).toISOString().slice(0, 10);
    const existing = byDate.get(date);
    const rawValue = existing ? chartDataOptionalNumber(existing[field]) : null;
    window.push(rawValue);
    if (rawValue !== null) windowSum += rawValue;
    if (window.length > averageWindowDays) {
      const removed = window.shift();
      if (removed !== null) windowSum -= removed;
    }

    if (rawValue === null) {
      ewma = null;
    } else {
      ewma = ewma === null ? rawValue : alpha * rawValue + (1 - alpha) * ewma;
    }
    const completeWindow = rawValue !== null && window.every((value) => value !== null);
    enriched.push({
      ...(existing ?? { date, isMissing: true }),
      date,
      [field]: rawValue,
      flowEwma: rawValue === null ? null : ewma,
      flowAverage: completeWindow ? windowSum / window.length : null
    });
  }
  return enriched;
}

export function buildDrySpellChartData(rows, definitions, options = {}) {
  const source = chartDataRows(rows);
  if (!source.length) return [];
  const normalized = (Array.isArray(definitions) ? definitions : [])
    .map((definition) => typeof definition === "string"
      ? { field: definition, key: `${definition}DrySpellDays`, threshold: 0, absolute: false }
      : {
          field: String(definition?.field || ""),
          key: String(definition?.key || `${definition?.field || "flow"}DrySpellDays`),
          threshold: Math.max(0, Number(definition?.threshold) || 0),
          absolute: definition?.absolute === true
        })
    .filter((definition) => definition.field);
  if (!normalized.length) return [];

  const firstTimestamp = Date.parse(`${source[0].date}T00:00:00Z`);
  const lastTimestamp = Date.parse(`${source.at(-1).date}T00:00:00Z`);
  const byDate = new Map(source.map((row) => [row.date, row]));
  const counts = Object.fromEntries(normalized.map((definition) => [definition.key, null]));
  const result = [];
  for (let timestamp = firstTimestamp; timestamp <= lastTimestamp; timestamp += 86400000) {
    const date = new Date(timestamp).toISOString().slice(0, 10);
    const existing = byDate.get(date);
    const output = { ...(existing ?? { date, isMissing: true }), date };
    for (const definition of normalized) {
      const value = existing ? chartDataOptionalNumber(existing[definition.field]) : null;
      if (value === null) {
        counts[definition.key] = null;
        output[definition.key] = null;
        continue;
      }
      const magnitude = definition.absolute ? Math.abs(value) : value;
      counts[definition.key] = magnitude > definition.threshold ? 0 : (counts[definition.key] ?? 0) + 1;
      output[definition.key] = counts[definition.key];
    }
    result.push(output);
  }
  return result;
}

export function enrichChartTimeSeries(rows, options = {}) {
  const source = chartDataRows(rows);
  const windows = chartDataWindows(options.windows);
  const numericFields = [
    "borrowInUsd",
    "supplyInUsd",
    "liquidityInUsd",
    "debtAccruedInUsd",
    "debtRepaidInUsd",
    "interestAccruedInUsd",
    "interestRepaidInUsd",
    "borrowApr",
    "supplyApy",
    "utilizationPercentage"
  ];
  const values = Object.fromEntries(numericFields.map((field) => [
    field,
    source.map((row) => field === "debtAccruedInUsd" ? chartDataOptionalNumber(row[field]) : chartDataNumber(row[field]))
  ]));
  const prefixes = Object.fromEntries(Object.entries(values).map(([field, entries]) => [field, chartDataPrefix(entries)]));
  const debtGapAssets = source.map((row) => chartDataProvidedNumber(row, "debtFlowGap"));
  const interestGapAssets = source.map((row) => chartDataProvidedNumber(row, "interestGap"));
  const nativeValues = Object.fromEntries([
    "debtAccrued",
    "debtRepaid",
    "interestAccrued",
    "interestRepaid"
  ].map((field) => [field, source.map((row) => chartDataOptionalNumber(row[field]))]));
  const protocolAggregate = source.some((row) => row.gapAggregation === "market-usd-sum");
  const nativeDebtAvailable = !protocolAggregate && chartDataNativeSeriesAvailable(
    source,
    ["debtAccrued", "debtRepaid"],
    ["debtAccruedInUsd", "debtRepaidInUsd"]
  );
  const nativeInterestAvailable = !protocolAggregate && chartDataNativeSeriesAvailable(
    source,
    ["interestAccrued", "interestRepaid"],
    ["interestAccruedInUsd", "interestRepaidInUsd"]
  );

  return source.map((row, index) => {
    const debtRepaid = values.debtRepaidInUsd[index];
    const debtAccrued = values.debtAccruedInUsd[index];
    const accrued = values.interestAccruedInUsd[index];
    const repaid = values.interestRepaidInUsd[index];
    const supply = values.supplyInUsd[index];
    const borrow = values.borrowInUsd[index];
    const liquidity = values.liquidityInUsd[index];
    const assetPriceInUsd = chartDataOptionalNumber(row.assetPriceInUsd);
    const fallbackDailyDebtGap = debtAccrued === null ? null : debtAccrued - debtRepaid;
    const fallbackDailyInterestGap = accrued - repaid;
    const dailyDebtGapAsset = debtGapAssets[index];
    const dailyInterestGapAsset = interestGapAssets[index];
    const cumulativeDebtGapAsset = chartDataProvidedNumber(row, "cumulativeDebtFlowGap");
    const unclassifiedBorrowReductionAsset = chartDataProvidedNumber(
      row,
      "unclassifiedBorrowReduction"
    );
    const cumulativeUnclassifiedBorrowReductionAsset = chartDataProvidedNumber(
      row,
      "cumulativeUnclassifiedBorrowReduction"
    );
    const cumulativeInterestGapAsset = chartDataProvidedNumber(row, "cumulativeInterestGap");
    const dailyDebtGap = chartDataProvidedNumber(
      row,
      ["dailyDebtFlowGapInUsd", "debtFlowGapInUsd"],
      fallbackDailyDebtGap
    );
    const dailyInterestGap = chartDataProvidedNumber(
      row,
      ["dailyInterestGapInUsd", "interestGapInUsd"],
      fallbackDailyInterestGap
    );
    const enriched = {
      ...row,
      ...Object.fromEntries(numericFields.map((field) => [field, values[field][index]])),
      debtChange1d: index ? borrow - values.borrowInUsd[index - 1] : null,
      dailyDebtGapAsset,
      dailyDebtGap,
      cumulativeDebtAccrued: chartDataProvidedNumber(
        row,
        "debtAccruedCumulativeInUsd",
        prefixes.debtAccruedInUsd[index + 1]
      ),
      cumulativeDebtRepaid: chartDataProvidedNumber(
        row,
        "debtRepaidCumulativeInUsd",
        prefixes.debtRepaidInUsd[index + 1]
      ),
      cumulativeDebtGapAsset,
      cumulativeDebtGap: !protocolAggregate && cumulativeDebtGapAsset !== null
        ? chartDataValueAtPrice(cumulativeDebtGapAsset, assetPriceInUsd)
        : chartDataProvidedNumber(
            row,
            "cumulativeDebtFlowGapInUsd",
            prefixes.debtAccruedInUsd[index + 1] - prefixes.debtRepaidInUsd[index + 1]
          ),
      unclassifiedBorrowReductionAsset,
      unclassifiedBorrowReduction: !protocolAggregate && unclassifiedBorrowReductionAsset !== null
        ? chartDataValueAtPrice(unclassifiedBorrowReductionAsset, assetPriceInUsd)
        : chartDataProvidedNumber(row, "unclassifiedBorrowReductionInUsd"),
      cumulativeUnclassifiedBorrowReductionAsset,
      cumulativeUnclassifiedBorrowReduction:
        !protocolAggregate && cumulativeUnclassifiedBorrowReductionAsset !== null
          ? chartDataValueAtPrice(
              cumulativeUnclassifiedBorrowReductionAsset,
              assetPriceInUsd
            )
          : chartDataProvidedNumber(row, "cumulativeUnclassifiedBorrowReductionInUsd"),
      dailyInterestGapAsset,
      dailyInterestGap,
      cumulativeInterestAccrued: chartDataProvidedNumber(
        row,
        "interestAccruedCumulativeInUsd",
        prefixes.interestAccruedInUsd[index + 1]
      ),
      cumulativeInterestRepaid: chartDataProvidedNumber(
        row,
        "interestRepaidCumulativeInUsd",
        prefixes.interestRepaidInUsd[index + 1]
      ),
      cumulativeInterestGapAsset,
      cumulativeInterestGap: !protocolAggregate && cumulativeInterestGapAsset !== null
        ? chartDataValueAtPrice(cumulativeInterestGapAsset, assetPriceInUsd)
        : chartDataProvidedNumber(
            row,
            "cumulativeInterestGapInUsd",
            prefixes.interestAccruedInUsd[index + 1] - prefixes.interestRepaidInUsd[index + 1]
          ),
      dailyDebtCoverage: chartDataProvidedNumber(
        row,
        "debtCoverageRatio",
        chartDataDivide(
          nativeDebtAvailable ? nativeValues.debtRepaid[index] : debtRepaid,
          nativeDebtAvailable ? nativeValues.debtAccrued[index] : debtAccrued
        )
      ),
      dailyInterestCoverage: chartDataProvidedNumber(
        row,
        "interestCoverageRatio",
        chartDataDivide(
          nativeInterestAvailable ? nativeValues.interestRepaid[index] : repaid,
          nativeInterestAvailable ? nativeValues.interestAccrued[index] : accrued
        )
      ),
      liquidityRatio: chartDataDivide(liquidity, supply),
      borrowToLiquidity: chartDataDivide(borrow, liquidity)
    };

    for (const window of windows) {
      const observationCount = Math.min(index + 1, window);
      const debtRepaidWindow = chartDataRollingValue(prefixes.debtRepaidInUsd, index, window);
      const debtAccruedWindow = chartDataRollingValue(prefixes.debtAccruedInUsd, index, window);
      const accruedWindow = chartDataRollingValue(prefixes.interestAccruedInUsd, index, window);
      const repaidWindow = chartDataRollingValue(prefixes.interestRepaidInUsd, index, window);
      const debtAccruedAssetWindow = chartDataProvidedNumber(
        row,
        [`debtAccruedAsset${window}d`, `debtAccrued${window}d`],
        nativeDebtAvailable ? chartDataRollingOptional(nativeValues.debtAccrued, index, window) : null
      );
      const debtRepaidAssetWindow = chartDataProvidedNumber(
        row,
        [`debtRepaidAsset${window}d`, `debtRepaid${window}d`],
        nativeDebtAvailable ? chartDataRollingOptional(nativeValues.debtRepaid, index, window) : null
      );
      const interestAccruedAssetWindow = chartDataProvidedNumber(
        row,
        [`interestAccruedAsset${window}d`, `interestAccrued${window}d`],
        nativeInterestAvailable ? chartDataRollingOptional(nativeValues.interestAccrued, index, window) : null
      );
      const interestRepaidAssetWindow = chartDataProvidedNumber(
        row,
        [`interestRepaidAsset${window}d`, `interestRepaid${window}d`],
        nativeInterestAvailable ? chartDataRollingOptional(nativeValues.interestRepaid, index, window) : null
      );
      const debtAccruedCurrentUsd = chartDataProvidedNumber(
        row,
        `${`debtAccrued${window}d`}InUsd`,
        nativeDebtAvailable
          ? chartDataValueAtPrice(debtAccruedAssetWindow, assetPriceInUsd)
          : debtAccruedWindow
      );
      const debtRepaidCurrentUsd = chartDataProvidedNumber(
        row,
        `${`debtRepaid${window}d`}InUsd`,
        nativeDebtAvailable
          ? chartDataValueAtPrice(debtRepaidAssetWindow, assetPriceInUsd)
          : debtRepaidWindow
      );
      const interestAccruedCurrentUsd = chartDataProvidedNumber(
        row,
        `${`interestAccrued${window}d`}InUsd`,
        nativeInterestAvailable
          ? chartDataValueAtPrice(interestAccruedAssetWindow, assetPriceInUsd)
          : accruedWindow
      );
      const interestRepaidCurrentUsd = chartDataProvidedNumber(
        row,
        `${`interestRepaid${window}d`}InUsd`,
        nativeInterestAvailable
          ? chartDataValueAtPrice(interestRepaidAssetWindow, assetPriceInUsd)
          : repaidWindow
      );
      const debtGapAssetWindow = chartDataProvidedNumber(
        row,
        `debtFlowGap${window}d`,
        chartDataRollingOptional(debtGapAssets, index, window)
      );
      const interestGapAssetWindow = chartDataProvidedNumber(
        row,
        `interestGap${window}d`,
        chartDataRollingOptional(interestGapAssets, index, window)
      );
      enriched[`debtAccruedAsset${window}d`] = debtAccruedAssetWindow;
      enriched[`debtRepaidAsset${window}d`] = debtRepaidAssetWindow;
      enriched[`debtRepaid${window}d`] = debtRepaidCurrentUsd;
      enriched[`debtAccrued${window}d`] = debtAccruedCurrentUsd;
      enriched[`debtCoverage${window}d`] = chartDataProvidedNumber(
        row,
        `debtCoverage${window}d`,
        chartDataDivide(
          nativeDebtAvailable ? debtRepaidAssetWindow : debtRepaidCurrentUsd,
          nativeDebtAvailable ? debtAccruedAssetWindow : debtAccruedCurrentUsd
        )
      );
      enriched[`debtGapAsset${window}d`] = debtGapAssetWindow;
      enriched[`debtGap${window}d`] = chartDataProvidedNumber(
        row,
        `debtFlowGap${window}dInUsd`,
        debtGapAssetWindow !== null
          ? chartDataValueAtPrice(debtGapAssetWindow, assetPriceInUsd)
          : debtAccruedWindow - debtRepaidWindow
      );
      enriched[`interestAccruedAsset${window}d`] = interestAccruedAssetWindow;
      enriched[`interestRepaidAsset${window}d`] = interestRepaidAssetWindow;
      enriched[`interestAccrued${window}d`] = interestAccruedCurrentUsd;
      enriched[`interestRepaid${window}d`] = interestRepaidCurrentUsd;
      enriched[`interestCoverage${window}d`] = chartDataProvidedNumber(
        row,
        `interestCoverage${window}d`,
        chartDataDivide(
          nativeInterestAvailable ? interestRepaidAssetWindow : interestRepaidCurrentUsd,
          nativeInterestAvailable ? interestAccruedAssetWindow : interestAccruedCurrentUsd
        )
      );
      enriched[`interestGapAsset${window}d`] = interestGapAssetWindow;
      enriched[`interestGap${window}d`] = chartDataProvidedNumber(
        row,
        `interestGap${window}dInUsd`,
        interestGapAssetWindow !== null
          ? chartDataValueAtPrice(interestGapAssetWindow, assetPriceInUsd)
          : accruedWindow - repaidWindow
      );
      enriched[`utilization${window}d`] = chartDataRollingValue(prefixes.utilizationPercentage, index, window) / observationCount;
      enriched[`borrowApr${window}d`] = chartDataRollingValue(prefixes.borrowApr, index, window) / observationCount;
      enriched[`supplyApy${window}d`] = chartDataRollingValue(prefixes.supplyApy, index, window) / observationCount;
    }
    return enriched;
  });
}

export function buildTrailingCoverageWindows(rows, options = {}) {
  const source = chartDataRows(rows);
  if (!source.length) return [];
  const windows = chartDataWindows(options.windows ?? [7, 30, 90]);
  const latestTimestamp = Date.parse(`${source.at(-1).date}T00:00:00Z`);

  return windows.map((windowDays) => {
    const startDate = new Date(latestTimestamp - (windowDays - 1) * 86400000).toISOString().slice(0, 10);
    const observed = source.filter((row) => row.date >= startDate);
    const total = (field) => observed.reduce((sum, row) => sum + chartDataNumber(row[field]), 0);
    const current = observed.at(-1) || {};
    const protocolAggregate = current.gapAggregation === "market-usd-sum";
    const nativeInterestAvailable = !protocolAggregate && chartDataNativeSeriesAvailable(
      observed,
      ["interestAccrued", "interestRepaid"],
      ["interestAccruedInUsd", "interestRepaidInUsd"]
    );
    const nativeDebtAvailable = !protocolAggregate && chartDataNativeSeriesAvailable(
      observed,
      ["debtAccrued", "debtRepaid"],
      ["debtAccruedInUsd", "debtRepaidInUsd"]
    );
    const assetPriceInUsd = chartDataOptionalNumber(current.assetPriceInUsd);
    const interestAccrued = nativeInterestAvailable
      ? chartDataProvidedNumber(current, `interestAccruedAsset${windowDays}d`, total("interestAccrued"))
      : null;
    const interestRepaid = nativeInterestAvailable
      ? chartDataProvidedNumber(current, `interestRepaidAsset${windowDays}d`, total("interestRepaid"))
      : null;
    const debtAccrued = nativeDebtAvailable
      ? chartDataProvidedNumber(current, `debtAccruedAsset${windowDays}d`, total("debtAccrued"))
      : null;
    const debtRepaid = nativeDebtAvailable
      ? chartDataProvidedNumber(current, `debtRepaidAsset${windowDays}d`, total("debtRepaid"))
      : null;
    const interestAccruedInUsd = chartDataProvidedNumber(
      current,
      `interestAccrued${windowDays}dInUsd`,
      nativeInterestAvailable ? chartDataValueAtPrice(interestAccrued, assetPriceInUsd) : total("interestAccruedInUsd")
    );
    const interestRepaidInUsd = chartDataProvidedNumber(
      current,
      `interestRepaid${windowDays}dInUsd`,
      nativeInterestAvailable ? chartDataValueAtPrice(interestRepaid, assetPriceInUsd) : total("interestRepaidInUsd")
    );
    const debtAccruedInUsd = chartDataProvidedNumber(
      current,
      `debtAccrued${windowDays}dInUsd`,
      nativeDebtAvailable ? chartDataValueAtPrice(debtAccrued, assetPriceInUsd) : total("debtAccruedInUsd")
    );
    const debtRepaidInUsd = chartDataProvidedNumber(
      current,
      `debtRepaid${windowDays}dInUsd`,
      nativeDebtAvailable ? chartDataValueAtPrice(debtRepaid, assetPriceInUsd) : total("debtRepaidInUsd")
    );
    return {
      windowDays,
      label: `Trailing ${windowDays} days`,
      interestAccruedInUsd,
      interestRepaidInUsd,
      interestAccrued,
      interestRepaid,
      coverageRatio: chartDataProvidedNumber(
        current,
        `interestCoverage${windowDays}d`,
        nativeInterestAvailable
          ? chartDataDivide(interestRepaid, interestAccrued)
          : chartDataDivide(interestRepaidInUsd, interestAccruedInUsd)
      ),
      debtAccruedInUsd,
      debtRepaidInUsd,
      debtAccrued,
      debtRepaid,
      debtCoverageRatio: chartDataProvidedNumber(
        current,
        `debtCoverage${windowDays}d`,
        nativeDebtAvailable
          ? chartDataDivide(debtRepaid, debtAccrued)
          : chartDataDivide(debtRepaidInUsd, debtAccruedInUsd)
      ),
      observedDays: observed.length,
      assetPriceInUsd,
      valuationMode: protocolAggregate
        ? "market-usd-sum"
        : nativeDebtAvailable || nativeInterestAvailable
          ? "market-current-price"
          : "historical-usd-fallback"
    };
  });
}

export function summarizeDebtFlowReconciliation(rows) {
  const source = chartDataRows(rows);
  if (!source.length) return null;

  const openingBorrowInUsd = chartDataNumber(source[0].borrowInUsd);
  const currentBorrowInUsd = chartDataNumber(source.at(-1).borrowInUsd);
  const latest = source.at(-1);
  const cumulativeDebtAccruedInUsd = chartDataProvidedNumber(
    latest,
    ["cumulativeDebtAccrued", "debtAccruedCumulativeInUsd"],
    source.reduce(
      (total, row) => total + (chartDataOptionalNumber(row.debtAccruedInUsd) ?? 0),
      0
    )
  );
  const cumulativeDebtRepaidInUsd = chartDataProvidedNumber(
    latest,
    ["cumulativeDebtRepaid", "debtRepaidCumulativeInUsd"],
    source.reduce(
      (total, row) => total + chartDataNumber(row.debtRepaidInUsd),
      0
    )
  );
  const cumulativeUnclassifiedBorrowReductionInUsd = chartDataProvidedNumber(
    latest,
    [
      "cumulativeUnclassifiedBorrowReduction",
      "cumulativeUnclassifiedBorrowReductionInUsd"
    ],
    0
  );
  const cumulativeDebtFlowGap = chartDataProvidedNumber(
    latest,
    ["cumulativeDebtGapAsset", "cumulativeDebtFlowGap"]
  );
  const cumulativeDebtFlowGapInUsd = chartDataProvidedNumber(
    latest,
    ["cumulativeDebtGap", "cumulativeDebtFlowGapInUsd"],
    cumulativeDebtAccruedInUsd - cumulativeDebtRepaidInUsd
  );
  const observedBorrowChangeInUsd = currentBorrowInUsd - openingBorrowInUsd;
  const cumulativeInterestAccruedInUsd = source.reduce(
    (total, row) => total + chartDataNumber(row.interestAccruedInUsd),
    0
  );
  const cumulativeInterestRepaidInUsd = source.reduce(
    (total, row) => total + chartDataNumber(row.interestRepaidInUsd),
    0
  );
  const cumulativeInterestFlowGap = chartDataProvidedNumber(
    latest,
    ["cumulativeInterestGapAsset", "cumulativeInterestGap"]
  );
  const cumulativeInterestFlowGapInUsd = chartDataProvidedNumber(
    latest,
    "cumulativeInterestGapInUsd",
    cumulativeInterestAccruedInUsd - cumulativeInterestRepaidInUsd
  );

  return {
    fromDate: source[0].date,
    toDate: source.at(-1).date,
    openingBorrowInUsd,
    currentBorrowInUsd,
    cumulativeDebtAccruedInUsd,
    cumulativeDebtRepaidInUsd,
    cumulativeUnclassifiedBorrowReductionInUsd,
    ...(cumulativeDebtFlowGap === null ? {} : { cumulativeDebtFlowGap }),
    cumulativeDebtFlowGapInUsd,
    observedBorrowChangeInUsd,
    flowVsBalanceResidualInUsd: cumulativeDebtFlowGapInUsd - observedBorrowChangeInUsd,
    cumulativeInterestAccruedInUsd,
    cumulativeInterestRepaidInUsd,
    ...(cumulativeInterestFlowGap === null ? {} : { cumulativeInterestFlowGap }),
    cumulativeInterestFlowGapInUsd
  };
}

export function aggregateMonthlyChartRows(rows) {
  const months = new Map();
  const derivedRevenueFields = [
    "directOriginationRevenueInUsd",
    "attributedCollectedInterestRevenueInUsd",
    "attributedCollectedMarketRevenueInUsd",
    "interestAccruedInUsd",
    "accruedSupplierInterestIncomeInUsd",
    "accruedProtocolInterestRevenueInUsd"
  ];

  for (const row of chartDataRows(rows)) {
    const month = `${row.date.slice(0, 7)}-01`;
    const repaid = chartDataNumber(row.interestRepaidInUsd);
    const origination = chartDataNumber(row.loanOriginationFeesInUsd);
    const minAdaOrigination = chartDataNumber(row.loanOriginationFeesMinAdaInUsd);
    const current = months.get(month) ?? {
      date: month,
      observations: 0,
      interestRepaidActivityInUsd: 0,
      loanOriginationFeesInUsd: 0,
      loanOriginationFeesMinAdaInUsd: 0,
      collectedOriginationRevenueInUsd: 0
    };
    for (const field of derivedRevenueFields) {
      if (!(field in row)) continue;
      if (!(field in current)) current[field] = 0;
      current[field] += chartDataNumber(row[field]);
    }
    current.observations += 1;
    current.interestRepaidActivityInUsd += repaid;
    current.loanOriginationFeesInUsd += origination;
    current.loanOriginationFeesMinAdaInUsd += minAdaOrigination;
    current.collectedOriginationRevenueInUsd += origination + minAdaOrigination;
    months.set(month, current);
  }

  return [...months.values()].sort((a, b) => a.date.localeCompare(b.date));
}

export function fillMonthlyChartGaps(rows, fields = [], options = {}) {
  const source = chartDataRows(rows);
  if (!source.length) return [];
  const valueFields = [...new Set((Array.isArray(fields) ? fields : []).map(String).filter(Boolean))];
  const byMonth = new Map(source.map(row => [`${row.date.slice(0, 7)}-01`, row]));
  const requestedStart = chartDataDate({ date: options.startDate });
  const requestedEnd = chartDataDate({ date: options.endDate });
  const firstDate = requestedStart && requestedStart < source[0].date ? requestedStart : source[0].date;
  const lastDate = requestedEnd && requestedEnd > source.at(-1).date ? requestedEnd : source.at(-1).date;
  const first = new Date(`${firstDate.slice(0, 7)}-01T00:00:00Z`);
  const last = new Date(`${lastDate.slice(0, 7)}-01T00:00:00Z`);
  const completed = [];
  for (const cursor = new Date(first); cursor <= last; cursor.setUTCMonth(cursor.getUTCMonth() + 1)) {
    const date = cursor.toISOString().slice(0, 10);
    const existing = byMonth.get(date);
    completed.push(existing ?? {
      date,
      ...Object.fromEntries(valueFields.map(field => [field, null])),
      isMissing: true
    });
  }
  return completed;
}

function chartDataMarketEntries(marketSeries) {
  const entries = marketSeries instanceof Map ? [...marketSeries.entries()] : Object.entries(marketSeries ?? {});
  return entries
    .filter(([marketId]) => String(marketId).toUpperCase() !== "POL")
    .map(([marketId, rows]) => [String(marketId), chartDataRows(rows)]);
}

export function contributionKeysByLatest(rows, options = {}) {
  const source = chartDataRows(rows);
  const latest = source.at(-1) ?? {};
  const otherKey = String(options.otherKey ?? "Other");
  const keys = [...new Set(source.flatMap((row) => Object.keys(row)))]
    .filter((key) => key !== "date" && key !== "timestamp");
  return keys.sort((left, right) => {
    if (left === otherKey) return right === otherKey ? 0 : 1;
    if (right === otherKey) return -1;
    return chartDataNumber(latest[right]) - chartDataNumber(latest[left])
      || left.localeCompare(right);
  });
}

export function buildContributionChartData(marketSeries, field, options = {}) {
  const window = Math.max(1, Math.trunc(Number(options.window) || 30));
  const topN = Math.max(0, Math.trunc(Number(options.topN) || 7));
  const positiveOnly = Boolean(options.positiveOnly);
  const entries = chartDataMarketEntries(marketSeries);
  const dates = [...new Set(entries.flatMap(([, rows]) => rows.map((row) => row.date)))].sort();
  if (!dates.length || !entries.length) return [];

  const rollingByMarket = new Map();
  for (const [marketId, rows] of entries) {
    const byDate = new Map(rows.map((row) => {
      const value = chartDataNumber(row[field]);
      return [row.date, positiveOnly ? Math.max(0, value) : value];
    }));
    const daily = dates.map((date) => byDate.get(date) ?? 0);
    const prefix = chartDataPrefix(daily);
    rollingByMarket.set(marketId, daily.map((_, index) => chartDataRollingValue(prefix, index, window)));
  }

  const ranked = [...rollingByMarket]
    .map(([marketId, values]) => ({ marketId, latest: values.at(-1) ?? 0 }))
    .sort((a, b) => b.latest - a.latest || a.marketId.localeCompare(b.marketId));
  const topMarkets = ranked.slice(0, topN).map((entry) => entry.marketId);
  const remaining = ranked.slice(topN).map((entry) => entry.marketId);

  return dates.map((date, index) => {
    const displayed = topMarkets.map((marketId) => [marketId, rollingByMarket.get(marketId)[index]]);
    if (remaining.length) {
      displayed.push(["Other", remaining.reduce((sum, marketId) => sum + rollingByMarket.get(marketId)[index], 0)]);
    }
    const total = displayed.reduce((sum, [, value]) => sum + value, 0);
    return Object.fromEntries([
      ["date", date],
      ...displayed.map(([marketId, value]) => [marketId, total > 0 ? value / total : 0])
    ]);
  });
}

export function buildCurrentContributionChartData(marketSeries, options = {}) {
  const entries = chartDataMarketEntries(marketSeries);
  if (!entries.length) return [];
  const marketCount = Math.max(1, Math.trunc(Number(options.topN) || entries.length));
  const source = Object.fromEntries(entries);
  const enriched = Object.fromEntries(entries.map(([marketId, rows]) => [
    marketId,
    enrichChartTimeSeries(rows, { windows: [30] })
  ]));
  const definitions = [
    { metric: "Interest accrued \u00b7 trailing 30d", source, field: "interestAccruedInUsd", window: 30 },
    { metric: "Interest repaid \u00b7 trailing 30d", source, field: "interestRepaidInUsd", window: 30 },
    { metric: "Positive interest gap \u00b7 trailing 30d", source: enriched, field: "interestGap30d", window: 1, positiveOnly: true },
    { metric: "Outstanding debt \u00b7 current", source, field: "borrowInUsd", window: 1 },
    { metric: "Debt repaid \u00b7 trailing 30d", source, field: "debtRepaidInUsd", window: 30 },
    { metric: "Positive debt gap \u00b7 trailing 30d", source: enriched, field: "debtGap30d", window: 1, positiveOnly: true }
  ];

  return definitions.map((definition) => {
    const latest = buildContributionChartData(definition.source, definition.field, {
      window: definition.window,
      topN: marketCount,
      positiveOnly: definition.positiveOnly
    }).at(-1) ?? {};
    return { metric: definition.metric, ...latest };
  });
}

function chartDataSigmoid(value) {
  return 1 / (1 + Math.exp(-value));
}

export function buildMarketStressChartData(marketSeries, options = {}) {
  const topN = Math.max(0, Math.trunc(Number(options.topN) || 7));
  const entries = chartDataMarketEntries(marketSeries)
    .map(([marketId, rows]) => [marketId, enrichChartTimeSeries(rows, { windows: [30] })])
    .filter(([, rows]) => rows.length);
  if (!entries.length) return { protocolRows: [], currentRows: [], contributionRows: [] };

  const protocolBorrowByDate = new Map();
  for (const [, rows] of entries) {
    for (const row of rows) {
      protocolBorrowByDate.set(row.date, (protocolBorrowByDate.get(row.date) ?? 0) + chartDataNumber(row.borrowInUsd));
    }
  }

  const dailyByMarket = new Map();
  for (const [marketId, rows] of entries) {
    const daily = rows.map((row, index) => {
      const borrow = chartDataNumber(row.borrowInUsd);
      const borrowShare = chartDataClamp(chartDataDivide(borrow, protocolBorrowByDate.get(row.date)) ?? 0, 0, 1);
      const utilizationStress = chartDataClamp(chartDataNumber(row.utilizationPercentage), 0, 1.1) / 1.1;
      const liquidityStress = chartDataClamp(Number.isFinite(row.borrowToLiquidity) ? row.borrowToLiquidity : 0, 0, 5) / 5;
      const interestCoverageStress = Number.isFinite(row.interestCoverage30d)
        ? 1 - chartDataClamp(row.interestCoverage30d, 0, 1)
        : 0;
      const priorBorrow = index >= 30 ? chartDataNumber(rows[index - 30].borrowInUsd) : 0;
      const borrowGrowthStress = priorBorrow > 0
        ? chartDataClamp(Math.max(0, borrow - priorBorrow) / priorBorrow, 0, 1)
        : 0;
      const marketStressScore = chartDataSigmoid(
        -2.4
        + 2.1 * utilizationStress
        + 1.25 * liquidityStress
        + 1.15 * interestCoverageStress
        + 0.85 * borrowGrowthStress
      );
      return {
        date: row.date,
        marketId,
        displayName: row.marketDisplayName ?? marketId,
        borrowInUsd: borrow,
        borrowShare,
        utilizationStress,
        liquidityStress,
        interestCoverageStress,
        borrowGrowthStress,
        marketStressScore,
        marketStressContribution: borrowShare * marketStressScore
      };
    });
    dailyByMarket.set(marketId, daily);
  }

  const totalContributionByDate = new Map();
  const dailyRowsByDate = new Map();
  for (const daily of dailyByMarket.values()) {
    for (const row of daily) {
      totalContributionByDate.set(row.date, (totalContributionByDate.get(row.date) ?? 0) + row.marketStressContribution);
      const sameDate = dailyRowsByDate.get(row.date) ?? [];
      sameDate.push(row);
      dailyRowsByDate.set(row.date, sameDate);
    }
  }
  for (const daily of dailyByMarket.values()) {
    const rawShares = daily.map((row) => chartDataDivide(row.marketStressContribution, totalContributionByDate.get(row.date)) ?? 0);
    const prefix = chartDataPrefix(rawShares);
    daily.forEach((row, index) => {
      row.stressContributionShare = rawShares[index];
      const count = Math.min(index + 1, 30);
      row.stressContributionShare30d = index >= 4
        ? chartDataRollingValue(prefix, index, 30) / count
        : rawShares[index];
    });
  }

  const dates = [...protocolBorrowByDate.keys()].sort();
  const protocolRows = dates.map((date) => {
    const rows = dailyRowsByDate.get(date) ?? [];
    return {
      date,
      protocolStressIndex: chartDataClamp(rows.reduce((sum, row) => sum + row.marketStressContribution, 0), 0, 1),
      protocolBorrowInUsd: rows.reduce((sum, row) => sum + row.borrowInUsd, 0)
    };
  });

  const marketStats = [...dailyByMarket].map(([marketId, daily]) => {
    const latest = daily.at(-1);
    const peak = daily.reduce((best, row) => row.stressContributionShare > best.stressContributionShare ? row : best, daily[0]);
    const average = daily.reduce((sum, row) => sum + row.stressContributionShare, 0) / daily.length;
    return { marketId, daily, latest, peak, average };
  });
  const currentRows = marketStats
    .map(({ marketId, latest, peak, average }) => ({
      marketId,
      displayName: latest.displayName,
      currentBorrowInUsd: latest.borrowInUsd,
      currentBorrowShare: latest.borrowShare,
      currentMarketStressScore: latest.marketStressScore,
      currentStressContributionShare: latest.stressContributionShare,
      currentStressContributionShare30d: latest.stressContributionShare30d || latest.stressContributionShare || 0,
      averageStressContributionShare: average,
      peakStressContributionShare: peak.stressContributionShare,
      peakStressDate: peak.date,
      utilizationStress: latest.utilizationStress,
      liquidityStress: latest.liquidityStress,
      interestCoverageStress: latest.interestCoverageStress,
      borrowGrowthStress: latest.borrowGrowthStress
    }))
    .sort((a, b) => b.currentStressContributionShare - a.currentStressContributionShare || a.marketId.localeCompare(b.marketId))
    .map((row, index) => ({ ...row, currentStressRank: index + 1 }));

  const rollingByMarketAndDate = new Map([...dailyByMarket].map(([marketId, daily]) => [
    marketId,
    new Map(daily.map((row) => [row.date, row.stressContributionShare30d]))
  ]));
  const latestDate = dates.at(-1);
  const ranked = [...marketStats].sort((a, b) => {
    const latestDifference = (rollingByMarketAndDate.get(b.marketId).get(latestDate) ?? 0)
      - (rollingByMarketAndDate.get(a.marketId).get(latestDate) ?? 0);
    return latestDifference || a.marketId.localeCompare(b.marketId);
  });
  const topMarkets = ranked.slice(0, topN).map((entry) => entry.marketId);
  const remaining = ranked.slice(topN).map((entry) => entry.marketId);
  const contributionRows = dates.map((date) => {
    const values = topMarkets.map((marketId) => [marketId, rollingByMarketAndDate.get(marketId).get(date) ?? 0]);
    if (remaining.length) {
      values.push(["Other", remaining.reduce((sum, marketId) => sum + (rollingByMarketAndDate.get(marketId).get(date) ?? 0), 0)]);
    }
    const total = values.reduce((sum, [, value]) => sum + value, 0);
    return Object.fromEntries([
      ["date", date],
      ...values.map(([marketId, value]) => [marketId, total > 0 ? value / total : 0])
    ]);
  });

  return { protocolRows, currentRows, contributionRows };
}

export const USD_STABLECOIN_MARKET_IDS = [
  "DJED",
  "IUSD",
  "USDC",
  "USDT",
  "DAI",
  "USDM",
  "USDA",
  "PYUSD",
  "USDCx"
];

export const USD_STABLECOIN_CONFIG = [
  { id: "DJED", label: "DJED", color: "#3edc81" },
  { id: "IUSD", label: "iUSD", color: "#19b5fe" },
  { id: "USDC", label: "wanUSDC", color: "#00cec9" },
  { id: "USDT", label: "wanUSDT", color: "#26de81" },
  { id: "DAI", label: "wanDAI", color: "#ffb84d" },
  { id: "USDM", label: "USDM", color: "#d593ff" },
  { id: "USDA", label: "USDA", color: "#ff5a67" },
  { id: "PYUSD", label: "wanPYUSD", color: "#f368e0" },
  { id: "USDCx", label: "USDCx", color: "#fed330" }
];

export function buildStablecoinYieldComparisonData(marketSeriesById, stablecoinMarketIds = USD_STABLECOIN_MARKET_IDS) {
  const ids = Array.isArray(stablecoinMarketIds) ? stablecoinMarketIds : USD_STABLECOIN_MARKET_IDS;
  const seriesByMarket = {};
  const dateSet = new Set();

  for (const id of ids) {
    const rawKey = Object.keys(marketSeriesById || {}).find(
      (candidate) => candidate.toUpperCase() === String(id).toUpperCase()
    );
    const rows = rawKey ? chartDataRows(marketSeriesById[rawKey]) : [];
    const dateMap = new Map();
    for (const row of rows) {
      if (row.date) {
        dateSet.add(row.date);
        dateMap.set(row.date, row);
      }
    }
    seriesByMarket[id] = dateMap;
  }

  const sortedDates = [...dateSet].sort((a, b) => a.localeCompare(b));
  return sortedDates.map((date) => {
    const combinedRow = { date };
    for (const id of ids) {
      const marketRow = seriesByMarket[id]?.get(date);
      const key = `${id.toLowerCase()}SupplyApy`;
      combinedRow[key] = marketRow && Number.isFinite(Number(marketRow.supplyApy))
        ? Number(marketRow.supplyApy)
        : null;
    }
    return combinedRow;
  });
}
