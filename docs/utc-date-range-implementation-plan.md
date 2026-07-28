# UTC Date-Range Implementation Plan

## Goal

Make every Liqwid GraphQL request that accepts `startDate` and `endDate` send explicit UTC timestamps for the complete requested calendar range.

The app's internal and user-facing range remains an **inclusive pair of calendar dates**. Only the API adapter converts those dates to timestamps:

```text
logical range:  startDay = 2026-06-05, endDay = 2026-06-05
API variables:  startDate = 2026-06-05T00:00:00Z
                endDate   = 2026-06-05T23:59:59Z
```

This contract applies equally to a one-day range, a partial month, a complete month, and a multi-year history request. Do not send date-only strings to Liqwid and do not send identical date-only values for a one-day request.

## Why this change is required

A read-only probe of the official endpoint on 2026-07-16 confirmed the boundary behavior shown in the supplied screenshots:

- `analytics.overview(startDate: "2026-06-05", endDate: "2026-06-05")` returned a zero-length period and zero liquidation profit.
- The same overview query using `2026-06-05T00:00:00Z` through `2026-06-05T23:59:59Z` returned `9566.645694803561` USD of liquidation profit.
- `analytics.marketHistory` returned no June 5 row when both date-only values were June 5, but returned the June 5 row with explicit full-day UTC bounds.
- `analytics.fees` rejects identical date-only values with `startDate must be before endDate`; the explicit full-day UTC range returned the day's values.
- The currently implemented half-open range `2026-06-05` through `2026-06-06` returned the same June 5 values as the explicit full-day range for `overview`, `marketHistory`, and `fees`. It is functionally correct in the places where the caller already advances the end by one day, but the app does not use that convention consistently.

The inconsistency matters outside liquidation profit. `marketHistory` and `marketParamsHistory` currently receive the requested final day as a date-only exclusive boundary. In particular, the parameter cursor can record that day as covered even though the request excluded most or all of it.

## Required date contract

Use two distinct concepts and names throughout the implementation:

- `startDay` / `endDay`: strict `YYYY-MM-DD` calendar keys, inclusive, used by the UI, cursors, period planning, clean tables, and analysis.
- `startDate` / `endDate`: GraphQL variables derived from those keys, always explicit UTC timestamps.

Add one shared JavaScript conversion boundary in `src/shared/dates.js`:

```js
toUtcApiRange({ startDay, endDay })
// => {
//   startDate: `${startDay}T00:00:00Z`,
//   endDate: `${endDay}T23:59:59Z`
// }
```

The helper must:

1. accept only real calendar dates in strict `YYYY-MM-DD` form;
2. reject missing, malformed, or impossible dates;
3. reject `endDay < startDay`;
4. use UTC only and never the machine's local timezone;
5. return the exact second-level form above;
6. be the only production code that constructs Liqwid API date boundaries.

Do not convert chart filters, CSV date keys, refresh cursors, or display labels to timestamps. They are calendar-date concerns, not GraphQL variables.

## API surface audit

| Liqwid surface | Current use | Required change |
| --- | --- | --- |
| `analytics.marketHistory` | Browser full and incremental market history | Convert inclusive `startDay`/`endDay` in `buildMarketHistoryRequest`; the requested final day must be included. |
| `analytics.marketParamsHistory` | Browser parameter history and independent cursor | Convert in `buildMarketParamsHistoryRequest`; migrate the legacy cursor with a one-day overlap. |
| `analytics.overview` | Browser monthly liquidation totals and daily liquidation batches | Convert monthly and daily logical periods to explicit timestamps; daily aliases must use `D 00:00:00Z` through `D 23:59:59Z`. |
| `analytics.fees` | Browser daily protocol and holder allocation | Convert every requested day to explicit timestamps. |
| `analytics.markets` | Not currently called | Require the shared helper if it is added later because it has the same date arguments. |

`liqwid.data.markets` and `liqwid.data.loans` are current snapshots without `startDate`/`endDate`; do not change them. Local chart range fields that happen to be named `startDate` and `endDate` are also outside this change.

## Implementation sequence

### 1. Amend the specification before behavior

Update `docs/spec.md` and `docs/api-method-notes.md` to replace the half-open API rule with this explicit UTC rule:

> App ranges are inclusive calendar dates. Every Liqwid GraphQL `startDate` is serialized as the first requested day at `00:00:00Z`; every `endDate` is serialized as the last requested day at `23:59:59Z`.

Keep a note that the API also produced equivalent totals for next-day half-open boundaries in the 2026-07-16 probe, but the application deliberately uses one convention everywhere to prevent one-day ambiguity. Remove instructions that classify explicit inclusive-end cache rows as legacy or invalid merely because they are not half-open.

### 2. Add the shared UTC range module test-first

Add JavaScript behavior tests for:

- one day: June 5 to June 5;
- a complete month: June 1 to June 30;
- a partial month: July 1 to July 16;
- leap day and year rollover;
- malformed dates, impossible dates, and reversed ranges;
- independence from the host timezone.

Prefer one deep range module over scattered `T00:00:00Z`, `T23:59:59Z`, `addDays`, and string-slicing logic.

### 3. Convert browser request builders

In `src/browser/dataWorkflow.js`:

1. Change workflow/request-builder inputs to use `startDay` and `endDay` internally.
2. Make `buildMarketHistoryRequest` and `buildMarketParamsHistoryRequest` call `toUtcApiRange` and place only the returned `startDate`/`endDate` in GraphQL variables.
3. Keep `requestedStartDate`, `requestedEndDate`, `requestedThrough`, and refresh comparisons as date keys, preferably rename them to `requestedStartDay`/`requestedEndDay` where migration cost is reasonable.
4. Ensure immutable raw captures record the exact timestamp variables actually sent, not the pre-conversion date keys.

