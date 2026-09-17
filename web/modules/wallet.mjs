/** Owner-reviewed calls through IPSEITY's existing Reach. No account replacement,
 * session grant, delegatecall, signing key, or hosted provider is introduced. */
import { Interface, getAddress, keccak256, parseEther } from '../vendor/ethers.min.js';
import { pinSnapshot, readCall, assertSnapshot } from '../../packages/modules/sdk.mjs';

export const IPSEITY_COLLECTION_ABI = [
  'function ownerOf(uint256) view returns(address)',
  'function account(uint256) view returns(address)',
  'function statsOf(uint256) view returns(uint256 ops,uint256 xfers,uint256 strata,uint256 open)',
];
export const IPSEITY_ACCOUNT_ABI = [
  'function owner() view returns(address)',
  'function token() view returns(uint256 chainId,address tokenContract,uint256 tokenId)',
  'function state() view returns(uint256)',
  'function isSealed() view returns(bool)',
  'function execute(address to,uint256 value,bytes data,uint8 operation) payable returns(bytes)',
];
export const TRANSACTION_GAS_CAP = 2n ** 24n;
const accountInterface = new Interface(IPSEITY_ACCOUNT_ABI);
const lower = value => String(value).toLowerCase();
const quantity = value => '0x' + BigInt(value).toString(16);
const equal = (a, b) => lower(a) === lower(b);
const fields = ['chainId', 'collection', 'tokenId', 'account', 'owner', 'epoch', 'actionNonce', 'sealed', 'collectionCodeHash', 'accountCodeHash'];
export function sameWalletContext(a, b) { return !!a && !!b && fields.every(field => equal(a[field], b[field])); }

/** One coherent public-chain snapshot; the chosen RPC is still the chain-view trust boundary. */
export async function readIpseityAuthority(request, { chainId, collection, tokenId }) {
  collection = getAddress(collection); tokenId = BigInt(tokenId);
  if (tokenId <= 0n) throw Error('Token ID must be positive.');
  const snapshot = await pinSnapshot(request, chainId);
  const call = (to, abi, method, args = []) => readCall(request, snapshot, to, abi, method, args);
  const [owner] = await call(collection, IPSEITY_COLLECTION_ABI, 'ownerOf', [tokenId]);
  const [account] = await call(collection, IPSEITY_COLLECTION_ABI, 'account', [tokenId]);
  const stats = await call(collection, IPSEITY_COLLECTION_ABI, 'statsOf', [tokenId]);
  // IPSEITY's public transfer counter saturates. Once it does, it cannot prove
  // custody continuity, so these companion actions stop instead of reusing an epoch.
  if (stats[1] >= 2n ** 32n - 1n) throw Error('The NFT transfer counter is exhausted; module custody cannot be verified.');
  const [currentOwner] = await call(account, IPSEITY_ACCOUNT_ABI, 'owner');
  const footer = await call(account, IPSEITY_ACCOUNT_ABI, 'token');
  if (footer[0] !== BigInt(chainId) || !equal(footer[1], collection) || footer[2] !== tokenId || !equal(currentOwner, owner)) throw Error('The Reach footer or controller does not match this NFT.');
  const [actionNonce] = await call(account, IPSEITY_ACCOUNT_ABI, 'state');
  const [sealed] = await call(account, IPSEITY_ACCOUNT_ABI, 'isSealed');
  const code = async address => {
    const bytes = await request({ method: 'eth_getCode', params: [address, snapshot.block] });
    if (typeof bytes !== 'string' || !/^0x(?:[a-f0-9]{2})+$/i.test(bytes)) throw Error('The NFT or its Reach has no deployed code.');
    return keccak256(bytes);
  };
  const collectionCodeHash = await code(collection), accountCodeHash = await code(account);
  await assertSnapshot(request, snapshot);
  return { chainId: String(chainId), collection, tokenId: String(tokenId), account: getAddress(account), owner: getAddress(owner),
    currentOwner: getAddress(currentOwner), epoch: String(stats[1] + 1n), actionNonce: String(actionNonce), mode: 0,
    sealed, collectionCodeHash, accountCodeHash, snapshot };
}

