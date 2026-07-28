# Liqwid v2 API: Market Borrow vs Active Loan Book Reconciliation

## Purpose

This note documents a reproducible check of three current borrow measurements exposed by the official Liqwid v2 GraphQL API:

1. Protocol-level borrow.
2. The sum of borrow reported by every market.
3. The sum of active loan debt grouped by borrowing market.

Official endpoint:

```text
https://v2.api.liqwid.finance/graphql
```

## Summary

The protocol-level borrow reconciles exactly with the sum of all market-level borrow values.

However, the sum of the active loan rows returned by `loans(filters: ["HAS_DEBT"])` does not reproduce the market-level borrow for DJED and USDM.

In the example snapshot below, the total difference between market borrow and returned active-loan debt is approximately **$1.965 million**. Almost the entire difference is attributable to DJED and USDM.

This should currently be treated as an API-semantics or data-reconciliation question, not automatically as an API bug.

## API fields compared

### Protocol borrow

```graphql
liqwid.data.borrow(input: { currency: USD })
```

### Market borrow

```graphql
liqwid.data.markets.results[].borrow(input: { currency: USD })
```

### Active loan debt

```graphql
liqwid.data.loans(
  input: {
    filters: ["HAS_DEBT"]
    page: 0
    perPage: 1000
  }
).results[].amount(input: { currency: USD })
```

Loan rows are grouped by `marketId`, and their `amount` values are summed within each market.

## Example result

Snapshot time: **2026-07-16 14:47 UTC**

| Measurement | USD |
|---|---:|
| Protocol `borrow` | $6,078,079.89 |
| Sum of all market `borrow` | $6,078,079.89 |
| Sum of all active-loan `amount` | $4,112,653.93 |
| Market borrow minus active-loan debt | **$1,965,425.97** |

The protocol total and summed market total matched exactly in this snapshot.

### Material market differences

| Market | Market borrow | Active-loan amount | Difference | Difference as % of market borrow |
|---|---:|---:|---:|---:|
| DJED | $2,206,911.47 | $926,718.38 | **+$1,280,193.09** | 58.01% |
| USDM | $843,416.44 | $158,183.60 | **+$685,232.84** | 81.24% |

Together, the DJED and USDM differences total approximately **$1,965,425.94**.

After excluding these two markets, the net difference across the rest of the protocol is approximately **$0.03**.

### Smaller market differences over $1

| Market | Market borrow minus active-loan amount |
|---|---:|
| USDCx | +$110.87 |
| SHEN | -$70.66 |
| USDCx-USDM-SUNDAE-LP-STABLESWAP | -$52.83 |
| USDA | +$50.99 |
| NIGHT | -$18.37 |
| USDC | -$14.26 |
| MIN | -$2.53 |
| IAG | -$1.98 |
| ERG | -$1.08 |

These smaller positive and negative differences largely cancel. They may reflect rounding, price conversion, indexing or snapshot differences. SHEN is notable in relative terms because its approximately $71 difference represents roughly 3.17% of its small borrow total.

## Interest check

The separate loan `interest` field does not appear to explain the material difference:

| Measurement | USD |
|---|---:|
| Sum of active-loan `amount` | $4,112,653.93 |
| Sum of returned loan `interest` | approximately $427,683.81 |
| Counterfactual `amount + interest` | approximately $4,540,337.74 |
| Difference still remaining | approximately $1,537,742.16 |

Adding `interest` to `amount` is only a counterfactual test. It may double-count interest.

For the inspected loan rows, the following identity holds to floating-point precision:

```text
loan amount in USD = loan collateral in USD x loan LTV
```

This indicates that `amount` is the debt numerator used by the loan-risk calculation. It is therefore reasonable to ask whether accrued interest is already included in `amount`, rather than assuming that `interest` should be added separately.

## Questions for Liqwid protocol/API developers

> I am trying to clarify the reconciliation semantics of the Liqwid v2 GraphQL API.
>
> The protocol-level `liqwid.data.borrow(input: { currency: USD })` reconciles exactly with the sum of `markets.results[].borrow(input: { currency: USD })`.
>
> However, when I fetch all rows from `loans(input: { filters: ["HAS_DEBT"] })`, group them by `marketId`, and sum `amount(input: { currency: USD })`, the result does not reproduce market borrow for DJED and USDM.
>
> In a snapshot on 16 July 2026:
>
> - Total market borrow was approximately $6.078m.
> - Total returned active-loan `amount` was approximately $4.113m.
> - The difference was approximately $1.965m.
> - Approximately $1.280m of the difference was DJED.
> - Approximately $685k of the difference was USDM.
>
> The query returned one complete page containing 26 markets and one complete page containing 556 active loans.
>
> I also tested the separate `interest` field. Adding it to `amount` does not close the difference and may double-count interest. For the returned loans, `amount` also exactly matches `collateral x LTV`, suggesting that it is the debt value used in the loan-risk calculation.
>
> Could you clarify:
>
> 1. What are the precise semantics of `Market.borrow`, `Loan.amount`, `Loan.adjustedAmount` and `Loan.interest`?
> 2. Does `Loan.amount` already include accrued interest?
> 3. Does `loans(filters: ["HAS_DEBT"])` return every active debt position contributing to `Market.borrow`, or only a subset?
> 4. Are any debt states or position types included in market borrow but omitted from the loans endpoint?
> 5. Is there a recommended API query or field for reconciling the complete loan book with each market's current borrow?
> 6. Could the market and loan resolvers use different indexes, cache timestamps or valuation timestamps?

