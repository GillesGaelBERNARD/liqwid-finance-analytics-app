import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

test("stat card labels use the larger shared KPI label style throughout the app", async () => {
  const [generator, html] = await Promise.all([
    fs.readFile(path.join(projectRoot, "scripts", "static_app_generator.py"), "utf8"),
    fs.readFile(path.join(projectRoot, "data", "liqwid", "liqwid-analysis-app.html"), "utf8")
  ]);

  for (const source of [generator, html]) {
    assert.match(source, /\.kpi-label\s*\{[^}]*font-size:\s*1rem;/);
    assert.match(source, /function kpi\(label, value, note = ""(?:,\s*help\s*=\s*"")?\)\s*\{[\s\S]*?class="kpi-label"/);
  }
});

test("recent DAO run-rate context stays beside its period and explains the annualization plainly", async () => {
  const [generator, html] = await Promise.all([
    fs.readFile(path.join(projectRoot, "scripts", "static_app_generator.py"), "utf8"),
    fs.readFile(path.join(projectRoot, "data", "liqwid", "liqwid-analysis-app.html"), "utf8")
  ]);

  for (const source of [generator, html]) {
    assert.match(source, /\.metric-period\s*\{[^}]*justify-content:\s*flex-start;/);
    assert.match(
      source,
      /metricPeriodGroup\("Recent DAO run rate", runRatePeriod, "Latest 90 consecutive complete days",[\s\S]{0,300}?Trailing 90-day revenue:/
    );
    assert.doesNotMatch(source, /3 consecutive complete months|3-month total|prior 3 months/i);
    assert.doesNotMatch(source, /365\.25\s*\/\s*90/);
  }
});

test("stat card detail notes render on a separate line below the stat value", async () => {
  const [generator, html] = await Promise.all([
    fs.readFile(path.join(projectRoot, "scripts", "static_app_generator.py"), "utf8"),
    fs.readFile(path.join(projectRoot, "data", "liqwid", "liqwid-analysis-app.html"), "utf8")
  ]);

  for (const source of [generator, html]) {
    assert.match(source, /\.kpi\s*strong\s*\{[^}]*display:\s*block;/);
    assert.match(source, /\.kpi\s*\.kpi-note\s*\{[^}]*display:\s*block;/);
  }
});

