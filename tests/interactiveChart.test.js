import assert from "node:assert/strict";
import test from "node:test";

import {
  calculateBoxplotStats,
  chartCreateYScale,
  chartFixedYDomain,
  chartLineSegments,
  chartMonthlyTicks,
  chartObservationLabel,
  chartPercentile,
  chartPlotClipBounds,
  chartRangeForPeriod,
  chartRangeLabel,
  chartRangeWithDate,
  chartResetYScale,
  chartScaleYDomain,
  chartStackedBands,
  chartSymlogConstant,
  chartSymlogInverse,
  chartSymlogTransform,
  chartTimeDomain,
  chartTimePositions,
  chartValueDomainForMode,
  chartWheelShouldZoom,
  chartYTickValues,
  nearestChartIndex,
  panChartRangeByTime,
  renderInteractiveBoxplotChart,
  renderInteractiveTimeSeriesChart,
  chartShowHover,
  summarizeChartRange,
  zoomChartRange
} from "../src/browser/interactiveChart.js";

function datedRows(dates, values = dates.map((_, index) => index + 1)) {
  return dates.map((date, index) => ({ date, value: values[index] }));
}

test("time-series clip bounds retain full endpoint marker radius and stroke", () => {
  const bounds = chartPlotClipBounds(88, 972, 62, 372);

  assert.deepEqual(bounds, { x: 82, y: 62, width: 896, height: 310 });
  assert.ok(88 - 5.5 >= bounds.x, "left endpoint marker must remain inside the clip");
  assert.ok(972 + 5.5 <= bounds.x + bounds.width, "right endpoint marker must remain inside the clip");
});

test("chart presets are inclusive and anchored to the latest observation", () => {
  const rows = datedRows([
    "2025-12-31",
    "2026-01-01",
    "2026-01-03",
    "2026-01-04",
    "2026-01-05",
    "2026-01-06",
    "2026-01-07",
    "2026-01-08",
    "2026-01-09",
    "2026-01-10"
  ]);

  assert.deepEqual(chartRangeForPeriod(rows, "week"), { startIndex: 3, endIndex: 9 });
  assert.deepEqual(chartRangeForPeriod(rows, "ytd"), { startIndex: 1, endIndex: 9 });
  assert.deepEqual(chartRangeForPeriod(rows, "all"), { startIndex: 0, endIndex: 9 });
});

test("chart presets never borrow an older row just to display two points", () => {
  const rows = datedRows(["2025-12-31", "2026-01-01"]);
  assert.deepEqual(chartRangeForPeriod(rows, "ytd"), { startIndex: 1, endIndex: 1 });

  const sparse = datedRows(["2026-01-01", "2026-01-10"]);
  assert.deepEqual(chartRangeForPeriod(sparse, "week"), { startIndex: 1, endIndex: 1 });
});

test("chart X positions preserve irregular date spacing", () => {
  const rows = datedRows(["2026-01-01", "2026-01-02", "2026-01-05"]);
  assert.deepEqual(chartTimePositions(rows, 0, 2), [0, 0.25, 1]);
});

test("monthly chart ticks share each bar's centered month position", () => {
  const rows = datedRows([
    "2026-01-01",
    "2026-02-01",
    "2026-03-01",
    "2026-04-01",
    "2026-05-01",
    "2026-06-01",
    "2026-07-01"
  ]);

  assert.deepEqual(chartMonthlyTicks(rows, 0, rows.length - 1, 12), rows.map((row, index) => ({
    index,
    timestamp: Date.parse(row.date),
    label: new Date(`${row.date}T00:00:00Z`).toLocaleDateString("en-US", {
      month: "short",
      year: "numeric",
      timeZone: "UTC"
    })
  })));

  const domain = chartTimeDomain(rows, 0, rows.length - 1, "month");
  assert.ok(domain.min < Date.parse(rows[0].date));
  assert.ok(domain.max > Date.parse(rows.at(-1).date));
});

test("monthly hover labels name the month and disclose incomplete coverage", () => {
  assert.equal(chartObservationLabel({ date: "2026-06-01", isComplete: true }, "month"), "June 2026");
  assert.equal(chartObservationLabel({ date: "2026-07-01", isComplete: false }, "month"), "July 2026 · Incomplete month");
  assert.equal(chartObservationLabel({ date: "2026-07-01", isComplete: false }), "2026-07-01");
});

