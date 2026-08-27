import json
import base64
import hashlib
import re
from pathlib import Path


def build_static_app(data_root, output_path=None):
    data_root = Path(data_root)
    output_path = Path(output_path) if output_path else data_root / "liqwid-analysis-app.html"
    payload = json.dumps({"bundle": None, "deep": None}, separators=(",", ":")).replace("</", "<\\/")
    browser_runtime = build_browser_runtime().replace("</", "<\\/")
    viewer_build = hashlib.sha256(f"{browser_runtime}\0{HTML_TEMPLATE}".encode("utf-8")).hexdigest()[:12]
    logo_path = Path(__file__).resolve().parents[1] / "public" / "assets" / "liqwid-logo.png"
    logo_uri = "data:image/png;base64," + base64.b64encode(logo_path.read_bytes()).decode("ascii")
    html = (
        HTML_TEMPLATE
        .replace("__LIQWID_PAYLOAD__", payload)
        .replace("__LIQWID_BROWSER_DATA__", browser_runtime)
        .replace("__LIQWID_VIEWER_BUILD__", viewer_build)
        .replace("__LIQWID_LOGO__", logo_uri)
    )
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(html, encoding="utf-8")
    return output_path


def build_browser_runtime():
    project_root = Path(__file__).resolve().parents[1]
    modules = [
        project_root / "src" / "shared" / "dates.js",
        project_root / "src" / "shared" / "metrics.js",
        project_root / "src" / "browser" / "chartData.js",
        project_root / "src" / "browser" / "lqStatsHistory.js",
        project_root / "src" / "browser" / "loanSnapshotHistory.js",
        project_root / "src" / "browser" / "memoryDataStore.js",
        project_root / "src" / "browser" / "portableArchive.js",
        project_root / "src" / "browser" / "dataWorkflow.js",
        project_root / "src" / "browser" / "refreshProgress.js",
        project_root / "src" / "browser" / "currentExposureAnalysis.js",
        project_root / "src" / "browser" / "dataStatus.js",
        project_root / "src" / "browser" / "marketParameterHistory.js",
        project_root / "src" / "browser" / "marketRevenueAnalysis.js",
        project_root / "src" / "browser" / "protocolParameterLandscape.js",
        project_root / "src" / "browser" / "fullAnalysis.js",
        project_root / "src" / "browser" / "completeDataWorkflow.js",
        project_root / "src" / "browser" / "directoryStore.js",
        project_root / "src" / "browser" / "recentDataLocation.js",
        project_root / "src" / "browser" / "dataLocation.js",
        project_root / "src" / "browser" / "interactiveChart.js",
        project_root / "src" / "browser" / "interactiveBreakdownChart.js",
    ]
    bundled = []
    for path in modules:
        source = path.read_text(encoding="utf-8")
        source = re.sub(r"^import[\s\S]*?;\s*$", "", source, flags=re.MULTILINE)
        source = re.sub(r"^export\s+", "", source, flags=re.MULTILINE)
        bundled.append(f"// {path.relative_to(project_root).as_posix()}\n{source.strip()}")
    return "\n\n".join(bundled)


HTML_TEMPLATE = r"""<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Liqwid analysis viewer</title>
  <style>
    :root {
      color-scheme: dark;
      --bg: #071522;
      --panel: #0d1f33;
      --panel2: #102a44;
      --line: #244866;
      --text: #e8f7ff;
      --muted: #a9bfd3;
      --blue: #19b5fe;
      --mint: #3edc81;
      --amber: #ffb84d;
      --red: #ff5a67;
      --purple: #d593ff;
      --risk-safe: #a7f3d0;
      --risk-buffer: #34d399;
      --risk-watch: #facc15;
      --risk-near: #f97316;
      --risk-critical: #991b1b;
      font-family: Inter, ui-sans-serif, system-ui, "Segoe UI", Arial, sans-serif;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      background: linear-gradient(130deg, rgba(25,181,254,.11), transparent 35%), var(--bg);
      color: var(--text);
      font-size: 18px;
      line-height: 1.55;
    }
    header {
      padding: 28px clamp(20px, 5vw, 72px) 22px;
      border-bottom: 1px solid rgba(25,181,254,.25);
      background: rgba(5,19,39,.94);
    }
    .header-row { display: flex; align-items: center; justify-content: space-between; gap: 20px; }
    .header-utilities { display: grid; justify-items: end; gap: 7px; }
    .header-actions { display: flex; align-items: center; justify-content: flex-end; gap: 10px; flex-wrap: wrap; }
    .data-status-button {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      padding: 4px 7px;
      border-color: transparent;
      background: transparent;
      color: var(--muted);
      font-size: .76rem;
      line-height: 1.25;
    }
    .data-status-button[hidden] { display: none; }
    .data-status-button::before { content: ""; width: 8px; height: 8px; border-radius: 50%; background: var(--mint); box-shadow: 0 0 0 3px rgba(62,220,129,.12); }
    .data-status-button.limited::before { background: var(--amber); box-shadow: 0 0 0 3px rgba(255,184,77,.14); }
    .data-status-button.attention::before { background: var(--red); box-shadow: 0 0 0 3px rgba(255,90,103,.14); }
    .data-status-button:hover, .data-status-button:focus-visible { border-color: rgba(36,72,102,.86); background: rgba(16,42,68,.58); color: var(--text); }
    .data-status-button span { color: #c8d9e7; }
    .brand { display: flex; align-items: center; gap: 18px; }
    .brand img { width: 62px; height: 62px; object-fit: contain; }
    h1 { margin: 0; font-size: clamp(2rem, 4vw, 3.6rem); line-height: 1; }
    header p { margin: 8px 0 0; color: var(--muted); }
    .refresh-status { min-height: 1.55em; overflow-wrap: anywhere; }
    .refresh-status.error { color: #ffd5d9; }
    .settings-note { color: var(--muted); font-size: .84rem; }
    .empty-actions { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; margin-top: 20px; }
    .screen-reader-only { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip: rect(0, 0, 0, 0); white-space: nowrap; border: 0; }
    .fetch-confirm-dialog {
      width: min(620px, calc(100% - 32px));
      border: 1px solid var(--line);
      border-radius: 12px;
      padding: 0;
      background: var(--panel);
      color: var(--text);
      box-shadow: 0 24px 80px rgba(0,0,0,.58);
    }
    .fetch-confirm-dialog::backdrop { background: rgba(2,10,20,.78); backdrop-filter: blur(3px); }
    .fetch-confirm-dialog form { padding: clamp(22px, 4vw, 34px); }
    .fetch-confirm-dialog h2 { margin: 0 0 10px; font-size: 1.65rem; }
    .fetch-confirm-dialog p { color: var(--muted); }
    .fetch-warning { border-left: 3px solid var(--amber); padding-left: 14px; }
    .dialog-actions { display: flex; justify-content: flex-end; gap: 10px; margin-top: 24px; }
    .data-status-dialog {
      width: min(1120px, calc(100% - 32px));
      max-height: min(92vh, 980px);
      border: 1px solid var(--line);
      border-radius: 14px;
      padding: 0;
      background: #081827;
      color: var(--text);
      box-shadow: 0 30px 100px rgba(0,0,0,.68);
    }
    .data-status-dialog::backdrop { background: rgba(2,10,20,.82); backdrop-filter: blur(4px); }
    .data-status-shell { padding: clamp(20px, 4vw, 38px); }
    .data-status-dialog-heading { display: flex; align-items: flex-start; justify-content: space-between; gap: 20px; margin-bottom: 22px; }
    .data-status-dialog-heading h2 { margin: 0; font-size: clamp(1.8rem, 3vw, 2.7rem); }
    .data-status-dialog-heading p { max-width: 760px; margin: 7px 0 0; color: var(--muted); }
    .data-status-dialog-heading button { flex: 0 0 auto; padding: 8px 12px; }
    .data-status-headline { display: flex; align-items: center; justify-content: space-between; gap: 18px; margin-bottom: 24px; padding: 16px 18px; border: 1px solid rgba(62,220,129,.42); border-radius: 10px; background: linear-gradient(90deg, rgba(62,220,129,.10), rgba(25,181,254,.05)); }
    .data-status-headline.limited { border-color: rgba(255,184,77,.48); background: linear-gradient(90deg, rgba(255,184,77,.10), rgba(25,181,254,.05)); }
    .data-status-headline.attention { border-color: rgba(255,90,103,.55); background: linear-gradient(90deg, rgba(255,90,103,.12), rgba(255,184,77,.05)); }
    .data-status-headline strong { display: block; font-size: 1.08rem; }
    .data-status-headline span { color: var(--muted); font-size: .8rem; }
    .data-status-section { margin-top: 28px; }
    .data-status-section h3 { margin: 0 0 5px; font-size: clamp(1.2rem, 2vw, 1.55rem); }
    .data-status-section > p { margin: 0 0 14px; color: var(--muted); font-size: .86rem; }
    .data-status-coverage { display: grid; grid-template-columns: repeat(auto-fit, minmax(210px, 1fr)); gap: 12px; }
    .data-status-card { min-width: 0; padding: 16px; border: 1px solid var(--line); border-top: 3px solid var(--mint); border-radius: 9px; background: linear-gradient(180deg, rgba(25,181,254,.07), transparent), var(--panel); }
    .data-status-card.pass { border-top-color: var(--mint); }
    .data-status-card.partial { border-top-color: var(--amber); }
    .data-status-card.fail { border-top-color: var(--red); }
    .data-status-card.unavailable { border-top-color: var(--line); }
    .data-status-card-heading { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
    .data-status-card-heading > span:first-child { color: var(--muted); font-size: .75rem; }
    .data-status-badge { display: inline-flex; align-items: center; width: max-content; padding: 2px 7px; border: 1px solid rgba(62,220,129,.38); border-radius: 99px; color: var(--mint); font-size: .66rem; font-weight: 800; letter-spacing: .04em; line-height: 1.35; text-transform: uppercase; }
    .data-status-badge.pass { color: var(--mint); }
    .data-status-badge.partial { border-color: rgba(255,184,77,.5); color: var(--amber); }
    .data-status-badge.fail { border-color: rgba(255,90,103,.55); color: #ff9aa2; }
    .data-status-badge.unavailable { border-color: rgba(127,166,199,.32); color: var(--muted); }
    .data-status-card strong { display: block; margin: 7px 0; font-size: clamp(1.15rem, 2vw, 1.55rem); line-height: 1.15; overflow-wrap: anywhere; }
    .data-status-card small { display: block; color: #c8d9e7; font-size: .72rem; line-height: 1.45; }
    .loan-population-panel { padding: 18px; border: 1px solid var(--line); border-radius: 10px; background: var(--panel); }
    .loan-population-total { display: flex; justify-content: space-between; gap: 18px; margin-bottom: 10px; color: var(--muted); font-size: .82rem; }
    .loan-population-total strong { color: var(--text); font-size: 1rem; }
    .loan-population-bar { display: flex; width: 100%; height: 22px; overflow: hidden; border: 1px solid rgba(36,72,102,.8); border-radius: 99px; background: rgba(7,21,34,.85); }
    .loan-population-segment { min-width: 0; }
    .loan-population-segment.active { background: var(--blue); }
    .loan-population-segment.zero { background: #6787a3; }
    .loan-population-segment.dust { background: var(--amber); }
    .loan-population-legend { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 10px; margin-top: 13px; }
    .loan-population-key { padding: 11px 12px; border-radius: 8px; background: rgba(16,42,68,.62); }
    .loan-population-key span { display: flex; align-items: center; gap: 7px; color: var(--muted); font-size: .75rem; }
    .loan-population-key span::before { content: ""; width: 9px; height: 9px; flex: 0 0 auto; border-radius: 50%; background: var(--blue); }
    .loan-population-key.zero span::before { background: #6787a3; }
    .loan-population-key.dust span::before { background: var(--amber); }
    .loan-population-key strong { display: block; margin-top: 4px; font-size: 1.2rem; }
    .loan-population-facts { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 8px; margin-top: 12px; }
    .loan-population-facts div { padding: 9px 11px; border: 1px solid rgba(36,72,102,.62); border-radius: 7px; background: rgba(7,21,34,.48); }
    .loan-population-facts span { display: block; color: var(--muted); font-size: .7rem; }
    .loan-population-facts strong { display: block; margin-top: 2px; font-size: .92rem; }
    .loan-population-note { margin: 13px 0 0; color: #c8d9e7; font-size: .76rem; }
    .data-status-checks { display: grid; gap: 9px; }
    .data-status-check { display: grid; grid-template-columns: minmax(230px, .8fr) minmax(180px, .55fr) minmax(280px, 1.2fr); align-items: center; gap: 14px; padding: 13px 15px; border: 1px solid rgba(36,72,102,.76); border-radius: 9px; background: rgba(13,31,51,.82); }
    .data-status-check-label { display: flex; align-items: center; gap: 10px; font-weight: 800; }
    .data-status-check-mark { display: grid; width: 24px; height: 24px; flex: 0 0 auto; place-items: center; border-radius: 50%; background: rgba(62,220,129,.14); color: var(--mint); }
    .data-status-check.pass .data-status-check-mark { background: rgba(62,220,129,.14); color: var(--mint); }
    .data-status-check.fail .data-status-check-mark { background: rgba(255,90,103,.16); color: #ff9aa2; }
    .data-status-check.partial .data-status-check-mark { background: rgba(255,184,77,.15); color: var(--amber); }
    .data-status-check.unavailable .data-status-check-mark { background: rgba(127,166,199,.12); color: var(--muted); }
    .data-status-check-value { font-weight: 800; }
    .data-status-check-detail { color: var(--muted); font-size: .76rem; }
    .data-status-limitations { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12px; }
    .data-status-limitation { padding: 15px; border: 1px solid rgba(36,72,102,.72); border-radius: 9px; background: rgba(16,42,68,.46); }
    .data-status-limitation strong { display: block; margin-bottom: 6px; font-size: .9rem; }
    .data-status-limitation span { display: block; color: var(--muted); font-size: .75rem; line-height: 1.45; }
    .data-status-technical { margin-top: 28px; border-top: 1px solid rgba(36,72,102,.72); padding-top: 16px; }
    .data-status-technical summary { cursor: pointer; color: #c8d9e7; font-size: .86rem; }
    .data-status-technical-content { display: grid; gap: 22px; margin-top: 18px; }
    .data-status-audit-group { min-width: 0; }
    .data-status-audit-group h4 { margin: 0 0 4px; font-size: .96rem; }
    .data-status-audit-group > p { margin: 0 0 11px; color: var(--muted); font-size: .78rem; }
    .data-status-technical-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 9px 20px; }
    .data-status-technical-grid div { min-width: 0; }
    .data-status-technical-grid span { display: block; color: var(--muted); font-size: .76rem; }
    .data-status-technical-grid code { display: block; margin-top: 3px; overflow-wrap: anywhere; color: #c8d9e7; font-size: .78rem; }
    .data-status-audit-list { display: grid; gap: 8px; }
    .data-status-audit-row { display: grid; grid-template-columns: minmax(160px, .65fr) minmax(210px, .8fr) minmax(260px, 1.2fr); gap: 12px; align-items: start; padding: 10px 12px; border: 1px solid rgba(36,72,102,.62); border-radius: 8px; background: rgba(13,31,51,.62); }
    .data-status-audit-row strong { font-size: .82rem; }
    .data-status-audit-row code { overflow-wrap: anywhere; color: #d8e9f5; font-size: .78rem; }
    .data-status-audit-row span { color: var(--muted); font-size: .76rem; line-height: 1.45; }
    .data-status-audit-evidence { grid-template-columns: 26px minmax(170px, .65fr) minmax(220px, .85fr) minmax(250px, 1.1fr); }
    .data-status-audit-evidence .data-status-check-mark { width: 22px; height: 22px; font-size: .72rem; }
    .data-status-audit-evidence.fail .data-status-check-mark { background: rgba(255,90,103,.16); color: #ff9aa2; }
    .data-status-audit-evidence.partial .data-status-check-mark { background: rgba(255,184,77,.15); color: var(--amber); }
    .data-status-audit-evidence.unavailable .data-status-check-mark { background: rgba(127,166,199,.12); color: var(--muted); }
    .data-status-audit-evidence-label { display: grid; gap: 5px; justify-items: start; }
    .data-status-operands { margin: -2px 0 4px 38px; padding: 8px 10px; overflow-x: auto; border-left: 2px solid rgba(25,181,254,.38); }
    .data-status-operands summary { cursor: pointer; color: #c8d9e7; font-size: .76rem; }
    .data-status-operands-table { width: 100%; margin-top: 8px; border-collapse: collapse; font-size: .72rem; }
    .data-status-operands-table th, .data-status-operands-table td { padding: 7px 8px; border-bottom: 1px solid rgba(36,72,102,.52); text-align: right; white-space: nowrap; }
    .data-status-operands-table th:first-child, .data-status-operands-table td:first-child { text-align: left; }
    .data-status-audit-rules { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; }
    .data-status-audit-rule { padding: 11px 12px; border-left: 2px solid rgba(25,181,254,.55); background: rgba(16,42,68,.44); }
    .data-status-audit-rule strong { display: block; margin-bottom: 3px; font-size: .76rem; }
    .data-status-audit-rule span { display: block; color: var(--muted); font-size: .7rem; line-height: 1.45; }
    main { width: min(1500px, calc(100% - 32px)); margin: 22px auto 70px; }
    .analytics-nav {
      position: sticky;
      top: 0;
      z-index: 8;
      display: grid;
      gap: 9px;
      margin: 0 0 22px;
      padding: 12px 14px 14px;
      border: 1px solid rgba(36,72,102,.86);
      border-radius: 0 0 12px 12px;
      background: rgba(5,19,39,.97);
      box-shadow: 0 14px 34px rgba(0,0,0,.32);
      backdrop-filter: blur(12px);
    }
    .analytics-nav[hidden] { display: none; }
    .nav-location { display: flex; align-items: center; gap: 8px; color: var(--muted); font-size: .78rem; line-height: 1.2; }
    .nav-location strong { color: var(--text); }
    .tabs {
      display: flex;
      gap: 7px;
      margin: 0;
      overflow-x: auto;
      scrollbar-color: var(--line) transparent;
    }
    .tabs button { flex: 0 0 auto; padding: 9px 13px; white-space: nowrap; }
    .scope-tabs { padding-bottom: 2px; }
    .scope-tabs button { border-color: rgba(36,72,102,.92); font-weight: 800; }
    .market-context { display: flex; align-items: center; gap: 12px; padding-top: 6px; padding-bottom: 2px; border-top: 1px solid rgba(36,72,102,.58); flex-wrap: wrap; }
    .market-context[hidden] { display: none; }
    .market-context label { display: flex; align-items: center; gap: 10px; color: var(--muted); font-size: .8rem; }
    .market-context select { min-width: min(320px, 70vw); padding: 8px 34px 8px 11px; font-size: .86rem; }
    .section-tabs { padding-top: 8px; border-top: 1px solid rgba(36,72,102,.58); }
    .section-tabs button { border-color: transparent; background: rgba(16,42,68,.62); color: var(--muted); font-size: .84rem; }
    .section-tabs button.active { border-color: rgba(62,220,129,.68); background: rgba(25,181,254,.15); color: var(--text); box-shadow: inset 0 -2px 0 var(--mint); }
    .market-type-toggle {
      display: inline-flex;
      gap: 4px;
      background: rgba(16,42,68,.75);
      padding: 3px;
      border-radius: 8px;
      border: 1px solid rgba(36,72,102,.7);
      flex-shrink: 0;
    }
    .market-type-toggle button {
      padding: 6px 12px;
      font-size: .8rem;
      font-weight: 700;
      border: none;
      border-radius: 6px;
      background: transparent;
      color: var(--muted);
      cursor: pointer;
      transition: all .15s ease;
    }
    .market-type-toggle button.active {
      background: linear-gradient(135deg, #0287d0, #19b5fe);
      color: white;
      box-shadow: 0 2px 8px rgba(25,181,254,.35);
    }
    .view {
      scroll-margin-top: 190px;
    }
    button, select, input {
      border: 1px solid var(--line);
      border-radius: 8px;
      background: var(--panel2);
      color: var(--text);
      padding: 12px 16px;
      font: inherit;
    }
    button { cursor: pointer; }
    button.active, button.primary {
      border-color: rgba(25,181,254,.75);
      background: linear-gradient(135deg, #0287d0, #19b5fe 55%, #3edc81);
      color: white;
    }
    button:disabled { cursor: wait; opacity: .58; }
    section.view { display: none; }
    section.view.active { display: block; }
    .hero, .panel, .takeaway {
      border: 1px solid var(--line);
      border-radius: 8px;
      background: rgba(13,31,51,.92);
    }
    .hero { padding: clamp(22px, 4vw, 44px); margin-bottom: 20px; }
    .hero h2, .panel h2 { margin: 0 0 10px; font-size: clamp(1.7rem, 3vw, 2.6rem); }
    .hero p, .takeaway p { color: var(--muted); max-width: 1050px; }
    .kpis {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(230px, 1fr));
      gap: 14px;
      margin: 18px 0;
    }
    .kpi {
      display: flex;
      flex-direction: column;
      justify-content: flex-start;
      min-height: 118px;
      border: 1px solid var(--line);
      border-radius: 8px;
      padding: 18px;
      background: linear-gradient(180deg, rgba(25,181,254,.08), transparent), var(--panel);
    }
    
    .kpi-label { display: flex; align-items: center; justify-content: space-between; gap: 8px; color: var(--muted); font-size: 1rem; }
    .kpi strong { display: block; margin-top: 6px; color: var(--text); font-size: clamp(1.2rem, 2vw, 1.65rem); font-weight: 700; line-height: 1.2; word-break: break-word; }
    .chart-heading-copy h2 { display: flex; align-items: center; gap: 10px; margin: 0 0 10px; font-size: clamp(1.7rem, 3vw, 2.6rem); }
    .app-info-wrapper {
      position: relative;
      display: inline-flex;
      align-items: center;
    }
    .app-info-btn {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 18px;
      height: 18px;
      border: 1px solid var(--blue, #19b5fe);
      border-radius: 50%;
      background: rgba(25,181,254,0.15);
      color: var(--blue, #19b5fe);
      font-size: 10.5px;
      font-weight: 800;
      line-height: 1;
      cursor: pointer;
      vertical-align: middle;
      transition: all 0.15s ease;
      flex-shrink: 0;
    }
    .app-info-btn:hover, .app-info-btn:focus-visible {
      background: var(--blue, #19b5fe);
      color: var(--bg, #071522);
      border-color: var(--mint, #3edc81);
      box-shadow: 0 0 10px rgba(25,181,254,0.7);
      outline: none;
    }
    .app-info-popover {
      display: none;
      position: absolute;
      top: calc(100% + 6px);
      right: 0;
      z-index: 200;
      width: 330px;
      max-width: calc(100vw - 32px);
      padding: 14px 16px;
      border: 1px solid var(--blue, #19b5fe);
      border-radius: 10px;
      background: rgba(10, 28, 46, 0.98);
      color: var(--text, #e8f5ff);
      box-shadow: 0 14px 42px rgba(0,0,0,0.85);
      font-size: 0.82rem;
      line-height: 1.45;
      backdrop-filter: blur(12px);
      pointer-events: auto;
      text-align: left;
    }
    .chart-heading .app-info-popover {
      left: 0;
      right: auto;
    }
    .app-info-wrapper:hover .app-info-popover,
    .app-info-wrapper:focus-within .app-info-popover,
    .app-info-popover.pinned {
      display: block !important;
    }
    .app-info-popover-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 10px;
      margin-bottom: 8px;
      padding-bottom: 6px;
      border-bottom: 1px solid rgba(25,181,254,0.25);
    }
    .app-info-popover-title {
      margin: 0;
      font-size: 0.95rem;
      font-weight: 700;
      color: var(--blue, #19b5fe);
    }
    .app-info-popover-close {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 22px;
      height: 22px;
      border: 1px solid rgba(255,255,255,0.15);
      border-radius: 50%;
      background: rgba(255,255,255,0.08);
      color: var(--muted, #a9bfd3);
      font-size: 14px;
      line-height: 1;
      cursor: pointer;
    }
    .app-info-popover-close:hover {
      background: rgba(255,255,255,0.22);
      color: #fff;
    }

    .kpi .kpi-note { display: block; width: 100%; margin-top: 9px; padding-top: 9px; border-top: 1px solid rgba(36,72,102,.62); color: #c7d9e8; font-size: .78rem; line-height: 1.4; word-break: break-word; }
    .parameter-effective { display: flex; align-items: center; gap: 9px; flex-wrap: wrap; margin: 10px 0 0; color: var(--muted); font-size: .8rem; }
    .parameter-effective strong { color: var(--mint); }
    .parameter-groups { display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 16px; margin: 20px 0 28px; }
    .parameter-group { position: relative; overflow: hidden; border: 1px solid var(--line); border-radius: 10px; padding: 20px; background: linear-gradient(145deg, rgba(25,181,254,.08), rgba(62,220,129,.025) 48%, transparent), var(--panel); }
    .parameter-group::before { content: ""; position: absolute; inset: 0 0 auto; height: 3px; background: linear-gradient(90deg, var(--blue), var(--mint)); opacity: .85; }
    .parameter-group h3 { margin: 0 0 5px; font-size: 1.03rem; }
    .parameter-group > p { margin: 0 0 15px; color: var(--muted); font-size: .76rem; line-height: 1.45; }
    .parameter-list { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 0; margin: 0; }
    .parameter-list dt, .parameter-list dd { margin: 0; padding: 9px 0; border-top: 1px solid rgba(36,72,102,.52); }
    .parameter-list dt { padding-right: 18px; color: #bdd1e2; font-size: .79rem; line-height: 1.35; }
    .parameter-list dd { color: var(--text); font-size: .84rem; font-weight: 800; text-align: right; white-space: nowrap; }
    .parameter-list dt:first-of-type, .parameter-list dt:first-of-type + dd { border-top: 0; }
    .parameter-allocation-bar { display: flex; height: 9px; overflow: hidden; margin: 2px 0 14px; border: 1px solid rgba(220,238,255,.14); border-radius: 999px; background: rgba(7,21,34,.72); }
    .parameter-allocation-bar span:nth-child(1) { background: var(--blue); }
    .parameter-allocation-bar span:nth-child(2) { background: var(--mint); }
    .parameter-allocation-bar span:nth-child(3) { background: var(--amber); }
    .parameter-allocation-bar span:nth-child(4) { background: var(--purple); }
    .parameter-record { grid-column: 1 / -1; }
    .parameter-record code { display: block; margin-top: 8px; overflow-wrap: anywhere; color: #b8e7ff; font-size: .78rem; line-height: 1.5; }
    .parameter-formula { margin: 12px 0 0; padding: 12px 14px; border-left: 3px solid var(--mint); border-radius: 0 8px 8px 0; background: rgba(7,21,34,.62); color: #c7d9e8; font-size: .78rem; line-height: 1.5; }
    .parameter-formula code { color: var(--text); overflow-wrap: anywhere; }
    .parameter-empty { padding: 24px; border: 1px dashed var(--line); border-radius: 10px; background: rgba(13,31,51,.66); color: var(--muted); }
    .parameter-history-table th, .parameter-history-table td { white-space: nowrap; font-size: .8rem; }
    .parameter-history-table td:nth-child(2) { max-width: 220px; overflow: hidden; text-overflow: ellipsis; font-family: ui-monospace, SFMono-Regular, Consolas, monospace; }
    .loan-coverage-notices { display: grid; gap: 10px; margin: 14px 0 18px; }
    .loan-coverage-notice { display: flex; align-items: flex-start; gap: 13px; padding: 14px 16px; border: 1px solid rgba(255,90,103,.55); border-radius: 9px; background: linear-gradient(90deg, rgba(255,90,103,.12), rgba(255,184,77,.05)); }
    .loan-coverage-notice-badge { flex: 0 0 auto; padding: 3px 8px; border-radius: 999px; background: rgba(255,90,103,.18); color: #ffb5bb; font-size: .7rem; font-weight: 800; letter-spacing: .04em; text-transform: uppercase; }
    .loan-coverage-notice--overcoverage { border-color: rgba(255,184,77,.55); background: linear-gradient(90deg, rgba(255,184,77,.12), rgba(25,181,254,.04)); }
    .loan-coverage-notice--overcoverage .loan-coverage-notice-badge { background: rgba(255,184,77,.16); color: #ffd391; }
    .loan-coverage-notice strong { display: block; font-size: .9rem; }
    .loan-coverage-notice p { margin: 3px 0 0; color: #c8d9e7; font-size: .76rem; line-height: 1.45; }
    .metric-period-group { margin: 22px 0 34px; padding: 20px; border: 1px solid rgba(36,72,102,.86); border-radius: 10px; background: linear-gradient(135deg, rgba(25,181,254,.08), rgba(62,220,129,.04)), rgba(7,21,34,.38); }
    .metric-period { display: flex; align-items: end; justify-content: flex-start; gap: 16px; flex-wrap: wrap; margin-bottom: 14px; }
    .metric-period span { display: block; color: var(--mint); font-size: .76rem; font-weight: 800; letter-spacing: .08em; text-transform: uppercase; }
    .metric-period strong { display: block; margin-top: 3px; font-size: clamp(1.05rem, 2vw, 1.45rem); }
    .metric-period em { color: var(--muted); font-size: .8rem; font-style: normal; }
    .metric-period-group .kpis { margin: 0; }
    .summary-group { margin: 26px 0 32px; }
    .summary-heading { margin-bottom: 14px; }
    .summary-heading h3 { margin: 0; font-size: clamp(1.25rem, 2vw, 1.65rem); }
    .summary-heading p { max-width: 920px; margin: 5px 0 0; color: var(--muted); font-size: .9rem; }
    .summary-group .kpis { margin: 0; }
    .coverage-matrix-scroll { overflow-x: auto; scrollbar-color: var(--line) transparent; }
    .coverage-matrix {
      display: grid;
      grid-template-columns: minmax(190px, 1.15fr) repeat(3, minmax(155px, 1fr));
      gap: 9px;
      min-width: 700px;
    }
    .coverage-corner, .coverage-window, .coverage-row-label, .coverage-cell {
      border: 1px solid var(--line);
      border-radius: 8px;
      background: var(--panel);
    }
    .coverage-corner, .coverage-window { padding: 10px 14px; color: var(--muted); font-size: .82rem; font-weight: 800; }
    .coverage-window { text-align: center; color: var(--text); background: var(--panel2); }
    .coverage-row-label { display: grid; align-content: center; padding: 15px; font-weight: 800; }
    .coverage-row-label span { margin-top: 3px; color: var(--muted); font-size: .72rem; font-weight: 400; }
    .coverage-cell { min-height: 142px; padding: 15px; border-top-width: 4px; text-align: center; }
    .coverage-cell strong { display: block; margin-top: 7px; font-size: clamp(1.45rem, 2.3vw, 2rem); }
    .coverage-cell span { display: block; margin-top: 4px; color: var(--muted); font-size: .75rem; }
    .coverage-cell .coverage-operands--primary { margin-top: 0; color: var(--text); font-weight: 750; line-height: 1.35; }
    .coverage-cell .coverage-operands--secondary { color: #91aac0; line-height: 1.35; }
    .coverage-cell.safe { border-top-color: var(--risk-safe); background: linear-gradient(180deg, rgba(167,243,208,.15), transparent), var(--panel); }
    .coverage-cell.buffer { border-top-color: var(--risk-buffer); background: linear-gradient(180deg, rgba(52,211,153,.14), transparent), var(--panel); }
    .coverage-cell.watch { border-top-color: var(--risk-watch); background: linear-gradient(180deg, rgba(250,204,21,.13), transparent), var(--panel); }
    .coverage-cell.near { border-top-color: var(--risk-near); background: linear-gradient(180deg, rgba(249,115,22,.14), transparent), var(--panel); }
    .coverage-cell.critical { border-top-color: var(--risk-critical); background: linear-gradient(180deg, rgba(153,27,27,.25), transparent), var(--panel); }
    .coverage-cell.unavailable { border-top-color: var(--line); }
    .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(420px, 1fr)); gap: 18px; }
    .chart-stack { display: grid; grid-template-columns: 1fr; gap: 18px; }
    .panel, .takeaway { padding: 22px; margin: 18px 0; }
    .chart-heading { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; flex-wrap: wrap; }
    .chart-heading { margin-bottom: 10px; }
    .chart-heading h2 { margin: 0; }
    .chart-heading-copy { flex: 1 1 440px; min-width: 0; }
    .chart-question { max-width: 920px; margin: 6px 0 0; padding-left: 11px; border-left: 2px solid rgba(62,220,129,.56); color: #c8d9e7; font-size: .86rem; line-height: 1.45; }
    .chart-timeframes { display: flex; flex-wrap: wrap; gap: 5px; }
    .chart-timeframes button { min-width: 54px; padding: 7px 9px; border-radius: 6px; font-size: .72rem; line-height: 1.1; color: var(--muted); }
    .chart-timeframes button.active { border-color: rgba(62,220,129,.68); background: rgba(25,181,254,.13); color: var(--text); }
    .chart-help { margin: 0 0 10px; color: var(--muted); font-size: .78rem; }
    .chart { min-height: 390px; }
    .chart svg { width: 100%; min-height: 390px; display: block; }
    .axis { fill: var(--muted); font-size: 15px; }
    .legend { display: flex; flex-wrap: wrap; gap: 14px; color: var(--muted); margin: 8px 0 16px; }
    .legend span::before { content: ""; display: inline-block; width: 12px; height: 12px; border-radius: 99px; margin-right: 7px; background: currentColor; }
    .hidden { display: none !important; }
    .interactive-chart { display: grid; gap: 12px; min-width: 0; }
    .chart-live-toolbar, .chart-navigator-head {
      display: flex; align-items: center; justify-content: space-between; gap: 14px; flex-wrap: wrap;
    }
    .chart-live-toolbar { min-height: 42px; padding: 6px 0 2px; }
    .chart-live-legend { display: flex; align-items: center; gap: 16px; flex-wrap: wrap; min-width: 0; }
    .chart-live-legend-item { display: inline-flex; align-items: center; gap: 7px; padding: 4px 5px; border: 0; border-radius: 5px; background: transparent; color: var(--muted); font-size: .8rem; white-space: nowrap; }
    .chart-live-legend-item:hover, .chart-live-legend-item:focus-visible { background: rgba(25,181,254,.08); color: var(--text); }
    .chart-live-legend-item.muted { opacity: .38; }
    .chart-live-line { display: inline-block; width: 20px; height: 3px; border-radius: 99px; flex: 0 0 auto; }
    .chart-live-line.bar { height: 9px; border-radius: 2px; }
    .chart-live-line.point { width: 9px; height: 9px; border-radius: 50%; }
    .chart-live-line.dashed { height: 0; border-top: 2px dashed currentColor; border-radius: 0; background: transparent; }
    .chart-live-tools { display: flex; align-items: center; gap: 7px; flex-wrap: wrap; }
    .chart-mode-group { display: flex; gap: 3px; padding: 3px; border: 1px solid var(--line); border-radius: 8px; background: rgba(7,21,34,.72); }
    .chart-mode-button, .chart-icon-button {
      min-width: 34px; padding: 6px 9px; border-radius: 6px; background: transparent; color: var(--muted); font-size: .72rem;
    }
    .chart-mode-button.active { border-color: rgba(25,181,254,.5); background: rgba(25,181,254,.13); color: var(--text); }
    .chart-icon-button:hover, .chart-mode-button:hover { border-color: rgba(62,220,129,.55); color: var(--text); }
    .chart-main-shell { position: relative; width: 100%; min-height: 420px; overflow: hidden; border: 1px solid rgba(36,72,102,.6); border-radius: 8px; background: rgba(7,21,34,.38); touch-action: pan-y; }
    .chart-y-scale-tools { position: absolute; z-index: 3; top: 8px; left: 8px; display: flex; align-items: center; gap: 7px; color: var(--muted); font-size: .72rem; }
    .chart-y-scale-tools[hidden] { display: none; }
    .chart-y-scale-tools > span { font-weight: 800; letter-spacing: .02em; }
    .chart svg.chart-main { width: 100%; height: 420px; min-height: 420px; display: block; cursor: crosshair; user-select: none; }
    .chart svg.chart-main.pan-cursor { cursor: grab; }
    .chart svg.chart-main.pan-cursor.dragging { cursor: grabbing; }
    .chart svg.chart-main.y-scaling { cursor: ns-resize; }
    .chart-y-axis-drag-target { cursor: ns-resize; touch-action: none; }
    .chart-y-axis-drag-target:focus-visible { outline: none; fill: rgba(25,181,254,.07); stroke: rgba(62,220,129,.8); stroke-width: 1; }
    .chart-tooltip {
      position: absolute; z-index: 5; min-width: 190px; padding: 11px 12px; border: 1px solid rgba(36,72,102,.95); border-radius: 8px;
      background: rgba(7,21,34,.96); box-shadow: 0 14px 34px rgba(0,0,0,.38); pointer-events: none; opacity: 0; transform: translateY(4px); transition: opacity .12s ease, transform .12s ease;
    }
    .chart-tooltip.visible { opacity: 1; transform: none; }
    .chart-tooltip[hidden] { display: none; }
    .chart-tooltip-date { margin-bottom: 7px; color: var(--muted); font-size: .75rem; }
    .chart-tooltip-row { display: flex; align-items: center; justify-content: space-between; gap: 18px; font-size: .78rem; }
    .chart-tooltip-row + .chart-tooltip-row { margin-top: 5px; }
    .chart-tooltip-value { color: var(--text); font-weight: 800; }
    .chart-navigator-head { color: var(--muted); font-size: .75rem; }
    .chart-visible-range { color: var(--text); font-weight: 700; }
    .chart-date-controls { display: flex; align-items: end; gap: 9px; flex-wrap: wrap; }
    .chart-date-controls label { gap: 4px; color: var(--muted); font-size: .7rem; }
    .chart-date-controls input { width: 148px; min-width: 0; padding: 7px 9px; border-radius: 6px; color-scheme: dark; font-size: .75rem; }
    .chart-section-heading { margin: 34px 0 8px; font-size: clamp(1.35rem, 2.2vw, 1.9rem); }
    .chart-section-copy { margin: 0 0 16px; max-width: 1050px; color: var(--muted); }
    .chart svg.chart-navigator { width: 100%; height: 72px; min-height: 72px; display: block; border: 1px solid rgba(36,72,102,.6); border-radius: 8px; background: rgba(7,21,34,.55); cursor: ew-resize; touch-action: none; }
    .chart-comparison { position: relative; padding: 14px 44px 14px 16px; border: 1px solid rgba(25,181,254,.38); border-radius: 8px; background: linear-gradient(90deg, rgba(25,181,254,.08), rgba(62,220,129,.05)); }
    .chart-comparison h3 { margin: 0 0 8px; font-size: .88rem; }
    .chart-comparison p { margin: 4px 0; color: var(--muted); font-size: .78rem; }
    .chart-comparison .chart-icon-button { position: absolute; top: 9px; right: 9px; }
    .chart-range-summary { overflow-x: auto; border: 1px solid rgba(36,72,102,.58); border-radius: 8px; }
    .chart-summary-period { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 9px 12px; border-bottom: 1px solid rgba(36,72,102,.58); color: var(--muted); font-size: .75rem; }
    .chart-summary-period strong { color: var(--text); font-size: .78rem; }
    .chart-empty { min-height: 220px; display: grid; place-items: center; color: var(--muted); border: 1px dashed var(--line); border-radius: 8px; }
    .breakdown-chart { position: relative; min-width: 0; min-height: 150px; }
    .breakdown-tooltip[hidden] { display: none; }
    .breakdown-scroll { scrollbar-color: var(--line) transparent; }
    .chart-summary-row { display: grid; grid-template-columns: minmax(130px, 1.1fr) repeat(4, minmax(105px, 1fr)); min-width: 650px; align-items: center; }
    .chart-summary-row + .chart-summary-row { border-top: 1px solid rgba(36,72,102,.48); }
    .chart-summary-label, .chart-summary-values > span { padding: 10px 12px; }
    .chart-summary-label { display: flex; align-items: center; gap: 7px; color: var(--text); font-size: .78rem; font-weight: 800; }
    .chart-summary-values { display: contents; }
    .chart-summary-values > span { color: var(--muted); font-size: .75rem; }
    .chart-summary-values strong { display: block; margin-top: 2px; color: var(--text); font-size: .78rem; }
    table { width: 100%; border-collapse: collapse; font-size: 1rem; }
    th, td { text-align: left; padding: 12px 10px; border-bottom: 1px solid rgba(36,72,102,.75); vertical-align: top; }
    th { color: var(--mint); font-weight: 800; }
    .table-scroll { max-height: 620px; overflow: auto; border: 1px solid rgba(36,72,102,.58); border-radius: 8px; }
    .table-scroll thead { position: sticky; top: 0; z-index: 1; background: var(--panel2); }
    .data-tables { margin-top: 46px; padding-top: 8px; border-top: 1px solid rgba(36,72,102,.72); }
    .data-table-grid { display: grid; grid-template-columns: 1fr; gap: 18px; }
    .controls { display: flex; gap: 12px; flex-wrap: wrap; align-items: end; margin: 18px 0; }
    label { display: grid; gap: 6px; color: var(--muted); }
    select { min-width: 280px; }
    @media (max-width: 760px) {
      body { font-size: 16px; }
      .analytics-nav { margin-inline: -4px; padding-inline: 10px; }
      .nav-location { font-size: .72rem; }
      .market-context, .market-context label { align-items: stretch; flex-direction: column; gap: 5px; }
      .market-context select { width: 100%; min-width: 0; }
      .grid { grid-template-columns: 1fr; }
      .header-row { align-items: flex-start; flex-direction: column; }
      .header-utilities { width: 100%; justify-items: stretch; }
      .header-actions { justify-content: flex-start; }
      .data-status-button { justify-self: start; }
      .data-status-dialog { width: calc(100% - 18px); max-height: 96vh; }
      .data-status-dialog-heading, .data-status-headline { align-items: flex-start; flex-direction: column; }
      .data-status-coverage, .loan-population-legend, .data-status-limitations, .data-status-technical-grid, .data-status-audit-rules { grid-template-columns: 1fr; }
      .data-status-check { grid-template-columns: 1fr; gap: 7px; }
      .data-status-audit-row, .data-status-audit-evidence { grid-template-columns: 1fr; gap: 5px; }
      .data-status-operands { margin-left: 0; }
      .chart-heading, .chart-live-toolbar { align-items: flex-start; }
      .chart-timeframes { width: 100%; }
      .chart-timeframes button { flex: 1; min-width: 46px; }
      .chart-live-legend { display: grid; gap: 5px; }
      .chart-live-tools { margin-left: auto; }
      .chart-date-controls { display: grid; grid-template-columns: 1fr 1fr; align-items: end; }
      .chart-date-controls input { width: 100%; }
      .chart svg.chart-main, .chart-main-shell { height: 360px; min-height: 360px; }
      .chart-icon-button[data-chart-action="zoom-in"], .chart-icon-button[data-chart-action="zoom-out"] { display: none; }
    }
    @media (prefers-reduced-motion: reduce) { .chart-tooltip { transition: none; } }
  </style>
</head>
<body>
  <header>
    <div class="header-row">
      <div class="brand">
        <img src="__LIQWID_LOGO__" alt="Liqwid">
        <div>
          <h1>Liqwid analysis viewer</h1>
          <p id="subtitle">Market dynamics monitor</p>
        </div>
      </div>
      <div class="header-utilities">
        <div class="header-actions">
          <button id="openAnotherDataButton" class="primary" type="button" hidden>Open another data archive</button>
          <button id="saveDataButton" type="button" hidden>Save data</button>
          <button id="fetchNewDataButton" type="button" hidden>Fetch new data</button>
        </div>
        <button id="dataStatusButton" class="data-status-button" type="button" aria-haspopup="dialog" aria-controls="dataStatusDialog" hidden>Data status <span id="dataStatusButtonSummary"></span></button>
      </div>
    </div>
    <p id="refreshStatus" class="refresh-status" role="status" hidden></p>
  </header>
  <main>
    <nav id="analyticsNav" class="analytics-nav" aria-label="Analytics navigation">
      <div id="analysisLocation" class="nav-location" aria-live="polite"></div>
      <div id="scopeTabs" class="tabs scope-tabs" role="tablist" aria-label="Analytics scope"></div>
      <div id="marketContext" class="market-context" hidden></div>
      <div id="sectionTabs" class="tabs section-tabs" role="tablist" aria-label="Analysis section"></div>
    </nav>
    <section id="overview" class="view active"></section>
    <section id="protocolDebtFlows" class="view"></section>
    <section id="protocolInterestFlows" class="view"></section>
    <section id="protocolStablecoinYields" class="view"></section>
    <section id="revenue" class="view"></section>
    <section id="liquidations" class="view"></section>
    <section id="exposure" class="view"></section>
    <section id="impact" class="view"></section>
    <section id="protocolParticipation" class="view"></section>
    <section id="protocolLqToken" class="view"></section>
    <section id="protocolParameters" class="view"></section>
    <section id="protocolPol" class="view"></section>
    <section id="marketOverview" class="view"></section>
    <section id="marketRepayments" class="view"></section>
    <section id="marketInterest" class="view"></section>
    <section id="marketRevenue" class="view"></section>
    <section id="marketHealth" class="view"></section>
    <section id="marketParticipation" class="view"></section>
    <section id="marketParameters" class="view"></section>
    <section id="marketPol" class="view"></section>
  </main>
  <input id="dataArchiveFileInput" class="screen-reader-only" type="file" accept=".zip,application/zip" aria-label="Open an existing Liqwid data archive">
  <dialog id="fullHistoryConfirmDialog" class="fetch-confirm-dialog" aria-labelledby="fullHistoryDialogTitle">
    <form method="dialog">
      <h2 id="fullHistoryDialogTitle">Fetch the complete Liqwid data history?</h2>
      <p class="fetch-warning">This requests every available market from its earliest active day, plus liquidation, revenue, and current loan data. It can make many API requests and take several minutes.</p>
      <p>Nothing will be fetched until you confirm. You will choose where the resulting data is saved next.</p>
      <div class="dialog-actions">
        <button id="cancelFullHistoryButton" type="submit" value="cancel">Cancel</button>
        <button id="confirmFullHistoryButton" class="primary" type="submit" value="confirm">Fetch full history</button>
      </div>
    </form>
  </dialog>
  <dialog id="dataStatusDialog" class="data-status-dialog" aria-labelledby="dataStatusDialogTitle">
    <div class="data-status-shell">
      <div class="data-status-dialog-heading">
        <div>
          <h2 id="dataStatusDialogTitle">Data status</h2>
          <p>Coverage, population boundaries, and the checks that determine how confidently this archive can be interpreted.</p>
        </div>
        <button id="closeDataStatusButton" type="button">Close</button>
      </div>
      <div id="dataStatusContent"></div>
    </div>
  </dialog>
  <script id="payload" type="application/json">__LIQWID_PAYLOAD__</script>
  <script>
    const VIEWER_BUILD = "__LIQWID_VIEWER_BUILD__";
    __LIQWID_BROWSER_DATA__

    const initialPayload = JSON.parse(document.querySelector("#payload").textContent);
    let bundle = initialPayload.bundle;
    let deep = initialPayload.deep;
    const analyticsScopes = [
      ["protocol", "Protocol analytics", [
        ["overview", "Liquidity"],
        ["protocolDebtFlows", "Debt flows"],
        ["protocolInterestFlows", "Interest flows"],
        ["protocolStablecoinYields", "USD stablecoin yields"],
        ["revenue", "Revenue"],
        ["liquidations", "Liquidations"],
        ["exposure", "Exposure"],
        ["impact", "Market impact"],
        ["protocolParticipation", "Participation and concentration"],
        ["protocolLqToken", "LQ token & staking"],
        ["protocolParameters", "Risk & Parameters"],
        ["protocolPol", "Protocol-Owned Liquidity (POL)"]
      ]],
      ["markets", "Market analytics", [
        ["marketOverview", "Liquidity & Rates"],
        ["marketRepayments", "Debt flows"],
        ["marketInterest", "Interest flows"],
        ["marketRevenue", "Revenue"],
        ["marketHealth", "Health"],
        ["marketParticipation", "Participation and concentration"],
        ["marketParameters", "Parameters History"],
        ["marketPol", "Protocol-Owned Liquidity (POL)"]
      ]]
    ];
    const views = analyticsScopes.flatMap(([, , scopeViews]) => scopeViews);
    const chartTimeframes = [["week", "Week"], ["month", "Month"], ["quarter", "3 months"], ["ytd", "YTD"], ["year", "Year"], ["all", "All"]];
    const APP_KPI_METADATA = Object.freeze({
    "Active POL positions": {
        "description": "Count of active borrowing markets utilized for Protocol-Owned Liquidity.",
        "explanation": "Number of distinct stablecoin markets currently carrying active POL loan balances.",
        "formulaHtml": '<div class="formula-card"><span class="formula-func">count</span><span class="formula-paren">(</span><span class="formula-num">Active POL Markets</span><span class="formula-paren">)</span></div>',
        "formulaText": "count(Active POL Markets)"
    },
    "Total POL debt": {
        "description": "Total USD borrow debt across all Protocol-Owned Liquidity (POL) positions.",
        "explanation": "Sum of outstanding borrow balances across all active protocol/team-owned liquidity loans (DJED, USDM, wanUSDC, iUSD), converted to USD at current market prices.",
        "formulaHtml": '<div class="formula-card">&sum;<sub>POL loans</sub> <span class="formula-num">Debt<sub>USD</sub></span></div>',
        "formulaText": "sum(POL Loan Debt USD)"
    },
    "POL share of protocol borrow": {
        "description": "Percentage of total protocol borrow represented by Protocol-Owned Liquidity (POL) positions.",
        "explanation": "Share of all active outstanding borrow obligations across the entire protocol attributable to governance-managed POL loans.",
        "formulaHtml": '<div class="formula-card"><div class="formula-frac"><span class="formula-num">&sum; POL Debt<sub>USD</sub></span><span class="formula-den">Total Protocol Borrow<sub>USD</sub></span></div></div>',
        "formulaText": "sum(POL Debt USD) / Total Protocol Borrow USD"
    },
    "Locked POL collateral": {
        "description": "Total locked qPOL tokens and market value backing POL loans.",
        "explanation": "Total quantity and USD valuation of qPOL tokens deposited as collateral in the Plutus loan validator for protocol infrastructure financing.",
        "formulaHtml": '<div class="formula-card">&sum;<sub>POL loans</sub> <span class="formula-num">Collateral Tokens &times; Price<sub>USD</sub></span></div>',
        "formulaText": "sum(POL Collateral qTokens * Price USD)"
    },
    "Weighted average borrow APY": {
        "description": "Debt-weighted average borrow APY paid by POL positions.",
        "explanation": "Average interest rate paid annually by the protocol on its POL borrows, weighted by each market's outstanding POL debt balance.",
        "formulaHtml": '<div class="formula-card"><div class="formula-frac"><span class="formula-num">&sum; (Debt<sub>i</sub> &times; APY<sub>i</sub>)</span><span class="formula-den">&sum; Debt<sub>i</sub></span></div></div>',
        "formulaText": "sum(Debt_i * APY_i) / sum(Debt_i)"
    },
    "POL active debt": {
        "description": "Total active borrow balance held by Protocol-Owned Liquidity loans.",
        "explanation": "Sum of all active POL loan balances, backed by qPOL under governance-weighted liquidation immunity.",
        "formulaHtml": '<div class="formula-card">&sum;<sub>POL</sub> <span class="formula-num">Debt<sub>USD</sub></span></div>',
        "formulaText": "sum(POL Debt USD)"
    },
    "POL collateral value": {
        "description": "Total USD market value of qPOL collateral backing POL loans.",
        "explanation": "Current market valuation of all qPOL tokens locked to back POL borrow positions.",
        "formulaHtml": '<div class="formula-card">&sum;<sub>POL</sub> <span class="formula-num">Collateral<sub>USD</sub></span></div>',
        "formulaText": "sum(POL Collateral USD)"
    },
    "Liquidation status": {
        "description": "On-chain liquidation immunity status of Protocol-Owned Liquidity loans.",
        "explanation": "Indicates that the Plutus smart contracts enforce a 100x collateral weight and 0% liquidation penalty for qPOL, rendering POL positions immune from third-party liquidations.",
        "formulaHtml": '<div class="formula-card"><span class="formula-text">Immune: collateralWeight=100, liquidationPenalty=0%</span></div>',
        "formulaText": "Immune (collateralWeight = 100, penalty = 0%)"
    },
    "POL share of market borrow": {
        "description": "Percentage of this market's total active borrow represented by Protocol-Owned Liquidity (POL).",
        "explanation": "Share of this market's total outstanding borrow obligations attributable to the protocol team's governance-managed POL loan.",
        "formulaHtml": '<div class="formula-card"><div class="formula-frac"><span class="formula-num">Market POL Debt<sub>USD</sub></span><span class="formula-den">Market Total Borrow<sub>USD</sub></span></div></div>',
        "formulaText": "Market POL Debt USD / Market Total Borrow USD"
    },
    "Market POL debt": {
        "description": "Total USD borrow debt obligation owed by this market's Protocol-Owned Liquidity (POL) position.",
        "explanation": "Outstanding borrow principal and accrued interest owed by the team/protocol development financing loan in this specific market.",
        "formulaHtml": '<div class="formula-card"><span class="formula-num">POL Loan Adjusted Debt<sub>USD</sub></span></div>',
        "formulaText": "POL Loan Adjusted Debt USD"
    },
    "Locked qPOL collateral": {
        "description": "Quantity and USD market value of locked qPOL tokens deposited as collateral for this market's POL loan.",
        "explanation": "Amount of qPOL tokens locked in the Plutus loan validator contract backing this market's protocol liquidity position.",
        "formulaHtml": '<div class="formula-card"><span class="formula-num">qPOL Token Count</span> &times; <span class="formula-num">qPOL Price<sub>USD</sub></span></div>',
        "formulaText": "qPOL Token Count * qPOL Price USD"
    },
    "Nominal LTV vs Health Factor": {
        "description": "Nominal loan-to-value ratio compared to effective on-chain smart contract Health Factor.",
        "explanation": "Nominal LTV is unweighted debt divided by nominal collateral value. Health Factor applies the 100x collateral weight multiplier defined in Liqwid market governance.",
        "formulaHtml": '<div class="formula-card"><span class="formula-text">LTV:</span> <div class="formula-frac"><span class="formula-num">Debt</span><span class="formula-den">Collateral</span></div> &middot; <span class="formula-text">HF:</span> <div class="formula-frac"><span class="formula-num">Collateral &times; 100</span><span class="formula-den">Debt</span></div></div>',
        "formulaText": "Nominal LTV = Debt / Collateral, Health Factor = (Collateral * 100) / Debt"
    },
    "Nominal Health Factor": {
        "description": "Unweighted nominal Health Factor without governance collateral multiplier.",
        "explanation": "Ratio of deposited collateral market value to outstanding borrow debt without applying governance multiplier weighting.",
        "formulaHtml": '<div class="formula-card"><div class="formula-frac"><span class="formula-num">Collateral</span><span class="formula-den">Debt</span></div></div>',
        "formulaText": "Collateral / Debt"
    },
    "Annual interest yield paid": {
        "description": "Projected annual interest cash flow paid across Protocol-Owned Liquidity (POL) positions at current borrow rates (not historical interest paid).",
        "explanation": "Forward-looking annual interest run-rate calculated as current outstanding POL debt multiplied by the current market borrow APY for each position (summed across all 4 positions at protocol level, or for the selected market). Reflects the current annualized financing cost flowing directly into supplier deposit yields and protocol reserves.",
        "formulaHtml": '<div class="formula-card">&sum;<sub>POL loans</sub> <span class="formula-num">Current Debt<sub>USD</sub></span> &times; <span class="formula-num">Current Borrow APY</span></div>',
        "formulaText": "sum(Current POL Debt USD * Current Borrow APY)",
        "note": "Projection at current snapshot borrow rates, not cumulative past interest."
    },
    "Annual interest yield paid (at current rates)": {
        "description": "Projected annual interest cash flow paid across Protocol-Owned Liquidity (POL) positions at current borrow rates (not historical interest paid).",
        "explanation": "Forward-looking annual interest run-rate calculated as current outstanding POL debt multiplied by the current market borrow APY for each position (summed across all 4 positions at protocol level, or for the selected market). Reflects the current annualized financing cost flowing directly into supplier deposit yields and protocol reserves.",
        "formulaHtml": '<div class="formula-card">&sum;<sub>POL loans</sub> <span class="formula-num">Current Debt<sub>USD</sub></span> &times; <span class="formula-num">Current Borrow APY</span></div>',
        "formulaText": "sum(Current POL Debt USD * Current Borrow APY)",
        "note": "Projection at current snapshot borrow rates, not cumulative past interest."
    },
    "Active-debt positions": {
        "description": "Count of active loan positions with non-zero borrow balance.",
        "explanation": "Number of active user borrowing positions currently holding non-zero debt in the snapshot.",
        "formulaHtml": '<div class="formula-card"><span class="formula-func">count</span><span class="formula-paren">(</span><span class="formula-num">Loans with Debt &gt; $0</span><span class="formula-paren">)</span></div>',
        "formulaText": "count(Loans with Debt > 0)",
        "note": "Excludes governance-protected POL loans."
    },
    "Active-loan debt": {
        "description": "Total USD borrow debt held by active loan positions.",
        "explanation": "Sum of all outstanding borrow balances across active user loan positions, converted to USD at current asset prices.",
        "formulaHtml": '<div class="formula-card">&sum; <span class="formula-num">Loan Debt<sub>USD</sub></span></div>',
        "formulaText": "sum(Loan Debt USD)",
        "note": "Excludes governance-protected POL loans."
    },
    "Annualized run rate": {
        "description": "Annualized DAO revenue pace based on the latest 90 consecutive complete daily allocations.",
        "explanation": "Annualizes the sum of official DAO revenue over the latest 90 consecutive complete UTC days. The current UTC day and any incomplete or failed rows are excluded.",
        "formulaHtml": '<div class="formula-card"><span class="formula-num">DAO Revenue<sub>90d</sub></span> &times; <div class="formula-frac"><span class="formula-num">365.25</span><span class="formula-den">90</span></div></div>',
        "formulaText": "Revenue_90d * (365.25 / 90)"
    },
    "Bad debt": {
        "description": "Total USD debt where outstanding borrow exceeds total collateral value.",
        "explanation": "Uncollateralized shortfall where an active loan's debt balance exceeds its collateral value (Debt > Collateral). Features two key components: Gross Debt (total borrow balance of undercollateralized loans) and Net Shortfall (uncollateralized loss exposure: Debt - Collateral).",
        "formulaHtml": '<div class="formula-card"><div style="margin-bottom:4px"><strong>Gross Debt:</strong> &sum;<sub>Debt<sub>i</sub> &gt; Collateral<sub>i</sub></sub> <span class="formula-num">Debt<sub>i</sub></span></div><div><strong>Net Shortfall:</strong> &sum;<sub>Debt<sub>i</sub> &gt; Collateral<sub>i</sub></sub> <span class="formula-paren">(</span><span class="formula-num">Debt<sub>i</sub></span> &minus; <span class="formula-num">Collateral<sub>i</sub></span><span class="formula-paren">)</span></div></div>',
        "formulaText": "Gross = sum(Debt where Debt > Collateral); Net Shortfall = sum(max(0, Debt - Collateral))",
        "note": "Excludes governance-protected POL loans."
    },
    "Bad debt in silo": {
        "description": "Total USD debt in this silo where loan borrow exceeds collateral value.",
        "explanation": "Uncollateralized shortfall isolated entirely within this silo, posing zero contagion risk to the core cross-margin protocol.",
        "formulaHtml": '<div class="formula-card">&sum;<sub>Debt &gt; Collateral</sub> <span class="formula-paren">(</span><span class="formula-num">Debt</span> &minus; <span class="formula-num">Collateral</span><span class="formula-paren">)</span></div>',
        "formulaText": "sum(max(0, Debt - Collateral))"
    },
    "Bad-debt positions": {
        "description": "Count of active loans where borrow exceeds collateral value.",
        "explanation": "Number of undercollateralized user loan positions currently in bad debt state (Debt > Collateral).",
        "formulaHtml": '<div class="formula-card"><span class="formula-func">count</span><span class="formula-paren">(</span><span class="formula-num">Loans where Debt &gt; Collateral</span><span class="formula-paren">)</span></div>',
        "formulaText": "count(Loans where Debt > Collateral)",
        "note": "Excludes governance-protected POL loans."
    },
    "Batched Market Borrow": {
        "description": "Official on-chain aggregate market borrow balance from the 4-hour batch cycle state.",
        "explanation": "Total active market debt registered on the official protocol contract, updated every 4 hours via off-chain batching cycles. Between batch updates, individual loan interest accrues live off-batch.",
        "formulaHtml": '<div class="formula-card"><span class="formula-num">Market Borrow<sub>native</sub></span> &times; <span class="formula-num">Price<sub>USD</sub></span></div>',
        "formulaText": "Market Borrow Native * Price USD"
    },
    "Borrow": {
        "description": "Total USD value of active outstanding loans.",
        "explanation": "Sum of all active principal loan balances borrowed by users across Liqwid pools, converted to USD at current market prices.",
        "formulaHtml": '<div class="formula-card">&sum; <span class="formula-num">Borrow<sub>native, i</sub></span> &times; <span class="formula-num">Price<sub>USD, i</sub></span></div>',
        "formulaText": "sum(Borrow_i * Price_i)"
    },
    "Borrow APR": {
        "description": "Annualized interest rate charged to borrowers in this market.",
        "explanation": "Current annualized borrowing cost determined by the interest rate model curve at current pool utilization.",
        "formulaHtml": '<div class="formula-card"><span class="formula-num">Borrow APR</span><span class="formula-paren">(</span><span class="formula-num">Utilization</span><span class="formula-paren">)</span></div>',
        "formulaText": "Borrow APR at current utilization"
    },
    "Borrowed asset under most pressure": {
        "description": "Market pool currently experiencing the highest borrow-to-liquidity utilization stress.",
        "explanation": "Identifies the borrowed asset market pool with the highest capital utilization ratio (Borrow / Supply), indicating where borrowing is closest to maximum pool capacity and available liquidity reserves are most strained.",
        "formulaHtml": '<div class="formula-card"><span class="formula-func">max</span><sub>i</sub> <div class="formula-frac"><span class="formula-num">Borrow<sub>i</sub></span><span class="formula-den">Supply<sub>i</sub></span></div></div>',
        "formulaText": "max_i(Borrow_i / Supply_i)"
    },
    "Borrowed asset with highest bad debt": {
        "description": "Market asset account with the largest undercollateralized debt shortfall.",
        "explanation": "Identifies the borrowed token market carrying the largest dollar amount of bad debt. Bad debt occurs when an active loan position's debt balance exceeds its collateral value (Debt > Collateral). Shows both gross debt (total borrow balance of underwater loans in this market) and net shortfall (uncollateralized deficit: Debt - Collateral).",
        "formulaHtml": '<div class="formula-card"><div style="margin-bottom:4px"><strong>Market Selection:</strong> <span class="formula-func">max</span><sub>i</sub> <span class="formula-paren">(</span>&sum;<sub>loans &in; i, Debt &gt; Collateral</sub> <span class="formula-num">Debt</span><span class="formula-paren">)</span></div><div style="font-size:.76rem;color:#8fa9bf"><strong>Net Shortfall:</strong> &sum;<sub>loans &in; i</sub> <span class="formula-paren">(</span><span class="formula-num">Debt</span> &minus; <span class="formula-num">Collateral</span><span class="formula-paren">)</span></div></div>',
        "formulaText": "max_i(Gross Bad Debt USD_i); Net Shortfall_i = sum(max(0, Debt - Collateral))",
        "note": "Excludes governance-protected POL loans."
    },
    "Change vs prior 90 days": {
        "description": "Percentage change in metric compared to previous 90-day period.",
        "explanation": "Measures growth or contraction between fee revenue allocated over the trailing 90 days and the preceding 90-day window.",
        "formulaHtml": '<div class="formula-card"><div class="formula-frac"><span class="formula-num">Current<sub>90d</sub> &minus; Prior<sub>90d</sub></span><span class="formula-den">Prior<sub>90d</sub></span></div></div>',
        "formulaText": "(Current_90d - Prior_90d) / Prior_90d"
    },
    "Collateral asset with linked highest bad debt": {
        "description": "Collateral token type protecting the largest bad-debt position.",
        "explanation": "Identifies the primary collateral asset backing positions that entered an undercollateralized state (Debt > Collateral). Shows the gross debt and net shortfall associated with that collateral asset type.",
        "formulaHtml": '<div class="formula-card"><span class="formula-num">Collateral Asset of max<sub>i</sub> (Bad Debt<sub>USD, i</sub>)</span></div>',
        "formulaText": "Collateral Asset linked to Max Bad Debt",
        "note": "Excludes governance-protected POL loans."
    },
    "Collateral coverage ratio": {
        "description": "Ratio of total silo collateral value to total silo outstanding debt.",
        "explanation": "Measures total collateral backing per dollar of active borrow in this isolated silo. Above 100% means silo is solvent.",
        "formulaHtml": '<div class="formula-card"><div class="formula-frac"><span class="formula-num">Total Collateral<sub>USD</sub></span><span class="formula-den">Total Borrow<sub>USD</sub></span></div></div>',
        "formulaText": "Total Collateral USD / Total Borrow USD"
    },
    "Critical debt at HF <= 1.10": {
        "description": "Total USD debt in positions with Health Factor <= 1.10.",
        "explanation": "Sum of outstanding debt held by active loans with Health Factor (HF) <= 1.10, indicating borrowing within 10% of liquidation threshold. HF = (Collateral * LiqThreshold) / Borrow.",
        "formulaHtml": '<div class="formula-card">&sum;<sub>HF &le; 1.10</sub> <span class="formula-num">Debt<sub>USD</sub></span> &nbsp; where &nbsp; <span class="formula-num">HF</span> = <div class="formula-frac"><span class="formula-num">Collateral &times; LiqThreshold</span><span class="formula-den">Borrow</span></div></div>',
        "formulaText": "sum(Debt where HF <= 1.10)",
        "note": "Excludes governance-protected POL loans."
    },
    "Current days without liquidations": {
        "description": "Consecutive days elapsed since last recorded liquidation.",
        "explanation": "Tracks consecutive elapsed days without a recorded liquidation event across protocol pools.",
        "formulaHtml": '<div class="formula-card"><span class="formula-num">Date<sub>today</sub></span> &minus; <span class="formula-num">Date<sub>last liquidation</sub></span></div>',
        "formulaText": "Today - Last Liquidation Date"
    },
    "Current-valued debt accrued - trailing 30d": {
        "description": "Trailing 30-day inferred debt creation valued at current prices.",
        "explanation": "Inferred daily native debt expansion (positive daily borrow increases plus reported debt repaid) accumulated over trailing 30 days, revalued at current asset prices to eliminate historical price movement distortion.",
        "formulaHtml": '<div class="formula-card">&sum;<sub>30d</sub> <span class="formula-num">&Delta;Borrow<sub>native</sub></span> &times; <span class="formula-num">Price<sub>current</sub></span></div>',
        "formulaText": "sum_30d(Daily Accrued Native * Current Price)"
    },
    "Current-valued debt accrued · trailing 30d": {
        "description": "Trailing 30-day inferred debt creation valued at current prices.",
        "explanation": "Inferred daily native debt expansion (positive daily borrow increases plus reported debt repaid) accumulated over trailing 30 days, revalued at current asset prices to eliminate historical price movement distortion.",
        "formulaHtml": '<div class="formula-card">&sum;<sub>30d</sub> <span class="formula-num">&Delta;Borrow<sub>native</sub></span> &times; <span class="formula-num">Price<sub>current</sub></span></div>',
        "formulaText": "sum_30d(Daily Accrued Native * Current Price)"
    },
    "Current-valued debt coverage - trailing 90d": {
        "description": "90-day ratio of debt repayments to inferred debt creation.",
        "explanation": "Measures principal debt servicing health over trailing 90 days. Valuing both numerator and denominator at current asset price isolates borrower repayment behavior from asset price changes.",
        "formulaHtml": '<div class="formula-card"><div class="formula-frac"><span class="formula-num">Debt Repaid<sub>90d, current USD</sub></span><span class="formula-den">Debt Accrued<sub>90d, current USD</sub></span></div></div>',
        "formulaText": "Debt Repaid 90d USD / Debt Accrued 90d USD"
    },
    "Current-valued debt coverage – trailing 90d": {
        "description": "90-day ratio of debt repayments to inferred debt creation.",
        "explanation": "Measures principal debt servicing health over trailing 90 days. Valuing both numerator and denominator at current asset price isolates borrower repayment behavior from asset price changes.",
        "formulaHtml": '<div class="formula-card"><div class="formula-frac"><span class="formula-num">Debt Repaid<sub>90d, current USD</sub></span><span class="formula-den">Debt Accrued<sub>90d, current USD</sub></span></div></div>',
        "formulaText": "Debt Repaid 90d USD / Debt Accrued 90d USD"
    },
    "Current-valued debt repaid - trailing 30d": {
        "description": "Trailing 30-day debt principal repaid valued at current prices.",
        "explanation": "Reported daily debt principal repayments collected over trailing 30 days, valued at current market prices.",
        "formulaHtml": '<div class="formula-card">&sum;<sub>30d</sub> <span class="formula-num">Repaid<sub>native</sub></span> &times; <span class="formula-num">Price<sub>current</sub></span></div>',
        "formulaText": "sum_30d(Daily Repaid Native * Current Price)"
    },
    "Current-valued debt repaid · trailing 30d": {
        "description": "Trailing 30-day debt principal repaid valued at current prices.",
        "explanation": "Reported daily debt principal repayments collected over trailing 30 days, valued at current market prices.",
        "formulaHtml": '<div class="formula-card">&sum;<sub>30d</sub> <span class="formula-num">Repaid<sub>native</sub></span> &times; <span class="formula-num">Price<sub>current</sub></span></div>',
        "formulaText": "sum_30d(Daily Repaid Native * Current Price)"
    },
    "Current-valued interest accrued - trailing 30d": {
        "description": "Trailing 30-day interest accrued on active borrow debt.",
        "explanation": "Total interest generated by active borrow positions over trailing 30 days, valued at current market prices.",
        "formulaHtml": '<div class="formula-card">&sum;<sub>30d</sub> <span class="formula-num">Interest Accrued<sub>native</sub></span> &times; <span class="formula-num">Price<sub>current</sub></span></div>',
        "formulaText": "sum_30d(Daily Interest Accrued * Current Price)"
    },
    "Current-valued interest accrued · trailing 30d": {
        "description": "Trailing 30-day interest accrued on active borrow debt.",
        "explanation": "Total interest generated by active borrow positions over trailing 30 days, valued at current market prices.",
        "formulaHtml": '<div class="formula-card">&sum;<sub>30d</sub> <span class="formula-num">Interest Accrued<sub>native</sub></span> &times; <span class="formula-num">Price<sub>current</sub></span></div>',
        "formulaText": "sum_30d(Daily Interest Accrued * Current Price)"
    },
    "Current-valued interest coverage 90d": {
        "description": "90-day ratio of interest repaid to interest accrued.",
        "explanation": "Measures interest servicing coverage over trailing 90 days, valued at current asset prices. A ratio of 100% means borrowers are paying all interest accrued by their loans.",
        "formulaHtml": '<div class="formula-card"><div class="formula-frac"><span class="formula-num">Interest Repaid<sub>90d</sub></span><span class="formula-den">Interest Accrued<sub>90d</sub></span></div></div>',
        "formulaText": "Interest Repaid 90d / Interest Accrued 90d"
    },
    "Current-valued interest coverage - trailing 90d": {
        "description": "90-day ratio of interest repaid to interest accrued.",
        "explanation": "Measures interest servicing coverage over trailing 90 days, valued at current asset prices. A ratio of 100% means borrowers are paying all interest accrued by their loans.",
        "formulaHtml": '<div class="formula-card"><div class="formula-frac"><span class="formula-num">Interest Repaid<sub>90d</sub></span><span class="formula-den">Interest Accrued<sub>90d</sub></span></div></div>',
        "formulaText": "Interest Repaid 90d / Interest Accrued 90d"
    },
    "Current-valued interest coverage · trailing 90d": {
        "description": "90-day ratio of interest repaid to interest accrued.",
        "explanation": "Measures interest servicing coverage over trailing 90 days, valued at current asset prices. A ratio of 100% means borrowers are paying all interest accrued by their loans.",
        "formulaHtml": '<div class="formula-card"><div class="formula-frac"><span class="formula-num">Interest Repaid<sub>90d</sub></span><span class="formula-den">Interest Accrued<sub>90d</sub></span></div></div>',
        "formulaText": "Interest Repaid 90d / Interest Accrued 90d"
    },
    "Current-valued cumulative reported interest-flow difference": {
        "description": "Mark-to-market difference between cumulative reported interest accrued and repaid flows.",
        "explanation": "Native interest accrued minus native interest repaid across observable market history, valued at the current observation's implied asset price. This is a historical flow difference, not a current interest receivable; the official API does not expose a current principal-versus-interest balance split.",
        "formulaHtml": '<div class="formula-card">&sum; <span class="formula-paren">(</span><span class="formula-num">Interest Accrued<sub>native</sub></span> &minus; <span class="formula-num">Interest Repaid<sub>native</sub></span><span class="formula-paren">)</span> &times; <span class="formula-num">Price<sub>current</sub></span></div>',
        "formulaText": "sum(Accrued Native - Repaid Native) * Current Price"
    },
    "Current-valued cumulative interest gap": {
        "description": "Mark-to-market difference between cumulative reported interest accrued and repaid flows.",
        "explanation": "Native interest accrued minus native interest repaid across observable market history, valued at the current observation's implied asset price. This is a historical flow difference, not a current interest receivable; the official API does not expose a current principal-versus-interest balance split.",
        "formulaHtml": '<div class="formula-card">&sum; <span class="formula-paren">(</span><span class="formula-num">Interest Accrued<sub>native</sub></span> &minus; <span class="formula-num">Interest Repaid<sub>native</sub></span><span class="formula-paren">)</span> &times; <span class="formula-num">Price<sub>current</sub></span></div>',
        "formulaText": "sum(Accrued Native - Repaid Native) * Current Price"
    },
    "Current-valued cumulative reported debt-flow difference": {
        "description": "Mark-to-market difference between cumulative inferred debt formation and reported repayment.",
        "explanation": "Native inferred debt formation minus native reported debt repayment across observable market history, valued at the current observation's implied asset price. This is not remaining principal; use current outstanding borrow for that balance. Unclassified borrow reductions separately reconcile decreases that reported repayment does not explain.",
        "formulaHtml": '<div class="formula-card">&sum; <span class="formula-paren">(</span><span class="formula-num">Debt Accrued<sub>native</sub></span> &minus; <span class="formula-num">Debt Repaid<sub>native</sub></span><span class="formula-paren">)</span> &times; <span class="formula-num">Price<sub>current</sub></span></div>',
        "formulaText": "sum(Debt Accrued Native - Repaid Native) * Current Price"
    },
    "Current-valued cumulative debt-flow gap": {
        "description": "Mark-to-market difference between cumulative inferred debt formation and reported repayment.",
        "explanation": "Native inferred debt formation minus native reported debt repayment across observable market history, valued at the current observation's implied asset price. This is not remaining principal; use current outstanding borrow for that balance. Unclassified borrow reductions separately reconcile decreases that reported repayment does not explain.",
        "formulaHtml": '<div class="formula-card">&sum; <span class="formula-paren">(</span><span class="formula-num">Debt Accrued<sub>native</sub></span> &minus; <span class="formula-num">Debt Repaid<sub>native</sub></span><span class="formula-paren">)</span> &times; <span class="formula-num">Price<sub>current</sub></span></div>',
        "formulaText": "sum(Debt Accrued Native - Repaid Native) * Current Price"
    },
    "Current-valued interest repaid - trailing 30d": {
        "description": "Trailing 30-day interest payments received from borrowers.",
        "explanation": "Total interest payments collected from borrowers over trailing 30 days, valued at current market prices.",
        "formulaHtml": '<div class="formula-card">&sum;<sub>30d</sub> <span class="formula-num">Interest Repaid<sub>native</sub></span> &times; <span class="formula-num">Price<sub>current</sub></span></div>',
        "formulaText": "sum_30d(Daily Interest Repaid * Current Price)"
    },
    "Current-valued interest repaid · trailing 30d": {
        "description": "Trailing 30-day interest payments received from borrowers.",
        "explanation": "Total interest payments collected from borrowers over trailing 30 days, valued at current market prices.",
        "formulaHtml": '<div class="formula-card">&sum;<sub>30d</sub> <span class="formula-num">Interest Repaid<sub>native</sub></span> &times; <span class="formula-num">Price<sub>current</sub></span></div>',
        "formulaText": "sum_30d(Daily Interest Repaid * Current Price)"
    },
    "YTD collected revenue": {
        "description": "Collected retained-interest and origination revenue in the latest observable calendar year.",
        "explanation": "Sums complete days in the latest collected-revenue calendar year, from January 1 through the latest complete official overview day. It combines repayment-timed retained interest with both origination-fee components.",
        "formulaHtml": '<div class="formula-card">&sum;<sub>latest calendar-year complete days</sub> <span class="formula-paren">(</span><span class="formula-num">revenueFromRepaidInterestInUsd</span> + <span class="formula-num">loanOriginationFeesInUsd</span> + <span class="formula-num">loanOriginationFeesMinAdaInUsd</span><span class="formula-paren">)</span></div>',
        "formulaText": "sum(Latest calendar-year complete days: revenueFromRepaidInterestInUsd + loanOriginationFeesInUsd + loanOriginationFeesMinAdaInUsd)"
    },
    "Revenue from repaid interest": {
        "description": "Year-to-date retained revenue collected when borrowers repay interest.",
        "explanation": "Sums the official revenueFromRepaidInterestInUsd field across complete days in the latest collected-revenue calendar year. This is the retained share going to treasury and stakers, not the borrower's full interest repayment.",
        "formulaHtml": '<div class="formula-card">&sum;<sub>latest calendar-year complete days</sub> <span class="formula-num">revenueFromRepaidInterestInUsd</span></div>',
        "formulaText": "sum(Latest calendar-year complete days: revenueFromRepaidInterestInUsd)"
    },
    "Loan origination fees": {
        "description": "Year-to-date upfront origination fees collected from borrowers.",
        "explanation": "Sums the official base and minimum-ADA origination-fee USD fields across complete days in the latest collected-revenue calendar year.",
        "formulaHtml": '<div class="formula-card">&sum;<sub>latest calendar-year complete days</sub> <span class="formula-paren">(</span><span class="formula-num">loanOriginationFeesInUsd</span> + <span class="formula-num">loanOriginationFeesMinAdaInUsd</span><span class="formula-paren">)</span></div>',
        "formulaText": "sum(Latest calendar-year complete days: loanOriginationFeesInUsd + loanOriginationFeesMinAdaInUsd)"
    },
    "Top revenue market": {
        "description": "Market generating the largest share of year-to-date collected protocol revenue.",
        "explanation": "Identifies the market with the highest sum of attributed retained-interest revenue and direct loan origination fees across complete calendar year-to-date days, and computes its percentage share of protocol YTD collected revenue.",
        "formulaHtml": '<div class="formula-card"><span class="formula-func">argmax</span><sub>market</sub> <span class="formula-paren">(</span><span class="formula-num">Attributed Interest Revenue<sub>YTD</sub></span> + <span class="formula-num">Origination Fees<sub>YTD</sub></span><span class="formula-paren">)</span></div>',
        "formulaText": "argmax_market(Attributed Interest Revenue YTD + Origination Fees YTD)"
    },
    "Collected revenue": {
        "description": "Cumulative repayment-timed retained-interest revenue and upfront origination fees.",
        "explanation": "Sums the official overview field for retained revenue collected when borrowers repay interest, plus base and minimum-ADA origination fees. The repayment-time interest field combines treasury and LQ-staker recipients because the API does not expose that split. Liquidation profit, supplier earnings, staking rewards, and POL accrual are excluded.",
        "formulaHtml": '<div class="formula-card">&sum; <span class="formula-paren">(</span><span class="formula-num">revenueFromRepaidInterestInUsd</span> + <span class="formula-num">loanOriginationFeesInUsd</span> + <span class="formula-num">loanOriginationFeesMinAdaInUsd</span><span class="formula-paren">)</span></div>',
        "formulaText": "sum(revenueFromRepaidInterestInUsd + loanOriginationFeesInUsd + loanOriginationFeesMinAdaInUsd)"
    },
    "Interest revenue collected": {
        "description": "Cumulative retained revenue collected when borrowers repay interest.",
        "explanation": "Uses the official revenueFromRepaidInterestInUsd field. This is the retained share of repaid interest going to treasury and stakers, not the borrower's full interest repayment.",
        "formulaHtml": '<div class="formula-card">&sum; <span class="formula-num">revenueFromRepaidInterestInUsd</span></div>',
        "formulaText": "sum(revenueFromRepaidInterestInUsd)"
    },
    "Origination fees collected": {
        "description": "Cumulative upfront origination fees, including the minimum-ADA component.",
        "explanation": "Adds the official base origination-fee USD field and minimum-ADA origination-fee USD field for every complete day.",
        "formulaHtml": '<div class="formula-card">&sum; <span class="formula-paren">(</span><span class="formula-num">loanOriginationFeesInUsd</span> + <span class="formula-num">loanOriginationFeesMinAdaInUsd</span><span class="formula-paren">)</span></div>',
        "formulaText": "sum(loanOriginationFeesInUsd + loanOriginationFeesMinAdaInUsd)"
    },
    "DAO / treasury revenue": {
        "description": "Cumulative accrual-based protocol revenue allocated to the DAO Treasury.",
        "explanation": "Sums API-reported DAO interest and origination accruals across every complete daily analytics.fees row. This is earned allocation, not repayment-timed collection.",
        "formulaHtml": '<div class="formula-card">&sum;<sub>complete days</sub> <span class="formula-paren">(</span><span class="formula-num">borrowInterestAccruedForProtocol</span> + <span class="formula-num">loanOriginationFeesForProtocol</span><span class="formula-paren">)</span></div>',
        "formulaText": "sum(Complete daily DAO interest + DAO origination allocation USD)"
    },
    "DAO Treasury LQ": {
        "description": "Total LQ tokens held in the DAO Treasury reserve.",
        "explanation": "Reserve balance of LQ tokens held in the protocol DAO Treasury, valued at current LQ market price.",
        "formulaHtml": '<div class="formula-card"><span class="formula-num">Treasury LQ Tokens</span> &times; <span class="formula-num">LQ Price<sub>USD</sub></span></div>',
        "formulaText": "Treasury LQ Tokens * LQ Price USD"
    },
    "DAO interest allocation": {
        "description": "Cumulative interest fee revenue allocated to DAO Treasury.",
        "explanation": "Sums the API-reported DAO interest allocation across complete daily analytics.fees rows through the latest available full day, without applying any secondary allocation formula.",
        "formulaHtml": '<div class="formula-card">&sum;<sub>complete days</sub> <span class="formula-num">borrowInterestAccruedForProtocol<sub>USD</sub></span></div>',
        "formulaText": "sum(Complete daily borrowInterestAccruedForProtocol USD)"
    },
    "DAO origination allocation": {
        "description": "Cumulative loan origination fees allocated to DAO Treasury.",
        "explanation": "Sums the API-reported DAO origination allocation across complete daily analytics.fees rows through the latest available full day.",
        "formulaHtml": '<div class="formula-card">&sum;<sub>complete days</sub> <span class="formula-num">loanOriginationFeesForProtocol<sub>USD</sub></span></div>',
        "formulaText": "sum(Complete daily loanOriginationFeesForProtocol USD)"
    },
    "Days with a market repayment spike": {
        "description": "Count of days where market repayment exceeded 2x active median.",
        "explanation": "Identifies high-repayment burst days where daily repayment exceeded 2.0x the market's trailing 30-day active median repayment level.",
        "formulaHtml": '<div class="formula-card"><span class="formula-func">count</span><span class="formula-paren">(</span><span class="formula-num">Repaid<sub>day</sub> &ge; 2.0 &times; Median</span><span class="formula-paren">)</span></div>',
        "formulaText": "count(Repaid_day >= 2.0 * Median)"
    },
    "Debt at HF < 1.0": {
        "description": "Total USD debt held in liquidatable loans.",
        "explanation": "Total USD debt in active loans where Health Factor (HF) is below 1.00. These loans are undercollateralized or subject to immediate liquidation.",
        "formulaHtml": '<div class="formula-card">&sum;<sub>HF &lt; 1.00</sub> <span class="formula-num">Debt<sub>USD</sub></span></div>',
        "formulaText": "sum(Debt where HF < 1.00)",
        "note": "Excludes governance-protected POL loans."
    },
    "Debt at HF <= 1.25": {
        "description": "Total USD debt near liquidation thresholds.",
        "explanation": "Total USD debt held in active loans with Health Factor (HF) <= 1.25, representing positions close to liquidation threshold.",
        "formulaHtml": '<div class="formula-card">&sum;<sub>HF &le; 1.25</sub> <span class="formula-num">Debt<sub>USD</sub></span></div>',
        "formulaText": "sum(Debt where HF <= 1.25)",
        "note": "Excludes governance-protected POL loans."
    },
    "Debt at critical health": {
        "description": "Total USD debt in loans with Health Factor <= 1.10.",
        "explanation": "Sum of outstanding debt held by active loans with Health Factor (HF) <= 1.10, indicating borrowing within 10% of liquidation threshold.",
        "formulaHtml": '<div class="formula-card">&sum;<sub>HF &le; 1.10</sub> <span class="formula-num">Debt<sub>USD</sub></span></div>',
        "formulaText": "sum(Debt where HF <= 1.10)",
        "note": "Excludes governance-protected POL loans."
    },
    "Debt below HF 1.0": {
        "description": "Total USD debt in undercollateralized loans.",
        "explanation": "Sum of outstanding debt in loans with Health Factor (HF) < 1.00, subject to immediate liquidation.",
        "formulaHtml": '<div class="formula-card">&sum;<sub>HF &lt; 1.00</sub> <span class="formula-num">Debt<sub>USD</sub></span></div>',
        "formulaText": "sum(Debt where HF < 1.00)",
        "note": "Excludes governance-protected POL loans."
    },
    "Debt near liquidation": {
        "description": "Total USD debt in loans with health factor <= 1.25.",
        "explanation": "Sum of outstanding debt in loans with Health Factor (HF) <= 1.25, close to liquidation threshold.",
        "formulaHtml": '<div class="formula-card">&sum;<sub>HF &le; 1.25</sub> <span class="formula-num">Debt<sub>USD</sub></span></div>',
        "formulaText": "sum(Debt where HF <= 1.25)",
        "note": "Excludes governance-protected POL loans."
    },
    "Full-period liquidation profit": {
        "description": "Net protocol revenue earned from liquidation penalties across observable history.",
        "explanation": "Cumulative profit accrued from liquidation fees and collateral discounts across all recorded historical observations.",
        "formulaHtml": '<div class="formula-card">&sum; <span class="formula-num">Liquidation Profit<sub>USD</sub></span></div>',
        "formulaText": "sum(Liquidation Profit USD)"
    },
    "YTD attributed collected revenue": {
        "description": "Year-to-date collected revenue attributed to this market.",
        "explanation": "Adds directly reported market origination fees to a reconciled market attribution of the official protocol retained-interest total. Each complete day's actual protocol retained-interest collection is distributed in proportion to every market's parameter-weighted market repayment. The market allocation is modeled, but its daily protocol total is actual and reconciles exactly.",
        "formulaHtml": '<div class="formula-card">&sum;<sub>YTD eligible days</sub> <span class="formula-paren">(</span><span class="formula-num">official retained interest</span> &times; <span class="formula-frac"><span class="formula-num">market weight</span><span class="formula-den">&sum; all-market weights</span></span> + <span class="formula-num">market origination fees</span><span class="formula-paren">)</span><div>market weight = <span class="formula-num">interestRepaidInUsd &times; protocolInterestShare</span></div></div>',
        "formulaText": "sum(YTD eligible days: official protocol retained interest * marketWeight / sum(allMarketWeights) + market origination fees); marketWeight = interestRepaidInUsd * protocolInterestShare"
    },
    "Attributed interest revenue collected": {
        "description": "Actual protocol retained-interest collections attributed to this selected market.",
        "explanation": "For each complete day, the official revenueFromRepaidInterestInUsd protocol total is allocated by the selected market's share of parameter-weighted repayments. A day is unavailable if any repaying market lacks effective parameters or market repayments fail protocol reconciliation.",
        "formulaHtml": '<div class="formula-card"><span class="formula-num">revenueFromRepaidInterestInUsd</span> &times; <span class="formula-frac"><span class="formula-num">interestRepaidInUsd &times; protocolInterestShare</span><span class="formula-den">&sum;<sub>markets</sub> interestRepaidInUsd &times; protocolInterestShare</span></span></div>',
        "formulaText": "revenueFromRepaidInterestInUsd * (interestRepaidInUsd * protocolInterestShare) / sum(markets: interestRepaidInUsd * protocolInterestShare)"
    },
    "Market origination fees collected": {
        "description": "Directly observable year-to-date revenue collected from this market's loan originations.",
        "explanation": "Sums both official analytics.marketHistory origination-fee USD fields across complete days in the selected market's latest calendar year. It excludes the current partial UTC day.",
        "formulaHtml": '<div class="formula-card">&sum;<sub>YTD complete market days</sub> <span class="formula-paren">(</span><span class="formula-num">loanOriginationFeesInUsd</span> + <span class="formula-num">loanOriginationFeesMinAdaInUsd</span><span class="formula-paren">)</span></div>',
        "formulaText": "sum(YTD complete market days: loanOriginationFeesInUsd + loanOriginationFeesMinAdaInUsd)"
    },
    "Accrued protocol/reserve interest revenue": {
        "description": "Interest accrued to the market's non-supplier protocol or reserve share.",
        "explanation": "Applies the latest parameter effective by each UTC day's end to that day's market interest accrual. This matches Liqwid's accrual-based market revenue presentation but is not repayment-timed cash collection.",
        "formulaHtml": '<div class="formula-card">&sum; <span class="formula-num">interestAccruedInUsd</span> &times; <span class="formula-paren">(</span>1 &minus; <span class="formula-frac"><span class="formula-num">incomeRatioSuppliers</span><span class="formula-den">incomeRatioSum</span></span><span class="formula-paren">)</span></div>',
        "formulaText": "sum(interestAccruedInUsd * (1 - incomeRatioSuppliers / incomeRatioSum))"
    },
    "Accrued supplier interest income": {
        "description": "Interest accrued to suppliers in the selected market.",
        "explanation": "Applies the effective supplier income ratio to market interest accrued. Supplier income is lender yield, not protocol revenue and not proof that cash has been repaid.",
        "formulaHtml": '<div class="formula-card">&sum; <span class="formula-num">interestAccruedInUsd</span> &times; <span class="formula-frac"><span class="formula-num">incomeRatioSuppliers</span><span class="formula-den">incomeRatioSum</span></span></div>',
        "formulaText": "sum(interestAccruedInUsd * incomeRatioSuppliers / incomeRatioSum)"
    },
    "Gross interest accrued": {
        "description": "Total borrower interest accrued before recipient allocation.",
        "explanation": "Sums the official market interestAccruedInUsd flow. It is split between supplier income and the non-supplier protocol or reserve allocation.",
        "formulaHtml": '<div class="formula-card">&sum; <span class="formula-num">interestAccruedInUsd</span></div>',
        "formulaText": "sum(interestAccruedInUsd)"
    },
    "Annualized protocol/reserve interest revenue": {
        "description": "Current annualized protocol or reserve interest run rate.",
        "explanation": "Multiplies the latest complete market borrow balance by its current borrower APR and the effective non-supplier share. It is a point-in-time projection, not collected or guaranteed revenue.",
        "formulaHtml": '<div class="formula-card"><span class="formula-num">borrowInUsd</span> &times; <span class="formula-num">borrowApr</span> &times; <span class="formula-paren">(</span>1 &minus; <span class="formula-frac"><span class="formula-num">incomeRatioSuppliers</span><span class="formula-den">incomeRatioSum</span></span><span class="formula-paren">)</span></div>',
        "formulaText": "borrowInUsd * borrowApr * (1 - incomeRatioSuppliers / incomeRatioSum)"
    },
    "Annualized supplier interest income": {
        "description": "Current annualized supplier interest run rate.",
        "explanation": "Multiplies the latest complete market borrow balance by borrower APR and the effective supplier share. This is projected lender income, not protocol revenue.",
        "formulaHtml": '<div class="formula-card"><span class="formula-num">borrowInUsd</span> &times; <span class="formula-num">borrowApr</span> &times; <span class="formula-frac"><span class="formula-num">incomeRatioSuppliers</span><span class="formula-den">incomeRatioSum</span></span></div>',
        "formulaText": "borrowInUsd * borrowApr * incomeRatioSuppliers / incomeRatioSum"
    },
    "Annualized gross interest income": {
        "description": "Current annualized gross borrower-interest run rate.",
        "explanation": "Multiplies the latest complete market borrow balance by borrower APR. Supplier and protocol or reserve projections divide this gross amount using effective income parameters.",
        "formulaHtml": '<div class="formula-card"><span class="formula-num">borrowInUsd</span> &times; <span class="formula-num">borrowApr</span></div>',
        "formulaText": "borrowInUsd * borrowApr"
    },
    "Trailing 90-day origination revenue": {
        "description": "Directly observable origination revenue collected during the trailing 90-day calendar window.",
        "explanation": "Sums the base and minimum-ADA origination-fee USD fields over the calendar window ending on the latest complete day.",
        "formulaHtml": '<div class="formula-card">&sum;<sub>trailing 90 calendar days</sub> <span class="formula-paren">(</span><span class="formula-num">loanOriginationFeesInUsd</span> + <span class="formula-num">loanOriginationFeesMinAdaInUsd</span><span class="formula-paren">)</span></div>',
        "formulaText": "sum(Trailing 90 calendar days ending latest complete day: loanOriginationFeesInUsd + loanOriginationFeesMinAdaInUsd)"
    },
    "All-time origination revenue": {
        "description": "Directly observable origination revenue across this market's complete history.",
        "explanation": "Sums both official market-level origination-fee USD fields from the first observable market day through the latest complete day.",
        "formulaHtml": '<div class="formula-card">&sum;<sub>all complete market days</sub> <span class="formula-paren">(</span><span class="formula-num">loanOriginationFeesInUsd</span> + <span class="formula-num">loanOriginationFeesMinAdaInUsd</span><span class="formula-paren">)</span></div>',
        "formulaText": "sum(All complete market days: loanOriginationFeesInUsd + loanOriginationFeesMinAdaInUsd)"
    },
    "Latest origination-revenue day": {
        "description": "Latest complete market day with a positive reported origination fee.",
        "explanation": "Finds the most recent complete day where the sum of the base and minimum-ADA origination-fee USD fields is greater than zero.",
        "formulaHtml": '<div class="formula-card"><span class="formula-func">latest date</span><span class="formula-paren">(</span><span class="formula-num">base fee + min-ADA fee &gt; 0</span><span class="formula-paren">)</span></div>',
        "formulaText": "latest(date where loanOriginationFeesInUsd + loanOriginationFeesMinAdaInUsd > 0)"
    },
    "YTD interest repaid activity": {
        "description": "Borrower interest repayment activity in this market during the latest calendar year.",
        "explanation": "Sums interestRepaidInUsd across complete year-to-date market days. This is the borrower's full interest payment and is not retained protocol revenue.",
        "formulaHtml": '<div class="formula-card">&sum;<sub>YTD complete market days</sub> <span class="formula-num">interestRepaidInUsd</span></div>',
        "formulaText": "sum(YTD complete market days: interestRepaidInUsd)"
    },
    "Trailing 90-day interest repaid activity": {
        "description": "Borrower interest repayment activity during the trailing 90-day calendar window.",
        "explanation": "Sums the full borrower interestRepaidInUsd flow. It is shown as revenue-generating activity, not as retained market revenue.",
        "formulaHtml": '<div class="formula-card">&sum;<sub>trailing 90 calendar days</sub> <span class="formula-num">interestRepaidInUsd</span></div>',
        "formulaText": "sum(Trailing 90 calendar days ending latest complete day: interestRepaidInUsd)"
    },
    "All-time interest repaid activity": {
        "description": "Full borrower interest repayment activity across this market's complete history.",
        "explanation": "Sums interestRepaidInUsd from the first observable market day through the latest complete day. It is not retained protocol revenue.",
        "formulaHtml": '<div class="formula-card">&sum;<sub>all complete market days</sub> <span class="formula-num">interestRepaidInUsd</span></div>',
        "formulaText": "sum(All complete market days: interestRepaidInUsd)"
    },
    "Highest 30d liquidation volume": {
        "description": "Market pool with largest liquidation volume over trailing 30 days.",
        "explanation": "Identifies the market pool that experienced the largest cumulative dollar volume of debt repayments and liquidations over trailing 30 days.",
        "formulaHtml": '<div class="formula-card"><span class="formula-func">max</span><sub>i</sub> &sum;<sub>t=30d</sub> <span class="formula-num">Debt Repaid<sub>USD, i, t</sub></span></div>',
        "formulaText": "max_i(sum_30d(Debt Repaid USD_i))"
    },
    "Highest bad debt": {
        "description": "Market with largest uncollateralized debt shortfall.",
        "explanation": "Identifies the market asset carrying the highest dollar amount of bad debt. Bad debt occurs on active loans where borrow balance exceeds collateral value (Debt > Collateral). Features both Gross Bad Debt (total borrow in underwater loans) and Net Shortfall (uncollateralized deficit: Debt - Collateral).",
        "formulaHtml": '<div class="formula-card"><div style="margin-bottom:4px"><strong>Market Selection:</strong> <span class="formula-func">max</span><sub>i</sub> <span class="formula-paren">(</span>&sum;<sub>loans &in; i, Debt &gt; Collateral</sub> <span class="formula-num">Debt</span><span class="formula-paren">)</span></div><div style="font-size:.76rem;color:#8fa9bf"><strong>Net Shortfall:</strong> &sum; <span class="formula-paren">(</span>Debt &minus; Collateral<span class="formula-paren">)</span></div></div>',
        "formulaText": "max_i(Gross Bad Debt USD_i); Net Shortfall = sum(max(0, Debt - Collateral))",
        "note": "Excludes governance-protected POL loans."
    },
    "Highest debt at risk (HF < 1.0)": {
        "description": "Market with highest liquidatable debt balance.",
        "explanation": "Identifies market pool carrying the largest dollar amount of HF < 1.00 debt. Health Factor evaluates total collateral value against borrowed debt adjusted by liquidation thresholds: HF = (Collateral * LiqThreshold) / Borrow.",
        "formulaHtml": '<div class="formula-card"><div style="margin-bottom:4px"><span class="formula-func">max</span><sub>i</sub> &sum;<sub>loans &in; i, HF &lt; 1.00</sub> <span class="formula-num">Debt<sub>USD</sub></span></div><div style="font-size:.76rem;color:#8fa9bf">where <span class="formula-num">HF</span> = <div class="formula-frac"><span class="formula-num">Collateral &times; LiqThreshold</span><span class="formula-den">Borrow</span></div> &lt; 1.00</div></div>',
        "formulaText": "max_i(sum(Debt_USD where HF < 1.00)); HF = (Collateral * LiqThreshold) / Borrow",
        "note": "Excludes governance-protected POL loans."
    },
    "Highest utilization pressure": {
        "description": "Market pool currently experiencing the highest utilization stress.",
        "explanation": "Identifies the market pool with the highest capital utilization percentage (Borrow / Supply), indicating severe pool liquidity tightening.",
        "formulaHtml": '<div class="formula-card"><span class="formula-func">max</span><sub>i</sub> <div class="formula-frac"><span class="formula-num">Borrow<sub>i</sub></span><span class="formula-den">Supply<sub>i</sub></span></div></div>',
        "formulaText": "max_i(Borrow_i / Supply_i)"
    },
    "LQ Price": {
        "description": "Current USD market price of the LQ token.",
        "explanation": "Observed market price of the LQ protocol governance token.",
        "formulaHtml": '<div class="formula-card"><span class="formula-num">LQ Price<sub>USD</sub></span></div>',
        "formulaText": "LQ Price USD"
    },
    "LQ-staker allocation": {
        "description": "Cumulative accrual-based protocol revenue allocated to LQ stakers.",
        "explanation": "Sums the API-reported holder interest and holder origination accruals across every complete daily analytics.fees row through the latest available full day.",
        "formulaHtml": '<div class="formula-card">&sum;<sub>complete days</sub> <span class="formula-paren">(</span><span class="formula-num">borrowInterestAccruedForHolders</span> + <span class="formula-num">loanOriginationFeesForHolders</span><span class="formula-paren">)</span></div>',
        "formulaText": "sum(Complete daily holder interest + holder origination allocation USD)"
    },
    "LQ-staker interest allocation": {
        "description": "Cumulative accrued-interest revenue allocated to LQ stakers.",
        "explanation": "Sums the API-reported holder interest allocation across complete daily analytics.fees rows.",
        "formulaHtml": '<div class="formula-card">&sum;<sub>complete days</sub> <span class="formula-num">borrowInterestAccruedForHolders<sub>USD</sub></span></div>',
        "formulaText": "sum(Complete daily borrowInterestAccruedForHolders USD)"
    },
    "LQ-staker origination allocation": {
        "description": "Cumulative origination-fee revenue allocated to LQ stakers.",
        "explanation": "Sums the API-reported holder origination allocation across complete daily analytics.fees rows.",
        "formulaHtml": '<div class="formula-card">&sum;<sub>complete days</sub> <span class="formula-num">loanOriginationFeesForHolders<sub>USD</sub></span></div>',
        "formulaText": "sum(Complete daily loanOriginationFeesForHolders USD)"
    },
    "Largest critical collateral": {
        "description": "Largest collateral pool backing critical health (HF <= 1.10) loans.",
        "explanation": "Identifies the collateral asset pool backing the highest total dollar amount of debt in critical health (HF <= 1.10).",
        "formulaHtml": '<div class="formula-card"><span class="formula-func">max</span><sub>asset</sub> <span class="formula-num">Critical Debt<sub>USD, asset</sub></span></div>',
        "formulaText": "max_asset(Critical Collateral Debt USD)",
        "note": "Excludes governance-protected POL loans."
    },
    "Largest near-liquidation collateral": {
        "description": "Largest collateral pool backing near-liquidation (HF <= 1.25) loans.",
        "explanation": "Identifies the collateral asset pool backing the highest total dollar amount of debt near liquidation (HF <= 1.25).",
        "formulaHtml": '<div class="formula-card"><span class="formula-func">max</span><sub>asset</sub> <span class="formula-num">Near-Liquidation Debt<sub>USD, asset</sub></span></div>',
        "formulaText": "max_asset(Near Liquidation Collateral Debt USD)",
        "note": "Excludes governance-protected POL loans."
    },
    "Liquidity": {
        "description": "Available unborrowed liquid pool reserves.",
        "explanation": "Total unborrowed asset reserves held in market pools available for new borrows or supplier withdrawals.",
        "formulaHtml": '<div class="formula-card">&sum; <span class="formula-paren">(</span><span class="formula-num">Supply<sub>i</sub></span> &minus; <span class="formula-num">Borrow<sub>i</sub></span><span class="formula-paren">)</span> &times; <span class="formula-num">Price<sub>i</sub></span></div>',
        "formulaText": "sum((Supply_i - Borrow_i) * Price_i)"
    },
    "Live Loan Adjusted Borrow": {
        "description": "Sum of individual active loan debt balances adjusted for un-batched live interest accrued.",
        "explanation": "Aggregate real-time debt across active loan snapshots, including live interest accrued since each position's last state update (where past due interest was capitalized). Comparing this with Batched Market Borrow reveals 4-hour batch cycle drift or unmapped API positions.",
        "formulaHtml": '<div class="formula-card">&sum; <span class="formula-num">Loan Adjusted Debt<sub>i</sub></span></div>',
        "formulaText": "sum(Loan Adjusted Debt_i)"
    },
    "Loan-row coverage": {
        "description": "Percentage of aggregate market debt represented in individual loan rows.",
        "explanation": "Measures coverage completeness between loan detail snapshot records and protocol aggregate market debt.",
        "formulaHtml": '<div class="formula-card"><div class="formula-frac"><span class="formula-num">&sum; Loan Detail Debt</span><span class="formula-den">Market Aggregate Debt</span></div></div>',
        "formulaText": "sum(Loan Detail Debt) / Market Aggregate Debt"
    },
    "Longest observed run with no debt repayment": {
        "description": "Maximum consecutive days without a principal repayment event.",
        "explanation": "Tracks maximum consecutive days elapsed without a recorded debt principal repayment.",
        "formulaHtml": '<div class="formula-card"><span class="formula-func">max</span> <span class="formula-num">Consecutive Zero-Repaid Days</span></div>',
        "formulaText": "max(Consecutive Zero Repaid Days)"
    },
    "Material liquidation-profit days": {
        "description": "Count of active days where liquidation profit exceeded $0.01.",
        "explanation": "Number of active days with non-trivial protocol liquidation profit exceeding $0.01.",
        "formulaHtml": '<div class="formula-card"><span class="formula-func">count</span><span class="formula-paren">(</span><span class="formula-num">Profit<sub>day</sub> &gt; $0.01</span><span class="formula-paren">)</span></div>',
        "formulaText": "count(Profit_day > $0.01)"
    },
    "Min health factor": {
        "description": "Lowest health factor observed across all active loans.",
        "explanation": "Minimum Health Factor among active borrowing positions. HF = (Collateral * LiqThreshold) / Debt. Health factor < 1.00 indicates a liquidatable position.",
        "formulaHtml": '<div class="formula-card"><span class="formula-func">min</span><sub>i</sub> <span class="formula-paren">(</span><span class="formula-num">Health Factor<sub>i</sub></span><span class="formula-paren">)</span> &nbsp; where &nbsp; <span class="formula-num">HF</span> = <div class="formula-frac"><span class="formula-num">Collateral &times; LiqThreshold</span><span class="formula-den">Borrow</span></div></div>',
        "formulaText": "min_i(Health Factor_i); HF = (Collateral * LiqThreshold) / Borrow",
        "note": "Excludes governance-protected POL loans."
    },
    "Minimum health factor": {
        "description": "Lowest health factor observed across all active loans.",
        "explanation": "Minimum Health Factor among active borrowing positions. HF = (Collateral * LiqThreshold) / Debt. Health factor < 1.00 indicates a liquidatable position.",
        "formulaHtml": '<div class="formula-card"><span class="formula-func">min</span><sub>i</sub> <span class="formula-paren">(</span><span class="formula-num">Health Factor<sub>i</sub></span><span class="formula-paren">)</span> &nbsp; where &nbsp; <span class="formula-num">HF</span> = <div class="formula-frac"><span class="formula-num">Collateral &times; LiqThreshold</span><span class="formula-den">Borrow</span></div></div>',
        "formulaText": "min_i(Health Factor_i); HF = (Collateral * LiqThreshold) / Borrow",
        "note": "Excludes governance-protected POL loans."
    },
    "Observed keys with active debt": {
        "description": "Count of distinct wallet addresses holding active borrow debt.",
        "explanation": "Number of unique wallet key addresses mapped to active borrowing positions holding non-zero debt.",
        "formulaHtml": '<div class="formula-card"><span class="formula-func">count</span><span class="formula-paren">(</span><span class="formula-num">Unique Active Keys</span><span class="formula-paren">)</span></div>',
        "formulaText": "count(Unique Active Keys)"
    },
    "Outstanding borrow": {
        "description": "Total USD value of active outstanding loans in this market.",
        "explanation": "Sum of all active principal loan balances borrowed in this market, valued at current asset price.",
        "formulaHtml": '<div class="formula-card"><span class="formula-num">Borrow<sub>native</sub></span> &times; <span class="formula-num">Price<sub>USD</sub></span></div>',
        "formulaText": "Borrow Native * Price USD"
    },
    "Repayment unevenness across active days": {
        "description": "Normalized HHI score measuring repayment temporal concentration.",
        "explanation": "Normalized Herfindahl-Hirschman Index measuring how concentrated repayments are on specific days vs spread evenly across active days. 0% indicates equal daily repayments; 100% means a single day accounts for all repayment.",
        "formulaHtml": '<div class="formula-card"><span class="formula-func">HHI</span><span class="formula-paren">(</span><span class="formula-num">Daily Repayment Shares</span><span class="formula-paren">)</span></div>',
        "formulaText": "HHI(Daily Repayment Shares)"
    },
    "Staked LQ / Staking Ratio": {
        "description": "Total LQ tokens staked and percentage of circulating supply locked.",
        "explanation": "Tracks total LQ tokens locked in the staking contract relative to total 21M circulating supply.",
        "formulaHtml": '<div class="formula-card"><div class="formula-frac"><span class="formula-num">Staked LQ</span><span class="formula-den">Circulating Supply</span></div></div>',
        "formulaText": "Staked LQ / Circulating Supply"
    },
    "Sum of bad debt": {
        "description": "Total USD shortfall of undercollateralized positions.",
        "explanation": "Total protocol loss exposure from loans where debt balance exceeds collateral value (Debt > Collateral). Features both Gross Debt (total borrow in underwater loans) and Net Shortfall (uncollateralized deficit: Debt - Collateral).",
        "formulaHtml": '<div class="formula-card"><div style="margin-bottom:4px"><strong>Gross Debt:</strong> &sum;<sub>Debt<sub>i</sub> &gt; Collateral<sub>i</sub></sub> <span class="formula-num">Debt<sub>i</sub></span></div><div><strong>Net Shortfall:</strong> &sum;<sub>Debt<sub>i</sub> &gt; Collateral<sub>i</sub></sub> <span class="formula-paren">(</span><span class="formula-num">Debt<sub>i</sub></span> &minus; <span class="formula-num">Collateral<sub>i</sub></span><span class="formula-paren">)</span></div></div>',
        "formulaText": "Gross = sum(Debt where Debt > Collateral); Net Shortfall = sum(max(0, Debt - Collateral))",
        "note": "Excludes governance-protected POL loans."
    },
    "Supply": {
        "description": "Total USD value of assets supplied across protocol pools.",
        "explanation": "Sum of all collateral and non-collateral assets supplied by users across Liqwid market pools, converted to USD at current market prices.",
        "formulaHtml": '<div class="formula-card">&sum; <span class="formula-num">Supply<sub>native, i</sub></span> &times; <span class="formula-num">Price<sub>USD, i</sub></span></div>',
        "formulaText": "sum(Supply_i * Price_i)"
    },
    "Supply APY": {
        "description": "Annualized compounding yield earned by suppliers in this market.",
        "explanation": "Current annualized supplier yield based on borrower interest paid, supplier split ratio, and pool utilization.",
        "formulaHtml": '<div class="formula-card"><span class="formula-paren">(</span>1 &minus; <span class="formula-num">U</span><span class="formula-paren">)</span> &times; <span class="formula-num">Base APY</span> + <span class="formula-num">U</span> &times; <span class="formula-num">Borrow APR</span> &times; <span class="formula-num">Supplier Split</span></div>',
        "formulaText": "(1 - utilization) * baseSupplierAPY + utilization * borrowerAPR * supplierSplit"
    },
    "Top 1 key concentration": {
        "description": "Percentage share of active protocol debt held by the single largest wallet/key.",
        "explanation": "Measures borrower centralization risk by tracking the debt share controlled by the single largest wallet address.",
        "formulaHtml": '<div class="formula-card"><div class="formula-frac"><span class="formula-num">Debt<sub>Key 1</sub></span><span class="formula-den">Total Active Debt</span></div></div>',
        "formulaText": "Debt(Key 1) / Total Active Debt"
    },
    "Top 3 key concentration": {
        "description": "Cumulative debt share held by the top 3 largest wallet keys.",
        "explanation": "Measures concentration risk among the top 3 borrowing entities in the protocol.",
        "formulaHtml": '<div class="formula-card"><div class="formula-frac"><span class="formula-num">&sum;<sub>i=1..3</sub> Debt<sub>Key i</sub></span><span class="formula-den">Total Active Debt</span></div></div>',
        "formulaText": "sum(Debt Top 3 Keys) / Total Active Debt"
    },
    "Total Staked Value": {
        "description": "Total USD value of all staked LQ tokens.",
        "explanation": "Total USD value of all staked LQ tokens calculated at current LQ market price.",
        "formulaHtml": '<div class="formula-card"><span class="formula-num">Staked LQ</span> &times; <span class="formula-num">LQ Price<sub>USD</sub></span></div>',
        "formulaText": "Staked LQ * LQ Price"
    },
    "Un-batched Interest Floor": {
        "description": "Difference between live loan-adjusted debt and raw loan principal/debt floor.",
        "explanation": "Minimum floor of uncollected interest accrued on active loans since their last position update (Live Loan Adjusted Debt - Raw Loan Debt). Position updates capitalize due interest into raw debt; new interest then accrues continuously between 4-hour market batch cycles.",
        "formulaHtml": '<div class="formula-card"><span class="formula-num">Live Loan Adjusted Debt<sub>USD</sub></span> &minus; <span class="formula-num">Loan Debt<sub>USD</sub></span></div>',
        "formulaText": "Live Loan Adjusted Debt USD - Loan Debt USD"
    },
    "Parameter history coverage": {
        "description": "Markets and current borrow represented by an official market-parameter event.",
        "explanation": "Counts included non-POL markets with at least one analytics.marketParamsHistory event. The secondary percentage divides current USD borrow in those markets by total current USD borrow in all included markets.",
        "formulaHtml": '<div class="formula-card"><div class="formula-frac"><span class="formula-num">&sum; Borrow<sub>USD, parameterized markets</sub></span><span class="formula-den">&sum; Borrow<sub>USD, included markets</sub></span></div></div>',
        "formulaText": "parameterizedBorrowInUsd / totalBorrowInUsd"
    },
    "Borrow-weighted kink": {
        "description": "Current optimal-utilization kink averaged by covered market borrow.",
        "explanation": "Multiplies each covered market's latest effective kink by current USD borrow, sums those products, and divides by covered current USD borrow.",
        "formulaHtml": '<div class="formula-card"><div class="formula-frac"><span class="formula-num">&sum;<sub>i</sub> Kink<sub>i</sub> &times; Borrow<sub>USD,i</sub></span><span class="formula-den">&sum;<sub>i</sub> Borrow<sub>USD,i</sub></span></div></div>',
        "formulaText": "sum(kink_i * currentBorrowInUsd_i) / sum(currentBorrowInUsd_i), parameter-covered markets only"
    },
    "Borrow above kink thresholds": {
        "description": "Marginal current borrow above each covered market's optimal-utilization threshold.",
        "explanation": "For every covered market, subtracts kink multiplied by current supply USD from current borrow USD, floors the result at zero, then sums across markets.",
        "formulaHtml": '<div class="formula-card">&sum;<sub>i</sub> <span class="formula-func">max</span><span class="formula-paren">(</span>0, Borrow<sub>USD,i</sub> &minus; Kink<sub>i</sub> &times; Supply<sub>USD,i</sub><span class="formula-paren">)</span></div>',
        "formulaText": "sum_i(max(0, currentBorrowInUsd_i - kink_i * currentSupplyInUsd_i))"
    },
    "Capped supply headroom": {
        "description": "Current USD supply capacity remaining in markets with an explicit native-asset supply cap.",
        "explanation": "Values each explicit native supply cap at the market's current official asset price, subtracts current supply USD, floors each market at zero, then sums. Markets without a reported cap are excluded.",
        "formulaHtml": '<div class="formula-card">&sum;<sub>capped i</sub> <span class="formula-func">max</span><span class="formula-paren">(</span>0, SupplyCap<sub>native,i</sub> &times; Price<sub>USD,i</sub> &minus; Supply<sub>USD,i</sub><span class="formula-paren">)</span></div>',
        "formulaText": "sum_capped(max(0, supplyCapNative_i * currentAssetPriceInUsd_i - currentSupplyInUsd_i))"
    },
    "Collateral rule pairs": {
        "description": "Number of current borrowed-market and eligible-collateral parameter combinations.",
        "explanation": "Counts every row returned in the current collateralParameters arrays for included non-POL markets. Each row is one borrowed market paired with one eligible collateral configuration.",
        "formulaHtml": '<div class="formula-card"><span class="formula-func">count</span><span class="formula-paren">(</span>Current MarketCollateralParameters rows<span class="formula-paren">)</span></div>',
        "formulaText": "count(current non-POL market.parameters.collateralParameters rows)"
    },
    "Latest governance update": {
        "description": "Most recent exact market-parameter governance event across included markets.",
        "explanation": "Selects the greatest official timestamp from analytics.marketParamsHistory after excluding POL from detailed protocol analytics.",
        "formulaHtml": '<div class="formula-card"><span class="formula-func">max</span><sub>included markets</sub> ParameterEventTimestamp</div>',
        "formulaText": "max(non-POL analytics.marketParamsHistory.timestamp)"
    },
    "Total collateral locked": {
        "description": "Total USD market value of collateral deposited in this isolated silo.",
        "explanation": "Total market value of single-asset collateral locked exclusively within this ring-fenced silo to back isolated borrowing pools.",
        "formulaHtml": '<div class="formula-card"><span class="formula-num">Collateral Tokens</span> &times; <span class="formula-num">Oracle Price<sub>USD</sub></span></div>',
        "formulaText": "Collateral Tokens * Oracle Price USD"
    },
    "Total outstanding borrow": {
        "description": "Total USD borrow balance across all lending pools within this isolated silo.",
        "explanation": "Sum of all active user loan balances borrowed across the paired pools in this isolated silo.",
        "formulaHtml": '<div class="formula-card">&sum; <span class="formula-num">Pool Borrow<sub>USD, i</sub></span></div>',
        "formulaText": "sum(Pool Borrow USD_i)"
    },
    "Utilization": {
        "description": "Protocol-wide capital utilization percentage.",
        "explanation": "Ratio of total active borrow debt to total supply across all pools.",
        "formulaHtml": '<div class="formula-card"><div class="formula-frac"><span class="formula-num">Total Borrow USD</span><span class="formula-den">Total Supply USD</span></div></div>',
        "formulaText": "Total Borrow USD / Total Supply USD"
    },
    "Widest repayment-spike breadth": {
        "description": "Maximum number of markets exhibiting concurrent repayment spikes.",
        "explanation": "Measures market breadth during peak repayment co-occurrence days where multiple markets experienced repayments >= 2.0x their 30-day active median.",
        "formulaHtml": '<div class="formula-card"><span class="formula-func">max</span><sub>date</sub> <span class="formula-num">Concurrent Spike Markets</span></div>',
        "formulaText": "max_date(Concurrent Spike Markets)"
    },
    "Top USD stablecoin yield": {
        "description": "Highest current supply APR among USD-pegged stablecoin markets.",
        "explanation": "Identifies the highest annualized supply rate currently earned by liquidity providers among all active USD stablecoin pools (DJED, iUSD, wanUSDC, wanUSDT, wanDAI, USDM, USDA, wanPYUSD, USDCx).",
        "formulaHtml": '<div class="formula-card"><span class="formula-func">max</span><sub>USD stablecoins</sub><span class="formula-paren">(</span><span class="formula-num">Supply APR</span><span class="formula-paren">)</span></div>',
        "formulaText": "max(Supply APR across USD stablecoin markets)"
    },
    "Supply-weighted USD stablecoin yield": {
        "description": "Supply-weighted average annualized supply rate across all USD stablecoin markets.",
        "explanation": "Weights each USD stablecoin\'s current supply APY by its total supplied USD balance to reflect the effective average yield earned across all stablecoin capital in the protocol.",
        "formulaHtml": '<div class="formula-card"><div class="formula-frac"><span class="formula-num">&sum; (Supply APR &times; Supply<sub>USD</sub>)</span><span class="formula-den">&sum; Supply<sub>USD</sub></span></div></div>',
        "formulaText": "sum(Supply APR * Supply USD) / sum(Supply USD)"
    },
    "USD stablecoin supply": {
        "description": "Total USD value of assets supplied across all USD stablecoin lending pools.",
        "explanation": "Aggregates total liquidity supplied by lenders across all USD-pegged stablecoins (DJED, iUSD, wanUSDC, wanUSDT, wanDAI, USDM, USDA, wanPYUSD, USDCx).",
        "formulaHtml": '<div class="formula-card">&sum;<sub>USD stablecoins</sub> <span class="formula-num">Supply<sub>USD</sub></span></div>',
        "formulaText": "sum(Supply USD for all USD stablecoin markets)"
    },
    "USD stablecoin borrow": {
        "description": "Total USD value of active debt across all USD stablecoin lending pools.",
        "explanation": "Aggregates total outstanding borrowed capital across all USD-pegged stablecoin markets.",
        "formulaHtml": '<div class="formula-card">&sum;<sub>USD stablecoins</sub> <span class="formula-num">Borrow<sub>USD</sub></span></div>',
        "formulaText": "sum(Borrow USD for all USD stablecoin markets)"
    },
    "USD stablecoin utilization": {
        "description": "Aggregate capital utilization rate across USD stablecoin markets.",
        "explanation": "Ratio of total borrowed USD capital to total supplied USD capital across all USD stablecoin lending pools.",
        "formulaHtml": '<div class="formula-card"><div class="formula-frac"><span class="formula-num">&sum; Borrow<sub>USD</sub></span><span class="formula-den">&sum; Supply<sub>USD</sub></span></div></div>',
        "formulaText": "sum(Borrow USD) / sum(Supply USD)"
    },
    "Active USD stablecoins": {
        "description": "Count of USD stablecoin markets with observable active supply or borrow liquidity.",
        "explanation": "Number of distinct USD-pegged stablecoin lending pools available in the protocol.",
        "formulaHtml": '<div class="formula-card"><span class="formula-func">count</span><span class="formula-paren">(</span><span class="formula-num">Distinct USD stablecoins</span><span class="formula-paren">)</span></div>',
        "formulaText": "count(distinct USD stablecoin markets)"
    }
});

    const chartQuestions = Object.freeze({
      protocolPolDebtHistory: "How has total protocol-owned liquidity debt and locked collateral value evolved across observations?",
      protocolPolMarketBreakdownHistory: "How is protocol-owned debt distributed across individual stablecoin markets over time?",
      protocolPolMarketComparison: "How does active borrow compare to locked qPOL collateral across each protocol-owned market?",
      protocolPolInterestContribution: "What is the projected annual interest yield paid by each POL position at current borrow rates, and what is its contribution to the protocol total?",
      protocolPolHealthComparison: "How does nominal LTV compare to the smart contract health factor under 100x collateral weighting?",
      protocolPolBorrowShare: "What share of each market's total borrow is protocol-owned, and what borrow rate is paid?",
      protocolStablecoinYields: "How do lending yields (Supply APR) compare across USD-pegged stablecoins over time?",
      protocolCapital: "Is protocol capital expanding, and is borrowing reducing the liquidity left available?",
      protocolUtilization: "When has borrowing consumed the largest share of supplied capital?",
      protocolDebtRepayment: "When did protocol repayment activity accelerate, fade, or stop?",
      protocolDebtRepaymentDistribution: "How are active daily debt repayment amounts distributed across all protocol markets?",
      protocolInterestRepaymentDistribution: "How are active daily interest repayment amounts distributed across all protocol markets?",
      protocolDebtDaily: "On which days did inferred debt formation exceed reported repayment?",
      protocolDebtRolling: "Are recent debt formation and repayment rates converging or separating?",
      protocolDebtCumulative: "How do inferred formation, reported repayment, and unclassified borrow reductions reconcile?",
      protocolDebtCumulativeGap: "How has the mark-to-market reported debt-flow difference changed through native flows and repricing?",
      protocolDebtGap: "When did daily inferred formation exceed or fall below reported repayment?",
      protocolDebtCoverage: "Over 7-, 30-, and 90-day windows, are repayments keeping pace with inferred debt formation?",
      protocolInterestRolling: "Are recent interest payments catching up with the latest accrual pace?",
      protocolInterestCoverage: "Which trailing windows show interest repayments keeping pace with accrual?",
      protocolInterestDaily: "On which days did new interest exceed the interest borrowers paid?",
      protocolInterestRepayment: "When did protocol interest repayment activity accelerate, fade, or stop?",
      protocolInterestRepaymentDistribution: "How are protocol-wide interest repayment amounts distributed across observation periods?",
      protocolInterestCumulative: "How have total accrued and repaid interest separated across the observable history?",
      protocolInterestCumulativeGap: "How has the mark-to-market reported interest-flow difference changed through native flows and repricing?",
      protocolInterestGap: "When did daily interest payments fall behind or overtake new accrual?",
      protocolParticipationLoans: "Is the saved count of active-debt positions broadening or contracting?",
      protocolParticipationKeys: "Is active debt spreading across more observed keys or concentrating among fewer?",
      protocolLqPrice: "How has the LQ token market price evolved over time?",
      protocolLqStaking: "How has total staked LQ and the staking ratio changed over time?",
      protocolLqTreasury: "How have DAO treasury LQ holdings and USD valuation grown over time?",
      protocolParameterRateAtlas: "How differently do the largest borrowed markets price the same utilization level?",
      protocolParameterPolicyMap: "Which large markets are already beyond their optimal-utilization kink?",
      protocolParameterCapacity: "Which explicitly capped markets have the least remaining supply headroom?",
      protocolParameterGuardrails: "How do liquidation-entry buffers and close factors differ across markets?",
      protocolParameterCollateral: "Which borrowed markets expose the tightest collateral limits or largest liquidation penalties?",
      protocolParameterRateHistory: "How has the borrow-weighted protocol rate posture changed as governance updated individual markets?",
      protocolParameterUtilizationHistory: "How have borrow-weighted optimal utilization and hard utilization caps changed through time?",
      protocolParameterAllocationHistory: "How has the borrow-weighted current income-allocation policy changed through time?",
      protocolParameterCoverageHistory: "How much protocol borrow is covered by observable parameter history, and how much sits above kink thresholds?",
      protocolParameterGovernanceActivity: "When did governance update market parameters, and how broad were those changes?",
      protocolHealthHistoryCounts: "Are more active-debt positions moving into weaker health-factor bands?",
      protocolHealthHistoryDebt: "Is a larger share of active debt shifting toward lower health factors?",
      impactBorrowConcentrationComparison: "In which markets do the largest observed keys account for mapped borrowing most quickly?",
      impactCollateralizedSupplyConcentrationComparison: "In which markets do the largest observed keys account for represented collateralized supply most quickly?",
      protocolCollectedRevenueDaily: "When was retained interest or origination revenue actually collected?",
      protocolCollectedRevenueMonthly: "How is collected retained-interest and origination revenue changing month to month?",
      protocolMarketRevenueContributionYtd: "Which individual markets generate the largest share of year-to-date collected revenue, and what drives their total?",
      protocolDaoRevenueAllocationDaily: "Which daily interest and origination components drive DAO revenue?",
      protocolDaoRevenueAllocationMonthly: "How is DAO revenue changing in level and composition month to month?",
      protocolStakerRevenueAllocationDaily: "Which daily interest and origination components drive LQ-staker revenue?",
      protocolStakerRevenueAllocationMonthly: "How is LQ-staker revenue changing in level and composition month to month?",
      protocolRevenueRunRate: "Is the annualized pace from consecutive 90-day windows rising or falling?",
      liquidationMonthly: "Which months generated the largest liquidation profit, and how persistent was it?",
      liquidationDaily: "On which days did liquidation profit occur, cluster, or disappear?",
      liquidationDrySpell: "How long did each uninterrupted period without liquidation profit last?",
      exposureMarketPressure: "Which borrowed markets pair high current utilization with the sharpest 7-day increase?",
      exposureFlowComparison: "Which markets improved or deteriorated between the latest and prior 30-day periods?",
      exposureBorrowedMarkets: "Which borrowed markets hold the most debt in low health-factor bands?",
      exposureCollateralBands: "Which collateral assets support the largest amounts of debt near liquidation?",
      exposureCollateralShock: "Which single-collateral price declines would push the most active debt to HF <= 1.00?",
      exposureLiquidatableDebt: "Which borrowed markets hold the largest total dollar amounts of currently liquidatable active debt?",
      exposureLiquidatableMarkets: "Which borrowed markets contain active-debt positions currently returned as liquidatable?",
      exposureObservedKeyRanking: "Which observed keys combine the most mapped debt with the highest low-HF share?",
      exposureMarketKeyDependence: "How much of each market's official borrow maps to its largest keys versus unmapped debt?",
      exposureHealthHistoryDebt: "Is active debt moving toward stronger or weaker health-factor bands over time?",
      exposureBadDebtHistory: "How has total protocol bad debt in USD evolved across historical observations?",
      exposureLowHfConcentrationSensitivity: "Do the top one and top three observed keys gain share as the HF cutoff tightens?",
      exposureSupplyComposition: "For each market, how much supply is represented as loan collateral versus not represented?",
      exposureSupplyConcentration: "Within represented collateralized supply, which markets depend most on their largest observed keys?",
      marketCapital: "Is this market gaining supplied capital, borrowing, and available liquidity at the same pace?",
      marketUtilization: "When has borrowing used the largest share of this market's supplied capital?",
      marketRates: "How have borrowing costs and supplier yield moved as market conditions changed?",
      marketLiquidityPressure: "When has outstanding borrow become large relative to available liquidity?",
      marketDebtRepayment: "When did this market's repayment activity accelerate, fade, or stop?",
      marketDebtRepaymentDistribution: "What is the distribution and size profile of daily debt repayments (repayment size distribution analysis)?",
      marketDebtCoverageOperandsAsset: "How much native debt formed and was repaid in the trailing 30-day coverage window?",
      marketDebtCoverageOperandsUsd: "What are those same native debt-coverage operands worth at each observation's current asset price?",
      marketDebtCoverage: "Which trailing windows show this market's debt repayments keeping pace with inferred formation?",
      marketDebtGapAsset: "When did native debt formation exceed or fall behind native repayment?",
      marketDebtGap: "What was the contemporaneous USD value of this market's native debt-flow gap?",
      marketDebtCumulativeGapAsset: "How has this market's cumulative native reported debt-flow difference changed?",
      marketDebtCumulativeGap: "How have native debt flows and asset repricing changed this market's current-valued difference?",
      protocolRepaymentDrySpells: "How long has the protocol gone without debt repayments?",
      protocolInterestDrySpells: "How long has the protocol gone without interest repayments?",
      marketRepaymentEvents: "Are recent repayment bursts strengthening or fading relative to the 30-day baseline?",
      marketRepaymentDrySpells: "How long has this market gone without debt repayments?",
      marketInterestDrySpells: "How long has this market gone without interest repayments?",
      marketInterestDaily: "On which days did this market accrue more interest than borrowers repaid?",
      marketInterestRepaymentDistribution: "What is the distribution and size profile of daily interest repayments (repayment size distribution analysis)?",
      marketInterestCoverageOperandsAsset: "How much native interest accrued and was repaid in the trailing 30-day coverage window?",
      marketInterestCoverageOperandsUsd: "What are those same native interest-coverage operands worth at each observation's current asset price?",
      marketInterestCumulative: "How have this market's total accrued and repaid interest separated over time?",
      marketInterestCumulativeGapAsset: "How has this market's cumulative native reported interest-flow difference changed?",
      marketInterestCumulativeGap: "How have native interest flows and asset repricing changed this market's current-valued difference?",
      marketInterestGapAsset: "When did native interest accrual exceed or fall behind native repayment?",
      marketInterestGap: "When did this market's daily interest payment lag or overtake new accrual?",
      marketInterestCoverage: "Which trailing windows show this market's interest repayments keeping pace?",
      marketAttributedCollectedRevenueDaily: "When was protocol retained-interest revenue attributed to this market, and when did it collect origination fees?",
      marketAttributedCollectedRevenueMonthly: "Which months generated the most reconciled attributed collections for this market?",
      marketAccruedInterestAllocationDaily: "How did each day's accrued borrower interest divide between suppliers and the protocol or reserve?",
      marketAccruedInterestAllocationMonthly: "How did monthly accrued borrower interest divide between suppliers and the protocol or reserve?",
      marketProjectedAnnualizedInterestIncome: "How has the annualized interest-income pace implied by borrow, APR, and allocation parameters changed?",
      marketInterestRepaymentActivityMonthly: "When did borrowers repay the most interest, without treating the full payment as retained revenue?",
      marketHealthBuckets: "How much current debt sits in each health-factor tranche?",
      marketHealthHistoryDebt: "Is this market's active debt shifting toward stronger or weaker health-factor bands?",
      marketHealthHistoryCounts: "Are this market's active-debt positions moving into safer or riskier bands?",
      marketParticipationLoans: "Is this market's saved active-debt position count broadening or contracting?",
      marketParticipationKeys: "Is this market's active debt spread across more observed keys or fewer?",
      marketPolBorrowComposition: "How much of this market's borrow is protocol-owned liquidity versus organic user borrowing?",
      marketPolHealthComparison: "How does this market's nominal LTV compare to the smart contract health factor under 100x collateral weighting?",
      marketPolDebtHistory: "How have this market's protocol-owned debt obligations and locked collateral valuation evolved across snapshot observations?",
      marketPolBorrowShareHistory: "What share of this market's total active borrow has been protocol-owned over time?",
      marketPolYieldHistory: "How have the projected annual interest yield and borrow APY for this market's POL position changed across observations?",
      marketPolHealthHistory: "How have nominal LTV and effective smart contract health factor for this market's POL position evolved over time?",
      marketKeyDependence: "How much of this market's official borrow maps to its largest keys versus unmapped debt?",
      marketBorrowConcentration: "How quickly do the largest observed keys account for this market's official borrow?",
      marketCollateralizedSupplyConcentration: "How quickly do the largest observed keys account for represented collateralized supply?",
      marketParameterRateCurve: "How do the current governance parameters translate utilization into borrower cost and supplier yield?",
      marketParameterBorrowRates: "When did governance move this market's base, optimal, or maximum borrower rate?",
      marketParameterSupplyRates: "When did governance move this market's base, optimal, or maximum supplier yield?",
      marketParameterUtilizationLimits: "How have the optimal-utilization kink and hard utilization cap changed?",
      marketParameterSupplyCap: "When has governance expanded, reduced, removed, or introduced this market's supply cap?",
      marketParameterIncomeAllocation: "How has each unit of borrower interest been divided among suppliers, dividends, treasury, and reserve?",
      marketParameterModelCoefficients: "When did the raw per-batch rate coefficients underlying the borrower curve change?",
      impactRiskRanking: "Which current stress component indicators affect each market?",
      impactMarketMap: "Which large markets combine high utilization with weak recent interest coverage?",
      impactInterestContributions: "Which markets generated the largest shares of recent interest accrual?",
      impactInterestRepaymentContributions: "Which markets supplied the largest shares of recent interest repayment?",
      impactGapContributions: "Which markets contributed most to recent positive reported interest-flow differences?",
      impactDebtContributions: "Which markets held the largest shares of outstanding protocol debt through time?",
      impactRepaymentContributions: "Which markets contributed the largest shares of recent debt repayment?",
      impactDebtGapContributions: "Which markets contributed most to recent positive debt-flow gaps?",
      impactCurrentContributions: "How is today's debt stock and latest 30-day flow mix divided among markets?",
      impactLoanState: "Which markets currently hold the most active debt near low health factors?"
    });
    const chartPeriods = {};
    let activeScope = "protocol";
    let activeView = "overview";
    const activeViewsByScope = { protocol: "overview", markets: "marketOverview" };
    let marketCategory = "core";
    const renderedViews = new Set();
    let refreshInFlight = false;
    let savingInFlight = false;
    let dataStore = createMemoryDataStore([], { name: "Liqwid data" });
    let dataLocation = null;
    let rememberedDataLocation = null;
    let selectedMarket = null;
    let exposureHfThreshold = 1.25;
    const colors = { blue: "#19b5fe", mint: "#3edc81", amber: "#ffb84d", red: "#ff5a67", purple: "#d593ff", slate: "#7fa6c7" };
    const riskPalette = ["#a7f3d0", "#34d399", "#facc15", "#f97316", "#991b1b"];
    const chartPalette = ["#19b5fe", "#3edc81", "#ffb84d", "#d593ff", "#ff5a67", "#68d5ff", "#8be6b2", "#f2d06b", "#a9bfd3"];
    let chartCache = null;

    document.querySelector("#openAnotherDataButton").addEventListener("click", openExistingData);
    document.querySelector("#saveDataButton").addEventListener("click", saveCurrentData);
    document.querySelector("#fetchNewDataButton").addEventListener("click", requestDataFetch);
    document.querySelector("#dataStatusButton").addEventListener("click", openDataStatus);
    document.querySelector("#closeDataStatusButton").addEventListener("click", () => document.querySelector("#dataStatusDialog").close());
    document.querySelector("#dataArchiveFileInput").addEventListener("change", openSelectedDataArchive);
    document.querySelector("#fullHistoryConfirmDialog").addEventListener("close", handleFullHistoryDialogClose);
    document.addEventListener("click", handleChartTimeframeClick);
    updateHeader();
    renderTabs();
    renderAll();
    void restoreLastDataOnStartup();

    function renderTabs() {
      const navigation = document.querySelector("#analyticsNav");
      const scopeTabs = document.querySelector("#scopeTabs");
      const sectionTabs = document.querySelector("#sectionTabs");
      navigation.hidden = !hasData();
      if (!hasData()) {
        scopeTabs.replaceChildren();
        sectionTabs.replaceChildren();
        document.querySelector("#analysisLocation").replaceChildren();
        renderMarketContext();
        return;
      }
      const scope = analyticsScopes.find(([id]) => id === activeScope) || analyticsScopes[0];
      const [, scopeLabel, scopeViews] = scope;
      const sectionLabel = scopeViews.find(([id]) => id === activeView)?.[1] || scopeViews[0][1];
      scopeTabs.innerHTML = analyticsScopes.map(([id, label]) => `<button type="button" role="tab" aria-selected="${id === activeScope}" class="${id === activeScope ? "active" : ""}" data-scope="${id}">${esc(label)}</button>`).join("");
      sectionTabs.innerHTML = scopeViews.map(([id, label]) => `<button type="button" role="tab" aria-selected="${id === activeView}" class="${id === activeView ? "active" : ""}" data-view="${id}">${esc(label)}</button>`).join("");
      document.querySelector("#analysisLocation").innerHTML = `<span>${esc(scopeLabel)}</span><span aria-hidden="true">/</span><strong>${esc(sectionLabel)}</strong>`;
      document.querySelectorAll("[data-scope]").forEach((button) => button.addEventListener("click", () => {
        activeScope = button.dataset.scope;
        activateView(activeViewsByScope[activeScope]);
      }));
      document.querySelectorAll("[data-view]").forEach((button) => button.addEventListener("click", () => {
        activeViewsByScope[activeScope] = button.dataset.view;
        activateView(button.dataset.view);
      }));
      renderMarketContext();
    }

    function activateView(viewId) {
      const matchingScope = analyticsScopes.find(([, , scopeViews]) => scopeViews.some(([id]) => id === viewId));
      if (matchingScope) {
        activeScope = matchingScope[0];
        activeViewsByScope[activeScope] = viewId;
      }
      activeView = viewId;
      document.querySelectorAll(".view").forEach((view) => view.classList.toggle("active", view.id === activeView));
      renderTabs();
      renderActiveView();
      document.querySelector(`[data-view="${activeView}"]`)?.focus();
      window.scrollTo({ top: document.querySelector("main")?.offsetTop || 0, behavior: "auto" });
    }

    function renderMarketContext() {
      const context = document.querySelector("#marketContext");
      const show = hasData() && activeScope === "markets";
      context.hidden = !show;
      if (!show) {
        context.replaceChildren();
        return;
      }

      const allSummaries = deep.marketSummaries || [];
      const coreMarkets = allSummaries.filter((row) => !row.group && !row.isIsolated);
      const isolatedMarkets = allSummaries.filter((row) => row.group || row.isIsolated);

      const currentList = marketCategory === "isolated" ? isolatedMarkets : coreMarkets;
      if (!currentList.some((m) => m.marketId === selectedMarket)) {
        selectedMarket = currentList[0]?.marketId || allSummaries[0]?.marketId;
      }

      const typeToggleHtml = isolatedMarkets.length > 0 ? `
        <div class="market-type-toggle" role="group" aria-label="Market category">
          <button type="button" class="${marketCategory === 'core' ? 'active' : ''}" data-market-category="core" aria-pressed="${marketCategory === 'core'}">Core markets</button>
          <button type="button" class="${marketCategory === 'isolated' ? 'active' : ''}" data-market-category="isolated" aria-pressed="${marketCategory === 'isolated'}">Isolated markets</button>
        </div>
      ` : "";

      let optionsHtml = "";
      if (marketCategory === "isolated") {
        const byGroup = new Map();
        for (const m of isolatedMarkets) {
          const gName = m.group?.name || m.group?.id || (typeof m.group === "string" ? m.group : "Isolated");
          if (!byGroup.has(gName)) byGroup.set(gName, []);
          byGroup.get(gName).push(m);
        }
        optionsHtml = [...byGroup.entries()].map(([groupName, groupMarkets]) => `
          <optgroup label="${esc(groupName)} Silo">
            ${groupMarkets.map((row) => {
              const isCollateral = row.parameters?.borrowCap === 0 || !row.parameters?.collateralParameters?.length;
              const roleLabel = isCollateral ? " (Collateral)" : " (Borrow Pool)";
              return `<option value="${esc(row.marketId)}" ${row.marketId === selectedMarket ? "selected" : ""}>${esc(row.displayName || row.marketId)}${roleLabel}</option>`;
            }).join("")}
          </optgroup>
        `).join("");
      } else {
        optionsHtml = coreMarkets.map((row) => `<option value="${esc(row.marketId)}" ${row.marketId === selectedMarket ? "selected" : ""}>${esc(row.displayName || row.marketId)}</option>`).join("");
      }

      context.innerHTML = `${typeToggleHtml}<label>Selected ${marketCategory === 'isolated' ? 'isolated ' : 'core '}market<select id="marketSelect">${optionsHtml}</select></label>`;

      document.querySelector("#marketSelect").addEventListener("change", (event) => {
        selectedMarket = event.target.value;
        const marketViews = analyticsScopes.find(([id]) => id === "markets")[2];
        for (const [viewId] of marketViews) {
          renderedViews.delete(viewId);
          if (viewId !== activeView) document.querySelector(`#${viewId}`)?.replaceChildren();
        }
        renderActiveView(true);
      });

      document.querySelectorAll("[data-market-category]").forEach((btn) => btn.addEventListener("click", () => {
        const targetCategory = btn.dataset.marketCategory;
        if (targetCategory !== marketCategory) {
          marketCategory = targetCategory;
          const newList = marketCategory === "isolated" ? isolatedMarkets : coreMarkets;
          selectedMarket = newList[0]?.marketId || selectedMarket;
          const marketViews = analyticsScopes.find(([id]) => id === "markets")[2];
          for (const [viewId] of marketViews) {
            renderedViews.delete(viewId);
            if (viewId !== activeView) document.querySelector(`#${viewId}`)?.replaceChildren();
          }
          renderMarketContext();
          renderActiveView(true);
        }
      }));
    }

    function renderAll() {
      renderedViews.clear();
      for (const [viewId] of views) {
        if (viewId !== activeView) document.querySelector(`#${viewId}`)?.replaceChildren();
      }
      renderActiveView(true);
    }

    function renderActiveView(force = false) {
      if (!force && renderedViews.has(activeView)) return;
      if (!hasData()) {
        renderEmptyState();
        renderedViews.add(activeView);
        return;
      }
      const renderers = {
        overview: renderOverview,
        protocolDebtFlows: renderProtocolDebtFlows,
        protocolInterestFlows: renderProtocolInterestFlows,
        protocolStablecoinYields: renderProtocolStablecoinYields,
        revenue: renderRevenue,
        liquidations: renderLiquidations,
        exposure: renderCurrentExposure,
        impact: renderImpact,
        protocolParticipation: renderProtocolParticipation,
        protocolLqToken: renderProtocolLqToken,
        protocolParameters: renderProtocolParameters,
        protocolPol: renderProtocolPol,
        marketOverview: renderMarketOverview,
        marketRepayments: renderMarketRepayments,
        marketInterest: renderMarketInterest,
        marketRevenue: renderMarketRevenue,
        marketHealth: renderMarketHealth,
        marketParticipation: renderMarketParticipation,
        marketParameters: renderMarketParameters,
        marketPol: renderMarketPol
      };
      renderers[activeView]?.();
      renderedViews.add(activeView);
    }

    function hasData() {
      return Boolean(bundle?.protocolSeries?.length && deep?.protocolSummary && deep?.marketSummaries?.length);
    }

    function openDataStatus() {
      if (!hasData() || !deep?.dataStatus) return;
      renderDataStatusDialog();
      document.querySelector("#dataStatusDialog").showModal();
    }

    function renderDataStatusDialog() {
      if (!deep?.dataStatus) return;
      const status = deep.dataStatus;
      const headline = status.headline || {};
      const population = status.loanPopulation || {};
      const totalPositions = Number(population.totalPositions) || 0;
      const populationSegments = [
        ["active", "Active-debt positions", Number(population.activeDebtPositions) || 0],
        ["zero", "Zero-debt positions", Number(population.zeroDebtPositions) || 0],
        ["dust", "Excluded dust positions", Number(population.excludedDustPositions) || 0]
      ];
      const segmentWidth = (value) => totalPositions > 0 ? Math.max(0, 100 * value / totalPositions) : 0;
      const summaryParts = [
        `${integer(headline.passedChecks)} passed`,
        headline.partialChecks ? `${integer(headline.partialChecks)} partial` : "",
        headline.failedChecks ? `${integer(headline.failedChecks)} failed` : "",
        headline.unavailableChecks ? `${integer(headline.unavailableChecks)} unavailable` : ""
      ].filter(Boolean);
      const technical = status.technical || {};
      const technicalProvenance = [
        ...(Array.isArray(technical.provenance) ? technical.provenance : [
          { label: "Official source", value: technical.source },
          { label: "Generated at", value: technical.generatedAt },
          { label: "Requested history", value: technical.requestedStartDate && technical.requestedEndDate ? `${technical.requestedStartDate} to ${technical.requestedEndDate}` : null },
          { label: "Raw capture", value: technical.rawCapture }
        ]),
        { label: "Viewer build", value: VIEWER_BUILD }
      ];
      const technicalInventory = Array.isArray(technical.inventory) ? technical.inventory : [];
      const technicalEvidence = Array.isArray(technical.evidence) ? technical.evidence : [];
      const technicalRules = Array.isArray(technical.rules) ? technical.rules : [];
      document.querySelector("#dataStatusContent").innerHTML = `
        <div class="data-status-headline ${esc(headline.state || "healthy")}">
          <div>
            <strong>${esc(headline.label || "Data status available")}</strong>
            <span>${esc(summaryParts.join(" · "))}</span>
          </div>
          <span>Updated ${esc(dataStatusTimestamp(status.generatedAt))}</span>
        </div>

        <section class="data-status-section" aria-labelledby="dataCoverageTitle">
          <h3 id="dataCoverageTitle">Data coverage</h3>
          <p>What is present, how current it is, and where coverage is intentionally partial.</p>
          <div class="data-status-coverage">
            ${deep.dataStatus.coverageCards.map((card) => `
              <article class="data-status-card ${esc(card.status)}">
                <div class="data-status-card-heading">
                  <span>${esc(card.label)}</span>
                  <span class="data-status-badge ${esc(card.status)}">${esc(dataStatusLabel(card.status))}</span>
                </div>
                <strong>${esc(card.value)}</strong>
                <small>${esc(card.detail)}</small>
              </article>
            `).join("")}
          </div>
        </section>

        <section class="data-status-section" aria-labelledby="loanPopulationTitle">
          <h3 id="loanPopulationTitle">Current loan population</h3>
          <p>Which current positions contribute to debt, health, participation, and collateral analysis.</p>
          <div class="loan-population-panel">
            <div class="loan-population-total"><span>All returned loan positions</span><strong>${integer(totalPositions)}</strong></div>
            <div class="loan-population-bar" role="img" aria-label="${esc(populationSegments.map(([, label, value]) => `${label}: ${integer(value)}`).join("; "))}">
              ${populationSegments.map(([tone, label, value]) => `<span class="loan-population-segment ${tone}" style="width:${segmentWidth(value).toFixed(4)}%" title="${esc(`${label}: ${integer(value)}`)}"></span>`).join("")}
            </div>
            <div class="loan-population-legend">
              ${populationSegments.map(([tone, label, value]) => `
                <div class="loan-population-key ${tone}"><span>${esc(label)}</span><strong>${integer(value)}</strong></div>
              `).join("")}
            </div>
            <div class="loan-population-facts">
              <div><span>Liquidatable now</span><strong>${integer(population.liquidatablePositions)}</strong></div>
              <div><span>Collateral-bearing</span><strong>${integer(population.collateralPositions)}</strong></div>
              <div><span>Active rows missing observed key</span><strong>${integer(population.missingObservedKeyPositions)}</strong></div>
              <div><span>Active rows missing health factor</span><strong>${integer(population.missingHealthFactorPositions)}</strong></div>
              <div><span>Market borrow represented</span><strong>${pct(population.representedBorrowShare)}</strong></div>
            </div>
            <p class="loan-population-note">Active-debt positions drive debt, health, participation, and observed-key borrowing analysis. Zero-debt collateral positions remain valid only for the collateralized-supply view.${population.hasUnfilteredSnapshot ? "" : " The unfiltered position snapshot is unavailable in this archive."}</p>
          </div>
        </section>

        <section class="data-status-section" aria-labelledby="consistencyChecksTitle">
          <h3 id="consistencyChecksTitle">Consistency checks</h3>
          <p>The numerical comparisons that matter most for interpreting the analytics.</p>
          <div class="data-status-checks">
            ${status.checks.map((check) => `
              <div class="data-status-check ${esc(check.status)}">
                <div class="data-status-check-label"><span class="data-status-check-mark" aria-hidden="true">${dataStatusMark(check.status)}</span><span>${esc(check.label)}</span><span class="data-status-badge ${esc(check.status)}">${esc(dataStatusLabel(check.status))}</span></div>
                <div class="data-status-check-value">${esc(check.value)}</div>
                <div class="data-status-check-detail">${esc(check.detail)}</div>
              </div>
            `).join("")}
          </div>
        </section>

        <section class="data-status-section" aria-labelledby="coverageBoundariesTitle">
          <h3 id="coverageBoundariesTitle">Known coverage boundaries</h3>
          <p>Important limits that affect what conclusions the app can support.</p>
          <div class="data-status-limitations">
            ${status.limitations.map((limitation) => `<article class="data-status-limitation"><strong>${esc(limitation.title)}</strong><span>${esc(limitation.detail)}</span></article>`).join("")}
          </div>
        </section>

        <details class="data-status-technical">
          <summary>Show technical audit details</summary>
          <div class="data-status-technical-content">
            <section class="data-status-audit-group">
              <h4>Archive provenance</h4>
              <p>Where this generation came from and the requested versus observed time window.</p>
              <div class="data-status-technical-grid">
                ${technicalProvenance.map((item) => technicalDetail(item.label, item.value)).join("")}
              </div>
            </section>

            <section class="data-status-audit-group">
              <h4>Dataset inventory</h4>
              <p>Row counts and coverage represented by the currently opened archive.</p>
              <div class="data-status-audit-list">
                ${technicalInventory.map((item) => `
                  <div class="data-status-audit-row">
                    <strong>${esc(item.label)}</strong>
                    <code>${esc(item.value)}</code>
                    <span>${esc(item.detail)}</span>
                  </div>
                `).join("")}
              </div>
            </section>

            <section class="data-status-audit-group">
              <h4>Validation evidence</h4>
              <p>The actual operands behind the consistency results shown above.</p>
              <div class="data-status-audit-list">
                ${technicalEvidence.map((item) => `
                  <div class="data-status-audit-row data-status-audit-evidence ${esc(item.status)}">
                    <span class="data-status-check-mark" aria-hidden="true">${dataStatusMark(item.status)}</span>
                    <div class="data-status-audit-evidence-label"><strong>${esc(item.label)}</strong><span class="data-status-badge ${esc(item.status)}">${esc(dataStatusLabel(item.status))}</span></div>
                    <code>${esc(item.value)}</code>
                    <span>${esc(item.detail)}</span>
                  </div>
                  ${dataStatusOperands(item.operands)}
                `).join("")}
              </div>
            </section>

            <section class="data-status-audit-group">
              <h4>Validation rules</h4>
              <p>The source boundaries, classifications, and numeric tolerances used by the status checks.</p>
              <div class="data-status-audit-rules">
                ${technicalRules.map((rule) => `
                  <div class="data-status-audit-rule">
                    <strong>${esc(rule.label)}</strong>
                    <span>${esc(rule.detail)}</span>
                  </div>
                `).join("")}
              </div>
            </section>
          </div>
        </details>
      `;
    }

    function dataStatusMark(status) {
      if (status === "pass") return "&#10003;";
      if (status === "fail") return "!";
      if (status === "partial") return "~";
      return "-";
    }

    function dataStatusLabel(status) {
      if (status === "pass") return "Pass";
      if (status === "fail") return "Fail";
      if (status === "partial") return "Partial";
      return "Unavailable";
    }

    function dataStatusOperands(operands) {
      if (!Array.isArray(operands) || !operands.length) return "";
      return `<details class="data-status-operands">
        <summary>Show ${integer(operands.length)} per-market operands</summary>
        <table class="data-status-operands-table">
          <thead><tr>
            <th>Market</th>
            <th>Market borrow (USD) · expected</th>
            <th>Raw loan amount (USD)</th>
            <th>Adjusted loan debt (USD) · actual</th>
            <th>Difference (USD)</th>
            <th>Tolerance (USD)</th>
            <th>Classification</th>
          </tr></thead>
          <tbody>${operands.map((row) => `<tr>
            <td>${esc(row.marketDisplayName || row.marketId || "Unknown")}</td>
            <td>${esc(usd(row.marketBorrowInUsd))}</td>
            <td>${esc(usd(row.loanDebtInUsd))}</td>
            <td>${esc(usd(row.loanAdjustedDebtInUsd))}</td>
            <td>${esc(usd(row.adjustedDifferenceInUsd))}</td>
            <td>${esc(usd(row.toleranceUsd))}</td>
            <td>${esc(row.classification || "unavailable")}</td>
          </tr>`).join("")}</tbody>
        </table>
      </details>`;
    }

    function dataStatusTimestamp(value) {
      const timestamp = Date.parse(value);
      if (!Number.isFinite(timestamp)) return value || "at an unavailable time";
      return `${new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "UTC" }).format(new Date(timestamp))} UTC`;
    }

    function technicalDetail(label, value) {
      return `<div><span>${esc(label)}</span><code>${esc(value || "Unavailable")}</code></div>`;
    }

    function renderEmptyState() {
      const rememberedName = rememberedDataLocation?.name;
      const openActions = rememberedName ? `
            <button id="reopenLastDataButton" class="primary" type="button">Reopen ${esc(rememberedName)}</button>
            <button id="openDataArchiveButton" type="button">Open another data archive</button>
          ` : `
            <button id="openDataArchiveButton" class="primary" type="button">Open existing data archive</button>
          `;
      setHtml("overview", `
        <div class="hero">
          <h2>Open your Liqwid data</h2>
          <p>Continue with a portable data archive you already have. Once it is open, you can save it, fetch only newer data, or switch to another archive at any time.</p>
          <div class="empty-actions">
            ${openActions}
            <button id="fetchFullHistoryButton" type="button">Fetch full data history</button>
          </div>
          <p class="settings-note">No server or installation is required. Where browser permission persists, the last data location opens automatically on your next visit.</p>
        </div>
        <div class="panel">
          <h2>What a full-history fetch includes</h2>
          <p>Market history and parameters, protocol liquidation history, current active-debt position health, and official fee/revenue history. Raw API captures, clean CSV data, and computed CSV analysis stay separated inside the folder or archive.</p>
        </div>
      `);
      document.querySelector("#reopenLastDataButton")?.addEventListener("click", () => restoreLastDataOnStartup(true));
      document.querySelector("#openDataArchiveButton")?.addEventListener("click", openExistingData);
      document.querySelector("#fetchFullHistoryButton")?.addEventListener("click", requestDataFetch);
    }

    function renderOverview() {
      const p = deep.protocolSummary;
      const marketDependence = deep.currentExposure?.borrowerConcentration?.marketDependence || [];
      const totalLoanAdjustedDebtInUsd = marketDependence.reduce((sum, row) => sum + (row.loanAdjustedDebtInUsd || 0), 0);
      const totalMinInterestFloorInUsd = marketDependence.reduce((sum, row) => sum + (row.minInterestFloorInUsd || 0), 0);
      const totalBatchDriftInUsd = marketDependence.reduce((sum, row) => sum + (row.reconciliationDifferenceInUsd || 0), 0);
      const hasDependence = marketDependence.length > 0;
      setHtml("overview", `
        <div class="hero">
          <h2>Protocol liquidity</h2>
          <p>What is the protocol's current scale and how fully is its capital being used?</p>
        </div>
        <div class="kpis">
          ${kpi("Supply", usd(p.currentSupplyInUsd))}
          ${kpi("Batched Market Borrow", usd(p.currentBorrowInUsd), "Official on-chain protocol borrow (4h batch cycle)")}
          ${kpi("Live Loan Adjusted Borrow", usd(hasDependence ? totalLoanAdjustedDebtInUsd : p.currentBorrowInUsd), hasDependence ? `Protocol drift (see info bubble): ${usd(totalBatchDriftInUsd)}` : "")}
          ${kpi("Un-batched Interest Floor", usd(totalMinInterestFloorInUsd), "Protocol sum of uncollected accrued interest floor")}
          ${kpi("Liquidity", usd(p.currentLiquidityInUsd))}
          ${kpi("Utilization", pct(p.currentUtilization))}
        </div>
        ${chartSection("Capital and utilization", "How have supply, borrowing, available liquidity, and capital usage changed together?")}
        ${interactiveChartPanel("Supply, borrow, and liquidity", "protocolCapital")}
        ${interactiveChartPanel("Utilization", "protocolUtilization")}
        ${chartSection("Supply-side visibility", "How much supply appears as loan collateral, and how concentrated is that visible subset? Supply not represented as loan collateral is not leftover liquidity.")}
        <div class="chart-stack">
          ${interactiveBreakdownPanel("Current supply composition by collateral visibility", "exposureSupplyComposition")}
          ${interactiveBreakdownPanel("Observed-key concentration inside represented collateralized supply", "exposureSupplyConcentration")}
        </div>
      `);
      drawProtocolCharts();
      drawLiquidityCharts();
    }

    function renderProtocolDebtFlows() {
      const p = deep.protocolSummary || {};
      const protocolRows = chartBundleState().protocolRows;
      const latest = protocolRows.at(-1) || {};
      const debtFlowReconciliation = summarizeDebtFlowReconciliation(protocolRows);
      setHtml("protocolDebtFlows", `
        <div class="hero">
          <h2>Protocol debt flows</h2>
          <p>Is new debt forming faster than borrowers are repaying it?</p>
        </div>
        <div class="kpis">
          ${kpi("Outstanding borrow", usd(p.currentBorrowInUsd))}
          ${kpi("Current-valued debt accrued · trailing 30d", usd(latest.debtAccrued30d))}
          ${kpi("Current-valued debt repaid · trailing 30d", usd(latest.debtRepaid30d))}
          ${kpi("Current-valued debt coverage – trailing 90d", ratio(latest.debtCoverage90d), "Debt repaid divided by debt accrued")}
        </div>
        ${chartSection("Debt formation and repayment", "Is new debt forming faster than borrowers are repaying it?")}
        ${interactiveChartPanel("Current-valued rolling 30-day debt flows", "protocolDebtRolling", { help: coverageValuationHelp("protocol") })}
        ${interactiveChartPanel("Debt coverage windows", "protocolDebtCoverage", { help: coverageValuationHelp("protocol") })}
        ${interactiveChartPanel("Debt accrued and repaid by day", "protocolDebtDaily", { help: "Debt accrued is inferred in native units before USD conversion, so price movement is not counted as new debt. The first day needs a prior observation and is unavailable." })}
        ${interactiveChartPanel("Debt repayment flow", "protocolDebtRepayment")}
        ${interactiveChartPanel("Ongoing days without debt repayments", "protocolRepaymentDrySpells", { defaultPeriod: "all", help: "Each line counts consecutive observed days without debt repayment; a payment resets it to zero and missing dates break the line." })}
        ${interactiveChartPanel("Current-valued debt-flow reconciliation", "protocolDebtCumulative", { help: debtFlowReconciliationHelp(debtFlowReconciliation) })}
        ${interactiveChartPanel("Current-valued cumulative reported debt-flow difference", "protocolDebtCumulativeGap", { help: debtFlowReconciliationHelp(debtFlowReconciliation) })}
        ${interactiveChartPanel("Current-valued reported debt-flow difference", "protocolDebtGap", { help: gapValuationHelp("protocol") })}
        ${interactiveChartPanel("Protocol debt repayment distribution", "protocolDebtRepaymentDistribution")}
      `);
      drawProtocolDebtCharts();
    }

    function renderProtocolInterestFlows() {
      const p = deep.protocolSummary || {};
      const latest = chartBundleState().protocolRows.at(-1) || {};
      setHtml("protocolInterestFlows", `
        <div class="hero">
          <h2>Protocol interest flows</h2>
          <p>Are reported interest repayments keeping pace with accrual?</p>
        </div>
        <div class="kpis">
          ${kpi("Current-valued cumulative reported interest-flow difference", usd(p.cumulativeInterestGapInUsd), "Historical reported flow difference valued at the latest observed market prices; not a current interest receivable.")}
          ${kpi("Current-valued interest accrued · trailing 30d", usd(latest.interestAccrued30d))}
          ${kpi("Current-valued interest repaid · trailing 30d", usd(latest.interestRepaid30d))}
          ${kpi("Current-valued interest coverage · trailing 90d", ratio(latest.interestCoverage90d), "Interest repaid divided by interest accrued")}
        </div>
        ${chartSection("Interest formation and repayment", "When does accrued interest outpace payment, and over which windows does the gap persist?")}
        ${interactiveChartPanel("Current-valued rolling 30-day interest flows", "protocolInterestRolling", { help: coverageValuationHelp("protocol") })}
        ${interactiveChartPanel("Interest coverage windows", "protocolInterestCoverage", { help: coverageValuationHelp("protocol") })}
        ${interactiveChartPanel("Daily interest accrued and repaid", "protocolInterestDaily")}
        ${interactiveChartPanel("Interest repayment flow", "protocolInterestRepayment")}
        ${interactiveChartPanel("Ongoing days without interest repayments", "protocolInterestDrySpells", { defaultPeriod: "all", help: "Each line counts consecutive observed days without interest repayment; a payment resets it to zero and missing dates break the line." })}
        ${interactiveChartPanel("Cumulative interest accrued and repaid", "protocolInterestCumulative")}
        ${interactiveChartPanel("Current-valued cumulative reported interest-flow difference", "protocolInterestCumulativeGap", { help: interestFlowHelp("protocol") })}
        ${interactiveChartPanel("Current-valued reported interest-flow difference", "protocolInterestGap", { help: gapValuationHelp("protocol") })}
        ${interactiveChartPanel("Protocol interest repayment distribution", "protocolInterestRepaymentDistribution")}
      `);
      drawProtocolInterestCharts();
    }

    function renderProtocolStablecoinYields() {
      const stablecoinMarkets = USD_STABLECOIN_CONFIG.map((config) => {
        const direct = bundle.markets?.find((m) => String(m.id).toUpperCase() === config.id.toUpperCase());
        const supplyInUsd = Number(direct?.supply ?? 0);
        const borrowInUsd = Number(direct?.borrow ?? 0);
        const liquidityInUsd = Number(direct?.liquidity ?? 0);
        const supplyApy = Number(direct?.supplyAPY ?? 0);
        const borrowApr = Number(direct?.borrowAPR ?? 0);
        const utilization = supplyInUsd > 0 ? borrowInUsd / supplyInUsd : 0;
        return {
          id: config.id,
          label: direct?.displayName || config.label,
          color: config.color,
          supplyInUsd,
          borrowInUsd,
          liquidityInUsd,
          supplyApy,
          borrowApr,
          utilization,
          isActive: supplyInUsd > 0 || borrowInUsd > 0
        };
      });

      const totalSupplyUsd = stablecoinMarkets.reduce((sum, m) => sum + m.supplyInUsd, 0);
      const totalBorrowUsd = stablecoinMarkets.reduce((sum, m) => sum + m.borrowInUsd, 0);
      const aggregateUtilization = totalSupplyUsd > 0 ? totalBorrowUsd / totalSupplyUsd : 0;
      const supplyWeightedYield = totalSupplyUsd > 0
        ? stablecoinMarkets.reduce((sum, m) => sum + m.supplyApy * m.supplyInUsd, 0) / totalSupplyUsd
        : 0;
      const topYieldMarket = stablecoinMarkets.reduce((best, m) => (m.supplyApy > (best?.supplyApy ?? -1) ? m : best), stablecoinMarkets[0]);
      const activeCount = stablecoinMarkets.filter((m) => m.isActive).length;

      const sortedForTable = [...stablecoinMarkets].sort((a, b) => b.supplyApy - a.supplyApy || b.supplyInUsd - a.supplyInUsd);

      setHtml("protocolStablecoinYields", `
        <div class="hero">
          <h2>USD stablecoin yields</h2>
          <p>How do lending supply rates compare across USD-pegged stablecoin markets over time?</p>
        </div>
        <div class="kpis">
          ${kpi("Top USD stablecoin yield", pct(topYieldMarket?.supplyApy ?? 0), `${topYieldMarket?.label || topYieldMarket?.id} · Highest current supply APR`)}
          ${kpi("Supply-weighted USD stablecoin yield", pct(supplyWeightedYield), "Weighted by active supplied capital")}
          ${kpi("USD stablecoin supply", usd(totalSupplyUsd), "Total USD value supplied across USD stablecoins")}
          ${kpi("USD stablecoin borrow", usd(totalBorrowUsd), "Total USD value borrowed across USD stablecoins")}
          ${kpi("USD stablecoin utilization", pct(aggregateUtilization), "Aggregate USD stablecoin capital utilization")}
          ${kpi("Active USD stablecoins", integer(activeCount), "Observable USD-pegged lending pools")}
        </div>
        ${chartSection("Supply yield comparison", "How have supply APRs moved relative to one another across USD stablecoins as market demand and liquidity shifted?")}
        ${interactiveChartPanel("USD stablecoin supply APR over time", "protocolStablecoinYields")}
        <div class="panel" style="margin-top:24px">
          <div class="chart-heading">
            <div class="chart-heading-copy">
              <h2><span>USD stablecoin market comparison</span></h2>
              <p>Current lending rates, capital scale, and pool utilization across all USD-pegged stablecoin markets.</p>
            </div>
          </div>
          <div class="table-wrap">
            <table class="data-table">
              <thead>
                <tr>
                  <th>Asset</th>
                  <th style="text-align:right">Supply APR</th>
                  <th style="text-align:right">Borrow APR</th>
                  <th style="text-align:right">Utilization</th>
                  <th style="text-align:right">Supplied (USD)</th>
                  <th style="text-align:right">Borrowed (USD)</th>
                  <th style="text-align:right">Available Liquidity (USD)</th>
                </tr>
              </thead>
              <tbody>
                ${sortedForTable.map((m) => `
                  <tr>
                    <td>
                      <span style="display:inline-flex;align-items:center;gap:8px">
                        <span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:${esc(m.color)}"></span>
                        <strong>${esc(m.label)}</strong>
                      </span>
                    </td>
                    <td style="text-align:right;color:var(--mint);font-weight:600">${esc(pct(m.supplyApy))}</td>
                    <td style="text-align:right;color:var(--amber)">${esc(pct(m.borrowApr))}</td>
                    <td style="text-align:right">${esc(pct(m.utilization))}</td>
                    <td style="text-align:right">${esc(usd(m.supplyInUsd))}</td>
                    <td style="text-align:right">${esc(usd(m.borrowInUsd))}</td>
                    <td style="text-align:right">${esc(usd(m.liquidityInUsd))}</td>
                  </tr>
                `).join("")}
              </tbody>
            </table>
          </div>
        </div>
      `);
      drawProtocolStablecoinYieldsCharts();
    }

    function renderProtocolParticipation() {
      const marketDependence = deep.currentExposure?.borrowerConcentration?.marketDependence || [];
      const loan = deep.loanState.summary || {};
      const observedKeyRows = deep.currentExposure?.borrowerConcentration?.observedKeyExposure?.rows || [];
      const distinctObservedKeyCount = observedKeyRows.length || (deep.loanSnapshotHistory?.participation || []).find((row) => row.scope === "protocol")?.distinctActiveDebtObservedKeyCount || 0;
      setHtml("protocolParticipation", `
        <div class="hero">
          <h2>Protocol participation and concentration</h2>
          <p>Are active-debt positions broadening, and how concentrated are observed borrowing and collateral keys across markets?</p>
        </div>
        <div class="kpis">
          ${kpi("Active-debt positions", integer(loan.activeDebtLoanCount), "Current number of active loan positions")}
          ${kpi("Observed keys with active debt", integer(distinctObservedKeyCount), "Unique observed keys with active loan positions")}
        </div>
        ${chartSection("Active-debt positions and observed keys", "Are the number of active-debt positions and their distinct observed keys expanding or contracting?")}
        ${interactiveChartPanel("Active-debt positions over saved observations", "protocolParticipationLoans", { defaultPeriod: "all" })}
        ${interactiveChartPanel("Distinct observed keys with active debt", "protocolParticipationKeys", { defaultPeriod: "all" })}
        ${chartSection("Health-factor history", "Is active debt shifting toward stronger or weaker health-factor bands?")}
        ${interactiveChartPanel("Active-debt loan count by health-factor band", "protocolHealthHistoryCounts", { defaultPeriod: "all", help: "Tracks active-debt loan count across health-factor bands over recorded observations. Excludes governance-protected POL loans." })}
        ${interactiveChartPanel("Active debt by health-factor band", "protocolHealthHistoryDebt", { defaultPeriod: "all", help: "Tracks active debt volume across health-factor bands over recorded observations. Excludes governance-protected POL loans." })}
        ${chartSection("Cross-market observed-key concentration", "Which markets depend most heavily on their largest observed borrowing and collateral keys?")}
        ${chartSection("Market dependence on observed keys", "Which markets rely most on their largest observed keys? Differences between loan detail sums and batched market borrow can stem from Liqwid's 4-hour batch cycle lag, snapshot timing differences, or unmapped positions omitted by the API. Unmapped borrow remains visible as a hatched share of total market borrow.")}
        ${loanCoverageNotice(marketDependence)}
        ${interactiveBreakdownPanel("Largest key, next two keys, other mapped keys, and unmapped borrow", "exposureMarketKeyDependence", { help: "Rows use official market borrow as 100%. Differences between loan details and market aggregates can be caused by 4-hour batch cycle state lag (global market state updates every 4 hours, whereas loan positions update in real time), API snapshot timing differences, or unmapped positions omitted by the API. Below 100% is undercoverage; above 100% is overcoverage." })}
        ${interactiveBreakdownPanel("Observed-key borrow concentration across markets", "impactBorrowConcentrationComparison", { help: "Each curve adds one market's observed-key debt from largest to smallest. Differences can arise from 4-hour batch cycle state lag between loan detail snapshots and market aggregate state or unmapped positions omitted by the API." })}
        ${interactiveBreakdownPanel("Observed-key collateralized-supply concentration across markets", "impactCollateralizedSupplyConcentrationComparison", { help: "Each curve adds one market's observed-key collateral from largest to smallest, relative to represented collateralized supply." })}
      `);
      drawProtocolCharts();
      drawProtocolConcentrationCharts();
    }

    function renderProtocolLqToken() {
      const lq = deep?.lqToken || {};
      setHtml("protocolLqToken", `
        <div class="hero">
          <h2>LQ token & staking</h2>
          <p>How have LQ token price, staking participation, and DAO treasury holdings evolved?</p>
        </div>
        <div class="kpis">
          ${kpi("LQ Price", usdPrice(lq.currentPriceInUsd))}
          ${kpi("Staked LQ / Staking Ratio", `${assetAmount(lq.currentStakedLq, "LQ")} (${pct(lq.currentStakingRatio)})`, "Share of total supply staked")}
          ${kpi("Total Staked Value", usd(lq.currentTotalStakedValueInUsd))}
          ${kpi("DAO Treasury LQ", `${assetAmount(lq.currentDaoTreasuryLq, "LQ")} (${usd(lq.currentDaoTreasuryUsdValue)})`, "Accumulated DAO treasury reserves")}
        </div>
        ${chartSection("LQ Token, Staking & Treasury History", "Track historical LQ price, staking activity, and DAO treasury reserves over time.")}
        ${interactiveChartPanel("LQ token price history", "protocolLqPrice")}
        ${interactiveChartPanel("Staked LQ history & staking ratio", "protocolLqStaking")}
        ${interactiveChartPanel("DAO treasury LQ balance history", "protocolLqTreasury")}
      `);
      drawProtocolCharts();
    }

    function renderProtocolParameters() {
      const state = deep?.protocolParameters || {};
      const current = state.current || {};
      const latestEvent = current.latestGovernanceEvent || null;
      const latestEventLabel = latestEvent
        ? `${latestEvent.marketName || latestEvent.marketId} · ${formatParameterTimestamp(latestEvent.timestamp)}`
        : "No observable event";
      const currentOnlyAvailable = (state.marketRows || []).some((row) =>
        row.minHealthFactor != null || row.closeFactor != null || row.maxCollateralCount != null
      );

      setHtml("protocolParameters", `
        <div class="hero">
          <h2>Protocol parameter landscape</h2>
          <p>How do market-level rate, capacity, liquidation, collateral, and income-allocation settings combine into the protocol's current policy posture?</p>
          <div class="parameter-effective"><strong>Market-level configuration, rolled up transparently</strong><span aria-hidden="true">&middot;</span><span>No single protocol-wide interest-rate model is implied</span></div>
        </div>
        <div class="kpis">
          ${kpi(
            "Parameter history coverage",
            `${integer(current.parameterizedMarketCount)} / ${integer(current.totalMarketCount)} markets`,
            `${pct(current.parameterCoverage)} of current borrow`,
            "Markets and current borrow for which an official analytics.marketParamsHistory row is available. POL is excluded from detailed protocol analytics."
          )}
          ${kpi(
            "Borrow-weighted kink",
            pct(current.borrowWeightedKink),
            "Weighted by each covered market's current USD borrow",
            "Sum of each covered market's optimal-utilization kink multiplied by its current USD borrow, divided by covered current USD borrow."
          )}
          ${kpi(
            "Borrow above kink thresholds",
            usd(current.borrowAboveKinkInUsd),
            `${pct(current.borrowAboveKinkShare)} of protocol borrow`,
            "For each covered market, max(0, current borrow USD - kink × current supply USD), then summed. This counts only borrow beyond the kink threshold, not all borrow in an above-kink market."
          )}
          ${kpi(
            "Capped supply headroom",
            usd(current.supplyCapHeadroomInUsd),
            `${integer(current.cappedMarketCount)} markets report an explicit supply cap`,
            "For every explicitly capped market, max(0, native supply cap × current asset price - current supply USD), then summed. Uncapped markets are excluded."
          )}
          ${kpi(
            "Collateral rule pairs",
            integer(current.collateralPairCount),
            "Borrowed market × eligible collateral configurations",
            "Count of current collateral-parameter rows exposed by liqwid.data.markets.parameters.collateralParameters."
          )}
          ${kpi(
            "Latest governance update",
            latestEvent?.marketName || latestEvent?.marketId || "n/a",
            latestEventLabel,
            "Latest exact market-parameter event returned by analytics.marketParamsHistory across the included markets."
          )}
        </div>
        <aside class="parameter-empty">
          <strong>Availability boundary.</strong>
          ${esc(state.availability?.historical || "Rate, cap, and allocation history uses exact official market governance events.")}
          ${esc(state.availability?.currentOnly || "Liquidation and collateral guardrails are current snapshot values only.")}
          ${currentOnlyAvailable ? "" : " This opened archive predates current guardrail capture; refresh it to populate those fields."}
        </aside>
        ${chartSection("Current rate policy", "Compare today's market curves and identify borrowed markets operating beyond their governance-defined optimal utilization.")}
        ${interactiveBreakdownPanel("Borrow APR curve atlas", "protocolParameterRateAtlas", { help: "Borrower APR curves for the eight markets with the largest current USD borrow and an official parameter row. Each curve uses that market's latest official base, optimal, maximum, kink, and utilization-cap values." })}
        ${interactiveBreakdownPanel("Current utilization versus optimal kink", "protocolParameterPolicyMap", { help: "Each point is a market. X is current utilization, Y is its optimal-utilization kink, bubble size is current borrow, and color is maximum borrower APR. Points to the right of their kink value are operating above the optimal threshold." })}
        ${chartSection("Current capacity and risk guardrails", "Inspect explicit supply headroom, liquidation-entry settings, and the most conservative collateral limits in each borrowed market.")}
        ${interactiveBreakdownPanel("Current capacity headroom", "protocolParameterCapacity", { help: "Only markets with an explicit supply cap are included. Current supply and remaining headroom stack to the current USD value of the native-asset cap." })}
        ${interactiveBreakdownPanel("Current market guardrails", "protocolParameterGuardrails", { help: "Minimum health buffer is max(0, minimum health factor - 1). Close factor is the maximum share of debt the current parameter allows to be closed in the relevant liquidation step." })}
        ${interactiveBreakdownPanel("Current collateral risk matrix", "protocolParameterCollateral", { help: "One row per borrowed market. Maximum LTV and liquidation threshold use the lowest configured value across eligible collaterals; liquidation penalty uses the highest. Exact market-collateral pairs remain in the table below." })}
        ${chartSection("Historical protocol posture", "Track daily end-of-day borrow-weighted policy values without pretending that governance parameters drifted between exact updates.")}
        ${interactiveChartPanel("Borrow-weighted rate policy", "protocolParameterRateHistory", { defaultPeriod: "all", help: "For each UTC day, each market uses the latest exact governance event effective by day-end. Values are weighted by that day's official market borrow in USD." })}
        ${interactiveChartPanel("Borrow-weighted kink and utilization cap", "protocolParameterUtilizationHistory", { defaultPeriod: "all", help: "Daily end-of-day optimal-utilization kinks and effective utilization caps, weighted by official market borrow in USD. A missing market parameter row is excluded and remains visible through the coverage chart." })}
        ${interactiveChartPanel("Borrow-weighted income allocation", "protocolParameterAllocationHistory", { defaultPeriod: "all", help: "Daily end-of-day supplier, dividend/LQ-staker, treasury, and reserve-remainder shares weighted by official market borrow in USD. These describe policy posture, not realized revenue recipients." })}
        ${interactiveChartPanel("Parameter coverage and above-kink borrow", "protocolParameterCoverageHistory", { defaultPeriod: "all", help: "Coverage is parameter-covered borrow divided by total borrow. Above-kink share sums only the marginal borrow exceeding kink × supply in each covered market." })}
        ${interactiveChartPanel("Governance update activity", "protocolParameterGovernanceActivity", { defaultPeriod: "all", help: "Bars occur only on exact UTC dates containing official governance events. The first observable event for a market is not assigned an invented changed-field count." })}
        ${dataTablesSection([
          { title: "Current market parameter posture", content: protocolParameterCurrentTable(state.marketRows || []) },
          { title: "Current market-collateral guardrails", content: protocolCollateralTable(state.collateralRows || []) },
          { title: "Exact governance updates across markets", content: protocolGovernanceTable(state.governanceEvents || []) }
        ])}
      `);
      drawProtocolParameterCharts();
    }

    function renderProtocolPol() {
      const pol = deep.pol || {};
      const summary = pol.summary || {};
      const positions = (pol.positions || []).map((pos) => ({
        market: pos.marketDisplayName || pos.marketId,
        debtInUsd: pos.debtInUsd,
        lockedCollateral: `${(Number(pos.collateralTokens || 0) / 1e6).toFixed(2)}M qPOL`,
        collateralInUsd: pos.collateralInUsd,
        nominalLtv: pos.nominalLTV,
        nominalHealthFactor: pos.nominalHealthFactor ?? (pos.debtInUsd > 0 ? pos.collateralInUsd / pos.debtInUsd : 0),
        protocolHealthFactor: pos.healthFactor,
        borrowApy: pos.borrowAPY,
        annualInterestInUsd: pos.annualInterestCostInUsd,
        liquidationStatus: "Protected (0% Penalty)"
      }));

      setHtml("protocolPol", `
        <div class="hero">
          <h2>Protocol-Owned Liquidity (POL)</h2>
          <p>Tracking the Liqwid DAO and core development infrastructure financing loans, backed by locked qPOL collateral.</p>
          <div class="parameter-effective"><strong>Governance-Protected Positions</strong><span aria-hidden="true">&middot;</span><span>100x Collateral Weight &middot; 0% Liquidation Penalty</span></div>
        </div>
        <p class="note" style="margin: 0 0 1rem 0; font-size: 0.85rem; color: #94a3b8;">
          <em><strong>Historical API Disclosure Note:</strong> Prior to August 25, 2026, individual Protocol-Owned Liquidity (POL) loan positions and collateral details were not included in the official Liqwid GraphQL loans API endpoint (although POL loans were already active on-chain). Historical loan-level tracking begins with the first API disclosure on August 25, 2026.</em>
        </p>
        <div class="kpis">
          ${kpi("Total POL debt", usd(summary.totalDebtInUsd), `${integer(summary.loanCount)} active stablecoin loans`, "Sum of all active loan balances across the 4 protocol-owned liquidity financing positions.")}
          ${kpi("Annual interest yield paid (at current rates)", usd(summary.totalAnnualInterestCostInUsd), `Projected at current rates · ${pct(summary.weightedAverageAPY)} weighted APY`, "Total forward-looking annualized interest payments generated across all active Protocol-Owned Liquidity (POL) positions based on current debt balances and instantaneous borrow APYs.")}
          ${kpi("POL share of protocol borrow", pct(summary.protocolBorrowShare), `${usd(summary.totalDebtInUsd)} of ${usd(summary.totalProtocolBorrowInUsd || (summary.protocolBorrowShare > 0 ? summary.totalDebtInUsd / summary.protocolBorrowShare : summary.totalDebtInUsd))} total borrow`, "Share of total protocol borrow represented by Protocol-Owned Liquidity.")}
          ${kpi("Locked POL collateral", `${(Number(summary.totalCollateralTokens || 0) / 1e6).toFixed(2)}M qPOL`, `${usd(summary.totalCollateralInUsd)} market value`, "Total qPOL tokens locked in the Plutus loan validator as backing for the POL borrow positions.")}
          ${kpi("Weighted average borrow APY", pct(summary.weightedAverageAPY), `${usd(summary.totalAnnualInterestCostInUsd)} est. annual interest`, "Debt-weighted borrow APY paid by the POL positions into the liquidity pools and DAO reserves.")}
          ${kpi("Active POL positions", `${integer(summary.loanCount)} markets`, "DJED · USDM · wanUSDC · iUSD", "The four active stablecoin borrowing markets utilized for protocol development and ecosystem liquidity.")}
        </div>

        <section class="summary-group" aria-labelledby="polGovernanceHeading">
          <div class="summary-heading">
            <h3 id="polGovernanceHeading">Governance & Liquidation Protection Mechanics</h3>
            <p>Why POL loans remain protected from liquidation even with nominal undercollateralization.</p>
          </div>
          <div class="card-grid" style="display: grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); gap: 1rem; margin-top: 1rem;">
            <div class="panel" style="padding: 1.25rem; background: var(--panel2); border-radius: 8px; border: 1px solid var(--line);">
              <h4 style="margin: 0 0 0.5rem 0; color: var(--accent);">100x Collateral Weight</h4>
              <p style="margin: 0; font-size: 0.9rem; color: #bcd2e8; line-height: 1.5;">Liqwid market parameters assign a <code>collateralWeight: 100</code> (10,000%) to qPOL collateral. The Plutus smart contract calculates health factor as <code>(Collateral USD &times; 100) / Debt USD</code>, resulting in effective health factors between 39 and 81.</p>
            </div>
            <div class="panel" style="padding: 1.25rem; background: var(--panel2); border-radius: 8px; border: 1px solid var(--line);">
              <h4 style="margin: 0 0 0.5rem 0; color: var(--accent);">0% Liquidation Penalty</h4>
              <p style="margin: 0; font-size: 0.9rem; color: #bcd2e8; line-height: 1.5;">The liquidation penalty and liquidator profitability parameters are set to <code>0.00%</code>. Liquidators have no financial incentive or contract authorization to liquidate these protocol positions.</p>
            </div>
            <div class="panel" style="padding: 1.25rem; background: var(--panel2); border-radius: 8px; border: 1px solid var(--line);">
              <h4 style="margin: 0 0 0.5rem 0; color: var(--accent);">Borrower Public Key</h4>
              <p style="margin: 0; font-size: 0.9rem; color: #bcd2e8; line-height: 1.5;">All four positions belong to the dedicated protocol team key: <code style="word-break: break-all;">7ac5878231522baf2972231d1a587e20a0d814c164fa7fea28ee459f</code>.</p>
            </div>
            <div class="panel" style="padding: 1.25rem; background: var(--panel2); border-radius: 8px; border: 1px solid var(--line);">
              <h4 style="margin: 0 0 0.5rem 0; color: var(--accent);">Economic Role</h4>
              <p style="margin: 0; font-size: 0.9rem; color: #bcd2e8; line-height: 1.5;">POL borrows generate continuous borrow interest payments (projected at ${usd(summary.totalAnnualInterestCostInUsd)}/year at current rates) that directly flow into supplier deposit yields and protocol treasury reserves.</p>
            </div>
          </div>
        </section>

        ${chartSection("Current POL position dynamics", "How do borrow obligations, locked collateral backing, pool borrow dominance, and interest cash flows compare across the four markets?")}
        ${interactiveBreakdownPanel("Current POL debt and locked collateral by market", "protocolPolMarketComparison", { help: "Compares current outstanding borrow debt against locked qPOL collateral market value across the 4 POL borrowing markets." })}
        ${interactiveBreakdownPanel("Annual interest yield paid and contribution by market (at current rates)", "protocolPolInterestContribution", { help: "Compares projected annual interest cash flows in USD across POL positions, calculated from current debt balances and current borrow APY rates (run-rate projection, not historical interest paid). Shows each market's projected dollar amount and relative contribution share to total protocol POL interest." })}
        ${interactiveBreakdownPanel("Nominal LTV versus governance health factor", "protocolPolHealthComparison", { help: "Shows the nominal loan-to-value ratio alongside unweighted Nominal Health Factor (Collateral / Debt) and effective on-chain Health Factor enabled by the 100x collateral weight multiplier." })}
        ${interactiveBreakdownPanel("POL share of pool borrow and borrow APY", "protocolPolBorrowShare", { help: "Shows what fraction of total market borrowing is protocol-owned, alongside the borrow APY paid by each position." })}

        ${chartSection("Historical POL trajectory", "How have protocol-owned debt obligations and locked collateral changed across snapshot observations?")}
        ${interactiveChartPanel("POL debt and collateral valuation history", "protocolPolDebtHistory", { defaultPeriod: "all", help: "Tracks historical aggregate POL borrow obligations in USD and locked qPOL collateral valuation across recorded snapshot observations." })}
        ${interactiveChartPanel("POL stablecoin borrow breakdown over time", "protocolPolMarketBreakdownHistory", { defaultPeriod: "all", help: "Tracks the historical outstanding debt balance across each individual stablecoin market (DJED, USDM, wanUSDC, iUSD)." })}

        ${dataTablesSection([
          {
            title: "Active Protocol-Owned Liquidity (POL) positions",
            content: scrollTable(positions, [
              "market",
              "debtInUsd",
              "lockedCollateral",
              "collateralInUsd",
              "nominalLtv",
              "nominalHealthFactor",
              "protocolHealthFactor",
              "borrowApy",
              "annualInterestInUsd",
              "liquidationStatus"
            ])
          }
        ])}
      `);
      drawProtocolPolCharts();
    }

    function renderRevenue() {
      const revenue = deep.revenue || {};
      const summary = revenue.summary || {};
      const latestRunRate = (revenue.annualizedRunRateSeries || []).at(-1) || {};
      const ytdCollectionPeriod = periodLabel(summary.ytdCollectedCoverageFromDate, summary.ytdCollectedCoverageToDate);
      const collectionPeriod = periodLabel(summary.collectedCoverageFromDate, summary.collectedCoverageToDate);
      const allocationPeriod = periodLabel(
        summary.cumulativeAllocationFromDate,
        summary.cumulativeAllocationToDate
      );
      const runRatePeriod = periodLabel(latestRunRate.windowStartDate, latestRunRate.windowEndDate);
      const topMarket = summary.topRevenueMarket
        || deep.marketRevenue?.topYtdMarket
        || (deep.marketSummaries || []).reduce((best, m) => {
          const rev = m.marketRevenue || {};
          const totalRev = rev.ytdAttributedCollectedMarketRevenueInUsd ?? ((rev.ytdDirectOriginationRevenueInUsd ?? 0) + (rev.ytdAttributedCollectedInterestRevenueInUsd ?? 0));
          return totalRev > (best?.totalRevenueInUsd || 0) ? {
            marketId: m.marketId,
            marketDisplayName: m.displayName || m.symbol || m.marketId,
            totalRevenueInUsd: totalRev,
            revenueShare: (summary.ytdCollectedRevenueInUsd > 0) ? totalRev / summary.ytdCollectedRevenueInUsd : 0
          } : best;
        }, null);
      const topMarketName = topMarket?.marketDisplayName || topMarket?.marketId || "None";
      const topMarketNote = topMarket && topMarket.totalRevenueInUsd > 0
        ? `${usd(topMarket.totalRevenueInUsd)} · ${pct(topMarket.revenueShare)} of YTD total`
        : "No YTD revenue observed";
      setHtml("revenue", `
        <div class="hero">
          <h2>Protocol revenue</h2>
          <p>How much retained interest and origination revenue has been collected this year and over the full history, and what has accrued to the DAO and LQ stakers?</p>
        </div>
        ${metricPeriodGroup("Year-to-date collected revenue", ytdCollectionPeriod, `${integer(summary.ytdCollectedCompleteDays)} complete days`, `
          ${kpi("YTD collected revenue", usd(summary.ytdCollectedRevenueInUsd), "Revenue from repaid interest + loan origination fees")}
          ${kpi("Revenue from repaid interest", usd(summary.ytdCollectedInterestRevenueInUsd), "Retained share of borrowers' repaid interest")}
          ${kpi("Loan origination fees", usd(summary.ytdCollectedOriginationRevenueInUsd), "Base fee + minimum-ADA fee")}
          ${kpi("Top revenue market", topMarketName, topMarketNote)}
        `)}
        ${metricPeriodGroup("All-time collected revenue", collectionPeriod, `${integer(summary.completeDays)} complete days`, `
          ${kpi("Collected revenue", usd(summary.collectedRevenueInUsd), "Treasury + LQ stakers; repayment-time recipient split unavailable")}
          ${kpi("Interest revenue collected", usd(summary.collectedInterestRevenueInUsd), "Retained share of borrowers' repaid interest")}
          ${kpi("Origination fees collected", usd(summary.collectedOriginationRevenueInUsd), "Base fee + minimum-ADA fee")}
        `)}
        ${chartSection("Collected revenue", "When did retained interest and origination revenue reach the protocol and its stakers?")}
        ${interactiveChartPanel("Daily collected revenue", "protocolCollectedRevenueDaily", { defaultPeriod: "all", help: "Repayment-timed retained-interest revenue plus both origination-fee components. Liquidation profit is shown only in the Liquidations tab." })}
        ${interactiveChartPanel("Monthly collected revenue", "protocolCollectedRevenueMonthly", { defaultPeriod: "all", help: "Daily collected revenue grouped by UTC calendar month. The current partial month remains visible." })}
        ${interactiveBreakdownPanel("Market YTD revenue contribution", "protocolMarketRevenueContributionYtd", { help: "Contribution of each market to year-to-date collected revenue, sorted from highest to lowest. Bars stack retained interest revenue collected and upfront loan origination fees." })}
        ${metricPeriodGroup("Cumulative accrued DAO allocation", allocationPeriod, `${integer(summary.completeAllocationDays)} complete days`, `
          ${kpi("DAO / treasury revenue", usd(summary.allocatedProtocolRevenueInUsd))}
          ${kpi("DAO interest allocation", usd(summary.allocatedProtocolInterestRevenueInUsd))}
          ${kpi("DAO origination allocation", usd(summary.allocatedProtocolOriginationRevenueInUsd))}
        `)}
        ${metricPeriodGroup("Recent DAO run rate", runRatePeriod, "Latest 90 consecutive complete days", `
          ${kpi("Annualized run rate", usd(summary.allocatedProtocolRevenueAnnualizedRunRateInUsd), "Trailing 90-day revenue: " + usd(summary.allocatedProtocolRevenueTrailing90DaysInUsd))}
          ${kpi("Change vs prior 90 days", pct(summary.allocatedProtocolRevenueChangeVsPrior90Days))}
        `)}
        ${chartSection("Accrued DAO revenue", "How much revenue has accrued to the DAO, and how are its level and composition changing?")}
        ${interactiveChartPanel("Historical annualized DAO revenue run rate", "protocolRevenueRunRate", { defaultPeriod: "all", help: "Each point annualizes the latest 90 consecutive complete UTC days. The current UTC day is excluded until closed." })}
        ${interactiveChartPanel("Monthly DAO revenue allocation", "protocolDaoRevenueAllocationMonthly", { defaultPeriod: "all", help: "DAO interest and origination allocations are summed from official daily rows. The current partial month remains visible." })}
        ${interactiveChartPanel("Daily DAO revenue allocation", "protocolDaoRevenueAllocationDaily", { defaultPeriod: "all" })}
        ${metricPeriodGroup("Cumulative accrued LQ-staker allocation", allocationPeriod, `${integer(summary.completeAllocationDays)} complete days`, `
          ${kpi("LQ-staker allocation", usd(summary.allocatedHoldersRevenueInUsd))}
          ${kpi("LQ-staker interest allocation", usd(summary.allocatedHoldersInterestRevenueInUsd))}
          ${kpi("LQ-staker origination allocation", usd(summary.allocatedHoldersOriginationRevenueInUsd))}
        `)}
        ${chartSection("LQ-staker revenue", "How much revenue has accrued to LQ stakers, and which source drives it?")}
        ${interactiveChartPanel("Monthly LQ-staker revenue allocation", "protocolStakerRevenueAllocationMonthly", { defaultPeriod: "all", help: "LQ-staker interest and origination allocations are summed from official daily rows. The current partial month remains visible." })}
        ${interactiveChartPanel("Daily LQ-staker revenue allocation", "protocolStakerRevenueAllocationDaily", { defaultPeriod: "all" })}
      `);
      drawRevenueCharts();
    }

    function renderLiquidations() {
      const liquidation = deep.liquidation || {};
      const fullPeriod = liquidation.fullPeriodProtocolLiquidationProfit || {};
      const fullPeriodProfit = fullPeriod.liquidationProfitInUsd;
      setHtml("liquidations", `
        <div class="hero"><h2>Protocol liquidations</h2><p>When has liquidation activity generated profit, and how long has the protocol been quiet?</p></div>
        ${metricPeriodGroup("Full observable liquidation period", periodLabel(fullPeriod.fromDate, fullPeriod.toDate), "", `
          ${kpi("Full-period liquidation profit", usdDetailed(fullPeriodProfit))}
          ${kpi("Current days without liquidations", integer(liquidation.currentDaysWithoutLiquidations))}
        `)}
        ${chartSection("Liquidation-profit history", "When did liquidation profit spike, persist, or return after a quiet period?")}
        ${interactiveChartPanel("Monthly liquidation profit", "liquidationMonthly", { defaultPeriod: "all" })}
        ${interactiveChartPanel("Daily liquidation profit", "liquidationDaily")}
        ${interactiveChartPanel("Ongoing days without liquidations", "liquidationDrySpell", { defaultPeriod: "all" })}
      `);
      drawLiquidationCharts();
    }

    function renderCurrentExposure() {
      const exposure = deep.currentExposure || {};
      const loan = deep.loanState.summary || {};
      const alerts = exposure.alerts || {};
      const collateral = exposure.collateralRisk || {};
      const borrowers = exposure.borrowerConcentration || {};
      const supply = exposure.supplySide || {};
      const keyExposure = borrowers.observedKeyExposure || {};
      const availableThresholds = keyExposure.thresholds?.length ? keyExposure.thresholds : [1.10, 1.20, 1.25];
      if (!availableThresholds.some((threshold) => Number(threshold) === Number(exposureHfThreshold))) {
        exposureHfThreshold = Number(keyExposure.defaultThreshold || availableThresholds[0]);
      }
      const keyRankingRows = observedKeyRowsAtThreshold(keyExposure, exposureHfThreshold);
      const pressure = alerts.marketPressure?.[0];
      const coverage7 = alerts.coverageWindows?.find((row) => Number(row.windowDays) === 7);
      const coverage30 = alerts.coverageWindows?.find((row) => Number(row.windowDays) === 30);
      const coverage90 = alerts.coverageWindows?.find((row) => Number(row.windowDays) === 90);
      const collateralLeader = collateral.byCollateral?.[0];
      const collateralLeader110 = (collateral.byCollateral || []).reduce((best, row) => Number(row.debtAtOrBelow110InUsd || 0) > Number(best?.debtAtOrBelow110InUsd || 0) ? row : best, null);
      const collateralLeaderBadDebt = (collateral.byCollateral || []).reduce((best, row) => Number(row.badDebtInUsd || 0) > Number(best?.badDebtInUsd || 0) ? row : best, null);
      const borrowedLeaderBadDebt = (collateral.byBorrowed || []).reduce((best, row) => Number(row.badDebtInUsd || 0) > Number(best?.badDebtInUsd || 0) ? row : best, null)
        || (deep.loanState?.byMarket || []).reduce((best, row) => Number(row.badDebtInUsd || row.activeLoanBadDebtInUsd || 0) > Number(best?.badDebtInUsd || best?.activeLoanBadDebtInUsd || 0) ? row : best, null);

      const borrowedBadDebtLeader = (borrowedLeaderBadDebt && Number(borrowedLeaderBadDebt.badDebtInUsd || borrowedLeaderBadDebt.activeLoanBadDebtInUsd || 0) > 0) ? borrowedLeaderBadDebt : null;
      const collateralBadDebtLeader = (collateralLeaderBadDebt && Number(collateralLeaderBadDebt.badDebtInUsd || 0) > 0) ? collateralLeaderBadDebt : null;

      const marketNamesMap = new Map((deep.markets || deep.bundle?.markets || []).map((m) => [m.id || m.marketId, m.displayName || m.symbol || m.id || m.marketId]));
      const rawBorrowedName = borrowedBadDebtLeader?.borrowedDisplayName || borrowedBadDebtLeader?.marketDisplayName || borrowedBadDebtLeader?.borrowedMarketId || borrowedBadDebtLeader?.marketId;
      const borrowedBadDebtName = marketNamesMap.get(rawBorrowedName) || rawBorrowedName || "n/a";
      const borrowedBadDebtGross = borrowedBadDebtLeader ? Number(borrowedBadDebtLeader.badDebtInUsd || borrowedBadDebtLeader.activeLoanBadDebtInUsd || 0) : 0;
      const borrowedBadDebtShortfall = borrowedBadDebtLeader ? Number(borrowedBadDebtLeader.badDebtShortfallInUsd || borrowedBadDebtLeader.activeLoanBadDebtShortfallInUsd || Math.max(0, borrowedBadDebtGross - Number(borrowedBadDebtLeader.badDebtCollateralInUsd || 0))) : 0;
      const borrowedBadDebtNote = borrowedBadDebtLeader ? `${usd(borrowedBadDebtGross)} gross bad debt · (${usd(borrowedBadDebtShortfall)} net shortfall)` : "No bad debt";

      const rawCollateralName = collateralBadDebtLeader?.collateralDisplayName || collateralBadDebtLeader?.marketDisplayName || collateralBadDebtLeader?.collateralMarketId || collateralBadDebtLeader?.marketId;
      const collateralBadDebtName = marketNamesMap.get(rawCollateralName) || rawCollateralName || "n/a";
      const collateralBadDebtGross = collateralBadDebtLeader ? Number(collateralBadDebtLeader.badDebtInUsd || 0) : 0;
      const collateralBadDebtShortfall = collateralBadDebtLeader ? Number(collateralBadDebtLeader.badDebtShortfallInUsd || 0) : 0;
      const collateralBadDebtNote = collateralBadDebtLeader ? `${usd(collateralBadDebtGross)} gross bad debt · (${usd(collateralBadDebtShortfall)} net shortfall)` : "No bad debt";
      const concentratedMarket = (borrowers.marketDependence || []).find((row) => row.observedKeyCount > 0);
      const lowHfCollateralDebt = (collateral.byCollateral || []).reduce((sum, row) => sum + Number(row.debtAtOrBelow125InUsd || 0), 0);
      const lowHfCollateralDebt110 = (collateral.byCollateral || []).reduce((sum, row) => sum + Number(row.debtAtOrBelow110InUsd || 0), 0);
      const summary = exposure.summary || {};
      const badDebtInUsd = summary.badDebtInUsd || 0;
      const badDebtShortfallInUsd = summary.badDebtShortfallInUsd || Math.max(0, badDebtInUsd - (summary.badDebtCollateralInUsd || 0));
      const badDebtLoanCount = summary.badDebtLoanCount || 0;
      const lowHfCollateralDebt100 = Math.max(summary.debtBelowHf100InUsd || 0, badDebtInUsd, (collateral.byCollateral || []).reduce((sum, row) => sum + Number(row.debtBelow100InUsd || 0), 0));
      const nearLiquidationObservedKeyDebt = (borrowers.concentrationSensitivity || []).find((row) => Number(row.threshold) === 1.25);
      const criticalObservedKeyDebt = (borrowers.concentrationSensitivity || []).find((row) => Number(row.threshold) === 1.10);
      const liquidatableObservedKeyDebt = (borrowers.concentrationSensitivity || []).find((row) => Number(row.threshold) === 1.00);
      const marketCoverageRows = loanCoverageTableRows(borrowers.marketDependence || []);
      setHtml("exposure", `
        <div class="hero">
          <h2>Current protocol exposure</h2>
          <p>Where is current debt most vulnerable to market or collateral stress?</p>
        </div>
        <div class="kpis">
          ${kpi("Min health factor", ratio(loan.minHealthFactor))}
        </div>
        <section class="summary-group" aria-labelledby="debtExposureHeading">
          <div class="summary-heading">
            <h3 id="debtExposureHeading">Debt exposure</h3>
            <p>Current debt close to liquidation, shown in US dollars. Collateral-attributed debt covers collateral from active-debt positions; observed-key debt is the mapped subset.</p>
          </div>
          <div class="kpis">
            ${kpi("Debt below HF 1.0", usd(lowHfCollateralDebt100), liquidatableObservedKeyDebt ? `${pct(liquidatableObservedKeyDebt.top3DebtShare)} held by the top 3 observed keys at HF <= 1.00` : "Debt in liquidation condition")}
            ${kpi("Debt at critical health", usd(lowHfCollateralDebt110), `${pct(criticalObservedKeyDebt?.top3DebtShare)} held by the top 3 observed keys at HF <= 1.10`)}
            ${kpi("Debt near liquidation", usd(lowHfCollateralDebt), `${pct(nearLiquidationObservedKeyDebt?.top3DebtShare)} held by the top 3 observed keys at HF <= 1.25`)}
          </div>
          <div class="kpis">
            ${kpi("Bad debt", usd(badDebtInUsd), badDebtLoanCount > 0 ? `${usd(badDebtShortfallInUsd)} net shortfall · ${badDebtLoanCount} underwater loan${badDebtLoanCount === 1 ? '' : 's'} (debt > collateral)` : "No loans where debt exceeds collateral value")}
          </div>
        </section>

        ${Number(summary.polDebtInUsd || 0) > 0 ? `
        <section class="summary-group" aria-labelledby="polObligationsExposureHeading">
          <div class="summary-heading">
            <h3 id="polObligationsExposureHeading">Protocol-Owned Liquidity (POL) Obligations</h3>
            <p>Non-liquidatable protocol financing positions backed by locked qPOL under governance-weighted liquidation immunity.</p>
          </div>
          <div class="kpis">
            ${kpi("POL active debt", usd(summary.polDebtInUsd), `${pct(summary.polShareOfTotalDebt)} of total protocol debt`)}
            ${kpi("POL collateral value", usd(summary.polCollateralInUsd), `${integer(summary.polLoanCount)} active positions`)}
            ${kpi("Liquidation status", "Protected (0% Penalty)", "Collateral weight: 100x · Immune from liquidation")}
          </div>
        </section>
        ` : ""}

        <section class="summary-group" aria-labelledby="assetHighlightsHeading">
          <div class="summary-heading">
            <h3 id="assetHighlightsHeading">Asset highlights</h3>
            <p>The assets that currently stand out in utilization pressure and collateral risk.</p>
          </div>
          <div class="kpis">
            ${kpi("Borrowed asset with highest bad debt", borrowedBadDebtName, borrowedBadDebtNote)}
            ${kpi("Collateral asset with linked highest bad debt", collateralBadDebtName, collateralBadDebtNote)}
            ${kpi("Borrowed asset under most pressure", pressure?.marketDisplayName || "n/a", pressure ? `${pct(pressure.currentUtilization)} utilization · ${signedPct(pressure.utilizationChange7d)} over 7d` : "No active market row")}
            ${kpi("Largest critical collateral", collateralLeader110?.collateralDisplayName || "n/a", collateralLeader110 ? `${usd(collateralLeader110.debtAtOrBelow110InUsd)} debt at HF <= 1.10` : "No collateral composition")}
            ${kpi("Largest near-liquidation collateral", collateralLeader?.collateralDisplayName || "n/a", collateralLeader ? `${usd(collateralLeader.debtAtOrBelow125InUsd)} debt at HF <= 1.25` : "No collateral composition")}
          </div>
        </section>

        ${exposure.isolatedSilos?.length ? `
        <section class="summary-group" aria-labelledby="isolatedSilosHeading">
          <div class="summary-heading">
            <h3 id="isolatedSilosHeading">Isolated Market Silos</h3>
            <p>Ring-fenced isolated lending pools where volatile single collaterals back specific borrow pairs with zero contagion risk to the core protocol.</p>
          </div>
          <div class="kpis">
            ${exposure.isolatedSilos.map((silo) => `
              ${kpi(
                `${esc(silo.groupName)} Silo`,
                `${usd(silo.totalCollateralInUsd)} Collateral · ${usd(silo.totalDebtInUsd)} Borrow`,
                `${silo.activeLoanCount} active loan${silo.activeLoanCount === 1 ? '' : 's'} · Coverage: ${silo.coverageRatio ? (silo.coverageRatio * 100).toFixed(1) + '%' : 'n/a'} · Bad Debt: ${usd(silo.badDebtInUsd)}`
              )}
            `).join('')}
          </div>
        </section>
        ` : ''}

        <section class="summary-group" aria-labelledby="coverageHeading">
          <div class="summary-heading">
            <h3 id="coverageHeading">Debt and interest coverage</h3>
            <p>Each market's native repaid and accrued window totals are valued at that market's current observed price before protocol USD operands and ratios are summed.</p>
          </div>
          <div class="coverage-matrix-scroll">
            <div class="coverage-matrix" role="table" aria-label="Debt and interest coverage by trailing window">
              <div class="coverage-corner" role="columnheader">Coverage</div>
              <div class="coverage-window" role="columnheader">7 days</div>
              <div class="coverage-window" role="columnheader">30 days</div>
              <div class="coverage-window" role="columnheader">90 days</div>
              <div class="coverage-row-label" role="rowheader">Interest coverage<span>Interest repaid / accrued</span></div>
              ${coverageCell(coverage7, "coverageRatio", "interest")}
              ${coverageCell(coverage30, "coverageRatio", "interest")}
              ${coverageCell(coverage90, "coverageRatio", "interest")}
              <div class="coverage-row-label" role="rowheader">Debt coverage<span>Debt repaid / accrued</span></div>
              ${coverageCell(coverage7, "debtCoverageRatio", "debt")}
              ${coverageCell(coverage30, "debtCoverageRatio", "debt")}
              ${coverageCell(coverage90, "debtCoverageRatio", "debt")}
            </div>
          </div>
        </section>

        ${chartSection("Health-factor debt tranches", "How is active protocol debt distributed across health-factor tranches?")}
        <p class="note" style="margin: -0.5rem 0 1rem 0; font-size: 0.85rem; color: #94a3b8;"><em>Note: Protocol-Owned Liquidity (POL) positions totaling $3.19M are non-liquidatable (0% liquidation penalty, 100x collateral weight) and are excluded from borrower credit-risk tranches. Track them separately in the <a href="#protocolPol" onclick="activateView('protocolPol')" style="color: var(--accent); text-decoration: underline;">Protocol-Owned Liquidity (POL)</a> tab.</em></p>
        ${interactiveChartPanel("Active debt by health-factor band over time", "exposureHealthHistoryDebt", { defaultPeriod: "all", help: "Tracks active protocol debt across health-factor bands over recorded observations. Excludes governance-protected POL loans." })}
        ${interactiveChartPanel("Evolution of bad debt over time", "exposureBadDebtHistory", { defaultPeriod: "all", help: "Gross bad debt is total active debt in underwater loans (debt > collateral). Net shortfall is the uncollateralized deficit remaining after subtracting collateral value (Debt - Collateral). Excludes governance-protected POL loans." })}

        ${chartSection("Alerts and recent change", "Which markets combine high utilization with the fastest recent deterioration?")}
        ${interactiveBreakdownPanel("Utilization level versus 7-day change", "exposureMarketPressure", { help: "Further right means higher current utilization; higher means utilization is rising. Point area is current borrow and color moves from light mint to dark red as the triage score increases." })}
        ${interactiveBreakdownPanel("Recent 30 days versus prior 30 days", "exposureFlowComparison", { help: "The observed-day counts remain visible in the exact computed table; a short current history must not be mistaken for a complete 30-day window." })}

        ${chartSection("Liquidation pressure by borrowed market and collateral", "Where is debt nearest liquidation, and which independent collateral declines would expose the most debt?")}
        <div class="chart-stack">
          ${interactiveBreakdownPanel("Active debt by borrowed market and health factor", "exposureBorrowedMarkets", { help: "Distribution of active debt across health-factor bands by borrowed market. Excludes governance-protected POL loans." })}
          ${interactiveBreakdownPanel("Protocol debt by collateral and health factor", "exposureCollateralBands", { help: "Markets are ordered by debt at HF <= 1.25, keeping the largest imminent collateral exposures visible. Excludes governance-protected POL loans." })}
        </div>
        ${interactiveBreakdownPanel("Debt exposed after an independent collateral price decline", "exposureCollateralShock", { help: "10%, 20%, 30%, and 40% shocks are applied one collateral at a time. Darker cells contain more debt whose scenario HF is at or below 1.00. Excludes governance-protected POL loans." })}
        ${interactiveBreakdownPanel("Currently liquidatable active debt by borrowed market", "exposureLiquidatableDebt", { help: "This is the current official liquidatable filter valued in USD. An empty state means no matching current rows, not proof that future liquidation risk is zero." })}
        ${interactiveBreakdownPanel("Currently liquidatable active-debt loans by borrowed market", "exposureLiquidatableMarkets", { help: "This is the current official liquidatable filter. An empty state means no matching current rows, not proof that future liquidation risk is zero." })}

        ${chartSection("Observed-key exposure and concentration", "How much current debt is concentrated in observed keys, and which markets depend most on their largest keys?")}
        <div class="controls"><label>Low-health-factor cutoff<select id="exposureHfThresholdSelect">${availableThresholds.map((threshold) => `<option value="${Number(threshold)}" ${Number(threshold) === Number(exposureHfThreshold) ? "selected" : ""}>HF <= ${Number(threshold).toFixed(2)}</option>`).join("")}</select></label></div>
        ${interactiveBreakdownPanel(`Observed-key exposure at HF <= ${number(exposureHfThreshold, 2)}`, "exposureObservedKeyRanking", { help: "Every observed key is plotted. Total mapped debt is on the log X axis; vertical position and color show the percentage of that key's debt below the selected HF cutoff; point area shows low-HF debt dollars." })}

        ${chartSection("Concentration sensitivity across HF cutoffs", "Does low-health debt become more concentrated as the health-factor cutoff tightens?")}
        ${interactiveBreakdownPanel("Top-1 and top-3 shares of observed-key-attributed low-HF debt", "exposureLowHfConcentrationSensitivity")}

        ${dataTablesSection([
          { title: "Every observed key · exact values", content: scrollTable(keyRankingRows, ["observedKeyLabel", "totalDebtInUsd", "protocolBorrowShare", "lowHfDebtInUsd", "lowHfShareOfKeyDebt", "loanCount", "marketCount"]) },
          { title: "Market coverage and largest-key dependence", content: table(marketCoverageRows, ["marketDisplayName", "marketBorrowInUsd", "loanRowDebtInUsd", "loanRowCoverage", "loanRowDifferenceInUsd", "loanRowReconciliation", "largestKeyDebtShareOfMarketBorrow", "observedKeyCount", "unmappedBorrowInUsd"]) },
          { title: "Supply and pool-liquidity boundary", content: table(supply.byMarket || [], ["marketDisplayName", "supplyInUsd", "liquidityInUsd", "representedCollateralInUsd", "representedCollateralShare", "representedObservedKeyCount", "top1RepresentedShare", "representedHhi"]) }
        ])}
      `);
      document.querySelector("#exposureHfThresholdSelect")?.addEventListener("change", (event) => {
        exposureHfThreshold = Number(event.target.value);
        renderCurrentExposure();
      });
      drawExposureCharts();
    }

    function renderMarketOverview() {
      const market = currentMarketSummary();
      const marketDependence = (deep.currentExposure?.borrowerConcentration?.marketDependence || []).find((row) => row.marketId === market.marketId);
      setHtml("marketOverview", `
        <div class="hero"><h2>${esc(market.displayName || market.marketId)} liquidity & rates</h2><p>Where is this market's capital, and how expensive or constrained is borrowing?</p></div>
        <div class="kpis">
          ${kpi("Supply", usd(market.currentSupplyInUsd))}
          ${kpi("Batched Market Borrow", usd(market.currentBorrowInUsd), "Official on-chain market borrow (4h batch cycle)")}
          ${kpi("Live Loan Adjusted Borrow", usd(marketDependence?.loanAdjustedDebtInUsd ?? market.currentBorrowInUsd), marketDependence ? `Drift (see info bubble): ${usd(marketDependence.reconciliationDifferenceInUsd)} (${marketDependence.reconciliationClassification || 'reconciled'})` : "")}
          ${kpi("Un-batched Interest Floor", usd(marketDependence?.minInterestFloorInUsd ?? 0), marketDependence ? `Uncollected accrued interest floor` : "")}
          ${kpi("Liquidity", usd(market.currentLiquidityInUsd))}
          ${kpi("Utilization", pct(market.currentUtilization))}
        </div>
        ${chartSection("Capital and borrowing conditions", "How are capital balances, utilization, rates, and available liquidity moving together?")}
        ${interactiveChartPanel("Supply, borrow, and liquidity", "marketCapital")}
        ${interactiveChartPanel("Utilization", "marketUtilization")}
        ${interactiveChartPanel("Borrow APR and supply APY", "marketRates")}
        ${interactiveChartPanel("Borrow-to-liquidity pressure", "marketLiquidityPressure", { help: "Above 1x, outstanding borrow is larger than currently available liquidity." })}
      `);
      drawMarketCharts();
    }

    function renderMarketRepayments() {
      const market = currentMarketSummary();
      const marketRows = enrichedMarketRows(market.marketId);
      const latest = marketRows.at(-1) || {};
      const debtFlowReconciliation = summarizeDebtFlowReconciliation(marketRows);
      const coverage = buildTrailingCoverageWindows(marketRows);
      const coverage7 = coverage.find((row) => Number(row.windowDays) === 7);
      const coverage30 = coverage.find((row) => Number(row.windowDays) === 30);
      const coverage90 = coverage.find((row) => Number(row.windowDays) === 90);
      setHtml("marketRepayments", `
        <div class="hero"><h2>${esc(market.displayName || market.marketId)} debt flows</h2><p>Is debt forming faster than borrowers repay it? When does debt repayment activity accelerate, fade, or stop?</p></div>
        <div class="kpis">
          ${kpi("Outstanding borrow", usd(market.currentBorrowInUsd))}
          ${currentValuedGapKpi("Current-valued cumulative debt-flow gap", latest.cumulativeDebtGap, latest.cumulativeDebtGapAsset, latest.assetPriceInUsd, market.symbol || market.marketId)}
          ${kpi("Longest observed run with no debt repayment", `${market.maxDrySpellDays || 0} days`, "Longest run of consecutive daily observations with USD 0 reported debt repaid.")}
          ${kpi("Repayment unevenness across active days", pct(market.repaymentConcentrationHhi), "Normalized HHI of each active repayment day's share of total repayment: 0% means equal amounts each active day; 100% means one day accounts for all repayment.")}
        </div>
        <section class="summary-group" aria-labelledby="marketDebtCoverageHeading">
          <div class="summary-heading">
            <h3 id="marketDebtCoverageHeading">Debt coverage</h3>
            <p>Native debt repaid divided by native inferred debt accrued in each trailing window. Asset quantities are primary; matched current-price USD values are secondary context.</p>
          </div>
          <div class="coverage-matrix-scroll">
            <div class="coverage-matrix" role="table" aria-label="Market debt coverage by trailing window">
              <div class="coverage-corner" role="columnheader">Coverage</div>
              <div class="coverage-window" role="columnheader">7 days</div>
              <div class="coverage-window" role="columnheader">30 days</div>
              <div class="coverage-window" role="columnheader">90 days</div>
              <div class="coverage-row-label" role="rowheader">Debt coverage<span>Debt repaid / accrued</span></div>
              ${coverageCell(coverage7, "debtCoverageRatio", "debt", market.symbol || market.marketId)}
              ${coverageCell(coverage30, "debtCoverageRatio", "debt", market.symbol || market.marketId)}
              ${coverageCell(coverage90, "debtCoverageRatio", "debt", market.symbol || market.marketId)}
            </div>
          </div>
        </section>
        ${chartSection("Debt coverage evidence", "Do the native accrued and repaid quantities converge, and what are both sides worth at the same current price?")}
        ${interactiveChartPanel("Debt coverage operands · asset units", "marketDebtCoverageOperandsAsset", { help: coverageValuationHelp("market") })}
        ${interactiveChartPanel("Debt coverage operands · current USD value", "marketDebtCoverageOperandsUsd", { help: coverageValuationHelp("market") })}
        ${interactiveChartPanel("Debt coverage windows", "marketDebtCoverage", { help: coverageValuationHelp("market") })}
        ${chartSection("Debt formation and repayment", "Is inferred debt formation outpacing reported repayment, and are repayments steady, concentrated in bursts, or diverging from their recent baseline?")}
        ${interactiveChartPanel("Debt repayment flow", "marketDebtRepayment")}
        ${interactiveChartPanel("Repayment intensity", "marketRepaymentEvents", { help: "The 1.5-day EWMA reacts to bursts; the 30-day average shows the slower baseline." })}
        ${interactiveChartPanel("Ongoing days without debt repayments", "marketRepaymentDrySpells", { defaultPeriod: "all", help: "Each line counts consecutive observed days without payment; a payment resets it to zero and missing dates break the line." })}
        ${interactiveChartPanel("Cumulative debt-flow gap – asset units", "marketDebtCumulativeGapAsset", { help: debtFlowReconciliationHelp(debtFlowReconciliation, "market") })}
        ${interactiveChartPanel("Cumulative debt-flow gap – current USD value", "marketDebtCumulativeGap", { help: debtFlowReconciliationHelp(debtFlowReconciliation, "market") })}
        ${interactiveChartPanel("Debt-flow gap – asset units", "marketDebtGapAsset", { help: gapValuationHelp("market") })}
        ${interactiveChartPanel("Debt-flow gap – current USD value", "marketDebtGap", { help: gapValuationHelp("market") })}
        ${interactiveChartPanel("Debt repayment size distribution", "marketDebtRepaymentDistribution", { help: "Distribution of active daily debt repayment amounts (box plot statistics and individual observation points)." })}
      `);
      drawMarketCharts();
    }

    function renderMarketInterest() {
      const market = currentMarketSummary();
      const marketRows = enrichedMarketRows(market.marketId);
      const latest = marketRows.at(-1) || {};
      const coverage = buildTrailingCoverageWindows(marketRows);
      const coverage7 = coverage.find((row) => Number(row.windowDays) === 7);
      const coverage30 = coverage.find((row) => Number(row.windowDays) === 30);
      const coverage90 = coverage.find((row) => Number(row.windowDays) === 90);
      setHtml("marketInterest", `
        <div class="hero"><h2>${esc(market.displayName || market.marketId)} interest flows</h2><p>Is interest being paid as it accrues, and does the gap close over longer windows?</p></div>
        <div class="kpis">
          ${kpi("Current-valued interest coverage 90d", ratio(market.interestCoverage90d))}
          ${currentValuedGapKpi("Current-valued cumulative interest gap", latest.cumulativeInterestGap, latest.cumulativeInterestGapAsset, latest.assetPriceInUsd, market.symbol || market.marketId)}
        </div>
        <section class="summary-group" aria-labelledby="marketInterestCoverageHeading">
          <div class="summary-heading">
            <h3 id="marketInterestCoverageHeading">Interest coverage</h3>
            <p>Native interest repaid divided by native interest accrued in each trailing window. Asset quantities are primary; matched current-price USD values are secondary context.</p>
          </div>
          <div class="coverage-matrix-scroll">
            <div class="coverage-matrix" role="table" aria-label="Market interest coverage by trailing window">
              <div class="coverage-corner" role="columnheader">Coverage</div>
              <div class="coverage-window" role="columnheader">7 days</div>
              <div class="coverage-window" role="columnheader">30 days</div>
              <div class="coverage-window" role="columnheader">90 days</div>
              <div class="coverage-row-label" role="rowheader">Interest coverage<span>Interest repaid / accrued</span></div>
              ${coverageCell(coverage7, "coverageRatio", "interest", market.symbol || market.marketId)}
              ${coverageCell(coverage30, "coverageRatio", "interest", market.symbol || market.marketId)}
              ${coverageCell(coverage90, "coverageRatio", "interest", market.symbol || market.marketId)}
            </div>
          </div>
        </section>
        ${chartSection("Interest coverage evidence", "Do the native accrued and repaid quantities converge, and what are both sides worth at the same current price?")}
        ${interactiveChartPanel("Interest coverage operands · asset units", "marketInterestCoverageOperandsAsset", { help: coverageValuationHelp("market") })}
        ${interactiveChartPanel("Interest coverage operands · current USD value", "marketInterestCoverageOperandsUsd", { help: coverageValuationHelp("market") })}
        ${interactiveChartPanel("Interest coverage windows", "marketInterestCoverage", { help: coverageValuationHelp("market") })}
        ${chartSection("Interest formation and repayment", "When does accrued interest outpace payment, and does the gap close over longer windows?")}
        ${interactiveChartPanel("Daily interest accrued and repaid", "marketInterestDaily")}
        ${interactiveChartPanel("Ongoing days without interest repayments", "marketInterestDrySpells", { defaultPeriod: "all", help: "Each line counts consecutive observed days without interest repayment; a payment resets it to zero and missing dates break the line." })}
        ${interactiveChartPanel("Interest repayment size distribution", "marketInterestRepaymentDistribution", { help: "Distribution of active daily interest repayment amounts (box plot statistics and individual observation points)." })}
        ${interactiveChartPanel("Cumulative interest accrued and repaid", "marketInterestCumulative")}
        ${interactiveChartPanel("Cumulative interest-flow gap – asset units", "marketInterestCumulativeGapAsset", { help: interestFlowHelp("market") })}
        ${interactiveChartPanel("Cumulative interest-flow gap – current USD value", "marketInterestCumulativeGap", { help: interestFlowHelp("market") })}
        ${interactiveChartPanel("Interest-flow gap – asset units", "marketInterestGapAsset", { help: gapValuationHelp("market") })}
        ${interactiveChartPanel("Interest-flow gap – current USD value", "marketInterestGap", { help: gapValuationHelp("market") })}
      `);
      drawMarketCharts();
    }

    function renderMarketRevenue() {
      const market = currentMarketSummary();
      const revenue = currentMarketRevenue();
      const summary = revenue?.summary || market.marketRevenue || {};
      const ytdPeriod = periodLabel(summary.ytdCoverageFromDate || market.marketRevenueYtdCoverageFromDate, summary.ytdCoverageToDate || market.marketRevenueYtdCoverageToDate);
      const allTimePeriod = periodLabel(market.marketRevenueCoverageFromDate, market.marketRevenueCoverageToDate);
      const trailing90Period = periodLabel(market.marketRevenue90dCoverageFromDate, market.marketRevenue90dCoverageToDate);
      const allocationPeriod = periodLabel(summary.allocationCoverageFromDate, summary.allocationCoverageToDate);
      const attributionAvailable = summary.ytdAttributionComplete === true;
      const attributionDetail = attributionAvailable
        ? `${integer(summary.ytdAttributedCompleteDays)} reconciled complete days; market interest split is attributed`
        : `${integer(summary.ytdAttributedCompleteDays)} of ${integer(summary.ytdCompleteDays)} days attributable; total unavailable until coverage reconciles`;
      const projectedPeriod = summary.projectedAnnualizedAsOfDate
        ? `As of ${summary.projectedAnnualizedAsOfDate}`
        : "Period unavailable";
      setHtml("marketRevenue", `
        <div class="hero"><h2>${esc(market.displayName || market.marketId)} revenue</h2><p>What was collected, what accrued, and what current borrowing implies if today's rate and allocation persist?</p></div>
        ${metricPeriodGroup("Year-to-date collected market revenue", ytdPeriod, attributionDetail, `
          ${kpi("YTD attributed collected revenue", attributionAvailable ? usd(summary.ytdAttributedCollectedMarketRevenueInUsd) : "Unavailable", "Official interest collections reconciled at protocol level; market split is modeled")}
          ${kpi("Attributed interest revenue collected", attributionAvailable ? usd(summary.ytdAttributedCollectedInterestRevenueInUsd) : "Unavailable", "Attributed from the official daily protocol retained-interest total")}
          ${kpi("Market origination fees collected", usd(summary.ytdDirectOriginationRevenueInUsd ?? market.ytdCollectedOriginationRevenueInUsd), "Directly reported by this market")}
        `)}
        ${chartSection("Collected revenue attribution", "When did this market receive attributed retained-interest collections and directly report origination fees?")}
        ${interactiveChartPanel("Daily attributed collected revenue", "marketAttributedCollectedRevenueDaily", { defaultPeriod: "year", help: "Retained-interest bars allocate each official daily protocol collection by parameter-weighted market repayments. Origination-fee bars are directly reported by the market. The two components are stacked only on fully reconciled days." })}
        ${interactiveChartPanel("Monthly attributed collected revenue", "marketAttributedCollectedRevenueMonthly", { defaultPeriod: "all", help: "Monthly sums include only days where the market attribution reconciles exactly to the official protocol retained-interest total." })}
        ${metricPeriodGroup("Directly observed origination revenue", allTimePeriod, `${integer(market.marketRevenueCompleteDays)} complete days`, `
          ${kpi("Trailing 90-day origination revenue", usd(market.collectedOriginationRevenue90dInUsd), `${trailing90Period}; ${integer(market.marketRevenue90dObservedDays)} observed days`)}
          ${kpi("All-time origination revenue", usd(market.collectedOriginationRevenueInUsd))}
          ${kpi("Latest origination-revenue day", market.latestPositiveOriginationRevenueDate || "None observed")}
        `)}
        ${metricPeriodGroup("Year-to-date accrued interest allocation", ytdPeriod, "Accrual basis; not repayment-timed collection", `
          ${kpi("Accrued protocol/reserve interest revenue", usd(summary.ytdAccruedProtocolInterestRevenueInUsd), `Effective non-supplier share; ${allocationPeriod}`)}
          ${kpi("Accrued supplier interest income", usd(summary.ytdAccruedSupplierInterestIncomeInUsd), "Lender income, not protocol revenue")}
          ${kpi("Gross interest accrued", usd(summary.ytdAccruedInterestInUsd), "Supplier plus protocol/reserve allocation")}
        `)}
        ${chartSection("Accrued interest allocation", "How did accrued borrower interest divide between suppliers and the non-supplier protocol or reserve share?")}
        ${interactiveChartPanel("Daily accrued interest allocation", "marketAccruedInterestAllocationDaily", { defaultPeriod: "year", help: "Each complete day's interestAccruedInUsd is split using the latest parameter effective by that UTC day's end. Accrual is not proof of repayment." })}
        ${interactiveChartPanel("Monthly accrued interest allocation", "marketAccruedInterestAllocationMonthly", { defaultPeriod: "all", help: "Monthly sums of parameter-derived supplier income and protocol or reserve revenue accrual." })}
        ${metricPeriodGroup("Current annualized interest run rate", projectedPeriod, "Point-in-time projection; no origination fees", `
          ${kpi("Annualized gross interest income", usd(summary.projectedAnnualizedInterestIncomeInUsd))}
          ${kpi("Annualized supplier interest income", usd(summary.projectedAnnualizedSupplierInterestIncomeInUsd), pct(summary.currentSupplierInterestShare))}
          ${kpi("Annualized protocol/reserve interest revenue", usd(summary.projectedAnnualizedProtocolInterestRevenueInUsd), pct(summary.currentProtocolInterestShare))}
        `)}
        ${chartSection("Projected annualized interest income", "What annualized income pace was implied by each day's borrow balance, borrower APR, and effective allocation?")}
        ${interactiveChartPanel("Projected annualized interest income", "marketProjectedAnnualizedInterestIncome", { defaultPeriod: "year", help: "Gross run rate equals borrowInUsd times borrowApr. Supplier and protocol or reserve lines apply that day's effective income shares. This is a run rate, not a forecast or collected revenue." })}
        ${metricPeriodGroup("Interest repayments - not revenue", allTimePeriod, "Full borrower payment activity; used only as an attribution weight", `
          ${kpi("YTD interest repaid activity", usd(market.ytdInterestRepaidActivityInUsd))}
          ${kpi("Trailing 90-day interest repaid activity", usd(market.interestRepaidActivity90dInUsd), `${trailing90Period}; ${integer(market.marketRevenue90dObservedDays)} observed days`)}
          ${kpi("All-time interest repaid activity", usd(market.interestRepaidActivityInUsd))}
        `)}
        ${chartSection("Revenue-generating repayment activity", "When did borrowers repay interest, while keeping the full payment visibly separate from retained revenue?")}
        ${interactiveChartPanel("Monthly interest repayments (not revenue)", "marketInterestRepaymentActivityMonthly", { defaultPeriod: "all", help: "This is the full interestRepaidInUsd borrower flow. It is an attribution weight and payment-activity measure, not retained revenue by itself." })}
      `);
      drawMarketCharts();
    }

    function renderMarketHealth() {
      const market = currentMarketSummary();
      const mId = market.symbol || market.marketId;
      const pos = (deep?.pol?.positions || []).find((p) => p.marketId.toUpperCase() === String(mId).toUpperCase() || p.marketId.toUpperCase() === String(market.marketId).toUpperCase());

      setHtml("marketHealth", `
        <div class="hero"><h2>${esc(market.displayName || market.marketId)} health</h2><p>How much debt is near liquidation now, and how have health-factor tranches changed over time?</p></div>
        ${pos ? `
        <p class="note" style="margin: 0 0 1rem 0; font-size: 0.85rem; color: #94a3b8;"><em>Note: Protocol-Owned Liquidity (POL) positions (${usd(pos.debtInUsd)} in this market) are governance-protected (100x collateral weight, 0% liquidation penalty) and are excluded from health-factor tranches, near-liquidation metrics (HF &lt; 1.0, HF &le; 1.10, HF &le; 1.25), bad debt, and minimum health factor calculations. To inspect POL debt, collateral backing, and liquidation protections, see the <a href="#marketPol" onclick="activateView('marketPol')" style="color: var(--accent); text-decoration: underline;">Protocol-Owned Liquidity (POL) tab</a>.</em></p>
        ` : ""}
        <div class="kpis">
          ${kpi("Active-debt positions", integer(market.activeDebtLoanCount))}
          ${kpi("Active-loan debt", usd(market.activeLoanDebtInUsd))}
        </div>
        <div class="kpis">
          ${kpi("Debt at HF < 1.0", usd(market.activeLoanDebtBelow100InUsd), activeDebtPositionCount(market.activeDebtLoanCountBelow100))}
          ${kpi("Critical debt at HF <= 1.10", usd(market.activeLoanDebtAtOrBelow110InUsd), activeDebtPositionCount(market.activeDebtLoanCountAtOrBelow110))}
          ${kpi("Debt at HF <= 1.25", usd(market.activeLoanDebtAtOrBelow125InUsd), activeDebtPositionCount(market.activeDebtLoanCountAtOrBelow125))}
        </div>
        <div class="kpis">
          ${kpi("Bad-debt positions", integer(market.activeLoanBadDebtLoanCount), "Positions with debt > collateral")}
          ${kpi("Sum of bad debt", usd(market.activeLoanBadDebtInUsd), `${usd(market.activeLoanBadDebtShortfallInUsd)} net shortfall (gross debt in underwater positions)`)}
          ${kpi("Minimum health factor", ratio(market.activeLoanMinHealthFactor))}
        </div>
        ${pos ? `
        <section class="summary-group" aria-labelledby="marketPolHealthHeading">
          <div class="summary-heading">
            <h3 id="marketPolHealthHeading">Protocol-Owned Liquidity (POL) Position</h3>
            <p>Governance-protected protocol financing position in this market, backed by locked qPOL collateral and excluded from organic borrower health stats above.</p>
          </div>
          <div class="kpis">
            ${kpi("Market POL debt", usd(pos.debtInUsd), `${pct(pos.marketBorrowShare)} of market borrow`, "Outstanding borrow debt obligation owed by the protocol team financing position.")}
            ${kpi("Locked qPOL collateral", `${(Number(pos.collateralTokens || 0) / 1e6).toFixed(2)}M qPOL`, `${usd(pos.collateralInUsd)} market value`, "Quantity of locked qPOL tokens held in the Plutus validator as backing for this market's POL borrow.")}
            ${kpi("Nominal LTV vs Health Factor", `${pct(pos.nominalLTV)} LTV`, `HF ${number(pos.healthFactor, 2)} (100x weight)`, "Nominal loan-to-value ratio compared to the effective on-chain smart contract Health Factor enabled by the 100x collateral weight multiplier.")}
            ${kpi("Liquidation status", "Protected (0% Penalty)", "Collateral weight: 100x · Immune from liquidation", "Governance parameters protect this position with a 100x collateral weight multiplier and 0% liquidation penalty.")}
          </div>
        </section>
        ` : ""}
        ${chartSection("Loan health", "How is current debt distributed across health-factor bands?")}
        ${interactiveBreakdownPanel("Current health-factor debt tranches", "marketHealthBuckets", { help: "Shows current active debt distribution across health-factor bands for this market. Excludes governance-protected POL loans." })}
        ${chartSection("Health-factor tranches over time", "Is active debt moving toward stronger or weaker health-factor bands across saved observations?")}
        ${interactiveChartPanel("Active debt by health-factor band over time", "marketHealthHistoryDebt", { defaultPeriod: "all", help: "Tracks active market debt across health-factor bands over recorded observations. Excludes governance-protected POL loans." })}
        ${interactiveChartPanel("Active-debt position count by health-factor band", "marketHealthHistoryCounts", { defaultPeriod: "all", help: "Tracks active-debt position count across health-factor bands over recorded observations. Excludes governance-protected POL loans." })}
      `);
      drawMarketCharts();
    }

    function renderMarketParticipation() {
      const market = currentMarketSummary();
      const marketDependence = (deep.currentExposure?.borrowerConcentration?.marketDependence || []).find((row) => row.marketId === market.marketId);
      const top1Share = marketDependence?.largestKeyDebtShareOfMarketBorrow;
      const next2Share = marketDependence?.nextTwoKeysDebtShareOfMarketBorrow;
      const top3Share = (top1Share != null && next2Share != null) ? (top1Share + next2Share) : (top1Share != null ? top1Share : null);

      setHtml("marketParticipation", `
        <div class="hero"><h2>${esc(market.displayName || market.marketId)} participation and concentration</h2><p>Are active-debt positions broadening, and how concentrated are the observed borrowing and collateral keys?</p></div>
        <div class="kpis">
          ${kpi("Active-debt positions", integer(market.activeDebtLoanCount), "Current number of active loan positions in this market")}
          ${kpi("Observed keys with active debt", integer(marketDependence?.observedKeyCount), "Distinct API-observed keys across current positions with debt only")}
          ${kpi("Top 1 key concentration", pct(top1Share), "Share of official market borrow held by the single largest observed key")}
          ${kpi("Top 3 key concentration", pct(top3Share), "Share of official market borrow held by the top 3 observed keys combined")}
          ${kpi("Loan-row coverage", pct(marketDependence?.loanRowCoverage), loanCoverageExplanation(marketDependence))}
        </div>
        ${chartSection("Active-debt positions and observed keys", "Are active-debt participation and the number of distinct observed borrowing keys expanding or contracting?")}
        ${interactiveChartPanel("Active-debt positions over saved observations", "marketParticipationLoans", { defaultPeriod: "all" })}
        ${interactiveChartPanel("Distinct observed keys with active debt", "marketParticipationKeys", { defaultPeriod: "all" })}
        ${chartSection("Observed-key concentration and borrower dependence", "How heavily does this market depend on its largest observed borrowing keys and collateralized supply?")}
        ${loanCoverageNotice(marketDependence ? [marketDependence] : [])}
        ${interactiveBreakdownPanel("Observed-key borrow dependence breakdown", "marketKeyDependence", { help: "Share of official market borrow accounted for by the largest key, next two keys, other mapped keys, and unmapped borrow." })}
        ${interactiveBreakdownPanel("Cumulative observed-key borrow concentration", "marketBorrowConcentration", { help: "The denominator is official market borrow. Below 100% is undercoverage. Above 100% is overcoverage between official loan-detail and market-aggregate API values." })}
        ${interactiveBreakdownPanel("Cumulative observed-key collateralized-supply concentration", "marketCollateralizedSupplyConcentration", { help: "The denominator is represented collateralized supply, not total market supply or pool liquidity." })}
      `);
      drawMarketCharts();
    }

    function renderMarketParameters() {
      const market = currentMarketSummary();
      const state = currentMarketParameters();
      const marketName = market.displayName || market.marketId;
      if (!state?.current) {
        setHtml("marketParameters", `
          <div class="hero"><h2>${esc(marketName)} Parameters History</h2><p>Current interest-model settings and every exact governance update exposed by the official Liqwid v2 API.</p></div>
          <div class="parameter-empty"><strong>Parameters unavailable.</strong><br>No official parameter-history row is present for this market in the opened archive. No curve or historical value is inferred.</div>
        `);
        return;
      }

      const current = state.current;
      const rates = current.rateLandmarks || {};
      const capacity = current.capacity || {};
      const allocation = current.incomeAllocation || {};
      const coefficients = current.modelCoefficients || {};
      const utilizationCap = capacity.utilizationCap == null ? 1 : capacity.utilizationCap;
      const supplyCap = capacity.supplyCap == null ? "No protocol cap reported" : assetAmount(capacity.supplyCap, market.symbol || market.marketId);
      const eventCount = state.events?.length || 0;
      const firstEvent = state.events?.[0]?.timestamp;

      setHtml("marketParameters", `
        <div class="hero">
          <h2>${esc(marketName)} Parameters History</h2>
          <p>Current governance-controlled market parameters, the rate curves they produce, and their exact on-chain evolution.</p>
          <div class="parameter-effective"><strong>Effective ${esc(formatParameterTimestamp(current.effectiveAt))}</strong><span aria-hidden="true">&middot;</span><span>${integer(eventCount)} recorded governance update${eventCount === 1 ? "" : "s"}${firstEvent ? ` since ${esc(formatParameterTimestamp(firstEvent))}` : ""}</span></div>
        </div>
        <div class="parameter-groups">
          ${parameterGroup("Rate curve landmarks", "Annualized rates at the three governance-defined utilization landmarks.", [
            ["Base borrower APR", pct(rates.baseBorrowerAPR)],
            ["Optimal borrower APR", pct(rates.optimalBorrowerAPR)],
            ["Maximum borrower APR at cap", pct(rates.maxBorrowerAPR)],
            ["Base supplier APY", pct(rates.baseSupplierAPY)],
            ["Optimal supplier APY", pct(rates.optimalSupplierAPY)],
            ["Maximum supplier APY at cap", pct(rates.maxSupplierAPY)],
            ["Optimal utilization (kink)", pct(rates.kink)]
          ])}
          ${parameterGroup("Capacity limits", "The supply ceiling is denominated in the market asset. The utilization cap is the point where new borrowing stops.", [
            ["Supply cap", supplyCap],
            ["Utilization cap", `${pct(utilizationCap)}${capacity.utilizationCap == null ? " (default)" : ""}`],
            ["Current utilization", pct(state.rateCurve?.currentUtilization)]
          ])}
          ${parameterAllocationGroup(allocation)}
          ${parameterGroup("Raw model coefficients", "Official per-batch coefficients retained for auditability; the annualized landmarks above are easier to interpret.", [
            ["Base rate coefficient", parameterScalar(coefficients.baseRate)],
            ["Utilization multiplier", parameterScalar(coefficients.utilMultiplier)],
            ["Post-kink multiplier", parameterScalar(coefficients.utilMultiplierJump)]
          ])}
          <article class="parameter-group parameter-record">
            <h3>Governance record</h3>
            <p>The latest exact API event identifies when these values became effective and the transaction that changed them.</p>
            <dl class="parameter-list">
              <dt>Effective timestamp (UTC)</dt><dd>${esc(formatParameterTimestamp(current.effectiveAt))}</dd>
            </dl>
            <code title="${esc(current.txHash)}">${esc(current.txHash || "Transaction hash unavailable")}</code>
          </article>
        </div>
        ${chartSection("Current rate curve", "How do today's parameters translate utilization into borrowing cost and supplier yield?")}
        ${interactiveBreakdownPanel("Borrow APR and Supply APY by utilization", "marketParameterRateCurve", { help: "Borrow APR is linearly interpolated from base to optimal at the kink, then follows the jump slope beyond the kink up to 100% utilization. Supply APY = (1 - utilization) * baseSupplierAPY + utilization * borrowerAPR * supplierSplit. Reference lines indicate current utilization, kink, and utilization cap when active." })}
        <p class="parameter-formula"><strong>Implemented supplier formula:</strong> <code>(1 - utilization) * baseSupplierAPY + utilization * borrowerAPR * supplierSplit</code>. The supplier split is the supplier income ratio divided by the total income ratio.</p>
        ${chartSection("Historical evolution", "Which exact governance updates changed the market's rates, limits, allocation, or model coefficients?")}
        ${interactiveChartPanel("Borrower rate landmarks", "marketParameterBorrowRates", { defaultPeriod: "all", help: "Step lines change only at exact governance event timestamps; no daily updates are invented." })}
        ${interactiveChartPanel("Supplier rate landmarks", "marketParameterSupplyRates", { defaultPeriod: "all", help: "Step lines change only at exact governance event timestamps; no daily updates are invented." })}
        ${interactiveChartPanel("Optimal utilization and utilization cap", "marketParameterUtilizationLimits", { defaultPeriod: "all", help: "The kink is the optimal-utilization point where the borrower-rate slope changes. The utilization cap blocks additional borrowing." })}
        ${interactiveChartPanel("Supply cap", "marketParameterSupplyCap", { defaultPeriod: "all", help: `Supply cap values use native ${esc(market.symbol || market.marketId)} units. Missing values mean the API reports no cap.` })}
        ${interactiveChartPanel("Income allocation", "marketParameterIncomeAllocation", { defaultPeriod: "all", help: "Each share is its official component ratio divided by incomeRatioSum. Reserve is the unassigned remainder." })}
        ${interactiveChartPanel("Raw rate-model coefficients", "marketParameterModelCoefficients", { defaultPeriod: "all", help: "These are the exact official per-batch coefficients; annualized borrower and supplier landmark rates are charted separately." })}
        ${dataTablesSection([
          { title: "Exact governance updates", content: parameterHistoryTable(state.events || [], market.symbol || market.marketId) }
        ])}
      `);
      drawMarketParameterCharts();
    }

    function renderMarketPol() {
      const market = currentMarketSummary();
      const mId = market.symbol || market.marketId;
      const pos = (deep?.pol?.positions || []).find((p) => p.marketId.toUpperCase() === String(mId).toUpperCase() || p.marketId.toUpperCase() === String(market.marketId).toUpperCase());

      if (!pos) {
        const allPolPositions = deep?.pol?.positions || [];
        const totalPolDebt = deep?.pol?.totalPolDebtInUsd || 0;
        setHtml("marketPol", `
          <div class="hero">
            <h2>${esc(market.displayName || market.marketId)} Protocol-Owned Liquidity (POL)</h2>
            <p>No active Protocol-Owned Liquidity (POL) financing loan is deployed in the ${esc(market.displayName || market.marketId)} market.</p>
            <div class="parameter-effective"><strong>No Active POL Debt in this Market</strong><span aria-hidden="true">&middot;</span><span>POL financing is active in ${allPolPositions.length} USD stablecoin markets</span></div>
          </div>
          <p class="note" style="margin: 0 0 1rem 0; font-size: 0.85rem; color: #94a3b8;">
            <em><strong>Historical API Disclosure Note:</strong> Prior to August 25, 2026, individual Protocol-Owned Liquidity (POL) loan positions and collateral details were not included in the official Liqwid GraphQL loans API endpoint (although POL loans were active on-chain). Historical loan-level tracking begins with the first API disclosure on August 25, 2026.</em>
          </p>
          <div class="kpis">
            ${kpi("Market POL debt", "$0.00", "0.00% of market borrow", "No protocol-owned liquidity financing debt is currently borrowed from this market.")}
            ${kpi("Locked qPOL collateral", "0 qPOL", "$0.00 collateral value", "No qPOL collateral is locked for this market.")}
            ${kpi("Nominal LTV vs Health Factor", "None", "No POL position", "Health factor and LTV are not applicable as there is no POL loan in this market.")}
            ${kpi("Annual interest yield paid (at current rates)", "$0.00", "0.00% borrow APY", "No POL interest payments are flowing into this market.")}
          </div>

          <section class="summary-group" aria-labelledby="marketPolEmptySummaryHeading">
            <div class="summary-heading">
              <h3 id="marketPolEmptySummaryHeading">Active Protocol-Wide POL Allocations</h3>
              <p>Protocol-Owned Liquidity is currently active across ${allPolPositions.length} stablecoin markets (${allPolPositions.map((p) => esc(p.marketDisplayName || p.marketId)).join(", ")}), supporting protocol development and deep liquidity with ${usd(totalPolDebt)} in total financing.</p>
            </div>
            <div class="card-grid" style="display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 1rem; margin-top: 1rem;">
              ${allPolPositions.map((p) => `
                <div class="panel" style="padding: 1.25rem; background: var(--panel2); border-radius: 8px; border: 1px solid var(--line);">
                  <h4 style="margin: 0 0 0.5rem 0; color: var(--accent); display: flex; justify-content: space-between; align-items: center;">
                    <span>${esc(p.marketDisplayName || p.marketId)}</span>
                    <button type="button" class="btn-action" style="font-size: 0.75rem; padding: 0.2rem 0.5rem;" onclick="selectMarket('${esc(p.marketId)}'); activateView('marketPol');">View POL</button>
                  </h4>
                  <p style="margin: 0; font-size: 0.85rem; color: #bcd2e8; line-height: 1.5;">
                    POL Debt: <strong>${usd(p.debtInUsd)}</strong> (${pct(p.marketBorrowShare)} of pool)<br>
                    Locked Collateral: <strong>${(Number(p.collateralTokens || 0) / 1e6).toFixed(2)}M qPOL</strong> (${usd(p.collateralInUsd)})<br>
                    Borrow APY: <strong>${pct(p.borrowAPY)}</strong> &middot; Projected Annual Yield: <strong>${usd(p.annualInterestCostInUsd)}</strong>
                  </p>
                </div>
              `).join("")}
            </div>
          </section>
        `);
        return;
      }

      const organicDebt = Math.max(0, (pos.marketTotalBorrowInUsd || pos.debtInUsd) - pos.debtInUsd);

      setHtml("marketPol", `
        <div class="hero">
          <h2>${esc(pos.marketDisplayName || mId)} Protocol-Owned Liquidity (POL)</h2>
          <p>Tracking the protocol core development and ecosystem liquidity financing loan in ${esc(pos.marketDisplayName || mId)}, backed by locked qPOL collateral.</p>
          <div class="parameter-effective"><strong>Governance-Protected Position</strong><span aria-hidden="true">&middot;</span><span>100x Collateral Weight &middot; 0% Liquidation Penalty</span></div>
        </div>
        <p class="note" style="margin: 0 0 1rem 0; font-size: 0.85rem; color: #94a3b8;">
          <em><strong>Historical API Disclosure Note:</strong> Prior to August 25, 2026, individual Protocol-Owned Liquidity (POL) loan positions and collateral details were not included in the official Liqwid GraphQL loans API endpoint (although POL loans were already active on-chain). Historical loan-level tracking begins with the first API disclosure on August 25, 2026.</em>
        </p>
        <div class="kpis">
          ${kpi("Market POL debt", usd(pos.debtInUsd), `${pct(pos.marketBorrowShare)} of total ${pos.marketDisplayName || mId} borrow`, "Outstanding borrow debt obligation owed by the protocol team financing position.")}
          ${kpi("Locked qPOL collateral", `${(Number(pos.collateralTokens || 0) / 1e6).toFixed(2)}M qPOL`, `${usd(pos.collateralInUsd)} market value`, "Quantity of locked qPOL tokens held in the Plutus validator as backing for this market's POL borrow.")}
          ${kpi("Nominal LTV vs Health Factor", `${pct(pos.nominalLTV)} LTV`, `HF ${number(pos.healthFactor, 2)} (100x weight)`, "Nominal loan-to-value ratio compared to the effective on-chain smart contract Health Factor enabled by the 100x collateral weight multiplier.")}
          ${kpi("Annual interest yield paid (at current rates)", usd(pos.annualInterestCostInUsd), `Projected at current ${pct(pos.borrowAPY)} borrow APY`, "Annualized interest payments generated by this POL position directly into this market's supplier yields and DAO reserves at current borrow rates.")}
        </div>

        <section class="summary-group" aria-labelledby="marketPolGovernanceHeading">
          <div class="summary-heading">
            <h3 id="marketPolGovernanceHeading">Governance & Liquidation Protection Mechanics</h3>
            <p>Why this POL loan remains protected from liquidation despite nominal undercollateralization.</p>
          </div>
          <div class="card-grid" style="display: grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); gap: 1rem; margin-top: 1rem;">
            <div class="panel" style="padding: 1.25rem; background: var(--panel2); border-radius: 8px; border: 1px solid var(--line);">
              <h4 style="margin: 0 0 0.5rem 0; color: var(--accent);">100x Collateral Weight</h4>
              <p style="margin: 0; font-size: 0.9rem; color: #bcd2e8; line-height: 1.5;">Liqwid market parameters assign a <code>collateralWeight: 100</code> (10,000%) to qPOL collateral. Effective smart contract health factor is <strong>${number(pos.healthFactor, 2)}</strong>.</p>
            </div>
            <div class="panel" style="padding: 1.25rem; background: var(--panel2); border-radius: 8px; border: 1px solid var(--line);">
              <h4 style="margin: 0 0 0.5rem 0; color: var(--accent);">0% Liquidation Penalty</h4>
              <p style="margin: 0; font-size: 0.9rem; color: #bcd2e8; line-height: 1.5;">The liquidation penalty and liquidator profit are set to <code>0.00%</code>. Liquidators have no financial incentive or contract authorization to liquidate this loan.</p>
            </div>
            <div class="panel" style="padding: 1.25rem; background: var(--panel2); border-radius: 8px; border: 1px solid var(--line);">
              <h4 style="margin: 0 0 0.5rem 0; color: var(--accent);">Borrower Public Key</h4>
              <p style="margin: 0; font-size: 0.9rem; color: #bcd2e8; line-height: 1.5;">Dedicated protocol team key: <code style="word-break: break-all;">${pos.publicKey}</code>.</p>
            </div>
            <div class="panel" style="padding: 1.25rem; background: var(--panel2); border-radius: 8px; border: 1px solid var(--line);">
              <h4 style="margin: 0 0 0.5rem 0; color: var(--accent);">Pool Borrow Share</h4>
              <p style="margin: 0; font-size: 0.9rem; color: #bcd2e8; line-height: 1.5;">POL represents <strong>${pct(pos.marketBorrowShare)}</strong> (${usd(pos.debtInUsd)}) of total pool borrow (${usd(pos.marketTotalBorrowInUsd)}). Organic borrower debt is ${usd(organicDebt)}.</p>
            </div>
          </div>
        </section>

        ${chartSection("Market borrow composition and risk backing", "How is borrow debt divided between protocol financing and organic market participants?")}
        ${interactiveBreakdownPanel("Market borrow composition: POL versus organic users", "marketPolBorrowComposition", { help: "Comparison of protocol-owned liquidity financing debt against organic user borrowing in this market." })}
        ${interactiveBreakdownPanel("Nominal LTV versus governance health factor", "marketPolHealthComparison", { help: "Shows the nominal loan-to-value ratio alongside unweighted Nominal Health Factor (Collateral / Debt) and effective on-chain Health Factor resulting from the 100x collateral weight multiplier." })}

        ${chartSection("Historical POL trajectory", "How have this market's protocol-owned debt obligations, locked collateral backing, pool share, and borrowing costs evolved over time?")}
        ${interactiveChartPanel("POL debt and collateral valuation history", "marketPolDebtHistory", { defaultPeriod: "all", help: "Tracks historical borrow debt obligations in USD and locked qPOL collateral valuation for this market across recorded snapshot observations." })}
        ${interactiveChartPanel("POL share of market borrow over time", "marketPolBorrowShareHistory", { defaultPeriod: "all", help: "Tracks the share of this market's total active borrow represented by Protocol-Owned Liquidity versus organic users across recorded snapshot observations." })}
        ${interactiveChartPanel("POL projected annual interest yield & borrow APY over time", "marketPolYieldHistory", { defaultPeriod: "all", help: "Tracks the projected annualized interest yield generated by this market's POL position and the borrow APY rate paid across recorded snapshot observations." })}
        ${interactiveChartPanel("Nominal LTV and smart contract health factor over time", "marketPolHealthHistory", { defaultPeriod: "all", help: "Tracks the nominal loan-to-value ratio alongside the effective on-chain smart contract Health Factor (with 100x collateral weighting) across recorded snapshot observations." })}

        ${dataTablesSection([
          {
            title: `${pos.marketDisplayName || mId} POL loan position details`,
            content: scrollTable([
              {
                positionId: pos.id,
                market: pos.marketDisplayName || mId,
                debtInUsd: pos.debtInUsd,
                lockedCollateral: `${(Number(pos.collateralTokens || 0) / 1e6).toFixed(2)}M qPOL`,
                collateralInUsd: pos.collateralInUsd,
                nominalLtv: pos.nominalLTV,
                nominalHealthFactor: pos.nominalHealthFactor ?? (pos.debtInUsd > 0 ? pos.collateralInUsd / pos.debtInUsd : 0),
                protocolHealthFactor: pos.healthFactor,
                borrowApy: pos.borrowAPY,
                annualInterestInUsd: pos.annualInterestCostInUsd,
                liquidationStatus: "Protected (0% Penalty)"
              }
            ], [
              "positionId",
              "market",
              "debtInUsd",
              "lockedCollateral",
              "collateralInUsd",
              "nominalLtv",
              "nominalHealthFactor",
              "protocolHealthFactor",
              "borrowApy",
              "annualInterestInUsd",
              "liquidationStatus"
            ])
          }
        ])}
      `);
      drawMarketPolCharts();
    }

    function renderImpact() {
      const stress = deep.marketStress || {};
      const loans = deep.loanState || {};
      const exposure = deep.currentExposure || {};
      const alerts = exposure.alerts || {};
      const marketSummaries = deep.marketSummaries || bundle.markets || [];
      const impactMarketNamesMap = new Map((deep.markets || deep.bundle?.markets || bundle.markets || []).map((m) => [m.id || m.marketId, m.displayName || m.symbol || m.id || m.marketId]));

      const pressureLeader = alerts.marketPressure?.[0] || (marketSummaries.length ? [...marketSummaries].sort((a, b) => Number(b.currentUtilization || 0) - Number(a.currentUtilization || 0))[0] : null);
      const rawPressureName = pressureLeader ? (pressureLeader.marketDisplayName || pressureLeader.marketId || pressureLeader.id) : null;
      const pressureMarketName = rawPressureName ? (impactMarketNamesMap.get(rawPressureName) || rawPressureName) : "n/a";
      const pressureNote = pressureLeader ? (pressureLeader.currentUtilization !== undefined ? `${pct(pressureLeader.currentUtilization)} utilization` : "No active market") : "No active market";

      const debtAtRiskLeader = (loans.byMarket || marketSummaries).reduce((best, row) => {
        const val = Number(row.activeLoanDebtBelow100InUsd || row.debtBelow100InUsd || 0);
        const bestVal = Number(best?.activeLoanDebtBelow100InUsd || best?.debtBelow100InUsd || 0);
        return val > bestVal ? row : best;
      }, null);
      const debtAtRiskVal = Number(debtAtRiskLeader?.activeLoanDebtBelow100InUsd || debtAtRiskLeader?.debtBelow100InUsd || 0);
      const rawDebtAtRiskName = debtAtRiskLeader ? (debtAtRiskLeader.marketDisplayName || debtAtRiskLeader.marketId) : null;
      const debtAtRiskMarketName = (rawDebtAtRiskName && debtAtRiskVal > 0) ? (impactMarketNamesMap.get(rawDebtAtRiskName) || rawDebtAtRiskName) : "None";
      const debtAtRiskNote = debtAtRiskVal > 0 ? `${usd(debtAtRiskVal)} debt at HF < 1.0` : "No debt at risk (HF < 1.0)";

      const badDebtLeader = (loans.byMarket || marketSummaries).reduce((best, row) => {
        const val = Number(row.activeLoanBadDebtInUsd || row.badDebtInUsd || 0);
        const bestVal = Number(best?.activeLoanBadDebtInUsd || best?.badDebtInUsd || 0);
        return val > bestVal ? row : best;
      }, null);
      const badDebtVal = Number(badDebtLeader?.activeLoanBadDebtInUsd || badDebtLeader?.badDebtInUsd || 0);
      const badDebtShortfallVal = Number(badDebtLeader?.activeLoanBadDebtShortfallInUsd || badDebtLeader?.badDebtShortfallInUsd || Math.max(0, badDebtVal - Number(badDebtLeader?.activeLoanBadDebtCollateralInUsd || badDebtLeader?.badDebtCollateralInUsd || 0)));
      const rawBadDebtName = badDebtLeader ? (badDebtLeader.marketDisplayName || badDebtLeader.marketId) : null;
      const badDebtMarketName = (rawBadDebtName && badDebtVal > 0) ? (impactMarketNamesMap.get(rawBadDebtName) || rawBadDebtName) : "None";
      const badDebtNote = badDebtVal > 0 ? `${usd(badDebtVal)} gross debt (${usd(badDebtShortfallVal)} net shortfall)` : "No bad debt across markets";

      const seriesMap = bundle.marketSeries || {};
      const marketsList = bundle.markets || marketSummaries || [];
      const liqVolLeader = marketsList.map((m) => {
        const mId = m.id || m.marketId;
        const rows = seriesMap[mId] || [];
        const vol30d = rows.slice(-30).reduce((sum, r) => sum + Number(r.debtRepaidInUsd || 0), 0);
        return { marketId: mId, marketDisplayName: m.displayName || m.symbol || mId, vol30d };
      }).reduce((best, item) => item.vol30d > (best?.vol30d || 0) ? item : best, null);
      const liqVolVal = Number(liqVolLeader?.vol30d || 0);
      const liqVolMarketName = (liqVolLeader && liqVolVal > 0) ? (liqVolLeader.marketDisplayName || liqVolLeader.marketId) : "None";
      const liqVolNote = liqVolVal > 0 ? `${usd(liqVolVal)} 30d liquidation volume` : "$0.00 30d liquidation volume";

      setHtml("impact", `
        <div class="hero"><h2>Protocol market impact</h2><p>Which markets contribute most to protocol-wide debt, interest, repayments, positive gaps, and stress?</p></div>
        <p class="note" style="margin: 0 0 1rem 0; font-size: 0.85rem; color: #94a3b8;"><em>Note: Market risk indicator matrix and debt-at-risk metrics assess liquidatable borrower debt and exclude non-liquidatable Protocol-Owned Liquidity (POL) loans. See the <a href="#protocolPol" onclick="activateView('protocolPol')" style="color: var(--accent); text-decoration: underline;">POL tab</a> for protocol financing.</em></p>
        <div class="kpis">
          ${kpi("Highest utilization pressure", pressureMarketName, pressureNote)}
          ${kpi("Highest debt at risk (HF < 1.0)", debtAtRiskMarketName, debtAtRiskNote)}
          ${kpi("Highest bad debt", badDebtMarketName, badDebtNote)}
          ${kpi("Highest 30d liquidation volume", liqVolMarketName, liqVolNote)}
        </div>
        ${chartSection("Current market impact", "Which markets combine utilization, liquidity, weak interest coverage, borrow growth, and loan-health pressure?")}
        ${interactiveBreakdownPanel("Market risk indicator matrix", "impactRiskRanking", { help: "Lighter cells are lower; darker cells are higher. Loan-health pressure and debt-at-risk metrics exclude governance-protected POL loans." })}
        ${interactiveBreakdownPanel("Market size, utilization, and coverage map", "impactMarketMap", { help: "Borrow uses a logarithmic X axis; bubble size is current supply and color is recent interest coverage." })}
        ${chartSection("Impact through time", "Which markets have gained or lost influence over protocol stress, interest, gaps, and repayment activity?")}
        ${interactiveChartPanel("Interest-accrual contributions", "impactInterestContributions")}
        ${interactiveChartPanel("Interest-repayment contributions", "impactInterestRepaymentContributions")}
        ${interactiveChartPanel("Positive interest-gap contributions", "impactGapContributions")}
        ${interactiveChartPanel("Outstanding-debt contributions", "impactDebtContributions", { help: "Each date shows the market's share of current protocol borrow. This is a debt stock, not a rolling flow." })}
        ${interactiveChartPanel("Debt-repayment contributions", "impactRepaymentContributions")}
        ${interactiveChartPanel("Positive debt-gap contributions", "impactDebtGapContributions", { help: "Positive daily inferred debt accrual minus reported debt repayment, clipped at zero before the trailing 30-day share is calculated." })}
        ${chartSection("Current contribution snapshot", "Which markets account for today's debt and the latest 30-day flow mix?")}
        ${interactiveBreakdownPanel("Current contribution shares by market", "impactCurrentContributions", { help: "Outstanding debt uses the latest borrow snapshot. Flow and positive-gap bars use trailing 30-day totals. Every bar has its own 100% denominator." })}
        ${chartSection("Cross-market risk snapshot", "Where is active debt closest to liquidation right now?")}
        ${interactiveBreakdownPanel("Active-debt state by market", "impactLoanState", { help: "Shows active-debt distribution across health-factor tranches by market. Excludes governance-protected POL loans." })}
        ${dataTablesSection([
          { title: "Historical contributors", content: table(stress.topStressMarketsFullPeriod || [], ["marketId", "averageStressContributionShare", "peakStressContributionShare", "peakStressDate"]) },
          { title: "Loan-health impact", content: table(loans.byMarket || [], ["marketId", "debtInUsd", "debtShare", "minHealthFactor", "debtAtOrBelow125InUsd", "loanHealthPressure"]) }
        ])}
      `);
      drawImpactCharts();
    }

    function chartSection(title, copy) {
      return `<h2 class="chart-section-heading">${esc(title)}</h2><p class="chart-section-copy">${esc(copy)}</p>`;
    }

    function metricPeriodGroup(title, period, detail, cards) {
      return `<section class="metric-period-group">
        <div class="metric-period">
          <div><span>${esc(title)}</span><strong>${esc(period)}</strong></div>
          ${detail ? `<em>${esc(detail)}</em>` : ""}
        </div>
        <div class="kpis">${cards}</div>
      </section>`;
    }

    function dataTablesSection(items) {
      return `<section class="data-tables" aria-label="Detailed data tables">
        ${chartSection("Data tables", "Exact values are gathered here so the analytical charts remain uninterrupted.")}
        <div class="data-table-grid">${items.map((item) => `<div class="panel"><h2>${esc(item.title)}</h2>${item.content}</div>`).join("")}</div>
      </section>`;
    }



    function chartQuestion(chartId) {
      const question = chartQuestions[chartId];
      if (!question) throw new Error(`Missing analytical question for chart: ${chartId}`);
      return `<p class="chart-question">${esc(question)}</p>`;
    }

    function chartTimeframeControls(chartId, title) {
      const selected = chartPeriods[chartId] || "year";
      return `<div class="chart-timeframes" role="group" aria-label="${esc(title)} timeframe">${chartTimeframes.map(([value, label]) => `
        <button type="button" class="${value === selected ? "active" : ""}" data-chart-id="${esc(chartId)}" data-chart-timeframe="${value}" aria-pressed="${value === selected}">${label}</button>
      `).join("")}</div>`;
    }

    function handleChartTimeframeClick(event) {
      const button = event.target.closest?.("[data-chart-timeframe]");
      if (!button) return;
      const chartId = button.dataset.chartId;
      const timeframe = button.dataset.chartTimeframe;
      if (!chartId || !chartTimeframes.some(([value]) => value === timeframe)) return;
      chartPeriods[chartId] = timeframe;
      button.closest(".chart-timeframes")?.querySelectorAll("[data-chart-timeframe]").forEach((candidate) => {
        const active = candidate.dataset.chartTimeframe === timeframe;
        candidate.classList.toggle("active", active);
        candidate.setAttribute("aria-pressed", String(active));
      });
      drawTimeChartById(chartId, true);
    }

    function drawTimeChartById(chartId, resetRange = false) {
      if (chartId.startsWith("protocol")) drawProtocolTimeChart(chartId, resetRange);
      else if (chartId.startsWith("marketParameter")) drawMarketParameterTimeChart(chartId, resetRange);
      else if (chartId.startsWith("market")) drawMarketTimeChart(chartId, resetRange);
      else if (chartId.startsWith("isolated")) drawIsolatedCharts(chartId, resetRange);
      else if (chartId.startsWith("liquidation")) drawLiquidationTimeChart(chartId, resetRange);
      else if (chartId.startsWith("impact")) drawImpactTimeChart(chartId, resetRange);
    }

    function chartBundleState() {
      if (chartCache?.source === bundle) return chartCache;
      chartCache = {
        source: bundle,
        protocolRows: enrichChartTimeSeries(bundle.protocolSeries || [], { windows: [7, 30, 90] }),
        marketRows: new Map(),
        contributions: new Map(),
        currentContributions: null,
        stress: null
      };
      return chartCache;
    }

    function marketSeriesRows(marketId) {
      const direct = bundle.marketSeries?.[marketId];
      if (direct) return direct;
      const key = Object.keys(bundle.marketSeries || {}).find((candidate) => candidate.toUpperCase() === String(marketId).toUpperCase());
      return key ? bundle.marketSeries[key] : [];
    }

    function enrichedMarketRows(marketId) {
      const cache = chartBundleState();
      const key = String(marketId).toUpperCase();
      if (!cache.marketRows.has(key)) cache.marketRows.set(key, enrichChartTimeSeries(marketSeriesRows(marketId), { windows: [7, 30, 90] }));
      return cache.marketRows.get(key);
    }

    function currentMarketSummary() {
      return deep.marketSummaries.find((row) => row.marketId === selectedMarket) || deep.marketSummaries[0];
    }

    function currentMarketParameters() {
      const byMarket = deep.marketParameters?.byMarket || {};
      const marketId = selectedMarket || currentMarketSummary()?.marketId;
      const direct = byMarket[marketId];
      if (direct) return direct;
      const key = Object.keys(byMarket).find((candidate) => candidate.toUpperCase() === String(marketId).toUpperCase());
      return key ? byMarket[key] : null;
    }

    function currentMarketRevenue() {
      const byMarket = deep.marketRevenue?.byMarket || {};
      const marketId = selectedMarket || currentMarketSummary()?.marketId;
      const direct = byMarket[marketId];
      if (direct) return direct;
      const key = Object.keys(byMarket).find((candidate) => candidate.toUpperCase() === String(marketId).toUpperCase());
      return key ? byMarket[key] : null;
    }

    function loanSnapshotRows(kind, scope, marketId = "") {
      return (deep.loanSnapshotHistory?.[kind] || []).filter((row) =>
        row.scope === scope && (scope === "protocol" || String(row.marketId).toUpperCase() === String(marketId).toUpperCase())
      );
    }

    function historicalHealthSeries(valueSuffix) {
      return LOAN_HEALTH_BUCKETS.map(([bucket, label, , , color]) => ({
        key: `${bucket}${valueSuffix}`,
        label,
        color,
        type: "line",
        points: true,
        dash: "5 4"
      }));
    }

    function protocolChartIds() {
      return ["protocolStablecoinYields", "protocolParticipationLoans", "protocolParticipationKeys", "protocolHealthHistoryCounts", "protocolHealthHistoryDebt", "protocolCapital", "protocolUtilization", "protocolDebtRolling", "protocolDebtCoverage", "protocolDebtDaily", "protocolDebtRepayment", "protocolRepaymentDrySpells", "protocolDebtCumulative", "protocolDebtCumulativeGap", "protocolDebtGap", "protocolDebtRepaymentDistribution", "protocolInterestRolling", "protocolInterestCoverage", "protocolInterestDaily", "protocolInterestRepayment", "protocolInterestDrySpells", "protocolInterestRepaymentDistribution", "protocolInterestCumulative", "protocolInterestCumulativeGap", "protocolInterestGap", "protocolLqPrice", "protocolLqStaking", "protocolLqTreasury"];
    }

    function drawProtocolStablecoinYieldsCharts(chartId = null, resetRange = false) {
      drawProtocolTimeChart("protocolStablecoinYields", resetRange);
    }

    function drawProtocolDebtCharts(chartId = null, resetRange = false) {
      const ids = ["protocolDebtRolling", "protocolDebtCoverage", "protocolDebtDaily", "protocolDebtRepayment", "protocolRepaymentDrySpells", "protocolDebtCumulative", "protocolDebtCumulativeGap", "protocolDebtGap", "protocolDebtRepaymentDistribution"];
      for (const id of chartId ? [chartId] : ids) drawProtocolTimeChart(id, resetRange);
    }

    function drawProtocolInterestCharts(chartId = null, resetRange = false) {
      const ids = ["protocolInterestRolling", "protocolInterestCoverage", "protocolInterestDaily", "protocolInterestRepayment", "protocolInterestDrySpells", "protocolInterestCumulative", "protocolInterestCumulativeGap", "protocolInterestGap", "protocolInterestRepaymentDistribution"];
      for (const id of chartId ? [chartId] : ids) drawProtocolTimeChart(id, resetRange);
    }

    function drawProtocolCharts(chartId = null, resetRange = false) {
      for (const id of chartId ? [chartId] : protocolChartIds()) drawProtocolTimeChart(id, resetRange);
    }

    function drawProtocolParameterCharts(chartId = null, resetRange = false) {
      const state = deep?.protocolParameters || {};
      if (!chartId || chartId === "protocolParameterRateAtlas") {
        const container = document.querySelector("#protocolParameterRateAtlas");
        if (container) {
          renderInteractiveScatterChart(container, {
            chartId: "protocolParameterRateAtlas",
            rows: state.rateCurveAtlas?.rows || [],
            seriesKey: "curve",
            seriesLabelKey: "curveLabel",
            labelKey: "pointLabel",
            xKey: "utilization",
            yKey: "rate",
            xLabel: "Utilization",
            yLabel: "Borrow APR",
            xFormatter: pct,
            yFormatter: pct,
            connectPoints: true,
            minimumPointRadius: 1.5,
            maximumPointRadius: 1.5,
            fixedXDomain: { min: 0, max: 1 },
            seriesLegendLabel: "Borrow APR curves",
            seriesLegendHelp: "The atlas includes up to eight markets, ranked by current USD borrow."
          });
        }
      }
      if (!chartId || chartId === "protocolParameterPolicyMap") {
        const container = document.querySelector("#protocolParameterPolicyMap");
        if (container) {
          renderInteractiveScatterChart(container, {
            chartId: "protocolParameterPolicyMap",
            rows: (state.marketRows || []).filter((row) => row.currentUtilization != null && row.kink != null),
            labelKey: "marketName",
            xKey: "currentUtilization",
            yKey: "kink",
            sizeKey: "borrowInUsd",
            colorKey: "maxBorrowerAPR",
            xLabel: "Current utilization",
            yLabel: "Optimal utilization (kink)",
            sizeLabel: "Current borrow",
            colorLabel: "Maximum borrower APR",
            colorPalette: riskPalette,
            fixedXDomain: { min: 0, max: 1 },
            fixedYDomain: { min: 0, max: 1 },
            xFormatter: pct,
            yFormatter: pct,
            sizeFormatter: usdCompact,
            colorFormatter: pct
          });
        }
      }
      if (!chartId || chartId === "protocolParameterCapacity") {
        const container = document.querySelector("#protocolParameterCapacity");
        if (container) {
          renderInteractiveCategoryChart(container, {
            chartId: "protocolParameterCapacity",
            rows: (state.marketRows || []).filter((row) => row.supplyCapInUsd != null),
            categoryKey: "marketName",
            series: [
              { key: "supplyInUsd", label: "Current supply", color: colors.blue },
              { key: "supplyCapHeadroomInUsd", label: "Remaining cap headroom", color: colors.mint }
            ],
            mode: "stacked",
            sortKey: "supplyCapInUsd",
            allowXScaleToggle: true,
            valueFormatter: usdCompact
          });
        }
      }
      if (!chartId || chartId === "protocolParameterGuardrails") {
        const container = document.querySelector("#protocolParameterGuardrails");
        if (container) {
          renderInteractiveCategoryChart(container, {
            chartId: "protocolParameterGuardrails",
            rows: (state.marketRows || []).filter((row) => row.minimumHealthBuffer != null || row.closeFactor != null),
            categoryKey: "marketName",
            series: [
              { key: "minimumHealthBuffer", label: "Minimum health buffer above 1.00", color: colors.blue },
              { key: "closeFactor", label: "Close factor", color: colors.amber }
            ],
            mode: "grouped",
            fixedXDomain: { min: 0, max: 1 },
            valueFormatter: pct
          });
        }
      }
      if (!chartId || chartId === "protocolParameterCollateral") {
        const container = document.querySelector("#protocolParameterCollateral");
        if (container) {
          renderInteractiveMatrixChart(container, {
            chartId: "protocolParameterCollateral",
            rows: state.collateralSummaryRows || [],
            rowKey: "marketName",
            columns: [
              { key: "minimumMaxLoanToValue", label: "Lowest max LTV" },
              { key: "minimumLiquidationThreshold", label: "Lowest liquidation threshold" },
              { key: "maximumLiquidationPenalty", label: "Highest liquidation penalty" },
              { key: "maximumCollateralWeight", label: "Highest collateral weight" }
            ],
            palette: riskPalette,
            paletteDirection: "reverse",
            valueFormatter: pct,
            legendAlign: "left",
            legendPosition: "top"
          });
        }
      }
      const timeIds = [
        "protocolParameterRateHistory",
        "protocolParameterUtilizationHistory",
        "protocolParameterAllocationHistory",
        "protocolParameterCoverageHistory",
        "protocolParameterGovernanceActivity"
      ];
      for (const id of chartId ? timeIds.filter((candidate) => candidate === chartId) : timeIds) {
        drawProtocolTimeChart(id, resetRange);
      }
    }

    function drawProtocolPolCharts(chartId = null, resetRange = false) {
      const pol = deep?.pol || {};
      const summary = pol.summary || {};
      const positions = pol.positions || [];

      if (!chartId || chartId === "protocolPolMarketComparison") {
        const container = document.querySelector("#protocolPolMarketComparison");
        if (container) {
          renderInteractiveCategoryChart(container, {
            chartId: "protocolPolMarketComparison",
            rows: positions.map((p) => ({
              marketName: p.marketDisplayName || p.marketId,
              debtInUsd: p.debtInUsd,
              collateralInUsd: p.collateralInUsd
            })),
            categoryKey: "marketName",
            series: [
              { key: "debtInUsd", label: "Outstanding Borrow Debt", color: colors.amber },
              { key: "collateralInUsd", label: "Locked Collateral Value", color: colors.mint }
            ],
            mode: "grouped",
            valueFormatter: usdCompact
          });
        }
      }

      if (!chartId || chartId === "protocolPolInterestContribution") {
        const container = document.querySelector("#protocolPolInterestContribution");
        if (container) {
          const totalInterest = Number(summary.totalAnnualInterestCostInUsd || positions.reduce((sum, p) => sum + Number(p.annualInterestCostInUsd || 0), 0));
          const rows = positions.map((p) => {
            const annualInterest = Number(p.annualInterestCostInUsd || (Number(p.debtInUsd || 0) * Number(p.borrowAPY || 0)));
            const share = totalInterest > 0 ? (annualInterest / totalInterest) : 0;
            return {
              marketName: p.marketDisplayName || p.marketId,
              annualInterestInUsd: annualInterest,
              interestContributionShare: share,
              debtInUsd: p.debtInUsd,
              borrowApy: p.borrowAPY
            };
          }).sort((a, b) => b.annualInterestInUsd - a.annualInterestInUsd || a.marketName.localeCompare(b.marketName));

          renderInteractiveCategoryChart(container, {
            chartId: "protocolPolInterestContribution",
            rows,
            categoryKey: "marketName",
            series: [
              { key: "annualInterestInUsd", label: "Annual Interest Yield Paid (Current Rates)", color: colors.amber }
            ],
            mode: "grouped",
            sortKey: "annualInterestInUsd",
            allowXScaleToggle: true,
            valueFormatter: usdCompact
          });
        }
      }

      if (!chartId || chartId === "protocolPolHealthComparison") {
        const container = document.querySelector("#protocolPolHealthComparison");
        if (container) {
          renderInteractiveCategoryChart(container, {
            chartId: "protocolPolHealthComparison",
            rows: positions.map((p) => ({
              marketName: p.marketDisplayName || p.marketId,
              nominalLtv: p.nominalLTV,
              nominalHealthFactor: p.nominalHealthFactor ?? (p.debtInUsd > 0 ? p.collateralInUsd / p.debtInUsd : 0),
              healthFactor: p.healthFactor
            })),
            categoryKey: "marketName",
            series: [
              { key: "nominalLtv", label: "Nominal LTV (Debt / Collateral)", color: colors.amber },
              { key: "nominalHealthFactor", label: "Nominal Health Factor (Collateral / Debt)", color: colors.purple },
              { key: "healthFactor", label: "Protocol Smart Contract Health Factor (100x)", color: colors.blue }
            ],
            mode: "grouped",
            allowXScaleToggle: true,
            xScale: "symlog",
            valueFormatter: (v, k) => k === "nominalLtv" ? pct(v) : number(v, 2)
          });
        }
      }

      if (!chartId || chartId === "protocolPolBorrowShare") {
        const container = document.querySelector("#protocolPolBorrowShare");
        if (container) {
          renderInteractiveCategoryChart(container, {
            chartId: "protocolPolBorrowShare",
            rows: positions.map((p) => ({
              marketName: p.marketDisplayName || p.marketId,
              marketBorrowShare: p.marketBorrowShare,
              borrowApy: p.borrowAPY
            })),
            categoryKey: "marketName",
            series: [
              { key: "marketBorrowShare", label: "POL Share of Pool Borrow", color: colors.mint },
              { key: "borrowApy", label: "Borrow APY (Interest Rate Paid)", color: colors.purple }
            ],
            mode: "grouped",
            valueFormatter: pct
          });
        }
      }

      if (!chartId || chartId === "protocolPolDebtHistory") {
        drawProtocolTimeChart("protocolPolDebtHistory", resetRange);
      }
      if (!chartId || chartId === "protocolPolMarketBreakdownHistory") {
        drawProtocolTimeChart("protocolPolMarketBreakdownHistory", resetRange);
      }
    }

    function drawProtocolTimeChart(chartId, resetRange = false) {
      const container = document.querySelector(`#${chartId}`);
      if (!container) return;
      let rows = chartBundleState().protocolRows;
      const options = { chartId, period: chartPeriods[chartId], resetRange };
      if (chartId === "protocolPolDebtHistory") {
        const pol = deep?.pol || {};
        const summary = pol.summary || {};
        const polRows = pol.history?.length ? pol.history : [{
          date: todayDateKey(),
          timestamp: new Date().toISOString(),
          totalDebtInUsd: summary.totalDebtInUsd,
          totalCollateralInUsd: summary.totalCollateralInUsd
        }];
        lineChart(container, polRows, [
          { key: "totalDebtInUsd", label: "Total POL Debt", color: colors.amber, type: "line", points: true },
          { key: "totalCollateralInUsd", label: "Locked qPOL Collateral Value", color: colors.mint, type: "line", points: true }
        ], usdCompact, { ...options, valueMode: "stock" });
      }
      if (chartId === "protocolPolMarketBreakdownHistory") {
        const pol = deep?.pol || {};
        const positions = pol.positions || [];
        const polRows = pol.history?.length ? pol.history : [{
          date: todayDateKey(),
          timestamp: new Date().toISOString(),
          djedDebtInUsd: positions.find((p) => p.marketId === "DJED")?.debtInUsd || 0,
          usdmDebtInUsd: positions.find((p) => p.marketId === "USDM")?.debtInUsd || 0,
          usdcDebtInUsd: positions.find((p) => p.marketId === "USDC" || p.marketId === "wanUSDC")?.debtInUsd || 0,
          iusdDebtInUsd: positions.find((p) => p.marketId === "IUSD")?.debtInUsd || 0
        }];
        lineChart(container, polRows, [
          { key: "djedDebtInUsd", label: "DJED POL Debt", color: colors.blue, type: "line", points: true },
          { key: "usdmDebtInUsd", label: "USDM POL Debt", color: colors.mint, type: "line", points: true },
          { key: "usdcDebtInUsd", label: "wanUSDC POL Debt", color: colors.purple, type: "line", points: true },
          { key: "iusdDebtInUsd", label: "iUSD POL Debt", color: colors.amber, type: "line", points: true }
        ], usdCompact, { ...options, valueMode: "stock" });
      }
      if (chartId === "protocolStablecoinYields") {
        const yieldRows = buildStablecoinYieldComparisonData(bundle.marketSeries);
        const series = USD_STABLECOIN_CONFIG.map((config) => {
          const market = bundle.marketById?.[config.id] || bundle.marketById?.[config.id.toUpperCase()];
          return {
            key: `${config.id.toLowerCase()}SupplyApy`,
            label: market?.displayName || config.label,
            color: config.color
          };
        });
        lineChart(container, yieldRows, series, pct, { ...options, valueMode: "ratio" });
      }
      if (chartId === "protocolParticipationLoans") lineChart(container, loanSnapshotRows("health", "protocol"), [{ key: "activeDebtLoanCount", label: "Active-debt positions", color: colors.blue, type: "line", points: true, dash: "5 4" }], integer, { ...options, valueMode: "stock" });
      if (chartId === "protocolParticipationKeys") lineChart(container, loanSnapshotRows("participation", "protocol"), [{ key: "distinctActiveDebtObservedKeyCount", label: "Distinct observed keys with active debt", color: colors.mint, type: "line", points: true, dash: "5 4" }], integer, { ...options, valueMode: "stock" });
      if (chartId === "protocolLqPrice") lineChart(container, deep?.lqToken?.series || [], [["lqPriceInUsd", "LQ Price (USD)", colors.mint]], usdPrice, { ...options, valueMode: "stock" });
      if (chartId === "protocolLqStaking") lineChart(container, deep?.lqToken?.series || [], [{ key: "stakedLqAmount", label: "Staked LQ", color: colors.blue, type: "line", points: true, yAxis: "left" }, { key: "stakingRatio", label: "Staking ratio", color: colors.blue, type: "line", points: true, yAxis: "right", legend: false, summary: false }], (v, k) => k === "stakingRatio" ? pct(v) : assetAmount(v, "LQ"), { ...options, valueMode: "stock", hideYScaleToggle: true });
      if (chartId === "protocolLqTreasury") lineChart(container, deep?.lqToken?.series || [], [{ key: "daoTreasuryLqAmount", label: "DAO Treasury LQ", color: colors.amber, type: "line", points: true, yAxis: "left" }, { key: "daoTreasuryUsdValue", label: "DAO Treasury USD Value", color: colors.mint, type: "line", points: true, yAxis: "right" }], (v, k) => k === "daoTreasuryUsdValue" ? usdCompact(v) : assetAmount(v, "LQ"), { ...options, valueMode: "stock", hideYScaleToggle: true });
      if (chartId === "protocolHealthHistoryCounts") lineChart(container, loanSnapshotRows("health", "protocol"), historicalHealthSeries("LoanCount"), integer, { ...options, valueMode: "stock" });
      if (chartId === "protocolHealthHistoryDebt") lineChart(container, loanSnapshotRows("health", "protocol"), historicalHealthSeries("DebtInUsd"), usdCompact, { ...options, valueMode: "stock" });
      if (chartId === "protocolParameterRateHistory") lineChart(container, deep?.protocolParameters?.history || [], [
        { key: "borrowWeightedBaseBorrowerAPR", label: "Borrow-weighted base APR", color: colors.blue },
        { key: "borrowWeightedOptimalBorrowerAPR", label: "Borrow-weighted optimal APR", color: colors.mint },
        { key: "borrowWeightedMaxBorrowerAPR", label: "Borrow-weighted maximum APR", color: colors.amber }
      ], pct, { ...options, valueMode: "ratio" });
      if (chartId === "protocolParameterUtilizationHistory") lineChart(container, deep?.protocolParameters?.history || [], [
        { key: "borrowWeightedKink", label: "Borrow-weighted kink", color: colors.mint },
        { key: "borrowWeightedUtilizationCap", label: "Borrow-weighted utilization cap", color: colors.amber }
      ], pct, { ...options, valueMode: "ratio", fixedYDomain: { min: 0, max: 1 } });
      if (chartId === "protocolParameterAllocationHistory") lineChart(container, deep?.protocolParameters?.history || [], [
        { key: "borrowWeightedSupplierSplit", label: "Suppliers", color: colors.blue },
        { key: "borrowWeightedDividendSplit", label: "Dividends / LQ stakers", color: colors.mint },
        { key: "borrowWeightedTreasurySplit", label: "Treasury", color: colors.amber },
        { key: "borrowWeightedReserveSplit", label: "Reserve remainder", color: colors.purple }
      ], pct, { ...options, valueMode: "ratio", fixedYDomain: { min: 0, max: 1 } });
      if (chartId === "protocolParameterCoverageHistory") lineChart(container, deep?.protocolParameters?.history || [], [
        { key: "parameterCoverage", label: "Borrow covered by observable parameters", color: colors.blue },
        { key: "borrowAboveKinkShare", label: "Borrow above kink thresholds", color: colors.amber }
      ], pct, { ...options, valueMode: "ratio", fixedYDomain: { min: 0, max: 1 } });
      if (chartId === "protocolParameterGovernanceActivity") lineChart(container, deep?.protocolParameters?.governanceActivity || [], [
        { key: "updateCount", label: "Market governance updates", color: colors.blue, type: "bar" },
        { key: "changedParameterCount", label: "Identifiable changed fields", color: colors.mint, type: "bar" }
      ], integer, { ...options, valueMode: "flow" });
      if (chartId === "protocolCapital") lineChart(container, rows, [["supplyInUsd", "Supply", colors.blue], ["borrowInUsd", "Borrow", colors.amber], ["liquidityInUsd", "Liquidity", colors.mint]], usdCompact, { ...options, valueMode: "stock" });
      if (chartId === "protocolUtilization") lineChart(container, rows, [["utilizationPercentage", "Utilization", colors.blue]], pct, { ...options, valueMode: "ratio", fixedYDomain: { min: 0, max: 1 }, referenceLines: [{ value: 0.85, label: "85% high utilization", color: colors.amber }] });
      if (chartId === "protocolDebtRepayment") {
        rows = buildFlowIntensityChartData(rows, "debtRepaidInUsd");
        lineChart(container, rows, [
          { key: "debtRepaidInUsd", label: "Daily debt repaid", color: colors.blue, type: "bar" },
          { key: "flowEwma", label: "1.5-day EWMA", color: colors.mint, type: "line", summary: false },
          { key: "flowAverage", label: "30-day average", color: colors.purple, type: "line", summary: false }
        ], usdCompact, { ...options, valueMode: "flow" });
      }
      if (chartId === "protocolRepaymentDrySpells") {
        rows = buildDrySpellChartData(rows, [
          { field: "debtRepaidInUsd", key: "debtRepaymentDrySpellDays" }
        ]);
        lineChart(container, rows, [
          { key: "debtRepaymentDrySpellDays", label: "Days without debt repayment", color: colors.blue, type: "line", points: true }
        ], integer, { ...options, valueMode: "stock" });
      }
      if (chartId === "protocolDebtRepaymentDistribution") {
        const markets = (deep?.marketSummaries || []).map((m, idx) => ({
          key: m.marketId,
          label: m.displayName || m.marketId,
          rows: enrichedMarketRows(m.marketId),
          color: [colors.blue, colors.mint, colors.amber, colors.purple, "#3edc81", "#19b5fe", "#e056fd", "#f1c40f"][idx % 8]
        }));
        renderInteractiveBoxplotChart(container, {
          ...options,
          chartId,
          markets: markets.length ? markets : undefined,
          rows,
          valueKey: "debtRepaidInUsd",
          title: "Protocol debt repaid distribution",
          period: chartPeriods[chartId],
          resetRange,
          valueFormatter: usdCompact
        });
      }
      if (chartId === "protocolDebtDaily") lineChart(container, rows, [["debtAccruedInUsd", "Daily debt accrued", colors.purple], ["debtRepaidInUsd", "Daily debt repaid", colors.mint]], usdCompact, { ...options, valueMode: "flow" });
      if (chartId === "protocolDebtRolling") lineChart(container, rows, [["debtAccrued30d", "Accrued · current-valued rolling 30d", colors.purple], ["debtRepaid30d", "Repaid · current-valued rolling 30d", colors.mint]], usdCompact, { ...options, valueMode: "flow" });
      if (chartId === "protocolDebtCumulative") lineChart(container, rows, [
        ["cumulativeDebtAccrued", "Cumulative inferred formation", colors.purple],
        ["cumulativeDebtRepaid", "Cumulative reported repayment", colors.mint],
        ["cumulativeUnclassifiedBorrowReduction", "Cumulative unclassified reductions", colors.amber]
      ], usdCompact, { ...options, valueMode: "stock" });
      if (chartId === "protocolDebtCumulativeGap") lineChart(container, rows, [{ key: "cumulativeDebtGap", label: "Sum of current-valued market differences", color: colors.purple }], usdCompact, { ...options, valueMode: "stock", referenceLines: [{ value: 0, label: "Zero reported flow difference" }] });
      if (chartId === "protocolDebtGap") lineChart(container, rows, [
        { key: "dailyDebtGap", label: "Daily market gaps · USD sum", color: colors.amber, negativeColor: colors.mint, type: "bar" },
        { key: "debtGap30d", label: "Rolling 30d market gaps · USD sum", color: colors.purple, type: "line", summary: false }
      ], usdCompact, { ...options, valueMode: "flow", referenceLines: [{ value: 0, label: "Zero reported flow difference" }] });
      if (chartId === "protocolDebtCoverage") lineChart(container, rows, [["debtCoverage7d", "Coverage - 7d", colors.blue], ["debtCoverage30d", "Coverage - 30d", colors.purple], ["debtCoverage90d", "Coverage - 90d", colors.mint]], ratio, { ...options, valueMode: "ratio", referenceLines: [{ value: 1, label: "1.00x parity", color: colors.amber }] });
      if (chartId === "protocolInterestDaily") lineChart(container, rows, [["interestAccruedInUsd", "Daily accrued", colors.purple], ["interestRepaidInUsd", "Daily repaid", colors.mint]], usdCompact, { ...options, valueMode: "flow" });
      if (chartId === "protocolInterestRepayment") {
        rows = buildFlowIntensityChartData(rows, "interestRepaidInUsd");
        lineChart(container, rows, [
          { key: "interestRepaidInUsd", label: "Daily interest repaid", color: colors.blue, type: "bar" },
          { key: "flowEwma", label: "1.5-day EWMA", color: colors.mint, type: "line", summary: false },
          { key: "flowAverage", label: "30-day average", color: colors.purple, type: "line", summary: false }
        ], usdCompact, { ...options, valueMode: "flow" });
      }
      if (chartId === "protocolInterestDrySpells") {
        rows = buildDrySpellChartData(rows, [
          { field: "interestRepaidInUsd", key: "interestRepaymentDrySpellDays" }
        ]);
        lineChart(container, rows, [
          { key: "interestRepaymentDrySpellDays", label: "Days without interest repayment", color: colors.mint, type: "line", points: true }
        ], integer, { ...options, valueMode: "stock" });
      }
      if (chartId === "protocolInterestRepaymentDistribution") {
        const markets = (deep?.marketSummaries || []).map((m, idx) => ({
          key: m.marketId,
          label: m.displayName || m.marketId,
          rows: enrichedMarketRows(m.marketId),
          color: [colors.mint, colors.blue, colors.amber, colors.purple, "#3edc81", "#19b5fe", "#e056fd", "#f1c40f"][idx % 8]
        }));
        renderInteractiveBoxplotChart(container, {
          ...options,
          chartId,
          markets: markets.length ? markets : undefined,
          rows,
          valueKey: "interestRepaidInUsd",
          title: "Protocol interest repaid distribution",
          period: chartPeriods[chartId],
          resetRange,
          valueFormatter: usdCompact
        });
      }
      if (chartId === "protocolInterestRolling") lineChart(container, rows, [["interestAccrued30d", "Accrued · current-valued rolling 30d", colors.purple], ["interestRepaid30d", "Repaid · current-valued rolling 30d", colors.mint]], usdCompact, { ...options, valueMode: "flow" });
      if (chartId === "protocolInterestCumulative") lineChart(container, rows, [["cumulativeInterestAccrued", "Cumulative accrued", colors.purple], ["cumulativeInterestRepaid", "Cumulative repaid", colors.mint]], usdCompact, { ...options, valueMode: "stock" });
      if (chartId === "protocolInterestCumulativeGap") lineChart(container, rows, [{ key: "cumulativeInterestGap", label: "Sum of current-valued market differences", color: colors.purple }], usdCompact, { ...options, valueMode: "stock", referenceLines: [{ value: 0, label: "Zero reported flow difference" }] });
      if (chartId === "protocolInterestGap") lineChart(container, rows, [
        { key: "dailyInterestGap", label: "Daily market gaps · USD sum", color: colors.amber, negativeColor: colors.mint, type: "bar" },
        { key: "interestGap30d", label: "Rolling 30d market gaps · USD sum", color: colors.purple, type: "line", summary: false }
      ], usdCompact, { ...options, valueMode: "flow", referenceLines: [{ value: 0, label: "Zero reported flow difference" }] });
      if (chartId === "protocolInterestCoverage") lineChart(container, rows, [["interestCoverage7d", "Coverage - 7d", colors.blue], ["interestCoverage30d", "Coverage - 30d", colors.purple], ["interestCoverage90d", "Coverage - 90d", colors.mint]], ratio, { ...options, valueMode: "ratio", referenceLines: [{ value: 1, label: "1.00x parity", color: colors.amber }] });
      const daoAllocationSeries = [
        { key: "allocatedProtocolInterestRevenueInUsd", label: "DAO interest", color: colors.blue, type: "bar" },
        { key: "allocatedProtocolOriginationRevenueInUsd", label: "DAO origination", color: colors.mint, type: "bar" }
      ];
      const stakerAllocationSeries = [
        { key: "allocatedHoldersInterestRevenueInUsd", label: "LQ stakers interest", color: colors.purple, type: "bar" },
        { key: "allocatedHoldersOriginationRevenueInUsd", label: "LQ stakers origination", color: colors.amber, type: "bar" }
      ];
      const collectedRevenueSeries = [
        { key: "collectedInterestRevenueInUsd", label: "Retained interest collected", color: colors.blue, type: "bar" },
        { key: "collectedOriginationRevenueInUsd", label: "Origination fees collected", color: colors.mint, type: "bar" }
      ];
      if (chartId === "protocolCollectedRevenueDaily") lineChart(container, deep.revenue?.daily || [], collectedRevenueSeries, usdCompact, { ...options, valueMode: "flow", stackMode: "value" });
      if (chartId === "protocolCollectedRevenueMonthly") lineChart(container, deep.revenue?.monthlyCollectedRevenue || [], collectedRevenueSeries, usdCompact, { ...options, valueMode: "flow", stackMode: "value", calendarPeriod: "month" });
      if (chartId === "protocolDaoRevenueAllocationDaily") lineChart(container, deep.revenue?.dailyAllocation || [], daoAllocationSeries, usdCompact, { ...options, valueMode: "flow", stackMode: "value" });
      if (chartId === "protocolDaoRevenueAllocationMonthly") lineChart(container, deep.revenue?.monthlyAllocation || [], daoAllocationSeries, usdCompact, { ...options, valueMode: "flow", stackMode: "value", calendarPeriod: "month" });
      if (chartId === "protocolStakerRevenueAllocationDaily") lineChart(container, deep.revenue?.dailyAllocation || [], stakerAllocationSeries, usdCompact, { ...options, valueMode: "flow", stackMode: "value" });
      if (chartId === "protocolStakerRevenueAllocationMonthly") lineChart(container, deep.revenue?.monthlyAllocation || [], stakerAllocationSeries, usdCompact, { ...options, valueMode: "flow", stackMode: "value", calendarPeriod: "month" });
      if (chartId === "protocolRevenueRunRate") lineChart(container, deep.revenue?.annualizedRunRateSeries || [], [
        { key: "annualizedRunRateInUsd", label: "Annualized DAO run rate", color: colors.mint, type: "line", points: true }
      ], usdCompact, { ...options, valueMode: "stock" });
    }

    function drawRevenueCharts() {
      drawProtocolTimeChart("protocolCollectedRevenueDaily");
      drawProtocolTimeChart("protocolCollectedRevenueMonthly");
      drawMarketRevenueContributionYtd();
      drawProtocolTimeChart("protocolRevenueRunRate");
      drawProtocolTimeChart("protocolDaoRevenueAllocationMonthly");
      drawProtocolTimeChart("protocolDaoRevenueAllocationDaily");
      drawProtocolTimeChart("protocolStakerRevenueAllocationMonthly");
      drawProtocolTimeChart("protocolStakerRevenueAllocationDaily");
    }

    function drawMarketRevenueContributionYtd() {
      const container = document.querySelector("#protocolMarketRevenueContributionYtd");
      if (!container) return;
      const contributions = (deep.revenue?.marketYtdContributions && deep.revenue.marketYtdContributions.length)
        ? deep.revenue.marketYtdContributions
        : (deep.marketRevenue?.ytdMarketContributions && deep.marketRevenue.ytdMarketContributions.length)
          ? deep.marketRevenue.ytdMarketContributions
          : (deep.marketSummaries || []).map((m) => {
            const rev = m.marketRevenue || {};
            const directOrigination = rev.ytdDirectOriginationRevenueInUsd ?? m.ytdCollectedOriginationRevenueInUsd ?? 0;
            const attributedInterest = rev.ytdAttributedCollectedInterestRevenueInUsd ?? 0;
            const totalRevenue = rev.ytdAttributedCollectedMarketRevenueInUsd ?? (directOrigination + attributedInterest);
            return {
              marketId: m.marketId,
              marketDisplayName: m.displayName || m.symbol || m.marketId,
              directOriginationRevenueInUsd: directOrigination,
              attributedCollectedInterestRevenueInUsd: attributedInterest,
              totalRevenueInUsd: totalRevenue,
              revenueShare: (deep.revenue?.summary?.ytdCollectedRevenueInUsd > 0)
                ? totalRevenue / deep.revenue.summary.ytdCollectedRevenueInUsd
                : 0
            };
          }).sort((a, b) => b.totalRevenueInUsd - a.totalRevenueInUsd || a.marketDisplayName.localeCompare(b.marketDisplayName));

      const positiveRows = contributions.filter((r) => Number(r.totalRevenueInUsd) > 0);
      const rows = positiveRows.length ? positiveRows : contributions;

      renderInteractiveCategoryChart(container, {
        chartId: "protocolMarketRevenueContributionYtd",
        rows,
        categoryKey: "marketDisplayName",
        series: [
          { key: "attributedCollectedInterestRevenueInUsd", label: "Retained interest revenue", color: colors.blue },
          { key: "directOriginationRevenueInUsd", label: "Loan origination fees", color: colors.amber }
        ],
        mode: "stacked",
        allowXScaleToggle: true,
        sortKey: "totalRevenueInUsd",
        valueFormatter: usdCompact
      });
    }

    function marketChartIds() {
      return ["marketParticipationLoans", "marketParticipationKeys", "marketHealthHistoryCounts", "marketHealthHistoryDebt", "marketCapital", "marketUtilization", "marketDebtRepayment", "marketDebtCoverageOperandsAsset", "marketDebtCoverageOperandsUsd", "marketDebtCoverage", "marketDebtGapAsset", "marketDebtGap", "marketDebtCumulativeGapAsset", "marketDebtCumulativeGap", "marketRepaymentEvents", "marketRepaymentDrySpells", "marketDebtRepaymentDistribution", "marketInterestDaily", "marketInterestCoverageOperandsAsset", "marketInterestCoverageOperandsUsd", "marketInterestCumulative", "marketInterestCumulativeGapAsset", "marketInterestCumulativeGap", "marketInterestGapAsset", "marketInterestGap", "marketInterestCoverage", "marketInterestDrySpells", "marketInterestRepaymentDistribution", "marketRates", "marketLiquidityPressure", "marketAttributedCollectedRevenueDaily", "marketAttributedCollectedRevenueMonthly", "marketAccruedInterestAllocationDaily", "marketAccruedInterestAllocationMonthly", "marketProjectedAnnualizedInterestIncome", "marketInterestRepaymentActivityMonthly", "marketPolDebtHistory", "marketPolBorrowShareHistory", "marketPolYieldHistory", "marketPolHealthHistory"];
    }

    function drawMarketCharts(chartId = null, resetRange = false) {
      for (const id of chartId ? [chartId] : marketChartIds()) drawMarketTimeChart(id, resetRange);
      if (!chartId || chartId === "marketKeyDependence") drawMarketKeyDependence();
      if (!chartId || chartId === "marketBorrowConcentration") drawMarketBorrowConcentration();
      if (!chartId || chartId === "marketCollateralizedSupplyConcentration") drawMarketCollateralizedSupplyConcentration();
      if (!chartId || chartId.startsWith("marketPol")) drawMarketPolCharts(chartId, resetRange);
      if (!chartId) drawMarketHealthChart();
    }

    function drawMarketPolCharts(chartId = null, resetRange = false) {
      const market = currentMarketSummary();
      const mId = market?.symbol || market?.marketId;
      const pos = (deep?.pol?.positions || []).find((p) => p.marketId.toUpperCase() === String(mId).toUpperCase() || p.marketId.toUpperCase() === String(market?.marketId).toUpperCase());
      const hasHistory = loanSnapshotRows("pol", "market", market?.marketId).some((r) => r.debtInUsd > 0 || r.collateralInUsd > 0);
      if (!pos && !hasHistory) return;

      if (!chartId || chartId === "marketPolBorrowComposition") {
        const compContainer = document.querySelector("#marketPolBorrowComposition");
        if (compContainer) {
          const organicDebt = Math.max(0, (pos?.marketTotalBorrowInUsd || pos?.debtInUsd || 0) - (pos?.debtInUsd || 0));
          renderInteractiveCategoryChart(compContainer, {
            chartId: "marketPolBorrowComposition",
            rows: [
              {
                segment: pos?.marketDisplayName || mId,
                polDebtInUsd: pos?.debtInUsd || 0,
                organicDebtInUsd: organicDebt
              }
            ],
            categoryKey: "segment",
            series: [
              { key: "polDebtInUsd", label: "Protocol-Owned Liquidity (POL)", color: colors.amber },
              { key: "organicDebtInUsd", label: "Organic User Borrowing", color: colors.blue }
            ],
            mode: "stacked",
            valueFormatter: usdCompact
          });
        }
      }

      if (!chartId || chartId === "marketPolHealthComparison") {
        const healthContainer = document.querySelector("#marketPolHealthComparison");
        if (healthContainer) {
          renderInteractiveCategoryChart(healthContainer, {
            chartId: "marketPolHealthComparison",
            rows: [
              {
                segment: pos?.marketDisplayName || mId,
                nominalLtv: pos?.nominalLTV || 0,
                nominalHealthFactor: pos?.nominalHealthFactor ?? (pos?.debtInUsd > 0 ? (pos?.collateralInUsd || 0) / pos.debtInUsd : 0),
                healthFactor: pos?.healthFactor || 0
              }
            ],
            categoryKey: "segment",
            series: [
              { key: "nominalLtv", label: "Nominal LTV (Debt / Collateral)", color: colors.amber },
              { key: "nominalHealthFactor", label: "Nominal Health Factor (Collateral / Debt)", color: colors.purple },
              { key: "healthFactor", label: "Effective Health Factor (100x Multiplier)", color: colors.mint }
            ],
            mode: "grouped",
            allowXScaleToggle: true,
            xScale: "symlog",
            valueFormatter: (v, k) => k === "nominalLtv" ? pct(v) : number(v, 2)
          });
        }
      }

      if (!chartId || chartId === "marketPolDebtHistory") {
        drawMarketTimeChart("marketPolDebtHistory", resetRange);
      }
      if (!chartId || chartId === "marketPolBorrowShareHistory") {
        drawMarketTimeChart("marketPolBorrowShareHistory", resetRange);
      }
      if (!chartId || chartId === "marketPolYieldHistory") {
        drawMarketTimeChart("marketPolYieldHistory", resetRange);
      }
      if (!chartId || chartId === "marketPolHealthHistory") {
        drawMarketTimeChart("marketPolHealthHistory", resetRange);
      }
    }

    function drawMarketParameterCharts(chartId = null, resetRange = false) {
      const ids = [
        "marketParameterBorrowRates",
        "marketParameterSupplyRates",
        "marketParameterUtilizationLimits",
        "marketParameterSupplyCap",
        "marketParameterIncomeAllocation",
        "marketParameterModelCoefficients"
      ];
      if (!chartId || chartId === "marketParameterRateCurve") drawMarketParameterRateCurve();
      for (const id of chartId ? ids.filter((candidate) => candidate === chartId) : ids) {
        drawMarketParameterTimeChart(id, resetRange);
      }
    }

    function drawMarketParameterRateCurve() {
      const container = document.querySelector("#marketParameterRateCurve");
      const state = currentMarketParameters();
      if (!container || !state?.rateCurve) return;
      const references = [];
      const currentUtilization = displayNumber(state.rateCurve.currentUtilization);
      const kink = displayNumber(state.rateCurve.kink);
      const utilizationCap = displayNumber(state.rateCurve.utilizationCap);
      if (currentUtilization != null && currentUtilization >= 0 && currentUtilization <= 1) {
        references.push({ value: currentUtilization, label: `Current ${pct(currentUtilization)}`, color: "#e8f7ff" });
      }
      if (kink != null && kink >= 0 && kink <= 1) {
        references.push({ value: kink, label: `Kink ${pct(kink)}`, color: colors.mint, dash: "5 4" });
      }
      if (utilizationCap != null && utilizationCap >= 0 && utilizationCap < 1) {
        references.push({ value: utilizationCap, label: `Cap ${pct(utilizationCap)}`, color: "#ff5a67", dash: "2 4" });
      }
      renderInteractiveScatterChart(container, {
        chartId: "marketParameterRateCurve",
        rows: state.rateCurve.rows || [],
        seriesKey: "curve",
        seriesLabelKey: "curveLabel",
        series: [
          { key: "borrower", label: "Borrow APR", color: colors.amber },
          { key: "supplier", label: "Supply APY", color: colors.blue }
        ],
        labelKey: "pointLabel",
        xKey: "utilization",
        yKey: "rate",
        xLabel: "Utilization",
        yLabel: "Annualized rate",
        xFormatter: pct,
        yFormatter: pct,
        connectPoints: true,
        minimumPointRadius: 1.5,
        maximumPointRadius: 1.5,
        fixedXDomain: { min: 0, max: 1 },
        xReferenceLines: references,
        seriesLegendLabel: "Rate curves",
        seriesLegendHelp: "Select a curve to emphasize or mute it. Both remain visible for comparison."
      });
    }

    function drawMarketParameterTimeChart(chartId, resetRange = false) {
      const container = document.querySelector(`#${chartId}`);
      const state = currentMarketParameters();
      if (!container || !state) return;
      const market = currentMarketSummary();
      const rows = marketParameterHistoryRows(state.history || []);
      const options = { chartId, period: chartPeriods[chartId], resetRange, valueMode: "stock" };
      if (chartId === "marketParameterBorrowRates") {
        lineChart(container, rows, [
          { key: "baseBorrowerAPR", label: "Base borrower APR", color: colors.blue },
          { key: "optimalBorrowerAPR", label: "Optimal borrower APR", color: colors.mint },
          { key: "maxBorrowerAPR", label: "Maximum borrower APR at cap", color: colors.amber }
        ], pct, options);
      }
      if (chartId === "marketParameterSupplyRates") {
        lineChart(container, rows, [
          { key: "baseSupplierAPY", label: "Base supplier APY", color: colors.blue },
          { key: "optimalSupplierAPY", label: "Optimal supplier APY", color: colors.mint },
          { key: "maxSupplierAPY", label: "Maximum supplier APY at cap", color: colors.amber }
        ], pct, options);
      }
      if (chartId === "marketParameterUtilizationLimits") {
        lineChart(container, rows, [
          { key: "kink", label: "Optimal utilization (kink)", color: colors.mint },
          { key: "effectiveUtilizationCap", label: "Effective utilization cap", color: colors.amber }
        ], pct, { ...options, valueMode: "ratio", fixedYDomain: { min: 0, max: 1 } });
      }
      if (chartId === "marketParameterSupplyCap") {
        lineChart(container, rows, [
          { key: "supplyCap", label: `Supply cap (${market.symbol || market.marketId})`, color: colors.blue }
        ], (value) => assetAmount(value, market.symbol || market.marketId), options);
      }
      if (chartId === "marketParameterIncomeAllocation") {
        lineChart(container, rows, [
          { key: "supplierSplit", label: "Suppliers", color: colors.blue },
          { key: "dividendSplit", label: "Dividends", color: colors.mint },
          { key: "treasurySplit", label: "Treasury", color: colors.amber },
          { key: "reserveSplit", label: "Reserve remainder", color: colors.purple }
        ], pct, { ...options, valueMode: "ratio", fixedYDomain: { min: 0, max: 1 } });
      }
      if (chartId === "marketParameterModelCoefficients") {
        lineChart(container, rows, [
          { key: "baseRate", label: "Base rate coefficient", color: colors.blue },
          { key: "utilMultiplier", label: "Utilization multiplier", color: colors.mint },
          { key: "utilMultiplierJump", label: "Post-kink multiplier", color: colors.amber }
        ], parameterScalar, options);
      }
    }

    function marketParameterHistoryRows(rows) {
      return rows.map((row) => {
        const sum = displayNumber(row.incomeRatioSum);
        const suppliers = displayNumber(row.incomeRatioSuppliers);
        const dividends = displayNumber(row.incomeRatioDividends);
        const treasury = displayNumber(row.incomeRatioTreasury);
        const hasAllocation = sum != null && sum !== 0;
        const supplierSplit = hasAllocation ? (suppliers || 0) / sum : null;
        const dividendSplit = hasAllocation ? (dividends || 0) / sum : null;
        const treasurySplit = hasAllocation ? (treasury || 0) / sum : null;
        return {
          ...row,
          effectiveUtilizationCap: row.borrowCap == null ? 1 : row.borrowCap,
          supplierSplit,
          dividendSplit,
          treasurySplit,
          reserveSplit: hasAllocation ? 1 - supplierSplit - dividendSplit - treasurySplit : null
        };
      });
    }

    function drawMarketTimeChart(chartId, resetRange = false) {
      const container = document.querySelector(`#${chartId}`);
      if (!container) return;
      const market = currentMarketSummary();
      let rows = enrichedMarketRows(market.marketId);
      const revenueRows = currentMarketRevenue()?.daily || [];
      const options = { chartId, period: chartPeriods[chartId], resetRange };
      const nativeAmount = (value) => assetAmount(value, market.symbol || market.marketId);
      if (chartId === "marketPolDebtHistory" || chartId === "marketPolBorrowShareHistory" || chartId === "marketPolYieldHistory" || chartId === "marketPolHealthHistory") {
        const mId = market?.symbol || market?.marketId;
        const pos = (deep?.pol?.positions || []).find((p) => p.marketId.toUpperCase() === String(mId).toUpperCase() || p.marketId.toUpperCase() === String(market?.marketId).toUpperCase());
        const rawPolRows = loanSnapshotRows("pol", "market", market.marketId);
        const polRows = rawPolRows.length ? rawPolRows : (pos ? [{
          date: todayDateKey(),
          timestamp: new Date().toISOString(),
          debtInUsd: pos.debtInUsd,
          collateralInUsd: pos.collateralInUsd,
          collateralTokens: pos.collateralTokens,
          borrowApy: pos.borrowAPY,
          annualInterestCostInUsd: pos.annualInterestCostInUsd,
          nominalLtv: pos.nominalLTV,
          healthFactor: pos.healthFactor,
          marketBorrowShare: pos.marketBorrowShare,
          loanCount: 1
        }] : []);

        if (chartId === "marketPolDebtHistory") {
          lineChart(container, polRows, [
            { key: "debtInUsd", label: "POL Borrow Debt", color: colors.amber, type: "line", points: true },
            { key: "collateralInUsd", label: "Locked qPOL Collateral Value", color: colors.mint, type: "line", points: true }
          ], usdCompact, { ...options, valueMode: "stock" });
        }
        if (chartId === "marketPolBorrowShareHistory") {
          lineChart(container, polRows, [
            { key: "marketBorrowShare", label: "POL Share of Pool Borrow", color: colors.blue, type: "line", points: true }
          ], pct, { ...options, valueMode: "ratio", fixedYDomain: { min: 0, max: 1 } });
        }
        if (chartId === "marketPolYieldHistory") {
          lineChart(container, polRows, [
            { key: "annualInterestCostInUsd", label: "Projected Annual Interest Yield", color: colors.amber, type: "line", points: true, yAxis: "left" },
            { key: "borrowApy", label: "Borrow APY", color: colors.blue, type: "line", points: true, yAxis: "right" }
          ], (v, k) => k === "borrowApy" ? pct(v) : usdCompact(v), { ...options, valueMode: "stock", hideYScaleToggle: true });
        }
        if (chartId === "marketPolHealthHistory") {
          lineChart(container, polRows, [
            { key: "nominalLtv", label: "Nominal LTV (Debt / Collateral)", color: colors.amber, type: "line", points: true, yAxis: "left" },
            { key: "healthFactor", label: "Effective Health Factor (100x Multiplier)", color: colors.mint, type: "line", points: true, yAxis: "right" }
          ], (v, k) => k === "nominalLtv" ? pct(v) : number(v, 2), { ...options, valueMode: "stock", hideYScaleToggle: true });
        }
        return;
      }
      if (chartId === "marketParticipationLoans") lineChart(container, loanSnapshotRows("health", "market", market.marketId), [{ key: "activeDebtLoanCount", label: "Active-debt positions", color: colors.blue, type: "line", points: true, dash: "5 4" }], integer, { ...options, valueMode: "stock" });
      if (chartId === "marketParticipationKeys") lineChart(container, loanSnapshotRows("participation", "market", market.marketId), [{ key: "distinctActiveDebtObservedKeyCount", label: "Distinct observed keys with active debt", color: colors.mint, type: "line", points: true, dash: "5 4" }], integer, { ...options, valueMode: "stock" });
      if (chartId === "marketHealthHistoryCounts") lineChart(container, loanSnapshotRows("health", "market", market.marketId), historicalHealthSeries("LoanCount"), integer, { ...options, valueMode: "stock" });
      if (chartId === "marketHealthHistoryDebt") lineChart(container, loanSnapshotRows("health", "market", market.marketId), historicalHealthSeries("DebtInUsd"), usdCompact, { ...options, valueMode: "stock" });
      if (chartId === "marketCapital") lineChart(container, rows, [["supplyInUsd", "Supply", colors.blue], ["borrowInUsd", "Borrow", colors.amber], ["liquidityInUsd", "Liquidity", colors.mint]], usdCompact, { ...options, valueMode: "stock" });
      if (chartId === "marketUtilization") lineChart(container, rows, [["utilizationPercentage", "Utilization", colors.blue]], pct, { ...options, valueMode: "ratio", fixedYDomain: { min: 0, max: 1 }, referenceLines: [{ value: 0.85, label: "85% high utilization", color: colors.amber }] });
      if (chartId === "marketDebtRepayment") lineChart(container, rows, [
        { key: "debtRepaidInUsd", label: "Daily debt repaid", color: colors.blue, type: "bar" },
        { key: "debtRepaid30d", label: "Rolling 30d repaid · current price", color: colors.mint, type: "line", summary: false }
      ], usdCompact, { ...options, valueMode: "flow" });
      if (chartId === "marketDebtCoverageOperandsAsset") lineChart(container, rows, [
        { key: "debtAccruedAsset30d", label: "Native accrued · rolling 30d", color: colors.purple },
        { key: "debtRepaidAsset30d", label: "Native repaid · rolling 30d", color: colors.mint }
      ], nativeAmount, { ...options, valueMode: "flow" });
      if (chartId === "marketDebtCoverageOperandsUsd") lineChart(container, rows, [
        { key: "debtAccrued30d", label: "Accrued · rolling 30d at current price", color: colors.purple },
        { key: "debtRepaid30d", label: "Repaid · rolling 30d at current price", color: colors.mint }
      ], usdCompact, { ...options, valueMode: "flow" });
      if (chartId === "marketDebtCoverage") lineChart(container, rows, [["debtCoverage30d", "Coverage - 30d", colors.purple], ["debtCoverage90d", "Coverage - 90d", colors.mint]], ratio, { ...options, valueMode: "ratio", referenceLines: [{ value: 1, label: "1.00x parity", color: colors.amber }] });
      if (chartId === "marketDebtGapAsset") lineChart(container, rows, [
        { key: "dailyDebtGapAsset", label: "Daily native debt gap", color: colors.amber, negativeColor: colors.mint, type: "bar" },
        { key: "debtGapAsset30d", label: "Rolling 30d native gap", color: colors.purple, type: "line", summary: false }
      ], nativeAmount, { ...options, valueMode: "flow", referenceLines: [{ value: 0, label: "Zero reported flow difference" }] });
      if (chartId === "marketDebtGap") lineChart(container, rows, [
        { key: "dailyDebtGap", label: "Daily gap · current USD", color: colors.amber, negativeColor: colors.mint, type: "bar" },
        { key: "debtGap30d", label: "Rolling 30d gap · current USD", color: colors.purple, type: "line", summary: false }
      ], usdCompact, { ...options, valueMode: "flow", referenceLines: [{ value: 0, label: "Zero reported flow difference" }] });
      if (chartId === "marketDebtCumulativeGapAsset") lineChart(container, rows, [
        { key: "cumulativeDebtGapAsset", label: "Cumulative native debt gap", color: colors.purple }
      ], nativeAmount, { ...options, valueMode: "stock", referenceLines: [{ value: 0, label: "Zero reported flow difference" }] });
      if (chartId === "marketDebtCumulativeGap") lineChart(container, rows, [
        { key: "cumulativeDebtGap", label: "Cumulative gap · current USD", color: colors.purple }
      ], usdCompact, { ...options, valueMode: "stock", referenceLines: [{ value: 0, label: "Zero reported flow difference" }] });
      if (chartId === "marketRepaymentEvents") {
        rows = buildFlowIntensityChartData(rows, "debtRepaidInUsd");
        lineChart(container, rows, [
          { key: "debtRepaidInUsd", label: "Daily debt repaid", color: colors.blue, type: "bar" },
          { key: "flowEwma", label: "1.5-day EWMA", color: colors.mint, type: "line", summary: false },
          { key: "flowAverage", label: "30-day average", color: colors.purple, type: "line", summary: false }
        ], usdCompact, { ...options, valueMode: "flow" });
      }
      if (chartId === "marketRepaymentDrySpells") {
        rows = buildDrySpellChartData(rows, [
          { field: "debtRepaidInUsd", key: "debtRepaymentDrySpellDays" }
        ]);
        lineChart(container, rows, [
          { key: "debtRepaymentDrySpellDays", label: "Days without debt repayment", color: colors.blue, type: "line", points: true }
        ], integer, { ...options, valueMode: "stock" });
      }
      if (chartId === "marketInterestDrySpells") {
        rows = buildDrySpellChartData(rows, [
          { field: "interestRepaidInUsd", key: "interestRepaymentDrySpellDays" }
        ]);
        lineChart(container, rows, [
          { key: "interestRepaymentDrySpellDays", label: "Days without interest repayment", color: colors.mint, type: "line", points: true }
        ], integer, { ...options, valueMode: "stock" });
      }
      if (chartId === "marketDebtRepaymentDistribution") {
        renderInteractiveBoxplotChart(container, {
          ...options,
          chartId,
          rows,
          valueKey: "debtRepaidInUsd",
          title: "Debt repaid distribution",
          period: chartPeriods[chartId],
          resetRange,
          valueFormatter: usdCompact
        });
      }
      if (chartId === "marketInterestDaily") lineChart(container, rows, [["interestAccruedInUsd", "Daily accrued", colors.purple], ["interestRepaidInUsd", "Daily repaid", colors.mint]], usdCompact, { ...options, valueMode: "flow" });
      if (chartId === "marketInterestCoverageOperandsAsset") lineChart(container, rows, [
        { key: "interestAccruedAsset30d", label: "Native accrued · rolling 30d", color: colors.purple },
        { key: "interestRepaidAsset30d", label: "Native repaid · rolling 30d", color: colors.mint }
      ], nativeAmount, { ...options, valueMode: "flow" });
      if (chartId === "marketInterestCoverageOperandsUsd") lineChart(container, rows, [
        { key: "interestAccrued30d", label: "Accrued · rolling 30d at current price", color: colors.purple },
        { key: "interestRepaid30d", label: "Repaid · rolling 30d at current price", color: colors.mint }
      ], usdCompact, { ...options, valueMode: "flow" });
      if (chartId === "marketInterestCumulative") lineChart(container, rows, [["cumulativeInterestAccrued", "Cumulative accrued", colors.purple], ["cumulativeInterestRepaid", "Cumulative repaid", colors.mint]], usdCompact, { ...options, valueMode: "stock" });
      if (chartId === "marketInterestCumulativeGapAsset") lineChart(container, rows, [{ key: "cumulativeInterestGapAsset", label: "Cumulative native reported flow difference", color: colors.purple }], nativeAmount, { ...options, valueMode: "stock", referenceLines: [{ value: 0, label: "Zero reported flow difference" }] });
      if (chartId === "marketInterestCumulativeGap") lineChart(container, rows, [{ key: "cumulativeInterestGap", label: "Cumulative reported flow difference · current USD", color: colors.purple }], usdCompact, { ...options, valueMode: "stock", referenceLines: [{ value: 0, label: "Zero reported flow difference" }] });
      if (chartId === "marketInterestGapAsset") lineChart(container, rows, [
        { key: "dailyInterestGapAsset", label: "Daily native interest gap", color: colors.amber, negativeColor: colors.mint, type: "bar" },
        { key: "interestGapAsset30d", label: "Rolling 30d native gap", color: colors.purple, type: "line", summary: false }
      ], nativeAmount, { ...options, valueMode: "flow", referenceLines: [{ value: 0, label: "Zero reported flow difference" }] });
      if (chartId === "marketInterestGap") lineChart(container, rows, [
        { key: "dailyInterestGap", label: "Daily gap · current USD", color: colors.amber, negativeColor: colors.mint, type: "bar" },
        { key: "interestGap30d", label: "Rolling 30d gap · current USD", color: colors.purple, type: "line", summary: false }
      ], usdCompact, { ...options, valueMode: "flow", referenceLines: [{ value: 0, label: "Zero reported flow difference" }] });
      if (chartId === "marketInterestCoverage") lineChart(container, rows, [["interestCoverage30d", "Coverage - 30d", colors.purple], ["interestCoverage90d", "Coverage - 90d", colors.mint]], ratio, { ...options, valueMode: "ratio", referenceLines: [{ value: 1, label: "1.00x parity", color: colors.amber }] });
      if (chartId === "marketInterestRepaymentDistribution") {
        renderInteractiveBoxplotChart(container, {
          ...options,
          chartId,
          rows,
          valueKey: "interestRepaidInUsd",
          title: "Interest repaid distribution",
          period: chartPeriods[chartId],
          resetRange,
          valueFormatter: usdCompact
        });
      }
      if (chartId === "marketRates") lineChart(container, rows, [["borrowApr", "Borrow APR", colors.amber], ["supplyApy", "Supply APY", colors.mint]], pct, { ...options, valueMode: "ratio" });
      if (chartId === "marketLiquidityPressure") lineChart(container, rows, [["borrowToLiquidity", "Borrow / available liquidity", colors.mint]], ratio, { ...options, valueMode: "ratio", referenceLines: [{ value: 1, label: "1.00x borrow / liquidity", color: colors.amber }] });
      if (chartId === "marketAttributedCollectedRevenueDaily") {
        const attributableRows = revenueRows.filter((row) => row.collectedInterestAttributionAvailable);
        lineChart(container, attributableRows, [
          { key: "attributedCollectedInterestRevenueInUsd", label: "Attributed retained interest collected", color: colors.blue, type: "bar" },
          { key: "directOriginationRevenueInUsd", label: "Direct origination fees", color: colors.mint, type: "bar" }
        ], usdCompact, { ...options, valueMode: "flow", stackMode: "value" });
      }
      if (chartId === "marketAttributedCollectedRevenueMonthly") {
        const monthly = aggregateMonthlyChartRows(revenueRows.filter((row) => row.collectedInterestAttributionAvailable));
        lineChart(container, monthly, [
          { key: "attributedCollectedInterestRevenueInUsd", label: "Attributed retained interest collected", color: colors.blue, type: "bar" },
          { key: "directOriginationRevenueInUsd", label: "Direct origination fees", color: colors.mint, type: "bar" }
        ], usdCompact, { ...options, valueMode: "flow", stackMode: "value", calendarPeriod: "month" });
      }
      if (chartId === "marketAccruedInterestAllocationDaily") {
        const allocatedRows = revenueRows.filter((row) => displayNumber(row.supplierInterestShare) !== null);
        lineChart(container, allocatedRows, [
          { key: "accruedSupplierInterestIncomeInUsd", label: "Supplier interest income accrued", color: colors.blue, type: "bar" },
          { key: "accruedProtocolInterestRevenueInUsd", label: "Protocol / reserve interest revenue accrued", color: colors.mint, type: "bar" }
        ], usdCompact, { ...options, valueMode: "flow", stackMode: "value" });
      }
      if (chartId === "marketAccruedInterestAllocationMonthly") {
        const monthly = aggregateMonthlyChartRows(revenueRows.filter((row) => displayNumber(row.supplierInterestShare) !== null));
        lineChart(container, monthly, [
          { key: "accruedSupplierInterestIncomeInUsd", label: "Supplier interest income accrued", color: colors.blue, type: "bar" },
          { key: "accruedProtocolInterestRevenueInUsd", label: "Protocol / reserve interest revenue accrued", color: colors.mint, type: "bar" }
        ], usdCompact, { ...options, valueMode: "flow", stackMode: "value", calendarPeriod: "month" });
      }
      if (chartId === "marketProjectedAnnualizedInterestIncome") {
        const projectedRows = revenueRows.filter((row) => displayNumber(row.projectedAnnualizedInterestIncomeInUsd) !== null);
        lineChart(container, projectedRows, [
          { key: "projectedAnnualizedInterestIncomeInUsd", label: "Gross annualized interest income", color: colors.amber, type: "line" },
          { key: "projectedAnnualizedSupplierInterestIncomeInUsd", label: "Suppliers", color: colors.blue, type: "line" },
          { key: "projectedAnnualizedProtocolInterestRevenueInUsd", label: "Protocol / reserve", color: colors.mint, type: "line" }
        ], usdCompact, { ...options, valueMode: "stock" });
      }
      if (chartId === "marketInterestRepaymentActivityMonthly") {
        const completeRevenueRows = rows.filter((row) => !market.marketRevenueCoverageToDate || row.date <= market.marketRevenueCoverageToDate);
        const monthly = aggregateMonthlyChartRows(completeRevenueRows);
        lineChart(container, monthly, [
          { key: "interestRepaidActivityInUsd", label: "Borrower interest repaid (not retained revenue)", color: colors.purple, type: "bar" }
        ], usdCompact, { ...options, valueMode: "flow", calendarPeriod: "month" });
      }
    }

    function drawMarketHealthChart() {
      const container = document.querySelector("#marketHealthBuckets");
      if (!container) return;
      const market = currentMarketSummary();
      const buckets = market.activeLoanHealthBuckets || [];
      renderInteractiveCategoryChart(container, {
        chartId: "marketHealthBuckets",
        rows: buckets.map((bucket) => ({ label: bucket.label, debtInUsd: bucket.debtInUsd })),
        categoryKey: "label",
        series: [{ key: "debtInUsd", label: "Current debt", color: colors.blue }],
        mode: "grouped",
        sortKey: null,
        allowXScaleToggle: true,
        valueFormatter: usdCompact
      });
    }

    function drawMarketBorrowConcentration() {
      const container = document.querySelector("#marketBorrowConcentration");
      if (!container) return;
      const market = currentMarketSummary();
      const rows = (deep.currentExposure?.borrowerConcentration?.marketCumulativeConcentration || [])
        .filter((row) => row.marketId === market.marketId);
      renderInteractiveScatterChart(container, {
        chartId: "marketBorrowConcentration",
        rows,
        labelKey: "observedKeyLabel",
        xKey: "observedKeyRank",
        yKey: "cumulativeShareOfMarketBorrow",
        sizeKey: "keyDebtInUsd",
        xLabel: "Observed-key rank, largest to smallest",
        yLabel: "Cumulative share of official market borrow",
        sizeLabel: "Debt added at this rank",
        fixedYDomain: { min: 0, max: 1 },
        integerXTicks: true,
        connectPoints: true,
        pointColor: colors.mint,
        lineColor: colors.mint,
        xFormatter: integer,
        yFormatter: pct,
        sizeFormatter: usdCompact
      });
    }

    function drawMarketCollateralizedSupplyConcentration() {
      const container = document.querySelector("#marketCollateralizedSupplyConcentration");
      if (!container) return;
      const market = currentMarketSummary();
      const rows = (deep.currentExposure?.supplySide?.marketCumulativeConcentration || [])
        .filter((row) => row.marketId === market.marketId);
      renderInteractiveScatterChart(container, {
        chartId: "marketCollateralizedSupplyConcentration",
        rows,
        labelKey: "observedKeyLabel",
        xKey: "observedKeyRank",
        yKey: "cumulativeShareOfRepresentedCollateralizedSupply",
        sizeKey: "keyCollateralInUsd",
        xLabel: "Observed-key rank, largest to smallest",
        yLabel: "Cumulative share of represented collateralized supply",
        sizeLabel: "Collateral added at this rank",
        fixedYDomain: { min: 0, max: 1 },
        integerXTicks: true,
        connectPoints: true,
        pointColor: colors.blue,
        lineColor: colors.blue,
        xFormatter: integer,
        yFormatter: pct,
        sizeFormatter: usdCompact
      });
    }

    function drawMarketKeyDependence() {
      const container = document.querySelector("#marketKeyDependence");
      if (!container) return;
      const market = currentMarketSummary();
      const marketDependence = (deep.currentExposure?.borrowerConcentration?.marketDependence || []).find((row) => row.marketId === market.marketId);
      if (!marketDependence) return;
      const row = {
        ...marketDependence,
        categoryLabel: `${market.displayName || market.marketId} borrow breakdown`
      };
      renderInteractiveCategoryChart(container, {
        chartId: "marketKeyDependence",
        rows: [row],
        categoryKey: "categoryLabel",
        series: [
          { key: "largestKeyDebtShareOfMarketBorrow", label: "Largest observed key", color: riskPalette[4] },
          { key: "nextTwoKeysDebtShareOfMarketBorrow", label: "Next 2 observed keys", color: riskPalette[3] },
          { key: "otherMappedKeysDebtShareOfMarketBorrow", label: "Other mapped observed keys", color: riskPalette[0] },
          { key: "unmappedBorrowShare", label: "Unmapped borrow", color: colors.slate, hatch: true }
        ],
        mode: "stacked",
        fixedXDomain: { min: 0, max: 1 },
        valueFormatter: pct
      });
    }

    function drawLiquidationCharts(chartId = null, resetRange = false) {
      for (const id of chartId ? [chartId] : ["liquidationMonthly", "liquidationDaily", "liquidationDrySpell"]) drawLiquidationTimeChart(id, resetRange);
    }

    function drawLiquidationTimeChart(chartId, resetRange = false) {
      const container = document.querySelector(`#${chartId}`);
      if (!container) return;
      const source = chartId === "liquidationMonthly"
        ? deep.liquidation?.monthlyProtocolLiquidationProfit || []
        : deep.liquidation?.dailyProtocolLiquidationProfit || [];
      if (chartId === "liquidationDaily") {
        const rows = buildFlowIntensityChartData(source, "liquidationProfitInUsd");
        lineChart(container, rows, [
          { key: "liquidationProfitInUsd", label: "Daily liquidation profit", color: colors.blue, type: "bar" },
          { key: "flowEwma", label: "1.5-day EWMA", color: colors.mint, type: "line", summary: false },
          { key: "flowAverage", label: "30-day average", color: colors.purple, type: "line", summary: false }
        ], usdDetailed, { chartId, period: chartPeriods[chartId], valueMode: "flow", resetRange });
        return;
      }
      if (chartId === "liquidationDrySpell") {
        const rows = buildDrySpellChartData(source, [{
          field: "liquidationProfitInUsd", key: "daysWithoutLiquidations", threshold: 0.01, absolute: true
        }]);
        lineChart(container, rows, [
          { key: "daysWithoutLiquidations", label: "Days without liquidations", color: colors.mint, type: "line", points: true }
        ], integer, { chartId, period: chartPeriods[chartId], valueMode: "stock", resetRange });
        return;
      }
      lineChart(container, source, [
        { key: "liquidationProfitInUsd", label: "Liquidation profit", color: colors.blue, type: "bar" }
      ], usdDetailed, { chartId, period: chartPeriods[chartId], valueMode: "flow", calendarPeriod: "month", resetRange });
    }

    function drawExposureCharts(chartId = null, resetRange = false) {
      const exposureHealthHistoryContainer = document.querySelector("#exposureHealthHistoryDebt");
      if (exposureHealthHistoryContainer && (!chartId || chartId === "exposureHealthHistoryDebt")) {
        lineChart(
          exposureHealthHistoryContainer,
          loanSnapshotRows("health", "protocol"),
          historicalHealthSeries("DebtInUsd"),
          usdCompact,
          { chartId: "exposureHealthHistoryDebt", period: chartPeriods["exposureHealthHistoryDebt"], resetRange, valueMode: "stock" }
        );
      }
      const exposureBadDebtHistoryContainer = document.querySelector("#exposureBadDebtHistory");
      if (exposureBadDebtHistoryContainer && (!chartId || chartId === "exposureBadDebtHistory")) {
        const rawSnapshotRows = loanSnapshotRows("health", "protocol");
        const badDebtHistoryRows = rawSnapshotRows.map((row) => ({
          ...row,
          badDebtInUsd: row.badDebtInUsd !== undefined && row.badDebtInUsd !== null && String(row.badDebtInUsd).trim() !== "" ? Number(row.badDebtInUsd) || 0 : Number(row.hf_le_100DebtInUsd) || 0,
          badDebtShortfallInUsd: row.badDebtShortfallInUsd !== undefined && row.badDebtShortfallInUsd !== null && String(row.badDebtShortfallInUsd).trim() !== "" ? Number(row.badDebtShortfallInUsd) || 0 : Math.max(0, (Number(row.badDebtInUsd) || Number(row.hf_le_100DebtInUsd) || 0) - (Number(row.badDebtCollateralInUsd) || 0)),
          badDebtLoanCount: row.badDebtLoanCount !== undefined && row.badDebtLoanCount !== null && String(row.badDebtLoanCount).trim() !== "" ? Number(row.badDebtLoanCount) || 0 : Number(row.hf_le_100LoanCount) || 0
        }));
        lineChart(
          exposureBadDebtHistoryContainer,
          badDebtHistoryRows,
          [
            { key: "badDebtInUsd", label: "Gross bad debt (underwater debt)", color: colors.red, type: "line", points: true, dash: "5 4" },
            { key: "badDebtShortfallInUsd", label: "Net shortfall (uncovered deficit)", color: colors.amber, type: "line", points: true }
          ],
          usdCompact,
          { chartId: "exposureBadDebtHistory", period: chartPeriods["exposureBadDebtHistory"], resetRange, valueMode: "stock" }
        );
      }
      if (chartId && chartId !== "exposureHealthHistoryDebt" && chartId !== "exposureBadDebtHistory") return;

      const exposure = deep.currentExposure || {};
      const alerts = exposure.alerts || {};
      const collateral = exposure.collateralRisk || {};
      const borrowers = exposure.borrowerConcentration || {};
      const supply = exposure.supplySide || {};
      const keyRankingRows = observedKeyRowsAtThreshold(borrowers.observedKeyExposure || {}, exposureHfThreshold);

      renderInteractiveScatterChart(document.querySelector("#exposureMarketPressure"), {
        chartId: "exposureMarketPressure",
        rows: alerts.marketPressure || [],
        labelKey: "marketDisplayName",
        xKey: "currentUtilization",
        yKey: "utilizationChange7d",
        sizeKey: "currentBorrowInUsd",
        colorKey: "pressureScore",
        xLabel: "Current utilization",
        yLabel: "7-day utilization change",
        sizeLabel: "Current borrow",
        colorLabel: "Pressure score",
        colorPalette: riskPalette,
        xFormatter: pct,
        yFormatter: signedPct,
        sizeFormatter: usdCompact,
        colorFormatter: pct
      });

      renderInteractiveCategoryChart(document.querySelector("#exposureFlowComparison"), {
        chartId: "exposureFlowComparison",
        rows: alerts.flowComparison || [],
        categoryKey: "label",
        series: [
          { key: "recent30InUsd", label: "Recent 30 calendar days", color: colors.blue },
          { key: "prior30InUsd", label: "Prior 30 calendar days", color: colors.slate }
        ],
        mode: "grouped",
        allowXScaleToggle: true,
        valueFormatter: usdCompact
      });

      renderInteractiveCategoryChart(document.querySelector("#exposureBorrowedMarkets"), {
        chartId: "exposureBorrowedMarkets",
        rows: deep.loanState?.byMarket || [],
        categoryKey: "marketId",
        series: healthFactorSeries(false),
        mode: "stacked",
        allowXScaleToggle: true,
        sortKey: "debtAtOrBelow125InUsd",
        valueFormatter: usdCompact
      });

      renderInteractiveCategoryChart(document.querySelector("#exposureCollateralBands"), {
        chartId: "exposureCollateralBands",
        rows: collateral.byCollateral || [],
        categoryKey: "collateralDisplayName",
        series: healthFactorSeries(true),
        mode: "stacked",
        allowXScaleToggle: true,
        sortKey: "debtAtOrBelow125InUsd",
        valueFormatter: usdCompact
      });

      const shockRows = new Map();
      for (const row of collateral.shockScenarios || []) {
        const key = row.collateralMarketId;
        if (!shockRows.has(key)) shockRows.set(key, { collateral: row.collateralDisplayName || key });
        shockRows.get(key)[`shock${row.shockPercent}`] = row.exposedDebtInUsd;
      }
      renderInteractiveMatrixChart(document.querySelector("#exposureCollateralShock"), {
        chartId: "exposureCollateralShock",
        rows: [...shockRows.values()],
        rowKey: "collateral",
        columns: [10, 20, 30, 40].map((shock) => ({ key: `shock${shock}`, label: `${shock}% price decline` })),
        matrixPalette: "risk",
        valueFormatter: usdCompact
      });

      const liquidatable = (deep.liquidation?.currentLiquidatableByMarket || []).map((row) => ({
        ...row,
        marketId: row.marketId || row.id || "Unknown",
        liquidatableLoanCount: Number(row.liquidatableLoanCount ?? row.loanCount ?? 0),
        liquidatableDebtInUsd: Number(row.liquidatableDebtInUsd ?? row.debtInUsd ?? 0)
      }));
      renderInteractiveCategoryChart(document.querySelector("#exposureLiquidatableDebt"), {
        chartId: "exposureLiquidatableDebt",
        rows: liquidatable,
        categoryKey: "marketId",
        series: [{ key: "liquidatableDebtInUsd", label: "Liquidatable active debt", color: riskPalette[4] }],
        mode: "grouped",
        sortKey: "liquidatableDebtInUsd",
        allowXScaleToggle: true,
        valueFormatter: usdCompact
      });
      renderInteractiveCategoryChart(document.querySelector("#exposureLiquidatableMarkets"), {
        chartId: "exposureLiquidatableMarkets",
        rows: liquidatable,
        categoryKey: "marketId",
        series: [{ key: "liquidatableLoanCount", label: "Liquidatable active-debt loans", color: riskPalette[4] }],
        mode: "grouped",
        sortKey: "liquidatableLoanCount",
        valueFormatter: integer
      });

      renderInteractiveScatterChart(document.querySelector("#exposureObservedKeyRanking"), {
        chartId: "exposureObservedKeyRanking",
        rows: keyRankingRows,
        labelKey: "observedKeyLabel",
        xKey: "totalDebtInUsd",
        yKey: "lowHfShareOfKeyDebt",
        sizeKey: "lowHfDebtInUsd",
        colorKey: "lowHfShareOfKeyDebt",
        xScale: "log",
        xLabel: "Total mapped debt (log scale)",
        yLabel: `Share of key debt at HF <= ${Number(exposureHfThreshold).toFixed(2)}`,
        sizeLabel: "Low-HF debt",
        colorLabel: "Low-HF share of key debt",
        colorPalette: riskPalette,
        fixedYDomain: { min: 0, max: 1 },
        xFormatter: usdCompact,
        yFormatter: pct,
        sizeFormatter: usdCompact,
        colorFormatter: pct
      });


      renderInteractiveCategoryChart(document.querySelector("#exposureLowHfConcentrationSensitivity"), {
        chartId: "exposureLowHfConcentrationSensitivity",
        rows: borrowers.concentrationSensitivity || [],
        categoryKey: "thresholdLabel",
        series: [
          { key: "top1DebtShare", label: "Top 1 observed key", color: riskPalette[4] },
          { key: "top3DebtShare", label: "Top 3 observed keys", color: riskPalette[3] }
        ],
        mode: "grouped",
        fixedXDomain: { min: 0, max: 1 },
        valueFormatter: pct
      });
    }

    function drawLiquidityCharts(chartId = null, resetRange = false) {
      const exposure = deep.currentExposure || {};
      const supply = exposure.supplySide || {};

      if (!chartId || chartId === "exposureSupplyComposition") {
        const compositionContainer = document.querySelector("#exposureSupplyComposition");
        if (compositionContainer) {
          renderInteractiveCategoryChart(compositionContainer, {
            chartId: "exposureSupplyComposition",
            rows: supply.byMarket || [],
            categoryKey: "marketDisplayName",
            series: [
              { key: "activeDebtCollateralInUsd", label: "Collateral in active-debt loans", color: colors.amber },
              { key: "zeroDebtCollateralInUsd", label: "Collateral in zero-debt loans", color: colors.blue },
              { key: "supplyNotRepresentedAsLoanCollateralInUsd", label: "Supply not represented as loan collateral", color: riskPalette[0] }
            ],
            mode: "stacked",
            allowXScaleToggle: true,
            sortKey: "supplyInUsd",
            valueFormatter: usdCompact
          });
        }
      }

      if (!chartId || chartId === "exposureSupplyConcentration") {
        const concentrationContainer = document.querySelector("#exposureSupplyConcentration");
        if (concentrationContainer) {
          const supplyConcentration = (supply.byMarket || []).map((row) => ({
            ...row,
            top1Share: row.top1RepresentedShare,
            next2Share: Math.max(0, Number(row.top3RepresentedShare || 0) - Number(row.top1RepresentedShare || 0)),
            next7Share: Math.max(0, Number(row.top10RepresentedShare || 0) - Number(row.top3RepresentedShare || 0)),
            remainingShare: Math.max(0, 1 - Number(row.top10RepresentedShare || 0))
          }));
          renderInteractiveCategoryChart(concentrationContainer, {
            chartId: "exposureSupplyConcentration",
            rows: supplyConcentration.filter((row) => row.representedObservedKeyCount > 0),
            categoryKey: "marketDisplayName",
            series: concentrationSeries("Represented supply share"),
            mode: "stacked",
            fixedXDomain: { min: 0, max: 1 },
            sortKey: "top1Share",
            valueFormatter: pct
          });
        }
      }
    }

    function healthFactorSeries(hasDetailedSafeBands) {
      const series = [
        { key: "debtBelow100InUsd", label: "HF < 1.0", color: "#991b1b" },
        { key: "debt100To110InUsd", label: "HF 1.00-1.10", color: "#c2410c" },
        { key: "debt110To125InUsd", label: "HF 1.10-1.25", color: riskPalette[3] },
        { key: "debt125To150InUsd", label: "HF 1.25-1.50", color: riskPalette[2] }
      ];
      if (hasDetailedSafeBands) {
        series.push(
          { key: "debt150To200InUsd", label: "HF 1.50-2.00", color: riskPalette[1] },
          { key: "debtAbove200InUsd", label: "HF > 2.00", color: riskPalette[0] }
        );
      } else series.push({ key: "debtAbove150InUsd", label: "HF > 1.50", color: riskPalette[0] });
      return series;
    }

    function concentrationSeries(noun) {
      return [
        { key: "top1Share", label: `Largest observed key · ${noun}`, color: riskPalette[4] },
        { key: "next2Share", label: `Next 2 observed keys · ${noun}`, color: riskPalette[3] },
        { key: "next7Share", label: `Next 7 observed keys · ${noun}`, color: riskPalette[2] },
        { key: "remainingShare", label: `Remaining observed keys · ${noun}`, color: riskPalette[0] }
      ];
    }

    function stressChartData() {
      const cache = chartBundleState();
      if (!cache.stress) cache.stress = buildMarketStressChartData(bundle.marketSeries || {}, { topN: allMarketSeriesCount() });
      return cache.stress;
    }

    function contributionChartData(name, field, options = {}) {
      const cache = chartBundleState();
      const { enriched = false, ...chartOptions } = options;
      const source = enriched
        ? Object.fromEntries(Object.keys(bundle.marketSeries || {}).map((marketId) => [marketId, enrichedMarketRows(marketId)]))
        : bundle.marketSeries || {};
      if (!cache.contributions.has(name)) cache.contributions.set(name, buildContributionChartData(source, field, { window: 30, topN: allMarketSeriesCount(), ...chartOptions }));
      return cache.contributions.get(name);
    }

    function allMarketSeriesCount() {
      return Object.keys(bundle.marketSeries || {}).length;
    }

    function marketDisplayLabel(marketId) {
      if (marketId === "Other") return "Other markets";
      const market = deep.marketSummaries.find((row) => String(row.marketId).toUpperCase() === String(marketId).toUpperCase());
      return market?.displayName || marketId;
    }

    function contributionSeries(rows) {
      return contributionKeysByLatest(rows).map((key, index) => ({
        key,
        label: marketDisplayLabel(key),
        color: key === "Other" ? colors.slate : chartPalette[index % chartPalette.length]
      }));
    }

    function drawImpactCharts(chartId = null, resetRange = false) {
      const timeIds = ["impactInterestContributions", "impactInterestRepaymentContributions", "impactGapContributions", "impactDebtContributions", "impactRepaymentContributions", "impactDebtGapContributions"];
      for (const id of chartId ? [chartId] : timeIds) drawImpactTimeChart(id, resetRange);
      if (chartId) return;
      drawImpactBreakdownCharts();
    }

    function drawImpactTimeChart(chartId, resetRange = false) {
      const container = document.querySelector(`#${chartId}`);
      if (!container) return;
      let rows = [];
      let series = [];
      let formatter = pct;
      const options = { chartId, period: chartPeriods[chartId], valueMode: "ratio", resetRange };
      if (chartId === "impactInterestContributions") {
        rows = contributionChartData("interest", "interestAccruedInUsd");
        series = contributionSeries(rows);
        options.stackMode = "percent";
      }
      if (chartId === "impactInterestRepaymentContributions") {
        rows = contributionChartData("interest-repayment", "interestRepaidInUsd");
        series = contributionSeries(rows);
        options.stackMode = "percent";
      }
      if (chartId === "impactGapContributions") {
        rows = contributionChartData("positive-gap", "interestGap30d", { window: 1, positiveOnly: true, enriched: true });
        series = contributionSeries(rows);
        options.stackMode = "percent";
      }
      if (chartId === "impactRepaymentContributions") {
        rows = contributionChartData("repayment", "debtRepaidInUsd");
        series = contributionSeries(rows);
        options.stackMode = "percent";
      }
      if (chartId === "impactDebtContributions") {
        rows = contributionChartData("debt", "borrowInUsd", { window: 1 });
        series = contributionSeries(rows);
        options.stackMode = "percent";
      }
      if (chartId === "impactDebtGapContributions") {
        const derivedSeries = Object.fromEntries(Object.keys(bundle.marketSeries || {}).map((marketId) => [marketId, enrichedMarketRows(marketId)]));
        const cache = chartBundleState();
        if (!cache.contributions.has("positive-debt-gap")) {
          cache.contributions.set("positive-debt-gap", buildContributionChartData(derivedSeries, "debtGap30d", { window: 1, topN: allMarketSeriesCount(), positiveOnly: true }));
        }
        rows = cache.contributions.get("positive-debt-gap");
        series = contributionSeries(rows);
        options.stackMode = "percent";
      }
      lineChart(container, rows, series, formatter, options);
    }

    function drawProtocolConcentrationCharts() {
      const borrowers = deep.currentExposure?.borrowerConcentration || {};
      const marketDependenceContainer = document.querySelector("#exposureMarketKeyDependence");
      if (marketDependenceContainer) {
        const marketDependenceRows = (borrowers.marketDependence || []).map((row) => ({
          ...row,
          marketCoverageLabel: `${row.marketDisplayName} · ${pct(row.loanRowCoverage)} · ${loanCoverageShortLabel(row)}`
        }));
        renderInteractiveCategoryChart(marketDependenceContainer, {
          chartId: "exposureMarketKeyDependence",
          rows: marketDependenceRows,
          categoryKey: "marketCoverageLabel",
          series: [
            { key: "largestKeyDebtShareOfMarketBorrow", label: "Largest observed key", color: riskPalette[4] },
            { key: "nextTwoKeysDebtShareOfMarketBorrow", label: "Next 2 observed keys", color: riskPalette[3] },
            { key: "otherMappedKeysDebtShareOfMarketBorrow", label: "Other mapped observed keys", color: riskPalette[0] },
            { key: "unmappedBorrowShare", label: "Unmapped borrow", color: colors.slate, hatch: true }
          ],
          mode: "stacked",
          fixedXDomain: { min: 0, max: 1 },
          sortKey: "largestKeyDebtShareOfMarketBorrow",
          valueFormatter: pct
        });
      }
      const borrowConcentrationRows = borrowers.marketCumulativeConcentration || [];
      renderInteractiveScatterChart(document.querySelector("#impactBorrowConcentrationComparison"), {
        chartId: "impactBorrowConcentrationComparison",
        rows: borrowConcentrationRows,
        seriesKey: "marketId",
        seriesLabelKey: "marketDisplayName",
        series: buildConcentrationComparisonSeries(borrowConcentrationRows, {
          shareKey: "cumulativeShareOfMarketBorrow"
        }),
        labelKey: "observedKeyLabel",
        xKey: "observedKeyRank",
        yKey: "cumulativeShareOfMarketBorrow",
        sizeKey: "keyDebtInUsd",
        xScale: "log1p",
        integerXTicks: true,
        xLabel: "Observed-key rank, largest to smallest",
        yLabel: "Cumulative share of official market borrow",
        sizeLabel: "Debt added at this rank",
        fixedYDomain: { min: 0, max: 1 },
        connectPoints: true,
        minimumPointRadius: 2.5,
        maximumPointRadius: 7,
        mutedSeriesColor: "#dceeff",
        seriesOrderNote: "Curves and chips run from mint (higher first-key share) through azure to violet (lower).",
        xFormatter: integer,
        yFormatter: pct,
        sizeFormatter: usdCompact
      });
      const supplyConcentrationRows = deep.currentExposure?.supplySide?.marketCumulativeConcentration || [];
      renderInteractiveScatterChart(document.querySelector("#impactCollateralizedSupplyConcentrationComparison"), {
        chartId: "impactCollateralizedSupplyConcentrationComparison",
        rows: supplyConcentrationRows,
        seriesKey: "marketId",
        seriesLabelKey: "marketDisplayName",
        series: buildConcentrationComparisonSeries(supplyConcentrationRows, {
          shareKey: "cumulativeShareOfRepresentedCollateralizedSupply"
        }),
        labelKey: "observedKeyLabel",
        xKey: "observedKeyRank",
        yKey: "cumulativeShareOfRepresentedCollateralizedSupply",
        sizeKey: "keyCollateralInUsd",
        xScale: "log1p",
        integerXTicks: true,
        xLabel: "Observed-key rank, largest to smallest",
        yLabel: "Cumulative share of represented collateralized supply",
        sizeLabel: "Collateral added at this rank",
        fixedYDomain: { min: 0, max: 1 },
        connectPoints: true,
        minimumPointRadius: 2.5,
        maximumPointRadius: 7,
        mutedSeriesColor: "#dceeff",
        seriesOrderNote: "Curves and chips run from mint (higher first-key share) through azure to violet (lower).",
        xFormatter: integer,
        yFormatter: pct,
        sizeFormatter: usdCompact
      });
    }

    function drawImpactBreakdownCharts() {
      const currentAnalysisByMarket = new Map((deep.marketStress?.currentMarketStress || []).map((row) => [String(row.marketId).toUpperCase(), row]));
      const stressRows = stressChartData().currentRows.map((row) => ({
        ...row,
        ...(currentAnalysisByMarket.get(String(row.marketId).toUpperCase()) || {})
      }));
      renderInteractiveMatrixChart(document.querySelector("#impactRiskRanking"), {
        chartId: "impactRiskRanking",
        rows: stressRows,
        rowKey: "marketId",
        columns: [
          { key: "utilizationStress", label: "Utilization pressure" },
          { key: "liquidityStress", label: "Liquidity pressure" },
          { key: "interestCoverageStress", label: "Weak interest coverage" },
          { key: "borrowGrowthStress", label: "Borrow growth" },
          { key: "loanHealthPressure", label: "Loan-health pressure" }
        ],
        matrixPalette: "risk",
        legendAlign: "left",
        legendPosition: "top",
        valueFormatter: pct
      });
      const cache = chartBundleState();
      if (!cache.currentContributions) {
        cache.currentContributions = buildCurrentContributionChartData(bundle.marketSeries || {}, { topN: allMarketSeriesCount() });
      }
      const currentContributionKeys = [...new Set(cache.currentContributions.flatMap((row) => Object.keys(row)))]
        .filter((key) => key !== "metric" && key !== "date")
        .sort((left, right) => Math.max(...cache.currentContributions.map((row) => Number(row[right]) || 0)) - Math.max(...cache.currentContributions.map((row) => Number(row[left]) || 0)) || left.localeCompare(right));
      renderInteractiveCategoryChart(document.querySelector("#impactCurrentContributions"), {
        chartId: "impactCurrentContributions",
        rows: cache.currentContributions,
        categoryKey: "metric",
        series: currentContributionKeys.map((key, index) => ({
          key,
          label: marketDisplayLabel(key),
          color: chartPalette[index % chartPalette.length]
        })),
        mode: "stacked",
        fixedXDomain: { min: 0, max: 1 },
        valueFormatter: pct
      });
      renderInteractiveScatterChart(document.querySelector("#impactMarketMap"), {
        chartId: "impactMarketMap",
        rows: deep.marketSummaries || [],
        labelKey: "marketId",
        xKey: "currentBorrowInUsd",
        yKey: "currentUtilization",
        sizeKey: "currentSupplyInUsd",
        colorKey: "interestCoverage90d",
        xScale: "log",
        xLabel: "Current borrow USD (log scale)",
        yLabel: "Current utilization",
        sizeLabel: "Current supply",
        colorLabel: "Interest coverage - 90d",
        colorPalette: riskPalette,
        colorPaletteDirection: "reverse",
        fixedYDomain: { min: 0, max: 1 },
        xFormatter: usdCompact,
        yFormatter: pct,
        sizeFormatter: usdCompact,
        colorFormatter: ratio
      });
      renderInteractiveCategoryChart(document.querySelector("#impactLoanState"), {
        chartId: "impactLoanState",
        rows: deep.loanState?.byMarket || [],
        categoryKey: "marketId",
        series: healthFactorSeries(false),
        mode: "stacked",
        sortKey: "debtInUsd",
        valueFormatter: usdCompact
      });
    }

    function requestDataFetch() {
      if (refreshInFlight || savingInFlight) return;
      if (hasData()) {
        void startOrRefresh();
        return;
      }
      const dialog = document.querySelector("#fullHistoryConfirmDialog");
      dialog.returnValue = "";
      dialog.showModal();
    }

    function handleFullHistoryDialogClose(event) {
      if (event.currentTarget.returnValue === "confirm") {
        void startOrRefresh();
      } else {
        setRefreshStatus("Full-history fetch cancelled. No API request was made.");
      }
    }

    async function startOrRefresh() {
      if (refreshInFlight) return;
      if (!dataLocation) {
        await startFullHistoryFetch();
        return;
      }
      try {
        dataLocation = await prepareDataLocationForUpdate(dataLocation);
      } catch (error) {
        if (error?.name === "AbortError") {
          setRefreshStatus("Update cancelled. No API request was made.");
        } else {
          setRefreshStatus(`Could not prepare the data archive. ${error.message}`, true);
        }
        return;
      }
      await refreshDataAndOutputs();
    }

    async function startFullHistoryFetch() {
      setRefreshStatus("Choose where Liqwid data should be kept...");
      try {
        dataLocation = await chooseNewDataLocation();
        dataStore = dataLocation.store;
        setRefreshStatus(dataLocation.kind === "directory"
          ? `Using ${dataLocation.name}. Starting the complete fetch...`
          : dataLocation.kind === "archive"
            ? `Using ${dataLocation.name}. Starting the complete fetch...`
            : "Direct file pickers are unavailable here. The complete data archive will download after the fetch.");
        await refreshDataAndOutputs();
      } catch (error) {
        if (error?.name === "AbortError") {
          setRefreshStatus("Full-history fetch cancelled. No API request was made.");
        } else {
          setRefreshStatus(`Could not prepare local data storage. ${error.message}`, true);
        }
      }
    }

    async function refreshDataAndOutputs() {
      if (refreshInFlight || !dataLocation) return;
      refreshInFlight = true;
      const button = document.querySelector("#fetchNewDataButton");
      const startButton = document.querySelector("#fetchFullHistoryButton");
      const status = document.querySelector("#refreshStatus");
      setDataActionsDisabled(true);
      button.textContent = "Fetching data...";
      if (startButton) {
        startButton.disabled = true;
        startButton.textContent = "Fetching full history...";
      }
      status.hidden = false;
      status.classList.remove("error");
      const workingStore = dataStore.clone();
      workingStore.name = dataLocation.name;
      let lastRefreshStep = "refreshing the public market list";
      try {
        const refreshed = await refreshCompleteDataset({
          store: workingStore,
          mode: "update",
          startDate: DEFAULT_HISTORY_START_DATE,
          endDate: todayDateKey(),
          dataRootLabel: dataLocation.name,
          onProgress(progress) {
            const formatted = formatRefreshProgress(progress);
            lastRefreshStep = formatted.step;
            status.textContent = formatted.text;
          }
        });
        status.textContent = dataLocation.kind === "directory"
          ? "Complete refresh succeeded. Writing raw, clean, and computed data to the selected folder..."
          : "Complete refresh succeeded. Writing the portable data archive...";
        dataLocation = await commitDataLocation(workingStore, dataLocation, { rollbackStore: dataStore });
        dataStore = workingStore;
        applyCompleteAnalysis(refreshed.bundle, refreshed.analysis);
        await rememberCurrentDataLocation();
        const latestDate = refreshed.bundle.protocolSeries.at(-1)?.date || "the latest returned day";
        status.textContent = dataLocation.kind === "directory"
          ? `All data and analysis are current through ${latestDate}. ${dataLocation.name} contains the complete raw, clean, and computed generation.`
          : dataLocation.kind === "archive"
            ? `All data and analysis are current through ${latestDate} and saved in ${dataLocation.name}.`
            : `All data and analysis are current through ${latestDate}. The updated ${dataLocation.name} archive was downloaded.`;
      } catch (error) {
        status.classList.add("error");
        status.textContent = refreshErrorMessage(error, lastRefreshStep);
      } finally {
        refreshInFlight = false;
        setDataActionsDisabled(false);
        updateDataActionLabels();
        const currentStartButton = document.querySelector("#fetchFullHistoryButton");
        if (currentStartButton) {
          currentStartButton.disabled = false;
          currentStartButton.textContent = "Fetch full data history";
        }
      }
    }

    async function openExistingData() {
      if (refreshInFlight || savingInFlight) return;
      setRefreshStatus("Choose a Liqwid data archive...");
      try {
        const openedLocation = await chooseExistingDataLocation();
        if (!openedLocation) {
          document.querySelector("#dataArchiveFileInput").click();
          return;
        }
        await loadDataLocation(openedLocation);
      } catch (error) {
        if (error?.name === "AbortError") {
          setRefreshStatus("Open cancelled. Your current data is unchanged.");
        } else {
          setRefreshStatus(`Could not open that Liqwid data archive. ${error.message}`, true);
        }
      }
    }

    async function openSelectedDataArchive(event) {
      const input = event.currentTarget;
      const file = input.files?.[0];
      if (!file || refreshInFlight) return;
      setRefreshStatus(`Opening ${file.name}...`);
      try {
        const openedLocation = await openDataArchive(file);
        await loadDataLocation(openedLocation);
      } catch (error) {
        setRefreshStatus(`Could not open that Liqwid data archive. ${error.message}`, true);
      } finally {
        input.value = "";
      }
    }

    async function loadDataLocation(openedLocation) {
      const openedBundle = await buildAnalysisBundleFromStore(openedLocation.store, { dataRootLabel: openedLocation.name });
      const openedAnalysis = await buildCompleteAnalysisFromStore(openedLocation.store, openedBundle);
      dataLocation = openedLocation;
      dataStore = openedLocation.store;
      applyCompleteAnalysis(openedBundle, openedAnalysis);
      await rememberCurrentDataLocation();
      setRefreshStatus(`Loaded ${openedLocation.name} through ${openedBundle.protocolSeries.at(-1)?.date || "an unknown date"}. Fetch new data will request only missing history and current snapshots.`);
    }

    async function restoreLastDataOnStartup(requestPermission = false) {
      if (refreshInFlight || savingInFlight || hasData()) return;
      if (requestPermission) setRefreshStatus(`Reopening ${rememberedDataLocation?.name || "the last data location"}...`);
      try {
        const result = await restoreRememberedDataLocation({ requestPermission });
        if (result.status === "opened") {
          await loadDataLocation(result.location);
          return;
        }
        if (result.status === "permission-required") {
          rememberedDataLocation = result;
          setRefreshStatus(`${result.name} was used last time. Reopen it to restore browser access; no data will be fetched.`);
          renderAll();
        }
      } catch (error) {
        await rememberDataLocation(null);
        rememberedDataLocation = null;
        setRefreshStatus(`The last data location could not be reopened. ${error.message}`, true);
        renderAll();
      }
    }

    async function rememberCurrentDataLocation() {
      const remembered = await rememberDataLocation(dataLocation);
      rememberedDataLocation = remembered
        ? { name: dataLocation.name, kind: dataLocation.kind }
        : null;
    }

    async function saveCurrentData() {
      if (!hasData() || refreshInFlight || savingInFlight) return;
      savingInFlight = true;
      setDataActionsDisabled(true);
      setRefreshStatus(`Saving ${dataLocation?.name || "Liqwid data"}...`);
      try {
        dataLocation = await prepareDataLocationForUpdate(dataLocation);
        dataLocation = await commitDataLocation(dataStore, dataLocation, { rollbackStore: dataStore });
        await rememberCurrentDataLocation();
        setRefreshStatus(dataLocation.kind === "download"
          ? `Downloaded ${dataLocation.name}.`
          : `Saved ${dataLocation.name}.`);
      } catch (error) {
        if (error?.name === "AbortError") {
          setRefreshStatus("Save cancelled. Your current data is unchanged.");
        } else {
          setRefreshStatus(`Could not save the data. ${error.message}`, true);
        }
      } finally {
        savingInFlight = false;
        setDataActionsDisabled(false);
        updateDataActionLabels();
      }
    }

    function applyCompleteAnalysis(nextBundle, nextAnalysis) {
      bundle = nextBundle;
      deep = nextAnalysis;
      chartCache = null;
      const allMarkets = deep.marketSummaries || [];
      const coreMarkets = allMarkets.filter((market) => !market.group && !market.isIsolated);
      const isolatedMarkets = allMarkets.filter((market) => market.group || market.isIsolated);
      const activeList = marketCategory === "isolated" ? isolatedMarkets : coreMarkets;
      if (!activeList.some((m) => m.marketId === selectedMarket)) {
        selectedMarket = activeList.find((m) => m.currentBorrowInUsd > 0)?.marketId || activeList[0]?.marketId || allMarkets[0]?.marketId;
      }
      updateHeader();
      if (document.querySelector("#dataStatusDialog").open) renderDataStatusDialog();
      renderTabs();
      renderAll();
    }

    function updateHeader() {
      const dataLoaded = hasData();
      if (!hasData()) {
        document.querySelector("#subtitle").textContent = "No data loaded - open an archive or fetch full history";
      } else {
        const latest = deep.protocolSummary?.lastDate || bundle.protocolSeries?.at(-1)?.date || "n/a";
        document.querySelector("#subtitle").textContent = `Data through ${latest}`;
      }
      for (const id of ["openAnotherDataButton", "saveDataButton", "fetchNewDataButton"]) {
        document.querySelector(`#${id}`).hidden = !dataLoaded;
      }
      const dataStatusButton = document.querySelector("#dataStatusButton");
      const dataStatusSummary = document.querySelector("#dataStatusButtonSummary");
      dataStatusButton.hidden = !dataLoaded;
      if (dataLoaded && deep?.dataStatus?.headline) {
        const headline = deep.dataStatus.headline;
        dataStatusButton.classList.toggle("attention", headline.state === "attention");
        dataStatusButton.classList.toggle("limited", headline.state === "limited");
        dataStatusSummary.textContent = headline.failedChecks
          ? `${integer(headline.failedChecks)} failed`
          : headline.partialChecks
            ? `${integer(headline.partialChecks)} partial`
            : headline.unavailableChecks
              ? `${integer(headline.unavailableChecks)} unavailable`
              : `${integer(headline.passedChecks)} passed`;
        dataStatusButton.setAttribute("aria-label", `Data status. ${headline.label}. ${dataStatusSummary.textContent}.`);
      } else {
        dataStatusButton.classList.remove("attention", "limited");
        dataStatusSummary.textContent = "";
        dataStatusButton.removeAttribute("aria-label");
      }
      updateDataActionLabels();
    }

    function updateDataActionLabels() {
      if (refreshInFlight || savingInFlight) return;
      document.querySelector("#openAnotherDataButton").textContent = "Open another data archive";
      document.querySelector("#saveDataButton").textContent = "Save data";
      document.querySelector("#fetchNewDataButton").textContent = "Fetch new data";
    }

    function setDataActionsDisabled(disabled) {
      for (const id of ["openAnotherDataButton", "saveDataButton", "fetchNewDataButton"]) {
        document.querySelector(`#${id}`).disabled = disabled;
      }
    }

    function setRefreshStatus(message, isError = false) {
      const status = document.querySelector("#refreshStatus");
      status.hidden = !message;
      status.classList.toggle("error", isError);
      status.textContent = message || "";
    }

    function refreshErrorMessage(error, step) {
      const detail = error?.message || String(error);
      const context = step ? ` Failure occurred while ${step}.` : "";
      return `Complete refresh failed; nothing was committed and the last good charts remain visible.${context} ${detail}`;
    }

    function lineChart(container, rows, series, yFormat, options = {}) {
      renderInteractiveTimeSeriesChart(container, {
        chartId: options.chartId || container.id,
        rows,
        series: series.map((entry) => Array.isArray(entry)
          ? { key: entry[0], label: entry[1], color: entry[2] }
          : entry),
        period: options.period || "year",
        valueMode: options.valueMode || "stock",
        stackMode: options.stackMode,
        calendarPeriod: options.calendarPeriod,
        fixedYDomain: options.fixedYDomain,
        referenceLines: options.referenceLines,
        valueFormatter: yFormat,
        resetRange: options.resetRange,
        onRangeChange(detail) {
          const controls = container.closest(".panel")?.querySelectorAll("[data-chart-timeframe]") || [];
          controls.forEach((button) => {
            const active = !detail.custom && button.dataset.chartTimeframe === detail.period;
            button.classList.toggle("active", active);
            button.setAttribute("aria-pressed", String(active));
          });
        }
      });
    }

    function protocolStory() {
      const p = deep.protocolSummary;
      return `The protocol currently has ${usd(p.currentBorrowInUsd)} borrowed against ${usd(p.currentSupplyInUsd)} supplied. Utilization is ${pct(p.currentUtilization)}. The main current story is ${deep.marketStress?.narrative || "market stress is distributed across the active borrow markets."}`;
    }
    function marketStory(m) {
      return `${m.marketId} has ${usd(m.currentBorrowInUsd)} borrowed and ${pct(m.currentUtilization)} utilization. Interest coverage over 90 days is ${ratio(m.interestCoverage90d)}, so ${Number(m.interestCoverage90d) < 1 ? "interest payments are trailing accrual" : "interest payments are broadly keeping pace with accrual"}.`;
    }
    function loanCoverageState(row) {
      if (!row) return "unavailable";
      if (["undercoverage", "reconciled", "overcoverage"].includes(row.loanRowCoverageState)) return row.loanRowCoverageState;
      const loanRowDebt = displayNumber(row.loanRowDebtInUsd);
      const marketBorrow = displayNumber(row.marketBorrowInUsd);
      if (loanRowDebt === null || marketBorrow === null || marketBorrow <= 0) return "unavailable";
      return loanRowDebt < marketBorrow ? "undercoverage" : loanRowDebt > marketBorrow ? "overcoverage" : "reconciled";
    }
    function loanCoverageShortLabel(row) {
      const state = loanCoverageState(row);
      if (state === "undercoverage") return "undercoverage";
      if (state === "overcoverage") return "overcoverage";
      if (state === "reconciled") return "reconciled";
      return "unavailable";
    }
    function loanCoverageExplanation(row) {
      const state = loanCoverageState(row);
      if (state === "undercoverage") return "Undercoverage: returned loan-row debt is below batched market borrow. Differences can stem from 4-hour batch cycle timing lag or unmapped positions omitted by the API.";
      if (state === "overcoverage") return "Overcoverage: returned loan-row debt exceeds batched market borrow. Differences can stem from 4-hour batch cycle state lag (real-time loans vs 4-hour batched market state) or API snapshot timing.";
      if (state === "reconciled") return "Reconciled: returned loan-row debt matches official market borrow within tolerance.";
      return "Loan-row reconciliation is unavailable.";
    }
    function loanCoverageNotice(rows) {
      const coverage = summarizeLoanRowCoverageNotices(rows);
      const notices = [];
      if (coverage.undercoverage.affectedCount) {
        const affected = coverage.undercoverage;
        const marketNames = affected.affectedMarkets.slice(0, 3).join(", ");
        const remaining = affected.affectedCount > 3 ? ` and ${affected.affectedCount - 3} more` : "";
        notices.push(`<aside class="loan-coverage-notice loan-coverage-notice--undercoverage" role="note"><span class="loan-coverage-notice-badge">Undercoverage</span><div><strong>Loan rows fall below market aggregate${affected.affectedCount === 1 ? "" : "s"}</strong><p>${esc(marketNames)}${esc(remaining)}: returned loan-row debt is ${esc(usd(affected.totalDifferenceInUsd))} below official market borrow and beyond the accepted 99.5% coverage boundary. Returned loan sums may differ due to timing relative to the 4-hour market batch cycle update, or the official loan API may be missing some positions (unmapped data not delivered by the API). Treat observed-key concentration as incomplete.</p></div></aside>`);
      }
      if (coverage.overcoverage.affectedCount) {
        const affected = coverage.overcoverage;
        const marketNames = affected.affectedMarkets.slice(0, 3).join(", ");
        const remaining = affected.affectedCount > 3 ? ` and ${affected.affectedCount - 3} more` : "";
        notices.push(`<aside class="loan-coverage-notice loan-coverage-notice--overcoverage" role="note"><span class="loan-coverage-notice-badge">Overcoverage</span><div><strong>Loan details exceed market aggregate${affected.affectedCount === 1 ? "" : "s"}</strong><p>${esc(marketNames)}${esc(remaining)}: returned loan-row debt is ${esc(usd(affected.totalDifferenceInUsd))} above official market borrow and beyond the accepted 100.5% coverage boundary. The official loan-detail and market-aggregate API surfaces may not have refreshed to the same snapshot due to the 4-hour market batch cycle state lag (where live loans compound interest in real time while global market aggregates update on a 4-hour batch cycle schedule) or snapshot timing differences. This is a reconciliation mismatch, not extra mapped borrowing.</p></div></aside>`);
      }
      return notices.length ? `<div class="loan-coverage-notices">${notices.join("")}</div>` : "";
    }
    function loanCoverageTableRows(rows) {
      return (Array.isArray(rows) ? rows : []).map((row) => ({
        ...row,
        loanRowReconciliation: loanCoverageShortLabel(row)
      }));
    }
    function debtFlowReconciliationHelp(reconciliation, scope = "protocol") {
      return `The official API exposes reported debt repayment but no direct debt-accrued flow. For each market-day after the first, Inferred Formation = max(0, Borrow Change + Reported Repayment) and Unclassified Reduction = max(0, -(Borrow Change + Reported Repayment)); therefore Borrow Change = Inferred Formation - Reported Repayment - Unclassified Reduction. The official API does not identify the cause of an unclassified reduction, so the app does not label it as liquidation, repayment, migration, or settlement. ${gapValuationHelp(scope)} Current borrow is the remaining principal measure. The first observation is unavailable because it has no prior balance. Liquidation profit is protocol revenue, not liquidated principal.`;
    }
    function interestFlowHelp(scope = "market") {
      return `Interest accrued and repaid are direct official flows. Their reported flow difference is calculated in native asset units before valuation. ${gapValuationHelp(scope)} The official API does not expose a current interest receivable or a current principal-versus-interest balance split, so the cumulative difference must not be read as interest still owed.`;
    }
    function gapValuationHelp(scope = "market") {
      return scope === "protocol"
        ? "Reported flow differences are calculated in each market's asset units before USD valuation. Each market's daily, rolling, or cumulative native difference is valued at that observation's implied price, then the USD market values are summed; unlike asset units are never added. A current-valued USD line can move solely because the asset price changes, even when the native cumulative difference is unchanged."
        : "Accrued and repaid quantities are netted in this market's asset units first. The USD view values the resulting daily, rolling, or cumulative native difference at each observation's implied asset price. A current-valued USD line can move solely because the asset price changes, even when the native cumulative difference is unchanged.";
    }
    function currentValuedGapKpi(label, valueInUsd, nativeValue, priceInUsd, symbol) {
      const asset = symbol || "asset";
      const note = `Native gap: ${assetAmount(nativeValue, asset)} · Price used: ${usdPrice(priceInUsd)} per ${asset}`;
      return kpi(label, usd(valueInUsd), note);
    }
    function coverageValuationHelp(scope = "market") {
      return scope === "protocol"
        ? "Coverage is calculated per market from native accrued and repaid quantities. Each market's two window totals are valued at that market's current observed price, then the USD operands are summed before the protocol ratio is formed; unlike asset units are never added."
        : "Coverage divides native repaid by native accrued quantities. The asset-unit view is primary. The secondary USD view values both window totals at the same current observed asset price, so price movement between accrual and repayment cannot change coverage.";
    }
        
    function renderInfoBubble(title, explanation, formula = "", range = "", note = "") {
      if (!explanation && !formula && !range && !note) return "";
      return `<span class="app-info-wrapper">
        <button type="button" class="app-info-btn" aria-label="Explanation for ${esc(title)}" data-app-info-trigger>?</button>
        <span class="app-info-popover" role="dialog" aria-modal="false">
          <span class="app-info-popover-header">
            <strong class="app-info-popover-title">${esc(title)}</strong>
            <button type="button" class="app-info-popover-close" aria-label="Close explanation">&times;</button>
          </span>
          <span style="display:block;margin:0 0 8px;color:#dceeff;font-size:.82rem;line-height:1.45">${esc(explanation)}</span>
          ${formula ? `<span style="display:block;margin:8px 0 4px;font-size:.74rem;font-weight:700;text-transform:uppercase;letter-spacing:.05em;color:#8fa9bf">Formula / Calculation</span>${formula}` : ""}
          ${range ? `<span style="display:block;margin-top:8px;padding-top:6px;border-top:1px dashed rgba(36,72,102,.6);font-size:.76rem;color:#3edc81">${esc(range)}</span>` : ""}
          ${note ? `<span style="display:block;margin-top:8px;padding-top:6px;border-top:1px dashed rgba(36,72,102,.6);font-size:.76rem;line-height:1.4;color:#8fa9bf">${esc(note)}</span>` : ""}
        </span>
      </span>`;
    }

    function kpi(label, value, note = "", help = "") {
      const normKey = String(label || "").replace(/[—–·]/g, "-").replace(/\s+/g, " ").trim();
      const meta = APP_KPI_METADATA[label] || APP_KPI_METADATA[normKey] || {};
      const helpText = help || meta.explanation || meta.description || "";
      const formula = meta.formulaHtml || meta.formulaText || "";
      const range = meta.range || "";
      const popoverNote = meta.note || "";
      const infoBubble = renderInfoBubble(label, helpText, formula, range, popoverNote);
      return `<div class="kpi"><span class="kpi-label"><span>${esc(label)}</span>${infoBubble}</span><strong>${esc(value)}</strong>${note ? `<span class="kpi-note">${esc(note)}</span>` : ""}</div>`;
    }

    function interactiveChartPanel(title, chartId, options = {}) {
      if (!chartPeriods[chartId]) chartPeriods[chartId] = options.defaultPeriod || "year";
      const infoBubble = options.help ? renderInfoBubble(title, options.help) : "";
      return `<div class="panel">
        <div class="chart-heading">
          <div class="chart-heading-copy">
            <h2><span>${esc(title)}</span>${infoBubble}</h2>
            ${chartQuestion(chartId)}
          </div>
          ${options.timeframe === false ? "" : chartTimeframeControls(chartId, title)}
        </div>
        <div id="${esc(chartId)}" class="chart"></div>
      </div>`;
    }

    function interactiveBreakdownPanel(title, chartId, options = {}) {
      const infoBubble = options.help ? renderInfoBubble(title, options.help) : "";
      return `<div class="panel">
        <div class="chart-heading">
          <div class="chart-heading-copy">
            <h2><span>${esc(title)}</span>${infoBubble}</h2>
            ${chartQuestion(chartId)}
          </div>
        </div>
        <div id="${esc(chartId)}" class="breakdown-chart"></div>
      </div>`;
    }

    function setupAppInfoPopovers() {
      document.addEventListener("click", (event) => {
        const closeBtn = event.target.closest(".app-info-popover-close");
        if (closeBtn) {
          const popover = closeBtn.closest(".app-info-popover");
          if (popover) popover.classList.remove("pinned");
          return;
        }
        const infoBtn = event.target.closest(".app-info-btn");
        if (infoBtn) {
          const popover = infoBtn.closest(".app-info-wrapper")?.querySelector(".app-info-popover");
          if (popover) {
            popover.classList.toggle("pinned");
          }
          return;
        }
        document.querySelectorAll(".app-info-popover.pinned").forEach((p) => {
          if (!p.contains(event.target)) p.classList.remove("pinned");
        });
      });
      document.addEventListener("keydown", (event) => {
        if (event.key === "Escape") {
          document.querySelectorAll(".app-info-popover.pinned").forEach((p) => p.classList.remove("pinned"));
        }
      });
    }

    function activeDebtPositionCount(value) {
      const count = Math.max(0, Number(value) || 0);
      return `${integer(count)} active-debt position${count === 1 ? "" : "s"}`;
    }
    function periodLabel(fromDate, toDate) {
      const from = fromDate ? String(fromDate).slice(0, 10) : "";
      const to = toDate ? String(toDate).slice(0, 10) : "";
      return from && to ? `${from} — ${to}` : "Period unavailable";
    }
    function coverageCell(row, ratioKey, family, symbol = "") {
      const value = row?.[ratioKey];
      const accrued = row?.[`${family}Accrued`];
      const repaid = row?.[`${family}Repaid`];
      const accruedInUsd = row?.[`${family}AccruedInUsd`];
      const repaidInUsd = row?.[`${family}RepaidInUsd`];
      const hasNativeOperands = Boolean(symbol) && displayNumber(accrued) !== null && displayNumber(repaid) !== null;
      const primary = hasNativeOperands
        ? `${assetAmount(repaid, symbol)} repaid / ${assetAmount(accrued, symbol)} accrued`
        : `${usd(repaidInUsd)} repaid / ${usd(accruedInUsd)} accrued`;
      const secondary = hasNativeOperands
        ? `current USD: ${usd(repaidInUsd)} repaid / ${usd(accruedInUsd)} accrued at ${usd(row?.assetPriceInUsd)} per ${symbol}`
        : "Current-valued USD sums across markets";
      return `<div class="coverage-cell ${coverageTone(value)}" role="cell"><span class="coverage-operands--primary">${esc(primary)}</span><strong>${esc(ratio(value))}</strong><span class="coverage-operands--secondary">${esc(secondary)}</span><span>${integer(row?.observedDays)} observed days</span></div>`;
    }
    function coverageTone(value) {
      const numeric = Number(value);
      if (!Number.isFinite(numeric)) return "unavailable";
      if (numeric >= 1.20) return "safe";
      if (numeric >= 1.00) return "buffer";
      if (numeric >= 0.80) return "watch";
      if (numeric >= 0.50) return "near";
      return "critical";
    }
    function observedKeyRowsAtThreshold(exposure, threshold) {
      return (exposure.rows || []).map((row) => {
        const selected = (row.thresholdRows || []).find((item) => Number(item.threshold) === Number(threshold)) || {};
        return { ...row, lowHfDebtInUsd: selected.lowHfDebtInUsd, lowHfShareOfKeyDebt: selected.lowHfShareOfKeyDebt };
      });
    }
    function parameterGroup(title, description, entries) {
      return `<article class="parameter-group">
        <h3>${esc(title)}</h3>
        <p>${esc(description)}</p>
        <dl class="parameter-list">${entries.map(([entryLabel, value]) => `<dt>${esc(entryLabel)}</dt><dd>${esc(value)}</dd>`).join("")}</dl>
      </article>`;
    }
    function parameterAllocationGroup(allocation) {
      const entries = [
        ["Suppliers", allocation.suppliers],
        ["Dividends", allocation.dividends],
        ["Treasury", allocation.treasury],
        ["Reserve remainder", allocation.reserve]
      ];
      return `<article class="parameter-group">
        <h3>Borrower-interest allocation</h3>
        <p>Each share is its official component ratio divided by the total income ratio.</p>
        <div class="parameter-allocation-bar" role="img" aria-label="${esc(entries.map(([entryLabel, value]) => `${entryLabel} ${pct(value)}`).join(", "))}">${entries.map(([, value]) => `<span style="width:${parameterAllocationWidth(value)}%"></span>`).join("")}</div>
        <dl class="parameter-list">${entries.map(([entryLabel, value]) => `<dt>${esc(entryLabel)}</dt><dd>${esc(pct(value))}</dd>`).join("")}</dl>
      </article>`;
    }
    function parameterAllocationWidth(value) {
      const numeric = displayNumber(value);
      return numeric == null ? 0 : Math.max(0, Math.min(100, numeric * 100));
    }
    function parameterScalar(value) {
      const numeric = displayNumber(value);
      if (numeric === null) return "n/a";
      const absolute = Math.abs(numeric);
      if (absolute > 0 && absolute < 0.0001) return numeric.toExponential(6);
      return new Intl.NumberFormat("en-US", { maximumSignificantDigits: 9, useGrouping: false }).format(numeric);
    }
    function formatParameterTimestamp(value) {
      const milliseconds = Date.parse(String(value || ""));
      if (!Number.isFinite(milliseconds)) return "Timestamp unavailable";
      return new Date(milliseconds).toISOString().replace("T", " ").replace(".000Z", " UTC");
    }
    function protocolParameterCurrentTable(rows) {
      return protocolFormattedTable(rows, [
        { key: "marketName", label: "Market" },
        { key: "borrowInUsd", label: "Current borrow", format: usd },
        { key: "currentUtilization", label: "Utilization", format: pct },
        { key: "kink", label: "Optimal kink", format: pct },
        { key: "utilizationCap", label: "Utilization cap", format: pct },
        { key: "baseBorrowerAPR", label: "Base borrower APR", format: pct },
        { key: "optimalBorrowerAPR", label: "Optimal borrower APR", format: pct },
        { key: "maxBorrowerAPR", label: "Maximum borrower APR", format: pct },
        { key: "supplyCap", label: "Supply cap", format: (value, row) => value == null ? "No cap reported" : assetAmount(value, row.symbol) },
        { key: "supplyCapHeadroomInUsd", label: "Supply-cap headroom", format: usd },
        { key: "supplierSplit", label: "Supplier split", format: pct },
        { key: "dividendSplit", label: "Dividend / staker split", format: pct },
        { key: "treasurySplit", label: "Treasury split", format: pct },
        { key: "reserveSplit", label: "Reserve remainder", format: pct },
        { key: "minHealthFactor", label: "Minimum health factor", format: ratio },
        { key: "closeFactor", label: "Close factor", format: pct },
        { key: "maxCollateralCount", label: "Maximum collateral count", format: integer },
        { key: "loanOriginationFee", label: "Loan origination fee", format: pct }
      ]);
    }
    function protocolCollateralTable(rows) {
      return protocolFormattedTable(rows, [
        { key: "borrowMarketName", label: "Borrowed market" },
        { key: "collateralName", label: "Eligible collateral" },
        { key: "maxLoanToValue", label: "Maximum LTV", format: pct },
        { key: "weightedMaxLoanToValue", label: "Weighted maximum LTV", format: pct },
        { key: "liquidationThreshold", label: "Liquidation threshold", format: pct },
        { key: "weightedLiquidationThreshold", label: "Weighted liquidation threshold", format: pct },
        { key: "liquidationPenalty", label: "Liquidation penalty", format: pct },
        { key: "liquidationProfitability", label: "Liquidation profitability", format: pct },
        { key: "collateralWeight", label: "Collateral weight", format: pct }
      ]);
    }
    function protocolGovernanceTable(rows) {
      return protocolFormattedTable(rows, [
        { key: "timestamp", label: "Effective at (UTC)", format: (value) => esc(String(value || "n/a")) },
        { key: "marketName", label: "Market" },
        {
          key: "changedFields",
          label: "Identifiable changed fields",
          format: (value, row) => row.initialObservableEvent
            ? "Initial observable event"
            : esc((Array.isArray(value) && value.length ? value.map(parameterHistoryLabel).join(", ") : "No value difference identified"))
        },
        { key: "changedFieldCount", label: "Changed-field count", format: (value) => value == null ? "n/a" : integer(value) },
        { key: "txHash", label: "Transaction hash", format: (value) => `<code title="${esc(value || "")}">${esc(value || "n/a")}</code>` }
      ]);
    }
    function protocolFormattedTable(rows, columns) {
      if (!rows.length) return "<p>No rows.</p>";
      return `<div class="table-scroll"><table class="parameter-history-table"><thead><tr>${columns.map((column) => `<th>${esc(column.label)}</th>`).join("")}</tr></thead><tbody>${rows.map((row) => `<tr>${columns.map((column) => {
        const value = row?.[column.key];
        const formatted = column.format ? column.format(value, row) : esc(value ?? "n/a");
        return `<td>${formatted}</td>`;
      }).join("")}</tr>`).join("")}</tbody></table></div>`;
    }
    function parameterHistoryTable(rows, symbol) {
      if (!rows.length) return "<p>No rows.</p>";
      const keys = [
        "timestamp", "txHash",
        "baseBorrowerAPR", "optimalBorrowerAPR", "maxBorrowerAPR",
        "baseSupplierAPY", "optimalSupplierAPY", "maxSupplierAPY",
        "kink", "borrowCap", "supplyCap",
        "incomeRatioSum", "incomeRatioSuppliers", "incomeRatioDividends", "incomeRatioTreasury",
        "baseRate", "utilMultiplier", "utilMultiplierJump"
      ];
      return `<div class="table-scroll"><table class="parameter-history-table"><thead><tr>${keys.map((key) => `<th>${esc(parameterHistoryLabel(key))}</th>`).join("")}</tr></thead><tbody>${rows.map((row) => `<tr>${keys.map((key) => `<td>${parameterHistoryValue(key, row[key], symbol)}</td>`).join("")}</tr>`).join("")}</tbody></table></div>`;
    }
    function parameterHistoryLabel(key) {
      const labels = {
        timestamp: "Effective at (UTC)",
        txHash: "Transaction hash",
        borrowCap: "Utilization cap",
        kink: "Optimal utilization (kink)",
        utilMultiplier: "Utilization multiplier",
        utilMultiplierJump: "Post-kink multiplier"
      };
      return labels[key] || label(key);
    }
    function parameterHistoryValue(key, value, symbol) {
      if (key === "timestamp") return esc(String(value || ""));
      if (key === "txHash") return `<code title="${esc(value || "")}">${esc(value || "n/a")}</code>`;
      if (key === "supplyCap") return value == null ? "No cap reported" : `<span title="${esc(String(value))}">${esc(assetAmount(value, symbol))}</span>`;
      if (key === "borrowCap") return value == null ? "No cap reported (100% effective)" : `<span title="${esc(String(value))}">${esc(pct(value))}</span>`;
      if (/APR$|APY$/.test(key) || key === "kink") return `<span title="${esc(String(value))}">${esc(pct(value))}</span>`;
      return `<span title="${esc(String(value ?? ""))}">${esc(parameterScalar(value))}</span>`;
    }
    function table(rows, keys) {
      if (!rows.length) return "<p>No rows.</p>";
      return `<table><thead><tr>${keys.map((key) => `<th>${esc(label(key))}</th>`).join("")}</tr></thead><tbody>${rows.map((row) => `<tr>${keys.map((key) => `<td>${fmt(key, row[key])}</td>`).join("")}</tr>`).join("")}</tbody></table>`;
    }
    function scrollTable(rows, keys) { return rows.length ? `<div class="table-scroll">${table(rows, keys)}</div>` : table(rows, keys); }
    function label(key) { return key.replace(/([A-Z])/g, " $1").replace(/^./, (c) => c.toUpperCase()).replace("Usd", "USD"); }
    function fmt(key, value) {
      if (/Share|Score|Pressure|Utilization|Coverage|Apy|Apr/.test(key)) return pct(value);
      if (/InUsd|Borrow|Debt|Collateral/.test(key)) return usd(value);
      if (/Hhi/i.test(key)) return number(value, 3);
      if (/effective/i.test(key)) return number(value, 1);
      if (/RatePerYear/.test(key)) return number(value, 2);
      if (/HealthFactor|health/i.test(key)) return ratio(value);
      if (typeof value === "number") return integer(value);
      return esc(value ?? "n/a");
    }
    function usd(value) {
      const numeric = displayNumber(value);
      if (numeric === null) return "n/a";
      return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", notation: Math.abs(numeric) >= 1000000 ? "compact" : "standard", maximumFractionDigits: Math.abs(numeric) >= 1000 ? 1 : 2 }).format(numeric);
    }
    function usdDetailed(value) {
      const numeric = displayNumber(value);
      if (numeric === null) return "n/a";
      const largeValue = Math.abs(numeric) >= 1000000;
      return new Intl.NumberFormat("en-US", largeValue
        ? { style: "currency", currency: "USD", notation: "compact", maximumSignificantDigits: 4 }
        : { style: "currency", currency: "USD", notation: "standard", maximumFractionDigits: Math.abs(numeric) >= 1000 ? 1 : 2 }
      ).format(numeric);
    }
    function usdPrice(value) {
      const numeric = displayNumber(value);
      if (numeric === null) return "n/a";
      return new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: "USD",
        maximumSignificantDigits: 7
      }).format(numeric);
    }
    function usdCompact(value) { return usd(value); }
    function assetAmount(value, symbol = "") {
      const numeric = displayNumber(value);
      if (numeric === null) return "n/a";
      const formatted = new Intl.NumberFormat("en-US", {
        notation: Math.abs(numeric) >= 1000000 ? "compact" : "standard",
        maximumSignificantDigits: 5,
        maximumFractionDigits: Math.abs(numeric) >= 1000 ? 1 : 6
      }).format(numeric);
      return `${formatted}${symbol ? ` ${symbol}` : ""}`;
    }
    function pct(value, decimals = 2) { const numeric = displayNumber(value); const d = typeof decimals === "number" && !Number.isNaN(decimals) ? decimals : 2; return numeric === null ? "n/a" : `${(numeric * 100).toFixed(d)}%`; }
    function signedPct(value, decimals = 2) { const numeric = displayNumber(value); const d = typeof decimals === "number" && !Number.isNaN(decimals) ? decimals : 2; return numeric === null ? "n/a" : `${numeric > 0 ? "+" : ""}${(numeric * 100).toFixed(d)} pp`; }
    function ratio(value) { const numeric = displayNumber(value); return numeric === null ? "n/a" : `${numeric.toFixed(2)}x`; }
    function integer(value) { const numeric = displayNumber(value); return numeric === null ? "n/a" : new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(numeric); }
    function number(value, decimals = 2) { const numeric = displayNumber(value); const d = typeof decimals === "number" && !Number.isNaN(decimals) ? decimals : 2; return numeric === null ? "n/a" : numeric.toFixed(d); }
    function displayNumber(value) {
      if (value === null || value === undefined || value === "") return null;
      const numeric = Number(value);
      return Number.isFinite(numeric) ? numeric : null;
    }
    function setHtml(id, html) { document.querySelector(`#${id}`).innerHTML = html; }
    function esc(value) { return String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#39;"); }
  </script>
</body>
</html>
"""


if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser()
    parser.add_argument("--data-root", default="data/liqwid")
    parser.add_argument("--output")
    args = parser.parse_args()
    print(build_static_app(args.data_root, args.output))
