import assert from "node:assert/strict";
import test from "node:test";

import {
  buildMarketHistoryRequest,
  buildMarketParamsHistoryRequest,
  buildPublicMarketsRequest,
  fetchPublicMarkets,
  postGraphql
} from "../src/browser/dataWorkflow.js";

test("public markets request uses pagination variables", () => {
  const request = buildPublicMarketsRequest(2, 50);
  assert.equal(request.variables.page, 2);
  assert.equal(request.variables.perPage, 50);
  assert.match(request.query, /markets\(input:/);
  assert.match(request.query, /supply\(input:/);
  assert.doesNotMatch(request.query, /filters: \[PUBLIC\]/);
});

test("market history request carries market, date range, and interval", () => {
  const request = buildMarketHistoryRequest({
    marketId: "DJED",
    startDay: "2025-01-01",
    endDay: "2026-01-01",
    interval: "DAY"
  });

  assert.deepEqual(request.variables, {
    marketId: "DJED",
    startDate: "2025-01-01T00:00:00Z",
    endDate: "2026-01-01T23:59:59Z",
    interval: "DAY"
  });
  assert.match(request.query, /debtRepaidInUsd/);
  assert.match(request.query, /interestAccruedInUsd/);
  assert.match(request.query, /interestRepaidInUsd/);
});

test("market params request includes interest-model fields", () => {
  const request = buildMarketParamsHistoryRequest({
    marketId: "USDM",
    startDay: "2024-01-01",
    endDay: "2026-01-01"
  });

  assert.equal(request.variables.marketId, "USDM");
  assert.equal(request.variables.startDate, "2024-01-01T00:00:00Z");
  assert.equal(request.variables.endDate, "2026-01-01T23:59:59Z");
  assert.match(request.query, /utilMultiplierJump/);
  assert.match(request.query, /kink/);
});

test("postGraphql surfaces GraphQL errors from the API response", async () => {
  const fetchImpl = async () => ({
    ok: true,
    json: async () => ({ errors: [{ message: "bad query" }] })
  });

  await assert.rejects(
    () => postGraphql({ query: "{ nope }" }, { fetchImpl, retries: 0 }),
    /bad query/
  );
});

test("postGraphql retries transient transport failures and names the failed operation", async () => {
  let attempts = 0;
  const fetchImpl = async () => {
    attempts += 1;
    throw new TypeError("Failed to fetch");
  };

  await assert.rejects(
    () => postGraphql({ query: "query ProtocolFees { analytics { __typename } }" }, { fetchImpl, retries: 2, retryDelayMs: 0 }),
    /ProtocolFees failed after 3 attempts: Failed to fetch/
  );
  assert.equal(attempts, 3);
});

test("postGraphql always calls the official Liqwid endpoint", async () => {
  let requestedUrl = null;
  const fetchImpl = async (url) => {
    requestedUrl = url;
    return { ok: true, json: async () => ({ data: { ok: true } }) };
  };

  await postGraphql({ query: "{ __typename }" }, { fetchImpl, retries: 0 });
  assert.equal(requestedUrl, "https://v2.api.liqwid.finance/graphql");
  await assert.rejects(
    () => postGraphql({ query: "{ __typename }" }, { endpoint: "https://example.com/graphql", fetchImpl, retries: 0 }),
    /official Liqwid endpoint/
  );
});

test("public market pagination preserves each GraphQL page response", async () => {
  const requestedPages = [];
  const streamedPages = [];
  const fetchImpl = async (_url, options) => {
    const request = JSON.parse(options.body);
    requestedPages.push(request.variables.page);
    const page = request.variables.page;
    return {
      ok: true,
      async json() {
        return {
          data: {
            liqwid: {
              data: {
                supply: 30,
                borrow: 6,
                liquidity: 24,
                interpolatedDeposits: 0,
                markets: {
                  page,
                  perPage: 1,
                  pagesCount: 2,
                  totalCount: 2,
                  results: [{ id: page === 0 ? "A" : "B" }]
                }
              }
            }
          }
        };
      }
    };
  };

  const result = await fetchPublicMarkets({
    fetchImpl,
    retries: 0,
    perPage: 1,
    async onPage(page) { streamedPages.push(page.page); }
  });

  assert.deepEqual(requestedPages, [0, 1]);
  assert.deepEqual(streamedPages, [0, 1]);
  assert.deepEqual(result.markets.map((market) => market.id), ["A", "B"]);
  assert.equal(result.rawPages.length, 2);
  assert.equal(result.rawPages[1].request.variables.page, 1);
  assert.equal(result.rawPages[1].payload.liqwid.data.markets.results[0].id, "B");
});
