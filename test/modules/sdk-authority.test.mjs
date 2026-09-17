import test from 'node:test';
import assert from 'node:assert/strict';
import {Interface,keccak256,toUtf8Bytes} from 'ethers';
import {ACCOUNT_ABI,COLLECTION_ABI,TOKEN_MODULE_ABI,AUTHORITY_TYPE,ZERO_HASH,readRegistry,encodeActivate,assertCurrentContext,recoverToken,recoverState} from '../../packages/modules/sdk.mjs';

const address=n=>'0x'+n.toString(16).padStart(40,'0');
const registry=address(1),collection=address(2),account=address(3),owner=address(4);
function fixture(changes={}) {
  const calls=[];
  const interfaces=new Map([[registry,new Interface(TOKEN_MODULE_ABI)],[collection,new Interface(COLLECTION_ABI)],[account,new Interface(ACCOUNT_ABI)]]);
  const values={serviceType:[keccak256(toUtf8Bytes('anima.token-module-registry/1'))],authorityType:[AUTHORITY_TYPE],collection:[collection],releases:[address(5)],stateStore:[address(6)],rootOf:[ZERO_HASH],account:[account],ownerOf:[owner],owner:[owner],token:[31337n,collection,1n],state:[7n],isSealed:[false],statsOf:[3n,0n,0n,1n],modulesOf:[[],0n],historyOf:[[],0n],moduleCount:[0n],historyCount:[0n],...changes};
  const request=async({method,params=[]})=>{
    calls.push({method,params});
    if(method==='eth_chainId')return '0x7a69';
    if(method==='eth_getBlockByNumber')return {number:'0x10',hash:'0x'+'ab'.repeat(32)};
    assert.equal(method,'eth_call','authority recovery must remain read-only');
    const i=interfaces.get(params[0].to),decoded=i.parseTransaction({data:params[0].data});
    assert.equal(params[1],'0x10','all authority and catalog reads use one pinned block');
    assert.ok(values[decoded.name],decoded.name);
    return i.encodeFunctionResult(decoded.name,values[decoded.name]);
  };
  return {request,calls,values,options:{request,registry,tokenId:1,chainId:31337}};
}

test('SDK verifies the actual IPSEITY Reach footer and prepares operation-zero execution',async()=>{
  const f=fixture(),context=await readRegistry(f.options);
  assert.equal(context.account,account);assert.equal(context.owner,owner);
  assert.equal(context.epoch,'1');assert.equal(context.actionNonce,'7');assert.equal(context.sealed,false);
  const recipe=encodeActivate(context,{releaseId:'0x'+'cd'.repeat(32)});
  assert.equal(recipe.from,owner);assert.equal(recipe.to,account);assert.equal(recipe.value,'0');
  const outer=new Interface(ACCOUNT_ABI).parseTransaction({data:recipe.data});
  assert.equal(outer.signature,'execute(address,uint256,bytes,uint8)');
  assert.equal(outer.args[0],registry);assert.equal(outer.args[1],0n);assert.equal(outer.args[3],0n);
  const inner=new Interface(TOKEN_MODULE_ABI).parseTransaction({data:outer.args[2]});
  assert.equal(inner.name,'activate');assert.equal(inner.args.expectedEpoch,1n);
});

test('SDK refuses a legacy authority model, substituted token footer, wrong controller and malformed custody counter',async()=>{
  for(const [change,error] of [
    [{authorityType:[ZERO_HASH]},/authority model/],
    [{token:[1n,collection,1n]},/token binding/],
    [{token:[31337n,address(8),1n]},/token binding/],
    [{token:[31337n,collection,2n]},/token binding/],
    [{owner:[address(8)]},/controller/],
    [{statsOf:[0n,0x100000000n,0n,0n]},/Invalid IPSEITY custody/]
  ]) { const f=fixture(change);await assert.rejects(()=>readRegistry(f.options),error); }
});

test('SDK rejects reviews after a transfer round trip, Reach action, or seal-state change',async()=>{
  for(const change of [{statsOf:[0n,2n,0n,1n]},{state:[8n]},{isSealed:[true]}]) {
    const f=fixture(),context=await readRegistry(f.options);Object.assign(f.values,change);
    await assert.rejects(()=>assertCurrentContext({request:f.request,context}),/Stale review/);
  }
});

test('SDK rejects stalled and oversized catalog pages before reading any module payload',async()=>{
  for(const change of [{moduleCount:[1n]},{modulesOf:[[],1n]},{historyCount:[1n]},{historyOf:[[],65n]}]) {
    const f=fixture(change);await assert.rejects(()=>readRegistry(f.options),/catalog page response/);
  }
});

test('invalid export budgets fail before any RPC request',async()=>{
  const request=()=>{throw Error('RPC must not be used');};
  for(const maxExpandedBytes of [-1,NaN,Infinity,1.5,268435457])await assert.rejects(()=>recoverToken({request,registry,tokenId:1,chainId:31337,maxExpandedBytes}),/budget/);
  await assert.rejects(()=>recoverState({request,stateStore:address(6),stateId:ZERO_HASH,chainId:31337,maxExpandedBytes:-1}),/budget/);
});

test('an exhausted custody counter retains read-only recovery while refusing new write recipes',async()=>{const f=fixture({statsOf:[0n,0xffffffffn,0n,0n]}),c=await readRegistry(f.options);assert.equal(c.custodyExhausted,true);assert.equal(c.epoch,'4294967296');assert.throws(()=>encodeActivate(c,{releaseId:'0x'+'cd'.repeat(32)}),/writes are refused/);});
