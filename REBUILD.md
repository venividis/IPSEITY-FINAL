# IPSEITY: original to final — rebuild checkpoint 1

This is a continuation of the original project, with its actual contracts, renderer, console, build tools and history. It is not a replacement website or an imitation of the NFT. This checkpoint establishes the rebuild and implements the first substantial upgrade set; the complete final feature set is still in progress.

## Exact starting point

| Item | Verified value |
| --- | --- |
| Original source | `venividis/Most-Advanced-NFT-Possible` |
| Original commit | `ef1b0e3ac65cf7bf3c75b023ee4043515384cff2` |
| Original Git tree | `e2deddc301c42d4f430252cfe28bea49f65a6aca` |
| Destination | `venividis/IPSEITY-FINAL` |
| Preserved original in destination | commit `a43fa5ee1389f30899dcb6aa1f7c721477196804`, identical Git tree |
| Upgrade branch | `rebuild/original-to-final` |
| Uploaded archive | 674 files; 266 distinct byte contents; all 673 listed checksums match |
| Snapshot validation | Every one of the 638 files across the three branch snapshots matches its recorded Git blob |
| Git history | 123 commits; bundle integrity checked; original branches retained in the downloadable bundle |

The archive's later IPSEITY snapshot (`8fe6931`) differs in exactly 12 files. Those improvements are carried forward explicitly over the original: fuller console trading, asset/loan/seal/speech lanes, associated reads, and their documentation/tests. Its historical deployment records remain historical records, not deployments performed by this rebuild. The experimental IDFBI branch is based on the original snapshot, not the later snapshot; its eight added files contain a 31-file encoded project. That prototype was decoded and reviewed, but its unsafe/incomplete mechanisms were not copied into the production path.

The entire original GLSL block is byte-identical in this rebuild: SHA-256 `c3e42a8fea9e00ba10480bc2fe60a571996872cccf36f08e2bed72ffa456738e`. The artwork-file changes concern nested-frame isolation and teardown. They do not redesign its geometry, materials, music or rendering.

## What the original system actually is

Each token is an executable on-chain artwork and a stateful identity. A 128-bit orientation word encodes six rotations in four dimensions, a section position, form family and color; an immutable seed and operation history contribute to the experience. Engine bytecode stores the complete renderer. Renderer emits an interactive document, a fixed-point SVG sigil and a quartet face. Premises serves the website through the contract resource-request interface.

The token has a spending account (Reach) with bounded sessions and seal/manifest checks, and a receiving account (Grip) with no outbound function. Per-token Pool markets have holder-controlled liquidity and art-derived anchored curves. Separate contracts provide rentals, timelocks, consignment, inheritance, Uniswap venue reads, token launches and hooks. Parley stores social history as chain events with backward pointers; its port federates commons messages. Roster and Nameplate provide membership and ENS-related identity reads. An optional sealed-kernel mechanism holds commitments and verification hooks, but no finished confidential-agent service or proof verifier is supplied.

The source implements a finite 4,096-token edition divided into chain bands. It does not implement arbitrary physical dimensions, infinite guaranteed-unique worlds, a complete MMO, or every feature described in forward-looking design documents.

## Implemented upgrades

| Change | Result | Main source |
| --- | --- | --- |
| Permanent inscriptions | Owner/Reach-authored immutable byte shards, deterministic content addresses, author/digest/root provenance, five admission kinds, bounded archive/ownership quotas | `Etch.sol`, `lib/Shard.sol` |
| Inscription reader and writer | Independent on-chain archive page, paginated JSON, inert raw/download routes, preview then wallet confirmation with fresh authority/chain checks | `Vitrine.sol`, `PageEtch.sol`, `DeskEtch.sol` |
| Listing and exhibition control | Retract/relist without erasing bytes; irreversible leaf sealing; exhibitions expire and become inactive on transfer | `Etch.sol` |
| Deferred NFT approvals during a seal | Guarded NFT collections enter the same approval refusal policy as fungible manifest assets | `IpseityAccount.sol` |
| Pool reentrancy coverage | Lifecycle and term changes share the existing liquidity/trade lock | `Pool.sol` |
| Inheritance notice continuity | Repeated public summons cannot postpone an active notice | `Succession.sol` |
| Correct identity bands | Names, membership, root rendering, galleries, door links, service lists and sparse-room scanning use real token IDs | `Nameplate`, `Roster`, `Premises`, relevant pages/desks |
| Review binding | Console and granted-key sends check the configured chain; stale provider/account/chain reviews cannot be reused | console clients, `PageKey.sol` |
| Nested-frame lifetime | Scripts-only sandbox declarations and actual srcdoc teardown on close | original instrument and talk client |
| Registry-independent reads | Canonical account addresses are derived locally, preserving address identity when registry code is absent | `Ipseity.sol` |
| Linear escaping | Renderer uses one bounded allocation and preserves the original byte escaping rules | `Renderer.sol` |
| Reliable deployment size gate | Quiet/imported/cached compilation enforces production runtime limits | `tools/compile.mjs` |
| Reliable EVM evidence | Simulations discard writes; concurrent operations serialize; expected-revert and fuzz controls cannot silently pass without evidence | `tools/evm.mjs`, `tools/forge.mjs` |
| Protocol retention on page refresh | Existing messaging, launches, locks, wills and listings retain their addresses; chain/code/hub mismatches fail preflight | `tools/protocols.mjs`, site/redeploy tools |
| Reproducible repeated compilation | Exact-input/compiler/import-aware cache, validated on every hit | `tools/compile.mjs` |

