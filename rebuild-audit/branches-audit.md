# Archive branches and decoded prototype audit

All 31 decoded prototype files were read in full. All 673 entries in SHA256SUMS.txt were recomputed and match. No archived source was modified. The recorded failed prototype compilation was reproduced locally with solc 0.8.36 (the prototype requests 0.8.24).

## Provenance and deduplication

| Snapshot | Files | Relationship |
|---|---:|---|
| default-branch | 210 | ef1b0e3ac65cf7bf3c75b023ee4043515384cff2 |
| latest-ipseity | 210 | 8fe69315258532ed90ccc1722d6c343050531ad7; 198 files identical to default |
| idfbi-experimental-branch | 218 | 2779d97b315a5da80ceab5b5262ba392c876de69; all 210 default files identical plus 8 new files |
| idfbi-decoded-project | 31 | Byte-for-byte matches all files in decoded payload |

The bundle contains 123 reachable commits, three branch heads and no tags. A local bare clone succeeded and git fsck --full returned no errors. Every snapshot file also matches its Git blob in the claimed bundle commit: 210 latest, 210 default, and 218 experimental. The bundle HEAD is the default branch. Latest has six commits after default. Experimental branches from default and adds two commits; its September date does not make its IPSEITY source newer than August latest.

The 33,537-byte gzip payload SHA-256 is 3c3be7eaec1cd67ad6fb17b96693ff5b88230bb757517cc7c468c61babf8312b. Seven base64 chunks concatenate into this archive. Its 31 files exactly match the supplied decoded tree. The extra workflow extracts to /tmp/idfbi, installs stable Foundry, and runs forge build --sizes then forge test -vvv. It never builds IPSEITY itself. The workflow is read-only for GitHub content and does not deploy.

## Original baseline and imported latest upgrades

The rebuild baseline is the ORIGINAL default snapshot ef1b0e3, and IPSEITY-FINAL is the destination. The August latest changes are imported upgrades against that original, not a replacement baseline. New fixes and the Etch foundation are separate additions.

The 12 changed files total 1,492 insertions and 117 deletions. They are CONSOLE.md, DEPLOYMENTS.md, INTERFACE.md, INVARIANTS.md, OMNICHAIN.md, deployments/base-sepolia.json, engine/console-lanes.js, src/ConsoleRead.sol, src/PageConsole.sol, tools/redeploy-site.mjs, tools/site.mjs, tools/verify-console.mjs.

The latest console adds per-coin decimal/symbol resolution, exact allowance steps, market opening, swaps with reviewed quote/minimum/deadline, inventory deposit/withdrawal, fee/bond/curve controls, free loans, asset sends and NFT bolt controls. Speech gains a UTF-8 composer, bounded single-block back-link history walks and a separately labelled stream of cross-chain Echoed events. Server config/read helpers, deploy wiring and browser checks grow accordingly. These are real late IPSEITY changes; the decoded prototype does not contain them.

## Separate prototype: useful concepts and actual limits

| Area | Present | Limit / compatible path |
|---|---|---|
| Organism | Commit/reveal seeds; genome, memory, capability, lineage and state roots; bounded traits and proof-driven evolution | Distinct NFT core, not an IPSEITY patch. Use optional sidecar state before considering a new collection. |
| Account | ERC6551 CALL/batches, bounded delegations, schedules, intents, modules, EntryPoint hook | Replacing existing account implementation changes all counterfactual account addresses. Port narrowly as new satellites or future implementation only. |
| Agent | Tool registry, capability toggles, receipt hash chain, operator epoch, feedback/attestations | No model runner or encrypted strategy storage. Admin can change unfrozen enabled tools. No cumulative budget in AgentKernel itself. |
| Proofs | Quorum router and EOA/ERC1271 attestation adapter | HashProofVerifier is explicitly development-only, not ZK. Freezing NFT policy ID alone does not freeze the router policy or upgradeable adapters. |
| Passkey | Raw P256 digest verifier at precompile 0x100 | Not a complete WebAuthn implementation; no authenticatorData/clientDataJSON/challenge/origin checks. validateUserOp uses only owner signature, bypassing activeValidator. |
| Capsules | Immutable STOP-prefixed bytecode, digest deduplication, bundle reconstruction | Storage has no token binding or author registry; an Etch satellite can add those without replacing IPSEITY. |
| Mirror | Destination-bound envelope hashes and monotonic per-token nonce | Only development hash adapter supplied; no real transport/proof path, no asset bridging. |
| Renderer | Genome-coloured SVG plus 180 orbital Canvas2D particles | FOLD SPACE reverses particle rotation; WAKE animates CSS brightness/hue. No WebGL 4D interior, navigation, music, wallet controls, social or DeFi UI. |

