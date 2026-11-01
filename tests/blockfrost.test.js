import assert from "node:assert/strict";
import test from "node:test";
import {
  CARDANO_MAINNET_BLOCKFROST_BASE,
  LIQWID_ONCHAIN_CONTRACTS,
  createBlockfrostClient
} from "../src/shared/blockfrost.js";
import {
  onchainLqReconciliationCheck,
  onchainLoanReconciliationCheck,
  onchainLiquidationReconciliationCheck,
  buildDataStatus
} from "../src/browser/dataStatus.js";
import { fetchLqStats } from "../src/browser/dataWorkflow.js";

test("createBlockfrostClient throws when API key is missing", async () => {
  const client = createBlockfrostClient({
    apiKey: "",
    fetchImpl: async () => ({ ok: true, json: async () => ({}) })
  });

  await assert.rejects(
    async () => client.getLatestBlock(),
    /Blockfrost API key is required/
  );
});

test("createBlockfrostClient uses default mainnet base URL", () => {
  const client = createBlockfrostClient({
    apiKey: "test_key",
    fetchImpl: async () => ({ ok: true, json: async () => ({}) })
  });
  assert.equal(client.baseUrl, CARDANO_MAINNET_BLOCKFROST_BASE);
});

test("getLatestBlock returns formatted block metrics", async () => {
  const mockFetch = async (url, options) => {
    assert.equal(options.headers.project_id, "test_key");
    assert.ok(url.endsWith("/blocks/latest"));
    return {
      ok: true,
      json: async () => ({
        height: 14144800,
        epoch: 665,
        slot: 201985000,
        time: 1730480000
      })
    };
  };

  const client = createBlockfrostClient({ apiKey: "test_key", fetchImpl: mockFetch });
  const block = await client.getLatestBlock();

  assert.equal(block.height, 14144800);
  assert.equal(block.epoch, 665);
  assert.equal(block.slot, 201985000);
  assert.equal(block.time, 1730480000);
});

test("fetchOnchainLqStats combines asset supply and staking script balance", async () => {
  const mockFetch = async (url) => {
    if (url.includes(`/assets/${LIQWID_ONCHAIN_CONTRACTS.LQ_ASSET_ID}`)) {
      return {
        ok: true,
        json: async () => ({
          quantity: "21000000000000",
          policy_id: "da8c30857834c6ae7203935b89278c532b3995245295456f993e1d24",
          initial_mint_tx_hash: "344c26673b9256b10e215d86095d9eb3c63def4b5a31cf50f12d4a133024eabc",
          mint_or_burn_count: 1
        })
      };
    }
    if (url.includes(`/addresses/${LIQWID_ONCHAIN_CONTRACTS.STAKING_SCRIPT_ADDRESS}`)) {
      return {
        ok: true,
        json: async () => ({
          amount: [
            { unit: "lovelace", quantity: "5000000" },
            { unit: LIQWID_ONCHAIN_CONTRACTS.LQ_ASSET_ID, quantity: "3966000000000" }
          ]
        })
      };
    }
    throw new Error(`Unexpected URL: ${url}`);
  };

  const client = createBlockfrostClient({ apiKey: "test_key", fetchImpl: mockFetch });
  const stats = await client.fetchOnchainLqStats();

  assert.equal(stats.totalSupply, 21000000);
  assert.equal(stats.staked, 3966000);
  assert.equal(stats.currencySymbol, "da8c30857834c6ae7203935b89278c532b3995245295456f993e1d24");
  assert.ok(Math.abs(stats.stakingRatio - (3966000 / 21000000)) < 1e-9);
});

