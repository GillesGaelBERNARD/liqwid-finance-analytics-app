import assert from "node:assert/strict";
import test from "node:test";

import {
  normalizeBreakdownRows,
  renderInteractiveCategoryChart,
  renderInteractiveMatrixChart,
  renderInteractiveScatterChart,
  scatterExtent,
  stackedBreakdownSegments
} from "../src/browser/interactiveBreakdownChart.js";

function fakeContainer(width = 900) {
  const listeners = new Map();
  const popover = { hidden: true, innerHTML: "", style: {}, setAttribute(k, v) { this[k] = v; } };
  return {
    clientWidth: width,
    innerHTML: "",
    listeners,
    popover,
    addEventListener(type, listener) { listeners.set(type, listener); },
    contains() { return true; },
    querySelector(selector) {
      if (selector === ".breakdown-popover") return popover;
      return null;
    },
    querySelectorAll() { return []; }
  };
}

const series = [
  { key: "debt", label: "Debt", color: "#19b5fe" },
  { key: "count", label: "Loans", color: "#3edc81" }
];

test("breakdown rows keep zero, leave missing values missing, sort stably, and never truncate", () => {
  const rows = normalizeBreakdownRows([
    { market: "A", debt: 0, count: 2 },
    { market: "B", debt: "12.5", count: null },
    { market: "C", debt: 12.5, count: 4 },
    { market: "D", debt: 6, count: 1 },
    { market: "", debt: 99, count: 1 }
  ], {
    categoryKey: "market",
    series,
    sortKey: "debt",
    maxRows: 2
  });

  assert.deepEqual(rows.map(row => row.category), ["B", "C", "D", "A"]);
  assert.deepEqual(rows.map(row => row.values.debt), [12.5, 12.5, 6, 0]);
  assert.equal(rows[0].values.count, null);
});

test("stacked segments preserve zero, skip missing values, and diverge around zero", () => {
  const row = {
    category: "A",
    values: { positive: 10, missing: null, zero: 0, negative: -3 }
  };
  const segments = stackedBreakdownSegments(row, [
    { key: "positive", label: "Positive" },
    { key: "missing", label: "Missing" },
    { key: "zero", label: "Zero" },
    { key: "negative", label: "Negative" }
  ]);

  assert.deepEqual(segments.map(({ key, value, start, end }) => ({ key, value, start, end })), [
    { key: "positive", value: 10, start: 0, end: 10 },
    { key: "zero", value: 0, start: 10, end: 10 },
    { key: "negative", value: -3, start: 0, end: -3 }
  ]);
});

test("scatter extents never turn missing or nonpositive log values into plottable zero", () => {
  const rows = [{ x: null }, { x: "" }, { x: -4 }, { x: 0 }, { x: 10 }, { x: "100" }];

  assert.deepEqual(scatterExtent(rows, "x", { scale: "linear" }), {
    min: -4,
    max: 100,
    validCount: 4,
    excludedCount: 2
  });
  assert.deepEqual(scatterExtent(rows, "x", { scale: "log" }), {
    min: 10,
    max: 100,
    validCount: 2,
    excludedCount: 4
  });
});

test("scatter can connect points in ascending X order for cumulative curves", () => {
  const container = fakeContainer();
  renderInteractiveScatterChart(container, {
    chartId: "cumulative-concentration",
    rows: [
      { label: "Third", rank: 3, share: 0.8 },
      { label: "Start", rank: 0, share: 0 },
      { label: "First", rank: 1, share: 0.6 }
    ],
    labelKey: "label",
    xKey: "rank",
    yKey: "share",
    connectPoints: true,
    lineColor: "#3edc81",
    fixedYDomain: { min: 0, max: 1 }
  });

  assert.match(container.innerHTML, /class="breakdown-scatter-connection"/);
  assert.match(container.innerHTML, /stroke="#3edc81"/);
  assert.match(container.innerHTML, /<polyline[^>]+points="[^"]+"/);
});

