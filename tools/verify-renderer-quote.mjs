#!/usr/bin/env node
import assert from "node:assert/strict";
import { compile, artifact } from "./compile.mjs";
import { Chain, decUint } from "./evm.mjs";

// The mock imports the actual renderer. Compiling the mock dependency graph
// avoids code-generating every unrelated page for this focused regression.
const out = compile({ quiet: true, dirs: ["test/mocks"] });
const c = await Chain.open();
const p = await c.deploy(artifact(out, "test/mocks/RendererQuoteProbe.sol", "RendererQuoteProbe").bytecode);
const escaped = new Map([[34, [92, 34]], [92, [92, 92]], [60, [92, 120, 51, 99]]]);
const oracle = b => Buffer.from([34, ...Array.from(b).flatMap(x => escaped.get(x) || [x]), 34]);
const decode = hex => {
  const bytes = Buffer.from(hex.slice(2), "hex");
  const at = Number(decUint(hex));
  const len = Number(BigInt("0x" + bytes.subarray(at, at + 32).toString("hex")));
  return bytes.subarray(at + 32, at + 32 + len);
};
let cases = 0;
const check = async b => {
  assert.deepEqual(decode(await c.read(p, "quote(bytes)", ["0x" + b.toString("hex")])), oracle(b));
  cases++;
};
await check(Buffer.alloc(0));
await check(Buffer.from('</script><script>"\\'));
await check(Buffer.from(Array.from({ length: 256 }, (_, i) => i)));
let seed = 0x51e171;
for (let n = 0; n < 64; n++) {
  const b = Buffer.alloc(n * 17);
  for (let i = 0; i < b.length; i++) {
    seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5;
    b[i] = seed & 255;
  }
  await check(b);
}
await check(Buffer.alloc(4096, 60));
const gas = c.lastGas;
assert(gas < 4_000_000n, `4 KB quote consumed ${gas} gas`);
console.log(`Renderer quote: ${cases} byte-exact cases; 4 KB worst-escape gas ${gas}; PASS`);
