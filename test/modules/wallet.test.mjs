import test from 'node:test';
import assert from 'node:assert/strict';
import { Interface } from '../../web/vendor/ethers.min.js';
import { IpseityWallet, IPSEITY_COLLECTION_ABI, IPSEITY_ACCOUNT_ABI, TRANSACTION_GAS_CAP } from '../../web/modules/wallet.mjs';

const address = value => '0x' + value.repeat(20), hash = value => '0x' + value.repeat(32);
const collection = address('11'), account = address('22'), owner = address('33'), other = address('44'), destination = address('55');
function fixture() {
  const state = { owner, selected: owner, chain: 31337n, xfers: 0n, nonce: 0n, footerChain: 31337n, footerCollection: collection, footerToken: 1n, gas: 200000n, targetCode: '0x6000', reject: false, sent: [], calls: [] };
  const core = new Interface(IPSEITY_COLLECTION_ABI), reach = new Interface(IPSEITY_ACCOUNT_ABI);
  const provider = { async request(payload) {
    const { method, params = [] } = payload; state.calls.push(method);
    if (method === 'eth_requestAccounts' || method === 'eth_accounts') return [state.selected];
    if (method === 'eth_chainId') return '0x' + state.chain.toString(16);
    if (method === 'eth_getBlockByNumber') return { number: '0x10', hash: hash('10') };
    if (method === 'eth_getCode') return params[0].toLowerCase() === destination ? state.targetCode : '0x6001';
    if (method === 'eth_estimateGas') return '0x' + state.gas.toString(16);
    if (method === 'eth_sendTransaction') { if (state.reject) throw Error('Wallet rejected this action.'); state.sent.push(params[0]); state.nonce++; return hash('aa'); }
    if (method === 'eth_getTransactionReceipt') return { transactionHash: hash('aa'), status: '0x1', logs: [] };
    if (method === 'eth_call') {
      const tx = params[0], abi = tx.to.toLowerCase() === collection ? core : reach, call = abi.parseTransaction({ data: tx.data });
      const values = { ownerOf: [state.owner], account: [account], statsOf: [0n, state.xfers, 0n, 0n], owner: [state.owner], token: [state.footerChain, state.footerCollection, state.footerToken], state: [state.nonce], isSealed: [false], execute: ['0x'] };
      assert.ok(Object.hasOwn(values, call.name), 'Unexpected authority query ' + call.name);
      return abi.encodeFunctionResult(call.name, values[call.name]);
    }
    throw Error('Unexpected RPC ' + method);
  } };
  return { state, wallet: new IpseityWallet(() => {}, { provider }), reach };
}

test('the native Reach call is simulated and reviewed before the first send, with operation zero and exact native value', async () => {
  const { state, wallet, reach } = fixture();
  const connected = await wallet.connect(collection, 1); assert.equal(connected.epoch, '1'); assert.equal(connected.actionNonce, '0');
  const plan = await wallet.prepare({ target: destination, value: '0.125', data: '0x1234' });
  assert.equal(state.sent.length, 0); assert.equal(plan.transaction.to.toLowerCase(), account);
  const call = reach.parseTransaction({ data: plan.transaction.data });
  assert.deepEqual([...call.args], [destination, 125000000000000000n, '0x1234', 0n]);
  assert.equal(plan.transaction.value, '0x0', 'Native action uses Reach funds, not an implicit EOA top-up.');
  assert.equal(plan.gasLimit, '240000'); assert.ok(Object.isFrozen(plan.transaction));
  const receipt = await wallet.send(); assert.equal(receipt.hash, hash('aa')); assert.equal(state.sent.length, 1);
  assert.equal(BigInt(state.sent[0].gas), 240000n); assert.equal(wallet.plan, null);
  await assert.rejects(wallet.send(), /expired|already/); assert.equal(state.sent.length, 1);
});

test('changed owner, transfer-away-and-back, Reach nonce, code and selected wallet invalidate prepared calls', async () => {
  for (const change of [s => { s.owner = other; }, s => { s.xfers += 2n; }, s => { s.nonce++; }, s => { s.targetCode = '0x6002'; }, s => { s.selected = other; }, s => { s.chain++; }]) {
    const { state, wallet } = fixture(); await wallet.connect(collection, 1); await wallet.prepare({ target: destination }); change(state);
    await assert.rejects(wallet.send()); assert.equal(state.sent.length, 0); assert.equal(wallet.plan, null);
    await assert.rejects(wallet.send(), /expired|already/);
  }
});

test('a rejected wallet request consumes its review and cannot be replayed', async () => {
  const { state, wallet } = fixture(); await wallet.connect(collection, 1); await wallet.prepare({ target: destination }); state.reject = true;
  await assert.rejects(wallet.send(), /rejected/); state.reject = false;
  await assert.rejects(wallet.send(), /expired|already/); assert.equal(state.sent.length, 0);
});

test('the workbench refuses saturated transfer history and a substituted ERC-6551 footer', async () => {
  for (const change of [s => { s.xfers = 2n ** 32n - 1n; }, s => { s.footerCollection = other; }, s => { s.footerToken = 2n; }, s => { s.footerChain = 1n; }, s => { s.owner = other; }]) {
    const { state, wallet } = fixture(); change(state); await assert.rejects(wallet.connect(collection, 1)); assert.equal(wallet.connected, false); assert.equal(state.sent.length, 0);
  }
});

test('gas headroom must fit the transaction cap before any review can be signed', async () => {
  const { state, wallet } = fixture(); await wallet.connect(collection, 1);
  for (const gas of [0n, TRANSACTION_GAS_CAP, TRANSACTION_GAS_CAP + 1n]) {
    state.gas = gas; await assert.rejects(wallet.prepare({ target: destination }), /gas limit/); assert.equal(wallet.plan, null);
  }
  assert.equal(state.sent.length, 0);
});

test('disconnect and a fabricated plan provide no authority to send', async () => {
  const { state, wallet } = fixture(); await wallet.connect(collection, 1); const plan = await wallet.prepare({ target: destination });
  wallet.plan = { ...plan }; await assert.rejects(wallet.send(), /expired|already/);
  await wallet.prepare({ target: destination }); wallet.disconnect(); await assert.rejects(wallet.send()); assert.equal(state.sent.length, 0);
});