test("grouped cumulative curves keep every market visible while toggles mute selected context", () => {
  const container = fakeContainer();
  renderInteractiveScatterChart(container, {
    chartId: "all-market-concentration",
    rows: [
      { marketId: "ADA", marketName: "ADA", label: "Start", rank: 0, share: 0, added: 0 },
      { marketId: "ADA", marketName: "ADA", label: "Observed key 1", rank: 1, share: 0.72, added: 720 },
      { marketId: "DJED", marketName: "DJED", label: "Start", rank: 0, share: 0, added: 0 },
      { marketId: "DJED", marketName: "DJED", label: "Observed key 1", rank: 1, share: 0.48, added: 480 }
    ],
    seriesKey: "marketId",
    seriesLabelKey: "marketName",
    series: [
      { key: "ADA", label: "ADA", color: "#19b5fe", legendDetail: "1st key 72.0%" },
      { key: "DJED", label: "DJED", color: "#3edc81", legendDetail: "1st key 48.0%" }
    ],
    labelKey: "label",
    xKey: "rank",
    yKey: "share",
    sizeKey: "added",
    connectPoints: true,
    xScale: "log1p",
    integerXTicks: true,
    fixedYDomain: { min: 0, max: 1 }
  });

  assert.equal((container.innerHTML.match(/class="breakdown-scatter-connection"/g) || []).length, 2);
  assert.equal((container.innerHTML.match(/class="breakdown-scatter-point"/g) || []).length, 4);
  assert.match(container.innerHTML, /data-breakdown-scatter-toggle="ADA"[^>]+aria-pressed="true"/);
  assert.match(container.innerHTML, /data-breakdown-scatter-toggle="DJED"[^>]+aria-pressed="true"/);
  assert.match(container.innerHTML, /data-breakdown-series-key="ADA"[^>]+data-breakdown-series-state="emphasized"/);
  assert.match(container.innerHTML, /data-breakdown-series-key="DJED"[^>]+data-breakdown-series-state="emphasized"/);
  assert.match(container.innerHTML, /Log\(1 \+ value\) X spacing/);
  assert.match(container.innerHTML, /ADA[^<]+1st key 72\.0%/);

  const tickOne = container.innerHTML.match(/<line class="breakdown-x-grid"[^>]+x1="([^"]+)"[^>]+data-breakdown-x-tick="1"[^>]*\/>/);
  const rankOnePoint = container.innerHTML.match(/<circle class="breakdown-scatter-point"[^>]+cx="([^"]+)"[^>]+aria-label="ADA[^\"]*Observed key 1[^\"]*"/);
  assert.ok(tickOne, "rank 1 has an exact integer grid tick");
  assert.ok(rankOnePoint, "rank 1 point remains rendered");
  assert.equal(Number(tickOne[1]), Number(rankOnePoint[1]));
  assert.match(container.innerHTML, /data-breakdown-x-tick="0"/);
  assert.match(container.innerHTML, /data-breakdown-x-tick="1"/);

  const adaToggle = {
    dataset: { breakdownScatterToggle: "ADA" },
    closest(selector) { return selector === "[data-breakdown-scatter-toggle]" ? this : null; }
  };
  container.listeners.get("click")({ target: adaToggle });

  assert.equal((container.innerHTML.match(/class="breakdown-scatter-connection"/g) || []).length, 2);
  assert.equal((container.innerHTML.match(/class="breakdown-scatter-point"/g) || []).length, 4);
  assert.match(container.innerHTML, /data-breakdown-scatter-toggle="ADA"[^>]+aria-pressed="false"/);
  assert.match(container.innerHTML, /data-breakdown-series-key="ADA"[^>]+data-breakdown-series-state="muted"/);
  assert.match(container.innerHTML, /data-breakdown-series-key="DJED"[^>]+data-breakdown-series-state="emphasized"/);
});

