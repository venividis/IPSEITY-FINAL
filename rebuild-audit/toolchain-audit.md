# IPSEITY build, verification and deployment audit

This review started from IPSEITY-FINAL commit `8fe69315258532ed90ccc1722d6c343050531ad7`, then followed the rebuild in the shared working directory. The parent task subsequently established the uploaded archive's `ef1b0e3` lineage as the rebuild baseline. Findings below describe the incoming FINAL toolchain unless marked repaired. No live transaction was broadcast during this review. Deployment JSONs are historical records, not evidence that their endpoints or code were live when this report was written.

## Findings that affect confidence in every other test

1. **Negative Solidity tests could pass when the expected revert never happened. Repaired.** `tools/forge.mjs` assigned `state.expect`, but successful calls left it outstanding and the test loop did not fail outstanding expectations. A second expectation could overwrite the first. Thus a test that said `expectRevert(); successfulCall();` could pass. The repaired runner records a sticky error when the next application call succeeds, refuses overwritten or unconsumed expectations, and checks its own failure detection using actual STOP/REVERT EVM code.
2. **Exact revert data was ignored. Repaired.** `expectRevert(bytes)` became `{ any: true }`, discarding the encoded selector and arguments. Several `Pool.t.sol` bond and allowlist tests use that overload. The runner now decodes and compares all supplied bytes; the bytes4 overload remains a selector-prefix comparison. Negative controls exercise both mismatch and match cases through the precompile and message hooks.
3. **A fuzz test could report success with zero accepted executions. Repaired.** `vm.assume(false)` consumed an iteration of the fixed generation budget, then the runner reported PASS even when all attempts were discarded. Zero accepted runs now fail. Unsupported argument types and a filter matching no tests also fail instead of producing a successful-looking empty result. The runner still uses a generation-attempt budget, not Foundry's complete fuzz scheduling/corpus behavior.
4. **Quiet and imported compilation bypassed the deployment-size check. Repaired.** EIP-170 enforcement lived inside `if (!QUIET)` in the CLI. The application, deployment tools and tests imported `compile({quiet:true})`. The check now runs before every compiler result is returned, including cache hits. Test/script/forge-std harness artifacts may exceed the limit because they embed deployment bytecode; production imports and probe sources do not inherit that exception. `verify-compile-gate.mjs` passed five assertions, including actual solc compilation of an oversized contract.
5. **The in-process eth_call analogue could persist state. Repaired.** `Chain.call()` invoked `vm.evm.runCall` directly, without discarding successful changes. Simulating a state-changing call could alter later tests. The repaired call takes a checkpoint and always reverts it in `finally`; it does not use STATICCALL, because a real eth_call may simulate writes. Calls and transactions share a per-VM queue so overlapping simulations cannot pop one another's checkpoints or discard a transaction. `verify-call-isolation.mjs` passed eight raw-bytecode controls covering internal writes, persistent transactions, concurrent calls, a call overlapping a transaction, and failure cleanup.

These defects do not prove the production contracts fail their stated protections. They prove historical passing counts alone were insufficient evidence for those protections. A fresh suite run with the repaired harness is necessary.

## Deployment and recovery

| Finding | Consequence | Concrete repair |
|---|---|---|
| `redeploy-site.mjs` preserved hub/pool/lease/sigil/Parley, while `deploySite` always created fresh Locker, Kiln, Succession and Consign. | Current UI/discovery could lose existing locks, launch history, succession plans and listings. Old contracts and their assets remain, but overwriting the record removes their ordinary discovery path. | Reuse stateful satellite addresses, verify hub/protocol wiring before reuse, retain previous site versions. Parent task owns this repair. |
| `recover-record.mjs` opened `.testnet-key` for entirely read-only recovery. | A clone without the deployer's private key cannot inspect its own public deployment. | Separate an unsigned RPC reader from a transaction signer. |
| `addrOf` collapsed nonexistent code, an unsupported getter, a revert and transport failure to `null`; only drift/conflicts failed exit. | An outage or entirely unreachable premises could be reported with missing/unreachable keys and exit success. | Report error classes; require a successful root identity read; fail required missing/unreachable production pointers; allow explicitly declared legacy omissions. |
| Recovery checked address graph agreement, not deployed-bytecode identity, chain identity against record, or freezing state. | Two consistently wrong pointers can agree. A JSON address is not a source-to-deployment attestation. | Record block number/hash, runtime-code hash, build fingerprint, constructor values and freeze/seal state; verify against the declared chain. |
| Engine redeploy froze a new engine and repointed the hub before verifying a complete reconstructed response. | Bad or stale shard plans can be made immutable, or become the active instrument before verification. | Verify plan/source hashes and load order, reconstruct the document before freezing, validate the new renderer before repointing, then read back after repointing. |
| `testnet.mjs` has no explicit chain allowlist and accepts a mainnet RPC/key. Seed logic lowers mint pricing and refers to IDs 1/2 even when deployment uses a different band. | A mistakenly supplied production endpoint can trigger inappropriate paid deployment/seeding; non-Ethereum production bands cannot complete the hardcoded seed. | Keep a testnet-only rehearsal tool and an explicit production deployment plan; derive seed IDs from the first band ID. |
| `RpcChain.send` submits legacy transactions, holds an in-memory nonce, and waits for the first receipt. | No durable resume journal, confirmation/reorg policy or replacement handling; a timeout after submission can leave uncertain deployment progress. | Save each intended/signed/submitted/mined stage and transaction hash; verify finality and resume by receipt before sending more. |

