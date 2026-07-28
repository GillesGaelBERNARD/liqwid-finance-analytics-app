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
        project_root / "src" / "browser" / "loanSnapshotHistory.js",
        project_root / "src" / "browser" / "memoryDataStore.js",
        project_root / "src" / "browser" / "portableArchive.js",
        project_root / "src" / "browser" / "dataWorkflow.js",
        project_root / "src" / "browser" / "refreshProgress.js",
        project_root / "src" / "browser" / "currentExposureAnalysis.js",
        project_root / "src" / "browser" / "dataStatus.js",
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
    .data-status-headline.attention { border-color: rgba(255,90,103,.55); background: linear-gradient(90deg, rgba(255,90,103,.12), rgba(255,184,77,.05)); }
    .data-status-headline strong { display: block; font-size: 1.08rem; }
    .data-status-headline span { color: var(--muted); font-size: .8rem; }
    .data-status-section { margin-top: 28px; }
    .data-status-section h3 { margin: 0 0 5px; font-size: clamp(1.2rem, 2vw, 1.55rem); }
    .data-status-section > p { margin: 0 0 14px; color: var(--muted); font-size: .86rem; }
    .data-status-coverage { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 12px; }
    .data-status-card { min-width: 0; padding: 16px; border: 1px solid var(--line); border-top: 3px solid var(--mint); border-radius: 9px; background: linear-gradient(180deg, rgba(25,181,254,.07), transparent), var(--panel); }
    .data-status-card.pass { border-top-color: var(--mint); }
    .data-status-card.fail { border-top-color: var(--red); }
    .data-status-card.unavailable { border-top-color: var(--line); }
    .data-status-card span { display: block; color: var(--muted); font-size: .75rem; }
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
    .data-status-technical summary { cursor: pointer; color: var(--muted); font-size: .8rem; }
    .data-status-technical-content { display: grid; gap: 22px; margin-top: 18px; }
    .data-status-audit-group { min-width: 0; }
    .data-status-audit-group h4 { margin: 0 0 4px; font-size: .96rem; }
    .data-status-audit-group > p { margin: 0 0 11px; color: var(--muted); font-size: .72rem; }
    .data-status-technical-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 9px 20px; }
    .data-status-technical-grid div { min-width: 0; }
    .data-status-technical-grid span { display: block; color: var(--muted); font-size: .7rem; }
    .data-status-technical-grid code { display: block; margin-top: 3px; overflow-wrap: anywhere; color: #c8d9e7; font-size: .72rem; }
    .data-status-audit-list { display: grid; gap: 8px; }
    .data-status-audit-row { display: grid; grid-template-columns: minmax(160px, .65fr) minmax(210px, .8fr) minmax(260px, 1.2fr); gap: 12px; align-items: start; padding: 10px 12px; border: 1px solid rgba(36,72,102,.62); border-radius: 8px; background: rgba(13,31,51,.62); }
    .data-status-audit-row strong { font-size: .78rem; }
    .data-status-audit-row code { overflow-wrap: anywhere; color: #d8e9f5; font-size: .72rem; }
    .data-status-audit-row span { color: var(--muted); font-size: .7rem; line-height: 1.45; }
    .data-status-audit-evidence { grid-template-columns: 26px minmax(170px, .65fr) minmax(220px, .85fr) minmax(250px, 1.1fr); }
    .data-status-audit-evidence .data-status-check-mark { width: 22px; height: 22px; font-size: .72rem; }
    .data-status-audit-evidence.fail .data-status-check-mark { background: rgba(255,90,103,.16); color: #ff9aa2; }
    .data-status-audit-evidence.partial .data-status-check-mark { background: rgba(255,184,77,.15); color: var(--amber); }
    .data-status-audit-evidence.unavailable .data-status-check-mark { background: rgba(127,166,199,.12); color: var(--muted); }
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
    .section-tabs { padding-top: 8px; border-top: 1px solid rgba(36,72,102,.58); }
    .section-tabs button { border-color: transparent; background: rgba(16,42,68,.62); color: var(--muted); font-size: .84rem; }
    .section-tabs button.active { border-color: rgba(62,220,129,.68); background: rgba(25,181,254,.15); color: var(--text); box-shadow: inset 0 -2px 0 var(--mint); }
    .market-context { display: flex; align-items: center; gap: 12px; padding-top: 4px; }
    .market-context[hidden] { display: none; }
    .market-context label { display: flex; align-items: center; gap: 10px; color: var(--muted); font-size: .8rem; }
    .market-context select { min-width: min(320px, 70vw); padding: 8px 34px 8px 11px; font-size: .86rem; }
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
        <button id="dataStatusButton" class="data-status-button" type="button" hidden>Data status <span id="dataStatusButtonSummary"></span></button>
      </div>
    </div>
    <p id="refreshStatus" class="refresh-status" role="status" hidden></p>
  </header>
  <main>
    <nav id="analyticsNav" class="analytics-nav" aria-label="Analytics navigation">
      <div id="analysisLocation" class="nav-location" aria-live="polite"></div>
      <div id="scopeTabs" class="tabs scope-tabs" role="tablist" aria-label="Analytics scope"></div>
      <div id="sectionTabs" class="tabs section-tabs" role="tablist" aria-label="Analysis section"></div>
      <div id="marketContext" class="market-context" hidden></div>
    </nav>
    <section id="overview" class="view active"></section>
    <section id="protocolDebtFlows" class="view"></section>
    <section id="protocolInterestFlows" class="view"></section>
    <section id="revenue" class="view"></section>
    <section id="liquidations" class="view"></section>
    <section id="exposure" class="view"></section>
    <section id="impact" class="view"></section>
    <section id="protocolParticipation" class="view"></section>
    <section id="protocolLqToken" class="view"></section>
    <section id="marketOverview" class="view"></section>
    <section id="marketRepayments" class="view"></section>
    <section id="marketInterest" class="view"></section>
    <section id="marketRevenue" class="view"></section>
    <section id="marketHealth" class="view"></section>
    <section id="marketParticipation" class="view"></section>
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
        ["revenue", "Revenue"],
        ["liquidations", "Liquidations"],
        ["exposure", "Exposure"],
        ["impact", "Market impact"],
        ["protocolParticipation", "Participation and concentration"],
        ["protocolLqToken", "LQ token & staking"]
      ]],
      ["markets", "Market analytics", [
        ["marketOverview", "Liquidity & Rates"],
        ["marketRepayments", "Debt flows"],
        ["marketInterest", "Interest flows"],
        ["marketRevenue", "Revenue"],
        ["marketHealth", "Health"],
        ["marketParticipation", "Participation and concentration"]
      ]]
    ];
    const views = analyticsScopes.flatMap(([, , scopeViews]) => scopeViews);
    const chartTimeframes = [["week", "Week"], ["month", "Month"], ["quarter", "3 months"], ["ytd", "YTD"], ["year", "Year"], ["all", "All"]];
    const APP_KPI_METADATA = Object.freeze({
    "Active-debt positions": {
        "description": "Count of active loan positions with non-zero borrow balance.",
        "explanation": "Number of active user borrowing positions currently holding non-zero debt in the snapshot.",
        "formulaHtml": '<div class="formula-card"><span class="formula-func">count</span><span class="formula-paren">(</span><span class="formula-num">Loans with Debt &gt; $0</span><span class="formula-paren">)</span></div>',
        "formulaText": "count(Loans with Debt > 0)"
    },
    "Active-loan debt": {
        "description": "Total USD borrow debt held by active loan positions.",
        "explanation": "Sum of all outstanding borrow balances across active user loan positions, converted to USD at current asset prices.",
        "formulaHtml": '<div class="formula-card">&sum; <span class="formula-num">Loan Debt<sub>USD</sub></span></div>',
        "formulaText": "sum(Loan Debt USD)"
    },
    "Annualized run rate": {
        "description": "Annualized protocol revenue based on trailing 90-day fee activity.",
        "explanation": "Projects full-year protocol revenue by annualizing trailing 90-day daily average fee generation across active market pools.",
        "formulaHtml": '<div class="formula-card"><span class="formula-num">Revenue<sub>90d</sub></span> &times; <div class="formula-frac"><span class="formula-num">365</span><span class="formula-den">90</span></div></div>',
        "formulaText": "Revenue_90d * (365 / 90)"
    },
    "Bad debt": {
        "description": "Total USD debt where outstanding borrow exceeds total collateral value.",
        "explanation": "Uncollateralized shortfall where an active loan's debt balance exceeds its collateral value (Debt > Collateral). Features two key components: Gross Debt (total borrow balance of undercollateralized loans) and Net Shortfall (uncollateralized loss exposure: Debt - Collateral).",
        "formulaHtml": '<div class="formula-card"><div style="margin-bottom:4px"><strong>Gross Debt:</strong> &sum;<sub>Debt<sub>i</sub> &gt; Collateral<sub>i</sub></sub> <span class="formula-num">Debt<sub>i</sub></span></div><div><strong>Net Shortfall:</strong> &sum;<sub>Debt<sub>i</sub> &gt; Collateral<sub>i</sub></sub> <span class="formula-paren">(</span><span class="formula-num">Debt<sub>i</sub></span> &minus; <span class="formula-num">Collateral<sub>i</sub></span><span class="formula-paren">)</span></div></div>',
        "formulaText": "Gross = sum(Debt where Debt > Collateral); Net Shortfall = sum(max(0, Debt - Collateral))"
    },
    "Bad-debt positions": {
        "description": "Count of active loans where borrow exceeds collateral value.",
        "explanation": "Number of undercollateralized user loan positions currently in bad debt state (Debt > Collateral).",
        "formulaHtml": '<div class="formula-card"><span class="formula-func">count</span><span class="formula-paren">(</span><span class="formula-num">Loans where Debt &gt; Collateral</span><span class="formula-paren">)</span></div>',
        "formulaText": "count(Loans where Debt > Collateral)"
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
        "formulaText": "max_i(Gross Bad Debt USD_i); Net Shortfall_i = sum(max(0, Debt - Collateral))"
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
        "formulaText": "Collateral Asset linked to Max Bad Debt"
    },
    "Critical debt at HF <= 1.10": {
        "description": "Total USD debt in positions with Health Factor <= 1.10.",
        "explanation": "Sum of outstanding debt held by active loans with Health Factor (HF) <= 1.10, indicating borrowing within 10% of liquidation threshold. HF = (Collateral * LiqThreshold) / Borrow.",
        "formulaHtml": '<div class="formula-card">&sum;<sub>HF &le; 1.10</sub> <span class="formula-num">Debt<sub>USD</sub></span> &nbsp; where &nbsp; <span class="formula-num">HF</span> = <div class="formula-frac"><span class="formula-num">Collateral &times; LiqThreshold</span><span class="formula-den">Borrow</span></div></div>',
        "formulaText": "sum(Debt where HF <= 1.10)"
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
    "Current-valued interest gap": {
        "description": "Net cumulative unserviced interest accrued since inception.",
        "explanation": "Cumulative difference between native interest accrued and native interest repaid across all market history, valued at current asset prices.",
        "formulaHtml": '<div class="formula-card">&sum; <span class="formula-paren">(</span><span class="formula-num">Interest Accrued<sub>native</sub></span> &minus; <span class="formula-num">Interest Repaid<sub>native</sub></span><span class="formula-paren">)</span> &times; <span class="formula-num">Price<sub>current</sub></span></div>',
        "formulaText": "sum(Accrued Native - Repaid Native) * Current Price"
    },
    "Current-valued cumulative interest gap": {
        "description": "Net cumulative unserviced interest accrued since inception.",
        "explanation": "Cumulative difference between native interest accrued and native interest repaid across all market history, valued at current asset prices.",
        "formulaHtml": '<div class="formula-card">&sum; <span class="formula-paren">(</span><span class="formula-num">Interest Accrued<sub>native</sub></span> &minus; <span class="formula-num">Interest Repaid<sub>native</sub></span><span class="formula-paren">)</span> &times; <span class="formula-num">Price<sub>current</sub></span></div>',
        "formulaText": "sum(Accrued Native - Repaid Native) * Current Price"
    },
    "Current-valued cumulative debt-flow gap": {
        "description": "Net cumulative unserviced debt creation accrued since inception.",
        "explanation": "Cumulative difference between native inferred debt accrued and native debt repaid across all market history, valued at current asset prices.",
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
    "DAO / treasury revenue": {
        "description": "Cumulative protocol revenue allocated to the DAO Treasury.",
        "explanation": "Total historical protocol fee allocations directed to the Liqwid DAO Treasury reserve, combining DAO interest share and loan origination fees.",
        "formulaHtml": '<div class="formula-card"><span class="formula-num">DAO Interest Share</span> + <span class="formula-num">DAO Origination Fees</span></div>',
        "formulaText": "DAO Interest Share + DAO Origination Fees"
    },
    "DAO Treasury LQ": {
        "description": "Total LQ tokens held in the DAO Treasury reserve.",
        "explanation": "Reserve balance of LQ tokens held in the protocol DAO Treasury, valued at current LQ market price.",
        "formulaHtml": '<div class="formula-card"><span class="formula-num">Treasury LQ Tokens</span> &times; <span class="formula-num">LQ Price<sub>USD</sub></span></div>',
        "formulaText": "Treasury LQ Tokens * LQ Price USD"
    },
    "DAO interest allocation": {
        "description": "Cumulative interest fee revenue allocated to DAO Treasury.",
        "explanation": "Protocol interest reserve split directed to DAO balance based on protocol reserve factor.",
        "formulaHtml": '<div class="formula-card">&sum; <span class="formula-paren">(</span><span class="formula-num">Interest Accrued<sub>USD</sub></span> &times; <span class="formula-num">Reserve Factor %</span><span class="formula-paren">)</span></div>',
        "formulaText": "sum(Interest Accrued USD * Reserve Factor %)"
    },
    "DAO origination allocation": {
        "description": "Cumulative loan origination fees allocated to DAO Treasury.",
        "explanation": "Origination fee share directed to DAO balance upon new loan minting.",
        "formulaHtml": '<div class="formula-card">&sum; <span class="formula-num">Origination Fees<sub>USD</sub></span></div>',
        "formulaText": "sum(Origination Fees USD)"
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
        "formulaText": "sum(Debt where HF < 1.00)"
    },
    "Debt at HF <= 1.25": {
        "description": "Total USD debt near liquidation thresholds.",
        "explanation": "Total USD debt held in active loans with Health Factor (HF) <= 1.25, representing positions close to liquidation threshold.",
        "formulaHtml": '<div class="formula-card">&sum;<sub>HF &le; 1.25</sub> <span class="formula-num">Debt<sub>USD</sub></span></div>',
        "formulaText": "sum(Debt where HF <= 1.25)"
    },
    "Debt at critical health": {
        "description": "Total USD debt in loans with Health Factor <= 1.10.",
        "explanation": "Sum of outstanding debt held by active loans with Health Factor (HF) <= 1.10, indicating borrowing within 10% of liquidation threshold.",
        "formulaHtml": '<div class="formula-card">&sum;<sub>HF &le; 1.10</sub> <span class="formula-num">Debt<sub>USD</sub></span></div>',
        "formulaText": "sum(Debt where HF <= 1.10)"
    },
    "Debt below HF 1.0": {
        "description": "Total USD debt in undercollateralized loans.",
        "explanation": "Sum of outstanding debt in loans with Health Factor (HF) < 1.00, subject to immediate liquidation.",
        "formulaHtml": '<div class="formula-card">&sum;<sub>HF &lt; 1.00</sub> <span class="formula-num">Debt<sub>USD</sub></span></div>',
        "formulaText": "sum(Debt where HF < 1.00)"
    },
    "Debt near liquidation": {
        "description": "Total USD debt in loans with health factor <= 1.25.",
        "explanation": "Sum of outstanding debt in loans with Health Factor (HF) <= 1.25, close to liquidation threshold.",
        "formulaHtml": '<div class="formula-card">&sum;<sub>HF &le; 1.25</sub> <span class="formula-num">Debt<sub>USD</sub></span></div>',
        "formulaText": "sum(Debt where HF <= 1.25)"
    },
    "Full-period liquidation profit": {
        "description": "Net protocol revenue earned from liquidation penalties across observable history.",
        "explanation": "Cumulative profit accrued from liquidation fees and collateral discounts across all recorded historical observations.",
        "formulaHtml": '<div class="formula-card">&sum; <span class="formula-num">Liquidation Profit<sub>USD</sub></span></div>',
        "formulaText": "sum(Liquidation Profit USD)"
    },
    "Gross realized fee flow - trailing 90d": {
        "description": "Trailing 90-day total fee revenue generated across pools.",
        "explanation": "Sum of all interest reserve fees and upfront loan origination fees collected over trailing 90 days.",
        "formulaHtml": '<div class="formula-card">&sum;<sub>90d</sub> <span class="formula-num">Fees<sub>USD</sub></span></div>',
        "formulaText": "sum_90d(Fee Flow USD)"
    },
    "Gross realized fee flow · trailing 90d": {
        "description": "Trailing 90-day total fee revenue generated across pools.",
        "explanation": "Sum of all interest reserve fees and upfront loan origination fees collected over trailing 90 days.",
        "formulaHtml": '<div class="formula-card">&sum;<sub>90d</sub> <span class="formula-num">Fees<sub>USD</sub></span></div>',
        "formulaText": "sum_90d(Fee Flow USD)"
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
        "formulaText": "max_i(Gross Bad Debt USD_i); Net Shortfall = sum(max(0, Debt - Collateral))"
    },
    "Highest debt at risk (HF < 1.0)": {
        "description": "Market with highest liquidatable debt balance.",
        "explanation": "Identifies market pool carrying the largest dollar amount of HF < 1.00 debt. Health Factor evaluates total collateral value against borrowed debt adjusted by liquidation thresholds: HF = (Collateral * LiqThreshold) / Borrow.",
        "formulaHtml": '<div class="formula-card"><div style="margin-bottom:4px"><span class="formula-func">max</span><sub>i</sub> &sum;<sub>loans &in; i, HF &lt; 1.00</sub> <span class="formula-num">Debt<sub>USD</sub></span></div><div style="font-size:.76rem;color:#8fa9bf">where <span class="formula-num">HF</span> = <div class="formula-frac"><span class="formula-num">Collateral &times; LiqThreshold</span><span class="formula-den">Borrow</span></div> &lt; 1.00</div></div>',
        "formulaText": "max_i(sum(Debt_USD where HF < 1.00)); HF = (Collateral * LiqThreshold) / Borrow"
    },
    "Highest utilization pressure": {
        "description": "Market pool currently experiencing the highest utilization stress.",
        "explanation": "Identifies the market pool with the highest capital utilization percentage (Borrow / Supply), indicating severe pool liquidity tightening.",
        "formulaHtml": '<div class="formula-card"><span class="formula-func">max</span><sub>i</sub> <div class="formula-frac"><span class="formula-num">Borrow<sub>i</sub></span><span class="formula-den">Supply<sub>i</sub></span></div></div>',
        "formulaText": "max_i(Borrow_i / Supply_i)"
    },
    "Interest repaid flow - trailing 90d": {
        "description": "Trailing 90-day interest payments received across pools.",
        "explanation": "Total interest payments collected from borrowers across all pools over trailing 90 days.",
        "formulaHtml": '<div class="formula-card">&sum;<sub>90d</sub> <span class="formula-num">Interest Repaid<sub>USD</sub></span></div>',
        "formulaText": "sum_90d(Interest Repaid USD)"
    },
    "Interest repaid flow · trailing 90d": {
        "description": "Trailing 90-day interest payments received across pools.",
        "explanation": "Total interest payments collected from borrowers across all pools over trailing 90 days.",
        "formulaHtml": '<div class="formula-card">&sum;<sub>90d</sub> <span class="formula-num">Interest Repaid<sub>USD</sub></span></div>',
        "formulaText": "sum_90d(Interest Repaid USD)"
    },
    "LQ Price": {
        "description": "Current USD market price of the LQ token.",
        "explanation": "Observed market price of the LQ protocol governance token.",
        "formulaHtml": '<div class="formula-card"><span class="formula-num">LQ Price<sub>USD</sub></span></div>',
        "formulaText": "LQ Price USD"
    },
    "LQ-staker allocation": {
        "description": "Cumulative protocol revenue allocated to LQ stakers.",
        "explanation": "Share of protocol fees distributed to locked LQ token stakers.",
        "formulaHtml": '<div class="formula-card">&sum; <span class="formula-num">Staker Fee Share<sub>USD</sub></span></div>',
        "formulaText": "sum(Staker Fee Share USD)"
    },
    "Largest critical collateral": {
        "description": "Largest collateral pool backing critical health (HF <= 1.10) loans.",
        "explanation": "Identifies the collateral asset pool backing the highest total dollar amount of debt in critical health (HF <= 1.10).",
        "formulaHtml": '<div class="formula-card"><span class="formula-func">max</span><sub>asset</sub> <span class="formula-num">Critical Debt<sub>USD, asset</sub></span></div>',
        "formulaText": "max_asset(Critical Collateral Debt USD)"
    },
    "Largest near-liquidation collateral": {
        "description": "Largest collateral pool backing near-liquidation (HF <= 1.25) loans.",
        "explanation": "Identifies the collateral asset pool backing the highest total dollar amount of debt near liquidation (HF <= 1.25).",
        "formulaHtml": '<div class="formula-card"><span class="formula-func">max</span><sub>asset</sub> <span class="formula-num">Near-Liquidation Debt<sub>USD, asset</sub></span></div>',
        "formulaText": "max_asset(Near Liquidation Collateral Debt USD)"
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
        "formulaText": "min_i(Health Factor_i); HF = (Collateral * LiqThreshold) / Borrow"
    },
    "Minimum health factor": {
        "description": "Lowest health factor observed across all active loans.",
        "explanation": "Minimum Health Factor among active borrowing positions. HF = (Collateral * LiqThreshold) / Debt. Health factor < 1.00 indicates a liquidatable position.",
        "formulaHtml": '<div class="formula-card"><span class="formula-func">min</span><sub>i</sub> <span class="formula-paren">(</span><span class="formula-num">Health Factor<sub>i</sub></span><span class="formula-paren">)</span> &nbsp; where &nbsp; <span class="formula-num">HF</span> = <div class="formula-frac"><span class="formula-num">Collateral &times; LiqThreshold</span><span class="formula-den">Borrow</span></div></div>',
        "formulaText": "min_i(Health Factor_i); HF = (Collateral * LiqThreshold) / Borrow"
    },
    "Observed keys with active debt": {
        "description": "Count of distinct wallet addresses holding active borrow debt.",
        "explanation": "Number of unique wallet key addresses mapped to active borrowing positions holding non-zero debt.",
        "formulaHtml": '<div class="formula-card"><span class="formula-func">count</span><span class="formula-paren">(</span><span class="formula-num">Unique Active Keys</span><span class="formula-paren">)</span></div>',
        "formulaText": "count(Unique Active Keys)"
    },
    "Official DAO revenue - market level": {
        "description": "Sum of market-level fee allocations to DAO Treasury.",
        "explanation": "Aggregated DAO fee revenue collected from individual market pools.",
        "formulaHtml": '<div class="formula-card">&sum; <span class="formula-num">Market DAO Revenue<sub>USD, i</sub></span></div>',
        "formulaText": "sum(Market DAO Revenue USD)"
    },
    "Official DAO revenue · market level": {
        "description": "Sum of market-level fee allocations to DAO Treasury.",
        "explanation": "Aggregated DAO fee revenue collected from individual market pools.",
        "formulaHtml": '<div class="formula-card">&sum; <span class="formula-num">Market DAO Revenue<sub>USD, i</sub></span></div>',
        "formulaText": "sum(Market DAO Revenue USD)"
    },
    "Origination-fee flow - trailing 90d": {
        "description": "Trailing 90-day loan origination fees collected.",
        "explanation": "Total upfront fees collected upon new loan creation over trailing 90 days.",
        "formulaHtml": '<div class="formula-card">&sum;<sub>90d</sub> <span class="formula-num">Origination Fees<sub>USD</sub></span></div>',
        "formulaText": "sum_90d(Origination Fees USD)"
    },
    "Origination-fee flow · trailing 90d": {
        "description": "Trailing 90-day loan origination fees collected.",
        "explanation": "Total upfront fees collected upon new loan creation over trailing 90 days.",
        "formulaHtml": '<div class="formula-card">&sum;<sub>90d</sub> <span class="formula-num">Origination Fees<sub>USD</sub></span></div>',
        "formulaText": "sum_90d(Origination Fees USD)"
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
        "formulaText": "Gross = sum(Debt where Debt > Collateral); Net Shortfall = sum(max(0, Debt - Collateral))"
    },
    "Supply": {
        "description": "Total USD value of assets supplied across protocol pools.",
        "explanation": "Sum of all collateral and non-collateral assets supplied by users across Liqwid market pools, converted to USD at current market prices.",
        "formulaHtml": '<div class="formula-card">&sum; <span class="formula-num">Supply<sub>native, i</sub></span> &times; <span class="formula-num">Price<sub>USD, i</sub></span></div>',
        "formulaText": "sum(Supply_i * Price_i)"
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
    }
});

    const chartQuestions = Object.freeze({
      protocolCapital: "Is protocol capital expanding, and is borrowing reducing the liquidity left available?",
      protocolUtilization: "When has borrowing consumed the largest share of supplied capital?",
      protocolDebtRepayment: "When did protocol repayment activity accelerate, fade, or stop?",
      protocolDebtRepaymentDistribution: "How are active daily debt repayment amounts distributed across all protocol markets?",
      protocolInterestRepaymentDistribution: "How are active daily interest repayment amounts distributed across all protocol markets?",
      protocolDebtDaily: "On which days did inferred debt formation exceed reported repayment?",
      protocolDebtRolling: "Are recent debt formation and repayment rates converging or separating?",
      protocolDebtCumulative: "Across the observable history, how far have total inferred debt formation and reported repayment progressed?",
      protocolDebtCumulativeGap: "Has the accumulated debt-flow imbalance widened, stabilized, or closed?",
      protocolDebtGap: "When did daily debt formation create or reduce the debt-flow imbalance?",
      protocolDebtCoverage: "Over 7-, 30-, and 90-day windows, are repayments keeping pace with inferred debt formation?",
      protocolInterestRolling: "Are recent interest payments catching up with the latest accrual pace?",
      protocolInterestCoverage: "Which trailing windows show interest repayments keeping pace with accrual?",
      protocolInterestDaily: "On which days did new interest exceed the interest borrowers paid?",
      protocolInterestRepayment: "When did protocol interest repayment activity accelerate, fade, or stop?",
      protocolInterestRepaymentDistribution: "How are protocol-wide interest repayment amounts distributed across observation periods?",
      protocolInterestCumulative: "How have total accrued and repaid interest separated across the observable history?",
      protocolInterestCumulativeGap: "Is the accumulated interest shortfall widening, flattening, or being repaid?",
      protocolInterestGap: "When did daily interest payments fall behind or overtake new accrual?",
      protocolParticipationLoans: "Is the saved count of active-debt positions broadening or contracting?",
      protocolParticipationKeys: "Is active debt spreading across more observed keys or concentrating among fewer?",
      protocolLqPrice: "How has the LQ token market price evolved over time?",
      protocolLqStaking: "How has total staked LQ and the staking ratio changed over time?",
      protocolLqTreasury: "How have DAO treasury LQ holdings and USD valuation grown over time?",
      protocolHealthHistoryCounts: "Are more active-debt positions moving into weaker health-factor bands?",
      protocolHealthHistoryDebt: "Is a larger share of active debt shifting toward lower health factors?",
      impactBorrowConcentrationComparison: "In which markets do the largest observed keys account for mapped borrowing most quickly?",
      impactCollateralizedSupplyConcentrationComparison: "In which markets do the largest observed keys account for represented collateralized supply most quickly?",
      protocolRevenueAllocationDaily: "Which daily interest and origination components drive DAO and LQ-staker allocations?",
      protocolRevenueAllocationMonthly: "How is allocated protocol revenue changing in level and composition month to month?",
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
      marketDebtCumulativeGapAsset: "Has this market's cumulative native debt-flow gap widened, stabilized, or closed?",
      marketDebtCumulativeGap: "Has this market's accumulated debt-flow imbalance widened, stabilized, or closed?",
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
      marketInterestCumulativeGapAsset: "Has this market's cumulative native interest gap widened, stabilized, or closed?",
      marketInterestCumulativeGap: "Is this market's accumulated interest shortfall widening, flattening, or being repaid?",
      marketInterestGapAsset: "When did native interest accrual exceed or fall behind native repayment?",
      marketInterestGap: "When did this market's daily interest payment lag or overtake new accrual?",
      marketInterestCoverage: "Which trailing windows show this market's interest repayments keeping pace?",
      marketRevenueMonthly: "Which months produced the most directly reported fee-paying activity, and is the recent pace changing?",
      marketHealthBuckets: "How much current debt sits in each health-factor tranche?",
      marketHealthHistoryDebt: "Is this market's active debt shifting toward stronger or weaker health-factor bands?",
      marketHealthHistoryCounts: "Are this market's active-debt positions moving into safer or riskier bands?",
      marketParticipationLoans: "Is this market's saved active-debt position count broadening or contracting?",
      marketParticipationKeys: "Is this market's active debt spread across more observed keys or fewer?",
      marketKeyDependence: "How much of this market's official borrow maps to its largest keys versus unmapped debt?",
      marketBorrowConcentration: "How quickly do the largest observed keys account for this market's official borrow?",
      marketCollateralizedSupplyConcentration: "How quickly do the largest observed keys account for represented collateralized supply?",
      impactRiskRanking: "Which current stress component indicators affect each market?",
      impactMarketMap: "Which large markets combine high utilization with weak recent interest coverage?",
      impactInterestContributions: "Which markets generated the largest shares of recent interest accrual?",
      impactInterestRepaymentContributions: "Which markets supplied the largest shares of recent interest repayment?",
      impactGapContributions: "Which markets contributed most to recent positive interest shortfalls?",
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
      activeView = viewId;
      document.querySelectorAll(".view").forEach((view) => view.classList.toggle("active", view.id === activeView));
      renderActiveView();
      renderTabs();
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
      const market = currentMarketSummary();
      context.innerHTML = `<label>Selected market<select id="marketSelect">${deep.marketSummaries.map((row) => `<option value="${esc(row.marketId)}" ${row.marketId === market.marketId ? "selected" : ""}>${esc(row.displayName || row.marketId)}</option>`).join("")}</select></label>`;
      document.querySelector("#marketSelect").addEventListener("change", (event) => {
        selectedMarket = event.target.value;
        const marketViews = analyticsScopes.find(([id]) => id === "markets")[2];
        for (const [viewId] of marketViews) {
          renderedViews.delete(viewId);
          if (viewId !== activeView) document.querySelector(`#${viewId}`)?.replaceChildren();
        }
        renderActiveView(true);
      });
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
        revenue: renderRevenue,
        liquidations: renderLiquidations,
        exposure: renderCurrentExposure,
        impact: renderImpact,
        protocolParticipation: renderProtocolParticipation,
        protocolLqToken: renderProtocolLqToken,
        marketOverview: renderMarketOverview,
        marketRepayments: renderMarketRepayments,
        marketInterest: renderMarketInterest,
        marketRevenue: renderMarketRevenue,
        marketHealth: renderMarketHealth,
        marketParticipation: renderMarketParticipation
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
        `${integer(headline.passedChecks)} checks passed`,
        headline.partialChecks ? `${integer(headline.partialChecks)} known ${headline.partialChecks === 1 ? "boundary" : "boundaries"}` : "",
        headline.failedChecks ? `${integer(headline.failedChecks)} failed` : ""
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
        <div class="data-status-headline ${headline.state === "attention" ? "attention" : ""}">
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
                <span>${esc(card.label)}</span>
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
            <p class="loan-population-note">Active-debt positions drive debt, health, participation, and observed-key borrowing analysis. Zero-debt collateral positions remain valid only for the collateralized-supply view.${population.hasUnfilteredSnapshot ? "" : " The unfiltered position snapshot is unavailable in this archive."}</p>
          </div>
        </section>

        <section class="data-status-section" aria-labelledby="consistencyChecksTitle">
          <h3 id="consistencyChecksTitle">Consistency checks</h3>
          <p>The numerical comparisons that matter most for interpreting the analytics.</p>
          <div class="data-status-checks">
            ${status.checks.map((check) => `
              <div class="data-status-check ${esc(check.status)}">
                <div class="data-status-check-label"><span class="data-status-check-mark" aria-hidden="true">${dataStatusMark(check.status)}</span>${esc(check.label)}</div>
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
                    <strong>${esc(item.label)}</strong>
                    <code>${esc(item.value)}</code>
                    <span>${esc(item.detail)}</span>
                  </div>
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
        ${interactiveChartPanel("Cumulative debt accrued and repaid", "protocolDebtCumulative", { help: debtFlowReconciliationHelp(debtFlowReconciliation) })}
        ${interactiveChartPanel("Current-valued cumulative debt-flow gap", "protocolDebtCumulativeGap", { help: debtFlowReconciliationHelp(debtFlowReconciliation) })}
        ${interactiveChartPanel("Current-valued debt-flow gap", "protocolDebtGap", { help: gapValuationHelp("protocol") })}
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
          <p>Is interest being repaid as it accrues?</p>
        </div>
        <div class="kpis">
          ${kpi("Current-valued interest gap", usd(p.cumulativeInterestGapInUsd), "Sum of each market's cumulative native interest gap valued at its latest observed price.")}
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
        ${interactiveChartPanel("Current-valued cumulative interest-flow gap", "protocolInterestCumulativeGap", { help: interestFlowHelp("protocol") })}
        ${interactiveChartPanel("Current-valued interest-flow gap", "protocolInterestGap", { help: gapValuationHelp("protocol") })}
        ${interactiveChartPanel("Protocol interest repayment distribution", "protocolInterestRepaymentDistribution")}
      `);
      drawProtocolInterestCharts();
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
        ${interactiveChartPanel("Active-debt loan count by health-factor band", "protocolHealthHistoryCounts", { defaultPeriod: "all" })}
        ${interactiveChartPanel("Active debt by health-factor band", "protocolHealthHistoryDebt", { defaultPeriod: "all" })}
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

    function renderRevenue() {
      const revenue = deep.revenue || {};
      const summary = revenue.summary || {};
      const completeMonths = (revenue.monthlyAllocation || []).filter((row) => row.isComplete !== false && !row.fetchError);
      const latestRunRate = (revenue.annualizedRunRateSeries || []).at(-1) || {};
      const allocationPeriod = periodLabel(
        completeMonths[0]?.periodStartDay || summary.allocationCoverageFromDate,
        completeMonths.at(-1)?.periodEndDay || summary.allocationCoverageToDate
      );
      const runRatePeriod = periodLabel(latestRunRate.windowStartDate, latestRunRate.windowEndDate);
      setHtml("revenue", `
        <div class="hero">
          <h2>Protocol revenue</h2>
          <p>How much revenue is allocated to the DAO and LQ stakers, and is the run rate changing?</p>
        </div>
        ${metricPeriodGroup("Cumulative allocation", allocationPeriod, `${integer(summary.completeAllocationMonths)} complete months`, `
          ${kpi("DAO / treasury revenue", usd(summary.allocatedProtocolRevenueInUsd))}
          ${kpi("DAO interest allocation", usd(summary.allocatedProtocolInterestRevenueInUsd))}
          ${kpi("DAO origination allocation", usd(summary.allocatedProtocolOriginationRevenueInUsd))}
          ${kpi("LQ-staker allocation", usd(summary.allocatedHoldersRevenueInUsd), "Interest plus origination allocation")}
        `)}
        ${metricPeriodGroup("Recent DAO run rate", runRatePeriod, "Latest 90 consecutive complete days", `
          ${kpi("Annualized run rate", usd(summary.allocatedProtocolRevenueAnnualizedRunRateInUsd), `Trailing 90-day revenue: \${usd(summary.allocatedProtocolRevenueTrailing90DaysInUsd)}`)}
          ${kpi("Change vs prior 90 days", pct(summary.allocatedProtocolRevenueChangeVsPrior90Days))}
        `)}
        ${chartSection("Monthly allocation and 90-day run rate", "Is DAO revenue growing, slowing, or changing composition through the latest complete day?")}
        ${interactiveChartPanel("Historical annualized DAO revenue run rate", "protocolRevenueRunRate", { defaultPeriod: "all", help: "Each point annualizes the latest 90 consecutive complete UTC days. The current UTC day is excluded until closed." })}
        ${interactiveChartPanel("Monthly allocated protocol revenue", "protocolRevenueAllocationMonthly", { defaultPeriod: "all", help: "The current partial month remains visible. The run rate uses completed daily allocations instead of waiting for month end." })}
        ${chartSection("Daily allocation", "Which revenue components are driving daily allocation to the DAO and LQ stakers?")}
        ${interactiveChartPanel("Daily DAO and LQ-staker revenue allocation", "protocolRevenueAllocationDaily", { defaultPeriod: "all" })}
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
        ${interactiveChartPanel("Active debt by health-factor band over time", "exposureHealthHistoryDebt", { defaultPeriod: "all" })}
        ${interactiveChartPanel("Evolution of bad debt over time", "exposureBadDebtHistory", { defaultPeriod: "all", help: "Gross bad debt is total active debt in underwater loans (debt > collateral). Net shortfall is the uncollateralized deficit remaining after subtracting collateral value (Debt - Collateral)." })}

        ${chartSection("Alerts and recent change", "Which markets combine high utilization with the fastest recent deterioration?")}
        ${interactiveBreakdownPanel("Utilization level versus 7-day change", "exposureMarketPressure", { help: "Further right means higher current utilization; higher means utilization is rising. Point area is current borrow and color moves from light mint to dark red as the triage score increases." })}
        ${interactiveBreakdownPanel("Recent 30 days versus prior 30 days", "exposureFlowComparison", { help: "The observed-day counts remain visible in the exact computed table; a short current history must not be mistaken for a complete 30-day window." })}

        ${chartSection("Liquidation pressure by borrowed market and collateral", "Where is debt nearest liquidation, and which independent collateral declines would expose the most debt?")}
        <div class="chart-stack">
          ${interactiveBreakdownPanel("Active debt by borrowed market and health factor", "exposureBorrowedMarkets")}
          ${interactiveBreakdownPanel("Protocol debt by collateral and health factor", "exposureCollateralBands", { help: "Markets are ordered by debt at HF <= 1.25, keeping the largest imminent collateral exposures visible." })}
        </div>
        ${interactiveBreakdownPanel("Debt exposed after an independent collateral price decline", "exposureCollateralShock", { help: "10%, 20%, 30%, and 40% shocks are applied one collateral at a time. Darker cells contain more debt whose scenario HF is at or below 1.00." })}
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
        ${interactiveChartPanel("Cumulative debt-flow gap – asset units", "marketDebtCumulativeGapAsset", { help: debtFlowReconciliationHelp(debtFlowReconciliation) })}
        ${interactiveChartPanel("Cumulative debt-flow gap – current USD value", "marketDebtCumulativeGap", { help: debtFlowReconciliationHelp(debtFlowReconciliation) })}
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
      setHtml("marketRevenue", `
        <div class="hero"><h2>${esc(market.displayName || market.marketId)} fee activity</h2><p>How much directly reported fee-paying activity is this market producing, and how is it changing month to month?</p></div>
        <div class="kpis">
          ${kpi("Gross realized fee flow · trailing 90d", usd(market.grossRealizedRevenueProxy90dInUsd))}
          ${kpi("Interest repaid flow · trailing 90d", usd(market.repaidInterestFeeFlow90dInUsd))}
          ${kpi("Origination-fee flow · trailing 90d", usd(market.originationFeeFlow90dInUsd))}
          ${kpi("Official DAO revenue · market level", "Unavailable", "The official API does not expose recipient allocation by market.")}
        </div>
        ${chartSection("Market fee activity", "How much directly reported fee-paying activity is the market producing, and how is it changing month to month?")}
        ${interactiveChartPanel("Monthly market fee flow", "marketRevenueMonthly", { defaultPeriod: "all", help: "Reported interest repayment plus origination fees is fee-paying activity, not official DAO revenue. The official API does not expose recipient allocation by market." })}
      `);
      drawMarketCharts();
    }

    function renderMarketHealth() {
      const market = currentMarketSummary();
      setHtml("marketHealth", `
        <div class="hero"><h2>${esc(market.displayName || market.marketId)} health</h2><p>How much debt is near liquidation now, and how have health-factor tranches changed over time?</p></div>
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
        ${chartSection("Loan health", "How is current debt distributed across health-factor bands?")}
        ${interactiveBreakdownPanel("Current health-factor debt tranches", "marketHealthBuckets")}
        ${chartSection("Health-factor tranches over time", "Is active debt moving toward stronger or weaker health-factor bands across saved observations?")}
        ${interactiveChartPanel("Active debt by health-factor band over time", "marketHealthHistoryDebt", { defaultPeriod: "all" })}
        ${interactiveChartPanel("Active-debt position count by health-factor band", "marketHealthHistoryCounts", { defaultPeriod: "all" })}
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
        <div class="kpis">
          ${kpi("Highest utilization pressure", pressureMarketName, pressureNote)}
          ${kpi("Highest debt at risk (HF < 1.0)", debtAtRiskMarketName, debtAtRiskNote)}
          ${kpi("Highest bad debt", badDebtMarketName, badDebtNote)}
          ${kpi("Highest 30d liquidation volume", liqVolMarketName, liqVolNote)}
        </div>
        ${chartSection("Current market impact", "Which markets combine utilization, liquidity, weak interest coverage, borrow growth, and loan-health pressure?")}
        ${interactiveBreakdownPanel("Market risk indicator matrix", "impactRiskRanking", { help: "Lighter cells are lower; darker cells are higher." })}
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
        ${interactiveBreakdownPanel("Active-debt state by market", "impactLoanState")}
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
      else if (chartId.startsWith("market")) drawMarketTimeChart(chartId, resetRange);
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

    function loanSnapshotRows(kind, scope, marketId = "") {
      return (deep.loanSnapshotHistory?.[kind] || []).filter((row) =>
        row.scope === scope && (scope === "protocol" || row.marketId === marketId)
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
      return ["protocolParticipationLoans", "protocolParticipationKeys", "protocolHealthHistoryCounts", "protocolHealthHistoryDebt", "protocolCapital", "protocolUtilization", "protocolDebtRolling", "protocolDebtCoverage", "protocolDebtDaily", "protocolDebtRepayment", "protocolRepaymentDrySpells", "protocolDebtCumulative", "protocolDebtCumulativeGap", "protocolDebtGap", "protocolDebtRepaymentDistribution", "protocolInterestRolling", "protocolInterestCoverage", "protocolInterestDaily", "protocolInterestRepayment", "protocolInterestDrySpells", "protocolInterestRepaymentDistribution", "protocolInterestCumulative", "protocolInterestCumulativeGap", "protocolInterestGap", "protocolLqPrice", "protocolLqStaking", "protocolLqTreasury"];
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

    function drawProtocolTimeChart(chartId, resetRange = false) {
      const container = document.querySelector(`#${chartId}`);
      if (!container) return;
      let rows = chartBundleState().protocolRows;
      const options = { chartId, period: chartPeriods[chartId], resetRange };
      if (chartId === "protocolParticipationLoans") lineChart(container, loanSnapshotRows("health", "protocol"), [{ key: "activeDebtLoanCount", label: "Active-debt positions", color: colors.blue, type: "line", points: true, dash: "5 4" }], integer, { ...options, valueMode: "stock" });
      if (chartId === "protocolParticipationKeys") lineChart(container, loanSnapshotRows("participation", "protocol"), [{ key: "distinctActiveDebtObservedKeyCount", label: "Distinct observed keys with active debt", color: colors.mint, type: "line", points: true, dash: "5 4" }], integer, { ...options, valueMode: "stock" });
      if (chartId === "protocolLqPrice") lineChart(container, deep?.lqToken?.series || [], [["lqPriceInUsd", "LQ Price (USD)", colors.mint]], usdPrice, { ...options, valueMode: "stock" });
      if (chartId === "protocolLqStaking") lineChart(container, deep?.lqToken?.series || [], [{ key: "stakedLqAmount", label: "Staked LQ", color: colors.blue, type: "line", points: true, yAxis: "left" }, { key: "stakingRatio", label: "Staking ratio", color: colors.blue, type: "line", points: true, yAxis: "right", legend: false, summary: false }], (v, k) => k === "stakingRatio" ? pct(v) : assetAmount(v, "LQ"), { ...options, valueMode: "stock", hideYScaleToggle: true });
      if (chartId === "protocolLqTreasury") lineChart(container, deep?.lqToken?.series || [], [{ key: "daoTreasuryLqAmount", label: "DAO Treasury LQ", color: colors.amber, type: "line", points: true, yAxis: "left" }, { key: "daoTreasuryUsdValue", label: "DAO Treasury USD Value", color: colors.mint, type: "line", points: true, yAxis: "right" }], (v, k) => k === "daoTreasuryUsdValue" ? usdCompact(v) : assetAmount(v, "LQ"), { ...options, valueMode: "stock", hideYScaleToggle: true });
      if (chartId === "protocolHealthHistoryCounts") lineChart(container, loanSnapshotRows("health", "protocol"), historicalHealthSeries("LoanCount"), integer, { ...options, valueMode: "stock" });
      if (chartId === "protocolHealthHistoryDebt") lineChart(container, loanSnapshotRows("health", "protocol"), historicalHealthSeries("DebtInUsd"), usdCompact, { ...options, valueMode: "stock" });
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
      if (chartId === "protocolDebtCumulative") lineChart(container, rows, [["cumulativeDebtAccrued", "Cumulative accrued", colors.purple], ["cumulativeDebtRepaid", "Cumulative repaid", colors.mint]], usdCompact, { ...options, valueMode: "stock" });
      if (chartId === "protocolDebtCumulativeGap") lineChart(container, rows, [{ key: "cumulativeDebtGap", label: "Sum of current-valued market gaps", color: colors.purple }], usdCompact, { ...options, valueMode: "stock", referenceLines: [{ value: 0, label: "Debt-flow parity" }] });
      if (chartId === "protocolDebtGap") lineChart(container, rows, [
        { key: "dailyDebtGap", label: "Daily market gaps · USD sum", color: colors.amber, negativeColor: colors.mint, type: "bar" },
        { key: "debtGap30d", label: "Rolling 30d market gaps · USD sum", color: colors.purple, type: "line", summary: false }
      ], usdCompact, { ...options, valueMode: "flow", referenceLines: [{ value: 0, label: "Debt-flow parity" }] });
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
      if (chartId === "protocolInterestCumulativeGap") lineChart(container, rows, [{ key: "cumulativeInterestGap", label: "Sum of current-valued market gaps", color: colors.purple }], usdCompact, { ...options, valueMode: "stock", referenceLines: [{ value: 0, label: "Historical parity" }] });
      if (chartId === "protocolInterestGap") lineChart(container, rows, [
        { key: "dailyInterestGap", label: "Daily market gaps · USD sum", color: colors.amber, negativeColor: colors.mint, type: "bar" },
        { key: "interestGap30d", label: "Rolling 30d market gaps · USD sum", color: colors.purple, type: "line", summary: false }
      ], usdCompact, { ...options, valueMode: "flow", referenceLines: [{ value: 0, label: "Repayment parity" }] });
      if (chartId === "protocolInterestCoverage") lineChart(container, rows, [["interestCoverage7d", "Coverage - 7d", colors.blue], ["interestCoverage30d", "Coverage - 30d", colors.purple], ["interestCoverage90d", "Coverage - 90d", colors.mint]], ratio, { ...options, valueMode: "ratio", referenceLines: [{ value: 1, label: "1.00x parity", color: colors.amber }] });
      const allocationSeries = [
        { key: "allocatedProtocolInterestRevenueInUsd", label: "DAO interest", color: colors.blue, type: "bar" },
        { key: "allocatedProtocolOriginationRevenueInUsd", label: "DAO origination", color: colors.mint, type: "bar" },
        { key: "allocatedHoldersInterestRevenueInUsd", label: "LQ stakers interest", color: colors.purple, type: "bar" },
        { key: "allocatedHoldersOriginationRevenueInUsd", label: "LQ stakers origination", color: colors.amber, type: "bar" }
      ];
      if (chartId === "protocolRevenueAllocationDaily") lineChart(container, deep.revenue?.dailyAllocation || [], allocationSeries, usdCompact, { ...options, valueMode: "flow", stackMode: "value" });
      if (chartId === "protocolRevenueAllocationMonthly") lineChart(container, deep.revenue?.monthlyAllocation || [], allocationSeries, usdCompact, { ...options, valueMode: "flow", stackMode: "value", calendarPeriod: "month" });
      if (chartId === "protocolRevenueRunRate") lineChart(container, deep.revenue?.annualizedRunRateSeries || [], [
        { key: "annualizedRunRateInUsd", label: "Annualized DAO run rate", color: colors.mint, type: "line", points: true }
      ], usdCompact, { ...options, valueMode: "stock" });
    }

    function drawRevenueCharts() {
      drawProtocolTimeChart("protocolRevenueRunRate");
      drawProtocolTimeChart("protocolRevenueAllocationMonthly");
      drawProtocolTimeChart("protocolRevenueAllocationDaily");
    }

    function marketChartIds() {
      return ["marketParticipationLoans", "marketParticipationKeys", "marketHealthHistoryCounts", "marketHealthHistoryDebt", "marketCapital", "marketUtilization", "marketDebtRepayment", "marketDebtCoverageOperandsAsset", "marketDebtCoverageOperandsUsd", "marketDebtCoverage", "marketDebtGapAsset", "marketDebtGap", "marketDebtCumulativeGapAsset", "marketDebtCumulativeGap", "marketRepaymentEvents", "marketRepaymentDrySpells", "marketDebtRepaymentDistribution", "marketInterestDaily", "marketInterestCoverageOperandsAsset", "marketInterestCoverageOperandsUsd", "marketInterestCumulative", "marketInterestCumulativeGapAsset", "marketInterestCumulativeGap", "marketInterestGapAsset", "marketInterestGap", "marketInterestCoverage", "marketInterestDrySpells", "marketInterestRepaymentDistribution", "marketRates", "marketLiquidityPressure", "marketRevenueMonthly"];
    }

    function drawMarketCharts(chartId = null, resetRange = false) {
      for (const id of chartId ? [chartId] : marketChartIds()) drawMarketTimeChart(id, resetRange);
      if (!chartId || chartId === "marketKeyDependence") drawMarketKeyDependence();
      if (!chartId || chartId === "marketBorrowConcentration") drawMarketBorrowConcentration();
      if (!chartId || chartId === "marketCollateralizedSupplyConcentration") drawMarketCollateralizedSupplyConcentration();
      if (!chartId) drawMarketHealthChart();
    }

    function drawMarketTimeChart(chartId, resetRange = false) {
      const container = document.querySelector(`#${chartId}`);
      if (!container) return;
      const market = currentMarketSummary();
      let rows = enrichedMarketRows(market.marketId);
      const options = { chartId, period: chartPeriods[chartId], resetRange };
      const nativeAmount = (value) => assetAmount(value, market.symbol || market.marketId);
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
      ], nativeAmount, { ...options, valueMode: "flow", referenceLines: [{ value: 0, label: "Debt-flow parity" }] });
      if (chartId === "marketDebtGap") lineChart(container, rows, [
        { key: "dailyDebtGap", label: "Daily gap · current USD", color: colors.amber, negativeColor: colors.mint, type: "bar" },
        { key: "debtGap30d", label: "Rolling 30d gap · current USD", color: colors.purple, type: "line", summary: false }
      ], usdCompact, { ...options, valueMode: "flow", referenceLines: [{ value: 0, label: "Debt-flow parity" }] });
      if (chartId === "marketDebtCumulativeGapAsset") lineChart(container, rows, [
        { key: "cumulativeDebtGapAsset", label: "Cumulative native debt gap", color: colors.purple }
      ], nativeAmount, { ...options, valueMode: "stock", referenceLines: [{ value: 0, label: "Debt-flow parity" }] });
      if (chartId === "marketDebtCumulativeGap") lineChart(container, rows, [
        { key: "cumulativeDebtGap", label: "Cumulative gap · current USD", color: colors.purple }
      ], usdCompact, { ...options, valueMode: "stock", referenceLines: [{ value: 0, label: "Debt-flow parity" }] });
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
      if (chartId === "marketInterestCumulativeGapAsset") lineChart(container, rows, [{ key: "cumulativeInterestGapAsset", label: "Cumulative native interest gap", color: colors.purple }], nativeAmount, { ...options, valueMode: "stock", referenceLines: [{ value: 0, label: "Historical parity" }] });
      if (chartId === "marketInterestCumulativeGap") lineChart(container, rows, [{ key: "cumulativeInterestGap", label: "Cumulative gap · current USD", color: colors.purple }], usdCompact, { ...options, valueMode: "stock", referenceLines: [{ value: 0, label: "Historical parity" }] });
      if (chartId === "marketInterestGapAsset") lineChart(container, rows, [
        { key: "dailyInterestGapAsset", label: "Daily native interest gap", color: colors.amber, negativeColor: colors.mint, type: "bar" },
        { key: "interestGapAsset30d", label: "Rolling 30d native gap", color: colors.purple, type: "line", summary: false }
      ], nativeAmount, { ...options, valueMode: "flow", referenceLines: [{ value: 0, label: "Repayment parity" }] });
      if (chartId === "marketInterestGap") lineChart(container, rows, [
        { key: "dailyInterestGap", label: "Daily gap · current USD", color: colors.amber, negativeColor: colors.mint, type: "bar" },
        { key: "interestGap30d", label: "Rolling 30d gap · current USD", color: colors.purple, type: "line", summary: false }
      ], usdCompact, { ...options, valueMode: "flow", referenceLines: [{ value: 0, label: "Repayment parity" }] });
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
      if (chartId === "marketRevenueMonthly") {
        const monthly = aggregateMonthlyChartRows(rows);
        lineChart(container, monthly, [
          { key: "grossRealizedRevenueProxyInUsd", label: "Gross realized fee flow", color: colors.blue, type: "bar" },
          { key: "interestRepaidInUsd", label: "Interest repaid flow", color: colors.mint, type: "line" },
          { key: "observableOriginationFeeFlowInUsd", label: "Origination-fee flow", color: colors.amber, type: "line", dash: "5 4" }
        ], usdCompact, { ...options, valueMode: "flow" });
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
        { key: "debt100To110InUsd", label: "HF 1.00-1.10", color: riskPalette[4] },
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
      const marketIds = new Set(deep.marketSummaries.map((market) => market.marketId));
      if (!marketIds.has(selectedMarket)) selectedMarket = deep.marketSummaries.find((market) => market.currentBorrowInUsd > 0)?.marketId || deep.marketSummaries[0]?.marketId;
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
        dataStatusSummary.textContent = headline.failedChecks
          ? `${integer(headline.failedChecks)} failed`
          : headline.partialChecks
            ? `${integer(headline.partialChecks)} known ${headline.partialChecks === 1 ? "boundary" : "boundaries"}`
            : `${integer(headline.passedChecks)} checks passed`;
        dataStatusButton.setAttribute("aria-label", `Data status. ${headline.label}. ${dataStatusSummary.textContent}.`);
      } else {
        dataStatusButton.classList.remove("attention");
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
    function debtFlowReconciliationHelp(reconciliation) {
      return `The official API exposes reported debt repayment but no direct debt-accrued flow. Debt formation is inferred per market in native units as current borrow minus prior borrow plus reported debt repaid, floored at zero; repayment is added back before the inferred flow is compared with reported repayment. ${gapValuationHelp("protocol")} Historical USD accrued and repaid totals remain visible as gross flow context, but their difference does not define the gap. The first observation is unavailable. Liquidation profit is protocol revenue, not liquidated principal.`;
    }
    function interestFlowHelp(scope = "market") {
      return `Interest accrued and repaid are direct official flows. Their gap is calculated in native asset units before valuation. ${gapValuationHelp(scope)} It is a repayment-timing measure, not an extra balance to add to outstanding borrow.`;
    }
    function gapValuationHelp(scope = "market") {
      return scope === "protocol"
        ? "Gap quantities are calculated in each market's asset units before USD valuation. Each market's daily, rolling, or cumulative native gap is valued at that observation's implied price, then the USD market values are summed; unlike asset units are never added."
        : "Accrued and repaid quantities are netted in this market's asset units first. The USD view values the resulting daily, rolling, or cumulative native gap at each observation's implied asset price, so equal native accrual and repayment close the gap despite price movement.";
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
        
    function renderInfoBubble(title, explanation, formula = "", range = "") {
      if (!explanation && !formula && !range) return "";
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
        </span>
      </span>`;
    }

    function kpi(label, value, note = "", help = "") {
      const normKey = String(label || "").replace(/[—–·]/g, "-").replace(/\s+/g, " ").trim();
      const meta = APP_KPI_METADATA[label] || APP_KPI_METADATA[normKey] || {};
      const helpText = help || meta.explanation || meta.description || "";
      const formula = meta.formulaHtml || meta.formulaText || "";
      const range = meta.range || "";
      const infoBubble = renderInfoBubble(label, helpText, formula, range);
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
    function pct(value) { const numeric = displayNumber(value); return numeric === null ? "n/a" : `${(numeric * 100).toFixed(1)}%`; }
    function signedPct(value) { const numeric = displayNumber(value); return numeric === null ? "n/a" : `${numeric > 0 ? "+" : ""}${(numeric * 100).toFixed(1)} pp`; }
    function ratio(value) { const numeric = displayNumber(value); return numeric === null ? "n/a" : `${numeric.toFixed(2)}x`; }
    function integer(value) { const numeric = displayNumber(value); return numeric === null ? "n/a" : new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(numeric); }
    function number(value, decimals = 2) { const numeric = displayNumber(value); return numeric === null ? "n/a" : numeric.toFixed(decimals); }
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