test("log-spaced integer rank axes anchor rank two instead of rounding a fractional tick", () => {
  const container = fakeContainer();
  renderInteractiveScatterChart(container, {
    chartId: "long-rank-axis",
    rows: [
      { label: "Start", rank: 0, share: 0 },
      { label: "First", rank: 1, share: 0.4 },
      { label: "Second", rank: 2, share: 0.6 },
      { label: "Tail", rank: 482, share: 1 }
    ],
    labelKey: "label",
    xKey: "rank",
    yKey: "share",
    xScale: "log1p",
    integerXTicks: true,
    fixedYDomain: { min: 0, max: 1 }
  });

  const tickTwo = container.innerHTML.match(/<line class="breakdown-x-grid"[^>]+x1="([^"]+)"[^>]+data-breakdown-x-tick="2"[^>]*\/>/);
  const rankTwoPoint = container.innerHTML.match(/<circle class="breakdown-scatter-point"[^>]+cx="([^"]+)"[^>]+aria-label="Second[^\"]*"/);
  assert.ok(tickTwo, "rank 2 has an exact integer grid tick");
  assert.ok(rankTwoPoint, "rank 2 point remains rendered");
  assert.equal(Number(tickTwo[1]), Number(rankTwoPoint[1]));
});

test("category chart renders an explicit empty state", () => {
  const container = fakeContainer();
  renderInteractiveCategoryChart(container, {
    chartId: "empty-ranking",
    rows: [],
    categoryKey: "market",
    series
  });

  assert.match(container.innerHTML, /breakdown-empty/);
  assert.match(container.innerHTML, /No values are available/);
});

test("grouped and stacked category rows have one keyboard stop with exact mark labels and toggles", () => {
  const grouped = fakeContainer(640);
  renderInteractiveCategoryChart(grouped, {
    chartId: "market-ranking",
    rows: [{ market: "A&B", debt: 1250, count: 3 }],
    categoryKey: "market",
    series,
    mode: "grouped",
    valueFormatter: value => `$${value}`
  });

  assert.match(grouped.innerHTML, /data-breakdown-toggle="debt"/);
  assert.match(grouped.innerHTML, /aria-pressed="true"/);
  assert.match(grouped.innerHTML, /class="breakdown-bar breakdown-bar-grouped"/);
  assert.equal((grouped.innerHTML.match(/class="breakdown-focus-row"/g) || []).length, 1);
  assert.equal((grouped.innerHTML.match(/ tabindex="0"/g) || []).length, 1);
  assert.match(grouped.innerHTML, /aria-label="A&amp;B, Debt: \$1250"/);
  assert.match(grouped.innerHTML, /class="breakdown-focus-row" tabindex="0" role="group" aria-label="A&amp;B, Debt: \$1250; A&amp;B, Loans: \$3"/);
  assert.doesNotMatch(grouped.innerHTML, /<svg[^>]+role="img"/);
  assert.match(grouped.innerHTML, /<svg[^>]+role="group"/);

  const stacked = fakeContainer();
  renderInteractiveCategoryChart(stacked, {
    chartId: "health-bands",
    rows: [{ market: "A", debt: 10, count: 2 }],
    categoryKey: "market",
    series,
    mode: "stacked"
  });
  assert.match(stacked.innerHTML, /class="breakdown-bar breakdown-bar-stacked"/);
});

test("matrix cells expose exact values and explicit missing values to keyboard users", () => {
  const container = fakeContainer();
  renderInteractiveMatrixChart(container, {
    chartId: "stress-matrix",
    rows: [{ market: "DJED", utilization: 0.91, coverage: null }],
    rowKey: "market",
    columns: [
      { key: "utilization", label: "Utilization" },
      { key: "coverage", label: "Weak coverage" }
    ],
    valueFormatter: value => `${(value * 100).toFixed(0)}%`
  });

  assert.equal((container.innerHTML.match(/class="breakdown-matrix-cell"/g) || []).length, 2);
  assert.match(container.innerHTML, /aria-label="DJED, Utilization: 91%"/);
  assert.match(container.innerHTML, /aria-label="DJED, Weak coverage: n\/a"/);
  assert.equal((container.innerHTML.match(/class="breakdown-focus-row"/g) || []).length, 1);
  assert.equal((container.innerHTML.match(/class="matrix-info-bubble-btn"[^>]*tabindex="0"/g) || []).length, 2);
  assert.match(container.innerHTML, /class="breakdown-focus-row" tabindex="0" role="group" aria-label="DJED, Utilization: 91%; DJED, Weak coverage: n\/a"/);
  assert.doesNotMatch(container.innerHTML, /<svg[^>]+role="img"/);
});