The historical Base Sepolia record lists ConsoleSkin/Core/Read, PageConsole and PageKey. The Ethereum Sepolia record does not list those components; it also explicitly identifies `nameplateNext` as a resolver not wired into `/name`. Port records exist separately for Sepolia and Base Sepolia. These distinctions must remain visible in a deployment-capability matrix instead of assuming every recorded chain has all current source features.

Both Foundry deployment scripts were stale. `script/Deploy.s.sol` constructed Ipseity with three arguments although its constructor requires five. Its constructor call is now repaired and follows the same five chain bands as `tools/site.mjs`. `script/Site.s.sol` still contains outdated page and router constructor signatures and is not authoritative. README refers to nonexistent `script/Seal.s.sol`; `Seal` is a contract within `script/Deploy.s.sol`. The minimal locally provisioned `StdJson.sol` returns empty/zero values and is a type-check shim, not a functional deployment JSON parser. The Solidity scripts have not been executed here using real Foundry and should not be represented as a proven production deployment route.

## What the tests actually establish

The incoming six `.t.sol` files contain **135 test functions, including 20 fuzz functions**:

| Suite | Functions | Fuzz functions | Scope |
|---|---:|---:|---|
| Ipseity | 38 | 6 | Token standards, mint/transfer/leases, section words, renderer storage, SVG/trigonometry, kernel paths |
| Lease | 25 | 2 | Rental authorization, exact payment, elapsed-time accounting, early termination and sale |
| Mul | 11 | 4 | Full precision multiplication/division and price arithmetic |
| Parley | 25 | 0 | Speaker authority, group membership, pair rooms, heads and message bounds |
| Pool | 27 | 7 | Inventory, pricing, fees, bonds, access control, AMM arithmetic |
| Timelock | 9 | 1 | Delay, replay, expiration, cancellation and administration |

`package.json` chained 26 check steps. The Node Solidity runner defaults to 24 generated attempts per fuzz function; `foundry.toml` specifies 512 fuzz runs and an invariant configuration that the Node runner does not implement. README quotes both 158 and 135 Solidity tests, while INVARIANTS' historical section quotes 73. Assertion/gas/byte counts in the prose are measurements of past versions, not a current test report.

The JavaScript verifiers are substantive: they deploy actual compiled Solidity in EthereumJS, use adversarial token contracts, exercise balance conservation and solvency, compare render bytes and signatures, and drive emitted clients. Their limits differ:

- `verify-site.mjs` uses a DOM shim for much of its interaction coverage. It does not substitute for browser origin rules, iframe isolation, layout, WebGL, mobile input or a wallet extension.
- `verify-console`, `verify-instrument` and `verify-thermal` use Chromium. That improves execution evidence but is not Safari/iOS/Android/WebKit/Firefox or real wallet conformance coverage.
- `verify-launch` dispatches callback selectors and permission bits using a locally written MockPoolManager. It tests real hook bytecode against that mock's model; it is not a fork of a pinned production v4 deployment.
- `verify-port` uses local endpoint mocks and protocol-shape checks. Historical endpoint probe scripts and address comments are not a fresh proof of DVN/security configuration or live delivery.
- `verify-recover` is principally a structural source/table test. It does not run the CLI through network outage, partial RPC response or missing private-key scenarios.
- `agents.mjs` adds real EVM stateful action sequences with economic monitors. The motives and fixed action menu are handcrafted; this is not coverage-guided stateful invariant fuzzing over all callable paths.
- Many adversarial helpers catch any thrown error as a successful refusal. Some suites inspect expected selector data; others only prove that the attempted operation failed for some reason. Strict revert-class checks should be prioritized where failure reason carries the security claim.
- `tools/evm.mjs` deliberately uses Cancun, permissive gas budgets and skips transaction balance/block-gas/hardfork validation. This is a logic harness, not evidence that every operation is admissible under every target chain's current transaction and RPC limits.

