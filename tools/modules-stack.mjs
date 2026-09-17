/** Disposable local rehearsal: the complete original IPSEITY plus immutable companions.
 * No URL or private-key input is accepted. Every signed transaction goes to a child
 * Hardhat node bound to loopback, with the public development key on chain 31337.
 */
import fs from 'node:fs';
import path from 'node:path';
import net from 'node:net';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {randomUUID} from 'node:crypto';
import {ContractFactory,Interface,keccak256} from 'ethers';
import {compile,artifact} from './compile.mjs';
import {RpcChain,DEV_KEYS} from './rpc.mjs';
import {decAddr,decUint} from './evm.mjs';
import {encRequest,decResponse} from './site.mjs';
import {buildWorkbench} from './modules-build-workbench.mjs';
import {loadModuleArtifacts,readWorkbenchBuild,planModuleDeployment} from './modules-deployment.mjs';
import {planArchiveDeployment,preparePublishRecipe} from '../packages/modules/deployment.mjs';
import {packageFiles,sha256} from '../packages/modules/sdk.mjs';
import {examplePackage,sharedScorePackage} from '../web/modules/examples.mjs';

const ROOT=path.resolve(import.meta.dirname,'..');
const CAP=1n<<24n;
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const json=value=>JSON.stringify(value,(_k,v)=>typeof v==='bigint'?v.toString():v,2)+'\n';
const eq=(got,want,label)=>{if(String(got).toLowerCase()!==String(want).toLowerCase())throw Error(label+': '+got+' != '+want);};
const quantity=n=>'0x'+BigInt(n).toString(16);

async function availablePort(){const server=net.createServer();server.listen(0,'127.0.0.1');await once(server,'listening');const port=server.address().port;await new Promise((resolve,reject)=>server.close(e=>e?reject(e):resolve()));return port;}
function child(args,env,log,children){
 const fd=fs.openSync(log,'a');const p=spawn(process.execPath,args,{cwd:ROOT,env:{...process.env,...env},stdio:['ignore',fd,fd]});fs.closeSync(fd);children.add(p);
 p.once('exit',()=>children.delete(p));return p;
}
async function completed(p,log){
 const [code,signal]=await once(p,'exit');
 if(code!==0)throw Error('Local fixture subprocess failed ('+(signal??code)+'): '+log+'\n'+fs.readFileSync(log,'utf8').slice(-9000));
}
async function waitFor(probe,p,log,timeout=60000){
 const start=Date.now();let last;
 while(Date.now()-start<timeout){
  if(p.exitCode!==null||p.signalCode)throw Error('Local service exited: '+fs.readFileSync(log,'utf8').slice(-4000));
  try{if(await probe())return;}catch(e){last=e;}await pause(100);
 }
 throw Error('Local service did not become ready: '+log+' '+(last?.message??''));
}
async function originalRecord(run,env,children){
 const lock=path.join(ROOT,'out/modules-original-deployment.lock');fs.mkdirSync(path.dirname(lock),{recursive:true});
 const start=Date.now(),owner=randomUUID();
 for(;;){
  try{fs.mkdirSync(lock);fs.writeFileSync(path.join(lock,'owner'),owner);break;}
  catch(e){if(e.code!=='EEXIST')throw e;if(Date.now()-start>1200000)throw Error('Another local original deployment still owns '+lock);await pause(250);}
 }
 const unlock=()=>{try{if(fs.readFileSync(path.join(lock,'owner'),'utf8')===owner)fs.rmSync(lock,{recursive:true,force:true});}catch{}};
 process.once('exit',unlock);
 try{
  const buildLog=path.join(run,'original-build.log');await completed(child(['tools/build-engine.mjs'],env,buildLog,children),buildLog);
  const log=path.join(run,'original-deployment.log');await completed(child(['tools/testnet.mjs'],env,log,children),log);
  const record=JSON.parse(fs.readFileSync(path.join(ROOT,'dist/testnet.json'),'utf8'));
  eq(record.rpc,env.RPC_URL,'Original record must belong to this child node');eq(record.chainId,31337,'Local chain');
  fs.writeFileSync(path.join(run,'original-record.json'),json(record));return record;
 }finally{process.removeListener('exit',unlock);unlock();}
}

