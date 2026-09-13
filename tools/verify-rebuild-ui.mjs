#!/usr/bin/env node
/* A review is bound to the account and chain the person actually reviewed.
   Drive the shipped console sources in Chromium, then exercise both real
   iframe declarations against a child that tries to reach its parent. */
import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { createServer } from "node:http";
import { chromium } from "playwright";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = p => fs.readFileSync(path.join(root, p), "utf8");
const core = read("engine/console.js"), lanes = read("engine/console-lanes.js");
const owner = "0x" + "11".repeat(20), other = "0x" + "22".repeat(20);
let passed = 0;
const check = (name, condition) => { assert.ok(condition, name); passed++; console.log("  PASS " + name); };
const fixture = `<!doctype html><style>#cbox{display:none}#cbox.on{display:block}</style>
<div id=root></div><div id=walk></div><div id=led></div><button id=acct></button>
<span id=held></span><span id=heldby></span><div id=tick></div>
<section id=lane><p id=lane-note></p></section><div id=cbox><div id=cslab></div></div>
<script>window.CON=${JSON.stringify({id:2049,first:2049,last:3072,chain:8453,hue:214,
  owner,hub:"0x"+"33".repeat(20),word:"0",verb:1,sel:{commit:"0xabcdef01"}})};
window.mock={account:${JSON.stringify(owner)},chain:'0x2105',sent:[],listeners:{},noChain:false};
window.ethereum={on:(name,fn)=>mock.listeners[name]=fn,request:async({method,params})=>{
  if(method==='eth_accounts'||method==='eth_requestAccounts')return mock.account?[mock.account]:[];
  if(method==='eth_chainId'){if(mock.noChain)throw Error('chain unavailable');return mock.chain;}
  if(method==='eth_sendTransaction'){mock.sent.push(params[0]);return '0x'+'ab'.repeat(32);}
  if(method==='eth_getTransactionReceipt')return null;
  throw Error('unexpected '+method);
}};</script><script src=/console.js></script><script src=/console-lanes.js></script>`;
const child = `<!doctype html><script>
let reached=false,removed=false;
try{parent.document.body.dataset.escaped='yes';reached=true;}catch(e){}
try{frameElement.removeAttribute('sandbox');removed=true;}catch(e){}
parent.postMessage({probe:'isolation',reached,removed},'*');
</script>`;
const server = createServer((req,res)=>{
  res.setHeader("Content-Type", req.url.endsWith(".js")?"text/javascript":"text/html");
  res.end(req.url==="/console.js"?core:req.url==="/console-lanes.js"?lanes:
    req.url.startsWith("/token/")?child:fixture);
});
await new Promise(r=>server.listen(0,"127.0.0.1",r));
const url = `http://127.0.0.1:${server.address().port}`;
const executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH;
const browser = await chromium.launch({...(executablePath?{executablePath}:{}),args:["--no-sandbox","--disable-dev-shm-usage"]});
const page = await browser.newPage({viewport:{width:420,height:900}});
const errors=[];
page.on("pageerror", e=>errors.push(e.message));
const reset=async()=>{
  await page.goto(url);
  await page.waitForFunction(()=>document.getElementById('held').textContent==='you' &&
    [...document.querySelectorAll('button')].some(b=>b.textContent==='Review the turn'));
};
const review=async()=>{
  await page.locator("input[type=range]").first().fill("900");
  await page.getByRole("button",{name:"Review the turn",exact:true}).click();
  await page.waitForFunction(()=>document.getElementById('cbox').classList.contains('on'));
};
try {
  await reset();
  await review();
  await page.evaluate(()=>{mock.chain='0x1';});
  await page.locator('[data-go]').click();
  await page.waitForFunction(()=>document.getElementById('tick').textContent.includes('Move the wallet'));
  check("a silent chain change after review sends nothing",await page.evaluate(()=>mock.sent.length===0));

  await reset(); await review();
  await page.evaluate(other=>{mock.account=other;},other);
  await page.locator('[data-go]').click();
  await page.waitForFunction(()=>document.getElementById('tick').textContent.includes('wallet changed'));
  check("a silent account change after review sends nothing",await page.evaluate(()=>mock.sent.length===0));

  await reset(); await review();
  await page.evaluate(()=>{mock.noChain=true;});
  await page.locator('[data-go]').click();
  await page.waitForFunction(()=>document.getElementById('tick').textContent.includes('chain unavailable'));
  check("an unanswered chain never becomes permission to send",await page.evaluate(()=>mock.sent.length===0));

  await reset(); await review();
  await page.evaluate(()=>{window.ethereum={...window.ethereum};});
  await page.locator('[data-go]').click();
  await page.waitForFunction(()=>document.getElementById('tick').textContent.includes('wallet changed'));
  check("a replaced wallet provider invalidates the review",await page.evaluate(()=>mock.sent.length===0));

  await reset(); await review();
  await page.evaluate(other=>{mock.account=other;mock.listeners.accountsChanged([other]);},other);
  await page.waitForFunction(()=>!document.getElementById('cbox').classList.contains('on') &&
    document.getElementById('held').textContent!=='you');
  check("an account event closes the outstanding review",await page.evaluate(()=>mock.sent.length===0));
  check("both holder labels stop saying you to another wallet",await page.evaluate(()=>
    document.getElementById('held').textContent!=='you'&&document.getElementById('heldby').textContent!=='you'));
  check("owner actions are repainted for the new account",await page.getByRole('button',{name:'Review the turn',exact:true}).count()===0);

  await page.evaluate(()=>{mock.account=null;mock.listeners.accountsChanged([]);});
  await page.waitForFunction(()=>CON.account===null);
  check("disconnect restores the read-only crest",await page.locator('#acct').textContent()==='read only — connect');
  await page.evaluate(owner=>{mock.account=owner;mock.listeners.accountsChanged([owner]);},owner);
  await page.waitForFunction(()=>document.getElementById('held').textContent==='you' &&
    [...document.querySelectorAll('button')].some(b=>b.textContent==='Review the turn'));
  check("reconnecting the holder restores actions without reloading",await page.getByRole('button',{name:'Review the turn',exact:true}).count()===1);

  await reset(); await review();
  await page.evaluate(()=>{const go=document.querySelector('[data-go]');go.onclick();go.onclick();});
  await page.waitForFunction(()=>mock.sent.length===1);
  const tx=await page.evaluate(()=>mock.sent[0]);
  check("one review can broadcast only once",await page.evaluate(()=>mock.sent.length===1));
  check("the send names the reviewed account and chain",tx.from===owner&&tx.chainId==='0x2105');
  check("the original target and calldata survive the review",tx.to==='0x'+'33'.repeat(20)&&tx.data.startsWith('0xabcdef01'));

  const isolation=async(markup,setup)=>{
    await page.goto(url);
    await page.evaluate(()=>{window.isolation=[];addEventListener('message',e=>{
      if(e.data&&e.data.probe==='isolation')isolation.push(e.data);
    });});
    if(setup)await page.evaluate(setup);
    else await page.evaluate(markup=>{
      document.body.insertAdjacentHTML('beforeend',markup);
      document.getElementById('nestframe').src='/token/2049/live';
    },markup);
    await page.waitForFunction(()=>isolation.length===1);
    return page.evaluate(()=>isolation[0]);
  };
  const frame=read('engine/ipseity.html').match(/<iframe id="nestframe"[\s\S]*?<\/iframe>/)[0];
  const nest=await isolation(frame);
  check("the actual nested instrument frame cannot read its parent",!nest.reached);
  check("the actual nested instrument frame cannot remove its sandbox",!nest.removed);

  const desk=read('src/DeskTalk.sol');
  const section=desk.slice(desk.indexOf('string internal constant DOOR_JS ='),desk.indexOf('string internal constant ROOMS_JS ='));
  const noComments=section.replace(/\/\*[\s\S]*?\*\//g,'');
  const doorJS=[...noComments.matchAll(/"(?:\\.|[^"\\])*"/g)].map(m=>JSON.parse(m[0])).join('');
  await page.goto(url);
  await page.evaluate(()=>{
    window.isolation=[];addEventListener('message',e=>{if(e.data?.probe==='isolation')isolation.push(e.data);});
    document.body.insertAdjacentHTML('beforeend','<div id=yours></div><div id=rig></div>');
    window.IP={$:id=>document.getElementById(id),acct:()=>CON.account};
    window.IPT={on:fn=>fn(2049,[2049])};
  });
  await page.addScriptTag({content:doorJS});
  await page.getByRole('button',{name:'open it here',exact:true}).click();
  await page.waitForFunction(()=>isolation.length===1);
  const doorProbe=await page.evaluate(()=>isolation[0]);
  check("the actual door client isolates its inline instrument",!doorProbe.reached&&!doorProbe.removed);
  check("the door retains a direct link to the signing instrument",await page.locator('a[href="/token/2049/live"]').count()===1);
  check("the driven console and frame clients raised no script errors",errors.length===0);
  console.log(`\n${passed} UI rebuild assertions passed.`);
} finally {
  await browser.close();
  await new Promise(r=>server.close(r));
}
