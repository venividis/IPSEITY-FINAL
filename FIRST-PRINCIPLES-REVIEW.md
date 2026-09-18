# First-principles project review

This is a product, security, and maintenance review of the repository as it
exists on 17 September 2026. It is not a smart-contract audit and it does not
assert that a passing test suite proves deployed contracts safe.

## The five-year-old version

Imagine IPSEITY is a **special picture in a very strong glass frame**.

The special part is:

- the picture lives on the blockchain;
- its owner can turn it and change how it looks;
- anybody can still see it if the IPSEITY team disappears; and
- nobody else can pretend to own it.

That is the toy worth protecting.

The project has also put a bank, a shop, a chat room, a will, a rental desk, a
name service, a bridge to other playgrounds, an AI key, a game store, and a web
browser into the same toy box. Those things may be useful, but they are not the
picture. Every extra machine adds more buttons, more keys, and more ways for
something to go wrong.

### Keep these in the main box

1. **The NFT and its owner record.** This says who owns the picture.
2. **The small number that describes the picture's pose.** This is what lets the
   owner turn the four-dimensional object.
3. **The renderer.** This turns that number into the picture people see.
4. **One small, read-only viewer.** This lets people see the picture without
   trusting an IPSEITY server.

If everything else shuts down, these four things should still work.

### Take these out of the main box

Taking something out does **not** mean throwing it away. It means putting it in
its own optional box so a bug in it cannot break the picture or put every owner
at risk.

1. **Take out the bank and trading machines** — `Pool`, `Venue`, `Kiln`,
   `Facet`, the launchpad, and liquidity routing.
   - **Why:** these hold or move real money. A picture bug might show the wrong
     colour; a bank bug can lose everything deposited in it.
   - **What to do instead:** make a separate market package, give it its own
     audit, and let owners choose whether to use it.

2. **Take out the “do any wallet action” button.**
   - **Why:** a picture does not need permission to prepare arbitrary wallet
     commands. A confusing or compromised screen could ask somebody to sign a
     dangerous transaction.
   - **What to do instead:** let the on-chain picture display information and
     simple, clearly typed actions. Put expert transaction tools in a separate
     application with loud warnings and transaction simulation.

3. **Take out the chat room and cross-chain messenger.**
   - **Why:** owning and viewing the art does not require LayerZero, message
     delivery, remote-chain configuration, or chat history.
   - **What to do instead:** keep Parley and cross-chain chat as an optional
     social add-on. Never let messages from another chain control ownership or
     money.

4. **Take out rentals, wills, consignments, names, and locks.**
   - **Why:** each feature adds new people who may be allowed to do different
     things at different times. Those permissions become difficult to explain
     and even harder to test together.
   - **What to do instead:** make each capability an optional adapter with one
     narrow job and a plainly documented permission list.

5. **Take out the AI secret and session-key story for now.**
   - **Why:** the repository has rules for limiting an AI key, but not the real
     service that safely stores and uses that key. The secret payload may also
     disappear, and a previous owner may keep a copy.
   - **What to do instead:** call it an experiment until the signer, verifier,
     storage, monitoring, and emergency response exist and are reviewed.

6. **Take out the module and game store.**
   - **Why:** running somebody else's modules and games is a different product
     from owning a piece of art. It adds publishers, package formats, saved
     state, browser isolation, and more permanent code.
   - **What to do instead:** deploy it as a separate platform that can use an
     IPSEITY token without being required by the token.

7. **Take most of the website out of the blockchain core.**
   - **Why:** the artwork must last; every menu, page, chart, and browser feature
     does not need to be permanent. A very large permanent website is expensive
     to deploy and impossible to fix when browsers change.
   - **What to do instead:** keep a tiny permanent viewer and publish richer
     replaceable websites whose exact source and hash anyone can verify.

8. **Take duplicate home-made building blocks out where possible.**
   - **Why:** two Base64 implementations, multiple ERC-721 implementations, and
     home-made wallet/ABI/crypto code mean reviewers must inspect the same kind
     of wheel several times.
   - **What to do instead:** use one pinned, well-reviewed implementation unless
     a measured on-chain limit truly requires custom code.

### Add these safety rails

1. **An independent security audit.** The builders checking their own work is
   like checking their own homework. A specialist should try to break custody,
   money, browser, and module code before valuable assets depend on it.
2. **A simple map of who can do what.** List every admin, curator, token owner,
   renter, session key, verifier, external service, and emergency power. People
   should not need to read thousands of lines to learn who has a key.
3. **A public list of known risks.** An empty “known problems” page does not mean
   there are no problems. Give each risk a severity, owner, status, mitigation,
   and list of affected deployments.
