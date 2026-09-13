# Rebuild validation — 13 September 2026

This record concerns the original-to-final rebuild, based on original commit `ef1b0e3ac65cf7bf3c75b023ee4043515384cff2`. The destination's `main` contains the identical original tree. Tests below ran against the combined rebuild, not merely against the incoming project. This is a development checkpoint; the remaining final-build work is listed in [REBUILD.md](REBUILD.md).

## Source and compilation

- Every one of the archive's 673 listed SHA-256 checksums matches. All 638 snapshot files match the recorded Git blobs. The bundle contains 123 original commits.
- Production compilation used locked `solc` 0.8.36, optimizer runs 800 and via-IR. Node was 24.19.0. The compile took 318.453 seconds.
- All 72 nonempty production runtime artifacts fit the 24,576-byte EIP-170 limit. The largest is `DeskTerm`, 23,908 bytes, with 668 bytes remaining.
- New subsystem runtime sizes: `Etch` 6,892; `Vitrine` 11,178; `PageEtch` 6,719; `DeskEtch` 10,791 bytes.
- The production compiler artifact SHA-256 is `0319a4d7d266ac4cc5c553f25fd48d989f8cdf32a728faffcb5c4c9bd34717f9`. Every source digest in [compiler-validation.json](rebuild-audit/compiler-validation.json) was checked again against the delivered source after compilation.
- The original GLSL block remains byte-identical. The lockfile is retained. No installed dependencies are included in the source download.

## Solidity suite

The complete Solidity suite executed in the project's EthereumJS runner: **154 passed, one failed**. The repaired runner exposed an original test-ordering defect in `ParleyTest.test_anUnfoundedRoomIsNotARoom`: an external getter ran after `expectRevert` and consumed the expectation before the intended failing call. The getter is now evaluated before arming the expectation. A focused rerun of that corrected test is recorded separately below.

The corrected test passed: `node tools/forge.mjs --file test/Parley.t.sol --match anUnfoundedRoom` returned **1 passed, zero failed**, exit 0. Thus all 155 Solidity tests have passing evidence across the full run and the focused correction. The compiler size-gate (5 assertions) and cache (4 assertions) regressions also passed again after adding the explicit `--file` option. Both the original full-run log and corrected-run log are retained.

The full run includes all 18 new Etch/Vitrine tests, the missing-registry account-address regression, and the market callback/reentrancy regression. Fuzz cases use 24 accepted runs by default. Negative self-controls exercise missing reverts, wrong revert data, abandoned expectations and unsatisfiable fuzz assumptions.

This runner executes real Solidity bytecode but is not Foundry itself. Foundry invariant campaigns, coverage guidance and native traces were not run. The full suite was not rerun after the test-ordering correction; the only affected test was rerun with its actual imports and identical compiler settings. No production Solidity source changed after the full run.

## Other completed checks

Counts are reported per suite; some suites overlap and should not be added into a claim of independent test coverage. Detailed command output is under [rebuild-audit/validation](rebuild-audit/validation).

| Check | Result |
| --- | --- |
| Metadata | 164 assertions passed |
| Pool | 62 assertions passed |
| Vault, seal and session controls | 124 assertions passed |
| Kernel | 36 assertions passed |
| Premises | 32 assertions passed |
| Estate and inheritance | 66 assertions passed |
| Generated site | 580 assertions passed |
| ENS resolver/nameplate | 71 assertions passed |
| Identity bands | 104 assertions passed |
| Band client regressions | 14 assertions passed |
| DOM client regressions | 25 assertions passed |
| Inscription wallet client | 17 assertions passed |
| Protocol retention | 14 assertions passed |
| Renderer quoting | 68 byte-equivalence cases passed; 4 KB worst-case probe used 3,414,937 gas |
| Compiler size gate | 5 assertions passed, including oversized-contract negative control |
| Compiler cache | 4 assertions passed, including changed/broken callback imports |
| EVM call isolation | 10 assertions passed, including a custom-chain signer |
| Messaging | 37 assertions passed |
| Timelocks | 24 assertions passed |
| Curve | 18 assertions passed |
| Federation port | 42 assertions passed |
| Launchpad | 49 assertions passed |
| Portal | 45 assertions passed |
| Recovery structure | 294 assertions passed; this does not demonstrate recovery from a live network |
| Property fuzzing | 14 properties, zero broken; seed `1552813290` |
| Existing findings probes | 15 attempts, none reproduced by those probes; unresolved audit findings still apply |
| Agent-market simulation | Every monitor held over 220 ticks; seed `1237968579` |
| Read gas | All measured calls remained under the harness's 50-million-gas cap; no live RPC-provider guarantee |
| Renderer pipeline | Six GLSL shaders parsed; 55 self-test assertions passed; minification, compression and shard build completed |
| Local previews | Original instrument generated; inscription preview generated from actual local EVM contract responses |

## Unexecuted gates and limits

Chromium was unavailable and installation timed out. The three original browser suites and the new real-browser regression suite were **not run**. DOM-shim checks do not establish visual quality, WebGL performance, real browser origin isolation, or wallet-extension integration. The aggregate `npm run check` is therefore not reported as passed.

No live blockchain deployment, financial transaction, mainnet fork, real Uniswap v4 integration, or external signer service was exercised. Historical deployment JSON files are inherited records. The inscription preview uses local EVM addresses and disables its saved wallet controls.

The audit's unresolved concerns—including pre-seal allowances, rental-history accounting, ENS parent initialization, kernel recipient binding and message keys after sale—remain open. Passing checks are evidence for their tested behaviors, not a security certification or completion of the full roadmap.
