# API And Method Notes

## Confirmed API Surface

Endpoint:

`https://v2.api.liqwid.finance/graphql`

Confirmed root queries:

- `meta`
- `currencyExchangeRate`
- `historical`
- `analytics`
- `agora`
- `lq`
- `liqwid`

Useful confirmed fields:

- `liqwid.data.markets(input)` returns current market state and market metadata.
- `analytics.marketHistory(marketId, startDate, endDate, interval)` returns time-bucketed market history.
- `analytics.marketParamsHistory(marketId, startDate, endDate)` returns historical parameter changes.
- `analytics.overview(startDate, endDate)` returns protocol overview periods.
- `analytics.markets(startDate, endDate)` returns market analytics periods.
- `historical.transactions(input)` requires wallet addresses, so it is not a protocol-wide transaction feed.
- `liqwid.data.loans(input)` returns the current protocol-wide loan listing, including `publicKey`, active debt, aggregate and per-asset collateral, health factor, LTV, and APY. It does not require an address; this differs from account-level `historical.transactions`, which does.

Schema introspection on 2026-07-11 confirms that `MarketAnalyticsPeriod` contains supply, borrow, utilization, supply APY, and borrow APR, but no liquidation profit, liquidation count, or liquidation volume. `AnalyticsOverviewPeriod` is the only confirmed analytics period exposing `liquidationProfitInUsd`.

Confirmed financial-sustainability fields:

Schema introspection and a live June 2026 period query against the official endpoint on 2026-07-17 confirmed the `ProtocolFees` and `ProtocolFeesBreakdown` field names and the inclusive UTC query shape used below.

- `analytics.overview.current` exposes `revenueFromRepaidInterestInUsd`, `loanOriginationFeesInUsd`, `loanOriginationFeesMinAdaInUsd`, `liquidationProfitInUsd`, and other protocol aggregates from the first observable protocol day.
- Full-history fee tracking preserves `revenueFromRepaidInterestInUsd` and `loanOriginationFeesInUsd` as separate observed components. Their sum is a combined observed fee flow, not a measure of revenue retained by the protocol/DAO, because these fields do not expose the historical recipient split. The separate minimum-ADA origination field is not included.
- Governance has disabled the origination fee. A returned `loanOriginationFeesInUsd` value of zero is therefore retained as valid observed data rather than treated as missing. Comparisons across the discontinuation cross different fee regimes.
- `analytics.fees(startDate, endDate)` exposes accrual-based `dailyProtocolRevenue`, `dailyHoldersRevenue`, and a `breakdown` containing `borrowInterestAccruedForProtocol`, `borrowInterestAccruedForHolders`, `loanOriginationFeesForProtocol`, and `loanOriginationFeesForHolders`. The refresh aliases the first two to `protocolRevenueInUsd` and `holdersRevenueInUsd` in saved rows. Despite the schema's `daily*` names, a multi-day query returns the requested period aggregate. The endpoint rejects a `startDate` before `2026-01-01`, so official allocation is presented only for 2026+ and is never backfilled from overview fields.
- DAO/treasury revenue is exactly protocol interest allocation plus protocol origination-fee allocation. LQ-staker revenue is stored and charted separately as holder/staker interest plus holder/staker origination-fee allocation. `dailyRevenue` must reconcile to the sum of those two recipient totals.
- Detailed allocation retrieval preserves one inclusive UTC day per logical result. Production requests may carry up to four separately aliased day fields to reduce transport overhead, but each saved row keeps its own day boundaries and reconciliation checks.
- Monthly allocation is computed by grouping the canonical daily rows by UTC calendar month and summing each recipient/source component. A month is complete only when every calendar day is present, closed, and reconciled. Previous monthly API caches are ignored, which prevents stale zero rows from surviving a refresh.
- `analytics.marketHistory` exposes per-market interest accrued/repaid and origination-fee flows, but not official retained protocol revenue per market.

The two fee surfaces must not be spliced: `analytics.fees` recognizes the allocated protocol share of accrued interest, while `analytics.overview.revenueFromRepaidInterestInUsd` is a repayment-timed observed flow whose historical recipient split is not exposed.

Market-level sustainability therefore shows only gross fee-paying activity reported in market history: interest repayment plus origination fees. The official API does not expose the recipient allocation by market, so retained protocol or DAO revenue is unavailable at that level. The app never applies a current allocation parameter to historical market flows and never splices accrual-timed and repayment-timed surfaces into a market-revenue estimate.

No confirmed official field exposes protocol or market operating cost. The app cannot calculate net income, margin, break-even, or cost coverage.

## Balance And Flow Boundary

The aggregate market history can verify current balances and reported daily flows, but it is not a complete borrower-level event ledger.

