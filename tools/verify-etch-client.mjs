#!/usr/bin/env node
/* Execute the shipped writer, including its exact calldata, in a DOM shim.
   Browser appearance and actual wallet-extension injection are separate gates. */
import fs from "node:fs";
import vm from "node:vm";
import assert from "node:assert/strict";
import { ROOT } from "./compile.mjs";
import { enc, sel } from "./evm.mjs";
const source=fs.readFileSync(ROOT+"/src/DeskEtch.sol","utf8").split("function client()")[1];
const script=[...source.matchAll(/"(?:\\.|[^"\\])*"/g)].map(m=>JSON.parse(m[0])).join("").replace(/^<script>/,"").replace(/<\/script>$/,"");
const owner="0x"+"11".repeat(20),other="0x"+"22".repeat(20),etch="0x"+"33".repeat(20),hub="0x"+"44".repeat(20);
const C={id:"2049",chain:"130",etch,hub,owner:sel("ownerOf(uint256)"),admits:sel("admits(uint8,bytes)"),addressFor:sel("addressFor(bytes)"),inscribe:sel("inscribe(uint256,uint8,bytes)")};
const w=x=>BigInt(x).toString(16).padStart(64,"0");
function fixture(){
 const elements=new Map(),listeners={},state={owner,account:owner,chain:"0x82",calls:[],sent:[],refuse:false,admit:true};
 const $=id=>{if(!elements.has(id))elements.set(id,{value:id==="kind"?"1":"",hidden:false,textContent:"",disabled:false,files:[],events:{},addEventListener(e,fn){this.events[e]=fn}});return elements.get(id)};
 const ethereum={on(e,fn){listeners[e]=fn},async request({method,params}){
  if(method==="eth_chainId")return state.chain;
  if(method==="eth_accounts"||method==="eth_requestAccounts")return state.account?[state.account]:[];
  if(method==="eth_sendTransaction"){if(state.refuse)throw Error("User rejected request");state.sent.push(params[0]);return "0x"+"ab".repeat(32)}
  if(method==="eth_call"){
   const tx=params[0];state.calls.push(tx);assert.equal(params[1],"latest");
   if(tx.to===hub){assert.equal(tx.data,enc("ownerOf(uint256)",[2049]));return "0x"+state.owner.slice(2).padStart(64,"0")}
   assert.equal(tx.to,etch);
   if(tx.data.startsWith(C.admits))return "0x"+w(state.admit?1:0)+w(state.admit?0:4);
   if(tx.data.startsWith(C.addressFor))return "0x"+"55".repeat(20).padStart(64,"0")+w(0);
   if(tx.data.startsWith(C.inscribe))return "0x"+w(0)+"55".repeat(20).padStart(64,"0");
  }throw Error("Unexpected request "+method);
 }};
 const window={ethereum};
 vm.runInNewContext(script,{ETCH_CONFIG:C,window,document:{getElementById:$},TextEncoder,Uint8Array,Array,BigInt,Error,String,Math});
 return {$,state,window,listeners,preview:async()=>{$("words").value="A moment remembered";await $("preview").onclick()}};
}
let passed=0;function check(name,test){assert.ok(test,name);console.log("PASS "+name);passed++}
{
 const f=fixture();await f.preview();check("preview simulates without sending",f.state.sent.length===0&&!f.$("review").hidden);
 const expected=enc("inscribe(uint256,uint8,bytes)",[2049,1,"0x"+Buffer.from("A moment remembered").toString("hex")]);
 check("simulation contains the exact owner-selected bytes",f.state.calls.some(x=>x.data===expected));
 await f.$("send").onclick();check("separate confirmation sends once",f.state.sent.length===1);
 assert.deepEqual(JSON.parse(JSON.stringify(f.state.sent[0])),{from:owner,to:etch,data:expected,value:"0x0",chainId:"0x82"});passed++;
 check("submission is not presented as a mined success",f.$("status").textContent.includes("Submission is not confirmation"));
 await f.$("send").onclick();check("a consumed review cannot send again",f.state.sent.length===1);
}
for(const [name,change] of [
 ["silent chain change",f=>f.state.chain="0x1"],
 ["silent account change",f=>f.state.account=other],
 ["ownership transfer",f=>f.state.owner=other],
 ["disconnected wallet",f=>f.state.account=null],
 ["replaced provider",f=>f.window.ethereum={...f.window.ethereum}],
 ["edited inscription",f=>f.$("words").events.input()],
 ["wallet event",f=>f.listeners.chainChanged("0x1")]
]){const f=fixture();await f.preview();change(f);await f.$("send").onclick();check(name+" cannot reuse an earlier review",f.state.sent.length===0)}
{
 const f=fixture();f.state.chain="0x1";await f.preview();check("wrong-chain preview never reaches the archive",f.state.calls.length===0&&f.state.sent.length===0);
}
{
 const f=fixture();f.state.admit=false;await f.preview();check("contract admission refusal prevents confirmation",f.$("review").hidden&&f.$("status").textContent.includes("Format refused"));
}
{
 const f=fixture();f.state.refuse=true;await f.preview();await f.$("send").onclick();check("wallet rejection clears the review and reports failure",f.$("review").hidden&&f.state.sent.length===0&&f.$("status").textContent.includes("User rejected"));
}
{
 const f=fixture();const bytes=new Uint8Array([0,255,60,34,10]);f.$("kind").value="3";f.$("file").files=[{size:bytes.length,arrayBuffer:async()=>bytes.buffer}];await f.preview();await f.$("send").onclick();
 check("binary DATA is encoded byte-exactly without text conversion",f.state.sent[0]?.data===enc("inscribe(uint256,uint8,bytes)",[2049,3,"0x00ff3c220a"]));
}
console.log(`${passed} inscription client assertions passed (DOM shim; no live transactions).`);
