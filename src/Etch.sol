// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Shard} from "./lib/Shard.sol";

interface IIpseityEtch {
    function ownerOf(uint256 id) external view returns (address);
    function account(uint256 id) external view returns (address);
    function statsOf(uint256 id) external view returns (uint256 ops, uint256 xfers, uint256 strata, uint256 open);
}

/*───────────────────────────────────────────────────────────────────────────
  What it remembers is not what its holder chooses to exhibit.

  Bytes, authors and digests are written once. Listing is reversible until
  sealed; an exhibition expires and dies on transfer. Retraction never
  removes bytes from the chain. This satellite needs neither a curator nor
  a change to the token, either hand, the Engine or the Renderer.

  This first store has one shard per leaf. next is reserved and always zero;
  DATA continuation and renderer traits are not claimed by this version.
───────────────────────────────────────────────────────────────────────────*/
contract Etch {
    IIpseityEtch public immutable HUB;

    uint8 public constant MEMO = 1;
    uint8 public constant NOTE = 2;
    uint8 public constant DATA = 3;
    uint8 public constant GLYPH = 4;
    uint8 public constant TERM = 5;
    uint256 public constant MAX_BODY = 24_575;
    uint256 public constant MAX_MEMO = 1_024;
    uint256 public constant MAX_NOTE = 4_096;
    uint256 public constant MAX_GLYPH = 512;
    uint256 public constant MAX_TERM = 512;
    uint256 public constant MAX_LEAVES = 256;
    uint256 public constant MAX_PER_EPOCH = 32;
    uint64 public constant MAX_SHOW = 180 days;

    struct Leaf {
        address ptr;
        uint24 size;
        uint32 bn;
        uint8 kind;
        uint8 flags; // bit0 listed, bit1 sealed
        uint16 next;
    }

    error NotAuthorised();
    error InvalidHub();
    error Refused(uint16 why);
    error Full();
    error EpochFull();
    error Missing();
    error Sealed();
    error Unlisted();
    error NotMemory();
    error BadExpiry();
    error TooLate();

    mapping(uint256 => Leaf[]) private _leaf;
    mapping(uint256 => mapping(uint256 => bytes32)) private _digest;
    mapping(uint256 => mapping(uint256 => address)) private _by;
    mapping(uint256 => bytes32) private _root;
    mapping(uint256 => uint64) private _epoch; // count << 32 | transfers
    mapping(uint256 => uint128) private _show; // (index+1) << 96 | until << 32 | transfers

    event Inscribed(uint256 indexed id, uint256 indexed index, uint8 indexed kind,
        address ptr, uint32 size, bytes32 digest, address by, bytes32 root);
    event Listed(uint256 indexed id, uint256 indexed index, bool listed);
    event LeafSealed(uint256 indexed id, uint256 indexed index);
    event Shown(uint256 indexed id, uint256 index, uint64 until, uint32 mark);

    constructor(IIpseityEtch hub) {
        if (address(hub).code.length == 0) revert InvalidHub();
        HUB = hub;
    }

    modifier onlyAuthor(uint256 id) {
        if (!mayActAs(id, msg.sender)) revert NotAuthorised();
        _;
    }

    /// The owner or this token's Reach. A renter, operator, other token's
    /// Reach or nonexistent token has no authorship under this identity.
    function mayActAs(uint256 id, address who) public view returns (bool) {
        if (who == address(0)) return false;
        try HUB.ownerOf(id) returns (address holder) {
            if (holder == address(0)) return false;
            if (who == holder) return true;
        } catch { return false; }
        // An absent registry must not lock a direct holder out of writing.
        try HUB.account(id) returns (address reach) { return who == reach && reach != address(0); }
        catch { return false; }
    }

    function _mark(uint256 id) private view returns (uint32) {
        (, uint256 xfers,,) = HUB.statsOf(id);
        if (xfers > type(uint32).max) revert TooLate();
        return uint32(xfers);
    }

    function inscribe(uint256 id, uint8 kind, bytes calldata body)
        external onlyAuthor(id) returns (uint256 index, address ptr)
    {
        (bool ok, uint16 why) = admits(kind, body);
        if (!ok) revert Refused(why);
        index = _leaf[id].length;
        if (index >= MAX_LEAVES) revert Full();
        uint32 mark = _mark(id);
        uint64 epoch = _epoch[id];
        uint256 used = uint32(epoch) == mark ? epoch >> 32 : 0;
        if (used >= MAX_PER_EPOCH) revert EpochFull();
        if (block.number > type(uint32).max) revert TooLate();
        ptr = Shard.cut(body);
        uint24 n = uint24(Shard.size(ptr));
        bytes32 digest = keccak256(body);
        bytes32 root = keccak256(abi.encode(_root[id], digest, index));
        _leaf[id].push(Leaf(ptr, n, uint32(block.number), kind, 1, 0));
        _digest[id][index] = digest;
        _by[id][index] = msg.sender;
        _root[id] = root;
        _epoch[id] = uint64((used + 1) << 32) | uint64(mark);
        emit Inscribed(id, index, kind, ptr, uint32(n), digest, msg.sender, root);
    }

    function _at(uint256 id, uint256 index) private view returns (Leaf storage leaf) {
        if (index >= _leaf[id].length) revert Missing();
        return _leaf[id][index];
    }

    function retract(uint256 id, uint256 index) external onlyAuthor(id) {
        Leaf storage leaf = _at(id, index);
        if (leaf.flags & 2 != 0) revert Sealed();
        leaf.flags &= ~uint8(1);
        // Relisting must not revive an exhibition that was retracted.
        if (uint32(_show[id] >> 96) == index + 1) delete _show[id];
        emit Listed(id, index, false);
    }

    function relist(uint256 id, uint256 index) external onlyAuthor(id) {
        Leaf storage leaf = _at(id, index);
        if (leaf.flags & 2 != 0) revert Sealed();
        leaf.flags |= 1;
        emit Listed(id, index, true);
    }

    function sealLeaf(uint256 id, uint256 index) external onlyAuthor(id) {
        Leaf storage leaf = _at(id, index);
        if (leaf.flags & 2 != 0) revert Sealed();
        if (leaf.flags & 1 == 0) revert Unlisted();
        leaf.flags |= 2;
        emit LeafSealed(id, index);
    }

    function show(uint256 id, uint256 index, uint64 until) external onlyAuthor(id) {
        Leaf storage leaf = _at(id, index);
        if (leaf.kind != MEMO) revert NotMemory();
        if (leaf.flags & 1 == 0) revert Unlisted();
        if (until <= block.timestamp || uint256(until) > block.timestamp + MAX_SHOW) revert BadExpiry();
        uint32 mark = _mark(id);
        _show[id] = uint128((index + 1) << 96) | (uint128(until) << 32) | uint128(mark);
        emit Shown(id, index, until, mark);
    }

    function hide(uint256 id) external onlyAuthor(id) {
        delete _show[id];
        emit Shown(id, 0, 0, _mark(id));
    }

    function count(uint256 id) external view returns (uint256) { return _leaf[id].length; }
    function rootOf(uint256 id) external view returns (bytes32) { return _root[id]; }

    function leafAt(uint256 id, uint256 index)
        external view returns (Leaf memory leaf, bytes32 digest, address by)
    {
        leaf = _at(id, index);
        return (leaf, _digest[id][index], _by[id][index]);
    }

    /// Public raw bytes remain readable even when the exhibition unlists them.
    function bodyAt(uint256 id, uint256 index) public view returns (bytes memory) {
        return Shard.read(_at(id, index).ptr);
    }

    function joined(uint256 id, uint256 index) external view returns (bytes memory) {
        return bodyAt(id, index);
    }

    function digestsOf(uint256 id, uint256 offset, uint256 limit) external view returns (bytes32[] memory digests) {
        uint256 n = _leaf[id].length;
        if (offset >= n) return new bytes32[](0);
        uint256 take = n - offset;
        if (limit < take) take = limit;
        digests = new bytes32[](take);
        for (uint256 i; i < take; ++i) digests[i] = _digest[id][offset + i];
    }

    function shown(uint256 id) external view returns (uint256 index, bool live, uint64 until) {
        uint128 packed = _show[id];
        uint256 plusOne = uint32(packed >> 96);
        if (plusOne == 0) return (0, false, 0);
        index = plusOne - 1;
        until = uint64(packed >> 32);
        live = block.timestamp < until && uint32(packed) == _mark(id) && _leaf[id][index].flags & 1 != 0;
    }

    function epochLeft(uint256 id) external view returns (uint256) {
        uint32 mark = _mark(id);
        uint64 epoch = _epoch[id];
        uint256 used = uint32(epoch) == mark ? epoch >> 32 : 0;
        uint256 room = MAX_LEAVES - _leaf[id].length;
        uint256 left = MAX_PER_EPOCH - used;
        return room < left ? room : left;
    }

    function addressFor(bytes calldata body) external view returns (address ptr, bool exists) {
        return Shard.addressOf(body);
    }

    /// why: 0 accepted, 1 unknown kind, 2 empty, 3 too long, 4 alphabet.
    /// MEMO excludes LF: the spec's table and prose disagree, and its explicit
    /// adversarial test refuses LF in metadata. NOTE may use LF in its archive.
    /// GLYPH/TERM admission is an alphabet check, never a parser safety proof.
    function admits(uint8 kind, bytes calldata body) public pure returns (bool ok, uint16 why) {
        if (kind < MEMO || kind > TERM) return (false, 1);
        if (body.length == 0) return (false, 2);
        uint256 cap = kind == MEMO ? MAX_MEMO : kind == NOTE ? MAX_NOTE :
            kind == DATA ? MAX_BODY : kind == GLYPH ? MAX_GLYPH : MAX_TERM;
        if (body.length > cap) return (false, 3);
        if (kind == DATA) return (true, 0);
        for (uint256 i; i < body.length; ++i) {
            uint8 c = uint8(body[i]);
            bool allowed;
            if (kind == MEMO || kind == NOTE) {
                allowed = (c >= 32 && c <= 126 && c != 34 && c != 39 && c != 92 &&
                    c != 60 && c != 62 && c != 38 && c != 96);
                if (kind == MEMO && (c == 58 || c == 59)) allowed = false;
                if (kind == NOTE && c == 10) allowed = true;
            } else if (kind == GLYPH) {
                allowed = (c >= 48 && c <= 57) || c == 32 || c == 46 || c == 44 ||
                    c == 43 || c == 45 || c == 101 || c == 69 || c == 77 || c == 109 ||
                    c == 76 || c == 108 || c == 72 || c == 104 || c == 86 || c == 118 ||
                    c == 67 || c == 99 || c == 83 || c == 115 || c == 81 || c == 113 ||
                    c == 84 || c == 116 || c == 65 || c == 97 || c == 90 || c == 122;
            } else {
                allowed = (c >= 97 && c <= 122) || (c >= 48 && c <= 57) || c == 32 ||
                    c == 46 || c == 44 || c == 40 || c == 41 || c == 43 || c == 45 || c == 42 || c == 47;
            }
            if (!allowed) return (false, 4);
        }
        return (true, 0);
    }
}
