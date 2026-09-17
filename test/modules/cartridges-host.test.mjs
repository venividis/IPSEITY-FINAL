import test from 'node:test';
import assert from 'node:assert/strict';
import { parse } from 'parse5';
import { Interface, keccak256, toUtf8Bytes } from '../../web/vendor/ethers.min.js';
import { ACCOUNT_ABI, COLLECTION_ABI, sha256 } from '../../packages/modules/sdk.mjs';
import { recoverOwnedCartridge, assertCartridgeAuthority, mountCartridge } from '../../web/modules/cartridges.mjs';

// These are encoded JSON-RPC fixtures, not an EVM or browser. The native
// contract/browser acceptance suites provide those separate evidence layers.
const addr = n => '0x' + n.toString(16).padStart(40, '0');
const hash = n => '0x' + n.toString(16).padStart(64, '0');
const registryABI = new Interface([
  'function artifact() view returns(address)',
  'function ownerOf(uint256) view returns(address)',
  'function launchManifest(uint256,address) view returns((string manifestJSON,bytes32 contentHash,bytes32 manifestHash,uint64 revision,bool frozen,address holder,address controller,uint256 parentArtifactId,uint256 parentOwnershipEpoch,bool authorized,bool onchainContentAvailable))',
  'function releaseOfCartridge(uint256) view returns(uint256)',
  'function releaseOf(uint256) view returns((address publisher,address archive,bytes32 archiveCodeHash,bytes32 contentHash,bytes32 manifestHash,uint32 byteLength,string manifestJSON,address[] chunks,bytes32[] chunkCodeHashes,uint32[] chunkByteLengths))',
]);
const collectionABI = new Interface(COLLECTION_ABI), accountABI = new Interface(ACCOUNT_ABI);
const bindingABI = new Interface(['function collection() view returns(address)']);

