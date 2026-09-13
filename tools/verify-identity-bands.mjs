#!/usr/bin/env node
/*  A real hub's supply is a count even when its first id is 3585.
    These regressions deploy the real Ipseity, Parley, Roster and Nameplate
    on each edition chain. No mock supplies token ids or membership. */
import assert from "node:assert/strict";
import { compile, artifact } from "./compile.mjs";
import { Chain, decUint, encodeAddressArg, sel } from "./evm.mjs";
import { createAddressFromString } from "@ethereumjs/util";

const out = compile({ quiet: true, dirs: ["src", "test/mocks"] });
const A = (f, n) => artifact(out, f, n);
const w = n => BigInt(n).toString(16).padStart(64, "0");
const dns = name => "0x" + name.split(".").map(label => {
  const b = Buffer.from(label, "utf8");
  return b.length.toString(16).padStart(2, "0") + b.toString("hex");
}).join("") + "00";
const BANDS = [[1, 1, 1024], [8453, 1025, 2048], [130, 2049, 3072],
  [56, 3073, 3584], [4663, 3585, 4096]];
let checks = 0;
const eq = (message, actual, expected) => {
  assert.deepEqual(actual, expected, message);
  checks++;
};

for (const [chainId, first, last] of BANDS) {
  const c = await Chain.open({ chainId });
  const deploy = (file, name, args = "") => c.deploy(A(file, name).bytecode, args);
  const reg = await deploy("test/mocks/ERC6551Registry.sol", "ERC6551Registry");
  await c.vm.stateManager.putCode(
    createAddressFromString("0x000000006551c19487814612e58FE06813775758"),
    await c.vm.stateManager.getCode(createAddressFromString(reg)));
  const engine = await deploy("src/Engine.sol", "Engine", w(0));
  const sigil = await deploy("src/Sigil.sol", "Sigil");
  const renderer = await deploy("src/Renderer.sol", "Renderer",
    encodeAddressArg(engine) + encodeAddressArg(sigil));
  const reach = await deploy("src/IpseityAccount.sol", "IpseityAccount");
  const grip = await deploy("src/GripVault.sol", "GripVault");
  const hub = await deploy("src/Ipseity.sol", "Ipseity",
    encodeAddressArg(renderer) + encodeAddressArg(reach) + encodeAddressArg(grip) + w(first) + w(last));
  const parley = await deploy("src/Parley.sol", "Parley", encodeAddressArg(hub));
  const roster = await deploy("src/Roster.sol", "Roster", encodeAddressArg(parley) + encodeAddressArg(hub));
  const ens = await deploy("test/mocks/MockENS.sol", "MockENS");
  const plate = await deploy("src/Nameplate.sol", "Nameplate",
    encodeAddressArg(ens) + encodeAddressArg(hub) + encodeAddressArg("0x" + "aa".repeat(20)));
  const parent = await c.read(plate, "nodeOf(bytes)", [dns("ipseity.eth")]);
  await c.exec(ens, "setOwner(bytes32,address)", [parent, c.from.toString()]);
  await c.exec(plate, "claimParent(bytes32)", [parent]);

  const inWindow = (room, from) => c.read(roster, "inWindow(uint256,uint256)", [room, from]).then(decUint);
  const reachable = id => c.read(plate, "whereIs(uint256)", [id]).then(r => decUint(r, 3));
  const tokenFor = id => c.read(plate, "tokenForName(bytes)", [dns(`${id}.ipseity.eth`)]).then(decUint);
  eq("empty band has no commons members", await inWindow(0, first), 0n);
  eq("first unminted token is not reachable", await reachable(first), 0n);
  eq("first unminted numeric name is unresolved", await tokenFor(first), 0n);

  await c.exec(hub, "mint()", [], { value: 10n ** 16n });
  eq("one mint is supply one", decUint(await c.read(hub, "totalSupply()")), 1n);
  eq("the first actual id is a commons member", await inWindow(0, first), 1n);
  eq("a window starting before the band has only its minted bit", await inWindow(0, first - 1), 2n);
  eq("a window after the last mint is empty", await inWindow(0, first + 1), 0n);
  eq("the first mint is reachable on its home chain", await reachable(first), 1n);
  eq("the first mint resolves by numeric name", await tokenFor(first), BigInt(first));
  eq("the next mint does not resolve prematurely", await tokenFor(first + 1), 0n);
  const addrCall = sel("addr(bytes32)") + "00".repeat(32);
  const resolved = await c.read(plate, "resolve(bytes,bytes)", [dns(`${first}.ipseity.eth`), addrCall]);
  eq("wildcard addr returns the actual first token's account", decUint(resolved, 2),
    decUint(await c.read(hub, "account(uint256)", [first])));
  if (first > 1) eq("low nonexistent ids are never commons members", await inWindow(0, 1), 0n);

  await c.exec(hub, "mint()", [], { value: 10n ** 16n });
  eq("the first two actual ids are commons members", await inWindow(0, first), 3n);
  await c.exec(parley, "found(uint256,string,bool)", [first, "a closed band room", false]);
  const room = decUint(await c.read(parley, "groupKey(uint256)", [1]));
  eq("a group includes its actual founder", await inWindow(room, first), 1n);
  await c.exec(parley, "invite(uint256,uint256,uint256)", [room, first, first + 1]);
  eq("an actual second token appears as invited",
    decUint(await c.read(roster, "invitedInWindow(uint256,uint256)", [room, first])), 2n);
  await c.exec(parley, "join(uint256,uint256)", [room, first + 1]);
  eq("joining includes both actual token ids", await inWindow(room, first), 3n);
  eq("joining clears pending invitation output",
    decUint(await c.read(roster, "invitedInWindow(uint256,uint256)", [room, first])), 0n);
  const members = await c.read(roster, "membersOf(uint256,uint256)", [room, first - 1]);
  eq("list representation contains both members", decUint(members, 1), 2n);
  eq("first listed member is the band's first id", decUint(members, 2), BigInt(first));
  eq("second listed member is the band's second id", decUint(members, 3), BigInt(first + 1));
  eq("unknown rooms have no members", await inWindow(room + 1n, first), 0n);
  console.log(`chain ${chainId}: minted ids ${first}, ${first + 1} resolve and enumerate correctly`);
}
console.log(`${checks} identity band assertions passed`);
