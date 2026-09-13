# IPSEITY interface and engine audit

Source baseline: the uploaded ZIP's `Most-Advanced-NFT-Possible-complete/latest-ipseity/` tree, rebuilt in `IPSEITY-FINAL`. This report covers the engine and website surface. Contract economics, inheritance mechanics, cross-chain messaging verification, and build tooling have separate specialist reviews.

## What is actually here

IPSEITY has two distinct interfaces carried by on-chain code. They must remain distinct in deployment planning.

1. `engine/ipseity.html` is the artwork and self-contained instrument. Engine/Renderer place its bytes in each token's metadata. It draws a three-dimensional section of a four-dimensional form using WebGL2, with six independent rotation planes, a movable w section, seeded visual properties, accumulated rendering, bloom, and adaptive render budgets. Eight forms are implemented: Tesseract, Hexadecachoron, Icositetrachoron, Duocylinder, Clifford torus, Tiger, Ditorus, and Quaternion Julia.
2. The website is assembled by Solidity Page contracts, with browser clients carried in Desk contracts. `Premises` routes `web3://` requests and separately serves the artwork. The seven-verb console uses `PageConsole`, `ConsoleRead`, `ConsoleSkin`, and `engine/console*.js/css`. It is a server-rendered control room with no WebGL context; walking between tokens uses actual navigation and URL-fragment breadcrumbs.

The visual instrument has twelve modules: Self, Rotate, Section, Send, Assets, Call, Sign, Scan, Vault, Issue, Market, and Nest. The console has seven verbs: Turn, Hold, Trade, Hand, Speak, Make, and Look. Their functionality overlaps but is not equal. A deployment of new site pages does not update the instrument embedded in metadata, and replacing the engine does not update the site pages.

The implementation supports public reading and contract-enforced action permissions. It is not an owner-private website. A public blockchain can enforce who changes state; merely hiding a GUI cannot make its published bytes or state confidential.

## Coverage ledger

The original scope contains 40 source files and four design/instruction documents. All 40 source files received a role, entry-point, and action-path inventory. Detailed semantic inspection concentrated on wallet state, transaction construction, chain selection, band enumeration, HTML boundaries, runtime lifecycle, and the specified console/artwork relationship. The shader mathematics were preserved and compared, rather than independently re-proved. No claim of complete browser compatibility, financial-contract audit, or formal verification follows from this ledger.

