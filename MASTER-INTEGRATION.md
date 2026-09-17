# The same IPSEITY, with room for more

This integration gives an existing IPSEITY an immutable catalogue of tools, independent saved state, a personal journal, and owned game cartridges. The holder continues to act through the existing Reach. The artwork, its orientation word, the receiving-only Grip, the token's market, and Parley's conversation remain the original IPSEITY systems.

The source is [MASTER-NFT-PROJECT at `e12e0cd38ed231a0b2015d17fec302a359476de1`](https://github.com/venividis/MASTER-NFT-PROJECT/tree/e12e0cd38ed231a0b2015d17fec302a359476de1). The target baseline is [IPSEITY-FINAL at `53072c3577cd73d25b7c6066065608d3e86762d8`](https://github.com/venividis/IPSEITY-FINAL/tree/53072c3577cd73d25b7c6066065608d3e86762d8). The transferable package, recovery, state and host mechanisms were adapted to IPSEITY's authority model. MASTER's collection and sovereign account were not installed in place of IPSEITY's identities.

## What came across

| Capability in MASTER | IPSEITY implementation and effect |
|---|---|
| Immutable packages and exact dependencies | [`src/modules/ModuleArchiveFactory.sol`](src/modules/ModuleArchiveFactory.sol), [`ExtensionReleaseRegistry.sol`](src/modules/ExtensionReleaseRegistry.sol) and [`packages/modules`](packages/modules/README.md). A release binds its publisher, version, canonical manifest, complete stored and expanded byte hashes, state schema, declared capabilities and exact dependency releases. |
| Persistent state attached to the same NFT | [`TokenModuleRegistry.sol`](src/modules/TokenModuleRegistry.sol) and [`ModuleStateStore.sol`](src/modules/ModuleStateStore.sol). Each module has its own namespace and history. Disabling a tool retains its state. Staged snapshots remain discoverable even before a module is installed. |
| Explicit migration and historical recovery | The workbench previews a browser draft, stages the chosen bytes, and separately reviews activation of compatible code and state. Historical bytes become a new branch; the old record is unchanged. |
| Bounded host with explicit permissions | [`web/modules/host.mjs`](web/modules/host.mjs), [`runtime.mjs`](web/modules/runtime.mjs) and [`html-worker.mjs`](web/modules/html-worker.mjs). Typed scenes and the supported HTML worker profile receive only declared host requests. A transaction proposal returns to a visible review and cannot sign itself. |
| Personal memory | [`journal.mjs`](web/modules/journal.mjs) and the registry's existing state path. Public words or an authenticated encrypted packet become a separate immutable entry. The connected registry supplies bounded history and local decryption; no separate ANIMA MemoryLedger is required. |
| Larger owned games | [`ChunkedCartridgeRegistry.sol`](src/modules/ChunkedCartridgeRegistry.sol) and [`web/modules/cartridges.mjs`](web/modules/cartridges.mjs). Immutable raw HTML up to 1 MiB is recovered from bounded data chunks, verified, and opened after the holder reviews it. The cartridge must belong to that NFT's canonical Reach. |
| An application recoverable without its original host | [`ModuleWorkbench.sol`](src/modules/ModuleWorkbench.sol) anchors the complete bundled document and service addresses. [`ModulePortal.sol`](src/ModulePortal.sol) supplies the new routes while forwarding existing routes to the original Premises. CLI recovery verifies the complete document before saving it. |
| Reproducible packaging and unsigned recipes | [`tools/modules-package.mjs`](tools/modules-package.mjs), [`modules-deployment.mjs`](tools/modules-deployment.mjs) and [`modules-plan-package.mjs`](tools/modules-plan-package.mjs). Source fingerprints, compiler settings, byte hashes, creation nonces and exact transaction data are recorded before signing. |

IPSEITY's existing Pool, Venue, Kiln/Facet, Lease, Locker, Consign, Succession, Parley and ParleyPort retain their own contracts and rules. MASTER's alternative financial, social and account stacks do not become replacement authorities merely because their source informed this integration. The existing Nest still opens IPSEITY's own instruments; the companion workbench's Games view is the separate cartridge launcher.

## Solidity, JavaScript and onchain storage

The NFT and its authoritative persistent state remain Solidity contracts. Repository language statistics also count development scripts, test runners and the bundled ethers library; they do not describe where NFT ownership or saved state lives. The original IPSEITY already separates its Solidity contracts from `engine/ipseity.html` and JavaScript development tools.

| Layer | Where it lives and runs |
|---|---|
| NFT ownership, Reach permissions, releases, installation and permanent state history | Solidity contracts execute and retain their state on the EVM. |
| Workbench, module files and game payloads | Complete bytes are stored in immutable contract bytecode. Hash-verified recovery does not require the original website, a CDN or an application database. The workbench bundles its JavaScript dependencies. |
| Graphics, game execution, wallet interaction and encryption | HTML/JavaScript runs in the browser. Onchain storage of a game does not mean every frame, score or game rule is computed or validated by Solidity. |
| Browser drafts | Temporary local data until the holder reviews and confirms an onchain state transaction. Legacy game sessions do not automatically publish their progress. |
| Packaging, compilation, tests and deployment planning | Operator/development tools. These are not a server that must remain online for the NFT to retain its published data. |

The new companion deployments exercised by this integration are disposable local-chain rehearsals. Updating this repository does not itself publish those companions to a public chain or change an already deployed immutable router.

## Why the authority adapter matters

The original projects do not speak the same account ABI. The adapter derives the Reach from `Ipseity.account(tokenId)`, checks its `token()` footer against the current chain, collection and token ID, and checks `Reach.owner()` against `Ipseity.ownerOf(tokenId)`. A plausible footer on another contract is insufficient: the account must equal the collection's canonical address.

The holder's call is `Reach.execute(target, value, data, 0)`. Operation zero is CALL. The reviewed execution counter is `Reach.state()`. The custody epoch is `uint64(statsOf(tokenId).xfers) + 1`; it begins at one and changes even when the token is transferred away and back. Because IPSEITY's public transfer statistic saturates, module writes refuse `uint32.max` rather than treating another transfer as unchanged custody; read-only SDK recovery remains available. This is unrelated to the Reach's per-key `sessionEpoch(address)`.

The browser verifies owner, canonical account, custody, execution counter, account code and seal state again before sending. Registry mutations also check the expected catalog root and custody epoch onchain. Installing a module creates no session, token allowance or spending grant. The Reach's existing seal and session restrictions remain in force, and the Grip gains no outbound function. [MODULES-CONTRACTS.md](MODULES-CONTRACTS.md) specifies the contract invariants and maps them to tests.

## Run the complete local experience

Use the repository's supported Node version and locked dependencies:

```sh
npm ci
npm run modules:sdk
npm run modules:build
npm run modules:local
```

`modules:local` starts a disposable loopback Hardhat chain with chain ID **31337**, deploys the complete original IPSEITY instrument and site, and adds the companions. It prints the local RPC, token owner, original instrument URL and workbench URL. It accepts no public RPC URL or private-key argument. Use the printed local chain with its development wallet; stopping the command stops the child chain and gateway.

The fixture publishes a shared score, an Aurora notebook, a second notebook schema, and a Resonant garden. They start uninstalled. Two padded editions of the bundled [Lumen Drift game](test/fixtures/modules/lumen-drift.html), 48 KiB and 1 MiB, are acquired into token 1's Reach. The package definitions are in [`web/modules/examples.mjs`](web/modules/examples.mjs).

In the workbench, connect the NFT owner, recover a release, and review installation. Saving inside a tool creates a browser draft. Publishing that draft is a separate review. A schema change uses **Preview migration → Apply reviewed browser draft → Review staged migration → Review activation**. The Journal view offers explicit public or encrypted publication and chain history. The Games view recovers an owned cartridge first and opens it only after source review. Closing a tool or game returns to the workbench; the original instrument remains available through the return link.

The portal adds `/modules`, `/token/<id>/modules`, `/modules/services.json` and `/token/<id>/modules/services.json`. Its configuration names the existing collection and Premises, module registry, workbench and cartridge registry. Original routes continue to resolve through the original Premises. A new portal does not rewrite an already deployed immutable router.

## Package another tool

The [SDK guide](packages/modules/README.md) defines canonical manifests, dependency identity, supported host requests, deployment receipts and recovery bounds. A local package is data; packaging does not execute it or publish a release.

```sh
npm run modules:package -- \
  --input ./my-tool \
  --metadata ./my-tool-metadata.json \
  --output ./my-tool-package
```

For a single HTML document, use `--legacy-html ./game.html` instead of `--input`. A package intended for the HTML worker host must fit its supported DOM subset; packaging arbitrary HTML does not make it compatible with that host. Full browser games use the separate owned-cartridge path and its different isolation boundary.

The SDK's archive planner prepares ordered unsigned calls. Its publication planner then verifies a deployed archive before preparing the release call:

```sh
node tools/modules-plan-package.mjs \
  --package ./my-tool-package --rpc https://YOUR_RPC --chain CHAIN_ID \
  --factory ARCHIVE_FACTORY --publisher PUBLISHER --output archive-plan.json

node tools/modules-plan-package.mjs \
  --package ./my-tool-package --rpc https://YOUR_RPC --chain CHAIN_ID \
  --registry RELEASE_REGISTRY --archive DEPLOYED_ARCHIVE --schema 1 \
  --output publish-plan.json
```

These commands read chain state and write plans. They do not sign or broadcast. A permissionless factory's creation nonce can advance between planning and execution; a conflict requires reconciliation and a fresh reviewed plan. Retain public receipts and the exact deployed addresses.

## Prepare companions for an existing collection

`modules:plan` is an offline planner for the whole companion system. Its configuration names the intended chain, deployer EOA, next transaction nonce, existing IPSEITY collection and existing Premises:

```json
{
  "chainId": 31337,
  "deployer": "REPLACE_WITH_DEPLOYER_ADDRESS",
  "startingNonce": 0,
  "collection": "REPLACE_WITH_EXISTING_IPSEITY_ADDRESS",
  "premises": "REPLACE_WITH_EXISTING_PREMISES_ADDRESS"
}
```

```sh
npm run modules:plan -- modules-config.json modules-plan.json
npm run modules:plan -- --verify modules-plan.json
```

The planner independently rebuilds the document, compiles the companion sources with IPSEITY's pinned compiler profile, checks contract-size bounds, predicts ordered creation addresses and records exact creation/call bytes. Verification checks the saved plan against current source. It does not check a live deployer's nonce, fund an account, estimate current fees, or execute the plan. This integration's signing and end-to-end rehearsal path is local chain 31337 only; public-chain deployment remains a separate explicit operation.

## Recover without the original website

Retain the chain ID and immutable workbench address. Neither a deployer key nor the original project server is needed to read the onchain document:

```sh
npm run modules:recover-workbench -- \
  --rpc https://YOUR_RPC --chain CHAIN_ID --workbench WORKBENCH_ADDRESS \
  --token-id TOKEN_ID --output ./recovered-workbench

npm run modules:recover -- \
  --rpc https://YOUR_RPC --chain CHAIN_ID --registry TOKEN_MODULE_REGISTRY \
  --token TOKEN_ID --output ./recovered-token
```

The first command verifies the anchor, service links, ordered chunks and full document hash, then saves HTML without running it. Optional `--expect-sha256` and `--expect-code-hash` arguments bind independently retained pins. The second recovers current and retained releases, dependencies, installation history and saved state, including journal entries and never-activated staged namespaces. For one published release, use its release registry and `--release RELEASE_ID` instead of `--token`.

Reads are bounded and pinned to a block whose hash is checked again before returning. Existing output paths are not overwritten. The selected RPC still supplies the chain view; these are not light-client or consensus proofs. Personal ciphertext also needs its separately retained passphrase. Token transfer does not transfer knowledge of that passphrase.

## Execution and evidence boundaries

The focused commands are:

```sh
npm run test:modules
npm run test:modules:browser
npm run test:modules:native
```

The module tests cover native authority, portable format/recovery, review boundaries, state and journals. The isolated browser runner checks actual Chromium worker behavior. The native browser runner deploys genuine IPSEITY and its original site, then exercises reviewed Reach transactions, full-size state migration, journal recovery and both owned games. Browser commands require the pinned Playwright Chromium installation (`npx playwright install chromium`). The existing `npm run check` remains the original project's complete verification gate. A passing result belongs to the exact candidate recorded by that run; the presence of these commands is not itself a browser or deployment pass.

Direct state is bounded to 32 KiB; larger state uses a verified archive descriptor. The SDK limits an expanded package to 16 MiB, the selected dependency closure to 64 releases and 64 MiB, and default full token recovery to 4,096 records per bounded collection and 256 MiB. A raw game is at most 1 MiB. Every limit is finite; the design adds independently addressable storage rather than claiming infinite memory.

Typed tools and the supported HTML worker host have no direct wallet, network or parent DOM access. Legacy games need their own full DOM and canvas, so they run in an opaque `allow-scripts` frame with no wallet bridge, same-origin permission, forms, popups or top-navigation permission. CSP blocks ordinary external resources and connections. Arbitrary legacy scripts can still attempt to navigate their own frame; the host closes it after a subsequent load. This is not a guarantee of zero network requests or hard CPU/memory isolation. Only open legacy source you choose to trust.

Stored bytes are public unless encrypted. Hash verification establishes byte identity, not publisher trust or harmless execution. These companion contracts and browser results do not certify funded privacy transactions, public cross-chain delivery, hardware-wallet behavior or an independent security audit. Updating repository source does not upgrade an existing immutable account, contract or router.

## Format names and attribution

The `anima.extension-release/1`, `anima.module-state/1`, `anima.host/1` and encrypted-journal format names are deliberately retained. They participate in canonical manifests, deployed release IDs, state commitments or authenticated ciphertext. Renaming them as a branding edit would produce a different protocol and break byte compatibility. The IPSEITY adapter requires the separate `ipseity.reach-modules/1` authority marker; the personal journal uses dedicated `ipseity.personal-journal/1` and `ipseity.journal-entry/1` identifiers. The distributed SDK is named `@ipseity/modules`.

The inherited MIT notice is retained in [`packages/modules/LICENSE`](packages/modules/LICENSE). Vendored ethers and its bundled dependencies retain their [third-party notices](packages/modules/THIRD-PARTY-LICENSES.txt); the browser copy also includes [`web/vendor/ETHERS-LICENSE.md`](web/vendor/ETHERS-LICENSE.md). Local Solady-derived contracts retain SPDX/authorship comments and [`src/modules/vendor/LICENSE.txt`](src/modules/vendor/LICENSE.txt). [MODULES-CONTRACTS.md](MODULES-CONTRACTS.md#provenance) maps copied and adapted Solidity files back to MASTER. Original project names in those notices and cryptographic domains preserve provenance, not a second NFT identity.
