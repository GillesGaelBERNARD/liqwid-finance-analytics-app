const chartDayMilliseconds = 24 * 60 * 60 * 1000;
const chartEndpointClipPadding = 6;

function chartTimestamp(row) {
  const candidate = row?.timestamp ?? row?.date;
  if (candidate instanceof Date) return candidate.getTime();
  if (typeof candidate === "number") return Number.isFinite(candidate) ? candidate : NaN;
  if (typeof candidate !== "string" || !candidate.trim()) return NaN;
  return Date.parse(candidate);
}

function chartClamp(value, minimum, maximum) {
  return Math.min(maximum, Math.max(minimum, value));
}

function chartBounds(rowCount, startIndex, endIndex) {
  if (!rowCount) return { startIndex: 0, endIndex: -1 };
  let start = chartClamp(Math.trunc(Number(startIndex) || 0), 0, rowCount - 1);
  let end = chartClamp(
    Number.isFinite(Number(endIndex)) ? Math.trunc(Number(endIndex)) : rowCount - 1,
    0,
    rowCount - 1
  );
  if (start > end) [start, end] = [end, start];
  return { startIndex: start, endIndex: end };
}

function chartValidNumber(value) {
  return typeof value === "number" && Number.isFinite(value);
}

function chartNormalizeSeries(series) {
  return (Array.isArray(series) ? series : []).map((entry, index) => {
    if (Array.isArray(entry)) {
      return {
        key: String(entry[0] ?? `series-${index + 1}`),
        label: String(entry[1] ?? entry[0] ?? `Series ${index + 1}`),
        color: String(entry[2] ?? "#19d3ae"),
        negativeColor: String(entry[3] ?? entry[2] ?? "#19d3ae"),
        type: "line",
        summary: true,
        points: false,
        dash: ""
      };
    }
    const type = ["bar", "point", "line"].includes(entry?.type) ? entry.type : "line";
    const yAxis = entry?.yAxis === "right" || entry?.yAxisIndex === 1 ? "right" : "left";
    return {
      key: String(entry?.key ?? `series-${index + 1}`),
      label: String(entry?.label ?? entry?.key ?? `Series ${index + 1}`),
      color: String(entry?.color ?? "#19d3ae"),
      negativeColor: String(entry?.negativeColor ?? entry?.color ?? "#19d3ae"),
      type,
      legend: entry?.legend !== false,
      summary: entry?.summary !== false,
      points: entry?.points === true,
      dash: typeof entry?.dash === "string" ? entry.dash : "",
      yAxis
    };
  });
}

export function chartRangeForPeriod(rows, period = "all") {
  const rowCount = Array.isArray(rows) ? rows.length : 0;
  if (!rowCount) return { startIndex: 0, endIndex: -1 };
  const endIndex = rowCount - 1;
  const latest = chartTimestamp(rows[endIndex]);
  const normalized = String(period ?? "all").trim().toLowerCase();
  if (normalized === "all" || !Number.isFinite(latest)) return { startIndex: 0, endIndex };

  let cutoff;
  if (normalized === "ytd" || normalized === "year-to-date") {
    const latestDate = new Date(latest);
    cutoff = Date.UTC(latestDate.getUTCFullYear(), 0, 1);
  } else {
    const chartPeriodDays = {
      week: 7,
      "1w": 7,
      month: 30,
      "1m": 30,
      quarter: 90,
      "3m": 90,
      "6m": 180,
      year: 365,
      "1y": 365
    };
    let days = chartPeriodDays[normalized];
    if (!days && /^\d+(?:d|day|days)?$/.test(normalized)) days = Number.parseInt(normalized, 10);
    if (!Number.isFinite(days) || days <= 0) return { startIndex: 0, endIndex };
    cutoff = latest - (Math.max(1, days) - 1) * chartDayMilliseconds;
  }

  let startIndex = 0;
  for (let index = 0; index <= endIndex; index += 1) {
    const timestamp = chartTimestamp(rows[index]);
    if (Number.isFinite(timestamp) && timestamp >= cutoff) {
      startIndex = index;
      break;
    }
  }
  return { startIndex, endIndex };
}

export function chartRangeLabel(rows, startIndex = 0, endIndex = rows?.length - 1) {
  const rowCount = Array.isArray(rows) ? rows.length : 0;
  const bounds = chartBounds(rowCount, startIndex, endIndex);
  if (bounds.endIndex < bounds.startIndex) return "unknown — unknown";
  const first = chartDateInputValue(rows[bounds.startIndex]) || "unknown";
  const last = chartDateInputValue(rows[bounds.endIndex]) || "unknown";
  return `${first} — ${last}`;
}

export function chartTimePositions(rows, startIndex = 0, endIndex = rows?.length - 1) {
  const rowCount = Array.isArray(rows) ? rows.length : 0;
  const bounds = chartBounds(rowCount, startIndex, endIndex);
  if (bounds.endIndex < bounds.startIndex) return [];
  const first = chartTimestamp(rows[bounds.startIndex]);
  const last = chartTimestamp(rows[bounds.endIndex]);
  const span = last - first;
  const positions = [];
  for (let index = bounds.startIndex; index <= bounds.endIndex; index += 1) {
    const timestamp = chartTimestamp(rows[index]);
    positions.push(Number.isFinite(timestamp) && Number.isFinite(span) && span > 0
      ? chartClamp((timestamp - first) / span, 0, 1)
      : 0);
  }
  return positions;
}

export function chartTimeDomain(rows, startIndex = 0, endIndex = rows?.length - 1, calendarPeriod = "date") {
  const rowCount = Array.isArray(rows) ? rows.length : 0;
  const bounds = chartBounds(rowCount, startIndex, endIndex);
  if (bounds.endIndex < bounds.startIndex) return { min: -chartDayMilliseconds / 2, max: chartDayMilliseconds / 2, singleDateRange: true };
  const first = chartTimestamp(rows[bounds.startIndex]);
  const last = chartTimestamp(rows[bounds.endIndex]);
  const singleDateRange = !Number.isFinite(first) || !Number.isFinite(last) || last <= first;
  if (calendarPeriod === "month" && Number.isFinite(first) && Number.isFinite(last)) {
    if (!singleDateRange) {
      const next = chartTimestamp(rows[bounds.startIndex + 1]);
      const previous = chartTimestamp(rows[bounds.endIndex - 1]);
      const leftPadding = Number.isFinite(next) && next > first ? (next - first) / 2 : chartDayMilliseconds * 15;
      const rightPadding = Number.isFinite(previous) && previous < last ? (last - previous) / 2 : chartDayMilliseconds * 15;
      return { min: first - leftPadding, max: last + rightPadding, singleDateRange };
    }
    const date = new Date(first);
    const nextMonth = Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 1);
    const halfMonth = Number.isFinite(nextMonth) && nextMonth > first ? (nextMonth - first) / 2 : chartDayMilliseconds * 15;
    return { min: first - halfMonth, max: first + halfMonth, singleDateRange };
  }
  if (singleDateRange) {
    const center = Number.isFinite(first) ? first : Number.isFinite(last) ? last : 0;
    return { min: center - chartDayMilliseconds / 2, max: center + chartDayMilliseconds / 2, singleDateRange };
  }
  return { min: first, max: last, singleDateRange };
}

export function chartMonthlyTicks(rows, startIndex = 0, endIndex = rows?.length - 1, maximumTicks = 12) {
  const rowCount = Array.isArray(rows) ? rows.length : 0;
  const bounds = chartBounds(rowCount, startIndex, endIndex);
  if (bounds.endIndex < bounds.startIndex) return [];
  const count = bounds.endIndex - bounds.startIndex + 1;
  const limit = chartClamp(Math.trunc(Number(maximumTicks) || 1), 1, count);
  const indices = limit === 1
    ? [Math.round((bounds.startIndex + bounds.endIndex) / 2)]
    : Array.from({ length: limit }, (_, index) => bounds.startIndex + Math.round(index * (count - 1) / (limit - 1)));
  return [...new Set(indices)].map(index => {
    const row = rows[index];
    const timestamp = chartTimestamp(row);
    return {
      index,
      timestamp,
      label: Number.isFinite(timestamp)
        ? new Date(timestamp).toLocaleDateString("en-US", { month: "short", year: "numeric", timeZone: "UTC" })
        : "Unknown month"
    };
  });
}

export function chartObservationLabel(row, calendarPeriod = "date") {
  if (calendarPeriod === "month") {
    const timestamp = chartTimestamp(row);
    if (Number.isFinite(timestamp)) {
      const month = new Date(timestamp).toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });
      return row?.isComplete === false ? `${month} · Incomplete month` : month;
    }
  }
  return String(row?.date ?? row?.timestamp ?? "");
}

export function chartPlotClipBounds(plotLeft, plotRight, plotTop, plotBottom) {
  return {
    x: plotLeft - chartEndpointClipPadding,
    y: plotTop,
    width: Math.max(1, plotRight - plotLeft + chartEndpointClipPadding * 2),
    height: Math.max(1, plotBottom - plotTop)
  };
}

export function chartLineSegments(rows, key, startIndex = 0, endIndex = rows?.length - 1) {
  const rowCount = Array.isArray(rows) ? rows.length : 0;
  const bounds = chartBounds(rowCount, startIndex, endIndex);
  const segments = [];
  let segment = [];
  for (let index = bounds.startIndex; index <= bounds.endIndex; index += 1) {
    const value = rows[index]?.[key];
    if (chartValidNumber(value)) {
      segment.push({ index, value });
    } else if (segment.length) {
      segments.push(segment);
      segment = [];
    }
  }
  if (segment.length) segments.push(segment);
  return segments;
}

export function chartStackedBands(rows, series, startIndex = 0, endIndex = rows?.length - 1) {
  const rowCount = Array.isArray(rows) ? rows.length : 0;
  const bounds = chartBounds(rowCount, startIndex, endIndex);
  const normalizedSeries = chartNormalizeSeries(series);
  const cumulative = new Map();
  return normalizedSeries.map(item => {
    const points = [];
    for (let index = bounds.startIndex; index <= bounds.endIndex; index += 1) {
      const lower = cumulative.get(index) ?? 0;
      const rawValue = rows[index]?.[item.key];
      const value = chartValidNumber(rawValue) && rawValue > 0 ? rawValue : 0;
      const upper = lower + value;
      cumulative.set(index, upper);
      points.push({ index, value, lower, upper });
    }
    return { ...item, points };
  });
}

export function nearestChartIndex(rows, targetTimestamp, startIndex = 0, endIndex = rows?.length - 1) {
  const rowCount = Array.isArray(rows) ? rows.length : 0;
  const bounds = chartBounds(rowCount, startIndex, endIndex);
  if (bounds.endIndex < bounds.startIndex) return -1;
  const target = Number(targetTimestamp);
  let nearest = bounds.startIndex;
  let nearestDistance = Infinity;
  for (let index = bounds.startIndex; index <= bounds.endIndex; index += 1) {
    const timestamp = chartTimestamp(rows[index]);
    if (!Number.isFinite(timestamp)) continue;
    const distance = Math.abs(timestamp - target);
    if (distance < nearestDistance) {
      nearest = index;
      nearestDistance = distance;
    }
  }
  return nearest;
}

export function zoomChartRange(totalRows, startIndex, endIndex, factor, centerIndex) {
  const rowCount = Math.max(0, Math.trunc(Number(totalRows) || 0));
  if (!rowCount) return { startIndex: 0, endIndex: -1 };
  if (rowCount === 1) return { startIndex: 0, endIndex: 0 };
  const bounds = chartBounds(rowCount, startIndex, endIndex);
  const center = chartClamp(
    Number.isFinite(Number(centerIndex)) ? Math.round(Number(centerIndex)) : Math.round((bounds.startIndex + bounds.endIndex) / 2),
    bounds.startIndex,
    bounds.endIndex
  );
  const scale = Number.isFinite(Number(factor)) && Number(factor) > 0 ? Number(factor) : 1;
  const currentCount = bounds.endIndex - bounds.startIndex + 1;
  const nextCount = chartClamp(Math.round(currentCount * scale), 2, rowCount);
  const centerRatio = currentCount > 1
    ? (center - bounds.startIndex) / (currentCount - 1)
    : 0.5;
  let start = Math.round(center - centerRatio * (nextCount - 1));
  let end = start + nextCount - 1;
  if (start < 0) {
    end -= start;
    start = 0;
  }
  if (end >= rowCount) {
    start -= end - rowCount + 1;
    end = rowCount - 1;
  }
  return {
    startIndex: chartClamp(start, 0, rowCount - 1),
    endIndex: chartClamp(end, 0, rowCount - 1)
  };
}