`gas.mjs`, round-trip verification, shader parsing, browser rendering and assertion execution prove different facts and should remain separate gates. No aggregate count should hide a failed or unexecuted gate.

## Reproducibility

The lockfile fixes a concrete dependency tree, but README says `npm install`; reproducible builds should use the lockfile without updating it. `solc` has a caret range, Node has no engine pin, and directly imported `@ethereumjs/block` and `undici` are undeclared direct dependencies satisfied transitively by the observed lock. No CI workflow was present in the reviewed tree.

A compiler cache has been added to remove repeated expensive recompilation. Its key includes the exact standard JSON input/settings, full solc build string and remappings. Callback imports are validated by current resolution path and content hash; cached output has its own checksum. Missing/corrupt/stale entries compile again; every result still passes EIP-170. `cache:false` forces an independent compile. A dedicated regression checks identical output, changed imported source, comparison with cache disabled, and an import changed into invalid Solidity.

The engine build already parses minified JavaScript, checks shader source, preserves the state-injection gap, verifies gzip round-trip and bounds maximum shard size. Remaining improvements: reject nonpositive/noninteger `--chunk` values (zero currently causes a non-progressing loop), emit source/document/shard hashes plus tool versions, and validate that an engine redeploy uses the current plan. Historical envelope scripts use dated hardcoded gas prices and fitted cost models; they must be labeled scenarios instead of current quotes. Gallery/viewer templates fetch Google Fonts, although the deployed instrument's on-chain/no-CDN claim concerns a different surface.

## Prototypes that should remain quarantined

`probe/README.md` explicitly says these are measurements, not shipped machinery. Nothing in `probe/` belongs in the release merely because it exists or compiles.

- **Bourse:** the repository documents and supplies attacks for away order-ID squatting, home receipt-ID squatting, a lying asset contract and global claim-budget starvation. `Quorum` also counts repeated witness addresses as repeated witnesses; constructor/rotation do not enforce distinct identities. This is not a deployable bridge marketplace.
- **Plate:** the posted Merkle root is not bound to the uploaded shard bytes, an arbitrary root can lack any discoverable pixel proof, there is no complete-image commitment/length rule, commissions with no poster have no refund path, dimensions and steps are unbounded, and native amounts are cast to uint96. Its challenge measurement does not establish a correct permanence market.
- **Stall:** `buy` downcasts a uint256 total to uint96 without a bound, permits zero quantity, stores shipDays without using it to settle, and treats the seller's shipped flag plus elapsed time as fulfillment. Settlement/refunds push funds to arbitrary recipients. The page concatenates all inventory without pagination. These are prototype gaps, not features to expose as a finished shop.
- **Parts:** a useful bounded-field/SCORE/ROM storage sketch. The FIELD gate is a lexical filter, not a GLSL compiler or performance proof. Metadata/receiver behavior and hostile shader workloads need production standards and browser tests before integration. The probe prints several refusals instead of failing its process when a claimed rejection does not occur.
- **RefField/Assay:** deterministic fixed-point reference rendering is a different output from floating point GPU rendering; a pixel proof does not certify an arbitrary GPU screenshot.

## Coverage and review limits

The appendix inventories every file in the assigned incoming folders, plus build/configuration documents, with exact byte count, line count and SHA-256. Full control-flow tracing concentrated on compiler/build/EVM/Forge, deployment/recovery/RPC, source scripts and the major prototypes. Large verifier files and mocks were mapped by entrypoints, assertion sections, imported dependencies, adversarial behaviors and failure/exit paths. This is a source/toolchain review and a set of targeted repairs; it is not a claim of complete statement/branch coverage or an independent smart-contract security audit. Fresh execution results belong in the rebuild validation report, not the historical numbers quoted above.

## Appendix: exact incoming-file coverage

Source tree: `8fe69315258532ed90ccc1722d6c343050531ad7`. 131 files. Hashes refer to incoming bytes, before repairs.

