import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

test("AGENTS.md contains mandatory Non-Negotiable rule for UI info bubble code truthfulness", async () => {
  const agentsMd = await fs.readFile(path.join(projectRoot, "AGENTS.md"), "utf8");
  assert.match(
    agentsMd,
    /Ensure every info bubble, tooltip, popover explanation, and formula in the UI strictly matches and reflects the underlying code implementation\./,
    "AGENTS.md must include mandatory info bubble code truthfulness rule"
  );
});

test("static_app_generator.py defines complete, typo-free metadata for all APP_KPI_METADATA entries", async () => {
  const generator = await fs.readFile(path.join(projectRoot, "scripts", "static_app_generator.py"), "utf8");

  // Verify renderInfoBubble definition and structure
  assert.match(generator, /function renderInfoBubble\(title, explanation, formula = "", range = ""\)/);
  assert.match(generator, /class="app-info-btn"/);
  assert.match(generator, /class="app-info-popover"/);

  // Extract APP_KPI_METADATA block
  const match = generator.match(/const APP_KPI_METADATA = Object\.freeze\((\{[\s\S]*?\n\}\);)/);
  assert.ok(match, "APP_KPI_METADATA block must be found");

  const kpiBlob = match[1];
  const entries = kpiBlob.match(/"([^"]+)":\s*\{[^}]+\}/g) || [];
  assert.ok(entries.length >= 30, `Expected at least 30 KPI metadata entries, found ${entries.length}`);

  for (const entry of entries) {
    const keyMatch = entry.match(/"([^"]+)":\s*\{/);
    const key = keyMatch ? keyMatch[1] : "unknown";
    
    assert.match(entry, /"description":\s*"[^"]+"/, `KPI "${key}" missing valid description`);
    assert.match(entry, /"explanation":\s*"[^"]+"/, `KPI "${key}" missing valid explanation`);
    assert.match(entry, /"formulaText":\s*"[^"]+"/, `KPI "${key}" missing valid formulaText`);
    assert.doesNotMatch(entry, /"explanation:\s*":/, `KPI "${key}" contains typo "explanation: "`);
  }

  // Verify all kpi("...") calls in static_app_generator.py have corresponding metadata
  const metaKeys = new Set((kpiBlob.match(/"([^"]+)":\s*\{/g) || []).map((m) => m.match(/"([^"]+)":\s*\{/)[1]));
  const kpiCalls = (generator.match(/kpi\(\s*"([^"]+)"/g) || []).map((m) => m.match(/kpi\(\s*"([^"]+)"/)[1]);
  for (const label of kpiCalls) {
    const norm = label.replace(/[–—]/g, "-").replace(/\s+/g, " ").trim();
    const hasMeta = metaKeys.has(label) || metaKeys.has(norm);
    assert.ok(hasMeta, `KPI call "${label}" is missing an entry in APP_KPI_METADATA`);
  }
});

test("chart help text helpers provide truthful, code-grounded explanations for protocol and market scopes", async () => {
  const generator = await fs.readFile(path.join(projectRoot, "scripts", "static_app_generator.py"), "utf8");

  // Verify coverageValuationHelp
  assert.match(generator, /function coverageValuationHelp\(scope = "market"\)/);
  assert.match(generator, /Coverage is calculated per market from native accrued and repaid quantities/);

  // Verify debtFlowReconciliationHelp
  assert.match(generator, /function debtFlowReconciliationHelp/);

  // Verify gapValuationHelp
  assert.match(generator, /function gapValuationHelp/);

  // Verify interestFlowHelp
  assert.match(generator, /function interestFlowHelp/);
});

test("breakdown matrix header info bubbles render accessible, non-empty popovers with calculation descriptions", async () => {
  const breakdownJs = await fs.readFile(path.join(projectRoot, "src", "browser", "interactiveBreakdownChart.js"), "utf8");

  assert.match(breakdownJs, /class="matrix-info-bubble-btn"/);
  assert.match(breakdownJs, /aria-label="Explanation for/);
  assert.match(breakdownJs, /class="breakdown-popover"/);
});
