# Immutable modules on the existing IPSEITY Reach

The module contracts add permanent packages, independent saved state, and game cartridges to an existing IPSEITY collection. They use the collection's existing ERC-6551 Reach. They do not replace the collection, its renderer, the instrument, either account implementation, or Parley's conversation archive.

This is a source integration from [MASTER-NFT-PROJECT at e12e0cd](https://github.com/venividis/MASTER-NFT-PROJECT/tree/e12e0cd). It is not a claim that the companions are already deployed on a public chain. Release-wide validation and deployment instructions belong in `MASTER-INTEGRATION.md`; the authority and storage rules are stated here.

## The existing account remains the authority

`TokenModuleRegistry.collection()` is the original IPSEITY collection. A mutation passes only when all of these agree:

1. The caller is `collection.account(tokenId)`, the canonical Reach derived by IPSEITY through the ERC-6551 registry.
2. The caller's `token()` footer names the current chain, that collection, and that token ID.
3. The caller's `owner()` agrees with `collection.ownerOf(tokenId)`.
4. The supplied catalog root and custody epoch still match the chain.

A contract which merely implements a plausible `token()` function cannot impersonate the Reach. Direct calls from the holder, an approved ERC-721 operator, or a renter do not pass the module registry. The holder calls through `Reach.execute(target, value, data, 0)`. The fourth argument is the IPSEITY CALL operation; the three-argument MASTER account ABI does not apply here.

`accountOf(id)` is a registry helper for `collection.account(id)`. `custodyEpoch(id)` returns `uint64(statsOf(id).xfers) + 1`. The first holder therefore has epoch one; transferring away and back does not revive an earlier review. IPSEITY's existing display statistic saturates at `uint32.max`, so the module registry and cartridge binding refuse that terminal value with `ExhaustedCustodyEpoch`. They do not silently treat a later transfer as unchanged custody. Stored records and payload bytes remain readable. This epoch is unrelated to `Reach.sessionEpoch(address key)`, which retires an individual key's old allowlist.

The discovery marker is explicit:

```solidity
bytes32 public constant authorityType = keccak256("ipseity.reach-modules/1");
```

The release and state formats retain their `anima.*` domains, while the account adapter requires this separate IPSEITY authority marker. Format compatibility is not permission to assume that two account ABIs are interchangeable.

The Reach still decides who may execute a call. A session must have the module registry as an allowed target and the particular mutation selector as an allowed selector, remain unexpired, stay within its spend cap, and belong to the current custody. Installing or publishing a module creates none of those grants. The Reach's existing seal checks remain around execution, including its native-value refusals and asset measurements. These companions introduce no alternate path around them. The Grip receives no execute function.

## Packages are immutable data, with explicit verification

`AppChunk` is a STOP-prefixed data contract containing 1–23,000 payload bytes. `OnchainApp` records up to 64 chunks and verifies the complete SHA-256 during construction. Its SHA-256 precompile call hashes the assembled buffer directly: avoiding a second large allocation changes gas use, not the digest or reader ABI.

`ModuleArchiveFactory` recognizes only canonical archives it constructs. A directory has at most 16 registered leaves, each with at most 32 chunks. Each leaf's complete digest is verified by its own constructor. A directory's concatenated digest is a commitment supplied at construction, not a digest derivable from the leaf hashes; the recovery client must assemble the bytes and verify the complete hash. The descriptor's expanded hash is likewise checked after bounded decompression by the client. No archive contract claims that a declared package is safe to execute.

`ExtensionReleaseRegistry` binds a release to its publisher, module identifier, version, manifest hash, payload descriptor, runtime, host API, state schema, capabilities, and exact dependencies. A publisher/module version cannot be overwritten. Dependencies must already exist and be uniquely sorted; capability declarations are also bounded and uniquely sorted. The manifest is at most 16,384 bytes, and each release has at most 16 dependencies and 16 capability declarations. Catalog pages contain at most 64 entries.

Publication does not install a release. Installation does not delegate wallet authority. Package bytes and metadata are public chain data, regardless of who can operate the NFT.

## Saved state belongs to the NFT and module

`ModuleStateStore.namespaceOf(id, key)` is `keccak256(abi.encode(collection, id, key))`. Each record commits to its schema, parent, custody epoch, data hash, archive descriptor, and index. Only its bound installation registry may append. There is no overwrite or delete operation.

A direct snapshot is at most 32,768 bytes. It is held in one or two canonical data contracts, split at 23,000 bytes, so a complete snapshot does not incur one SSTORE for every data word. Empty snapshots allocate no data contract. An archive-backed snapshot supplies its validated descriptor and no direct bytes. The factory's expanded descriptor bound is 64 MiB; individual client runtimes may impose smaller execution or recovery limits.

`stageState` records a recoverable candidate without moving the active catalog root or state head. `stateModulesOf` discovers even namespaces that were staged but never installed. `activate` chooses a release and a compatible state head atomically. A new head must belong to the same namespace, match the release's state schema, extend the reviewed active head, and come from the current custody epoch. Keeping an existing compatible head does not require rewriting inherited history.

Restoring historical bytes means explicitly staging a new branch and reviewing its activation. It does not mutate the historical record. `writeState` uses the enabled release's schema, and `disable` retains the release, state head, and all previous records. Independent module keys retain independent state. Active catalog changes form their own append-only root history; state staging remains independently enumerable.

## The personal journal is a state namespace

The IPSEITY host uses the same reviewed `stageState` path for a journal entry. It does not require a MASTER `MemoryLedger` contract or replace Parley. The client reserves:

```text
module key = keccak256(UTF8("ipseity.personal-journal/1"))
state schema = SHA256(UTF8("ipseity.journal-entry/1"))
```

These identifiers are a host convention, not a new privilege in the Solidity registry. They remain subject to the same canonical account and custody checks. Every entry is a separate opaque snapshot discovered through the state history; staging an entry neither installs a module nor changes the active catalog root.

The host limits text to 3,000 UTF-8 bytes and encrypted packets to 16 KiB. Public mode stores the exact words. Encrypted mode stores the locally prepared ciphertext and authenticated identity header; that header remains public, and the passphrase must be retained separately. Original `anima.encrypted-journal-packet/1` exports remain readable. The contract stores bytes, not encryption keys, and does not authenticate the semantic contents of a journal. Journal-specific privacy, packet, and pagination checks live in `web/modules/journal.mjs` and `web/modules/adapter.mjs`.

## Cartridges have their own ownership

`ChunkedCartridgeRegistry` is an additional ERC-721 collection. `publishRelease` fixes a raw payload of at most 1,048,576 bytes, at most 64 chunks, and a manifest of at most 16,384 bytes. Every chunk is at most 23,000 bytes. Publication verifies the full payload digest through a canonical `OnchainApp` and records immutable addresses, code hashes, lengths, and manifest identity.

The variable release fields are encoded into a canonical `AppChunk`, rather than written as a large storage string and three arrays. The maximum legal manifest and 64 entries in each array encode to 22,784 bytes. The fixed record pins that metadata contract's code hash. `releaseOf` reconstructs the original public `Release` tuple; `manifestOf`, `launchManifest`, `contentOf`, and the base64 JSON `tokenURI` retain their legacy shapes. Readback checks the payload's pinned chunk identities and hashes the assembled bytes directly without a second full input copy.

This storage change addresses a measured failure: the initial port's legal 1 MiB payload plus 16 KiB manifest required 24,904,819 gas to publish. The maximum combination is now a required capped-transaction regression, including wallet gas headroom; publication bounds were retained rather than silently reduced. The actual local JSON-RPC regression after the fix uses 64 distinct 16 KiB chunks and the full 16 KiB manifest: `eth_estimateGas` returned 10,089,136, the reviewed transaction gas limit was 12,106,964 including 20% headroom, and the mined receipt consumed 10,010,926 gas. The reviewed limit remains below 16,777,216. Exact metadata and payload recovery passed, including a separate cold `contentOf` `eth_call` capped at 10,000,000 gas. That read budget remains an explicit regression gate. The release validation record identifies the final tested source revision and full gate.

`acquire(releaseId)` mints only to the caller. There is no recipient argument with which a stranger can place a cartridge in somebody else's Reach. An ordinary reviewed Reach call can acquire it into the NFT's custody; an EOA can acquire its own copy. Normal ERC-721 transfer authority applies afterwards. Receiver callbacks cannot reenter acquisition.

For a cartridge held by a verified canonical Reach, `ArtifactBinding` derives the current controller and custody epoch from its parent IPSEITY. A parent transfer immediately changes both. For an ordinary holder, the holder is the controller. Ownership does not hide the payload. IPSEITY's existing Nest recursively opens its own instrument; these legacy cartridge methods do not silently turn Nest into a cartridge browser. The companion workbench supplies the cartridge interface.

## Discovery and existing deployments

`ModuleWorkbench` pins a factory-recognized raw document, its code identity, byte length, SHA-256, and bounded chunk count. Its document is at most 1 MiB and 64 chunks. Readers verify the complete digest before opening recovered HTML.

```solidity
services() returns (
    uint256 chainId,
    address collection,
    address installations,
    address releases,
    address stateStore,
    address document,
    bytes32 documentHash
)
```

The addresses lead from the workbench to its installation registry, release registry, state store, and raw document without a signing key. The companion `ModulePortal` provides the human and machine routes and forwards existing routes to the original Premises. It is a new contract; an already deployed immutable router is not modified by updating this repository.

The existing collection, Reach implementation, Grip implementation, Engine, Renderer, and Parley are unchanged source files in this integration. No migration of their storage is performed. New companion deployment must name the intended existing collection and preserve its original identities. Changing source code cannot upgrade an already deployed immutable account or recover a lost passphrase.

## Provenance

Source revision: [`venividis/MASTER-NFT-PROJECT@e12e0cd`](https://github.com/venividis/MASTER-NFT-PROJECT/tree/e12e0cd). Paths below are relative to the repository root. All copied Solidity dependencies are local to `src/modules`; no external Solidity package is resolved at runtime or compilation.

| IPSEITY file | MASTER source | Port changes |
|---|---|---|
| `src/modules/ModuleTypes.sol` | `contracts/src/modules/ModuleTypes.sol` | Tuple formats retained. |
| `src/modules/ModuleArchiveFactory.sol` | `contracts/src/modules/ModuleArchiveFactory.sol` | Local archive imports. |
| `src/modules/ExtensionReleaseRegistry.sol` | `contracts/src/modules/ExtensionReleaseRegistry.sol` | Protocol domains and release identity retained. |
| `src/modules/ModuleStateStore.sol` | `contracts/src/modules/ModuleStateStore.sol` | Local AppChunk import; full direct-state storage mechanism retained. |
| `src/modules/TokenModuleRegistry.sol` | `contracts/src/modules/TokenModuleRegistry.sol` | Canonical IPSEITY Reach authorization, nonzero transfer-derived custody epoch, saturation refusal, and authority discovery helpers. |
| `src/modules/ModuleWorkbench.sol` | `contracts/src/modules/ModuleWorkbench.sol` | Companion recovery ABI retained. |
| `src/modules/OnchainApp.sol` | `contracts/src/protocol/OnchainApp.sol` | AppChunk and reader formats retained; constructor hashes the existing buffer directly. |
| `src/modules/OnchainAppDirectory.sol` | `contracts/src/protocol/OnchainAppDirectory.sol` | Canonical bounded directory retained. |
| `src/modules/ChunkedCartridgeRegistry.sol` | `contracts/src/modules/ChunkedCartridgeRegistry.sol` | Local imports, IPSEITY identity binding and naming, acquisition reentrancy guard, immutable metadata storage, and direct-buffer readback hashing; legacy tuples retained. |
| `src/modules/ArtifactBinding.sol` | `contracts/src/confluence/ArtifactBinding.sol` | Rewritten for IPSEITY account derivation, footer, owner, and custody checks. |
| `src/modules/CartridgeTypes.sol` | `contracts/src/confluence/cartridges/CartridgeRegistry.sol` | Only the two legacy return structs extracted; the mutable legacy registry is not imported. |
| `src/modules/vendor/ERC721.sol` | `contracts/src/confluence/vendor/solady/tokens/ERC721.sol` | Vendored source retained. |
| `src/modules/vendor/Base64.sol` | `contracts/src/confluence/vendor/solady/utils/Base64.sol` | Vendored source retained. |
| `src/modules/vendor/LICENSE.txt` | `contracts/src/confluence/vendor/solady/LICENSE.txt` | Original Solady license retained. |

The upstream module material is MIT-licensed; its notice is retained in `packages/modules/LICENSE`. The Solady files retain their authorship comments, SPDX identifiers, and accompanying license. `test/Modules.t.sol` is new IPSEITY integration coverage, not an upstream test copied under a new name.

## The tests state what is proved

All contract tests below are in `test/Modules.t.sol`. They construct a real `Ipseity`, renderer, canonical registry, and existing Reach. Only the transfer-counter saturation case uses a deliberately saturated read-only identity fixture.

| Contract property | Exact test function |
|---|---|
| Original NFT/account identity, genuine footer, and authority marker | `test_modulesUseTheOriginalCanonicalReachWithoutChangingIdentity` |
| Direct owner, operator, and renter calls cannot bypass the Reach | `test_modulesRejectDirectOwnersOperatorsAndRenters` |
| Staged-only namespaces are recoverable | `test_modulesStagingIsDiscoverableBeforeAnyInstallation` |
| Disable retains history and another module remains independent | `test_modulesDisableKeepsStateHistoryAndOtherModulesIndependent` |
| Schema changes and historical restoration require explicit compatible branches | `test_modulesUpgradeRequiresACompatibleExplicitBranch` |
| Stale catalog roots and custody do not regain authority after a round-trip transfer | `test_modulesRejectStaleRootsAndCustodyAfterTransferAwayAndBack` |
| Saturation refuses new module authority | `test_modulesFailClosedWhenTheExistingTransferStatisticSaturates` |
| State store rejects foreign writers and oversized direct bytes | `test_modulesCannotWriteStateOutsideTheRegistryOrPastTheDirectLimit` |
| Full 32 KiB staging/writing preserves bytes and fits the execution gas allowance | `test_modulesFull32KiBStateRoundTripsUnderTheTransactionGasCap` |
| Empty, one-byte, and both sides of the 23,000-byte split recover exactly | `test_modulesRecoverBothSidesOfTheDirectChunkBoundaryAndEmptyState` |
| Session target/selector permissions remain bounded and retire on sale | `test_modulesAllowOnlyExplicitlyGrantedSessionActionsAndRetireThemOnSale` |
| Workbench bytes and immutable service links agree | `test_modulesWorkbenchRecoversItsImmutableBytesAndServices` |
| A 48 KiB cartridge follows its parent controller and epoch | `test_modulesCartridge48KiBRoundTripsAndFollowsTheParentOwner` |
| A 1 MiB cartridge recovers through the legacy return ABI | `test_modulesCartridgeOneMiBRoundTripsThroughTheExactLegacyABI` |
| Receiver callbacks cannot recursively acquire | `test_modulesCartridgeReceiverCannotReenterAcquisition` |
| Maximum payload and manifest retain bytes, metadata, and gas headroom | `test_modulesMaximumCartridgeAndManifestFitTheGasCapAndRecoverExactly` |
| Wrong content digests, changed chunk code, and excessive chunk counts are refused | `test_modulesCartridgesRejectCorruptionAndOversizedPublications` |

Journal coverage is separate: `test/modules/adapter-security.test.mjs` includes *personal journal staging preserves explicit privacy and exact bytes in the same NFT registry*, *journal review rejects invalid packets, another custody epoch and unspecified privacy before wallet preparation*, and *bounded journal history recovers public and encrypted bytes from the NFT namespace without a server index*. `test/modules/journal.test.mjs` checks encryption, authenticated identity, wrong-passphrase refusal, UTF-8 bounds, and compatibility with the original ANIMA packet format. The existing seal behavior remains covered by `tools/verify-vault.mjs`; these tests do not replace it.

The targeted command is `node tools/forge.mjs --match modules --runs 1`. This is the repository's Foundry-shaped Node runner: its assertions execute on an in-process EVM with the implemented cheatcode shim. It is not native `forge test`, does not provide stateful invariant campaigns or coverage-guided fuzzing, and does not establish public-network behavior. `gasleft()` assertions include a conservative intrinsic/calldata allowance, while the integration gas regression separately checks actual capped transactions. The permanent `test/modules/chain.test.mjs` regression *64 distinct chunks, one MiB of content and a 16 KiB manifest publish with wallet headroom and recover under the read gas cap* uses an actual gas estimate, a mined capped transaction, and a separate cold `eth_call` with a 10-million gas limit. The final full verification record must identify the tested source revision; the presence of a test is not a claim that a later edit has passed it. No independent audit or public deployment is claimed here.