export function panChartRangeByTime(rows, startIndex, endIndex, shiftMilliseconds) {
  const rowCount = Array.isArray(rows) ? rows.length : 0;
  const bounds = chartBounds(rowCount, startIndex, endIndex);
  if (bounds.endIndex < bounds.startIndex || rowCount < 2) return bounds;
  const globalStart = chartTimestamp(rows[0]);
  const globalEnd = chartTimestamp(rows[rowCount - 1]);
  const currentStart = chartTimestamp(rows[bounds.startIndex]);
  const currentEnd = chartTimestamp(rows[bounds.endIndex]);
  if (![globalStart, globalEnd, currentStart, currentEnd].every(Number.isFinite)) return bounds;
  const duration = Math.max(0, currentEnd - currentStart);
  const availableDuration = Math.max(0, globalEnd - globalStart);
  const retainedDuration = Math.min(duration, availableDuration);
  let nextStart = currentStart + (Number(shiftMilliseconds) || 0);
  let nextEnd = nextStart + retainedDuration;
  if (nextStart < globalStart) {
    nextStart = globalStart;
    nextEnd = globalStart + retainedDuration;
  }
  if (nextEnd > globalEnd) {
    nextEnd = globalEnd;
    nextStart = globalEnd - retainedDuration;
  }
  let nextStartIndex = nearestChartIndex(rows, nextStart, 0, rowCount - 1);
  let nextEndIndex = nearestChartIndex(rows, nextEnd, 0, rowCount - 1);
  if (nextStartIndex > nextEndIndex) [nextStartIndex, nextEndIndex] = [nextEndIndex, nextStartIndex];
  return { startIndex: nextStartIndex, endIndex: nextEndIndex };
}

export function chartRangeWithDate(rows, startIndex, endIndex, boundary, dateValue) {
  const rowCount = Array.isArray(rows) ? rows.length : 0;
  const bounds = chartBounds(rowCount, startIndex, endIndex);
  if (bounds.endIndex < bounds.startIndex) return bounds;
  const timestamp = chartTimestamp({ date: dateValue });
  if (!Number.isFinite(timestamp)) return bounds;
  const selectedIndex = nearestChartIndex(rows, timestamp, 0, rowCount - 1);
  if (boundary === "start") {
    return selectedIndex <= bounds.endIndex
      ? { startIndex: selectedIndex, endIndex: bounds.endIndex }
      : { startIndex: selectedIndex, endIndex: selectedIndex };
  }
  return selectedIndex >= bounds.startIndex
    ? { startIndex: bounds.startIndex, endIndex: selectedIndex }
    : { startIndex: selectedIndex, endIndex: selectedIndex };
}

export function summarizeChartRange(rows, series, startIndex = 0, endIndex = rows?.length - 1, valueMode = "stock") {
  const rowCount = Array.isArray(rows) ? rows.length : 0;
  const bounds = chartBounds(rowCount, startIndex, endIndex);
  const normalizedSeries = chartNormalizeSeries(series);
  const flowMode = valueMode === "flow";
  const ratioMode = valueMode === "ratio";

  return normalizedSeries.map(item => {
    const valid = [];
    for (let index = bounds.startIndex; index <= bounds.endIndex; index += 1) {
      const value = rows[index]?.[item.key];
      if (chartValidNumber(value)) valid.push({ value, index, date: rows[index]?.date });
    }
    if (flowMode) {
      const total = valid.length ? valid.reduce((sum, entry) => sum + entry.value, 0) : null;
      const peak = valid.length
        ? valid.reduce((best, entry) => entry.value > best.value ? entry : best, valid[0])
        : null;
      return {
        key: item.key,
        label: item.label,
        color: item.color,
        validCount: valid.length,
        total,
        average: valid.length ? total / valid.length : null,
        peak: peak?.value ?? null,
        peakDate: peak?.date ?? null
      };
    }

    if (ratioMode) {
      const endValue = rows[bounds.endIndex]?.[item.key];
      return {
        key: item.key,
        label: item.label,
        color: item.color,
        validCount: valid.length,
        average: valid.length ? valid.reduce((total, entry) => total + entry.value, 0) / valid.length : null,
        end: chartValidNumber(endValue) ? endValue : null,
        min: valid.length ? Math.min(...valid.map(entry => entry.value)) : null,
        max: valid.length ? Math.max(...valid.map(entry => entry.value)) : null
      };
    }

    const startValue = rows[bounds.startIndex]?.[item.key];
    const endValue = rows[bounds.endIndex]?.[item.key];
    const hasStart = chartValidNumber(startValue);
    const hasEnd = chartValidNumber(endValue);
    const delta = hasStart && hasEnd ? endValue - startValue : null;
    return {
      key: item.key,
      label: item.label,
      color: item.color,
      validCount: valid.length,
      start: hasStart ? startValue : null,
      end: hasEnd ? endValue : null,
      delta,
      percent: hasStart && hasEnd && startValue !== 0 ? delta / Math.abs(startValue) * 100 : null,
      min: valid.length ? Math.min(...valid.map(entry => entry.value)) : null,
      max: valid.length ? Math.max(...valid.map(entry => entry.value)) : null
    };
  });
}

const chartRendererStates = new WeakMap();
const chartRendererContainers = new Map();
let chartRendererResizeObserver = null;

export function chartFixedYDomain(value) {
  const min = Number(value?.min);
  const max = Number(value?.max);
  return Number.isFinite(min) && Number.isFinite(max) && max > min ? { min, max } : null;
}

export function chartResetYScale(state) {
  if (!state || typeof state !== "object") return state;
  state.yScaleMode = "linear";
  state.yDomain = null;
  state.ySymlogConstant = null;
  return state;
}

function chartSupportsManualYScale(state) {
  return state?.stackMode !== "percent" && !state?.fixedYDomain && !state?.hideYScaleToggle;
}

export function renderInteractiveTimeSeriesChart(container, options = {}) {
  if (!container || typeof container.querySelector !== "function") {
    throw new TypeError("An interactive chart container is required.");
  }
  const rows = Array.isArray(options.rows) ? options.rows : [];
  const series = chartNormalizeSeries(options.series);
  const chartId = String(options.chartId || container.id || "interactive-chart");
  const previousContainer = chartRendererContainers.get(chartId);
  if (previousContainer && previousContainer !== container) {
    chartRendererResizeObserver?.unobserve(previousContainer);
    chartRendererStates.delete(previousContainer);
  }
  chartRendererContainers.set(chartId, container);

  if (!rows.length || !series.length) {
    container.innerHTML = '<div class="chart-empty" role="status">No values are available for this chart.</div>';
    chartRendererStates.delete(container);
    return null;
  }

  const period = String(options.period || "all");
  const valueMode = ["flow", "ratio"].includes(options.valueMode) ? options.valueMode : "stock";
  const stackMode = ["percent", "value"].includes(options.stackMode) ? options.stackMode : null;
  const calendarPeriod = options.calendarPeriod === "month" ? "month" : "date";
  const fixedYDomain = chartFixedYDomain(options.fixedYDomain);
  const hideYScaleToggle = options.hideYScaleToggle === true || options.yScaleToggle === false;
  const requestedYScaleMode = options.yScale === "symlog" && stackMode !== "percent" && !fixedYDomain && !hideYScaleToggle ? "symlog" : "linear";
  const referenceLines = chartNormalizeReferenceLines(options.referenceLines);
  const signature = chartDatasetSignature(rows, series);
  let state = chartRendererStates.get(container);
  const needsMarkup = !state || !container.querySelector("svg.chart-main");
  if (needsMarkup) {
    container.innerHTML = chartRendererMarkup();
    const main = container.querySelector("svg.chart-main");
    const tooltip = container.querySelector(".chart-tooltip");
    const tooltipId = `${chartId.replace(/[^a-z0-9_-]+/gi, "-")}-tooltip`;
    main.setAttribute("aria-label", chartSupportsManualYScale({ stackMode, fixedYDomain, hideYScaleToggle })
      ? `Interactive ${chartId} time series. Use Left and Right Arrow to inspect exact values. Focus the Y axis to rescale it.`
      : `Interactive ${chartId} time series. Use Left and Right Arrow to inspect exact values.`);
    main.setAttribute("aria-describedby", tooltipId);
    tooltip.id = tooltipId;
    state = {
      chartId,
      rows,
      series,
      period,
      valueMode,
      stackMode,
      calendarPeriod,
      fixedYDomain,
      hideYScaleToggle,
      referenceLines,
      valueFormatter: typeof options.valueFormatter === "function" ? options.valueFormatter : chartDefaultValueFormatter,
      onRangeChange: typeof options.onRangeChange === "function" ? options.onRangeChange : null,
      signature,
      mode: "compare",
      comparison: null,
      hiddenSeries: new Set(),
      yScaleMode: requestedYScaleMode,
      yDomain: null,
      ySymlogConstant: null,
      hoverIndex: null,
      drag: null,
      geometry: null,
      navigatorGeometry: null,
      resizeFrame: null,
      ...chartRangeForPeriod(rows, period)
    };
    chartRendererStates.set(container, state);
    chartBindRendererEvents(container);
    chartObserveRenderer(container);
  } else {
    const datasetChanged = state.signature !== signature;
    const resetRange = Boolean(options.resetRange) || datasetChanged || state.period !== period;
    state.chartId = chartId;
    state.rows = rows;
    state.series = series;
    state.period = period;
    state.valueMode = valueMode;
    state.stackMode = stackMode;
    state.calendarPeriod = calendarPeriod;
    state.fixedYDomain = fixedYDomain;
    state.hideYScaleToggle = hideYScaleToggle;
    state.referenceLines = referenceLines;
    state.valueFormatter = typeof options.valueFormatter === "function" ? options.valueFormatter : chartDefaultValueFormatter;
    state.onRangeChange = typeof options.onRangeChange === "function" ? options.onRangeChange : null;
    state.signature = signature;
    if (resetRange) {
      Object.assign(state, chartRangeForPeriod(rows, period));
      state.comparison = null;
      state.hoverIndex = null;
      state.yDomain = null;
      state.ySymlogConstant = null;
      if (datasetChanged) state.yScaleMode = requestedYScaleMode;
      if (datasetChanged) state.hiddenSeries = new Set();
    } else {
      Object.assign(state, chartBounds(rows.length, state.startIndex, state.endIndex));
    }
    if (!chartSupportsManualYScale(state)) chartResetYScale(state);
  }
  chartRenderState(container, state);
  return state;
}

function chartDatasetSignature(rows, series) {
  return [
    rows.length,
    chartTimestamp(rows[0]),
    chartTimestamp(rows[rows.length - 1]),
    series.map(item => `${item.key}:${item.type}`).join("|")
  ].join(":");
}

function chartNormalizeReferenceLines(lines) {
  return (Array.isArray(lines) ? lines : []).flatMap((entry) => {
    const value = Number(entry?.value);
    if (!Number.isFinite(value)) return [];
    return [{
      value,
      label: String(entry?.label ?? "Reference"),
      color: String(entry?.color ?? "#a9bfd3"),
      dash: typeof entry?.dash === "string" ? entry.dash : "5 5"
    }];
  });
}

function chartRendererMarkup() {
  return `<div class="interactive-chart">
    <div class="chart-live-toolbar">
      <div class="chart-live-legend"></div>
      <div class="chart-live-tools">
        <div class="chart-mode-group" role="group" aria-label="Chart interaction mode">
          <button type="button" class="chart-mode-button active" data-chart-mode="compare" aria-pressed="true">Compare</button>
          <button type="button" class="chart-mode-button" data-chart-mode="pan" aria-pressed="false">Pan</button>
        </div>
        <button type="button" class="chart-icon-button" data-chart-action="zoom-in" aria-label="Zoom in" title="Zoom in">+</button>
        <button type="button" class="chart-icon-button" data-chart-action="zoom-out" aria-label="Zoom out" title="Zoom out">−</button>
        <button type="button" class="chart-icon-button" data-chart-action="reset" aria-label="Reset visible range and use a Linear Y axis" title="Reset visible range and use a Linear Y axis">Reset</button>
      </div>
    </div>
    <div class="chart-main-shell">
      <div class="chart-y-scale-tools chart-y-scale-group" role="group" aria-label="Y-axis scale">
        <span>Y axis</span>
        <div class="chart-mode-group">
          <button type="button" class="chart-mode-button active" data-chart-y-scale="linear" aria-pressed="true">Linear</button>
          <button type="button" class="chart-mode-button" data-chart-y-scale="symlog" aria-pressed="false">Symlog</button>
        </div>
      </div>
      <svg class="chart-main" role="group" tabindex="0" aria-label="Interactive Liqwid time series"></svg>
      <div class="chart-tooltip" role="status" aria-live="polite" aria-hidden="true" hidden></div>
    </div>
    <div class="chart-navigator-head"><span>Full history — drag or resize the window</span><span class="chart-visible-range"></span></div>
    <div class="chart-date-controls" role="group" aria-label="Visible date range controls">
      <label>From<input class="chart-range-start" type="date" aria-label="Visible range start date"></label>
      <label>To<input class="chart-range-end" type="date" aria-label="Visible range end date"></label>
    </div>
    <svg class="chart-navigator" aria-hidden="true"></svg>
    <div class="chart-comparison hidden"></div>
    <div class="chart-range-summary"></div>
  </div>`;
}

function chartBindRendererEvents(container) {
  const main = container.querySelector("svg.chart-main");
  const navigator = container.querySelector("svg.chart-navigator");
  container.addEventListener("click", event => chartHandleRendererClick(container, event));
  container.addEventListener("change", event => chartHandleRangeInput(container, event));
  main.addEventListener("pointerdown", event => chartHandleMainDown(container, event));
  main.addEventListener("pointermove", event => chartHandleMainMove(container, event));
  main.addEventListener("pointerup", event => chartFinishPointer(container, event));
  main.addEventListener("pointercancel", event => chartFinishPointer(container, event));
  main.addEventListener("dblclick", event => chartHandleMainDoubleClick(container, event));
  main.addEventListener("pointerleave", () => {
    const state = chartRendererStates.get(container);
    if (state && !state.drag && (typeof document === "undefined" || document.activeElement !== main)) chartHideHover(container, state);
  });
  main.addEventListener("focus", () => chartHandleMainFocus(container));
  main.addEventListener("blur", () => {
    const state = chartRendererStates.get(container);
    if (state && !state.drag) chartHideHover(container, state);
  });
  main.addEventListener("keydown", event => chartHandleMainKeyDown(container, event));
  main.addEventListener("wheel", event => chartHandleWheel(container, event), { passive: false });
  navigator.addEventListener("pointerdown", event => chartHandleNavigatorDown(container, event));
  navigator.addEventListener("pointermove", event => chartHandleNavigatorMove(container, event));
  navigator.addEventListener("pointerup", event => chartFinishPointer(container, event));
  navigator.addEventListener("pointercancel", event => chartFinishPointer(container, event));
}

