#!/usr/bin/env node
import assert from "node:assert/strict";
import { STATEFUL_SITE_KEYS, validateExistingProtocols, retainedProtocols } from "./protocols.mjs";
import { deploySite, predictCreate, NO_VENUE } from "./site.mjs";
import { sel } from "./evm.mjs";
const addr=n=>"0x"+BigInt(n).toString(16).padStart(40,"0");
const hub=addr(1), zero=addr(0), existing=Object.fromEntries(STATEFUL_SITE_KEYS.map((k,i)=>[k,addr(i+20)]));
let passed=0;
function ok(name,cond){assert.ok(cond,name);console.log("PASS "+name);passed++;}
const record={chainId:84532,contracts:existing};
assert.throws(()=>retainedProtocols(record,1),/chain differ/);passed++;
assert.throws(()=>retainedProtocols({chainId:84532,contracts:{}},84532),/Missing parley/);passed++;
const reused=retainedProtocols(record,84532);
ok("every stateful address survives record preparation",JSON.stringify(reused)===JSON.stringify(existing));
const c={nonce:0n,from:{toString:()=>addr(999)},deploys:[],
  rpc:async()=>"0x00",
  call:async(_to,data)=>"0x"+(data===sel("POOL_MANAGER()")?zero:hub).slice(2).padStart(64,"0"),
  nonceNow:async function(){return this.nonce},
  deploy:async function(_code,args,label){const address=predictCreate(this.from.toString(),this.nonce++);this.deploys.push({args,label,address});return address},
  exec:async function(){this.nonce++;return {gas:0n}}
};
await validateExistingProtocols(c,hub,existing,zero);
await assert.rejects(()=>validateExistingProtocols({...c,rpc:async()=>"0x"},hub,existing,zero),/no code/);passed++;
await assert.rejects(()=>validateExistingProtocols({...c,call:async()=>"0x"+addr(88).slice(2).padStart(64,"0")},hub,existing,zero),/different collection/);passed++;
await assert.rejects(()=>validateExistingProtocols(c,hub,{parley:zero},zero),/Invalid existing/);passed++;
const site=await deploySite(c,()=>({bytecode:"0x00"}),{hub,pool:addr(2),lease:addr(3),sigil:addr(4),...existing,uniswap:NO_VENUE});
for(const key of STATEFUL_SITE_KEYS)ok(key+" is reused by the actual deployment sequence",site[key]===existing[key]);
ok("page refresh deploys none of the five stateful protocols",!c.deploys.some(x=>["Parley","Kiln","Locker","Succession","Consign"].includes(x.label)));
ok("estate desk is wired to the retained plans and listings",c.deploys.find(x=>x.label==="DeskWill").args.startsWith(existing.succession.slice(2).padStart(64,"0")+existing.consign.slice(2).padStart(64,"0")));
ok("console terminal retains launch and lock history",c.deploys.find(x=>x.label==="DeskTerm").args.includes(existing.kiln.slice(2).padStart(64,"0")+existing.locker.slice(2).padStart(64,"0")));
console.log(`${passed} protocol retention checks passed; no transactions sent.`);
