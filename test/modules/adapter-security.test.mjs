import test from 'node:test';
import assert from 'node:assert/strict';
import { Interface, AbiCoder, keccak256, toUtf8Bytes } from '../../web/vendor/ethers.min.js';
import { RegistryAdapter } from '../../web/modules/adapter.mjs';
import { prepareJournal, IPSEITY_JOURNAL_MODULE_KEY, IPSEITY_JOURNAL_STATE_SCHEMA } from '../../web/modules/journal.mjs';
import { ModuleHostSession, ReviewedAction, HOST_LIMITS, boundedJSON } from '../../web/modules/host.mjs';
import { ACCOUNT_ABI, COLLECTION_ABI, AUTHORITY_TYPE, TOKEN_MODULE_ABI, RELEASE_ABI, STATE_ABI, ARCHIVE_TUPLE, EMPTY_ARCHIVE, ZERO_HASH, packageLegacyHTML, releaseInput, releaseIdFor, moduleKeyFor, sha256, canonicalManifest, manifestHash } from '../../packages/modules/sdk.mjs';

const address = byte => '0x' + byte.repeat(20);
const hash = byte => '0x' + byte.repeat(32);
const RELEASE_A = hash('aa'), RELEASE_B = hash('bb'), MODULE = hash('cc');
const SCHEMA_A = hash('dd'), SCHEMA_B = hash('ee');
const context = {
  chainId: '31337', collection: address('11'), tokenId: '1', account: address('22'),
  owner: address('33'), registry: address('44'), epoch: '2', root: hash('ff'),
  actionNonce: '3', mode: 0, snapshot: { chainId: '31337', block: '0x10', blockHash: hash('11') },
};
context.identity = { ...context };
function fixture({ enabled = true, releaseId = RELEASE_A } = {}) {
  const adapter = new RegistryAdapter({ raw: { request() { throw Error('Unexpected wallet call'); } } }, { registry: context.registry });
  adapter.context = async () => context;
  adapter.installation = async () => ({ moduleKey: MODULE, releaseId, stateHead: ZERO_HASH, enabled, epoch: '2' });
  return adapter;
}
const release = (releaseId = RELEASE_A, stateSchema = SCHEMA_A) => ({
  releaseId, moduleKey: MODULE, input: { stateSchema }, manifest: { stateSchema, capabilities: ['state.write'] },
});
const decode = intent => {
  const outer = new Interface(ACCOUNT_ABI).parseTransaction({ data: intent.recipe.data });
  assert.equal(outer.name, 'execute');
  assert.equal(outer.args[0].toLowerCase(), context.registry);
  return new Interface(TOKEN_MODULE_ABI).parseTransaction({ data: outer.args[2] });
};

test('a full 32 KiB state snapshot reaches exact reviewed calldata without increasing frame request limits', async () => {
  const adapter = fixture(), value = { note: 'x'.repeat(32768 - 11) };
  assert.equal(new TextEncoder().encode(JSON.stringify(value)).length, 32768);
  const intent = await adapter.intent('writeState', release(), { value });
  let preparations = 0, sends = 0;
  const review = new ReviewedAction({ verifyContext: async () => context.identity,
    prepare: async candidate => { preparations++; return candidate.recipe; },
    send: async (prepared, candidate) => { sends++; assert.equal(prepared.data, intent.recipe.data); assert.deepEqual(candidate.state, value); return { hash: hash('ab') }; },
  });
  assert.equal(HOST_LIMITS.requestBytes, 16384);
  assert.throws(() => boundedJSON({ id: 'large', method: 'state.set', params: { key: 'note', value: value.note } }), /byte limit/);
  await review.review(intent, context.identity);
  assert.equal(preparations, 1); assert.equal(sends, 0);
  const bytes = Buffer.from(decode(review.pending.intent).args.data.slice(2), 'hex');
  assert.equal(bytes.toString(), JSON.stringify(value));
  await review.confirm(); assert.equal(sends, 1);
  await assert.rejects(review.confirm(), /already been used/);
  await assert.rejects(review.review({ padding: 'x'.repeat(HOST_LIMITS.reviewBytes) }, context.identity), /byte limit/);
  assert.equal(preparations, 1, 'oversized review must fail before wallet preparation');
  assert.equal(review.pending, null);
});