test("missing values break a line while numeric zero remains a point", () => {
  const rows = datedRows(
    ["2026-01-01", "2026-01-02", "2026-01-03", "2026-01-04", "2026-01-05"],
    [10, 0, null, "", 14]
  );

  assert.deepEqual(chartLineSegments(rows, "value", 0, 4), [
    [{ index: 0, value: 10 }, { index: 1, value: 0 }],
    [{ index: 4, value: 14 }]
  ]);
});

test("nearest chart row uses timestamps within the visible range", () => {
  const rows = datedRows(["2026-01-01", "2026-01-02", "2026-01-10"]);
  assert.equal(nearestChartIndex(rows, Date.parse("2026-01-07T00:00:00Z"), 0, 2), 2);
  assert.equal(nearestChartIndex(rows, Date.parse("2026-01-03T00:00:00Z"), 1, 2), 1);
});

test("chart zoom clamps to history and always retains two rows", () => {
  assert.deepEqual(zoomChartRange(10, 2, 7, 0.5, 5), { startIndex: 4, endIndex: 6 });
  assert.deepEqual(zoomChartRange(10, 0, 1, 0.1, 0), { startIndex: 0, endIndex: 1 });
  assert.deepEqual(zoomChartRange(10, 7, 9, 3, 9), { startIndex: 1, endIndex: 9 });
});

test("chart pan moves by elapsed time across irregular observations", () => {
  const rows = datedRows(["2026-01-01", "2026-01-02", "2026-01-10", "2026-01-11"]);
  const nineDays = 9 * 24 * 60 * 60 * 1000;
  assert.deepEqual(panChartRangeByTime(rows, 0, 1, nineDays), { startIndex: 2, endIndex: 3 });
  assert.deepEqual(panChartRangeByTime(rows, 2, 3, -nineDays * 2), { startIndex: 0, endIndex: 1 });
});

test("date controls snap to observed dates and allow an exact one-row range", () => {
  const rows = datedRows(["2026-01-01", "2026-01-05", "2026-01-10"]);
  assert.deepEqual(chartRangeWithDate(rows, 0, 2, "start", "2026-01-04"), { startIndex: 1, endIndex: 2 });
  assert.deepEqual(chartRangeWithDate(rows, 0, 1, "start", "2026-01-10"), { startIndex: 2, endIndex: 2 });
  assert.deepEqual(chartRangeWithDate(rows, 1, 2, "end", "2026-01-01"), { startIndex: 0, endIndex: 0 });
});

test("visible-range summaries name their inclusive date interval", () => {
  const rows = datedRows(["2026-01-01", "2026-01-05", "2026-01-10"]);

  assert.equal(chartRangeLabel(rows, 1, 2), "2026-01-05 — 2026-01-10");
  assert.equal(chartRangeLabel(rows, 2, 2), "2026-01-10 — 2026-01-10");
});

test("stock summaries compare endpoints and flow summaries aggregate the interval", () => {
  const rows = [
    { date: "2026-01-01", amount: 10 },
    { date: "2026-01-02", amount: 0 },
    { date: "2026-01-03", amount: null },
    { date: "2026-01-04", amount: 15 }
  ];
  const series = [{ key: "amount", label: "Amount", color: "#fff" }];

  assert.deepEqual(summarizeChartRange(rows, series, 0, 3, "stock"), [{
    key: "amount",
    label: "Amount",
    color: "#fff",
    validCount: 3,
    start: 10,
    end: 15,
    delta: 5,
    percent: 50,
    min: 0,
    max: 15
  }]);
  assert.deepEqual(summarizeChartRange(rows, series, 0, 3, "flow"), [{
    key: "amount",
    label: "Amount",
    color: "#fff",
    validCount: 3,
    total: 25,
    average: 25 / 3,
    peak: 15,
    peakDate: "2026-01-04"
  }]);
});

test("stock summaries never substitute interior values for missing endpoints", () => {
  const rows = [
    { date: "2026-01-01", amount: null },
    { date: "2026-01-02", amount: 10 },
    { date: "2026-01-03", amount: 20 }
  ];
  const [summary] = summarizeChartRange(rows, [{ key: "amount", label: "Amount" }], 0, 2, "stock");

  assert.equal(summary.start, null);
  assert.equal(summary.end, 20);
  assert.equal(summary.delta, null);
  assert.equal(summary.percent, null);
  assert.equal(summary.min, 10);
  assert.equal(summary.max, 20);
});

