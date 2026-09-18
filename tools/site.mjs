/*───────────────────────────────────────────────────────────────────────────
  Deploying the site, and speaking HTTP to it.

  Two tools need this and a third will: the front-door verifier, the service
  verifier, and the gas budget. A second copy of a deployment sequence is a
  second thing to forget to update, and the specific way that goes wrong here
  is a tool that keeps passing against a wiring nobody ships.
───────────────────────────────────────────────────────────────────────────*/
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { sel, encodeAddressArg } from "./evm.mjs";
import { keccak256 } from "ethereum-cryptography/keccak.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

/*  ABI encoding for exactly the two shapes this file needs: a `string[]`
    going out, and a `(uint16,string,(string,string)[])` coming back. Both
    are laid out by hand, which is a small thing to own and a large thing to
    depend on somebody else for.                                          */
const w = (n) => BigInt(n).toString(16).padStart(64, "0");

const encStr = (s) => {
  const b = Buffer.from(s, "utf8");
  return w(b.length) + b.toString("hex").padEnd(Math.ceil(b.length / 32) * 64, "0");
};

const encStrArray = (arr) => {
  const bodies = arr.map(encStr);
  let off = arr.length * 32;
  const heads = bodies.map((b) => { const h = w(off); off += b.length / 2; return h; });
  return w(arr.length) + heads.join("") + bodies.join("");
};

/*──────────────── where Uniswap actually is ────────────────

  Every address below was probed for code over live RPC on 2026-08-19 —
  factory, SwapRouter02, QuoterV2 and the wrapped native, on each chain —
  not copied from memory. All four chains carry SwapRouter02, so every
  entry is routerKind 1: seven words, no deadline. A chain missing from
  this table deploys with NO_VENUE and the swap tab says so instead of
  failing.

  The stock-token consequence is the design, not the table: the card
  checks the pool for whatever address you paste, so a tokenized equity
  with v3 liquidity on that chain trades like anything else, and one
  without gets an honest "no pool" — there is no list here to be wrong. */
const ZERO = "0x0000000000000000000000000000000000000000";

/* LayerZero is not part of the Ethereum-only NFT architecture. These two
   records are retained only for explicit Ethereum/Sepolia RPC inspection. */
export const LAYERZERO = {
  1: { name: "Ethereum", eid: 30101, read: true, endpoint: "0x1a44076050125825900e736c501f859c50fE728c" },
};

export const canRead = (chainId) => !!(LAYERZERO[Number(chainId)] || {}).read;

/* Sepolia is a rehearsal, not another edition chain. */
export const LAYERZERO_TESTNETS = {
  11155111: { name: "Ethereum Sepolia", eid: 40161, endpoint: "0x6EDCE65403992e310A62460808c4b910D972f10f" },
};

/* No production peer exists in the Ethereum-only edition. */
export function portPeers(chainId) {
  const me = Number(chainId);
  const out = [];
  for (const id of Object.keys(BANDS).map(Number)) {
    if (id === me) continue;
    const lz = LAYERZERO[id];
    if (lz) out.push({ chainId: id, name: lz.name, eid: lz.eid });
  }
  return LAYERZERO[me] ? out : [];
}

/*───────────────────────────────────────────────────────────────────────────
  THE EDITION — 4096 tokens, all on Ethereum

  The production collection lives only on Ethereum and issues the complete
  range from #1 through #4096. There are no per-chain bands, duplicated
  production hubs or NFT bridge. Testnets may rehearse the same range, but
  they are never production members of the edition.
───────────────────────────────────────────────────────────────────────────*/
export const COLLECTION = 4096;

export const BANDS = {
  1: { name: "Ethereum", first: 1, last: 4096 },
};

/*  The one property that makes the whole design work: the bands tile the
    edition exactly once. A table that has drifted must refuse to load
    rather than deploy a collision — so this runs at import, below.

    It is a function rather than an inline block so that the suite can
    hand it a broken table and watch it refuse. A guard nothing has ever
    seen fail is a guard nobody has checked.                            */