| File | Role and reviewed behavior |
|---|---|
| `CLAUDE.md` | Read repository architecture, deployment separation, byte limits, escaping rules, invariant requirements, and forward-spec warnings. |
| `CONSOLE.md` | Compared surface map, wrong-chain policy, owner/visitor state, confirmation flow, breadcrumb design, and unfinished work with code. |
| `INTERFACE.md` | Read shipped-status claims and remaining work; identified identity and chain-refusal claims that original runtime did not fully uphold. |
| `COMPOSABILITY.md` | Traced planned parts/audio/ROM/shop/market mechanisms and prerequisites; distinguished proposed contracts from shipping UI. Checked prescribed iframe isolation changes against actual source. |
| `engine/ipseity.html` | State bootstrap, form/module maps, shader/render boundaries, input/orbit controls, wallet/RPC transport, transaction review/send/watch, local ownership guard, price reads, nested-instance opening/closing, palette, and refresh paths. |
| `engine/console.js` | Entire client path: ticker, fragment walk, identity paint, wallet connection/events, chain checks/switching, command dispatch, and arrival. |
| `engine/console-lanes.js` | ABI amount helpers, confirmation/send/watch, permission gates, all seven lanes, quotes/approvals, read failures, commons log walk, and lane lifecycle. |
| `engine/console.css` | Entire stylesheet: hue inheritance, margin breadcrumbs, mobile lane layout, fixed navigation, type sizes, focus states, reduced-motion behavior, and confirmation geometry. |
| `src/Chrome.sol` | Shared styling/navigation/footer and EIP-6963 wallet chooser; read-provider versus chosen-signer behavior. |
| `src/lib/Web.sol` | HTML/JSON escaping, hostile ERC-20 labels, offset/length handling, decimal/amount formatting. |
| `src/ConsoleRead.sol` | Satellite code checks, tolerated failures, owner/user reads, reported-bit semantics, and selector generation. |
| `src/ConsoleSkin.sol` | SSTORE2 shard loading, raw first-paint CSS, irreversible freeze, and readback. |
| `src/PageConsole.sol` | Server-rendered token identity, seven verbs, state/clocks, still link, config seed, action selectors, and chain names. |
| `src/PageDoor.sol` | Task map, terminal entry, held-token presentation, mint entry, chain switcher, commons summary, supply/band facts, recent tokens. |
| `src/PageGallery.sol` | Gallery page boundaries, descending token enumeration, still links, market/rental badges. |
| `src/PageManifest.sol` | Per-token services, index windows, offering discovery, edition bands, mint/session invoke metadata, and optional venue/parley metadata. |
| `src/PageKey.sol` | Session-envelope reading, check-before-propose, execution calldata, key identity verification, and transaction chain binding. |
| `src/PageToken.sol` | Token overview, market/rental rows, direct instrument link, faces, operator explanation. |
| `src/PageMarket.sol` | Per-token swap card, picker, reserve/bond/fee facts, open-market directory and pagination. |
| `src/PagePool.sol` | Maker inventory, deposits/withdrawals, curve/fee/bond terms and market opening. |
| `src/PageServices.sol` | Rent/vault service pages, holder/renter controls, permanent Grip receipt, projector and signature-check entry. |
| `src/PageSwap.sol` | Public Uniswap surface, token selection, route/deployment availability, fee-beneficiary distinction. |
| `src/PageLaunch.sol` | Coin issue, hook recipe/mining, pool creation/initialization, recent launches and deployment descriptions. |
| `src/PageHook.sol` | Read-only hook inspection, permission flags and verdict rendering. |
| `src/PageCast.sol` | Solidity SVG projector inputs, generated selectors, draw call and returned-SVG mount. |
| `src/PageLock.sol` | Token metadata, lock preview, permit/approval/lock branches, claim/gift listing and amount handling. |
| `src/PageSeal.sol` | Owner and account state reads, token bolt, Reach embodiment/seal ratchet, refusal text. |
| `src/PageKeys.sol` | Session grant/revoke/check controls, target/selector envelope, current-holder test and calldata creation. |
| `src/PageName.sol` | Name wire/node conversion, resolver/bind/parent/renewal entry points and status rendering. |
| `src/PageEstate.sol` | Inheritance and consignment configuration and controls; execution delegated to DeskEstate. |
| `src/PageTalk.sol` | Commons/direct-message documents, wallet/token chooser, plaintext/sealed modes and archive explanation. |
| `src/PageRooms.sol` | Room founding/detail pages, steward/member facts, join/invite/leave/roster controls. |
| `src/PageTerminal.sol` | Typed command surface and documented program interface through `TERM.run`/`TERM.commands`. |
| `src/Desk.sol` | Shared client amount/word helpers, symbol sanitation, read/connect/send, per-token swap/approval, pool and rent actions. |
| `src/DeskTrade.sol` | Public-pool quote selection, swap parameters, allowance and router branches. |
| `src/DeskUni.sol` | Chain-derived venue config, enabled tiers/spacings, asset discovery, pool/router/governance selectors. |
| `src/DeskLaunch.sol` | Token launch steps, hook-kind branches, fee recipe, bounded salt search and pool setup. |
| `src/DeskTalk.sol` | Chat serialization and rendering, token chooser, on-demand instrument iframe, room actions, member/invitation window scans. |
| `src/DeskRooms.sol` | Terminal invite/evict/roster commands and complete finite membership scan. |
| `src/DeskTerm.sol` | Command registration/dispatch, machine interface, contract selector/config inventory and navigation map. |
| `src/DeskSeal.sol` | Client-side sealed-message keying/encryption paths and plaintext/sealed rendering separation. Cryptographic construction was not independently audited here. |
| `src/DeskEstate.sol` | Inheritance/consignment UI state, ownership, approvals, arrange/claim/buy/release and proceeds. |
| `src/DeskWill.sol` | Terminal inheritance and consignment commands, price agreement and approval/action sequence. |