test("stacked chart bands retain each series contribution and cumulative height", () => {
  const rows = [
    { date: "2026-01-01", ada: 0.25, djed: 0.5, other: 0.25 },
    { date: "2026-01-02", ada: 0.4, djed: null, other: 0.6 }
  ];
  const bands = chartStackedBands(rows, [
    { key: "ada", label: "ADA" },
    { key: "djed", label: "DJED" },
    { key: "other", label: "Other" }
  ]);

  assert.deepEqual(bands.map((band) => band.points), [
    [{ index: 0, value: 0.25, lower: 0, upper: 0.25 }, { index: 1, value: 0.4, lower: 0, upper: 0.4 }],
    [{ index: 0, value: 0.5, lower: 0.25, upper: 0.75 }, { index: 1, value: 0, lower: 0.4, upper: 0.4 }],
    [{ index: 0, value: 0.25, lower: 0.75, upper: 1 }, { index: 1, value: 0.6, lower: 0.4, upper: 1 }]
  ]);
});

test("ratio summaries show average, latest, minimum, and maximum", () => {
  const rows = [
    { date: "2026-01-01", share: 0.2 },
    { date: "2026-01-02", share: null },
    { date: "2026-01-03", share: 0.5 }
  ];
  const [summary] = summarizeChartRange(rows, [{ key: "share", label: "Share" }], 0, 2, "ratio");

  assert.equal(summary.average, 0.35);
  assert.equal(summary.end, 0.5);
  assert.equal(summary.min, 0.2);
  assert.equal(summary.max, 0.5);
  assert.equal(summary.validCount, 2);
});

test("percent contribution charts retain an honest zero-to-one domain when series are hidden", () => {
  assert.deepEqual(chartValueDomainForMode([0.2, 0.55], "percent"), { min: 0, max: 1 });
  assert.deepEqual(chartValueDomainForMode([10, 20], null), { min: 0, max: 21.2 });
});

test("bounded Y domains stay fixed while reset restores automatic linear scaling", () => {
  assert.deepEqual(chartFixedYDomain({ min: 0, max: 1 }), { min: 0, max: 1 });
  assert.equal(chartFixedYDomain({ min: 1, max: 1 }), null);
  assert.equal(chartFixedYDomain(null), null);

  const state = {
    yScaleMode: "symlog",
    yDomain: { min: -100, max: 1000 },
    ySymlogConstant: 10
  };
  assert.equal(chartResetYScale(state), state);
  assert.deepEqual(state, {
    yScaleMode: "linear",
    yDomain: null,
    ySymlogConstant: null
  });
});

test("symlog transforms round-trip negative, zero, and positive values", () => {
  const constant = chartSymlogConstant({ min: -2500, max: 10000 });
  assert.equal(constant, 100);
  for (const value of [-2500, -1, 0, 1, 10000]) {
    const transformed = chartSymlogTransform(value, constant);
    assert.ok(Number.isFinite(transformed));
    assert.ok(Math.abs(chartSymlogInverse(transformed, constant) - value) < 1e-9);
  }
  assert.equal(chartSymlogTransform(0, constant), 0);
});

test("linear and symlog Y scales preserve domain direction and zero", () => {
  for (const mode of ["linear", "symlog"]) {
    const scale = chartCreateYScale({ min: -100, max: 1000 }, mode, 10, 20, 420);
    assert.equal(scale.map(-100), 420);
    assert.equal(scale.map(1000), 20);
    assert.ok(scale.map(0) > 20 && scale.map(0) < 420);
    assert.ok(Math.abs(scale.invert(scale.map(0))) < 1e-12);
  }
});

test("dragging the Y axis narrows upward, widens downward, and anchors zero", () => {
  for (const mode of ["linear", "symlog"]) {
    const start = { min: -100, max: 1000 };
    const narrowed = chartScaleYDomain(start, -100, 400, mode, 10);
    const widened = chartScaleYDomain(start, 100, 400, mode, 10);
    assert.ok(narrowed.min > start.min);
    assert.ok(narrowed.max < start.max);
    assert.ok(widened.min < start.min);
    assert.ok(widened.max > start.max);
    assert.ok(narrowed.min < 0 && narrowed.max > 0);
    assert.ok(widened.min < 0 && widened.max > 0);
  }
});

