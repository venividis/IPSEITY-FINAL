# IPSEITY messaging and identity audit

Reviewed 2026-09-13 against the uploaded/reconstructed `IPSEITY-FINAL` working tree. This is source review and local EVM verification, not a mainnet audit or a claim that deployed contracts were changed.

## Exact scope

Every line of the original four assigned production contracts was read: `src/Parley.sol` (438 lines), `src/ParleyPort.sol` (397), `src/Roster.sol` (187), and `src/Nameplate.sol` (726), totaling 1,748 lines before this turn's edits. All functions, interface declarations, events, state fields, and explanatory comments in those files were covered.

Read `CLAUDE.md` first; read the complete `test/Parley.t.sol`, `tools/verify-parley.mjs`, `tools/verify-port.mjs`, `tools/verify-plate.mjs`, `test/mocks/MockHub.sol`, `MockEndpoint.sol`, and `LzStub.sol`. Read the relevant messaging, naming, roster, and federation invariants in `INVARIANTS.md`; reviewed the deployment path in `tools/site.mjs`, actual mint-count semantics in `Ipseity.sol`, roster client loops in `DeskTalk.sol` and `DeskRooms.sol`, encryption/key-rotation sections in `DeskSeal.sol`, `OMNICHAIN.md` protocol sections, and historical ParleyPort/Step 0 findings in `COMPOSABILITY.md`. These related files were targeted context review, not a claim of complete file coverage.

## What these contracts do

**Parley is the durable social archive.** Commons room 0 admits every minted token. Groups have one token steward, open or invited entry, voluntary join/leave, and eviction. A pair room is deterministically derived from two ordered token IDs and can be written only through `whisper`. Actions check the current NFT holder or its own Reach account, excluding renters and ordinary ERC-721 approved operators. Each message emits a `Said` log with the previous message's block in that room and the previous block where the sender spoke; only heads/counts/membership/key points are contract storage. Historical contents therefore require chain log access, with a client walking one block at a time. Messages are 1–1,024 bytes and kind 0 or 1. Public P-256 key points permit a browser to encrypt a body before submitting it; the contract itself does not encrypt or validate ciphertext.

**ParleyPort federates copies of commons speech.** It checks the sender against Parley's holder rule, quotes and sends one LayerZero packet to every immutable peer, then refunds overpayment. It never writes to Parley and never transfers the NFT. Incoming messages must come from the configured endpoint and a pinned peer; the payload's origin must match the endpoint envelope. The destination emits its own `Echoed` log with destination-local backward block pointers. The current receiver exposes `lzReceive(Origin,...)`, `allowInitializePath`, and `nextNonce=0`. Libraries/config can be chosen during construction; an empty pin leaves the endpoint defaults in effect. No subsequent owner/delegate/peer configuration exists in this contract.

**Roster is a replaceable read adapter.** It classifies room keys and returns membership/invitation bitmaps or member lists over 256-ID windows, plus paged lists of groups stewarded by a token. It does not modify membership or the archive. A pair has no enumerable membership mapping and returns no roster list.

**Nameplate is a local ENS resolver plus cross-chain site directory.** Owning both a name and a token enables an explicit binding. Alternatively, custody of the ENS name inside that token's actual Reach/Grip account determines the token without binding; custody takes precedence over a stored binding. The resolver supplies the Reach address on the token's home chain, site/avatar/URL text records, and ENSIP-10 numeric child resolution under a one-time parent. Mainnet token bands map to five chain IDs; non-edition testnets are treated as whole-edition rehearsals. Remote site/hub addresses and a renewal-controller address can be written once by the current parent-name owner. Name expiry and renewal quotes are read through registry/registrar/controller contracts.

## Findings and disposition

| ID | Priority | Finding | Disposition |
|---|---|---|---|
| MI-01 | High correctness | Membership and local numeric name resolution confused `totalSupply` with the highest token ID. | Fixed in Roster and Nameplate; real-hub five-chain regression added. |
| MI-02 | High correctness | Roster clients stopped at an empty window before reaching higher bands or later sparse members. | Reported to parent/frontend owner; related Desk files are being integrated separately. |
| MI-03 | High deployment security | Any ENS-name owner can occupy the uninitialized one-time wildcard parent, then control unfilled stations and renewal bootstrap. | Reproduced; left open for an atomic/precommitted initialization design. |
| MI-04 | Medium test integrity | Two Nameplate authorization tests passed on a JavaScript TypeError without executing Solidity. | Fixed awaiting actors and requiring EVM revert errors. |
| MI-05 | Low protocol consistency | Port sends/accepts arbitrary message-kind bytes that local Parley rejects. | Reproduced for kind 255; no production change in this subtask. |
| MI-06 | Low configuration correctness | Immutable peers accept duplicates, zero peers, and self endpoints without explicit validation. | Duplicate cost/send reproduced; no production change in this subtask. |

### MI-01: token count is not token ID

