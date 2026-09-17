#!/usr/bin/env node
/*───────────────────────────────────────────────────────────────────────────
  The companion door must preserve the house behind it.

  This suite runs against the real Premises and real module companions from
  tools/modules-stack.mjs. It compares complete ERC-5219 return bytes, not
  snippets of rendered HTML, then recovers the workbench from the portal's
  actual onchain response. The loader is also executed in an isolated Node
  context with the platform's real gzip stream and Web Crypto. This last
  check verifies loading and refusals; it is not a substitute for the
  workbench's separate Chromium interaction suite.
───────────────────────────────────────────────────────────────────────────*/
import assert from "node:assert/strict";
import { createHash, webcrypto } from "node:crypto";
import { gzipSync, gunzipSync } from "node:zlib";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import { Interface } from "ethers";
import { encRequest, decResponse } from "./site.mjs";
import { encodeAddressArg } from "./evm.mjs";

const requestABI = new Interface([
  "function request(string[] resource,tuple(string key,string value)[] params) view returns(uint16,string,tuple(string key,string value)[])"
]);
const hash = (bytes) => "0x" + createHash("sha256").update(bytes).digest("hex");
const zero = "0x" + "00".repeat(20);

async function executeLoader(body, replacement) {
  const match = body.match(/<script>([\s\S]*?)<\/script>/);
  assert(match, "the onchain page contains its own loader");
  let script = match[1];
  if (replacement) script = script.replace(/const encoded="[A-Za-z0-9+/=]+";/,
    `const encoded="${replacement.toString("base64")}";`);
  const events = [], notice = { textContent: "Recovering" };
  let written;
  const context = vm.createContext({
    crypto: webcrypto, atob, Blob, DecompressionStream, Uint8Array, TextDecoder,
    document: {
      getElementById(id) { assert.equal(id, "module-loader"); return notice; },
      open() { events.push("open"); },
      write(html) { events.push("write"); written = html; },
      close() { events.push("close"); }
    }
  });
  // Existing top-level bindings must survive without colliding with the loader.
  vm.runInContext('const config="occupied", bytes="occupied", html="occupied";', context);
  await vm.runInContext(script, context, { timeout: 10000 });
  return { events, written, config: context.IPSEITY_MODULES, notice: notice.textContent };
}

