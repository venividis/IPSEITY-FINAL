#!/usr/bin/env node
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { ROOT, compile, artifact } from "./compile.mjs";

fs.mkdirSync(path.join(ROOT, "out"), { recursive: true });
const dir = fs.mkdtempSync(path.join(ROOT, "out", "compile-cache-test-"));
const rel = path.relative(ROOT, dir);
try {
  fs.mkdirSync(path.join(dir, "main"));
  fs.mkdirSync(path.join(dir, "dependency"));
  fs.writeFileSync(path.join(dir, "main", "Read.sol"), `// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;
import {Value} from "../dependency/Value.sol";
contract Read { function value() external pure returns(uint256) { return Value.value(); } }
`);
  const writeValue = value => fs.writeFileSync(path.join(dir, "dependency", "Value.sol"), `// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;
library Value { function value() internal pure returns(uint256) { return ${value}; } }
`);
  const options = { quiet: true, dirs: [rel + "/main"] };
  const code = out => artifact(out, rel + "/main/Read.sol", "Read").deployed;
  writeValue(7);
  const first = compile(options);
  assert.deepEqual(compile(options), first, "an identical cached compilation reproduces every artifact");
  writeValue(11);
  const second = compile(options);
  assert.notEqual(code(second), code(first), "changing only a callback import invalidates the cache");
  assert.deepEqual(compile({ ...options, cache: false }), second,
    "cached output agrees with an independent cache-disabled compilation");
  fs.writeFileSync(path.join(dir, "dependency", "Value.sol"), "this is deliberately not Solidity");
  assert.throws(() => compile(options), /compile error/,
    "a broken callback import cannot be masked by a previous successful cache");
} finally {
  fs.rmSync(dir, { recursive: true, force: true });
}
console.log("4 compile-cache assertions passed, including changed and broken callback imports");
