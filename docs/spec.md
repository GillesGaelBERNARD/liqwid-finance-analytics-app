# Liqwid Finance Market Dynamics App Specification

## Purpose

The app helps analysts understand Liqwid lending and borrowing behavior across all markets returned by the official API, with special attention to repayment timing, short-term repayment intensity, current loan health, and stress contribution.

The generated HTML app is a client-only analysis application. The one HTML file contains the API client, calculations, persistence workflow, and interactive chart renderer. It never requires a local app server and it does not embed a required data snapshot. A newly shared copy must open safely with zero data and guide the analyst through choosing local persistence and performing the first complete fetch.

## Users

The primary user is a DeFi analyst who wants a repeatable market monitoring workflow, not a one-off dashboard screenshot.

## Data Source

Only the official Liqwid v2 API is used for data:

`https://v2.api.liqwid.finance/graphql`

The app must record API metadata, fetch time, query variables, and row counts so a future reviewer can reproduce the analysis.

## Required User Flows

1. The analyst opens `data/liqwid/liqwid-analysis-app.html` directly. No launcher, localhost process, package runtime, or server is involved.
2. With no selected data, the app makes **Open existing data archive** the primary action and **Fetch full data history** secondary. Fetching full history first opens a confirmation dialog that explains the large official-API request, and makes Cancel available before a storage picker or network request occurs. The app shows no empty navigation tab or Settings panel. No chart renderer assumes that data already exists.
3. **Fetch full data history** prefers the browser's native writable-directory picker. When that API is unavailable or blocked by the page origin, the app uses the proven standalone-file pattern: native **Save as...** for one portable Liqwid archive, with a normal browser download as the final fallback. No unsupported picker becomes a dead end.
4. Analyst moves through a small set of tabs: overview, revenue, historical liquidations, current exposure, markets, and protocol impact.
5. Analyst changes the window on each data-backed chart independently using Week, Month, 3 months, YTD, Year, and All. The window is anchored to the latest observation, not the wall-clock date.
6. Every useful chart uses an interactive browser-native view. Time series show exact values on hover or keyboard focus, preserve irregular date spacing, leave real gaps for missing values, and provide a full-history navigator with pan and zoom. Arrow keys inspect observations, native From/To date fields expose range selection to keyboard users, and wheel zoom requires Ctrl/Command so charts never trap normal page scrolling. Quantitative Y-axes on time-series and scatter views expose Linear and Symlog modes beside the Y axis and can be rescaled by dragging the axis; dragging upward narrows the domain, dragging downward widens it, and zero remains anchored. Reset, focused-axis Home/Enter, and axis double-click restore automatic linear scaling. Axes representing a bounded 0–100% quantity stay fixed to a linear 0–100% domain and omit the Linear/Symlog controls. The persistent summary names the visible date interval and updates with the visible window; no separate action repeats that calculation. Compare mode selects two dates or an interval directly on the graph; stock charts show endpoint change while flow charts show interval totals, observed-day average, and peak.
7. Linked panels keep unlike units honest: protocol and market balance sheets pair USD balances with a separate utilization chart; debt balance is separate from repayment flow; cumulative interest is separate from rolling flow and coverage ratios. Cross-market evidence uses interactive contribution timelines, rankings, matrices, distributions, and bubble maps rather than static screenshots.
8. Analyst selects one market at a time in the market view, with large full-width interactive graphs for capital, utilization, debt repayment, cumulative debt-flow gap, debt- and interest-repayment dry spells, interest flow, coverage, rates, interest gap, repayment intensity, loan health, and revenue flow wherever the required official fields exist. The HTML app has no static PNG dependency.
9. Charts are presented one per row at full available width. Every qualifying market, asset, or observed-key row is rendered; cross-market timelines keep every market as its own series instead of truncating to a top-N set or aggregating the remainder as `Other`. Exact-value tables likewise retain every row. Time-series clipping bounds preserve the full radius and stroke of observations at the first and last visible timestamps. Bubble charts reserve enough plot-margin space for the full radius and stroke of every visible bubble, including points exactly on an axis boundary. Their point-area and color readouts switch from the full encoding range to the hovered or keyboard-focused point's exact value, then restore the range when no point is active. Selected quantitative horizontal category charts expose Linear and Symlog controls for their X axis. Bounded 0–100% category charts stay linear, omit scale controls, and label exactly 0%, 25%, 50%, 75%, and 100%.
10. Protocol impact includes separate full-width, cross-market cumulative curves for observed-key borrow concentration and observed-key collateralized-supply concentration. Every qualifying market and rank remains rendered. Markets and their controls are ordered from highest to lowest first-key cumulative share and use the same ordered mint-to-azure-to-violet color gradient, with the first-key share printed in each control. Market controls emphasize curves in color or mute them to a thin pale-grey context line; they never remove a market from the comparison. The log-spaced rank axis uses exact integer tick values, always anchoring ranks 0, 1, and 2 when present, so a tick label can never describe a fractional rank or appear offset from its point.
11. Once data is open, the persistent header always exposes **Open another data archive**, **Save data**, and **Fetch new data**. Fetching calls the official Liqwid GraphQL endpoint directly and refreshes market history, market parameter history, protocol liquidation history, current active-loan health, and official fee/revenue history. Every raw response is captured under an immutable refresh-run path before cleaning.
12. The complete refreshed dataset is staged in memory. Only after every required API surface and every derived analysis succeeds are immutable raw captures, canonical clean CSV tables, metadata, and the three append-only loan-observation tables committed to the selected folder or archive and all views redrawn. Deterministic analysis outputs are rebuilt in memory and are not persisted. A cancelled picker makes no API request; a failed refresh leaves the last good local data and display intact.
13. Every chart and analysis visible in the HTML app is rebuilt from the same newly refreshed data generation. The app contains no external PNG dependencies or stale embedded analysis. A source field that the official API does not expose is described as unavailable rather than substituted with old data.
14. Refresh is cursor-based and avoids redundant API work. Saved market and parameter rows are requested only after their latest saved dates; completed liquidation and fee months are immutable cache hits; daily liquidation detail is requested only for missing days in materially non-zero months and uses small batched aliases. App ranges are inclusive calendar dates. Every Liqwid GraphQL `startDate` is serialized as the first requested day at `00:00:00Z`; every `endDate` is serialized as the last requested day at `23:59:59Z`. Cache rows are reusable only when their recorded request and response bounds prove this contract. Only current snapshots and an incomplete open month are fetched again.
15. The app remembers the most recently used picker-granted archive or folder handle in browser-local IndexedDB. On the next launch it reopens that location automatically when read permission remains granted. When the browser requires renewed permission, the empty state offers one-click **Reopen last data** plus **Open another data archive**; a plain file-input fallback is never represented as a silently reusable path.
16. Once data is open, a quiet **Data status** utility appears with the archive actions, outside the analytics tab hierarchy. It opens an overlay without changing the active analytics scope, section, selected market, or scroll position. The overlay makes the main evidence directly visible: market-history continuity and required-field integrity, liquidation and revenue completeness, market-revenue attribution, parameter coverage, LQ and price observation boundaries, current loan-population boundaries, and reconciliation results with their numeric differences. Successful completeness and reconciliation results use explicitly positive wording and success styling; zero missing rows or zero reconciliation failures must never inherit warning or failure treatment. Provenance, row inventories, validation operands, the rules and tolerances behind each check, and a source-derived viewer-build fingerprint remain available in a collapsed technical-audit area.
17. Data-status content is produced through one centralized registry of coverage cards, checks, populations, and limitations. Whenever a future dataset or analysis adds a meaningful completeness rule, reconciliation, population boundary, provenance constraint, or API limitation, that signal is added to this registry. The global state reduces both coverage cards and checks: any failure is **attention**; otherwise any partial or unavailable item is **limited**; only an all-pass registry is **healthy**. A completed refresh writes one classified all-position loan table and derives the same active-debt, liquidatable, and collateral-bearing populations for the live analysis and every subsequent reopen.

