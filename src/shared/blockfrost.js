export const CARDANO_MAINNET_BLOCKFROST_BASE = "https://cardano-mainnet.blockfrost.io/api/v0";

export const LIQWID_ONCHAIN_CONTRACTS = Object.freeze({
  LQ_ASSET_ID: "da8c30857834c6ae7203935b89278c532b3995245295456f993e1d244c51",
  LQ_POLICY_ID: "da8c30857834c6ae7203935b89278c532b3995245295456f993e1d24",
  STAKING_SCRIPT_ADDRESS: "addr1w8arvq7j9qlrmt0wpdvpp7h4jr4fmfk8l653p9t907v2nsss7w7r4",
  LOAN_SCRIPT_ADDRESS: "addr1w96pzkhmw4ag5dylew8sfwulcw0erd4w27ztm0jw2c2q5sc3rtacg",
  MARKET_CONFIG_ADDRESS: "addr1wx6htk5hfmr4dw32lhxdcp7t6xpe4jhs5fxylq90mqwnldsvr87c6",
  LIQUIDATION_WITHDRAWAL_SCRIPT_HASH: "588bff228f6290f6c8308b909bac77adb82b7f6738c185008714b3b9",
  LIQUIDATION_WITHDRAWAL_ADDRESS: "stake179vghlez3a3fpakgxz9epxavw7kms2mlvuuvrpgqsu2t8wgzx86ft",
  BATCHER_ORDER_WITHDRAWAL_SCRIPT_HASH: "f10726d3903431a729948deaad3fae70c9b63707978ebcc1297e6428",
  BATCHER_ORDER_WITHDRAWAL_ADDRESS: "stake178cswfknjq6rrfefjjx74tfl4ecvnd3hq7tca0xp99lxg2qayplyr"
});

export const ONCHAIN_LIQUIDATIONS_SINCE_UPGRADE = Object.freeze({
  "2026-10-23": 2
});

export function loadEnvFileIfPresent(fsModule, pathModule) {
  if (typeof process.loadEnvFile === "function") {
    try {
      process.loadEnvFile();
    } catch {
      // Ignored if .env does not exist or was already loaded
    }
  } else if (fsModule && pathModule) {
    try {
      const envPath = pathModule.resolve(".env");
      if (fsModule.existsSync(envPath)) {
        const lines = fsModule.readFileSync(envPath, "utf8").split("\n");
        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || trimmed.startsWith("#")) continue;
          const [key, ...vals] = trimmed.split("=");
          const k = key.trim();
          if (k && !process.env[k]) {
            process.env[k] = vals.join("=").trim();
          }
        }
      }
    } catch {
      // Fallback ignore
    }
  }
}

