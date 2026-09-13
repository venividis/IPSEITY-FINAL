// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Etch} from "./Etch.sol";
import {LibNum} from "./lib/LibNum.sol";
import {PageEtch} from "./PageEtch.sol";

interface IVitrineHub {
    function ownerOf(uint256 id) external view returns (address);
}

/*───────────────────────────────────────────────────────────────────────────
  Vitrine — the archive has its own door

  This first reader is an independent ERC-5219 surface. Deploying it does
  not replace the artwork, change its renderer, or move existing balances.
  The only HTML is this contract's fixed application. Holder bytes leave
  their own route as text/plain or an attachment, with nosniff and a sandbox
  policy. A retraction hides a listing; it cannot erase public chain bytes.

  The writer previews the exact calldata against the chain and asks for a
  separate confirmation. It never requests a key, token approval, or native
  payment. The current owner and chain are checked again before a send.
  Etch is the authority; the browser's checks only make refusals legible.
───────────────────────────────────────────────────────────────────────────*/
contract Vitrine {
    using LibNum for uint256;
    struct KeyValue { string key; string value; }
    Etch public immutable ETCH;
    IVitrineHub public immutable HUB;
    uint256 public constant PAGE_SIZE = 32;
    PageEtch public immutable PAGE;

    error MissingArchive();
    constructor(Etch etch, PageEtch page) {
        if (address(page.ETCH()) != address(etch)) revert MissingArchive();
        PAGE = page;
        if (address(etch).code.length == 0) revert MissingArchive();
        ETCH = etch;
        HUB = IVitrineHub(address(etch.HUB()));
    }

    function resolveMode() external pure returns (bytes32) { return bytes32("manual"); }

    function request(string[] memory resource, KeyValue[] memory)
        external view returns (uint256 status, string memory response, KeyValue[] memory headers)
    {
        if (resource.length == 0) {
            return (200, string.concat("IPSEITY inscriptions. Open /token/<id>. Archive ",
                LibNum.hexAddr(address(ETCH)), ". All inscription bytes are public and permanent."), _headers(1, false, false));
        }
        if (resource.length < 2 || !_eq(resource[0], "token")) return _missing();
        (bool valid, uint256 id) = _number(resource[1]);
        if (!valid) return _missing();
        try HUB.ownerOf(id) returns (address owner) {
            if (owner == address(0)) return _missing();
        } catch { return _missing(); }
        if (resource.length == 2) return (200, lane(id, 0), _headers(0, false, true));
        if (resource.length == 4 && (_eq(resource[2], "sheet") || _eq(resource[2], "page"))) {
            (bool ok, uint256 offset) = _number(resource[3]);
            if (!ok) return _missing();
            if (_eq(resource[2], "page")) return (200, lane(id, offset), _headers(0, false, true));
            return (200, sheet(id, offset, PAGE_SIZE), _headers(0, false, false));
        }
        if (resource.length != 3) return _missing();
        (bool okIndex, uint256 index) = _number(resource[2]);
        if (!okIndex || index >= ETCH.count(id)) return _missing();
        (Etch.Leaf memory leaf, bytes32 digest,) = ETCH.leafAt(id, index);
        if (leaf.flags & 1 == 0) {
            return (410, string.concat("Retracted. Public bytes remain at ", LibNum.hexAddr(leaf.ptr),
                ". Digest ", LibNum.hex32(digest)), _headers(1, false, false));
        }
        return (200, string(ETCH.bodyAt(id, index)), _headers(leaf.kind, leaf.flags & 2 != 0, false));
    }

    function sheet(uint256 id, uint256 offset, uint256 limit) public view returns (string memory) {
        uint256 count = ETCH.count(id);
        if (limit > PAGE_SIZE) limit = PAGE_SIZE;
        uint256 end = offset >= count ? offset : offset + (limit < count - offset ? limit : count - offset);
        string memory entries;
        for (uint256 i = offset; i < end; ++i) {
            (Etch.Leaf memory leaf, bytes32 digest, address by) = ETCH.leafAt(id, i);
            entries = string.concat(entries, i == offset ? "" : ",", "{\"index\":", i.str(),
                ",\"kind\":", uint256(leaf.kind).str(), ",\"size\":", uint256(leaf.size).str(),
                ",\"block\":", uint256(leaf.bn).str(), ",\"digest\":\"", LibNum.hex32(digest),
                "\",\"author\":\"", LibNum.hexAddr(by), "\",\"shard\":\"", LibNum.hexAddr(leaf.ptr),
                "\",\"listed\":", leaf.flags & 1 != 0 ? "true" : "false",
                ",\"sealed\":", leaf.flags & 2 != 0 ? "true" : "false", "}");
        }
        return string.concat("{\"schema\":\"ipseity.etch/1\",\"chainId\":\"", block.chainid.str(),
            "\",\"tokenId\":\"", id.str(), "\",\"archive\":\"", LibNum.hexAddr(address(ETCH)),
            "\",\"count\":", count.str(), ",\"root\":\"", LibNum.hex32(ETCH.rootOf(id)),
            "\",\"offset\":\"", offset.str(), "\",\"next\":", end < count ? string.concat("\"", end.str(), "\"") : "null",
            ",\"entries\":[", entries, "]}");
    }

    function lane(uint256 id, uint256 offset) public view returns (string memory) {
        return PAGE.lane(id, offset);
    }

    function mime(uint8 kind) public pure returns (string memory) {
        return kind == 0 ? "application/json; charset=utf-8" : kind == 3 ? "application/octet-stream" : "text/plain; charset=utf-8";
    }
    function _headers(uint8 kind, bool sealed_, bool page) private pure returns (KeyValue[] memory h) {
        h = new KeyValue[](5);
        h[0] = KeyValue("Content-Type", page ? "text/html; charset=utf-8" : mime(kind));
        h[1] = KeyValue("Cache-Control", sealed_ ? "public, max-age=31536000, immutable" : "no-cache");
        h[2] = KeyValue("X-Content-Type-Options", "nosniff");
        h[3] = KeyValue("Content-Security-Policy", page
            ? "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'none'; base-uri 'none'; object-src 'none'; form-action 'none'; frame-ancestors 'none'"
            : "sandbox; default-src 'none'; base-uri 'none'; form-action 'none'");
        h[4] = KeyValue("Content-Disposition", kind == 3 ? "attachment; filename=inscription.bin" : "inline");
    }
    function _missing() private pure returns (uint256, string memory, KeyValue[] memory) {
        return (404, "No inscription at this address.", _headers(1, false, false));
    }
    function _eq(string memory a, string memory b) private pure returns (bool) { return keccak256(bytes(a)) == keccak256(bytes(b)); }
    function _number(string memory s) private pure returns (bool, uint256 n) {
        bytes memory b = bytes(s);
        if (b.length == 0 || b.length > 78) return (false, 0);
        for (uint256 i; i < b.length; ++i) {
            uint8 c = uint8(b[i]);
            if (c < 48 || c > 57 || n > (type(uint256).max - (c - 48)) / 10) return (false, 0);
            n = n * 10 + c - 48;
        }
        return (true, n);
    }
}