test('a draft for an unactivated version cannot be written under the installed version schema', async () => {
  const adapter = fixture();
  await assert.rejects(adapter.intent('writeState', release(RELEASE_B, SCHEMA_B), { value: { v2: true } }), /enabled release.*staged migration/);
  // Even a schema-compatible different release requires selecting the edition
  // whose state the review says it will update.
  await assert.rejects(adapter.intent('writeState', release(RELEASE_B, SCHEMA_A), { value: { v2: true } }), /enabled release/);
  const staged = await adapter.intent('stageState', release(RELEASE_B, SCHEMA_B), { value: { v2: true } });
  const call = decode(staged);
  assert.equal(call.name, 'stageState');
  assert.equal(call.args.schema, SCHEMA_B);
  assert.equal(staged.releaseId, RELEASE_B);
});

test('finite decimal draft state survives both reviewed save and migration calldata', async () => {
  const value = { position: { x: 0.125, y: -2.75 }, volume: 0.7, tiny: 1e-9 };
  for (const kind of ['writeState', 'stageState']) {
    const intent = await fixture().intent(kind, release(), { value });
    assert.deepEqual(JSON.parse(Buffer.from(decode(intent).args.data.slice(2), 'hex')), value);
    assert.deepEqual(intent.state, value);
    await assert.rejects(fixture().intent(kind, release(), { value: { invalid: Infinity } }), /finite numbers/);
    await assert.rejects(fixture().intent(kind, release(), { value: { text: 'x'.repeat(32768) } }), /byte limit/);
  }
});

test('reviewed state preserves the full draft depth limit without expanding frame request depth', async () => {
  const nested = depth => { let value = 0.125; for (let i = 0; i < depth; i++) value = { draft: value }; return value; };
  const value = nested(HOST_LIMITS.valueDepth), excessive = nested(HOST_LIMITS.valueDepth + 1);
  assert.deepEqual(boundedJSON(value, 32768), value);
  for (const kind of ['writeState', 'stageState']) {
    const adapter = fixture(), intent = await adapter.intent(kind, release(), { value });
    let preparations = 0, sends = 0;
    const review = new ReviewedAction({ verifyContext: async () => context.identity,
      prepare: async candidate => { preparations++; return candidate.recipe; },
      send: async (prepared, candidate) => { sends++; assert.equal(prepared.data, intent.recipe.data); assert.deepEqual(candidate.state, value); return {}; },
    });
    await review.review(intent, context.identity);
    assert.equal(preparations, 1);
    assert.equal(Buffer.from(decode(review.pending.intent).args.data.slice(2), 'hex').toString(), JSON.stringify(value));
    await review.confirm(); assert.equal(sends, 1);
    await assert.rejects(adapter.intent(kind, release(), { value: excessive }), /nested too deeply/);
    await assert.rejects(review.review({ ...intent, state: excessive }, context.identity), /nested too deeply/);
    assert.equal(preparations, 1, 'excess depth must fail before wallet preparation');
    assert.equal(review.pending, null);
  }
  const drafts = new Map(), host = new ModuleHostSession({
    identity: context.identity, releaseId: RELEASE_A, moduleKey: MODULE,
    manifest: { stateSchema: SCHEMA_A, capabilities: ['state.write'] },
    storage: { getItem: key => drafts.get(key) ?? null, setItem: (key, text) => drafts.set(key, text) },
    verifyContext: async () => context.identity,
  });
  // The frame's params and value fields still count toward its depth limit.
  const message = (id, depth) => ({ id, method: 'state.set', params: { key: 'draft', value: nested(depth) } });
  await host.handle(message('accepted', HOST_LIMITS.valueDepth - 2));
  const before = [...drafts];
  await assert.rejects(host.handle(message('excessive', HOST_LIMITS.valueDepth - 1)), /nested too deeply/);
  assert.deepEqual([...drafts], before);
  host.close();
});

test('state snapshots require an enabled release and its verified nonzero schema', async () => {
  await assert.rejects(fixture({ enabled: false }).intent('writeState', release()), /enabled release/);
  const inconsistent = release(); inconsistent.manifest.stateSchema = SCHEMA_B;
  await assert.rejects(fixture().intent('writeState', inconsistent), /verified active release/);
  await assert.rejects(fixture().intent('writeState', release(RELEASE_A, ZERO_HASH)), /verified active release/);
  const intent = await fixture().intent('writeState', release(), { value: { draft: { version: 1 } } });
  const call = decode(intent);
  assert.equal(call.name, 'writeState');
  assert.equal(call.args.moduleKey, MODULE);
  assert.equal(call.args.expectedRoot, context.root);
  assert.equal(call.args.expectedEpoch, 2n);
  assert.equal(new TextDecoder().decode(Uint8Array.from(Buffer.from(call.args.data.slice(2), 'hex'))), '{"draft":{"version":1}}');
});