`DeskEtch.sol`, added by the parent implementation during this rebuild, is outside this baseline ledger and has its own parent-owned review and tests.

## Confirmed defects repaired in this tranche

### 1. An open console review could send on a newly selected chain or account

Original `engine/console-lanes.js` checked cached `C.chainOk` only when `propose` opened. Its sign callback immediately called `eth_sendTransaction` using whichever `C.account` existed at that later moment, without reading `eth_chainId` and without attaching a transaction chain ID. A provider or account change during an open review therefore changed the signing context after the user reviewed it. The original callback also allowed repeated invocation.

The rebuilt review captures provider, account and wallet-event epoch; names Chain and From in the slab; re-reads chain and accounts immediately before send; refuses unknown/mismatched answers; attaches `chainId`; and allows only one send from that review. Wallet events immediately cancel outstanding reviews. This is an action-context guarantee, not a claim that an RPC endpoint is trustworthy or that blockchain transactions can be undone.

Proof: the deterministic DOM verifier fails its first assertion against the **original uploaded source**: `a chain switch after review cannot broadcast`. The rebuilt source passes that assertion and the account/provider/unanswered-chain/double-invocation cases. See `ui-baseline-regression.log` and `ui-regression.log`.

### 2. The console continued saying “you” after the owner left

Original `paintAccount` only rewrote `#held` and `#heldby` when an owner connected. It never restored either label for another account or disconnection. Its lane controls were also rendered only once after initial connection, so connecting later did not create the appropriate owner controls.

The rebuild restores both identity labels on every account paint, clears account state on failed connection, and rebuilds the active lane's controls when wallet state changes. Tests cover owner→other account→disconnected→owner without reloading.

### 3. The session-key page had no chain binding at all

Original `PageKey` omitted chain from `KEY` config. Both `sessionAllows` reads and `executeAsSession` writes went to the wallet's current chain, with only the key address checked. The same address on another chain could refer to an unrelated session/account state.

The config now includes `block.chainid`. Reads refuse another chain. The signing callback makes a fresh chain check and names that chain in the transaction. Repeated presses are blocked while the send is active. The config helper is `view`, as required by the added chain read. DOM tests exercise wrong-chain reads, switching after review, one send, and preserved key/selector.

### 4. Website pagination confused supply with token ID

`PageDoor` linked `/c/1` and enumerated recent IDs from `totalSupply`; `PageGallery` used that count as its highest token ID; `PageManifest.index` started every chain at ID 1. The collection's later bands start above 1. One minted token in the 2049 band therefore produced links to nonexistent low IDs and omitted actual service offerings. `sectionOf` is a public mapping, so some of these wrong-ID reads return default values and render plausible phantom tokens rather than throwing.

The rebuild keeps pagination in mint ordinals and translates each ordinal through `FIRST_ID` before rendering/reading an ID. Manifest windows are expressed as actual token IDs. Parent-owned `Premises` separately fixes the root instrument's hard-coded `viewOf(1)`.

The dedicated EVM regression, `tools/verify-rebuild-band.mjs`, deploys production hub/page contracts for IDs 2049–3072, mints 25 tokens, lists rentals at both ends, and checks empty state, root instrument, recent list, two gallery pages and manifest offering windows. Execution status is recorded separately below.

### 5. Sparse membership scans stopped before reaching real members

The original terminal roster and room page stopped at the first empty membership window after the first. A later band or sparse group can have several empty 256-ID windows before any member. Both clients could consequently describe a nonempty group as empty.

Both clients now scan all sixteen bounded windows covering the 4096-token edition. A failed read is reported as unavailable rather than converted to an empty room. Tests place a member at 2049 and a member/invitation at 4096 with empty earlier windows, and verify the full bounded scans.

### 6. Embedded instruments lacked a real origin boundary

The nested instrument originally allowed both scripts and same-origin privileges, while the door-created frame had no sandbox. For a same-origin child these combinations allow the child to reach the parent DOM; the planned fix was already explicit in `COMPOSABILITY.md`.

