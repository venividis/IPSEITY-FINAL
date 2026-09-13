#!/usr/bin/env node
/*───────────────────────────────────────────────────────────────────────────
  Compile every contract in src/ with solc-js and report deployed sizes
  against the EIP-170 ceiling.

    node tools/compile.mjs            compile, report, write out/
    node tools/compile.mjs --quiet    exit code only
───────────────────────────────────────────────────────────────────────────*/
import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const solc = require("solc");

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const QUIET = process.argv.includes("--quiet");

export const CONTRACT_SIZE_LIMIT = 24576;

/*  Silence is a reporting choice, never a deployment permission.

    The gate used to live only in the verbose CLI. Every verifier and
    deployment imported compile({ quiet: true }), so the paths used to
    ship the contracts skipped the very limit the CLI claimed to enforce.
    Check the output before returning it, regardless of the caller.

    Foundry test and script contracts embed other contracts' creation
    code. They are harnesses, not deployed application artifacts, and may
    exceed EIP-170. This exception is scoped to their source directories:
    a production contract imported by a test still has to fit. Probes and
    any other source directory are checked normally.                    */
export function assertDeployableSizes(out) {
  const rows = [];
  for (const [file, contracts] of Object.entries(out.contracts || {})) {
    if (/^(?:test|script|lib\/forge-std)\//.test(file.replaceAll("\\", "/"))) continue;
    for (const [name, c] of Object.entries(contracts)) {
      const n = (c.evm?.deployedBytecode?.object || "").length / 2;
      if (n) rows.push({ name, file, n });
    }
  }
  const over = rows.filter(({ n }) => n > CONTRACT_SIZE_LIMIT);
  if (over.length) {
    const err = new Error("EIP-170: deployed contract size exceeds " +
      CONTRACT_SIZE_LIMIT + " bytes: " + over.map(({ file, name, n }) =>
        `${file}:${name} (${n} bytes)`).join(", "));
    err.code = "CONTRACT_SIZE_LIMIT";
    err.contracts = over;
    throw err;
  }
  return rows;
}

function sources(dir, out = {}) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) sources(p, out);
    else if (e.name.endsWith(".sol")) {
      out[path.relative(ROOT, p)] = { content: fs.readFileSync(p, "utf8") };
    }
  }
  return out;
}