test("matrix column headers render info bubbles and toggle explanation popovers", () => {
  const container = fakeContainer();
  renderInteractiveMatrixChart(container, {
    chartId: "stress-matrix-popover",
    rows: [{ market: "DJED", utilizationStress: 0.85 }],
    rowKey: "market",
    columns: [
      { key: "utilizationStress", label: "Utilization pressure" }
    ]
  });

  assert.match(container.innerHTML, /class="matrix-info-bubble-btn"/);
  assert.match(container.innerHTML, /data-breakdown-metric-btn="utilizationStress"/);
  assert.match(container.innerHTML, /class="breakdown-popover"/);

  const clickListener = container.listeners.get("click");
  assert.ok(clickListener);

  clickListener({
    target: {
      closest: (sel) => sel === "[data-breakdown-metric-btn]" ? { dataset: { breakdownMetricBtn: "utilizationStress" } } : null
    }
  });

  assert.match(container.popover.innerHTML, /Utilization pressure/);
  assert.match(container.popover.innerHTML, /110%/);
});

test("log scatter renders only valid points and keeps exact values accessible", () => {
  const container = fakeContainer(700);
  renderInteractiveScatterChart(container, {
    chartId: "market-map",
    rows: [
      { market: "Zero", borrow: 0, utilization: 0.1, supply: 20, coverage: 0.5 },
      { market: "DJED", borrow: 1000, utilization: 0.8, supply: 4000, coverage: 0.7 }
    ],
    labelKey: "market",
    xKey: "borrow",
    yKey: "utilization",
    sizeKey: "supply",
    colorKey: "coverage",
    xLabel: "Debt",
    yLabel: "Utilization",
    sizeLabel: "Supplied liquidity",
    colorLabel: "Interest coverage",
    xScale: "log",
    xFormatter: value => `$${value}`,
    yFormatter: value => `${(value * 100).toFixed(0)}%`,
    sizeFormatter: value => `$${value}`,
    colorFormatter: value => `${(value * 100).toFixed(0)}%`
  });

  assert.equal((container.innerHTML.match(/class="breakdown-scatter-point"/g) || []).length, 1);
  assert.match(container.innerHTML, /tabindex="0"/);
  assert.match(container.innerHTML, /aria-label="DJED, Debt: \$1000, Utilization: 80%, Supplied liquidity: \$4000, Interest coverage: 70%"/);
  assert.doesNotMatch(container.innerHTML, /Zero, Debt:/);
  assert.match(container.innerHTML, />Debt \(log\)<\/text>/);
  assert.match(container.innerHTML, />Utilization<\/text>/);
  assert.match(container.innerHTML, /Point area/);
  assert.match(container.innerHTML, /Supplied liquidity/);
  assert.match(container.innerHTML, /Interest coverage/);
  assert.match(container.innerHTML, /\$4000/);
  assert.match(container.innerHTML, /70%/);
  assert.doesNotMatch(container.innerHTML, /point area: supply|color: coverage/i);
  assert.doesNotMatch(container.innerHTML, /<svg[^>]+role="img"/);
  assert.match(container.innerHTML, /Log scale/);
});

