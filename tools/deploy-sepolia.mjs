#!/usr/bin/env node
/** Explicit public deployment, separate from the demo/fixture runners.
 * No fallback signer, demo messages, cartridge mints, or historical-record writes.
 * A stopped run must be reconciled from its journal; this tool never resumes it.
 */
import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {Wallet,HDNodeWallet,Interface,hexlify,keccak256,sha256,getCreateAddress,getAddress} from 'ethers';
import {compile,artifact} from './compile.mjs';
import {RpcChain,DEV_KEYS} from './rpc.mjs';
import {decAddr,decUint,decBool,decString,encodeAddressArg} from './evm.mjs';
import {deploySite,UNISWAP,NO_VENUE,bandArgs,EXPECTED,encRequest,decResponse} from './site.mjs';
import {buildWorkbench} from './modules-build-workbench.mjs';
import {loadModuleArtifacts,planModuleDeployment} from './modules-deployment.mjs';
import {recoverWorkbench} from './modules-recover-workbench.mjs';

const ROOT=path.resolve(import.meta.dirname,'..');
export const SEPOLIA_CHAIN_ID=11155111;
export const MINT_RECIPIENT='0xb88Fbf05268802100E5E55ADBa211d6453aF8b5b';
export const REGISTRY='0x000000006551c19487814612e58FE06813775758';
export const TX_GAS_CAP=1n<<24n;
const PRICE=10n**14n,OPEN_FEE=10n**13n;
// These keys are public test fixtures, including all twenty default Hardhat
// accounts and the in-process harness signer. None may fund a public run.
export const PUBLIC_TEST_KEYS=new Set([...DEV_KEYS,'0x'+'11'.repeat(32),...Array.from({length:20},(_,i)=>HDNodeWallet.fromPhrase('test test test test test test test test test test test junk',undefined,"m/44'/60'/0'/0/"+i).privateKey)].map(key=>key.toLowerCase()));
const json=value=>JSON.stringify(value,(_key,v)=>typeof v==='bigint'?v.toString():v,2)+'\n';
const quantity=value=>'0x'+BigInt(value).toString(16);
const word=value=>BigInt(value).toString(16).padStart(64,'0');
const lower=value=>String(value).toLowerCase();
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
export class DeploymentError extends Error {}
const check=(condition,message)=>{if(!condition)throw new DeploymentError(message);};
const eq=(actual,expected,message)=>check(lower(actual)===lower(expected),message);

export function publicConfig(env=process.env){
 check(typeof env.RPC_URL==='string'&&env.RPC_URL.length>0,'RPC_URL is required.');
 let url;try{url=new URL(env.RPC_URL);}catch{throw new DeploymentError('RPC_URL must be an HTTPS endpoint.');}
 check(url.protocol==='https:'&&!url.hash,'RPC_URL must be an HTTPS endpoint.');
 check(typeof env.PRIVATE_KEY==='string'&&/^(?:0x)?[0-9a-fA-F]{64}$/.test(env.PRIVATE_KEY),'PRIVATE_KEY must be configured securely.');
 const key='0x'+env.PRIVATE_KEY.replace(/^0x/,'').toLowerCase();
 check(!PUBLIC_TEST_KEYS.has(key),'Public development keys are forbidden.');
 try{new Wallet(key);}catch{throw new DeploymentError('PRIVATE_KEY is not a valid signing key.');}
 eq(env.MINT_RECIPIENT??MINT_RECIPIENT,MINT_RECIPIENT,'MINT_RECIPIENT differs from the authorized recipient.');
 const output=path.resolve(env.DEPLOYMENT_OUTPUT||path.join(ROOT,'out/sepolia-deployment.json'));
 const journal=path.resolve(env.DEPLOYMENT_JOURNAL||path.join(ROOT,'out/sepolia-deployment.jsonl'));
 check(output!==journal,'Output and journal must be different files.');
 check(!fs.existsSync(output)&&!fs.existsSync(journal),'Output or journal already exists. Reconcile that run before a new deployment.');
 return {rpcUrl:env.RPC_URL,key,output,journal,recipient:MINT_RECIPIENT};
}

