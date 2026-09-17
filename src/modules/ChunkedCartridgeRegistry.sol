// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC721} from "./vendor/ERC721.sol";
import {Base64} from "./vendor/Base64.sol";
import {ArtifactBinding} from "./ArtifactBinding.sol";
import {CartridgeTypes} from "./CartridgeTypes.sol";
import {AppChunk, OnchainApp} from "./OnchainApp.sol";

/// @notice Immutable, chunk-backed cartridge editions bound to the existing IPSEITY Reach.
/// @dev This is an additional ERC721 collection, not an upgrade of the original NFT or of
/// the legacy cartridge protocol. Publication grants no account permission. acquire()
/// uses an ordinary reviewed call from the existing Reach; no replacement account or
/// special execution path is introduced. Owning a cartridge does not conceal public bytes.
contract ChunkedCartridgeRegistry is ERC721 {
    struct Release {
        address publisher;
        address archive;
        bytes32 archiveCodeHash;
        bytes32 contentHash;
        bytes32 manifestHash;
        uint32 byteLength;
        string manifestJSON;
        address[] chunks;
        bytes32[] chunkCodeHashes;
        uint32[] chunkByteLengths;
    }

    // The public Release tuple stays unchanged. Its variable-length fields are
    // immutable data code instead of SSTORE strings and arrays: otherwise the
    // legal 1 MiB payload plus 16 KiB manifest exceeds the transaction gas cap.
    // ABI encoding the maximum manifest and all three 64-element arrays takes
    // 22,784 bytes, which fits one canonical 23,000-byte AppChunk.
    struct StoredRelease {
        address publisher;
        address archive;
        bytes32 archiveCodeHash;
        bytes32 contentHash;
        bytes32 manifestHash;
        uint32 byteLength;
        address metadata;
        bytes32 metadataCodeHash;
    }

    /// @dev Deploy the existing canonical adapter rather than accepting an injected
    /// ownership resolver. The native collection remains the ownership authority.
    ArtifactBinding public immutable artifact;
    uint256 public constant MAX_CONTENT_BYTES = 1_048_576;
    uint256 public constant MAX_CHUNK_BYTES = 23_000;
    uint256 public constant MAX_CHUNKS = 64;
    uint256 public constant MAX_MANIFEST_BYTES = 16_384;
    string public constant contentEncoding = "rawHTML";
    string public constant mimeType = "text/html;charset=utf-8";

    uint256 public nextReleaseId = 1;
    uint256 public nextId = 1;
    mapping(uint256 => StoredRelease) private _releases;
    mapping(uint256 => uint256) public releaseOfCartridge;
    uint256 private _entered = 1;

    error InvalidCollection();
    error InvalidManifest();
    error InvalidContent();
    error InvalidChunk();
    error UnknownRelease();
    error ArchiveChanged();
    error ChunkChanged();
    error MetadataChanged();
    error Reentered();

    event ReleasePublished(uint256 indexed releaseId, address indexed publisher, address indexed archive,
        bytes32 contentHash, bytes32 manifestHash, uint256 byteLength);
    event CartridgeAcquired(uint256 indexed id, uint256 indexed releaseId, address indexed holder);
    // Original cartridge event shapes remain available to existing receipt consumers.
    event CartridgeCreated(uint256 indexed id, address indexed owner, bytes32 contentHash);
    event ManifestUpdated(uint256 indexed id, uint64 revision, bytes32 contentHash, bytes32 manifestHash);
    event ManifestFrozen(uint256 indexed id, uint64 revision);
    event ContentPublished(uint256 indexed id, bytes32 contentHash, uint256 size);

    constructor(address collection_) {
        if (collection_.code.length == 0) revert InvalidCollection();
        artifact = new ArtifactBinding(collection_);
    }

    function name() public pure override returns (string memory) { return "IPSEITY Chunked Cartridge"; }
    function symbol() public pure override returns (string memory) { return "IPSECART"; }

    modifier nonReentrant() { if (_entered != 1) revert Reentered(); _entered = 2; _; _entered = 1; }

    /// @notice Publish one permanent raw-HTML edition using existing AppChunk data contracts.
    /// @dev A canonical OnchainApp verifies the complete SHA-256 before publication succeeds.
    /// Every address, code hash, byte length and manifest is then frozen. New versions require
    /// another release. No mutable reader or publisher-supplied archive implementation is used.
    /// JSON schema, UTF-8 and HTML validity remain publishing-client checks; no decompression
    /// or wallet permission is implied by this content declaration.
    function publishRelease(string calldata manifestJSON, address[] calldata chunks, bytes32 expectedSha256)
        external returns (uint256 releaseId)
    {
        uint256 manifestBytes = bytes(manifestJSON).length;
        if (manifestBytes == 0 || manifestBytes > MAX_MANIFEST_BYTES || expectedSha256 == bytes32(0))
            revert InvalidManifest();
        if (chunks.length == 0 || chunks.length > MAX_CHUNKS) revert InvalidChunk();
        uint256 length;
        for (uint256 i; i < chunks.length; ++i) {
            address chunk = chunks[i];
            uint256 size = chunk.code.length;
            if (size <= 1 || size > MAX_CHUNK_BYTES + 1) revert InvalidChunk();
            bytes1 first;
            assembly ("memory-safe") {
                let scratch := mload(0x40)
                extcodecopy(chunk, scratch, 0, 1)
                first := mload(scratch)
            }
            if (first != bytes1(0)) revert InvalidChunk();
            length += size - 1;
        }
        if (length == 0 || length > MAX_CONTENT_BYTES) revert InvalidContent();

        OnchainApp archive = new OnchainApp(chunks, expectedSha256);
        releaseId = nextReleaseId++;
        StoredRelease storage edition = _releases[releaseId];
        edition.publisher = msg.sender;
        edition.archive = address(archive);
        edition.archiveCodeHash = address(archive).codehash;
        edition.contentHash = expectedSha256;
        edition.manifestHash = keccak256(bytes(manifestJSON));
        edition.byteLength = uint32(length);
        bytes32[] memory hashes = new bytes32[](chunks.length);
        uint32[] memory lengths = new uint32[](chunks.length);
        for (uint256 i; i < chunks.length; ++i) {
            hashes[i] = chunks[i].codehash;
            lengths[i] = uint32(chunks[i].code.length - 1);
        }
        edition.metadata = address(new AppChunk(abi.encode(manifestJSON, chunks, hashes, lengths)));
        edition.metadataCodeHash = edition.metadata.codehash;
        emit ReleasePublished(releaseId, msg.sender, address(archive), expectedSha256, edition.manifestHash, length);
    }

    /// @notice Acquire an independent cartridge into the caller's custody.
    /// @dev An existing NFT account calls this through its ordinary execute() review.
    /// There is no recipient argument with which a stranger can force a cartridge into
    /// someone else's account. Transfers afterwards use the normal ERC721 authority.
    function acquire(uint256 releaseId) external nonReentrant returns (uint256 id) {
        Release memory edition = _release(releaseId);
        _assertIntact(edition);
        id = nextId++;
        releaseOfCartridge[id] = releaseId;
        _safeMint(msg.sender, id);
        emit CartridgeAcquired(id, releaseId, msg.sender);
        emit CartridgeCreated(id, msg.sender, edition.contentHash);
        emit ManifestUpdated(id, 1, edition.contentHash, edition.manifestHash);
        emit ManifestFrozen(id, 1);
        emit ContentPublished(id, edition.contentHash, edition.byteLength);
    }

    function releaseOf(uint256 releaseId) external view returns (Release memory) {
        return _release(releaseId);
    }

    function tokenURI(uint256 id) public view override returns (string memory) {
        ownerOf(id);
        return string.concat("data:application/json;base64,", Base64.encode(bytes(_release(releaseOfCartridge[id]).manifestJSON)));
    }

    /// @notice Exact original manifestOf ABI; every acquired edition is frozen at revision one.
    function manifestOf(uint256 id) external view returns (CartridgeTypes.Cartridge memory) {
        ownerOf(id);
        Release memory edition = _release(releaseOfCartridge[id]);
        return CartridgeTypes.Cartridge(edition.manifestJSON, edition.contentHash, 1, true);
    }

    /// @notice Recover the full bounded raw bytes without calling an untrusted content reader.
    /// @dev Code identity and lengths are checked before extcodecopy; full SHA-256 is checked
    /// again before returning. Old clients additionally verify this digest before execution.
    function contentOf(uint256 id) external view returns (bytes memory) {
        ownerOf(id);
        Release memory edition = _release(releaseOfCartridge[id]);
        _assertIntact(edition);
        bytes memory data = new bytes(edition.byteLength);
        uint256 cursor;
        for (uint256 i; i < edition.chunks.length; ++i) {
            address chunk = edition.chunks[i];
            uint256 size = edition.chunkByteLengths[i];
            assembly ("memory-safe") { extcodecopy(chunk, add(add(data, 32), cursor), 1, size) }
            cursor += size;
        }
        bytes32 digest;
        bool hashed;
        // The input is already contiguous. Hash that buffer directly instead
        // of allocating a second MiB solely to call the SHA-256 precompile.
        assembly ("memory-safe") {
            hashed := staticcall(gas(), 2, add(data, 32), mload(data), 0, 32)
            hashed := and(hashed, eq(returndatasize(), 32))
            digest := mload(0)
        }
        if (cursor != edition.byteLength || !hashed || digest != edition.contentHash) revert InvalidContent();
        return data;
    }

    /// @notice Exact legacy tuple and current-chain ownership/epoch semantics.
    /// @dev A parent NFT transfer changes controller and epoch immediately; cartridge
    /// ownership, release identity and original IPSEITY identity remain independent.
    function launchManifest(uint256 id, address player) public view returns (CartridgeTypes.LaunchManifest memory result) {
        address holder = ownerOf(id);
        Release memory edition = _release(releaseOfCartridge[id]);
        uint256 parentId = artifact.artifactIdOfAccount(holder);
        address controller = parentId == 0 ? holder : artifact.ownerOf(parentId);
        result = CartridgeTypes.LaunchManifest({
            manifestJSON: edition.manifestJSON,
            contentHash: edition.contentHash,
            manifestHash: edition.manifestHash,
            revision: 1,
            frozen: true,
            holder: holder,
            controller: controller,
            parentArtifactId: parentId,
            parentOwnershipEpoch: parentId == 0 ? 0 : artifact.ownershipEpoch(parentId),
            authorized: player != address(0) && player == controller,
            onchainContentAvailable: _intact(edition)
        });
    }

    function canLaunch(uint256 id, address player) external view returns (bool) {
        return launchManifest(id, player).authorized;
    }

    function _release(uint256 releaseId) private view returns (Release memory edition) {
        StoredRelease storage stored = _releases[releaseId];
        if (stored.archive == address(0)) revert UnknownRelease();
        address metadata = stored.metadata;
        if (metadata.codehash != stored.metadataCodeHash || metadata.code.length <= 1) revert MetadataChanged();
        bytes memory encoded = new bytes(metadata.code.length - 1);
        assembly ("memory-safe") { extcodecopy(metadata, add(encoded, 32), 1, mload(encoded)) }
        edition.publisher = stored.publisher;
        edition.archive = stored.archive;
        edition.archiveCodeHash = stored.archiveCodeHash;
        edition.contentHash = stored.contentHash;
        edition.manifestHash = stored.manifestHash;
        edition.byteLength = stored.byteLength;
        (edition.manifestJSON, edition.chunks, edition.chunkCodeHashes, edition.chunkByteLengths) =
            abi.decode(encoded, (string, address[], bytes32[], uint32[]));
    }

    function _intact(Release memory edition) private view returns (bool) {
        if (edition.archive.codehash != edition.archiveCodeHash) return false;
        for (uint256 i; i < edition.chunks.length; ++i) {
            address chunk = edition.chunks[i];
            if (chunk.codehash != edition.chunkCodeHashes[i] || chunk.code.length != uint256(edition.chunkByteLengths[i]) + 1) return false;
        }
        return true;
    }

    function _assertIntact(Release memory edition) private view {
        if (edition.archive.codehash != edition.archiveCodeHash) revert ArchiveChanged();
        for (uint256 i; i < edition.chunks.length; ++i) {
            address chunk = edition.chunks[i];
            if (chunk.codehash != edition.chunkCodeHashes[i] || chunk.code.length != uint256(edition.chunkByteLengths[i]) + 1) revert ChunkChanged();
        }
    }
}
