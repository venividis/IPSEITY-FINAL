# MASTER integration validation record

**All three GitHub Actions jobs passed on the exact candidate below.** The original 26-stage verification battery passed, including all 160 Solidity tests; the module suite passed 77 tests; both Chromium runners passed all 10 cases. No public-chain deployment or independent security audit is claimed.

| Revision | Exact identifier |
| --- | --- |
| IPSEITY baseline | [`53072c3577cd73d25b7c6066065608d3e86762d8`](https://github.com/venividis/IPSEITY-FINAL/tree/53072c3577cd73d25b7c6066065608d3e86762d8) |
| MASTER source | [`e12e0cd38ed231a0b2015d17fec302a359476de1`](https://github.com/venividis/MASTER-NFT-PROJECT/tree/e12e0cd38ed231a0b2015d17fec302a359476de1) |
| Remote candidate | [`933dab73b2beb7685604afbd4abd86c59241188e`](https://github.com/venividis/IPSEITY-FINAL/commit/933dab73b2beb7685604afbd4abd86c59241188e) |
| Candidate Git tree | `fefdb2a51192444d4326fa5a9ea5f1ff10a69e67` |
| Equivalent local test commit | `062a73b15bcd21ee2b5ea1506f9308fe75bb0748`; its Git tree equals the candidate tree |
| CI run | [Verify, run 35177386191](https://github.com/venividis/IPSEITY-FINAL/actions/runs/35177386191) — **success**, completed 2026-09-17 at 03:32 UTC |

The distinct local and remote commits share the identical complete tracked-file tree. This validation document, its README link, and the integration guide’s storage/execution clarification are documentation-only additions after that candidate snapshot; this document is not included in its file counts. Production source and test files remain the tested candidate bytes.

## Preservation inventory

`git ls-tree` and the baseline-to-candidate diff establish the following counts. Existing-file preservation means identical Git blobs, not only retained filenames.

| Inventory | Result |
| --- | ---: |
| Baseline tracked paths | 215 |
| Candidate tracked paths | 282 |
| Original paths retained | 215 / 215 |
| Original files byte-identical | 209 |
| Original files modified | 6 |
| Added files | 67 |
| Deleted original files | 0 |
| Existing files under `src/`, `engine/`, and `deployments/` | 75 / 75 byte-identical |

The six modified original files are `.github/workflows/ci.yml`, `.gitignore`, `INVARIANTS.md`, `README.md`, `package-lock.json`, and `package.json`. The additions provide companion contracts, the module workbench and SDK, deployment/recovery tools, tests, and integration documentation. The existing `Ipseity`, `IpseityAccount`, `GripVault`, `Engine`, `Renderer`, and `Parley` sources, original HTML engine, and all pre-existing deployment records are unchanged. Original invariant text remains intact, with new invariants appended.

## Local verification

| Check | Observed result | Scope / evidence |
| --- | --- | --- |
| Solidity module tests | 17 passed; 0 failed | `node tools/forge.mjs --match modules --runs 1`; [sentence-named test mapping](MODULES-CONTRACTS.md#the-tests-state-what-is-proved) and `test/Modules.t.sol` |
| Complete module JavaScript tests | 77 passed; 0 failed, cancelled, or skipped; 51.4 s | `npm run test:modules` / `node --test --test-concurrency=1 test/modules/*.test.mjs`; 69 fast tests, 6 reported JSON-RPC tests (five scenarios plus their parent), and 2 offline deployment-plan tests |
| Real local RPC integration | All 5 scenarios and their parent passed, included in the 77 above | `test/modules/chain.test.mjs`: native Reach authority, retained state, workbench/portal recovery, custody changes, and cartridge bounds |
| Contract compilation and size | Passed; every compiled deployable contract below 24,576 runtime bytes | `node tools/compile.mjs`; Solidity 0.8.36, optimizer 800, via IR, Cancun |
| Production dependency audit | Exit 0; `found 0 vulnerabilities` | `npm audit --omit=dev --audit-level=high`; dependency advisory scan, not a contract security audit |
| Workbench byte recovery | Exact concatenation, SHA-256, and gzip round-trip passed | Generated `dist/modules/manifest.json`, raw chunk files, `index.html`, and `packed.bin` |

The Solidity runner uses this repository's Foundry-shaped Node EVM and cheatcode shim. These 17 examples are separate from the 77 JavaScript tests; they do not constitute native Foundry execution or a stateful invariant campaign. Local detailed outputs were retained as `ipseity-modules-full.log`, `module-chain-integration.log`, and `ipseity-contract-sizes.log`; CI is configured to upload module and browser evidence artifacts.

The maximum cartridge regression uses **64 distinct chunks, 1,048,576 content bytes, and a 16,384-byte JSON manifest**. Its real local `eth_estimateGas` result was 10,089,136; the submitted gas limit including 20% headroom was 12,106,964; the mined receipt used 10,010,926 gas. The limit is below the 16,777,216 transaction cap. All manifest fields, chunk references, lengths, hashes, and payload bytes recovered exactly. A separate cold `eth_call` with a 10,000,000 gas limit recovered the complete content. The permanent regression is named `64 distinct chunks, one MiB of content and a 16 KiB manifest publish with wallet headroom and recover under the read gas cap`.

## Exact workbench artifact

| Artifact | Bytes / chunks | SHA-256 |
| --- | --- | --- |
| Raw workbench | 706,667 bytes; 31 chunks, comprising 30 × 23,000 bytes and 16,667 final bytes | `0xce26ca6cc9466e443f37dce8bf3c147617572945b7ddcb6c4b2eeb028a0b2cf3` |
| Gzip packed workbench | 235,593 bytes | `0xb53b379706899417d60c4cfb60025d36a65d1d0ea71fe00ffe9f4331fa95b5dc` |

The raw chunk concatenation matches `dist/modules/index.html`; decompressing `dist/modules/packed.bin` produces those same bytes. These hashes identify the tested generated workbench, not a public contract address. The actual portal response recovered these bytes and required an estimated 25,788,466 gas on the local chain; the portal verifier checks a 50-million-gas view-call ceiling. Independent chunk recovery remains available through the CLI.

## Completed CI verification

| CI gate | Final result |
| --- | --- |
| Full verification battery | Passed: all 26 stages of `npm run check`, including 160 Solidity tests, plus the production dependency audit and EIP-170 size gate |
| Module contracts, SDK and recovery | Passed: 77 tests, 0 failures/cancellations/skips |
| Isolated Chromium module rendering and persistence | Passed: 5 cases |
| Native IPSEITY browser acceptance | Passed: 5 cases and 11 explicitly reviewed local transactions; Chromium 151.0.7922.34 |
| Overall run 35177386191 | **Success**; all three jobs completed successfully on `933dab73b2beb7685604afbd4abd86c59241188e` |

The [full verification job](https://github.com/venividis/IPSEITY-FINAL/actions/runs/35177386191/job/105061972857) completed the original regression chain through its final fuzz, findings and agent exercises. Its logs report `160 passed, 0 failed` for the Solidity suite and `found 0 vulnerabilities` for the production dependency scan.

The completed [module job](https://github.com/venividis/IPSEITY-FINAL/actions/runs/35177386191/job/105061972203) retained [module-verification](https://github.com/venividis/IPSEITY-FINAL/actions/runs/35177386191/artifacts/10479073151). Its logs reproduce the raw document hash and the exact maximum-cartridge gas figures above.

The completed [browser job](https://github.com/venividis/IPSEITY-FINAL/actions/runs/35177386191/job/105061972251) retained [native-module-browser-evidence](https://github.com/venividis/IPSEITY-FINAL/actions/runs/35177386191/artifacts/10478712229), including both JSON reports, screenshots, exact transaction receipts, local deployment plans and the build manifest. The downloaded artifact SHA-256 is `db37016888625d592d00b8c42b1b23b8f4f46b94a8b8030d2f1cf8a9dc5ca826`; both reports were inspected and name the workbench SHA-256 recorded above.

## Practical limits

Transaction and recovery measurements use a disposable local Cancun chain and fixture wallets. They do not establish public-chain deployment, hardware-wallet compatibility, or behavior with real funds. Browser acceptance uses Chromium 151.0.7922.34 and an injected test wallet. All 10 module browser cases passed, including 32 KiB migration, retained historical branches, public/encrypted journals, and interactive 48 KiB/1 MiB game play, restart and exit. The reports commit to the exact workbench hash above.

The source update introduces deployable immutable companion services; it does not upgrade existing immutable contracts or change an NFT's identity. Hash verification establishes exact bytes, not package publisher trust. See [MASTER-INTEGRATION.md](MASTER-INTEGRATION.md) for operation and deployment boundaries, and [MODULES-CONTRACTS.md](MODULES-CONTRACTS.md) for authority rules, retained ABI behavior, provenance, and exact test mappings.