function chartObserveRenderer(container) {
  if (typeof ResizeObserver !== "function") return;
  if (!chartRendererResizeObserver) {
    chartRendererResizeObserver = new ResizeObserver(entries => {
      for (const entry of entries) {
        const state = chartRendererStates.get(entry.target);
        if (!state) continue;
        if (state.resizeFrame) cancelAnimationFrame(state.resizeFrame);
        state.resizeFrame = requestAnimationFrame(() => {
          state.resizeFrame = null;
          if (entry.target.isConnected) {
            if (state.isBoxplot) {
              chartRenderBoxplotState(entry.target, state);
            } else {
              chartRenderState(entry.target, state);
            }
          }
        });
      }
    });
  }
  chartRendererResizeObserver.observe(container);
}

function chartRenderState(container, state) {
  chartRenderLegend(container, state);
  chartRenderYScaleControls(container, state);
  chartRenderMain(container, state);
  chartRenderNavigator(container, state);
  chartRenderComparison(container, state);
  chartRenderSummary(container, state);
  chartRenderMode(container, state);
  chartRenderDateControls(container, state);
  container.querySelector(".chart-visible-range").textContent = chartRangeLabel(state.rows, state.startIndex, state.endIndex);
}

function chartRenderYScaleControls(container, state) {
  const group = container.querySelector(".chart-y-scale-group");
  const supported = chartSupportsManualYScale(state);
  if (group) group.hidden = !supported;
  container.querySelectorAll("[data-chart-y-scale]").forEach(button => {
    const active = supported && button.dataset.chartYScale === state.yScaleMode;
    button.classList.toggle("active", active);
    button.setAttribute("aria-pressed", String(active));
  });
}

function chartRenderDateControls(container, state) {
  const startInput = container.querySelector(".chart-range-start");
  const endInput = container.querySelector(".chart-range-end");
  const firstDate = chartDateInputValue(state.rows[0]);
  const lastDate = chartDateInputValue(state.rows[state.rows.length - 1]);
  for (const input of [startInput, endInput]) {
    if (!input) continue;
    input.min = firstDate;
    input.max = lastDate;
  }
  if (startInput) startInput.value = chartDateInputValue(state.rows[state.startIndex]);
  if (endInput) endInput.value = chartDateInputValue(state.rows[state.endIndex]);
}

function chartDateInputValue(row) {
  const direct = typeof row?.date === "string" ? row.date.trim() : "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(direct)) return direct;
  const timestamp = chartTimestamp(row);
  return Number.isFinite(timestamp) ? new Date(timestamp).toISOString().slice(0, 10) : "";
}

function chartRenderLegend(container, state) {
  container.querySelector(".chart-live-legend").innerHTML = state.series.filter(item => item.legend !== false).map(item => {
    const glyph = item.type === "bar" ? "bar" : item.type === "point" ? "point" : item.dash ? "dashed" : "line";
    const style = glyph === "dashed" ? `border-color:${chartSafeColor(item.color)}` : `background:${chartSafeColor(item.color)}`;
    const swatches = (item.negativeColor && item.negativeColor !== item.color)
      ? `<i class="chart-live-line ${glyph}" style="${glyph === "dashed" ? `border-color:${chartSafeColor(item.color)}` : `background:${chartSafeColor(item.color)}`}"></i><i class="chart-live-line ${glyph}" style="${glyph === "dashed" ? `border-color:${chartSafeColor(item.negativeColor)}` : `background:${chartSafeColor(item.negativeColor)}`}"></i>`
      : `<i class="chart-live-line ${glyph}" style="${style}"></i>`;
    return `<button type="button" class="chart-live-legend-item ${state.hiddenSeries.has(item.key) ? "muted" : ""}" data-chart-series="${chartEscape(item.key)}" aria-pressed="${String(!state.hiddenSeries.has(item.key))}">${swatches}${chartEscape(item.label)}</button>`;
  }).join("");
}

function chartVisibleSeries(state) {
  return state.series.filter(item => !state.hiddenSeries.has(item.key));
}

function chartRenderMain(container, state) {
  const shell = container.querySelector(".chart-main-shell");
  const svg = container.querySelector("svg.chart-main");
  const width = Math.max(320, Math.round(shell.clientWidth || container.clientWidth || 1000));
  const mobile = width < 720;
  const height = mobile ? 360 : 420;
  const supportsYScale = chartSupportsManualYScale(state);
  const visibleSeries = chartVisibleSeries(state);
  const leftSeries = visibleSeries.filter(item => item.yAxis !== "right");
  const rightSeries = visibleSeries.filter(item => item.yAxis === "right");
  const hasRightAxis = rightSeries.length > 0;
  const margin = { left: mobile ? 67 : 88, right: hasRightAxis ? (mobile ? 67 : 88) : (mobile ? 18 : 28), top: supportsYScale ? 62 : 24, bottom: 48 };
  const plotLeft = margin.left;
  const plotRight = width - margin.right;
  const plotTop = margin.top;
  const plotBottom = height - margin.bottom;
  const plotWidth = Math.max(40, plotRight - plotLeft);
  const plotHeight = Math.max(40, plotBottom - plotTop);
  const timeDomain = chartTimeDomain(state.rows, state.startIndex, state.endIndex, state.calendarPeriod);
  const { min: timeMin, max: timeMax, singleDateRange } = timeDomain;
  const xScale = timestamp => plotLeft + ((timestamp - timeMin) / (timeMax - timeMin)) * plotWidth;
  const leftValues = [];
  const rightValues = [];
  let stackedBands = [];
  if (state.stackMode) {
    stackedBands = chartStackedBands(state.rows, visibleSeries, state.startIndex, state.endIndex);
    for (const band of stackedBands) {
      for (const point of band.points) leftValues.push(point.upper);
    }
  } else {
    for (const item of visibleSeries) {
      const targetValues = item.yAxis === "right" ? rightValues : leftValues;
      for (const segment of chartLineSegments(state.rows, item.key, state.startIndex, state.endIndex)) {
        for (const point of segment) targetValues.push(point.value);
      }
    }
  }
  for (const line of state.referenceLines) leftValues.push(line.value);
  const autoLeftDomain = chartValueDomainForMode(leftValues, state.stackMode);
  const yScaleMode = supportsYScale ? chartNormalizedScaleMode(state.yScaleMode) : "linear";
  const hasManualDomain = supportsYScale
    && Number.isFinite(Number(state.yDomain?.min))
    && Number.isFinite(Number(state.yDomain?.max))
    && Number(state.yDomain.max) > Number(state.yDomain.min);
  const leftDomain = state.fixedYDomain
    ?? (hasManualDomain ? { min: Number(state.yDomain.min), max: Number(state.yDomain.max) } : autoLeftDomain);
  const symlogConstant = yScaleMode === "symlog"
    ? hasManualDomain && Number.isFinite(Number(state.ySymlogConstant)) && Number(state.ySymlogConstant) > 0
      ? Number(state.ySymlogConstant)
      : chartSymlogConstant(autoLeftDomain)
    : 1;
  const yScaleLeftModel = chartCreateYScale(leftDomain, yScaleMode, symlogConstant, plotTop, plotBottom);
  const yScaleLeft = yScaleLeftModel.map;
  const yTicksLeft = chartYTickValues(leftDomain, yScaleMode, symlogConstant, 5);

  let yScaleRight = null;
  let yTicksRight = [];
  if (hasRightAxis) {
    const autoRightDomain = chartValueDomainForMode(rightValues, null);
    const yScaleRightModel = chartCreateYScale(autoRightDomain, "linear", 1, plotTop, plotBottom);
    yScaleRight = yScaleRightModel.map;
    yTicksRight = chartYTickValues(autoRightDomain, "linear", 1, 5);
  }

  const yScaleForItem = item => (item?.yAxis === "right" && hasRightAxis ? yScaleRight : yScaleLeft);

  const grid = yTicksLeft.map(value => {
    const y = yScaleLeft(value);
    return `<line x1="${plotLeft}" x2="${plotRight}" y1="${y.toFixed(2)}" y2="${y.toFixed(2)}" stroke="rgba(36,72,102,.62)"/><text class="axis" x="${plotLeft - 10}" y="${(y + 5).toFixed(2)}" text-anchor="end">${chartEscape(chartFormatValue(state, value, leftSeries[0]?.key))}</text>`;
  }).join("");

  const rightAxisTicks = hasRightAxis ? yTicksRight.map(value => {
    const y = yScaleRight(value);
    return `<text class="axis" x="${plotRight + 10}" y="${(y + 5).toFixed(2)}" text-anchor="start">${chartEscape(chartFormatValue(state, value, rightSeries[0]?.key))}</text>`;
  }).join("") + `<line x1="${plotRight}" x2="${plotRight}" y1="${plotTop}" y2="${plotBottom}" stroke="rgba(36,72,102,.9)"/>` : "";

  const xTicks = [];
  if (state.calendarPeriod === "month") {
    for (const tick of chartMonthlyTicks(state.rows, state.startIndex, state.endIndex, mobile ? 4 : 12)) {
      const x = xScale(tick.timestamp);
      xTicks.push(`<line x1="${x.toFixed(2)}" x2="${x.toFixed(2)}" y1="${plotBottom}" y2="${plotBottom + 5}" stroke="rgba(36,72,102,.8)"/><text class="axis" x="${x.toFixed(2)}" y="${height - 13}" text-anchor="middle">${chartEscape(tick.label)}</text>`);
    }
  } else {
    const tickCount = singleDateRange ? 1 : mobile ? 4 : 6;
    for (let index = 0; index < tickCount; index += 1) {
      const ratio = tickCount === 1 ? 0.5 : index / (tickCount - 1);
      const timestamp = timeMin + ratio * (timeMax - timeMin);
      const x = plotLeft + ratio * plotWidth;
      const anchor = tickCount === 1 ? "middle" : index === 0 ? "start" : index === tickCount - 1 ? "end" : "middle";
      xTicks.push(`<line x1="${x.toFixed(2)}" x2="${x.toFixed(2)}" y1="${plotBottom}" y2="${plotBottom + 5}" stroke="rgba(36,72,102,.8)"/><text class="axis" x="${x.toFixed(2)}" y="${height - 13}" text-anchor="${anchor}">${chartEscape(chartAxisDate(timestamp, timeMax - timeMin))}</text>`);
    }
  }
  const marks = state.stackMode === "percent"
    ? chartRenderStackedMarks(state, stackedBands, xScale, yScaleLeft)
    : state.stackMode === "value"
      ? chartRenderStackedBarMarks(state, stackedBands, xScale, yScaleLeft)
      : visibleSeries.map(item => chartRenderSeriesMark(state, item, xScale, yScaleForItem(item))).join("");
  const references = state.referenceLines.map((line, index) => {
    const y = yScaleLeft(line.value);
    if (y < plotTop || y > plotBottom) return "";
    const labelY = chartClamp(y - 5 - index * 14, plotTop + 10, plotBottom - 4);
    return `<line x1="${plotLeft}" x2="${plotRight}" y1="${y.toFixed(2)}" y2="${y.toFixed(2)}" stroke="${chartSafeColor(line.color)}" stroke-width="1.2" stroke-dasharray="${chartEscape(line.dash)}"/><text class="axis chart-reference-label" x="${plotRight - 4}" y="${labelY.toFixed(2)}" text-anchor="end">${chartEscape(line.label)}</text>`;
  }).join("");
  const clipId = `${state.chartId.replace(/[^a-z0-9_-]+/gi, "-") || "chart"}-plot-clip`;
  const plotClip = chartPlotClipBounds(plotLeft, plotRight, plotTop, plotBottom);
  const axisLabel = `Y axis, ${yScaleMode}. Drag up to narrow or down to widen. Use Arrow Up and Arrow Down when focused; Home or Enter resets to Linear. Current range ${chartFormatValue(state, leftDomain.min)} to ${chartFormatValue(state, leftDomain.max)}.`;
  const yAxisTarget = supportsYScale
    ? `<rect class="chart-y-axis-drag-target" data-chart-y-axis x="0" y="${plotTop}" width="${Math.max(1, plotLeft - 2)}" height="${plotHeight}" fill="transparent" pointer-events="all" tabindex="0" role="button" aria-label="${chartEscape(axisLabel)}" aria-keyshortcuts="ArrowUp ArrowDown Home Enter Space"><title>Drag the Y axis to rescale; double-click to reset to Linear</title></rect>`
    : "";
  svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
  svg.setAttribute("preserveAspectRatio", "none");
  svg.classList.toggle("pan-cursor", state.mode === "pan");
  svg.classList.toggle("y-scaling", state.drag?.type === "y-scale");
  svg.innerHTML = `<defs><clipPath id="${clipId}"><rect x="${plotClip.x}" y="${plotClip.y}" width="${plotClip.width}" height="${plotClip.height}"/></clipPath></defs><g aria-hidden="true">${grid}${rightAxisTicks}${xTicks.join("")}${references}</g><g clip-path="url(#${clipId})">${marks}</g><line x1="${plotLeft}" x2="${plotRight}" y1="${plotBottom}" y2="${plotBottom}" stroke="rgba(36,72,102,.9)"/><g class="chart-selection-layer" clip-path="url(#${clipId})"></g><g class="chart-hover-layer" clip-path="url(#${clipId})"></g>${yAxisTarget}`;
  state.geometry = { width, height, plotLeft, plotRight, plotTop, plotBottom, plotWidth, plotHeight, timeMin, timeMax, xScale, yScale: yScaleLeft, yScaleLeft, yScaleRight, yScaleForItem, hasRightAxis, yDomain: leftDomain, yScaleMode, ySymlogConstant: symlogConstant };
  chartRenderSelection(container, state);
  if (state.hoverIndex !== null && state.hoverIndex >= state.startIndex && state.hoverIndex <= state.endIndex) chartShowHover(container, state, state.hoverIndex);
  else chartHideHover(container, state);
}

