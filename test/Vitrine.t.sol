// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;
import {Test} from "forge-std/Test.sol";
import {Etch, IIpseityEtch} from "../src/Etch.sol";
import {Vitrine} from "../src/Vitrine.sol";
import {PageEtch} from "../src/PageEtch.sol";
import {DeskEtch} from "../src/DeskEtch.sol";
import {EtchHubMock} from "./Etch.t.sol";

contract VitrineTest is Test {
    EtchHubMock hub;
    Etch etch;
    Vitrine reader;
    function setUp() public {
        hub = new EtchHubMock();
        etch = new Etch(IIpseityEtch(address(hub)));
        reader = new Vitrine(etch, new PageEtch(etch, new DeskEtch(etch)));
    }
    function get(string memory last) private view returns (uint256, string memory, Vitrine.KeyValue[] memory) {
        string[] memory path = new string[](3);
        path[0] = "token"; path[1] = "1"; path[2] = last;
        return reader.request(path, new Vitrine.KeyValue[](0));
    }
    function contains(string memory hay, string memory needle) private pure returns (bool) {
        bytes memory a = bytes(hay); bytes memory b = bytes(needle);
        if (b.length > a.length) return false;
        for (uint256 i; i <= a.length - b.length; ++i) {
            bool match_ = true;
            for (uint256 j; j < b.length; ++j) if (a[i + j] != b[j]) { match_ = false; break; }
            if (match_) return true;
        }
        return false;
    }
    function test_VitrineServesNotesByteExactlyWithInertHeaders() public {
        bytes memory note = "first line\nsecond line";
        etch.inscribe(1, 2, note);
        (uint256 code, string memory body, Vitrine.KeyValue[] memory headers) = get("0");
        assertEq(code, 200);
        assertEq(bytes(body), note);
        assertEq(headers[0].value, "text/plain; charset=utf-8");
        assertEq(headers[1].value, "no-cache");
        assertEq(headers[2].value, "nosniff");
        assertTrue(contains(headers[3].value, "sandbox"));
    }
    function test_VitrineNeverServesHolderProgramsAsHtml() public {
        bytes memory payload = hex"003c7363726970743e616c6572742831293c2f7363726970743eff";
        etch.inscribe(1, 3, payload);
        (uint256 code, string memory body, Vitrine.KeyValue[] memory headers) = get("0");
        assertEq(code, 200);
        assertEq(bytes(body), payload);
        assertEq(headers[0].value, "application/octet-stream");
        assertEq(headers[4].value, "attachment; filename=inscription.bin");
        assertTrue(contains(headers[3].value, "default-src 'none'"));
        string memory page = reader.lane(1, 0);
        assertFalse(contains(page, "alert(1)"));
    }
    function test_VitrineRetractionIsGoneButKeepsProvenance() public {
        etch.inscribe(1, 1, "a public memory");
        etch.retract(1, 0);
        (uint256 code, string memory body, Vitrine.KeyValue[] memory headers) = get("0");
        assertEq(code, 410);
        assertTrue(contains(body, "Digest 0x"));
        assertEq(headers[1].value, "no-cache");
        assertEq(etch.bodyAt(1, 0), bytes("a public memory"));
        etch.relist(1, 0);
        etch.sealLeaf(1, 0);
        (code,,headers) = get("0");
        assertEq(code, 200);
        assertEq(headers[1].value, "public, max-age=31536000, immutable");
    }
    function test_VitrineRejectsMalformedMissingAndOverflowingPaths() public view {
        (uint256 code,,) = get("<script>"); assertEq(code, 404);
        (code,,) = get("-1"); assertEq(code, 404);
        (code,,) = get("0"); assertEq(code, 404);
        string[] memory path = new string[](2); path[0] = "token"; path[1] = "2";
        (code,,) = reader.request(path, new Vitrine.KeyValue[](0)); assertEq(code, 404);
        path[1] = "999999999999999999999999999999999999999999999999999999999999999999999999999999";
        (code,,) = reader.request(path, new Vitrine.KeyValue[](0)); assertEq(code, 404);
    }
    function test_VitrinePaginationHandlesHugeOffsetsWithoutOverflow() public {
        etch.inscribe(1, 1, "one"); etch.inscribe(1, 2, "two");
        string memory doc = reader.sheet(1, 0, 1);
        assertTrue(contains(doc, "\"next\":\"1\""));
        assertTrue(contains(doc, "\"index\":0"));
        assertFalse(contains(doc, "\"index\":1"));
        doc = reader.sheet(1, type(uint256).max, type(uint256).max);
        assertTrue(contains(doc, "\"next\":null"));
        assertTrue(contains(doc, "\"entries\":[]"));
        doc = reader.sheet(1, 1, type(uint256).max);
        assertTrue(contains(doc, "\"index\":1"));
        assertFalse(contains(doc, "\"index\":0"));
    }
    function test_VitrineWriterPageUsesImmutableArchiveAndExplicitConfirmation() public view {
        string[] memory path = new string[](2); path[0] = "token"; path[1] = "1";
        (uint256 code, string memory body, Vitrine.KeyValue[] memory headers) = reader.request(path, new Vitrine.KeyValue[](0));
        assertEq(code, 200);
        assertEq(headers[0].value, "text/html; charset=utf-8");
        assertTrue(contains(body, "Confirm in wallet"));
        assertTrue(contains(body, "Only the current token owner"));
        assertTrue(contains(body, "Submission is not confirmation"));
        assertFalse(contains(body, "src=\"https://"));
    }
}