## Findings to avoid carrying into the rebuild

1. **Compilation is blocked.** ImpossibleRenderer.sol:130 has a non-ASCII middle dot in an ordinary Solidity string literal. The local parser returns the exact Unicode-literal diagnostic from the archived review (error 8936). Further offending ordinary strings occur at lines 132, 167 and 169. Archived GitHub CI run 33923797961 failed in the build and skipped tests. I reproduced parsing, not a full 0.8.24 Foundry run.

2. **Pending mint refunds are not reserved.** ImpossibleNFT.commitMint holds refundable payment in the collection, cancelExpiredCommit refunds it, but withdraw at lines 501–504 sends the entire balance to royaltyReceiver. The owner/receiver can withdraw pending refundable deposits, leaving cancellation unable to pay. Multiple outstanding commitments also do not reserve supply. Port only after explicit escrow accounting and reservation tests.

3. **Epoch wrapper does not bind a signature.** ImpossibleAccount.isValidSignature reads an unsigned 8-byte epoch prefix, then verifies the original supplied hash with the inner signature. Anyone holding an old valid signature can replace its prefix after the NFT returns to the same owner. test/ImpossibleAccount.t.sol lines 224–225 explicitly constructs a new epoch-three envelope with the old rawSignature and expects success. Bind epoch, account and chain inside the signed digest; a wrapper alone is insufficient.

4. **Safe NFT deposits are absent.** ImpossibleAccount has no onERC721Received or ERC1155 receiver functions. Standard safe NFT transfer paths therefore cannot deposit into it. Do not replace IPSEITY Reach with this account wholesale.

5. **Delegated approvals are only selector-bound.** Delegation/session grants bound native value, target and selector (and optionally an exact calldata hash). With unrestricted approve calldata they do not bound ERC20 allowance arguments or spender identity. A zero-native budget is not a zero-token-risk budget; existing IPSEITY spender restrictions should survive.

6. **Asset-lock semantics differ.** Prototype lockAssets expires after at most seven days and explicitly ceases to bind after transfer. Its guard blocks outbound execute paths but validateUserOp can pay EntryPoint prefund without that guard. It is not equivalent to the IPSEITY Reach balance-preservation seal.

7. **Metadata overstates autonomy/world functionality.** The prototype metadata says autonomous executable on-chain world; the delivered renderer is a small visual ornament with two purely visual buttons. Root hashes are commitments, not the underlying memories/models/worlds. Feedback admits unlimited repeated submissions by any non-owner address, so Sybil resistance is not supplied.

8. **Production script has a controller assumption.** DeployProduction creates NFT with PROTOCOL_OWNER, then broadcasts setAgentKernel from the broadcaster. If broadcaster differs from PROTOCOL_OWNER that call reverts; the script needs explicit staged ownership or a documented matching-signer precondition. No deployment evidence for this prototype occurs in the archive.

## File-by-file decoded coverage