function rpcFixture(size = 49152, prefix = '<!doctype html><html><body><button>Play</button><script>document.title="Cartridge"</script><!--') {
  const identity = { chainId: '31337', collection: addr(1), tokenId: '7', account: addr(2), owner: addr(3), epoch: '4', registry: addr(4) };
  const registry = addr(5), artifact = addr(6), archive = addr(7), cartridgeId = '11', releaseId = '13';
  const suffix = '--></body></html>';
  const html = prefix + 'x'.repeat(size - prefix.length - suffix.length) + suffix;
  const bytes = new TextEncoder().encode(html), chunks = [], codes = new Map();
  codes.set(archive, '0x60006000f3');
  for (let offset = 0; offset < bytes.length; offset += 23000) {
    const address = addr(100 + chunks.length), data = bytes.slice(offset, offset + 23000);
    chunks.push(address); codes.set(address, '0x00' + Buffer.from(data).toString('hex'));
  }
  for (const address of [identity.collection, identity.account, registry, artifact]) codes.set(address, '0x6000');
  const manifestJSON = JSON.stringify({ name: 'Fixture game', version: '1', contentEncoding: 'rawHTML', mimeType: 'text/html;charset=utf-8' });
  const release = { publisher: addr(8), archive, archiveCodeHash: keccak256(codes.get(archive)), contentHash: sha256(bytes), manifestHash: keccak256(toUtf8Bytes(manifestJSON)), byteLength: bytes.length, manifestJSON, chunks,
    chunkCodeHashes: chunks.map(address => keccak256(codes.get(address))), chunkByteLengths: chunks.map(address => (codes.get(address).length - 4) / 2) };
  const launch = { manifestJSON, contentHash: release.contentHash, manifestHash: release.manifestHash, revision: 1, frozen: true, holder: identity.account, controller: identity.owner, parentArtifactId: identity.tokenId, parentOwnershipEpoch: identity.epoch, authorized: true, onchainContentAvailable: true };
  const state = { chainId: '0x7a69', block: '0x2a', blockHash: hash(42), pinnedBlockHash: hash(42), owner: identity.owner, canonicalAccount: identity.account, accountOwner: identity.owner,
    token: [identity.chainId, identity.collection, identity.tokenId], bindingCollection: identity.collection, transfers: 3, releaseId, blockReads: 0 };
  const calls = [];
  const request = async ({ method, params = [] }) => {
    calls.push({ method, params });
    if (method === 'eth_chainId') return state.chainId;
    if (method === 'eth_getBlockByNumber') {
      assert.ok(params[0] === 'latest' || params[0] === state.block, 'only the pinned block or initial latest lookup is read');
      state.blockReads++;
      return { number: state.block, hash: params[0] === 'latest' ? state.blockHash : state.pinnedBlockHash };
    }
    assert.ok(method === 'eth_call' || method === 'eth_getCode', 'recovery has no transaction, log, arbitrary RPC or content-reader path');
    assert.equal(params[1], state.block, 'every contract/code read uses the same pinned block');
    if (method === 'eth_getCode') {
      const code = codes.get(params[0].toLowerCase());
      assert.notEqual(code, undefined, 'only declared identity/archive/chunk code may be read');
      return code;
    }
    const target = params[0].to.toLowerCase();
    let abi, values;
    if (target === identity.collection) { abi = collectionABI; values = { ownerOf: [state.owner], account: [state.canonicalAccount], statsOf: [0, state.transfers, 0, 0] }; }
    else if (target === identity.account) { abi = accountABI; values = { owner: [state.accountOwner], token: state.token }; }
    else if (target === artifact) { abi = bindingABI; values = { collection: [state.bindingCollection] }; }
    else if (target === registry) { abi = registryABI; values = { artifact: [artifact], ownerOf: [launch.holder], launchManifest: [launch], releaseOfCartridge: [state.releaseId], releaseOf: [release] }; }
    else assert.fail('Unexpected contract target: ' + target);
    const call = abi.parseTransaction({ data: params[0].data });
    assert.ok(call && Object.hasOwn(values, call.name), 'only declared authority/release functions may be read');
    if (target === identity.collection && ['account', 'ownerOf', 'statsOf'].includes(call.name)) assert.equal(call.args[0].toString(), identity.tokenId);
    if (target === registry && call.name === 'ownerOf') assert.equal(call.args[0].toString(), cartridgeId);
    if (call.name === 'launchManifest') { assert.equal(call.args[0].toString(), cartridgeId); assert.equal(call.args[1].toLowerCase(), identity.owner); }
    if (call.name === 'releaseOfCartridge') assert.equal(call.args[0].toString(), cartridgeId);
    if (call.name === 'releaseOf') assert.equal(call.args[0].toString(), state.releaseId);
    return abi.encodeFunctionResult(call.name, values[call.name]);
  };
  const options = { request, ...identity, registry, cartridgeId };
  return { request, options, identity, registry, artifact, archive, cartridgeId, releaseId, bytes, html, release, launch, codes, state, calls };
}

for (const size of [49152, 1048576]) test(`encoded RPC fixture recovers the exact ${size}-byte cartridge using only pinned code and authority reads`, async () => {
  const f = rpcFixture(size), result = await recoverOwnedCartridge(f.options);
  assert.deepEqual(result.bytes, f.bytes);
  assert.equal(result.html, f.html);
  assert.equal(result.bytes.length, size);
  const reads = f.calls.filter(call => call.method === 'eth_getCode').map(call => call.params[0].toLowerCase());
  for (const chunk of f.release.chunks) assert.ok(reads.includes(chunk));
  assert.ok(f.state.blockReads >= 2, 'a final block hash recheck detects a reorg after recovery');
});

test('encoded RPC fixture refuses altered archive or chunk code before running recovered bytes', async () => {
  for (const target of ['archive', 'chunk']) {
    const f = rpcFixture(); f.codes.set(target === 'archive' ? f.archive : f.release.chunks[0], '0x6001');
    await assert.rejects(recoverOwnedCartridge(f.options));
  }
});

