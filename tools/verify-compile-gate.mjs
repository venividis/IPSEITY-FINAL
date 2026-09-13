#!/usr/bin/env node
/*  Prove the imported, quiet compiler refuses a contract that an EIP-170
    chain cannot deploy. The negative control is compiled Solidity with
    an incompressible literal, not a mocked solc result alone.           */
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { ROOT, compile, assertDeployableSizes, CONTRACT_SIZE_LIMIT } from "./compile.mjs";

const artifact = n => ({ evm: { deployedBytecode: { object: "00".repeat(n) } } });
const output = (file, n) => ({ contracts: { [file]: { Boundary: artifact(n) } } });
const isSizeError = e => e.code === "CONTRACT_SIZE_LIMIT" && /EIP-170/.test(e.message);

assert.equal(assertDeployableSizes(output("src/Boundary.sol", CONTRACT_SIZE_LIMIT))[0].n,
  CONTRACT_SIZE_LIMIT, "the exact runtime limit remains deployable");
assert.throws(() => assertDeployableSizes(output("src/Boundary.sol", CONTRACT_SIZE_LIMIT + 1)),
  isSizeError, "one byte over the runtime limit is refused");
assert.doesNotThrow(() => assertDeployableSizes(output("test/Harness.t.sol", 50_000)),
  "a Foundry harness may embed deployment code");
assert.throws(() => assertDeployableSizes({ contracts: {
  "test/Harness.t.sol": { Harness: artifact(50_000) },
  "src/Imported.sol": { Imported: artifact(25_000) }
} }), isSizeError, "importing an oversized production contract from a test cannot bypass the gate");

fs.mkdirSync(path.join(ROOT, "out"), { recursive: true });
const dir = fs.mkdtempSync(path.join(ROOT, "out", "compile-gate-"));
try {
  const literal = Array.from({ length: 820 }, (_, i) =>
    crypto.createHash("sha256").update(`ipseity-compile-gate-${i}`).digest("hex")).join("");
  fs.writeFileSync(path.join(dir, "Oversize.sol"), `// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;
contract Oversize {
  function payload() external pure returns (bytes memory) { return hex"${literal}"; }
}
`);
  assert.throws(() => compile({ quiet: true, dirs: [path.relative(ROOT, dir)] }),
    e => isSizeError(e) && e.contracts.some(c => c.name === "Oversize" && c.n > CONTRACT_SIZE_LIMIT),
    "an actual quiet imported compilation refuses oversized deployed bytecode");
} finally {
  fs.rmSync(dir, { recursive: true, force: true });
}

console.log("5 compile-gate assertions passed, including a real oversized Solidity negative control");
