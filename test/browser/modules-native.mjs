/** Genuine IPSEITY -> Reach -> immutable modules, journal and owned cartridges.
 * Disposable local chain only. An injected fixture provider is not a browser
 * extension or hardware-wallet result. Missing Chromium is a failed gate. */
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { chromium } from 'playwright';
import { Interface, keccak256 } from '../../web/vendor/ethers.min.js';
import * as sdk from '../../packages/modules/sdk.mjs';
import { IPSEITY_JOURNAL_MODULE_KEY, decryptJournalPacket } from '../../web/modules/journal.mjs';
import { createModuleFixture } from '../../tools/modules-stack.mjs';

const root=path.resolve(import.meta.dirname,'../..'),output=path.join(root,'reports/modules-native-browser');
fs.mkdirSync(output,{recursive:true});const run=fs.mkdtempSync(path.join(output,new Date().toISOString().replaceAll(':','-')+'-'));
const report={schema:'ipseity.modules-native-browser/1',startedAt:new Date().toISOString(),status:'running',browserExecuted:false,cases:[],walletTransactions:[],
  limitations:['Disposable local EVM; no public transaction, extension/hardware wallet or physical device coverage.',
    'Legacy cartridge HTML uses an opaque frame with restrictive CSP, but can attempt self-navigation; it is distinct from the worker-isolated module host.']};
