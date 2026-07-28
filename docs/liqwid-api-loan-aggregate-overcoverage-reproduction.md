# Liqwid v2 API: loan rows can exceed a market borrow aggregate

## Summary

The official Liqwid v2 GraphQL API can return a market whose summed active-loan debt is greater than the same market's official `borrow` aggregate. This produces loan-row coverage above 100%.

The comparison is strict:

- loan-row debt below market borrow is undercoverage;
- loan-row debt equal to market borrow is reconciled;
- loan-row debt above market borrow is overcoverage.

There is no rounding or percentage-point tolerance in the classification. The runnable example fetches both API surfaces in one GraphQL operation and compares their numeric values directly.

Official endpoint: `https://v2.api.liqwid.finance/graphql`

## Why this looks like a snapshot-synchronization issue

`Market.borrow(input: { currency: USD })` is described by the schema as the total borrow in the market. `Loan.amount(input: { currency: USD })` is the debt returned for each loan selected by `HAS_DEBT`. If the loan rows are the position-level decomposition of the market aggregate, their sum should not exceed that aggregate.

Querying markets and loans in one GraphQL HTTP request removes client-side request ordering as the explanation. It does not prove that the server's resolvers, caches, or backing indexes use one atomic snapshot. The observed result is therefore consistent with the loan-detail and market-aggregate surfaces refreshing at different times, but the API team will need to confirm the actual cause.

`Loan.adjustedAmount` is also printed below. It does not close the observed overcoverage, so the initial minimum-interest adjustment does not explain the mismatch in the reproduced example.

The API also returns `Loan.interest`, although the current GraphQL schema provides no description for that field and exposes it only in the borrowed asset's native unit. The reproduction therefore converts the summed loan interest to USD using the same market asset price returned in the operation. For the reproduced LP market, that interest explains only 0.156% of the loan-row excess. Subtracting all returned loan interest still leaves more than $7,240 of overcoverage. Several nearly reconciled markets also return substantial non-zero loan interest, so `Loan.interest` is not an additional operand that can simply be added to or removed from this reconciliation. The API team should confirm whether it is already included in `Loan.amount`, but numerically it cannot explain the material mismatch documented here.

## Reproduction

Requirements: Node.js 20 or newer. The script has no dependencies, reads no app files, and reads no saved archive. Save it as `check-liqwid-overcoverage.mjs` and run `node check-liqwid-overcoverage.mjs`. An optional first argument can select another market ID.

```javascript
const endpoint = "https://v2.api.liqwid.finance/graphql";
const targetMarketId = process.argv[2] || "USDCx-USDM-SUNDAE-LP-STABLESWAP";

const query = `
query LoanAggregateReconciliation(
  $marketPage: Int!
  $marketPerPage: Int!
  $loanInput: LoansInput
) {
  liqwid {
    data {
      markets(input: { page: $marketPage, perPage: $marketPerPage }) {
        totalCount
        pagesCount
        results {
          id
          displayName
          updatedAt
          borrow(input: { currency: USD })
          asset {
            price
            priceUpdatedAt
          }
        }
      }
      loans(input: $loanInput) {
        totalCount
        pagesCount
        results {
          marketId
          amount(input: { currency: USD })
          adjustedAmount(input: { currency: USD })
          interest
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
      marketPage: 0,
      marketPerPage: 100,
      loanInput: { page: 0, perPage: 1000, filters: ["HAS_DEBT"] }
    }
  })
});

if (!response.ok) {
  throw new Error(`HTTP ${response.status}: ${await response.text()}`);
}

const payload = await response.json();
if (payload.errors?.length) {
  throw new Error(JSON.stringify(payload.errors, null, 2));
}

const data = payload.data?.liqwid?.data;
if (!data) throw new Error("The response did not contain liqwid.data.");
if (data.markets.pagesCount !== 1 || data.loans.pagesCount !== 1) {
  throw new Error(
    `The reproduction requires one complete page: ` +
    `markets=${data.markets.pagesCount}, loans=${data.loans.pagesCount}`
  );
}

const market = data.markets.results.find((row) => row.id === targetMarketId);
if (!market) throw new Error(`Market not found: ${targetMarketId}`);