In `src/browser/completeDataWorkflow.js`:

1. Add request builders for protocol overview, protocol fees, and daily overview batches; each must use the shared converter.
2. Make `monthPeriods` return inclusive logical bounds. A complete June period is June 1 through June 30, not June 1 through July 1.
3. Make the daily period expander inclusive at both ends.
4. Store explicit logical fields such as `periodStartDay` and `periodEndDay` on monthly clean rows. Keep API-returned `fromDate` and `toDate` separately as evidence of what the endpoint processed.
5. Build daily coverage from the logical period fields, not by assuming that an API `toDate` is exclusive.
6. Capture the exact request query/variables beside every response.

The fallback path used when batch overview fetching is unavailable must go through the same request builder. No direct call may reconstruct its own boundary.

### 4. Version and migrate caches safely

Add a `dateRangeContract` value such as `utc-inclusive-day-v1` to refresh metadata and relevant consolidated raw documents. Bump the browser settings schema version.

Migration rules:

- Never delete or overwrite immutable files under `raw/api/fetches/<run-id>/`.
- A cached protocol overview, daily liquidation, or fee row satisfies the new contract only if its recorded variables and returned bounds match the canonical timestamps after normalizing optional `.000` milliseconds.
- Re-fetch non-canonical monthly overview and fee rows. Re-fetch daily API rows only for materially non-zero months; regenerate inferred-zero days from the newly validated monthly rows.
- Preserve clean market-history rows, then make the first new canonical request start on the day after the latest saved row and end on the inclusive requested final day. This catches up the formerly excluded end day without re-downloading all history.
- For a legacy `marketParamsHistory.requestedThrough`, begin the first canonical request **on that same day**, not the following day. This one-day overlap recovers a parameter change that may have occurred on the old exclusive end boundary. Merge/deduplicate by timestamp and transaction hash, then mark the cursor with the new contract.
- Keep the current generation staged. Commit migrated caches and derived tables only after all required fetches and analysis succeed.

### 5. Rebuild, do not hand-edit, the standalone app

After source and tests pass, run `npm run build:app`. `scripts/static_app_generator.py` bundles the source modules into `data/liqwid/liqwid-analysis-app.html`; do not patch the generated HTML separately.

## Required tests

### Request construction

- `buildMarketHistoryRequest` sends `2026-06-05T00:00:00Z` and `2026-06-05T23:59:59Z` for a one-day logical range.
- `buildMarketParamsHistoryRequest` follows the same rule.
- Protocol overview and fee request builders follow the same rule for complete and partial months.
- Every alias in a daily liquidation batch contains the exact full-day UTC range.
- A repository-level assertion rejects any outgoing Liqwid request containing date-only `startDate` or `endDate` variables.

### Refresh and cursor behavior

- An initial request includes its logical final day.
- An incremental market refresh begins on `latestSavedDay + 1` and includes the new `endDay` even when both are the same day.
- A legacy parameter cursor overlaps its old `requestedThrough` day exactly once, then resumes normal `+1 day` behavior.
- Raw captures contain the timestamp variables actually sent.
- A failed refresh leaves the last good generation intact.

### Liquidation and revenue periods

- June 2026 expands to exactly June 1 through June 30.
- A July 1 through July 16 partial month expands to exactly 16 days and remains incomplete for classification.
- A one-day liquidation request is not zero-length.
- Legacy zero-length and half-open daily cache rows are invalidated under the new contract.
- Daily liquidation values still reconcile to the matching monthly total before daily analysis is enabled.
- Zero and sub-cent months still expand locally without unnecessary daily API calls.
- Negative non-trivial months still fetch daily detail.

### Manual official-API smoke check

Keep this outside the default deterministic test suite. Against only `https://v2.api.liqwid.finance/graphql`, request June 5, 2026 with the canonical variables and verify:

- protocol overview returns the known non-zero liquidation profit;
- `marketHistory` returns the June 5 daily bucket for an active market;
- `fees` returns a non-zero-length period;
- the response `fromDate`/`toDate` correspond to the requested UTC instants.

Do not make CI depend on exact financial values or live endpoint availability.

## Acceptance criteria

The change is complete only when all of the following are true:

1. Every production GraphQL operation in this repository that sends both `startDate` and `endDate` uses explicit UTC timestamps from the shared conversion boundary.
2. A one-day logical range always sends `00:00:00Z` through `23:59:59Z`; no operation sends identical date-only strings.
3. The requested inclusive end day appears in market-history results when the API has a row for it.
4. Parameter cursors cannot skip their former exclusive end day.
5. Raw captures contain the exact query variables sent to the official API.
6. Monthly and daily liquidation totals reconcile, and incomplete coverage is still reported rather than converted to zero.
7. Legacy cached data migrates without deleting immutable raw evidence or publishing a partially refreshed generation.
8. `npm test` passes.
9. `npm run build:app` succeeds and the generated standalone app contains the updated request logic.

## Expected files to change during implementation

- `docs/spec.md`
- `docs/api-method-notes.md`
- `src/shared/dates.js`
- `src/browser/dataWorkflow.js`
- `src/browser/completeDataWorkflow.js`
- `tests/liqwidApi.test.js`
- `tests/browserDataWorkflow.test.js`
- `tests/completeDataWorkflow.test.js`
- a new JavaScript date-range test file if that keeps the existing suites focused
- regenerated `data/liqwid/liqwid-analysis-app.html`

Avoid changing analysis formulas or chart date filtering in the same slice. This work is an API-boundary and cache-correctness change.
