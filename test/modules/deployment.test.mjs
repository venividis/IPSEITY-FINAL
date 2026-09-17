import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {BrowserProvider,Contract,Interface,ZeroHash,getBytes,keccak256,sha256,toUtf8Bytes} from 'ethers';
import {gzipSync} from 'node:zlib';
import {planModuleDeployment,prepareModuleDeployment,readWorkbenchBuild,validateModuleDeploymentConfig,verifyModuleDeploymentPlan,loadModuleArtifacts} from '../../tools/modules-deployment.mjs';
import {buildWorkbench} from '../../tools/modules-build-workbench.mjs';
import {recoverWorkbench,saveWorkbenchRecovery,readOnlyRpc,WORKBENCH_ABI} from '../../tools/modules-recover-workbench.mjs';

const root=path.resolve(import.meta.dirname,'../..'),run=promisify(execFile);
const names=['ModuleArchiveFactory','ExtensionReleaseRegistry','TokenModuleRegistry','ModuleStateStore','ChunkedCartridgeRegistry','ArtifactBinding','AppChunk','OnchainApp','OnchainAppDirectory','ModuleWorkbench'];
let artifactsCache;const artifactSet=()=>artifactsCache??=loadModuleArtifacts();
const config={chainId:31337,deployer:'0x90F8bf6A479f320ead074411a4B0e7944Ea8c9C1',startingNonce:0,collection:'0xFFcf8FDEE72ac11b5c542428B35EEF5769C409f0',premises:'0x'+'22'.repeat(20)};

function documentFixture(t) {
  const base=fs.mkdtempSync(path.join(os.tmpdir(),'anima-workbench-plan-'));
  t.after(()=>fs.rmSync(base,{recursive:true,force:true}));
  const prefix='<!doctype html><html><meta charset="utf-8"><title>Recovery fixture</title><body><p>Self-contained workbench document</p><!--',suffix='--></body></html>';
  const bytes=Buffer.from(prefix+'x'.repeat(49152-Buffer.byteLength(prefix+suffix))+suffix);
  const archive=path.join(base,'archive');fs.mkdirSync(path.join(archive,'chunks'),{recursive:true});
  const chunks=[];
  for(let i=0;i<bytes.length;i+=23000){const data=bytes.subarray(i,i+23000),file='chunks/'+String(chunks.length).padStart(3,'0')+'.bin';fs.writeFileSync(path.join(archive,file),data);chunks.push({file,byteLength:data.length,sha256:sha256(data)});}
  const source=Buffer.from('self-contained local test fixture');fs.writeFileSync(path.join(base,'source.txt'),source);
  const packed=gzipSync(bytes,{level:9,mtime:0});fs.writeFileSync(path.join(archive,'packed.bin'),packed);
  const manifest={packed:{file:'packed.bin',compression:'gzip',byteLength:packed.length,sha256:sha256(packed)},schema:'anima.module-workbench/1',compression:'raw',byteLength:bytes.length,sha256:sha256(bytes),chunks,inputs:{'source.txt':sha256(source)}};
  const manifestPath=path.join(archive,'manifest.json');fs.writeFileSync(manifestPath,JSON.stringify(manifest,null,2)+'\n');fs.writeFileSync(path.join(archive,'index.html'),bytes);
  return {base,archive,manifestPath,bytes,manifest,workbench:readWorkbenchBuild(manifestPath,base)};
}

