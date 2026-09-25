// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Base64} from "../lib/Base64.sol";

interface IERC20Sovereign {
    function balanceOf(address) external view returns (uint256);
    function transfer(address, uint256) external returns (bool);
    function transferFrom(address, address, uint256) external returns (bool);
}

interface IERC721ReceiverSovereign {
    function onERC721Received(address, address, uint256, bytes calldata) external returns (bytes4);
}

/// @notice A single-address, Ethereum-only programmable NFT collection.
/// @dev All canonical IPSEITY state and execution is held here. External calls
///      are ordinary calls only: this contract deliberately has no delegatecall.
contract SovereignIpseity {
    using Base64 for bytes;

    string public constant name = "Sovereign IPSEITY";
    string public constant symbol = "SIPSE";
    uint256 public constant MAX_SUPPLY = 4096;
    uint256 public immutable chainId;
    address public immutable loader;
    address public immutable royaltyReceiver;
    uint96 public immutable royaltyBps;

    enum Lifecycle { CONSTRUCTING, LOADING_WEBSITE, TESTING, SEALED }
    enum MemoryMode { OWNER_WRITE, USER_WRITE, SESSION_WRITE, APPEND_ONLY, IMMUTABLE, PUBLIC_WRITE, PRIVATE_COMMITMENT }
    Lifecycle public lifecycle;
    uint256 public totalSupply;
    uint32 public websiteChunkCount;
    uint32 public websiteInflatedSize;
    bytes32 public websiteSha256;

    mapping(uint32 => bytes) private _websiteChunks;
    mapping(uint256 => address) private _ownerOf;
    mapping(address => uint256) private _balanceOf;
    mapping(uint256 => address) public getApproved;
    mapping(address => mapping(address => bool)) public isApprovedForAll;
    mapping(address => mapping(uint256 => uint256)) private _ownedTokens;
    mapping(uint256 => uint256) private _ownedIndex;
    mapping(uint256 => uint256) public sectionOf;
    mapping(uint256 => bool) private _soulbound;
    mapping(uint256 => address) private _user;
    mapping(uint256 => uint64) private _userExpires;
    mapping(uint256 => uint64) public custodyEpoch;

    mapping(uint256 => mapping(address => uint256)) private _liquid;
    mapping(uint256 => uint256) private _nativeLiquid;
    mapping(address => uint256) public totalLiability;
    uint256 public totalNativeLiability;
    mapping(address => bool) private _executionTarget;

    struct Lock { address asset; uint128 amount; uint128 minOut; uint64 unlockAt; address beneficiary; bool claimed; bool autoSell; }
    mapping(uint256 => Lock[]) private _locks;
    struct Market { address base; address quote; uint128 baseReserve; uint128 quoteReserve; uint16 feeBps; uint64 bondedUntil; bool open; }
    mapping(uint256 => Market) private _markets;
    struct Memory { bytes32 context; bytes note; uint64 at; }
    mapping(uint256 => Memory[]) private _memories;
    mapping(uint256 => mapping(bytes32 => bytes)) private _memory;
    mapping(uint256 => mapping(bytes32 => MemoryMode)) public memoryMode;
    mapping(uint256 => mapping(bytes32 => bool)) public memoryFrozen;

    struct Session { uint64 expires; uint64 epoch; uint128 nativeCap; uint128 nativeSpent; bytes32 permissionRoot; bool active; }
    mapping(uint256 => mapping(address => Session)) public sessions;
    struct EstatePlan { address heir; uint64 inactivity; uint64 lastProof; uint64 claimableAt; }
    mapping(uint256 => EstatePlan) public estateOf;
    struct Consignment { address agent; uint128 ask; uint16 agentBps; bool active; }
    mapping(uint256 => Consignment) public consignmentOf;
    mapping(address => uint256) public saleCredits;

    event Transfer(address indexed from, address indexed to, uint256 indexed tokenId);
    event Approval(address indexed owner, address indexed approved, uint256 indexed tokenId);
    event ApprovalForAll(address indexed owner, address indexed operator, bool approved);
    event UpdateUser(uint256 indexed tokenId, address indexed user, uint64 expires);
    event MetadataUpdate(uint256 indexed tokenId);
    event Locked(uint256 tokenId); event Unlocked(uint256 tokenId);
    event Deposited(uint256 indexed tokenId, address indexed asset, uint256 amount);
    event Withdrawn(uint256 indexed tokenId, address indexed asset, uint256 amount, address to);
    event AssetLocked(uint256 indexed tokenId, uint256 indexed lockId, address asset, uint256 amount, uint64 unlockAt);
    event Spoken(uint256 indexed tokenId, bytes32 indexed room, uint8 kind, bytes body);
    event MemoryInscribed(uint256 indexed tokenId, bytes32 indexed context, bytes note);
    event Executed(uint256 indexed tokenId, address indexed target, uint256 value, bytes4 selector);
    event AutoSold(uint256 indexed tokenId, uint256 indexed lockId, address assetIn, address assetOut, uint256 amountOut);

    error Unauthorized(); error MissingToken(); error Invalid(); error Sealed(); error TransferFailed(); error Insolvent(); error Reentrant();
    uint256 private _guard = 1;
    modifier nonReentrant() { if (_guard != 1) revert Reentrant(); _guard = 2; _; _guard = 1; }
    modifier onlyLoader() { if (msg.sender != loader) revert Unauthorized(); _; }
    modifier exists(uint256 id) { if (_ownerOf[id] == address(0)) revert MissingToken(); _; }
    modifier onlyHolder(uint256 id) { if (msg.sender != _ownerOf[id]) revert Unauthorized(); _; }

    constructor(address receiver, uint96 bps) {
        if (block.chainid != 1 && block.chainid != 11155111 && block.chainid != 31337) revert Invalid();
        if (receiver == address(0) || bps > 1000) revert Invalid();
        chainId = block.chainid; loader = msg.sender; royaltyReceiver = receiver; royaltyBps = bps;
        lifecycle = Lifecycle.LOADING_WEBSITE;
    }

    function uploadWebsiteChunk(bytes calldata chunk) external onlyLoader {
        if (lifecycle != Lifecycle.LOADING_WEBSITE || chunk.length == 0 || chunk.length > 24_000) revert Invalid();
        _websiteChunks[websiteChunkCount++] = chunk;
    }
    function beginTesting(uint32 inflatedSize, bytes32 digest) external onlyLoader {
        if (lifecycle != Lifecycle.LOADING_WEBSITE || websiteChunkCount == 0 || digest != sha256(_storedDocument())) revert Invalid();
        websiteInflatedSize = inflatedSize; websiteSha256 = digest; lifecycle = Lifecycle.TESTING;
    }
    function seal() external onlyLoader { if (lifecycle != Lifecycle.TESTING) revert Invalid(); lifecycle = Lifecycle.SEALED; }
    function websiteFrozen() external view returns (bool) { return lifecycle == Lifecycle.SEALED; }
    function websiteChunk(uint32 index) external view returns (bytes memory) { return _websiteChunks[index]; }
    function documentHash() external view returns (bytes32) { return websiteSha256; }
    function _storedDocument() internal view returns (bytes memory out) {
        for (uint32 i; i < websiteChunkCount; ++i) out = bytes.concat(out, _websiteChunks[i]);
    }
    /// @notice Browser-ready canonical document. A nonzero inflated size means
    ///         storage contains gzip bytes and this returns a self-contained
    ///         on-chain loader; no network resource is fetched by that loader.
    function document() public view returns (bytes memory) {
        bytes memory stored = _storedDocument();
        if (websiteInflatedSize == 0) return stored;
        return bytes.concat(
            '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>IPSEITY</title></head><body><script>(async()=>{const s="',
            bytes(stored.encode()),
            '";const b=atob(s),u=Uint8Array.from(b,c=>c.charCodeAt(0));const r=new Response(new Blob([u]).stream().pipeThrough(new DecompressionStream("gzip")));document.open();document.write(await r.text());document.close()})().catch(e=>document.body.textContent="IPSEITY inflation failed: "+e)</script></body></html>'
        );
    }

    function mintTo(address to) external onlyLoader returns (uint256 id) {
        if (lifecycle != Lifecycle.SEALED || to == address(0) || totalSupply == MAX_SUPPLY) revert Invalid();
        id = ++totalSupply; _mint(to, id); sectionOf[id] = uint256(keccak256(abi.encodePacked(block.prevrandao, id, to))) & ((uint256(1) << 128) - 1);
    }
    function ownerOf(uint256 id) public view returns (address owner_) { owner_ = _ownerOf[id]; if (owner_ == address(0)) revert MissingToken(); }
    function balanceOf(address owner_) external view returns (uint256) { if (owner_ == address(0)) revert Invalid(); return _balanceOf[owner_]; }
    function tokenByIndex(uint256 index) external view returns (uint256) { if (index >= totalSupply) revert Invalid(); return index + 1; }
    function tokenOfOwnerByIndex(address owner_, uint256 index) external view returns (uint256) { if (index >= _balanceOf[owner_]) revert Invalid(); return _ownedTokens[owner_][index]; }
    function approve(address to, uint256 id) external { address o = ownerOf(id); if (msg.sender != o && !isApprovedForAll[o][msg.sender]) revert Unauthorized(); getApproved[id] = to; emit Approval(o, to, id); }
    function setApprovalForAll(address op, bool yes) external { if (op == msg.sender) revert Invalid(); isApprovedForAll[msg.sender][op] = yes; emit ApprovalForAll(msg.sender, op, yes); }
    function transferFrom(address from, address to, uint256 id) public { _transfer(from, to, id); }
    function safeTransferFrom(address from, address to, uint256 id) external { safeTransferFrom(from, to, id, ""); }
    function safeTransferFrom(address from, address to, uint256 id, bytes memory data) public {
        _transfer(from, to, id);
        if (to.code.length != 0 && IERC721ReceiverSovereign(to).onERC721Received(msg.sender, from, id, data) != IERC721ReceiverSovereign.onERC721Received.selector) revert Invalid();
    }
    function _mint(address to, uint256 id) internal { _ownerOf[id] = to; _add(to, id); emit Transfer(address(0), to, id); }
    function _transfer(address from, address to, uint256 id) internal {
        address o = ownerOf(id); if (o != from || to == address(0) || _soulbound[id] || consignmentOf[id].active) revert Invalid();
        if (msg.sender != o && msg.sender != getApproved[id] && !isApprovedForAll[o][msg.sender]) revert Unauthorized();
        delete getApproved[id]; _remove(from, id); _ownerOf[id] = to; _add(to, id); unchecked { ++custodyEpoch[id]; }
        delete _user[id]; delete _userExpires[id]; emit Transfer(from, to, id); emit UpdateUser(id, address(0), 0);
    }
    function _add(address to, uint256 id) internal { uint256 n = _balanceOf[to]++; _ownedTokens[to][n] = id; _ownedIndex[id] = n; }
    function _remove(address from, uint256 id) internal { uint256 last = --_balanceOf[from]; uint256 index = _ownedIndex[id]; if (index != last) { uint256 moved = _ownedTokens[from][last]; _ownedTokens[from][index] = moved; _ownedIndex[moved] = index; } delete _ownedTokens[from][last]; }

    function setUser(uint256 id, address user_, uint64 expires_) external onlyHolder(id) { _user[id] = user_; _userExpires[id] = expires_; emit UpdateUser(id, user_, expires_); }
    function userOf(uint256 id) public view returns (address) { return _userExpires[id] >= block.timestamp ? _user[id] : address(0); }
    function userExpires(uint256 id) external view returns (uint256) { return _userExpires[id]; }
    function setLocked(uint256 id, bool yes) external onlyHolder(id) { _soulbound[id] = yes; if (yes) emit Locked(id); else emit Unlocked(id); }
    function locked(uint256 id) external view returns (bool) { return _soulbound[id]; }
    function isTransferable(uint256 id, address, address) external view returns (bool) { return _ownerOf[id] != address(0) && !_soulbound[id] && !consignmentOf[id].active; }
    function commit(uint256 id, uint256 word) external exists(id) { if (msg.sender != _ownerOf[id] && msg.sender != userOf(id)) revert Unauthorized(); if (word >> 128 != 0 || uint8(word >> 112) >= 8) revert Invalid(); sectionOf[id] = word; emit MetadataUpdate(id); }

    function depositETH(uint256 id) external payable exists(id) { if (msg.value == 0) revert Invalid(); _nativeLiquid[id] += msg.value; totalNativeLiability += msg.value; emit Deposited(id, address(0), msg.value); }
    function depositERC20(uint256 id, address asset, uint256 amount) external nonReentrant exists(id) returns (uint256 credited) {
        if (_executionTarget[asset]) revert Invalid();
        uint256 before_ = IERC20Sovereign(asset).balanceOf(address(this)); if (!IERC20Sovereign(asset).transferFrom(msg.sender, address(this), amount)) revert TransferFailed();
        credited = IERC20Sovereign(asset).balanceOf(address(this)) - before_; if (credited == 0) revert Invalid(); _liquid[id][asset] += credited; totalLiability[asset] += credited; emit Deposited(id, asset, credited);
    }
    function liquidBalance(uint256 id, address asset) external view returns (uint256) { return asset == address(0) ? _nativeLiquid[id] : _liquid[id][asset]; }
    function withdraw(uint256 id, address asset, uint256 amount, address to) external nonReentrant onlyHolder(id) {
        if (to == address(0)) revert Invalid();
        if (asset == address(0)) { if (_nativeLiquid[id] < amount) revert Invalid(); _nativeLiquid[id] -= amount; totalNativeLiability -= amount; (bool ok,) = to.call{value: amount}(""); if (!ok) revert TransferFailed(); }
        else { if (_liquid[id][asset] < amount) revert Invalid(); _liquid[id][asset] -= amount; totalLiability[asset] -= amount; if (!IERC20Sovereign(asset).transfer(to, amount)) revert TransferFailed(); _solvent(asset); }
        emit Withdrawn(id, asset, amount, to);
    }
    function unassigned(address asset) external view returns (uint256) { uint256 actual = asset == address(0) ? address(this).balance : IERC20Sovereign(asset).balanceOf(address(this)); uint256 owed = asset == address(0) ? totalNativeLiability : totalLiability[asset]; return actual > owed ? actual - owed : 0; }

    function lockAsset(uint256 id, address asset, uint256 amount, uint64 unlockAt) external onlyHolder(id) returns (uint256 lockId) {
        if (amount == 0 || unlockAt <= block.timestamp) revert Invalid(); if (asset == address(0)) { if (_nativeLiquid[id] < amount) revert Invalid(); _nativeLiquid[id] -= amount; } else { if (_liquid[id][asset] < amount) revert Invalid(); _liquid[id][asset] -= amount; }
        lockId = _locks[id].length; _locks[id].push(Lock(asset, uint128(amount), 0, unlockAt, msg.sender, false, false)); emit AssetLocked(id, lockId, asset, amount, unlockAt);
    }
    function lockOf(uint256 id, uint256 lockId) external view returns (Lock memory) { return _locks[id][lockId]; }
    function lockCount(uint256 id) external view returns (uint256) { return _locks[id].length; }
    function extendLock(uint256 id, uint256 lockId, uint64 until) external onlyHolder(id) { Lock storage l = _locks[id][lockId]; if (until <= l.unlockAt || l.claimed) revert Invalid(); l.unlockAt = until; }
    function transferLockClaim(uint256 id, uint256 lockId, address beneficiary) external onlyHolder(id) { if (beneficiary == address(0) || _locks[id][lockId].claimed) revert Invalid(); _locks[id][lockId].beneficiary = beneficiary; }
    function claimLock(uint256 id, uint256 lockId) external nonReentrant { Lock storage l = _locks[id][lockId]; if (l.claimed || block.timestamp < l.unlockAt || msg.sender != l.beneficiary) revert Unauthorized(); l.claimed = true; uint256 amount = l.amount; if (l.asset == address(0)) { totalNativeLiability -= amount; (bool ok,) = msg.sender.call{value: amount}(""); if (!ok) revert TransferFailed(); } else { totalLiability[l.asset] -= amount; if (!IERC20Sovereign(l.asset).transfer(msg.sender, amount)) revert TransferFailed(); _solvent(l.asset); } }

    function openMarket(uint256 id, address base, address quote, uint16 feeBps) external onlyHolder(id) { if (base == quote || feeBps > 1000 || _markets[id].open) revert Invalid(); _markets[id] = Market(base, quote, 0, 0, feeBps, 0, true); }
    function marketOf(uint256 id) external view returns (Market memory) { return _markets[id]; }
    function depositMarket(uint256 id, uint256 baseAmount, uint256 quoteAmount) external onlyHolder(id) { Market storage m = _markets[id]; if (!m.open || _liquid[id][m.base] < baseAmount || _liquid[id][m.quote] < quoteAmount) revert Invalid(); _liquid[id][m.base] -= baseAmount; _liquid[id][m.quote] -= quoteAmount; m.baseReserve += uint128(baseAmount); m.quoteReserve += uint128(quoteAmount); }
    function quoteMarket(uint256 id, bool baseIn, uint256 amountIn) public view returns (uint256) { Market memory m = _markets[id]; uint256 x = baseIn ? m.baseReserve : m.quoteReserve; uint256 y = baseIn ? m.quoteReserve : m.baseReserve; uint256 a = amountIn * (10_000 - m.feeBps); return y * a / (x * 10_000 + a); }
    function swapMarket(uint256 id, bool baseIn, uint256 amountIn, uint256 minOut, address to, uint256 deadline) external nonReentrant returns (uint256 out) {
        if (block.timestamp > deadline || to == address(0)) revert Invalid(); Market storage m = _markets[id]; address input = baseIn ? m.base : m.quote; address output = baseIn ? m.quote : m.base; out = quoteMarket(id, baseIn, amountIn); if (!m.open || out < minOut || out == 0) revert Invalid();
        uint256 before_ = IERC20Sovereign(input).balanceOf(address(this)); if (!IERC20Sovereign(input).transferFrom(msg.sender, address(this), amountIn)) revert TransferFailed(); uint256 got = IERC20Sovereign(input).balanceOf(address(this)) - before_; if (got != amountIn) revert Invalid();
        if (baseIn) { m.baseReserve += uint128(got); m.quoteReserve -= uint128(out); } else { m.quoteReserve += uint128(got); m.baseReserve -= uint128(out); }
        totalLiability[input] += got; totalLiability[output] -= out; if (!IERC20Sovereign(output).transfer(to, out)) revert TransferFailed(); _solvent(output);
    }
    function swapMarketAndLock(uint256 id, bool baseIn, uint256 amountIn, uint256 minOut, uint64 unlockAt, bool autoSell, uint128 autoSellMinOut, uint256 deadline) external nonReentrant returns (uint256 out, uint256 lockId) {
        if (block.timestamp > deadline || unlockAt <= block.timestamp) revert Invalid(); Market storage m = _markets[id]; address input = baseIn ? m.base : m.quote; address output = baseIn ? m.quote : m.base; out = quoteMarket(id, baseIn, amountIn); if (!m.open || out < minOut || out == 0) revert Invalid();
        uint256 before_ = IERC20Sovereign(input).balanceOf(address(this)); if (!IERC20Sovereign(input).transferFrom(msg.sender,address(this),amountIn)) revert TransferFailed(); uint256 got=IERC20Sovereign(input).balanceOf(address(this))-before_; if(got!=amountIn) revert Invalid();
        if(baseIn){m.baseReserve+=uint128(got);m.quoteReserve-=uint128(out);}else{m.quoteReserve+=uint128(got);m.baseReserve-=uint128(out);} totalLiability[input]+=got;
        lockId=_locks[id].length;_locks[id].push(Lock(output,uint128(out),autoSellMinOut,unlockAt,msg.sender,false,autoSell));emit AssetLocked(id,lockId,output,out,unlockAt);
    }
    function executeAutoSellLock(uint256 id,uint256 lockId) external nonReentrant returns(uint256 out){Lock storage l=_locks[id][lockId];Market storage m=_markets[id];if(l.claimed||!l.autoSell||block.timestamp<l.unlockAt)revert Invalid();bool baseIn;if(l.asset==m.base)baseIn=true;else if(l.asset==m.quote)baseIn=false;else revert Invalid();out=quoteMarket(id,baseIn,l.amount);if(out<l.minOut||out==0)revert Invalid();l.claimed=true;address output=baseIn?m.quote:m.base;if(baseIn){m.baseReserve+=l.amount;m.quoteReserve-=uint128(out);}else{m.quoteReserve+=l.amount;m.baseReserve-=uint128(out);}_liquid[id][output]+=out;emit AutoSold(id,lockId,l.asset,output,out);}


    function speak(uint256 id, bytes32 room, uint8 kind, bytes calldata body) external onlyHolder(id) { if (body.length > 4096) revert Invalid(); emit Spoken(id, room, kind, body); }
    function inscribeMemory(uint256 id, bytes32 context, bytes calldata note) external onlyHolder(id) { if (note.length > 4096) revert Invalid(); _memories[id].push(Memory(context, note, uint64(block.timestamp))); emit MemoryInscribed(id, context, note); }
    function memoryCount(uint256 id) external view returns (uint256) { return _memories[id].length; }
    function memoryAt(uint256 id, uint256 index) external view returns (Memory memory) { return _memories[id][index]; }
    function readMemory(uint256 id, bytes32 key) external view returns (bytes memory) { return _memory[id][key]; }
    function writeMemory(uint256 id, bytes32 key, bytes calldata value, MemoryMode mode) external exists(id) { MemoryMode old = memoryMode[id][key]; if (memoryFrozen[id][key]) revert Sealed(); if (old == MemoryMode.PUBLIC_WRITE) {} else if (old == MemoryMode.USER_WRITE) { if (msg.sender != userOf(id) && msg.sender != _ownerOf[id]) revert Unauthorized(); } else if (msg.sender != _ownerOf[id]) revert Unauthorized(); if (old == MemoryMode.APPEND_ONLY) _memory[id][key] = bytes.concat(_memory[id][key], value); else _memory[id][key] = value; memoryMode[id][key] = mode; }
    function freezeMemory(uint256 id, bytes32 key) external onlyHolder(id) { memoryFrozen[id][key] = true; memoryMode[id][key] = MemoryMode.IMMUTABLE; }

    function grantSession(uint256 id, address key, uint64 expires_, uint128 nativeCap, bytes32 root) external onlyHolder(id) { if (key == address(0) || expires_ <= block.timestamp) revert Invalid(); sessions[id][key] = Session(expires_, custodyEpoch[id], nativeCap, 0, root, true); }
    function revokeSession(uint256 id, address key) external onlyHolder(id) { sessions[id][key].active = false; }
    function executeAsToken(uint256 id, address target, uint256 value, bytes calldata data) external nonReentrant onlyHolder(id) returns (bytes memory) { return _execute(id, target, value, data); }
    function executeSession(uint256 id, address target, uint256 value, bytes calldata data, bytes32[] calldata proof) external nonReentrant returns (bytes memory) {
        Session storage s = sessions[id][msg.sender]; bytes32 leaf = keccak256(abi.encode(target, data.length >= 4 ? bytes4(data[:4]) : bytes4(0)));
        if (!s.active || s.expires < block.timestamp || s.epoch != custodyEpoch[id] || !_verify(leaf, proof, s.permissionRoot) || uint256(s.nativeSpent) + value > s.nativeCap) revert Unauthorized(); s.nativeSpent += uint128(value); return _execute(id, target, value, data);
    }
    function _execute(uint256 id, address target, uint256 value, bytes calldata data) internal returns (bytes memory result) { if (target == address(this) || totalLiability[target] != 0 || _nativeLiquid[id] < value) revert Invalid(); _executionTarget[target] = true; _nativeLiquid[id] -= value; totalNativeLiability -= value; (bool ok, bytes memory ret) = target.call{value: value}(data); if (!ok) assembly ("memory-safe") { revert(add(ret, 32), mload(ret)) } emit Executed(id, target, value, data.length >= 4 ? bytes4(data[:4]) : bytes4(0)); return ret; }
    function _verify(bytes32 h, bytes32[] calldata proof, bytes32 root) internal pure returns (bool) { for (uint256 i; i < proof.length; ++i) h = h < proof[i] ? keccak256(abi.encodePacked(h, proof[i])) : keccak256(abi.encodePacked(proof[i], h)); return h == root; }

    function arrangeEstate(uint256 id, address heir, uint64 inactivity) external onlyHolder(id) { if (heir == address(0) || inactivity < 30 days) revert Invalid(); estateOf[id] = EstatePlan(heir, inactivity, uint64(block.timestamp), 0); }
    function stillHere(uint256 id) external onlyHolder(id) { EstatePlan storage e = estateOf[id]; e.lastProof = uint64(block.timestamp); e.claimableAt = 0; }
    function summonEstate(uint256 id) external { EstatePlan storage e = estateOf[id]; if (msg.sender != e.heir || block.timestamp < e.lastProof + e.inactivity) revert Unauthorized(); e.claimableAt = uint64(block.timestamp + 7 days); }
    function claimEstate(uint256 id) external { EstatePlan storage e = estateOf[id]; if (msg.sender != e.heir || e.claimableAt == 0 || block.timestamp < e.claimableAt) revert Unauthorized(); address from = ownerOf(id); delete estateOf[id]; _remove(from, id); _ownerOf[id] = msg.sender; _add(msg.sender, id); unchecked { ++custodyEpoch[id]; } emit Transfer(from, msg.sender, id); }
    function consign(uint256 id, address agent, uint128 ask, uint16 agentBps) external onlyHolder(id) { if (agent == address(0) || ask == 0 || agentBps > 2000) revert Invalid(); consignmentOf[id] = Consignment(agent, ask, agentBps, true); }
    function revokeConsignment(uint256 id) external onlyHolder(id) { delete consignmentOf[id]; }
    function buy(uint256 id) external payable { Consignment memory c = consignmentOf[id]; if (!c.active || msg.value != c.ask) revert Invalid(); address seller = ownerOf(id); delete consignmentOf[id]; uint256 fee = msg.value * c.agentBps / 10_000; saleCredits[c.agent] += fee; saleCredits[seller] += msg.value - fee; totalNativeLiability += msg.value; _remove(seller, id); _ownerOf[id] = msg.sender; _add(msg.sender, id); unchecked { ++custodyEpoch[id]; } emit Transfer(seller, msg.sender, id); }
    function claimSaleCredit() external nonReentrant { uint256 amount = saleCredits[msg.sender]; saleCredits[msg.sender] = 0; totalNativeLiability -= amount; (bool ok,) = msg.sender.call{value: amount}(""); if (!ok) revert TransferFailed(); }

    struct KeyValue { string key; string value; }
    /// @notice ERC-6860 discovery: route URL resources through ERC-5219.
    /// @dev Without this exact word standards-aware clients fall back to
    ///      treating each path segment as a Solidity method name.
    function resolveMode() external pure returns (bytes32) { return "5219"; }
    function request(string[] calldata resource, KeyValue[] calldata) external view returns (uint16, string memory, KeyValue[] memory headers) { bytes memory page = document(); if (page.length == 0) return (404, "not found", headers); if (resource.length != 0 && keccak256(bytes(resource[0])) != keccak256("token")) return (404, "not found", headers); headers = new KeyValue[](2); headers[0] = KeyValue("Content-Type", "text/html; charset=utf-8"); headers[1] = KeyValue("Cache-Control", "public, immutable"); return (200, string(page), headers); }
    function tokenURI(uint256 id) external view exists(id) returns (string memory) { string memory page = document().encode(); return string.concat("data:application/json;base64,", bytes(string.concat('{"name":"Sovereign IPSEITY #', _uint(id), '","description":"A single-address programmable Ethereum NFT.","animation_url":"data:text/html;base64,', page, '"}')).encode()); }
    function contractURI() external view returns (string memory) { return "data:application/json,{\"name\":\"Sovereign IPSEITY\",\"description\":\"Single-address Ethereum-native programmable objects\"}"; }
    function royaltyInfo(uint256, uint256 price) external view returns (address, uint256) { return (royaltyReceiver, price * royaltyBps / 10_000); }
    function supportsInterface(bytes4 x) external pure returns (bool) { return x == 0x01ffc9a7 || x == 0x80ac58cd || x == 0x5b5e139f || x == 0x780e9d63 || x == 0x2a55205a || x == 0xad092b5c || x == 0xb45a3c0e || x == 0x49064906 || x == 0x6b61a747 || x == 0x385242d2; }
    function _solvent(address asset) internal view { if (IERC20Sovereign(asset).balanceOf(address(this)) < totalLiability[asset]) revert Insolvent(); }
    function _uint(uint256 v) internal pure returns (string memory) { if (v == 0) return "0"; uint256 n = v; uint256 len; while (n != 0) { ++len; n /= 10; } bytes memory b = new bytes(len); while (v != 0) { b[--len] = bytes1(uint8(48 + v % 10)); v /= 10; } return string(b); }
    receive() external payable { revert Invalid(); }
}