/** The only test bypass is both an explicit localRehearsal flag and chain 31337.
 * Its caller must supply a loopback RpcChain; the public CLI exposes no bypass.
 */
export async function deploymentPreflight({c,workbench,localRehearsal=false}){
 const chainId=Number(await c.rpc('eth_chainId'));
 eq(chainId,c.chainId,'RPC chain changed.');
 check(chainId===SEPOLIA_CHAIN_ID||(localRehearsal&&chainId===31337),'Only Ethereum Sepolia is authorized.');
 if(localRehearsal){
  let url;try{url=new URL(c.url);}catch{throw new DeploymentError('Local rehearsal requires loopback RPC.');}
  check(chainId===31337&&['localhost','127.0.0.1','[::1]'].includes(url.hostname),'Local rehearsal requires chain 31337 on loopback.');
 }else{
  const key=hexlify(c.key).toLowerCase();
  check(!PUBLIC_TEST_KEYS.has(key),'Public development keys are forbidden.');
 }
 const deployer=getAddress(c.from.toString());
 check(await c.codeSize(deployer)===0,'Deployment requires an externally owned signing account.');
 const nonce=BigInt(await c.rpc('eth_getTransactionCount',[deployer,'pending']));
 eq(nonce,await c.nonceNow(),'Signer nonce changed before deployment.');
 eq(await c.rpc('eth_getTransactionCount',[deployer,'latest']),quantity(nonce),'Signer has pending transactions; reconcile them first.');
 const uniswap=localRehearsal?NO_VENUE:UNISWAP[SEPOLIA_CHAIN_ID];
 const dependencies={erc6551:REGISTRY,...Object.fromEntries(Object.entries(uniswap).filter(([,v])=>typeof v==='string'&&/^0x[0-9a-fA-F]{40}$/.test(v)&&BigInt(v)!==0n))};
 for(const [name,address] of Object.entries(dependencies))check(await c.codeSize(address)>0,'Required dependency has no code: '+name+'.');
 const initialGasPrice=BigInt(await c.rpc('eth_gasPrice'));
 const feeCeiling=initialGasPrice*2n+1n;
 // 180M covers the measured original deployment. Data deposition, calldata,
 // readers and companion contracts get a separate conservative allowance.
 const gasBudget=180000000n+BigInt(workbench.bytes.length+workbench.packed.length)*250n+50000000n;
 const requiredBalance=gasBudget*feeCeiling;
 const balance=await c.balanceOf(deployer);
 check(balance>=requiredBalance,'Insufficient Sepolia funding: required '+requiredBalance+' wei; available '+balance+' wei.');
 return {chainId,deployer,startingNonce:nonce,uniswap,dependencies,gasBudget,feeCeiling,requiredBalance};
}

/** Execute only current compiled artifacts and supplied reproducible build inputs.
 * Production main builds these itself; the local rehearsal injects the same inputs.
 */
export async function broadcastOnce(rpcUrl,signed){
 // Read RPCs may retry transient errors. A write has a different uncertainty:
 // once the request leaves this process, only its hash can settle the outcome.
 let request=fetch,dispatcher;
 try{
  const url=new URL(rpcUrl),proxy=process.env.HTTPS_PROXY||process.env.https_proxy||process.env.HTTP_PROXY||process.env.http_proxy;
  if(proxy&&!['localhost','127.0.0.1','[::1]'].includes(url.hostname)){
   const {fetch:proxyFetch,ProxyAgent}=await import('undici');
   const caPath=process.env.NODE_EXTRA_CA_CERTS||'/root/.ccr/ca-bundle.crt';
   dispatcher=new ProxyAgent({uri:proxy,...(fs.existsSync(caPath)?{requestTls:{ca:fs.readFileSync(caPath)}}:{})});
   request=(url,options)=>proxyFetch(url,{...options,dispatcher});
  }
  const response=await request(rpcUrl,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:1,method:'eth_sendRawTransaction',params:[signed]}),redirect:'error',signal:AbortSignal.timeout(60000)});
  check(response.ok,'Broadcast endpoint did not confirm receipt. Reconcile the journal hash.');
  const result=await response.json();check(result.jsonrpc==='2.0'&&result.id===1&&!result.error&&/^0x[0-9a-fA-F]{64}$/.test(result.result),'Broadcast endpoint did not confirm the hash. Reconcile the journal hash.');
  return result.result;
 }catch{throw new DeploymentError('RPC eth_sendRawTransaction failed. Reconcile the journal hash before any further broadcast.');}
 finally{if(dispatcher)await dispatcher.close();}
}