/** Execute the exact prepared steps; all companion receipts and gas limits are checked. */
async function executeSteps(f,steps){
 for(const step of steps){
  eq(await f.c.nonceNow(),step.nonce,'Deployment nonce');
  if(step.from)eq(step.from,f.owner,'Deployment sender');
  if(step.chainId)eq(step.chainId,31337,'Deployment chain');
  if(step.dataHash)eq(keccak256(step.data),step.dataHash,'Prepared calldata hash');
  if(step.expectedAddress&&await f.c.codeSize(step.expectedAddress))throw Error('Planned address already has code: '+step.expectedAddress);
  const result=await f.c.send({to:step.to??undefined,data:step.data,value:BigInt(step.value??0),label:step.id});
  const receipt=await f.c.rpc('eth_getTransactionReceipt',[result.hash]);
  eq(receipt.status,'0x1','Deployment receipt');
  if(step.to===null)eq(receipt.contractAddress,step.expectedAddress,'Created address');
  let runtimeCodeHash;
  if(step.expectedAddress){
   const code=await f.c.rpc('eth_getCode',[step.expectedAddress,'latest']);if(code==='0x')throw Error('Expected deployment is missing');
   if((code.length-2)/2>24576)throw Error('Deployed runtime exceeds EIP-170');
   runtimeCodeHash=keccak256(code);
   if(step.contract==='ModuleArchiveFactory')eq(runtimeCodeHash,keccak256(f.artifacts.ModuleArchiveFactory.deployedBytecode),'Factory runtime hash');
   if(step.expectedCodeHash)eq(keccak256(code),step.expectedCodeHash,'Deployed chunk code hash');
   if(step.archiveHash){eq(await f.c.read(step.expectedAddress,'contentSha256()'),step.archiveHash,'Archive SHA-256');eq(decUint(await f.c.read(step.expectedAddress,'byteLength()')),step.archiveBytes,'Archive length');eq(await f.c.read(step.to,'archiveCodeHash(address)',[step.expectedAddress]),runtimeCodeHash,'Factory pins the actual archive runtime');}
  }
  f.receipts.push({step:step.id,...result,runtimeCodeHash});
 }
}

export async function deployArchive(f,bytes){
 const data=Buffer.from(bytes),digest=sha256(data);
 const previous=f.archives.get(digest);if(previous)return {...previous,deployedChunkCount:0};
 const factory=f.modules.archiveFactory;
 const plan=await planArchiveDeployment({archive:data,publisher:f.owner,chainId:31337,startNonce:Number(await f.c.nonceNow()),factory,
  factoryNonce:Number(BigInt(await f.c.rpc('eth_getTransactionCount',[factory,'latest']))),appChunkArtifact:f.artifacts.AppChunk,existingChunks:Object.fromEntries(f.chunks)});
 await executeSteps(f,plan.steps);
 const chunks=plan.chunkReferences.map(digest=>plan.chunks.find(chunk=>chunk.hash===digest).address);
 for(const chunk of plan.chunks)f.chunks.set(chunk.hash,chunk.address);
 const result={...plan,chunks,archive:plan.archiveAddress,codeHash:keccak256(await f.c.rpc('eth_getCode',[plan.archiveAddress,'latest'])),deployedChunkCount:plan.steps.filter(s=>s.kind==='chunk').length};
 f.archives.set(digest,result);return result;
}

export async function publishPackage(f,pkg){
 const archive=await deployArchive(f,pkg.archive);
 const recipe=await preparePublishRecipe({request:f.request,chainId:31337,registry:f.modules.releases,manifest:pkg.manifest,archiveAddress:archive.archiveAddress,archiveSchema:archive.archiveSchema});
 await f.c.send({to:recipe.to,data:recipe.data,value:0n,label:'publish:'+pkg.manifest.name+':'+pkg.manifest.version});
 const abi=new Interface(f.artifacts.ExtensionReleaseRegistry.abi);
 const [exists]=abi.decodeFunctionResult('exists',await f.c.call(f.modules.releases,abi.encodeFunctionData('exists',[recipe.releaseId])));
 if(!exists)throw Error('Published release missing');
 return {...pkg,...recipe,id:recipe.releaseId,local:false,archiveAddress:archive.archiveAddress,deployedChunkCount:archive.deployedChunkCount,descriptor:recipe.descriptor};
}