test("symlog Y ticks stay ordered and include zero across signed domains", () => {
  const ticks = chartYTickValues({ min: -1000, max: 10000 }, "symlog", 100, 5);
  assert.ok(ticks.every(Number.isFinite));
  assert.ok(ticks.includes(0));
  assert.deepEqual(ticks, [...ticks].sort((a, b) => a - b));
});

test("wheel zoom requires an explicit keyboard modifier so page scrolling remains available", () => {
  assert.equal(chartWheelShouldZoom({ ctrlKey: false, metaKey: false }), false);
  assert.equal(chartWheelShouldZoom({ ctrlKey: true, metaKey: false }), true);
  assert.equal(chartWheelShouldZoom({ ctrlKey: false, metaKey: true }), true);
});

test("chartPercentile calculates linear interpolation for boxplot percentiles", () => {
  const values = [10, 20, 30, 40, 50];
  assert.equal(chartPercentile(values, 0), 10);
  assert.equal(chartPercentile(values, 0.25), 20);
  assert.equal(chartPercentile(values, 0.50), 30);
  assert.equal(chartPercentile(values, 0.75), 40);
  assert.equal(chartPercentile(values, 1.0), 50);
});

test("calculateBoxplotStats computes min, q1, median, q3, max and filters positive active values", () => {
  const rows = [
    { date: "2026-01-01", debtRepaidInUsd: 0 },
    { date: "2026-01-02", debtRepaidInUsd: 100 },
    { date: "2026-01-03", debtRepaidInUsd: 200 },
    { date: "2026-01-04", debtRepaidInUsd: 300 },
    { date: "2026-01-05", debtRepaidInUsd: 400 },
    { date: "2026-01-06", debtRepaidInUsd: 500 }
  ];

  const stats = calculateBoxplotStats(rows, "debtRepaidInUsd", 0, 5);
  assert.equal(stats.count, 5);
  assert.equal(stats.min, 100);
  assert.equal(stats.q1, 200);
  assert.equal(stats.median, 300);
  assert.equal(stats.q3, 400);
  assert.equal(stats.max, 500);
  assert.equal(stats.mean, 300);
});

test("renderInteractiveBoxplotChart includes Y-axis scale tools in chart-main-shell and renders transparent points", () => {
  let svgContent = "";
  const container = {
    id: "test-boxplot",
    innerHTML: "",
    querySelector(sel) {
      if (!this.innerHTML) return null;
      if (sel === "svg.chart-main") return {
        setAttribute() {},
        addEventListener() {},
        querySelector() {},
        set innerHTML(val) { svgContent = val; },
        get innerHTML() { return svgContent; }
      };
      if (sel === ".chart-tooltip") return { style: {}, hidden: true, setAttribute() {} };
      if (sel === ".chart-main-shell") return { clientWidth: 800, clientHeight: 400 };
      if (sel === ".boxplot-summary") return { innerHTML: "" };
      return null;
    },
    querySelectorAll(sel) {
      if (sel === "[data-chart-y-scale]") return [];
      return [];
    },
    addEventListener() {}
  };

  const rows = [
    { date: "2026-01-01", debtRepaidInUsd: 100 },
    { date: "2026-01-02", debtRepaidInUsd: 500 }
  ];

  const state = renderInteractiveBoxplotChart(container, {
    chartId: "protocolDebtRepaymentDistribution",
    rows,
    valueKey: "debtRepaidInUsd",
    title: "Protocol debt repayment distribution"
  });

  assert.ok(container.innerHTML.includes('class="chart-y-scale-tools chart-y-scale-group"'));
  assert.ok(container.innerHTML.includes('data-chart-y-scale="linear"'));
  assert.ok(container.innerHTML.includes('data-chart-y-scale="symlog"'));
  assert.ok(container.innerHTML.includes('chart-main-shell'));
  assert.ok(svgContent.includes('fill-opacity="0.45"'));
  assert.equal(state.yScaleMode, "linear");
});

