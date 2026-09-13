#!/usr/bin/env node
/*  A raw EVM storage control: simulation executes SSTORE and can read its
    own result, but another call must see only mined transaction state. */
import assert from "node:assert/strict";
import { Chain } from "./evm.mjs";
import { createAddressFromString } from "@ethereumjs/util";

const chain = await Chain.open();
// runtime: SSTORE(0, CALLDATALOAD(0)); MSTORE(0,SLOAD(0)); RETURN(0,32).
const runtime = "60003560005560005460005260206000f3";
const bytes = runtime.length / 2;
const init = "0x60" + bytes.toString(16).padStart(2, "0") +
  "600c60003960" + bytes.toString(16).padStart(2, "0") + "6000f3" + runtime;
const address = await chain.deploy(init);
const word = n => "0x" + BigInt(n).toString(16).padStart(64, "0");
const storage = async () => {
  const value = await chain.vm.stateManager.getStorage(createAddressFromString(address), new Uint8Array(32));
  return value.length ? BigInt("0x" + Buffer.from(value).toString("hex")) : 0n;
};

assert.equal(BigInt(await chain.call(address, word(7))), 7n,
  "simulation permits writes and sees them within the simulated call");
assert.equal(await storage(), 0n, "a successful simulation leaves no storage behind");
await chain.send({ to: address, data: word(11) });
assert.equal(await storage(), 11n, "a mined transaction still persists its write");
assert.deepEqual((await Promise.all([chain.call(address, word(19)), chain.call(address, word(23))])).map(BigInt),
  [19n, 23n], "overlapping simulations each see their own writes");
assert.equal(await storage(), 11n, "overlapping simulations preserve the mined state");

await Promise.all([chain.call(address, word(29)), chain.send({ to: address, data: word(31) })]);
assert.equal(await storage(), 31n, "a transaction cannot be reverted by an overlapping simulation");
const revertingRuntime = "60003560005560006000fd";
await chain.vm.stateManager.putCode(createAddressFromString(address), Buffer.from(revertingRuntime, "hex"));
await assert.rejects(chain.call(address, word(37)), /call reverted/,
  "a reverting simulation still reports its failure");
assert.equal(await storage(), 31n, "a failed simulation also preserves mined storage");

// A second actor must sign for the custom chain it shares, rather than
// silently falling back to mainnet's replay-protection domain.
const base = await Chain.open({ chainId: 8453 });
const actor = await base.as("0x" + "22".repeat(32));
let signedV;
const record = actor._record.bind(actor);
actor._record = (res, tx) => { signedV = tx.v; record(res, tx); };
const before = await base.balanceOf(base.from.toString());
await actor.send({ to: base.from.toString(), value: 17n });
assert.ok(signedV === 8453n * 2n + 35n || signedV === 8453n * 2n + 36n,
  "the secondary actor's actual signed transaction uses this chain's EIP-155 domain");
assert.equal(await base.balanceOf(base.from.toString()), before + 17n,
  "the custom-chain actor's transaction lands on its shared chain");
console.log("10 call-isolation assertions passed against raw EVM bytecode and a custom-chain signer");