test('offline module planning validates exact bytes, constructor limits and explicit native collection/site identity',async t=>{
  const f=documentFixture(t),artifacts=artifactSet();
  const plan=await planModuleDeployment(config,{artifacts,workbench:f.workbench});
  assert.deepEqual(await planModuleDeployment(config,{artifacts,workbench:f.workbench}),plan,'pure plan determinism');
  assert.equal(plan.workbench.byteLength,49152);
  assert.equal(plan.archive.chunkReferences.length,3);
  assert.equal(plan.steps.length,12);
  assert.equal(plan.steps.find(step=>step.kind==='createArchive').preconditions.expectedFactoryNonce,1);
  assert.equal(plan.steps.at(-1).preconditions.expandedSha256,sha256(f.bytes));
  assert.deepEqual(plan.internalCreations.map(x=>[x.contract,x.nonce]),[['ModuleStateStore',1],['ArtifactBinding',1],['OnchainApp',1],['OnchainApp',2]]);
  for(let i=0;i<plan.steps.length;i++){
    const step=plan.steps[i];assert.equal(step.nonce,i);assert.equal(step.value,'0');assert.equal(step.chainId,'31337');assert.equal(step.dataHash,keccak256(step.data));
    if(step.to===null)assert.ok(step.initcodeBytes<=49152);
  }
  await assert.rejects(()=>verifyModuleDeploymentPlan({...plan,nextNonce:plan.nextNonce+1}),/fingerprint mismatch/);
  assert.equal(validateModuleDeploymentConfig({...config,chainId:1}).chainId,1,'offline plans retain IPSEITY multi-chain support');
  assert.throws(()=>validateModuleDeploymentConfig({...config,privateKey:'never accepted'}),/Unknown/);
  assert.throws(()=>validateModuleDeploymentConfig({...config,startingNonce:-1}),/nonce/);
  assert.throws(()=>validateModuleDeploymentConfig({...config,collection:'0x'+'00'.repeat(20)}),/nonzero/);
  await assert.rejects(()=>planModuleDeployment(config,{artifacts,workbench:{...f.workbench,bytes:Buffer.from('changed')}}),/Invalid raw/);
  const tooBig={...artifacts,ModuleWorkbench:{...artifacts.ModuleWorkbench,bytecode:'0x'+'60'.repeat(49100)}};
  await assert.rejects(()=>planModuleDeployment(config,{artifacts:tooBig,workbench:f.workbench}),/initcode including arguments/);
  const runtimeTooBig={...artifacts,ModuleWorkbench:{...artifacts.ModuleWorkbench,deployedBytecode:'0x'+'60'.repeat(24577)}};
  await assert.rejects(()=>planModuleDeployment(config,{artifacts:runtimeTooBig,workbench:f.workbench}),/EIP-170/);
  fs.appendFileSync(path.join(f.base,'source.txt'),'changed');
  assert.throws(()=>readWorkbenchBuild(f.manifestPath,f.base),/build input changed/);
  fs.writeFileSync(path.join(f.base,'source.txt'),'self-contained local test fixture');
  const changed=JSON.parse(fs.readFileSync(f.manifestPath));changed.chunks[0].file='../source.txt';fs.writeFileSync(f.manifestPath,JSON.stringify(changed));
  assert.throws(()=>readWorkbenchBuild(f.manifestPath,f.base),/ordered workbench chunk/);
  fs.writeFileSync(f.manifestPath,JSON.stringify(f.manifest));
  fs.appendFileSync(path.join(f.archive,'chunks/000.bin'),'x');
  assert.throws(()=>readWorkbenchBuild(f.manifestPath,f.base),/chunk differs/);
});

test('operator planning binds current compilation and independently rebuilt workbench, rejecting self-consistent substituted bytes',async t=>{
  const base=fs.mkdtempSync(path.join(os.tmpdir(),'anima-current-workbench-'));t.after(()=>fs.rmSync(base,{recursive:true,force:true}));
  const output=path.join(base,'built'),built=await buildWorkbench({output}),options={workbenchManifest:path.join(output,'manifest.json')};
  const plan=await prepareModuleDeployment(config,options);
  assert.equal(plan.verification.scope,'current compiled IPSEITY source and independently rebuilt workbench');
  assert.equal(plan.workbench.sha256,sha256(built.bytes));
  assert.deepEqual(await verifyModuleDeploymentPlan(plan,options),plan);
  // An attacker can recompute every local document hash, but cannot make different bytes
  // equal the independently rebuilt current source bundle.
  const substituted=Buffer.from(built.bytes);substituted[0]^=1;
  const manifest=JSON.parse(fs.readFileSync(options.workbenchManifest));manifest.sha256=sha256(substituted);
  const first=substituted.subarray(0,23000);manifest.chunks[0].sha256=sha256(first);
  const changedPacked=gzipSync(substituted,{level:9,mtime:0});manifest.packed.sha256=sha256(changedPacked);manifest.packed.byteLength=changedPacked.length;fs.writeFileSync(path.join(output,'packed.bin'),changedPacked);
  fs.writeFileSync(path.join(output,manifest.chunks[0].file),first);fs.writeFileSync(path.join(output,'index.html'),substituted);fs.writeFileSync(options.workbenchManifest,JSON.stringify(manifest));
  assert.equal(readWorkbenchBuild(options.workbenchManifest).manifest.sha256,sha256(substituted),'all declared hashes are internally consistent');
  await assert.rejects(()=>prepareModuleDeployment(config,options),/differs from current reproducible source build/);
});