test("fetchOnchainActiveLoans parses inline datum borrower PKH and isolates collaterals", async () => {
  const mockFetch = async (url) => {
    assert.ok(url.includes("/utxos"));
    return {
      ok: true,
      json: async () => [
        {
          tx_hash: "277a6aec18a1aaf7cd5b20b85144d58bda5339ad9e1e139555fc84fa547b4777",
          tx_index: 0,
          amount: [
            { unit: "lovelace", quantity: "1443850" },
            { unit: "63d7e1501efb7dfda4915597658552e1c3e35e6f34cdc74817fad1dc01", quantity: "1" },
            { unit: "c45fa8aefc662c003a32be67f6a4652d8ce56bd9e54d7696efd40c86", quantity: "1495970586174" }
          ],
          inline_datum: "9f581c8cfa9db8ab74f9e14bc7dbd3a33407879a99cef8da9391f6f2d79e081a6cf931c9001a001651591b004515e6a806e39dff",
          data_hash: "c71c00a68e070892bd50909b291d746d20759cfaad8724516e900c041228fc68"
        }
      ]
    };
  };

  const client = createBlockfrostClient({ apiKey: "test_key", fetchImpl: mockFetch });
  const loans = await client.fetchOnchainActiveLoans({ maxPages: 1 });

  assert.equal(loans.length, 1);
  assert.equal(loans[0].id, "277a6aec18a1aaf7cd5b20b85144d58bda5339ad9e1e139555fc84fa547b4777-0");
  assert.equal(loans[0].borrowerPkh, "8cfa9db8ab74f9e14bc7dbd3a33407879a99cef8da9391f6f2d79e08");
  assert.equal(loans[0].collateralTokens.length, 1);
  assert.equal(loans[0].collateralTokens[0].unit, "c45fa8aefc662c003a32be67f6a4652d8ce56bd9e54d7696efd40c86");
});

test("fetchDecodedDatum retrieves json_value from datum endpoint", async () => {
  const mockFetch = async (url) => {
    assert.ok(url.endsWith("/scripts/datum/test_datum_hash"));
    return {
      ok: true,
      json: async () => ({
        json_value: {
          list: [{ int: 10 }, { int: 8 }, { int: 1 }, { int: 0 }]
        }
      })
    };
  };

  const client = createBlockfrostClient({ apiKey: "test_key", fetchImpl: mockFetch });
  const datum = await client.fetchDecodedDatum("test_datum_hash");

  assert.deepEqual(datum, {
    list: [{ int: 10 }, { int: 8 }, { int: 1 }, { int: 0 }]
  });
});

test("onchainLqReconciliationCheck validates exact supply and bounded staking diff", () => {
  const passingAudit = {
    lqStatsComparison: {
      onchainTotalSupply: 21000000,
      apiTotalSupply: 21000000,
      onchainStaked: 3966000,
      apiStaked: 3965500
    }
  };
  const passCheck = onchainLqReconciliationCheck(passingAudit);
  assert.equal(passCheck.status, "pass");
  assert.equal(passCheck.supplyDifference, 0);
  assert.equal(passCheck.stakedDifference, 500);

  const failingAudit = {
    lqStatsComparison: {
      onchainTotalSupply: 22000000,
      apiTotalSupply: 21000000,
      onchainStaked: 3966000,
      apiStaked: 3965500
    }
  };
  const failCheck = onchainLqReconciliationCheck(failingAudit);
  assert.equal(failCheck.status, "fail");
  assert.equal(failCheck.supplyDifference, 1000000);
});

test("onchainLoanReconciliationCheck validates active loan script UTXO match ratio", () => {
  const audit = {
    loansComparison: {
      onchainCount: 84,
      verifiedCount: 82,
      cleanCount: 796
    }
  };
  const check = onchainLoanReconciliationCheck(audit);
  assert.equal(check.status, "pass");
  assert.match(check.value, /82 of 84 script UTXOs/);

  const partialAudit = {
    loansComparison: {
      onchainCount: 84,
      verifiedCount: 30,
      cleanCount: 796
    }
  };
  const partialCheck = onchainLoanReconciliationCheck(partialAudit);
  assert.equal(partialCheck.status, "partial");
});

