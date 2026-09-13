#!/usr/bin/env node
/* Runs the unchanged client sources against a small deterministic DOM and
   wallet model. This proves transaction and roster behavior, not browser
   layout, sandbox enforcement, GPU rendering, or wallet-extension behavior. */
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");
const read=p=>fs.readFileSync(path.join(root,p),"utf8");
const owner="0x"+"11".repeat(20),other="0x"+"22".repeat(20);
let passed=0;
const check=(name,value)=>{assert.ok(value,name);passed++;console.log("  PASS "+name);};
const settle=()=>new Promise(r=>setImmediate(r));

class Element {
  constructor(tag="div"){
    this.tagName=tag.toUpperCase();this.children=[];this.parentNode=null;
    this.dataset={};this.attrs={};this.listeners={};this.className="";this._text="";
    this.style={setProperty(k,v){this[k]=v;}};
    this.classList={contains:k=>this.className.split(/\s+/).includes(k),
      add:(...ks)=>{this.className=[...new Set([...this.className.split(/\s+/).filter(Boolean),...ks])].join(' ');},
      remove:(...ks)=>{this.className=this.className.split(/\s+/).filter(k=>!ks.includes(k)).join(' ');},
      toggle:(k,on)=>{if(on===undefined)on=!this.classList.contains(k);this.classList[on?'add':'remove'](k);}};
  }
  set textContent(s){this._text=String(s);this.children=[];}
  get textContent(){return this._text+this.children.map(x=>x.textContent).join('');}
  set innerHTML(s){
    this.textContent='';
    for(const m of String(s).matchAll(/<(\w+)([^>]*)>/g)){
      const el=new Element(m[1]);
      for(const a of m[2].matchAll(/([\w-]+)(?:=(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g))el.setAttribute(a[1],a[2]??a[3]??a[4]??'');
      this.appendChild(el);
    }
  }
  setAttribute(k,v){this.attrs[k]=String(v);if(k==='class')this.className=String(v);if(k==='id')this.id=String(v);
    if(k.startsWith('data-'))this.dataset[k.slice(5)]=String(v);}
  removeAttribute(k){delete this.attrs[k];}
  appendChild(el){el.parentNode=this;this.children.push(el);return el;}
  append(...els){els.forEach(el=>this.appendChild(el));}
  insertBefore(el,before){el.parentNode=this;const i=this.children.indexOf(before);if(i<0)this.children.push(el);else this.children.splice(i,0,el);}
  remove(){if(this.parentNode)this.parentNode.children=this.parentNode.children.filter(x=>x!==this);this.parentNode=null;}
  get lastChild(){return this.children.at(-1);}
  addEventListener(k,fn){(this.listeners[k]??=[]).push(fn);}
  fire(k){for(const fn of this.listeners[k]||[])fn({target:this,key:k});}
  focus(){}
  blur(){}
  matches(s){
    if(s.startsWith('#'))return this.id===s.slice(1);
    if(s.startsWith('.'))return s.slice(1).split('.').every(k=>this.classList.contains(k));
    if(s.startsWith('['))return Object.hasOwn(this.attrs,s.slice(1,-1));
    return this.tagName===s.toUpperCase();
  }
  querySelectorAll(s){const wanted=s.split(',').map(x=>x.trim()),out=[];const visit=el=>{
    for(const ch of el.children){if(wanted.some(q=>ch.matches(q)))out.push(ch);visit(ch);}
  };visit(this);return out;}
  querySelector(s){return this.querySelectorAll(s)[0]||null;}
}
function context(){
  const body=new Element('body'),html=new Element('html');html.appendChild(body);
  const document={body,documentElement:html,createElement:t=>new Element(t),
    querySelector:s=>html.querySelector(s),querySelectorAll:s=>html.querySelectorAll(s),
    getElementById:id=>html.querySelector('#'+id)};
  const timers=[];
  const win={document,location:{hash:'',href:''},addEventListener(){},
    setTimeout(fn,ms){timers.push({fn,ms});return timers.length;},clearTimeout(){},console};
  win.window=win;
  const ctx=vm.createContext(win);
  const add=(id,parent=body)=>{const e=new Element();e.id=id;parent.appendChild(e);return e;};
  return {win,ctx,document,add,timers};
}
async function consoleFixture(){
  const f=context();
  for(const id of ['root','walk','tick','led','acct','held','heldby','lane','lane-note'])f.add(id);
  f.add('cslab',f.add('cbox'));
  const mock={account:owner,chain:'0x2105',sent:[],listeners:{},noChain:false};
  const eth={on:(k,fn)=>mock.listeners[k]=fn,request:async({method,params})=>{
    if(method==='eth_accounts'||method==='eth_requestAccounts')return mock.account?[mock.account]:[];
    if(method==='eth_chainId'){if(mock.noChain)throw Error('chain unavailable');return mock.chain;}
    if(method==='eth_sendTransaction'){mock.sent.push(params[0]);return '0x'+'ab'.repeat(32);}
    throw Error('unexpected '+method);
  }};
  Object.assign(f.win,{ethereum:eth,CON:{id:2049,first:2049,last:3072,chain:8453,hue:214,
    owner,hub:'0x'+'33'.repeat(20),word:'0',verb:1,sel:{commit:'0xabcdef01'}}});
  vm.runInContext(read('engine/console.js'),f.ctx);
  vm.runInContext(read('engine/console-lanes.js'),f.ctx);
  await f.win.CON.ready;await settle();
  const $=id=>f.document.getElementById(id);
  const review=()=>f.win.CON.propose('A real review',[['Token','#2049']],
    {to:f.win.CON.hub,data:'0xabcdef01'});
  const sign=()=>$('cslab').querySelector('[data-go]').onclick();
  return {...f,mock,$,review,sign};
}
let f=await consoleFixture();f.review();f.mock.chain='0x1';f.sign();await settle();
check('a chain switch after review cannot broadcast',f.mock.sent.length===0&&f.$('tick').textContent.includes('Move the wallet'));
f=await consoleFixture();f.review();f.mock.account=other;f.sign();await settle();
check('an account switch after review cannot broadcast',f.mock.sent.length===0&&f.$('tick').textContent.includes('wallet changed'));
f=await consoleFixture();f.review();f.mock.noChain=true;f.sign();await settle();
check('a failed chain read refuses to sign',f.mock.sent.length===0&&f.$('tick').textContent==='chain unavailable');
f=await consoleFixture();f.review();f.win.ethereum={...f.win.ethereum};f.sign();await settle();
check('replacing the provider requires another review',f.mock.sent.length===0);
f=await consoleFixture();f.review();f.mock.account=other;f.mock.listeners.accountsChanged([other]);await settle();
check('an account event cancels the open slab',!f.$('cbox').classList.contains('on'));
check('both identity labels reset for another wallet',f.$('held').textContent!=='you'&&f.$('heldby').textContent!=='you');
check('holder controls disappear when another account takes over',!f.$('lane').textContent.includes('Review the turn'));
f.mock.account=null;f.mock.listeners.accountsChanged([]);await settle();
check('disconnect restores a read-only account',f.win.CON.account===null&&f.$('acct').textContent==='read only — connect');
f.mock.account=owner;f.mock.listeners.accountsChanged([owner]);await settle();
check('connecting the holder rebuilds its controls without navigation',f.$('held').textContent==='you'&&f.$('lane').textContent.includes('Review the turn'));
f=await consoleFixture();f.review();const twice=f.$('cslab').querySelector('[data-go]').onclick;twice();twice();await settle();
check('one review cannot broadcast twice',f.mock.sent.length===1);
check('the send pins the reviewed sender and chain',f.mock.sent[0].from===owner&&f.mock.sent[0].chainId==='0x2105');
check('the transaction preserves its target and calldata',f.mock.sent[0].to===f.win.CON.hub&&f.mock.sent[0].data==='0xabcdef01');

const constant=(file,name)=>{
  const src=read(file);const start=src.indexOf('string internal constant '+name+' =');
  assert.notEqual(start,-1);const part=src.slice(start);
  const end=part.indexOf('\n    string internal constant ',1);
  const tokens=[...(end<0?part:part.slice(0,end)).matchAll(/"(?:\\.|[^"\\])*"|\/\*[\s\S]*?\*\/|\/\/[^\n]*/g)];
  return tokens.filter(m=>m[0][0]==='"').map(m=>JSON.parse(m[0])).join('');
};
async function keyFixture(){
  const f=context();
  f.add('KEY').textContent=JSON.stringify({id:2049,chain:8453,key:owner,reach:'0x'+'44'.repeat(20),
    sel:{allows:'0xaaaa0001',exec:'0xaaaa0002'}});
  for(const id of ['s','kchk','kt','ks','xgo','xt','xv','xd','xslab'])f.add(id);
  f.document.getElementById('xt').value=other;
  f.document.getElementById('xv').value='12';
  f.document.getElementById('xd').value='0xabcdef01';
  const mock={chain:'0x2105',sent:[],reads:0};
  f.win.ethereum={request:async({method,params})=>{
    if(method==='eth_chainId')return mock.chain;
    if(method==='eth_requestAccounts')return [owner];
    if(method==='eth_call'){mock.reads++;return '0x'+(1n).toString(16).padStart(64,'0');}
    if(method==='eth_sendTransaction'){mock.sent.push(params[0]);return '0x'+'ab'.repeat(32);}
    throw Error('unexpected '+method);
  }};
  vm.runInContext(constant('src/PageKey.sol','KEY_JS'),f.ctx);
  return {...f,mock};
}
f=await keyFixture();f.mock.chain='0x1';f.document.getElementById('xgo').fire('click');await settle();
check('the key door refuses to read a grant on another chain',f.mock.reads===0&&f.document.getElementById('s').textContent.includes('chain 8453'));
f=await keyFixture();f.document.getElementById('xgo').fire('click');await settle();
f.mock.chain='0x1';f.document.getElementById('xslab').querySelector('button').fire('click');await settle();
check('the key door rechecks the chain after its review opens',f.mock.sent.length===0&&f.document.getElementById('s').textContent.includes('chain 8453'));
f=await keyFixture();f.document.getElementById('xgo').fire('click');await settle();
const keySign=f.document.getElementById('xslab').querySelector('button');keySign.fire('click');keySign.fire('click');await settle();
check('the key door sends one transaction with the expected chain',f.mock.sent.length===1&&f.mock.sent[0].chainId==='0x2105');
check('the session transaction uses the configured key and execution function',f.mock.sent[0].from===owner&&f.mock.sent[0].data.startsWith('0xaaaa0002'));
const bits=(base,ids)=>{let n=0n;for(const id of ids)if(id>=base&&id<base+256)n|=1n<<BigInt(id-base);return '0x'+n.toString(16).padStart(64,'0');};
const W=n=>BigInt(n).toString(16).padStart(64,'0');
f=context();const commands={},windows=[];
f.add('X').textContent=JSON.stringify({parley:'parley',roster:'roster',sel:{gkey:'0xaaaa',inWin:'0xbbbb'}});
f.win.TERM={def:(name,hint,write,desc,fn)=>commands[name]=fn};
f.win.IP={W,word:r=>BigInt(r),call:async()=>('0x'+W(9)),tryCall:async(to,data)=>{
  const base=Number(BigInt('0x'+data.slice(-64)));windows.push(base);return bits(base,[2049,4096]);
}};
vm.runInContext(constant('src/DeskRooms.sol','ROOMS_JS'),f.ctx);
const roster=await commands.roster(['1']);
check('the terminal roster crosses empty windows to later chain bands',roster==='#2049 #4096');
check('the terminal checks all sixteen bounded windows',windows.length===16);
f.win.IP.tryCall=async()=>null;
let failed=false;try{await commands.roster(['1']);}catch(e){failed=e.message.includes('not reported');}
check('an unanswered roster never becomes an empty room',failed);

f=context();f.add('roster');f.add('pend');
const calls=[];
f.win.IP={$:id=>f.document.getElementById(id),W,word:r=>BigInt(r),say(){},
  tryCall:async(to,data)=>{const base=Number(BigInt('0x'+data.slice(-64)));calls.push(base);
    return bits(base,data.startsWith('0xbbbb')?[2049]:[4096]);}};
f.win.IPT={me:()=>2049,T:{room:9,roster:'roster',steward:2049,sel:{inWin:'0xbbbb',invWin:'0xcccc'}}};
vm.runInContext(constant('src/DeskTalk.sol','ROOMS_JS'),f.ctx);
f.timers.find(t=>t.ms===700).fn();await settle();
check('the room page finds a member after empty windows',f.document.getElementById('roster').textContent.includes('#2049'));
check('the room page finds pending invitations at the edition end',f.document.getElementById('pend').textContent.includes('#4096'));
check('the room page checks both answers in every bounded window',calls.length===32);

const engine=read('engine/ipseity.html');
const frame=engine.match(/<iframe id="nestframe"[\s\S]*?<\/iframe>/)[0];
check('the nested frame declares scripts without same-origin permission',/sandbox="allow-scripts"/.test(frame)&&!frame.includes('allow-same-origin'));
check('the door declares the same sandbox boundary',constant('src/DeskTalk.sol','DOOR_JS').includes("setAttribute('sandbox','allow-scripts')"));
/* Test the actual close handler's DOM mutations. Browser-enforced origin
   isolation is deliberately left to verify-rebuild-ui.mjs. */
f=context();const nest=f.add('nest'),inner=f.add('nestframe');nest.classList.add('on');inner.setAttribute('srcdoc','running child');
f.win.$=s=>f.document.querySelector(s);f.win.say=()=>{};
const close=engine.match(/\$\("#n-off"\)\.onclick = \(\) => \{([\s\S]*?)\n      \};/)[1];
vm.runInContext(close,f.ctx);
check('closing removes srcdoc before sending the inner frame to blank',!Object.hasOwn(inner.attrs,'srcdoc')&&inner.src==='about:blank'&&!nest.classList.contains('on'));
console.log(`\n${passed} deterministic DOM assertions passed. Browser layout and sandbox enforcement were not exercised.`);