test('malformed public releases are isolated rows and cannot hide later valid releases', async () => {
  const publisher = address('55'), releases = address('66');
  const packaged = await packageLegacyHTML('<p>A valid recoverable module</p>', { name: 'valid-module', version: 1, publisher });
  const descriptor = { archive: address('77'), schema: 1, ...packaged.manifest.archive, codeHash: hash('88') };
  const input = releaseInput(packaged.manifest, descriptor);
  const validId = releaseIdFor(publisher, input, packaged.manifest);
  const moduleKey = moduleKeyFor(publisher, input.moduleId);
  const invalidId = hash('99'), malformed = new TextEncoder().encode('not JSON');
  const abi = new Interface(RELEASE_ABI), requests = [];
  const request = async ({ method, params }) => {
    assert.equal(method, 'eth_call');
    assert.equal(params[0].to, releases);
    const call = abi.parseTransaction({ data: params[0].data }), id = call.args[0];
    requests.push([call.name, id]);
    assert.ok(id === validId || id === invalidId);
    if (call.name === 'release') return abi.encodeFunctionResult('release', [{ publisher, moduleKey, manifestHash: id === validId ? manifestHash(packaged.manifest) : sha256(malformed), publishedAt: 1, input }]);
    if (call.name === 'manifest') return abi.encodeFunctionResult('manifest', [id === validId ? new TextEncoder().encode(canonicalManifest(packaged.manifest)) : malformed]);
    throw Error('Unexpected release read');
  };
  const adapter = new RegistryAdapter({ raw: { request } }, { registry: context.registry });
  const rows = await adapter.catalogEntries([invalidId, validId], { ...context, releases });
  assert.equal(rows.length, 2);
  assert.equal(rows[0].releaseId, invalidId);
  assert.equal(rows[0].invalid, true);
  assert.equal(rows[0].manifest, null);
  assert.ok(rows[0].error.length > 0 && rows[0].error.length <= 240);
  assert.equal(rows[1].releaseId, validId);
  assert.equal(rows[1].manifest.name, 'valid-module');
  assert.equal(rows[1].invalid, undefined);
  assert.ok(requests.some(([method, id]) => method === 'manifest' && id === validId));
  await assert.rejects(adapter.catalogEntries(Array(17).fill(validId), context), /catalog page/);
});

function journalFixture() {
  const prepared = [], abi = new Interface(TOKEN_MODULE_ABI);
  const wallet = { collection: context.collection, tokenId: 1n, account: context.account, address: context.owner,
    raw: { request() { throw Error('Unexpected wallet RPC'); } },
    async prepare(plan) { prepared.push(plan); this.plan = plan; return plan; },
  };
  const adapter = new RegistryAdapter(wallet, { registry: context.registry });
  adapter.context = async () => context;
  return { adapter, wallet, abi, prepared };
}

test('personal journal staging preserves explicit privacy and exact bytes in the same NFT registry', async () => {
  const { adapter, wallet, abi, prepared } = journalFixture();
  const text = '  private orchid memory 🫧\n', passphrase = 'a test-only private memory passphrase';
  for (const mode of ['public', 'encrypted']) {
    const result = await prepareJournal({ mode, text, passphrase, identity: context.identity });
    const plan = await adapter.prepare({ kind: 'journal', text: result.chainText, privacyMode: mode, identity: context.identity });
    assert.equal(plan.target.toLowerCase(), context.registry);
    const call = abi.parseTransaction({ data: plan.data });
    assert.equal(call.name, 'stageState');
    assert.equal(call.args.moduleKey, IPSEITY_JOURNAL_MODULE_KEY);
    assert.equal(call.args.schema, IPSEITY_JOURNAL_STATE_SCHEMA);
    assert.equal(call.args.expectedRoot, context.root);
    assert.equal(call.args.expectedEpoch, 2n);
    const payload = new TextDecoder().decode(Buffer.from(call.args.data.slice(2), 'hex'));
    assert.equal(payload, result.chainText);
    if (mode === 'encrypted') { assert.equal(payload.includes('private orchid memory'), false); assert.equal(payload.includes(passphrase), false); }
    assert.equal(wallet.plan, plan);
  }
  assert.equal(prepared.length, 2);
});

