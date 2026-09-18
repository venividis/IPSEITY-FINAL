// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {Engine} from "../src/Engine.sol";
import {Sigil} from "../src/Sigil.sol";
import {Renderer} from "../src/Renderer.sol";
import {Ipseity, IRenderer} from "../src/Ipseity.sol";
import {IpseityAccount} from "../src/IpseityAccount.sol";
import {GripVault} from "../src/GripVault.sol";
import {ERC6551Registry} from "./mocks/ERC6551Registry.sol";
import {AppChunk, OnchainApp} from "../src/modules/OnchainApp.sol";
import {ModuleTypes} from "../src/modules/ModuleTypes.sol";
import {ModuleArchiveFactory} from "../src/modules/ModuleArchiveFactory.sol";
import {ExtensionReleaseRegistry} from "../src/modules/ExtensionReleaseRegistry.sol";
import {TokenModuleRegistry} from "../src/modules/TokenModuleRegistry.sol";
import {ModuleStateStore} from "../src/modules/ModuleStateStore.sol";
import {ModuleWorkbench} from "../src/modules/ModuleWorkbench.sol";
import {ArtifactBinding} from "../src/modules/ArtifactBinding.sol";
import {ChunkedCartridgeRegistry} from "../src/modules/ChunkedCartridgeRegistry.sol";
import {CartridgeTypes} from "../src/modules/CartridgeTypes.sol";

/// @dev Only the saturation test uses this reader. The behavioral suite below
/// mints a real Ipseity and executes through its actual canonical Reach.
contract ModulesSaturatedIdentity {
    function ownerOf(uint256) external pure returns (address) { return address(1); }
    function statsOf(uint256) external pure returns (uint256, uint256, uint256, uint256) {
        return (0, type(uint32).max, 0, 0);
    }
}

contract ModulesFalseAccount {
    address immutable collection;
    constructor(address collection_) { collection = collection_; }
    function token() external view returns (uint256, address, uint256) {
        return (block.chainid, collection, 1);
    }
    function owner() external pure returns (address) { return address(0xA11CE); }
}

contract ModulesReentrantReceiver {
    ChunkedCartridgeRegistry immutable cartridges;
    uint256 releaseId;
    bool public refused;
    constructor(ChunkedCartridgeRegistry registry) { cartridges = registry; }
    function acquire(uint256 release_) external {
        releaseId = release_;
        cartridges.acquire(release_);
    }
    function onERC721Received(address, address, uint256, bytes calldata) external returns (bytes4) {
        (bool success,) = address(cartridges).call(abi.encodeCall(cartridges.acquire, (releaseId)));
        refused = !success;
        return this.onERC721Received.selector;
    }
}