async function seedExamples(f){
 const shared=await publishPackage(f,await sharedScorePackage({publisher:f.owner}));
 const notebook=await publishPackage(f,await examplePackage('aurora-notebook',{publisher:f.owner,sharedReleaseId:shared.releaseId}));
 const garden=await publishPackage(f,await examplePackage('resonant-garden',{publisher:f.owner,sharedReleaseId:shared.releaseId}));
 const v2=await packageFiles(notebook.files,{...notebook.manifest,version:2,predecessor:notebook.releaseId,stateSchema:sha256('ipseity.notebook/v2')},{compression:'raw'});
 const notebookV2=await publishPackage(f,v2);
 const cartridges=[],game=fs.readFileSync(path.join(ROOT,'test/fixtures/modules/lumen-drift.html'),'utf8');
 const cartridge=new Interface(f.artifacts.ChunkedCartridgeRegistry.abi),account=new Interface(['function execute(address,uint256,bytes,uint8) payable returns(bytes)']);
 for(const bytes of [49152,1048576]){
  const html=game+'<!--'+' '.repeat(bytes-Buffer.byteLength(game)-7)+'-->',data=Buffer.from(html),hash=sha256(data);
  const archive=await deployArchive(f,data),manifest={spec:'awe.cartridge/1',name:'Lumen Drift · '+(bytes===49152?'48 KiB':'1 MiB'),version:String(cartridges.length+1),engine:'html',entry:'onchain',contentHash:hash,capabilities:[]};
  const releaseId=decUint(await f.c.read(f.modules.cartridges,'nextReleaseId()'));
  await f.c.send({to:f.modules.cartridges,data:cartridge.encodeFunctionData('publishRelease',[JSON.stringify(manifest),archive.chunks,hash]),label:'cartridge:'+bytes});
  const id=decUint(await f.c.read(f.modules.cartridges,'nextId()'));
  await f.c.send({to:f.account,data:account.encodeFunctionData('execute',[f.modules.cartridges,0,cartridge.encodeFunctionData('acquire',[releaseId]),0]),label:'acquire:'+id});
  const [recovered]=cartridge.decodeFunctionResult('contentOf',await f.c.call(f.modules.cartridges,cartridge.encodeFunctionData('contentOf',[id])));
  eq(sha256(Buffer.from(recovered.slice(2),'hex')),hash,'Legacy cartridge recovered hash');
  cartridges.push({id:id.toString(),tokenId:id.toString(),releaseId:releaseId.toString(),bytes,hash,sha256:hash,html,manifest,archiveAddress:archive.archiveAddress});
 }
 f.published={shared,notebook,garden,notebookV2,cartridges};
}

