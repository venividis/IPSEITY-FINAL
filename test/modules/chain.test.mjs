import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {Interface,ZeroHash,getBytes,hexlify,keccak256,sha256,toUtf8Bytes} from 'ethers';
import {createModuleFixture} from '../../tools/modules-stack.mjs';
import {verifyModulePortal} from '../../tools/verify-module-portal.mjs';
import {DEV_KEYS} from '../../tools/rpc.mjs';
import {recoverWorkbench} from '../../tools/modules-recover-workbench.mjs';
import {readRegistry,recoverToken,recoverState,assertCurrentContext,encodeActivate,encodeDisable,encodeStageState,encodeWriteState} from '../../packages/modules/chain.mjs';
import {prepareJournal,decryptJournalPacket,IPSEITY_JOURNAL_MODULE_KEY,IPSEITY_JOURNAL_STATE_SCHEMA} from '../../web/modules/journal.mjs';

const root=path.resolve(import.meta.dirname,'../..'),run=promisify(execFile),CAP=1n<<24n;
const quantity=n=>'0x'+BigInt(n).toString(16),bytes=value=>Buffer.from(typeof value==='string'?value:JSON.stringify(value));
const lower=value=>String(value).toLowerCase();
const READS=new Set(['eth_chainId','eth_getBlockByNumber','eth_getCode','eth_call']);

