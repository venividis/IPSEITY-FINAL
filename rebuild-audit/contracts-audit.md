# IPSEITY — production contract audit and first repair pass

Review date: 2026-09-13. Working tree: `IPSEITY-FINAL`. This is a source review with targeted executable regressions, not an independent professional audit or a statement that every reachable state is safe. The uploaded project is a substantial working system; several documents describe future mechanisms as well as shipped mechanisms, and those must be distinguished.

## Scope and coverage

`CLAUDE.md` was read first. The custody, market, session, sealed-kernel, privilege and known-limit sections of `INVARIANTS.md`, together with the relevant comments and `AGENT.md`, `COMPOSABILITY.md`, and `INSCRIPTION.md`, informed the review. Comments recording earlier bugs were treated as requirements rather than removed.

The following 32 production source files were assigned and reviewed. Site pages, Desk/Console/Chrome contracts and `src/lib/Web.sol` were assigned to the separate UI review.

| Reviewed files | Ownership of this review | What was inspected |
|---|---|---|
| `src/Ipseity.sol` | Core contract reviewer | Full file: issuance, deterministic identity inputs, authorization, enumeration, traits, leases, binding, kernels, royalties and curator powers |
| `src/IpseityAccount.sol` | Core contract reviewer | Full file: ERC-6551 footer, holder execution, batch execution, seals, both manifests, sessions, signatures and receiver hooks |
| `src/GripVault.sol` | Core contract reviewer | Full file: identity, receiver-only ABI, balance reads and refusal of signing/execution |
| `src/Engine.sol`, `src/Renderer.sol`, `src/Sigil.sol` | Core contract reviewer | Full files: stored bytecode document, loader, three metadata faces, JavaScript escaping, numeric SVG construction, Givens rotations and fixed-point projection |
| `src/Premises.sol`, `src/interfaces/Site.sol`, `src/interfaces/Standards.sol` | Core contract reviewer | Full files: router, path validation, route responses, immutable page wiring, artwork path and interface declarations |
| `src/lib/Base64.sol`, `src/lib/LibNum.sol`, `src/lib/SSTORE2.sol`, `src/lib/Types.sol` | Core contract reviewer | Full files: encoding, address/number formatting, runtime-byte storage and packed section word |
| `src/Pool.sol` | Finance reviewer and core reviewer | Full file independently read by core reviewer before repairing reentrancy coverage |
| `src/Lease.sol`, `src/Locker.sol`, `src/Consign.sol`, `src/Succession.sol`, `src/Venue.sol`, `src/Kiln.sol`, `src/Facet.sol` | Finance reviewer | Complete source coverage reported by the supporting reviewer; remaining findings below are explicitly source-derived where no executable evidence was completed |
| `src/lib/Assets.sol`, `src/lib/Curve.sol`, `src/lib/Hook.sol`, `src/lib/Mul.sol`, `src/lib/Tick.sol`, `src/lib/Timelock.sol`, `src/lib/Trig.sol` | Finance reviewer | Balance movement, curve arithmetic, hook encoding and fixed-point/timelock primitives |
| `src/Parley.sol`, `src/ParleyPort.sol`, `src/Roster.sol`, `src/Nameplate.sol` | Messaging/identity reviewer | Complete files; separate report and real-hub five-band regression |

Some financial findings remain source-derived; validation distinguishes them from reproduced and tested repairs.

## Architectural map

### Identity and ownership

`Ipseity` is an ERC-721 collection with a global intended edition of 4,096. Each deployment receives immutable `FIRST_ID` and `LAST_ID` bounds. `totalSupply` is the number minted locally; the newest minted ID is `FIRST_ID + totalSupply - 1`. Cross-chain uniqueness of the numbering therefore depends on deployment bands being assigned without overlap: the constructor validates one band's bounds but cannot prove what was deployed on another chain.

Each token has an immutable seed, a mutable 128-bit section word, operation/transfer counters and a mask of twelve instruments. The six 16-bit angles represent the six coordinate planes of four-dimensional Euclidean space; the word also includes section position, form and hue. The collection has eight form families. This is actual four-dimensional geometric machinery; there is no implementation of physical dimensions five through sixteen.