test("scatter encoding readouts follow hovered and focused points, then restore their scale ranges", () => {
  const container = fakeContainer(700);
  renderInteractiveScatterChart(container, {
    chartId: "reactive-encoding-readouts",
    rows: [
      { market: "Small", debt: 10, utilization: 0.2, collateral: 100, coverage: 0.4 },
      { market: "Large", debt: 100, utilization: 0.8, collateral: 1000, coverage: 0.9 }
    ],
    labelKey: "market",
    xKey: "debt",
    yKey: "utilization",
    sizeKey: "collateral",
    colorKey: "coverage",
    sizeLabel: "Collateral added at this rank",
    colorLabel: "Coverage",
    sizeFormatter: value => `$${value}`,
    colorFormatter: value => `${(value * 100).toFixed(0)}%`
  });

  assert.match(container.innerHTML, /data-breakdown-size-value="\$100"/);
  assert.match(container.innerHTML, /data-breakdown-color-value="40%"/);
  const tooltip = { hidden: true, textContent: "", style: {}, setAttribute() {} };
  const sizeReadout = {
    textContent: "$100 - $1000",
    dataset: { breakdownSizeDomain: "$100 - $1000" }
  };
  const colorReadout = {
    textContent: "40% - 90%",
    dataset: { breakdownColorDomain: "40% - 90%" }
  };
  container.querySelector = selector => ({
    ".breakdown-tooltip": tooltip,
    "[data-breakdown-size-readout]": sizeReadout,
    "[data-breakdown-color-readout]": colorReadout
  })[selector] || null;
  const mark = {
    dataset: {
      breakdownTooltip: "Small",
      breakdownSizeValue: "$100",
      breakdownColorValue: "40%"
    },
    closest(selector) { return selector === "[data-breakdown-tooltip]" ? this : null; },
    contains() { return false; }
  };

  container.listeners.get("pointerover")({ target: mark });
  assert.equal(sizeReadout.textContent, "$100");
  assert.equal(colorReadout.textContent, "40%");

  mark.dataset.breakdownSizeValue = "$1000";
  mark.dataset.breakdownColorValue = "90%";
  container.listeners.get("focusin")({ target: mark });
  assert.equal(sizeReadout.textContent, "$1000");
  assert.equal(colorReadout.textContent, "90%");

  container.listeners.get("focusout")({ target: mark, relatedTarget: null });
  assert.equal(sizeReadout.textContent, "$100 - $1000");
  assert.equal(colorReadout.textContent, "40% - 90%");
});

test("scatter Y axes expose draggable Linear and Symlog modes without dropping signed values", () => {
  const container = fakeContainer(700);
  renderInteractiveScatterChart(container, {
    chartId: "signed-market-map",
    rows: [
      { market: "Negative", x: 1, y: -100 },
      { market: "Zero", x: 2, y: 0 },
      { market: "Positive", x: 3, y: 1000 }
    ],
    labelKey: "market",
    xKey: "x",
    yKey: "y",
    yLabel: "Net flow",
    yScale: "symlog"
  });

  assert.equal((container.innerHTML.match(/class="breakdown-scatter-point"/g) || []).length, 3);
  assert.match(container.innerHTML, /data-breakdown-y-scale="linear"/);
  assert.match(container.innerHTML, /data-breakdown-y-scale="symlog"[^>]+aria-pressed="true"/);
  assert.match(container.innerHTML, /data-breakdown-y-axis/);
  assert.match(container.innerHTML, />Net flow \(symlog\)<\/text>/);
  assert.match(container.innerHTML, /Drag the Y axis/);
});

test("bounded percentage scatter axes stay linear and omit manual scale controls", () => {
  const container = fakeContainer(700);
  renderInteractiveScatterChart(container, {
    chartId: "bounded-utilization-map",
    rows: [{ market: "ADA", borrow: 1000, utilization: 0.82 }],
    labelKey: "market",
    xKey: "borrow",
    yKey: "utilization",
    yLabel: "Utilization",
    yScale: "symlog",
    fixedYDomain: { min: 0, max: 1 },
    yFormatter: value => `${(value * 100).toFixed(0)}%`
  });

  assert.doesNotMatch(container.innerHTML, /data-breakdown-y-scale/);
  assert.doesNotMatch(container.innerHTML, /data-breakdown-y-axis/);
  assert.doesNotMatch(container.innerHTML, /symlog/i);
  assert.match(container.innerHTML, />0%<\/text>/);
  assert.match(container.innerHTML, />100%<\/text>/);
});