- `borrowInUsd` and `borrow` are daily balance snapshots.
- `debtRepaidInUsd` and `debtRepaid` are reported repayment flows.
- The schema exposes no direct debt-accrued flow. The app derives new debt per market in native units as `current borrow - prior borrow + debt repaid`, floors negative reconciliation residue at zero, and converts with that day's observed USD price. Repayment is added back before the inferred formation flow is compared with reported repayment, so it is not already netted and then subtracted a second time. Protocol debt accrued is the sum of those market-level USD flows.
- Cumulative inferred debt accrued minus cumulative reported debt repaid is not a current-borrow balance. It omits the opening stock, historical flows are valued on their observation days while current borrow uses the latest valuation, and negative native reconciliation residues are floored rather than mislabelled as negative debt formation. The app exposes the exact bridge as `opening borrow + cumulative flow gap - balance-versus-flow residual = current borrow` and labels that residual as unclassified.
- Official interest-accrued and interest-repaid flows are checked and displayed separately. Their cumulative difference is a repayment-timing comparison, not an extra balance added to outstanding borrow or to the debt-flow bridge without confirmed API semantics.
- Debt and interest coverage are calculated per market from native accrued and repaid quantities. For USD context, both sides of a window are revalued at that market's window-end implied price. Protocol coverage sums those current-valued market operands before forming the ratio; it never adds unlike asset units or divides historical daily USD conversions.
- `analytics.overview.current.liquidationProfitInUsd` is liquidation profit, not liquidated principal or repaid debt. It therefore cannot be summed into the debt-flow bridge. The official protocol-wide history surface exposes no liquidation-principal flow with which to classify or close the residual.
- `historical.transactions` exposes transaction-level debt fields and liquidation types, but the query requires wallet addresses, so it cannot be used as a protocol-wide event feed unless the full historical borrower address set is available.

## Current Loan Health Boundary

`liqwid.data.loans` exposes current loan health fields including `amount`, `adjustedAmount`, `collateral`, `healthFactor`, and `LTV`.

Current loan-state analysis uses active-debt loan rows. Current active-debt liquidation checks require both active debt and liquidatable status. Historical per-loan health-factor time series are not exposed by this API surface, so over-time loan-state analysis uses aggregate market-history stress signals.

The browser additionally builds a prospective, user-triggered loan snapshot history. `liqwid.data.loans` has no date input, so this history starts with the first supporting Fetch + Save action and grows only when the user refreshes the archive. The unfiltered result supplies active-debt position counts, distinct observed-key counts, and health-factor observations after classification. No missing timestamp is synthesized, and no snapshot field already available from an official historical endpoint is copied into this history.

Current loan-health metrics:

- active-debt loan count;
- active debt and collateral in USD;
- minimum, P10, median, and debt-weighted health factor;
- active debt by health-factor bucket;
- active debt by market and by health-factor band.

One unfiltered current loan snapshot is fetched per refresh. Per-market health-factor tranche charts and all loan-population views are derived locally from those preserved rows; they do not issue separate filtered or per-market requests.

Official schema introspection and a live all-versus-filtered comparison on 2026-07-23 established the classification represented in the selected fields: `HAS_DEBT` matches `adjustedAmount > 0`; `HAS_DEBT + CAN_BE_LIQUIDATED` matches active debt with `healthFactor <= 1`; and `HAS_COLLATERAL` matches `collateral > 0`. The clean all-loan table records these three booleans, so the filtered populations are reproduced without saving three row-subset files or three duplicate raw responses.

Per-loan `collaterals` expose the receipt-token market and current USD value for each collateral asset. Multi-collateral loan debt is attributed proportionally by those USD values. Observed-key exposure groups current loans by exact `publicKey`; the app anonymizes those keys before rendering derived analysis and never equates a key with a real-world actor.

Observed-key debt and borrowing analyses use only `HAS_DEBT` positions. Protocol shares use official current protocol borrow as their denominator. Market-dependence rows use official current market borrow as their denominator, not merely debt represented by loan rows. The difference between official borrow and observed-key-mapped loan debt remains a hatched unmapped segment, while loan-row coverage is printed directly. HF concentration sensitivity includes every active-debt observed key at every cutoff and recalculates both the qualifying low-HF denominator and top-1/top-3 numerators for that cutoff. It applies no subset filter or cumulative-coverage stopping rule. Collateralized-supply concentration is a separate collateral analysis and may include collateral positions without debt.

## Supply Ownership Boundary

The official API exposes current aggregate market `supply`, `borrow`, and `liquidity`, but no enumerable list of all receipt-token holders or supplier balances. Exact total supply-side ownership concentration is therefore unavailable.

The `HAS_COLLATERAL` loan snapshot identifies only the subset of receipt-token claims deposited into loans. The app may measure observed-key concentration inside that represented subset and compare its USD value with aggregate supply. The residual is **supply not represented as loan collateral**, which includes ordinary wallet-held receipt tokens and other unobserved ownership. It is not **leftover liquidity**: available pool liquidity is the separate official market `liquidity` field. Using supplied receipt tokens as collateral also does not remove the underlying supplied funds from the pool.

## Market Stress Attribution