4. **The real standard Solidity test runner.** Keep the custom test runner, but
   also run native Foundry tests. Two independent rulers are less likely to be
   wrong in exactly the same way.
5. **Automatic security tools and harder tests.** Add static analysis, coverage,
   mutation testing, long fuzz runs, and tests where several features interact.
   Test malicious tokens and callbacks, not only polite examples.
6. **A safe deployment checklist that a computer enforces.** Before deployment,
   verify the chain, addresses, bytecode, limits, admin state, compiler, source
   commit, and simulation. Save the results in a signed manifest.
7. **A plan for bad days.** Immutable contracts cannot be patched. The project
   still needs monitoring, warnings, a disclosure channel, a migration plan, and
   a bug bounty.
8. **Repeatable builds.** Pin every important tool and prove that two clean
   computers build the same contracts and website bytes.
9. **Tests in more browsers and a simple fallback.** The art should have a static
   SVG and accessible controls when WebGL, motion, decompression, or one browser
   feature is unavailable.
10. **A clear license and contributor guide.** Tell people what they may reuse
    and exactly how to build, test, format, and review changes.

### Change the order of work

Do not add another room to the house yet.

1. Label the risky parts experimental and keep financial limits low.
2. Write down every trust assumption and known risk.
3. Make the small art core independent from all optional features.
4. Add native tests, security tools, repeatable builds, and safe deployment
   checks.
5. Audit the separated parts, starting with anything that holds money.
6. Only bring an optional feature back when users need it and its risk can be
   explained in a few sentences.

In one sentence: **keep the permanent picture small, and put every bank, chat
room, AI, game, and convenience feature beside it—not inside it.**

## 1. Start with the irreducible promise

IPSEITY's distinctive promise is small:

1. an ERC-721 represents a mutable four-dimensional artwork;
2. the state needed to reproduce it is on-chain;
3. the renderer is recoverable without a project-controlled service; and
4. ownership controls the artwork.

Everything else should have to justify both its existence and its inclusion in
the same trust boundary. A feature is worth keeping in the immutable core only
when it strengthens that promise, cannot be supplied safely by an optional
companion, and repays its permanent security and comprehension cost.

On that test, the renderer, compact section word, ERC-721 custody, and a minimal
read-only web3 route are the product. The AMM, launchpad, liquidity manager,
leasing, succession, naming, messaging, cross-chain port, arbitrary execution,
private-agent kernel, module marketplace, games, and full on-chain website are
separate products. Some are interesting, but their presence makes the thing a
protocol suite rather than a legible artwork contract.

## 2. What to get rid of

“Get rid of” means remove from the next production core and its default user
journey. Already-immutable deployments cannot be edited. Useful experiments can
be preserved in a clearly labelled archive or separate repository; they should
not remain transitively trusted by the collection.

### P0 — remove before treating this as production

| Remove | Why |
| --- | --- |
| **The claim that the repository is ready for valuable assets** | The repository itself says it has not received an independent audit, while `Pool` can hold third-party funds and the embedded client can construct arbitrary calls. Tests are evidence, not an adversarial review. Until an audit, a bug bounty, and a deployment runbook exist, all surfaces should be labelled experimental and value caps should remain low. |
| **The custom Foundry substitute as a release authority** | `tools/forge.mjs` is a valuable fast harness, but it implements its own EVM/cheatcode assumptions. The documentation explicitly says it is not native Foundry and does not provide stateful invariant campaigns. A release must not depend on the implementation and the oracle sharing the same blind spot. Keep it as a supplemental test, not the named “Foundry suite.” |
| **Unbounded arbitrary-call UX in the artwork** | A renderer does not need to be a general-purpose transaction composer. An on-chain page that can ask a wallet to sign arbitrary calldata converts a rendering bug, injection bug, or confusing interface into asset loss. Remove the generic Call node from the default build; put expert calldata tooling in a separate, conspicuously unsafe application. |
| **Money protocols from the artwork trust boundary** | `Pool`, `Venue`, `Kiln`, `Facet`, launch pages, routing, and liquidity-position machinery have radically different failure modes from rendering. A bad shader loses a picture; a bad pool loses money. Move these into separately deployed, separately audited opt-in packages. The NFT should not imply their safety or require them to render. |
| **Administrative ambiguity** | The project simultaneously values immutability and includes curator/admin phases, one-time verifier selection, pausing, and multi-contract deployment wiring. Remove every authority that is not required after initialization, and publish a machine-checkable authority inventory for those that remain. “No admin” must mean the same thing across contracts, deployment records, and UI. |
| **Unaudited agent-key service expectations** | `AGENT.md` describes an off-chain signer which is intentionally absent. Remove agent-control language from the primary product promise until the signer, key custody, proposal/act separation, monitoring, and incident response exist and have been reviewed. A session key is still a hot key within its bounds. |