test('journal review rejects invalid packets, another custody epoch and unspecified privacy before wallet preparation', async () => {
  const { adapter, wallet, prepared } = journalFixture();
  const encrypted = await prepareJournal({ mode: 'encrypted', text: 'private entry', passphrase: 'a test-only encrypted phrase', identity: context.identity });
  const intent = { kind: 'journal', text: encrypted.chainText, privacyMode: 'encrypted', identity: context.identity };
  for (const invalid of [
    { ...intent, text: 'plaintext is not an encrypted packet' },
    { ...intent, text: JSON.stringify(encrypted.packet, null, 2) },
    { ...intent, identity: { ...context.identity, epoch: '3' } },
    { ...intent, privacyMode: undefined },
    { ...intent, privacyMode: 'public', text: 'é'.repeat(1501) },
  ]) {
    wallet.plan = { stale: true }; await assert.rejects(adapter.prepare(invalid)); assert.equal(wallet.plan, null);
  }
  assert.equal(prepared.length, 0);
});

function journalHistoryFixture(entries, { malformedPage = false, schema = IPSEITY_JOURNAL_STATE_SCHEMA } = {}) {
  const store=address('77'), abi=new Interface(STATE_ABI), coder=AbiCoder.defaultAbiCoder();
  const namespace=keccak256(coder.encode(['address','uint256','bytes32'],[context.collection,context.tokenId,IPSEITY_JOURNAL_MODULE_KEY]));
  const records=entries.map((text,index)=>{
    const bytes=new TextEncoder().encode(text),record={namespace,schema,parent:ZERO_HASH,dataHash:sha256(bytes),archive:EMPTY_ARCHIVE,epoch:2,createdAt:12345+index,index};
    const id=keccak256(coder.encode(['bytes32','uint256','address','bytes32','uint256','bytes32','bytes32','uint64','bytes32',ARCHIVE_TUPLE],[keccak256(toUtf8Bytes('anima.module-state/1')),context.chainId,store,namespace,index,schema,ZERO_HASH,2,record.dataHash,EMPTY_ARCHIVE]));
    return {id,bytes,record};
  });
  const request=async({method,params=[]})=>{
    if(method==='eth_getBlockByNumber')return{number:context.snapshot.block,hash:context.snapshot.blockHash};
    if(method==='eth_chainId')return '0x7a69';
    assert.equal(method,'eth_call');assert.equal(params[0].to,store);
    const call=abi.parseTransaction({data:params[0].data});
    if(call.name==='countOf')return abi.encodeFunctionResult(call.name,[records.length]);
    if(call.name==='historyOf'){
      assert.equal(call.args[1],IPSEITY_JOURNAL_MODULE_KEY);
      const first=Number(call.args[2]),page=records.slice(first,first+Number(call.args[3]));
      return abi.encodeFunctionResult(call.name,[page.map(v=>v.id),malformedPage?first:first+page.length]);
    }
    const record=records.find(v=>v.id===call.args[0]);assert.ok(record);
    return abi.encodeFunctionResult(call.name,[call.name==='record'?record.record:record.bytes]);
  };
  const adapter=new RegistryAdapter({raw:{request}},{registry:context.registry});
  adapter.context=async()=>({...context,stateStore:store});adapter.fresh=async()=>context.identity;
  return{adapter,records};
}

test('bounded journal history recovers public and encrypted bytes from the NFT namespace without a server index', async () => {
  const text=' exact onchain memory <script>inert</script> 🫧\n';
  const encrypted=await prepareJournal({mode:'encrypted',text,passphrase:'a test-only journal history key',identity:context.identity});
  const {adapter,records}=journalHistoryFixture([text,encrypted.chainText]);
  const first=await adapter.journalPage({cursor:0,limit:1});
  assert.equal(first.count,'2');assert.equal(first.next,1);assert.equal(first.entries[0].text,text);assert.equal(first.entries[0].encrypted,false);assert.equal(first.entries[0].stateId,records[0].id);
  const second=await adapter.journalPage({cursor:first.next,limit:1});assert.equal(second.next,2);assert.equal(second.entries[0].encrypted,true);assert.equal(second.entries[0].text,encrypted.chainText);
  const end=await adapter.journalPage({cursor:2});assert.deepEqual(end.entries,[]);
  await assert.rejects(adapter.journalPage({cursor:3}),/cursor/);await assert.rejects(adapter.journalPage({limit:17}),/page/);
});