test("renderInteractiveBoxplotChart supports multi-market boxplot distribution across markets", () => {
  let svgContent = "";
  let summaryContent = "";
  const container = {
    id: "test-multi-boxplot",
    clientWidth: 800,
    clientHeight: 400,
    innerHTML: "",
    querySelector(sel) {
      if (sel === "svg.chart-main") return {
        setAttribute() {},
        addEventListener() {},
        set innerHTML(val) { svgContent = val; },
        get innerHTML() { return svgContent; }
      };
      if (sel === ".chart-tooltip") return { style: {}, hidden: true, setAttribute() {} };
      if (sel === ".chart-main-shell") return { clientWidth: 800, clientHeight: 400 };
      if (sel === ".boxplot-summary") return {
        set innerHTML(val) { summaryContent = val; },
        get innerHTML() { return summaryContent; }
      };
      return null;
    },
    querySelectorAll(sel) {
      if (sel === "[data-chart-y-scale]") return [];
      return [];
    },
    addEventListener() {}
  };

  const markets = [
    { key: "ADA", label: "ADA", rows: [{ date: "2026-01-01", debtRepaidInUsd: 100 }, { date: "2026-01-02", debtRepaidInUsd: 200 }], color: "#19b5fe" },
    { key: "iUSD", label: "iUSD", rows: [{ date: "2026-01-01", debtRepaidInUsd: 50 }, { date: "2026-01-02", debtRepaidInUsd: 150 }], color: "#19d3ae" }
  ];

  const state = renderInteractiveBoxplotChart(container, {
    chartId: "protocolDebtRepaymentDistribution",
    markets,
    valueKey: "debtRepaidInUsd",
    title: "Protocol debt repayment distribution"
  });

  assert.ok(state.isMultiMarket);
  assert.ok(svgContent.includes('data-market-idx="0"'));
  assert.ok(svgContent.includes('data-market-idx="1"'));
  assert.ok(svgContent.includes('ADA'));
  assert.ok(svgContent.includes('iUSD'));
  assert.ok(summaryContent.includes('Protocol Repayment Size Distribution Across Markets'));
});

test("all 4 box plot size distribution charts include linear/symlog Y-axis controls and respect symlog scaling", () => {
  const boxplotCharts = [
    { chartId: "protocolDebtRepaymentDistribution", valueKey: "debtRepaidInUsd", title: "Protocol debt repaid distribution", isMulti: true },
    { chartId: "protocolInterestRepaymentDistribution", valueKey: "interestRepaidInUsd", title: "Protocol interest repaid distribution", isMulti: true },
    { chartId: "marketDebtRepaymentDistribution", valueKey: "debtRepaidInUsd", title: "Debt repaid distribution", isMulti: false },
    { chartId: "marketInterestRepaymentDistribution", valueKey: "interestRepaidInUsd", title: "Interest repaid distribution", isMulti: false }
  ];

  for (const config of boxplotCharts) {
    let clickHandler = null;
    let svgContent = "";
    const buttonMocks = [
      { dataset: { chartYScale: "linear" }, closest() { return this; }, classList: { toggle() {} }, setAttribute() {} },
      { dataset: { chartYScale: "symlog" }, closest() { return this; }, classList: { toggle() {} }, setAttribute() {} }
    ];

    const container = {
      id: config.chartId,
      clientWidth: 800,
      clientHeight: 400,
      innerHTML: "",
      querySelector(sel) {
        if (!this.innerHTML) return null;
        if (sel === "svg.chart-main") return {
          setAttribute() {},
          addEventListener() {},
          querySelector() {},
          set innerHTML(val) { svgContent = val; },
          get innerHTML() { return svgContent; }
        };
        if (sel === ".chart-tooltip") return { style: {}, hidden: true, setAttribute() {} };
        if (sel === ".chart-main-shell") return { clientWidth: 800, clientHeight: 400 };
        if (sel === ".boxplot-summary") return { innerHTML: "" };
        return null;
      },
      querySelectorAll(sel) {
        if (sel === "[data-chart-y-scale]") return buttonMocks;
        return [];
      },
      addEventListener(evt, fn) {
        if (evt === "click") clickHandler = fn;
      }
    };

    const rows = [
      { date: "2026-01-01", [config.valueKey]: 100 },
      { date: "2026-01-02", [config.valueKey]: 10000 }
    ];

    const options = {
      chartId: config.chartId,
      valueKey: config.valueKey,
      title: config.title,
      rows: config.isMulti ? undefined : rows,
      markets: config.isMulti ? [
        { key: "ADA", label: "ADA", rows, color: "#19b5fe" }
      ] : undefined,
      yScale: "linear"
    };

    const state = renderInteractiveBoxplotChart(container, options);

    assert.ok(container.innerHTML.includes('class="chart-y-scale-tools chart-y-scale-group"'), `${config.chartId} must render chart-y-scale-group`);
    assert.ok(container.innerHTML.includes('data-chart-y-scale="linear"'), `${config.chartId} must render linear button`);
    assert.ok(container.innerHTML.includes('data-chart-y-scale="symlog"'), `${config.chartId} must render symlog button`);
    assert.equal(state.yScaleMode, "linear", `${config.chartId} initial yScaleMode should be linear`);

    const linearSvg = svgContent;

    // Test options-driven symlog scale re-render
    const symlogState = renderInteractiveBoxplotChart(container, { ...options, yScale: "symlog" });
    assert.equal(symlogState.yScaleMode, "symlog", `${config.chartId} yScaleMode should be symlog when requested`);
    assert.notEqual(svgContent, linearSvg, `${config.chartId} SVG content should differ between linear and symlog scaling`);

    // Test click handler toggling symlog back to linear
    if (clickHandler) {
      clickHandler({ target: buttonMocks[0] });
      assert.equal(symlogState.yScaleMode, "linear", `${config.chartId} click should toggle yScaleMode to linear`);
    }
  }
});

