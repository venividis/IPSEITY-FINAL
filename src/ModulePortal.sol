// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Base64} from "./lib/Base64.sol";
import {LibNum} from "./lib/LibNum.sol";

interface IModulePortalPremises { function HUB() external view returns (address); }
interface IModulePortalCollection { function ownerOf(uint256 id) external view returns (address); }
interface IModulePortalWorkbench {
    function services() external view returns (
        uint256 chainId, address collection, address installations, address releases,
        address stateStore, address document, bytes32 documentHash
    );
    function byteLength() external view returns (uint256);
}
interface IModulePortalReleases { function archiveFactory() external view returns (address); }
interface IModulePortalFactory {
    function archiveSchema(address archive) external view returns (uint8);
    function archiveCodeHash(address archive) external view returns (bytes32);
}
interface IModulePortalArchive {
    function contentSha256() external view returns (bytes32);
    function byteLength() external view returns (uint256);
    function chunkCount() external view returns (uint256);
    function readChunk(uint256 index) external view returns (bytes memory);
}

/*═══════════════════════════════════════════════════════════════════════════

  A SECOND DOOR, THE SAME HOUSE

  The module workbench is a companion to an existing collection. It does
  not replace the Reach, the instrument, the renderer, or Parley's archive.
  A site can point at this immutable wrapper without redeploying any of
  those contracts: requests for existing routes are forwarded with their
  original calldata, and their complete return bytes are returned untouched.

  /modules, /token/<id>/modules and /extensions are the new human doors.
  /modules/services.json and /services/modules.json describe the companions;
  /token/<id>/modules/services.json describes one token's door. The existing
  /services.json response stays exactly what Premises already serves.

  The canonical workbench remains a raw, hashed, bounded-chunk archive. A
  second factory-registered archive holds gzip of those same bytes so the
  ERC-5219 response does not need to return the entire uncompressed program.
  The browser limits decompression to the canonical byte length, verifies
  its SHA-256, and only then opens the recovered document. No fetch, gateway,
  wallet connection or signature is needed to open this document.

  All loader declarations live inside an async function. document.open()
  retains the Window and its lexical bindings; a top-level loader constant
  once collided with the original instrument's minified declarations. The
  sole deliberate shared value is the workbench's IPSEITY_MODULES config.

═══════════════════════════════════════════════════════════════════════════*/
contract ModulePortal {
    address public immutable PREMISES;
    address public immutable WORKBENCH;
    address public immutable CARTRIDGES;
    address public immutable COLLECTION;
    address public immutable INSTALLATIONS;
    address public immutable RELEASES;
    address public immutable STATE_STORE;
    address public immutable DOCUMENT;
    bytes32 public immutable DOCUMENT_HASH;
    uint256 public immutable DOCUMENT_BYTES;
    address public immutable PACKED_ARCHIVE;
    bytes32 public immutable PACKED_CODE_HASH;
    bytes32 public immutable PACKED_HASH;
    uint256 public immutable PACKED_BYTES;
    uint256 public immutable PACKED_CHUNKS;

    struct KeyValue { string key; string value; }
    error InvalidServices();
    error InvalidArchive();
    error InvalidChunk();

    constructor(address premises_, address workbench_, address packedArchive_, address cartridges_) {
        if (premises_.code.length == 0 || workbench_.code.length == 0
            || (cartridges_ != address(0) && cartridges_.code.length == 0)) revert InvalidServices();
        (
            uint256 chain, address collection, address installations, address releases,
            address stateStore, address document, bytes32 documentHash
        ) = IModulePortalWorkbench(workbench_).services();
        uint256 length = IModulePortalWorkbench(workbench_).byteLength();
        if (chain != block.chainid || collection != IModulePortalPremises(premises_).HUB()
            || collection.code.length == 0 || installations.code.length == 0
            || releases.code.length == 0 || stateStore.code.length == 0 || document.code.length == 0
            || documentHash == bytes32(0) || length == 0 || length > 1048576) revert InvalidServices();
        IModulePortalFactory factory = IModulePortalFactory(IModulePortalReleases(releases).archiveFactory());
        uint8 kind = factory.archiveSchema(packedArchive_);
        bytes32 codeHash = factory.archiveCodeHash(packedArchive_);
        if ((kind != 1 && kind != 2) || codeHash == bytes32(0)
            || packedArchive_.codehash != codeHash) revert InvalidArchive();
        IModulePortalArchive packed = IModulePortalArchive(packedArchive_);
        uint256 packedLength = packed.byteLength();
        uint256 chunks = packed.chunkCount();
        bytes32 digest = packed.contentSha256();
        if (packedLength < 20 || packedLength > 1048576 || chunks == 0 || chunks > 64
            || digest == bytes32(0)) revert InvalidArchive();
        bytes memory first = packed.readChunk(0);
        if (first.length < 3 || first[0] != 0x1f || first[1] != 0x8b || first[2] != 0x08)
            revert InvalidArchive();
        PREMISES = premises_;
        WORKBENCH = workbench_;
        CARTRIDGES = cartridges_;
        COLLECTION = collection;
        INSTALLATIONS = installations;
        RELEASES = releases;
        STATE_STORE = stateStore;
        DOCUMENT = document;
        DOCUMENT_HASH = documentHash;
        DOCUMENT_BYTES = length;
        PACKED_ARCHIVE = packedArchive_;
        PACKED_CODE_HASH = codeHash;
        PACKED_HASH = digest;
        PACKED_BYTES = packedLength;
        PACKED_CHUNKS = chunks;
    }

    function resolveMode() external pure returns (bytes32) { return "5219"; }

    function request(string[] memory resource, KeyValue[] memory params)
        external view returns (uint16, string memory, KeyValue[] memory)
    {
        params;
        uint256 n = resource.length;
        if (n != 0 && bytes(resource[n - 1]).length == 0) --n;
        if (n != 0 && _eq(resource[0], "modules")) {
            if (n == 1) return _html(_document(""));
            if (n == 2 && _eq(resource[1], "services.json")) return _json(_services(""));
            return _notFound();
        }
        if (n == 2 && _eq(resource[0], "services") && _eq(resource[1], "modules.json"))
            return _json(_services(""));
        if (n == 1 && _eq(resource[0], "extensions")) {
            return _html(string.concat(
                '<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width">',
                '<title>IPSEITY extensions</title><body style="background:#080b13;color:#dbeaff;',
                'font:18px system-ui;max-width:42rem;margin:10vh auto;padding:2rem;line-height:1.7">',
                '<h1>IPSEITY extensions</h1><p>Recoverable modules and memory for your existing token.</p>',
                '<p><a style="color:#91d9ff" href="/modules">Open the module workbench</a></p>',
                '<p><a style="color:#91d9ff" href="/">Return to the original instrument</a></p>',
                '<p><a style="color:#91d9ff" href="/door">Open the original site</a></p>',
                '<p><a style="color:#91d9ff" href="/modules/services.json">Read module services</a></p>'
            ));
        }
        if (n >= 3 && _eq(resource[0], "token") && _eq(resource[2], "modules")) {
            (bool valid, uint256 id) = _toUint(resource[1]);
            if (!valid || !_exists(id)) return _notFound();
            string memory token = LibNum.str(id);
            if (n == 3) return _html(_document(token));
            if (n == 4 && _eq(resource[3], "services.json")) return _json(_services(token));
            return _notFound();
        }

        // Forward calldata, return data AND revert data exactly. No new header,
        // HTML link or config is injected into the original site's response.
        (bool success, bytes memory output) = PREMISES.staticcall(msg.data);
        assembly ("memory-safe") {
            if iszero(success) { revert(add(output, 32), mload(output)) }
            return(add(output, 32), mload(output))
        }
    }

    function _services(string memory token) private view returns (string memory) {
        string memory registry = string.concat(
            '{"schema":"ipseity.modules/1","chainId":"', LibNum.str(block.chainid),
            '","collection":"', LibNum.hexAddr(COLLECTION),
            '","tokenId":"', token, '","registry":"', LibNum.hexAddr(INSTALLATIONS),
            '","releases":"', LibNum.hexAddr(RELEASES),
            '","stateStore":"', LibNum.hexAddr(STATE_STORE)
        );
        string memory document = string.concat(
            '","workbench":"', LibNum.hexAddr(WORKBENCH),
            '","document":"', LibNum.hexAddr(DOCUMENT),
            '","documentHash":"', LibNum.hex32(DOCUMENT_HASH),
            '","documentBytes":', LibNum.str(DOCUMENT_BYTES),
            ',"packedArchive":"', LibNum.hexAddr(PACKED_ARCHIVE),
            '","packedHash":"', LibNum.hex32(PACKED_HASH)
        );
        return string.concat(
            registry, document,
            '","cartridges":"', LibNum.hexAddr(CARTRIDGES),
            '","premises":"', LibNum.hexAddr(PREMISES),
            '","portal":"', LibNum.hexAddr(address(this)),
            '","originalHref":"', bytes(token).length == 0 ? "/" : string.concat("/token/", token, "/live"),
            '","workbenchHref":"', bytes(token).length == 0 ? "/modules" : string.concat("/token/", token, "/modules"),
            '"}'
        );
    }

    function _packed() private view returns (bytes memory data) {
        if (PACKED_ARCHIVE.codehash != PACKED_CODE_HASH) revert InvalidArchive();
        data = new bytes(PACKED_BYTES);
        uint256 offset;
        for (uint256 i; i < PACKED_CHUNKS; ++i) {
            bytes memory part = IModulePortalArchive(PACKED_ARCHIVE).readChunk(i);
            uint256 size = part.length;
            if (size == 0 || size > 23000 || size > PACKED_BYTES - offset) revert InvalidChunk();
            assembly ("memory-safe") { mcopy(add(add(data, 32), offset), add(part, 32), size) }
            offset += size;
        }
        if (offset != PACKED_BYTES || sha256(data) != PACKED_HASH) revert InvalidArchive();
    }

    function _document(string memory token) private view returns (string memory) {
        return string.concat(
            '<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width">',
            '<title>IPSEITY module workbench</title><body style="background:#080b13;color:#dbeaff;',
            'font:16px system-ui;padding:2rem"><p id="module-loader">Recovering the onchain workbench...</p>',
            '<script>(async()=>{try{const config=', _services(token),
            ';const encoded="', Base64.encode(_packed()), '";',
            'const compressed=Uint8Array.from(atob(encoded),c=>c.charCodeAt(0));',
            'const reader=new Blob([compressed]).stream().pipeThrough(new DecompressionStream("gzip")).getReader();',
            'const bytes=new Uint8Array(config.documentBytes);let offset=0;',
            'for(;;){const {value,done}=await reader.read();if(done)break;',
            'if(value.length>bytes.length-offset){await reader.cancel();throw Error("Workbench exceeds its committed byte length");}',
            'bytes.set(value,offset);offset+=value.length;}',
            'if(offset!==bytes.length)throw Error("Workbench byte length mismatch");',
            'const hash="0x"+Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256",bytes)),',
            'b=>b.toString(16).padStart(2,"0")).join("");',
            'if(hash!==config.documentHash)throw Error("Workbench SHA-256 mismatch");',
            'const html=new TextDecoder("utf-8",{fatal:true}).decode(bytes);',
            'globalThis.IPSEITY_MODULES=Object.freeze(config);',
            'document.open();document.write(html);document.close();',
            '}catch(error){document.getElementById("module-loader").textContent=',
            '"The workbench could not be recovered: "+String(error.message||error);}})()</script>'
        );
    }

    function _headers(string memory contentType) private pure returns (KeyValue[] memory h) {
        h = new KeyValue[](2);
        h[0] = KeyValue("Content-Type", contentType);
        h[1] = KeyValue("Cache-Control", "public, max-age=15");
    }
    function _html(string memory body) private pure returns (uint16, string memory, KeyValue[] memory) {
        return (200, body, _headers("text/html; charset=utf-8"));
    }
    function _json(string memory body) private pure returns (uint16, string memory, KeyValue[] memory) {
        return (200, body, _headers("application/json"));
    }
    function _notFound() private pure returns (uint16, string memory, KeyValue[] memory) {
        return (404, "No module route exists at this address.", _headers("text/plain; charset=utf-8"));
    }
    function _eq(string memory a, string memory b) private pure returns (bool) {
        return keccak256(bytes(a)) == keccak256(bytes(b));
    }
    function _toUint(string memory value) private pure returns (bool, uint256 number) {
        bytes memory b = bytes(value);
        if (b.length == 0 || b.length > 78) return (false, 0);
        for (uint256 i; i < b.length; ++i) {
            uint8 digit = uint8(b[i]);
            if (digit < 48 || digit > 57 || number > (type(uint256).max - (digit - 48)) / 10)
                return (false, 0);
            number = number * 10 + (digit - 48);
        }
        return (true, number);
    }
    function _exists(uint256 id) private view returns (bool) {
        try IModulePortalCollection(COLLECTION).ownerOf(id) returns (address holder) {
            return holder != address(0);
        } catch { return false; }
    }
}