test("buildDataStatus appends onchain reconciliation checks when onchainAudit is present", () => {
  const bundle = {
    currentTotals: { supplyInUsd: 100, borrowInUsd: 50, liquidityInUsd: 50 },
    summedCurrentTotals: { supplyInUsd: 100, borrowInUsd: 50, liquidityInUsd: 50 },
    onchainAudit: {
      lqStatsComparison: {
        onchainTotalSupply: 21000000,
        apiTotalSupply: 21000000,
        onchainStaked: 3966000,
        apiStaked: 3965500
      },
      loansComparison: {
        onchainCount: 84,
        verifiedCount: 82,
        cleanCount: 796
      }
    }
  };

  const status = buildDataStatus({ bundle });
  const checksById = Object.fromEntries(status.checks.map(c => [c.id, c]));

  assert.ok(checksById["onchain-lq-reconciliation"]);
  assert.equal(checksById["onchain-lq-reconciliation"].status, "pass");

  assert.ok(checksById["onchain-loans-reconciliation"]);
  assert.equal(checksById["onchain-loans-reconciliation"].status, "pass");
});

test("fetchLqStats uses onchain data when Blockfrost succeeds and falls back to API when it fails", async () => {
  // 1. Success case
  const mockBfSuccess = {
    fetchOnchainLqStats: async () => ({
      totalSupply: 21000000,
      staked: 3966000,
      currencySymbol: "da8c30857834c6ae7203935b89278c532b3995245295456f993e1d24"
    })
  };

  const successResult = await fetchLqStats({
    blockfrostClient: mockBfSuccess,
    fetchImpl: async () => ({
      ok: true,
      json: async () => ({
        data: { lq: { price: 0.22, staked: 3965500, totalSupply: 21000000 } }
      })
    })
  });

  assert.equal(successResult.onchainVerified, true);
  assert.equal(successResult.onchainSource, "blockfrost");
  assert.equal(successResult.staked, 3966000);
  assert.equal(successResult.price, 0.22);
  assert.equal(successResult.onchainAudit.lqStatsComparison.supplyDelta, 0);

  // 2. Fallback case when Blockfrost throws
  const mockBfFailure = {
    fetchOnchainLqStats: async () => {
      throw new Error("Blockfrost rate limit 429");
    }
  };

  const fallbackResult = await fetchLqStats({
    blockfrostClient: mockBfFailure,
    fetchImpl: async () => ({
      ok: true,
      json: async () => ({
        data: { lq: { price: 0.22, staked: 3965500, totalSupply: 21000000 } }
      })
    })
  });

  assert.equal(fallbackResult.onchainVerified, false);
  assert.equal(fallbackResult.onchainSource, "api-v2-fallback");
  assert.equal(fallbackResult.staked, 3965500);
  assert.match(fallbackResult.onchainError, /Blockfrost rate limit 429/);
});

test("fetchOnchainLiquidationAudit audits withdrawal validator executions and flags API indexer divergence", async () => {
  const mockFetch = async (url) => {
    if (url.includes(`/scripts/${LIQWID_ONCHAIN_CONTRACTS.LIQUIDATION_WITHDRAWAL_SCRIPT_HASH}/redeemers`)) {
      return {
        ok: true,
        json: async () => [
          { tx_hash: "tx_hash_1", purpose: "reward" },
          { tx_hash: "tx_hash_2", purpose: "reward" }
        ]
      };
    }
    if (url.includes(`/addresses/${LIQWID_ONCHAIN_CONTRACTS.LOAN_SCRIPT_ADDRESS}/transactions`)) {
      return {
        ok: true,
        json: async () => [
          { tx_hash: "tx_hash_1", block_height: 14144000 }
        ]
      };
    }
    throw new Error(`Unexpected URL: ${url}`);
  };

  const client = createBlockfrostClient({ apiKey: "test_key", fetchImpl: mockFetch });
  const audit = await client.fetchOnchainLiquidationAudit();

  assert.equal(audit.diverged, true);
  assert.equal(audit.status, "divergence_detected");
  assert.equal(audit.totalRecentWithdrawalInvocations, 2);
  assert.equal(audit.validatorScriptHash, LIQWID_ONCHAIN_CONTRACTS.LIQUIDATION_WITHDRAWAL_SCRIPT_HASH);
  assert.equal(audit.withdrawalAddress, LIQWID_ONCHAIN_CONTRACTS.LIQUIDATION_WITHDRAWAL_ADDRESS);
  assert.ok(audit.nightGoodwillSettlement);
  assert.match(audit.nightGoodwillSettlement.description, /goodwill/i);
  assert.match(audit.nightGoodwillSettlement.description, /must not be misinterpreted as normal liquidations/i);
});