## Client-only persistence

Browser persistence prefers a user-selected writable folder opened through `showDirectoryPicker`. The app never asks for or attempts to infer an absolute path. When writable-directory access is unavailable, `showSaveFilePicker` selects one portable ZIP archive containing the same relative data layout; when neither native picker exists, the same archive is downloaded normally. A standard file input reopens an existing archive in every browser host that supports local file selection.

The folder or archive keeps `raw/api`, `clean`, `computed`, and `metadata` separated. Raw official GraphQL captures use compact JSON only where preserving response structure, request variables, and fetch metadata is necessary. Canonical clean tables, metadata, and the three append-only observation histories use CSV. A dataset that can be deterministically recreated from a canonical saved table is not persisted as another file. Portable ZIP saves use standard DEFLATE where supported and retain compatibility with earlier uncompressed archives.

## App Structure

Static app navigation has two levels. The sticky first level contains exactly **Protocol analytics** and **Market analytics** so scope remains visible while scrolling. The sticky second level contains focused analytical sections for the active scope. A persistent location label states the active scope and section even when tab rows wrap. Market analytics also keeps the selected market visible in this navigation area.

Protocol analytics sections:

- Overview: current protocol totals, balance-sheet history, utilization, and the current-valued interest gap (each market's cumulative native interest gap valued at its latest observed price, then summed in USD).
- Debt flows: debt formation, repayment, cumulative and rolling gaps, and coverage, introduced by current high-level flow statistics.
- Interest flows: interest formation, repayment, current-valued cumulative and rolling gaps, and coverage, introduced by current high-level flow statistics.
- USD stablecoin yields: multi-market comparative supply APR analysis across USD-pegged stablecoin markets (DJED, USDC, USDM, USDA, PYUSD, IUSD, etc.), top yield asset indicator, supply-weighted aggregate stablecoin yield over time, and comparative multi-market yield dynamics with customizable date ranges.
- Revenue: year-to-date collected retained-interest and origination revenue first, then all-time collected revenue, followed by secondary accrual-based DAO allocation and a separate LQ-staker section. Collected revenue covers the full official overview history. Accrued recipient statistics include every complete daily allocation through the latest available full day. Liquidation profit remains exclusively in Liquidations.
- Liquidations: confirmed protocol-level liquidation-profit history. The full-period profit is grouped with its exact observable date range.
- Exposure: an opening summary ordered as dollar debt exposure, asset highlights, and a colored 7/30/90-day debt-and-interest coverage matrix; followed by rising market stress, borrowed-market pressure, collateral-side health exposure, exact observed-key aggregation, market dependence on observed keys, HF-threshold concentration sensitivity, and the bounded supply-side view. The opening debt cards show collateral-attributed debt at HF <= 1.25 and HF <= 1.10; each card carries the top-three observed-key share for its matching threshold as a secondary line. The coverage grid is the only coverage-by-window visualization in this section.
- Market impact: historical and current market stress attribution, one consolidated current risk-indicator matrix, contribution timelines for interest accrual, interest repayment, positive interest gap, outstanding debt, debt repayment, and positive debt gap, a current contribution-share bar snapshot, and active-debt state, without revenue or concentration analysis. The debt timeline is each market's daily share of outstanding borrow; flow timelines use trailing 30-day shares. The matrix uses fully visible column labels and a prominent lower-to-higher legend at the top-left.
- Participation and concentration: irregular saved observations of protocol-wide active-debt positions and their observed keys, health-factor bands, and cross-market observed-key borrow and collateralized-supply concentration.
- LQ token & staking: current and historical LQ price, staked balance and ratio, total staked value, and DAO treasury LQ.
- Risk & Parameters: the final protocol tab. It presents a protocol parameter landscape rather than claiming one global rate model. Current cards and charts combine market-level rate, capacity, income-allocation, liquidation, operational, and market-collateral settings; the rate-curve atlas shows the eight largest borrowed markets with observable parameters. Current-only `liqwid.data.markets.parameters` guardrails remain visibly separate from event-history fields.

Protocol parameter roll-ups exclude POL, matching all detailed market analytics. Daily historical roll-ups apply the last exact `analytics.marketParamsHistory` event effective by the end of each UTC day and weight each covered market value by that day's official market borrow in USD. Parameter coverage is covered borrow divided by total borrow. Borrow above kink is `max(0, borrowInUsd - kink * supplyInUsd)` per market before summing. Explicit supply-cap headroom is `max(0, supplyCapNative * currentAssetPriceInUsd - currentSupplyInUsd)` per capped market before summing. Missing parameter rows are excluded and exposed through the coverage series; they are never treated as zero or filled from current values. Exact governance-event tables retain timestamps and transaction hashes.

The official history surface covers rate landmarks, utilization and supply caps, income allocation, and raw rate-model coefficients. Current liquidation, collateral, fee, and batching guardrails come from `liqwid.data.markets.parameters`; the app does not backfill them before the first official current snapshot that contains those fields.

Market analytics sections, for one persistently selected market at a time:

- Overview: current KPIs, capital balances, utilization, rates, and liquidity pressure.
- Debt repayments: daily flow, a colored 7/30/90-day debt-coverage matrix, fast-versus-slow repayment intensity, dry spells, and a balance reconciliation that separates reported repayment from unclassified borrow reductions.
- Interest: interest formation and repayment, reported flow differences, and a colored 7/30/90-day interest-coverage matrix.
- Selected-market debt and interest top statistics show each current-valued cumulative reported flow difference in USD together with its native value and the exact latest implied asset price used for that valuation.
- Revenue: collected revenue first, separating directly reported market origination fees from retained-interest collections attributed to the market. The attributed interest series reconciles each official daily protocol retained-interest total across markets using parameter-weighted interest repayments. Accrual-based supplier and protocol/reserve income follows as a less prominent section, then a current annualized run rate. Full borrower interest repayments remain visible as secondary activity and are never treated as revenue by themselves.
- Health: current health-factor debt shown as one horizontal row per HF tranche, plus saved health-factor tranche history through time. The opening market summary shows debt at HF <= 1.25 and critical debt at HF <= 1.10; each dollar value carries the number of active-debt positions at or below the same threshold.
- Participation and concentration: current loan-row coverage, the number of distinct API-observed keys across current `HAS_DEBT` positions, the largest observed-key share of official market borrow, irregular saved observations of active-debt positions and their observed keys, plus cumulative observed-key borrow and collateralized-supply concentration.
- Parameters History: the final market tab. It groups every currently effective `analytics.marketParamsHistory` field into rate landmarks, utilization and capacity limits, income allocation, and raw interest-model coefficients; identifies the exact governance-update timestamp and transaction hash; plots the current borrower-APR and supplier-APY curves; and then shows full-history parameter charts and an exact governance-update table.

Parameter history is event-based. Each row is effective from its exact governance-update timestamp until the next row; the app may add pre-change points solely to draw horizontal steps, but it must never imply that parameters drifted gradually or that a governance update occurred on an invented daily timestamp. The current rate curve uses only the latest official v2 parameter row. Borrow APR is piecewise linear through the official base, optimal-utilization, and maximum-at-utilization-cap rate landmarks. Supplier APY is `(1 - utilization) * baseSupplierAPY + utilization * borrowerAPR * incomeRatioSuppliers / incomeRatioSum`. The active curve ends at `borrowCap` when set and otherwise at 100% utilization; its axis remains fixed at 0–100%, and the current-utilization and optimal-utilization markers remain visible. Parameter history is unavailable rather than inferred when the official endpoint returns no row.

Each section opens with a short statement of the analytical question it helps answer. The analytics views do not display data-fetch mechanics, API/schema limitations, refresh-process descriptions, generic chart-control instructions, or method/result/interpretation boilerplate. Essential metric definitions and caveats remain next to the relevant evidence.

Data status is not an analytics scope or section. Its access sits beside **Open another data archive**, **Save data**, and **Fetch new data**. The visible overlay contains four compact evidence groups: Data coverage, Current loan population, Consistency checks, and Known coverage boundaries. It uses direct values such as markets covered, missing calendar days, invalid required rows, complete periods, position counts, represented borrow share, and reconciliation differences rather than an opaque integrity score. Market-history coverage fails for missing series, duplicate or out-of-order dates, invalid dates, or missing/non-numeric `supplyInUsd`, `borrowInUsd`, `liquidityInUsd`, or `utilizationPercentage`; calendar gaps and stale tails are partial coverage. The expected latest historical day is the earlier of the requested end and the last complete UTC day before generation. Protocol-revenue coverage independently requires every closed UTC day from the official 2026-01-01 coverage floor through that same expected latest day; missing days are partial, while invalid, duplicate, out-of-order, or incomplete closed rows fail. The debt-flow identity check validates every eligible market-day in native units as `borrow change = inferred formation - reported repayment - unclassified reduction`; any residual beyond the numeric tolerance fails and identifies the affected markets and dates. Known boundaries explicitly state that the official history does not classify the cause of every borrow reduction and does not expose a current principal-versus-interest balance split. Loan-row reconciliation is split into two checks using raw `HAS_DEBT Loan.amount` in USD: coverage below 99.5% is undercoverage, while coverage above 100.5% is an API-snapshot synchronization boundary. The separate batch-cycle check compares adjusted loan debt in USD with market borrow in USD at an exact ±$1 tolerance; neither operand is multiplied by asset price again. Protocol supply, borrow, and liquidity each reconcile against summed market totals. Current market and current-loan checks each reconcile raw envelope `rowCount`, API `totalCount`, raw result length, and canonical clean rows. The latest full market-history and parameter-history raw row counts must also equal their canonical clean tables for every market. Revenue rows are checkable only when all six protocol/holder total, interest, and origination operands are finite; a missing operand fails closed and exposes the affected date. Parameter history is not complete unless a cursor exists for every current API market and every cursor reaches the requested end. LQ, participation, health, and reconciliation observations report stale or incomplete latest snapshots; reconciliation-observation scope is measured against currently borrowed markets. Archive provenance reports the endpoint and schema declared by the archive, verifies the latest raw capture and raw-envelope sources, and reports portable-manifest validation when applicable. Every visual state includes a text badge in addition to color and symbol. Per-market batch operands expand into expected market borrow, raw loan amount, actual adjusted loan debt, difference, tolerance, and classification. The collapsed technical audit retains archive provenance, dataset inventory, validation evidence, and validation rules. Opening an archive, completing a first full-history fetch, and completing an incremental fetch each rebuild Data status from the newly active dataset before rendering it.

Detailed data tables never interrupt a chart sequence. When a section needs exact-value tables, they are grouped after every chart in a clearly marked data-tables area at the bottom of that section.

The app ends with protocol-impact studies. Contextual metric explanations and caveats stay alongside the relevant evidence.

The POL market remains included in official protocol totals but is excluded from detailed market summaries, rankings, and attribution charts.

Rule: every visible chart must make its market, period, units, and transformation obvious. Directly beneath the chart title, it also states the specific analytical question that chart helps answer. That chart-level question is narrower than, and never an exact repetition of, the broader section question.

## Metrics

Core current-state metrics:

- Supply USD: capital supplied to a market.
- Borrow USD: outstanding borrowed capital.
- Liquidity USD: supply minus borrow, as reported by the API.
- Utilization: borrow divided by supplied liquidity. High values show withdrawal liquidity pressure and strong borrowing demand.
- Borrow APR and supply APY: incentive signals produced by the market model.

Historical repayment metrics:

- Debt repaid USD: daily debt repayment amount.
- Debt accrued: inferred new debt formation, calculated independently for each market in its native asset as `max(0, current borrow - prior borrow + reported debt repaid)`. The first observation is unavailable. This is derived from official fields because the API exposes no direct debt-accrued flow.
- Unclassified borrow reduction: `max(0, -(current borrow - prior borrow + reported debt repaid))` in native asset units. It completes the daily identity `borrow change = inferred formation - reported repayment - unclassified reduction`. The term identifies the amount needed to reconcile the reported balance; it does not infer whether the cause was liquidation, migration, settlement, another accounting path, or API aggregation behavior.
- Reported debt-flow difference: inferred native debt formation minus native reported debt repayment. Rolling and cumulative differences are accumulated in native units first. Their USD values are then calculated at each observation from that market's current native-to-USD price. Consequently, a current-valued USD curve can move solely because the asset price changes while its native cumulative amount is unchanged. It is not current debt; current `borrowInUsd` is the remaining principal measure.
- Native-to-USD price: inferred per market and observation from matching official native and USD fields, preferring the current borrow ratio and falling back to supply, liquidity, debt repayment, interest accrual, or interest repayment ratios when necessary. Accrued and repaid sides of one gap must never be converted at different prices.
- Protocol debt-flow differences and unclassified reductions: the sum of each market's already calculated current-valued USD amount for the same observation and window. Native quantities from different assets are never added together. Protocol analytics remains USD-only; native and price-neutral detail belongs to the selected-market view.
- Interest accrued USD: daily interest generated by outstanding debt.
- Interest repaid USD: daily interest paid back.
- Reported interest-flow difference: native interest accrued minus native interest repaid for each market. Positive daily values mean reported accrual exceeded reported repayment that day.
- Cumulative reported interest-flow difference: cumulative native interest accrued minus cumulative native interest repaid, valued in USD at the market's current observed price. It is a historical flow difference, not a current interest receivable. The official API does not expose a current principal-versus-interest balance split. Its current-valued USD curve can move solely because the asset price changes while the native cumulative amount is unchanged.
- Protocol interest-flow differences: the sum of current-valued USD differences calculated independently for every market. The protocol difference is never calculated by subtracting historical `interestRepaidInUsd` from historical `interestAccruedInUsd`, because those flows may have been converted at different asset prices. Protocol analytics remains USD-only.
- Debt coverage ratio: within each market and trailing window, native debt repaid divided by native inferred debt accrued. Both native window totals are also valued at the window-end asset price for secondary USD context; historical daily USD conversions are never divided.
- Interest coverage ratio: within each market and trailing window, native interest repaid divided by native interest accrued. Both native window totals are also valued at the window-end asset price for secondary USD context. Values below 1 mean current repayments are not keeping pace with new interest accrual.
- Protocol coverage: for every observation and window, each market's native accrued and repaid totals are valued at that market's current observed price; the protocol ratio divides the sum of current-valued market repayments by the sum of current-valued market accruals. Unlike native assets are never added, and historical daily USD conversions are not used.
- Coverage presentation: selected-market coverage shows the native accrued and repaid quantities first, the coverage ratio, and current-price USD equivalents second. Protocol coverage shows the ratio and current-valued USD market sums because no meaningful cross-asset native total exists.
- Current borrow: latest outstanding borrowed capital in USD.
- Maximum historical borrow: largest observed daily borrow balance in USD, with its date.
- Accumulated debt repaid: sum of reported daily `debtRepaidInUsd` flows. This is cumulative flow and can exceed a balance snapshot when capital is repaid and borrowed again.
- Borrow drawdown from peak: maximum historical borrow minus current borrow, also shown as a share of maximum borrow. This describes the current balance relative to its own observed peak without treating the market's opening zero as an economic baseline.
- Repayment activity days: days with debt repaid greater than zero.
- Longest observed run with no debt repayment: the longest run of consecutive daily observations with zero reported debt repayment.
- Interest-repayment dry spell: consecutive observed days without interest repayment. Missing calendar dates break both dry-spell lines.
- Fast repayment intensity: an EWMA of daily debt repaid with a 1.5-day half-life. It reacts immediately to repayment bursts and decays smoothly; it is a recency-weighted daily rate, not a classified event or cumulative amount.
- Repayment regime baseline: the trailing 30-calendar-day average of daily debt repaid. It remains in the same USD-per-day unit as the raw flow and fast EWMA.
- Repayment unevenness across active days: normalized Herfindahl-Hirschman concentration of each active repayment day's share of total repayment. Zero means equal repayment amounts on every active day; one means a single day explains all repayment.
- Repayment half-life proxy: days required for cumulative repayments over a period to reach half of period repayments.
- Current active-debt loans: current loans with outstanding debt returned by `liqwid.data.loans`.
- Health factor: current collateral buffer indicator exposed by the loan endpoint. Lower values are closer to liquidation.
- Debt-weighted health factor: health factor averaged with active debt as weight.
- Health-factor bucket debt: active debt grouped by current health-factor range.

Risk-reading metrics:

- High utilization days: days above a configurable utilization threshold.
- Low liquidity buffer: liquidity divided by borrow. Low values show limited room for withdrawals or borrow demand.
- APR stress: borrow APR percentile over the selected period.
- Repayment concentration: normalized HHI across all active repayment days, avoiding a fixed number of days that favors longer-running markets.
- Market stress score: logistic index combining utilization pressure, borrow-to-liquidity pressure, weak 30-day interest coverage, and positive 30-day borrow growth.
- Market stress contribution: market stress score multiplied by the market's share of protocol borrow.
- Loan-health pressure: share of active debt near low health-factor bands, used as a current-state overlay in the risk model.
- Collateral-attributed debt: each active loan's debt is allocated across its collateral assets in proportion to their current USD values. This makes protocol exposure comparable by collateral without claiming that a specific collateral dollar directly backs a specific borrowed dollar inside a multi-collateral loan.
- Collateral shock exposure: active debt whose loan health factor would be at or below 1.00 after a hypothetical decline in one collateral asset. For collateral share `s` and price shock `p`, the scenario health factor is `current HF * (1 - s * p)`. Scenarios are independent and must not be added together.
- Observed-key exposure ranking: all current active-debt loan rows are grouped by the API's current `publicKey`. For every anonymized observed key, the app shows total attributable debt, share of official protocol borrow, low-HF debt at the selected cutoff, and the share of that key's debt below the cutoff. A key is an exact API grouping, not an inferred actor or person.
- Market dependence on observed keys: each market is a 100% row whose denominator is official current market borrow. Segments are the largest observed key, the next two observed keys, other mapped observed keys, and unmapped borrow. Loan-row coverage is printed beside the market; the unmapped segment is hatched. Coverage below 100% is labelled undercoverage and coverage above 100% is labelled overcoverage; only exact equality receives the per-row reconciled label. Nearby warnings use the inclusive 99.5% to 100.5% acceptance band: lower coverage warns that returned loan sums may differ due to timing relative to the 4-hour market batch cycle update or that the official loan API may be missing positions, while higher coverage explains that the official loan-detail and market-aggregate API surfaces may represent different refresh snapshots. Overcoverage is not presented as extra mapped borrowing. Concentration is never calculated only over mapped debt.
- HF-threshold concentration sensitivity: for every displayed HF cutoff, low-HF debt is summed across all observed keys. Top-1 and top-3 concentration equal the qualifying debt held by the largest one or three observed keys divided by qualifying debt attributable to every observed key at that same cutoff. Every observed key remains eligible; no subset filter or cumulative-coverage stopping rule is used.
- Represented collateralized supply: current supplied receipt-token value appearing in loan collateral, split between loans with and without current debt. This is a partial view of supply ownership, not total supplier concentration and not pool liquidity.

Financial-sustainability metrics:

- Collected revenue: for each complete UTC day, `analytics.overview.current.revenueFromRepaidInterestInUsd + loanOriginationFeesInUsd + loanOriginationFeesMinAdaInUsd`. It is repayment-timed retained-interest revenue plus upfront origination fees. The repaid-interest revenue field combines treasury and LQ-staker recipients because the official API exposes no repayment-time recipient split. It excludes liquidation profit, supplier-side earnings, ADA staking rewards, and POL accrual.
- Year-to-date collected revenue: uses the same collected-revenue formula, restricted to complete official overview days in the calendar year containing the latest complete collected-revenue row. The displayed period runs from the first available complete row on or after January 1 through the latest complete row, so any partial coverage remains explicit rather than being silently inferred.
- Collected-revenue history: complete daily overview rows are shown directly and grouped into UTC calendar months component by component. The current partial month remains visible. A schema-valid daily row must preserve all three collected-revenue source fields, so older cached overview rows missing the minimum-ADA field are refetched.
- Attributed collected market interest revenue: for market `m` on complete day `d`, first calculate `weight[m,d] = marketHistory.interestRepaidInUsd[m,d] * (1 - incomeRatioSuppliers[m,d] / incomeRatioSum[m,d])`. Then allocate `overview.revenueFromRepaidInterestInUsd[d] * weight[m,d] / sum(weight[all markets,d])`. The official protocol total is actual collected revenue; its market allocation is modeled. The calculation is unavailable for the entire day if a market with positive interest repayment lacks an effective parameter row, if official and summed market interest repayments fail reconciliation, or if the official retained-interest total is positive while all weights are zero.
- Attributed collected market revenue: attributed collected market interest revenue plus the market's directly reported `loanOriginationFeesInUsd + loanOriginationFeesMinAdaInUsd`. Year-to-date totals are shown only when every complete market day in the displayed year-to-date period has an eligible retained-interest attribution. The current partial UTC day is excluded.
- Accrued market interest allocation: for each complete market day, apply the latest parameter event effective by that UTC day's end. Supplier income is `interestAccruedInUsd * incomeRatioSuppliers / incomeRatioSum`; protocol/reserve interest revenue is `interestAccruedInUsd * (1 - incomeRatioSuppliers / incomeRatioSum)`. This reproduces Liqwid's accrual-based market presentation, but neither component proves that the interest has been repaid. Intraday parameter changes are necessarily represented by the closing effective parameter because the official market history is daily.
- Projected annualized market interest income: latest complete `borrowInUsd * borrowApr`, divided into supplier and protocol/reserve amounts with the same effective income shares. It is a point-in-time run rate, not collected revenue, a forecast, or a guarantee.
- Official DAO/treasury revenue: `analytics.fees.dailyProtocolRevenue`, which must reconcile to `breakdown.borrowInterestAccruedForProtocol + breakdown.loanOriginationFeesForProtocol`. It is accrual-based and shown only for the endpoint's observable coverage beginning 2026-01-01; it is never backfilled from overview fields or a current allocation parameter.
- Official LQ-staker allocation: `analytics.fees.dailyHoldersRevenue`, an accrual-based allocation kept in its own section and reconciled to the holder/staker interest and origination fields in `breakdown`.
- Daily allocation detail: one inclusive full UTC day per logical row. A bounded GraphQL request may carry several separately aliased one-day fields, but no returned day is combined with another day.
- Cumulative allocation: every complete daily allocation row from the coverage floor through the latest available full day is summed directly, including complete days in the current partial month. The current UTC day, incomplete rows, and failed rows are excluded.
- Monthly allocation: the canonical one-day rows are grouped by UTC calendar month and summed component by component. A month is complete only when every calendar day is present, closed, and reconciled; the current partial month remains visible as a partial reporting period.
- Protocol-revenue run rate: at each eligible complete day, the latest 90 consecutive complete UTC days of official DAO/treasury revenue multiplied by `365.25 / 90`. The current UTC day, missing days, and failed reconciliation rows are excluded. A missing day breaks eligibility until a new 90-day consecutive window exists. This is a historical pace indicator, not a forecast.
- Operating cost coverage and profit margin are unavailable because the official API does not expose infrastructure, staffing, incentive, listing, oracle, or other operating expenses.

Metric eligibility and activity states:

- **No borrow activity:** maximum historical borrow and accumulated debt repaid are both at or below USD 1. Repayment concentration, repayment lag, dry-spell risk, and interest coverage are not calculated.
- **Dormant:** historical maximum borrow is above USD 1 but current borrow is at or below USD 1. Historical flows are described as past behavior and are not presented as live exposure.
- **Very low activity:** maximum historical borrow is below USD 10,000 or fewer than 10 active repayment days are observable. Descriptive balances and EWMA intensity remain visible, but unstable rankings are withheld or explicitly qualified.
- Interest coverage is `n/a` when the relevant window has no positive interest accrual. Repayment HHI is `n/a` with fewer than two active repayment days.

## Chart Set

Browser-native charts use a small dependency-free SVG system with six shapes: linked line/bar time panels, threshold event timelines, stacked contribution timelines, ranking or stacked-ranking bars, matrices, and bubble scatter. Temporal charts share responsive ticks, exact pointer/keyboard values, a draggable full-history navigator, native date-range inputs, Compare and Pan modes, zoom controls, and visible-range summaries. Quantitative time-series and scatter Y-axes place their Linear/Symlog switch inside the chart beside the Y axis, provide draggable zero-anchored scaling, and share one reset behavior that restores an automatic linear scale. Symlog applies `sign(x) * log1p(abs(x) / c)` with an automatically selected, magnitude-aware linear threshold `c`, so negative values, zero, and positive values all remain plottable. Missing values break a line; numeric zero remains a valid observation. Percent stacks and bounded percentage axes keep an honest fixed linear 0–100% domain and do not offer manual or nonlinear Y scaling. Curated same-unit panels replace arbitrary dual axes. Views render lazily when their tab is opened so the standalone page does not build every SVG at startup.

Market contribution timelines select and order their displayed markets by the latest rolling contribution, largest first, so the legend and stack emphasize the current situation; the aggregated Other series remains last.

Dynamic-data boundary:

- Protocol and market capital, utilization, debt repayment, interest, rates, rolling coverage, interest gap, market contribution, and market-map views derive from the current browser bundle and redraw after folder open or refresh.
- Monthly/daily liquidation analysis, current active-loan health, market parameter allocation, and official fee/revenue views are fetched and recomputed by the browser as part of the same complete refresh.
- Current exposure analysis fetches one unfiltered loan book with observed keys, adjusted debt, and per-loan collateral composition. Active-debt, liquidatable, and collateral-bearing populations are classified once and filtered in memory. It never requires an address input because `liqwid.data.loans` is the current protocol-wide loan listing; address input remains required for account transaction history.
- The API does not expose all supplier receipt-token holders. Supply-side concentration is therefore limited to observed keys whose receipt-token claims appear in loan collateral. `supply - represented collateralized supply` is labelled supply not represented as loan collateral; it is never labelled leftover liquidity. Reported market liquidity remains the separate official pool balance.
- Historical liquidation attribution by market is not rendered because the official API does not expose it. Repayment anomalies are never relabelled as liquidations.

User-triggered loan snapshot history:

- Loan participation and health-factor history is observation-driven. One observation is appended only after a successful complete Fetch + Save refresh; no scheduled or assumed daily collection exists.
- Every observation preserves its exact UTC fetch timestamp, including multiple observations on the same UTC day. Missing intervals are never filled, interpolated, annualized, or converted into per-day rates.
- The immutable raw capture preserves one complete unfiltered loan book. `adjustedAmount`, `healthFactor`, and `collateral` reproduce the active-debt, liquidatable, and collateral-bearing populations without three duplicate filtered responses. This is the only protocol-wide API surface exposing current loan positions, observed keys, and health factors, and it exposes no historical snapshot argument.
- The participation history contains only current-only active-debt facts from `HAS_DEBT`: active-debt position count and distinct observed-key count at protocol and borrowed-market scope. Unfiltered and zero-debt positions never contribute to these metrics. It must not duplicate balances, rates, repayments, revenue, parameters, or other values already exposed by historical API endpoints.
- Historical health-factor observations are derived from the complete active-debt loan book using the same health-factor buckets as the current loan-state analysis. They preserve loan count and debt in USD by bucket at protocol and borrowed-market scope.
- Exact `publicKey` values remain confined to raw API captures and current clean row-level exports. Computed historical tables contain counts and aggregates only.
- The UI treats lines between irregular observations as visual guides. It describes changes as differences between saved observations, not events known to have occurred at a particular time between fetches.

Current-exposure charts:

- Current utilization versus 7-day utilization change, sized by current borrow and colored from light mint through amber and orange to dark red as pressure rises.
- Native-first debt and interest coverage for trailing 7-, 30-, and 90-day windows, with secondary current-price USD values; protocol windows sum current-valued market operands.
- Active debt by health-factor band and borrowed market.
- Collateral-attributed debt by health-factor band, ordered by debt at HF <= 1.25.
- Independent collateral shock scenarios for 10%, 20%, 30%, and 40% price declines.
- Protocol-wide observed-key exposure ranking at a selectable HF cutoff, with every observed key available in a scrollable exact-value table.
- Market dependence as largest key, next two keys, other mapped keys, and hatched unmapped borrow, all divided by official total market borrow and labelled with loan-row coverage.
- In each selected market view, a descending cumulative observed-key concentration curve that adds mapped key debt from largest to smallest as a share of official total market borrow; its endpoint remains below 100% when borrow is unmapped.
- In each selected market view, a second descending cumulative curve that adds receipt-token collateral from the largest observed key to the smallest as a share of that market's represented collateralized supply. Its endpoint remains below 100% when represented collateral has no observed key. This bounded curve is not total supplier concentration and does not use total market supply or pool liquidity as its denominator.
- Two aligned HF-sensitivity plots: observed-key-attributed low-HF debt in USD, and top-1/top-3 shares using all observed keys at each cutoff.
- Supply composition as represented active-debt collateral, represented zero-debt collateral, and supply not represented as loan collateral; a separate chart shows observed-key concentration only inside represented collateralized supply.

Risk gradients encode increasing concern consistently as light mint, green, amber, orange, and dark red. This rule applies to ordered risk heatmaps, health-factor tranches, scenario matrices, and pressure-colored points; categorical series retain distinct non-ordered colors.

Overview charts:

- Stacked supply, borrow, and liquidity by market.
- Utilization and borrow APR scatter by market size.
- Market risk ranking table.
- Protocol rolling and cumulative interest formation versus repayment.
- Protocol current-valued cumulative and rolling reported interest-flow differences through time, explicitly presented as mark-to-market historical flows rather than a current receivable.
- Protocol debt repayment flow shown as raw daily bars, a 1.5-day half-life EWMA, and a trailing 30-day average.
- Interest coverage windows.
- Protocol monthly liquidation profit across the full observable history where the API exposes it, shown as raw complete/partial-period bars only.
- Protocol daily liquidation-profit series: zero or sub-cent-residue months expand to verified zero days; materially non-zero months, including negative adjustments, are fetched with explicit full-day UTC boundaries in small cached batches. The browser app shows raw daily profit, a 1.5-day half-life EWMA, and a trailing 30-day average without classifying daily spikes or drawing an adaptive threshold. Missing coverage breaks both smoothed lines.
- Ongoing days without liquidations: consecutive daily rows with absolute liquidation profit at or below one cent. Material positive profit or negative adjustment resets the count; a missing day breaks the line.
- Current active-debt liquidation check where the API exposes loan health.
- Current active-debt health-factor buckets.
- Current active-debt state by market.
- Protocol loan-state pressure over time using aggregate historical market signals.
- Historical market stress contribution lines and current stress contribution ranking.
- Current stress component matrix.
- Cross-market cumulative observed-key borrow-concentration curves, using official market borrow as each market's denominator.
- Cross-market cumulative observed-key collateralized-supply concentration curves, using each market's represented collateralized supply as its denominator.
- Market contribution to protocol interest accrual over time.
- Market contribution to protocol interest repayment over time.
- Market contribution to positive current-valued rolling interest-repayment gaps over time and the latest 90-day gap ranking. Each market nets accrued and repaid asset units across the window before USD valuation and positive-gap selection.
- Market contribution to outstanding protocol debt over time, calculated from each market's daily outstanding borrow rather than a rolling flow.
- Market contribution to protocol debt-repayment flow over time.
- Market contribution to positive current-valued rolling debt-flow gaps over time. Each market nets inferred accrual and reported repayment in asset units across the window before USD valuation and positive-gap selection.
- Current contribution shares in one 100%-stacked horizontal bar view: latest borrow share for outstanding debt and latest trailing-30-day shares for each flow or positive-gap family.
- In a separate Participation section, irregular saved observations of active-debt position count and distinct observed keys with active debt. These observations begin with the first successful refresh that supports the active-debt schema and do not pretend to cover earlier protocol dates.
- Saved active-debt loan-count and debt distributions by health-factor bucket, plotted only at their exact observation timestamps.

Revenue charts:

- Collected-revenue section first: daily and monthly stacked charts of retained interest collected and origination fees collected. No liquidation-profit series appears in this section.
- Accrued DAO section second: historical annualized DAO/treasury run rate, plus separate daily and monthly stacked charts containing only DAO interest and DAO origination allocations.
- LQ-staker section third: cumulative KPIs plus separate daily and monthly stacked charts containing only LQ-staker interest and LQ-staker origination allocations.
- Monthly official allocations are aggregated from the canonical daily rows. The current partial month remains visible in both recipient sections.
- The DAO run rate is derived from rolling windows of 90 consecutive complete official daily rows and multiplied by `365.25 / 90`, through the latest closed UTC day.

Historical liquidation-profit attribution by market is not charted because the official schema exposes `liquidationProfitInUsd` only at protocol overview level. The app never substitutes market repayment intensity and calls it liquidation activity.

Market charts:

- Core market metrics lead the view in this order: supply/borrow/liquidity, utilization, rates, and borrow-to-available-liquidity pressure. Loan-health and observed-key concentration sit together near the bottom after flow and revenue analysis.
- Supply, borrow, and liquidity through time.
- Utilization with high-utilization threshold line.
- Borrow APR and supply APY through time.
- Borrow-to-available-liquidity pressure through time on its own ratio axis.
- Daily debt-repayment bars with a 1.5-day half-life EWMA and trailing 30-day average in the repayment-intensity view.
- Outstanding borrow contrasted separately with daily debt repayments and a rolling repayment total.
- Interest accrued versus interest repaid.
- Derived debt accrued versus debt repaid, with daily, rolling, and cumulative gap views in both native asset units and current USD value. Coverage views show rolling native accrued/repaid quantities first, matched current-price USD values second, and 30/90-day ratios.
- Accrued interest versus repaid interest, with rolling coverage operands shown first in native units and second at the observation's current asset price.
- Daily, rolling, and cumulative interest gaps in both native asset units and current USD value.
- Current market health-factor tranches, showing both loan count and debt exposure. A market with no current active-debt loans receives an explicit zero-state graph instead of a misleading distribution.
- Cumulative observed-key borrow concentration followed by cumulative observed-key collateralized-supply concentration, with their distinct official-borrow and represented-collateral denominators stated directly. Any endpoint above 100% carries the same visible loan-detail-versus-market-aggregate overcoverage explanation used elsewhere in the app.
- Daily and monthly attributed collected market revenue, stacked into reconciled retained-interest attribution and directly reported origination fees. Tooltips and section copy distinguish the actual protocol total from its modeled market allocation.
- Direct origination-fee YTD, trailing-90-day, and all-history statistics remain separately visible because these are the only collected-revenue fields directly reported for the selected market by `analytics.marketHistory`.
- Daily and monthly accrued interest allocation, stacked into supplier income and protocol/reserve revenue using the parameter effective by each UTC day's end.
- Historical projected annualized gross, supplier, and protocol/reserve interest-income run rates from each day's market borrow, borrower APR, and effective income shares.
- Monthly borrower interest-repayment activity in a visually secondary section labeled as not revenue. `interestRepaidInUsd` is the borrower's full payment; the app never treats it as the retained protocol or staker share.
- The app never reconstructs historical collected interest revenue as `interestRepaidInUsd * current parameter share`. That unanchored formula does not reconcile historically. Market attribution is always anchored to the official daily protocol retained-interest total.
- In a separate Participation section, the market's irregular saved observations of active-debt position count and distinct observed keys with active debt.
- Saved active-debt loan-count and debt distributions by health-factor bucket for that market, including explicit zero observations when a discovered market has no qualifying loan rows at a fetch timestamp.

## Tests

Behavior-level tests must cover:

- market history rows are normalized consistently;
- active date detection ignores fully empty rows;
- aggregate protocol metrics match the sum of market metrics;
- interest gap and coverage formulas handle zero-accrual days;
- equal native accrual and repayment close debt and interest gaps despite intervening asset-price movement;
- protocol gap values equal the sum of current-valued market gaps and never sum unlike native assets;
- debt and interest coverage remain unchanged by intervening asset-price movement; selected-market operands expose native units first and revalue both sides at the same current price;
- protocol debt and interest coverage equal the ratio of summed current-valued market operands and never divide independently accumulated historical USD flows;
- 1.5-day EWMA values and 30-calendar-day flow averages are deterministic, preserve numeric zero, and break across missing daily coverage;
- incomplete liquidation-profit months remain visibly incomplete and are never converted to zero;
- daily liquidation coverage distinguishes API-fetched days, monthly-zero inferred days, missing days, and monthly reconciliation failures;
- date-window filtering is inclusive and deterministic;
- live-chart presets are latest-relative, irregular dates have proportional X positions, and missing values create gaps without dropping numeric zero;
- navigator, pan, and zoom ranges remain within available history; exact presets and date inputs may display one observation without borrowing an older row;
- successive successful refreshes append exact-timestamp loan participation and health observations without erasing earlier observations, while replaying the same timestamp is idempotent;
- protocol and per-market active-debt position counts, distinct active-debt observed-key counts, health-factor buckets, and zero-market observations are derived from the matching `HAS_DEBT` snapshots;
- loan snapshot charts preserve irregular and same-day timestamps without filling missing dates;
- stock-range summaries use endpoint change while flow-range summaries use totals, observed-day averages, and peaks;
- rolling sums, rolling coverage, cumulative interest, contribution shares, and stress inputs are derived deterministically from the browser bundle;
- liquidation/repayment timing analysis excludes negative liquidation adjustments from event days, uses only overlapping daily coverage, counts ≥2× market repayment bursts deterministically, and never emits a per-market liquidation amount;
- categorical rankings, stacked distributions, matrices, and scatter plots expose exact values through pointer and keyboard focus;
- contribution rows sum to 100% after rolling windows even when markets have different start dates; displayed markets and series are ranked by the latest rolling contribution with Other last; and hiding a series does not rescale the remaining share to a false 100%;
- Linear and Symlog Y transforms round-trip negative, zero, and positive values; axis dragging narrows or widens the visible domain while anchoring zero; every reset affordance restores automatic linear scaling; and bounded percentage axes remain fixed to a linear 0–100% domain without scale controls;
- ordinary wheel and touch gestures continue to scroll the page while explicit chart zoom remains available;
- API GraphQL requests are built with the intended variables.
- incremental refresh starts on the day after the last saved row, skips markets already current, and rejects duplicate concurrent refreshes;
- each refresh writes immutable raw market and parameter responses before canonical normalized files;
- the directory adapter loads only data text files and creates nested data paths safely;
- the data-location adapter prefers a writable folder, falls back to Save As, then falls back to a normal archive download without treating unsupported directory access as a fatal error;
- picker-granted archive and folder handles are remembered locally, automatically reopened only with current read permission, and presented as an explicit one-click reopen when permission must be renewed;
- a zero-data folder produces a complete, reloadable generation with immutable raw JSON, canonical clean CSV, metadata, and append-only observation outputs;
- a second refresh requests only missing market, parameter, liquidation-detail, and fee periods while refreshing point-in-time snapshots;
- reopening a populated folder or portable archive rebuilds every deterministic analysis from canonical clean CSV tables;
- the generated standalone app contains the direct GraphQL workflow and no localhost or `/api/refresh` dependency;
- activity-state eligibility suppresses meaningless repayment metrics for inactive markets while leaving descriptive repayment intensity available.

## Acceptance Checks

- App opens as a static document with a useful zero-data first-run screen and no server.
- First start exposes one primary fetch action, no redundant Get started tab, and a secondary existing-archive import.
- The primary action prefers a native writable-directory picker, falls back to Save As for a portable archive, and finally falls back to a normal download.
- An empty selected folder or new archive can receive a complete first generation; populated local data is reused before update.
- Local file handles are used only in the current page lifetime and no absolute path is required.
- Update fetch uses latest saved dates when data exists.
- Refresh preserves immutable raw JSON response batches, writes only canonical clean CSV plus append-only observations, and redraws live charts from the rebuilt bundle.
- No production file or package command starts an HTTP server.
- Tests pass.
