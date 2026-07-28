# Liqwid Finance Market Dynamics

An open-source, client-side web application and data pipeline for monitoring and analyzing Cardano's [Liqwid Finance](https://liqwid.finance) market dynamics, liquidity, interest gaps, borrow/repayment trends, and bad debt history.

## Features

- **Protocol & Market Dynamics Analytics**: Explore TVL, utilization rate, borrow/supply APYs, active debt, interest accrual vs repayment gaps, and risk metrics across all active markets.
- **Client-Side & Offline Ready**: Runs directly in any web browser without needing a backend server.
- **Portable Data Store & Zip Archive**: Bundles raw historical fetches, cleaned daily histories, and computed market datasets in a portable ZIP archive (`liqwid-data.zip`) and CSV manifest (`liqwid-portable-manifest.csv`).
- **Live GraphQL Sync**: Queries the official Liqwid v2 GraphQL API directly from the browser to refresh data and keep market dynamics up to date.

## Project Layout

```
.
├── data/
│   └── liqwid/
│       ├── clean/                    # Cleaned daily market time series
│       ├── computed/                 # Protocol-level aggregate and derived datasets
│       ├── metadata/                 # Market parameters and token metadata
│       ├── raw/                      # Raw GraphQL API response snapshots
│       ├── liqwid-analysis-app.html  # Standalone single-file production HTML application
│       ├── liqwid-data.zip           # Complete portable data archive
│       └── liqwid-portable-manifest.csv # Portable archive CSV index manifest
├── docs/                             # Architecture specifications & methodology docs
├── public/                           # Static public assets
├── scripts/                          # Data processing and static app generation scripts
├── src/                              # Source code (browser app & shared data utilities)
└── tests/                            # Test suite for data workflow, metrics, & app logic
```

## Getting Started

### Prerequisites
- Node.js >= 20
- Python 3.10+ (for data scripts and app bundler)

### Running the App Locally

You can open the generated standalone application directly in your browser:
```bash
# Open data/liqwid/liqwid-analysis-app.html in your web browser
```

Or generate/rebuild the bundle:
```bash
npm run build:app
```

### Running Tests

Run the test suite:
```bash
npm test
```

### Rebuilding Data Archive

To re-build the portable `.zip` data archive and manifest from local data:
```bash
python scripts/rebuild_data_archive.py --data-root data/liqwid
```

## Data Source

All protocol data is sourced from the official Liqwid v2 GraphQL endpoint:
`https://v2.api.liqwid.finance/graphql`

## License

MIT