contract ModulesTest is Test {
    Ipseity token;
    IpseityAccount reach;
    ModuleArchiveFactory factory;
    ExtensionReleaseRegistry releases;
    TokenModuleRegistry modules;
    ModuleStateStore states;
    ChunkedCartridgeRegistry cartridges;
    uint256 id;
    bytes32 releaseId;
    bytes32 key;
    address alice = address(0xA11CE);
    address bob = address(0xB0B);
    bytes32 constant SCHEMA = keccak256("ipseity.test-state/1");
    bytes32 constant MODULE = keccak256("notebook");

    function setUp() public {
        vm.etch(0x000000006551c19487814612e58FE06813775758, address(new ERC6551Registry()).code);
        Engine engine = new Engine(false);
        engine.loadHead(bytes("<!doctype html><html><head><title>IPSEITY</title></head>"));
        engine.loadBody(bytes("<body>The original instrument</body></html>"));
        engine.freeze();
        Renderer renderer = new Renderer(engine, new Sigil());
        token = new Ipseity(IRenderer(address(renderer)), address(new IpseityAccount()), address(new GripVault()));
        vm.deal(alice, 100 ether);
        vm.deal(bob, 100 ether);
        vm.prank(alice);
        id = token.mint{value: 0.01 ether}();
        reach = IpseityAccount(payable(token.embody(id)));
        factory = new ModuleArchiveFactory();
        releases = new ExtensionReleaseRegistry(address(factory));
        modules = new TokenModuleRegistry(address(token), address(releases));
        states = modules.stateStore();
        cartridges = new ChunkedCartridgeRegistry(address(token));
        releaseId = _publish(MODULE, 1, SCHEMA);
        key = releases.moduleKey(address(this), MODULE);
    }

    function _archive(bytes memory data) internal returns (ModuleTypes.Archive memory descriptor) {
        address[] memory chunks = new address[](1);
        chunks[0] = address(new AppChunk(data));
        address archive = factory.createArchive(chunks, sha256(data));
        descriptor = ModuleTypes.Archive(archive, 1, sha256(data), uint32(data.length), sha256(data), uint32(data.length), archive.codehash);
    }

    function _publish(bytes32 moduleId, uint64 version, bytes32 schema) internal returns (bytes32) {
        ModuleTypes.ReleaseInput memory input;
        input.moduleId = moduleId;
        input.version = version;
        input.payload = _archive(bytes("{\"schema\":\"anima.module-scene/1\"}"));
        input.runtime = keccak256("anima.scene/1");
        input.hostAPI = keccak256("anima.host/1");
        input.stateSchema = schema;
        return releases.publish(input, bytes("{}"));
    }

    function _act(address holder, address target, bytes memory data) internal returns (bytes memory) {
        vm.prank(holder);
        return reach.execute(target, 0, data, 0);
    }

    function _stage(bytes32 moduleKey, bytes32 schema, bytes memory data) internal returns (bytes32) {
        ModuleTypes.Archive memory empty;
        bytes memory callData = abi.encodeCall(modules.stageState, (id, moduleKey, modules.rootOf(id), modules.custodyEpoch(id), schema, data, empty));
        return abi.decode(_act(alice, address(modules), callData), (bytes32));
    }

    function _activate(bytes32 edition, bytes32 beforeHead, bytes32 nextHead) internal {
        _act(alice, address(modules), abi.encodeCall(modules.activate, (id, edition, modules.rootOf(id), modules.custodyEpoch(id), beforeHead, nextHead)));
    }

    function _payload(uint256 length) internal pure returns (bytes memory data) {
        data = new bytes(length);
        // Period eight also divides 23,000, so repeated canonical chunks recover
        // exactly this nonzero varying pattern, including the final short chunk.
        bytes32 pattern = 0x0102030405060708010203040506070801020304050607080102030405060708;
        assembly ("memory-safe") {
            let start := add(data, 32)
            for { let i := 0 } lt(i, length) { i := add(i, 32) } { mstore(add(start, i), pattern) }
        }
    }

    function _cartridgeChunks(uint256 length) internal returns (address[] memory chunks, bytes memory data) {
        data = _payload(length);
        uint256 count = (length + 22999) / 23000;
        chunks = new address[](count);
        address full = address(new AppChunk(_payload(length < 23000 ? length : 23000)));
        for (uint256 i; i < count; ++i) {
            uint256 remaining = length - i * 23000;
            chunks[i] = remaining >= 23000 || i == 0 ? full : address(new AppChunk(_payload(remaining)));
        }
    }

    function _cartridgeRelease(uint256 length) internal returns (uint256 edition, bytes memory data) {
        address[] memory chunks;
        (chunks, data) = _cartridgeChunks(length);
        edition = cartridges.publishRelease("{\"name\":\"IPSEITY test cartridge\"}", chunks, sha256(data));
    }

    function test_modulesUseTheOriginalCanonicalReachWithoutChangingIdentity() public {
        assertEq(modules.accountOf(id), address(reach));
        assertEq(modules.custodyEpoch(id), 1);
        assertEq(modules.authorityType(), keccak256("ipseity.reach-modules/1"));
        assertEq(cartridges.artifact().artifactIdOfAccount(address(reach)), id);
        assertEq(cartridges.artifact().artifactIdOfAccount(token.grip(id)), 0);
        assertEq(cartridges.artifact().artifactIdOfAccount(address(new ModulesFalseAccount(address(token)))), 0);
        address renderer = address(token.renderer());
        address grip = token.grip(id);
        _activate(releaseId, bytes32(0), bytes32(0));
        assertEq(address(token.renderer()), renderer);
        assertEq(token.account(id), address(reach));
        assertEq(token.grip(id), grip);
        assertEq(token.ownerOf(id), alice);
        assertEq(token.totalSupply(), 1);
    }

    function test_modulesRejectDirectOwnersOperatorsAndRenters() public {
        vm.prank(alice);
        token.approve(bob, id);
        vm.prank(alice);
        token.setUser(id, bob, uint64(block.timestamp + 1 days));
        vm.expectRevert(TokenModuleRegistry.Unauthorized.selector);
        vm.prank(alice);
        modules.activate(id, releaseId, bytes32(0), 1, bytes32(0), bytes32(0));
        vm.expectRevert(TokenModuleRegistry.Unauthorized.selector);
        vm.prank(bob);
        modules.activate(id, releaseId, bytes32(0), 1, bytes32(0), bytes32(0));
        vm.expectRevert(IpseityAccount.NotSigner.selector);
        vm.prank(bob);
        reach.execute(address(modules), 0, abi.encodeCall(modules.activate, (id, releaseId, bytes32(0), 1, bytes32(0), bytes32(0))), 0);
    }

    function test_modulesStagingIsDiscoverableBeforeAnyInstallation() public {
        bytes32 snapshot = _stage(key, SCHEMA, bytes("first thought"));
        assertEq(modules.rootOf(id), bytes32(0));
        assertEq(modules.moduleCount(id), 0);
        assertEq(modules.stateModuleCount(id), 1);
        (bytes32[] memory keys, uint256 next) = modules.stateModulesOf(id, 0, 64);
        assertEq(keys[0], key);
        assertEq(next, 1);
        (bytes32[] memory history, uint256 cursor) = states.historyOf(id, key, 0, 64);
        assertEq(history[0], snapshot);
        assertEq(cursor, 1);
        assertEq(states.dataOf(snapshot), bytes("first thought"));
    }

    function test_modulesDisableKeepsStateHistoryAndOtherModulesIndependent() public {
        bytes32 snapshot = _stage(key, SCHEMA, bytes("kept forever"));
        _activate(releaseId, bytes32(0), snapshot);
        bytes32 gardenId = _publish(keccak256("garden"), 1, SCHEMA);
        bytes32 gardenKey = releases.moduleKey(address(this), keccak256("garden"));
        _activate(gardenId, bytes32(0), bytes32(0));
        _act(alice, address(modules), abi.encodeCall(modules.disable, (id, key, modules.rootOf(id), 1)));
        TokenModuleRegistry.Installation memory old = modules.installation(id, key);
        assertFalse(old.enabled);
        assertEq(old.stateHead, snapshot);
        assertEq(states.dataOf(snapshot), bytes("kept forever"));
        assertTrue(modules.installation(id, gardenKey).enabled);
        assertEq(modules.historyCount(id), 3);
        assertEq(modules.moduleCount(id), 2);
    }

    function test_modulesUpgradeRequiresACompatibleExplicitBranch() public {
        bytes32 snapshot = _stage(key, SCHEMA, bytes("version one"));
        _activate(releaseId, bytes32(0), snapshot);
        bytes32 schema2 = keccak256("ipseity.test-state/2");
        bytes32 release2 = _publish(MODULE, 2, schema2);
        bytes32 root = modules.rootOf(id);
        vm.expectRevert(TokenModuleRegistry.InvalidState.selector);
        _act(alice, address(modules), abi.encodeCall(modules.activate, (id, release2, root, 1, snapshot, snapshot)));
        bytes32 branch = _stage(key, schema2, bytes("migrated version two"));
        _activate(release2, snapshot, branch);
        assertEq(states.record(branch).parent, snapshot);
        assertEq(modules.installation(id, key).stateHead, branch);
        bytes32 historical = _stage(key, SCHEMA, states.dataOf(snapshot));
        _activate(releaseId, branch, historical);
        assertEq(states.record(historical).parent, branch);
        assertEq(states.dataOf(historical), states.dataOf(snapshot));
    }

    function test_modulesRejectStaleRootsAndCustodyAfterTransferAwayAndBack() public {
        bytes32 staged = _stage(key, SCHEMA, bytes("seller draft"));
        bytes memory reviewed = abi.encodeCall(modules.activate, (id, releaseId, bytes32(0), 1, bytes32(0), staged));
        vm.prank(alice);
        token.transferFrom(alice, bob, id);
        assertEq(modules.custodyEpoch(id), 2);
        vm.expectRevert(TokenModuleRegistry.StaleReview.selector);
        _act(bob, address(modules), reviewed);
        vm.prank(bob);
        token.transferFrom(bob, alice, id);
        assertEq(modules.custodyEpoch(id), 3);
        vm.expectRevert(TokenModuleRegistry.StaleReview.selector);
        _act(alice, address(modules), reviewed);
        bytes32 fresh = _stage(key, SCHEMA, bytes("current owner draft"));
        _activate(releaseId, bytes32(0), fresh);
        bytes memory staleRoot = abi.encodeCall(modules.disable, (id, key, bytes32(0), 3));
        vm.expectRevert(TokenModuleRegistry.StaleReview.selector);
        _act(alice, address(modules), staleRoot);
        assertEq(states.dataOf(staged), bytes("seller draft"));
    }

    function test_modulesFailClosedWhenTheExistingTransferStatisticSaturates() public {
        address saturated = address(new ModulesSaturatedIdentity());
        TokenModuleRegistry bound = new TokenModuleRegistry(saturated, address(releases));
        ArtifactBinding identity = new ArtifactBinding(saturated);
        vm.expectRevert(TokenModuleRegistry.ExhaustedCustodyEpoch.selector);
        bound.custodyEpoch(1);
        vm.expectRevert(ArtifactBinding.ExhaustedCustodyEpoch.selector);
        identity.ownershipEpoch(1);
    }

    function test_modulesCannotWriteStateOutsideTheRegistryOrPastTheDirectLimit() public {
        ModuleTypes.Archive memory empty;
        vm.expectRevert(ModuleStateStore.Unauthorized.selector);
        states.append(id, key, SCHEMA, bytes32(0), 1, bytes("forged"), empty);
        bytes memory oversized = _payload(32769);
        bytes memory callData = abi.encodeCall(modules.stageState, (id, key, bytes32(0), 1, SCHEMA, oversized, empty));
        vm.expectRevert(ModuleStateStore.InvalidState.selector);
        _act(alice, address(modules), callData);
    }

    function test_modulesFull32KiBStateRoundTripsUnderTheTransactionGasCap() public {
        bytes memory data = _payload(32768);
        ModuleTypes.Archive memory empty;
        bytes memory stage = abi.encodeCall(modules.stageState, (id, key, bytes32(0), 1, SCHEMA, data, empty));
        uint256 beforeGas = gasleft();
        bytes32 snapshot = abi.decode(_act(alice, address(modules), stage), (bytes32));
        uint256 used = beforeGas - gasleft();
        // Covers execution plus a conservative 600,000 intrinsic/calldata budget,
        // then the same 20% headroom as the browser. Exact transaction receipts
        // are separately measured by the integration runner.
        assertTrue((used + 600000) * 6 / 5 < 2 ** 24);
        assertEq(states.dataOf(snapshot), data);
        assertEq(states.record(snapshot).dataHash, sha256(data));
        _activate(releaseId, bytes32(0), snapshot);
        bytes memory write = abi.encodeCall(modules.writeState, (id, key, modules.rootOf(id), 1, data, empty));
        beforeGas = gasleft();
        bytes32 second = abi.decode(_act(alice, address(modules), write), (bytes32));
        used = beforeGas - gasleft();
        assertTrue((used + 600000) * 6 / 5 < 2 ** 24);
        assertEq(states.dataOf(second), data);
        assertEq(states.record(second).parent, snapshot);
        assertEq(states.dataOf(snapshot), data);
    }

    function test_modulesRecoverBothSidesOfTheDirectChunkBoundaryAndEmptyState() public {
        uint256[4] memory sizes = [uint256(0), 1, 23000, 23001];
        for (uint256 i; i < sizes.length; ++i) {
            bytes memory data = _payload(sizes[i]);
            bytes32 snapshot = _stage(key, SCHEMA, data);
            assertEq(states.dataOf(snapshot), data);
            assertEq(states.record(snapshot).dataHash, sha256(data));
        }
        assertEq(states.countOf(id, key), 4);
    }

    function test_modulesAllowOnlyExplicitlyGrantedSessionActionsAndRetireThemOnSale() public {
        address[] memory targets = new address[](1);
        targets[0] = address(modules);
        bytes4[] memory selectors = new bytes4[](1);
        selectors[0] = modules.activate.selector;
        vm.prank(alice);
        reach.grantSession(bob, uint64(block.timestamp + 1 days), 0, targets, selectors);
        vm.prank(bob);
        reach.executeAsSession(address(modules), 0, abi.encodeCall(modules.activate, (id, releaseId, bytes32(0), 1, bytes32(0), bytes32(0))));
        assertTrue(modules.installation(id, key).enabled);
        bytes memory disable = abi.encodeCall(modules.disable, (id, key, modules.rootOf(id), 1));
        vm.expectRevert();
        vm.prank(bob);
        reach.executeAsSession(address(modules), 0, disable);
        vm.prank(alice);
        token.transferFrom(alice, bob, id);
        assertFalse(reach.sessionCurrent(bob));
        bytes memory afterSale = abi.encodeCall(modules.activate, (id, releaseId, modules.rootOf(id), 2, bytes32(0), bytes32(0)));
        vm.expectRevert();
        vm.prank(bob);
        reach.executeAsSession(address(modules), 0, afterSale);
    }

    function test_modulesWorkbenchRecoversItsImmutableBytesAndServices() public {
        bytes memory document = bytes("<!doctype html><title>IPSEITY modules</title>");
        ModuleTypes.Archive memory archive = _archive(document);
        ModuleWorkbench workbench = new ModuleWorkbench(modules, archive.archive);
        assertEq(workbench.readChunk(0), document);
        assertEq(workbench.contentSha256(), sha256(document));
        (uint256 chain, address collection, address registry, address editions, address store, address at, bytes32 digest) = workbench.services();
        assertEq(chain, block.chainid);
        assertEq(collection, address(token));
        assertEq(registry, address(modules));
        assertEq(editions, address(releases));
        assertEq(store, address(states));
        assertEq(at, archive.archive);
        assertEq(digest, sha256(document));
    }

    function test_modulesCartridge48KiBRoundTripsAndFollowsTheParentOwner() public {
        (uint256 edition, bytes memory data) = _cartridgeRelease(49152);
        uint256 cartridge = abi.decode(_act(alice, address(cartridges), abi.encodeCall(cartridges.acquire, (edition))), (uint256));
        assertEq(cartridges.ownerOf(cartridge), address(reach));
        assertEq(cartridges.contentOf(cartridge), data);
        CartridgeTypes.LaunchManifest memory launch = cartridges.launchManifest(cartridge, alice);
        assertEq(launch.parentArtifactId, id);
        assertEq(launch.parentOwnershipEpoch, 1);
        assertTrue(launch.authorized);
        assertTrue(launch.onchainContentAvailable);
        assertEq(launch.contentHash, sha256(data));
        vm.prank(alice);
        token.transferFrom(alice, bob, id);
        launch = cartridges.launchManifest(cartridge, alice);
        assertFalse(launch.authorized);
        assertEq(launch.controller, bob);
        assertEq(launch.parentOwnershipEpoch, 2);
        assertTrue(cartridges.canLaunch(cartridge, bob));
    }

    function test_modulesCartridgeOneMiBRoundTripsThroughTheExactLegacyABI() public {
        (uint256 edition, bytes memory data) = _cartridgeRelease(1048576);
        vm.prank(alice);
        uint256 cartridge = cartridges.acquire(edition);
        assertEq(cartridges.contentOf(cartridge), data);
        CartridgeTypes.Cartridge memory manifest = cartridges.manifestOf(cartridge);
        assertEq(manifest.contentHash, sha256(data));
        assertEq(manifest.revision, 1);
        assertTrue(manifest.frozen);
        assertTrue(cartridges.canLaunch(cartridge, alice));
        assertFalse(cartridges.canLaunch(cartridge, bob));
        assertTrue(bytes(cartridges.tokenURI(cartridge)).length > 29);
        assertEq(cartridges.releaseOf(edition).chunks.length, 46);
    }

    function test_modulesCartridgeReceiverCannotReenterAcquisition() public {
        (uint256 edition,) = _cartridgeRelease(128);
        ModulesReentrantReceiver receiver = new ModulesReentrantReceiver(cartridges);
        receiver.acquire(edition);
        assertTrue(receiver.refused());
        assertEq(cartridges.balanceOf(address(receiver)), 1);
        assertEq(cartridges.nextId(), 2);
    }

    function test_modulesMaximumCartridgeAndManifestFitTheGasCapAndRecoverExactly() public {
        bytes memory data = new bytes(1048576);
        address[] memory chunks = new address[](64);
        for (uint256 i; i < chunks.length; ++i) {
            bytes memory part = _payload(16384);
            part[0] = bytes1(uint8(i + 1));
            chunks[i] = address(new AppChunk(part));
            assembly ("memory-safe") {
                let source := add(part, 32)
                let target := add(add(data, 32), mul(i, 16384))
                for { let cursor := 0 } lt(cursor, 16384) { cursor := add(cursor, 32) } {
                    mstore(add(target, cursor), mload(add(source, cursor)))
                }
            }
        }
        bytes memory manifest = new bytes(16384);
        assembly ("memory-safe") {
            let start := add(manifest, 32)
            for { let i := 0 } lt(i, 16384) { i := add(i, 32) } {
                mstore(add(start, i), 0x7878787878787878787878787878787878787878787878787878787878787878)
            }
        }
        bytes memory prefix = bytes("{\"name\":\"");
        for (uint256 i; i < prefix.length; ++i) manifest[i] = prefix[i];
        manifest[16382] = bytes1('"');
        manifest[16383] = bytes1('}');
        bytes32 contentHash = sha256(data);
        uint256 beforeGas = gasleft();
        uint256 edition = cartridges.publishRelease(string(manifest), chunks, contentHash);
        uint256 used = beforeGas - gasleft();
        assertTrue((used + 600000) * 6 / 5 < 2 ** 24);
        ChunkedCartridgeRegistry.Release memory recovered = cartridges.releaseOf(edition);
        assertEq(bytes(recovered.manifestJSON), manifest);
        assertEq(recovered.manifestHash, keccak256(manifest));
        assertEq(recovered.chunks.length, chunks.length);
        for (uint256 i; i < chunks.length; ++i) {
            assertEq(recovered.chunks[i], chunks[i]);
            assertEq(recovered.chunkCodeHashes[i], chunks[i].codehash);
            assertEq(recovered.chunkByteLengths[i], chunks[i].code.length - 1);
        }
        vm.prank(alice);
        uint256 cartridge = cartridges.acquire(edition);
        assertEq(cartridges.contentOf(cartridge), data);
        assertEq(bytes(cartridges.manifestOf(cartridge).manifestJSON), manifest);
        assertEq(bytes(cartridges.launchManifest(cartridge, alice).manifestJSON), manifest);
    }

    function test_modulesCartridgesRejectCorruptionAndOversizedPublications() public {
        (uint256 edition,) = _cartridgeRelease(128);
        vm.prank(alice);
        uint256 cartridge = cartridges.acquire(edition);
        ChunkedCartridgeRegistry.Release memory original = cartridges.releaseOf(edition);
        vm.expectRevert();
        cartridges.publishRelease("{}", original.chunks, bytes32(uint256(1)));
        assertEq(cartridges.nextReleaseId(), edition + 1);
        vm.etch(original.chunks[0], hex"00626164");
        assertFalse(cartridges.launchManifest(cartridge, alice).onchainContentAvailable);
        vm.expectRevert(ChunkedCartridgeRegistry.ChunkChanged.selector);
        cartridges.contentOf(cartridge);
        address[] memory tooMany = new address[](65);
        vm.expectRevert(ChunkedCartridgeRegistry.InvalidChunk.selector);
        cartridges.publishRelease("{}", tooMany, bytes32(uint256(1)));
    }
}