The owner, ERC-721 approvees and current ERC-4907 renter can edit the artwork. Strict money/estate actions normally require the holder. The owner's Reach is also accepted by selected strict-owner paths such as `lock` and `unlock`. Opening a node changes a UI capability flag and charges a fee; it is not a universal on-chain security gate over every external contract the account could call.

### Two accounts with different promises

The Reach (`IpseityAccount`) and Grip (`GripVault`) are two ERC-6551 accounts with distinct implementations and salts. The Reach executes `CALL`, signs and delegates bounded sessions. It cannot use `DELEGATECALL`. Its seal wraps an execution in balance measurements and checks guarded NFT identities afterward. The fungible manifest is capped at sixteen assets and the NFT manifest at eight identities. Both are bounded to keep execution gas finite.

The Grip has no outbound execution or rescue function and rejects every signature. This is permanent custody by absence of an outbound capability. That does not make an external asset's balance immutable: a rebasing token, an asset administrator or an upgradeable token implementation can still change the asset contract's own accounting. The defensible guarantee is that the Grip itself cannot authorize an outgoing operation.

Sessions have expiry, cumulative native-value cap, target allowlist, selector allowlist, grant epochs and a transfer-count mark. Changing holders invalidates old sessions, including after a token returns to an earlier holder. The target and selector lists form a Cartesian product, deliberately documented in the project. The spend cap covers native currency, not every ERC-20 allowance or token transfer.

### Rendering and the website

`Engine` stores the HTML/gzip in STOP-prefixed SSTORE2 contracts. Freezing is irreversible. `Renderer` injects token state and emits three ERC-7160 faces: the interactive instrument, projected SVG sigil and four-view quartet. `Sigil` uses fixed-point trigonometry and six ordered plane rotations. `Premises` serves ERC-5219 responses and serves the artwork directly from hub/renderer, while ordinary pages are constructor-pinned companion contracts.

The artwork bytes and public views are publicly readable on chain. Wallet controls can be reserved for holders, but a publicly readable `tokenURI` cannot provide confidential owner-only access to its HTML. Any promise of private GUI bytes needs a separate encrypted design with explicit key management.

### Finance and composability

`Pool` is a holder-owned market per NFT, not a shared-LP AMM. Selling the NFT transfers control of its reserve ledger and accumulated fees. Virtual reserve anchors remain fixed during trades. Liquidity changes and explicit curve synchronization can re-anchor only when the bond permits. Incoming balances are measured by actual transfer delta. Swaps include a minimum-output threshold, deadline and maximum share of outgoing reserves.

`Lease` provides paid rental with pull-based earnings/refunds; `Locker` escrows assets until release conditions; `Consign` provides NFT sale/consignment; `Succession` provides an inactivity/notice-based inheritance mechanism. `Venue` reads Uniswap v3 market information. `Kiln` and `Facet` implement launchpad/v4 hook machinery. These are separate mechanisms rather than a universal fractional ownership/share-of-the-entire-NFT standard.

`Parley` writes message events with previous-block pointers. That supports an indexer-free browser history walk where RPC receipt history remains available; the full message body is not Solidity-readable storage. The port federates commons messages, not NFT custody. `Nameplate` supplies ENS-related bindings and station discovery; `Roster` provides membership reads.

The sealed kernel stores payload hashes and a key handle. Its verification interface is intentionally not ERC-7857 conformance. A real TEE/ZK verifier and encrypted payload delivery service are not present. The archive/cartridge/game/music/shop mechanisms described in the forward documents are not all production contracts.

## Findings repaired in this rebuild

### C1 — guarded NFT approvals escaped the seal

**Severity: high; original behavior reproduced.** `guardNFT` adds an entry to `_pieces`, but the original `_refuseUnlessSafe` checked only `onManifest`. A direct `approve` or `setApprovalForAll` on a collection guarded only by NFT identity therefore passed. The NFT remained owned by the Reach during `_verifyPieces`, and an authorized outsider could transfer it afterward without executing through the Reach.

The original vault verifier with the new regression produced five failed assertions: single-token approval accepted, operator approval accepted, session approval accepted, a later outsider transfer accepted, and the final guarded-owner check failed. This is a demonstrated deferred custody loss, not a guess about an unusual token standard.