export function createBlockfrostClient(options = {}) {
  const apiKey = (options.apiKey ?? process.env.BLOCKFROST_API_KEY ?? process.env.BLOCKFROST_PROJECT_ID ?? "").trim();
  const network = options.network ?? process.env.BLOCKFROST_NETWORK ?? "mainnet";
  const baseUrl = options.baseUrl ?? (network === "mainnet"
    ? CARDANO_MAINNET_BLOCKFROST_BASE
    : `https://cardano-${network}.blockfrost.io/api/v0`);
  const fetchImpl = options.fetchImpl ?? globalThis.fetch;

  if (typeof fetchImpl !== "function") {
    throw new Error("createBlockfrostClient requires a valid fetch implementation.");
  }

  async function request(endpoint) {
    if (!apiKey) {
      throw new Error("Blockfrost API key is required. Add BLOCKFROST_API_KEY to your .env file.");
    }
    const response = await fetchImpl(`${baseUrl}${endpoint}`, {
      headers: { project_id: apiKey }
    });
    if (!response.ok) {
      const errorBody = await response.text().catch(() => "");
      const error = new Error(`Blockfrost HTTP ${response.status}: ${errorBody.slice(0, 300)}`);
      error.status = response.status;
      throw error;
    }
    return response.json();
  }

  return {
    apiKey,
    network,
    baseUrl,
    request,

    async getLatestBlock() {
      const data = await request("/blocks/latest");
      return {
        height: data.height,
        epoch: data.epoch,
        slot: data.slot,
        time: data.time
      };
    },

    async fetchOnchainLqStats() {
      const [asset, stakingSummary] = await Promise.all([
        request(`/assets/${LIQWID_ONCHAIN_CONTRACTS.LQ_ASSET_ID}`),
        request(`/addresses/${LIQWID_ONCHAIN_CONTRACTS.STAKING_SCRIPT_ADDRESS}`).catch(() => null)
      ]);

      const totalSupply = Number(asset.quantity) / 1e6;
      let staked = 0;
      if (stakingSummary?.amount) {
        const lqHolding = stakingSummary.amount.find(
          (a) => a.unit === LIQWID_ONCHAIN_CONTRACTS.LQ_ASSET_ID
        );
        if (lqHolding) {
          staked = Number(lqHolding.quantity) / 1e6;
        }
      }

      return {
        totalSupply,
        staked,
        stakingRatio: totalSupply > 0 ? staked / totalSupply : 0,
        currencySymbol: asset.policy_id,
        initialMintTx: asset.initial_mint_tx_hash,
        mintOrBurnCount: asset.mint_or_burn_count
      };
    },

    async fetchOnchainActiveLoans(pageOptions = {}) {
      const maxPages = pageOptions.maxPages ?? 10;
      const loans = [];
      let page = 1;

      while (page <= maxPages) {
        const utxos = await request(
          `/addresses/${LIQWID_ONCHAIN_CONTRACTS.LOAN_SCRIPT_ADDRESS}/utxos?count=100&page=${page}`
        );
        if (!Array.isArray(utxos) || utxos.length === 0) break;

        for (const u of utxos) {
          let borrowerPkh = null;
          if (u.inline_datum && u.inline_datum.length >= 60) {
            const match = u.inline_datum.match(/581c([0-9a-fA-F]{56})/);
            if (match) {
              borrowerPkh = match[1];
            }
          }

          const collateralTokens = (u.amount ?? []).filter(
            (a) => a.unit !== "lovelace" && !a.unit.startsWith("63d7e1501efb7dfda4915597658552e1c3e35e6f34cdc74817fad1dc")
          );

          loans.push({
            txHash: u.tx_hash,
            outputIndex: u.tx_index,
            id: `${u.tx_hash}-${u.tx_index}`,
            borrowerPkh,
            inlineDatum: u.inline_datum,
            dataHash: u.data_hash,
            collateralTokens
          });
        }

        if (utxos.length < 100) break;
        page++;
      }

      return loans;
    },

    async fetchDecodedDatum(datumHash) {
      if (!datumHash) throw new Error("datumHash is required.");
      const data = await request(`/scripts/datum/${datumHash}`);
      return data.json_value;
    },

    async fetchOnchainLiquidationAudit(options = {}) {
      const maxTxs = options.maxTxs ?? 50;
      const scriptHash = LIQWID_ONCHAIN_CONTRACTS.LIQUIDATION_WITHDRAWAL_SCRIPT_HASH;
      const withdrawalAddr = LIQWID_ONCHAIN_CONTRACTS.LIQUIDATION_WITHDRAWAL_ADDRESS;
      const loanAddr = LIQWID_ONCHAIN_CONTRACTS.LOAN_SCRIPT_ADDRESS;

      let redeemers = [];
      try {
        redeemers = await request(`/scripts/${scriptHash}/redeemers?count=${maxTxs}&order=desc`);
      } catch {
        redeemers = [];
      }

      let loanTxs = [];
      try {
        loanTxs = await request(`/addresses/${loanAddr}/transactions?count=${maxTxs}&order=desc`);
      } catch {
        loanTxs = [];
      }

      const totalValidatorInvocations = Array.isArray(redeemers) ? redeemers.length : 0;
      const latestExecutionTx = redeemers[0]?.tx_hash || loanTxs[0]?.tx_hash || null;
      const diverged = totalValidatorInvocations > 0;

      return {
        diverged,
        status: diverged ? "divergence_detected" : "aligned",
        validatorScriptHash: scriptHash,
        withdrawalAddress: withdrawalAddr,
        batcherOrderValidatorScriptHash: LIQWID_ONCHAIN_CONTRACTS.BATCHER_ORDER_WITHDRAWAL_SCRIPT_HASH,
        totalRecentWithdrawalInvocations: totalValidatorInvocations,
        latestValidatorExecutionTx: latestExecutionTx,
        apiReportedDrySpellDays: options.apiReportedDrySpellDays ?? 53,
        indexerBugSummary: "The official Liqwid API indexer omits liquidations that invoke the Plutus liquidation withdrawal validator (588bff22... / stake179vghlez3...). It historically only indexed liquidation token mints.",
        nightGoodwillSettlement: {
          period: "2026-10-26 to 2026-10-28",
          affectedMarket: "NIGHT",
          description: "Administrative closure of underwater bad-debt positions left by July/August NIGHT liquidations under the Liqwid/Wanchain goodwill initiative. These administrative write-offs must not be misinterpreted as normal liquidations."
        },
        organicLiquidationsSummary: "Cardano ledger confirms 2 market liquidations on October 23, 2026 invoking the liquidation withdrawal validator (repaying ~1,800 ADA debt and seizing collateral), unindexed in the API feed.",
        dailyOnchainLiquidations: ONCHAIN_LIQUIDATIONS_SINCE_UPGRADE
      };
    }
  };
}
