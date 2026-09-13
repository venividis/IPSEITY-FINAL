// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;
import {Etch} from "./Etch.sol";
import {DeskEtch} from "./DeskEtch.sol";
import {LibNum} from "./lib/LibNum.sol";
interface IPageEtchHub { function ownerOf(uint256 id) external view returns (address); }

/// The view layer can be deployed independently of existing token metadata.
contract PageEtch {
    using LibNum for uint256;
    Etch public immutable ETCH;
    DeskEtch public immutable DESK;
    IPageEtchHub public immutable HUB;
    uint256 public constant PAGE_SIZE = 32;
    error WrongArchive();
    constructor(Etch etch, DeskEtch desk) {
        if (address(desk.ETCH()) != address(etch)) revert WrongArchive();
        ETCH = etch; DESK = desk; HUB = IPageEtchHub(address(etch.HUB()));
    }
    function lane(uint256 id, uint256 offset) external view returns (string memory) {
        uint256 count = ETCH.count(id);
        uint256 end = offset >= count ? offset : offset + (PAGE_SIZE < count - offset ? PAGE_SIZE : count - offset);
        string memory rows;
        for (uint256 i = offset; i < end; ++i) {
            (Etch.Leaf memory leaf, bytes32 digest, address by) = ETCH.leafAt(id, i);
            rows = string.concat(rows, "<article><span class=eyebrow>", _kind(leaf.kind), " / ", i.str(),
                leaf.flags & 2 != 0 ? " / SEALED" : "", "</span><h3>",
                leaf.flags & 1 == 0 ? "Retracted" : "Inscribed", " <span>", uint256(leaf.size).str(),
                " bytes</span></h3><p class=hash>", LibNum.hex32(digest), "</p><p class=hash>By ",
                LibNum.hexAddr(by), "</p><a href=/token/", id.str(), "/", i.str(), ">",
                leaf.flags & 1 == 0 ? "View provenance" : leaf.kind == 3 ? "Download bytes" : "Read inscription", "</a></article>");
        }
        if (count == 0) rows = "<article><h3>An unwritten page.</h3><p>The first inscription will appear here after its transaction is mined.</p></article>";
        if (offset >= count && count != 0) rows = "<p>No entries at this offset.</p>";
        return string.concat(DESK.head(), "<header><a href=/token/", id.str(), ">IPSEITY</a><span>THE MEMORY ARCHIVE</span></header>",
            "<main><p class=eyebrow>TOKEN ", id.str(), " / CHAIN ", block.chainid.str(), "</p><h1>What it remembers.</h1>",
            "<p class=lead>Words become bytes. Bytes become a permanent part of this token's history.</p>",
            "<div class=summary><strong>", count.str(), " inscriptions</strong><span class=hash>",
            LibNum.hex32(ETCH.rootOf(id)), "</span></div><section class=layout><div><h2>Leave a memory</h2>",
            "<p>Everything written here is public and permanent. Retracting a listing does not erase its bytes.</p>",
            "<label for=kind>Format</label><select id=kind><option value=1>Memory / 1,024 bytes</option><option value=2>Note / 4,096 bytes</option>",
            "<option value=3>Data file / 24,575 bytes</option><option value=4>Glyph path / 512 bytes</option><option value=5>Shader term / stored only</option></select>",
            "<label for=words>Inscription</label><textarea id=words rows=7 placeholder='A moment worth keeping'></textarea>",
            "<label for=file>Or choose a data file</label><input id=file type=file><p class=muted>Memory and note formats use restricted ASCII. Use a data file for unrestricted text or binary content. Glyphs and shader terms are stored without executing.</p>",
            "<button id=preview>Connect and preview</button><div id=review hidden><h3>Review this inscription</h3><pre id=details></pre>",
            "<button id=send>Confirm in wallet</button><button id=cancel class=secondary>Cancel</button></div><p id=status role=status aria-live=polite></p></div>",
            "<div><h2>The archive</h2>", rows,
            end < count ? string.concat("<a href=/token/", id.str(), "/page/", end.str(), ">Next entries</a>") : "",
            "<p><a href=/token/", id.str(), "/sheet/", offset.str(), ">Read this page as JSON</a></p></div></section>",
            "<footer>Archive <span class=hash>", LibNum.hexAddr(address(ETCH)), "</span><br>Owner <span class=hash>",
            LibNum.hexAddr(HUB.ownerOf(id)), "</span></footer></main>", DESK.config(id), DESK.client(), "</body></html>");
    }

    function _kind(uint8 k) private pure returns (string memory) {
        if (k == 1) return "MEMORY"; if (k == 2) return "NOTE"; if (k == 3) return "DATA";
        if (k == 4) return "GLYPH"; return "TERM";
    }
}