export function assertTiles(bands, total = COLLECTION) {
  const rows = Object.values(bands).sort((a, b) => a.first - b.first);
  if (!rows.length) throw new Error("no bands at all");
  let next = 1;
  for (const b of rows) {
    if (b.last < b.first)
      throw new Error(`${b.name}'s band runs backwards: ${b.first}..${b.last}`);
    if (b.first < next)
      throw new Error(`the bands overlap: ${b.name} starts at ${b.first}, inside a band ending ${next - 1}`);
    if (b.first > next)
      throw new Error(`the bands leave a hole: nothing issues ${next}..${b.first - 1}`);
    next = b.last + 1;
  }
  if (next - 1 !== total)
    throw new Error(`the bands cover ${next - 1} of ${total} — the edition is not exhausted`);
  return true;
}

assertTiles(BANDS);

/// @notice Ethereum owns the production edition; every other chain is a rehearsal or unsupported.
export const bandFor = (chainId) => BANDS[Number(chainId)] || null;

/*  A testnet is a rehearsal, not part of the edition, so it takes the
    whole range: the point of a rehearsal is to exercise every id, and no
    token on it is ever the token it is pretending to be.               */
export const bandOrWhole = (chainId) => bandFor(chainId) || { name: "rehearsal", first: 1, last: COLLECTION };

/// @notice Retained for old tool callers; the constructor has no band words.
export const bandArgs = () => "";

/// @notice Ethereum's recorded endpoint, or null for every other production chain.
export const endpointFor = (chainId) => LAYERZERO[Number(chainId)] || null;

export const UNISWAP = {
  1: {
    name: "Ethereum",
    factory: "0x1F98431c8aD98523631AE4a59f267346ea31F984",
    quoter: "0x61fFE014bA17989E743c5F6cB21bF9697530B21e",
    router: "0x68b3465833fb72A70ecDF485E0e4C7bD8665Fc45", routerKind: 1,
    positions: "0xC36442b4a4522E871399CD717aBDD847Ab11FE88",
    wrapped: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2",
    governor: ZERO, govToken: ZERO,
    poolManager: "0x000000000004444c5dc75cB358380D2e3dE08A90",
    v4Positions: "0xbD216513d74C8cf14cf4747E6AaA6420FF64ee9e",
    ens: "0x00000000000C2E074eC69A0dFb2997BA6C7d2e1e",
    nameWrapper: "0xD4416b13d2b3a9aBae7AcD5D6C2BbDBE25686401"
  },
  11155111: {
    name: "Ethereum Sepolia",
    factory: "0x0227628f3F023bb0B980b67D528571c95c6DaC1c",
    quoter: "0xEd1f6473345F45b75F8179591dd5bA1888cf2FB3",
    router: "0x3bFA4769FB09eefC5a80d6E87c3B9C650f7Ae48E", routerKind: 1,
    positions: "0x1238536071E1c677A632429e3655c799b22cDA52",
    wrapped: "0xfFf9976782d46CC05630D1f6eBAb18b2324d6B14",
    governor: ZERO, govToken: ZERO,
    poolManager: "0xE03A1074c86CFeDd5C142C4F04F1a1536e203543",
    v4Positions: "0x429ba70129df741B2Ca2a85BC3A2a3328e5c09b4",
    ens: "0x00000000000C2E074eC69A0dFb2997BA6C7d2e1e",
    nameWrapper: "0xD4416b13d2b3a9aBae7AcD5D6C2BbDBE25686401"
  }
};

/*  The address CREATE will produce for `sender` at `nonce` — keccak of the
    two, RLP-encoded. Used to hand a page the address of a contract that
    deploys after it; the deploy asserts the prediction held, so a reordered
    pipeline fails loudly instead of wiring a page to nothing.            */
export function predictCreate(sender, nonce) {
  const a = Buffer.from(sender.replace(/^0x/, ""), "hex");
  const n = BigInt(nonce);
  let nb;
  if (n === 0n) nb = Buffer.from([0x80]);
  else if (n < 0x80n) nb = Buffer.from([Number(n)]);
  else {
    let h = n.toString(16); if (h.length % 2) h = "0" + h;
    const raw = Buffer.from(h, "hex");
    nb = Buffer.concat([Buffer.from([0x80 + raw.length]), raw]);
  }
  const payload = Buffer.concat([Buffer.from([0x80 + a.length]), a, nb]);
  const rlp = Buffer.concat([Buffer.from([0xc0 + payload.length]), payload]);
  return "0x" + Buffer.from(keccak256(rlp)).toString("hex").slice(24);
}