export class IpseityWallet {
  #review = null;
  constructor(onChange = () => {}, { provider, window: win = globalThis.window } = {}) {
    this.onChange = onChange; this.injected = provider; this.window = win; this.connected = false; this.revision = 0; this.plan = null;
    this.invalidation = () => { this.connected = false; this.plan = null; this.#review = null; this.revision++; this.onChange('Wallet or network changed. Connect this NFT again.', 'invalidate'); };
  }
  async connect(collection, tokenId) {
    this.disconnect(); const revision = this.revision;
    const raw = this.injected ?? this.window?.ethereum;
    if (!raw?.request) throw Error('Open this workbench in a wallet-enabled browser.');
    this.raw = raw; raw.on?.('accountsChanged', this.invalidation); raw.on?.('chainChanged', this.invalidation);
    const accounts = await raw.request({ method: 'eth_requestAccounts' });
    if (!Array.isArray(accounts) || !accounts.length) throw Error('Choose the wallet that owns this NFT.');
    const address = getAddress(accounts[0]), chainId = BigInt(await raw.request({ method: 'eth_chainId' })).toString();
    const context = await readIpseityAuthority(payload => raw.request(payload), { chainId, collection, tokenId });
    if (revision !== this.revision) throw Error('Wallet selection changed during connection.');
    if (!equal(address, context.owner)) throw Error('This wallet does not own the selected NFT.');
    Object.assign(this, context, { address, connected: true }); this.snapshot = context;
    return context;
  }
  disconnect() {
    this.raw?.removeListener?.('accountsChanged', this.invalidation); this.raw?.removeListener?.('chainChanged', this.invalidation);
    this.connected = false; this.plan = null; this.#review = null; this.revision++;
  }
  async assertOwner() {
    if (!this.connected) throw Error('Connect the NFT owner before reviewing an action.');
    const revision = this.revision, accounts = await this.raw.request({ method: 'eth_accounts' });
    if (!Array.isArray(accounts) || !accounts.length || !equal(accounts[0], this.address)) { this.invalidation(); throw Error('The selected wallet changed.'); }
    const current = await readIpseityAuthority(payload => this.raw.request(payload), this);
    if (revision !== this.revision || !equal(current.owner, this.address) || !equal(current.account, this.account)) throw Error('NFT ownership or its canonical Reach changed.');
    return current;
  }
  async prepare({ target, value = '0', data = '0x' }) {
    this.plan = null; this.#review = null; const revision = this.revision;
    target = getAddress(target);
    if (/^0x0{40}$/i.test(target) || !/^0x(?:[a-f0-9]{2}){0,131072}$/i.test(data)) throw Error('Invalid action target or calldata.');
    const wei = parseEther(String(value));
    if (wei < 0n || wei >= 2n ** 256n) throw Error('Invalid native value.');
    const context = await this.assertOwner();
    const transaction = Object.freeze({ from: this.address, to: context.account, value: '0x0', chainId: quantity(context.chainId),
      data: accountInterface.encodeFunctionData('execute', [target, wei, data, 0]) });
    const code = await this.raw.request({ method: 'eth_getCode', params: [target, context.snapshot.block] });
    const targetCodeHash = keccak256(code);
    await this.raw.request({ method: 'eth_call', params: [transaction, 'latest'] });
    const gas = BigInt(await this.raw.request({ method: 'eth_estimateGas', params: [transaction] }));
    const gasLimit = gas * 120n / 100n;
    if (gas <= 0n || gasLimit > TRANSACTION_GAS_CAP) throw Error('This action exceeds the supported transaction gas limit.');
    const current = await this.assertOwner();
    if (revision !== this.revision || !sameWalletContext(context, current)) throw Error('NFT state changed while preparing the review.');
    const plan = Object.freeze({ context: Object.freeze(context), transaction, target, targetCodeHash, gas: String(gas), gasLimit: String(gasLimit), revision, createdAt: Date.now() });
    this.plan = plan; this.#review = plan; return plan;
  }
  async send() {
    const plan = this.plan; this.plan = null;
    const valid = plan && this.#review === plan; this.#review = null;
    if (!valid || plan.revision !== this.revision || Date.now() - plan.createdAt > 180000) throw Error('This review expired or has already been used.');
    const current = await this.assertOwner();
    if (!sameWalletContext(plan.context, current)) throw Error('NFT owner, custody, Reach state or code changed after review.');
    const code = await this.raw.request({ method: 'eth_getCode', params: [plan.target, current.snapshot.block] });
    if (keccak256(code) !== plan.targetCodeHash) throw Error('The reviewed destination code changed.');
    await this.raw.request({ method: 'eth_call', params: [plan.transaction, 'latest'] });
    if (plan.revision !== this.revision || !this.connected) throw Error('Wallet changed after review.');
    const hash = await this.raw.request({ method: 'eth_sendTransaction', params: [{ ...plan.transaction, gas: quantity(plan.gasLimit) }] });
    if (!/^0x[0-9a-f]{64}$/i.test(hash)) throw Error('Wallet returned an invalid transaction hash.');
    const deadline = Date.now() + 120000;
    while (Date.now() < deadline) {
      const receipt = await this.raw.request({ method: 'eth_getTransactionReceipt', params: [hash] });
      if (receipt) { if (BigInt(receipt.status) !== 1n) throw Error('The reviewed transaction reverted.'); return { ...receipt, hash }; }
      await new Promise(resolve => setTimeout(resolve, 500));
    }
    throw Error('Transaction submitted: ' + hash + '. The receipt is pending; refresh chain history before submitting again.');
  }
}