Both now declare `sandbox="allow-scripts"`, with no same-origin permission. The door still offers a normal direct instrument link for the full wallet-capable surface. DOM tests check the shipped declarations. A separate Chromium test attacks both real frame declarations, but it could not run here because Chromium is absent and installation timed out. **Browser enforcement has not been re-verified in this environment.**

### 7. Closing a nested instrument left its `srcdoc` alive

The open path assigned `frame.srcdoc = html`. The close path only assigned `src = "about:blank"`. `srcdoc` takes precedence, so hiding the frame and changing `src` did not discard its existing document. The nested engine could remain alive behind a closed view.

The close handler now removes the `srcdoc` attribute before navigating to `about:blank`. The DOM test executes the actual close-handler statements and checks those mutations; actual browser/GPU lifecycle verification remains outstanding with the Chromium test gate.

## The original artwork is preserved

A direct diff against the uploaded `latest-ipseity/engine/ipseity.html` contains only the sandbox change and the nested `srcdoc` teardown. No form, shader, palette, animation, seed mapping, module, camera, or renderer algorithm was replaced.

The complete GLSL block between `const VS3 =` and `const cvs = $("#field")` is byte-identical in the rebuild and all three engine copies in the ZIP. Its SHA-256 is:

`c3e42a8fea9e00ba10480bc2fe60a571996872cccf36f08e2bed72ffa456738e`

This preserves the actual supplied rendering code. It does not prove that this supplied object is the separate historical “original blue object” described in older conversations; that would require an exact visual reference comparison.

## Material gaps that remain

| Gap | Evidence and consequence |
|---|---|
| The instrument's RPC reads follow the selected wallet chain | `rpc()` always delegates to `NET.provider`; `connect` replaces `NET.chainId`; `refresh` then reads `ownerOf`, `sectionOf` and stats through that provider. The console fixes do not redesign the engine transport. Engine chain/account snapshot hardening should be a subsequent focused change. |
| Instrument chain table is incomplete for the edition | `CHAINS` has Ethereum, OP, Polygon, Base, Arbitrum, Zora and two testnets, but no 130, 56 or 4663 entries. Missing networks lack named fallback transport/add-chain metadata. Verify real endpoints before adding them. |
| Instrument prices still guess on failure | `txOpen` falls back to 0.002 native units when `openFee()` fails. `BUILD.MINT` converts unread supply, ceiling and price to zero. This is inconsistent with the console's explicit unknown-state discipline; it can display a free mint that was never quoted. |
| The instrument's console exit still requires connection | Both the `connect` palette command and rail exit wait for `NET.account` before navigating to `LANDING()`. A read-only visitor cannot take that route to a console that otherwise permits public reading. |
| Renter access differs between instrument and contracts | Engine `txCommit` calls `needOwner`, while the contract's commit path permits its operator/renter policy. The UI can refuse a contract-authorized renter. This should be reconciled deliberately with the user's owner-action requirement. |
| Console lanes remain partial | Hold does not expose the full Reach execution/seal/session surface; Hand does not consolidate paid rentals, consignment or succession; Speak explicitly labels whispers/rooms/signatures unbuilt in-console; Make does not consolidate launch/name workflows. These remain reachable on dedicated pages/contracts. |
| Object-forming functional panels are not implemented | `panel()` writes HTML into an `<aside id="sheet">`; node labels are DOM overlays tethered to projected positions. The artwork does not currently transform its own geometry into all interface text/forms. |
| “Nest” is recursive self-display, not a unique explorable interior world | `BUILD.NEST` loads the same token's own metadata into a smaller iframe, increments depth, and stops at the depth limit. There is no spatial interior map, room-generation system, collision/navigation world, or separate per-token civilization in this engine. |
| Music/cartridge/parts systems are specifications, not shipping engine features | No `AudioContext`, audio player, heartbeat/cymatics loop, `PART` runtime, HostScore/HostRom, or Cartridge integration exists in the scoped engine. `COMPOSABILITY.md` supplies a proposed implementation order; it must not be described as live. |
| Legacy clients have weaker transaction presentation than the console | Shared `Desk.send` mainly reports “sent”; the engine has its own review/watch implementation; PageKey has its own slab. Receipt handling and reviewed-intent semantics are not one shared implementation across all surfaces. |
| Some number/HTML paths warrant a separate input-hardening pass | PageLock's preview inserts the raw amount field into `innerHTML`; legacy Desk/engine amount metadata also has fallbacks/truncation that differ from the strict console. Those paths were identified but not altered in this bounded tranche. |
| Optional satellite degradation is not consistent across all pages | ConsoleRead has explicit failed-read bits and code checks. Several gallery/service/template paths call configured satellites directly. A missing deployment can still affect an entire dedicated page rather than only its row. |
| Mobile accessibility needs a real-device/browser pass | Console typography includes 9–12px labels and 22px breadcrumb rungs; many controls rely on compact monospace styling. The renderer's camera has bounded orbit/zoom rather than a clear interior navigation mode. No visual/accessibility conformance claim was established here. |