/** A chain with no verified deployment: every read degrades to "no venue". */
export const NO_VENUE = {
  name: "nowhere in particular",
  factory: ZERO, quoter: ZERO, router: ZERO, routerKind: 0, poolManager: ZERO,
  v4Positions: ZERO, positions: ZERO, wrapped: ZERO, governor: ZERO, govToken: ZERO
};

export const REQUEST = sel("request(string[],(string,string)[])");

export const encRequest = (resource) => {
  const res = encStrArray(resource);
  return REQUEST + w(0x40) + w(0x40 + res.length / 2) + res + w(0);
};

export const decResponse = (hex) => {
  const h = hex.replace(/^0x/, "");
  const status = Number(BigInt("0x" + h.substr(0, 64)));
  const bodyOff = Number(BigInt("0x" + h.substr(64, 64))) * 2;
  const hdrOff = Number(BigInt("0x" + h.substr(128, 64))) * 2;

  const bodyLen = Number(BigInt("0x" + h.substr(bodyOff, 64)));
  const body = Buffer.from(h.substr(bodyOff + 64, bodyLen * 2), "hex").toString("utf8");

  const n = Number(BigInt("0x" + h.substr(hdrOff, 64)));
  const headers = [];
  for (let i = 0; i < n; i++) {
    const t = hdrOff + 64 + Number(BigInt("0x" + h.substr(hdrOff + 64 + i * 64, 64))) * 2;
    const readAt = (at) => {
      const o = t + Number(BigInt("0x" + h.substr(at, 64))) * 2;
      const len = Number(BigInt("0x" + h.substr(o, 64)));
      return Buffer.from(h.substr(o + 64, len * 2), "hex").toString("utf8");
    };
    headers.push([readAt(t), readAt(t + 64)]);
  }
  return { status, body, headers };
};

/// @notice A GET against a deployed Premises, returning status/body/headers.
export const getter = (c, premises) => async (path) =>
  decResponse(await c.call(premises, encRequest(path)));


/*═══════════════════ walking a deployment backwards ═══════════════════

  `deploySite` builds a deployment; these three tables read one back. They
  live here rather than in the tool that uses them because they describe
  the same wiring from the other side, and a route table kept in a
  different file from the constructor it mirrors is a route table that
  drifts. `tools/verify-recover.mjs` holds them to the source.
════════════════════════════════════════════════════════════════════════*/

/*  The Premises' own immutables: the hub, the chrome, and one getter per
    page. Names here match the keys deploySite returns, so a recovered
    record and a freshly written one are the same file.                 */
export const PAGES = {
  pDoor: "P_DOOR()",         pToken: "P_TOKEN()",     pMarket: "P_MARKET()",
  pPool: "P_POOL()",         pServices: "P_SERVICES()", pManifest: "P_MANIFEST()",
  pTalk: "P_TALK()",         pRooms: "P_ROOMS()",     pTerminal: "P_TERMINAL()",
  pSwap: "P_SWAP()",         pGallery: "P_GALLERY()", pLaunch: "P_LAUNCH()",
  pLock: "P_LOCK()",         pHook: "P_HOOK()",       pCast: "P_CAST()",
  pSeal: "P_SEAL()",         pKeys: "P_KEYS()",       pName: "P_NAME()",
  pEstate: "P_ESTATE()",
  pConsole: "P_CONSOLE()",  pKey: "P_KEY()"
};

/*  The desks and the machinery behind them, each read from a contract that
    holds a pointer to it. Several are reachable two ways, and those are
    listed twice on purpose: two routes to one address is a free check that
    the site was assembled from a single deployment, and a disagreement is
    worth more than either answer alone.

    Getting a route wrong is quiet and expensive. `deskSeal` was first read
    from PageSeal's DESK() — but PageSeal holds the *generic* desk and never
    mentions DeskSeal at all, so the recovery cheerfully recorded the wrong
    contract under a plausible name. PageTalk is the one that holds it. A
    name that resolves is not the same as a name that resolves correctly. */
