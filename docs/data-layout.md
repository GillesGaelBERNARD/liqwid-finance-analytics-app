# Data Layout

The app writes data under a user-selected folder or portable archive. The conventional local root is:

`data/liqwid`

The standalone browser app prefers a user-selected writable folder. When direct folder access is unavailable, it writes one portable ZIP archive containing the same relative paths. The page keeps any granted file or directory handle only for its current lifetime. A refresh is staged in memory and committed only after every required API surface and derived analysis succeeds.

## Folder paths

`raw/api`

Original API-derived JSON or JSONL files. These are kept for reproducibility and debugging.

Every browser refresh first writes an immutable capture under:

`raw/api/fetches/<utc-run-id>/`

The run contains one exact `markets/page-<page>.json` response per discovery page, `market-history/<market-id>.json`, `market-params-history/<market-id>.json`, protocol overview and fee response batches, and one timestamped unfiltered `loans/all.json` capture. When an injected API client cannot expose discovery pages, `markets-current.json` is retained as the fallback row-level raw export. A normal official-API refresh never stores both forms.

Files directly under `raw/api` are not used as mutable convenience copies. The immutable run captures are the only raw persistence layer and are never overwritten.

Market history and parameter history keep independent cursors. `metadata/market-params-cursors.csv` records the last successfully requested parameter end date even when no parameter-change rows were returned, so a current market-history file cannot hide missing parameter coverage.

`clean/market-history` and `clean/market-params-history`

Normalized market-history and parameter-history CSV files, partitioned by market. These partitions do not overlap: no per-market file is a saved subset of another clean table.

Current point-in-time loans use one canonical table:

- `clean/current-all-loans.csv`: the complete unfiltered current loan-position listing, including observed keys, per-asset collateral composition, `adjustedAmount`, and the three boolean classification columns `hasDebt`, `canBeLiquidated`, and `hasCollateral`.

Active-debt, liquidatable, and collateral-bearing populations are filtered in memory from this table. They are never saved as separate CSV files.

`computed`

Only append-only observations that cannot be reconstructed from the latest clean tables are persisted:

- `loan-participation-history.csv`;
- `loan-health-history.csv`.

These tables are keyed by exact fetch timestamp and protocol/market scope. They contain only aggregates derived from current-only loan snapshots and do not copy fields already available from historical API endpoints.

All other derived metrics, summaries, rankings, protocol aggregates, status checks, exposure tables, monthly fee aggregates, and chart inputs are rebuilt in memory from canonical clean tables. They are not written to the archive.

`metadata`

App settings and portable archive metadata.

## File Naming

Use lowercase market ids in filenames where possible:

- `markets-current.json`
- `market-history-{marketId}.json`
- `market-history-{marketId}.csv`
- `protocol-summary.json`

## Browser persistence

Settings and generation provenance are stored in `metadata/settings.csv`; parameter cursors are stored in `metadata/market-params-cursors.csv`. Raw official GraphQL request/response envelopes remain compact JSON because their nested request variables, response shape, and fetch metadata must be preserved; clean and append-only observation tables are CSV.

Schema version 3 is the canonical layout. The app reads and writes that layout directly; it does not carry an automatic migration path for earlier redundant layouts. Existing data is converted once as a separate archive copy, preserving the source archive unchanged.

The app first tries the native writable-directory picker. If that API is absent or blocked, it uses native **Save as...** for `liqwid-data.zip`; if that is also unavailable, it downloads the same archive normally. Portable ZIP entries use standard DEFLATE compression when browser compression streams are available and fall back to stored entries otherwise. A standard file input can reopen either form. Both forms keep the data layout above, and the HTML never requires an absolute path.