A new immutable account implementation or hub changes future deployments; these repairs do not patch already-deployed contracts. Existing asset positions require an explicit migration plan. A page-only refresh preserves old protocol addresses and therefore also preserves their old behavior.

## How to run and inspect

Use Node 24 and the included lockfile:

```bash
npm ci
npm run build
npm run forge
npm run check:core
npm run preview
npm run preview:etch
```

`dist/preview.html` is the original instrument with local example state. `dist/etch-preview.html` is generated from actual contract responses after two inscriptions execute in an in-process EVM; its saved writer controls are disabled because those contracts are not live. Open through a local static server if the browser restricts local-file capabilities. A preview is not a deployment or proof of ownership.

For the full browser gate, install the matching Playwright Chromium and run `npm run check`. `check:core` explicitly excludes the three existing Chromium suites; it does not silently label them passed. New DOM-shim tests are additional behavioral evidence and do not prove actual browser origin enforcement or visual quality.

For a future inscription deployment, construct `Etch(hub)`, `DeskEtch(etch)`, `PageEtch(etch, desk)`, then `Vitrine(etch, page)`. Its routes are `/token/<id>`, `/token/<id>/page/<offset>`, `/token/<id>/sheet/<offset>`, and `/token/<id>/<index>`. The reader is independently addressable and does not require replacing the NFT renderer. Console integration and automatic deployment wiring for this new subsystem remain subsequent work.

## Validation record

See [VALIDATION.md](VALIDATION.md) for the exact final run results, source digest and unexecuted gates. The detailed audit reports include incoming-file coverage ledgers and distinguish source-derived concerns from reproduced defects. Historical test totals in original documents are not reused as current evidence.

## The rest of the original-to-final build

| Area | Present checkpoint | Remaining implementation |
| --- | --- | --- |
| Object and interior | Original four-dimensional renderer retained | Distinct explorable interiors, smoother internal movement, object-formed functional panels, per-token composition/music/cymatics design and browser performance verification |
| On-chain permanence | Original bytecode renderer plus permanent inscription store | Verifiable versioned asset manifests, immutable archive discovery in token metadata, chain-specific deployment attestation |
| Inscriptions | Single-shard MEMO/NOTE/DATA/GLYPH/TERM, reader/writer and provenance | DATA continuation, console HOLD integration, reader governance, guarded renderer traits and optional mounted parts |
| Ownership | Contract-enforced owner/session capabilities | Resolve owner-exclusive action rules versus existing renter/operator art permissions; encrypted private content would require explicit key management, since public on-chain HTML cannot be confidential |
| Swap and journal | Original markets plus an independently usable memory archive | Atomic trade-journal integration, user-selected lock/vesting, keeper-based optional auto-sell with minimum-output/deadline policy |
| Vaults | Reach/Grip and original Locker | Prior-approval awareness/revocation workflow, vesting policies, owner-aware deposit warnings and migration tooling |
| Launchpad | Original Kiln/Facet launch machinery retained | Broader token strategies, user-defined fee recipients/flows, real v4 fork/integration tests, clearly specified share-of-NFT economics |
| Social | Existing commons/groups/DMs with corrected roster discovery | Transfer-epoch key rotation, forward secrecy/key delivery, moderation and room lifecycle, customizable real chat UI |
| Composable NFTs and games | Existing custody; experimental probes preserved separately | Validated cartridge format, isolated runtime hosts, resource limits, music playback, game interfaces, creator economics and asset provenance |
| Marketplace and worlds | Original consignment and per-token markets | Whole-object fractional/share design, creator storefront settlement, towns/markets/kingdoms, quests, PvP/PvE and human/agent gameplay |
| AI agents | Bounded on-chain sessions, manifests and kernel hooks | Signer service, propose/simulate/confirm policy, encrypted payload delivery, actual proof verifier and recipient-bound kernel transfer verification |
| Identity and chains | Fixed IDs/ENS lookup and original federation | Parent-name initialization hardening, complete engine chain reads, peer validation, canonical deployment registry and verified cross-chain UX |
| Wallet safety | Improved review invalidation and sealed approval behavior | Burner-account lifecycle, token/approval risk presentation, transaction effect decoding and chain-specific deployment checks |
| Experimental IDFBI | All 31 decoded files reviewed, no blind port | Repair refund escrow accounting, sign epoch context cryptographically, complete account receiver hooks and real WebAuthn verification before any reuse |

Material unresolved concerns include pre-seal external allowances, rental-history settlement ambiguity, one-time ENS parent initialization, kernel verifier recipient binding, and encrypted-message keys surviving token sale. They are detailed in the audit reports. They must not be treated as solved by the tests in this checkpoint.

## Audit files and standards

- [Archive and branches](rebuild-audit/branches-audit.md)
- [Production contracts](rebuild-audit/contracts-audit.md)
- [Messaging and identity](rebuild-audit/messages-identity-audit.md)
- [Interface and artwork](rebuild-audit/ui-audit.md)
- [Build, tests, deployment and prototypes](rebuild-audit/toolchain-audit.md)
- [Inscription implementation boundaries](rebuild-audit/etch-implementation.md)
- [Every archive member and content digest](rebuild-audit/archive-inventory.json)

The reader follows the original project's contract resource-request architecture, consistent with [ERC-5219](https://eips.ethereum.org/EIPS/eip-5219). Production runtime sizes are checked against the 24,576-byte limit defined by [EIP-170](https://eips.ethereum.org/EIPS/eip-170). This is a source review and tested development checkpoint, not a production security certification.
