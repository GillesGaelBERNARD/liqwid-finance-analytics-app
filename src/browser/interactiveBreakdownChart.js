import {
  chartCreateYScale,
  chartFixedYDomain,
  chartResetYScale,
  chartScaleYDomain,
  chartSymlogConstant,
  chartYTickValues
} from "./interactiveChart.js";

const breakdownChartStates = new WeakMap();
const breakdownChartBoundContainers = new WeakSet();
const breakdownChartContainersById = new Map();
let breakdownChartResizeObserver = null;

const breakdownDefaultPalette = [
  "#19b5fe",
  "#3edc81",
  "#f4b942",
  "#9b7bff",
  "#ff6b76",
  "#2dd4bf",
  "#f28c52",
  "#68a7ff"
];

const DEFAULT_METRIC_METADATA = {
  utilizationStress: {
    label: "Utilization pressure",
    description: "Measures market pool borrowing relative to optimal protocol capacity.",
    explanation: "Measures how heavily the market pool is borrowed relative to its maximum stress target capacity (110%). High utilization limits new borrowing and increases liquidity squeeze risk during withdrawals.",
    formulaHtml: `<div class="formula-card"><span class="formula-func">min</span><span class="formula-paren">(</span><span class="formula-val">1.0</span>, <div class="formula-frac"><span class="formula-num">Utilization %</span><span class="formula-den">110%</span></div><span class="formula-paren">)</span></div>`,
    formulaText: "min(1.0, Utilization % / 110%)",
    stressRange: "Range: 0.0% to 100.0% (Higher = Severe Liquidity Pressure)"
  },
  liquidityStress: {
    label: "Liquidity pressure",
    description: "Evaluates total outstanding debt against available liquid pool reserves.",
    explanation: "Measures total outstanding USD borrow volume against available liquid reserves, normalized against a stress benchmark of 5.0x. Higher ratios indicate low pool depth to absorb sudden market moves.",
    formulaHtml: `<div class="formula-card"><span class="formula-func">min</span><span class="formula-paren">(</span><span class="formula-val">1.0</span>, <div class="formula-frac"><span class="formula-num">Borrow / Available Liquidity</span><span class="formula-den">5.0</span></div><span class="formula-paren">)</span></div>`,
    formulaText: "min(1.0, (Borrow / Available Liquidity) / 5.0)",
    stressRange: "Range: 0.0% to 100.0% (Higher = High Reserve Depletion Risk)"
  },
  interestCoverageStress: {
    label: "Weak interest coverage",
    description: "Measures unpaid accrued interest over trailing 30 days.",
    explanation: "Inverted trailing 30-day interest coverage ratio. Measures the proportion of interest accrued that remains unpaid over the last 30 days. Higher values indicate borrower debt servicing difficulties.",
    formulaHtml: `<div class="formula-card"><span class="formula-val">1.0</span> &minus; <span class="formula-func">min</span><span class="formula-paren">(</span><span class="formula-val">1.0</span>, <span class="formula-func">max</span><span class="formula-paren">(</span><span class="formula-val">0.0</span>, <span class="formula-num">Interest Coverage<sub>30d</sub></span><span class="formula-paren">)</span><span class="formula-paren">)</span></div>`,
    formulaText: "1.0 - min(1.0, max(0.0, Interest Coverage 30d))",
    stressRange: "Range: 0.0% to 100.0% (Higher = Poor Interest Servicing)"
  },
  borrowGrowthStress: {
    label: "Borrow growth",
    description: "Trailing 30-day percentage expansion in USD borrow volume.",
    explanation: "Calculates the positive percentage expansion in USD borrow volume over the trailing 30 days. Rapid borrow growth signals accelerating credit expansion and higher leverage velocity.",
    formulaHtml: `<div class="formula-card"><span class="formula-func">min</span><span class="formula-paren">(</span><span class="formula-val">1.0</span>, <span class="formula-func">max</span><span class="formula-paren">(</span><span class="formula-val">0.0</span>, <div class="formula-frac"><span class="formula-num">Borrow<sub>t</sub> &minus; Borrow<sub>t-30d</sub></span><span class="formula-den">Borrow<sub>t-30d</sub></span></div><span class="formula-paren">)</span><span class="formula-paren">)</span></div>`,
    formulaText: "min(1.0, max(0.0, (Borrow_t - Borrow_t-30d) / Borrow_t-30d))",
    stressRange: "Range: 0.0% to 100.0% (Higher = Rapid Leverage Velocity)"
  },
  loanHealthPressure: {
    label: "Loan-health pressure",
    description: "Weighted share of active organic market debt close to liquidation. Excludes governance-protected POL loans.",
    explanation: "Evaluates active loan health factors (HF) in the market, excluding governance-protected POL loans. Assigns 100% weight to organic debt with HF ≤ 1.10, 30% weight to debt in the 1.10 < HF ≤ 1.25 range, and 5% weight to debt in the 1.25 < HF ≤ 1.50 range, divided by total organic market debt.",
    formulaHtml: `<div class="formula-card"><div class="formula-frac"><span class="formula-num">Organic Debt<sub>HF &le; 1.10</sub> + 0.30 &times; Organic Debt<sub>1.10 &lt; HF &le; 1.25</sub> + 0.05 &times; Organic Debt<sub>1.25 &lt; HF &le; 1.50</sub></span><span class="formula-den">Total Organic Market Debt</span></div><div style="font-size:0.75rem;color:#8fa9bf;margin-top:4px"><em>Excludes governance-protected POL loans.</em></div></div>`,
    formulaText: "(OrganicDebt_HF<=1.10 + 0.30 * OrganicDebt_1.10<HF<=1.25 + 0.05 * OrganicDebt_1.25<HF<=1.50) / Total Organic Market Debt (Excludes governance-protected POL loans)",
    stressRange: "Range: 0.0% to 100.0% (Higher = High Liquidation Vulnerability)"
  }
};

function breakdownFiniteNumber(value) {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value !== "string" || !value.trim()) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function breakdownNormalizeSeries(series) {
  return (Array.isArray(series) ? series : []).map((entry, index) => {
    if (Array.isArray(entry)) {
      const key = String(entry[0] ?? `series-${index + 1}`);
      const defaultMeta = DEFAULT_METRIC_METADATA[key] || {};
      return {
        key,
        label: String(entry[1] ?? entry[0] ?? `Series ${index + 1}`),
        color: breakdownSafeColor(entry[2] ?? breakdownDefaultPalette[index % breakdownDefaultPalette.length]),
        description: defaultMeta.description || "",
        explanation: defaultMeta.explanation || "",
        formulaHtml: defaultMeta.formulaHtml || "",
        formulaText: defaultMeta.formulaText || "",
        stressRange: defaultMeta.stressRange || ""
      };
    }
    const key = String(entry?.key ?? `series-${index + 1}`);
    const defaultMeta = DEFAULT_METRIC_METADATA[key] || {};
    return {
      key,
      label: String(entry?.label ?? entry?.key ?? `Series ${index + 1}`),
      color: breakdownSafeColor(entry?.color ?? breakdownDefaultPalette[index % breakdownDefaultPalette.length]),
      hatch: entry?.hatch === true,
      legendDetail: entry?.legendDetail == null ? "" : String(entry.legendDetail),
      description: entry?.description != null ? String(entry.description) : (defaultMeta.description || ""),
      explanation: entry?.explanation != null ? String(entry.explanation) : (defaultMeta.explanation || ""),
      formulaHtml: entry?.formulaHtml != null ? String(entry.formulaHtml) : (defaultMeta.formulaHtml || ""),
      formulaText: entry?.formulaText != null ? String(entry.formulaText) : (defaultMeta.formulaText || ""),
      stressRange: entry?.stressRange != null ? String(entry.stressRange) : (defaultMeta.stressRange || "")
    };
  });
}

function breakdownNormalizeScatterSeries(rows, options = {}) {
  if (options.seriesKey == null) return [];
  const seriesKey = String(options.seriesKey);
  const seriesLabelKey = options.seriesLabelKey == null ? null : String(options.seriesLabelKey);
  const normalized = breakdownNormalizeSeries(options.series);
  const known = new Set(normalized.map(item => item.key));
  for (const row of Array.isArray(rows) ? rows : []) {
    const rawKey = row?.[seriesKey];
    if (rawKey == null || !String(rawKey).trim()) continue;
    const key = String(rawKey);
    if (known.has(key)) continue;
    const rawLabel = seriesLabelKey ? row?.[seriesLabelKey] : rawKey;
    const index = normalized.length;
    normalized.push({
      key,
      label: rawLabel == null || !String(rawLabel).trim() ? key : String(rawLabel),
      color: breakdownSafeColor(`hsl(${Math.round((index * 137.508 + 195) % 360)} 72% 62%)`),
      hatch: false,
      legendDetail: ""
    });
    known.add(key);
  }
  return normalized;
}

export function normalizeBreakdownRows(rows, options = {}) {
  const categoryKey = String(options.categoryKey ?? "category");
  const normalizedSeries = breakdownNormalizeSeries(options.series);
  const sortKey = options.sortKey == null ? null : String(options.sortKey);
  const normalized = (Array.isArray(rows) ? rows : []).flatMap((row, sourceIndex) => {
    const categoryValue = row?.[categoryKey];
    if (categoryValue == null || !String(categoryValue).trim()) return [];
    const values = {};
    for (const item of normalizedSeries) values[item.key] = breakdownFiniteNumber(row?.[item.key]);
    return [{ category: String(categoryValue), values, raw: row, sourceIndex }];
  });

  if (sortKey) {
    normalized.sort((a, b) => {
      const aValue = a.values[sortKey] ?? breakdownFiniteNumber(a.raw?.[sortKey]);
      const bValue = b.values[sortKey] ?? breakdownFiniteNumber(b.raw?.[sortKey]);
      if (aValue == null && bValue == null) return a.sourceIndex - b.sourceIndex;
      if (aValue == null) return 1;
      if (bValue == null) return -1;
      return bValue - aValue || a.sourceIndex - b.sourceIndex;
    });
  }

  return normalized;
}

export function stackedBreakdownSegments(row, series) {
  const normalizedSeries = breakdownNormalizeSeries(series);
  let positive = 0;
  let negative = 0;
  const segments = [];
  for (const item of normalizedSeries) {
    const value = breakdownFiniteNumber(row?.values?.[item.key] ?? row?.[item.key]);
    if (value == null) continue;
    const start = value < 0 ? negative : positive;
    const end = start + value;
    if (value < 0) negative = end;
    else positive = end;
    segments.push({ ...item, value, start, end });
  }
  return segments;
}

export function scatterExtent(rows, key, options = {}) {
  const scale = String(options.scale ?? "linear").toLowerCase();
  const logarithmic = scale === "log";
  const logOnePlus = scale === "log1p";
  const source = Array.isArray(rows) ? rows : [];
  const values = [];
  for (const row of source) {
    const value = breakdownFiniteNumber(row?.[key]);
    if (value == null || (logarithmic && value <= 0) || (logOnePlus && value < 0)) continue;
    values.push(value);
  }
  return {
    min: values.length ? Math.min(...values) : null,
    max: values.length ? Math.max(...values) : null,
    validCount: values.length,
    excludedCount: source.length - values.length
  };
}