The strongest bounded next frontend upgrade is a single engine-side transaction/read context: bind reads to the token's home chain, refuse unknown prices, preserve the account/chain that reviewed an action, and provide a direct read-only console exit. It preserves all supplied renderer mathematics and the on-chain asset distribution model while addressing the remaining most consequential flow inconsistencies.

## Validation record

| Validation | Result |
|---|---|
| `node tools/verify-rebuild-dom.mjs` | **25 assertions passed, exit 0.** Actual client sources; deterministic DOM/provider model. Log: `audit/ui-regression.log`. |
| Same DOM regression against files extracted from the original uploaded ZIP | **Expected failure, exit 1**, on chain change after an open review. Log: `audit/ui-baseline-regression.log`. |
| `node --check tools/verify-rebuild-ui.mjs` | Passed syntax check. |
| `node --check tools/verify-rebuild-band.mjs` | Passed syntax check. |
| `node tools/verify-rebuild-ui.mjs` | **Blocked before execution:** no local Chromium executable. Normal `npx playwright install chromium` attempted; download timed out. Browser tests are committed, not claimed as passed. |
| `node tools/verify-rebuild-band.mjs --compiled out/solc.json` | **14 assertions passed, exit 0**, against authoritative production artifacts. Real hub/page/lease state across band 2049–3072 and a 24-item page boundary. Log: `audit/ui-band-regression.log`. |
| `node tools/verify-site.mjs` | **580 passed, 0 failed, exit 0.** Existing EVM and driven DOM coverage for site pages, swaps, chat, terminal, launch, locks, estate, manifests, session keys and absence of page custody. Log: `audit/ui-site-verification.log`. |
| `node tools/verify-plate.mjs` | **71 passed, 0 failed, exit 0.** Existing name/resolver/edition/rehearsal-chain checks. Log: `audit/ui-plate-verification.log`. |
| Shader preservation comparison against all ZIP engine copies | Byte-identical shader block; engine file contains only the two isolated fixes listed above. |

These results establish specific regression properties. They do not establish all deployment, all-network, browser, GPU, accessibility or contract-security guarantees.

## Invariant entries for the parent change

- A console action sends only from its reviewed account/provider, on its configured chain, once per review. Enforced by `verify-rebuild-dom` chain/account/provider/unanswered-chain/single-send assertions.
- Wallet changes remove stale holder identity and rebuild holder controls. Enforced by the account-event, read-only and reconnect assertions.
- Session-key reads and writes are bound to the page's chain, with a fresh chain check before send. Enforced by the three key-door chain/send assertions.
- Token listing pages translate mint ordinal through `FIRST_ID`. Enforced by the passing `verify-rebuild-band` root/door/gallery/manifest tests.
- Empty roster windows never terminate a finite membership scan; failed reads never mean no members. Enforced by sparse terminal/page roster tests.
- Embedded instrument frames omit same-origin permission. DOM declaration tests exist; Chromium attack verification is a separate required environment gate.
- Closing a nested instrument removes `srcdoc` before navigating its frame away. Enforced by the actual close-handler DOM mutation test.