function chartRenderSeriesMark(state, item, xScale, yScale) {
  const segments = chartLineSegments(state.rows, item.key, state.startIndex, state.endIndex);
  if (item.type === "bar") {
    return segments.flatMap(segment => segment).map(point => {
      const x = xScale(chartTimestamp(state.rows[point.index]));
      const y = yScale(point.value);
      const zero = yScale(0);
      const width = chartBarWidth(state.rows, point.index, state.startIndex, state.endIndex, xScale);
      const color = point.value < 0 ? item.negativeColor : item.color;
      return `<rect x="${(x - width / 2).toFixed(2)}" y="${Math.min(y, zero).toFixed(2)}" width="${width.toFixed(2)}" height="${Math.max(1, Math.abs(zero - y)).toFixed(2)}" rx="1.5" fill="${chartSafeColor(color)}" fill-opacity=".72"/>`;
    }).join("");
  }
  if (item.type === "point") {
    return segments.flatMap(segment => segment).map(point => `<circle cx="${xScale(chartTimestamp(state.rows[point.index])).toFixed(2)}" cy="${yScale(point.value).toFixed(2)}" r="4.2" fill="${chartSafeColor(item.color)}" stroke="#071522" stroke-width="1.5"/>`).join("");
  }
  const d = segments.map(segment => segment.map((point, index) => {
    const timestamp = chartTimestamp(state.rows[point.index]);
    return `${index ? "L" : "M"} ${xScale(timestamp).toFixed(2)} ${yScale(point.value).toFixed(2)}`;
  }).join(" ")).join(" ");
  const singletonPoints = segments.filter(segment => segment.length === 1).map(segment => {
    const point = segment[0];
    return `<circle cx="${xScale(chartTimestamp(state.rows[point.index])).toFixed(2)}" cy="${yScale(point.value).toFixed(2)}" r="3.5" fill="#071522" stroke="${chartSafeColor(item.color)}" stroke-width="2"/>`;
  }).join("");
  const linePoints = item.points ? segments.flatMap(segment => segment).map(point =>
    `<circle cx="${xScale(chartTimestamp(state.rows[point.index])).toFixed(2)}" cy="${yScale(point.value).toFixed(2)}" r="3.2" fill="#071522" stroke="${chartSafeColor(item.color)}" stroke-width="1.8"/>`
  ).join("") : "";
  const dash = item.dash ? ` stroke-dasharray="${chartEscape(item.dash)}"` : "";
  return `<path d="${d}" fill="none" stroke="${chartSafeColor(item.color)}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"${dash}/>${item.points ? linePoints : singletonPoints}`;
}

function chartRenderStackedMarks(state, bands, xScale, yScale) {
  return bands.map(band => {
    if (!band.points.length) return "";
    const upper = band.points.map((point, index) => `${index ? "L" : "M"} ${xScale(chartTimestamp(state.rows[point.index])).toFixed(2)} ${yScale(point.upper).toFixed(2)}`).join(" ");
    const lower = [...band.points].reverse().map(point => `L ${xScale(chartTimestamp(state.rows[point.index])).toFixed(2)} ${yScale(point.lower).toFixed(2)}`).join(" ");
    const outline = band.points.map((point, index) => `${index ? "L" : "M"} ${xScale(chartTimestamp(state.rows[point.index])).toFixed(2)} ${yScale(point.upper).toFixed(2)}`).join(" ");
    return `<path d="${upper} ${lower} Z" fill="${chartSafeColor(band.color)}" fill-opacity=".5" stroke="none"/><path d="${outline}" fill="none" stroke="${chartSafeColor(band.color)}" stroke-width="1.2" stroke-opacity=".9"/>`;
  }).join("");
}

function chartRenderStackedBarMarks(state, bands, xScale, yScale) {
  return bands.map(band => band.points.map(point => {
    if (point.value <= 0) return "";
    const x = xScale(chartTimestamp(state.rows[point.index]));
    const upper = yScale(point.upper);
    const lower = yScale(point.lower);
    const width = chartBarWidth(state.rows, point.index, state.startIndex, state.endIndex, xScale);
    return `<rect x="${(x - width / 2).toFixed(2)}" y="${Math.min(upper, lower).toFixed(2)}" width="${width.toFixed(2)}" height="${Math.max(1, Math.abs(lower - upper)).toFixed(2)}" rx="1.5" fill="${chartSafeColor(band.color)}" fill-opacity=".82"/>`;
  }).join("")).join("");
}

function chartBarWidth(rows, index, startIndex, endIndex, xScale) {
  const x = xScale(chartTimestamp(rows[index]));
  const distances = [];
  if (index > startIndex) distances.push(Math.abs(x - xScale(chartTimestamp(rows[index - 1]))));
  if (index < endIndex) distances.push(Math.abs(xScale(chartTimestamp(rows[index + 1])) - x));
  const nearest = distances.filter(Number.isFinite).length ? Math.min(...distances.filter(Number.isFinite)) : 10;
  return chartClamp(nearest * 0.72, 1.2, 14);
}

function chartValueDomain(values) {
  if (!values.length) return { min: 0, max: 1 };
  let min = Math.min(0, ...values);
  let max = Math.max(0, ...values);
  if (min === max) max = min + Math.max(1, Math.abs(min) * 0.1);
  if (max > 0) max += (max - min) * 0.06;
  if (min < 0) min -= (max - min) * 0.06;
  return { min, max };
}

export function chartValueDomainForMode(values, stackMode = null) {
  return stackMode === "percent" ? { min: 0, max: 1 } : chartValueDomain(values);
}

function chartNormalizedScaleMode(mode) {
  return String(mode).toLowerCase() === "symlog" ? "symlog" : "linear";
}

export function chartSymlogConstant(domain) {
  const maximum = Math.max(Math.abs(Number(domain?.min) || 0), Math.abs(Number(domain?.max) || 0));
  if (!(maximum > 0)) return 1;
  return 10 ** (Math.floor(Math.log10(maximum)) - 2);
}

export function chartSymlogTransform(value, constant = 1) {
  const number = Number(value);
  const safeConstant = Number.isFinite(Number(constant)) && Number(constant) > 0 ? Number(constant) : 1;
  if (!Number.isFinite(number) || number === 0) return Number.isFinite(number) ? 0 : NaN;
  return Math.sign(number) * Math.log1p(Math.abs(number) / safeConstant);
}

export function chartSymlogInverse(value, constant = 1) {
  const number = Number(value);
  const safeConstant = Number.isFinite(Number(constant)) && Number(constant) > 0 ? Number(constant) : 1;
  if (!Number.isFinite(number) || number === 0) return Number.isFinite(number) ? 0 : NaN;
  return Math.sign(number) * safeConstant * Math.expm1(Math.abs(number));
}

export function chartCreateYScale(domain, mode = "linear", constant = 1, pixelTop = 0, pixelBottom = 1) {
  let minimum = Number(domain?.min);
  let maximum = Number(domain?.max);
  if (!Number.isFinite(minimum) || !Number.isFinite(maximum)) {
    minimum = 0;
    maximum = 1;
  }
  if (minimum > maximum) [minimum, maximum] = [maximum, minimum];
  if (minimum === maximum) maximum = minimum + Math.max(1, Math.abs(minimum) * 0.1);
  const normalizedMode = chartNormalizedScaleMode(mode);
  const transform = normalizedMode === "symlog"
    ? value => chartSymlogTransform(value, constant)
    : value => Number(value);
  const inverse = normalizedMode === "symlog"
    ? value => chartSymlogInverse(value, constant)
    : value => Number(value);
  const transformedMin = transform(minimum);
  const transformedMax = transform(maximum);
  const transformedSpan = Math.max(Number.EPSILON, transformedMax - transformedMin);
  const top = Number(pixelTop);
  const bottom = Number(pixelBottom);
  const pixelSpan = bottom - top;
  return {
    map(value) {
      return bottom - (transform(value) - transformedMin) / transformedSpan * pixelSpan;
    },
    invert(pixel) {
      return inverse(transformedMin + (bottom - Number(pixel)) / Math.max(Number.EPSILON, pixelSpan) * transformedSpan);
    },
    mode: normalizedMode,
    constant,
    domain: { min: minimum, max: maximum }
  };
}

export function chartScaleYDomain(domain, deltaPixels, plotHeight, mode = "linear", constant = 1) {
  const scaleMode = chartNormalizedScaleMode(mode);
  const transform = scaleMode === "symlog"
    ? value => chartSymlogTransform(value, constant)
    : value => Number(value);
  const inverse = scaleMode === "symlog"
    ? value => chartSymlogInverse(value, constant)
    : value => Number(value);
  const minimum = Number(domain?.min);
  const maximum = Number(domain?.max);
  if (!Number.isFinite(minimum) || !Number.isFinite(maximum) || maximum <= minimum) return { min: 0, max: 1 };
  const height = Math.max(1, Math.abs(Number(plotHeight)) || 1);
  const factor = Math.exp(chartClamp(Number(deltaPixels) / height * 2, -4, 4));
  const transformedMin = transform(minimum);
  const transformedMax = transform(maximum);
  let nextMin;
  let nextMax;
  if (minimum <= 0 && maximum >= 0) {
    nextMin = transformedMin * factor;
    nextMax = transformedMax * factor;
  } else {
    const center = (transformedMin + transformedMax) / 2;
    nextMin = center + (transformedMin - center) * factor;
    nextMax = center + (transformedMax - center) * factor;
  }
  const min = inverse(nextMin);
  const max = inverse(nextMax);
  return {
    min: Math.abs(min) < Number.EPSILON ? 0 : min,
    max: Math.abs(max) < Number.EPSILON ? 0 : max
  };
}

function chartNiceStep(range, count) {
  const rough = Math.abs(range) / Math.max(1, count);
  const power = 10 ** Math.floor(Math.log10(rough || 1));
  const value = rough / power;
  return (value >= 5 ? 5 : value >= 2 ? 2 : 1) * power;
}

function chartTickValues(min, max, count) {
  const step = chartNiceStep(max - min, count);
  const values = [];
  for (let value = Math.ceil(min / step) * step; value <= max + step * 0.01; value += step) values.push(Math.abs(value) < 1e-10 ? 0 : value);
  return values.length >= 2 ? values : [min, max];
}

export function chartYTickValues(domain, mode = "linear", constant = 1, count = 5) {
  const minimum = Number(domain?.min);
  const maximum = Number(domain?.max);
  if (!Number.isFinite(minimum) || !Number.isFinite(maximum) || maximum <= minimum) return [0, 1];
  if (chartNormalizedScaleMode(mode) !== "symlog") return chartTickValues(minimum, maximum, count);
  const safeCount = Math.max(3, Math.trunc(Number(count) || 5));
  const transformedMin = chartSymlogTransform(minimum, constant);
  const transformedMax = chartSymlogTransform(maximum, constant);
  const ticks = Array.from({ length: safeCount }, (_, index) => {
    const transformed = transformedMin + index / (safeCount - 1) * (transformedMax - transformedMin);
    const value = chartSymlogInverse(transformed, constant);
    return Math.abs(value) < Math.max(1, Math.abs(maximum - minimum)) * 1e-12 ? 0 : Number(value.toPrecision(10));
  });
  if (minimum < 0 && maximum > 0 && !ticks.includes(0)) {
    let closest = 0;
    for (let index = 1; index < ticks.length; index += 1) {
      if (Math.abs(ticks[index]) < Math.abs(ticks[closest])) closest = index;
    }
    ticks[closest] = 0;
  }
  return [...new Set(ticks)].sort((a, b) => a - b);
}

function chartAxisDate(timestamp, span) {
  const date = new Date(timestamp);
  const days = span / chartDayMilliseconds;
  const options = days > 500 ? { month: "short", year: "numeric", timeZone: "UTC" }
    : days > 60 ? { day: "2-digit", month: "short", timeZone: "UTC" }
      : { day: "2-digit", month: "2-digit", timeZone: "UTC" };
  return date.toLocaleDateString("en-GB", options);
}

