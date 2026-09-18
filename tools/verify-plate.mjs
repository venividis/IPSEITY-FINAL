#!/usr/bin/env node
/* IPSEITY · one Ethereum name

   The complete #1..#4096 production edition resolves locally on Ethereum.
   Sepolia rehearses the same range, and no remote production station may
   be introduced through the legacy station entry point.
*/
import { compile, artifact } from "./compile.mjs";
import { Chain, decUint, decAddr, decString, encodeAddressArg, sel } from "./evm.mjs";
import * as evm from "./evm.mjs";
import { keccak256 } from "ethereum-cryptography/keccak.js";

let pass = 0, fail = 0;
const ok = (n, c, d) => {
  c ? pass++ : fail++;
  console.log(`  ${c ? "\x1b[32m✓\x1b[0m" : "\x1b[31m✗\x1b[0m"} ${n}`);
  if (!c && d !== undefined) console.log(`      ${d}`);
};
const eq = (n, g, w) => ok(n, String(g) === String(w), `got  ${g}\n      want ${w}`);
const head = (s) => console.log(`\n  \x1b[1m${s}\x1b[0m`);
const refuses = async (n, fn, why) => {
  try { await fn(); ok(n, false, why || "it went through"); }
  catch { ok(n, true); }
};

const out = compile({ quiet: true, dirs: ["src", "test/mocks"] });
const A = (f, n) => artifact(out, f, n);

const label = (t) => "0x" + Buffer.from(keccak256(Buffer.from(t, "utf8"))).toString("hex");
const nhash = (parts) => parts.reduceRight(
  (node, p) => "0x" + Buffer.from(keccak256(Buffer.from(
    node.slice(2) + label(p).slice(2), "hex"))).toString("hex"),
  "0x" + "00".repeat(32));
const dns = (nm) => "0x" + nm.split(".").map(
  (l) => l.length.toString(16).padStart(2, "0") +
         Buffer.from(l, "utf8").toString("hex")).join("") + "00";

/*  A deployment on some other chain. Only its address matters here — the
    resolver never calls it, it quotes it.                              */
const ELSEWHERE = {
  8453: { premises: "0x1111111111111111111111111111111111111111",
          hub:      "0x2222222222222222222222222222222222222222" },
  130:  { premises: "0x3333333333333333333333333333333333333333",
          hub:      "0x4444444444444444444444444444444444444444" },
};

async function fixture(chainId) {
  const c = await Chain.open(chainId === undefined ? {} : { chainId });
  const ens  = await c.deploy(A("test/mocks/MockENS.sol", "MockENS").bytecode, "", "MockENS");
  const hub  = await c.deploy(A("test/mocks/MockHub.sol", "MockHub").bytecode, "", "MockHub");
  const wrapper = await c.deploy(A("test/mocks/MockAccount.sol", "MockWrapper").bytecode, "", "Wrapper");
  const site = "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
  const plate = await c.deploy(A("src/Nameplate.sol", "Nameplate").bytecode,
    encodeAddressArg(ens) + encodeAddressArg(hub) + encodeAddressArg(site) +
      encodeAddressArg(wrapper), "Nameplate");
  await c.exec(hub, "setSupply(uint256)", [4096]);
  const parent = nhash(["ipseity4d", "eth"]);
  await c.exec(ens, "setOwner(bytes32,address)", [parent, c.from.toString()]);
  await c.exec(plate, "claimParent(bytes32)", [parent]);
  return { c, ens, hub, wrapper, site, plate, parent };
}

/*═════════════ one Ethereum edition ═════════════*/

const F = await fixture(1);
const { c, plate, site, hub } = F;

head("every production id resolves to Ethereum");
{
  const at = await c.read(plate, "whereIs(uint256)", [7]);
  eq("token 7 lives on Ethereum", decUint(at, 0), 1n);
  eq("it resolves to the immutable local premises", decAddr(at, 1).toLowerCase(), site.toLowerCase());
  eq("it resolves to the local collection", decAddr(at, 2).toLowerCase(), hub.toLowerCase());
  eq("a minted id is reachable", decUint(at, 3), 1n);

  const last = await c.read(plate, "whereIs(uint256)", [4096]);
  eq("token 4096 is also Ethereum", decUint(last, 0), 1n);
  eq("the complete edition is reachable in the rehearsal fixture", decUint(last, 3), 1n);

  const outside = await c.read(plate, "whereIs(uint256)", [4097]);
  eq("4097 is outside the edition", decUint(outside, 0), 0n);
}

head("no remote edition station can be introduced");
await refuses("Base cannot be registered as another edition home",
  () => c.exec(plate, "setStation(uint256,address,address)",
    [8453, ELSEWHERE[8453].premises, ELSEWHERE[8453].hub]));

head("Sepolia rehearses the same range without becoming production");
{
  const S = await fixture(11155111);
  const at = await S.c.read(S.plate, "whereIs(uint256)", [4096]);
  eq("the rehearsal resolves locally", decUint(at, 0), 11155111n);
  eq("and uses its own premises", decAddr(at, 1).toLowerCase(), S.site.toLowerCase());
}

console.log(`\n  ${fail ? "\x1b[31m" : "\x1b[32m"}${pass} passed, ${fail} failed\x1b[0m\n`);
process.exit(fail ? 1 : 0);