**Repair:** both manifests participate in the same sealed-call selector policy. `_refuseUnlessSafe` checks the bounded NFT list if the callee is absent from the fungible manifest. No new outbound path is added to the Grip. The regression covers direct execution, a batch, a session and a subsequent outsider transaction. This changes the account implementation, so existing deployed accounts do not acquire this repair automatically.

**Residual risk:** authorizations granted before sealing are not generally enumerable and are not automatically revoked by `seal`. A pre-existing ERC-20 allowance or NFT operator approval can still be used outside an account execution. Claiming an unconditional floor over all externally managed assets would therefore be too strong even after C1 is fixed.

### C2 — market configuration could change during a liquidity callback

**Severity: high; source-confirmed, focused regression added.** `deposit`, `withdraw` and `swap` acquired `_lock`; `openMarket`, `closeMarket`, `setFee`, `bond` and `syncCurve` did not. A token contract can also be the NFT holder, so holder authorization does not exclude callbacks. In particular, a first deposit reads a storage reference, makes the token transfer call, and only then credits reserves. An unguarded close during that call can delete the market while the original deposit still holds that storage reference.

**Repair:** every market lifecycle/term mutation now takes the same existing reentrancy lock. This prevents replacement of the structure under a deposit, term changes during a swap, or closure during withdrawal. The regression uses the repository's existing callback-token fixture and asserts refusal plus unchanged pair, reserve ledger, actual token balance and market directory. Admin pause/allowlist actions remain outside the reserve lifecycle and cannot themselves name an asset amount to move.

### C3 — roster and numeric ENS resolution treated supply as a token ID

**Severity: medium; real-hub regression covers all five bands.** `Roster.inWindow`, `invitedInWindow` and `membersOf` clipped IDs against `totalSupply`; `Nameplate._reachable` did likewise. A deployment starting at 1025 with one minted token has `totalSupply == 1` and token ID 1025. The original readers omitted the real holder and could list nonexistent low IDs.

**Repair:** use `FIRST_ID <= id < FIRST_ID + totalSupply` and preserve `totalSupply` as a count. Follow-through UI defects in Desk roster scanning were passed to the UI reviewer. `Premises` also used hard-coded `viewOf(1)` for the root route; root integration owns that repair.

### C4 — renderer escaping had quadratic memory growth

**Severity: medium for scalability; measurable performance repair.** `_quote` concatenated the whole growing prefix for every input byte. The current small fixed state bounded the immediate impact, but it made larger inscribed state disproportionately expensive.

**Repair:** allocate once, write the existing escape alphabet and shrink to the used length. No characters or escaping semantics were added or removed. `verify-renderer-quote.mjs` checks 68 byte-exact cases including every byte value, seeded inputs, closing-script content and a 4,096-byte worst-escape input. The latter used 3,414,937 execution gas and passed the four-million ceiling.

This is still the original fixed-template JavaScript-string escape policy, not a general invitation to put arbitrary Unicode/user content into the state script. Inscription output must keep its own strict data/markup boundary.

### C5 — some rejection tests passed without reaching Solidity

**Severity: medium for evidence quality.** The original vault batch-removal regression sent a tuple array through an ABI encoder that does not support tuples. Its blanket catch treated the encoder exception as a successful security refusal. The corrected test uses the existing batch encoder, and `refuses` now accepts an actual EVM revert rather than an arbitrary JavaScript failure. The Nameplate reviewer independently found unawaited `c.as()` actor promises producing the same category of false success and repaired that verifier.

These defects explain why a high assertion count alone is insufficient evidence. The rebuilt regressions check both the intended exception boundary and actual post-transaction state.

### C6 — absence of the account registry prevented rendering

**Severity: medium; source-confirmed, canonical-equality regression added.** The original `account` and `grip` performed an external call to the canonical ERC-6551 registry. `viewOf` always called both, so a chain without that registry could mint an otherwise valid token whose artwork could not be read.

**Repair:** derive both addresses inside the hub from the canonical CREATE2 creation bytes. Creating either account still uses the actual registry. The regression compares both predicted addresses against the reference registry, removes registry code, checks the full `TokenView` and `tokenURI` hashes remain identical, restores the registry and materializes both predicted accounts. No address is invented or replaced by a zero placeholder.

