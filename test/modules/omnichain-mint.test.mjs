import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { config, OmnichainMintError } from "../../tools/mint-omnichain-testnets.mjs";

const env = (extra = {}) => ({
  PRIVATE_KEY: "12".repeat(32),
  BASE_SEPOLIA_RPC_URL: "https://base.example",
  ETH_SEPOLIA_RPC_URL: "https://ethereum.example",
  MINT_RECIPIENT: "0xb88Fbf05268802100E5E55ADBa211d6453aF8b5b",
  MINT_OUTPUT: path.resolve("out/test-omnichain-mints.json"),
  ...extra
});

test("config plans exactly three mints across the two committed testnets", () => {
  const result = config(env());
  assert.equal(result.signer, "0x1c5a77d9fa7ef466951b2f01f724bca3a5820b63");
  assert.equal(result.recipient, "0xb88fbf05268802100e5e55adba211d6453af8b5b");
  assert.deepEqual(result.networks.map(({ chainId, count }) => ({ chainId, count })), [
    { chainId: 84532, count: 2 },
    { chainId: 11155111, count: 1 }
  ]);
  assert.equal(result.networks.reduce((total, network) => total + network.count, 0), 3);
});

test("config refuses missing credentials and non-HTTPS RPCs", () => {
  assert.throws(() => config(env({ PRIVATE_KEY: "" })), OmnichainMintError);
  assert.throws(() => config(env({ MINT_RECIPIENT: "" })), /MINT_RECIPIENT/);
  assert.throws(() => config(env({ BASE_SEPOLIA_RPC_URL: "http://base.example" })),
    /must be an HTTPS URL/);
});

test("config refuses public development keys", () => {
  assert.throws(() => config(env({
    PRIVATE_KEY: "ac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80"
  })), /development keys are forbidden/);
});