function chartRenderNavigator(container, state) {
  const svg = container.querySelector("svg.chart-navigator");
  const width = Math.max(280, Math.round(svg.clientWidth || container.clientWidth || 900));
  const height = 72;
  const left = 8;
  const right = width - 8;
  const top = 8;
  const bottom = height - 8;
  let timeMin = chartTimestamp(state.rows[0]);
  let timeMax = chartTimestamp(state.rows[state.rows.length - 1]);
  if (!Number.isFinite(timeMin)) timeMin = 0;
  if (!Number.isFinite(timeMax) || timeMax <= timeMin) {
    const center = timeMin;
    timeMin = center - chartDayMilliseconds / 2;
    timeMax = center + chartDayMilliseconds / 2;
  }
  const xScale = timestamp => left + ((timestamp - timeMin) / (timeMax - timeMin)) * (right - left);
  const primary = chartVisibleSeries(state)[0] || state.series[0];
  const segments = chartLineSegments(state.rows, primary.key, 0, state.rows.length - 1);
  const values = segments.flatMap(segment => segment.map(point => point.value));
  const domain = chartValueDomain(values);
  const yScaleMode = state.stackMode === "percent" ? "linear" : chartNormalizedScaleMode(state.yScaleMode);
  const symlogConstant = yScaleMode === "symlog" ? chartSymlogConstant(domain) : 1;
  const yScale = chartCreateYScale(domain, yScaleMode, symlogConstant, top, bottom).map;
  const d = segments.map(segment => segment.map((point, index) => `${index ? "L" : "M"} ${xScale(chartTimestamp(state.rows[point.index])).toFixed(2)} ${yScale(point.value).toFixed(2)}`).join(" ")).join(" ");
  const xStart = xScale(chartTimestamp(state.rows[state.startIndex]));
  const xEnd = xScale(chartTimestamp(state.rows[state.endIndex]));
  svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
  svg.setAttribute("preserveAspectRatio", "none");
  svg.innerHTML = `<path d="${d}" fill="none" stroke="${chartSafeColor(primary.color)}" stroke-opacity=".62" stroke-width="1.5"/><rect x="${left}" y="0" width="${Math.max(0, xStart - left).toFixed(2)}" height="${height}" fill="rgba(7,21,34,.76)"/><rect x="${xEnd.toFixed(2)}" y="0" width="${Math.max(0, right - xEnd).toFixed(2)}" height="${height}" fill="rgba(7,21,34,.76)"/><rect x="${xStart.toFixed(2)}" y="1" width="${Math.max(2, xEnd - xStart).toFixed(2)}" height="${height - 2}" fill="rgba(25,181,254,.055)" stroke="rgba(62,220,129,.72)" rx="7"/><rect x="${(xStart - 3).toFixed(2)}" y="20" width="6" height="32" rx="3" fill="#19b5fe"/><rect x="${(xEnd - 3).toFixed(2)}" y="20" width="6" height="32" rx="3" fill="#3edc81"/>`;
  state.navigatorGeometry = { width, left, right, xScale, xStart, xEnd, timeMin, timeMax };
}

function chartRenderSummary(container, state) {
  const summarySeries = chartVisibleSeries(state).filter(item => item.summary);
  const summary = summarizeChartRange(state.rows, summarySeries, state.startIndex, state.endIndex, state.valueMode);
  const rangeLabel = chartRangeLabel(state.rows, state.startIndex, state.endIndex);
  const rows = summary.map(item => {
    const values = state.valueMode === "flow"
      ? [["Total", item.total], ["Observed-day average", item.average], ["Peak", item.peak, item.peakDate], ["Observations", item.validCount, null, true]]
      : state.valueMode === "ratio"
        ? [["Average", item.average], ["Latest", item.end], ["Minimum", item.min], ["Maximum", item.max]]
        : [["Start", item.start], ["End", item.end], ["Change", item.delta, item.percent], ["Visible range", item.min, item.max]];
    return `<div class="chart-summary-row"><div class="chart-summary-label"><i class="chart-live-line" style="background:${chartSafeColor(item.color)}"></i>${chartEscape(item.label)}</div><div class="chart-summary-values">${values.map(([label, value, detail, integer]) => `<span>${chartEscape(label)}<strong>${integer ? chartEscape(String(value ?? 0)) : chartEscape(chartFormatValue(state, value))}${label === "Change" && Number.isFinite(detail) ? ` · ${detail >= 0 ? "+" : ""}${detail.toFixed(2)}%` : ""}${label === "Visible range" ? ` — ${chartEscape(chartFormatValue(state, detail))}` : ""}</strong>${label === "Peak" && detail ? `<small>${chartEscape(detail)}</small>` : ""}</span>`).join("")}</div></div>`;
  }).join("");
  container.querySelector(".chart-range-summary").innerHTML = `<div class="chart-summary-period"><span>Visible interval:</span><strong>${chartEscape(rangeLabel)}</strong></div>${rows}`;
}

function chartRenderComparison(container, state) {
  const panel = container.querySelector(".chart-comparison");
  if (!state.comparison) {
    panel.classList.add("hidden");
    panel.innerHTML = "";
    return;
  }
  const startIndex = Math.min(state.comparison.a, state.comparison.b);
  const endIndex = Math.max(state.comparison.a, state.comparison.b);
  const startDate = state.rows[startIndex]?.date ?? "unknown";
  const endDate = state.rows[endIndex]?.date ?? "unknown";
  const summarySeries = chartVisibleSeries(state).filter(item => item.summary);
  const summaries = summarizeChartRange(state.rows, summarySeries, startIndex, endIndex, state.valueMode);
  const lines = summaries.map(item => state.valueMode === "flow"
    ? `<p><strong style="color:${chartSafeColor(item.color)}">${chartEscape(item.label)}</strong> · total ${chartEscape(chartFormatValue(state, item.total))} · observed-day average ${chartEscape(chartFormatValue(state, item.average))} · peak ${chartEscape(chartFormatValue(state, item.peak))}</p>`
    : state.valueMode === "ratio"
      ? `<p><strong style="color:${chartSafeColor(item.color)}">${chartEscape(item.label)}</strong> · average ${chartEscape(chartFormatValue(state, item.average))} · latest ${chartEscape(chartFormatValue(state, item.end))} · range ${chartEscape(chartFormatValue(state, item.min))} — ${chartEscape(chartFormatValue(state, item.max))}</p>`
      : `<p><strong style="color:${chartSafeColor(item.color)}">${chartEscape(item.label)}</strong> · ${chartEscape(chartFormatValue(state, item.start))} → ${chartEscape(chartFormatValue(state, item.end))} · change ${chartEscape(chartSignedValue(state, item.delta))}${Number.isFinite(item.percent) ? ` (${item.percent >= 0 ? "+" : ""}${item.percent.toFixed(2)}%)` : ""}</p>`
  ).join("");
  const comparisonTitle = state.valueMode === "stock" ? "Date comparison" : "Selected interval";
  panel.innerHTML = `<button type="button" class="chart-icon-button" data-chart-action="clear-comparison" aria-label="Clear comparison">×</button><h3>${comparisonTitle}: ${chartEscape(startDate)} — ${chartEscape(endDate)}</h3>${lines}`;
  panel.classList.remove("hidden");
}

function chartRenderSelection(container, state) {
  const layer = container.querySelector(".chart-selection-layer");
  if (!layer || !state.geometry || !state.comparison) {
    if (layer) layer.innerHTML = "";
    return;
  }
  const a = state.rows[state.comparison.a];
  const b = state.rows[state.comparison.b];
  if (!a || !b) return;
  const xA = state.geometry.xScale(chartTimestamp(a));
  const xB = state.geometry.xScale(chartTimestamp(b));
  const left = Math.min(xA, xB);
  const right = Math.max(xA, xB);
  layer.innerHTML = `<rect x="${left.toFixed(2)}" y="${state.geometry.plotTop}" width="${Math.max(1, right - left).toFixed(2)}" height="${state.geometry.plotHeight}" fill="rgba(25,181,254,.07)"/><line x1="${xA.toFixed(2)}" x2="${xA.toFixed(2)}" y1="${state.geometry.plotTop}" y2="${state.geometry.plotBottom}" stroke="#19b5fe" stroke-dasharray="3 4"/><line x1="${xB.toFixed(2)}" x2="${xB.toFixed(2)}" y1="${state.geometry.plotTop}" y2="${state.geometry.plotBottom}" stroke="#3edc81" stroke-dasharray="3 4"/>`;
}

function chartRenderMode(container, state) {
  container.querySelectorAll("[data-chart-mode]").forEach(button => {
    const active = button.dataset.chartMode === state.mode;
    button.classList.toggle("active", active);
    button.setAttribute("aria-pressed", String(active));
  });
}

function chartHandleRendererClick(container, event) {
  const state = chartRendererStates.get(container);
  if (!state) return;
  const seriesButton = event.target.closest?.("[data-chart-series]");
  if (seriesButton && container.contains(seriesButton)) {
    const key = seriesButton.dataset.chartSeries;
    if (state.hiddenSeries.has(key)) state.hiddenSeries.delete(key);
    else if (chartVisibleSeries(state).length > 1) state.hiddenSeries.add(key);
    state.comparison = null;
    chartRenderState(container, state);
    [...container.querySelectorAll("[data-chart-series]")].find(button => button.dataset.chartSeries === key)?.focus();
    return;
  }
  const yScaleButton = event.target.closest?.("[data-chart-y-scale]");
  if (yScaleButton && container.contains(yScaleButton) && chartSupportsManualYScale(state)) {
    state.yScaleMode = yScaleButton.dataset.chartYScale === "symlog" ? "symlog" : "linear";
    state.yDomain = null;
    state.ySymlogConstant = null;
    chartRenderState(container, state);
    yScaleButton.focus?.();
    return;
  }
  const modeButton = event.target.closest?.("[data-chart-mode]");
  if (modeButton && container.contains(modeButton)) {
    state.mode = modeButton.dataset.chartMode === "pan" ? "pan" : "compare";
    chartHideHover(container, state);
    chartRenderMode(container, state);
    container.querySelector("svg.chart-main").classList.toggle("pan-cursor", state.mode === "pan");
    return;
  }
  const actionButton = event.target.closest?.("[data-chart-action]");
  if (!actionButton || !container.contains(actionButton)) return;
  const action = actionButton.dataset.chartAction;
  if (action === "clear-comparison") {
    state.comparison = null;
    chartRenderSelection(container, state);
    chartRenderComparison(container, state);
  } else if (action === "reset") {
    Object.assign(state, chartRangeForPeriod(state.rows, state.period));
    state.comparison = null;
    chartResetYScale(state);
    state.onRangeChange?.({ custom: false, period: state.period, startDate: state.rows[state.startIndex]?.date, endDate: state.rows[state.endIndex]?.date });
    chartRenderState(container, state);
  } else if (action === "zoom-in" || action === "zoom-out") {
    chartApplyZoom(container, state, action === "zoom-in" ? 0.7 : 1.4);
  }
}

function chartHandleRangeInput(container, event) {
  const state = chartRendererStates.get(container);
  if (!state) return;
  const input = event.target.closest?.(".chart-range-start, .chart-range-end");
  if (!input || !container.contains(input)) return;
  const boundary = input.classList.contains("chart-range-start") ? "start" : "end";
  Object.assign(state, chartRangeWithDate(
    state.rows,
    state.startIndex,
    state.endIndex,
    boundary,
    input.value
  ));
  state.comparison = null;
  chartNotifyCustomRange(state);
  chartRenderState(container, state);
}

function chartMainPoint(container, event, state) {
  const rect = container.querySelector("svg.chart-main").getBoundingClientRect();
  return {
    x: (event.clientX - rect.left) / Math.max(1, rect.width) * state.geometry.width,
    y: (event.clientY - rect.top) / Math.max(1, rect.height) * state.geometry.height
  };
}

function chartHandleMainDown(container, event) {
  const state = chartRendererStates.get(container);
  if (!state?.geometry || (event.pointerType === "mouse" && event.button !== 0)) return;
  const point = chartMainPoint(container, event, state);
  const yAxisTarget = event.target.closest?.("[data-chart-y-axis]");
  if (yAxisTarget && chartSupportsManualYScale(state) && point.y >= state.geometry.plotTop && point.y <= state.geometry.plotBottom) {
    event.preventDefault();
    const svg = container.querySelector("svg.chart-main");
    svg.setPointerCapture?.(event.pointerId);
    chartHideHover(container, state);
    state.drag = {
      type: "y-scale",
      pointerId: event.pointerId,
      startY: point.y,
      startDomain: { ...state.geometry.yDomain },
      scaleMode: state.geometry.yScaleMode,
      symlogConstant: state.geometry.ySymlogConstant
    };
    state.ySymlogConstant = state.geometry.ySymlogConstant;
    svg.classList.add("y-scaling");
    return;
  }
  if (point.x < state.geometry.plotLeft || point.x > state.geometry.plotRight || point.y < state.geometry.plotTop || point.y > state.geometry.plotBottom) return;
  event.preventDefault();
  const svg = container.querySelector("svg.chart-main");
  svg.setPointerCapture?.(event.pointerId);
  chartHideHover(container, state);
  if (state.mode === "pan") {
    state.drag = { type: "pan", pointerId: event.pointerId, startX: point.x, startIndex: state.startIndex, endIndex: state.endIndex };
    svg.classList.add("dragging");
    return;
  }
  const index = chartNearestRenderableIndex(state, chartTimestampFromX(state.geometry, point.x));
  state.comparison = { a: index, b: index };
  state.drag = { type: "compare", pointerId: event.pointerId };
  chartRenderSelection(container, state);
  chartRenderComparison(container, state);
}