export function renderInteractiveCategoryChart(container, options = {}) {
  breakdownRequireContainer(container);
  const chartId = String(options.chartId || "interactive-category-chart");
  const normalizedSeries = breakdownNormalizeSeries(options.series);
  const previousState = breakdownChartStates.get(container);
  breakdownTrackChartContainer(chartId, container, previousState);
  let state = previousState;
  if (!state || state.type !== "category" || state.chartId !== chartId) {
    state = {
      type: "category",
      chartId,
      activeKeys: new Set(normalizedSeries.map(item => item.key)),
      xScaleMode: options.xScale === "symlog" ? "symlog" : "linear",
      resizeFrame: null
    };
  }
  if (state.xScaleMode !== "symlog") state.xScaleMode = "linear";
  const availableKeys = new Set(normalizedSeries.map(item => item.key));
  state.activeKeys = new Set([...state.activeKeys].filter(key => availableKeys.has(key)));
  if (!state.activeKeys.size && normalizedSeries.length) state.activeKeys.add(normalizedSeries[0].key);
  state.options = options;
  state.series = normalizedSeries;
  breakdownChartStates.set(container, state);
  breakdownBindContainer(container);
  breakdownObserveContainer(container);
  breakdownRenderCategoryState(container, state);
  return state;
}

export function renderInteractiveMatrixChart(container, options = {}) {
  breakdownRequireContainer(container);
  const chartId = String(options.chartId || "interactive-matrix-chart");
  const previousState = breakdownChartStates.get(container);
  breakdownTrackChartContainer(chartId, container, previousState);
  const state = {
    type: "matrix",
    chartId,
    options,
    resizeFrame: previousState?.resizeFrame ?? null
  };
  breakdownChartStates.set(container, state);
  breakdownBindContainer(container);
  breakdownObserveContainer(container);
  breakdownRenderMatrixState(container, state);
  return state;
}

export function renderInteractiveScatterChart(container, options = {}) {
  breakdownRequireContainer(container);
  const chartId = String(options.chartId || "interactive-scatter-chart");
  const previousState = breakdownChartStates.get(container);
  breakdownTrackChartContainer(chartId, container, previousState);
  const sameScatter = previousState?.type === "scatter" && previousState.chartId === chartId;
  const normalizedSeries = breakdownNormalizeScatterSeries(options.rows, options);
  const previousSeriesKeys = new Set((previousState?.series || []).map(item => item.key));
  const activeKeys = sameScatter && previousState?.activeKeys
    ? new Set(normalizedSeries
      .filter(item => previousState.activeKeys.has(item.key) || !previousSeriesKeys.has(item.key))
      .map(item => item.key))
    : new Set(normalizedSeries.map(item => item.key));
  const datasetChanged = !sameScatter
    || previousState.options?.rows !== options.rows
    || previousState.options?.yKey !== options.yKey;
  const fixedYDomain = chartFixedYDomain(options.fixedYDomain);
  const state = {
    type: "scatter",
    chartId,
    options,
    series: normalizedSeries,
    activeKeys,
    resizeFrame: previousState?.resizeFrame ?? null,
    rovingIndex: sameScatter
      ? previousState.rovingIndex ?? 0
      : 0,
    yScaleMode: datasetChanged
      ? options.yScale === "symlog" && !fixedYDomain ? "symlog" : "linear"
      : previousState.yScaleMode,
    yDomain: datasetChanged ? null : previousState.yDomain,
    ySymlogConstant: datasetChanged ? null : previousState.ySymlogConstant,
    yDrag: null,
    scatterGeometry: null
  };
  if (fixedYDomain) chartResetYScale(state);
  breakdownChartStates.set(container, state);
  breakdownBindContainer(container);
  breakdownObserveContainer(container);
  breakdownRenderScatterState(container, state);
  return state;
}

function breakdownRequireContainer(container) {
  if (!container || !("innerHTML" in container)) {
    throw new TypeError("An interactive breakdown chart container is required.");
  }
}

function breakdownTrackChartContainer(chartId, container, previousState) {
  if (previousState?.chartId && previousState.chartId !== chartId
      && breakdownChartContainersById.get(previousState.chartId) === container) {
    breakdownChartContainersById.delete(previousState.chartId);
  }
  const replaced = breakdownChartContainersById.get(chartId);
  if (replaced && replaced !== container) breakdownReleaseContainer(replaced);
  breakdownChartContainersById.set(chartId, container);
}

function breakdownReleaseContainer(container) {
  const state = breakdownChartStates.get(container);
  if (state?.resizeFrame != null && typeof cancelAnimationFrame === "function") {
    cancelAnimationFrame(state.resizeFrame);
  }
  if (breakdownChartResizeObserver && typeof breakdownChartResizeObserver.unobserve === "function") {
    breakdownChartResizeObserver.unobserve(container);
  }
  if (state?.chartId && breakdownChartContainersById.get(state.chartId) === container) {
    breakdownChartContainersById.delete(state.chartId);
  }
  breakdownChartStates.delete(container);
}

function breakdownBindContainer(container) {
  if (breakdownChartBoundContainers.has(container) || typeof container.addEventListener !== "function") return;
  breakdownChartBoundContainers.add(container);
  container.addEventListener("click", event => breakdownHandleClick(container, event));
  container.addEventListener("pointerover", event => breakdownHandleTooltipEnter(container, event));
  container.addEventListener("pointerout", event => breakdownHandleTooltipLeave(container, event));
  container.addEventListener("focusin", event => breakdownHandleTooltipEnter(container, event));
  container.addEventListener("focusout", event => breakdownHandleTooltipLeave(container, event));
  container.addEventListener("keydown", event => breakdownHandleKeydown(container, event));
  container.addEventListener("pointerdown", event => breakdownHandlePointerDown(container, event));
  container.addEventListener("pointermove", event => breakdownHandlePointerMove(container, event));
  container.addEventListener("pointerup", event => breakdownFinishPointer(container, event));
  container.addEventListener("pointercancel", event => breakdownFinishPointer(container, event));
  container.addEventListener("dblclick", event => breakdownHandleDoubleClick(container, event));
}

function breakdownObserveContainer(container) {
  if (typeof ResizeObserver !== "function") return;
  if (!breakdownChartResizeObserver) {
    breakdownChartResizeObserver = new ResizeObserver(entries => {
      for (const entry of entries) {
        const state = breakdownChartStates.get(entry.target);
        if (!state) continue;
        if (entry.target.isConnected === false) {
          breakdownReleaseContainer(entry.target);
          continue;
        }
        const redraw = () => {
          state.resizeFrame = null;
          breakdownRenderCurrent(entry.target, state);
        };
        if (typeof requestAnimationFrame === "function") {
          if (state.resizeFrame != null && typeof cancelAnimationFrame === "function") cancelAnimationFrame(state.resizeFrame);
          state.resizeFrame = requestAnimationFrame(redraw);
        } else redraw();
      }
    });
  }
  breakdownChartResizeObserver.observe(container);
}

function breakdownRenderCurrent(container, state) {
  if (state.type === "category") breakdownRenderCategoryState(container, state);
  else if (state.type === "matrix") breakdownRenderMatrixState(container, state);
  else if (state.type === "scatter") breakdownRenderScatterState(container, state);
}

function breakdownCloseMetricPopover(container) {
  const popover = container.querySelector?.(".breakdown-popover");
  if (popover) {
    popover.hidden = true;
    popover.setAttribute("aria-hidden", "true");
  }
  const state = breakdownChartStates.get(container);
  if (state) state.pinnedMetricKey = null;
}