### P1 — cut from the core architecture

| Remove or split out | Why |
| --- | --- |
| **The “one token does everything” scope** | Leasing, chat, rooms, wills, consignments, locks, names, markets, launches, Uniswap integration, cross-chain speech, agent kernels, and modules are independently complex protocols. Their composition creates states no reader or auditor can cheaply enumerate. Optional companions preserve experimentation without making every holder inherit every risk. |
| **The full on-chain website as a correctness dependency** | Do preserve canonical artwork bytes. Do not make dozens of page/desk/chrome contracts part of the NFT's security story. A minimal immutable viewer and machine-readable state are enough; richer sites can be reproducible clients pinned by hash. This reduces deployment wiring, bytecode-limit pressure, RPC gas dependence, and permanent browser-compatibility risk. |
| **Cross-chain behavior from the base collection** | The five disjoint ID ranges already avoid the need for a bridge. Cross-chain chat adds LayerZero configuration, endpoint, DVN, library, fee-quote, and delivery assumptions without strengthening ownership or art. Keep it as an optional social adapter and never use it for custody or authorization. |
| **The embedded wallet/ABI/cryptography implementation** | Hand-maintained keccak, ABI, checksum, transaction, and wallet code permanently duplicates heavily reviewed wallet functionality. It raises the browser payload and creates a second cryptographic client to maintain. The canonical artifact should render and expose typed intents; a normal external client should execute them. |
| **ERC-7857-style kernel support in the base ERC-721** | Private strategy storage and proof-gated re-encryption are unrelated to rendering, and the repository ships without the verifier or payload availability system. The seller can retain plaintext, so this cannot promise exclusivity. Make it an extension only after there is a concrete verifier, threat model, availability policy, and consumer. |
| **The module/game marketplace from the collection deployment** | Immutable archives and token-scoped state are coherent as a separate platform, not necessary properties of this artwork. Separate deployment and versioning prevent module parsing, browser isolation, cartridges, and publishers from enlarging the collection's trusted computing base. |
| **Duplicate and vendored primitives where a pinned, audited dependency works** | The repository contains two Base64 implementations and a vendored ERC-721 alongside a hand-written collection ERC-721 surface. Duplication multiplies review work and patch drift. Retain custom code only where measurements show a material on-chain constraint; record provenance and upstream revision for every vendored file. |

### P2 — remove repository friction and misleading signals

| Remove or correct | Why |
| --- | --- |
| **`AGENT.md` as a top-level quasi-specification** | Its singular name is not the conventional repository-agent instruction file, while its content is a long product essay. Move durable architecture into `docs/`, turn testable requirements into specifications, and reserve agent-instruction filenames for actual contributor instructions. |
| **Narrative duplication** | `README.md`, `INVARIANTS.md`, `OMNICHAIN.md`, `CONSOLE.md`, deployment journals, and contract comments repeat claims. Repeated prose drifts. Keep one short README, one normative specification, generated reference docs, architecture decisions, and deployment records. Link instead of copying. |
| **Historical incident narratives in the main README** | The accounts of fixed loader, SVG, SSTORE2, pricing, and runner bugs are useful engineering records but obscure setup and current guarantees. Move them to dated ADRs/postmortems, each linked to its regression test. |
| **An empty “Known and not fixed” section** | An empty heading can read as “there are no known issues.” Replace it with a maintained risk register containing owner, severity, status, and disposition, or state explicitly that absence of entries is not evidence of absence. |
| **Misclassified npm dependencies** | This repository is private and its packages are build/test/deployment tooling; it does not ship a Node runtime service. Keeping most tooling in `dependencies` makes `npm audit --omit=dev` look like a production gate without a defined production artifact. Classify dependencies by actual shipped artifact and audit the complete graph used to build/sign/deploy. |
| **The unused Hardhat/Foundry duality** | Keep both only if each has a named job. At present Hardhat appears primarily to provide a JSON-RPC node and the custom harness replaces native Forge in the default check. Prefer one authoritative Solidity test tool plus clearly scoped integration tooling. |
| **Manual source/deployment tables duplicated in code and tools** | The chain partition and address wiring are copied into multiple places and then checked for equality. Generate contracts, manifests, docs, and deployment plans from one reviewed configuration instead. A test catches drift late; one source prevents it. |
| **Ambient generated state during checks** | `npm run check` writes `dist/` and the forge shim writes `lib/`. Verification should run from a clean tree into a temporary/output directory and prove `git status` remains clean except for ignored artifacts. Hermetic checks make provenance and CI failures easier to reason about. |
| **Experimental probes from the supported surface** | `probe/` and numerous `tools/probe-*`, attack, emulator, and one-off deployment scripts are valuable research but look supported forever. Archive them with expected outputs and dates, or exclude them from the supported CLI and maintenance promise. |

