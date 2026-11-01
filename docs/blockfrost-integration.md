# Blockfrost On-Chain Integration & Feasibility Evaluation

## 1. Setup & Configuration

- Your Blockfrost credentials are saved locally in [`.env`](file:///i:/Gilles/Documents/perso/Crypto_currency/shinkai_monitoring/liqwid_finance/Antigravity_Liqwid_Finance/.env).
- [`.gitignore`](file:///i:/Gilles/Documents/perso/Crypto_currency/shinkai_monitoring/liqwid_finance/Antigravity_Liqwid_Finance/.gitignore) ensures `.env` is never committed to source control.
- To re-verify connectivity anytime, run:
  ```bash
  node scripts/test_blockfrost.js
  ```

---

## 2. Empirical Benchmark & Feasibility Results

We executed live benchmarks against the Cardano mainnet ledger using your Blockfrost key, comparing direct on-chain queries with the current Liqwid GraphQL API.

```bash
node scripts/eval_onchain_feasibility.js
```

### Summary Comparison Table

| Metric / Dataset | Direct On-Chain Blockfrost Query | Liqwid GraphQL API | Query Count | Latency | Feasibility & Recommendation |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **LQ Native Asset Metrics** (`totalSupply`, initial mint tx) | `/assets/da8c30857834c6ae...4c51` | `lq { totalSupply }` | **1 request** | **~80 ms** | **Tier 1 (Easy & Fast)**: 100% direct ledger replacement. Instantaneous. |
| **DAO Treasury & Staking Balances** | `/addresses/{treasury_addr}`, `/addresses/{staking_addr}` | `lq { staked, treasury }` | **1-2 requests** | **~90 ms** | **Tier 1 (Easy & Fast)**: Perfect for real-time ledger verification of DAO assets. |
| **Market Parameter Governance Datums** (Rates, caps, income ratios, kink) | `/scripts/datum/{datum_hash}` at parameter script `addr1wx6ht...` | `marketParamsHistory` | **1-2 requests** | **~50 ms** | **Tier 1 (Easy & Fast)**: Blockfrost decodes Plutus datums into clean JSON. Verified 1:1 match with CSV history. |
| **Current Active Loans & Collateral Snapshot** | `/addresses/{loan_script}/utxos` (Script: `addr1w96pzk...`) | `loans(input: ...)` | **1 request** (84 active loans = 1 page) | **~300 ms** | **Tier 2 (Medium Effort)**: Fetches all active loans in 1 query. Carries public key hash and qToken collateral directly in UTXO map. Requires CBOR datum parsing for debt principal. |
| **Multi-Year Historical Daily Time Series** (2020–2026 daily borrow, supply, repayments, interest accruals) | Replaying hundreds of thousands of Cardano txs and reconstructing Plutus state machine | `analytics.marketHistory`, `analytics.fees` | **50,000+ requests** | **Hours / Rate Limited** | **Tier 3 (Impractical)**: Blockfrost does not provide pre-computed daily time series. Keep on Liqwid API. |

---

## 3. Discovered On-Chain Artifacts & Contract Architecture

### A. Liqwid v2 Loan Script
- **Script Address**: `addr1w96pzkhmw4ag5dylew8sfwulcw0erd4w27ztm0jw2c2q5sc3rtacg`
- **Mechanism**: Every active loan in Liqwid v2 is literally an eUTXO identified as `<txHash>-<outputIndex>`.
- **Benchmark**: Paging the entire active loan set took **1 single HTTP GET** (307 ms, 66.4 KB).
- **UTXO Contents**:
  - `amount`: Lovelace minimum ADA + 1 loan NFT tracker + locked collateral tokens (e.g. `qNIGHT`, `qADA`, `qDJED`).
  - `inline_datum`: Plutus CBOR data. The first 28 bytes (`581c...`) directly contain the borrower's public key hash (matching `current-all-loans.csv` exactly).

### B. Governance & Parameter Datums
- **Config Address**: `addr1wx6htk5hfmr4dw32lhxdcp7t6xpe4jhs5fxylq90mqwnldsvr87c6`
- **Datum Decoding**: Querying `/scripts/datum/{datum_hash}` on Blockfrost returned the decoded Plutus JSON structure:
  - Income distribution ratios: `[10, 8, 1, 0]` (`incomeRatioSum`: 10, `incomeRatioSuppliers`: 8, `incomeRatioDividends`: 1, `incomeRatioTreasury`: 0).
  - Rate model constants: base rate fraction (`2827979481 / 2251799813685248`), kink (`13 / 20 = 0.65`).
  - Execution guardrails: `actionCount = 4`, `minBatchTime = 300,000 ms`, `maxBatchTime = 16`.

### C. LQ Native Asset
- **Asset ID**: `da8c30857834c6ae7203935b89278c532b3995245295456f993e1d244c51`
- **Initial Mint Tx**: `344c26673b9256b10e215d86095d9eb3c63def4b5a31cf50f12d4a133024eabc`
- **Total Supply**: `21,000,000 LQ` (retrieved in 81 ms).

### D. Liquidation Withdrawal Validator & Forensic Investigation
- **Liquidation Withdrawal Validator Script Hash**: `588bff228f6290f6c8308b909bac77adb82b7f6738c185008714b3b9`
- **Liquidation Reward / Stake Address**: `stake179vghlez3a3fpakgxz9epxavw7kms2mlvuuvrpgqsu2t8wgzx86ft`
- **Batcher Order Withdrawal Validator Script Hash**: `f10726d3903431a729948deaad3fae70c9b63707978ebcc1297e6428` (`stake178cswfknjq6rrfefjjx74tfl4ecvnd3hq7tca0xp99lxg2qayplyr`)
- **Mechanism**: Under recent protocol mechanics, liquidations execute by invoking the dedicated liquidation withdrawal validator (`588bff22...`) rather than minting explicit liquidation tokens.
- **Forensic Verification of All Events**:
  - **Batcher Disambiguation (`f10726d3...`)**: An audit of all 224 transactions invoking the batcher order withdrawal validator revealed that 100% (75/75) of debt reductions and loan closures were signed by the borrowers themselves using their own cryptographic keys. The transactions on September 22, 2026 were voluntary borrower repayments.
  - **Verified Market Liquidations (`588bff22...`)**: Exactly **two (2) market liquidations** exist in the history of the Cardano ledger, both occurring on **October 23, 2026** (Tx `fe909739...` and `ca1ad641...`), repaying ~1,800 ADA of underwater debt and seizing collateral without borrower signatures.
  - **Goodwill Settlement Disambiguation (Oct 26–28, 2026)**: The 8 loan closure transactions on October 26–28 for borrower `9559153bf7...` were administrative closures of underwater bad-debt positions left by July/August NIGHT liquidations under the Liqwid/Wanchain goodwill reimbursement initiative, cleanly excluded from normal market liquidations.
- **API Discrepancy & Dry-Spell Trajectory**: The official Liqwid API backend indexer only tracked legacy liquidation token mints, missing the October 23, 2026 liquidations and reporting an artificial 53-day quiet period. In reality, the dry spell peaked at 46 days (the 2nd longest dry spell ever) before resetting on October 23, 2026, currently standing at 9 days without liquidations.

---

## 4. Architectural Recommendation: The Hybrid Architecture

1. **Keep on Liqwid GraphQL API**:
   - Multi-year daily historical market aggregates (`marketHistory`, `protocolOverview`, `protocolFees`).
   - Sourcing this from Cardano directly requires an archival indexer (Cardano DB-Sync / Kupo / Ogmios), not a REST query loop.

2. **Migrate or Supplement via Blockfrost**:
   - **Real-Time On-Chain Verification**: Add an on-chain verification pass in the application for LQ token total supply, treasury balance, and staking.
   - **Proof of Reserves / Solvency Check**: Verify that the liquidity reported by the API matches real tokens sitting in the Cardano script addresses.
   - **Independent Loan Audit**: Cross-reference the API's `loans` results with live UTXOs at `addr1w96pzkhmw4ag5dylew8sfwulcw0erd4w27ztm0jw2c2q5sc3rtacg`.