function chartHandleMainMove(container, event) {
  const state = chartRendererStates.get(container);
  if (!state?.geometry) return;
  const point = chartMainPoint(container, event, state);
  if (!state.drag) {
    if (point.x >= state.geometry.plotLeft && point.x <= state.geometry.plotRight && point.y >= state.geometry.plotTop && point.y <= state.geometry.plotBottom) {
      chartShowHover(container, state, chartNearestRenderableIndex(state, chartTimestampFromX(state.geometry, point.x)));
    } else chartHideHover(container, state);
    return;
  }
  if (state.drag.pointerId !== event.pointerId) return;
  if (state.drag.type === "y-scale") {
    const domain = chartScaleYDomain(
      state.drag.startDomain,
      point.y - state.drag.startY,
      state.geometry.plotHeight,
      state.drag.scaleMode,
      state.drag.symlogConstant
    );
    if (Number.isFinite(domain.min) && Number.isFinite(domain.max) && domain.max > domain.min) {
      state.yDomain = domain;
      state.ySymlogConstant = state.drag.symlogConstant;
      chartRenderState(container, state);
    }
    return;
  }
  if (state.drag.type === "compare") {
    state.comparison.b = chartNearestRenderableIndex(state, chartTimestampFromX(state.geometry, point.x));
    chartRenderSelection(container, state);
    chartRenderComparison(container, state);
    return;
  }
  if (state.drag.type === "pan") {
    const startTime = chartTimestamp(state.rows[state.drag.startIndex]);
    const endTime = chartTimestamp(state.rows[state.drag.endIndex]);
    const fullDuration = Math.max(0, chartTimestamp(state.rows[state.rows.length - 1]) - chartTimestamp(state.rows[0]));
    const visibleDuration = Math.max(endTime - startTime, fullDuration / Math.max(1, state.rows.length - 1));
    const shiftTime = Math.round((state.drag.startX - point.x) / state.geometry.plotWidth * visibleDuration);
    Object.assign(state, panChartRangeByTime(state.rows, state.drag.startIndex, state.drag.endIndex, shiftTime));
    state.comparison = null;
    chartNotifyCustomRange(state);
    chartRenderState(container, state);
  }
}

function chartHandleMainFocus(container) {
  const state = chartRendererStates.get(container);
  if (!state?.geometry) return;
  const current = state.hoverIndex != null && state.hoverIndex >= state.startIndex && state.hoverIndex <= state.endIndex
    ? state.hoverIndex
    : chartKeyboardRenderableIndex(state, state.endIndex, -1);
  chartShowHover(container, state, current);
}