function breakdownEscapeSelector(value) {
  if (typeof CSS !== "undefined" && typeof CSS.escape === "function") {
    return CSS.escape(value);
  }
  return String(value).replace(/([!"#$%&'()*+,./:;<=>?@[\\\]^`{|}~])/g, "\\$1");
}

function breakdownToggleMetricPopover(container, metricKey, isClick = false) {
  const state = breakdownChartStates.get(container);
  if (!state || state.type !== "matrix") return;
  const popover = container.querySelector?.(".breakdown-popover");
  if (!popover) return;

  if (isClick && state.pinnedMetricKey === metricKey && !popover.hidden) {
    breakdownCloseMetricPopover(container);
    return;
  }

  const columns = breakdownNormalizeSeries(state.options.columns);
  const column = columns.find(c => c.key === metricKey) || { key: metricKey, label: metricKey };
  const defaultMeta = DEFAULT_METRIC_METADATA[metricKey] || {};
  const label = column.label || defaultMeta.label || metricKey;
  const explanation = column.explanation || defaultMeta.explanation || column.description || defaultMeta.description || "Measures stress components across markets.";
  const formulaHtml = column.formulaHtml || defaultMeta.formulaHtml || (column.formulaText ? `<div class="formula-card">${breakdownEscape(column.formulaText)}</div>` : (defaultMeta.formulaText ? `<div class="formula-card">${breakdownEscape(defaultMeta.formulaText)}</div>` : ""));
  const stressRange = column.stressRange || defaultMeta.stressRange || "";

  popover.innerHTML = `
    <div class="breakdown-popover-header">
      <h3 class="breakdown-popover-title">${breakdownEscape(label)}</h3>
      <button type="button" class="breakdown-popover-close" aria-label="Close metric explanation">&times;</button>
    </div>
    <p class="breakdown-popover-explanation">${breakdownEscape(explanation)}</p>
    ${formulaHtml ? `<div class="breakdown-popover-formula-label">Formula</div>${formulaHtml}` : ""}
    ${stressRange ? `<div class="breakdown-popover-range">${breakdownEscape(stressRange)}</div>` : ""}
  `;

  const btn = container.querySelector?.(`[data-breakdown-metric-btn="${breakdownEscapeSelector(metricKey)}"]`);
  const svg = container.querySelector?.("svg.breakdown-matrix-svg");
  const containerRect = container.getBoundingClientRect?.();
  const svgRect = svg?.getBoundingClientRect?.();
  const viewBox = svg?.viewBox?.baseVal;

  if (btn && containerRect && svgRect && viewBox?.width && viewBox?.height) {
    const x = Number(btn.dataset.breakdownX);
    const y = Number(btn.dataset.breakdownY);
    const pixelX = svgRect.left - containerRect.left + (x - viewBox.x) / viewBox.width * svgRect.width;
    const pixelY = svgRect.top - containerRect.top + (y - viewBox.y) / viewBox.height * svgRect.height;
    const popoverWidth = 330;
    let left = pixelX - popoverWidth / 2;
    if (left < 10) left = 10;
    if (left + popoverWidth > containerRect.width - 10) left = containerRect.width - popoverWidth - 10;
    popover.style.left = `${Math.max(6, left)}px`;
    popover.style.top = `${Math.max(6, pixelY + 14)}px`;
  } else {
    popover.style.left = "20px";
    popover.style.top = "60px";
  }

  popover.hidden = false;
  popover.setAttribute("aria-hidden", "false");
  if (isClick) {
    state.pinnedMetricKey = metricKey;
  }
}

function breakdownHandleClick(container, event) {
  const closePopoverButton = event.target?.closest?.(".breakdown-popover-close");
  if (closePopoverButton && container.contains?.(closePopoverButton)) {
    breakdownCloseMetricPopover(container);
    return;
  }

  const metricBtn = event.target?.closest?.("[data-breakdown-metric-btn]");
  if (metricBtn && container.contains?.(metricBtn)) {
    const metricKey = metricBtn.dataset.breakdownMetricBtn;
    breakdownToggleMetricPopover(container, metricKey, true);
    return;
  }

  const popover = container.querySelector?.(".breakdown-popover");
  if (popover && !popover.hidden && !popover.contains?.(event.target)) {
    breakdownCloseMetricPopover(container);
  }

  const yScaleButton = event.target?.closest?.("[data-breakdown-y-scale]");
  if (yScaleButton && container.contains?.(yScaleButton)) {
    const state = breakdownChartStates.get(container);
    if (!state || state.type !== "scatter") return;
    state.yScaleMode = yScaleButton.dataset.breakdownYScale === "symlog" ? "symlog" : "linear";
    state.yDomain = null;
    state.ySymlogConstant = null;
    breakdownRenderScatterState(container, state);
    [...(container.querySelectorAll?.("[data-breakdown-y-scale]") ?? [])]
      .find(button => button.dataset.breakdownYScale === state.yScaleMode)
      ?.focus?.();
    return;
  }
  const xScaleButton = event.target?.closest?.("[data-breakdown-x-scale]");
  if (xScaleButton && container.contains?.(xScaleButton)) {
    const state = breakdownChartStates.get(container);
    const fixedXDomain = state?.type === "category" ? chartFixedYDomain(state.options.fixedXDomain) : null;
    if (!state || state.type !== "category" || state.options.allowXScaleToggle !== true || fixedXDomain) return;
    state.xScaleMode = xScaleButton.dataset.breakdownXScale === "symlog" ? "symlog" : "linear";
    breakdownRenderCategoryState(container, state);
    [...(container.querySelectorAll?.("[data-breakdown-x-scale]") ?? [])]
      .find(button => button.dataset.breakdownXScale === state.xScaleMode)
      ?.focus?.();
    return;
  }
  const scatterButton = event.target?.closest?.("[data-breakdown-scatter-toggle]");
  if (scatterButton && container.contains?.(scatterButton)) {
    const state = breakdownChartStates.get(container);
    if (!state || state.type !== "scatter") return;
    const key = scatterButton.dataset.breakdownScatterToggle;
    if (!state.series.some(item => item.key === key)) return;
    if (state.activeKeys.has(key)) state.activeKeys.delete(key);
    else state.activeKeys.add(key);
    breakdownRenderScatterState(container, state);
    [...(container.querySelectorAll?.("[data-breakdown-scatter-toggle]") ?? [])]
      .find(candidate => candidate.dataset.breakdownScatterToggle === key)
      ?.focus?.();
    return;
  }
  const rovingMark = event.target?.closest?.("[data-breakdown-roving]");
  if (rovingMark && container.contains?.(rovingMark)) breakdownActivateRovingMark(container, rovingMark);
  const button = event.target?.closest?.("[data-breakdown-toggle]");
  if (!button || !container.contains?.(button)) return;
  const state = breakdownChartStates.get(container);
  if (!state || state.type !== "category") return;
  const key = button.dataset.breakdownToggle;
  if (!state.series.some(item => item.key === key)) return;
  if (state.activeKeys.has(key)) {
    if (state.activeKeys.size === 1) return;
    state.activeKeys.delete(key);
  } else state.activeKeys.add(key);
  breakdownRenderCategoryState(container, state);
  [...(container.querySelectorAll?.("[data-breakdown-toggle]") ?? [])]
    .find(candidate => candidate.dataset.breakdownToggle === key)
    ?.focus?.();
}

function breakdownHandleKeydown(container, event) {
  if (event.key === "Escape") {
    breakdownCloseMetricPopover(container);
  }
  const metricBtn = event.target?.closest?.("[data-breakdown-metric-btn]");
  if (metricBtn && container.contains?.(metricBtn) && ["Enter", " "].includes(event.key)) {
    event.preventDefault?.();
    const metricKey = metricBtn.dataset.breakdownMetricBtn;
    breakdownToggleMetricPopover(container, metricKey, true);
    return;
  }

  const yAxis = event.target?.closest?.("[data-breakdown-y-axis]");
  if (yAxis && container.contains?.(yAxis) && ["ArrowUp", "ArrowDown", "Home", "Enter", " "].includes(event.key)) {
    const state = breakdownChartStates.get(container);
    if (!state?.scatterGeometry) return;
    event.preventDefault?.();
    if (["Home", "Enter", " "].includes(event.key)) {
      chartResetYScale(state);
    } else {
      const geometry = state.scatterGeometry;
      const delta = (event.key === "ArrowUp" ? -1 : 1) * geometry.plotHeight * 0.12;
      state.yDomain = chartScaleYDomain(geometry.yDomain, delta, geometry.plotHeight, geometry.yScaleMode, geometry.ySymlogConstant);
      state.ySymlogConstant = geometry.ySymlogConstant;
    }
    breakdownRenderScatterState(container, state);
    container.querySelector?.("[data-breakdown-y-axis]")?.focus?.();
    return;
  }
  const mark = event.target?.closest?.('[data-breakdown-roving="scatter"]');
  if (!mark || !container.contains?.(mark)) return;
  const keys = ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End"];
  if (!keys.includes(event.key)) return;
  const marks = [...(container.querySelectorAll?.('[data-breakdown-roving="scatter"]') ?? [])];
  const currentIndex = marks.indexOf(mark);
  if (currentIndex < 0 || !marks.length) return;
  let nextIndex = currentIndex;
  if (event.key === "Home") nextIndex = 0;
  else if (event.key === "End") nextIndex = marks.length - 1;
  else if (event.key === "ArrowLeft" || event.key === "ArrowUp") nextIndex = (currentIndex - 1 + marks.length) % marks.length;
  else nextIndex = (currentIndex + 1) % marks.length;
  event.preventDefault?.();
  breakdownActivateRovingMark(container, marks[nextIndex], marks);
  marks[nextIndex].focus?.();
}

function breakdownActivateRovingMark(container, activeMark, knownMarks = null) {
  const marks = knownMarks ?? [...(container.querySelectorAll?.('[data-breakdown-roving="scatter"]') ?? [])];
  const activeIndex = marks.indexOf(activeMark);
  if (activeIndex < 0) return;
  marks.forEach((mark, index) => mark.setAttribute?.("tabindex", index === activeIndex ? "0" : "-1"));
  const state = breakdownChartStates.get(container);
  if (state?.type === "scatter") state.rovingIndex = activeIndex;
}

function breakdownScatterPointer(container, event, state) {
  const svg = container.querySelector?.("svg.breakdown-scatter-svg");
  const rect = svg?.getBoundingClientRect?.();
  const geometry = state?.scatterGeometry;
  if (!rect || !geometry) return null;
  return {
    x: (event.clientX - rect.left) / Math.max(1, rect.width) * geometry.width,
    y: (event.clientY - rect.top) / Math.max(1, rect.height) * geometry.height
  };
}

function breakdownHandlePointerDown(container, event) {
  const yAxis = event.target?.closest?.("[data-breakdown-y-axis]");
  const state = breakdownChartStates.get(container);
  if (!yAxis || !container.contains?.(yAxis) || !state?.scatterGeometry
      || (event.pointerType === "mouse" && event.button !== 0)) return;
  const point = breakdownScatterPointer(container, event, state);
  if (!point) return;
  event.preventDefault?.();
  container.setPointerCapture?.(event.pointerId);
  state.yDrag = {
    pointerId: event.pointerId,
    startY: point.y,
    startDomain: { ...state.scatterGeometry.yDomain },
    scaleMode: state.scatterGeometry.yScaleMode,
    symlogConstant: state.scatterGeometry.ySymlogConstant
  };
  state.ySymlogConstant = state.scatterGeometry.ySymlogConstant;
}

function breakdownHandlePointerMove(container, event) {
  const state = breakdownChartStates.get(container);
  if (!state?.yDrag || state.yDrag.pointerId !== event.pointerId || !state.scatterGeometry) return;
  const point = breakdownScatterPointer(container, event, state);
  if (!point) return;
  const domain = chartScaleYDomain(
    state.yDrag.startDomain,
    point.y - state.yDrag.startY,
    state.scatterGeometry.plotHeight,
    state.yDrag.scaleMode,
    state.yDrag.symlogConstant
  );
  if (!Number.isFinite(domain.min) || !Number.isFinite(domain.max) || domain.max <= domain.min) return;
  state.yDomain = domain;
  state.ySymlogConstant = state.yDrag.symlogConstant;
  breakdownRenderScatterState(container, state);
}

function breakdownFinishPointer(container, event) {
  const state = breakdownChartStates.get(container);
  if (!state?.yDrag || state.yDrag.pointerId !== event.pointerId) return;
  if (container.hasPointerCapture?.(event.pointerId)) container.releasePointerCapture(event.pointerId);
  state.yDrag = null;
}

function breakdownHandleDoubleClick(container, event) {
  const yAxis = event.target?.closest?.("[data-breakdown-y-axis]");
  const state = breakdownChartStates.get(container);
  if (!yAxis || !container.contains?.(yAxis) || state?.type !== "scatter") return;
  event.preventDefault?.();
  chartResetYScale(state);
  breakdownRenderScatterState(container, state);
}

function breakdownUpdateScatterEncodingReadouts(container, mark = null) {
  const readouts = [
    {
      selector: "[data-breakdown-size-readout]",
      pointValueKey: "breakdownSizeValue",
      domainValueKey: "breakdownSizeDomain"
    },
    {
      selector: "[data-breakdown-color-readout]",
      pointValueKey: "breakdownColorValue",
      domainValueKey: "breakdownColorDomain"
    }
  ];

  for (const { selector, pointValueKey, domainValueKey } of readouts) {
    const readout = container.querySelector?.(selector);
    if (!readout) continue;
    readout.textContent = mark?.dataset?.[pointValueKey]
      || readout.dataset?.[domainValueKey]
      || "";
  }
}

function breakdownHandleTooltipEnter(container, event) {
  const metricBtn = event.target?.closest?.("[data-breakdown-metric-btn]");
  if (metricBtn && container.contains?.(metricBtn)) {
    const state = breakdownChartStates.get(container);
    if (!state?.pinnedMetricKey) {
      const metricKey = metricBtn.dataset.breakdownMetricBtn;
      breakdownToggleMetricPopover(container, metricKey, false);
    }
    return;
  }
  const mark = event.target?.closest?.("[data-breakdown-tooltip]");
  if (!mark || !container.contains?.(mark)) return;
  breakdownUpdateScatterEncodingReadouts(container, mark);
  const tooltip = container.querySelector?.(".breakdown-tooltip");
  if (!tooltip) return;
  tooltip.textContent = mark.dataset.breakdownTooltip || "";
  tooltip.hidden = false;
  tooltip.setAttribute("aria-hidden", "false");

  const svg = mark.closest?.("svg");
  const containerRect = container.getBoundingClientRect?.();
  const svgRect = svg?.getBoundingClientRect?.();
  const viewBox = svg?.viewBox?.baseVal;
  if (!containerRect || !svgRect || !viewBox?.width || !viewBox?.height) return;
  const x = Number(mark.dataset.breakdownX);
  const y = Number(mark.dataset.breakdownY);
  const pixelX = svgRect.left - containerRect.left + (x - viewBox.x) / viewBox.width * svgRect.width;
  const pixelY = svgRect.top - containerRect.top + (y - viewBox.y) / viewBox.height * svgRect.height;
  const tooltipWidth = tooltip.offsetWidth || 220;
  const left = pixelX + tooltipWidth + 24 > containerRect.width ? pixelX - tooltipWidth - 12 : pixelX + 12;
  tooltip.style.left = `${Math.max(6, left)}px`;
  tooltip.style.top = `${Math.max(6, pixelY - (tooltip.offsetHeight || 46) / 2)}px`;
}

function breakdownHandleTooltipLeave(container, event) {
  const metricBtn = event.target?.closest?.("[data-breakdown-metric-btn]");
  if (metricBtn && container.contains?.(metricBtn)) {
    const state = breakdownChartStates.get(container);
    if (!state?.pinnedMetricKey) {
      breakdownCloseMetricPopover(container);
    }
    return;
  }
  const mark = event.target?.closest?.("[data-breakdown-tooltip]");
  if (!mark || (event.relatedTarget && mark.contains?.(event.relatedTarget))) return;
  breakdownUpdateScatterEncodingReadouts(container);
  const tooltip = container.querySelector?.(".breakdown-tooltip");
  if (!tooltip) return;
  tooltip.hidden = true;
  tooltip.setAttribute("aria-hidden", "true");
  tooltip.textContent = "";
}

function breakdownRenderCategoryState(container, state) {
  const options = state.options;
  const rows = normalizeBreakdownRows(options.rows, {
    categoryKey: options.categoryKey,
    series: state.series,
    sortKey: options.sortKey
  });
  const activeSeries = state.series.filter(item => state.activeKeys.has(item.key));
  if (!rows.length || !activeSeries.length) {
    breakdownRenderEmpty(container, state.chartId);
    return;
  }

  const mode = options.mode === "stacked" ? "stacked" : "grouped";
  const formatter = typeof options.valueFormatter === "function" ? options.valueFormatter : breakdownDefaultFormat;
  const rowSegments = rows.map(row => stackedBreakdownSegments(row, activeSeries));
  const plottedValues = mode === "stacked"
    ? rowSegments.flatMap(segments => segments.flatMap(segment => [segment.start, segment.end]))
    : rows.flatMap(row => activeSeries.map(item => row.values[item.key]).filter(value => value != null));
  if (!plottedValues.length) {
    breakdownRenderEmpty(container, state.chartId);
    return;
  }

  const fixedXDomain = chartFixedYDomain(options.fixedXDomain);
  let domainMin = fixedXDomain?.min ?? Math.min(0, ...plottedValues);
  let domainMax = fixedXDomain?.max ?? Math.max(0, ...plottedValues);
  if (domainMin === domainMax) domainMax = domainMin + 1;
  if (!fixedXDomain) {
    const domainSpan = domainMax - domainMin;
    domainMin -= domainMin < 0 ? domainSpan * 0.04 : 0;
    domainMax += domainMax > 0 ? domainSpan * 0.06 : 0;
  }
  const boundedPercentageAxis = fixedXDomain?.min === 0 && fixedXDomain?.max === 1;
  const supportsXScale = options.allowXScaleToggle === true && !fixedXDomain;
  const xScaleMode = supportsXScale && state.xScaleMode === "symlog" ? "symlog" : "linear";
  const xSymlogConstant = xScaleMode === "symlog"
    ? chartSymlogConstant({ min: domainMin, max: domainMax })
    : 1;

  const width = Math.max(breakdownChartMinimumWidth(options.minWidth), Math.round(Number(container.clientWidth) || 900));
  const longestCategory = Math.max(4, ...rows.map(row => row.category.length));
  const margin = {
    left: breakdownClamp(longestCategory * 7.2 + 22, 96, Math.min(290, width * 0.40)),
    right: 24,
    top: 16,
    bottom: 38
  };
  const rowHeight = mode === "grouped" ? Math.max(38, activeSeries.length * 19 + 10) : 38;
  const height = Math.max(150, margin.top + margin.bottom + rows.length * rowHeight);
  const plotWidth = Math.max(100, width - margin.left - margin.right);
  const scaleX = chartCreateYScale(
    { min: domainMin, max: domainMax },
    xScaleMode,
    xSymlogConstant,
    width - margin.right,
    margin.left
  ).map;
  const zeroX = scaleX(0);
  const hatchPatternIds = new Map(activeSeries.filter(item => item.hatch).map(item => [item.key, `${breakdownDomId(state.chartId)}-${breakdownDomId(item.key)}-hatch`]));
  const hatchPatterns = activeSeries.filter(item => item.hatch).map(item => `<pattern id="${hatchPatternIds.get(item.key)}" width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(25)"><rect width="8" height="8" fill="${item.color}"/><line x1="0" y1="0" x2="0" y2="8" stroke="#e8f5ff" stroke-opacity=".72" stroke-width="2"/></pattern>`).join("");
  const ticks = boundedPercentageAxis
    ? [0, 0.25, 0.5, 0.75, 1]
    : xScaleMode === "symlog"
      ? chartYTickValues({ min: domainMin, max: domainMax }, xScaleMode, xSymlogConstant, 5)
      : breakdownLinearTicks(domainMin, domainMax, 5);
  const axisFormatter = boundedPercentageAxis
    ? value => `${Math.round(Number(value) * 100)}%`
    : formatter;
  const grid = ticks.map(value => {
    const x = scaleX(value);
    return `<line x1="${breakdownRound(x)}" x2="${breakdownRound(x)}" y1="${margin.top}" y2="${height - margin.bottom}" stroke="rgba(36,72,102,.56)"/><text x="${breakdownRound(x)}" y="${height - 13}" text-anchor="middle" fill="#8fa9bf" font-size="11">${breakdownEscape(breakdownFormat(axisFormatter, value))}</text>`;
  }).join("");

  const rowGroups = [];
  rows.forEach((row, rowIndex) => {
    const rowTop = margin.top + rowIndex * rowHeight;
    const rowCenter = rowTop + rowHeight / 2;
    const rowMarks = [`<text x="${breakdownRound(margin.left - 10)}" y="${breakdownRound(rowCenter + 4)}" text-anchor="end" fill="#dceeff" font-size="12">${breakdownEscape(breakdownShortLabel(row.category, 40))}<title>${breakdownEscape(row.category)}</title></text>`];
    const rowLabels = [];
    if (mode === "stacked") {
      for (const segment of rowSegments[rowIndex]) {
        const x0 = scaleX(segment.start);
        const x1 = scaleX(segment.end);
        const exact = breakdownFormat(formatter, segment.value);
        const label = `${row.category}, ${segment.label}: ${exact}`;
        rowLabels.push(label);
        rowMarks.push(breakdownBarMarkup({
          className: "breakdown-bar breakdown-bar-stacked",
          x: Math.min(x0, x1),
          y: rowCenter - 11,
          width: Math.abs(x1 - x0),
          height: 22,
          color: segment.color,
          label,
          tooltip: label,
          anchorX: x1,
          anchorY: rowCenter,
          zero: segment.value === 0,
          hatchPatternId: hatchPatternIds.get(segment.key)
        }));
      }
    } else {
      const innerHeight = Math.max(12, rowHeight - 8);
      const barHeight = Math.min(14, innerHeight / activeSeries.length - 2);
      activeSeries.forEach((item, seriesIndex) => {
        const value = row.values[item.key];
        if (value == null) return;
        const valueX = scaleX(value);
        const y = rowTop + 4 + seriesIndex * (innerHeight / activeSeries.length) + Math.max(0, (innerHeight / activeSeries.length - barHeight) / 2);
        const exact = breakdownFormat(formatter, value);
        const label = `${row.category}, ${item.label}: ${exact}`;
        rowLabels.push(label);
        rowMarks.push(breakdownBarMarkup({
          className: "breakdown-bar breakdown-bar-grouped",
          x: Math.min(zeroX, valueX),
          y,
          width: Math.abs(valueX - zeroX),
          height: barHeight,
          color: item.color,
          label,
          tooltip: label,
          anchorX: valueX,
          anchorY: y + barHeight / 2,
          zero: value === 0,
          hatchPatternId: hatchPatternIds.get(item.key)
        }));
      });
    }
    const keyboardLabel = rowLabels.length ? rowLabels.join("; ") : `${row.category}: no values`;
    rowGroups.push(`<g class="breakdown-focus-row" tabindex="0" role="group" aria-label="${breakdownEscape(keyboardLabel)}" data-breakdown-tooltip="${breakdownEscape(keyboardLabel)}" data-breakdown-x="${breakdownRound(width - margin.right)}" data-breakdown-y="${breakdownRound(rowCenter)}">${rowMarks.join("")}</g>`);
  });

  const scaleControls = supportsXScale
    ? `<div class="breakdown-x-scale-tools" role="group" aria-label="X-axis scale" style="display:flex;align-items:center;gap:7px;margin:0 0 8px;color:#a9bfd3;font-size:.75rem"><span style="font-weight:800">X axis</span><div style="display:flex;gap:3px;padding:3px;border:1px solid #244866;border-radius:8px;background:rgba(7,21,34,.72)"><button type="button" class="chart-mode-button${xScaleMode === "linear" ? " active" : ""}" data-breakdown-x-scale="linear" aria-pressed="${xScaleMode === "linear"}" style="padding:5px 8px">Linear</button><button type="button" class="chart-mode-button${xScaleMode === "symlog" ? " active" : ""}" data-breakdown-x-scale="symlog" aria-pressed="${xScaleMode === "symlog"}" style="padding:5px 8px">Symlog</button><span style="align-self:center;margin-left:3px;color:#718ba1">Symlog preserves zero and spreads small values.</span></div></div>`
    : "";
  const seriesToggles = `<div class="breakdown-series-toggles" role="group" aria-label="Visible series" style="display:flex;gap:6px;flex-wrap:wrap;margin:0 0 8px">${state.series.map(item => {
    const active = state.activeKeys.has(item.key);
    const swatch = item.hatch ? `repeating-linear-gradient(115deg, ${item.color} 0 3px, #e8f5ff 3px 4px)` : item.color;
    return `<button type="button" data-breakdown-toggle="${breakdownEscape(item.key)}" aria-pressed="${active}" style="display:inline-flex;align-items:center;gap:6px;padding:6px 9px;border:1px solid ${active ? item.color : "#274966"};border-radius:7px;background:${active ? "rgba(25,181,254,.10)" : "rgba(7,21,34,.65)"};color:${active ? "#dceeff" : "#8fa9bf"};cursor:pointer"><i aria-hidden="true" style="width:12px;height:7px;border-radius:2px;background:${swatch}"></i>${breakdownEscape(item.label)}</button>`;
  }).join("")}</div>`;
  const toolbar = `${scaleControls}${seriesToggles}`;

  const svg = `<div class="breakdown-scroll" style="overflow-x:auto"><svg class="breakdown-svg breakdown-category-svg" viewBox="0 0 ${width} ${height}" role="group" aria-label="${breakdownEscape(`${mode} category plot`)}" style="display:block;width:${width}px;max-width:none;height:auto;min-height:150px"><defs>${hatchPatterns}</defs><g aria-hidden="true">${grid}<line x1="${breakdownRound(zeroX)}" x2="${breakdownRound(zeroX)}" y1="${margin.top}" y2="${height - margin.bottom}" stroke="rgba(220,238,255,.68)"/></g>${rowGroups.join("")}</svg></div>`;
  container.innerHTML = breakdownFrameMarkup(state.chartId, toolbar, svg, `Interactive ${mode} category chart`);
}

function breakdownBarMarkup({ className, x, y, width, height, color, label, tooltip, anchorX, anchorY, zero, hatchPatternId = null }) {
  const safeColor = breakdownSafeColor(color);
  const fill = hatchPatternId ? `url(#${hatchPatternId})` : safeColor;
  return `<rect class="${className}" x="${breakdownRound(x)}" y="${breakdownRound(y)}" width="${breakdownRound(Math.max(zero ? 1 : 0, width))}" height="${breakdownRound(Math.max(1, height))}" rx="4" fill="${fill}" fill-opacity="${zero ? ".32" : ".88"}" stroke="${safeColor}" stroke-width="${zero ? "1" : ".5"}" role="img" aria-label="${breakdownEscape(label)}" data-breakdown-tooltip="${breakdownEscape(tooltip)}" data-breakdown-x="${breakdownRound(anchorX)}" data-breakdown-y="${breakdownRound(anchorY)}"/>`;
}

function breakdownRenderMatrixState(container, state) {
  const options = state.options;
  const columns = breakdownNormalizeSeries(options.columns);
  const rows = normalizeBreakdownRows(options.rows, {
    categoryKey: options.rowKey,
    series: columns
  });
  if (!rows.length || !columns.length) {
    breakdownRenderEmpty(container, state.chartId);
    return;
  }
  const formatter = typeof options.valueFormatter === "function" ? options.valueFormatter : breakdownDefaultFormat;
  const palette = breakdownResolveMatrixPalette(options);
  const paletteDirection = options.paletteDirection === "reverse" ? "reverse" : "normal";
  const validValues = rows.flatMap(row => columns.map(column => row.values[column.key]).filter(value => value != null));
  const colorMin = validValues.length ? Math.min(0, ...validValues) : 0;
  const colorMax = validValues.length ? Math.max(1, ...validValues) : 1;
  const visibleWidth = Math.max(480, Math.round(Number(container.clientWidth) || 900));
  const labelWidth = breakdownClamp(Math.max(...rows.map(row => row.category.length)) * 7.2 + 24, 105, 205);
  const longestColumnWord = Math.max(...columns.flatMap(column => String(column.label).split(/\s+/).map(word => word.length)));
  const minimumCellWidth = breakdownClamp(longestColumnWord * 6.3 + 18, 82, 190);
  const cellWidth = Math.max(minimumCellWidth, breakdownClamp((visibleWidth - labelWidth - 18) / columns.length, 82, 150));
  const width = Math.max(visibleWidth, labelWidth + columns.length * cellWidth + 18);
  const columnLabelLimit = Math.max(10, Math.floor((cellWidth - 16) / 6.3));
  const columnLabelLines = columns.map(column => breakdownWrapLabel(column.label, columnLabelLimit));
  const maximumHeaderLines = Math.max(...columnLabelLines.map(lines => lines.length));
  const legendPosition = options.legendPosition === "top" ? "top" : "bottom";
  const headerHeight = (legendPosition === "top" ? 54 : 22) + maximumHeaderLines * 14 + 20;
  const rowHeight = 42;
  const footerHeight = legendPosition === "bottom" ? 42 : 12;
  const height = headerHeight + rows.length * rowHeight + footerHeight;
  const cells = [];

  columns.forEach((column, columnIndex) => {
    const x = labelWidth + columnIndex * cellWidth + cellWidth / 2;
    const firstLineY = legendPosition === "top" ? 57 : 25;
    const lines = columnLabelLines[columnIndex].map((line, lineIndex) => `<tspan x="${breakdownRound(x)}" y="${firstLineY + lineIndex * 14}">${breakdownEscape(line)}</tspan>`).join("");
    const labelSvg = `<text x="${breakdownRound(x)}" text-anchor="middle" fill="#a9bfd3" font-size="11">${lines}<title>${breakdownEscape(column.label)}</title></text>`;
    const bubbleY = firstLineY + columnLabelLines[columnIndex].length * 14 + 5;
    const bubbleBtn = `<g class="matrix-info-bubble-btn" role="button" tabindex="0" aria-label="Explanation for ${breakdownEscape(column.label)}" data-breakdown-metric-btn="${breakdownEscape(column.key)}" data-breakdown-x="${breakdownRound(x)}" data-breakdown-y="${breakdownRound(bubbleY)}" cursor="pointer"><circle cx="${breakdownRound(x)}" cy="${breakdownRound(bubbleY)}" r="7.5" fill="rgba(25,181,254,0.18)" stroke="#19b5fe" stroke-width="1.2"/><text x="${breakdownRound(x)}" y="${breakdownRound(bubbleY + 3.5)}" text-anchor="middle" fill="#19b5fe" font-size="9.5" font-weight="800">?</text></g>`;
    cells.push(`<g class="matrix-header-column" data-breakdown-metric-col="${breakdownEscape(column.key)}">${labelSvg}${bubbleBtn}</g>`);
  });
  rows.forEach((row, rowIndex) => {
    const y = headerHeight + rowIndex * rowHeight;
    const rowCells = [`<text x="${breakdownRound(labelWidth - 10)}" y="${breakdownRound(y + 25)}" text-anchor="end" fill="#dceeff" font-size="12">${breakdownEscape(breakdownShortLabel(row.category, 24))}<title>${breakdownEscape(row.category)}</title></text>`];
    const rowLabels = [];
    columns.forEach((column, columnIndex) => {
      const value = row.values[column.key];
      const exact = value == null ? "n/a" : breakdownFormat(formatter, value);
      const label = `${row.category}, ${column.label}: ${exact}`;
      rowLabels.push(label);
      const x = labelWidth + columnIndex * cellWidth + 3;
      const fill = value == null ? "#10283d" : breakdownMatrixColor(value, colorMin, colorMax, palette, paletteDirection);
      const textColor = value == null ? "#e8f5ff" : breakdownContrastText(fill);
      rowCells.push(`<g class="breakdown-matrix-cell" role="img" aria-label="${breakdownEscape(label)}" data-breakdown-tooltip="${breakdownEscape(label)}" data-breakdown-x="${breakdownRound(x + (cellWidth - 6) / 2)}" data-breakdown-y="${breakdownRound(y + 19)}"><rect x="${breakdownRound(x)}" y="${breakdownRound(y + 3)}" width="${breakdownRound(cellWidth - 6)}" height="34" rx="6" fill="${fill}" stroke="${value == null ? "#38536a" : "rgba(220,238,255,.20)"}" ${value == null ? 'stroke-dasharray="3 3"' : ""}/><text x="${breakdownRound(x + (cellWidth - 6) / 2)}" y="${breakdownRound(y + 25)}" text-anchor="middle" fill="${textColor}" font-size="11" font-weight="700">${breakdownEscape(exact)}</text></g>`);
    });
    const keyboardLabel = rowLabels.join("; ");
    cells.push(`<g class="breakdown-focus-row" tabindex="0" role="group" aria-label="${breakdownEscape(keyboardLabel)}" data-breakdown-tooltip="${breakdownEscape(keyboardLabel)}" data-breakdown-x="${breakdownRound(width - 18)}" data-breakdown-y="${breakdownRound(y + 19)}">${rowCells.join("")}</g>`);
  });

  const legendAlign = options.legendAlign === "left" ? "left" : "right";
  const legendY = legendPosition === "top" ? 21 : height - 21;
  const legendX = legendPosition === "top" && legendAlign === "left"
    ? 56
    : legendAlign === "left" ? labelWidth + 38 : Math.max(labelWidth, width - 210);
  cells.push(`<g data-matrix-legend-align="${legendAlign}" data-matrix-legend-position="${legendPosition}"><defs><linearGradient id="${breakdownDomId(state.chartId)}-matrix-gradient" x1="0" x2="1"><stop offset="0" stop-color="${breakdownMatrixColor(colorMin, colorMin, colorMax, palette, paletteDirection)}"/><stop offset="1" stop-color="${breakdownMatrixColor(colorMax, colorMin, colorMax, palette, paletteDirection)}"/></linearGradient></defs><text x="${legendX - 8}" y="${legendY + 4}" text-anchor="end" fill="#8fa9bf" font-size="10">Lower</text><rect x="${legendX}" y="${legendY - 7}" width="120" height="12" rx="6" fill="url(#${breakdownDomId(state.chartId)}-matrix-gradient)"/><text x="${legendX + 128}" y="${legendY + 4}" fill="#8fa9bf" font-size="10">Higher</text></g>`);

  const svg = `<div class="breakdown-scroll" style="overflow-x:auto"><svg class="breakdown-svg breakdown-matrix-svg" viewBox="0 0 ${width} ${height}" role="group" aria-label="Value matrix plot" style="display:block;width:${width}px;max-width:none;height:auto">${cells.join("")}</svg></div>`;
  container.innerHTML = breakdownFrameMarkup(state.chartId, "", svg, "Interactive value matrix");
}

function breakdownRenderScatterState(container, state) {
  const options = state.options;
  const sourceRows = Array.isArray(options.rows) ? options.rows : [];
  const scatterSeries = state.series || [];
  const seriesByKey = new Map(scatterSeries.map(item => [item.key, item]));
  const seriesKey = scatterSeries.length && options.seriesKey != null ? String(options.seriesKey) : null;
  const seriesLabelKey = seriesKey && options.seriesLabelKey != null ? String(options.seriesLabelKey) : null;
  const labelKey = String(options.labelKey ?? "label");
  const xKey = String(options.xKey ?? "x");
  const yKey = String(options.yKey ?? "y");
  const sizeKey = options.sizeKey == null ? null : String(options.sizeKey);
  const colorKey = options.colorKey == null ? null : String(options.colorKey);
  const xLabel = breakdownOptionLabel(options.xLabel, xKey);
  const yLabel = breakdownOptionLabel(options.yLabel, yKey);
  const sizeLabel = sizeKey ? breakdownOptionLabel(options.sizeLabel, sizeKey) : null;
  const colorLabel = colorKey ? breakdownOptionLabel(options.colorLabel, colorKey) : null;
  const xScaleType = options.xScale === "log" ? "log" : options.xScale === "log1p" ? "log1p" : "linear";
  const xFormatter = typeof options.xFormatter === "function" ? options.xFormatter : breakdownDefaultFormat;
  const yFormatter = typeof options.yFormatter === "function" ? options.yFormatter : breakdownDefaultFormat;
  const sizeFormatter = typeof options.sizeFormatter === "function" ? options.sizeFormatter : breakdownDefaultFormat;
  const colorFormatter = typeof options.colorFormatter === "function" ? options.colorFormatter : breakdownDefaultFormat;
  const colorPalette = breakdownNormalizePalette(options.colorPalette);
  const colorPaletteDirection = options.colorPaletteDirection === "reverse" ? "reverse" : "normal";
  const points = sourceRows.flatMap((row, sourceIndex) => {
    const labelValue = row?.[labelKey];
    const rawSeriesKey = seriesKey ? row?.[seriesKey] : null;
    const pointSeriesKey = rawSeriesKey == null ? null : String(rawSeriesKey);
    const x = breakdownFiniteNumber(row?.[xKey]);
    const y = breakdownFiniteNumber(row?.[yKey]);
    if (labelValue == null || !String(labelValue).trim() || x == null || y == null
        || (xScaleType === "log" && x <= 0) || (xScaleType === "log1p" && x < 0)
        || (seriesKey && (!pointSeriesKey || !seriesByKey.has(pointSeriesKey)))) return [];
    const configuredSeries = pointSeriesKey ? seriesByKey.get(pointSeriesKey) : null;
    const rawSeriesLabel = seriesLabelKey ? row?.[seriesLabelKey] : null;
    return [{
      label: String(labelValue),
      seriesKey: pointSeriesKey,
      seriesLabel: configuredSeries?.label || (rawSeriesLabel == null ? pointSeriesKey : String(rawSeriesLabel)),
      x,
      y,
      size: sizeKey ? breakdownFiniteNumber(row?.[sizeKey]) : null,
      color: colorKey ? breakdownFiniteNumber(row?.[colorKey]) : null,
      sourceIndex
    }];
  });
  if (!points.length) {
    breakdownRenderEmpty(container, state.chartId, "No plottable values are available for this chart.");
    return;
  }

  const requestedFixedXDomain = chartFixedYDomain(options.fixedXDomain);
  const fixedXDomain = requestedFixedXDomain
    && (xScaleType === "linear"
      || (xScaleType === "log" && requestedFixedXDomain.min > 0)
      || (xScaleType === "log1p" && requestedFixedXDomain.min >= 0))
    ? requestedFixedXDomain
    : null;
  const fixedYDomain = chartFixedYDomain(options.fixedYDomain);
  const supportsYScale = !fixedYDomain;
  const width = Math.max(breakdownChartMinimumWidth(options.minWidth), Math.round(Number(container.clientWidth) || 900));
  const height = width < 660 ? 390 : 440;
  const margin = { left: width < 660 ? 66 : 84, right: 28, top: supportsYScale ? 64 : 28, bottom: 58 };
  const plotWidth = width - margin.left - margin.right;
  const plotHeight = height - margin.top - margin.bottom;
  const xDataMin = Math.min(...points.map(point => point.x));
  const xDataMax = Math.max(...points.map(point => point.x));
  let xMin = fixedXDomain?.min ?? xDataMin;
  let xMax = fixedXDomain?.max ?? xDataMax;
  let yMin = Math.min(0, ...points.map(point => point.y));
  let yMax = Math.max(0, ...points.map(point => point.y));
  if (fixedXDomain) {
    // Preserve the caller's semantic X domain exactly (for example, 0-100%
    // utilization) instead of padding it around the observed points.
  } else if (xScaleType === "log") {
    if (xMin === xMax) {
      xMin /= Math.sqrt(10);
      xMax *= Math.sqrt(10);
    }
  } else {
    xMin = Math.min(0, xMin);
    xMax = Math.max(0, xMax);
    if (xMin === xMax) xMax = xMin + 1;
    const xSpan = xMax - xMin;
    if (xMin < 0) xMin -= xSpan * 0.04;
    if (xMax > 0) xMax += xSpan * 0.06;
  }
  if (yMin === yMax) yMax = yMin + 1;
  const ySpan = yMax - yMin;
  if (yMin < 0) yMin -= ySpan * 0.04;
  if (yMax > 0) yMax += ySpan * 0.06;
  const autoYDomain = { min: yMin, max: yMax };
  const hasManualYDomain = supportsYScale
    && Number.isFinite(Number(state.yDomain?.min))
    && Number.isFinite(Number(state.yDomain?.max))
    && Number(state.yDomain.max) > Number(state.yDomain.min);
  const yDomain = fixedYDomain
    ?? (hasManualYDomain
      ? { min: Number(state.yDomain.min), max: Number(state.yDomain.max) }
      : autoYDomain);
  const yScaleMode = supportsYScale && state.yScaleMode === "symlog" ? "symlog" : "linear";
  const ySymlogConstant = yScaleMode === "symlog"
    ? hasManualYDomain && Number.isFinite(Number(state.ySymlogConstant)) && Number(state.ySymlogConstant) > 0
      ? Number(state.ySymlogConstant)
      : chartSymlogConstant(autoYDomain)
    : 1;

  const transformX = value => xScaleType === "log"
    ? Math.log10(value)
    : xScaleType === "log1p"
      ? Math.log10(1 + value)
      : value;
  const transformedXMin = transformX(xMin);
  const transformedXMax = transformX(xMax);
  const scaleX = value => margin.left + (transformX(value) - transformedXMin) / (transformedXMax - transformedXMin) * plotWidth;
  const scaleY = chartCreateYScale(yDomain, yScaleMode, ySymlogConstant, margin.top, height - margin.bottom).map;
  const xReferenceLines = (Array.isArray(options.xReferenceLines) ? options.xReferenceLines : [])
    .flatMap((reference, index) => {
      const value = breakdownFiniteNumber(reference?.value);
      if (value == null || value < xMin || value > xMax
          || (xScaleType === "log" && value <= 0)
          || (xScaleType === "log1p" && value < 0)) return [];
      return [{
        value,
        label: String(reference?.label || breakdownFormat(xFormatter, value)),
        color: breakdownSafeColor(reference?.color || "#dceeff"),
        dash: String(reference?.dash || (index % 2 ? "5 4" : ""))
      }];
    });
  const sizeValues = points.map(point => point.size).filter(value => value != null && value >= 0);
  const sizeMin = sizeValues.length ? Math.min(...sizeValues) : 0;
  const sizeMax = sizeValues.length ? Math.max(...sizeValues) : 0;
  const minimumPointRadius = Math.max(1.5, breakdownFiniteNumber(options.minimumPointRadius) ?? 5);
  const maximumPointRadius = Math.max(minimumPointRadius, breakdownFiniteNumber(options.maximumPointRadius) ?? 18);
  const radius = value => {
    if (value == null || value < 0) return minimumPointRadius;
    if (sizeMax <= sizeMin) return (minimumPointRadius + maximumPointRadius) / 2;
    return minimumPointRadius + (maximumPointRadius - minimumPointRadius) * Math.sqrt((value - sizeMin) / (sizeMax - sizeMin));
  };
  const bubbleClipPadding = Math.max(...points.map(point => radius(point.size))) + 1;
  const colorValues = points.map(point => point.color).filter(value => value != null);
  const colorMin = colorValues.length ? Math.min(...colorValues) : 0;
  const colorMax = colorValues.length ? Math.max(...colorValues) : 1;

  const xTicks = xScaleType === "log"
    ? breakdownLogTicks(xMin, xMax, 5)
    : xScaleType === "log1p"
      ? options.integerXTicks
        ? breakdownLogOnePlusIntegerTicks(xDataMin, xDataMax, 6)
        : breakdownLogTicks(1 + xMin, 1 + xMax, 6).map(value => value - 1)
    : options.integerXTicks
      ? breakdownIntegerTicks(xMin, xMax, 6)
      : breakdownLinearTicks(xMin, xMax, 5);
  const yTicks = chartYTickValues(yDomain, yScaleMode, ySymlogConstant, 5);
  const grid = [
    ...xTicks.map(value => {
      const x = scaleX(value);
      return `<line class="breakdown-x-grid" x1="${breakdownRound(x)}" x2="${breakdownRound(x)}" y1="${margin.top}" y2="${height - margin.bottom}" stroke="rgba(36,72,102,.52)" data-breakdown-x-tick="${breakdownEscape(value)}"/><text x="${breakdownRound(x)}" y="${height - 30}" text-anchor="middle" fill="#8fa9bf" font-size="11">${breakdownEscape(breakdownFormat(xFormatter, value))}</text>`;
    }),
    ...yTicks.map(value => {
      const y = scaleY(value);
      return `<line x1="${margin.left}" x2="${width - margin.right}" y1="${breakdownRound(y)}" y2="${breakdownRound(y)}" stroke="rgba(36,72,102,.52)"/><text x="${margin.left - 10}" y="${breakdownRound(y + 4)}" text-anchor="end" fill="#8fa9bf" font-size="11">${breakdownEscape(breakdownFormat(yFormatter, value))}</text>`;
    })
  ].join("");
  const xReferenceMarkup = xReferenceLines.map((reference, index) => {
    const x = scaleX(reference.value);
    const labelX = breakdownClamp(x + (index % 2 ? 7 : -7), margin.left + 8, width - margin.right - 8);
    const anchor = labelX >= x ? "start" : "end";
    const dash = reference.dash ? ` stroke-dasharray="${breakdownEscape(reference.dash)}"` : "";
    return `<g class="breakdown-scatter-x-reference" data-breakdown-x-reference="${breakdownEscape(reference.value)}"><line x1="${breakdownRound(x)}" x2="${breakdownRound(x)}" y1="${margin.top}" y2="${height - margin.bottom}" stroke="${reference.color}" stroke-opacity=".82" stroke-width="1.5"${dash}/><text x="${breakdownRound(labelX)}" y="${margin.top + 14 + index * 15}" text-anchor="${anchor}" fill="${reference.color}" font-size="10.5" font-weight="700">${breakdownEscape(reference.label)}</text></g>`;
  }).join("");

  const isSeriesEmphasized = key => !seriesKey || state.activeKeys.has(key);
  const mutedSeriesColor = breakdownSafeColor(options.mutedSeriesColor || "#dceeff");
  const sortedPoints = [...points].sort((a, b) => {
    const emphasisOrder = Number(isSeriesEmphasized(a.seriesKey)) - Number(isSeriesEmphasized(b.seriesKey));
    return emphasisOrder || radius(b.size) - radius(a.size) || a.sourceIndex - b.sourceIndex;
  });
  state.rovingIndex = breakdownClamp(Math.trunc(Number(state.rovingIndex) || 0), 0, sortedPoints.length - 1);
  const pointColor = breakdownSafeColor(options.pointColor || "#718ba1");
  const connectionGroups = seriesKey
    ? scatterSeries.map(series => ({ series, points: points.filter(point => point.seriesKey === series.key) }))
    : [{ series: null, points }];
  const connectionMarkup = options.connectPoints
    ? connectionGroups
      .filter(group => group.points.length > 1)
      .sort((a, b) => Number(isSeriesEmphasized(a.series?.key)) - Number(isSeriesEmphasized(b.series?.key)))
      .map(group => {
        const emphasized = isSeriesEmphasized(group.series?.key);
        const stroke = group.series
          ? emphasized ? group.series.color : mutedSeriesColor
          : breakdownSafeColor(options.lineColor || pointColor);
        const seriesData = group.series
          ? ` data-breakdown-series-key="${breakdownEscape(group.series.key)}" data-breakdown-series-state="${emphasized ? "emphasized" : "muted"}"`
          : "";
        const coordinates = [...group.points]
          .sort((a, b) => a.x - b.x || a.sourceIndex - b.sourceIndex)
          .map(point => `${breakdownRound(scaleX(point.x))},${breakdownRound(scaleY(point.y))}`)
          .join(" ");
        return `<polyline class="breakdown-scatter-connection"${seriesData} points="${coordinates}" fill="none" stroke="${stroke}" stroke-opacity="${emphasized ? ".92" : ".16"}" stroke-width="${emphasized ? "2.6" : "1.2"}" stroke-linejoin="round" stroke-linecap="round" aria-hidden="true"/>`;
      }).join("")
    : "";
  const pointMarkup = sortedPoints
    .map((point, pointIndex) => {
      const xText = breakdownFormat(xFormatter, point.x);
      const yText = breakdownFormat(yFormatter, point.y);
      const sizeText = sizeKey ? (point.size == null ? "n/a" : breakdownFormat(sizeFormatter, point.size)) : null;
      const colorText = colorKey ? (point.color == null ? "n/a" : breakdownFormat(colorFormatter, point.color)) : null;
      const parts = [seriesKey ? `${point.seriesLabel} / ${point.label}` : `${point.label}`, `${xLabel}: ${xText}`, `${yLabel}: ${yText}`];
      if (sizeKey) parts.push(`${sizeLabel}: ${sizeText}`);
      if (colorKey) parts.push(`${colorLabel}: ${colorText}`);
      const label = parts.join(", ");
      const x = scaleX(point.x);
      const y = scaleY(point.y);
      const pointSeries = point.seriesKey ? seriesByKey.get(point.seriesKey) : null;
      const emphasized = isSeriesEmphasized(point.seriesKey);
      const fill = pointSeries
        ? emphasized ? pointSeries.color : mutedSeriesColor
        : point.color == null ? pointColor : breakdownMatrixColor(point.color, colorMin, colorMax, colorPalette, colorPaletteDirection);
      const seriesData = pointSeries
        ? ` data-breakdown-series-key="${breakdownEscape(pointSeries.key)}" data-breakdown-series-state="${emphasized ? "emphasized" : "muted"}"`
        : "";
      const sizeValue = sizeKey ? ` data-breakdown-size-value="${breakdownEscape(sizeText)}"` : "";
      const colorValue = colorKey ? ` data-breakdown-color-value="${breakdownEscape(colorText)}"` : "";
      return `<circle class="breakdown-scatter-point"${seriesData} cx="${breakdownRound(x)}" cy="${breakdownRound(y)}" r="${breakdownRound(radius(point.size))}" fill="${fill}" fill-opacity="${emphasized ? ".78" : ".13"}" stroke="${emphasized ? "#dceeff" : mutedSeriesColor}" stroke-opacity="${emphasized ? ".9" : ".22"}" stroke-width="${emphasized ? "1" : ".7"}" tabindex="${pointIndex === state.rovingIndex ? "0" : "-1"}" role="img" aria-label="${breakdownEscape(label)}" data-breakdown-roving="scatter" data-breakdown-tooltip="${breakdownEscape(label)}" data-breakdown-x="${breakdownRound(x)}" data-breakdown-y="${breakdownRound(y)}"${sizeValue}${colorValue}/>`;
    }).join("");

  const excludedCount = sourceRows.length - points.length;
  const noteParts = [];
  if (xScaleType === "log") noteParts.push("Log scale");
  if (xScaleType === "log1p") noteParts.push("Log(1 + value) X spacing; exact values are unchanged");
  if (excludedCount) noteParts.push(`${excludedCount} unplottable row${excludedCount === 1 ? "" : "s"} excluded`);
  if (supportsYScale) noteParts.push("Drag the Y axis to rescale; double-click or press Home to reset to Linear");
  const note = noteParts.length
    ? `<p class="breakdown-note" style="margin:0 0 6px;color:#8fa9bf;font-size:.75rem">${breakdownEscape(noteParts.join(" | "))}</p>`
    : "";
  const encodingItems = [];
  if (sizeKey && sizeValues.length) {
    const sizeDomain = breakdownDomainText(sizeFormatter, sizeMin, sizeMax);
    encodingItems.push(`<div class="breakdown-scatter-encoding" aria-label="Point area, ${breakdownEscape(sizeLabel)}: ${breakdownEscape(sizeDomain)}" style="display:flex;align-items:center;gap:7px"><span style="color:#a9bfd3"><strong style="color:#dceeff">Point area</strong> &middot; ${breakdownEscape(sizeLabel)}</span><span data-breakdown-size-readout data-breakdown-size-domain="${breakdownEscape(sizeDomain)}" style="color:#8fa9bf">${breakdownEscape(sizeDomain)}</span></div>`);
  }
  if (colorKey && colorValues.length) {
    const colorDomain = breakdownDomainText(colorFormatter, colorMin, colorMax);
    const lowColor = breakdownMatrixColor(colorMin, colorMin, colorMax, colorPalette, colorPaletteDirection);
    const highColor = breakdownMatrixColor(colorMax, colorMin, colorMax, colorPalette, colorPaletteDirection);
    encodingItems.push(`<div class="breakdown-scatter-encoding" aria-label="Color, ${breakdownEscape(colorLabel)}: ${breakdownEscape(colorDomain)}" style="display:flex;align-items:center;gap:7px"><span style="color:#a9bfd3"><strong style="color:#dceeff">Color</strong> &middot; ${breakdownEscape(colorLabel)}</span><i aria-hidden="true" style="display:inline-block;width:72px;height:8px;border-radius:999px;background:linear-gradient(90deg,${lowColor},${highColor})"></i><span data-breakdown-color-readout data-breakdown-color-domain="${breakdownEscape(colorDomain)}" style="color:#8fa9bf">${breakdownEscape(colorDomain)}</span></div>`);
  }
  const encodingLegend = encodingItems.length ? `<div class="breakdown-scatter-legends" role="group" aria-label="Scatter encodings" style="display:flex;gap:8px 18px;flex-wrap:wrap;margin:0 0 6px;font-size:.75rem">${encodingItems.join("")}</div>` : "";
  const seriesLegendLabel = String(options.seriesLegendLabel || "Markets");
  const seriesLegendHelp = String(options.seriesLegendHelp || "Select a market to emphasize or mute it. Muted curves stay visible in pale grey for context.");
  const seriesLegend = scatterSeries.length
    ? `<div class="breakdown-scatter-series-legend" role="group" aria-label="${breakdownEscape(seriesLegendLabel)} emphasis" style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;margin:0 0 8px"><span style="margin-right:2px;color:#a9bfd3;font-size:.75rem;font-weight:800">${breakdownEscape(seriesLegendLabel)}</span>${scatterSeries.map(series => {
      const emphasized = state.activeKeys.has(series.key);
      const stateLabel = emphasized ? "emphasized" : "muted";
      const detail = series.legendDetail ? ` · ${series.legendDetail}` : "";
      return `<button type="button" class="breakdown-scatter-series-toggle ${stateLabel}" data-breakdown-scatter-toggle="${breakdownEscape(series.key)}" aria-pressed="${emphasized}" aria-label="${breakdownEscape(series.label + detail)}, ${stateLabel}; activate to ${emphasized ? "mute" : "emphasize"}. The curve remains visible." title="${emphasized ? "Mute" : "Emphasize"} ${breakdownEscape(series.label)}" style="display:inline-flex;align-items:center;gap:6px;padding:5px 8px;border:1px solid ${emphasized ? series.color : "rgba(220,238,255,.22)"};border-radius:999px;background:${emphasized ? "rgba(25,181,254,.09)" : "rgba(220,238,255,.025)"};color:${emphasized ? "#e8f7ff" : "#71879a"};font-size:.72rem;line-height:1.1;opacity:${emphasized ? "1" : ".68"}"><i aria-hidden="true" style="display:inline-block;width:16px;height:${emphasized ? "3" : "1px"};border-radius:999px;background:${emphasized ? series.color : mutedSeriesColor}"></i>${breakdownEscape(series.label + detail)}</button>`;
    }).join("")}</div><p class="breakdown-note" style="margin:0 0 8px;color:#8fa9bf;font-size:.75rem">${options.seriesOrderNote ? `${breakdownEscape(options.seriesOrderNote)} ` : ""}${breakdownEscape(seriesLegendHelp)}</p>`
    : "";
  const scaleControls = supportsYScale
    ? `<div class="breakdown-y-scale-tools" role="group" aria-label="Y-axis scale" style="position:absolute;z-index:2;top:8px;left:8px;display:flex;align-items:center;gap:7px;color:#a9bfd3;font-size:.75rem"><span style="font-weight:800">Y axis</span><div style="display:flex;gap:3px;padding:3px;border:1px solid #244866;border-radius:8px;background:rgba(7,21,34,.90)"><button type="button" class="chart-mode-button${yScaleMode === "linear" ? " active" : ""}" data-breakdown-y-scale="linear" aria-pressed="${yScaleMode === "linear"}" style="padding:5px 8px">Linear</button><button type="button" class="chart-mode-button${yScaleMode === "symlog" ? " active" : ""}" data-breakdown-y-scale="symlog" aria-pressed="${yScaleMode === "symlog"}" style="padding:5px 8px">Symlog</button></div></div>`
    : "";
  const toolbar = `${seriesLegend}${encodingLegend}${note}`;
  const axes = `<text x="${breakdownRound(margin.left + plotWidth / 2)}" y="${height - 7}" text-anchor="middle" fill="#a9bfd3" font-size="12">${breakdownEscape(xLabel)}${xScaleType === "log" ? " (log)" : xScaleType === "log1p" ? " (log spacing)" : ""}</text><text transform="translate(16 ${breakdownRound(margin.top + plotHeight / 2)}) rotate(-90)" text-anchor="middle" fill="#a9bfd3" font-size="12">${breakdownEscape(yLabel)}${yScaleMode === "symlog" ? " (symlog)" : ""}</text>`;
  const clipId = `${breakdownDomId(state.chartId)}-scatter-clip`;
  const clipBounds = {
    x: margin.left - bubbleClipPadding,
    y: margin.top - bubbleClipPadding,
    width: plotWidth + bubbleClipPadding * 2,
    height: plotHeight + bubbleClipPadding * 2
  };
  const axisLabel = `Y axis, ${yScaleMode}. Drag up to narrow or down to widen. Use Arrow Up and Arrow Down when focused; Home or Enter resets to Linear. Current range ${breakdownFormat(yFormatter, yDomain.min)} to ${breakdownFormat(yFormatter, yDomain.max)}.`;
  const yAxisTarget = supportsYScale
    ? `<rect class="breakdown-y-axis-target" data-breakdown-y-axis x="0" y="${margin.top}" width="${Math.max(1, margin.left - 2)}" height="${plotHeight}" fill="transparent" pointer-events="all" tabindex="0" role="button" aria-label="${breakdownEscape(axisLabel)}" aria-keyshortcuts="ArrowUp ArrowDown Home Enter Space"><title>Drag the Y axis to rescale; double-click to reset to Linear</title></rect>`
    : "";
  const plotSvg = `<svg class="breakdown-svg breakdown-scatter-svg" viewBox="0 0 ${width} ${height}" role="group" aria-label="${options.connectPoints ? "Cumulative line plot" : "Scatter plot"}" style="display:block;width:${width}px;max-width:none;height:auto;min-height:300px"><defs><clipPath id="${clipId}"><rect class="breakdown-scatter-clip-bounds" x="${breakdownRound(clipBounds.x)}" y="${breakdownRound(clipBounds.y)}" width="${breakdownRound(clipBounds.width)}" height="${breakdownRound(clipBounds.height)}"/></clipPath></defs><g aria-hidden="true">${grid}${axes}${xReferenceMarkup}</g><g clip-path="url(#${clipId})">${connectionMarkup}${pointMarkup}</g>${yAxisTarget}</svg>`;
  const svg = `<div class="breakdown-scroll" style="overflow-x:auto"><div class="breakdown-scatter-shell" style="position:relative;width:${width}px">${scaleControls}${plotSvg}</div></div>`;
  state.scatterGeometry = { width, height, plotHeight, yDomain, yScaleMode, ySymlogConstant, supportsYScale };
  container.innerHTML = breakdownFrameMarkup(state.chartId, toolbar, svg, options.connectPoints ? "Interactive cumulative line chart" : "Interactive scatter chart");
}

function breakdownFrameMarkup(chartId, toolbar, body, accessibleLabel = "Interactive breakdown chart") {
  return `<div class="interactive-breakdown-chart" data-breakdown-chart-id="${breakdownEscape(chartId)}" role="region" aria-label="${breakdownEscape(accessibleLabel)}" style="position:relative;min-width:0;color:#dceeff">
    <style>
      .interactive-breakdown-chart [tabindex="0"]:focus{outline:none;filter:drop-shadow(0 0 4px rgba(62,220,129,.9));stroke:#fff;stroke-width:2.5px}
      .interactive-breakdown-chart button:focus-visible{outline:2px solid #3edc81;outline-offset:2px}
      .breakdown-y-axis-target{cursor:ns-resize;touch-action:none}
      .breakdown-y-axis-target:focus{fill:rgba(25,181,254,.07)}
      .matrix-info-bubble-btn:hover circle, .matrix-info-bubble-btn:focus-visible circle { fill: #19b5fe; stroke: #3edc81; filter: drop-shadow(0 0 5px rgba(25,181,254,0.8)); }
      .matrix-info-bubble-btn:hover text, .matrix-info-bubble-btn:focus-visible text { fill: #071522; font-weight: 900; }
      .breakdown-popover { position: absolute; z-index: 100; width: 330px; max-width: calc(100% - 24px); padding: 14px 16px; border: 1px solid #19b5fe; border-radius: 10px; background: rgba(12, 33, 54, 0.96); color: #e8f5ff; box-shadow: 0 12px 36px rgba(0,0,0,0.65); font-size: .82rem; line-height: 1.45; backdrop-filter: blur(8px); }
      .breakdown-popover-header { display: flex; align-items: center; justify-content: space-between; gap: 10px; margin-bottom: 8px; padding-bottom: 6px; border-bottom: 1px solid rgba(25,181,254,0.22); }
      .breakdown-popover-title { margin: 0; font-size: .95rem; font-weight: 700; color: #19b5fe; }
      .breakdown-popover-close { display: inline-flex; align-items: center; justify-content: center; width: 22px; height: 22px; border: 1px solid rgba(255,255,255,0.15); border-radius: 50%; background: rgba(255,255,255,0.06); color: #a9bfd3; font-size: 14px; line-height: 1; cursor: pointer; }
      .breakdown-popover-close:hover { background: rgba(255,255,255,0.18); color: #fff; }
      .breakdown-popover-explanation { margin: 0 0 10px 0; color: #dceeff; }
      .breakdown-popover-formula-label { margin: 8px 0 4px 0; font-size: .75rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; color: #8fa9bf; }
      .formula-card { display: flex; align-items: center; justify-content: center; gap: 4px; padding: 10px 12px; margin: 6px 0; border: 1px solid rgba(25,181,254,0.3); border-radius: 8px; background: rgba(7,21,34,0.85); font-family: "Fira Code", monospace, SFMono-Regular, Consolas, sans-serif; font-size: .82rem; color: #e8f5ff; overflow-x: auto; }
      .formula-func { color: #3edc81; font-weight: 700; }
      .formula-val { color: #ffb84d; font-weight: 700; }
      .formula-paren { color: #8fa9bf; font-weight: 700; }
      .formula-frac { display: inline-flex; flex-direction: column; align-items: center; vertical-align: middle; padding: 0 4px; }
      .formula-num { border-bottom: 1px solid #19b5fe; padding-bottom: 2px; text-align: center; }
      .formula-den { padding-top: 2px; text-align: center; }
      .breakdown-popover-range { margin-top: 8px; padding-top: 6px; border-top: 1px dashed rgba(36,72,102,0.6); font-size: .76rem; color: #3edc81; }
    </style>
    ${toolbar}${body}
    <div class="breakdown-tooltip" role="tooltip" aria-hidden="true" hidden style="position:absolute;z-index:5;max-width:280px;padding:8px 10px;border:1px solid #315773;border-radius:8px;background:#071522;color:#e8f5ff;box-shadow:0 8px 24px rgba(0,0,0,.32);pointer-events:none;font-size:.78rem;line-height:1.35"></div>
    <div class="breakdown-popover" role="dialog" aria-modal="false" aria-hidden="true" hidden></div>
  </div>`;
}

function breakdownRenderEmpty(container, chartId, message = "No values are available for this chart.") {
  container.innerHTML = `<div class="interactive-breakdown-chart" data-breakdown-chart-id="${breakdownEscape(chartId)}"><div class="breakdown-empty" role="status" style="min-height:120px;display:grid;place-items:center;padding:20px;border:1px dashed #315773;border-radius:10px;color:#8fa9bf">${breakdownEscape(message)}</div></div>`;
}

function breakdownLinearTicks(minimum, maximum, count) {
  const safeCount = Math.max(2, Math.trunc(Number(count) || 5));
  if (!Number.isFinite(minimum) || !Number.isFinite(maximum) || maximum <= minimum) return [0, 1];
  return Array.from({ length: safeCount }, (_, index) => minimum + index / (safeCount - 1) * (maximum - minimum));
}

function breakdownIntegerTicks(minimum, maximum, count) {
  const low = Math.ceil(minimum);
  const high = Math.floor(maximum);
  if (!Number.isFinite(low) || !Number.isFinite(high) || high < low) return [];
  const safeCount = Math.max(2, Math.trunc(Number(count) || 6));
  const step = Math.max(1, Math.ceil((high - low) / (safeCount - 1)));
  const values = [];
  for (let value = low; value <= high; value += step) values.push(value);
  if (values.at(-1) !== high) values.push(high);
  return values;
}

function breakdownLogTicks(minimum, maximum, count) {
  const safeCount = Math.max(2, Math.trunc(Number(count) || 5));
  if (!(minimum > 0) || !(maximum > minimum)) return [minimum || 1, maximum || 10];
  const logMin = Math.log10(minimum);
  const logMax = Math.log10(maximum);
  return Array.from({ length: safeCount }, (_, index) => 10 ** (logMin + index / (safeCount - 1) * (logMax - logMin)));
}

function breakdownLogOnePlusIntegerTicks(minimum, maximum, count) {
  const low = Math.max(0, Math.ceil(minimum));
  const high = Math.max(low, Math.floor(maximum));
  const safeCount = Math.max(3, Math.trunc(Number(count) || 6));
  const values = [0, 1, 2].filter(value => value >= low && value <= high);
  if (!values.length) values.push(low);
  if (values.includes(high)) return [...new Set(values)];

  const remaining = Math.max(1, safeCount - values.length);
  const anchor = values.at(-1);
  const transformedAnchor = Math.log1p(anchor);
  const transformedHigh = Math.log1p(high);
  for (let index = 1; index <= remaining; index += 1) {
    const ratio = index / remaining;
    const value = Math.round(Math.expm1(transformedAnchor + ratio * (transformedHigh - transformedAnchor)));
    if (value >= low && value <= high && !values.includes(value)) values.push(value);
  }
  if (!values.includes(high)) values.push(high);
  return values.sort((a, b) => a - b);
}

function breakdownMatrixColor(value, minimum, maximum, palette = null, direction = "normal") {
  let ratio = breakdownClamp((value - minimum) / Math.max(1e-12, maximum - minimum), 0, 1);
  if (direction === "reverse") ratio = 1 - ratio;
  if (Array.isArray(palette) && palette.length >= 2) return breakdownPaletteColor(palette, ratio);
  let start;
  let end;
  let local;
  if (ratio < 0.55) {
    start = [15, 48, 73];
    end = [25, 181, 254];
    local = ratio / 0.55;
  } else {
    start = [25, 181, 254];
    end = [62, 220, 129];
    local = (ratio - 0.55) / 0.45;
  }
  const channel = index => Math.round(start[index] + (end[index] - start[index]) * local).toString(16).padStart(2, "0");
  return `#${channel(0)}${channel(1)}${channel(2)}`;
}

function breakdownResolveMatrixPalette(options) {
  const requested = options.matrixPalette ?? options.palette;
  if (requested === "risk") {
    return breakdownNormalizePalette(["#a7f3d0", "#34d399", "#facc15", "#f97316", "#991b1b"]);
  }
  return breakdownNormalizePalette(requested);
}

function breakdownNormalizePalette(palette) {
  if (!Array.isArray(palette)) return null;
  const colors = palette.map(breakdownParseColor).filter(Boolean);
  return colors.length >= 2 ? colors : null;
}

function breakdownParseColor(value) {
  const color = String(value ?? "").trim();
  const shortHex = color.match(/^#([0-9a-f]{3})$/i);
  if (shortHex) return [...shortHex[1]].map(channel => Number.parseInt(channel + channel, 16));
  const longHex = color.match(/^#([0-9a-f]{6})(?:[0-9a-f]{2})?$/i);
  if (longHex) return [0, 2, 4].map(index => Number.parseInt(longHex[1].slice(index, index + 2), 16));
  const rgb = color.match(/^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)/i);
  if (!rgb) return null;
  return rgb.slice(1, 4).map(channel => breakdownClamp(Math.round(Number(channel)), 0, 255));
}

function breakdownPaletteColor(palette, ratio) {
  const scaled = breakdownClamp(ratio, 0, 1) * (palette.length - 1);
  const startIndex = Math.min(palette.length - 2, Math.floor(scaled));
  const local = scaled - startIndex;
  const start = palette[startIndex];
  const end = palette[startIndex + 1];
  const channels = start.map((channel, index) => Math.round(channel + (end[index] - channel) * local));
  return `#${channels.map(channel => channel.toString(16).padStart(2, "0")).join("")}`;
}

function breakdownContrastText(fill) {
  const color = breakdownParseColor(fill);
  if (!color) return "#e8f5ff";
  const [red, green, blue] = color.map(channel => {
    const value = channel / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });
  const luminance = 0.2126 * red + 0.7152 * green + 0.0722 * blue;
  return luminance > 0.42 ? "#071522" : "#f8fbff";
}

function breakdownChartMinimumWidth(value) {
  const requested = Math.round(Number(value));
  return Number.isFinite(requested) && requested > 0 ? Math.max(480, requested) : 640;
}

function breakdownOptionLabel(value, fallbackKey) {
  if (value != null && String(value).trim()) return String(value).trim();
  const human = String(fallbackKey ?? "Value")
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .trim();
  if (!human) return "Value";
  const capitalized = human[0].toUpperCase() + human.slice(1);
  return capitalized
    .replace(/\bUsd\b/g, "USD")
    .replace(/\bApy\b/g, "APY")
    .replace(/\bLtv\b/g, "LTV");
}

function breakdownDomainText(formatter, minimum, maximum) {
  const low = breakdownFormat(formatter, minimum);
  const high = breakdownFormat(formatter, maximum);
  return minimum === maximum ? low : `${low} – ${high}`;
}

function breakdownFormat(formatter, value) {
  if (value == null || !Number.isFinite(Number(value))) return "n/a";
  try {
    const formatted = formatter(Number(value));
    return formatted == null ? "n/a" : String(formatted);
  } catch {
    return breakdownDefaultFormat(value);
  }
}

function breakdownDefaultFormat(value) {
  const number = Number(value);
  return Number.isFinite(number)
    ? number.toLocaleString("en-US", { maximumFractionDigits: 3 })
    : "n/a";
}

function breakdownShortLabel(value, maximum) {
  const text = String(value ?? "");
  return text.length <= maximum ? text : `${text.slice(0, Math.max(1, maximum - 1))}…`;
}

function breakdownWrapLabel(value, maximum) {
  const words = String(value ?? "").trim().split(/\s+/).filter(Boolean);
  if (!words.length) return [""];
  const lines = [];
  let line = "";
  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (line && candidate.length > maximum) {
      lines.push(line);
      line = word;
    } else line = candidate;
  }
  if (line) lines.push(line);
  return lines;
}

function breakdownDomId(value) {
  const safe = String(value ?? "chart").replace(/[^a-z0-9_-]+/gi, "-").replace(/^-+|-+$/g, "");
  return safe || "chart";
}

function breakdownSafeColor(value) {
  const color = String(value ?? "");
  return /^(?:#[0-9a-f]{3,8}|rgba?\([\d\s.,%]+\)|hsla?\([\d\s.,%]+\)|[a-z]+)$/i.test(color) ? color : "#19b5fe";
}

function breakdownClamp(value, minimum, maximum) {
  return Math.min(maximum, Math.max(minimum, value));
}

function breakdownRound(value) {
  return Number(value).toFixed(2);
}

function breakdownEscape(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
