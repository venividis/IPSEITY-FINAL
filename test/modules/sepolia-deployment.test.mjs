import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import net from 'node:net';
import {spawn,execFileSync} from 'node:child_process';
import {once} from 'node:events';
import {Wallet,sha256,keccak256} from 'ethers';
import {compile,artifact} from '../../tools/compile.mjs';
import {RpcChain,DEV_KEYS} from '../../tools/rpc.mjs';
import {loadModuleArtifacts} from '../../tools/modules-deployment.mjs';
import {buildWorkbench} from '../../tools/modules-build-workbench.mjs';
import {publicConfig,deploymentPreflight,deploySepolia,PUBLIC_TEST_KEYS,REGISTRY,MINT_RECIPIENT,TX_GAS_CAP} from '../../tools/deploy-sepolia.mjs';
import {decUint} from '../../tools/evm.mjs';

const ROOT=path.resolve(import.meta.dirname,'../..');
const temp=()=>fs.mkdtempSync(path.join(os.tmpdir(),'ipseity-sepolia-'));
const sample={bytes:Buffer.from('workbench'),packed:Buffer.from('gzip'),manifest:{byteLength:9,sha256:sha256(Buffer.from('workbench'))}};
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));

test('public deployment rejects missing credentials, development keys, recipient substitution and existing outputs',()=>{
 const dir=temp();try{
  const key=Wallet.createRandom().privateKey,base={RPC_URL:'https://example.invalid/private-endpoint',PRIVATE_KEY:key,DEPLOYMENT_OUTPUT:path.join(dir,'deployment.json'),DEPLOYMENT_JOURNAL:path.join(dir,'journal.jsonl')};
  assert.throws(()=>publicConfig({}),/RPC_URL is required/);
  assert.throws(()=>publicConfig({...base,PRIVATE_KEY:undefined}),/PRIVATE_KEY/);
  for(const key of PUBLIC_TEST_KEYS)assert.throws(()=>publicConfig({...base,PRIVATE_KEY:key}),/development keys/);
  assert.throws(()=>publicConfig({...base,RPC_URL:'http://example.invalid'}),/HTTPS/);
  assert.throws(()=>publicConfig({...base,MINT_RECIPIENT:'0x0000000000000000000000000000000000000001'}),/recipient/);
  assert.equal(publicConfig(base).recipient,MINT_RECIPIENT);
  fs.writeFileSync(base.DEPLOYMENT_JOURNAL,'existing');assert.throws(()=>publicConfig(base),/already exists/);
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});

test('a wrong public chain refuses before any transaction or dependency probe',async()=>{
 let calls=0;const c={chainId:1,rpc:async method=>{calls++;assert.equal(method,'eth_chainId');return '0x1';}};
 await assert.rejects(()=>deploymentPreflight({c,workbench:sample}),/Only Ethereum Sepolia/);assert.equal(calls,1);
});

test('public preflight rejects missing dependencies and insufficient funding without broadcasting',async()=>{
 const c=new RpcChain('https://example.invalid',Wallet.createRandom().privateKey,11155111);c.nonce=0n;
 let missing=true,balance=0n,writes=0;
 c.rpc=async(method,params=[])=>{
  if(method==='eth_chainId')return '0xaa36a7';
  if(method==='eth_getTransactionCount')return '0x0';
  if(method==='eth_getCode')return params[0].toLowerCase()===c.from.toString().toLowerCase()||missing?'0x':'0x6000';
  if(method==='eth_gasPrice')return '0x64';
  if(method==='eth_getBalance')return '0x'+balance.toString(16);
  writes++;throw Error('Unexpected write');
 };
 await assert.rejects(()=>deploymentPreflight({c,workbench:sample}),/dependency has no code/);
 missing=false;await assert.rejects(()=>deploymentPreflight({c,workbench:sample}),/Insufficient Sepolia funding/);
 balance=10n**24n;const budget=await deploymentPreflight({c,workbench:sample});
 assert.equal(budget.gasBudget,230003250n);assert.equal(budget.feeCeiling,201n);
 assert.equal(budget.requiredBalance,budget.gasBudget*201n+3n*10n**14n);assert.equal(writes,0);
});

test('a broadcast whose response is lost leaves its exact hash durable and is never retried',async()=>{
 const dir=temp(),c=new RpcChain('http://127.0.0.1:1',DEV_KEYS[0],31337);c.nonce=0n;let broadcasts=0,durableBeforeBroadcast=false;
 c.rpc=async(method,params=[])=>{
  if(method==='eth_chainId')return '0x7a69';
  if(method==='eth_getTransactionCount')return '0x0';
  if(method==='eth_getCode')return params[0].toLowerCase()===REGISTRY.toLowerCase()?'0x6000':'0x';
  if(method==='eth_getBalance')return '0x'+(10n**24n).toString(16);
  if(method==='eth_gasPrice')return '0x1';
  if(method==='eth_estimateGas')return '0x10000';
  if(method==='eth_getBlockByNumber')return {gasLimit:'0x1c9c380'};
  throw Error('Unexpected RPC '+method);
 };
 const output=path.join(dir,'record.json'),journal=path.join(dir,'journal.jsonl');
 try{
  await assert.rejects(()=>deploySepolia({c,A:()=>({bytecode:'0x60006000f3'}),artifacts:{},engineBuild:{mode:'packed',inflatedSize:1},workbench:sample,output,journal,localRehearsal:true,log:()=>{},broadcast:async(_url,signed)=>{
   broadcasts++;const before=fs.readFileSync(journal,'utf8').trim().split('\n').map(JSON.parse);
   assert.equal(before.at(-1).kind,'prepared');assert.equal(before.at(-1).transactionHash,keccak256(signed));
   durableBeforeBroadcast=true;
   throw Error('a provider response containing private credentials');
  }}),/RPC eth_sendRawTransaction failed/);
  assert.equal(broadcasts,1);assert.equal(durableBeforeBroadcast,true);const rows=fs.readFileSync(journal,'utf8').trim().split('\n').map(JSON.parse);
  const pending=rows.find(r=>r.kind==='prepared');assert.match(pending.transactionHash,/^0x[0-9a-f]{64}$/);assert.equal(pending.nonce,'0');
  assert.equal(rows.some(r=>r.kind==='receipt'),false);assert.equal(JSON.parse(fs.readFileSync(output)).status,'incomplete');
  assert.ok(!fs.readFileSync(journal,'utf8').includes(DEV_KEYS[0].slice(2)));
  assert.ok(!fs.readFileSync(output,'utf8').includes('private credentials'));
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});

test('the complete public deployment sequence mints exactly three directly to the recipient on a disposable local node',{timeout:1200000},async t=>{
 const dir=temp();let child;
 t.after(async()=>{if(child&&child.exitCode===null){const done=once(child,'exit');child.kill('SIGTERM');await done;}fs.rmSync(dir,{recursive:true,force:true});});
 const listener=net.createServer();listener.listen(0,'127.0.0.1');await once(listener,'listening');const port=listener.address().port;await new Promise(resolve=>listener.close(resolve));
 const fd=fs.openSync(path.join(dir,'node.log'),'a');child=spawn(process.execPath,['node_modules/hardhat/internal/cli/cli.js','node','--hostname','127.0.0.1','--port',String(port)],{cwd:ROOT,stdio:['ignore',fd,fd]});fs.closeSync(fd);
 const rpcUrl='http://127.0.0.1:'+port;let c;
 for(let attempt=0;attempt<100;attempt++){try{const response=await fetch(rpcUrl,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:1,method:'eth_chainId',params:[]})});if((await response.json()).result==='0x7a69'){c=await RpcChain.open(rpcUrl,DEV_KEYS[0]);break;}}catch{}await pause(100);}
 assert.ok(c,'local RPC started');
 execFileSync(process.execPath,['tools/build-engine.mjs'],{cwd:ROOT,stdio:'pipe'});
 const compiled=compile({quiet:true,dirs:['src','test/mocks']}),A=(file,name)=>artifact(compiled,file,name);
 await c.rpc('hardhat_setCode',[REGISTRY,A('test/mocks/ERC6551Registry.sol','ERC6551Registry').deployed]);
 const artifacts=loadModuleArtifacts(compiled),workbench=await buildWorkbench({output:null});
 const inputs={c,A,artifacts,workbench,engineBuild:JSON.parse(fs.readFileSync(path.join(ROOT,'dist/shards.json'))),output:path.join(dir,'record.json'),journal:path.join(dir,'journal.jsonl'),localRehearsal:true,log:()=>{}};
 const record=await deploySepolia(inputs);
 assert.equal(record.status,'verified');assert.equal(record.recipient,MINT_RECIPIENT);assert.equal(record.tokens.length,3);
 assert.deepEqual(record.tokens.map(t=>t.id),[1,2,3]);assert.equal(new Set(record.tokens.map(t=>t.seed)).size,3);
 assert.ok(record.tokens.every(t=>t.owner===MINT_RECIPIENT&&t.urls.modules.endsWith('/'+t.id+'/modules')));
 assert.equal(record.transactions.filter(r=>r.label.startsWith('mintTo:')).length,3);
 assert.ok(record.transactions.every(r=>BigInt(r.gasLimit)<=TX_GAS_CAP));
 assert.equal(decUint(await c.read(record.contracts.ipseity,'totalSupply()')),3n);
 assert.equal(decUint(await c.read(record.modules.cartridges,'nextId()')),1n,'No extra cartridge NFT was minted');
 assert.equal(decUint(await c.read(record.contracts.parley,'stateOf(uint256)',[0]),1),0n,'No demo message was posted');
 const file=fs.readFileSync(inputs.output,'utf8'),journal=fs.readFileSync(inputs.journal,'utf8');
 for(const secret of [DEV_KEYS[0],rpcUrl]){assert.ok(!file.includes(secret));assert.ok(!journal.includes(secret));}
 const nonce=await c.nonceNow();await assert.rejects(()=>deploySepolia(inputs),/already exists/);assert.equal(await c.nonceNow(),nonce);
 console.log('Sepolia runner local rehearsal: '+record.transactions.length+' transactions, '+record.gasUsed+' gas, exactly three recipient-owned tokens.');
});