test('journal history refuses malformed pagination and records under a substituted schema', async () => {
  await assert.rejects(journalHistoryFixture(['entry'],{malformedPage:true}).adapter.journalPage(),/history page/);
  await assert.rejects(journalHistoryFixture(['entry'],{schema:SCHEMA_B}).adapter.journalPage(),/schema/);
});


test('production adapter reads installation, catalog and journal through the actual SDK ABI exports', async () => {
  const releases = address('55'), stateStore = address('66'), calls = [];
  const interfaces = new Map([
    [context.registry, new Interface(TOKEN_MODULE_ABI)],
    [context.collection, new Interface(COLLECTION_ABI)],
    [context.account, new Interface(ACCOUNT_ABI)],
    [releases, new Interface(RELEASE_ABI)],
    [stateStore, new Interface(STATE_ABI)],
  ]);
  const values = {
    serviceType: [keccak256(toUtf8Bytes('anima.token-module-registry/1'))],
    authorityType: [AUTHORITY_TYPE], collection: [context.collection],
    releases: [releases], stateStore: [stateStore], rootOf: [context.root],
    account: [context.account], ownerOf: [context.owner], owner: [context.owner],
    token: [31337n, context.collection, 1n], state: [3n], isSealed: [false],
    statsOf: [0n, 1n, 0n, 1n], modulesOf: [[MODULE], 1n], moduleCount: [1n],
    historyOf: [[], 0n], historyCount: [0n],
    installation: [{ releaseId: RELEASE_A, stateHead: ZERO_HASH, enabled: true, epoch: 2n }],
    catalog: [[], 0n], releaseCount: [0n], countOf: [0n],
  };
  const request = async ({ method, params = [] }) => {
    if (method === 'eth_chainId') return '0x7a69';
    if (method === 'eth_getBlockByNumber') return { number: context.snapshot.block, hash: context.snapshot.blockHash };
    assert.equal(method, 'eth_call', 'adapter reads must never send or request a signature');
    assert.equal(params[1], context.snapshot.block);
    assert.equal(BigInt(params[0].gas), 10000000n);
    const abi = interfaces.get(params[0].to);
    assert.ok(abi, 'read must target a bound service');
    const call = abi.parseTransaction({ data: params[0].data });
    assert.ok(Object.hasOwn(values, call.name), 'unexpected ABI call: ' + call.name);
    calls.push({ target: params[0].to, method: call.name });
    return abi.encodeFunctionResult(call.name, values[call.name]);
  };
  const wallet = {
    raw: { request }, chainId: 31337n, collection: context.collection, tokenId: 1n,
    account: context.account, address: context.owner, async assertOwner() {},
    prepare() { throw Error('Reads must not prepare a transaction'); },
    send() { throw Error('Reads must not send a transaction'); },
  };
  // These are the production methods and SDK namespace. Only the JSON-RPC wire
  // is provided by this fixture; no adapter/SDK method is replaced.
  const adapter = new RegistryAdapter(wallet, { registry: context.registry, chainId: '31337', collection: context.collection, tokenId: '1' });
  const installed = await adapter.installation(MODULE);
  assert.equal(installed.releaseId, RELEASE_A); assert.equal(installed.epoch, '2');
  const page = await adapter.refresh();
  assert.equal(page.modules.length, 1); assert.equal(page.modules[0].enabled, true);
  assert.deepEqual(page.catalog, []); assert.equal(page.counts.modules, 1);
  const journal = await adapter.journalPage();
  assert.deepEqual(journal.entries, []); assert.equal(journal.count, '0');
  for (const [target, method] of [[context.registry, 'installation'], [releases, 'catalog'], [releases, 'releaseCount'], [stateStore, 'countOf'], [stateStore, 'historyOf']]) {
    assert.ok(calls.some(call => call.target === target && call.method === method), `${method} must reach its actual SDK ABI path`);
  }
});
