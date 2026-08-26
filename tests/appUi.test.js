import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

test("standalone app is one zero-data, folder-backed, client-only HTML workflow", async () => {
  const [html, generator, workflow, directoryStore, completeWorkflow, fullAnalysis, dataStatus, currentExposure, marketParameterHistory, interactiveChart, chartData, breakdownChart, recentDataLocation, packageText] = await Promise.all([
    fs.readFile(path.join(projectRoot, "data", "liqwid", "liqwid-analysis-app.html"), "utf8"),
    fs.readFile(path.join(projectRoot, "scripts", "static_app_generator.py"), "utf8"),
    fs.readFile(path.join(projectRoot, "src", "browser", "dataWorkflow.js"), "utf8"),
    fs.readFile(path.join(projectRoot, "src", "browser", "directoryStore.js"), "utf8"),
    fs.readFile(path.join(projectRoot, "src", "browser", "completeDataWorkflow.js"), "utf8"),
    fs.readFile(path.join(projectRoot, "src", "browser", "fullAnalysis.js"), "utf8"),
    fs.readFile(path.join(projectRoot, "src", "browser", "dataStatus.js"), "utf8"),
    fs.readFile(path.join(projectRoot, "src", "browser", "currentExposureAnalysis.js"), "utf8"),
    fs.readFile(path.join(projectRoot, "src", "browser", "marketParameterHistory.js"), "utf8"),
    fs.readFile(path.join(projectRoot, "src", "browser", "interactiveChart.js"), "utf8"),
    fs.readFile(path.join(projectRoot, "src", "browser", "chartData.js"), "utf8"),
    fs.readFile(path.join(projectRoot, "src", "browser", "interactiveBreakdownChart.js"), "utf8"),
    fs.readFile(path.join(projectRoot, "src", "browser", "recentDataLocation.js"), "utf8"),
    fs.readFile(path.join(projectRoot, "package.json"), "utf8")
  ]);
  const packageJson = JSON.parse(packageText);
  const productionSource = `${html}\n${generator}\n${workflow}\n${directoryStore}\n${completeWorkflow}\n${fullAnalysis}\n${dataStatus}\n${currentExposure}\n${marketParameterHistory}\n${interactiveChart}\n${chartData}\n${breakdownChart}\n${recentDataLocation}\n${packageText}`;
  const payloadMatch = html.match(/<script id="payload" type="application\/json">([\s\S]*?)<\/script>/);
  const embedded = JSON.parse(payloadMatch[1]);

  assert.match(html, /id="openAnotherDataButton"[^>]*class="primary"[^>]*hidden[^>]*>Open another data archive</);
  assert.match(html, /id="saveDataButton"[^>]*hidden[^>]*>Save data</);
  assert.match(html, /id="fetchNewDataButton"[^>]*hidden[^>]*>Fetch new data</);
  assert.match(html, /id="dataStatusButton"[^>]*hidden[^>]*>[^<]*Data status/);
  assert.match(html, /<header>[\s\S]*?id="dataStatusButton"[\s\S]*?<\/header>[\s\S]*?<main>[\s\S]*?id="analyticsNav"/);
  assert.match(html, /id="dataStatusDialog"[^>]*aria-labelledby="dataStatusDialogTitle"/);
  assert.match(html, /id="closeDataStatusButton"[^>]*>Close/);
  assert.match(html, /id="openDataArchiveButton"[^>]*class="primary"[^>]*>Open existing data archive</);
  assert.match(html, /id="fetchFullHistoryButton"[^>]*>Fetch full data history</);
  assert.doesNotMatch(html, /Start new analysis|Start your Liqwid analysis/);
  assert.match(html, /id="fullHistoryConfirmDialog"/);
  assert.match(html, /id="confirmFullHistoryButton"[^>]*>Fetch full history</);
  assert.match(html, /id="cancelFullHistoryButton"[^>]*>Cancel</);
  assert.match(html, /id="dataArchiveFileInput"[^>]*type="file"/);
  assert.doesNotMatch(html, /id="toggleSettingsButton"|id="settingsPanel"|id="chooseDataFolderButton"/);
  assert.doesNotMatch(html, />Get started</);
  assert.match(html, /showDirectoryPicker/);
  assert.match(html, /showOpenFilePicker/);
  assert.match(html, /showSaveFilePicker/);
  assert.match(html, /openDirectoryDataStore/);
  assert.match(html, /commitDataStoreToDirectory/);
  assert.match(html, /loadPortableDataArchive/);
  assert.match(html, /savePortableDataArchive/);
  assert.match(html, /prepareDataLocationForUpdate\(dataLocation\)[\s\S]*?refreshDataAndOutputs\(\)/);
  const firstFetchSource = html.match(/async function startFullHistoryFetch\(\)[\s\S]*?async function refreshDataAndOutputs\(\)/)?.[0] || "";
  const refreshSource = html.match(/async function refreshDataAndOutputs\(\)[\s\S]*?async function openExistingData\(\)/)?.[0] || "";
  const archiveLoadSource = html.match(/async function loadDataLocation\(openedLocation\)[\s\S]*?async function restoreLastDataOnStartup/)?.[0] || "";
  assert.match(firstFetchSource, /await refreshDataAndOutputs\(\)/);
  assert.match(refreshSource, /refreshCompleteDataset\([\s\S]*?applyCompleteAnalysis\(refreshed\.bundle, refreshed\.analysis\)/);
  assert.match(archiveLoadSource, /buildCompleteAnalysisFromStore\([\s\S]*?applyCompleteAnalysis\(openedBundle, openedAnalysis\)/);
  assert.match(productionSource, /lastRefreshStep[\s\S]*?refreshErrorMessage\(error, lastRefreshStep\)/);
  assert.match(productionSource, /markets:\s*"Refreshing the public market list"/);
  assert.match(html, /function formatRefreshProgress\(progress = \{\}\)/);
  assert.match(generator, /const formatted = formatRefreshProgress\(progress\)/);
  assert.match(html, /phase === "protocol-overview-daily"/);
  assert.match(html, /phase === "protocol-fees-daily"/);
  assert.doesNotMatch(productionSource, /OPEN-LIQWID-ANALYSIS\.cmd/i);
  assert.match(html, /https:\/\/v2\.api\.liqwid\.finance\/graphql/);
  assert.doesNotMatch(html, /<script[^>]+src=/i);
  assert.doesNotMatch(productionSource, /localhost:4173|\/api\/refresh|npm start/);
  assert.equal(packageJson.scripts.start, undefined);
  assert.deepEqual(embedded, { bundle: null, deep: null });
  assert.match(html, /buildCompleteAnalysisFromStore/);
  assert.match(html, /refreshCompleteDataset/);
  assert.match(html, /renderEmptyState/);
  for (const appSource of [html, generator]) {
    assert.doesNotMatch(appSource, /<section id="methodology"/);
    assert.doesNotMatch(appSource, /\["methodology", "Methodology"\]/);
    assert.doesNotMatch(appSource, /methodology:\s*renderMethodology/);
    assert.doesNotMatch(appSource, /function renderMethodology\(\)/);
  }
  assert.match(html, /rememberDataLocation/);
  assert.match(html, /restoreRememberedDataLocation/);
  assert.match(html, /indexedDB/);
  assert.match(html, /Open another data archive/);
  assert.match(html, /Save data/);
  assert.match(html, /Fetch new data/);
  assert.doesNotMatch(html, /<img\s+src="(?!data:)/i);
  assert.match(html, /renderInteractiveTimeSeriesChart/);
  assert.match(html, /class="chart-main"/);
  assert.match(html, /class="chart-navigator"/);
  assert.match(html, /class="chart-tooltip"/);
  assert.match(html, /class="chart-range-start"/);
  assert.match(html, /class="chart-range-end"/);
  assert.doesNotMatch(productionSource, /data-chart-action="compare-visible"|Summarize visible interval|Compare visible endpoints/);
  assert.match(html, /class="chart-summary-period"/);
  assert.match(html, /data-chart-mode="compare"/);
  assert.match(html, /data-chart-y-scale="linear"/);
  assert.match(html, /data-chart-y-scale="symlog"/);
  assert.match(html, /data-chart-y-axis/);
  assert.match(html, /chart-main-shell[\s\S]*?chart-y-scale-group[\s\S]*?<svg class="chart-main"/);
  assert.match(html, /protocolUtilization[\s\S]*?fixedYDomain:\s*\{\s*min:\s*0,\s*max:\s*1\s*\}/);
  assert.match(html, /marketUtilization[\s\S]*?fixedYDomain:\s*\{\s*min:\s*0,\s*max:\s*1\s*\}/);
  assert.match(html, /impactMarketMap[\s\S]*?fixedYDomain:\s*\{\s*min:\s*0,\s*max:\s*1\s*\}/);
  assert.match(html, /data-breakdown-y-scale="symlog"/);
  assert.match(html, /data-breakdown-y-axis/);
  assert.match(html, /data-breakdown-x-scale="linear"/);
  assert.match(html, /data-breakdown-x-scale="symlog"/);
  assert.match(html, /valueMode: "flow"/);
  assert.match(html, /renderInteractiveCategoryChart/);
  assert.match(html, /renderInteractiveMatrixChart/);
  assert.match(html, /renderInteractiveScatterChart/);
  assert.match(html, /Current protocol exposure/);
  assert.match(html, /id="analyticsNav"[^>]*class="analytics-nav"/);
  assert.match(html, /id="scopeTabs"/);
  assert.match(html, /id="sectionTabs"/);
  assert.match(html, /id="analysisLocation"/);
  assert.match(html, /id="marketContext"/);
  assert.match(html, /\["protocol", "Protocol analytics",/);
  assert.match(html, /\["markets", "Market analytics",/);
  assert.match(html, /const analyticsScopes =/);
  assert.doesNotMatch(generator, /\["dataStatus",\s*"Data status"\]/);
  assert.match(html, /function renderDataStatusDialog\(\)/);
  assert.match(html, /deep\.dataStatus\.coverageCards\.map/);
  for (const heading of ["Data coverage", "Current loan population", "Consistency checks", "Known coverage boundaries"]) {
    assert.match(html, new RegExp(heading));
  }
  assert.match(html, /Show technical audit details/);
  for (const heading of ["Archive provenance", "Dataset inventory", "Validation evidence", "Validation rules"]) {
    assert.match(html, new RegExp(heading));
  }
  assert.match(html, /const VIEWER_BUILD = "[a-f0-9]{12}"/);
  assert.doesNotMatch(html, /__LIQWID_VIEWER_BUILD__/);
  assert.match(html, /Viewer build/);
  assert.match(generator, /\.data-status-card\.pass\s*\{[^}]*border-top-color:\s*var\(--mint\)/);
  assert.match(generator, /\.data-status-check\.pass\s+\.data-status-check-mark\s*\{[^}]*var\(--mint\)/);
  assert.match(generator, /\.loan-population-segment\.active\s*\{\s*background:\s*var\(--blue\);\s*\}/);
  assert.doesNotMatch(generator, /\.loan-population-segment\.active\s*\{[^}]*linear-gradient/);
  assert.match(html, /analysisLocation"\)\.innerHTML = `<span>\$\{esc\(scopeLabel\)\}<\/span><span aria-hidden="true">\/<\/span><strong>\$\{esc\(sectionLabel\)\}<\/strong>`/);
  assert.match(html, /position:\s*sticky[\s\S]{0,160}?top:\s*0/);
  for (const section of [
    "Liquidity", "Liquidity & Rates", "Debt flows", "Interest flows", "USD stablecoin yields", "Revenue", "Liquidations", "Exposure", "Market impact", "Participation and concentration",
    "Health", "Parameters History", "Risk & Parameters", "Protocol-Owned Liquidity (POL)"
  ]) {
    assert.ok(html.includes(section), `standalone app is missing section tab ${section}`);
  }
  for (const viewId of [
    "overview", "protocolDebtFlows", "protocolInterestFlows", "protocolStablecoinYields", "revenue", "liquidations", "exposure", "impact", "protocolParticipation",
    "protocolParameters", "protocolPol", "marketOverview", "marketRepayments", "marketInterest", "marketRevenue", "marketHealth", "marketParticipation", "marketParameters", "marketPol"
  ]) {
    assert.match(html, new RegExp(`<section id="${viewId}" class="view`), `standalone app is missing ${viewId}`);
  }
  assert.match(html, /What is the protocol's current scale and how fully is its capital being used\?/);
  assert.match(html, /Is new debt forming faster than borrowers are repaying it\?/);
  assert.match(html, /Are reported interest repayments keeping pace with accrual\?/);
  assert.match(html, /Where is current debt most vulnerable to market or collateral stress\?/);
  assert.match(html, /Which markets contribute most to protocol-wide debt, interest, repayments, positive gaps, and stress\?/);
  assert.match(html, /Where is this market's capital, and how expensive or constrained is borrowing\?/);
  assert.match(html, /\["marketParticipation", "Participation and concentration"\],\s*\["marketParameters", "Parameters History"\],\s*\["marketPol", "Protocol-Owned Liquidity \(POL\)"\]\s*\]/);
  assert.match(html, /\["protocolParameters", "Risk & Parameters"\],\s*\["protocolPol", "Protocol-Owned Liquidity \(POL\)"\]\s*\]/);
  assert.match(html, /function renderProtocolParameters\(\)/);
  assert.match(html, /function renderProtocolPol\(\)/);
  assert.match(html, /POL share of protocol borrow/);
  assert.match(html, /function renderMarketPol\(\)/);
  assert.match(html, /Protocol parameter landscape/);
  assert.match(html, /Tracking the Liqwid DAO and core development infrastructure financing loans/);
  assert.match(html, /Borrow APR curve atlas/);
  assert.match(html, /Current capacity headroom/);
  assert.match(html, /Current market guardrails/);
  assert.match(html, /Current collateral risk matrix/);
  assert.match(html, /Borrow-weighted rate policy/);
  assert.match(html, /Borrow-weighted income allocation/);
  assert.match(html, /Exact governance updates across markets/);
  assert.match(html, /function renderMarketParameters\(\)/);
  assert.match(html, /Current rate curve/);
  assert.match(html, /\(1 - utilization\) \* baseSupplierAPY \+ utilization \* borrowerAPR \* supplierSplit/);
  assert.match(html, /Exact governance updates/);
  assert.match(html, /syntheticStepBoundary/);
  const liquidationRenderSource = generator.match(/function renderLiquidations\(\)[\s\S]*?function renderCurrentExposure\(\)/)?.[0] || "";
  assert.doesNotMatch(liquidationRenderSource, /apiScope|analytics\.overview exposes liquidationProfitInUsd|Per-market repayment intensity remains|never presented as confirmed liquidation activity/);
  assert.doesNotMatch(generator, /freshnessNotice\(|chartSourceNote\(|analysisStrip\(/);
  assert.doesNotMatch(html, /Every .*rebuild|same completed refresh|user-triggered loan-book fetch|Hover or focus the plot and use arrow keys/);
  assert.match(html, /renderCurrentExposure/);
  assert.match(html, /<section id="revenue" class="view"><\/section>/);
  assert.match(html, /\["revenue", "Revenue"\]/);
  assert.match(html, /function renderRevenue\(\)/);
  assert.match(html, /<h2>Protocol revenue<\/h2>/);
  assert.match(html, /metric-period/);
  assert.match(html, /Current-valued cumulative reported interest-flow difference/);
  assert.match(html, /cumulativeInterestGapInUsd/);
  assert.match(html, /Cumulative observed-key borrow concentration/);
  assert.match(html, /marketBorrowConcentration/);
  assert.match(html, /Cumulative observed-key collateralized-supply concentration/);
  assert.match(html, /marketCollateralizedSupplyConcentration/);
  assert.match(html, /Observed-key borrow concentration across markets/);
  assert.match(html, /impactBorrowConcentrationComparison/);
  assert.match(html, /Observed-key collateralized-supply concentration across markets/);
  assert.match(html, /impactCollateralizedSupplyConcentrationComparison/);
  assert.match(html, /seriesKey:\s*"marketId"/);
  assert.match(html, /xScale:\s*"log1p"/);
  assert.match(html, /integerXTicks:\s*true/);
  assert.match(html, /shareKey:\s*"cumulativeShareOfMarketBorrow"/);
  assert.match(html, /shareKey:\s*"cumulativeShareOfRepresentedCollateralizedSupply"/);
  assert.match(html, /1st key/);
  assert.match(html, /data-breakdown-scatter-toggle/);
  assert.match(breakdownChart, /data-breakdown-series-state="\$\{emphasized \? "emphasized" : "muted"\}"/);
  assert.match(html, /cumulativeShareOfRepresentedCollateralizedSupply/);
  assert.match(html, /connectPoints:\s*true/);
  assert.match(html, /function fmt\(key, value\)\s*\{[\s\S]*?\/Share\|Score\|Pressure\|Utilization\|Coverage\|Apy\|Apr\/[\s\S]*?return pct\(value\);[\s\S]*?\/InUsd\|Borrow\|Debt\|Collateral\/[\s\S]*?return usd\(value\);/);
  assert.match(html, /light mint to dark red/);
  assert.match(html, /Every observed key · exact values/);
  assert.match(html, /official market borrow/);
  assert.match(html, /hatched share/);
  assert.match(html, /Loan details exceed market aggregate/);
  assert.match(html, /loan-detail and market-aggregate API surfaces/);
  assert.match(html, /Loan rows fall below market aggregate/);
  assert.match(html, /official loan API may be missing some positions/i);
  assert.match(html, /accepted 99\.5% coverage boundary/);
  assert.match(html, /accepted 100\.5% coverage boundary/);
  assert.match(html, /loan-coverage-notice--undercoverage/);
  assert.match(html, /loan-coverage-notice--overcoverage/);
  assert.match(html, /summarizeLoanRowCoverageNotices/);
  assert.match(html, /function loanCoverageState\(/);
  assert.match(html, /Overcoverage/);
  assert.match(html, /99\.5% through 100\.5%/);
  assert.doesNotMatch(html, /≈100%/);
  assert.match(html, /Does low-health debt become more concentrated as the health-factor cutoff tightens/);
  assert.match(html, /How much supply appears as loan collateral, and how concentrated is that visible subset/);
  assert.match(html, /Evolution of bad debt over time/);
  assert.match(html, /interactiveChartPanel\("Evolution of bad debt over time",\s*"exposureBadDebtHistory"/);
  assert.match(html, /exposureBadDebtHistory/);
  assert.doesNotMatch(productionSource, /crossMarket|smallest ranked set|99% relevance|proxy for actors/i);
  assert.match(html, /Supply not represented as loan collateral is not leftover liquidity/);
  assert.match(html, /const riskPalette = \["#a7f3d0", "#34d399", "#facc15", "#f97316", "#991b1b"\]/);
  assert.match(html, /matrixPalette:\s*"risk"/);
  assert.match(productionSource, /adjustedAmount\(input:\s*\{\s*currency:\s*USD\s*\}\)/);
  assert.match(productionSource, /const allInput = \{\};[\s\S]*?deriveLoanPopulations\(all\.results \|\| \[\]\)/);
  assert.doesNotMatch(productionSource, /filters:\s*\["(?:HAS_DEBT|CAN_BE_LIQUIDATED|HAS_COLLATERAL)"\]/);
  assert.match(html, /buildContributionChartData/);
  assert.match(html, /function contributionSeries\(rows\)[\s\S]*?contributionKeysByLatest\(rows\)/);
  assert.match(html, /buildMarketStressChartData/);
  assert.match(html, /fillMonthlyChartGaps/);
  assert.match(html, /colorKey:\s*"interestCoverage90d"/);
  assert.match(html, /stackMode\s*=\s*"percent"/);
  assert.doesNotMatch(generator, /maxRows\s*:/, "production charts must render every qualifying row");
  assert.doesNotMatch(generator, /rows:\s*(?:riskRows|stressRows)\.slice\(/, "matrix charts must render every qualifying row");
  assert.doesNotMatch(generator, /table\([^\n]+\.slice\(0,\s*\d+\)/, "exact-value tables must render every row");
  assert.doesNotMatch(productionSource, /topN:\s*7/, "market contribution charts must retain every market series");
  assert.match(generator, /\.chart-stack\s*\{[^}]*grid-template-columns:\s*1fr/s);
  assert.doesNotMatch(generator, /<div class="grid">\s*\$\{interactiveBreakdownPanel/s, "chart panels must not share a row");
  for (const chartId of [
    "exposureFlowComparison",
    "exposureBorrowedMarkets",
    "exposureCollateralBands",
    "exposureLiquidatableDebt",
    "exposureSupplyComposition"
  ]) {
    assert.match(generator, new RegExp(`chartId: "${chartId}"[\\s\\S]{0,1400}?allowXScaleToggle: true`), `${chartId} must expose X-axis scaling`);
  }
  assert.match(generator, /chartId: "exposureSupplyConcentration"[\s\S]{0,900}?fixedXDomain:\s*\{\s*min:\s*0,\s*max:\s*1\s*\}/);
  const marketViewSource = generator.match(/function renderMarketOverview\(\)\s*\{[\s\S]*?function renderImpact\(\)/)?.[0] || "";
  assert.ok(marketViewSource.indexOf('"marketCapital"') < marketViewSource.indexOf('"marketRates"'));
  assert.ok(marketViewSource.indexOf('"marketRates"') < marketViewSource.indexOf('"marketDebtRepayment"'));
  assert.ok(marketViewSource.indexOf('"marketAttributedCollectedRevenueDaily"') < marketViewSource.indexOf('"marketHealthBuckets"'));
  assert.ok(marketViewSource.indexOf('"marketHealthBuckets"') < marketViewSource.indexOf('"marketHealthHistoryDebt"'));
  assert.ok(marketViewSource.indexOf('"marketHealthHistoryDebt"') < marketViewSource.indexOf('"marketBorrowConcentration"'));
  assert.ok(marketViewSource.indexOf('"marketBorrowConcentration"') < marketViewSource.indexOf('"marketCollateralizedSupplyConcentration"'));
  const protocolDebtView = generator.match(/function renderProtocolDebtFlows\(\)[\s\S]*?function renderProtocolInterestFlows\(\)/)?.[0] || "";
  const protocolInterestView = generator.match(/function renderProtocolInterestFlows\(\)[\s\S]*?function renderProtocolStablecoinYields\(\)/)?.[0] || "";
  const protocolStablecoinYieldsView = generator.match(/function renderProtocolStablecoinYields\(\)[\s\S]*?function renderProtocolParticipation\(\)/)?.[0] || "";
  assert.match(protocolDebtView, /Ongoing days without debt repayments/);
  assert.ok(protocolDebtView.indexOf('"protocolDebtRolling"') < protocolDebtView.indexOf('"protocolDebtCoverage"'));
  assert.ok(protocolDebtView.indexOf('"protocolDebtCoverage"') < protocolDebtView.indexOf('"protocolDebtDaily"'));
  assert.ok(protocolDebtView.indexOf('"protocolDebtDaily"') < protocolDebtView.indexOf('"protocolDebtRepayment"'));
  assert.ok(protocolDebtView.indexOf('"protocolDebtRepayment"') < protocolDebtView.indexOf('"protocolRepaymentDrySpells"'));
  assert.ok(protocolDebtView.indexOf('"protocolRepaymentDrySpells"') < protocolDebtView.indexOf('"protocolDebtCumulative"'));
  assert.ok(protocolDebtView.indexOf('"protocolDebtCumulative"') < protocolDebtView.indexOf('"protocolDebtCumulativeGap"'));
  assert.ok(protocolDebtView.indexOf('"protocolDebtCumulativeGap"') < protocolDebtView.indexOf('"protocolDebtGap"'));
  assert.ok(protocolDebtView.indexOf('"protocolDebtGap"') < protocolDebtView.indexOf('"protocolDebtRepaymentDistribution"'));
  assert.match(generator, /chartId === "protocolDebtCoverage"[\s\S]{0,300}?debtCoverage7d[\s\S]{0,100}?debtCoverage30d[\s\S]{0,100}?debtCoverage90d/);
  assert.match(protocolInterestView, /class="kpis"/);
  assert.match(protocolInterestView, /Current-valued cumulative reported interest-flow difference/);
  assert.match(protocolInterestView, /Current-valued interest coverage · trailing 90d/);
  assert.match(protocolInterestView, /Ongoing days without interest repayments/);
  assert.ok(protocolInterestView.indexOf('"protocolInterestRolling"') < protocolInterestView.indexOf('"protocolInterestCoverage"'));
  assert.ok(protocolInterestView.indexOf('"protocolInterestCoverage"') < protocolInterestView.indexOf('"protocolInterestDaily"'));
  assert.ok(protocolInterestView.indexOf('"protocolInterestDaily"') < protocolInterestView.indexOf('"protocolInterestRepayment"'));
  assert.ok(protocolInterestView.indexOf('"protocolInterestRepayment"') < protocolInterestView.indexOf('"protocolInterestDrySpells"'));
  assert.ok(protocolInterestView.indexOf('"protocolInterestDrySpells"') < protocolInterestView.indexOf('"protocolInterestCumulative"'));
  assert.ok(protocolInterestView.indexOf('"protocolInterestCumulative"') < protocolInterestView.indexOf('"protocolInterestCumulativeGap"'));
  assert.ok(protocolInterestView.indexOf('"protocolInterestCumulativeGap"') < protocolInterestView.indexOf('"protocolInterestGap"'));
  assert.ok(protocolInterestView.indexOf('"protocolInterestGap"') < protocolInterestView.indexOf('"protocolInterestRepaymentDistribution"'));
  assert.match(protocolStablecoinYieldsView, /USD stablecoin yields/);
  assert.match(protocolStablecoinYieldsView, /Top USD stablecoin yield/);
  assert.match(protocolStablecoinYieldsView, /Supply-weighted USD stablecoin yield/);
  assert.match(protocolStablecoinYieldsView, /USD stablecoin supply APR over time/);
  assert.match(protocolStablecoinYieldsView, /USD stablecoin market comparison/);
  assert.match(generator, /function drawProtocolDebtCharts\(/);
  assert.match(generator, /function drawProtocolInterestCharts\(/);
  assert.match(generator, /function drawProtocolStablecoinYieldsCharts\(/);
  assert.match(generator, /chartId === "protocolStablecoinYields"/);
  assert.match(generator, /chartId === "protocolInterestCoverage"[\s\S]{0,300}?interestCoverage7d[\s\S]{0,100}?interestCoverage30d[\s\S]{0,100}?interestCoverage90d/);
  for (const appSource of [generator, html]) {
    const marketDebtView = appSource.match(/function renderMarketRepayments\(\)[\s\S]*?function renderMarketInterest\(\)/)?.[0] || "";
    assert.match(marketDebtView, /Debt coverage/);
    assert.doesNotMatch(marketDebtView, /Interest coverage/);
    assert.match(marketDebtView, /currentValuedGapKpi\("Current-valued cumulative debt-flow gap", latest\.cumulativeDebtGap, latest\.cumulativeDebtGapAsset, latest\.assetPriceInUsd, market\.symbol \|\| market\.marketId\)/);
    assert.match(marketDebtView, /Debt coverage operands · asset units/);
    assert.match(marketDebtView, /Debt coverage operands · current USD value/);
    for (const windowDays of [7, 30, 90]) {
      assert.match(marketDebtView, new RegExp(`coverageCell\\(coverage${windowDays}, "debtCoverageRatio", "debt", market\\.symbol \\|\\| market\\.marketId\\)`));
    }
    assert.match(marketDebtView, /kpi\("Outstanding borrow", usd\(market\.currentBorrowInUsd\)\)/);
    const firstKpiIdx = marketDebtView.indexOf('kpi("Outstanding borrow"');
    const gapKpiIdx = marketDebtView.indexOf('currentValuedGapKpi(');
    assert.ok(firstKpiIdx >= 0 && firstKpiIdx < gapKpiIdx, "Outstanding borrow KPI must be the first top stat in market debt flows");
    assert.match(marketDebtView, /Ongoing days without debt repayments/);
    assert.ok(marketDebtView.indexOf('"marketDebtCoverageOperandsAsset"') < marketDebtView.indexOf('"marketDebtCoverageOperandsUsd"'));
    assert.ok(marketDebtView.indexOf('"marketDebtCoverageOperandsUsd"') < marketDebtView.indexOf('"marketDebtCoverage"'));
    assert.ok(marketDebtView.indexOf('"marketDebtCoverage"') < marketDebtView.indexOf('"marketDebtRepayment"'));
    assert.ok(marketDebtView.indexOf('"marketDebtRepayment"') < marketDebtView.indexOf('"marketRepaymentEvents"'));
    assert.ok(marketDebtView.indexOf('"marketRepaymentEvents"') < marketDebtView.indexOf('"marketRepaymentDrySpells"'));
    assert.ok(marketDebtView.indexOf('"marketRepaymentDrySpells"') < marketDebtView.indexOf('"marketDebtCumulativeGapAsset"'));
    assert.ok(marketDebtView.indexOf('"marketDebtCumulativeGapAsset"') < marketDebtView.indexOf('"marketDebtCumulativeGap"'));
    assert.ok(marketDebtView.indexOf('"marketDebtCumulativeGap"') < marketDebtView.indexOf('"marketDebtGapAsset"'));
    assert.ok(marketDebtView.indexOf('"marketDebtGapAsset"') < marketDebtView.indexOf('"marketDebtGap"'));
    assert.ok(marketDebtView.indexOf('"marketDebtGap"') < marketDebtView.indexOf('"marketDebtRepaymentDistribution"'));

    const marketInterestView = appSource.match(/function renderMarketInterest\(\)[\s\S]*?function renderMarketRevenue\(\)/)?.[0] || "";
    assert.match(marketInterestView, /Interest coverage/);
    assert.doesNotMatch(marketInterestView, /Debt coverage/);
    assert.match(marketInterestView, /currentValuedGapKpi\("Current-valued cumulative interest gap", latest\.cumulativeInterestGap, latest\.cumulativeInterestGapAsset, latest\.assetPriceInUsd, market\.symbol \|\| market\.marketId\)/);
    assert.match(marketInterestView, /Interest coverage operands · asset units/);
    assert.match(marketInterestView, /Interest coverage operands · current USD value/);
    for (const windowDays of [7, 30, 90]) {
      assert.match(marketInterestView, new RegExp(`coverageCell\\(coverage${windowDays}, "coverageRatio", "interest", market\\.symbol \\|\\| market\\.marketId\\)`));
    }
    assert.match(marketInterestView, /Ongoing days without interest repayments/);
    assert.ok(marketInterestView.indexOf('"marketInterestCoverageOperandsAsset"') < marketInterestView.indexOf('"marketInterestCoverageOperandsUsd"'));
    assert.ok(marketInterestView.indexOf('"marketInterestCoverageOperandsUsd"') < marketInterestView.indexOf('"marketInterestCoverage"'));
    assert.ok(marketInterestView.indexOf('"marketInterestCoverage"') < marketInterestView.indexOf('"marketInterestDaily"'));
    assert.ok(marketInterestView.indexOf('"marketInterestDaily"') < marketInterestView.indexOf('"marketInterestDrySpells"'));
    assert.ok(marketInterestView.indexOf('"marketInterestDrySpells"') < marketInterestView.indexOf('"marketInterestRepaymentDistribution"'));
    assert.ok(marketInterestView.indexOf('"marketInterestRepaymentDistribution"') < marketInterestView.indexOf('"marketInterestCumulative"'));
    assert.ok(marketInterestView.indexOf('"marketInterestCumulative"') < marketInterestView.indexOf('"marketInterestCumulativeGapAsset"'));
    assert.ok(marketInterestView.indexOf('"marketInterestCumulativeGapAsset"') < marketInterestView.indexOf('"marketInterestCumulativeGap"'));
  assert.ok(marketInterestView.indexOf('"marketInterestCumulativeGap"') < marketInterestView.indexOf('"marketInterestGapAsset"'));
  assert.ok(marketInterestView.indexOf('"marketInterestGapAsset"') < marketInterestView.indexOf('"marketInterestGap"'));
  }

  const marketRevenueView = generator.match(/function renderMarketRevenue\(\)[\s\S]*?function renderMarketHealth\(\)/)?.[0] || "";
  assert.match(marketRevenueView, /collected, what accrued, and what current borrowing implies/i);
  assert.match(marketRevenueView, /metricPeriodGroup\("Year-to-date collected market revenue"/);
  assert.match(marketRevenueView, /kpi\("YTD attributed collected revenue"/);
  assert.match(marketRevenueView, /kpi\("Attributed interest revenue collected"/);
  assert.match(marketRevenueView, /kpi\("Market origination fees collected"/);
  assert.match(marketRevenueView, /metricPeriodGroup\("Directly observed origination revenue"/);
  assert.match(marketRevenueView, /kpi\("Trailing 90-day origination revenue", usd\(market\.collectedOriginationRevenue90dInUsd\)/);
  assert.match(marketRevenueView, /kpi\("All-time origination revenue", usd\(market\.collectedOriginationRevenueInUsd\)/);
  assert.match(marketRevenueView, /"Daily attributed collected revenue", "marketAttributedCollectedRevenueDaily"/);
  assert.match(marketRevenueView, /"Monthly attributed collected revenue", "marketAttributedCollectedRevenueMonthly"/);
  assert.match(marketRevenueView, /metricPeriodGroup\("Year-to-date accrued interest allocation"/);
  assert.match(marketRevenueView, /kpi\("Accrued protocol\/reserve interest revenue"/);
  assert.match(marketRevenueView, /kpi\("Accrued supplier interest income"/);
  assert.match(marketRevenueView, /"Daily accrued interest allocation", "marketAccruedInterestAllocationDaily"/);
  assert.match(marketRevenueView, /"Monthly accrued interest allocation", "marketAccruedInterestAllocationMonthly"/);
  assert.match(marketRevenueView, /metricPeriodGroup\("Current annualized interest run rate"/);
  assert.match(marketRevenueView, /kpi\("Annualized protocol\/reserve interest revenue"/);
  assert.match(marketRevenueView, /"Projected annualized interest income", "marketProjectedAnnualizedInterestIncome"/);
  assert.match(marketRevenueView, /metricPeriodGroup\("Interest repayments - not revenue"/);
  assert.match(marketRevenueView, /kpi\("YTD interest repaid activity", usd\(market\.ytdInterestRepaidActivityInUsd\)/);
  assert.match(marketRevenueView, /"Monthly interest repayments \(not revenue\)", "marketInterestRepaymentActivityMonthly"/);
  assert.doesNotMatch(marketRevenueView, /retained-interest amount remains unavailable/);
  assert.doesNotMatch(marketRevenueView, /Gross realized fee flow|liquidation/i);

  for (const boxplotId of [
    "protocolDebtRepaymentDistribution",
    "protocolInterestRepaymentDistribution",
    "marketDebtRepaymentDistribution",
    "marketInterestRepaymentDistribution"
  ]) {
    assert.match(generator, new RegExp(`chartId === "${boxplotId}"[\\s\\S]{0,500}?renderInteractiveBoxplotChart`), `${boxplotId} must be rendered with renderInteractiveBoxplotChart`);
  }

  const revenueView = generator.match(/function renderRevenue\(\)[\s\S]*?function renderLiquidations\(\)/)?.[0] || "";
  assert.match(revenueView, /metricPeriodGroup\("Year-to-date collected revenue", ytdCollectionPeriod/);
  assert.match(revenueView, /kpi\("YTD collected revenue", usd\(summary\.ytdCollectedRevenueInUsd\)/);
  assert.match(revenueView, /kpi\("Revenue from repaid interest", usd\(summary\.ytdCollectedInterestRevenueInUsd\)/);
  assert.match(revenueView, /kpi\("Loan origination fees", usd\(summary\.ytdCollectedOriginationRevenueInUsd\)/);
  assert.match(revenueView, /kpi\("Top revenue market", topMarketName, topMarketNote\)/);
  assert.match(revenueView, /chartSection\("Collected revenue"/);
  assert.match(revenueView, /kpi\("Collected revenue"/);
  assert.match(revenueView, /kpi\("Interest revenue collected"/);
  assert.match(revenueView, /kpi\("Origination fees collected"/);
  assert.match(revenueView, /periodLabel\(summary\.collectedCoverageFromDate, summary\.collectedCoverageToDate\)/);
  assert.match(revenueView, /"Daily collected revenue"/);
  assert.match(revenueView, /"Monthly collected revenue"/);
  assert.match(revenueView, /interactiveBreakdownPanel\("Market YTD revenue contribution",\s*"protocolMarketRevenueContributionYtd"/);
  assert.doesNotMatch(revenueView, /liquidationProfit/i);
  assert.match(revenueView, /metricPeriodGroup\("All-time collected revenue"/);
  assert.match(revenueView, /metricPeriodGroup\("Cumulative accrued DAO allocation"/);
  assert.match(revenueView, /metricPeriodGroup\("Cumulative accrued LQ-staker allocation"/);
  assert.match(revenueView, /metricPeriodGroup\("Recent DAO run rate"/);
  assert.doesNotMatch(revenueView, /kpi\("Revenue · trailing 90d"/);
  assert.match(revenueView, /kpi\("Annualized run rate", usd\(summary\.allocatedProtocolRevenueAnnualizedRunRateInUsd\)/);
  assert.match(revenueView, /"Trailing 90-day revenue: " \+ usd\(summary\.allocatedProtocolRevenueTrailing90DaysInUsd\)/);
  assert.doesNotMatch(revenueView, /Trailing 90-day revenue: \\?\$\{/);
  assert.doesNotMatch(revenueView, /365\.25\s*\/\s*90/);
  assert.doesNotMatch(revenueView, /kpi\("Daily allocation coverage"/);
  assert.match(revenueView, /periodLabel\(\s*summary\.cumulativeAllocationFromDate,\s*summary\.cumulativeAllocationToDate\s*\)/);
  assert.match(revenueView, /integer\(summary\.completeAllocationDays\).*complete days/);
  const runRateIdx = revenueView.indexOf('"Historical annualized DAO revenue run rate"');
  const ytdCollectedGroupIdx = revenueView.indexOf('metricPeriodGroup("Year-to-date collected revenue"');
  const allTimeCollectedGroupIdx = revenueView.indexOf('metricPeriodGroup("All-time collected revenue"');
  const collectedSectionIdx = revenueView.indexOf('chartSection("Collected revenue"');
  const collectedDailyIdx = revenueView.indexOf('"Daily collected revenue"');
  const collectedMonthlyIdx = revenueView.indexOf('"Monthly collected revenue"');
  const marketContributionIdx = revenueView.indexOf('"Market YTD revenue contribution"');
  const daoSectionIdx = revenueView.indexOf('chartSection("Accrued DAO revenue"');
  const daoMonthlyIdx = revenueView.indexOf('"Monthly DAO revenue allocation"');
  const daoDailyIdx = revenueView.indexOf('"Daily DAO revenue allocation"');
  const stakerSectionIdx = revenueView.indexOf('chartSection("LQ-staker revenue"');
  const stakerMonthlyIdx = revenueView.indexOf('"Monthly LQ-staker revenue allocation"');
  const stakerDailyIdx = revenueView.indexOf('"Daily LQ-staker revenue allocation"');
  assert.ok(
    ytdCollectedGroupIdx >= 0
      && allTimeCollectedGroupIdx > ytdCollectedGroupIdx
      && collectedSectionIdx > allTimeCollectedGroupIdx
      && collectedDailyIdx > collectedSectionIdx
      && collectedMonthlyIdx > collectedDailyIdx
      && marketContributionIdx > collectedMonthlyIdx
      && daoSectionIdx > marketContributionIdx
      && runRateIdx > daoSectionIdx
      && daoMonthlyIdx > runRateIdx
      && daoDailyIdx > daoMonthlyIdx
      && stakerSectionIdx > daoDailyIdx
      && stakerMonthlyIdx > stakerSectionIdx
      && stakerDailyIdx > stakerMonthlyIdx,
    "Revenue charts must place collected revenue first, then DAO accruals, then the separate LQ-staker section"
  );

  const liquidationViewWithPeriod = generator.match(/function renderLiquidations\(\)[\s\S]*?function renderCurrentExposure\(\)/)?.[0] || "";
  assert.match(liquidationViewWithPeriod, /periodLabel\(fullPeriod\.fromDate, fullPeriod\.toDate\)/);
  assert.match(liquidationViewWithPeriod, /metricPeriodGroup\("Full observable liquidation period"/);

  const protocolOverviewView = generator.match(/function renderOverview\(\)[\s\S]*?function renderProtocolDebtFlows\(\)/)?.[0] || "";
  assert.match(protocolOverviewView, /Protocol liquidity/);
  assert.match(protocolOverviewView, /Supply-side visibility/);
  assert.match(protocolOverviewView, /exposureSupplyComposition/);
  assert.match(protocolOverviewView, /exposureSupplyConcentration/);
  assert.match(protocolOverviewView, /drawLiquidityCharts\(\)/);
  assert.doesNotMatch(protocolOverviewView, /Current-valued interest gap|Active-debt positions|Min health factor/);

  const protocolParticipationView = generator.match(/function renderProtocolParticipation\(\)[\s\S]*?function renderRevenue\(\)/)?.[0] || "";
  const impactView = generator.match(/function renderImpact\(\)[\s\S]*?function chartSection\(/)?.[0] || "";
  assert.match(protocolParticipationView, /participation and concentration/i);
  assert.match(protocolParticipationView, /Active-debt positions/);
  assert.match(protocolParticipationView, /Observed keys with active debt/);
  assert.match(protocolParticipationView, /exposureMarketKeyDependence/);
  assert.match(protocolParticipationView, /impactBorrowConcentrationComparison/);
  assert.match(protocolParticipationView, /impactCollateralizedSupplyConcentrationComparison/);
  assert.doesNotMatch(impactView, /impactBorrowConcentrationComparison|impactCollateralizedSupplyConcentrationComparison|Cross-market observed-key concentration/);
  assert.match(impactView, /Highest utilization pressure/);
  assert.match(impactView, /Highest debt at risk \(HF < 1\.0\)/);
  assert.match(impactView, /Highest bad debt/);
  assert.match(impactView, /Highest 30d liquidation volume/);
  assert.doesNotMatch(impactView, /Liquidation-profit and repayment timing/);

  const protocolLqTokenView = generator.match(/function renderProtocolLqToken\(\)[\s\S]*?function renderRevenue\(\)/)?.[0] || "";
  assert.match(protocolLqTokenView, /LQ token & staking/i);
  assert.match(protocolLqTokenView, /LQ Price/);
  assert.match(protocolLqTokenView, /Staked LQ \/ Staking Ratio/);
  assert.match(protocolLqTokenView, /Total Staked Value/);
  assert.match(protocolLqTokenView, /DAO Treasury LQ/);
  assert.match(protocolLqTokenView, /protocolLqPrice/);
  assert.match(protocolLqTokenView, /protocolLqStaking/);
  assert.match(protocolLqTokenView, /protocolLqTreasury/);

  const marketHealthView = generator.match(/function renderMarketHealth\(\)[\s\S]*?function renderMarketParticipation\(\)/)?.[0] || "";
  const marketParticipationView = generator.match(/function renderMarketParticipation\(\)[\s\S]*?function renderImpact\(\)/)?.[0] || "";
  assert.match(marketHealthView, /marketHealthHistoryDebt/);
  assert.doesNotMatch(marketHealthView, /marketBorrowConcentration|marketCollateralizedSupplyConcentration|health and concentration/i);
  const healthKpiSections = marketHealthView.match(/<div class="kpis">[\s\S]*?<\/div>/g) || [];
  assert.equal(healthKpiSections.length, 4, "Market Health stats must include 3 top organic sections and 1 conditional POL section");
  assert.match(healthKpiSections[0], /Active-debt positions/);
  assert.match(healthKpiSections[0], /Active-loan debt/);
  assert.doesNotMatch(healthKpiSections[0], /Debt at HF < 1\.0|Bad-debt positions/);
  assert.match(healthKpiSections[1], /Debt at HF < 1\.0/);
  assert.match(healthKpiSections[1], /Critical debt at HF <= 1\.10/);
  assert.match(healthKpiSections[1], /Debt at HF <= 1\.25/);
  assert.doesNotMatch(healthKpiSections[1], /Active-debt positions|Bad-debt positions/);
  assert.match(healthKpiSections[2], /Bad-debt positions/);
  assert.match(healthKpiSections[2], /Sum of bad debt/);
  assert.match(healthKpiSections[2], /Minimum health factor/);
  assert.doesNotMatch(healthKpiSections[2], /Active-debt positions|Debt at HF < 1\.0/);
  assert.match(healthKpiSections[3], /Market POL debt/);
  assert.match(healthKpiSections[3], /Locked qPOL collateral/);
  assert.match(healthKpiSections[3], /Nominal LTV vs Health Factor/);
  assert.match(healthKpiSections[3], /Liquidation status/);
  assert.match(marketParticipationView, /participation and concentration/i);
  assert.match(marketParticipationView, /kpi\("Active-debt positions", integer\(market\.activeDebtLoanCount\)/);
  assert.match(
    marketParticipationView,
    /kpi\("Observed keys with active debt", integer\(marketDependence\?\.observedKeyCount\), "Distinct API-observed keys across current positions with debt only"\)/
  );
  assert.match(marketParticipationView, /kpi\("Top 1 key concentration", pct\(top1Share\)/);
  assert.match(marketParticipationView, /kpi\("Top 3 key concentration", pct\(top3Share\)/);
  assert.match(marketParticipationView, /marketKeyDependence/);
  assert.match(marketParticipationView, /marketBorrowConcentration/);
  assert.match(marketParticipationView, /marketCollateralizedSupplyConcentration/);
  const healthChartRenderer = generator.match(/function drawMarketHealthChart\(\)[\s\S]*?function drawMarketBorrowConcentration\(\)/)?.[0] || "";
  assert.match(healthChartRenderer, /rows:\s*buckets\.map/);
  assert.match(healthChartRenderer, /categoryKey:\s*"label"/);
  assert.match(healthChartRenderer, /key:\s*"debtInUsd"/);
  assert.doesNotMatch(healthChartRenderer, /categoryKey:\s*"scope"|mode:\s*"stacked"/);

  const impactChartRenderer = generator.match(/function drawImpactBreakdownCharts\(\)[\s\S]*?function requestDataFetch\(\)/)?.[0] || "";
  assert.equal((impactChartRenderer.match(/renderInteractiveMatrixChart\(/g) || []).length, 1);
  for (const field of ["utilizationStress", "liquidityStress", "interestCoverageStress", "borrowGrowthStress", "loanHealthPressure"]) {
    assert.ok(impactChartRenderer.includes(field), `consolidated impact matrix is missing ${field}`);
  }
  assert.ok(!impactChartRenderer.includes("combinedCurrentStressScore"), "composite stress score column must be removed from impact matrix");
  assert.match(impactChartRenderer, /legendAlign:\s*"left"/);
  assert.match(impactChartRenderer, /legendPosition:\s*"top"/);

  const exposureViewForLayout = generator.match(/function renderCurrentExposure\(\)[\s\S]*?function renderMarketOverview\(\)/)?.[0] || "";
  assert.match(exposureViewForLayout, /Min health factor/);
  assert.doesNotMatch(exposureViewForLayout, /Supply-side visibility/);
  for (const [name, viewSource, finalChartId] of [
    ["Exposure", exposureViewForLayout, "exposureLowHfConcentrationSensitivity"],
    ["Market impact", impactView, "impactLoanState"]
  ]) {
    const finalChart = viewSource.lastIndexOf(`"${finalChartId}"`);
    const dataTables = viewSource.indexOf("dataTablesSection(");
    assert.ok(finalChart >= 0 && dataTables > finalChart, `${name} tables must follow every chart`);
    assert.doesNotMatch(viewSource.slice(0, finalChart), /\$\{(?:scrollTable|table)\(/, `${name} tables must not interrupt charts`);
  }
  assert.match(html, /function renderActiveView/);
  assert.match(html, /renderedViews\.has\(activeView\)/);
  assert.match(html, /window\.scrollTo\(\{ top: document\.querySelector\("main"\)\?\.offsetTop \|\| 0, behavior: "auto" \}\)/);
  assert.match(html, /chartWheelShouldZoom/);
  assert.match(html, /touch-action:\s*pan-y/);
  assert.match(html, /Use Left and Right Arrow to inspect exact values/);
  assert.doesNotMatch(html, /<script[^>]+src=[^>]*(?:chart\.js|plotly|d3)/i);
  assert.match(html, /1\.5-day EWMA/);
  assert.match(html, /30-day average/);
  assert.match(html, /Ongoing days without debt repayments/);
  assert.match(html, /Debt accrued and repaid/);
  assert.match(html, /Daily DAO revenue allocation/);
  assert.match(html, /Monthly DAO revenue allocation/);
  assert.match(html, /Daily LQ-staker revenue allocation/);
  assert.match(html, /Monthly LQ-staker revenue allocation/);
  assert.match(html, /chartId === "protocolDaoRevenueAllocationMonthly"[\s\S]{0,300}?calendarPeriod: "month"/);
  assert.match(html, /chartId === "protocolStakerRevenueAllocationMonthly"[\s\S]{0,300}?calendarPeriod: "month"/);
  assert.match(html, /chartObservationLabel\(row, state\.calendarPeriod\)/);
  assert.match(html, /Historical annualized DAO revenue run rate/);
  assert.match(html, /latest 90 consecutive complete UTC days/i);
  assert.match(html, /current UTC day is excluded until closed/i);
  assert.doesNotMatch(html, /latest three consecutive complete calendar months/i);
  for (const source of [html, generator]) {
    assert.doesNotMatch(source, /Protocol-revenue equivalent|Annualized protocol-revenue yield/);
    assert.doesNotMatch(source, /estimatedProtocolRevenue|currentParameterProtocolInterestShare|grossAccruedRevenueProxy/);
    assert.doesNotMatch(source, /Official DAO revenue · market level|Gross realized fee flow/);
    assert.match(source, /Attributed interest revenue collected/);
    assert.match(source, /parameter-weighted market repayment/i);
    assert.match(source, /Accrued protocol\/reserve interest revenue/);
    assert.match(source, /interest repayments \(not revenue\)/i);
  }
  assert.match(html, /Protocol participation/);
  assert.match(html, /Active-debt positions over saved observations/);
  assert.match(html, /Distinct observed keys with active debt/);
  assert.match(html, /market.*participation/i);
  assert.match(html, /loanSnapshotHistory/);
  for (const [chartId, scope] of [["protocolParticipationLoans", "protocol"], ["marketParticipationLoans", "market"]]) {
    assert.match(generator, new RegExp(`chartId === "${chartId}"[\\s\\S]{0,260}?loanSnapshotRows\\("health", "${scope}"[\\s\\S]{0,260}?key: "activeDebtLoanCount"`));
  }
  for (const [chartId, scope] of [["protocolParticipationKeys", "protocol"], ["marketParticipationKeys", "market"]]) {
    assert.match(generator, new RegExp(`chartId === "${chartId}"[\\s\\S]{0,300}?loanSnapshotRows\\("participation", "${scope}"[\\s\\S]{0,300}?key: "distinctActiveDebtObservedKeyCount"`));
  }
  const marketConcentrationRenderers = generator.match(/function drawMarketBorrowConcentration\(\)[\s\S]*?function drawLiquidationCharts\(/)?.[0] || "";
  const protocolConcentrationRenderers = generator.match(/function drawProtocolConcentrationCharts\(\)[\s\S]*?function drawImpactBreakdownCharts\(\)/)?.[0] || "";
  assert.match(marketConcentrationRenderers, /marketBorrowConcentration[\s\S]*?borrowerConcentration\?\.marketCumulativeConcentration/);
  assert.match(protocolConcentrationRenderers, /marketCumulativeConcentration[\s\S]*?impactBorrowConcentrationComparison/);
  assert.match(marketConcentrationRenderers, /marketCollateralizedSupplyConcentration[\s\S]*?supplySide\?\.marketCumulativeConcentration/);
  assert.match(protocolConcentrationRenderers, /supplySide\?\.marketCumulativeConcentration[\s\S]*?impactCollateralizedSupplyConcentrationComparison/);
  assert.match(html, /Active-debt state by market/);
  assert.doesNotMatch(html, /Active-loan state by market/);
  assert.match(html, /analytics\.fees/);
  assert.match(html, /DAO interest/);
  assert.match(html, /LQ stakers origination/);
  assert.match(html, /stackMode: "value"/);
  assert.doesNotMatch(html, /Daily realized protocol revenue/);
  const liquidationViews = [generator, html].map((source) => (
    source.match(/function renderLiquidations\(\)\s*\{[\s\S]*?function renderCurrentExposure\(\)/)?.[0] || ""
  ));
  for (const liquidationView of liquidationViews) {
    assert.match(liquidationView, /kpi\("Full-period liquidation profit", usdDetailed\(/);
    assert.match(liquidationView, /kpi\("Current days without liquidations", integer\(/);
    assert.match(liquidationView, /metricPeriodGroup\("Full observable liquidation period", periodLabel\(fullPeriod\.fromDate, fullPeriod\.toDate\), "", `\s*\$\{kpi\("Full-period liquidation profit", usdDetailed\(fullPeriodProfit\)\)\}\s*\$\{kpi\("Current days without liquidations", integer\(liquidation\.currentDaysWithoutLiquidations\)\)\}/);
    for (const processStat of ["Daily view", "Daily API rows", "Monthly-zero days", "Missing days", "Reconciliation failures"]) {
      assert.ok(!liquidationView.includes(processStat), `Liquidations must not expose process stat: ${processStat}`);
    }
    assert.doesNotMatch(liquidationView, /Daily EWMA view (?:complete|incomplete)/);
  }
  const detailedUsdSource = html.match(/function usdDetailed\(value\) \{[\s\S]*?\n    \}/)?.[0];
  const displayNumberSource = html.match(/function displayNumber\(value\) \{[\s\S]*?\n    \}/)?.[0];
  assert.ok(detailedUsdSource && displayNumberSource, "standalone app must include its detailed USD formatter");
  const formatDetailedUsd = Function(`${detailedUsdSource}\n${displayNumberSource}\nreturn usdDetailed;`)();
  assert.equal(formatDetailedUsd(1_234_567), "$1.235M");
  assert.equal(formatDetailedUsd(12_345_678), "$12.35M");
  const liquidationChartSources = [generator, html].map((source) => (
    source.match(/function drawLiquidationTimeChart\([\s\S]*?function drawExposureCharts\(/)?.[0] || ""
  ));
  for (const liquidationChartSource of liquidationChartSources) {
    const monthlyLiquidationCall = liquidationChartSource.match(/lineChart\(container,\s*source,\s*\[[\s\S]*?\], usdDetailed,\s*\{[^}]*calendarPeriod:\s*"month"[^}]*\}\);/)?.[0] || "";
    assert.match(
      monthlyLiquidationCall,
      /calendarPeriod: "month"/,
      "monthly liquidation hover labels must use month names and incomplete-month status"
    );
    assert.doesNotMatch(
      monthlyLiquidationCall,
      /Incomplete period/,
      "monthly liquidation profit chart must not include separate Incomplete period series or legend item"
    );
  }
  const liquidationChartSource = liquidationChartSources[1];
  assert.equal(
    liquidationChartSource.match(/\], usdDetailed,/g)?.length,
    2,
    "monthly and daily liquidation USD stats must use detailed million-plus formatting"
  );
  const exposureViews = [generator, html].map((source) => (
    source.match(/function renderCurrentExposure\(\)\s*\{[\s\S]*?function renderMarketOverview\(\)/)?.[0] || ""
  ));
  for (const exposureView of exposureViews) {
    const debtHeading = exposureView.indexOf("Debt exposure");
    const coverageHeading = exposureView.indexOf("Debt and interest coverage");
    const assetHeading = exposureView.indexOf("Asset highlights");
    assert.ok(debtHeading >= 0 && debtHeading < assetHeading && assetHeading < coverageHeading);
    const debtSummary = exposureView.slice(debtHeading, assetHeading);
    const belowHf10DebtStat = debtSummary.indexOf('kpi("Debt below HF 1.0"');
    const criticalDebtStat = debtSummary.indexOf('kpi("Debt at critical health"');
    const nearLiquidationDebtStat = debtSummary.indexOf('kpi("Debt near liquidation"');
    const badDebtStat = debtSummary.indexOf('kpi("Bad debt"');
    assert.ok(
      belowHf10DebtStat >= 0 && belowHf10DebtStat < criticalDebtStat && criticalDebtStat < nearLiquidationDebtStat && nearLiquidationDebtStat < badDebtStat,
      "Debt below HF 1.0 must be the left-most stat card, followed by critical health, near liquidation, and bad debt stat card below"
    );
    assert.doesNotMatch(exposureView, /kpi\("Observed-key debt near liquidation"/);
    assert.match(exposureView, /top 3 observed keys at HF <= 1\.25/);
    assert.match(exposureView, /top 3 observed keys at HF <= 1\.10/);
    assert.match(exposureView, /top 3 observed keys at HF <= 1\.00/);
    assert.doesNotMatch(exposureView, /Observed-key debt at HF <= 1\.10/);
    assert.doesNotMatch(exposureView, /exposureCoverageWindows/);
    for (const windowDays of [7, 30, 90]) {
      assert.match(exposureView, new RegExp(`coverageCell\\(coverage${windowDays}, "coverageRatio"`));
      assert.match(exposureView, new RegExp(`coverageCell\\(coverage${windowDays}, "debtCoverageRatio"`));
    }
    assert.match(exposureView, /Borrowed asset with highest bad debt/);
    assert.match(exposureView, /Collateral asset with linked highest bad debt/);
    assert.match(exposureView, /Borrowed asset under most pressure/);
    assert.match(exposureView, /Largest critical collateral/);
    assert.match(exposureView, /Largest near-liquidation collateral/);
    const assetHighlightsIndex = exposureView.indexOf("Asset highlights");
    const coverageIndex = exposureView.indexOf("Debt and interest coverage");
    const assetSection = exposureView.slice(assetHighlightsIndex, coverageIndex);
    const borrowedBadDebtPos = assetSection.indexOf('kpi("Borrowed asset with highest bad debt"');
    const collateralBadDebtPos = assetSection.indexOf('kpi("Collateral asset with linked highest bad debt"');
    const pressurePos = assetSection.indexOf('kpi("Borrowed asset under most pressure"');
    const criticalPos = assetSection.indexOf('kpi("Largest critical collateral"');
    const nearLiquidationPos = assetSection.indexOf('kpi("Largest near-liquidation collateral"');
    assert.ok(
      borrowedBadDebtPos >= 0 && borrowedBadDebtPos < collateralBadDebtPos && collateralBadDebtPos < pressurePos && pressurePos < criticalPos && criticalPos < nearLiquidationPos,
      "Asset highlights stat cards must be ordered: Borrowed asset with highest bad debt, Collateral asset with linked highest bad debt, Borrowed asset under most pressure, Largest critical collateral, Largest near-liquidation collateral"
    );
    assert.doesNotMatch(exposureView, /Most key-dependent borrowed asset/);
    assert.doesNotMatch(exposureView, /"exposureMarketKeyDependence"/);
    assert.ok(exposureView.indexOf('"exposureHealthHistoryDebt"') < exposureView.indexOf('"exposureBadDebtHistory"') && exposureView.indexOf('"exposureBadDebtHistory"') < exposureView.indexOf('"exposureMarketPressure"'), "exposureHealthHistoryDebt and exposureBadDebtHistory must be placed near the top before market pressure");
  }
  assert.doesNotMatch(generator, /Adaptive threshold|Classified spike/);
  assert.doesNotMatch(html, /repaymentEventPeakInUsd|Detected event peak/);
  assert.doesNotMatch(html, /Repayment spikes \/ year|Repayment-spike frequency/);
  assert.doesNotMatch(productionSource, /impactRepaymentAnomalies|Repayment-anomaly contributions|20_market_repayment_anomaly_contributions|plot_repayment_anomaly_contributions|repayment_anomaly_contribution_result/);

  for (const chartId of [
    "protocolParticipationLoans", "protocolParticipationKeys", "protocolHealthHistoryCounts", "protocolHealthHistoryDebt",
    "protocolCapital", "protocolUtilization", "protocolDebtRepayment", "protocolRepaymentDrySpells", "protocolDebtDaily", "protocolDebtRolling", "protocolDebtCumulative", "protocolDebtCumulativeGap", "protocolDebtGap", "protocolDebtCoverage", "protocolInterestDaily",
    "protocolInterestRolling", "protocolInterestCoverage", "protocolInterestDaily", "protocolInterestRepayment", "protocolInterestDrySpells", "protocolInterestCumulative", "protocolInterestCumulativeGap", "protocolInterestGap", "protocolCollectedRevenueDaily", "protocolCollectedRevenueMonthly", "protocolDaoRevenueAllocationDaily", "protocolDaoRevenueAllocationMonthly", "protocolStakerRevenueAllocationDaily", "protocolStakerRevenueAllocationMonthly", "protocolRevenueRunRate",
    "protocolLqPrice", "protocolLqStaking", "protocolLqTreasury",
    "liquidationMonthly", "liquidationDaily", "liquidationDrySpell",
    "exposureMarketPressure", "exposureFlowComparison", "exposureBorrowedMarkets", "exposureCollateralBands",
    "exposureCollateralShock", "exposureLiquidatableDebt", "exposureLiquidatableMarkets", "exposureObservedKeyRanking", "exposureMarketKeyDependence",
    "exposureHealthHistoryDebt", "exposureBadDebtHistory", "exposureLowHfConcentrationSensitivity", "exposureSupplyComposition", "exposureSupplyConcentration",
    "marketParticipationLoans", "marketParticipationKeys", "marketHealthHistoryCounts", "marketHealthHistoryDebt",
    "marketCapital", "marketUtilization", "marketDebtRepayment", "marketDebtCoverageOperandsAsset", "marketDebtCoverageOperandsUsd", "marketDebtCoverage", "marketDebtGapAsset", "marketDebtGap", "marketDebtCumulativeGapAsset", "marketDebtCumulativeGap", "marketRepaymentEvents", "marketRepaymentDrySpells", "marketDebtRepaymentDistribution", "marketInterestDaily",
    "marketInterestCoverageOperandsAsset", "marketInterestCoverageOperandsUsd", "marketInterestCumulative", "marketInterestCumulativeGapAsset", "marketInterestCumulativeGap", "marketInterestGapAsset", "marketInterestGap", "marketInterestCoverage", "marketInterestDrySpells", "marketInterestRepaymentDistribution", "marketRates", "marketLiquidityPressure",
    "marketAttributedCollectedRevenueDaily", "marketAttributedCollectedRevenueMonthly", "marketAccruedInterestAllocationDaily", "marketAccruedInterestAllocationMonthly", "marketProjectedAnnualizedInterestIncome", "marketInterestRepaymentActivityMonthly", "marketHealthBuckets", "marketBorrowConcentration", "marketCollateralizedSupplyConcentration",
    "marketParameterRateCurve", "marketParameterBorrowRates", "marketParameterSupplyRates", "marketParameterUtilizationLimits", "marketParameterSupplyCap", "marketParameterIncomeAllocation", "marketParameterModelCoefficients",
    "impactRiskRanking", "impactMarketMap", "impactBorrowConcentrationComparison", "impactCollateralizedSupplyConcentrationComparison",
    "impactInterestContributions", "impactGapContributions",
    "impactInterestRepaymentContributions", "impactDebtContributions", "impactRepaymentContributions", "impactDebtGapContributions",
    "impactCurrentContributions", "impactLoanState"
  ]) {
    const panelPattern = new RegExp(`(?:interactiveChartPanel|interactiveBreakdownPanel)\\([^\\n]*"${chartId}"`);
    assert.match(html, panelPattern, `standalone app is missing interactive chart ${chartId}`);
  }
  assert.match(generator, /chartId:\s*"marketParameterRateCurve"[\s\S]{0,1000}?fixedXDomain:\s*\{\s*min:\s*0,\s*max:\s*1\s*\}/);
  assert.match(generator, /chartId:\s*"marketParameterRateCurve"[\s\S]{0,1400}?xReferenceLines:/);
  assert.match(generator, /chartId === "marketDebtCumulativeGap"[\s\S]{0,260}?key: "cumulativeDebtGap"[\s\S]{0,260}?value: 0[\s\S]{0,160}?Zero reported flow difference/);
  assert.match(generator, /chartId === "marketDebtCumulativeGapAsset"[\s\S]{0,260}?key: "cumulativeDebtGapAsset"/);
  assert.match(generator, /chartId === "marketDebtCoverageOperandsAsset"[\s\S]{0,260}?debtAccruedAsset30d[\s\S]{0,200}?debtRepaidAsset30d/);
  assert.match(generator, /chartId === "marketDebtCoverageOperandsUsd"[\s\S]{0,260}?debtAccrued30d[\s\S]{0,200}?debtRepaid30d/);
  assert.match(generator, /chartId === "marketInterestCoverageOperandsAsset"[\s\S]{0,260}?interestAccruedAsset30d[\s\S]{0,200}?interestRepaidAsset30d/);
  assert.match(generator, /chartId === "marketInterestCoverageOperandsUsd"[\s\S]{0,260}?interestAccrued30d[\s\S]{0,200}?interestRepaid30d/);
  assert.match(generator, /function coverageCell\(row, ratioKey, family, symbol = ""\)[\s\S]{0,900}?assetAmount[\s\S]{0,900}?current USD/);
  assert.match(generator, /function currentValuedGapKpi\(label, valueInUsd, nativeValue, priceInUsd, symbol\)[\s\S]{0,500}?Native gap:[\s\S]{0,500}?Price used:/);
  assert.match(generator, /chartId === "marketDebtGapAsset"[\s\S]{0,300}?dailyDebtGapAsset[\s\S]{0,300}?debtGapAsset30d/);
  assert.match(generator, /chartId === "marketInterestCumulativeGapAsset"[\s\S]{0,260}?key: "cumulativeInterestGapAsset"/);
  assert.match(generator, /chartId === "marketInterestGapAsset"[\s\S]{0,300}?dailyInterestGapAsset[\s\S]{0,300}?interestGapAsset30d/);
  assert.match(generator, /positive-gap", "interestGap30d", \{ window: 1, positiveOnly: true, enriched: true \}/);
  assert.match(generator, /positive-debt-gap"[\s\S]{0,220}?"debtGap30d", \{ window: 1/);
  assert.match(generator, /chartId === "protocolRepaymentDrySpells"[\s\S]{0,260}?debtRepaymentDrySpellDays[\s\S]{0,200}?Days without debt repayment/);
  assert.match(generator, /chartId === "marketRepaymentDrySpells"[\s\S]{0,260}?debtRepaymentDrySpellDays[\s\S]{0,200}?Days without debt repayment/);
  assert.match(generator, /chartId === "protocolInterestDrySpells"[\s\S]{0,260}?interestRepaymentDrySpellDays[\s\S]{0,200}?Days without interest repayment/);
  assert.match(generator, /chartId === "marketInterestDrySpells"[\s\S]{0,260}?interestRepaymentDrySpellDays[\s\S]{0,200}?Days without interest repayment/);
  const protocolInterestDrySpellsBlock = generator.match(/if\s*\(chartId === "protocolInterestDrySpells"\)\s*\{[\s\S]*?\n\s*\}/)?.[0] || "";
  assert.ok(protocolInterestDrySpellsBlock.includes("interestRepaidInUsd"), "protocolInterestDrySpells must use interestRepaidInUsd");
  assert.ok(!protocolInterestDrySpellsBlock.includes("debtRepaidInUsd"), "protocolInterestDrySpells must not include debtRepaidInUsd");
  assert.ok(!protocolInterestDrySpellsBlock.includes("debtRepaymentDrySpellDays"), "protocolInterestDrySpells must not include debtRepaymentDrySpellDays");
  assert.match(html, /calculated in each market's asset units before USD valuation/i);
  assert.doesNotMatch(html, /interactiveBreakdownPanel\([^\n]*"exposureCoverageWindows"/);
  assert.doesNotMatch(html, /interactiveBreakdownPanel\([^\n]*"impactStressMatrix"/);
  assert.doesNotMatch(html, /interactiveBreakdownPanel\([^\n]*"impactStressContributors"/);
  assert.doesNotMatch(html, /interactiveChartPanel\([^\n]*"impactStressIndex"/);
  assert.doesNotMatch(html, /interactiveChartPanel\([^\n]*"impactStressContributions"/);
  assert.doesNotMatch(html, /Market stress contributions/);
  assert.doesNotMatch(html, /Current stress contributors/);
  assert.doesNotMatch(html, /Protocol market-history stress index/);

  const impactContributionView = generator.match(/function renderImpact\(\)[\s\S]*?function chartSection\(/)?.[0] || "";
  assert.ok(impactContributionView.indexOf('"impactInterestContributions"') < impactContributionView.indexOf('"impactInterestRepaymentContributions"'));
  assert.ok(impactContributionView.indexOf('"impactDebtContributions"') < impactContributionView.indexOf('"impactRepaymentContributions"'));
  assert.ok(impactContributionView.indexOf('"impactRepaymentContributions"') < impactContributionView.indexOf('"impactDebtGapContributions"'));
  assert.match(generator, /chartId: "impactCurrentContributions"[\s\S]{0,900}?mode: "stacked"[\s\S]{0,500}?fixedXDomain:\s*\{\s*min:\s*0,\s*max:\s*1\s*\}/);
  assert.match(generator, /chartId:\s*"impactLoanState"[\s\S]{0,300}?series:\s*healthFactorSeries\(false\)/);
  assert.match(generator, /function healthFactorSeries[\s\S]{0,200}?key:\s*"debtBelow100InUsd"[\s\S]{0,100}?label:\s*"HF < 1\.0"/);
  assert.match(generator, /key:\s*"debt100To110InUsd"[\s\S]{0,50}?color:\s*"#c2410c"/);
  assert.match(html, /key:\s*"debt100To110InUsd"[\s\S]{0,50}?color:\s*"#c2410c"/);

  for (const label of ["Week", "Month", "3 months", "YTD", "Year", "All"]) {
    assert.ok(html.includes(label), `standalone app is missing ${label}`);
  }
});

test("HTTP server and its duplicate viewer have been removed", async () => {
  const obsolete = [
    "src/server/server.js",
    "src/server/analysisPipeline.js",
    "src/server/dataStore.js",
    "src/server/cli.js",
    "src/server/liqwidApi.js",
    "public/index.html",
    "public/app.js",
    "public/styles.css",
    "OPEN-LIQWID-ANALYSIS.cmd"
  ];

  for (const relative of obsolete) {
    await assert.rejects(fs.access(path.join(projectRoot, relative)), { code: "ENOENT" });
  }
});

test("every visible chart states its own analytical question beneath the title", async () => {
  const [generator, html] = await Promise.all([
    fs.readFile(path.join(projectRoot, "scripts", "static_app_generator.py"), "utf8"),
    fs.readFile(path.join(projectRoot, "data", "liqwid", "liqwid-analysis-app.html"), "utf8")
  ]);
  const chartIds = [...generator.matchAll(
    /\$\{interactive(?:Chart|Breakdown)Panel\((?:"[^"]*"|`[^`]*`),\s*"([^"]+)"/g
  )].map((match) => match[1]);
  const questionBlock = generator.match(/const chartQuestions = Object\.freeze\(\{([\s\S]*?)\n\s*\}\);/)?.[1] || "";
  const questions = new Map(
    [...questionBlock.matchAll(/^\s+([A-Za-z0-9]+):\s*"([^"]+\?)",?$/gm)]
      .map((match) => [match[1], match[2]])
  );
  const sectionQuestions = new Set(
    [...generator.matchAll(/chartSection\("[^"]+",\s*"([^"]+\?)"\)/g)]
      .map((match) => match[1])
  );

  assert.ok(chartIds.length > 0, "the standalone app must expose chart panels");
  assert.equal(new Set(chartIds).size, chartIds.length, "chart panel IDs must be unique");
  assert.deepEqual(
    [...questions.keys()].sort(),
    [...chartIds].sort(),
    "the chart-question registry must cover exactly every visible chart"
  );
  for (const [chartId, question] of questions) {
    assert.ok(!sectionQuestions.has(question), `${chartId} must not repeat a section question exactly`);
  }
  for (const source of [generator, html]) {
    assert.match(source, /\.chart-heading-copy/);
    assert.match(source, /\.chart-question/);
    assert.equal(
      (source.match(/<div class="chart-heading-copy">\s*<h2>[\s\S]*?\$\{esc\(title\)\}[\s\S]*?<\/h2>\s*\$\{chartQuestion\(chartId\)\}\s*<\/div>/g) || []).length,
      2,
      "time-series and breakdown panels must place their question directly beneath the chart title"
    );
  }
});

test("market repayment summary explains its dry-spell and concentration metrics", async () => {
  const [generator, html] = await Promise.all([
    fs.readFile(path.join(projectRoot, "scripts", "static_app_generator.py"), "utf8"),
    fs.readFile(path.join(projectRoot, "data", "liqwid", "liqwid-analysis-app.html"), "utf8")
  ]);

  for (const source of [generator, html]) {
    const repaymentView = source.match(/function renderMarketRepayments\(\)[\s\S]*?function renderMarketInterest\(\)/)?.[0] || "";
    assert.match(repaymentView, /kpi\("Longest observed run with no debt repayment"/);
    assert.match(repaymentView, /Longest run of consecutive daily observations with USD 0 reported debt repaid\./);
    assert.match(repaymentView, /kpi\("Repayment unevenness across active days"/);
    assert.match(repaymentView, /Normalized HHI of each active repayment day's share of total repayment:/);
    assert.match(repaymentView, /0% means equal amounts each active day; 100% means one day accounts for all repayment\./);
    assert.doesNotMatch(repaymentView, /kpi\("Max dry spell"|kpi\("Repayment concentration"/);
  }
});

test("market health summary pairs near-liquidation debt with affected position counts", async () => {
  const [generator, html] = await Promise.all([
    fs.readFile(path.join(projectRoot, "scripts", "static_app_generator.py"), "utf8"),
    fs.readFile(path.join(projectRoot, "data", "liqwid", "liqwid-analysis-app.html"), "utf8")
  ]);

  for (const source of [generator, html]) {
    const healthView = source.match(/function renderMarketHealth\(\)[\s\S]*?function renderMarketParticipation\(\)/)?.[0] || "";
    assert.match(healthView, /kpi\("Debt at HF < 1\.0", usd\(market\.activeLoanDebtBelow100InUsd\), activeDebtPositionCount\(market\.activeDebtLoanCountBelow100\)\)/);
    assert.match(healthView, /kpi\("Critical debt at HF <= 1\.10", usd\(market\.activeLoanDebtAtOrBelow110InUsd\), activeDebtPositionCount\(market\.activeDebtLoanCountAtOrBelow110\)\)/);
    assert.match(healthView, /kpi\("Debt at HF <= 1\.25", usd\(market\.activeLoanDebtAtOrBelow125InUsd\), activeDebtPositionCount\(market\.activeDebtLoanCountAtOrBelow125\)\)/);
    assert.match(healthView, /kpi\("Bad-debt positions", integer\(market\.activeLoanBadDebtLoanCount\)/);
    assert.match(healthView, /kpi\("Sum of bad debt", usd\(market\.activeLoanBadDebtInUsd\)/);
    assert.match(source, /function activeDebtPositionCount\(value\)/);
    assert.match(healthView, /Protocol-Owned Liquidity \(POL\)/);
    assert.match(healthView, /activateView\(['"]marketPol['"]\)/);
  }
});

test("standalone bundled runtime treats zero liquidation gaps and failures as success everywhere", async () => {
  const html = await fs.readFile(path.join(projectRoot, "data", "liqwid", "liqwid-analysis-app.html"), "utf8");
  const dataStatusSource = html.match(/const DATA_STATUS_USD_TOLERANCE[\s\S]*?(?=\n\/\/ src\/browser\/fullAnalysis\.js)/)?.[0] || "";
  const uiFormatterSource = html.match(/\n    function integer\(value\)[\s\S]*?(?=\n    function setHtml)/)?.[0] || "";
  assert.ok(dataStatusSource, "standalone app is missing the bundled Data status calculator");
  assert.ok(uiFormatterSource, "standalone app is missing its numeric UI formatters");

  const buildBundledDataStatus = new Function(`${dataStatusSource}\n${uiFormatterSource}\nreturn buildDataStatus;`)();
  const status = buildBundledDataStatus({
    bundle: {
      generatedAt: "2026-07-18T15:55:55.664Z",
      markets: [], marketSeries: {}, protocolSeries: [],
      currentTotals: { borrowInUsd: 0 }, summedCurrentTotals: { borrowInUsd: 0 }
    },
    liquidation: {
      dailyLiquidationCoverage: {
        firstDate: "2023-02-02", lastDate: "2026-07-17", complete: true,
        expectedDays: 1262, availableDays: 1262, missingDays: 0, reconciliationFailures: 0
      },
      dailyLiquidationReconciliations: Array.from({ length: 42 }, () => ({}))
    }
  });

  const liquidationCard = status.coverageCards.find((card) => card.id === "liquidations");
  const liquidationCheck = status.checks.find((check) => check.id === "liquidations");
  const liquidationEvidence = status.technical.evidence.find((item) => item.id === "liquidations");
  assert.deepEqual(
    [liquidationCard.status, liquidationCheck.status, liquidationEvidence.status],
    ["pass", "pass", "pass"]
  );
  assert.equal(liquidationCard.value, "Complete daily coverage");
  assert.equal(liquidationCheck.value, "All covered months reconcile");
  assert.equal(
    [liquidationCard, liquidationCheck, liquidationEvidence].filter(
      (item) => item.status === "fail",
    ).length,
    0,
  );
});

test("Data status renders textual states and expandable per-market operands accessibly", async () => {
  const generator = await fs.readFile(path.join(projectRoot, "scripts", "static_app_generator.py"), "utf8");

  assert.match(generator, /id="dataStatusButton"[^>]*aria-haspopup="dialog"[^>]*aria-controls="dataStatusDialog"/);
  assert.match(generator, /function dataStatusLabel\(status\)/);
  assert.match(generator, /class="data-status-badge/);
  assert.match(generator, /function dataStatusOperands\(operands\)/);
  assert.match(generator, /Show \$\{integer\(operands\.length\)\} per-market operands/);
  assert.match(generator, /Market borrow \(USD\)/);
  assert.match(generator, /Adjusted loan debt \(USD\)/);
  assert.match(generator, /\.data-status-headline\.limited/);
  assert.match(generator, /grid-template-columns:\s*repeat\(auto-fit,\s*minmax\(210px,\s*1fr\)\)/);
});

test("flow-difference help explains reconciliation, repricing, and semantic limits", async () => {
  const [html, generator] = await Promise.all([
    fs.readFile(path.join(projectRoot, "data", "liqwid", "liqwid-analysis-app.html"), "utf8"),
    fs.readFile(path.join(projectRoot, "scripts", "static_app_generator.py"), "utf8")
  ]);

  for (const source of [html, generator]) {
    assert.match(source, /summarizeDebtFlowReconciliation/);
    assert.match(source, /no direct debt-accrued flow/i);
    assert.match(source, /Unclassified Reduction = max\(0, -\(Borrow Change \+ Reported Repayment\)\)/);
    assert.match(source, /Borrow Change = Inferred Formation - Reported Repayment - Unclassified Reduction/);
    assert.match(source, /does not identify the cause of an unclassified reduction/i);
    assert.match(source, /calculated in each market's asset units before USD valuation/i);
    assert.match(source, /USD market values are summed; unlike asset units are never added/i);
    assert.match(source, /can move solely because the asset price changes/i);
    assert.match(source, /Current borrow is the remaining principal measure/i);
    assert.match(source, /does not expose a current interest receivable/i);
    assert.match(source, /liquidation profit is protocol revenue, not liquidated principal/i);
    assert.match(source, /cumulativeUnclassifiedBorrowReduction/);
    assert.match(source, /Current-valued cumulative reported debt-flow difference/);
    assert.match(source, /Current-valued cumulative reported interest-flow difference/);
  }
});

test("pct formatter defaults to 2 decimal places and ignores string seriesKey argument", async () => {
  const html = await fs.readFile(path.join(projectRoot, "data", "liqwid", "liqwid-analysis-app.html"), "utf8");
  assert.match(html, /function pct\(value, decimals = 2\)/);
  assert.match(html, /typeof decimals === "number"/);

  // Evaluate the pct function definition
  const pctDefMatch = html.match(/function pct\(value[\s\S]*?function displayNumber\(value\)\s*\{[\s\S]*?\n\s*\}/);
  assert.ok(pctDefMatch, "pct and displayNumber definitions found");
  const evaluateFormatter = new Function(`
    ${pctDefMatch[0]}
    return { pct, displayNumber };
  `);
  const { pct } = evaluateFormatter();

  assert.equal(pct(0.1276498), "12.76%");
  assert.equal(pct(0.1276498, "djedSupplyApy"), "12.76%");
  assert.equal(pct(0.043512, "iusdSupplyApy"), "4.35%");
  assert.equal(pct(0.19876, "wanusdtSupplyApy"), "19.88%");
  assert.equal(pct(0.00123, "wandaiSupplyApy"), "0.12%");
  assert.equal(pct(0.0845, 1), "8.5%");
  assert.equal(pct(null), "n/a");
});

test("POL health comparison charts include nominal health factor alongside nominal LTV and use symlog scale", async () => {
  const [html, generator] = await Promise.all([
    fs.readFile(path.join(projectRoot, "data", "liqwid", "liqwid-analysis-app.html"), "utf8"),
    fs.readFile(path.join(projectRoot, "scripts", "static_app_generator.py"), "utf8")
  ]);

  for (const source of [html, generator]) {
    // Check protocol POL health comparison chart
    assert.match(source, /chartId:\s*"protocolPolHealthComparison"[\s\S]*?nominalHealthFactor:[\s\S]*?xScale:\s*"symlog"[\s\S]*?allowXScaleToggle:\s*true/);
    assert.match(source, /chartId:\s*"protocolPolHealthComparison"[\s\S]*?key:\s*"nominalLtv"[\s\S]*?key:\s*"nominalHealthFactor"[\s\S]*?key:\s*"healthFactor"/);

    // Check market POL health comparison chart
    assert.match(source, /chartId:\s*"marketPolHealthComparison"[\s\S]*?nominalHealthFactor:[\s\S]*?xScale:\s*"symlog"[\s\S]*?allowXScaleToggle:\s*true/);
    assert.match(source, /chartId:\s*"marketPolHealthComparison"[\s\S]*?key:\s*"nominalLtv"[\s\S]*?key:\s*"nominalHealthFactor"[\s\S]*?key:\s*"healthFactor"/);
  }
});

test("protocol POL tab includes Annual interest yield paid stat and interest contribution chart", async () => {
  const [html, generator] = await Promise.all([
    fs.readFile(path.join(projectRoot, "data", "liqwid", "liqwid-analysis-app.html"), "utf8"),
    fs.readFile(path.join(projectRoot, "scripts", "static_app_generator.py"), "utf8")
  ]);

  for (const source of [html, generator]) {
    // Check Annual interest yield paid KPI in protocolPol
    assert.match(source, /kpi\(\s*"Annual interest yield paid \(at current rates\)",\s*usd\(summary\.totalAnnualInterestCostInUsd\)/);
    
    // Check protocolPolInterestContribution breakdown panel
    assert.match(source, /interactiveBreakdownPanel\(\s*"Annual interest yield paid and contribution by market \(at current rates\)",\s*"protocolPolInterestContribution"/);

    // Check protocolPolInterestContribution rendering in drawProtocolPolCharts
    assert.match(source, /protocolPolInterestContribution[\s\S]*?annualInterestInUsd:[\s\S]*?renderInteractiveCategoryChart/);
    assert.match(source, /protocolPolInterestContribution:\s*"What is the projected annual interest yield paid by each POL position at current borrow rates/);
  }
});

test("market POL tab includes historical POL trajectory charts over time (size, share, yield, health)", async () => {
  const [html, generator] = await Promise.all([
    fs.readFile(path.join(projectRoot, "data", "liqwid", "liqwid-analysis-app.html"), "utf8"),
    fs.readFile(path.join(projectRoot, "scripts", "static_app_generator.py"), "utf8")
  ]);

  for (const source of [html, generator]) {
    // Chart panels in renderMarketPol
    assert.match(source, /interactiveChartPanel\(\s*"POL debt and collateral valuation history",\s*"marketPolDebtHistory"/);
    assert.match(source, /interactiveChartPanel\(\s*"POL share of market borrow over time",\s*"marketPolBorrowShareHistory"/);
    assert.match(source, /interactiveChartPanel\(\s*"POL projected annual interest yield & borrow APY over time",\s*"marketPolYieldHistory"/);
    assert.match(source, /interactiveChartPanel\(\s*"Nominal LTV and smart contract health factor over time",\s*"marketPolHealthHistory"/);

    // Chart questions registered
    assert.match(source, /marketPolDebtHistory:\s*"How have this market's protocol-owned debt obligations and locked collateral valuation evolved across snapshot observations\?"/);
    assert.match(source, /marketPolBorrowShareHistory:\s*"What share of this market's total active borrow has been protocol-owned over time\?"/);
    assert.match(source, /marketPolYieldHistory:\s*"How have the projected annual interest yield and borrow APY for this market's POL position changed across observations\?"/);
    assert.match(source, /marketPolHealthHistory:\s*"How have nominal LTV and effective smart contract health factor for this market's POL position evolved over time\?"/);

    // marketChartIds includes all 4
    assert.match(source, /"marketPolDebtHistory",\s*"marketPolBorrowShareHistory",\s*"marketPolYieldHistory",\s*"marketPolHealthHistory"/);

    // drawMarketTimeChart renders all 4 time-series charts with appropriate series and formatters
    assert.match(source, /chartId === "marketPolDebtHistory"[\s\S]*?key:\s*"debtInUsd"[\s\S]*?key:\s*"collateralInUsd"[\s\S]*?usdCompact/);
    assert.match(source, /chartId === "marketPolBorrowShareHistory"[\s\S]*?key:\s*"marketBorrowShare"[\s\S]*?pct/);
    assert.match(source, /chartId === "marketPolYieldHistory"[\s\S]*?key:\s*"annualInterestCostInUsd"[\s\S]*?key:\s*"borrowApy"/);
    assert.match(source, /chartId === "marketPolHealthHistory"[\s\S]*?key:\s*"nominalLtv"[\s\S]*?key:\s*"healthFactor"/);

    // KPI metadata
    assert.match(source, /"POL share of market borrow":\s*\{/);

    // Historical API disclosure disclaimer note in protocol and market POL views
    assert.match(source, /Historical API Disclosure Note:[\s\S]*?Prior to August 25, 2026/);
  }
});