const save=()=>fs.writeFileSync(path.join(run,'results.json'),JSON.stringify(report,(_,v)=>typeof v==='bigint'?String(v):v,2)+'\n');save();
const sha=bytes=>'0x'+createHash('sha256').update(bytes).digest('hex');
const text=bytes=>new TextDecoder('utf-8',{fatal:true}).decode(bytes);
let fixture,browser,context,page,approval=null;
function candidate(){const manifest=JSON.parse(fs.readFileSync(path.join(root,'dist/modules/manifest.json'))),bytes=fs.readFileSync(path.join(root,'dist/modules/index.html'));assert.equal(manifest.sha256,sha(bytes));assert.equal(manifest.byteLength,bytes.length);for(const[name,hash]of Object.entries(manifest.inputs))assert.equal(sha(fs.readFileSync(path.join(root,name))),hash,'Changed workbench source: '+name);return{manifestSha256:sha(fs.readFileSync(path.join(root,'dist/modules/manifest.json'))),sha256:sha(bytes),bytes:bytes.length};}
try{
  report.candidate=candidate();save();
  if(!fs.existsSync(chromium.executablePath()))throw Error('Pinned Playwright Chromium is missing. Install it before the native browser gate.');
  report.phase='deploy-original-ipseity-and-companions';save();fixture=await createModuleFixture({site:true,seed:true,gateway:true});
  const f=fixture,owner=String(f.owner).toLowerCase(),account=String(f.account).toLowerCase(),collection=String(f.collection).toLowerCase(),registry=String(f.modules.registry).toLowerCase();
  const chainId=BigInt(await f.request({method:'eth_chainId',params:[]})).toString(),tokenId=String(f.tokenId??1);
  const base=new URL(f.url),url=new URL('/token/'+tokenId+'/modules',base).href;
  const originals=Object.fromEntries(await Promise.all([collection,account,String(f.premises)].map(async address=>[address,keccak256(await f.request({method:'eth_getCode',params:[address,'latest']}))])));
  report.fixture={chainId,owner,account,collection,tokenId,registry,portal:f.modules.portal,cartridges:f.modules.cartridges,url,originalCode:originals};save();
  const notebook=f.published.notebook,garden=f.published.garden,v2=f.published.notebookV2;
  assert.ok(notebook?.releaseId&&garden?.releaseId&&v2?.releaseId,'Fixture must publish notebook, notebookV2 and garden.');
  browser=await chromium.launch();report.browser=browser.version();report.browserExecuted=true;
  context=await browser.newContext({viewport:{width:1440,height:1050},reducedMotion:'reduce'});context.setDefaultTimeout(30000);context.setDefaultNavigationTimeout(60000);
  const errors=[],external=[],allowedPages=new Set(),methods=new Set(['eth_requestAccounts','eth_accounts','eth_chainId','eth_getCode','eth_getBlockByNumber','eth_call','eth_estimateGas','eth_getTransactionReceipt','eth_sendTransaction']);
  await context.route('**/*',route=>{const value=route.request().url();if(value.startsWith('blob:')||value.startsWith('data:')||new URL(value).origin===base.origin)return route.continue();external.push(value);return route.abort();});
  const accountABI=new Interface(sdk.ACCOUNT_ABI),moduleABI=new Interface(sdk.TOKEN_MODULE_ABI);
  await context.exposeBinding('__ipseityModuleFixtureRPC',async(source,payload)=>{
    assert.ok(allowedPages.has(source.page)&&source.frame===source.page.mainFrame(),'Only the top-level reviewed workbench receives a wallet.');
    assert.equal(new URL(source.frame.url()).origin,base.origin);assert.ok(methods.has(payload?.method),'Unknown RPC method');
    if(payload.method==='eth_requestAccounts'||payload.method==='eth_accounts')return[owner];
    if(payload.method==='eth_sendTransaction'){
      const expected=approval;approval=null;assert.ok(expected,'A transaction was requested before the explicit review click.');
      const tx=payload.params[0];assert.equal(tx.from.toLowerCase(),owner);assert.equal(tx.to.toLowerCase(),account);assert.equal(BigInt(tx.value??0),0n);assert.equal(tx.data.toLowerCase(),expected.data.toLowerCase());assert.ok(BigInt(tx.gas)>0n&&BigInt(tx.gas)<=2n**24n);
      const outer=accountABI.parseTransaction({data:tx.data});assert.equal(outer.args[3],0n);assert.equal(outer.args[0].toLowerCase(),registry);assert.equal(moduleABI.parseTransaction({data:outer.args[2]}).name,expected.method);
      const hash=await f.request(payload);report.walletTransactions.push({...expected,hash,gasLimit:String(BigInt(tx.gas))});save();return hash;
    }
    return f.request({...payload,params:payload.params??[]});
  });
  await context.addInitScript(()=>{if(window!==window.top)return;const listeners=new Map();Object.defineProperty(window,'ethereum',{value:Object.freeze({request:payload=>window.__ipseityModuleFixtureRPC(payload),on:(name,fn)=>{if(!listeners.has(name))listeners.set(name,new Set());listeners.get(name).add(fn);},removeListener:(name,fn)=>listeners.get(name)?.delete(fn)})});});
  page=await context.newPage();allowedPages.add(page);page.on('pageerror',error=>errors.push(error.message));await page.goto(url);await page.getByRole('heading',{name:'The same NFT. The same account.'}).waitFor();
  const idle=async({allowError=false}={})=>{await page.waitForFunction(()=>document.querySelector('#workbench')?.getAttribute('aria-busy')==='false');if(!allowError)assert.doesNotMatch(await page.locator('[data-node="status"]').getAttribute('class'),/am-error/,await page.locator('[data-node="status"]').textContent());};
  const action=async name=>{await page.locator('[data-action="'+name+'"]').click();await idle();};
  const choose=async releaseId=>{await page.locator('[data-form="recover"] [name="releaseId"]').fill(releaseId);await page.locator('[data-form="recover"] button[type="submit"]').click();await idle();};
  const read=()=>sdk.readRegistry({request:f.request,registry,tokenId,chainId});
  const state=async head=>sdk.recoverState({request:f.request,stateStore:f.modules.stateStore,stateId:head,chainId,collection,tokenId,moduleKey:notebook.moduleKey});
  const sign=async(method,label=method)=>{
    const detail=JSON.parse(await page.locator('[data-node="review-content"]').textContent()),tx=detail.transaction;
    const outer=accountABI.parseTransaction({data:tx.data}),inner=moduleABI.parseTransaction({data:outer.args[2]});assert.equal(inner.name,method);
    const count=report.walletTransactions.length;approval={method,label,data:tx.data,reviewedAt:new Date().toISOString()};
    await action('confirm-review');assert.equal(approval,null);assert.equal(report.walletTransactions.length,count+1);
    const receipt=await f.request({method:'eth_getTransactionReceipt',params:[report.walletTransactions.at(-1).hash]});assert.equal(BigInt(receipt.status),1n);report.walletTransactions.at(-1).gasUsed=String(BigInt(receipt.gasUsed));save();return{receipt,inner};
  };
  const draft=async value=>{if(!(await page.locator('[data-node="migration-json"]').isVisible()))await page.locator('.am-state > summary').click();await page.locator('[data-node="migration-json"]').fill(JSON.stringify(value));await action('preview-migration');await action('commit-migration');await page.locator('[data-node="state-consent"]').check();};
  const check=async(name,task)=>{const record={name,status:'running'};report.cases.push(record);save();try{await task(record);record.status='passed';}catch(error){record.status='failed';record.error=error.stack??String(error);throw error;}finally{save();}};
  await page.getByRole('button',{name:'Connect & read',exact:true}).click();await idle();assert.equal(report.walletTransactions.length,0);
  let initialHead,initialValue={notebook:{note:'A retained IPSEITY thought 🫧'},position:{x:0.125,y:-2.75}};
  await check('native-reach-install-save-recover-and-cancel',async record=>{
    await choose(notebook.releaseId);await action('install');assert.equal(report.walletTransactions.length,0);await action('cancel-review');assert.equal(report.walletTransactions.length,0);assert.equal((await read()).modules.length,0);
    await action('install');await sign('activate','install-notebook');await action('launch');
    const frame=page.frameLocator('[data-node="runtime-container"] iframe');await frame.getByRole('status').filter({hasText:'Isolated module ready'}).waitFor();assert.equal(await frame.locator('body').evaluate(()=>typeof window.ethereum),'undefined');await action('close-runtime');
    await draft(initialValue);await action('save-state');await sign('writeState','save-v1');const current=await read();initialHead=current.modules.find(m=>m.moduleKey===notebook.moduleKey).stateHead;assert.deepEqual(JSON.parse(text((await state(initialHead)).bytes)),initialValue);
    await page.locator('[data-node="migration-json"]').fill('{"wrong":true}');await action('restore-chain');assert.deepEqual(JSON.parse(await page.locator('[data-node="migration-json"]').inputValue()),initialValue);record.stateHead=initialHead;
  });
  await check('full-32-kib-migration-historical-branch-and-independent-state',async record=>{
    await choose(garden.releaseId);await action('install');await sign('activate','install-garden');await draft({dedication:{dedication:'The garden remains independent.'}});await action('save-state');await sign('writeState','save-garden');const gardenHead=(await read()).modules.find(m=>m.moduleKey===garden.moduleKey).stateHead;
    await choose(v2.releaseId);const value={position:{x:0.125,y:-2.75},volume:0.7,note:''};value.note='x'.repeat(32768-new TextEncoder().encode(JSON.stringify(value)).length);assert.equal(new TextEncoder().encode(JSON.stringify(value)).length,32768);
    await draft(value);await action('stage-state');await sign('stageState','stage-v2');await action('install');await sign('activate','activate-v2');const v2Head=(await read()).modules.find(m=>m.moduleKey===notebook.moduleKey).stateHead;assert.deepEqual(JSON.parse(text((await state(v2Head)).bytes)),value);
    await page.locator('[data-tab="history"]').click();await page.locator('[data-node="history"] [data-release="'+notebook.releaseId+'"][data-state-head="'+initialHead+'"]').click();await idle();await action('restore-chain');assert.deepEqual(JSON.parse(await page.locator('[data-node="migration-json"]').inputValue()),initialValue);
    await action('preview-migration');assert.equal(await page.locator('[data-node="commit-migration"]').isEnabled(),true);await action('restore-chain');assert.equal(await page.locator('[data-node="commit-migration"]').isDisabled(),true);await action('preview-migration');await action('commit-migration');await page.locator('[data-node="state-consent"]').check();await action('stage-state');await sign('stageState','stage-history');await action('install');await sign('activate','activate-history');
    const branch=(await read()).modules.find(m=>m.moduleKey===notebook.moduleKey).stateHead;const branchState=await state(branch);assert.equal(branchState.record.parent,v2Head);assert.deepEqual(JSON.parse(text(branchState.bytes)),initialValue);
    await action('disable');await sign('disable','disable-notebook');assert.equal((await read()).modules.find(m=>m.moduleKey===garden.moduleKey).stateHead,gardenHead);await choose(garden.releaseId);await action('launch');await page.frameLocator('[data-node="runtime-container"] iframe').getByRole('status').filter({hasText:'Isolated module ready'}).waitFor();await action('close-runtime');Object.assign(record,{v2Head,branch,gardenHead});
  });
  await check('public-and-encrypted-journal-chain-recovery',async record=>{
    await page.locator('[data-tab="journal"]').click();const form=page.locator('[data-form="journal"]'),entries=[];
    for(const mode of ['public','encrypted']){
      const note='  '+mode+' IPSEITY memory 🫧\n',passphrase='Local browser fixture journal key';await form.locator('[name="mode"]').selectOption(mode);await form.locator('[name="text"]').fill(note);if(mode==='encrypted')await form.locator('[name="passphrase"]').fill(passphrase);await form.locator('[name="consent"]').check();const before=report.walletTransactions.length;await form.locator('button[type="submit"]').click();await idle();assert.equal(report.walletTransactions.length,before);assert.equal(await form.locator('[name="passphrase"]').inputValue(),'');
      const {inner}=await sign('stageState','journal-'+mode);assert.equal(inner.args.moduleKey,IPSEITY_JOURNAL_MODULE_KEY);const bytes=Uint8Array.from(Buffer.from(inner.args.data.slice(2),'hex')),payload=text(bytes);if(mode==='public')assert.equal(payload,note);else{assert.equal(payload.includes(passphrase),false);assert.equal(payload.includes(note),false);assert.equal((await decryptJournalPacket(payload,passphrase)).text,note);}
      entries.push({mode,payload});await action('read-journal');
      if(mode==='encrypted'){await page.locator('[data-node="journal-history"] button').last().click();await idle();await page.locator('[data-node="recovery-passphrase"]').fill(passphrase);await action('decrypt-journal');assert.equal(JSON.parse(await page.locator('[data-node="journal-decrypted"]').textContent()).text,note);await action('clear-journal-preview');assert.equal(await page.locator('[data-node="journal-decrypted"]').isVisible(),false);}
    }
    const recovered=await sdk.recoverToken({request:f.request,registry,tokenId,chainId});assert.ok(JSON.stringify(recovered).includes(IPSEITY_JOURNAL_MODULE_KEY),'Unselected journal namespace must survive complete token recovery.');record.entries=entries.map(({mode,payload})=>({mode,bytes:new TextEncoder().encode(payload).length,sha256:sha(Buffer.from(payload))}));
  });
  for(const cartridge of f.published.cartridges){await check('owned-'+cartridge.bytes+'-byte-cartridge-play-restart-exit',async record=>{
    await page.locator('[data-tab="games"]').click();const form=page.locator('[data-form="cartridge"]');await form.locator('[name="cartridges"]').fill(f.modules.cartridges);await form.locator('[name="cartridgeId"]').fill(String(cartridge.id));await form.locator('button[type="submit"]').click();await idle();assert.match(await page.locator('[data-node="game-summary"]').textContent(),new RegExp(String(cartridge.bytes)));
    const before=report.walletTransactions.length;await action('play-cartridge');assert.equal(report.walletTransactions.length,before);await action('confirm-review');const frame=page.frameLocator('[data-node="runtime-container"] iframe');await frame.locator('canvas').waitFor();assert.equal(await frame.locator('body').evaluate(()=>typeof window.ethereum),'undefined');
    const canvas=frame.locator('canvas');await canvas.click({position:{x:100,y:160}});assert.equal(await frame.locator('#message').textContent(),'','Game input must execute.');
    assert.ok(await canvas.evaluate(c=>c.width>0&&c.height>0&&[...c.getContext('2d').getImageData(0,0,8,8).data].some(value=>value>0)),'Game must render actual pixels.');
    await frame.getByRole('button',{name:'Restart',exact:true}).click();assert.match(await frame.locator('#message').textContent(),/Gather the light/);await action('close-runtime');assert.equal(await page.locator('[data-node="runtime-container"] iframe').count(),0);assert.equal(report.walletTransactions.length,before);Object.assign(record,{id:String(cartridge.id),bytes:cartridge.bytes,sha256:cartridge.hash});
  });}
  assert.equal(f.published.cartridges.length,2);assert.deepEqual(external,[],'Known local fixtures attempted external resources.');assert.deepEqual(errors,[]);
  for(const[address,hash]of Object.entries(originals))assert.equal(keccak256(await f.request({method:'eth_getCode',params:[address,'latest']})),hash,'Original deployed code changed.');
  assert.equal(candidate().manifestSha256,report.candidate.manifestSha256);report.status='passed';await page.screenshot({path:path.join(run,'completed.png'),fullPage:true});
}catch(error){report.status='failed';report.error=error.stack??String(error);}
finally{for(const[label,cleanup]of[['browser',()=>browser?.close()],['fixture',()=>fixture?.close()]])try{await cleanup();}catch(error){report.status='failed';(report.cleanupErrors??=[]).push(label+': '+String(error));}report.finishedAt=new Date().toISOString();save();console.log('Native IPSEITY browser evidence:',path.join(run,'results.json'));if(report.status!=='passed')process.exitCode=1;}