## Remaining findings and explicit limitations

| Priority | Finding | Evidence and next action |
|---|---|---|
| High | Rental interruption history is not durable | Finance reviewer identified that `Lease._intact` checks renter identity only before expiry. Changing user while preserving expiry can become invisible after expiry; restoring both fields before settlement also erases evidence. A monotonically increasing hub user-revision or explicit rental interruption record is needed. Existing ABI/deployment compatibility needs deliberate design. |
| High | Nameplate parent claim is first-come, not tied to the intended namespace | Messaging reviewer completed a local check showing an unrelated ENS-name owner can claim the permanent parent and then station slots. Deploy/claim atomically with a specified namespace and authority, or construct a new version whose namespace is pinned. This was left open because constructor/factory changes affect the deployment runbook. |
| High | Kernel proof context is incomplete | `_check(id, proof)` compares old payload hashes but does not pass token ID, chain, owner, destination, transfer/clone mode or nonce to `verifyTransfer`. Returned `sealedTo` is not linked on chain to recipient `to`. Tokens intentionally sharing hashes do not become distinguishable by the old-hash check. Before any real verifier is pinned forever, define a domain-separated proof statement bound to operation and recipient. No production verifier was assumed or installed. |
| Medium | Kernel use authorization has no revocation/ownership epoch | `authorizeUsage` can only set `usageAuthorised[id][user] = true`; transfers and re-seals do not retire the mapping. No executor is presently enforcing it, so this is an unsafe integration primitive rather than a demonstrated secret leak. Add revoke and ownership/version-aware validity before building a usage service. |
| Medium | Curve endpoint interpolation discontinuity | Finance reviewer found `offsetW == 0` produces distance32768, clamps step3 to2 but leaves modulo fraction0, selecting the previous sample instead of the endpoint. Validate the edge and mirrored-neighbor behavior against the intended curve table. No runtime result is claimed here. |
| Medium | Venue trusts a pool's claimed factory | `Venue.state` uses the queried pool's `factory()` claim without independently requiring the factory's `getPool(token0,token1,fee)` to equal that pool. A read-only aggregator should still distinguish attested factory membership from self-description. |
| Medium | Locker callback accounting needs a dedicated review | Finance reviewer noted balance-delta deposits without a shared reentrancy guard. Nested deposits can make the outer delta include inner receipts. This was not validated in the completed executable pass and is not presented as a confirmed loss. |
| Medium | Untrusted balance/owner reads are not gas/return-data bounded | `_measure`, `_ownerOfPiece` and Grip `holdings` copy arbitrary return data. A guarded asset that consumes nearly all forwarded gas or returns an oversized blob can impede reads/execution. Bound gas and copy length in a future account version, with explicit compatibility tradeoffs for legitimate assets. |
| Medium | Smart-contract holders cannot use the Reach's signature path | `_signedByHolder` only verifies65-byte ECDSA recovery against `owner()`. It does not delegate to a contract holder's ERC-1271 implementation. Contract holders can execute calls but cannot authenticate through this path. |
| Low | Kernel trait schema still describes only0..1 | `kernelStatus` explicitly returns absent/current/stale0/1/2, while `Renderer.traitMetadataURI` declares maxValue1. Bring metadata schema and executable values into agreement. |
| Low | Mint seed is not a randomness-security mechanism | Seed inputs include block fields, caller, collection and ID. They provide deterministic per-token inputs with negligible hash-collision probability, not manipulation-resistant randomness or guaranteed visual uniqueness after mutable section edits. |
| Low | Direct issuance can bypass own-hand transfer refusal | `isTransferable` rejects sending an existing token into its own hands where registry code exists, but `_issue(to)` does not apply that check. A precomputed mint recipient can be a token's own future Reach or Grip. Refuse such recipients at mint as well if ownership-cycle prevention is a stated guarantee. |

Several historical warnings in `COMPOSABILITY.md` about ParleyPort are stale: current source contains the canonical receive tuple, `allowInitializePath`, constructor configuration and nonzero default receive-gas options. The current file must be evaluated rather than treating the older narrative as a present defect. Remaining port kind/peer validation findings are in the messaging review.