export function compile({ quiet = false, dirs = ["src"], files = [], cache = true } = {}) {
  const input = {
    language: "Solidity",
    sources: Object.assign(
      dirs.reduce((a, d) => Object.assign(a, sources(path.join(ROOT, d))), {}),
      Object.fromEntries(files.map(file => [file, {
        content: fs.readFileSync(path.join(ROOT, file), "utf8")
      }]))
    ),
    settings: {
      optimizer: { enabled: true, runs: 800 },
      viaIR: true,
      evmVersion: "cancun",
      outputSelection: { "*": { "*": ["abi", "evm.bytecode.object", "evm.deployedBytecode.object"] } }
    }
  };

  /* remappings.txt, honoured the same way forge honours it, so a path that
     resolves for `forge build` resolves here too */
  const remaps = fs.existsSync(path.join(ROOT, "remappings.txt"))
    ? fs.readFileSync(path.join(ROOT, "remappings.txt"), "utf8")
        .split("\n").map((l) => l.trim()).filter((l) => l.includes("="))
        .map((l) => { const i = l.indexOf("="); return [l.slice(0, i), l.slice(i + 1)]; })
    : [];

  const imports = new Map();
  const resolveImport = (p) => {
    for (const [from, to] of remaps) {
      if (p.startsWith(from)) {
        const full = path.join(ROOT, to + p.slice(from.length));
        if (fs.existsSync(full)) return full;
      }
    }
    for (const base of ["", "src/", "src/lib/", "src/interfaces/"]) {
      const full = path.join(ROOT, base, p);
      if (fs.existsSync(full)) return full;
    }
    return null;
  };
  const findImport = p => {
    const full = resolveImport(p);
    if (!full) return { error: "not found: " + p };
    const contents = fs.readFileSync(full, "utf8");
    imports.set(p, { file: path.relative(ROOT, full), contents });
    return { contents };
  };

  /*  The suite used to recompile the same application for every verifier.
      Cache only an identical compiler input and compiler build. Imports
      resolved through the callback are checked by content too: hashing
      only input.sources would miss a changed forge-std or relative import.
      The output checksum catches partial/corrupt files. A cache hit still
      passes the size gate below; it is never a validation exemption.    */
  const hash = value => createHash("sha256").update(value).digest("hex");
  const inputJSON = JSON.stringify(input);
  const key = hash(JSON.stringify({ schema: 1, compiler: solc.version(), remaps, input: inputJSON }));
  const cacheDir = path.join(ROOT, "out", "compile-cache");
  const cacheFile = path.join(cacheDir, key + ".json");
  let out;
  if (cache) {
    try {
      const saved = JSON.parse(fs.readFileSync(cacheFile, "utf8"));
      if (saved.key === key && saved.outputHash === hash(saved.output) &&
          saved.imports.every(([request, file, digest]) => {
            const resolved = resolveImport(request);
            return resolved === path.join(ROOT, file) &&
              hash(fs.readFileSync(resolved, "utf8")) === digest;
          })) {
        out = JSON.parse(saved.output);
      }
    } catch { /* absent, stale or corrupt cache: compile from source */ }
  }
  const cached = !!out;
  if (!out) out = JSON.parse(solc.compile(inputJSON, { import: findImport }));

  const errors = (out.errors || []).filter((e) => e.severity === "error");
  const warnings = (out.errors || []).filter((e) => e.severity === "warning");

  if (!quiet) {
    for (const e of errors) console.error("\x1b[31m" + e.formattedMessage + "\x1b[0m");
    for (const w of warnings) {
      // shadowing and unused-parameter noise from interface conformance is expected
      if (/Unused (function parameter|local variable)/.test(w.message)) continue;
      console.warn("\x1b[33m" + (w.formattedMessage || w.message).split("\n").slice(0, 3).join("\n") + "\x1b[0m");
    }
  }
  if (errors.length) {
    const err = new Error(errors.length + " compile error(s)");
    err.errors = errors;
    throw err;
  }
  assertDeployableSizes(out);
  if (cache && !cached) {
    const output = JSON.stringify(out);
    const saved = JSON.stringify({ key, outputHash: hash(output), output,
      imports: [...imports].map(([request, { file, contents }]) => [request, file, hash(contents)]) });
    let tmp;
    try {
      fs.mkdirSync(cacheDir, { recursive: true });
      tmp = cacheFile + "." + process.pid + "." + Date.now() + ".tmp";
      fs.writeFileSync(tmp, saved);
      fs.renameSync(tmp, cacheFile);
    } catch {
      if (tmp) { try { fs.unlinkSync(tmp); } catch {} }
      // A cache is optional. A read-only output directory does not change compilation.
    }
  }
  return out;
}

export function artifact(out, file, name) {
  const c = out.contracts?.[file]?.[name];
  if (!c) throw new Error("no artifact for " + file + ":" + name);
  return {
    abi: c.abi,
    bytecode: "0x" + c.evm.bytecode.object,
    deployed: "0x" + c.evm.deployedBytecode.object
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const t0 = Date.now();
  const out = compile({ quiet: QUIET });
  const LIMIT = CONTRACT_SIZE_LIMIT;
  const rows = [];
  for (const [file, cs] of Object.entries(out.contracts)) {
    for (const [name, c] of Object.entries(cs)) {
      const n = c.evm.deployedBytecode.object.length / 2;
      if (n === 0) continue;                       // interfaces and libraries
      rows.push({ name, file, n });
    }
  }
  rows.sort((a, b) => b.n - a.n);
  if (!QUIET) {
    console.log(`\n  compiled in ${((Date.now() - t0) / 1000).toFixed(1)}s — deployed sizes\n`);
    for (const r of rows) {
      const pct = (r.n / LIMIT) * 100;
      const bar = "█".repeat(Math.round(pct / 4)).padEnd(25, "·");
      const col = pct > 100 ? "\x1b[31m" : pct > 85 ? "\x1b[33m" : "\x1b[32m";
      console.log(`  ${col}${bar}\x1b[0m ${String(r.n).padStart(6)} B  ${pct.toFixed(0).padStart(3)}%  ${r.name}`);
    }
    const over = rows.filter((r) => r.n > LIMIT);
    console.log(over.length
      ? `\n  \x1b[31m${over.length} contract(s) exceed the EIP-170 ceiling of ${LIMIT} bytes\x1b[0m\n`
      : `\n  \x1b[32mall contracts fit under the EIP-170 ceiling of ${LIMIT} bytes\x1b[0m\n`);
    if (over.length) process.exit(1);
  }
  fs.mkdirSync(path.join(ROOT, "out"), { recursive: true });
  fs.writeFileSync(path.join(ROOT, "out/solc.json"), JSON.stringify(out));
}