export async function createModuleFixture({site=true,seed=false,gateway=false}={}){
 if(site!==true)throw Error('The module rehearsal always deploys the complete original site');
 fs.mkdirSync(path.join(ROOT,'out/modules-local'),{recursive:true});
 const run=fs.mkdtempSync(path.join(ROOT,'out/modules-local/run-')),children=new Set();
 let closed=false;
 const exit=()=>{for(const p of children)p.kill('SIGTERM');};
 process.once('exit',exit);
 const close=async()=>{if(closed)return;closed=true;process.removeListener('exit',exit);const active=[...children];for(const p of active)p.kill('SIGTERM');await Promise.all(active.map(p=>new Promise(resolve=>{if(p.exitCode!==null||p.signalCode)return resolve();const timer=setTimeout(()=>{p.kill('SIGKILL');resolve();},3000);p.once('exit',()=>{clearTimeout(timer);resolve();});})));};
 try{
  console.log('Module rehearsal: starting a disposable loopback chain.');
  const rpcPort=await availablePort(),rpcUrl='http://127.0.0.1:'+rpcPort,nodeLog=path.join(run,'hardhat.log');
  const node=child(['node_modules/hardhat/internal/cli/cli.js','node','--hostname','127.0.0.1','--port',String(rpcPort)],{},nodeLog,children);
  await waitFor(async()=>{const r=await fetch(rpcUrl,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:1,method:'eth_chainId',params:[]})});const j=await r.json();return j.result==='0x7a69';},node,nodeLog);
  const env={RPC_URL:rpcUrl,PRIVATE_KEY:DEV_KEYS[0],DEPLOYMENT_JOURNAL:path.join(run,'original-receipts.jsonl')};
  console.log('Module rehearsal: deploying and verifying the complete original instrument, site and conversation.');
  const original=await originalRecord(run,env,children);
  const c=await RpcChain.open(rpcUrl,DEV_KEYS[0]);eq(c.chainId,31337,'Fixture chain');
  const owner=c.from.toString().toLowerCase();
  // This automining local node is also used by an injected browser wallet.
  // Its unlocked transactions must be visible to later publishing helpers.
  c.nonceNow=async()=>{c.nonce=BigInt(await c.rpc('eth_getTransactionCount',[owner,'pending']));return c.nonce;};
  const uncappedSend=c.send.bind(c);
  c.send=async function(args={}){
   eq(this.chainId,31337,'Local signing guard');
   await this.nonceNow();
   const estimate=BigInt(await this.rpc('eth_estimateGas',[{from:owner,to:args.to??undefined,data:args.data??'0x',value:quantity(args.value??0)}]));
   if(estimate*13n/10n>CAP)throw Error('Companion transaction with 30% gas headroom exceeds 2^24: '+args.label+' '+estimate);
   const result=await uncappedSend(args),tx=await this.rpc('eth_getTransactionByHash',[result.hash]);
   if(BigInt(tx.gas)>CAP)throw Error('Submitted companion transaction exceeded gas cap');return result;
  };
  c.setJournal(path.join(run,'module-receipts.jsonl'));
  console.log('Module rehearsal: compiling the current companion graph and rebuilding its browser document.');
  const output=compile({quiet:true,dirs:['src','test/mocks']}),A=(file,name)=>artifact(output,file,name);
  const artifacts=loadModuleArtifacts(output);await buildWorkbench();
  const built=readWorkbenchBuild(path.join(ROOT,'dist/modules/manifest.json'));
  const f={c,A,artifacts,owner,chainId:31337,rpcUrl,run,original,hub:original.contracts.ipseity,collection:original.contracts.ipseity,premises:original.contracts.premises,
   account:decAddr(await c.read(original.contracts.ipseity,'account(uint256)',[1])),tokenId:1n,rawDocument:built.bytes,request:({method,params=[]})=>c.rpc(method,params),
   modules:{},published:{},receipts:[],chunks:new Map(),archives:new Map(),close};
  if(await c.codeSize(f.account)===0)await c.exec(f.hub,'embody(uint256)',[1]);
  f.originalInstrument=decResponse(await c.call(f.premises,encRequest(['token','1','live']))).body;
  f.originalEngineSource=fs.readFileSync(path.join(ROOT,'engine/ipseity.html'));
  console.log('Module rehearsal: deploying the verified raw workbench, packed reader and companions.');
  const plan=await planModuleDeployment({chainId:31337,deployer:owner,startingNonce:Number(await c.nonceNow()),collection:f.hub,premises:f.premises},{artifacts,workbench:built});
  fs.writeFileSync(path.join(run,'module-plan.json'),json(plan));
  await executeSteps(f,plan.steps);
  f.modules={archiveFactory:plan.modules.ModuleArchiveFactory,releases:plan.modules.ExtensionReleaseRegistry,registry:plan.modules.TokenModuleRegistry,stateStore:plan.modules.ModuleStateStore,
   workbench:plan.modules.ModuleWorkbench,cartridges:plan.modules.ChunkedCartridgeRegistry,portal:plan.modules.ModulePortal};
  f.portal=f.modules.portal;f.workbench=f.modules.workbench;f.plan=plan;
  for(const p of [plan.archive,plan.packedArchive])for(const ch of p.chunks)f.chunks.set(ch.hash,ch.address);
  if(seed){console.log('Module rehearsal: publishing shared examples and acquiring both legacy games.');await seedExamples(f);}
  const record={...original,contracts:{...original.contracts,premises:f.portal,originalPremises:f.premises,...f.modules},modules:f.modules,
   urls:{...original.urls,modules:`web3://${f.portal}:31337/token/1/modules`}};
  f.recordPath=path.join(run,'module-record.json');fs.writeFileSync(f.recordPath,json(record));
  fs.writeFileSync(path.join(run,'module-receipts.json'),json(f.receipts));
  if(gateway){
   const port=await availablePort(),log=path.join(run,'gateway.log');f.url='http://127.0.0.1:'+port;f.modulesUrl=f.url+'/token/1/modules';
   const p=child(['tools/gateway.mjs','--record',f.recordPath,'--host','127.0.0.1','--port',String(port)],{},log,children);
   await waitFor(async()=>{const r=await fetch(f.url+'/modules/services.json');return r.ok&&(await r.json()).portal.toLowerCase()===f.portal.toLowerCase();},p,log);
  }
  console.log('Module rehearsal ready: '+(f.modulesUrl??f.portal));return f;
 }catch(error){await close();throw error;}
}
