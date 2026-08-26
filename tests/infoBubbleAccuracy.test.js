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
  assert.match(generator, /function renderInfoBubble\(title, explanation, formula = "", range = "", note = ""\)/);
  assert.match(generator, /class="app-info-btn"/);
  assert.match(generator, /class="app-info-popover"/);
  assert.match(generator, /Excludes governance-protected POL loans\./);

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
  assert.match(generator, /Unclassified Reduction = max\(0, -\(Borrow Change \+ Reported Repayment\)\)/);
  assert.match(generator, /Borrow Change = Inferred Formation - Reported Repayment - Unclassified Reduction/);

  // Verify gapValuationHelp
  assert.match(generator, /function gapValuationHelp/);
  assert.match(generator, /can move solely because the asset price changes/i);

  // Verify interestFlowHelp
  assert.match(generator, /function interestFlowHelp/);
  assert.match(generator, /does not expose a current interest receivable/i);
});

test("revenue KPI info bubbles match the official daily allocation implementation", async () => {
  const generator = await fs.readFile(path.join(projectRoot, "scripts", "static_app_generator.py"), "utf8");

  assert.match(generator, /"Annualized run rate":\s*\{[\s\S]*?"formulaText":\s*"Revenue_90d \* \(365\.25 \/ 90\)"/);
  assert.match(generator, /"DAO interest allocation":\s*\{[\s\S]*?API-reported DAO interest allocation across complete daily analytics\.fees rows[\s\S]*?"formulaText":\s*"sum\(Complete daily borrowInterestAccruedForProtocol USD\)"/);
  assert.doesNotMatch(
    generator.match(/"DAO interest allocation":\s*\{[\s\S]*?\n\s*\}/)?.[0] || "",
    /Reserve Factor|reserve factor/,
    "DAO interest metadata must not claim that the app reapplies a reserve factor"
  );
  assert.match(generator, /"LQ-staker allocation":\s*\{[\s\S]*?"formulaText":\s*"sum\(Complete daily holder interest \+ holder origination allocation USD\)"/);
});

test("collected revenue bubbles use repayment-timed retained interest and both origination fee components", async () => {
  const generator = await fs.readFile(path.join(projectRoot, "scripts", "static_app_generator.py"), "utf8");

  assert.match(generator, /"YTD collected revenue":\s*\{[\s\S]*?complete days in the latest collected-revenue calendar year[\s\S]*?"formulaText":\s*"sum\(Latest calendar-year complete days: revenueFromRepaidInterestInUsd \+ loanOriginationFeesInUsd \+ loanOriginationFeesMinAdaInUsd\)"/);
  assert.match(generator, /"Revenue from repaid interest":\s*\{[\s\S]*?"formulaText":\s*"sum\(Latest calendar-year complete days: revenueFromRepaidInterestInUsd\)"/);
  assert.match(generator, /"Loan origination fees":\s*\{[\s\S]*?"formulaText":\s*"sum\(Latest calendar-year complete days: loanOriginationFeesInUsd \+ loanOriginationFeesMinAdaInUsd\)"/);
  assert.match(generator, /"Collected revenue":\s*\{[\s\S]*?revenueFromRepaidInterestInUsd[\s\S]*?loanOriginationFeesInUsd[\s\S]*?loanOriginationFeesMinAdaInUsd[\s\S]*?"formulaText":\s*"sum\(revenueFromRepaidInterestInUsd \+ loanOriginationFeesInUsd \+ loanOriginationFeesMinAdaInUsd\)"/);
  assert.match(generator, /"Interest revenue collected":\s*\{[\s\S]*?"formulaText":\s*"sum\(revenueFromRepaidInterestInUsd\)"/);
  assert.match(generator, /"Origination fees collected":\s*\{[\s\S]*?"formulaText":\s*"sum\(loanOriginationFeesInUsd \+ loanOriginationFeesMinAdaInUsd\)"/);
});

test("market revenue bubbles distinguish reconciled collections, direct fees, accruals, and projections", async () => {
  const generator = await fs.readFile(path.join(projectRoot, "scripts", "static_app_generator.py"), "utf8");

  assert.match(generator, /"YTD attributed collected revenue":\s*\{[\s\S]*?official protocol retained-interest total[\s\S]*?parameter-weighted market repayment[\s\S]*?"formulaText":/i);
  assert.match(generator, /"Attributed interest revenue collected":\s*\{[\s\S]*?revenueFromRepaidInterestInUsd[\s\S]*?interestRepaidInUsd \* protocolInterestShare[\s\S]*?"formulaText":/);
  assert.match(generator, /"Market origination fees collected":\s*\{[\s\S]*?analytics\.marketHistory[\s\S]*?"formulaText":\s*"sum\(YTD complete market days: loanOriginationFeesInUsd \+ loanOriginationFeesMinAdaInUsd\)"/);
  assert.match(generator, /"Accrued protocol\/reserve interest revenue":\s*\{[\s\S]*?interestAccruedInUsd \* \(1 - incomeRatioSuppliers \/ incomeRatioSum\)[\s\S]*?"formulaText":/);
  assert.match(generator, /"Annualized protocol\/reserve interest revenue":\s*\{[\s\S]*?borrowInUsd \* borrowApr \* \(1 - incomeRatioSuppliers \/ incomeRatioSum\)[\s\S]*?"formulaText":/);
  assert.match(generator, /"YTD interest repaid activity":\s*\{[\s\S]*?not retained protocol revenue[\s\S]*?"formulaText":\s*"sum\(YTD complete market days: interestRepaidInUsd\)"/);
  assert.doesNotMatch(generator, /Unavailable: analytics\.marketHistory has no revenueFromRepaidInterestInUsd field/);
  assert.doesNotMatch(generator, /Gross realized fee flow/);
});

test("breakdown matrix header info bubbles render accessible, non-empty popovers with calculation descriptions", async () => {
  const breakdownJs = await fs.readFile(path.join(projectRoot, "src", "browser", "interactiveBreakdownChart.js"), "utf8");

  assert.match(breakdownJs, /class="matrix-info-bubble-btn"/);
  assert.match(breakdownJs, /aria-label="Explanation for/);
  assert.match(breakdownJs, /class="breakdown-popover"/);
});

test("all health factor, bad debt, collateral decline shock, and loan-health pressure info bubbles include POL exclusion disclaimer", async () => {
  const generator = await fs.readFile(path.join(projectRoot, "scripts", "static_app_generator.py"), "utf8");
  const breakdownJs = await fs.readFile(path.join(projectRoot, "src", "browser", "interactiveBreakdownChart.js"), "utf8");

  // Loan health pressure metadata in breakdown charts
  assert.match(breakdownJs, /loanHealthPressure:\s*\{[\s\S]*?Excludes governance-protected POL loans\./);
  assert.match(breakdownJs, /loanHealthPressure:\s*\{[\s\S]*?Organic Debt/);

  // Protocol health history chart panels
  assert.match(generator, /"Active-debt loan count by health-factor band", "protocolHealthHistoryCounts", \{[\s\S]*?Excludes governance-protected POL loans\./);
  assert.match(generator, /"Active debt by health-factor band", "protocolHealthHistoryDebt", \{[\s\S]*?Excludes governance-protected POL loans\./);

  // Exposure tab health, bad debt, and collateral decline shock panels
  assert.match(generator, /"Active debt by health-factor band over time", "exposureHealthHistoryDebt", \{[\s\S]*?Excludes governance-protected POL loans\./);
  assert.match(generator, /"Evolution of bad debt over time", "exposureBadDebtHistory", \{[\s\S]*?Excludes governance-protected POL loans\./);
  assert.match(generator, /"Active debt by borrowed market and health factor", "exposureBorrowedMarkets", \{[\s\S]*?Excludes governance-protected POL loans\./);
  assert.match(generator, /"Protocol debt by collateral and health factor", "exposureCollateralBands", \{[\s\S]*?Excludes governance-protected POL loans\./);
  assert.match(generator, /"Debt exposed after an independent collateral price decline", "exposureCollateralShock", \{[\s\S]*?Excludes governance-protected POL loans\./);

  // Impact tab matrix and loan state panels
  assert.match(generator, /"Market risk indicator matrix", "impactRiskRanking", \{[\s\S]*?Excludes governance-protected POL loans\./);
  assert.match(generator, /"Active-debt state by market", "impactLoanState", \{[\s\S]*?Excludes governance-protected POL loans\./);

  // Market health tab panels
  assert.match(generator, /"Current health-factor debt tranches", "marketHealthBuckets", \{[\s\S]*?Excludes governance-protected POL loans\./);
  assert.match(generator, /"Active debt by health-factor band over time", "marketHealthHistoryDebt", \{[\s\S]*?Excludes governance-protected POL loans\./);
  assert.match(generator, /"Active-debt position count by health-factor band", "marketHealthHistoryCounts", \{[\s\S]*?Excludes governance-protected POL loans\./);

  // KPI metadata notes
  const kpiChecks = [
    "Debt at HF < 1.0",
    "Debt below HF 1.0",
    "Critical debt at HF <= 1.10",
    "Debt at critical health",
    "Debt at HF <= 1.25",
    "Debt near liquidation",
    "Highest debt at risk (HF < 1.0)",
    "Highest bad debt",
    "Sum of bad debt",
    "Bad debt",
    "Bad-debt positions",
    "Min health factor",
    "Minimum health factor",
    "Largest critical collateral",
    "Largest near-liquidation collateral"
  ];
  for (const kpiLabel of kpiChecks) {
    const escaped = kpiLabel.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const regex = new RegExp(`"${escaped}":\\s*\\{[^}]+?"note":\\s*"Excludes governance-protected POL loans\\."`);
    assert.match(generator, regex, `KPI "${kpiLabel}" must have POL exclusion note`);
  }
});