test("scatter clip bounds include the complete radius and stroke of boundary bubbles", () => {
  const container = fakeContainer(900);
  renderInteractiveScatterChart(container, {
    chartId: "contained-boundary-bubbles",
    rows: [
      { market: "Bottom left", borrow: 1, utilization: 0, supply: 1 },
      { market: "Top right", borrow: 1000, utilization: 1, supply: 1000 }
    ],
    labelKey: "market",
    xKey: "borrow",
    yKey: "utilization",
    sizeKey: "supply",
    xScale: "log",
    fixedYDomain: { min: 0, max: 1 }
  });

  const clip = container.innerHTML.match(/<rect class="breakdown-scatter-clip-bounds" x="([^"]+)" y="([^"]+)" width="([^"]+)" height="([^"]+)"/);
  assert.ok(clip, "scatter exposes its expanded bubble clip bounds");
  const [, clipX, clipY, clipWidth, clipHeight] = clip.map(Number);
  const clipRight = clipX + clipWidth;
  const clipBottom = clipY + clipHeight;
  const bubbles = container.innerHTML.match(/<circle class="breakdown-scatter-point"[^>]+>/g) || [];
  assert.equal(bubbles.length, 2);
  for (const bubble of bubbles) {
    const cx = Number(bubble.match(/cx="([^"]+)"/)?.[1]);
    const cy = Number(bubble.match(/cy="([^"]+)"/)?.[1]);
    const radius = Number(bubble.match(/ r="([^"]+)"/)?.[1]);
    const strokeAllowance = 1;
    assert.ok(cx - radius - strokeAllowance >= clipX);
    assert.ok(cx + radius + strokeAllowance <= clipRight);
    assert.ok(cy - radius - strokeAllowance >= clipY);
    assert.ok(cy + radius + strokeAllowance <= clipBottom);
  }
});

test("category and scatter plots keep a real minimum width inside horizontal scroll", () => {
  const category = fakeContainer(320);
  renderInteractiveCategoryChart(category, {
    chartId: "narrow-category",
    rows: [{ market: "DJED", debt: 1250 }],
    categoryKey: "market",
    series: [{ key: "debt", label: "Debt" }]
  });
  assert.match(category.innerHTML, /class="breakdown-scroll"[^>]+overflow-x:auto/);
  assert.match(category.innerHTML, /breakdown-category-svg[^>]+width:640px;max-width:none/);

  const scatter = fakeContainer(320);
  renderInteractiveScatterChart(scatter, {
    chartId: "narrow-scatter",
    rows: [{ market: "DJED", debt: 10, utilization: 0.8 }],
    labelKey: "market",
    xKey: "debt",
    yKey: "utilization"
  });
  assert.match(scatter.innerHTML, /class="breakdown-scroll"[^>]+overflow-x:auto/);
  assert.match(scatter.innerHTML, /breakdown-scatter-svg[^>]+width:640px;max-width:none/);
  assert.doesNotMatch(category.innerHTML, /data-breakdown-y-scale/);
});

test("quantitative category X axes switch between Linear and Symlog without dropping bars", () => {
  const container = fakeContainer();
  renderInteractiveCategoryChart(container, {
    chartId: "scaled-category",
    rows: [
      { market: "Small", debt: 10 },
      { market: "Large", debt: 1_000_000 }
    ],
    categoryKey: "market",
    series: [{ key: "debt", label: "Debt", color: "#19b5fe" }],
    allowXScaleToggle: true,
    valueFormatter: value => `$${value}`
  });

  assert.match(container.innerHTML, /data-breakdown-x-scale="linear"[^>]+aria-pressed="true"/);
  assert.match(container.innerHTML, /data-breakdown-x-scale="symlog"[^>]+aria-pressed="false"/);
  assert.equal((container.innerHTML.match(/class="breakdown-bar breakdown-bar-grouped"/g) || []).length, 2);

  const symlogButton = {
    dataset: { breakdownXScale: "symlog" },
    closest(selector) { return selector === "[data-breakdown-x-scale]" ? this : null; }
  };
  container.listeners.get("click")({ target: symlogButton });

  assert.match(container.innerHTML, /data-breakdown-x-scale="symlog"[^>]+aria-pressed="true"/);
  assert.equal((container.innerHTML.match(/class="breakdown-bar breakdown-bar-grouped"/g) || []).length, 2);
  assert.match(container.innerHTML, /aria-label="Small, Debt: \$10"/);
  assert.match(container.innerHTML, /aria-label="Large, Debt: \$1000000"/);
});

