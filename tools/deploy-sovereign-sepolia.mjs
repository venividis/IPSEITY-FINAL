#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { AbiCoder, Interface, sha256 } from "ethers";
import { RpcChain } from "./rpc.mjs";

const ROOT = path.resolve(import.meta.dirname, "..");
const RPC = process.env.RPC_URL || "https://ethereum-sepolia-rpc.publicnode.com";
const RECIPIENT = "0xb88Fbf05268802100E5E55ADBa211d6453aF8b5b";
if (!/^(?:0x)?[0-9a-fA-F]{64}$/.test(process.env.PRIVATE_KEY || "")) throw new Error("PRIVATE_KEY is required");
const artifact = JSON.parse(fs.readFileSync(path.join(ROOT, "out/sovereign/SovereignIpseity.json")));
// The sovereign document is the complete interactive confluence UI.
// Only its storage representation is compressed.
const page = fs.readFileSync(path.join(ROOT, "engine/sovereign.html"));
const storedPage = zlib.gzipSync(page, { level: 9 });
const c = await RpcChain.open(RPC, process.env.PRIVATE_KEY);
if (c.chainId !== 11155111) throw new Error("Ethereum Sepolia only");
const startNonce = await c.nonceNow();
const journal = path.join(ROOT, "out/sovereign/sepolia-deployment.jsonl");
let address = process.env.RESUME_ADDRESS;
if (address) {
  if (!fs.existsSync(journal) || await c.codeSize(address) === 0) throw new Error("invalid reconciled deployment");
  c.journalPath = journal;
} else {
  if (fs.existsSync(journal)) throw new Error("deployment journal already exists; reconcile before retrying");
  c.setJournal(journal);
  const constructorArgs = AbiCoder.defaultAbiCoder().encode(["address", "uint96"], [c.from.toString(), 500]).slice(2);
  address = await c.deploy("0x" + artifact.evm.bytecode.object, constructorArgs, "SovereignIpseity");
}
const iface = new Interface(artifact.abi);
const loaded = Number(iface.decodeFunctionResult("websiteChunkCount", await c.call(address, iface.encodeFunctionData("websiteChunkCount")))[0]);
for (let offset = loaded * 16_000, i = loaded; offset < storedPage.length; offset += 16_000, ++i) {
  const chunk = storedPage.subarray(offset, Math.min(offset + 16_000, storedPage.length));
  await c.send({ to: address, data: iface.encodeFunctionData("uploadWebsiteChunk", [chunk]), label: `website:${i}` });
}
await c.send({ to: address, data: iface.encodeFunctionData("beginTesting", [page.length, sha256(storedPage)]), label: "beginTesting" });
await c.send({ to: address, data: iface.encodeFunctionData("seal"), label: "seal" });
const tokens = [];
for (let id = 1; id <= 3; ++id) {
  const tx = await c.send({ to: address, data: iface.encodeFunctionData("mintTo", [RECIPIENT]), label: `mint:${id}` });
  tokens.push({
    id, owner: RECIPIENT, transactionHash: tx.hash,
    live: `web3://${address}:11155111/token/${id}/live`,
    browserGateway: `https://${address.toLowerCase()}.sep.w3link.io/token/${id}/live`
  });
}
const record = { schema: "ipseity.sovereign-deployment/2", chainId: 11155111, address, deployer: c.from.toString(), recipient: RECIPIENT, startNonce: startNonce.toString(), websiteSha256: sha256(page), websiteStoredSha256: sha256(storedPage), websiteBytes: page.length, websiteStoredBytes: storedPage.length, tokens, deployedAt: new Date().toISOString() };
fs.writeFileSync(path.join(ROOT, "deployments/sovereign-eth-sepolia.json"), JSON.stringify(record, null, 2) + "\n");
console.log(JSON.stringify(record, null, 2));