| File | Bytes | Lines | SHA-256 |
|---|---:|---:|---|
| `.gitignore` | 293 | 14 | `05cd57a98c9a8e98b824910c9b8e6b8a6a27e0908fc6f2f59f1febd50d909112` |
| `CLAUDE.md` | 17892 | 293 | `09c2d8f0934e9ab3ef52029629774d05ffffa9474247c1e2ac60a31544732698` |
| `INVARIANTS.md` | 91146 | 1603 | `028ca18614f338c6e9464f28cee69eb7bc8e258927770d4a97cd555b53b6818d` |
| `README.md` | 83889 | 1491 | `8396f1e4360d37c59044c69467bcdb370c5bd99a9f67be558b73d270d20a6bf7` |
| `deployments/base-sepolia.json` | 3561 | 68 | `bd708619059823e33ef1293bef175eb8cf493a8599018af56e33203a790ab002` |
| `deployments/eth-sepolia.json` | 4421 | 76 | `f11489db178db95dfe9c76c7ce43b543a9e65f60d6ab7f25bb7c51125adc4cd0` |
| `deployments/port-11155111.json` | 349 | 14 | `ef27a88cf9a47915f99bb992717047a69bfc18f3c27af29b5cf13783cc9fa9f0` |
| `deployments/port-84532.json` | 349 | 14 | `7c7945d75bbf6f5a9120803731aba990a1539486451a18f7b16b45901e25233f` |
| `foundry.toml` | 701 | 23 | `7500dcbd199cc69855afb5e595a2200ea908544df63840260fbea13fde0fe315` |
| `hardhat.config.cjs` | 1197 | 25 | `b4a8220468c17717abc5d63240743ac6a4cee1cc8f0bd5d3972e73a8d96db6d5` |
| `package-lock.json` | 126122 | 3507 | `f54b24bb55428004ab7b8447ae8101017ddab4fee23055949cf4711fa2a29285` |
| `package.json` | 2850 | 55 | `e9caf7ae4133f1d47a8738558604df72fee775715c570383d1eeb41adf904ff6` |
| `probe/AuditB64.sol` | 734 | 18 | `dcc8e03601d1f20501e955dfd949beea6b3b696cd7c0da72728938cff5fd4406` |
| `probe/Bourse.sol` | 25995 | 541 | `b23bef4babb311387052c18ba2acf243fd52af939dd14fe0232daa661945514f` |
| `probe/Parts.sol` | 11297 | 242 | `d6077edfc227c09e4b5eaba4e2faf424c0d54e2923a2d199a1efbb81f4cb1401` |
| `probe/Plate.sol` | 9592 | 209 | `43cdfb1f8d12a2a724d9a4d35a23f8809e9654ec52dba141c1f97a40910d8562` |
| `probe/README.md` | 7079 | 134 | `6d98f9ff5f2e48dd922657b9aa6a71d78fca1ab5d58bd64f25d5bb4f19e05da0` |
| `probe/RefField.sol` | 9068 | 215 | `d82a45f8744a424d88df2c47313deffc69e705021b201c9b395fb6765f2cab51` |
| `probe/Stall.sol` | 7873 | 213 | `0836f35b0fb7feb2bad9affde1df00ecc2c8cecd9125506185d8fe3500b43326` |
| `probe/_AttackLiar.sol` | 388 | 8 | `d18f764593a86014436d35ee4e95d89b21a4cc30411c632e5f41f4faf546c156` |
| `remappings.txt` | 30 | 1 | `ea084d6e5d1943cf7da06c5e6bcc80538762f5b35d368d942306c3a338222c6c` |
| `script/Deploy.s.sol` | 5251 | 114 | `d5f312b06aa1295201e175e4d1f08e65a8e10d9c80b055f13a2181947d0702dd` |
| `script/Site.s.sol` | 5371 | 108 | `10e86e987e10e6f65fcb965bd9fa3853358afd03071ea207a1a3d0fcf1ec214a` |
| `test/Ipseity.t.sol` | 21100 | 516 | `1fe2bbe501f862363b80e5efeaba24a2fc93144d3e1204726928ff0365fb3ee7` |
| `test/Lease.t.sol` | 17388 | 429 | `4960986badab26d585190dc8169b526585117fd4337d287623fc2900b9bf723c` |
| `test/Mul.t.sol` | 6164 | 127 | `4efa7c23a63779e62c3755565e833ebc991523c3534f81490314e96d54d6bfa1` |
| `test/Parley.t.sol` | 16056 | 386 | `a1ed9bc44c802d26b05488f628195cd1b37762f071aae485775c1081e2c50f5c` |
| `test/Pool.t.sol` | 20755 | 499 | `f4ae156ba602f42b475fbf4d1cc880f7ff6fd84a84ab9ae02d0d0623faae00e7` |
| `test/Timelock.t.sol` | 5066 | 140 | `b03b023935fb52b15829fd0e8cbb44a4c291ac075350fbcba9beb66560e4e758` |
| `test/mocks/Breakable.sol` | 2057 | 50 | `654941e9cd6a4fdfe948807eb4ce684fd21b47f6a69321699b75c8d96974784e` |
| `test/mocks/Broker.sol` | 1485 | 26 | `7a81d6c107063cb55b0a50c71aa4dd13abfb307ac7b9efd54be5bde3a51439ee` |
| `test/mocks/CurveProbe.sol` | 696 | 16 | `c1e7e1add36974a875089b9e3c379642fdc40df60cca0fb6b04ecb1ef425aa0f` |
| `test/mocks/Drainer.sol` | 1110 | 28 | `f4fd232e0e5f6f241bb5fba0d2ac355451ba5746e1ceb6a9dba824f989d56b73` |
| `test/mocks/ERC6551Registry.sol` | 2129 | 52 | `27d51036f049d74724a03ac883d755d3386a48b1679e536fcb0be722f456e3a3` |
| `test/mocks/HighBit.sol` | 1832 | 36 | `df8ba5c040673b48041c99b6d4aa00009f04872003d4968a046331f929848287` |
| `test/mocks/Hooked.sol` | 2140 | 46 | `4ee15ae4dbc20d21cf747478d17290acdbbcff3661b6e8efa97151842bb65ea6` |
| `test/mocks/LzStub.sol` | 342 | 8 | `6501c7f0aeb37133fa2e5a4a0854cac464b9ff59defcb12adf46853446eef45c` |
| `test/mocks/MineProbe.sol` | 1987 | 48 | `7717c627f79e950cdb293dd6a11bde35e49c0481c9546698dd23c6a05a8593de` |
| `test/mocks/MockAccount.sol` | 954 | 25 | `ff85fb986b6596cbddbcdf6a55e2830bc1d2e50dc1bd6d5bac84c3cc4e482240` |
| `test/mocks/MockENS.sol` | 349 | 12 | `c6b129575208375c9e48af80a0f845e4fdefa2f6f07cd47bedc8bf1f1d8f4f43` |
| `test/mocks/MockERC20.sol` | 2447 | 66 | `8cff667cbffe662efcbf57225840768f409e2b12332d10d8591d599b6ec4c789` |
| `test/mocks/MockERC721.sol` | 2504 | 46 | `1bac6bb1c0178827cb8a8432c2af03ff96cfd3df419873a32aa2b3a8506a005d` |
| `test/mocks/MockEndpoint.sol` | 7635 | 156 | `071a54fa4369ee891e892f813991247e9b836a03d067379e6f4020f81a39091e` |
| `test/mocks/MockHub.sol` | 988 | 24 | `fe051ccf8e2a850b0f9bd2a7a2a29c930a4a4d3f1e64ca92bde5e38851572c99` |
| `test/mocks/MockPoolManager.sol` | 5048 | 108 | `b9390d6c782e9bf4b7604d891b104c248b7712cd2cbca85b355b433bf109e415` |
| `test/mocks/MockReceiver.sol` | 255 | 10 | `d3b61342b052143ebcefb19cea6bb1e6f8c5d19807fdf998efdd40446b822af7` |
| `test/mocks/MockRegistrar.sol` | 1304 | 34 | `8c03cc28793155142e69f0eca874c47c853c6aeac58ae160c956c5b8c426a628` |
| `test/mocks/MockVerifier.sol` | 904 | 23 | `c0a23a34a052af2938455067c2737d7b9ccdba006b32752e64433629c73b5c61` |
| `test/mocks/Nasty.sol` | 9901 | 197 | `c97bf59bccf966b9954c6ad1a5a7d1bf545a97d434af709f04b0cb9ee380389c` |
| `test/mocks/Permit2ish.sol` | 1889 | 34 | `c0d125763f2c515138916294cef05db68dfb1ea49247cb3eef2d92549b44c07c` |
| `test/mocks/PoolReenter.sol` | 2281 | 65 | `36dcc62e85891e003f3a9efb18315700852b71b6e4a391fe2a12d2f8f0e1ba6d` |
| `test/mocks/Probe.sol` | 4132 | 98 | `e6c813ded4dd2e7420a54dbf9a0c09315e71cf9ec867dd8d6ec6c0c9568868a6` |
| `test/mocks/SealBreaker.sol` | 1685 | 36 | `0da4737cde64951cb9abb0bcc4a088979be430d3ef0cea80e00da102c7f951f3` |
| `test/mocks/Trap.sol` | 2495 | 54 | `1a0750b536697a9890eb58383fd2874a8cd911ba0b8e7ce293fabc159784672c` |
| `test/mocks/UniV3.sol` | 27405 | 665 | `abf32c2861b4aee5a707e7188463bfc9aaab7844d019b510c0fb049683e04b75` |
| `test/mocks/Winker.sol` | 2010 | 43 | `5f86445b18d04e1abf4e1f31a2426a5bb6959f5dde62feec3c6ca4df188a5a53` |
| `test/mocks/XSettle.sol` | 3090 | 68 | `d5d97cf048d7799a474fbc2ba9c94e500e0d9e3379ae770d976918a3f10efc93` |
| `tools/agents.mjs` | 32801 | 741 | `3cf9a6c8745768842328dd1bce96b39d2bdb5f6888c92d3fd242c6ecd834f5e4` |
| `tools/attack-bourse.mjs` | 6545 | 98 | `21b81e52a3da667dcd2e11859073a7b1048469179ae731e8ac4e62a9c74bbd27` |
| `tools/audit-b64.mjs` | 1242 | 20 | `4a860de2826faa1b1c921bd97e9e41034dfc912862b723c026f3232f065f1500` |
| `tools/audit-headroom.mjs` | 3835 | 71 | `de6e3506559c70caf12677561e6c8c6314d442d8113fa5b266f61c0bbc00583d` |
| `tools/build-engine.mjs` | 10206 | 212 | `7ed3ccf1dddb985de4accc640e9920239688c3ace3761e7f51b680b4c9d6d142` |
| `tools/compile.mjs` | 5256 | 125 | `032018495f0df67d48743463d18a19f1e0ef9d437ed1afb207c471021fa05426` |
| `tools/emulator-envelope.mjs` | 7667 | 123 | `45297dc2963401476d7f289ed6b015d0678625d7b6af996d2876729e94e320c8` |
| `tools/ens-name.mjs` | 9604 | 179 | `2292ee12dc84f2529d3e6cb9c2d0e380575ea92fbacc8d991c0c0bac83624890` |
| `tools/envelope.mjs` | 6740 | 95 | `c40ab83ab614ee13061bf282aa5429dfeaeab33e1386fc78cf24d5de72039ed8` |
| `tools/evm.mjs` | 15148 | 359 | `3edc77072872f876e89fa8c07e2bc462fbe21c514411340e80ded283d0f58c0b` |
| `tools/exercise.mjs` | 54138 | 842 | `c84db7fd496a7f2b534897df218c8ae705a15e9c4e36a93ac53834af1c54ca14` |
| `tools/forge.mjs` | 37307 | 792 | `500252b22368a24ae9a600ea498ceb83908a59926090cdf590cb7e07c903a2fa` |
| `tools/fuzz.mjs` | 26342 | 561 | `1fe8fa5a119d716d5cb39197b5e8ef4ef210e8c43ac79e972212a27f8c86a26a` |
| `tools/gallery-page.mjs` | 4135 | 92 | `c0cc3fe6537454206306e0be0c9bd8880d444e6bbd91b461daeb81bbe1b4f60f` |
| `tools/gallery.mjs` | 11524 | 213 | `45b8e4b3122b7fcc03ec3d038f848565c9734108abe0b57c43ce22f7e9e77991` |
| `tools/gallery.tpl.html` | 19829 | 414 | `2a6e108043c6105cd40cd17ecd614bf68a90d9caa9383854b0c4b6cc92492aeb` |
| `tools/gas.mjs` | 14823 | 278 | `ca189cfc62a4cf354e1c35b6eb86507eef625c87e8270bdf5a3ff37b9c6aae72` |
| `tools/gateway.mjs` | 5636 | 120 | `31d590e4a3e849283783bed6b2ae49ca3c04669666567189180ba68b957959c3` |
| `tools/glsl-check.mjs` | 4583 | 98 | `45f11fe502578c9121b76e109a6a4fa22721fa66004565aac30432eb956aeb10` |
| `tools/poc-pool.mjs` | 512 | 10 | `7156dae75af31f2f2786a2b1fb5b59a9cbf11cfc75790468840eb425bf4ac866` |
| `tools/port.mjs` | 13501 | 269 | `387630a885e695d387c4fe939666b08621bf012af0717cc7aadd6544a3627247` |
| `tools/portal.mjs` | 11253 | 222 | `4dec97c9d5829b45884ff98731907f15520e14b6bf9ae89b6f183ff620476c07` |
| `tools/preview-site.mjs` | 11765 | 207 | `d4043f7f67d4f6ed71d4a29d17d23ced143907eb103d04b448cc22c902714073` |
| `tools/preview.mjs` | 3359 | 72 | `965e5b2e7f994dc53bd6b9da1d58d69e675c8965950fd411233e821c56178d80` |
| `tools/probe-blocks.mjs` | 1239 | 19 | `9f2fdf0a63ee56f7bd74aed77959ca7bd6bad3094467d614acb520cd9feda3b9` |
| `tools/probe-bridges.mjs` | 6886 | 110 | `c1aef59879c821f38b659ac1115b604971628d14591bc78d2014a39233e8cb84` |
| `tools/probe-bridges2.mjs` | 3531 | 41 | `2f33ed46d767dbe2db0b911ac48ad3dcf9dd89b53e23c112f8a813cf959c169d` |
| `tools/probe-ccip2.mjs` | 2582 | 37 | `06ef336523d6b86fd4b29792c30fd504dba5df257d4d1b59c08f913b7c1f8e9f` |
| `tools/probe-dvn.mjs` | 1625 | 28 | `6cad6df5cda9c8670cf4a0df19628ecab7d3c1a6f9a406f97770d300903646b5` |
| `tools/probe-economy.mjs` | 9517 | 151 | `d1a87a68954ca3d689d3ef14909bde9ff4f8f653dea7f8bbc51b9ab9792bf423` |
| `tools/probe-emulator.mjs` | 6943 | 119 | `fa6808cda45d1e4d953c3b1f1ca97833df5027f58c18b511abbccd0ff3e57077` |
| `tools/probe-feecurve.mjs` | 2365 | 36 | `828986ef2920526ac8a5b6da097bff96731f42b6cc49c37a71c6094c471451c0` |
| `tools/probe-lz.mjs` | 5621 | 106 | `d6529d1d080597e29b52e391cf5e5a42ac8885c510101566e207a35537a1d2e1` |
| `tools/probe-parts.mjs` | 6125 | 110 | `0bc8e41561f9fe29e26388065efb920097dc4db741b23ef45ccf1d05d241d02d` |
| `tools/probe-plate.mjs` | 5008 | 95 | `a3a5161f37cd6181725f49d2937c1992ab1e99b796e97436e76142f0c8b30d09` |
| `tools/probe-port-abi.mjs` | 6125 | 105 | `5a80ae3be46101abf5ae33584e773cf716d58fabc633eb0269d998099351579a` |
| `tools/probe-reach.mjs` | 6188 | 103 | `6f0a74dc9c5bcd02b37d08132b7923b49f4eb4a2ac48fbe2715f738032d50ff2` |
| `tools/probe-render-native.mjs` | 7194 | 163 | `d5e45262ad7cbe205774f15001ddef35223a1620c465d92d3d55c56d313b449d` |
| `tools/probe-render.mjs` | 14508 | 310 | `a3fa8faddbdef458d85484d7e3c212ce23ed8106b72e4540c685459bef8e9e88` |
| `tools/probe-splice.mjs` | 1950 | 37 | `5f1693b88827502b9c5af256692188be860da4a47ba775cbb4f731af225afcef` |
| `tools/probe-stall-size.mjs` | 316 | 5 | `c841b90bce0a65354f8e0efc6adabf018bb527eef9d504332295238da5e62daa` |
| `tools/probe-stall.mjs` | 5913 | 100 | `e4c9733a8b253f011e8e5a3a725ee192cc34614ba4f827838890f5f6ea318a3b` |
| `tools/probe-uln.mjs` | 3395 | 53 | `eeca3b0fba563d920a59f2815dca78c3df97553fc290c4d4017419e4f9578a68` |
| `tools/probe-xsettle.mjs` | 4352 | 67 | `a9000f5ba146c488deebabdf6773198d383524bf9ca642d5b175c059ed9e4db2` |
| `tools/recover-record.mjs` | 6700 | 129 | `5dd9ee1b6885a5a16003152955945162bbad5a7691adb2a36683bb5a5411073a` |
| `tools/redeploy-engine.mjs` | 3009 | 51 | `a9c444ccf7dcb91c84673219d688e1573b25e5b7b1e2b13cd3462649c071a724` |
| `tools/redeploy-site.mjs` | 4208 | 83 | `cb74300e9e93b6032b9fe1ca6614b1b8a129b6024aa0613363479cebea1e629f` |
| `tools/rpc.mjs` | 9156 | 196 | `71782d9dbf3f7ba2471fa878329a51658622bfb13800824a37b606783477a935` |
| `tools/selftest.mjs` | 12568 | 221 | `2b73f173070e2b5387a69ec1681d7a52719963057020063aab30cf30b95fa06c` |
| `tools/shots.mjs` | 11447 | 240 | `ce9f236f1d390af479975e2e56b8b964a6445996abb652e5b04c13d0b457615b` |
| `tools/site-viewer.mjs` | 4590 | 86 | `88377f9bffa3eab5f3dabfe18f7daf10fe2e619477a02c7dd977adcf359a3f66` |
| `tools/site-viewer.tpl.html` | 11632 | 231 | `9f8ac6c0c0a5d7fd645eed6b44f84c7df6b06b18e9ae8363f528e4cdaf027c7c` |
| `tools/site.mjs` | 42926 | 824 | `210a6408946bcdb3af5abc83cd444b2c6a6ce69eb1ba799915b2ac4689db9750` |
| `tools/testnet-drive.mjs` | 9249 | 201 | `7d5d5c56dba7b95da889a95af9915d224a18ba19ae678e8728bf42868b8d8350` |
| `tools/testnet.mjs` | 16540 | 319 | `2cc58d3bbdee2733a7c65a97b84cc93e74492b3e77e4f96569a67a186cc4a1d7` |
| `tools/verify-console.mjs` | 42805 | 845 | `57174440cc29b061db8bc47aa5302cf58d9232aef32a410fa6d2d2514223a8ca` |
| `tools/verify-curve.mjs` | 7719 | 158 | `b38d92c82d9d0df00e120af805c3306653df644cbef34ececc75204f89189588` |
| `tools/verify-estate.mjs` | 23395 | 459 | `b7fcd913f4b1767907827f200645ce77eef266777d88d22eac3ff91e8c19d8f3` |
| `tools/verify-findings.mjs` | 37718 | 737 | `7767bed4262b29adbe759171d5cf34f03e86dbb5ea0286aa4db02edb09e8e7db` |
| `tools/verify-instrument.mjs` | 15325 | 290 | `c99ab6f996e1ad0dfc9ac84d88154125cc2f49946ef32c09caa0065675a74f76` |
| `tools/verify-kernel.mjs` | 14145 | 254 | `a313f6df893898d273dbc46a28d5e68c33fd3d16ec40eb469bdce702807b4660` |
| `tools/verify-launch.mjs` | 23940 | 455 | `c62063b6eccfc35b9b1611e642cd64c5d7d3f1b9917d4f4ad5db658159baee2a` |
| `tools/verify-parley.mjs` | 14781 | 305 | `1de804158e9d146852e8e628420b5d518c10a8d601b49049a256f107f204ab77` |
| `tools/verify-plate.mjs` | 25701 | 482 | `51226df0d0c19381681e25ecc650bcabc421cf19100468911f6edc19c2bfc42f` |
| `tools/verify-pool.mjs` | 26561 | 493 | `fbf2b7e045aea9828eee27303f7760c3478e40567753a8386dc32ae4e75b074f` |
| `tools/verify-port.mjs` | 18212 | 339 | `ce59fb96ec888988bfce6e10d8837c9095a8e1f9513e5bec1f51ea0fdef38e5a` |
| `tools/verify-portal.mjs` | 10784 | 196 | `d9c0d68e92bcab0197e4518419969f846c9a8be6d33aabf8cc70ce7658f3cf66` |
| `tools/verify-premises.mjs` | 12243 | 217 | `130e80f1394baf9c384cfb365c2c60fd2949164bf21f979a99dc10561fc83243` |
| `tools/verify-recover.mjs` | 9315 | 184 | `2ccfe7fecc6de4709bc7ec17acb0e5a21871442d5ac7ae8653239b2e3d64f41e` |
| `tools/verify-site.mjs` | 153169 | 3119 | `11e7a503277a823f53f3524d485df119f1407f41f7c0d482d06ab2f66f3b6da0` |
| `tools/verify-thermal.mjs` | 14898 | 303 | `a16406619300f48d52419fa57ac1bde6227200bed1410000ead137c0f973bcc5` |
| `tools/verify-timelock.mjs` | 9955 | 191 | `685f720786a8633bb584f87c4e3874ddae8e2ebe366701a8fc88b5bed969f9a2` |
| `tools/verify-vault.mjs` | 45826 | 869 | `0eecf9dee8899959c4a5d3da5c5e9574c03906edf3b33c69711106c7ee5a5e03` |
| `tools/verify.mjs` | 37112 | 677 | `73197a7b2d30bccb28cb8a04d8527d0ddbbae91013c572f4922a71b510f118b4` |