Original `Roster.sol` lines 106–110, 121–125, and 135–141 compared every candidate ID with `HUB.totalSupply()`. Original `Nameplate.sol` line 565 used `id <= HUB.totalSupply()` for home-chain reachability. Actual `Ipseity.sol` lines 367–369 mint `FIRST_ID + totalSupply`, then increment `totalSupply` as a count.

Example: after the first Base mint, ID 1025 exists and supply is 1. Roster excluded 1025 while reporting nonexistent ID 1 as a commons member. Nameplate said the actual local token was unreachable. Since the other four bands start above their maximum possible local mint counts, this persists even after those bands sell out.

The fix reads `FIRST_ID()` and accepts exactly `id >= first && id - first < supply`; short-circuiting protects the subtraction. Roster applies it before commons/group/invitation membership. Nameplate applies it only for local-chain reachability, leaving remote-station behavior unchanged. No Parley redeploy or history migration is required. The helper now requires the same `FIRST_ID` accessor that real Ipseity already supplies; `MockHub` gained a default-one getter for legacy test fixtures.

`tools/verify-identity-bands.mjs` deploys real Ipseity/Parley/Roster/Nameplate contracts on each edition chain, mints two actual IDs per band, and verifies empty/unminted boundaries, before-band windows, commons bits, local `whereIs`, numeric token-name resolution, wildcard Reach addresses, group membership, pending invitations, list output, and unknown rooms. It never uses a mock hub or mocked membership to establish the repaired behavior.

### MI-02: an empty membership window does not terminate the ID space

Original `DeskTalk.sol` lines 416–424 scanned from base 1 and stopped when both membership/invitation words were zero after the first window. `DeskRooms.sol` lines 48–52 applied the same membership-only stop. Both therefore stopped at base 257 before Base's first actual token 1025. A sparse Ethereum group whose next member was later than an empty window was also truncated. This is independent of MI-01: repairing the contracts alone does not repair the interface. The bounded scan is only 16 windows across the 4,096-ID edition; completing it, or deriving explicit minted-band bounds, is correct. The parent was notified before integration.

### MI-03: one-time parent initialization is permissionless over any name

`Nameplate.claimParent` (original lines 191–195) and `claimParentByName` (240–245) authenticate ownership of the supplied node but never authenticate that it is the intended node. `parentNode` begins empty and is not supplied to the constructor. The first caller who owns any ENS node can permanently occupy it. `setStation` (204–211) and `setRenewer` (338–344) then derive their authorization from that captured parent.

The concrete deployment path in `tools/site.mjs` deploys Nameplate at lines 808–810 and returns it; it does not initialize the intended parent atomically. A later intended-name owner receives `ParentAlreadyClaimed`. This does not transfer ownership of the intended ENS name to the attacker; it permanently denies the intended wildcard configuration and grants the attacker control of the resolver's still-empty bootstrap records. Configuring a false renewal endpoint could additionally misdirect transactions built by an interface that relies on it, if that interface accepts the captured configuration.

Local EVM reproduction: give two different nodes to two different actors, let the unrelated-name owner claim first, demonstrate the intended claim reverts, then let the first actor set Base's station to their own addresses. All succeeded as described in `audit/identity-open-findings.mjs` and its log. A repair should precommit the intended parent during construction, or use an atomic factory initialization that actually satisfies ENS ownership checks. Merely checking ownership of whatever node wins the race is insufficient.

### MI-04: rejected host calls were mistaken for rejected transactions

Original `tools/verify-plate.mjs` lines 147 and 417 assigned `c.as(...)` without `await`, although `Chain.as` is async. `renter.exec` therefore threw a TypeError, which a catch-all `refuses` helper counted as passing the unauthorized station/renewer test. The fix awaits both actors and rethrows errors that are not actual EVM reverts. This is a test defect, not evidence that those Solidity authorization checks are bypassable.

### MI-05: port kind values diverge from local messages

Parley `_say` refuses `kind > SEALED` at line 244. ParleyPort's outbound `echo` (268–272) and inbound `lzReceive` (371–379) only validate body length. A holder can pay to send kind 255 and a receiver can emit it; a consumer that understands only kinds 0 and 1 must treat it as unknown rather than silently changing its meaning. The local proof successfully sent kind 255 to a pending remote endpoint. Consistent `BadKind` validation at both boundaries would make the wire policy match local Parley, unless an explicit versioned extension is intended.

### MI-06: malformed immutable peer sets fail permanently or duplicate fees

The port constructor checks nonempty/equal array lengths but then appends every endpoint and overwrites its mapping entry without validating endpoint uniqueness or a nonzero peer (`ParleyPort.sol` 204–208). A duplicate endpoint causes `quoteEcho` and `echo` to visit the same destination twice, using the final mapping value both times. The proof deployed one-peer and duplicated-peer ports: the latter quoted exactly twice the fee and queued two identical sends. Zero peers cannot initialize an inbound path because `allowInitializePath` refuses a zero configured peer. Validate the complete immutable set before deployment; there is no setter to repair it afterwards. Independently, one failing lane reverts the all-peer quote/send, so selective destination sending is a useful future availability improvement.