// One complete original deployment serves every serial subtest. The wire, actual
// native Reach and original collection participate; there is no authority mock.
test('the native IPSEITY recovers its whole module history and publishes the maximum cartridge within the transaction cap',{timeout:1200000},async t=>{
 const f=await createModuleFixture({seed:true,site:true});t.after(()=>f.close());
 await t.test('the module portal preserves every original route and executes its actual verified gzip loader',async()=>{const report=await verifyModulePortal(f);assert.ok(report);});
 const registry=new Interface(f.artifacts.TokenModuleRegistry.abi),states=new Interface(f.artifacts.ModuleStateStore.abi);
 const cartridgeABI=new Interface(f.artifacts.ChunkedCartridgeRegistry.abi),reachABI=new Interface(['function execute(address,uint256,bytes,uint8) payable returns(bytes)']);
 const options={request:f.request,registry:f.modules.registry,tokenId:f.tokenId,chainId:f.chainId};
 const context=()=>readRegistry(options),expectedStates=new Map();
 const codeBefore=await Promise.all([f.hub,f.account].map(address=>f.c.rpc('eth_getCode',[address,'latest'])));
 const {shared,notebook,garden,notebookV2}=f.published;
 const act=async(recipe,label)=>f.c.send({to:recipe.to,data:recipe.data,value:BigInt(recipe.value),label});
 const stage=async(moduleKey,stateSchema,data,label)=>{
  const result=await act(encodeStageState(await context(),{moduleKey,stateSchema,bytes:data}),label);
  const receipt=await f.c.rpc('eth_getTransactionReceipt',[result.hash]);
  const event=receipt.logs.filter(log=>lower(log.address)===lower(f.modules.stateStore)).map(log=>states.parseLog(log)).find(event=>event?.name==='StateStaged');
  assert.ok(event,'The mined receipt names the immutable staged snapshot');
  expectedStates.set(event.args.stateId,Buffer.from(data));return event.args.stateId;
 };
 const activeHead=async key=>{
  const [entry]=registry.decodeFunctionResult('installation',await f.c.call(f.modules.registry,registry.encodeFunctionData('installation',[f.tokenId,key])));return entry.stateHead;
 };
 let notebookHead,gardenHead,orphanState,publicJournalState,encryptedJournalState,encryptedJournal,exported;
 const publicText='  A public thought kept exactly.\n',privateText='  Private resonance · λ\n',passphrase='a local rehearsal passphrase with no deployed funds';

 await t.test('staged and active state, upgrades, historical branches and journals remain independently recoverable',async()=>{
  const base={note:'first owner memory',position:{x:0.125,y:-0.75},volume:0.08,padding:''};
  base.padding='x'.repeat(32768-bytes(base).length);const maximum=bytes(base);assert.equal(maximum.length,32768);
  notebookHead=await stage(notebook.moduleKey,notebook.manifest.stateSchema,maximum,'notebook:first-32KiB');
  assert.equal((await context()).moduleCount,'0','staging alone does not activate a release');
  await act(encodeActivate(await context(),{releaseId:notebook.releaseId,nextStateHead:notebookHead}),'notebook:activate');
  gardenHead=await stage(garden.moduleKey,garden.manifest.stateSchema,bytes({dedication:'independent garden',volume:0.08}),'garden:stage');
  await act(encodeActivate(await context(),{releaseId:garden.releaseId,nextStateHead:gardenHead}),'garden:activate');
  const written=bytes({note:'the next page',position:{x:0.625,y:0.25}});
  await act(encodeWriteState(await context(),{moduleKey:notebook.moduleKey,bytes:written}),'notebook:write');
  const writtenHead=await activeHead(notebook.moduleKey);expectedStates.set(writtenHead,written);
  const incompatible=encodeActivate(await context(),{releaseId:notebookV2.releaseId,expectedStateHead:writtenHead,nextStateHead:writtenHead});
  await assert.rejects(()=>f.c.call(incompatible.to,incompatible.data),/revert|InvalidState|custom error/i);
  const migrated=await stage(notebook.moduleKey,notebookV2.manifest.stateSchema,bytes({note:'migrated page',version:2}),'notebook:migrate');
  await act(encodeActivate(await context(),{releaseId:notebookV2.releaseId,expectedStateHead:writtenHead,nextStateHead:migrated}),'notebook:activate-v2');
  const historical=await stage(notebook.moduleKey,notebook.manifest.stateSchema,maximum,'notebook:historical-branch');
  await act(encodeActivate(await context(),{releaseId:notebook.releaseId,expectedStateHead:migrated,nextStateHead:historical}),'notebook:return-v1');
  await act(encodeDisable(await context(),{moduleKey:notebook.moduleKey}),'notebook:disable');notebookHead=historical;
  assert.equal(await activeHead(garden.moduleKey),gardenHead,'another module keeps its own saved state');
  orphanState=await stage(sha256(toUtf8Bytes('never-activated module')),sha256(toUtf8Bytes('orphan state schema')),bytes({draft:'recover even without an installation receipt'}),'orphan:stage');
  const c=await context(),identity={chainId:c.chainId,registry:c.registry,collection:c.collection,tokenId:c.tokenId,account:c.account,owner:c.owner,epoch:c.epoch};
  const publicJournal=await prepareJournal({mode:'public',text:publicText});
  encryptedJournal=await prepareJournal({mode:'encrypted',text:privateText,passphrase,identity});
  publicJournalState=await stage(IPSEITY_JOURNAL_MODULE_KEY,IPSEITY_JOURNAL_STATE_SCHEMA,bytes(publicJournal.chainText),'journal:public');
  encryptedJournalState=await stage(IPSEITY_JOURNAL_MODULE_KEY,IPSEITY_JOURNAL_STATE_SCHEMA,bytes(encryptedJournal.chainText),'journal:encrypted');
  assert.equal(expectedStates.size,8);
  const reads=[];
  exported=await recoverToken({...options,request:async payload=>{assert.ok(READS.has(payload.method));reads.push(payload);return f.request(payload);}});
  assert.equal(exported.context.moduleCount,'2');assert.equal(exported.context.historyCount,'6');assert.equal(exported.context.stateModuleCount,'4');
  assert.equal(exported.context.modules.find(m=>m.moduleKey===notebook.moduleKey).enabled,false);
  assert.equal(exported.context.modules.find(m=>m.moduleKey===garden.moduleKey).enabled,true);
  assert.equal(exported.states.length,8);assert.ok(exported.states.some(s=>s.stateId===orphanState));
  assert.deepEqual(new Set(exported.packages.map(p=>p.releaseId)),new Set([shared.releaseId,notebook.releaseId,garden.releaseId,notebookV2.releaseId]));
  assert.equal(exported.packages.filter(p=>p.releaseId===shared.releaseId).length,1,'shared dependency is recovered once');
  for(const state of exported.states)assert.deepEqual(Buffer.from(state.bytes),expectedStates.get(state.stateId),state.stateId);
  for(const pkg of exported.packages){const original=[shared,notebook,garden,notebookV2].find(p=>p.releaseId===pkg.releaseId);assert.deepEqual(Buffer.from(pkg.archive),Buffer.from(original.archive));}
  const historicalRecord=exported.states.find(s=>s.stateId===historical).record;
  assert.equal(historicalRecord.parent,migrated);assert.equal(exported.states.find(s=>s.stateId===writtenHead).record.parent,exported.states[0].stateId);
  const decrypted=await decryptJournalPacket(Buffer.from(exported.states.find(s=>s.stateId===encryptedJournalState).bytes).toString(),passphrase,{expectedIdentity:identity});
  assert.equal(decrypted.text,privateText);assert.equal(Buffer.from(exported.states.find(s=>s.stateId===publicJournalState).bytes).toString(),publicText);
  assert.ok(reads.filter(r=>r.method==='eth_call'||r.method==='eth_getCode').every(r=>r.params[1]===exported.snapshot.block),'all recovery reads share one pinned block');
  await assert.rejects(()=>recoverToken({...options,maxRecords:7}),/record budget|history exceeds/);
  const wrongModule=sha256(toUtf8Bytes('another namespace'));
  await assert.rejects(()=>recoverState({request:f.request,stateStore:f.modules.stateStore,stateId:notebookHead,chainId:f.chainId,collection:f.hub,tokenId:f.tokenId,moduleKey:wrongModule}),/different module or NFT/);
  assert.deepEqual(await Promise.all([f.hub,f.account].map(address=>f.c.rpc('eth_getCode',[address,'latest']))),codeBefore);
 });

 await t.test('independent read-only CLIs recover the complete token and exact workbench without a signer or overwrites',async()=>{
  const seen=[],server=http.createServer(async(req,res)=>{
   try{let input='';for await(const part of req)input+=part;const payload=JSON.parse(input);assert.ok(READS.has(payload.method),'CLI requested a non-read method');seen.push(payload);const result=await f.request(payload);res.setHeader('Content-Type','application/json');res.end(JSON.stringify({jsonrpc:'2.0',id:payload.id,result}));}
   catch(error){res.statusCode=400;res.end(String(error.message));}
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  try{
   const url='http://127.0.0.1:'+server.address().port,output=path.join(f.run,'sdk-token-export'),workbenchOutput=path.join(f.run,'sdk-workbench-export');
   const nonce=await f.c.nonceNow(),block=exported.snapshot.block;
   const args=['tools/modules-recover.mjs','--rpc',url,'--chain','31337','--registry',f.modules.registry,'--token','1','--block',block,'--output',output];
   const cli=await run(process.execPath,args,{cwd:root,timeout:120000,maxBuffer:1024*1024});
   const result=JSON.parse(cli.stdout);assert.equal(result.stateCount,8);assert.equal(result.releaseCount,4);
   const receipt=JSON.parse(fs.readFileSync(path.join(output,'receipt.json')));assert.equal(receipt.root,exported.context.root);
   for(const [id,data] of expectedStates)assert.deepEqual(fs.readFileSync(path.join(output,'states',id+'.bin')),data);
   for(const pkg of exported.packages){assert.deepEqual(fs.readFileSync(path.join(output,'releases',pkg.releaseId,'archive.bin')),Buffer.from(pkg.archive));for(const file of pkg.files)assert.deepEqual(fs.readFileSync(path.join(output,'releases',pkg.releaseId,'files',file.path)),Buffer.from(file.bytes));}
   await assert.rejects(()=>run(process.execPath,args,{cwd:root,timeout:30000}),error=>{assert.match(error.stderr,/already exists/i);return true;});
   const workbenchArgs=['tools/modules-recover-workbench.mjs','--rpc',url,'--chain','31337','--workbench',f.workbench,'--token-id','1','--block',block,'--expect-sha256',sha256(f.rawDocument),'--output',workbenchOutput];
   await run(process.execPath,workbenchArgs,{cwd:root,timeout:120000,maxBuffer:1024*1024});
   assert.deepEqual(fs.readFileSync(path.join(workbenchOutput,'index.html')),Buffer.from(f.rawDocument));
   const recovered=JSON.parse(fs.readFileSync(path.join(workbenchOutput,'recovery.json')));assert.equal(recovered.tokenContext.root,exported.context.root);assert.equal(lower(recovered.services.collection),lower(f.hub));
   await assert.rejects(()=>recoverWorkbench({request:f.request,chainId:f.chainId,workbench:f.workbench,expectedHash:ZeroHash}),/content commitment mismatch/);
   assert.equal(await f.c.nonceNow(),nonce,'recovery consumed no nonce');
   assert.ok(seen.length>0&&seen.every(r=>READS.has(r.method)));
   assert.ok(seen.filter(r=>r.method==='eth_call'||r.method==='eth_getCode').every(r=>r.params[1]===block));
  }finally{await new Promise(resolve=>server.close(resolve));}
 });

 await t.test('transfer away and back retires the reviewed custody even when owner and catalog return unchanged',async()=>{
  const before=await context(),reviewed=encodeActivate(before,{releaseId:notebook.releaseId,expectedStateHead:notebookHead,nextStateHead:notebookHead});
  const bob=await f.c.as(DEV_KEYS[1]),other=bob.from.toString();
  await f.c.exec(f.hub,'transferFrom(address,address,uint256)',[f.owner,other,f.tokenId],{label:'custody:away'});
  await assert.rejects(()=>assertCurrentContext({...options,context:before}),/Stale review/);
  await assert.rejects(()=>bob.call(reviewed.to,reviewed.data),/revert|StaleReview|custom error/i);
  await bob.exec(f.hub,'transferFrom(address,address,uint256)',[other,f.owner,f.tokenId],{label:'custody:back'});
  const after=await context();assert.equal(after.owner,before.owner);assert.equal(after.account,before.account);assert.equal(after.root,before.root);assert.equal(BigInt(after.epoch),BigInt(before.epoch)+2n);
  await assert.rejects(()=>assertCurrentContext({...options,context:before}),/Stale review: epoch/);
  await assert.rejects(()=>f.c.call(reviewed.to,reviewed.data),/revert|StaleReview|custom error/i);
  await act(encodeActivate(after,{releaseId:notebook.releaseId,expectedStateHead:notebookHead,nextStateHead:notebookHead}),'custody:fresh-activation');
  const preserved=await recoverState({request:f.request,stateStore:f.modules.stateStore,stateId:encryptedJournalState,chainId:f.chainId,collection:f.hub,tokenId:f.tokenId,moduleKey:IPSEITY_JOURNAL_MODULE_KEY});
  assert.deepEqual(Buffer.from(preserved.bytes),expectedStates.get(encryptedJournalState));
  assert.equal((await decryptJournalPacket(Buffer.from(preserved.bytes).toString(),passphrase)).text,privateText,'ciphertext survives custody; its prior key remains explicitly required');
 });

 await t.test('64 distinct chunks, one MiB of content and a 16 KiB manifest publish with wallet headroom and recover under the read gas cap',async()=>{
  const data=Buffer.concat(Array.from({length:64},(_,i)=>Buffer.alloc(16384,i+1))),chunks=[];
  const chunkABI=new Interface(f.artifacts.AppChunk.abi);
  for(let i=0;i<64;i++)chunks.push(await f.c.deploy(f.artifacts.AppChunk.bytecode,chunkABI.encodeDeploy([hexlify(data.subarray(i*16384,(i+1)*16384))]).slice(2),'maximum-cartridge:chunk-'+i));
  assert.equal(new Set(chunks).size,64);
  const manifest='{"name":"'+'x'.repeat(16373)+'"}',hash=sha256(data);assert.equal(Buffer.byteLength(manifest),16384);
  const [releaseId]=cartridgeABI.decodeFunctionResult('nextReleaseId',await f.c.call(f.modules.cartridges,cartridgeABI.encodeFunctionData('nextReleaseId')));
  const tx={from:f.owner,to:f.modules.cartridges,data:cartridgeABI.encodeFunctionData('publishRelease',[manifest,chunks,hash]),value:'0x0',chainId:quantity(f.chainId)};
  assert.equal(f.chainId,31337,'only the disposable fixture can submit this capped transaction');
  const estimate=BigInt(await f.c.rpc('eth_estimateGas',[tx])),gas=(estimate*120n+99n)/100n;assert.ok(gas<=CAP,'estimated publication with 20% wallet headroom exceeds the transaction gas cap');
  const transactionHash=await f.c.rpc('eth_sendTransaction',[{...tx,gas:quantity(gas),nonce:quantity(await f.c.nonceNow())}]);
  const receipt=await f.c.rpc('eth_getTransactionReceipt',[transactionHash]);assert.equal(receipt.status,'0x1');
  const mined=await f.c.rpc('eth_getTransactionByHash',[transactionHash]);assert.equal(BigInt(mined.gas),gas);assert.ok(BigInt(receipt.gasUsed)<CAP);
  const [release]=cartridgeABI.decodeFunctionResult('releaseOf',await f.c.call(f.modules.cartridges,cartridgeABI.encodeFunctionData('releaseOf',[releaseId])));
  assert.equal(release.manifestJSON,manifest);assert.equal(release.byteLength,1048576n);assert.equal(release.contentHash,hash);
  assert.deepEqual([...release.chunks].map(lower),chunks.map(lower));assert.deepEqual([...release.chunkByteLengths],Array(64).fill(16384n));
  for(let i=0;i<64;i++)assert.equal(release.chunkCodeHashes[i],keccak256('0x00'+data.subarray(i*16384,(i+1)*16384).toString('hex')));
  const [id]=cartridgeABI.decodeFunctionResult('nextId',await f.c.call(f.modules.cartridges,cartridgeABI.encodeFunctionData('nextId')));
  await f.c.send({to:f.account,data:reachABI.encodeFunctionData('execute',[f.modules.cartridges,0,cartridgeABI.encodeFunctionData('acquire',[releaseId]),0]),label:'maximum-cartridge:acquire'});
  // A separate JSON-RPC eth_call starts with cold access lists. Supplying the
  // same 10M limit as the SDK also includes the call's intrinsic gas allowance.
  const raw=await f.c.rpc('eth_call',[{to:f.modules.cartridges,data:cartridgeABI.encodeFunctionData('contentOf',[id]),gas:quantity(10000000)},'latest']);
  const [content]=cartridgeABI.decodeFunctionResult('contentOf',raw);assert.deepEqual(Buffer.from(getBytes(content)),data);
  const [launch]=cartridgeABI.decodeFunctionResult('launchManifest',await f.c.call(f.modules.cartridges,cartridgeABI.encodeFunctionData('launchManifest',[id,f.owner])));
  assert.equal(launch.authorized,true);assert.equal(launch.parentArtifactId,f.tokenId);assert.equal(launch.manifestJSON,manifest);
  t.diagnostic(JSON.stringify({scope:'disposable Hardhat Cancun chain',payloadBytes:data.length,manifestBytes:Buffer.byteLength(manifest),distinctChunks:64,estimate:String(estimate),reviewedGasLimit:String(gas),receiptGasUsed:String(BigInt(receipt.gasUsed)),transactionCap:String(CAP),coldReadGasLimit:10000000}));
 });
});
