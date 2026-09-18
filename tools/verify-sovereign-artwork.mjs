#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { Interface, getBytes, sha256 } from "ethers";
import { RpcChain } from "./rpc.mjs";

const ROOT = path.resolve(import.meta.dirname, "..");
const deployment = JSON.parse(fs.readFileSync(path.join(ROOT, "deployments/sovereign-eth-sepolia.json")));
const source = fs.readFileSync(path.join(ROOT, "engine/sovereign.html"));
const abi = new Interface([
  "function document() view returns (bytes)",
  "function resolveMode() view returns (bytes32)",
  "function ownerOf(uint256) view returns (address)"
]);
const chain = await RpcChain.open(
  process.env.RPC_URL || "https://ethereum-sepolia-rpc.publicnode.com",
  "0x" + "01".padStart(64, "0")
);
const result = await chain.call(deployment.address, abi.encodeFunctionData("document"));
const [loader] = abi.decodeFunctionResult("document", result);
const html = Buffer.from(getBytes(loader)).toString("utf8");
const match = html.match(/const s="([A-Za-z0-9+/=]+)"/);
if (!match) throw new Error("on-chain document is not the packed IPSEITY loader");
const recovered = zlib.gunzipSync(Buffer.from(match[1], "base64"));
if (!recovered.equals(source)) throw new Error("on-chain artwork differs from engine/sovereign.html");
if (sha256(recovered) !== deployment.websiteSha256) throw new Error("source digest differs from deployment record");
console.log(`recovered ${recovered.length} exact sovereign interface bytes from ${deployment.address}`);