| File | Bytes | SHA-256 |
|---|---:|---|
| contracts/ImpossibleNFT.sol | 26831 | 12ad707db9dd6b770bf3fde41f85b778bb9dbf16cad9e974c1a9895c6d72525d |
| contracts/accounts/ImpossibleAccount.sol | 24930 | e15c8d425982578f131dc94f10e14ae92a072cd8e9fe3c86c333a190f342c109 |
| contracts/accounts/ImpossibleAccountRegistry.sol | 2695 | b8dd16a1b416af38bdd708e1a3751ecb6f0a8f88bc33a9cb157d21dcaa799503 |
| contracts/agent/AgentKernel.sol | 13993 | 9393d0723567a93191bc7108e1b0182bf1398c7189a3fff5e4e9c6acf49907f6 |
| contracts/crosschain/MultiverseMirror.sol | 3798 | 2f991aa8c48d14bb8335cc8ae96f8190fd9f317d6843c571e418537beafee5f6 |
| contracts/engine/AttestationVerifier.sol | 1118 | 39e6e2e6e402789e20f56292fb7963f5851027b9ff5bbb5815f812b72f4e0e03 |
| contracts/engine/HashProofVerifier.sol | 906 | f9144a403b16c57ea7bf44f460cce9a3c6097b1cbd396249192da0f5d056d724 |
| contracts/engine/ProofRouter.sol | 4557 | f38f862ad1f1b1ecb63d4460f0d20c0b06a61d6ce8273738994788806cc664a8 |
| contracts/interfaces/IImpossible.sol | 1676 | d9cfd154d01a4cdf441c73d78a4f99d76b80a627815808a898c3e29ab03bb1da |
| contracts/interfaces/Standards.sol | 4899 | 7140d5ae88e143b8d954aa907dd962c8abc923db87f24c9f7bda98b8e97be624 |
| contracts/lib/Base64.sol | 1637 | 1d3b81350f5616a8548173ff44d4b211f4b40ab7cb3837958a6b6433c5df62dc |
| contracts/lib/Owned.sol | 1175 | d9d44eae6de2e3e5f15474a9a64f09e630bd06b0c045844185f856a79fe07874 |
| contracts/lib/SignatureChecker.sol | 1898 | 44b74c55eec2d7323aab0d9355c37cc4a3f77c74f5cb966bc9b9055fb3a3b698 |
| contracts/lib/Strings.sol | 1445 | 0a044709d060688be58409d468654ed85409c73038abd571f3c6677dfb1bef3f |
| contracts/mocks/AllowAllPredicate.sol | 412 | db50a7c55e4bff21412df2ae2595431c10e9946828d941c822c392f093f4cacf |
| contracts/mocks/HashStateProofAdapter.sol | 731 | 1c61447c214e2c1a1696e14435b25fdc447c9cc814aebb3bbfd75c7a9af0aed0 |
| contracts/mocks/MockTarget.sol | 574 | 680bb718a773877b92aec59ff0f6faa3c7bd06f5dcfcb48ad5a9ff331b269c87 |
| contracts/mocks/RevertingModule.sol | 584 | fbc8892987ef5addcf4be5a7361091b92aad614f3ea5ea267fe0da4c60e8e506 |
| contracts/modules/P256PasskeyValidator.sol | 2504 | 27f1f04714eff3c256dd4f090efcc3b454be914ca00287793920efcef6158b47 |
| contracts/modules/SessionKeyExecutor.sol | 3623 | fa0a7f70512e4b1d261dbd70a15f0e8713dc7d1fb07e41ecff99e1cdc44e7cb3 |
| contracts/renderer/ImpossibleRenderer.sol | 12727 | b1f582fc70c55ef782c2374f4a5ee6b251e7bc57fc755427c93ee0a025a756ec |
| contracts/storage/CapsuleVault.sol | 3823 | 900690f22fd22af51049242b1a1a46a5b880109f82c5fa4439f9268e85179dcc |
| foundry.toml | 377 | dc02b1935dffddfdfeb216759a51361d39320862726da86cea658960eaff9078 |
| script/DeployLocal.s.sol | 2384 | 592b9a4d2953cdf87aa2258de4550c379234b6baa669bc33c1bb2c8b097d6ba3 |
| script/DeployProduction.s.sol | 3755 | 8ef92855a65604bd6c7ffde15d17d7d977a6106a9a5f740cfe5d42a38e0751b4 |
| test/AgentKernel.t.sol | 5912 | 83b357d325f1d906ccc9f138ed0b4693a397af3867ade82f5d5dbfd30e1ee7e2 |
| test/ImpossibleAccount.t.sol | 10546 | a00a6d4706303a794d3183441281fd6cf6dd1766b3f90420bf21b9f7099ff4ab |
| test/ImpossibleNFT.t.sol | 8079 | 1c56b540ae9f22f158a5dcc39dacbf3115439ef4c977858a5565c8b3491343c2 |
| test/Infrastructure.t.sol | 4327 | 5f6a7716e910dab8c94b1a598de00053f622b38bc3efbb2e3ae8b2e9effe776f |
| test/TestBase.sol | 2732 | 300be3694fb4ca9c25c8cf8cabf03b1cfdaec1e6c3eeabd69ad646cbd0297f88 |
| test/helpers/ProtocolFixture.sol | 3383 | 2c4056fe941274bd24ce56880529858fc1ac67b65bc57e0aec241b5f1d8a15ce |

Instruction sources read: default-branch/CLAUDE.md and AGENT.md. No AGENTS.md exists under the supplied workspace. The archived review was used for its recorded CI evidence and compared with source. Public-chain state and fresh remote Actions status were not independently queried by this branch-audit task.