test('encoded RPC fixture verifies the STOP prefix, exact chunk lengths and full SHA-256 independently', async () => {
  for (const corruption of ['prefix', 'chunkLength', 'totalLength', 'contentHash']) {
    const f = rpcFixture();
    if (corruption === 'prefix') {
      const address = f.release.chunks[0], code = '0x01' + f.codes.get(address).slice(4);
      f.codes.set(address, code); f.release.chunkCodeHashes[0] = keccak256(code);
    }
    if (corruption === 'chunkLength') f.release.chunkByteLengths[0]--;
    if (corruption === 'totalLength') f.release.byteLength--;
    if (corruption === 'contentHash') { f.release.contentHash = hash(99); f.launch.contentHash = hash(99); }
    await assert.rejects(recoverOwnedCartridge(f.options), undefined, corruption);
  }
});

test('encoded RPC fixture refuses inconsistent or substituted manifest commitments', async () => {
  for (const mutate of [
    f => { f.release.manifestJSON = '{"name":"substituted"}'; },
    f => { f.launch.manifestJSON = '{"name":"substituted"}'; },
    f => { f.release.manifestHash = hash(99); f.launch.manifestHash = hash(99); },
    f => { f.launch.contentHash = hash(99); },
  ]) { const f = rpcFixture(); mutate(f); await assert.rejects(recoverOwnedCartridge(f.options)); }
});

test('encoded RPC fixture requires current native ownership, a canonical Reach and the exact account footer domain', async () => {
  for (const mutate of [
    f => { f.state.owner = addr(9); },
    f => { f.state.accountOwner = addr(9); },
    f => { f.state.canonicalAccount = addr(9); },
    f => { f.state.token[0] = '1'; },
    f => { f.state.token[1] = addr(9); },
    f => { f.state.token[2] = '8'; },
    f => { f.state.bindingCollection = addr(9); },
    f => { f.state.transfers = 4; },
    f => { f.state.transfers = 4294967295; },
    f => { f.launch.holder = addr(9); },
    f => { f.launch.controller = addr(9); },
    f => { f.launch.parentArtifactId = '8'; },
    f => { f.launch.parentOwnershipEpoch = '5'; },
    f => { f.launch.authorized = false; },
    f => { f.launch.onchainContentAvailable = false; },
  ]) { const f = rpcFixture(); mutate(f); await assert.rejects(recoverOwnedCartridge(f.options)); }
});

test('encoded RPC fixture rejects unsafe or noncanonical numeric inputs before reading a cartridge', async () => {
  for (const field of ['chainId', 'tokenId', 'epoch', 'cartridgeId']) for (const value of [Number.MAX_SAFE_INTEGER + 1, -1, 1.5, '1e3', '0x1', '01', '0']) {
    const f = rpcFixture();
    await assert.rejects(recoverOwnedCartridge({ ...f.options, [field]: value }), undefined, `${field}=${value}`);
  }
});

test('encoded RPC fixture refuses a changed block hash or chain during recovery', async () => {
  const reorg = rpcFixture(); reorg.state.pinnedBlockHash = hash(99);
  await assert.rejects(recoverOwnedCartridge(reorg.options), /snapshot|block|changed/i);
  const changedChain = rpcFixture(), original = changedChain.request; let reads = 0;
  changedChain.options.request = async input => { if (input.method === 'eth_chainId' && ++reads > 1) return '0x1'; return original(input); };
  await assert.rejects(recoverOwnedCartridge(changedChain.options), /chain|changed/i);
});

test('authority heartbeat rejects a changed release or archive commitment against the reviewed identity', async () => {
  for (const mutate of [f => { f.state.releaseId = '14'; }, f => { f.codes.set(f.archive, '0x6001'); }]) {
    const f = rpcFixture(), expected = { registry: f.registry, cartridgeId: f.cartridgeId, releaseId: f.releaseId, archive: f.archive, archiveCodeHash: f.release.archiveCodeHash };
    mutate(f);
    await assert.rejects(assertCartridgeAuthority(f.request, f.identity, expected));
  }
});