export const VIA = [
  ["desk",        "pDoor",     "DESK()"],
  ["desk",        "pSeal",     "DESK()"],
  ["desk",        "pKeys",     "DESK()"],
  ["deskTalk",    "pRooms",    "TALK()"],
  ["deskTerm",    "pTerminal", "TERM()"],
  ["deskRooms",   "pTerminal", "ROOMS()"],
  ["deskWill",    "pTerminal", "WILL()"],
  ["deskU",       "pSwap",     "DESKU()"],
  ["deskU",       "pLaunch",   "DESKU()"],
  ["deskT",       "pSwap",     "DESKT()"],
  ["deskL",       "pLaunch",   "DESKL()"],
  ["deskEstate",  "pEstate",   "ESTATE()"],
  ["deskSeal",    "pTalk",     "SEAL()"],
  ["roster",      "deskTalk",  "ROSTER()"],
  ["roster",      "deskTerm",  "ROSTER()"],
  ["venue",       "pLaunch",   "VENUE()"],
  ["kiln",        "pLaunch",   "KILN()"],
  ["kiln",        "deskTerm",  "KILN()"],
  ["locker",      "pLock",     "LOCKER()"],
  ["locker",      "deskTerm",  "LOCKER()"],
  ["nameplate",   "pName",     "PLATE()"],
  ["sigil",       "pCast",     "SIGIL()"],
  ["parley",      "pRooms",    "PARLEY()"],
  ["parley",      "deskTerm",  "PARLEY()"],
  ["pool",        "pSwap",     "POOL()"],
  ["pool",        "pGallery",  "POOL()"],
  ["succession",  "pEstate",   "SUCC()"],
  ["consign",     "pEstate",   "CONS()"],
  ["lease",       "pGallery",  "LEASE()"],
  ["lease",       "pManifest", "LEASE()"],
  ["consoleRead", "pConsole",  "READ()"],
  ["consoleSkin", "pConsole",  "SKIN()"],
  ["consoleCore", "pConsole",  "CORE()"]
];

/*  What a complete deployment contains, which is not the same question as
    what this tool can reach. Keys here that recovery misses are reported
    rather than left out: a tool that only lists what it found cannot tell
    you about the thing it never looked for, and `roster` sat missing from
    a record for exactly that reason — absent from the file, absent from
    the walk, and therefore absent from the report.

    This must match what `deploySite` returns plus the eight the collection
    deploys ahead of it — engine, sigil, renderer, reach, grip, ipseity,
    pool and lease. `tools/verify-recover.mjs` counts them rather than
    trusting this sentence.                                              */
export const EXPECTED = [
  "engine", "sigil", "renderer", "reach", "grip", "ipseity", "pool", "lease",
  "chrome", "parley", "roster", "deskRooms", "kiln", "locker", "venue",
  "nameplate", "deskU", "deskT", "deskL", "deskSeal", "pSwap", "desk",
  "deskTalk", "deskTerm", "pDoor", "pToken", "pMarket", "pPool", "pServices",
  "pManifest", "pTalk", "pRooms", "pTerminal", "pGallery", "pLaunch", "pLock",
  "pHook", "pCast", "pSeal", "pKeys", "pName", "succession", "consign",
  "deskEstate", "deskWill", "pEstate",
  "consoleSkin", "consoleCore", "consoleRead", "pConsole", "pKey", "premises"
];

/*──────────────── the deployment ────────────────*/

/**
 * Deploy Chrome, Parley, the two desks, the seven page contracts and the
 * router.
 *
 * Every page address is an immutable constructor argument of Premises, and
 * Premises is the only thing that knows all of them. Replacing a page means
 * deploying a new router and pointing a name at it, which is the property
 * that keeps the routes serving the artwork off the mutable path.
 */
