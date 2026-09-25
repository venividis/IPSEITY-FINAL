// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {SovereignIpseity} from "../../src/sovereign/SovereignIpseity.sol";
import {MockERC20} from "../mocks/MockERC20.sol";

contract SovereignRoutingTest is Test {
    SovereignIpseity internal token;
    bytes internal constant PAGE = "<!doctype html><title>Sovereign</title>";

    function setUp() public {
        token = new SovereignIpseity(address(this), 500);
        token.uploadWebsiteChunk(PAGE);
        token.beginTesting(uint32(PAGE.length), sha256(PAGE));
        token.seal();
        token.mintTo(address(0xBEEF));
    }

    function testResolveModeSelectsERC5219() public view {
        assertEq(token.resolveMode(), bytes32("5219"));
    }

    function testLiveRouteReturnsCanonicalDocument() public view {
        string[] memory route = new string[](3);
        route[0] = "token";
        route[1] = "1";
        route[2] = "live";
        SovereignIpseity.KeyValue[] memory params = new SovereignIpseity.KeyValue[](0);
        (uint16 status, string memory body, SovereignIpseity.KeyValue[] memory headers) =
            token.request(route, params);
        assertEq(status, 200);
        assertEq(bytes(body), PAGE);
        assertEq(headers[0].value, "text/html; charset=utf-8");
    }

    function testTokenHolderCannotExecuteAgainstCustodiedERC20() public {
        MockERC20 asset = new MockERC20("Asset", "AST", 18, 0, false);
        address victim = address(0xCAFE);
        token.mintTo(victim);
        asset.mint(victim, 100 ether);
        vm.startPrank(victim);
        asset.approve(address(token), 100 ether);
        token.depositERC20(2, address(asset), 100 ether);
        vm.stopPrank();

        vm.prank(address(0xBEEF));
        vm.expectRevert(SovereignIpseity.Invalid.selector);
        token.executeAsToken(1, address(asset), 0, abi.encodeCall(asset.transfer, (address(0xBEEF), 100 ether)));

        assertEq(asset.balanceOf(address(token)), 100 ether);
        assertEq(token.liquidBalance(2, address(asset)), 100 ether);
        assertEq(token.totalLiability(address(asset)), 100 ether);
    }

    function testExecutedTargetCannotLaterBecomeCustodiedERC20() public {
        MockERC20 asset = new MockERC20("Asset", "AST", 18, 0, false);
        vm.prank(address(0xBEEF));
        token.executeAsToken(1, address(asset), 0, abi.encodeCall(asset.approve, (address(this), type(uint256).max)));

        asset.mint(address(this), 1 ether);
        asset.approve(address(token), 1 ether);
        vm.expectRevert(SovereignIpseity.Invalid.selector);
        token.depositERC20(1, address(asset), 1 ether);
    }
}
