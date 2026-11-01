import fs from "node:fs";
import path from "node:path";

// Auto-load .env if available
const envPath = path.resolve(".env");
if (fs.existsSync(envPath)) {
  if (typeof process.loadEnvFile === "function") {
    process.loadEnvFile(envPath);
  } else {
    const lines = fs.readFileSync(envPath, "utf8").split("\n");
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const [key, ...vals] = trimmed.split("=");
      if (key && !process.env[key.trim()]) {
        process.env[key.trim()] = vals.join("=").trim();
      }
    }
  }
}

const apiKey = process.env.BLOCKFROST_API_KEY || process.env.BLOCKFROST_PROJECT_ID;
const network = process.env.BLOCKFROST_NETWORK || "mainnet";

if (!apiKey || apiKey.trim() === "" || apiKey === "your_blockfrost_project_id_here") {
  console.error("ERROR: No Blockfrost API key found in .env.");
  console.error("Please add your key to .env: BLOCKFROST_API_KEY=mainnet...");
  process.exit(1);
}

const baseUrl = network === "mainnet"
  ? "https://cardano-mainnet.blockfrost.io/api/v0"
  : `https://cardano-${network}.blockfrost.io/api/v0`;

async function run() {
  console.log(`Connecting to Blockfrost (${network})...`);
  const headers = { project_id: apiKey.trim() };

  // 1. Health / Latest Block
  const t0 = performance.now();
  const blockRes = await fetch(`${baseUrl}/blocks/latest`, { headers });
  const blockLatency = (performance.now() - t0).toFixed(0);

  if (!blockRes.ok) {
    const errorBody = await blockRes.text();
    console.error(`Blockfrost HTTP ${blockRes.status} Error: ${errorBody}`);
    process.exit(1);
  }

  const block = await blockRes.json();
  console.log(`SUCCESS! Connected to Cardano ${network} in ${blockLatency}ms.`);
  console.log(`Latest block: #${block.height} (Epoch ${block.epoch}, Slot ${block.slot})`);

  // 2. Query LQ Token on-chain
  const lqAsset = "da8c30857834c6ae7203935b89278c532b3995245295456f993e1d244c51";
  console.log(`\nQuerying on-chain LQ Token (${lqAsset.slice(0, 20)}...)...`);
  const t1 = performance.now();
  const assetRes = await fetch(`${baseUrl}/assets/${lqAsset}`, { headers });
  const assetLatency = (performance.now() - t1).toFixed(0);

  if (assetRes.ok) {
    const asset = await assetRes.json();
    console.log(`LQ Asset query completed in ${assetLatency}ms.`);
    console.log(`- Policy ID: ${asset.policy_id}`);
    console.log(`- Total Quantity: ${Number(asset.quantity) / 1e6} LQ`);
    console.log(`- Mint/Burn Tx Count: ${asset.mint_or_burn_count}`);
  } else {
    console.log(`Asset query status: ${assetRes.status}`);
  }
}

run().catch((err) => {
  console.error("Unexpected error:", err);
  process.exit(1);
});
