import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { csvToRows, buildAnalysisBundleFromStore } from "../src/browser/dataWorkflow.js";
import { buildIsolatedSilos } from "../src/browser/currentExposureAnalysis.js";
import { decodeZipArchive } from "../src/browser/portableArchive.js";
import { createMemoryDataStore } from "../src/browser/memoryDataStore.js";
import { buildCompleteAnalysisFromStore } from "../src/browser/fullAnalysis.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..");

test("isolated markets share the identical analytics tabs and structure as core markets in the web app UI", async () => {
  const [html, generator] = await Promise.all([
    fs.readFile(path.join(projectRoot, "data", "liqwid", "liqwid-analysis-app.html"), "utf8"),
    fs.readFile(path.join(projectRoot, "scripts", "static_app_generator.py"), "utf8")
  ]);

  for (const source of [html, generator]) {
    // Only 2 top-level scopes: protocol and markets
    assert.match(source, /\["protocol", "Protocol analytics",/);
    assert.match(source, /\["markets", "Market analytics",/);
    assert.doesNotMatch(source, /\["isolated", "Isolated markets",/);

    // Market context selector is positioned above the stats section tabs
    const marketContextPos = source.indexOf('id="marketContext"');
    const sectionTabsPos = source.indexOf('id="sectionTabs"');
    assert.ok(marketContextPos !== -1 && sectionTabsPos !== -1 && marketContextPos < sectionTabsPos, "marketContext must be positioned above sectionTabs");

    // Core / Isolated market category toggle in marketContext
    assert.match(source, /data-market-category="core"/);
    assert.match(source, /data-market-category="isolated"/);
    assert.match(source, /market-type-toggle/);
    assert.match(source, /id="marketSelect"/);
  }
});

test("buildIsolatedSilos extracts ring-fenced silos and paired borrow pools correctly", async () => {
  const marketsCsv = await fs.readFile(path.join(projectRoot, "data", "liqwid", "clean", "markets.csv"), "utf8");
  const markets = csvToRows(marketsCsv);
  const allLoans = csvToRows(await fs.readFile(path.join(projectRoot, "data", "liqwid", "clean", "current-all-loans.csv"), "utf8"));
  const activeLoans = allLoans.filter((l) => Number(l.debtInUsd || 0) > 0 || Number(l.amount || 0) > 0);

  const bundle = { markets };
  const silos = buildIsolatedSilos(bundle, activeLoans, []);

  assert.ok(silos.length >= 2, "Expected at least STRIKE and SNEK silos");
  
  const strikeSilo = silos.find((s) => s.groupId === "STRIKE" || s.groupName === "STRIKE");
  assert.ok(strikeSilo, "STRIKE silo not found");
  assert.equal(strikeSilo.collateralSymbol, "STRIKE");
  assert.ok(strikeSilo.totalCollateralInUsd > 0, "STRIKE silo should have positive collateral locked");
  assert.equal(strikeSilo.pools.length, 2, "STRIKE silo should have 2 borrow pools (ADA, USDCx)");

  const snekSilo = silos.find((s) => s.groupId === "SNEK" || s.groupName === "SNEK");
  assert.ok(snekSilo, "SNEK silo not found");
  assert.equal(snekSilo.collateralSymbol, "SNEK");
  assert.equal(snekSilo.pools.length, 2, "SNEK silo should have 2 borrow pools (ADA, USDCx)");
});

test("portable zip archive preserves isolated market data and builds complete analysis", async () => {
  const zipBuffer = await fs.readFile(path.join(projectRoot, "data", "liqwid", "liqwid-data.zip"));
  const entries = await decodeZipArchive(zipBuffer);
  const store = createMemoryDataStore(entries, { name: "Liqwid data" });
  const bundle = await buildAnalysisBundleFromStore(store);
  const analysis = await buildCompleteAnalysisFromStore(store, bundle);

  const silos = analysis.currentExposure?.isolatedSilos || [];
  assert.ok(silos.length >= 2, "Decoded zip archive should contain isolated silos");
  
  const strikeSilo = silos.find((s) => s.groupId === "STRIKE");
  assert.ok(strikeSilo, "Decoded zip should include STRIKE silo");
  assert.ok(strikeSilo.totalCollateralInUsd > 0, "STRIKE silo in zip should have locked collateral");
});