The app uses a transparent logistic stress index rather than a supervised default or liquidation model. The API does not expose a per-market historical outcome label that would support a fitted GLM.

Inputs:

- utilization pressure;
- borrow-to-liquidity pressure;
- weak 30-day interest coverage;
- positive 30-day borrow growth.

The market stress contribution is the stress index multiplied by the market's share of protocol borrow. This makes the output an attribution lens: it shows which markets are stressing the protocol most through time and currently.

## Liquidation History Scope

The API exposes `liquidationProfitInUsd` only at protocol overview level for a requested period. The analysis therefore queries complete calendar months from the first observable protocol month and preserves their coverage status. The value can represent one or more underlying liquidations; it is not an event count and cannot be attributed to a market from this API surface.

The app can compare protocol liquidation-profit dates with daily market repayment history because both come from official API surfaces. For this timing study, a positive daily liquidation profit above $0.01 is a material liquidation-profit day and a market repayment burst score of at least 2× identifies a repayment spike. Negative liquidation-profit adjustments are preserved in the raw daily series but are not classified as liquidation events. Same-day overlap, spike breadth, and each market's repayment concentration on those days are associations only: they do not identify the liquidated market, liquidated principal, or causality.

## Liquidation History Retrieval

Monthly and daily liquidation-profit retrieval is cached under `raw/api` and is incremental:

- app periods use inclusive calendar-day bounds; every analytics `startDate` is sent as the first requested day at `00:00:00Z` and every `endDate` as the final requested day at `23:59:59Z`;
- completed cached periods are never fetched twice;
- cached rows are reusable only when their recorded request variables and returned bounds match the canonical UTC-inclusive range after normalizing optional `.000` milliseconds;
- zero or sub-cent-residue months expand locally to verified zero days;
- only missing days inside materially non-zero months, including negative adjustments, require daily API requests;
- requests use small alias batches, a bounded retry/backoff policy, and a read timeout long enough for the official analytics query;
- daily rows must reconcile to the corresponding monthly total before daily coverage is treated as complete.

The official API also produced equivalent totals for next-day half-open boundaries in a read-only probe on 2026-07-16. The application deliberately uses the UTC-inclusive convention everywhere to remove one-day ambiguity and prevent cursors from recording an excluded final day as covered.

The previous 10-second read timeout was insufficient: an affected January 2024 monthly query returned successfully from the official endpoint in about 34 seconds on 2026-07-11. Browser requests retry transient failures with bounded exponential backoff and name the failed GraphQL operation. Remaining timeout, HTTP, GraphQL, missing-day, and reconciliation failures must be surfaced by category rather than silently treated as zero.

## Observed fee and allocated revenue coverage

Each refresh requests one inclusive full UTC `analytics.fees` day beginning 2026-01-01 for detailed DAO/treasury and LQ-staker allocation. Closed, reconciled rows under the current field contract are cached; the current incomplete UTC day is refreshed but excluded from the run rate. Calendar-month rows are rebuilt locally from that daily table, so there is no second monthly API/cache path. The historical annualized run rate uses the latest 90 consecutive complete daily rows and equals their DAO/treasury total multiplied by `365.25 / 90`; a missing or failed day breaks eligibility until a new complete 90-day window exists.

## Core Historical Fields

`analytics.marketHistory` exposes:

- `timestamp`
- `supply`, `supplyInUsd`
- `borrow`, `borrowInUsd`
- `liquidity`, `liquidityInUsd`
- `debtRepaid`, `debtRepaidInUsd`
- `interestAccrued`, `interestAccruedInUsd`
- `interestRepaid`, `interestRepaidInUsd`
- `borrowApr`
- `supplyApy`
- `utilizationPercentage`
- `loanOriginationFeesInUsd`

## Earliest-Date Strategy

For each discovered public market:

1. Query daily market history from a conservative start date, currently `2020-01-01`.
2. Use the first row with any non-zero market amount or flow as the first active observation.
3. Save all returned raw rows, but display the active range separately.
4. On updates, query from the day after the latest saved row through the latest complete API date.

Market-parameter history is sparse and therefore does not use the clean market-history cursor. Its consolidated raw export records `requestedThrough`; updates begin on the following day, including after a successful zero-row response.

## Browser Retrieval

The official endpoint accepts direct cross-origin JSON POST requests from the standalone viewer, including the `content-type` and `x-app-source` headers. No proxy is part of the application architecture.

Full-history responses can take tens of seconds per market. The viewer fetches markets sequentially, retries bounded transient failures, shows per-market progress, and derives completion from the latest returned timestamp rather than assuming that the requested end day exists.

## Method Sources

The analysis uses standard DeFi lending concepts:

- Utilization is the share of supplied assets that is borrowed.
- Higher utilization tends to signal stronger borrowing demand and tighter withdrawal liquidity.
- Interest-rate models often change slope around a kink, making utilization and APR jointly important.

External references are used for methodology only. They are not used as data sources.