test('encoded RPC fixture rejects empty, oversized and inconsistent chunk tables before allocating content', async () => {
  for (const mutate of [
    f => { f.release.byteLength = 0; },
    f => { f.release.byteLength = 1048577; },
    f => { f.release.chunks = []; },
    f => { f.release.chunks = Array(65).fill(f.release.chunks[0]); },
    f => { f.release.chunkByteLengths = []; },
    f => { f.release.chunkCodeHashes.pop(); },
    f => { f.release.chunkByteLengths[0] = 0; },
    f => { f.release.chunkByteLengths[0] = 23001; },
  ]) { const f = rpcFixture(); mutate(f); await assert.rejects(recoverOwnedCartridge(f.options)); }
});

test('encoded RPC fixture refuses invalid UTF-8 even when every content and code hash matches', async () => {
  const f = rpcFixture(), bytes = f.bytes.slice(); bytes[0] = 0xff;
  const first = f.release.chunks[0], code = '0x00' + Buffer.from(bytes.slice(0, 23000)).toString('hex');
  f.codes.set(first, code); f.release.chunkCodeHashes[0] = keccak256(code);
  f.release.contentHash = sha256(bytes); f.launch.contentHash = f.release.contentHash;
  await assert.rejects(recoverOwnedCartridge(f.options), /UTF-8|encoded data|encoding/i);
});

function fakeDOM() {
  const listeners = new Map(), intervals = new Map(), timeouts = new Map(); let serial = 0, messages = 0;
  const frames = [], document = { createElement(tag) {
    assert.equal(tag, 'iframe');
    const frame = { attributes: new Map(), removed: false, contentWindow: { postMessage() { messages++; } },
      setAttribute(name, value) { this.attributes.set(name, value); },
      remove() { this.removed = true; },
      addEventListener(name, listener) { this['on' + name] = listener; },
      removeEventListener(name) { this['on' + name] = null; },
    }; frames.push(frame); return frame;
  } };
  const container = { ownerDocument: document, children: [], replaceChildren(...children) { this.children = children; } };
  const win = {
    crypto: globalThis.crypto,
    addEventListener(name, callback) { if (!listeners.has(name)) listeners.set(name, new Set()); listeners.get(name).add(callback); },
    removeEventListener(name, callback) { listeners.get(name)?.delete(callback); },
    setInterval(callback, milliseconds) { const id = ++serial; intervals.set(id, { callback, milliseconds }); return id; },
    clearInterval(id) { intervals.delete(id); },
    setTimeout(callback, milliseconds) { const id = ++serial; timeouts.set(id, { callback, milliseconds }); return id; },
    clearTimeout(id) { timeouts.delete(id); },
    MessageChannel: class { constructor() { assert.fail('Raw cartridges must receive no host MessageChannel'); } },
  };
  return { container, win, frames, listeners, intervals, timeouts, get messages() { return messages; } };
}

test('fake DOM cartridge mount installs restrictive frame flags without a wallet or message bridge and destroys its resources', async () => {
  const f = rpcFixture(), recovered = await recoverOwnedCartridge(f.options), dom = fakeDOM();
  const mounted = await mountCartridge({ container: dom.container, recovered, verifyContext: async () => recovered.identity, window: dom.win });
  const frame = mounted.iframe;
  assert.equal(frame.attributes.get('sandbox'), 'allow-scripts');
  assert.equal(frame.attributes.get('referrerpolicy'), 'no-referrer');
  assert.match(frame.attributes.get('allow'), /payment 'none'/);
  assert.equal(dom.messages, 0);
  assert.equal(dom.listeners.get('message')?.size ?? 0, 0);
  assert.ok([...dom.timeouts.values()].some(timer => timer.milliseconds === 300000), 'raw code has a five-minute lifetime');
  mounted.destroy(); mounted.destroy();
  assert.equal(frame.removed, true); assert.equal(dom.intervals.size, 0); assert.equal(dom.timeouts.size, 0);
});