test("bounded percentage category axes stay linear with exact quarter ticks", () => {
  const container = fakeContainer();
  renderInteractiveCategoryChart(container, {
    chartId: "bounded-category",
    rows: [{ market: "ADA", largest: 0.5, remaining: 0.5 }],
    categoryKey: "market",
    series: [
      { key: "largest", label: "Largest", color: "#991b1b" },
      { key: "remaining", label: "Remaining", color: "#a7f3d0" }
    ],
    mode: "stacked",
    allowXScaleToggle: true,
    fixedXDomain: { min: 0, max: 1 },
    valueFormatter: value => `${(value * 100).toFixed(1)}%`
  });

  assert.doesNotMatch(container.innerHTML, /data-breakdown-x-scale/);
  for (const tick of ["0%", "25%", "50%", "75%", "100%"] ) {
    assert.match(container.innerHTML, new RegExp(`<text[^>]+>${tick.replace("%", "\\%")}</text>`));
  }
  assert.doesNotMatch(container.innerHTML, /<text[^>]+>106(?:\.0)?%<\/text>/);
});

test("matrix palette and direction make high values configurable", () => {
  const normal = fakeContainer();
  renderInteractiveMatrixChart(normal, {
    chartId: "caution-matrix",
    rows: [{ market: "Low", stress: 0 }, { market: "High", stress: 1 }],
    rowKey: "market",
    columns: [{ key: "stress", label: "Stress" }],
    palette: ["#00aa66", "#ff3344"]
  });
  assert.match(normal.innerHTML, /fill="#ff3344"/);

  const reversed = fakeContainer();
  renderInteractiveMatrixChart(reversed, {
    chartId: "reversed-matrix",
    rows: [{ market: "Low", stress: 0 }, { market: "High", stress: 1 }],
    rowKey: "market",
    columns: [{ key: "stress", label: "Stress" }],
    palette: ["#00aa66", "#ff3344"],
    paletteDirection: "reverse"
  });
  assert.match(reversed.innerHTML, /aria-label="High, Stress: 1"[^>]*>[\s\S]*?<rect[^>]+fill="#00aa66"/);

  const risk = fakeContainer();
  renderInteractiveMatrixChart(risk, {
    chartId: "risk-matrix",
    rows: [{ market: "Low", stress: 0 }, { market: "High", stress: 1 }],
    rowKey: "market",
    columns: [{ key: "stress", label: "Stress" }],
    matrixPalette: "risk"
  });
  assert.match(risk.innerHTML, /aria-label="High, Stress: 1"[^>]*>[\s\S]*?<rect[^>]+fill="#991b1b"/);
  assert.match(risk.innerHTML, /aria-label="Low, Stress: 0"[^>]*>[\s\S]*?<rect[^>]+fill="#a7f3d0"[\s\S]*?<text[^>]+fill="#071522"/);
  assert.match(risk.innerHTML, /aria-label="High, Stress: 1"[^>]*>[\s\S]*?<rect[^>]+fill="#991b1b"[\s\S]*?<text[^>]+fill="#f8fbff"/);
});

test("matrix legend can align beneath the left side of the value grid", () => {
  const container = fakeContainer();
  renderInteractiveMatrixChart(container, {
    chartId: "left-legend-matrix",
    rows: [{ scope: "Protocol", coverage: 0.8 }],
    rowKey: "scope",
    columns: [{ key: "coverage", label: "Coverage" }],
    legendAlign: "left"
  });

  assert.match(container.innerHTML, /data-matrix-legend-align="left"/);
});

test("matrix can place its legend at top-left and wrap complete column labels", () => {
  const container = fakeContainer(700);
  renderInteractiveMatrixChart(container, {
    chartId: "visible-matrix-labels",
    rows: [{ market: "ADA", coverage: 0.8, concentration: 0.4 }],
    rowKey: "market",
    columns: [
      { key: "coverage", label: "Weak interest coverage" },
      { key: "concentration", label: "Exposure-weighted risk" }
    ],
    legendAlign: "left",
    legendPosition: "top"
  });

  assert.match(container.innerHTML, /data-matrix-legend-align="left"/);
  assert.match(container.innerHTML, /data-matrix-legend-position="top"/);
  assert.match(container.innerHTML, /<tspan[^>]*>Weak interest<\/tspan>[\s\S]*?<tspan[^>]*>coverage<\/tspan>/);
  assert.match(container.innerHTML, /<tspan[^>]*>Exposure-weighted<\/tspan>[\s\S]*?<tspan[^>]*>risk<\/tspan>/);
  assert.doesNotMatch(container.innerHTML, /<tspan[^>]*>[^<]*…/);
});