export async function deploySepolia({c,A,artifacts,engineBuild,workbench,output,journal,recipient=MINT_RECIPIENT,localRehearsal=false,log=console.log,broadcast=broadcastOnce}){
 eq(recipient,MINT_RECIPIENT,'The authorized mint recipient cannot be changed.');
 output=path.resolve(output);journal=path.resolve(journal);
 check(output!==journal&&!fs.existsSync(output)&&!fs.existsSync(journal),'Output or journal already exists. Reconcile that run before a new deployment.');
 check(engineBuild?.mode==='packed'&&engineBuild.inflatedSize>0,'A current packed engine build is required.');
 check(workbench.bytes.length===workbench.manifest.byteLength&&sha256(workbench.bytes)===workbench.manifest.sha256,'Workbench source commitment differs.');
 const preflight=await deploymentPreflight({c,workbench,localRehearsal});
 check(localRehearsal||broadcast===broadcastOnce,'Public deployment cannot replace its broadcast transport.');
 const {chainId,deployer,feeCeiling}=preflight;
 const wallet=new Wallet(hexlify(c.key));eq(wallet.address,deployer,'Signer identity mismatch.');
 fs.mkdirSync(path.dirname(output),{recursive:true});fs.mkdirSync(path.dirname(journal),{recursive:true});
 // Exclusive files are a deliberate barrier against accidentally minting again.
 const outputFd=fs.openSync(output,'wx',0o600);let journalFd;
 try{journalFd=fs.openSync(journal,'wx',0o600);}catch(error){fs.closeSync(outputFd);throw error;}
 const append=entry=>{fs.writeSync(journalFd,JSON.stringify(entry,(_k,v)=>typeof v==='bigint'?v.toString():v)+'\n');fs.fsyncSync(journalFd);};
 const record={schema:'ipseity.sepolia-deployment/1',status:'in-progress',chainId,deployer,recipient,mintCount:3,startedAt:new Date().toISOString(),contracts:{},modules:{},tokens:[],transactions:[],budget:{gas:preflight.gasBudget,feeCeiling,requiredBalance:preflight.requiredBalance},dependencies:preflight.dependencies};
 const save=()=>{const content=json(record);fs.ftruncateSync(outputFd,0);fs.writeSync(outputFd,content,0,'utf8');fs.fsyncSync(outputFd);};
 save();append({kind:'session',chainId,deployer,recipient,mintCount:3,startingNonce:preflight.startingNonce,startedAt:record.startedAt});
 const originalSend=c.send,originalRpc=c.rpc;
 c.rpc=async function(method,params=[]){try{return await originalRpc.call(this,method,params);}catch{throw new DeploymentError('RPC '+method+' failed. Reconcile the journal before retrying.');}};
 let totalGas=0n;
 c.send=async function({to,data='0x',value=0n,label='transaction'}={}){
  const nonce=await c.nonceNow();
  eq(Number(await c.rpc('eth_chainId')),chainId,'RPC chain changed.');
  eq(BigInt(await c.rpc('eth_getTransactionCount',[deployer,'pending'])),nonce,'Signer nonce changed; another process may be using this key.');
  const gasPrice=BigInt(await c.rpc('eth_gasPrice'))*15n/10n+1n;
  check(gasPrice<=feeCeiling,'Gas price exceeded the preflight ceiling. Reconcile the journal before restarting.');
  const estimate=BigInt(await c.rpc('eth_estimateGas',[{from:deployer,...(to?{to}:{}),data,value:quantity(value)}]));
  const gasLimit=(estimate*130n+99n)/100n;
  const block=await c.rpc('eth_getBlockByNumber',['latest',false]);
  check(gasLimit<=TX_GAS_CAP&&gasLimit<=BigInt(block.gasLimit),'Transaction exceeds the gas cap: '+label+'.');
  check(totalGas+gasLimit<=preflight.gasBudget,'Deployment exceeds its preflight gas budget.');
  check(await c.balanceOf(deployer)>=gasLimit*gasPrice+BigInt(value),'Insufficient balance for the next transaction.');
  if(!to)check((data.length-2)/2<=49152,'Creation exceeds the initcode size bound.');
  const signed=await wallet.signTransaction({type:0,chainId,nonce:Number(nonce),gasPrice,gasLimit,to:to||undefined,data,value:BigInt(value)});
  const hash=keccak256(signed),expectedAddress=to?null:getCreateAddress({from:deployer,nonce});
  if(expectedAddress)check(await c.codeSize(expectedAddress)===0,'Expected creation address is already occupied.');
  append({kind:'prepared',label,nonce,transactionHash:hash,to:to??null,expectedAddress,dataHash:keccak256(data),value,gasLimit,gasPrice});
  // The locally computed hash is durable even if broadcast succeeds but the
  // connection dies before the RPC response. Never retry this run blindly.
  let returnedHash;try{returnedHash=await broadcast(c.url,signed);}catch{throw new DeploymentError('RPC eth_sendRawTransaction failed. Reconcile the journal hash before any further broadcast.');}
  eq(returnedHash,hash,'Broadcast transaction hash differs.');
  c.nonce=nonce+1n;append({kind:'broadcast',label,nonce,transactionHash:hash});
  let receipt;const deadline=Date.now()+15*60*1000;
  while(Date.now()<deadline){receipt=await c.rpc('eth_getTransactionReceipt',[hash]);if(receipt)break;await sleep(localRehearsal?20:3000);}
  check(receipt,'Transaction is still pending. Reconcile the journal before retrying.');
  const publicReceipt={kind:'receipt',label,nonce,transactionHash:hash,status:receipt.status,contractAddress:receipt.contractAddress,blockNumber:BigInt(receipt.blockNumber),blockHash:receipt.blockHash,gasUsed:BigInt(receipt.gasUsed),gasLimit,gasPrice};
  append(publicReceipt);record.transactions.push(publicReceipt);save();
  check(receipt.status==='0x1','Transaction reverted: '+label+'.');
  if(expectedAddress){eq(receipt.contractAddress,expectedAddress,'Created address differs from its nonce prediction.');const size=await c.codeSize(expectedAddress);check(size>0&&size<=24576,'Created runtime exceeds EIP-170 or is empty.');}
  totalGas+=BigInt(receipt.gasUsed);c.lastGas=BigInt(receipt.gasUsed);log(label+' · '+hash);
  return {hash,address:receipt.contractAddress,gas:BigInt(receipt.gasUsed),block:BigInt(receipt.blockNumber)};
 };
 try{
  const contracts=record.contracts;
  contracts.engine=await c.deploy(A('src/Engine.sol','Engine').bytecode,word(1),'Engine');
  for(const shard of engineBuild.head)await c.exec(contracts.engine,'loadHead(bytes)',[shard.data],{label:'engine:head'});
  for(const shard of engineBuild.body)await c.exec(contracts.engine,'loadBody(bytes)',[shard.data],{label:'engine:body'});
  const engineABI=new Interface(A('src/Engine.sol','Engine').abi);
  for(const side of ['head','body']){const [bytes]=engineABI.decodeFunctionResult(side+'Bytes',await c.read(contracts.engine,side+'Bytes()'));eq(bytes,'0x'+engineBuild[side].map(s=>s.data.slice(2)).join(''),'Engine bytes differ before freeze.');}
  await c.exec(contracts.engine,'setInflatedSize(uint32)',[engineBuild.inflatedSize]);
  await c.exec(contracts.engine,'freeze()');
  contracts.sigil=await c.deploy(A('src/Sigil.sol','Sigil').bytecode,'','Sigil');
  contracts.renderer=await c.deploy(A('src/Renderer.sol','Renderer').bytecode,encodeAddressArg(contracts.engine)+encodeAddressArg(contracts.sigil),'Renderer');
  contracts.reach=await c.deploy(A('src/IpseityAccount.sol','IpseityAccount').bytecode,'','Reach');
  contracts.grip=await c.deploy(A('src/GripVault.sol','GripVault').bytecode,'','Grip');
  contracts.ipseity=await c.deploy(A('src/Ipseity.sol','SepoliaIpseity').bytecode,encodeAddressArg(contracts.renderer)+encodeAddressArg(contracts.reach)+encodeAddressArg(contracts.grip)+bandArgs(chainId)+encodeAddressArg(recipient),'SepoliaIpseity');
  const collectionDeploymentHash=record.transactions.at(-1).transactionHash;
  contracts.pool=await c.deploy(A('src/Pool.sol','Pool').bytecode,encodeAddressArg(contracts.ipseity)+word(10n**27n)+encodeAddressArg(deployer)+word(0),'Pool');
  await c.exec(contracts.ipseity,'setPool(address)',[contracts.pool]);
  contracts.lease=await c.deploy(A('src/Lease.sol','Lease').bytecode,encodeAddressArg(contracts.ipseity),'Lease');
  Object.assign(contracts,await deploySite(c,A,{hub:contracts.ipseity,pool:contracts.pool,lease:contracts.lease,sigil:contracts.sigil,uniswap:preflight.uniswap}));save();
  for(const name of EXPECTED)check(contracts[name]&&await c.codeSize(contracts[name])>0,'Missing original contract: '+name+'.');
  check(decBool(await c.read(contracts.engine,'frozen()')),'Engine did not freeze.');
  const plan=await planModuleDeployment({chainId,deployer,startingNonce:Number(await c.nonceNow()),collection:contracts.ipseity,premises:contracts.premises},{artifacts,workbench});
  record.modulePlanSha256=plan.planSha256;record.workbench=plan.workbench;
  for(const step of plan.steps){
   eq(await c.nonceNow(),step.nonce,'Companion plan nonce differs.');eq(keccak256(step.data),step.dataHash,'Companion calldata differs.');
   if(step.preconditions?.expectedFactoryNonce!==undefined)eq(BigInt(await c.rpc('eth_getTransactionCount',[step.preconditions.factory,'latest'])),step.preconditions.expectedFactoryNonce,'Public archive factory nonce changed; remaining plan must be regenerated.');
   const result=await c.send({to:step.to??undefined,data:step.data,value:BigInt(step.value??0),label:step.id});
   if(step.to===null)eq(result.address,step.expectedAddress,'Companion creation address differs.');
   if(step.expectedAddress){
    const code=await c.rpc('eth_getCode',[step.expectedAddress,'latest']);check(code!=='0x','Companion code is missing.');
    if(step.expectedCodeHash)eq(keccak256(code),step.expectedCodeHash,'Archive chunk code differs.');
    if(step.contract==='ModuleArchiveFactory')eq(keccak256(code),keccak256(artifacts.ModuleArchiveFactory.deployedBytecode),'Archive factory code differs.');
    if(step.archiveHash){eq(await c.read(step.expectedAddress,'contentSha256()'),step.archiveHash,'Archive digest differs.');eq(decUint(await c.read(step.expectedAddress,'byteLength()')),step.archiveBytes,'Archive size differs.');eq(await c.read(step.to,'archiveCodeHash(address)',[step.expectedAddress]),keccak256(code),'Factory archive commitment differs.');}
   }
  }
  record.modules={archiveFactory:plan.modules.ModuleArchiveFactory,releases:plan.modules.ExtensionReleaseRegistry,registry:plan.modules.TokenModuleRegistry,stateStore:plan.modules.ModuleStateStore,cartridges:plan.modules.ChunkedCartridgeRegistry,workbench:plan.modules.ModuleWorkbench,portal:plan.modules.ModulePortal,rawArchive:plan.modules.WorkbenchArchive,packedArchive:plan.modules.PackedWorkbenchArchive};save();
  const recovered=await recoverWorkbench({request:({method,params})=>c.rpc(method,params),chainId,workbench:record.modules.workbench,expectedHash:workbench.manifest.sha256});
  check(Buffer.from(recovered.bytes).equals(Buffer.from(workbench.bytes)),'Recovered workbench differs from the source build.');
  eq(decUint(await c.read(contracts.ipseity,'totalSupply()')),3,'Bootstrap supply differs.');
  await c.exec(contracts.ipseity,'setPricing(uint256,uint256)',[PRICE,OPEN_FEE],{label:'setPricing'});
  eq(decUint(await c.read(contracts.ipseity,'price()')),PRICE,'Mint price changed.');
  for(let id=1;id<=3;id++){
   eq(decAddr(await c.read(contracts.ipseity,'ownerOf(uint256)',[id])),recipient,'Mint recipient differs.');
   record.tokens.push({id,owner:recipient,mintTransaction:collectionDeploymentHash});save();
   await c.exec(contracts.ipseity,'embody(uint256)',[id],{label:'embody:'+id});
   await c.exec(contracts.ipseity,'embodyGrip(uint256)',[id],{label:'embodyGrip:'+id});
  }
  eq(decUint(await c.read(contracts.ipseity,'totalSupply()')),3,'Final supply must be exactly three.');
  eq(decUint(await c.read(contracts.ipseity,'balanceOf(address)',[recipient])),3,'Recipient must own exactly three tokens from this collection.');
  const seeds=new Set();
  for(const token of record.tokens){
   const {id}=token;eq(decAddr(await c.read(contracts.ipseity,'ownerOf(uint256)',[id])),recipient,'Final owner differs.');
   token.seed=await c.read(contracts.ipseity,'seedOf(uint256)',[id]);seeds.add(token.seed);
   token.section=decUint(await c.read(contracts.ipseity,'sectionOf(uint256)',[id])).toString();
   token.reach=decAddr(await c.read(contracts.ipseity,'account(uint256)',[id]));token.grip=decAddr(await c.read(contracts.ipseity,'grip(uint256)',[id]));
   check(await c.codeSize(token.reach)>0&&await c.codeSize(token.grip)>0,'Token accounts were not materialized.');
   eq(decAddr(await c.read(token.reach,'owner()')),recipient,'Reach authority differs from the recipient.');
   const uri=decString(await c.read(contracts.ipseity,'tokenURI(uint256)',[id]));check(uri.startsWith('data:application/json;base64,'),'Token metadata is not self contained.');
   const metadata=JSON.parse(Buffer.from(uri.split(',')[1],'base64'));check(metadata.animation_url?.startsWith('data:text/html'),'Token instrument is missing.');token.metadataSha256=sha256(Buffer.from(uri));
   const route=['token',String(id),'live'];const original=await c.call(contracts.premises,encRequest(route)),forwarded=await c.call(record.modules.portal,encRequest(route));eq(forwarded,original,'Portal changed the original instrument.');check(decResponse(original).status===200,'Original instrument route failed.');
   token.urls={instrument:`web3://${record.modules.portal}:${chainId}/token/${id}/live`,modules:`web3://${record.modules.portal}:${chainId}/token/${id}/modules`,metadata:`web3://${contracts.ipseity}:${chainId}/tokenURI/${id}`};
  }
  check(seeds.size===3,'Minted seeds must be distinct.');
  const modulePage=decResponse(await c.call(record.modules.portal,encRequest(['token','1','modules'])));check(modulePage.status===200&&modulePage.body.includes(workbench.manifest.sha256.slice(2)),'Onchain module page commitment differs.');
  const discovery=decResponse(await c.call(record.modules.portal,encRequest(['modules','services.json'])));check(discovery.status===200,'Module discovery failed.');
  record.urls={door:`web3://${record.modules.portal}:${chainId}/`,original:`web3://${contracts.premises}:${chainId}/`,modules:`web3://${record.modules.portal}:${chainId}/modules`};
  // Public minting remains impossible throughout setup. Opening it is the
  // final state-changing action, after the bootstrap allocation is verified.
  await c.exec(contracts.ipseity,'enablePublicMinting()',[],{label:'enablePublicMinting'});
  // Re-read every receipt at completion: a disappeared/reorged receipt is not
  // accepted as a successful deployment. This records inclusion, not finality.
  for(const receipt of record.transactions){const current=await c.rpc('eth_getTransactionReceipt',[receipt.transactionHash]);check(current?.status==='0x1'&&current.blockHash===receipt.blockHash,'A receipt changed during verification; reconcile the chain.');}
  record.status='verified';record.gasUsed=totalGas;record.finishedAt=new Date().toISOString();record.confirmation='All receipts re-read at completion; block inclusion, not consensus finality.';save();append({kind:'complete',gasUsed:totalGas,mintCount:3,collection:contracts.ipseity,portal:record.modules.portal});
  return record;
 }catch(error){record.status='incomplete';record.failure='Deployment stopped. Reconcile transaction hashes and chain state before any new run.';save();append({kind:'stopped',message:record.failure});throw error;}
 finally{c.send=originalSend;c.rpc=originalRpc;fs.closeSync(journalFd);fs.closeSync(outputFd);}
}