## Runnable check

Requirements: Node.js 18 or newer.

Save the following as `check-borrow-reconciliation.mjs`, then run:

```powershell
node check-borrow-reconciliation.mjs
```

```js
const endpoint = "https://v2.api.liqwid.finance/graphql";

const query = `
query Reconcile($loanInput: LoansInput) {
  liqwid {
    data {
      borrow(input: { currency: USD })

      markets(input: { page: 0, perPage: 1000 }) {
        totalCount
        pagesCount
        results {
          id
          borrow(input: { currency: USD })
        }
      }

      loans(input: $loanInput) {
        totalCount
        pagesCount
        results {
          marketId
          amount(input: { currency: USD })
        }
      }
    }
  }
}
`;

const response = await fetch(endpoint, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({
    query,
    variables: {
      loanInput: {
        filters: ["HAS_DEBT"],
        page: 0,
        perPage: 1000
      }
    }
  })
});

const payload = await response.json();

if (payload.errors) {
  throw new Error(JSON.stringify(payload.errors, null, 2));
}

const data = payload.data.liqwid.data;

if (data.markets.pagesCount !== 1 || data.loans.pagesCount !== 1) {
  throw new Error(
    `More than one page returned: ` +
    `markets=${data.markets.pagesCount}, loans=${data.loans.pagesCount}`
  );
}

const loansByMarket = new Map();

for (const loan of data.loans.results) {
  const current = loansByMarket.get(loan.marketId) ?? {
    amount: 0,
    count: 0
  };

  current.amount += Number(loan.amount ?? 0);
  current.count += 1;
  loansByMarket.set(loan.marketId, current);
}

const results = data.markets.results.map((market) => {
  const loans = loansByMarket.get(market.id) ?? {
    amount: 0,
    count: 0
  };

  const marketBorrow = Number(market.borrow ?? 0);
  const loanAmount = loans.amount;
  const gap = marketBorrow - loanAmount;

  return {
    market: market.id,
    marketBorrow,
    activeLoanAmount: loanAmount,
    gap,
    gapPercent: marketBorrow ? (100 * gap) / marketBorrow : 0,
    activeLoans: loans.count
  };
});

const sum = (values) =>
  values.reduce((total, value) => total + value, 0);

const protocolBorrow = Number(data.borrow);
const summedMarketBorrow = sum(
  results.map((row) => row.marketBorrow)
);
const summedLoanAmount = sum(
  results.map((row) => row.activeLoanAmount)
);

console.log({
  protocolBorrowUSD: protocolBorrow.toFixed(2),
  summedMarketBorrowUSD: summedMarketBorrow.toFixed(2),
  protocolVsMarketsGapUSD:
    (protocolBorrow - summedMarketBorrow).toFixed(6),
  summedActiveLoanAmountUSD: summedLoanAmount.toFixed(2),
  marketsVsLoansGapUSD:
    (summedMarketBorrow - summedLoanAmount).toFixed(2),
  marketsReturned: data.markets.totalCount,
  activeLoansReturned: data.loans.totalCount
});

console.table(
  results
    .filter((row) => Math.abs(row.gap) > 1)
    .sort((a, b) => Math.abs(b.gap) - Math.abs(a.gap))
    .map((row) => ({
      market: row.market,
      marketBorrowUSD: row.marketBorrow.toFixed(2),
      activeLoanAmountUSD: row.activeLoanAmount.toFixed(2),
      gapUSD: row.gap.toFixed(2),
      gapPercent: `${row.gapPercent.toFixed(3)}%`,
      activeLoans: row.activeLoans
    }))
);
```

## Interpretation boundary

This check establishes what the API returns and where its surfaces do not reconcile. It does not establish that the market data or loan data is incorrect.

The unresolved question is whether the `HAS_DEBT` loan endpoint is intended to provide:

- an exhaustive accounting view that should sum to market borrow; or
- a position-risk view that may intentionally omit debt included in market accounting.

That semantic distinction should be confirmed with the Liqwid protocol or API developers before the discrepancy is presented as a data-quality failure.
