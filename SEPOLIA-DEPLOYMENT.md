# Deploy the integrated IPSEITY and mint three on Ethereum Sepolia

This procedure deploys the original IPSEITY collection and complete website,
then its immutable module, state, cartridge and workbench companions. It mints
exactly three IPSEITY NFTs directly to
`0xb88Fbf05268802100E5E55ADBa211d6453aF8b5b`.

The public chain is **Ethereum Sepolia, chain ID 11155111**. The recipient is
fixed for this authorized deployment. This does not deploy to Ethereum mainnet
or Base Sepolia, and it does not alter the historical deployments recorded in
`deployments/eth-sepolia.json` or `deployments/base-sepolia.json`.

## Signing configuration

In this repository's **Settings → Secrets and variables → Actions**, configure:

| Repository secret | Value supplied by the operator |
|---|---|
| `SEPOLIA_RPC_URL` (optional) | Your HTTPS Sepolia JSON-RPC endpoint; otherwise the workflow uses the public endpoint recorded by the original project, `https://ethereum-sepolia-rpc.publicnode.com` |
| `SEPOLIA_DEPLOYER_PRIVATE_KEY` | The funded testnet deployer's private key, entered directly in GitHub's encrypted secret field |

Do not put a key in source files, an issue, a workflow input, or deployment
records. The runner derives only its public deployer address for reporting.
Hardhat's published development keys are refused for public deployment.

The workflow calculates a funding requirement from the live network fee and
the complete deployment budget, including both the raw and compressed
workbench archives. It refuses insufficient funds before sending a transaction.
The three NFTs are issued with `mintTo(recipient)`, so the recipient owns them
from their mint transactions; no recipient signing key is required.
The collection curator and Pool administrator remain the deployer.

## Run the deployment

Open **Actions → Deploy IPSEITY and mint three on Sepolia → Run workflow**.
Use the `main` branch. Choose `preflight` for read-only checks, or `deploy` to
deploy and mint the three NFTs.

Ordinary pushes only run credential checks and read-only preflight. Public
transactions require an explicit manual `deploy` run. A missing secret stops
a manual run before any public transaction.

Keep the workflow open until it finishes. Its artifact
`sepolia-deployment-<run-id>` contains the new deployment record and transaction
journal, including partial receipts if a later step fails. Successful ownership
verification requires all three `ownerOf` calls to equal the specified recipient.

**Do not use “Re-run jobs” on a deployment.** The workflow refuses that action
because a previous attempt may already have mined transactions. Inspect the
journal and chain receipts first. Starting a separate manual deployment creates
a new collection; it is not a recovery operation for an earlier collection.

## Run from a configured deployment environment

The equivalent command uses environment variables supplied by a secret manager
or the operator's local shell; no secret value belongs in a committed command:

```sh
npm ci
npm run build
npm run modules:build
node tools/deploy-sepolia.mjs --preflight
node tools/deploy-sepolia.mjs
```

Required environment names are `RPC_URL` and `PRIVATE_KEY`. Optional output
locations are `DEPLOYMENT_OUTPUT` and `DEPLOYMENT_JOURNAL`; the workflow uses
`out/sepolia-deployment.json` and `out/sepolia-deployment.jsonl`. Existing output
or journal files are refused to prevent an accidental fresh run from replacing
the record of a partial deployment.

The deployment script intentionally does not execute the demo conversation,
group membership or other fixture actions in `tools/testnet.mjs`. It does not
mint additional cartridge NFTs or grant module sessions on the recipient's
behalf. Installing a module and publishing its personal state remain actions
for the recipient through the NFT's canonical Reach.

## Current status

The complete local rehearsal passed all five deployment tests: 124 transactions,
384,732,031 gas, and exactly three independently seeded tokens owned by the
specified recipient. This used a disposable local chain, not public Sepolia.

Adding this workflow is preparation, not evidence of a public deployment.
The authoritative result is the completed deployment record together with
mined Sepolia receipts and read-back ownership. Historical deployment records
and local rehearsal addresses are not proof that this new deployment occurred.