test("100 percent category rows can hatch an explicit unmapped segment", () => {
  const container = fakeContainer();
  renderInteractiveCategoryChart(container, {
    chartId: "market-dependence",
    rows: [{ market: "ADA · 99.6% coverage", largest: 0.7, other: 0.296, unmapped: 0.004 }],
    categoryKey: "market",
    series: [
      { key: "largest", label: "Largest key", color: "#991b1b" },
      { key: "other", label: "Other mapped keys", color: "#a7f3d0" },
      { key: "unmapped", label: "Unmapped borrow", color: "#7fa6c7", hatch: true }
    ],
    mode: "stacked",
    fixedXDomain: { min: 0, max: 1 },
    valueFormatter: value => `${(value * 100).toFixed(1)}%`
  });

  assert.match(container.innerHTML, /ADA · 99\.6% coverage/);
  assert.match(container.innerHTML, /<pattern id="market-dependence-unmapped-hatch"/);
  assert.match(container.innerHTML, /fill="url\(#market-dependence-unmapped-hatch\)"/);
  assert.match(container.innerHTML, /<text[^>]+>100%<\/text>/);
  assert.match(container.innerHTML, /repeating-linear-gradient/);
});

test("scatter uses one roving tab stop and arrow keys move it", () => {
  const container = fakeContainer();
  renderInteractiveScatterChart(container, {
    chartId: "roving-scatter",
    rows: [
      { market: "A", x: 1, y: 2 },
      { market: "B", x: 2, y: 3 },
      { market: "C", x: 3, y: 4 }
    ],
    labelKey: "market"
  });
  const scatterMarks = container.innerHTML.match(/<circle class="breakdown-scatter-point"[^>]+>/g) || [];
  assert.equal(scatterMarks.filter(mark => mark.includes('tabindex="0"')).length, 1);
  assert.equal(scatterMarks.filter(mark => mark.includes('tabindex="-1"')).length, 2);

  const marks = Array.from({ length: 3 }, (_, index) => ({
    dataset: { breakdownRoving: "scatter" },
    attributes: { tabindex: index === 0 ? "0" : "-1" },
    closest() { return this; },
    setAttribute(name, value) { this.attributes[name] = value; },
    focusCalled: false,
    focus() { this.focusCalled = true; }
  }));
  container.querySelectorAll = () => marks;
  let prevented = false;
  container.listeners.get("keydown")({
    target: marks[0],
    key: "ArrowRight",
    preventDefault() { prevented = true; }
  });
  assert.equal(prevented, true);
  assert.equal(marks[0].attributes.tabindex, "-1");
  assert.equal(marks[1].attributes.tabindex, "0");
  assert.equal(marks[1].focusCalled, true);
});

test("replacing a chart id unobserves the old container", () => {
  const observed = [];
  const unobserved = [];
  const OriginalResizeObserver = globalThis.ResizeObserver;
  globalThis.ResizeObserver = class {
    constructor(callback) { this.callback = callback; }
    observe(container) { observed.push(container); }
    unobserve(container) { unobserved.push(container); }
  };

  try {
    const first = fakeContainer();
    const replacement = fakeContainer();
    const options = {
      chartId: "replaceable-ranking",
      rows: [{ market: "A", debt: 1 }],
      categoryKey: "market",
      series: [{ key: "debt", label: "Debt" }]
    };
    renderInteractiveCategoryChart(first, options);
    renderInteractiveCategoryChart(replacement, options);
    assert.deepEqual(observed, [first, replacement]);
    assert.deepEqual(unobserved, [first]);
  } finally {
    if (OriginalResizeObserver === undefined) delete globalThis.ResizeObserver;
    else globalThis.ResizeObserver = OriginalResizeObserver;
  }
});
