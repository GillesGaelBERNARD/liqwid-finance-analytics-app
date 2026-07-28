import fs from "fs";
import path from "path";
import { buildLoanSnapshotHistory, appendLoanSnapshotHistory } from "../src/browser/loanSnapshotHistory.js";
import { deriveLoanPopulations } from "../src/browser/fullAnalysis.js";
import { rowsToCsv } from "../src/browser/dataWorkflow.js";

async function recomputeComputedDatasets(dataRoot) {
  const fetchesDir = path.join(dataRoot, "raw", "api", "fetches");
  if (!fs.existsSync(fetchesDir)) {
    console.error("Fetches directory not found:", fetchesDir);
    process.exit(1);
  }

  const entries = fs.readdirSync(fetchesDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();

  console.log(`Found ${entries.length} raw fetch directories.`);

  let masterHistory = { participation: [], health: [], reconciliation: [] };

  for (const folderName of entries) {
    const folderPath = path.join(fetchesDir, folderName);
    const allJsonPath = path.join(folderPath, "loans", "all.json");
    const activeJsonPath = path.join(folderPath, "loans", "active-debt.json");

    let filePath = fs.existsSync(allJsonPath) ? allJsonPath : (fs.existsSync(activeJsonPath) ? activeJsonPath : null);
    if (!filePath) {
      console.warn(`Skipping ${folderName}: No loan JSON found.`);
      continue;
    }

    try {
      const content = JSON.parse(fs.readFileSync(filePath, "utf-8"));
      const fetchedAt = content.fetchedAt || normalizeTimestampFromFolder(folderName);
      const rawResults = content.payload?.results || content.payload || content.results || [];
      
      let markets = [];
      const marketsPagePath = path.join(folderPath, "markets", "page-0000.json");
      if (fs.existsSync(marketsPagePath)) {
        const mContent = JSON.parse(fs.readFileSync(marketsPagePath, "utf-8"));
        markets = mContent.payload?.markets?.results || mContent.payload?.results || mContent.results || [];
      } else {
        const globalMarketsPath = path.join(dataRoot, "raw", "api", "markets-current.json");
        if (fs.existsSync(globalMarketsPath)) {
          const gContent = JSON.parse(fs.readFileSync(globalMarketsPath, "utf-8"));
          markets = gContent.payload?.markets?.results || gContent.payload?.results || gContent.results || [];
        }
      }

      const { allLoans, activeLoans } = deriveLoanPopulations(rawResults);
      const observation = buildLoanSnapshotHistory({
        timestamp: fetchedAt,
        allLoans,
        activeLoans,
        markets
      });

      masterHistory = appendLoanSnapshotHistory(masterHistory, observation);
    } catch (err) {
      console.error(`Error processing ${folderName}:`, err.message);
    }
  }

  const computedDir = path.join(dataRoot, "computed");
  if (!fs.existsSync(computedDir)) {
    fs.mkdirSync(computedDir, { recursive: true });
  }

  const partCsvPath = path.join(computedDir, "loan-participation-history.csv");
  const healthCsvPath = path.join(computedDir, "loan-health-history.csv");
  const reconCsvPath = path.join(computedDir, "loan-reconciliation-history.csv");

  fs.writeFileSync(partCsvPath, rowsToCsv(masterHistory.participation), "utf-8");
  fs.writeFileSync(healthCsvPath, rowsToCsv(masterHistory.health), "utf-8");
  fs.writeFileSync(reconCsvPath, rowsToCsv(masterHistory.reconciliation || []), "utf-8");

  console.log(`Successfully re-computed datasets:`);
  console.log(`  Participation rows: ${masterHistory.participation.length} -> ${partCsvPath}`);
  console.log(`  Health rows: ${masterHistory.health.length} -> ${healthCsvPath}`);
  console.log(`  Reconciliation rows: ${(masterHistory.reconciliation || []).length} -> ${reconCsvPath}`);
}

function normalizeTimestampFromFolder(folderName) {
  // e.g. 20260716T154708070Z -> 2026-07-16T15:47:08.070Z
  const m = folderName.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(\d{3})?Z?$/);
  if (m) {
    const [, y, mo, d, h, mi, s, ms] = m;
    return `${y}-${mo}-${d}T${h}:${mi}:${s}.${ms || "000"}Z`;
  }
  return new Date().toISOString();
}

const targetRoot = process.argv[2] || path.resolve("data/liqwid");
recomputeComputedDatasets(targetRoot);