function chartHandleMainKeyDown(container, event) {
  const state = chartRendererStates.get(container);
  const yAxisTarget = event.target.closest?.("[data-chart-y-axis]");
  if (state?.geometry && yAxisTarget && ["ArrowUp", "ArrowDown", "Home", "Enter", " "].includes(event.key)) {
    event.preventDefault();
    if (["Home", "Enter", " "].includes(event.key)) {
      chartResetYScale(state);
    } else {
      const delta = (event.key === "ArrowUp" ? -1 : 1) * state.geometry.plotHeight * 0.12;
      state.yDomain = chartScaleYDomain(
        state.geometry.yDomain,
        delta,
        state.geometry.plotHeight,
        state.geometry.yScaleMode,
        state.geometry.ySymlogConstant
      );
      state.ySymlogConstant = state.geometry.ySymlogConstant;
    }
    chartRenderState(container, state);
    container.querySelector("[data-chart-y-axis]")?.focus?.();
    return;
  }
  if (!state?.geometry || !["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
  event.preventDefault();
  let index = state.hoverIndex != null ? state.hoverIndex : state.endIndex;
  if (event.key === "Home") index = chartKeyboardRenderableIndex(state, state.startIndex, 1);
  else if (event.key === "End") index = chartKeyboardRenderableIndex(state, state.endIndex, -1);
  else index = chartKeyboardRenderableIndex(state, index + (event.key === "ArrowLeft" ? -1 : 1), event.key === "ArrowLeft" ? -1 : 1);
  chartShowHover(container, state, index);
}

function chartHandleMainDoubleClick(container, event) {
  const state = chartRendererStates.get(container);
  if (!state?.geometry || !chartSupportsManualYScale(state)) return;
  const point = chartMainPoint(container, event, state);
  if (!event.target.closest?.("[data-chart-y-axis]") && point.x > state.geometry.plotLeft) return;
  event.preventDefault();
  chartResetYScale(state);
  chartRenderState(container, state);
}

function chartKeyboardRenderableIndex(state, start, direction) {
  const visibleSeries = chartVisibleSeries(state);
  let index = chartClamp(start, state.startIndex, state.endIndex);
  while (index >= state.startIndex && index <= state.endIndex) {
    if (visibleSeries.some(item => chartValidNumber(state.rows[index]?.[item.key]))) return index;
    index += direction;
  }
  return direction < 0 ? state.startIndex : state.endIndex;
}

function chartHandleWheel(container, event) {
  const state = chartRendererStates.get(container);
  if (!state?.geometry || !chartWheelShouldZoom(event)) return;
  event.preventDefault();
  const point = chartMainPoint(container, event, state);
  const center = nearestChartIndex(state.rows, chartTimestampFromX(state.geometry, point.x), state.startIndex, state.endIndex);
  chartApplyZoom(container, state, event.deltaY > 0 ? 1.22 : 0.82, center);
}

export function chartWheelShouldZoom(event) {
  return Boolean(event?.ctrlKey || event?.metaKey);
}

function chartApplyZoom(container, state, factor, center) {
  Object.assign(state, zoomChartRange(state.rows.length, state.startIndex, state.endIndex, factor, center));
  state.comparison = null;
  chartNotifyCustomRange(state);
  chartRenderState(container, state);
}

function chartNavigatorPoint(container, event, state) {
  const svg = container.querySelector("svg.chart-navigator");
  const rect = svg.getBoundingClientRect();
  return (event.clientX - rect.left) / Math.max(1, rect.width) * state.navigatorGeometry.width;
}

function chartHandleNavigatorDown(container, event) {
  const state = chartRendererStates.get(container);
  if (!state?.navigatorGeometry || state.rows.length < 2 || (event.pointerType === "mouse" && event.button !== 0)) return;
  event.preventDefault();
  const svg = container.querySelector("svg.chart-navigator");
  const x = chartNavigatorPoint(container, event, state);
  const geometry = state.navigatorGeometry;
  let type = "nav-pan";
  if (Math.abs(x - geometry.xStart) <= 12) type = "nav-start";
  else if (Math.abs(x - geometry.xEnd) <= 12) type = "nav-end";
  else if (x < geometry.xStart || x > geometry.xEnd) {
    const targetTime = chartTimestampFromNavigatorX(geometry, x);
    const currentStart = chartTimestamp(state.rows[state.startIndex]);
    const currentEnd = chartTimestamp(state.rows[state.endIndex]);
    Object.assign(state, panChartRangeByTime(state.rows, state.startIndex, state.endIndex, targetTime - (currentStart + currentEnd) / 2));
    chartNotifyCustomRange(state);
    chartRenderState(container, state);
  }
  state.drag = { type, pointerId: event.pointerId, startX: x, startIndex: state.startIndex, endIndex: state.endIndex };
  svg.setPointerCapture?.(event.pointerId);
}

function chartHandleNavigatorMove(container, event) {
  const state = chartRendererStates.get(container);
  if (!state?.drag?.type?.startsWith("nav") || state.drag.pointerId !== event.pointerId) return;
  const x = chartNavigatorPoint(container, event, state);
  const index = nearestChartIndex(state.rows, chartTimestampFromNavigatorX(state.navigatorGeometry, x), 0, state.rows.length - 1);
  if (state.drag.type === "nav-start") state.startIndex = chartClamp(index, 0, state.endIndex - 1);
  else if (state.drag.type === "nav-end") state.endIndex = chartClamp(index, state.startIndex + 1, state.rows.length - 1);
  else {
    const fullDuration = Math.max(0, chartTimestamp(state.rows[state.rows.length - 1]) - chartTimestamp(state.rows[0]));
    const shiftTime = Math.round((x - state.drag.startX) / Math.max(1, state.navigatorGeometry.right - state.navigatorGeometry.left) * fullDuration);
    Object.assign(state, panChartRangeByTime(state.rows, state.drag.startIndex, state.drag.endIndex, shiftTime));
  }
  state.comparison = null;
  chartNotifyCustomRange(state);
  chartRenderState(container, state);
}

function chartFinishPointer(container, event) {
  const state = chartRendererStates.get(container);
  if (!state?.drag || state.drag.pointerId !== event.pointerId) return;
  const target = event.currentTarget;
  if (target.hasPointerCapture?.(event.pointerId)) target.releasePointerCapture(event.pointerId);
  state.drag = null;
  container.querySelector("svg.chart-main").classList.remove("dragging");
  container.querySelector("svg.chart-main").classList.remove("y-scaling");
  chartRenderSelection(container, state);
  chartRenderComparison(container, state);
}

function chartNearestRenderableIndex(state, timestamp) {
  let nearest = state.startIndex;
  let distance = Infinity;
  const visibleSeries = chartVisibleSeries(state);
  for (let index = state.startIndex; index <= state.endIndex; index += 1) {
    if (!visibleSeries.some(item => chartValidNumber(state.rows[index]?.[item.key]))) continue;
    const candidate = chartTimestamp(state.rows[index]);
    const nextDistance = Math.abs(candidate - timestamp);
    if (nextDistance < distance) {
      nearest = index;
      distance = nextDistance;
    }
  }
  return nearest;
}

export function chartShowHover(container, state, index) {
  const row = state.rows[index];
  if (!row || !state.geometry) return;
  const x = state.geometry.xScale(chartTimestamp(row));
  const visibleSeries = chartVisibleSeries(state);
  const circles = state.stackMode ? "" : visibleSeries.map(item => {
    const value = row[item.key];
    const color = (chartValidNumber(value) && value < 0 && item.negativeColor) ? item.negativeColor : item.color;
    const yScale = state.geometry.yScaleForItem ? state.geometry.yScaleForItem(item) : state.geometry.yScale;
    return chartValidNumber(value) ? `<circle cx="${x.toFixed(2)}" cy="${yScale(value).toFixed(2)}" r="4.5" fill="#071522" stroke="${chartSafeColor(color)}" stroke-width="2"/>` : "";
  }).join("");
  container.querySelector(".chart-hover-layer").innerHTML = `<line x1="${x.toFixed(2)}" x2="${x.toFixed(2)}" y1="${state.geometry.plotTop}" y2="${state.geometry.plotBottom}" stroke="rgba(169,191,211,.55)" stroke-dasharray="2 4"/>${circles}`;
  const tooltip = container.querySelector(".chart-tooltip");
  tooltip.hidden = false;
  tooltip.setAttribute("aria-hidden", "false");
  tooltip.innerHTML = `<div class="chart-tooltip-date">${chartEscape(chartObservationLabel(row, state.calendarPeriod))}</div>${visibleSeries.map(item => {
    const value = row[item.key];
    const color = (chartValidNumber(value) && value < 0 && item.negativeColor) ? item.negativeColor : item.color;
    const glyph = item.type === "bar" ? "bar" : item.type === "point" ? "point" : item.dash ? "dashed" : "line";
    const style = glyph === "dashed" ? `border-color:${chartSafeColor(color)}` : `background:${chartSafeColor(color)}`;
    return `<div class="chart-tooltip-row"><span><i class="chart-live-line ${glyph}" style="${style}"></i>${chartEscape(item.label)}</span><span class="chart-tooltip-value">${chartEscape(chartFormatValue(state, value, item.key))}</span></div>`;
  }).join("")}`;
  tooltip.classList.add("visible");
  const shell = container.querySelector(".chart-main-shell");
  const shellWidth = shell.clientWidth || state.geometry.width;
  const shellHeight = shell.clientHeight || state.geometry.height;
  const pixelX = x / state.geometry.width * shellWidth;
  const primaryItem = visibleSeries[0] || state.series[0];
  const primaryValue = row[primaryItem?.key];
  const primaryYScale = state.geometry.yScaleForItem ? state.geometry.yScaleForItem(primaryItem) : state.geometry.yScale;
  const pixelY = chartValidNumber(primaryValue) ? primaryYScale(primaryValue) / state.geometry.height * shellHeight : shellHeight / 2;
  const tooltipWidth = tooltip.offsetWidth || 210;
  const tooltipHeight = tooltip.offsetHeight || 96;
  let left = pixelX + 13;
  if (left + tooltipWidth > shellWidth - 8) left = pixelX - tooltipWidth - 13;
  tooltip.style.left = `${Math.max(8, left)}px`;
  tooltip.style.top = `${chartClamp(pixelY - tooltipHeight / 2, 8, Math.max(8, shellHeight - tooltipHeight - 8))}px`;
  state.hoverIndex = index;
}

function chartHideHover(container, state) {
  const tooltip = container.querySelector(".chart-tooltip");
  if (tooltip) {
    tooltip.classList.remove("visible");
    tooltip.hidden = true;
    tooltip.setAttribute("aria-hidden", "true");
    tooltip.innerHTML = "";
  }
  const layer = container.querySelector(".chart-hover-layer");
  if (layer) layer.innerHTML = "";
  state.hoverIndex = null;
}

function chartNotifyCustomRange(state) {
  state.onRangeChange?.({
    custom: true,
    startDate: state.rows[state.startIndex]?.date,
    endDate: state.rows[state.endIndex]?.date
  });
}

function chartTimestampFromX(geometry, x) {
  const ratio = chartClamp((x - geometry.plotLeft) / Math.max(1, geometry.plotWidth), 0, 1);
  return geometry.timeMin + ratio * (geometry.timeMax - geometry.timeMin);
}

function chartTimestampFromNavigatorX(geometry, x) {
  const ratio = chartClamp((x - geometry.left) / Math.max(1, geometry.right - geometry.left), 0, 1);
  return geometry.timeMin + ratio * (geometry.timeMax - geometry.timeMin);
}

function chartFormatValue(state, value, seriesKey = null) {
  if (!chartValidNumber(value)) return "n/a";
  try { return String(state.valueFormatter(value, seriesKey)); } catch { return chartDefaultValueFormatter(value); }
}

function chartSignedValue(state, value, seriesKey = null) {
  if (!chartValidNumber(value)) return "n/a";
  return `${value > 0 ? "+" : ""}${chartFormatValue(state, value, seriesKey)}`;
}

function chartDefaultValueFormatter(value) {
  return Number(value).toLocaleString("en-US", { maximumFractionDigits: 2 });
}

function chartSafeColor(value) {
  const color = String(value ?? "");
  return /^(?:#[0-9a-f]{3,8}|rgba?\([\d\s.,%]+\)|hsla?\([\d\s.,%]+\)|[a-z]+)$/i.test(color) ? color : "#19b5fe";
}

function chartEscape(value) {
  return String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#39;");
}

export function chartPercentile(sortedValues, percentile) {
  const count = Array.isArray(sortedValues) ? sortedValues.length : 0;
  if (!count) return 0;
  if (count === 1) return sortedValues[0];
  const p = Math.min(1, Math.max(0, Number(percentile) || 0));
  const index = p * (count - 1);
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  const weight = index - lower;
  return sortedValues[lower] * (1 - weight) + sortedValues[upper] * weight;
}

export function calculateBoxplotStats(rows, valueKey, startIndex = 0, endIndex = rows?.length - 1) {
  const bounds = chartBounds(rows?.length || 0, startIndex, endIndex);
  if (bounds.endIndex < bounds.startIndex) {
    return { count: 0, points: [], min: 0, q1: 0, median: 0, q3: 0, max: 0, mean: 0 };
  }

  const rawPoints = [];
  for (let index = bounds.startIndex; index <= bounds.endIndex; index += 1) {
    const row = rows[index];
    const rawVal = row?.[valueKey];
    if (chartValidNumber(rawVal)) {
      rawPoints.push({ value: rawVal, row, index, date: chartObservationLabel(row) });
    }
  }

  const activePoints = rawPoints.filter(p => p.value > 0);
  const points = activePoints.length > 0 ? activePoints : rawPoints;

  if (!points.length) {
    return { count: 0, points: [], min: 0, q1: 0, median: 0, q3: 0, max: 0, mean: 0 };
  }

  const sorted = [...points].sort((a, b) => a.value - b.value);
  const values = sorted.map(p => p.value);
  const count = values.length;
  const min = values[0];
  const max = values[count - 1];
  const q1 = chartPercentile(values, 0.25);
  const median = chartPercentile(values, 0.50);
  const q3 = chartPercentile(values, 0.75);
  const sum = values.reduce((acc, v) => acc + v, 0);
  const mean = sum / count;

  return {
    count,
    points: sorted,
    min,
    q1,
    median,
    q3,
    max,
    mean
  };
}

export function renderInteractiveBoxplotChart(container, options = {}) {
  if (!container || typeof container.querySelector !== "function") {
    throw new TypeError("An interactive chart container is required.");
  }
  const isMultiMarket = Array.isArray(options.markets) && options.markets.length > 0;
  const rawMarkets = isMultiMarket ? options.markets : [
    {
      key: "default",
      label: options.title || "Repayment size distribution",
      rows: Array.isArray(options.rows) ? options.rows : []
    }
  ];
  const valueKey = String(options.valueKey || "value");
  const chartId = String(options.chartId || container.id || "boxplot-chart");
  const period = String(options.period || "all");
  const requestedYScaleMode = options.yScale === "symlog" ? "symlog" : "linear";

  const previousContainer = chartRendererContainers.get(chartId);
  if (previousContainer && previousContainer !== container) {
    chartRendererResizeObserver?.unobserve(previousContainer);
    chartRendererStates.delete(previousContainer);
  }
  chartRendererContainers.set(chartId, container);

  const totalRowCount = rawMarkets.reduce((sum, m) => sum + (Array.isArray(m.rows) ? m.rows.length : 0), 0);
  if (!totalRowCount) {
    container.innerHTML = '<div class="chart-empty" role="status">No values are available for this chart.</div>';
    chartRendererStates.delete(container);
    return null;
  }

  const signature = `boxplot:${chartId}:${isMultiMarket ? "multi" : "single"}:${rawMarkets.map(m => Array.isArray(m.rows) ? m.rows.length : 0).join("-")}:${valueKey}:${period}`;
  let state = chartRendererStates.get(container);
  const needsMarkup = !state || !container.querySelector("svg.chart-main");

  if (needsMarkup) {
    container.innerHTML = chartBoxplotMarkup();
    const main = container.querySelector("svg.chart-main");
    const tooltip = container.querySelector(".chart-tooltip");
    const tooltipId = `${chartId.replace(/[^a-z0-9_-]+/gi, "-")}-tooltip`;
    main.setAttribute("aria-label", `Interactive ${chartId} boxplot distribution. Hover over elements to inspect statistics and data points.`);
    main.setAttribute("aria-describedby", tooltipId);
    tooltip.id = tooltipId;
    state = {
      isBoxplot: true,
      chartId,
      isMultiMarket,
      rawMarkets,
      rows: options.rows || [],
      valueKey,
      period,
      title: options.title || "Repayment size distribution analysis",
      valueFormatter: typeof options.valueFormatter === "function" ? options.valueFormatter : chartDefaultValueFormatter,
      onRangeChange: typeof options.onRangeChange === "function" ? options.onRangeChange : null,
      signature,
      yScaleMode: requestedYScaleMode,
      yDomain: null,
      hoverMarketIndex: null,
      hoverPointIndex: null,
      hoverBox: false,
      geometry: null,
      resizeFrame: null
    };
    chartRendererStates.set(container, state);
    chartBindBoxplotEvents(container);
    chartObserveRenderer(container);
  } else {
    const datasetChanged = state.signature !== signature;
    const resetRange = Boolean(options.resetRange) || datasetChanged || state.period !== period;
    state.chartId = chartId;
    state.isMultiMarket = isMultiMarket;
    state.rawMarkets = rawMarkets;
    state.rows = options.rows || [];
    state.valueKey = valueKey;
    state.period = period;
    state.title = options.title || state.title;
    state.valueFormatter = typeof options.valueFormatter === "function" ? options.valueFormatter : chartDefaultValueFormatter;
    state.onRangeChange = typeof options.onRangeChange === "function" ? options.onRangeChange : null;
    state.signature = signature;
    if (resetRange) {
      state.hoverMarketIndex = null;
      state.hoverPointIndex = null;
      state.hoverBox = false;
    }
    if (datasetChanged || options.yScale) {
      state.yScaleMode = requestedYScaleMode;
    }
  }

  chartRenderBoxplotState(container, state);
  return state;
}

function chartBoxplotMarkup() {
  return `<div class="interactive-chart boxplot-chart">
    <div class="chart-live-toolbar">
      <div class="chart-live-legend">
        <span class="boxplot-legend-title">Repayment Size Distribution</span>
      </div>
      <div class="chart-live-tools"></div>
    </div>
    <div class="chart-main-shell">
      <div class="chart-y-scale-tools chart-y-scale-group" role="group" aria-label="Y-axis scale">
        <span>Y axis</span>
        <div class="chart-mode-group">
          <button type="button" class="chart-mode-button active" data-chart-y-scale="linear" aria-pressed="true">Linear</button>
          <button type="button" class="chart-mode-button" data-chart-y-scale="symlog" aria-pressed="false">Symlog</button>
        </div>
      </div>
      <svg class="chart-main" role="group" tabindex="0" aria-label="Interactive boxplot distribution"></svg>
      <div class="chart-tooltip" role="status" aria-live="polite" aria-hidden="true" hidden></div>
    </div>
    <div class="chart-range-summary boxplot-summary"></div>
  </div>`;
}

function chartBindBoxplotEvents(container) {
  const main = container.querySelector("svg.chart-main");
  container.addEventListener("click", event => {
    const scaleBtn = event.target.closest?.("[data-chart-y-scale]");
    if (scaleBtn) {
      const state = chartRendererStates.get(container);
      if (state) {
        state.yScaleMode = scaleBtn.dataset.chartYScale;
        chartRenderBoxplotState(container, state);
      }
    }
  });

  main.addEventListener("pointermove", event => {
    const state = chartRendererStates.get(container);
    if (!state || !state.geometry) return;
    const target = event.target;
    const pointIdxAttr = target.getAttribute?.("data-point-idx");
    const marketIdxAttr = target.getAttribute?.("data-market-idx") ?? target.closest?.("[data-market-idx]")?.getAttribute?.("data-market-idx");

    if (pointIdxAttr !== null && pointIdxAttr !== undefined) {
      const pIdx = Number.parseInt(pointIdxAttr, 10);
      const mIdx = marketIdxAttr !== null && marketIdxAttr !== undefined ? Number.parseInt(marketIdxAttr, 10) : 0;
      chartShowBoxplotPointHover(container, state, mIdx, pIdx);
      return;
    }

    if (target.closest?.(".boxplot-box") || target.closest?.(".boxplot-whisker") || target.closest?.(".boxplot-median") || target.closest?.(".boxplot-cap")) {
      const mIdx = marketIdxAttr !== null && marketIdxAttr !== undefined ? Number.parseInt(marketIdxAttr, 10) : 0;
      chartShowBoxplotBoxHover(container, state, mIdx);
      return;
    }

    chartHideHover(container, state);
  });

  main.addEventListener("pointerleave", () => {
    const state = chartRendererStates.get(container);
    if (state) chartHideHover(container, state);
  });
}

function chartRenderBoxplotState(container, state) {
  const marketStatsList = state.rawMarkets.map((m, idx) => {
    const rows = Array.isArray(m.rows) ? m.rows : [];
    const bounds = chartRangeForPeriod(rows, state.period);
    const stats = calculateBoxplotStats(rows, state.valueKey, bounds.startIndex, bounds.endIndex);
    return {
      key: m.key || `m-${idx}`,
      label: m.label || `Market ${idx + 1}`,
      color: m.color || ["#19b5fe", "#19d3ae", "#f5a623", "#a55eea", "#ff5252", "#3edc81", "#e056fd", "#f1c40f"][idx % 8],
      stats
    };
  });

  container.querySelectorAll("[data-chart-y-scale]").forEach(button => {
    const active = button.dataset.chartYScale === state.yScaleMode;
    button.classList.toggle("active", active);
    button.setAttribute("aria-pressed", String(active));
  });

  const activeMarketStats = marketStatsList.filter(m => m.stats.count > 0);
  const totalObs = marketStatsList.reduce((sum, m) => sum + m.stats.count, 0);

  let globalMin = 0;
  let globalMax = 100;
  if (activeMarketStats.length > 0) {
    globalMin = Math.min(...activeMarketStats.map(m => m.stats.min));
    globalMax = Math.max(...activeMarketStats.map(m => m.stats.max));
  }

  const summaryEl = container.querySelector(".boxplot-summary");
  if (summaryEl) {
    if (marketStatsList.length === 1) {
      const stats = marketStatsList[0].stats;
      summaryEl.innerHTML = `<div class="chart-summary-period">
        <span>Repayment Size Distribution Analysis (<strong>${stats.count} active observations</strong>)</span>
        <strong>Range: ${chartFormatValue(state, stats.min)} — ${chartFormatValue(state, stats.max)}</strong>
      </div>
      <div class="chart-summary-row">
        <div class="chart-summary-label">Boxplot Stats</div>
        <div class="chart-summary-values">
          <span>Min: <strong>${chartFormatValue(state, stats.min)}</strong></span>
          <span>Q1 (25%): <strong>${chartFormatValue(state, stats.q1)}</strong></span>
          <span>Median (50%): <strong>${chartFormatValue(state, stats.median)}</strong></span>
          <span>Q3 (75%): <strong>${chartFormatValue(state, stats.q3)}</strong></span>
          <span>Max: <strong>${chartFormatValue(state, stats.max)}</strong></span>
        </div>
      </div>`;
    } else {
      const marketPills = marketStatsList.map(m => {
        const medStr = m.stats.count > 0 ? chartFormatValue(state, m.stats.median) : "N/A";
        return `<span>${chartEscape(m.label)}: <strong>${medStr}</strong> (${m.stats.count} obs)</span>`;
      }).join("");
      summaryEl.innerHTML = `<div class="chart-summary-period">
        <span>Protocol Repayment Size Distribution Across Markets (<strong>${activeMarketStats.length} active markets</strong>, <strong>${totalObs} observations</strong>)</span>
        <strong>Range: ${chartFormatValue(state, globalMin)} — ${chartFormatValue(state, globalMax)}</strong>
      </div>
      <div class="chart-summary-row">
        <div class="chart-summary-label">Market Medians</div>
        <div class="chart-summary-values">${marketPills}</div>
      </div>`;
    }
  }

  const shell = container.querySelector(".chart-main-shell");
  const svg = container.querySelector("svg.chart-main");
  const width = Math.max(320, Math.round(shell.clientWidth || container.clientWidth || 1000));
  const height = width < 720 ? 340 : 400;
  const plotLeft = 88;
  const plotRight = width - 28;
  const plotTop = 40;
  const plotBottom = height - 52;
  const plotWidth = Math.max(40, plotRight - plotLeft);

  const minDomain = totalObs ? Math.min(0, globalMin) : 0;
  const maxDomain = totalObs ? Math.max(1, globalMax * 1.08) : 100;
  const domain = { min: minDomain, max: maxDomain };

  const yScaleMode = state.yScaleMode === "symlog" ? "symlog" : "linear";
  const symlogConstant = yScaleMode === "symlog" ? chartSymlogConstant(domain) : 1;
  const yScaleModel = chartCreateYScale(domain, yScaleMode, symlogConstant, plotTop, plotBottom);
  const yScale = yScaleModel.map;
  const yTicks = chartYTickValues(domain, yScaleMode, symlogConstant, 5);

  const grid = yTicks.map(value => {
    const y = yScale(value);
    return `<line x1="${plotLeft}" x2="${plotRight}" y1="${y.toFixed(2)}" y2="${y.toFixed(2)}" stroke="rgba(36,72,102,.62)"/><text class="axis" x="${plotLeft - 10}" y="${(y + 5).toFixed(2)}" text-anchor="end">${chartEscape(chartFormatValue(state, value))}</text>`;
  }).join("");

  const N = marketStatsList.length;
  const colWidth = plotWidth / N;
  const boxWidth = N === 1 ? Math.min(160, Math.max(70, plotWidth * 0.28)) : Math.min(90, Math.max(18, colWidth * 0.55));

  let boxplotContent = "";
  const xAxisLabels = [];

  marketStatsList.forEach((m, mIdx) => {
    const centerX = plotLeft + (mIdx + 0.5) * colWidth;
    const stats = m.stats;
    const color = m.color;

    if (N > 1) {
      xAxisLabels.push(`<text class="axis" x="${centerX.toFixed(2)}" y="${(plotBottom + 18).toFixed(2)}" text-anchor="middle" fill="#a9bfd3" font-size="12" font-weight="600">${chartEscape(m.label)}</text>`);
    }

    if (stats.count > 0) {
      const yMax = yScale(stats.max);
      const yQ3 = yScale(stats.q3);
      const yMed = yScale(stats.median);
      const yQ1 = yScale(stats.q1);
      const yMin = yScale(stats.min);

      const boxLeft = centerX - boxWidth / 2;
      const boxRight = centerX + boxWidth / 2;
      const boxH = Math.max(2, Math.abs(yQ1 - yQ3));
      const boxY = Math.min(yQ3, yQ1);

      const whiskerTop = `<line class="boxplot-whisker" data-market-idx="${mIdx}" x1="${centerX.toFixed(2)}" x2="${centerX.toFixed(2)}" y1="${yMax.toFixed(2)}" y2="${boxY.toFixed(2)}" stroke="#a9bfd3" stroke-width="2" stroke-dasharray="3 3"/>`;
      const whiskerBottom = `<line class="boxplot-whisker" data-market-idx="${mIdx}" x1="${centerX.toFixed(2)}" x2="${centerX.toFixed(2)}" y1="${(boxY + boxH).toFixed(2)}" y2="${yMin.toFixed(2)}" stroke="#a9bfd3" stroke-width="2" stroke-dasharray="3 3"/>`;
      const capTop = `<line class="boxplot-cap" data-market-idx="${mIdx}" x1="${(centerX - boxWidth / 4).toFixed(2)}" x2="${(centerX + boxWidth / 4).toFixed(2)}" y1="${yMax.toFixed(2)}" y2="${yMax.toFixed(2)}" stroke="#a9bfd3" stroke-width="2.5"/>`;
      const capBottom = `<line class="boxplot-cap" data-market-idx="${mIdx}" x1="${(centerX - boxWidth / 4).toFixed(2)}" x2="${(centerX + boxWidth / 4).toFixed(2)}" y1="${yMin.toFixed(2)}" y2="${yMin.toFixed(2)}" stroke="#a9bfd3" stroke-width="2.5"/>`;

      const boxRect = `<rect class="boxplot-box" data-market-idx="${mIdx}" x="${boxLeft.toFixed(2)}" y="${boxY.toFixed(2)}" width="${boxWidth.toFixed(2)}" height="${boxH.toFixed(2)}" fill="#102a44" fill-opacity="0.82" stroke="${color}" stroke-width="2" rx="4"/>`;

      const medianLine = `<line class="boxplot-median" data-market-idx="${mIdx}" x1="${boxLeft.toFixed(2)}" x2="${boxRight.toFixed(2)}" y1="${yMed.toFixed(2)}" y2="${yMed.toFixed(2)}" stroke="#19d3ae" stroke-width="3.5"/>`;

      const pointsMarkup = stats.points.map((p, pIdx) => {
        const py = yScale(p.value);
        const jitterRatio = (((pIdx * 37 + 17) % 100) / 100 - 0.5) * 0.72;
        const px = centerX + jitterRatio * boxWidth;
        const isHovered = state.hoverMarketIndex === mIdx && state.hoverPointIndex === pIdx;
        const r = isHovered ? 6.5 : 4.5;
        const fillOpacity = isHovered ? 0.95 : 0.45;
        const stroke = isHovered ? "#3edc81" : "#071522";
        const strokeWidth = isHovered ? 1.8 : 1.2;
        return `<circle class="boxplot-point${isHovered ? " hovered" : ""}" data-market-idx="${mIdx}" data-point-idx="${pIdx}" cx="${px.toFixed(2)}" cy="${py.toFixed(2)}" r="${r}" fill="${color}" fill-opacity="${fillOpacity}" stroke="${stroke}" stroke-opacity="${isHovered ? 1 : 0.75}" stroke-width="${strokeWidth}" style="cursor:pointer;"/>`;
      }).join("");

      boxplotContent += `${whiskerTop}${whiskerBottom}${capTop}${capBottom}${boxRect}${medianLine}${pointsMarkup}`;
    } else if (N > 1) {
      boxplotContent += `<text class="axis" x="${centerX.toFixed(2)}" y="${((plotTop + plotBottom) / 2).toFixed(2)}" text-anchor="middle" fill="#6a89a7" font-size="11">No data</text>`;
    }
  });

  if (totalObs === 0 && N === 1) {
    const centerX = plotLeft + plotWidth / 2;
    boxplotContent = `<text class="axis" x="${centerX.toFixed(2)}" y="${((plotTop + plotBottom) / 2).toFixed(2)}" text-anchor="middle">No active repayment observations in this timeframe</text>`;
  }

  const overallTitle = N === 1
    ? "Repayment Size Distribution (Active Daily Amounts)"
    : "Repayment Size Distribution Across Protocol Markets (One Box Plot + Points Per Market)";
  const xAxisTitleY = N === 1 ? height - 13 : height - 10;
  const xAxisLine = `<line x1="${plotLeft}" x2="${plotRight}" y1="${plotBottom}" y2="${plotBottom}" stroke="rgba(36,72,102,.9)"/>`;
  const xAxisTitle = `<text class="axis" x="${(plotLeft + plotWidth / 2).toFixed(2)}" y="${xAxisTitleY}" text-anchor="middle">${overallTitle}</text>`;
  const xAxis = `${xAxisLine}${xAxisLabels.join("")}${xAxisTitle}`;

  svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
  svg.setAttribute("preserveAspectRatio", "none");
  svg.innerHTML = `<g aria-hidden="true">${grid}${xAxis}</g><g class="boxplot-marks">${boxplotContent}</g>`;

  state.geometry = { width, height, plotLeft, plotRight, plotTop, plotBottom, plotWidth, marketStatsList, yScale };
}

function chartShowBoxplotPointHover(container, state, mIdx, pIdx) {
  const marketStatsList = state.geometry?.marketStatsList;
  if (!marketStatsList || !marketStatsList[mIdx]) return;
  const m = marketStatsList[mIdx];
  const point = m.stats.points?.[pIdx];
  if (!point) return;

  state.hoverMarketIndex = mIdx;
  state.hoverPointIndex = pIdx;

  const N = marketStatsList.length;
  const colWidth = state.geometry.plotWidth / N;
  const centerX = state.geometry.plotLeft + (mIdx + 0.5) * colWidth;
  const boxWidth = N === 1 ? Math.min(160, Math.max(70, state.geometry.plotWidth * 0.28)) : Math.min(90, Math.max(18, colWidth * 0.55));
  const jitterRatio = (((pIdx * 37 + 17) % 100) / 100 - 0.5) * 0.72;
  const px = centerX + jitterRatio * boxWidth;
  const py = state.geometry.yScale(point.value);

  const tooltip = container.querySelector(".chart-tooltip");
  tooltip.hidden = false;
  tooltip.setAttribute("aria-hidden", "false");
  const dateTitle = N > 1 ? `${chartEscape(m.label)} · ${chartEscape(point.date)}` : chartEscape(point.date);
  tooltip.innerHTML = `<div class="chart-tooltip-date">${dateTitle}</div>
    <div class="chart-tooltip-row">
      <span>Repaid amount</span>
      <span class="chart-tooltip-value">${chartEscape(state.valueFormatter(point.value))}</span>
    </div>`;
  tooltip.classList.add("visible");

  const shell = container.querySelector(".chart-main-shell");
  const shellWidth = shell.clientWidth || state.geometry.width;
  const shellHeight = shell.clientHeight || state.geometry.height;

  const tooltipWidth = tooltip.offsetWidth || 190;
  const tooltipHeight = tooltip.offsetHeight || 70;
  let left = (px / state.geometry.width) * shellWidth + 15;
  if (left + tooltipWidth > shellWidth - 8) left = (px / state.geometry.width) * shellWidth - tooltipWidth - 15;
  const top = chartClamp((py / state.geometry.height) * shellHeight - tooltipHeight / 2, 8, Math.max(8, shellHeight - tooltipHeight - 8));

  tooltip.style.left = `${Math.max(8, left)}px`;
  tooltip.style.top = `${top}px`;
}

function chartShowBoxplotBoxHover(container, state, mIdx) {
  const marketStatsList = state.geometry?.marketStatsList;
  if (!marketStatsList || !marketStatsList[mIdx]) return;
  const m = marketStatsList[mIdx];
  const stats = m.stats;
  if (!stats || !stats.count) return;

  const N = marketStatsList.length;
  const colWidth = state.geometry.plotWidth / N;
  const centerX = state.geometry.plotLeft + (mIdx + 0.5) * colWidth;
  const py = state.geometry.yScale(stats.median);

  const tooltip = container.querySelector(".chart-tooltip");
  tooltip.hidden = false;
  tooltip.setAttribute("aria-hidden", "false");
  const titleText = N > 1
    ? `${chartEscape(m.label)} Repayment Distribution (${stats.count} obs)`
    : `Repayment Size Distribution (${stats.count} observations)`;

  tooltip.innerHTML = `<div class="chart-tooltip-date">${titleText}</div>
    <div class="chart-tooltip-row"><span>Max</span><span class="chart-tooltip-value">${chartEscape(state.valueFormatter(stats.max))}</span></div>
    <div class="chart-tooltip-row"><span>Q3 (75th percentile)</span><span class="chart-tooltip-value">${chartEscape(state.valueFormatter(stats.q3))}</span></div>
    <div class="chart-tooltip-row"><span>Median (50th)</span><span class="chart-tooltip-value">${chartEscape(state.valueFormatter(stats.median))}</span></div>
    <div class="chart-tooltip-row"><span>Mean</span><span class="chart-tooltip-value">${chartEscape(state.valueFormatter(stats.mean))}</span></div>
    <div class="chart-tooltip-row"><span>Q1 (25th percentile)</span><span class="chart-tooltip-value">${chartEscape(state.valueFormatter(stats.q1))}</span></div>
    <div class="chart-tooltip-row"><span>Min</span><span class="chart-tooltip-value">${chartEscape(state.valueFormatter(stats.min))}</span></div>`;
  tooltip.classList.add("visible");

  const shell = container.querySelector(".chart-main-shell");
  const shellWidth = shell.clientWidth || state.geometry.width;
  const shellHeight = shell.clientHeight || state.geometry.height;

  const tooltipWidth = tooltip.offsetWidth || 210;
  const tooltipHeight = tooltip.offsetHeight || 160;

  let left = (centerX / state.geometry.width) * shellWidth + 20;
  if (left + tooltipWidth > shellWidth - 8) left = (centerX / state.geometry.width) * shellWidth - tooltipWidth - 20;
  const top = chartClamp((py / state.geometry.height) * shellHeight - tooltipHeight / 2, 8, Math.max(8, shellHeight - tooltipHeight - 8));

  tooltip.style.left = `${Math.max(8, left)}px`;
  tooltip.style.top = `${top}px`;
}
