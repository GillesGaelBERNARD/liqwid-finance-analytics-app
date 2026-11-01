import fs from "node:fs";
import path from "node:path";

// Load .env
if (typeof process.loadEnvFile === "function") {
  process.loadEnvFile(path.resolve(".env"));
}

const apiKey = process.env.BLOCKFROST_API_KEY || process.env.BLOCKFROST_PROJECT_ID;
const baseUrl = "https://cardano-mainnet.blockfrost.io/api/v0";
const headers = { project_id: apiKey };

async function fetchBf(endpoint) {
  const t0 = performance.now();
  const res = await fetch(`${baseUrl}${endpoint}`, { headers });
  const latency = (performance.now() - t0).toFixed(1);
  if (!res.ok) {
    const text = await res.text();
    return { ok: false, status: res.status, latency, error: text };
  }
  const data = await res.json();
  const bytes = JSON.stringify(data).length;
  return { ok: true, status: res.status, latency, bytes, data };
}

async function evaluate() {
  console.log("===============================================================");
  console.log("   LIVE BLOCKFROST ON-CHAIN QUERY EVALUATION FOR LIQWID V2     ");
  console.log("===============================================================\n");

  const results = {};

  // 1. LQ Token queries
  console.log("--- 1. Evaluating LQ Token & Staking/Supply (Candidate: Direct Replacement) ---");
  const lqAssetId = "da8c30857834c6ae7203935b89278c532b3995245295456f993e1d244c51";
  const rLq = await fetchBf(`/assets/${lqAssetId}`);
  console.log(`- Query: /assets/${lqAssetId.slice(0, 16)}...`);
  console.log(`  Status: ${rLq.status} | Latency: ${rLq.latency}ms | Size: ${rLq.bytes} bytes`);
  if (rLq.ok) {
    console.log(`  Data: Total Supply = ${Number(rLq.data.quantity) / 1e6} LQ`);
    console.log(`  Initial Mint Tx = ${rLq.data.initial_mint_tx_hash}`);
  }

  // Check LQ holders / staking / treasury addresses
  console.log(`\n- Querying top holders / addresses of LQ...`);
  const rLqAddrs = await fetchBf(`/assets/${lqAssetId}/addresses?count=5&order=desc`);
  console.log(`  Status: ${rLqAddrs.status} | Latency: ${rLqAddrs.latency}ms | Size: ${rLqAddrs.bytes} bytes`);
  if (rLqAddrs.ok) {
    console.log(`  Found ${rLqAddrs.data.length} addresses. Top address holds ${Number(rLqAddrs.data[0].quantity) / 1e6} LQ`);
  }

  // 2. Loan UTXO & Loan Script Address Inspection
  console.log("\n--- 2. Evaluating Active Loan UTXO & Loan Script (Candidate: On-Chain Audit) ---");
  // Known loan UTXO tx from clean data
  const loanTx = "79e2bda3acd86e9188c5a008fb825437e9d91a04d871b38961f05d907cc00902";
  const rLoanTx = await fetchBf(`/txs/${loanTx}/utxos`);
  console.log(`- Query: /txs/${loanTx.slice(0, 16)}.../utxos`);
  console.log(`  Status: ${rLoanTx.status} | Latency: ${rLoanTx.latency}ms | Size: ${rLoanTx.bytes} bytes`);
  let loanScriptAddress = null;
  if (rLoanTx.ok) {
    // Check output 34 (loan 79e2bda3acd86e9188c5a008fb825437e9d91a04d871b38961f05d907cc00902-34)
    const out34 = rLoanTx.data.outputs.find(o => o.output_index === 34) || rLoanTx.data.outputs[0];
    loanScriptAddress = out34?.address;
    console.log(`  Loan Output Address: ${loanScriptAddress}`);
    console.log(`  Inline datum present: ${!!out34?.inline_datum}`);
    console.log(`  Data hash: ${out34?.data_hash}`);
    if (out34?.inline_datum) {
      console.log(`  Inline datum length: ${out34.inline_datum.length} chars (CBOR hex)`);
    }
  }

  // If we found the loan script address, check how many UTXOs are currently at that address
  if (loanScriptAddress) {
    console.log(`\n- Querying UTXOs at Loan Script Address (${loanScriptAddress.slice(0, 25)}...)...`);
    const rScriptUtxos = await fetchBf(`/addresses/${loanScriptAddress}/utxos?count=5`);
    console.log(`  Status: ${rScriptUtxos.status} | Latency: ${rScriptUtxos.latency}ms | Size: ${rScriptUtxos.bytes} bytes`);
    if (rScriptUtxos.ok) {
      console.log(`  Sample UTXO returned: tx_hash = ${rScriptUtxos.data[0]?.tx_hash}, index = ${rScriptUtxos.data[0]?.tx_index}`);
      console.log(`  Sample inline datum: ${rScriptUtxos.data[0]?.inline_datum ? "YES (" + rScriptUtxos.data[0].inline_datum.slice(0, 30) + "...)" : "NO"}`);
    }

    const rScriptDetails = await fetchBf(`/addresses/${loanScriptAddress}`);
    console.log(`\n- Querying Script Address Summary:`);
    console.log(`  Status: ${rScriptDetails.status} | Latency: ${rScriptDetails.latency}ms`);
    if (rScriptDetails.ok) {
      const adaAmount = rScriptDetails.data.amount.find(a => a.unit === "lovelace");
      console.log(`  ADA locked at script: ${(Number(adaAmount?.quantity || 0) / 1e6).toLocaleString()} ADA`);
      console.log(`  Total native tokens held at script: ${rScriptDetails.data.amount.length - 1} distinct tokens`);
    }
  }

  // 3. Market Parameter Governance Update Transaction
  console.log("\n--- 3. Evaluating Governance / Parameter Update Tx (Candidate: On-Chain Audit) ---");
  const paramTx = "6e8dab3ab0d52a00f848ec209ec6fd37504afa4076d1bbfc5abccf85d061d9da";
  const rParamTx = await fetchBf(`/txs/${paramTx}`);
  console.log(`- Query: /txs/${paramTx.slice(0, 16)}...`);
  console.log(`  Status: ${rParamTx.status} | Latency: ${rParamTx.latency}ms | Size: ${rParamTx.bytes} bytes`);
  if (rParamTx.ok) {
    console.log(`  Block: #${rParamTx.data.block_height} | Slot: ${rParamTx.data.slot} | Fees: ${Number(rParamTx.data.fees) / 1e6} ADA`);
  }
  const rParamUtxos = await fetchBf(`/txs/${paramTx}/utxos`);
  console.log(`  Outputs count: ${rParamUtxos.data?.outputs?.length}`);

  // 4. Test datum decoding endpoint
  console.log("\n--- 4. Evaluating Datum Decoding via Blockfrost ---");
  // Let's test /scripts/datum/{datum_hash} with a datum hash from rLoanTx or rParamUtxos
  const sampleDatumHash = rLoanTx.data?.outputs?.find(o => o.data_hash)?.data_hash;
  if (sampleDatumHash) {
    const rDatum = await fetchBf(`/scripts/datum/${sampleDatumHash}`);
    console.log(`- Query: /scripts/datum/${sampleDatumHash.slice(0, 16)}...`);
    console.log(`  Status: ${rDatum.status} | Latency: ${rDatum.latency}ms`);
    if (rDatum.ok) {
      console.log(`  Decoded JSON structure type: ${typeof rDatum.data.json_value}`);
    }
  } else {
    console.log("- No separate data_hash needed (UTXOs use modern inline_datum directly)");
  }

  console.log("\n===============================================================");
  console.log("   EVALUATION MEASUREMENTS COMPLETE                            ");
  console.log("===============================================================");
}

evaluate().catch(console.error);