test('fake DOM authority heartbeat removes the frame when native NFT custody becomes stale', async () => {
  const f = rpcFixture(), recovered = await recoverOwnedCartridge(f.options), dom = fakeDOM(); let stale = false;
  const mounted = await mountCartridge({ container: dom.container, recovered, verifyContext: async () => { if (stale) throw Error('NFT custody changed'); return recovered.identity; }, window: dom.win });
  stale = true;
  assert.ok(dom.intervals.size > 0);
  for (const timer of [...dom.intervals.values()]) await timer.callback();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(mounted.iframe.removed, true); assert.equal(dom.intervals.size, 0); assert.equal(dom.timeouts.size, 0);
});

test('fake DOM hard runtime timeout removes the raw frame even without wallet activity', async () => {
  const f = rpcFixture(), recovered = await recoverOwnedCartridge(f.options), dom = fakeDOM();
  const mounted = await mountCartridge({ container: dom.container, recovered, verifyContext: async () => recovered.identity, window: dom.win });
  const timer = [...dom.timeouts.values()].find(timer => timer.milliseconds === 300000); assert.ok(timer);
  await timer.callback();
  assert.equal(mounted.iframe.removed, true); assert.equal(dom.intervals.size, 0); assert.equal(dom.timeouts.size, 0);
});

test('fake DOM mount refuses fabricated recovery objects and closes a frame after a second load', async () => {
  const f = rpcFixture(), recovered = await recoverOwnedCartridge(f.options), dom = fakeDOM();
  assert.throws(() => mountCartridge({ container: dom.container, recovered: { ...recovered }, verifyContext: async () => {}, window: dom.win }), /recovered owned cartridge/);
  const mounted = mountCartridge({ container: dom.container, recovered, verifyContext: async () => {}, window: dom.win });
  mounted.iframe.onload(); assert.equal(mounted.closed, false);
  mounted.iframe.onload(); assert.equal(mounted.closed, true);
  assert.equal(mounted.iframe.removed, true); assert.equal(dom.intervals.size, 0); assert.equal(dom.timeouts.size, 0);
});

test('fake DOM mount places the restrictive CSP before hostile head content even when the head has attributes', async () => {
  const prefix = '<!doctype html><html><head id="hostile-head" data-extra="kept"><script>globalThis.gameStarted=true</script><meta http-equiv="Content-Security-Policy" content="default-src *"><base href="https://outside.invalid/"><script src="https://outside.invalid/run.js"></script></head><body><iframe src="https://outside.invalid/frame"></iframe><form action="https://outside.invalid/send"><input></form><!--';
  const f = rpcFixture(49152, prefix), recovered = await recoverOwnedCartridge(f.options), dom = fakeDOM();
  const mounted = mountCartridge({ container: dom.container, recovered, verifyContext: async () => {}, window: dom.win });
  const walk = node => [node, ...(node.childNodes ?? []).flatMap(walk)], nodes = walk(parse(mounted.iframe.srcdoc));
  const head = nodes.find(node => node.tagName === 'head'), first = head.childNodes[0];
  assert.equal(head.attrs.find(attr => attr.name === 'id').value, 'hostile-head');
  assert.equal(first.tagName, 'meta');
  assert.equal(first.attrs.find(attr => attr.name === 'http-equiv').value.toLowerCase(), 'content-security-policy');
  const policy = first.attrs.find(attr => attr.name === 'content').value;
  assert.match(policy, /default-src 'none'/); assert.match(policy, /connect-src 'none'/);
  assert.match(policy, /script-src 'unsafe-inline'/); assert.doesNotMatch(policy, /nonce-|https:/);
  const policies = nodes.filter(node => node.tagName === 'meta' && node.attrs.some(attr => attr.name === 'http-equiv' && attr.value.toLowerCase() === 'content-security-policy'));
  assert.equal(policies.length, 1, 'user policy is removed and cannot precede or replace the trusted policy');
  const scripts = nodes.filter(node => node.tagName === 'script');
  assert.equal(scripts.length, 1, 'the bundled game script remains, the external script is dropped');
  assert.ok(head.childNodes.indexOf(first) < head.childNodes.indexOf(scripts[0]));
  assert.equal(nodes.some(node => ['iframe', 'base', 'form'].includes(node.tagName)), false);
  mounted.destroy();
});