test("hover legend swatch dynamically reflects positive vs negative daily market gap values", () => {
  let tooltipInnerHTML = "";
  let hoverLayerInnerHTML = "";
  const tooltipMock = {
    style: {},
    hidden: true,
    classList: { add() {}, remove() {} },
    setAttribute() {},
    set innerHTML(val) { tooltipInnerHTML = val; },
    get innerHTML() { return tooltipInnerHTML; }
  };
  const hoverLayerMock = {
    set innerHTML(val) { hoverLayerInnerHTML = val; },
    get innerHTML() { return hoverLayerInnerHTML; }
  };
  const shellMock = { clientWidth: 800, clientHeight: 400 };
  const svgMock = {
    classList: { toggle() {}, add() {}, remove() {} },
    setAttribute() {},
    addEventListener() {},
    querySelector() {},
    set innerHTML(_) {},
    get innerHTML() { return ""; }
  };

  const container = {
    id: "test-gap-chart",
    clientWidth: 800,
    clientHeight: 400,
    innerHTML: "",
    querySelector(sel) {
      if (sel === ".chart-tooltip") return tooltipMock;
      if (sel === ".chart-hover-layer") return hoverLayerMock;
      if (sel === ".chart-main-shell") return shellMock;
      if (sel === "svg.chart-main" || sel === "svg.chart-navigator") return svgMock;
      if (sel === ".chart-visible-range") return { textContent: "" };
      if (sel === ".chart-live-legend") return { innerHTML: "" };
      if (sel === ".chart-y-scale-group") return { hidden: false };
      if (sel === ".chart-range-summary") return { innerHTML: "" };
      if (sel === ".chart-comparison") return { classList: { add() {} }, innerHTML: "" };
      if (sel === ".chart-range-start" || sel === ".chart-range-end") return { min: "", max: "", value: "" };
      return null;
    },
    querySelectorAll(sel) {
      if (sel === "[data-chart-y-scale]") return [];
      return [];
    },
    addEventListener() {}
  };

  const rows = [
    { date: "2026-01-01", dailyDebtGap: 500 },
    { date: "2026-01-02", dailyDebtGap: -250 }
  ];

  const series = [
    { key: "dailyDebtGap", label: "Daily market gaps · USD sum", color: "#f59e0b", negativeColor: "#19d3ae", type: "bar" }
  ];

  const state = renderInteractiveTimeSeriesChart(container, {
    chartId: "protocolDebtGap",
    rows,
    series,
    valueMode: "flow"
  });

  // Test hovering over positive value (index 0: +500)
  chartShowHover(container, state, 0);
  assert.ok(tooltipInnerHTML.includes('style="background:#f59e0b"'), "Positive daily gap hover legend swatch must use orange/amber (#f59e0b)");
  assert.ok(hoverLayerInnerHTML.includes('stroke="#f59e0b"'), "Positive daily gap hover circle stroke must use orange/amber (#f59e0b)");

  // Test hovering over negative value (index 1: -250)
  chartShowHover(container, state, 1);
  assert.ok(tooltipInnerHTML.includes('style="background:#19d3ae"'), "Negative daily gap hover legend swatch must use green/mint (#19d3ae)");
  assert.ok(hoverLayerInnerHTML.includes('stroke="#19d3ae"'), "Negative daily gap hover circle stroke must use green/mint (#19d3ae)");
});

