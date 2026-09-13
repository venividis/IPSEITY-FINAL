#!/usr/bin/env node
/* Supply is a count, never an id. Mint a real non-one-starting band and
   read the root, door, gallery and offering manifest across a page edge.
   --compiled <out/solc.json> reuses a freshly built full compiler output. */
import fs from "node:fs";
import assert from "node:assert/strict";
import { gzipSync } from "node:zlib";
import { compile, artifact, assertDeployableSizes } from "./compile.mjs";
import { Chain, encodeAddressArg, decString } from "./evm.mjs";
import { getter } from "./site.mjs";

const compiledAt=process.argv.indexOf("--compiled");
const out=compiledAt<0?compile({quiet:true}):JSON.parse(fs.readFileSync(process.argv[compiledAt+1],"utf8"));
assertDeployableSizes(out);
const A=(file,name)=>artifact(out,"src/"+file+".sol",name||file);
const c=await Chain.open();
const w=n=>BigInt(n).toString(16).padStart(64,"0");
const addresses=(...xs)=>xs.map(encodeAddressArg).join("");
const zero="0x"+"00".repeat(20);
let pass=0;
const check=(name,condition)=>{assert.ok(condition,name);pass++;console.log("  PASS "+name);};

const engine=await c.deploy(A("Engine").bytecode,w(1));
const sigil=await c.deploy(A("Sigil").bytecode);
const renderer=await c.deploy(A("Renderer").bytecode,addresses(engine,sigil));
const hub=await c.deploy(A("Ipseity").bytecode,addresses(renderer,
  await c.deploy(A("IpseityAccount").bytecode),await c.deploy(A("GripVault").bytecode))+w(2049)+w(3072));
const doc=Buffer.from("<!doctype html><title>band proof</title><body>the original engine path</body>");
const bytes="0x"+gzipSync(doc,{level:9}).toString("hex");
await c.exec(engine,"loadHead(bytes)",[bytes]);
await c.exec(engine,"loadBody(bytes)",[bytes]);
await c.exec(engine,"setInflatedSize(uint32)",[doc.length]);
const pool=await c.deploy(A("Pool").bytecode,addresses(hub)+w(10n**30n)+addresses(c.from.toString())+w(0));
const lease=await c.deploy(A("Lease").bytecode,addresses(hub));
const parley=await c.deploy(A("Parley").bytecode,addresses(hub));
const chrome=await c.deploy(A("Chrome").bytecode);
/* A desk fixture returns the ABI encoding of an empty string, for every
   selector. Only decorative scripts are stubbed; all mint and read state
   comes from the production hub, pool, lease and page bytecode. */
const runtime="6020600052600060205260406000f3";
const len=(runtime.length/2).toString(16).padStart(2,"0");
const blank=await c.deploy("0x60"+len+"600c60003960"+len+"6000f3"+runtime);
const door=await c.deploy(A("PageDoor").bytecode,addresses(hub,chrome,blank,blank,parley,blank,blank,blank));
const gallery=await c.deploy(A("PageGallery").bytecode,addresses(hub,chrome,pool,lease,sigil));
const manifest=await c.deploy(A("PageManifest").bytecode,addresses(hub,pool,lease,parley,zero,zero,zero,blank));
const pages=Array(21).fill(blank);pages[0]=door;pages[5]=manifest;pages[10]=gallery;
const premises=await c.deploy(A("Premises").bytecode,addresses(hub,chrome,...pages));
const GET=getter(c,premises);
const d=()=>c.read(door,"door()").then(decString);
const g=n=>c.read(gallery,"gallery(uint256)",[n]).then(decString);
const m=n=>c.read(manifest,"index(uint256)",[n]).then(decString).then(JSON.parse);

check("an unminted later band still has a readable door",(await d()).includes("None issued yet."));
const empty=await m(0);
check("an empty manifest reports no offering and no next issued page",empty.offering.length===0&&!empty.window.more);
await c.exec(hub,"mint()",[],{value:10n**16n});
const root=await GET([]);
check("the root instrument route works when the first minted token is 2049",root.status===200&&root.body.includes('id:2049'));
const firstDoor=await d();
check("the door opens its own band's first console",firstDoor.includes('data-w=console href="/c/2049"'));
check("the recent list names the real token instead of token one",firstDoor.includes('href="/token/2049"')&&!firstDoor.includes('href="/token/1"'));
check("the gallery's first cell is the real minted token",(await g(0)).includes('class=gcell href="/token/2049"'));

for(let i=1;i<25;i++)await c.exec(hub,"mint()",[],{value:10n**16n});
await c.exec(hub,"setLeaseAgent(uint256,address)",[2049,lease]);
await c.exec(hub,"setLeaseAgent(uint256,address)",[2073,lease]);
await c.exec(lease,"list(uint256,uint128,uint32,uint32)",[2049,10n**15n,1,30]);
await c.exec(lease,"list(uint256,uint128,uint32,uint32)",[2073,10n**15n,1,30]);
const newest=await g(0),older=await g(1),past=await g(2);
const galleryIds=html=>[...html.matchAll(/class=gcell href="\/token\/(\d+)"/g)].map(x=>Number(x[1]));
const page0=galleryIds(newest),page1=galleryIds(older);
check("the newest gallery page contains exactly 24 descending band ids",page0.length===24&&page0[0]===2073&&page0.at(-1)===2050);
check("the second gallery page contains the first minted token once",page1.length===1&&page1[0]===2049);
check("the next gallery page is explicitly past the end",past.includes("Past the end"));
const index0=await m(0),index1=await m(1),index2=await m(2);
check("the manifest's first window uses actual ids",index0.window.from===2049&&index0.window.to===2072&&index0.window.more);
check("an offering in the first band window remains discoverable",index0.offering.some(o=>o.token===2049));
check("the second manifest page reaches the later offering",index1.window.from===2073&&index1.window.to===2073&&!index1.window.more&&index1.offering.some(o=>o.token===2073));
check("a page beyond the issued band does not invent an offering",index2.offering.length===0&&!index2.window.more);
const recent=await d();
check("the door's recent list stops after twelve real tokens",recent.includes('href="/token/2062"')&&!recent.includes('href="/token/2061"'));
console.log(`\n${pass} non-one band assertions passed.`);