const loans = data.loans.results.filter((row) => row.marketId === targetMarketId);
const sum = (rows, key) => rows.reduce((total, row) => total + Number(row[key] ?? 0), 0);
const marketBorrowInUsd = Number(market.borrow);
const loanAmountInUsd = sum(loans, "amount");
const adjustedLoanAmountInUsd = sum(loans, "adjustedAmount");
const loanInterest = sum(loans, "interest");
const marketAssetPriceInUsd = Number(market.asset?.price ?? 0);
const loanInterestInUsd = loanInterest * marketAssetPriceInUsd;
const differenceInUsd = loanAmountInUsd - marketBorrowInUsd;
const adjustedDifferenceInUsd = adjustedLoanAmountInUsd - marketBorrowInUsd;
const differenceAfterSubtractingInterestInUsd = differenceInUsd - loanInterestInUsd;
const coverage = loanAmountInUsd / marketBorrowInUsd;
const adjustedCoverage = adjustedLoanAmountInUsd / marketBorrowInUsd;
const interestShareOfDifference = differenceInUsd > 0
  ? loanInterestInUsd / differenceInUsd
  : null;
const classification = differenceInUsd < 0
  ? "undercoverage"
  : differenceInUsd > 0
    ? "overcoverage"
    : "reconciled";

console.log(JSON.stringify({
  fetchedAt: new Date().toISOString(),
  endpoint,
  marketId: market.id,
  marketDisplayName: market.displayName,
  marketUpdatedAt: market.updatedAt,
  marketsReturned: data.markets.totalCount,
  activeLoansReturned: data.loans.totalCount,
  targetActiveLoanRows: loans.length,
  marketBorrowInUsd,
  loanAmountInUsd,
  differenceInUsd,
  coverage,
  coveragePercent: coverage * 100,
  adjustedLoanAmountInUsd,
  adjustedDifferenceInUsd,
  adjustedCoveragePercent: adjustedCoverage * 100,
  loanInterest,
  marketAssetPriceInUsd,
  marketAssetPriceUpdatedAt: market.asset?.priceUpdatedAt ?? null,
  loanInterestInUsd,
  interestShareOfDifferencePercent:
    interestShareOfDifference === null ? null : interestShareOfDifference * 100,
  differenceAfterSubtractingInterestInUsd,
  classification
}, null, 2));

if (differenceInUsd <= 0) {
  console.error("NOT REPRODUCED: target loan-row debt does not currently exceed market borrow.");
  process.exitCode = 1;
} else {
  console.log("REPRODUCED: target loan-row debt currently exceeds market borrow.");
}
```

## Point-in-time example

The exact JavaScript block above was extracted from this Markdown file and piped directly to Node on 18 July 2026 at 17:49 UTC. Three immediately preceding runs and the extracted-code run returned identical operands for `USDCx-USDM-SUNDAE-LP-STABLESWAP` (`LPS-USDCx-USDM`):

| Operand | USD |
|---|---:|
| Official market borrow | 78,515.194184099 |
| Sum of 18 active-loan `amount` rows | 85,766.5622036288 |
| Loan amount minus market borrow | **+7,251.368019529793** |
| Coverage | **109.235624%** |
| Sum of `adjustedAmount` | 85,709.1344204338 |
| Adjusted amount minus market borrow | **+7,193.940236334791** |
| Sum of `Loan.interest`, converted at the returned asset price | 11.3136575238 |
| Interest as a share of the excess | **0.156021%** |
| Excess remaining after subtracting all returned loan interest | **+7,240.0543620059925** |

This rules out both returned interest measures as explanations for the material overcoverage:

- the initial minimum-interest adjustment accounts for only $57.43 of the $7,251.37 excess;
- all returned `Loan.interest` accounts for only $11.31 of the excess.

As a cross-check, the same operation returned markets whose summed `Loan.amount` reconciled almost exactly to `Market.borrow` despite substantial non-zero `Loan.interest`. For example, wanUSDT differed by less than $0.000001 while its loan rows returned approximately $160,461.89 of interest. This would not be possible if interest were simply a missing term in the reconciliation formula.

The numbers are current-state values and may change as the API refreshes. The script deliberately exits with a nonzero code if the selected market is no longer overcovered.

## Questions for the API team

1. Should all `HAS_DEBT` loan `amount` values for a market reconcile exactly to that market's `borrow`?
2. Is `Loan.interest` already included in `Loan.amount`, and does `Market.borrow` use the same debt-and-interest accounting basis?
3. Do the `markets` and `loans` resolvers use different caches, indexes, update jobs, block heights, or valuation timestamps?
4. Does one GraphQL operation provide snapshot consistency across those two fields?
5. Can the API expose a common block height, snapshot ID, or resolver timestamp so consumers can verify alignment?
6. If exact reconciliation is not expected, what is the intended accounting relationship between `Market.borrow`, `Loan.amount`, `Loan.adjustedAmount`, and `Loan.interest`?

## Interpretation boundary

The reproduction proves that the two official API surfaces can return non-reconciling current values, including a loan-row total above the market aggregate. It does not establish which surface is stale or incorrect, nor does it prove the server-side mechanism causing the mismatch.