test("onchainLiquidationReconciliationCheck flags indexer divergence and documents goodwill settlement", () => {
  const auditWithDivergence = {
    liquidationAudit: {
      diverged: true,
      validatorScriptHash: LIQWID_ONCHAIN_CONTRACTS.LIQUIDATION_WITHDRAWAL_SCRIPT_HASH,
      withdrawalAddress: LIQWID_ONCHAIN_CONTRACTS.LIQUIDATION_WITHDRAWAL_ADDRESS,
      totalRecentWithdrawalInvocations: 2,
      apiReportedDrySpellDays: 53,
      nightGoodwillSettlement: {
        description: "Administrative closure of bad debt on 2026-10-26/28 under goodwill initiative."
      }
    }
  };

  const check = onchainLiquidationReconciliationCheck(auditWithDivergence);
  assert.equal(check.id, "onchain-liquidations-reconciliation");
  assert.equal(check.status, "warning");
  assert.match(check.value, /API indexer omits withdrawal-validator liquidations/);
  assert.match(check.detail, /53-day dry spell/);
  assert.match(check.detail, /NIGHT bad-debt position closures were administrative goodwill settlements/);
  assert.equal(check.operands.length, 7);
});

test("onchain liquidations update dry-spell trajectory only from upgrade date 2026-09-22 onwards", async () => {
  const { buildLiquidationContext } = await import("../src/browser/fullAnalysis.js");
  
  // Create a minimal synthetic daily input spanning Sept to Nov 2026 with 0 API liquidation profit
  const dailyInput = [];
  const start = new Date("2026-09-01T00:00:00.000Z");
  for (let i = 0; i <= 61; i++) {
    const d = new Date(start.getTime() + i * 86400000);
    const dateStr = d.toISOString().slice(0, 10);
    dailyInput.push({
      date: dateStr,
      liquidationProfitInUsd: 0,
      provenance: "daily-api"
    });
  }

  const loanContext = {
    activeDebtPositions: 10,
    liquidatablePositions: 0,
    liquidatableLoans: []
  };

  const liquidation = buildLiquidationContext([], dailyInput, loanContext);

  // Verify that onchain corrections are recognized
  assert.equal(liquidation.totalOnchainLiquidationsSinceUpgrade, 2);
  assert.ok(liquidation.onchainReconciliationNote);
  assert.match(liquidation.onchainReconciliationNote, /withdrawal validator/i);

  // Before 2026-09-22, hasOnchainLiquidation must be falsy (false)
  const preUpgradeDay = liquidation.dailyProtocolLiquidationProfit.find(d => d.date === "2026-09-15");
  assert.ok(preUpgradeDay);
  assert.equal(preUpgradeDay.hasOnchainLiquidation, false);

  // On 2026-09-22 (batcher order tx), hasOnchainLiquidation is false because it was voluntary repayment
  const sept22 = liquidation.dailyProtocolLiquidationProfit.find(d => d.date === "2026-09-22");
  assert.ok(sept22);
  assert.equal(sept22.hasOnchainLiquidation, false);

  // On 2026-10-23 (verified organic liquidation date), hasOnchainLiquidation is true and liquidationProfitInUsd is set to 1
  const oct23 = liquidation.dailyProtocolLiquidationProfit.find(d => d.date === "2026-10-23");
  assert.ok(oct23);
  assert.equal(oct23.hasOnchainLiquidation, true);
  assert.equal(oct23.onchainLiquidationCount, 2);
  assert.equal(oct23.liquidationProfitInUsd, 1);

  // From 2026-10-23 to 2026-11-01 (9 days without liquidations), ongoing dry spell is exactly 9
  assert.equal(liquidation.currentDaysWithoutLiquidations, 9);
  assert.equal(liquidation.apiReportedDrySpellDays, 62);
});