export async function main(env=process.env,{preflightOnly=false}={}){
 const config=publicConfig(env);
 const c=await RpcChain.open(config.rpcUrl,config.key);
 check(c.chainId===SEPOLIA_CHAIN_ID,'Only Ethereum Sepolia is authorized.');
 // Rebuild locally before signing so stale dist files cannot become immutable.
 execFileSync(process.execPath,['tools/build-engine.mjs'],{cwd:ROOT,stdio:'pipe',env:{...process.env,PRIVATE_KEY:'',RPC_URL:''}});
 const output=compile({quiet:true}),A=(file,name)=>artifact(output,file,name);
 const artifacts=loadModuleArtifacts(output),workbench=await buildWorkbench({output:null});
 const engineBuild=JSON.parse(fs.readFileSync(path.join(ROOT,'dist/shards.json'),'utf8'));
 if(preflightOnly){const result=await deploymentPreflight({c,workbench});console.log(json({status:'preflight-passed',chainId:result.chainId,deployer:result.deployer,recipient:MINT_RECIPIENT,mintCount:3,gasBudget:result.gasBudget,feeCeiling:result.feeCeiling,requiredBalance:result.requiredBalance,workbenchSha256:workbench.manifest.sha256,broadcast:false}));return result;}
 console.log('Deploying IPSEITY to Ethereum Sepolia; exactly three tokens go to '+MINT_RECIPIENT+'.');
 const record=await deploySepolia({c,A,artifacts,engineBuild,workbench,...config});
 console.log(json({collection:record.contracts.ipseity,portal:record.modules.portal,recipient:record.recipient,tokens:record.tokens.map(t=>({id:t.id,urls:t.urls})),workbenchSha256:record.workbench.sha256,gasUsed:record.gasUsed}));
 return record;
}
if(process.argv[1]&&path.resolve(process.argv[1])===path.resolve(import.meta.filename)){
 const args=process.argv.slice(2);
 if(args.length>1||(args.length===1&&args[0]!=='--preflight')){console.error('Usage: node tools/deploy-sepolia.mjs [--preflight] (RPC_URL and PRIVATE_KEY must be configured securely).');process.exitCode=1;}
 else main(process.env,{preflightOnly:args[0]==='--preflight'}).catch(error=>{console.error(error instanceof DeploymentError?error.message:'Deployment stopped during build or RPC access. Reconcile any existing journal before retrying.');process.exitCode=1;});
}
