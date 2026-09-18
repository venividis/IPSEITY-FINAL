// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {SovereignIpseity} from "../../src/sovereign/SovereignIpseity.sol";

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
}
