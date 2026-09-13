// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {Etch, IIpseityEtch} from "../src/Etch.sol";
import {Shard} from "../src/lib/Shard.sol";

contract EtchHubMock is IIpseityEtch {
    address public holder;
    address public reach = address(0x6551);
    uint32 public transfers;
    bool public registryAbsent;
    constructor() { holder = msg.sender; }
    function ownerOf(uint256 id) external view returns (address) {
        require(id == 1, "absent");
        return holder;
    }
    function account(uint256) external view returns (address) {
        require(!registryAbsent, "registry absent");
        return reach;
    }
    function statsOf(uint256) external view returns (uint256, uint256, uint256, uint256) {
        return (0, transfers, 0, 1);
    }
    function move(address to) external { holder = to; ++transfers; }
    function removeRegistry() external { registryAbsent = true; }
}

contract ShardHarness {
    function cut(bytes memory body) external returns (address) { return Shard.cut(body); }
    function read(address ptr) external view returns (bytes memory) { return Shard.read(ptr); }
    function join(address[] memory ptrs, uint256 total) external view returns (bytes memory) {
        return Shard.join(ptrs, total);
    }
}

contract EtchTest is Test {
    EtchHubMock hub;
    Etch etch;
    address buyer = address(0xB0B);

    function setUp() public {
        hub = new EtchHubMock();
        etch = new Etch(IIpseityEtch(address(hub)));
        vm.warp(1_000_000);
    }

    function test_EtchOnlyHolderAndOwnReachCanWrite() public {
        assertTrue(etch.mayActAs(1, address(this)));
        assertTrue(etch.mayActAs(1, hub.reach()));
        assertFalse(etch.mayActAs(1, address(0x0F)));
        assertFalse(etch.mayActAs(1, address(0)));
        assertFalse(etch.mayActAs(2, address(this)));
        vm.prank(address(0x0F)); // an operator or renter has no writer capability
        vm.expectRevert(Etch.NotAuthorised.selector);
        etch.inscribe(1, 1, "not mine");
        vm.prank(hub.reach());
        (uint256 index,) = etch.inscribe(1, 1, "written as the token");
        (,, address author) = etch.leafAt(1, index);
        assertEq(author, hub.reach());
        hub.removeRegistry();
        assertTrue(etch.mayActAs(1, address(this)));
        assertFalse(etch.mayActAs(1, buyer));
        etch.inscribe(1, 1, "the holder still writes");
    }

    function test_EtchPredictionDeduplicationDigestAndAuthorshipHold() public {
        bytes memory body = "a memory whose bytes stay";
        (address predicted, bool existed) = etch.addressFor(body);
        assertFalse(existed);
        (uint256 zero, address first) = etch.inscribe(1, 1, body);
        assertEq(first, predicted);
        assertEq(zero, 0);
        bytes32 digest = keccak256(body);
        bytes32 root = keccak256(abi.encode(bytes32(0), digest, uint256(0)));
        assertEq(etch.rootOf(1), root);
        vm.prank(hub.reach());
        (uint256 one, address second) = etch.inscribe(1, 2, body);
        assertEq(one, 1);
        assertEq(first, second);
        (Etch.Leaf memory leaf, bytes32 stored, address author) = etch.leafAt(1, 1);
        assertEq(uint256(leaf.size), body.length);
        assertEq(first.code.length, body.length + 1);
        assertEq(uint256(uint8(first.code[0])), 0);
        assertEq(stored, digest);
        assertEq(author, hub.reach());
        assertEq(etch.rootOf(1), keccak256(abi.encode(root, digest, uint256(1))));
        assertEq(etch.bodyAt(1, 1), body);
        (, existed) = etch.addressFor(body);
        assertTrue(existed);
    }

    function test_EtchRetractionPreservesBytesAndDoesNotReviveShownMemory() public {
        (, address ptr) = etch.inscribe(1, 1, "permanent bytes");
        bytes32 root = etch.rootOf(1);
        etch.show(1, 0, uint64(block.timestamp + 1 days));
        etch.retract(1, 0);
        assertEq(etch.bodyAt(1, 0), bytes("permanent bytes"));
        assertEq(ptr.code.length, 16);
        assertEq(etch.rootOf(1), root);
        (Etch.Leaf memory leaf,,) = etch.leafAt(1, 0);
        assertEq(uint256(leaf.flags), 0);
        (, bool live,) = etch.shown(1);
        assertFalse(live);
        etch.relist(1, 0);
        (, live,) = etch.shown(1);
        assertFalse(live);
    }

    function test_EtchSealingIsPermanentAcrossTransferButNeverForUnlistedLeaf() public {
        etch.inscribe(1, 1, "sealed forever");
        etch.retract(1, 0);
        vm.expectRevert(Etch.Unlisted.selector);
        etch.sealLeaf(1, 0);
        etch.relist(1, 0);
        etch.sealLeaf(1, 0);
        hub.move(buyer);
        vm.prank(buyer);
        vm.expectRevert(Etch.Sealed.selector);
        etch.retract(1, 0);
        vm.prank(buyer);
        vm.expectRevert(Etch.Sealed.selector);
        etch.relist(1, 0);
        (Etch.Leaf memory leaf,,) = etch.leafAt(1, 0);
        assertEq(uint256(leaf.flags), 3);
        assertEq(etch.bodyAt(1, 0), bytes("sealed forever"));
    }

    function test_EtchExhibitionDiesOnExpiryTransferAndRoundTrip() public {
        etch.inscribe(1, 1, "chosen for now");
        uint64 until = uint64(block.timestamp + 1 days);
        etch.show(1, 0, until);
        (uint256 index, bool live, uint64 storedUntil) = etch.shown(1);
        assertTrue(live); assertEq(index, 0); assertEq(uint256(storedUntil), until);
        hub.move(buyer);
        (, live,) = etch.shown(1); assertFalse(live);
        hub.move(address(this));
        (, live,) = etch.shown(1); assertFalse(live);
        etch.show(1, 0, until);
        vm.warp(until);
        (, live,) = etch.shown(1); assertFalse(live);
        vm.expectRevert(Etch.BadExpiry.selector);
        etch.show(1, 0, uint64(block.timestamp + 180 days + 1));
        etch.inscribe(1, 2, "this note is archival");
        vm.expectRevert(Etch.NotMemory.selector);
        etch.show(1, 1, uint64(block.timestamp + 1 days));
    }

    function test_EtchAFormerOwnerCannotChangeTheArchive() public {
        etch.inscribe(1, 1, "authored by the first holder");
        hub.move(buyer);
        vm.expectRevert(Etch.NotAuthorised.selector);
        etch.inscribe(1, 1, "too late");
        vm.expectRevert(Etch.NotAuthorised.selector);
        etch.retract(1, 0);
        vm.expectRevert(Etch.NotAuthorised.selector);
        etch.hide(1);
        (,,address by) = etch.leafAt(1, 0);
        assertEq(by, address(this));
    }

    function test_EtchPerEpochAndLifetimeBudgetsCannotBeErased() public {
        for (uint256 i; i < 32; ++i) etch.inscribe(1, 1, "same bytes still consume an entry");
        assertEq(etch.epochLeft(1), 0);
        vm.expectRevert(Etch.EpochFull.selector);
        etch.inscribe(1, 1, "thirty third");
        etch.retract(1, 0);
        assertEq(etch.epochLeft(1), 0);
        for (uint256 epoch; epoch < 7; ++epoch) {
            hub.move(address(this));
            assertEq(etch.epochLeft(1), 32);
            for (uint256 i; i < 32; ++i) etch.inscribe(1, 1, "new epoch same archive");
        }
        assertEq(etch.count(1), 256);
        hub.move(address(this));
        assertEq(etch.epochLeft(1), 0);
        vm.expectRevert(Etch.Full.selector);
        etch.inscribe(1, 1, "two hundred fifty seventh");
    }

    function test_EtchPaginationCannotOverflowOrExceedTheArchive() public {
        etch.inscribe(1, 1, "first");
        etch.inscribe(1, 1, "second");
        bytes32[] memory page = etch.digestsOf(1, 1, type(uint256).max);
        assertEq(page.length, 1);
        assertEq(page[0], keccak256("second"));
        assertEq(etch.digestsOf(1, type(uint256).max, type(uint256).max).length, 0);
        assertEq(etch.digestsOf(1, 0, 0).length, 0);
        vm.expectRevert(Etch.Missing.selector);
        etch.bodyAt(1, 2);
    }

    function _admission(uint8 kind, bytes memory body, bool expected) private view {
        (bool ok,) = etch.admits(kind, body);
        assertEq(ok, expected);
    }

    function test_EtchAllKindAlphabetsRefuseExecutableDelimiters() public view {
        _admission(1, "the first light - (memory 1).", true);
        _admission(1, "depth:0", false);
        _admission(1, "line\nline", false);
        _admission(1, "semi;colon", false);
        _admission(1, "</script>", false);
        _admission(1, hex"e280a8", false);
        _admission(1, hex"80", false);
        _admission(2, "notes: line one;\nline two", true);
        _admission(2, "`template`", false);
        _admission(2, "<html>", false);
        _admission(3, hex"ff000a225c3c3e26", true);
        _admission(4, "M0 0 C1 2 3 4 5 6z", true);
        _admission(4, "onclick=alert(1)", false);
        _admission(5, "sin(p.x) + 0.5", true);
        _admission(5, "#define p 0", false);
        _admission(0, "unknown", false);
        _admission(6, "reserved", false);
        _admission(128, "refused", false);
        _admission(1, "", false);
        _admission(1, new bytes(1025), false);
        _admission(3, new bytes(24576), false);
    }

    function test_EtchEveryByteIsCheckedAgainstTheMemoBoundary() public view {
        bytes memory body = new bytes(1);
        for (uint256 c; c < 256; ++c) {
            body[0] = bytes1(uint8(c));
            bool expected = c >= 32 && c <= 126 && c != 34 && c != 39 && c != 92 &&
                c != 60 && c != 62 && c != 38 && c != 96 && c != 58 && c != 59;
            _admission(1, body, expected);
        }
    }

    function test_EtchMaxSizeDataStaysInertAndRoundTrips() public {
        bytes memory body = new bytes(24575);
        body[0] = 0xff; body[24574] = 0x42;
        (,address ptr) = etch.inscribe(1, 3, body);
        assertEq(ptr.code.length, 24576);
        assertEq(etch.bodyAt(1, 0), body);
        (bool ok, bytes memory answer) = ptr.call(hex"ffffffff");
        assertTrue(ok); assertEq(answer.length, 0);
    }

    function test_EtchShardJoinChecksAllocationBeforeCopying() public {
        ShardHarness harness = new ShardHarness();
        address[] memory ptrs = new address[](2);
        ptrs[0] = harness.cut("alpha");
        ptrs[1] = harness.cut("beta");
        assertEq(harness.join(ptrs, 9), bytes("alphabeta"));
        vm.expectRevert(Shard.WrongTotal.selector);
        harness.join(ptrs, 8);
        vm.expectRevert(Shard.WrongTotal.selector);
        harness.join(ptrs, 10);
        vm.expectRevert(Shard.InvalidShard.selector);
        harness.read(address(0));
        vm.expectRevert(Shard.Empty.selector);
        harness.cut("");
    }
}