## 3. What to add

### P0 — prerequisites for safety and honest claims

| Add | Why |
| --- | --- |
| **Independent audits split by risk domain** | Commission separate reviews for (a) ERC-721/accounts/custody, (b) Pool and external liquidity integrations, (c) browser wallet and transaction construction, and (d) module isolation. Publish scope, exact commit, findings, fixes, and residual risks. One review of this entire surface would be too diffuse. |
| **A threat model and trust-boundary diagram** | List protected assets, actors, authorities, external dependencies, upgradeability, liveness assumptions, and worst-case failures. Include RPC censorship/limits, malicious ERC-20/721 contracts, compromised admin/session keys, hostile modules, browser drift, LayerZero changes, payload loss, and deployment miswiring. |
| **A live risk register** | Convert every known limitation into an ID with severity, affected deployments, mitigation, owner, and status. Include unaudited money code, generic calls, immutable defects, unavailable kernel payloads, seller-retained secrets, RPC gas caps, browser feature dependencies, and cross-chain defaults. |
| **Native `forge test` in CI** | Install a pinned Foundry version, run unit, fuzz, and stateful invariant tests directly, and retain the existing in-process harness as differential/integration coverage. Set deterministic seeds for a replay job and run a larger scheduled fuzz campaign. |
| **Static and differential analysis** | Add Slither (with reviewed suppressions), compiler-warning-as-error policy, ABI/storage-layout diffs, bytecode-size gates, and differential tests against reference ERC-721/ABI/keccak behavior. Add symbolic or formal checks for authorization, reserve conservation, seal behavior, and withdrawal liveness. |
| **Deployment safety gates** | Require chain ID, bytecode hashes, constructor arguments, canonical registry addresses, authority states, caps, endpoint configuration, source commit, lockfile hash, compiler image, simulation results, and post-deploy readbacks in a signed manifest. Refuse deployment when the working tree is dirty or artifacts are unreproducible. |
| **Emergency and disclosure operations** | Immutable code cannot be patched, but users still need monitoring, a public status channel, incident severity levels, safe UI warnings, pause/cap policy where applicable, coordinated disclosure, and a migration playbook. Add a funded bug bounty after audit. |
| **A root license and third-party notice process** | Package subtrees have licenses, but the repository has no root license defining reuse of the project's own code and art. Add one deliberately, plus generated software-bill-of-materials and license checks for vendored/browser assets. |

### P1 — make the system understandable and verifiable

| Add | Why |
| --- | --- |
| **A minimal-core architecture** | Define a small collection package containing token ownership, section state, metadata, and immutable renderer only. Everything else should consume public interfaces as an optional adapter. Draw the dependency rule and enforce it in CI. |
| **Explicit specifications** | Write normative preconditions, postconditions, and invariants for each retained contract. Distinguish safety (“funds cannot leave”) from liveness (“a holder can always withdraw”) and product behavior from implementation detail. Map every requirement to at least one test. |
| **Compositional and adversarial tests** | Add malicious token receivers, callback/reentrancy across every external call, fee/rebase/blacklist ERC-20s, ERC-1271 edge cases, ownership changes mid-flow, forced ETH, timestamp/block-boundary cases, front-running/sandwich scenarios, RPC truncation, malformed return data, and multi-feature state machines. Test combinations, not just components. |
| **Coverage and mutation reports** | Line coverage alone is weak, but uncovered branches plus surviving mutations identify assertions that do not constrain behavior. Gate critical contracts on reviewed branch coverage and mutation results rather than an arbitrary repository-wide percentage. |
| **Reproducible builds** | Pin Node, npm, solc, Foundry, Chromium, and OS/container digests; build in a container; emit checksums and an SBOM; and verify a second clean build produces identical bytecode and web assets. Current version ranges permit future dependency resolution changes despite a lockfile refresh. |
| **A generated deployment registry** | Maintain one schema-validated source for chain bands, contract addresses, creation transactions, runtime hashes, initialization/freeze state, and explorer links. Generate Solidity constants, manifests, docs, and client configuration from it. Verify live code against it on a schedule. |
| **Interface and event documentation** | Generate NatSpec/ABI docs and document event indexing, pagination, replay rules, expected reverts, and versioning. Machine consumers should not need to reverse-engineer prose or scrape selectors from HTML. |
| **Dependency-update and supply-chain controls** | Add lockfile review, provenance attestations, secret scanning, signed releases/tags, least-privilege GitHub permissions, action SHA pinning, and a full dependency audit. Build and deployment tools are security-sensitive even when not shipped to users. |
| **Browser security tests** | Exercise CSP, sandbox/origin behavior, wallet-provider spoofing, hostile metadata/text escaping, accessibility, reduced motion, no-WebGL fallback, decompression support, and at least Chromium, Firefox, and WebKit. Rendering forever requires graceful degradation, not only today's Chromium. |
| **Observability without central dependence** | Publish optional indexers and monitors for authority changes, pauses, caps, reserve discrepancies, failed cross-chain delivery, and deployment-code drift. The contracts must remain usable without them, but operators need timely evidence of trouble. |