## Important intentional boundaries and missing functionality

- Reading commons, groups, pairs, group membership, name mappings, and public key points is public. Holder gating controls writes; it is not owner-only confidentiality for an on-chain website.
- A pair room is addressed, not inherently private. Browser AES-GCM supplies confidentiality when it is actually enabled. Parley accepts arbitrary key coordinates and arbitrary ciphertext bytes; it does not prove that a posted point is valid or that a ciphertext is decryptable.
- Published key points survive NFT sale. A prior holder can retain the old private key and read later messages encrypted to the unchanged point; the current client warns about transfer history. A stronger upgrade needs explicit key epochs/current-holder attestation and a policy that does not silently downgrade an intended encrypted send to plaintext. It must preserve the ability to interpret old epochs if history matters.
- The contract stores current key points, not a built-in key history retrieval index; old `Announced` events exist, but unlike message logs they have no backward block pointer. There is no forward secrecy, ratchet, attachment schema, or encrypted group-key lifecycle in these four contracts.
- The group steward cannot rename a room, toggle its open-door setting, transfer stewardship independently of selling the token, revoke an invitation before a token joins, or enforce a persistent ban in an open room. An evicted open-room member can immediately join again. These are absent moderation/customization features, not a claim that immutable group settings violate the implemented rules.
- Group/pair federation does not exist; the port is commons-only. Remote message identity depends on the configured peer/endpoint trust boundary. The port does not independently verify remote NFT ownership, and native packet replay protection is delegated to the endpoint rather than kept in this receiver. The mock's public `inject` and repeatable `deliver` are test facilities, not a simulation proving production replay security.
- `_seen[token]` grows only through that token's authorized joining/founding, preventing stranger-pushed room-list spam. However, each `_enter` linearly searches its entire history, and `roomsOf` returns the entire array. A token with sufficiently large voluntary historical membership eventually has expensive joining and reading; paging/deduplication storage is a future scalability improvement, especially because that history travels when the NFT is sold.
- ENS expiry and gateway/chain records are external lifecycle facts. Holding a name in Grip blocks outbound transfers but does not prevent registration expiry. A permanently fixed renewal-controller address can become obsolete. Local naming resolution is implemented; generalized equivalents for every non-ENS naming system are not.
- An archive with no indexer still requires access to retained chain logs and an RPC or native chain reader. It is a different availability requirement from maintaining an application database, but not the absence of any infrastructure.

## Historical claims that must not be mistaken for current bugs

`COMPOSABILITY.md` lines 167–172 claim ParleyPort uses `bytes origin`, lacks the initialization handshake, has no constructor pinning, and is matched only by a wrong-selector mock. Those claims describe historical source. The current file has the `Origin` tuple ABI, `allowInitializePath`, constructor `LanePin`/`ConfigPin` calls, and a default type-3 option naming 200,000 receive gas. Current MockEndpoint uses `abi.encodeCall` against the canonical tuple interface and checks endpoint/OApp configuration authorization. `OMNICHAIN.md` describes these repairs. There is no current helper between the port constructor and its endpoint calls that changes `msg.sender`: calls originate directly from the OApp address under construction.

This review attempted to fetch primary LayerZero source for an independent fresh protocol check, but web retrieval was disabled in this environment. Current code/local tests and the historical-source comparison are verified; new live endpoint compatibility or current external protocol/configuration status is not claimed.

## Verification record

- `audit/identity-open-findings.mjs`: completed, all three runtime demonstrations reproduced (parent capture/station control, unknown kind, duplicate-peer sends/fees).
- `tools/verify-identity-bands.mjs`: **104 assertions passed** on actual chain IDs 1, 8453, 130, 56, and 4663, with each real hub issuing its actual band IDs. Output saved in `audit/identity-bands-verification.log`.
- `tools/verify-plate.mjs`: the first attempt encountered a transient unrelated `Vitrine.sol`/`Etch.sol` parallel-write import failure. The rerun completed compilation but was **blocked before assertions** by the new integration-wide EIP-170 gate: concurrently added `Vitrine` measured **38,732 runtime bytes**, above 24,576. This is not a Nameplate assertion failure. The parent was notified; no size gate was bypassed. Exact output is in `audit/identity-plate-verification.log`. The existing Nameplate suite must be rerun after that integration issue is repaired.
- The complete repository-wide battery is owned by the parent integration task. This subtask does not claim it passed or claim live deployments were modified.

## Proposed invariant text for the integrator

**Membership and numeric name resolution use minted IDs, not the mint count.** The local minted interval is `FIRST_ID <= id < FIRST_ID + totalSupply`. Commons, group membership, pending invitations, and numeric ENS names include the actual minted IDs and exclude unminted IDs on every edition chain.

Enforced by `tools/verify-identity-bands.mjs`: "the first actual id is a commons member", "low nonexistent ids are never commons members", "the first mint resolves by numeric name", and "an actual second token appears as invited".
