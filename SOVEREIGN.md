# Sovereign IPSEITY

The sovereign collection carries its complete interactive interface in the
collection contract. `engine/sovereign.html` is a spacious retro-crypto control
surface for the NFT-native vault, market, time locks, automatic matured sales,
external launch execution, social speech, memories, estate and raw terminal.

At deployment the interface is gzip-compressed and written to the collection
contract's own storage. `document()` returns a self-contained loader containing
those bytes. The loader uses browser-standard `DecompressionStream("gzip")` and
fetches no scripts, images, fonts, APIs, or IPSEITY service contracts.

The market confluence can atomically swap output into a time lock. If the holder
opts into auto-sell, any caller may execute the matured instruction against the
same NFT-native market; proceeds are credited to that NFT's liquid ledger. This
is permissionless execution after a holder-defined time and minimum output, not
a server cron job.

The launchpad routes reviewed calldata through `executeAsToken`. A launched
ERC-20 or Uniswap hook necessarily has its own external address, while the
intent, authority and funding originate at the NFT contract.

Two hashes are recorded in `deployments/sovereign-eth-sepolia.json`:

- `websiteSha256` commits to the recovered interface;
- `websiteStoredSha256` commits to its gzip storage representation.

Run `node tools/verify-sovereign-artwork.mjs` to read `document()` from
Sepolia, recover the gzip payload, and byte-compare it with the repository UI.
Use each token's `browserGateway` URL in Brave; `live` is its canonical
`web3://` form.