### P2 — improve contributor and user experience

| Add | Why |
| --- | --- |
| **A short contributor guide** | State supported tool versions, clean bootstrap, formatting/lint rules, how to run fast vs full suites, fixture policy, commit expectations, and how generated files are handled. |
| **Formatting and linting** | Add deterministic Solidity and JavaScript formatting plus ESLint/Solhint rules appropriate to the codebase. Consistency reduces review noise and makes suspicious constructs easier to spot. |
| **Fast, full, and release test tiers** | A quick local command should finish rapidly; CI should run complete deterministic checks; scheduled/release workflows should run browsers, native fuzz/invariants, live-RPC probes, reproducibility, and security analysis. A single enormous `check` command discourages iteration and obscures which guarantee failed. |
| **Versioned schemas and compatibility tests** | Version services manifests, module formats, deployment records, URLs, and serialized state; publish JSON Schemas and golden fixtures; test old readers against new writers and vice versa. Immutable producers make compatibility especially important. |
| **User-facing risk disclosures near actions** | Before swaps, liquidity deposits, session grants, arbitrary calls, leasing, or cross-chain sends, show the exact contract, value, permissions, expiry, worst-case loss, and audit status. Simulate transactions and decode effects independently of the page proposing them. |
| **Accessibility and non-WebGL output** | Provide semantic controls, keyboard navigation, contrast checks, screen-reader descriptions, and a static SVG fallback. The visual thesis should remain inspectable when GPU features, motion, or wallet injection are unavailable. |
| **Performance budgets** | Gate deployment gas, runtime bytecode, `eth_call` gas, response bytes, browser startup, memory, and RPC compatibility. Record measurements per commit so approaching protocol/node limits is visible before deployment. |

## 4. Recommended destination

A defensible repository layout would make the boundaries physical:

```text
packages/core/          ERC-721 + section state + metadata interfaces
packages/renderer/      deterministic renderer and minimal viewer
packages/accounts/      optional token-bound accounts and seals
packages/market/        optional, separately audited Pool/Venue/Kiln
packages/social/        optional Parley and cross-chain adapter
packages/modules/       optional module runtime and registries
apps/site/              replaceable rich client
docs/spec/              normative requirements and threat model
docs/adr/               design decisions and historical incidents
deployments/            generated, schema-validated manifests
```

The dependency direction should be one-way: optional packages may depend on
published core interfaces; core must not import or require optional packages.
The canonical token must still render if every optional deployment and every
project-operated service disappears.

## 5. Sequence of work

1. **Freeze scope and claims.** Mark financial, agent, module, and cross-chain
   surfaces experimental; set low caps; publish the trust model and risk register.
2. **Establish independent evidence.** Add native Foundry, static analysis,
   stateful invariants, clean reproducible builds, and deployment hash manifests.
3. **Extract the minimal core.** Remove generic calls and optional protocols from
   its imports and default UI. Preserve backwards-compatible readers for existing
   deployments without pretending deployed bytecode changed.
4. **Audit by boundary.** Fix findings, add regressions, publish reports, then fund
   a bounty. Audit the money path before raising any cap.
5. **Reintroduce only proven demand.** Each optional package needs an owner,
   threat model, specification, tests, audit proportional to risk, and an exit
   plan. Features that cannot clear that bar remain archived experiments.

## 6. Decision rule for every future feature

Before adding anything, answer:

1. Which irreducible promise does this strengthen?
2. Why can it not be an optional companion?
3. What new asset, authority, dependency, and failure mode does it introduce?
4. How is the property specified, falsified in tests, monitored, and recovered?
5. Will the token still render and remain ownable if this feature disappears?

If answers 1 or 2 are weak, do not add it to core. If answers 3 or 4 are vague,
do not ship it. If answer 5 is no, redesign it.