/** Verify a real stack without owning deployment or mutating its original site. */
export async function verifyModulePortal({ c, A, hub, premises, portal, workbench, rawDocument, tokenId = 1n }) {
  assert(c && A && hub && premises && portal && workbench && rawDocument,
    "portal verifier requires the actual deployed original site and module stack");
  const raw = Buffer.from(rawDocument);
  const assertions = [];
  function proven(name, condition = true) {
    assert(condition, name);
    assertions.push(name);
    console.log(`  ✓ ${name}`);
  }
  const call = async (path) => decResponse(await c.call(portal, encRequest(path)));
  const id = String(tokenId);
  const routes = [
    [], ["door"], ["terminal"], ["swap"], ["gallery"], ["gallery", "0"],
    ["launch"], ["lock"], ["projector"], ["seal"], ["keys"], ["name"],
    ["estate"], ["chat"], ["rooms"], ["room", "1"], ["dm", id],
    ["open"], ["open", "0"], ["services.json"], ["services.json", "0"],
    ["c"], ["c", id], ["c", id, "hand"], ["hook"],
    ["token", id], ...["raw", "live", "sigil.svg", "faces", "market", "pool", "rent", "vault", "services.json"]
      .map(leaf => ["token", id, leaf]),
    ...["0", "1", "2"].map(face => ["token", id, "face", face]),
    ["door", ""], ["not-a-route"], ["token", "absent"], ["token", id, "face"],
    ["token", id, "live", "extra"]
  ];
  for (const route of routes) {
    const request = encRequest(route);
    const original = await c.call(premises, request);
    const wrapped = await c.call(portal, request);
    assert.equal(wrapped, original, `the complete response at /${route.join("/")} is unchanged`);
  }
  proven(`${routes.length} original routes return byte-for-byte identical ABI responses`);
  const withParams = requestABI.encodeFunctionData("request", [
    ["services.json"], [["arbitrary", "value"], ["<script>", "\u0000\"</script>"]]
  ]);
  assert.equal(await c.call(portal, withParams), await c.call(premises, withParams));
  proven("forwarding preserves calldata with arbitrary query parameters");
  const mode = await c.read(portal, "resolveMode()");
  proven("the companion explicitly selects ERC-5219 resolution", mode.startsWith("0x35323139"));

  const discovery = await call(["modules", "services.json"]);
  assert.equal(discovery.status, 200);
  const services = JSON.parse(discovery.body);
  assert.equal(services.collection, hub.toLowerCase());
  assert.equal(services.premises, premises.toLowerCase());
  assert.equal(services.workbench, workbench.toLowerCase());
  assert.equal(services.portal, portal.toLowerCase());
  assert.equal(services.documentHash, hash(raw));
  assert.equal(services.documentBytes, raw.length);
  assert.equal(services.tokenId, "");
  assert.equal((await call(["services", "modules.json"])).body, discovery.body);
  proven("new discovery names the actual collection, originals and exact raw document");
  const scoped = JSON.parse((await call(["token", id, "modules", "services.json"])).body);
  assert.equal(scoped.tokenId, id);
  assert.equal(scoped.originalHref, `/token/${id}/live`);
  assert.equal(scoped.workbenchHref, `/token/${id}/modules`);
  proven("token-scoped discovery links to that token's unchanged original instrument");
  const landing = await call(["extensions"]);
  proven("the extension landing provides a human link to the workbench and original site",
    landing.status === 200 && landing.body.includes('href="/modules"') && landing.body.includes('href="/"'));

  for (const route of [
    ["modules", "extra"], ["modules", "services.json", "extra"],
    ["token", "999999", "modules"], ["token", "bad", "modules"],
    ["token", "9".repeat(79), "modules"], ["token", id, "modules", "extra"],
    ["token", ((1n << 256n) - 1n).toString(), "modules"],
    ["token", (1n << 256n).toString(), "modules"],
    ["token", id, "modules", "services.json", "extra"]
  ]) assert.equal((await call(route)).status, 404, `/${route.join("/")} is a 404`);
  proven("unminted, malformed, overflowed and overlong module routes return 404");

  const page = await call(["token", id, "modules"]);
  const pageGas = typeof c.rpc === "function"
    ? BigInt(await c.rpc("eth_estimateGas", [{from:c.from.toString(),to:portal,data:encRequest(["token",id,"modules"]),gas:"0x2faf080"}]))
    : c.lastGas;
  assert.equal(page.status, 200);
  assert.equal(page.headers[0][1], "text/html; charset=utf-8");
  const encoded = page.body.match(/const encoded="([A-Za-z0-9+/=]+)";/)?.[1];
  assert(encoded, "the complete compressed workbench is in the contract response");
  const packed = Buffer.from(encoded, "base64");
  assert.deepEqual(gunzipSync(packed), raw);
  assert.equal(hash(packed), services.packedHash);
  assert(pageGas <= 50_000_000n, `module page read exceeds 50M gas: ${pageGas}`);
  proven("the served gzip recovers the exact canonical workbench without fetching anything");
  const trailing = await call(["token", id, "modules", ""]);
  assert.equal(trailing.body, page.body);
  proven("a trailing slash preserves the module document");

  const loaded = await executeLoader(page.body);
  assert.deepEqual(loaded.events, ["open", "write", "close"]);
  assert.equal(loaded.written, raw.toString("utf8"));
  assert.equal(loaded.config.tokenId, id);
  assert.equal(loaded.config.registry, services.registry);
  assert(Object.isFrozen(loaded.config));
  proven("the real loader verifies bytes before opening and retains the immutable chain config");
  const wrong = Buffer.from(raw);
  wrong[Math.floor(wrong.length / 2)] ^= 1;
  const wrongLoad = await executeLoader(page.body, gzipSync(wrong));
  assert.deepEqual(wrongLoad.events, []);
  assert.match(wrongLoad.notice, /SHA-256 mismatch/);
  proven("same-size substituted code is refused before document.open");
  const shortLoad = await executeLoader(page.body, gzipSync(raw.subarray(0, raw.length - 1)));
  assert.deepEqual(shortLoad.events, []);
  assert.match(shortLoad.notice, /byte length mismatch/);
  const longLoad = await executeLoader(page.body, gzipSync(Buffer.concat([raw, Buffer.alloc(100000)])));
  assert.deepEqual(longLoad.events, []);
  assert.match(longLoad.notice, /exceeds its committed byte length/);
  proven("truncated data and excess decompression are refused before document.open");
  const root = await executeLoader((await call(["modules"])).body);
  assert.equal(root.config.tokenId, "");
  proven("the collection workbench does not invent a token selection");

  const artifact = A("src/ModulePortal.sol", "ModulePortal");
  assert.equal(artifact.abi.filter(f => f.type === "function" && !["view", "pure"].includes(f.stateMutability)).length, 0);
  const runtimeBytes = await c.codeSize(portal);
  assert(runtimeBytes <= 24576);
  proven("the portal fits EIP-170 and has no state-changing or administrative function");
  const deploy = args => c.deploy(artifact.bytecode, args.map(encodeAddressArg).join(""));
  await assert.rejects(deploy([zero, workbench, services.packedArchive, zero]), /revert/i);
  await assert.rejects(deploy([premises, zero, services.packedArchive, zero]), /revert/i);
  await assert.rejects(deploy([premises, workbench, services.document, c.from.toString()]), /revert/i);
  await assert.rejects(deploy([premises, workbench, premises, zero]), /revert/i);
  await assert.rejects(deploy([premises, workbench, services.document, zero]), /revert/i);
  proven("deployment refuses codeless services, codeless cartridges, unregistered archives and raw HTML as gzip");

  const report = {
    schema: "ipseity.module-portal-verification/1", status: "passed", assertions,
    originalRoutes: routes.length, modulePageGas: pageGas.toString(), runtimeBytes,
    rawBytes: raw.length, packedBytes: packed.length, responseBytes: Buffer.byteLength(page.body),
    documentHash: hash(raw), packedHash: hash(packed),
    loaderEnvironment: "Node VM with native DecompressionStream and Web Crypto; UI has a separate Chromium suite"
  };
  console.log(JSON.stringify(report, null, 2));
  return report;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const { createModuleFixture } = await import("./modules-stack.mjs");
  const fixture = await createModuleFixture({ site: true });
  try { await verifyModulePortal(fixture); } finally { await fixture.close(); }
}