## What requested upgrades do and do not already exist

| Requested direction | Present production mechanism | Missing or materially incomplete |
|---|---|---|
| Unique living NFT website | On-chain HTML/gzip, eight form families, immutable seed, mutable section, three faces | Guaranteed unique interior/music for every mint needs its own tested identity derivation; identical section edits are allowed |
| Holder access | Transaction authorization and holder/renter/operator controls | Confidential owner-only website bytes are incompatible with public plaintext tokenURI |
| Permanent trade memories | Existing operation counts and separate forward inscription design | Original uploaded production tree has no Etch/Vitrine/Shard; new implementation is being built in the main rebuild |
| Time locks and vesting | Reach seal, market bond, Locker and inheritance mechanisms | General auto-sell-at-vesting requires a keeper/executor, explicit order terms, bounded slippage and failure/retry semantics |
| Crypto social layer | Commons, pair/group rooms, event-log history, optional commons federation | Polished customization, durable archive assumptions and all higher-band UI behavior need completion |
| Fraction/share of the entire NFT | Holder-owned market, launchpad issuance and trading tools | Enforceable fractional ownership, rights, redemption and revenue routing are a separate protocol; LP shares are explicitly absent |
| NFTs as games/music/code cartridges | Token-bound custody and client nesting groundwork; forward composability specification | Production cartridge store, strict validators, mount isolation, cycle budgets and license-aware assets remain roadmap work |
| AI agent control | Expiring allowlisted session execution | ERC-20 budget accounting, ERC-1271 contract-holder signing, real kernel verifier and encrypted payload delivery |
| Cross-chain identity/marketplace | Disjoint chain bands, station discovery and commons port | NFT custody does not bridge; cross-chain commerce described in forward documents is not a deployed exchange merely because a probe exists |
| MMO/civilization/Atlas | No complete production gameplay contract subsystem in this scope | World state, game logic, progression, marketplace economy and human/agent gameplay are separate substantial builds |

## Rebuild priorities

1. Land the evidence-backed custody, market, inheritance and chain-band repairs; make the targeted regressions fail on old behavior and pass on the rebuild.
2. Complete immutable inscription as an additive subsystem with bounded content, attribution, ownership epochs, explicit retraction semantics and download-only arbitrary bytes. Keep holder-authored code off the shared artwork origin.
3. Make manifest/schema/client representations agree with actual state, including capability bounds, kernel staleness, first IDs and the difference between a zero balance and an unreadable asset.
4. Design the next account/kernel version around standing approvals, durable rental/use epochs, recipient-bound proofs, contract-wallet signatures and asset-specific session budgets.
5. Build cartridge/music/game composition behind explicit validators and resource budgets. Do not turn prototypes or forward prose into an unsupported claim of production capability.

Existing deployments are immutable in several critical places. A repaired Reach implementation has a different ERC-6551 account address. A new Premises has different page wiring. Applying source changes in this repository does not migrate balances, permissions, conversations or old on-chain HTML. Deployment records and each user's migration actions must state those differences before a live rollout.

## Verification record for this review

- Original account with the new guarded-NFT regression: **119 passed, 5 failed**. The failures include the subsequent unauthorized custody change. `audit/vault-before.log`.
- Final frozen source, full vault verifier: **124 passed, 0 failed**. This includes the corrected real batch call and rejects host-language/ABI errors as evidence of Solidity refusal. `audit/vault-final.log`.
- Renderer quote regression: **68 byte-exact cases passed**, including all 256 byte values and a 4 KB worst-escape input; the latter used **3,414,937 execution gas**. `audit/renderer-quote.log`.
- Messaging/identity regression: **104 assertions passed across all five edition chain IDs** using actual Ipseity hubs and actual minted band IDs. `audit/identity-bands-verification.log`.
- The integration reviewer completed stable `src` plus `test/mocks` compilation and reported **all 72 production runtimes fit EIP-170**. Earlier attempts were correctly blocked by a transient oversized Vitrine; the final split resolved that gate. No gate was bypassed.
- New Pool callback and missing-registry regressions are included in the integration reviewer's full Forge run. The overall rebuild verification report owns the final full-suite outcome; this subreport does not manufacture a pass before that run completes.
