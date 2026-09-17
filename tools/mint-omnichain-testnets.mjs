#!/usr/bin/env node
/** Mint three IPSEITY NFTs across the two live testnet deployments.
 *
 * The signer receives two Base Sepolia tokens and one Ethereum Sepolia token.
 * All reads are completed on both chains before the first transaction is sent.
 * Output and per-chain journals are exclusive files so a partial run cannot be
 * mistaken for a safe retry.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { privateToAddress, hexToBytes, bytesToHex } from "@ethereumjs/util";
import { RpcChain, DEV_KEYS } from "./rpc.mjs";
import { decAddr, decUint } from "./evm.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const RUNS = [
  { name: "base-sepolia", chainId: 84532, rpcEnv: "BASE_SEPOLIA_RPC_URL", count: 2 },
  { name: "eth-sepolia", chainId: 11155111, rpcEnv: "ETH_SEPOLIA_RPC_URL", count: 1 }
];
const TEST_KEYS = new Set(DEV_KEYS.map((key) => key.toLowerCase()));
const json = (value) => JSON.stringify(value, (_key, item) =>
  typeof item === "bigint" ? item.toString() : item, 2) + "\n";

export class OmnichainMintError extends Error {}
const check = (condition, message) => {
  if (!condition) throw new OmnichainMintError(message);
};

export function config(env = process.env) {
  check(/^(?:0x)?[0-9a-fA-F]{64}$/.test(env.PRIVATE_KEY || ""),
    "PRIVATE_KEY must be a 32-byte hex signing key.");
  const key = "0x" + env.PRIVATE_KEY.replace(/^0x/, "").toLowerCase();
  check(!TEST_KEYS.has(key), "Public development keys are forbidden.");
  const recipient = "0x" + bytesToHex(privateToAddress(hexToBytes(key))).replace(/^0x/, "");
  const output = path.resolve(env.MINT_OUTPUT || path.join(ROOT, "out/omnichain-testnet-mints.json"));
  const networks = RUNS.map((run) => {
    const rpcUrl = env[run.rpcEnv];
    check(typeof rpcUrl === "string" && rpcUrl.length > 0, `${run.rpcEnv} is required.`);
    let url;
    try { url = new URL(rpcUrl); } catch { throw new OmnichainMintError(`${run.rpcEnv} must be an HTTPS URL.`); }
    check(url.protocol === "https:", `${run.rpcEnv} must be an HTTPS URL.`);
    const deploymentFile = path.join(ROOT, "deployments", `${run.name}.json`);
    const deployment = JSON.parse(fs.readFileSync(deploymentFile, "utf8"));
    check(deployment.chainId === run.chainId && /^0x[0-9a-fA-F]{40}$/.test(deployment.contracts?.ipseity || ""),
      `Invalid ${run.name} deployment record.`);
    return { ...run, rpcUrl, collection: deployment.contracts.ipseity,
      journal: output.replace(/\.json$/, `-${run.name}.jsonl`) };
  });
  check(!fs.existsSync(output) && networks.every(({ journal }) => !fs.existsSync(journal)),
    "Mint output or journal already exists; reconcile the prior run before retrying.");
  return { key, recipient, output, networks };
}

export async function preflight({ key, recipient, networks }) {
  const ready = [];
  for (const network of networks) {
    const chain = await RpcChain.open(network.rpcUrl, key);
    check(chain.chainId === network.chainId,
      `${network.name} RPC answered with chain ${chain.chainId}, expected ${network.chainId}.`);
    check(await chain.codeSize(network.collection) > 0,
      `${network.name} collection has no bytecode.`);
    const price = decUint(await chain.read(network.collection, "price()"));
    const supply = decUint(await chain.read(network.collection, "totalSupply()"));
    const balance = await chain.balanceOf(recipient);
    const gasPrice = BigInt(await chain.rpc("eth_gasPrice"));
    // Mint is normally far below 1M gas. Keep a deliberately conservative
    // per-mint reserve and do not broadcast on either chain unless both pass.
    const required = price * BigInt(network.count) + gasPrice * 1_000_000n * BigInt(network.count);
    check(balance >= required,
      `${network.name} needs at least ${required} wei; signer has ${balance} wei.`);
    ready.push({ ...network, chain, price, supply, balance, required });
  }
  return ready;
}

export async function mintAll(settings, { preflightOnly = false } = {}) {
  const ready = await preflight(settings);
  const summary = {
    schema: "ipseity.omnichain-testnet-mints/1",
    status: preflightOnly ? "preflight-passed" : "in-progress",
    recipient: settings.recipient,
    requested: ready.reduce((sum, item) => sum + item.count, 0),
    networks: ready.map(({ name, chainId, collection, count, price, supply, balance, required }) =>
      ({ name, chainId, collection, count, price, supplyBefore: supply, balance, required, tokens: [] }))
  };
  if (preflightOnly) return summary;

  fs.mkdirSync(path.dirname(settings.output), { recursive: true });
  fs.writeFileSync(settings.output, json(summary), { flag: "wx", mode: 0o600 });
  const save = () => fs.writeFileSync(settings.output, json(summary), { mode: 0o600 });
  for (let index = 0; index < ready.length; index++) {
    const item = ready[index];
    const record = summary.networks[index];
    item.chain.setJournal(item.journal);
    for (let offset = 1; offset <= item.count; offset++) {
      const expectedId = item.supply + BigInt(offset);
      check(decUint(await item.chain.read(item.collection, "totalSupply()")) === expectedId - 1n,
        `${item.name} supply changed during the run; refusing the next mint.`);
      check(decUint(await item.chain.read(item.collection, "price()")) === item.price,
        `${item.name} mint price changed during the run.`);
      const receipt = await item.chain.exec(item.collection, "mint()", [],
        { value: item.price, label: `mint:${item.name}:${expectedId}` });
      check(decAddr(await item.chain.read(item.collection, "ownerOf(uint256)", [expectedId])) ===
        settings.recipient.toLowerCase(), `${item.name} token ${expectedId} owner differs.`);
      record.tokens.push({ id: expectedId, owner: settings.recipient, transactionHash: receipt.hash,
        blockNumber: receipt.block });
      save();
    }
  }
  check(summary.networks.reduce((sum, item) => sum + item.tokens.length, 0) === 3,
    "Final verified mint count is not three.");
  summary.status = "verified";
  summary.completedAt = new Date().toISOString();
  save();
  return summary;
}

export async function main(env = process.env, argv = process.argv.slice(2)) {
  check(argv.length <= 1 && (argv.length === 0 || argv[0] === "--preflight"),
    "Usage: node tools/mint-omnichain-testnets.mjs [--preflight]");
  const result = await mintAll(config(env), { preflightOnly: argv[0] === "--preflight" });
  console.log(json(result));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error instanceof OmnichainMintError ? error.message : "Mint run stopped; reconcile journals and receipts before retrying.");
    process.exitCode = 1;
  });
}