export async function deploySite(c, A,
    { hub, pool, lease, sigil, parley: existingParley, uniswap = NO_VENUE }) {
  const chrome = await c.deploy(A("src/Chrome.sol", "Chrome").bytecode, "", "Chrome");

  /*  Parley is the protocol, not a page: the rooms, the back-links that
      make a conversation walkable without an indexer, and the check that a
      message signed by an address is a message the token agreed to. It
      reads the collection and nothing reads it back.                     */
  /*  The parley is the protocol, and every message ever sent is a log this
      address emitted — a redeploy of the SITE reuses it, because replacing
      it would not migrate a conversation, it would end one.             */
  const parley = existingParley ||
    await c.deploy(A("src/Parley.sol", "Parley").bytecode, encodeAddressArg(hub), "Parley");

  /*  The kiln launches (gated by holding a token), the locker keeps.
      The kiln learns the PoolManager so the Gate hooks it ships refuse
      callbacks from anywhere else.                                       */
  const kiln = await c.deploy(
    A("src/Kiln.sol", "Kiln").bytecode,
    encodeAddressArg(hub) + encodeAddressArg(uniswap.poolManager || ZERO), "Kiln");
  const locker = await c.deploy(
    A("src/Locker.sol", "Locker").bytecode, "", "Locker");

  /*  Venue takes a `Wiring` struct — a static tuple, so it encodes flat in
      declaration order with no offset word. Getting that wrong would put
      the quoter where the router goes.                                   */
  const venue = await c.deploy(
    A("src/Venue.sol", "Venue").bytecode,
    encodeAddressArg(uniswap.factory) +
    encodeAddressArg(uniswap.quoter) +
    encodeAddressArg(uniswap.router) +
    BigInt(uniswap.routerKind).toString(16).padStart(64, "0") +
    encodeAddressArg(uniswap.positions) +
    encodeAddressArg(uniswap.wrapped) +
    encodeAddressArg(uniswap.governor) +
    encodeAddressArg(uniswap.govToken) +
    encodeAddressArg(uniswap.poolManager || ZERO),
    "Venue");

  const deskU = await c.deploy(
    A("src/DeskUni.sol", "DeskUni").bytecode,
    encodeAddressArg(venue) + encodeAddressArg(pool), "DeskUni");
  const deskT = await c.deploy(A("src/DeskTrade.sol", "DeskTrade").bytecode, "", "DeskTrade");

  /*  Desk holds the application: the config block a page emits and the
      client that reads it. It knows the hub, the pool and the lease because
      the config is data about all three.                                 */
  const desk = await c.deploy(
    A("src/Desk.sol", "Desk").bytecode,
    encodeAddressArg(hub) + encodeAddressArg(pool) + encodeAddressArg(lease), "Desk");

  /*  And DeskTalk holds the client that reads a chat off a chain: the walk,
      the calldata, and the rule that nothing off the wire ever reaches the
      DOM as markup.                                                      */
  /*  A read-only companion over the archive: it answers who is in a room by
      asking the mapping directly, a window of tokens per call, so nothing
      needs replaying and nothing about Parley had to change to make
      membership visible. It can be replaced any week; the archive does not
      notice.                                                            */
  const roster = await c.deploy(
    A("src/Roster.sol", "Roster").bytecode,
    encodeAddressArg(parley) + encodeAddressArg(hub), "Roster");

  const deskTalk = await c.deploy(
    A("src/DeskTalk.sol", "DeskTalk").bytecode,
    encodeAddressArg(parley) + encodeAddressArg(hub) +
    encodeAddressArg(roster), "DeskTalk");
  const deskSeal = await c.deploy(
    A("src/DeskSeal.sol", "DeskSeal").bytecode, "", "DeskSeal");

  const pSwap = await c.deploy(
    A("src/PageSwap.sol", "PageSwap").bytecode,
    encodeAddressArg(chrome) + encodeAddressArg(pool) + encodeAddressArg(desk) +
    encodeAddressArg(deskU) + encodeAddressArg(deskT) + encodeAddressArg(venue),
    "PageSwap");

  const pToken = await c.deploy(
    A("src/PageToken.sol", "PageToken").bytecode,
    encodeAddressArg(hub) + encodeAddressArg(chrome) +
    encodeAddressArg(pool) + encodeAddressArg(lease), "PageToken");

  const pMarket = await c.deploy(
    A("src/PageMarket.sol", "PageMarket").bytecode,
    encodeAddressArg(hub) + encodeAddressArg(chrome) +
    encodeAddressArg(pool) + encodeAddressArg(desk), "PageMarket");

  const pPool = await c.deploy(
    A("src/PagePool.sol", "PagePool").bytecode,
    encodeAddressArg(hub) + encodeAddressArg(chrome) +
    encodeAddressArg(pool) + encodeAddressArg(desk), "PagePool");

  const pServices = await c.deploy(
    A("src/PageServices.sol", "PageServices").bytecode,
    encodeAddressArg(hub) + encodeAddressArg(chrome) +
    encodeAddressArg(lease) + encodeAddressArg(desk), "PageServices");


  const deskTerm = await c.deploy(
    A("src/DeskTerm.sol", "DeskTerm").bytecode,
    encodeAddressArg(hub) + encodeAddressArg(pool) + encodeAddressArg(lease) +
    encodeAddressArg(parley) + encodeAddressArg(kiln) + encodeAddressArg(locker) +
    encodeAddressArg(roster),
    "DeskTerm");

  /*  After DeskTerm, deliberately: the manifest now names the terminal
      desk so an RPC-only agent can find `config()` — the full selector
      table — without executing a page's script. A page cannot name a
      contract deployed after it.                                        */
  const pManifest = await c.deploy(
    A("src/PageManifest.sol", "PageManifest").bytecode,
    encodeAddressArg(hub) + encodeAddressArg(pool) + encodeAddressArg(lease) +
    encodeAddressArg(parley) + encodeAddressArg(kiln) +
    encodeAddressArg(locker) + encodeAddressArg(venue) + encodeAddressArg(deskTerm),
    "PageManifest");

  const deskRooms = await c.deploy(
    A("src/DeskRooms.sol", "DeskRooms").bytecode, "", "DeskRooms");

  /*  The estate. Both of these hold, or can move, somebody else's token,
      so both are plain contracts over the hub with no page privileges at
      all — every page below is one more caller. They land here rather than
      beside their page because the two pages that host a terminal compose
      the estate's words, and a word cannot be composed before it exists. */
  const succession = await c.deploy(
    A("src/Succession.sol", "Succession").bytecode,
    encodeAddressArg(hub), "Succession");

  const consign = await c.deploy(
    A("src/Consign.sol", "Consign").bytecode,
    encodeAddressArg(hub), "Consign");

  const deskWill = await c.deploy(
    A("src/DeskWill.sol", "DeskWill").bytecode,
    encodeAddressArg(succession) + encodeAddressArg(consign) + encodeAddressArg(hub),
    "DeskWill");

  const pTerminal = await c.deploy(
    A("src/PageTerminal.sol", "PageTerminal").bytecode,
    encodeAddressArg(chrome) + encodeAddressArg(desk) + encodeAddressArg(deskTerm) +
    encodeAddressArg(deskRooms) + encodeAddressArg(deskWill),
    "PageTerminal");

  const pGallery = await c.deploy(
    A("src/PageGallery.sol", "PageGallery").bytecode,
    encodeAddressArg(hub) + encodeAddressArg(chrome) + encodeAddressArg(pool) +
    encodeAddressArg(lease) + encodeAddressArg(sigil), "PageGallery");

  const deskL = await c.deploy(
    A("src/DeskLaunch.sol", "DeskLaunch").bytecode, "", "DeskLaunch");
  const pLaunch = await c.deploy(
    A("src/PageLaunch.sol", "PageLaunch").bytecode,
    encodeAddressArg(chrome) + encodeAddressArg(desk) + encodeAddressArg(deskU) +
    encodeAddressArg(deskL) + encodeAddressArg(venue) + encodeAddressArg(kiln) +
    encodeAddressArg(uniswap.v4Positions || ZERO),
    "PageLaunch");
  const pLock = await c.deploy(
    A("src/PageLock.sol", "PageLock").bytecode,
    encodeAddressArg(chrome) + encodeAddressArg(desk) + encodeAddressArg(locker),
    "PageLock");
  const pHook = await c.deploy(
    A("src/PageHook.sol", "PageHook").bytecode,
    encodeAddressArg(chrome), "PageHook");
  const pCast = await c.deploy(
    A("src/PageCast.sol", "PageCast").bytecode,
    encodeAddressArg(chrome) + encodeAddressArg(desk) + encodeAddressArg(sigil),
    "PageCast");

  const pDoor = await c.deploy(
    A("src/PageDoor.sol", "PageDoor").bytecode,
    encodeAddressArg(hub) + encodeAddressArg(chrome) + encodeAddressArg(desk) +
    encodeAddressArg(deskTalk) + encodeAddressArg(parley) +
    encodeAddressArg(deskTerm) + encodeAddressArg(deskRooms) +
    encodeAddressArg(deskWill), "PageDoor");

  const pTalk = await c.deploy(
    A("src/PageTalk.sol", "PageTalk").bytecode,
    encodeAddressArg(hub) + encodeAddressArg(chrome) + encodeAddressArg(desk) +
    encodeAddressArg(deskTalk) + encodeAddressArg(parley) +
    encodeAddressArg(deskSeal), "PageTalk");

  const pRooms = await c.deploy(
    A("src/PageRooms.sol", "PageRooms").bytecode,
    encodeAddressArg(chrome) + encodeAddressArg(desk) +
    encodeAddressArg(deskTalk) + encodeAddressArg(parley), "PageRooms");

  const pSeal = await c.deploy(
    A("src/PageSeal.sol", "PageSeal").bytecode,
    encodeAddressArg(chrome) + encodeAddressArg(desk) + encodeAddressArg(hub),
    "PageSeal");

  const pKeys = await c.deploy(
    A("src/PageKeys.sol", "PageKeys").bytecode,
    encodeAddressArg(chrome) + encodeAddressArg(desk) + encodeAddressArg(hub),
    "PageKeys");

  const deskEstate = await c.deploy(
    A("src/DeskEstate.sol", "DeskEstate").bytecode, "", "DeskEstate");

  const pEstate = await c.deploy(
    A("src/PageEstate.sol", "PageEstate").bytecode,
    encodeAddressArg(chrome) + encodeAddressArg(desk) + encodeAddressArg(deskEstate) +
    encodeAddressArg(hub) + encodeAddressArg(succession) + encodeAddressArg(consign),
    "PageEstate");

  /*  Ahead of the nameplate's prediction below, and it has to be. That
      prediction is `nonce + 2` — this deploy, the premises, then the
      resolver — and the stylesheet is loaded with a LOOP of transactions
      whose length depends on how long the stylesheet is. Anything that
      bumps the deployer's nonce by a number nobody wrote down cannot sit
      between a prediction and the thing it predicts. The guard below
      caught this the first time it was put in the wrong place.        */
  /*  The console, and its two halves.

      The skin holds ten kilobytes of stylesheet as contract code, because
      a document that has to build its own CSS every call is paying for it
      on every read forever. It is loaded raw rather than gzipped: a
      <style> has to be there before the first paint, and inflating one in
      JavaScript is a flash of unstyled console on every load.

      The reader is separate from the document for a reason that only
      shows up on the chains where things are missing — it wraps every
      satellite call, so one absent contract degrades a section instead of
      reverting the page.                                                */
  const consoleSkin = await c.deploy(
    A("src/ConsoleSkin.sol", "ConsoleSkin").bytecode, "", "ConsoleSkin");

  /*  Hex, not a Buffer: the harness takes bytes as a 0x string and says so
      rather than encoding something plausible. Sharded at 24,000 because
      EIP-170 stops a data contract at 24,575 and a stylesheet that grows
      past one shard should not need this loop rewritten.               */
  const css = fs.readFileSync(path.join(ROOT, "engine/console.css"));
  for (let i = 0; i < css.length; i += 24_000) {
    await c.exec(consoleSkin, "load(bytes)",
      ["0x" + css.subarray(i, i + 24_000).toString("hex")]);
  }
  await c.exec(consoleSkin, "freeze()", []);

  /*  The client, in one store: the core and the lanes, concatenated in that
      order because the lanes read `C.say` and `C.walkTo` off the object the
      core hangs them on. Two files on disk because they are two jobs; one
      contract because they are one script tag.                          */
  const consoleCore = await c.deploy(
    A("src/ConsoleSkin.sol", "ConsoleSkin").bytecode, "", "ConsoleCore");
  const client = Buffer.concat([
    fs.readFileSync(path.join(ROOT, "engine/console.js")),
    Buffer.from("\n"),
    fs.readFileSync(path.join(ROOT, "engine/console-lanes.js"))
  ]);
  for (let i = 0; i < client.length; i += 24_000) {
    await c.exec(consoleCore, "load(bytes)",
      ["0x" + client.subarray(i, i + 24_000).toString("hex")]);
  }
  await c.exec(consoleCore, "freeze()", []);

  const consoleRead = await c.deploy(
    A("src/ConsoleRead.sol", "ConsoleRead").bytecode,
    encodeAddressArg(hub) + encodeAddressArg(pool) + encodeAddressArg(lease),
    "ConsoleRead");

  const pConsole = await c.deploy(
    A("src/PageConsole.sol", "PageConsole").bytecode,
    encodeAddressArg(hub) + encodeAddressArg(consoleRead) + encodeAddressArg(consoleSkin) +
    encodeAddressArg(consoleCore),
    "PageConsole");

  /*  The granted key's own door — /k/<id>/<key>. Fixed-length deploy, so
      it may sit here, after the variable-length console loads and before
      the nonce prediction below.                                        */
  const pKey = await c.deploy(
    A("src/PageKey.sol", "PageKey").bytecode,
    encodeAddressArg(hub) + encodeAddressArg(chrome),
    "PageKey");

  /*  Three contracts, one cycle: the name page must know the resolver, the
      resolver must know the premises, and the premises must know the name
      page. Somebody has to be told where a contract will be before it is
      there, so the resolver's address is computed from the deployer and the
      nonce it will hold — this deploy, then the premises, then it — and
      asserted the moment it exists. A prediction that quietly missed would
      wire this page to an address with nothing at it.                    */
  const nameplateWillBe = predictCreate(c.from.toString(), (await c.nonceNow()) + 2n);

  const pName = await c.deploy(
    A("src/PageName.sol", "PageName").bytecode,
    encodeAddressArg(chrome) + encodeAddressArg(desk) +
    encodeAddressArg(nameplateWillBe) + encodeAddressArg(hub),
    "PageName");

  const premises = await c.deploy(
    A("src/Premises.sol", "Premises").bytecode,
    encodeAddressArg(hub) + encodeAddressArg(chrome) + encodeAddressArg(pDoor) +
    encodeAddressArg(pToken) + encodeAddressArg(pMarket) + encodeAddressArg(pPool) +
    encodeAddressArg(pServices) + encodeAddressArg(pManifest) +
    encodeAddressArg(pTalk) + encodeAddressArg(pRooms) +
    encodeAddressArg(pTerminal) + encodeAddressArg(pSwap) + encodeAddressArg(pGallery) +
    encodeAddressArg(pLaunch) + encodeAddressArg(pLock) + encodeAddressArg(pHook) +
    encodeAddressArg(pCast) + encodeAddressArg(pSeal) +
    encodeAddressArg(pKeys) + encodeAddressArg(pName) + encodeAddressArg(pEstate) +
    encodeAddressArg(pConsole) + encodeAddressArg(pKey),
    "Premises");

  /*  The resolver deploys on every chain so the address matches
      everywhere; where no ENS registry exists, binding refuses and says
      why. It learns the premises, so it must follow it.                */
  const nameplate = await c.deploy(
    A("src/Nameplate.sol", "Nameplate").bytecode,
    encodeAddressArg(uniswap.ens || ZERO) + encodeAddressArg(hub) +
    encodeAddressArg(premises) + encodeAddressArg(uniswap.nameWrapper || ZERO), "Nameplate");

  if (nameplate.toLowerCase() !== nameplateWillBe.toLowerCase()) {
    throw new Error(`the resolver landed at ${nameplate}, not the ${nameplateWillBe} ` +
      `the name page was given — a deploy was inserted between them`);
  }

  return {
    chrome, parley, roster, deskRooms, kiln, locker, venue, nameplate, deskU, deskT, deskL, deskSeal, pSwap, desk, deskTalk, deskTerm,
    pDoor, pToken, pMarket, pPool, pServices, pManifest, pTalk, pRooms,
    pTerminal, pGallery, pLaunch, pLock, pHook, pCast,
    pSeal, pKeys, pName, succession, consign, deskEstate, deskWill, pEstate,
    consoleSkin, consoleCore, consoleRead, pConsole, pKey, premises
  };
}