test("dual Y-axis supports independent left and right scales and hideYScaleToggle disables scale tools", () => {
  let yScaleGroupHidden = false;
  let mainSvgInnerHTML = "";
  let navigatorSvgInnerHTML = "";
  const yScaleGroupMock = { set hidden(val) { yScaleGroupHidden = val; } };
  const mainSvgMock = {
    classList: { toggle() {}, add() {}, remove() {} },
    setAttribute() {},
    addEventListener() {},
    querySelector() {},
    set innerHTML(val) { mainSvgInnerHTML = val; },
    get innerHTML() { return mainSvgInnerHTML; }
  };
  const navigatorSvgMock = {
    classList: { toggle() {}, add() {}, remove() {} },
    setAttribute() {},
    addEventListener() {},
    querySelector() {},
    set innerHTML(val) { navigatorSvgInnerHTML = val; },
    get innerHTML() { return navigatorSvgInnerHTML; }
  };

  const container = {
    id: "test-dual-y-axis",
    clientWidth: 800,
    clientHeight: 400,
    innerHTML: "",
    querySelector(sel) {
      if (sel === ".chart-y-scale-group") return yScaleGroupMock;
      if (sel === "svg.chart-main") return mainSvgMock;
      if (sel === "svg.chart-navigator") return navigatorSvgMock;
      if (sel === ".chart-tooltip") return { hidden: true, setAttribute() {}, classList: { add() {}, remove() {} } };
      if (sel === ".chart-visible-range") return { textContent: "" };
      if (sel === ".chart-live-legend") return { innerHTML: "" };
      if (sel === ".chart-range-summary") return { innerHTML: "" };
      if (sel === ".chart-comparison") return { classList: { add() {} }, innerHTML: "" };
      if (sel === ".chart-range-start" || sel === ".chart-range-end") return { min: "", max: "", value: "" };
      if (sel === ".chart-main-shell") return { clientWidth: 800, clientHeight: 400 };
      return null;
    },
    querySelectorAll(sel) {
      if (sel === "[data-chart-y-scale]") return [];
      return [];
    },
    addEventListener() {}
  };

  const rows = [
    { date: "2026-01-01", stakedLqAmount: 2000000, stakingRatio: 0.10 },
    { date: "2026-01-02", stakedLqAmount: 2500000, stakingRatio: 0.12 }
  ];

  const series = [
    { key: "stakedLqAmount", label: "Staked LQ", color: "#19b5fe", type: "line", points: true, yAxis: "left" },
    { key: "stakingRatio", label: "Staking ratio", color: "#a855f7", type: "line", points: true, yAxis: "right" }
  ];

  const state = renderInteractiveTimeSeriesChart(container, {
    chartId: "protocolLqStaking",
    rows,
    series,
    valueFormatter: (v, k) => k === "stakingRatio" ? `${(v * 100).toFixed(0)}%` : `${(v / 1e6).toFixed(1)}M LQ`,
    hideYScaleToggle: true
  });

  assert.equal(state.hideYScaleToggle, true);
  assert.equal(yScaleGroupHidden, true, "Y-scale controls group must be hidden when hideYScaleToggle is true");
  assert.ok(state.geometry.hasRightAxis, "Chart geometry must recognize presence of right Y-axis");
  assert.ok(typeof state.geometry.yScaleLeft === "function", "yScaleLeft must be initialized");
  assert.ok(typeof state.geometry.yScaleRight === "function", "yScaleRight must be initialized");

  // Right axis tick labels should be rendered on the right side with text-anchor="start"
  assert.ok(mainSvgInnerHTML.includes('text-anchor="start"'), "Right Y-axis ticks must be rendered anchored to the right");
  assert.ok(mainSvgInnerHTML.includes('10%') || mainSvgInnerHTML.includes('12%'), "Right Y-axis tick values must be formatted using stakingRatio formatter");

  // Verify left and right Y-scales map values independently
  const yLeft = state.geometry.yScaleLeft(2000000);
  const yRight = state.geometry.yScaleRight(0.10);
  assert.ok(Number.isFinite(yLeft));
  assert.ok(Number.isFinite(yRight));
});



