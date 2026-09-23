// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {LibNum} from "./lib/LibNum.sol";

/*───────────────────────────────────────────────────────────────────────────
  Chrome — the parts of the site that are the same on every page

  Five contracts render pages, and EIP-170 is why there are five rather than
  one. Left to themselves each would carry its own copy of the stylesheet
  and its own copy of the wallet client, which wastes the bytes twice over:
  once in code size, and once when the copies drift and the site stops
  looking like one site. So the shell lives here and the pages call it.

  The application itself lives in `Desk.sol`, which outgrew this contract
  the moment the pages stopped being reference sheets and started being
  something a person could use. This holds what every page looks like: the
  stylesheet, the navigation, and the footer.
───────────────────────────────────────────────────────────────────────────*/
contract Chrome {
    using LibNum for uint256;

    /*═══════════════════ the shell ═══════════════════*/

    function head(string memory title) external pure returns (string memory) {
        return string.concat(
            "<!doctype html><meta charset=utf-8>"
            "<meta name=viewport content=\"width=device-width,initial-scale=1\">"
            "<title>", title, "</title><style>", CSS, "</style>"
        );
    }

    /*  the exchange card. One column, wide fields, the button doing the
            talking — the shape every exchange on the web has converged on,
            because it is the one where a person can see what they are about
            to sign without reading a paragraph first.                     */
    /*  the fee-tier row on the Uniswap card: which pools exist for this
            pair, and which one the quote came through                     */
    /*  the chart: bars drawn from the pool's own oracle, no canvas and
            no library — a div per observation, height as a percentage      */
    /*  the conversation. Every string in here arrived from a log and is
            written with textContent, so this sheet is styling text and
            nothing else — there is no markup from a stranger to contain. */
    /*  The gate is a courtesy, not a secret: everything behind it is
            public data on a public chain. What ownership actually gates is
            writing, and that is gated by the contract.                    */
    /*  the wallet picker. One overlay, one card, one button per wallet
            that announced itself — because three extensions racing to be
            first is not a choice anybody made.                            */
    /*  the terminal: a scrollback and a line. The input is styled as the
            place where things happen, because it is.                      */
    /*  the gallery grid: the stills are the page                      */
    /*  coins                                                          */
    /*  the lore: explanation folds itself behind a small star. Hover
            reads it, a click pins it, and with JavaScript off every word
            is simply on the page — the chip script never ran.            */
    /*  the fourth dimension, cut by the door                          */
    /*  the projector's studio                                         */
    /*  the bars: a launch and a lock are both dragged before they are
            typed                                                          */
    /* Packet Garden. No fetched fonts, image assets or runtime skin. */
    string internal constant CSS =
        ":root{color-scheme:dark;--bg:#130f25;--panel:#1c1731;--ink:#f4edff;--muted:#b6abc9;--line:#57426f;--orchid:#d0a6ff;--cyan:#67e8f9;--coral:#ff75af}"
        "*{box-sizing:border-box}"
        "body{background:radial-gradient(ellipse at 50% 0,#39245055,transparent 65%),var(--bg);color:var(--ink);font:16px/1.7 ui-sans-serif,system-ui,sans-serif;max-width:76rem;margin:auto;padding:1rem 2rem 5rem;overflow-wrap:anywhere}"
        "h1{font:400 clamp(2.4rem,5vw,4rem)/1.12 Georgia,serif;letter-spacing:-.03em;text-align:center;margin:2rem 0 1rem;color:var(--ink)}"
        "h2{font:13px ui-monospace,monospace;letter-spacing:.14em;text-transform:uppercase;color:var(--orchid);margin:2.5rem 0 1rem}"
        "h3{font:400 24px Georgia,serif;margin:1.6rem 0 .5rem}"
        "a{color:var(--cyan);text-underline-offset:4px}"
        ".b{color:var(--muted);text-decoration:none}"
        ".e,.m{color:var(--muted);font-size:14px}"
        ".m{display:block;font-size:12px}"
        ".w{color:#ffc46b}"
        ".ok,.asme{color:#94e2b5}"
        ".no{color:#ff8e9d}"
        "code{font:12px/1.6 ui-monospace,monospace;color:var(--muted);overflow-wrap:anywhere}"
        "::selection{background:var(--cyan);color:var(--bg)}"
        ":focus-visible{outline:2px solid var(--cyan);outline-offset:4px}"
        "dl{display:grid;grid-template-columns:9.5rem minmax(0,1fr);gap:.5rem 1rem;margin:1.5rem 0}"
        "dt{color:var(--muted);font:12px ui-monospace;text-transform:uppercase}"
        "dd{margin:0}"
        "ul.r{list-style:none;padding:0;display:grid;grid-template-columns:repeat(auto-fill,minmax(11rem,1fr));gap:.6rem}"
        "ul.r li,.card,.gcell,.gate{border:1px solid var(--line);border-radius:4px;padding:1rem;background:var(--panel)}"
        ".card,.gate{margin:1rem 0}"
        ".card h3{margin-top:0}"
        "iframe,img{width:100%;max-width:38rem;aspect-ratio:1;border:1px solid var(--line);border-radius:4px;background:var(--bg);display:block}"
        "table{border-collapse:collapse;width:100%;font-size:14px;margin:1rem 0}"
        "th{text-align:left;color:var(--muted);font:12px ui-monospace;text-transform:uppercase}"
        "td,th{padding:.5rem .6rem .5rem 0}"
        "td{border-top:1px solid var(--line)}"
        "nav{display:flex;flex-wrap:wrap;justify-content:center;gap:1rem;margin:0 0 2rem}"
        "nav a{font:13px ui-monospace,monospace;text-decoration:none;color:var(--muted);padding:.6rem .2rem;border-bottom:1px solid transparent}"
        "nav a:hover{color:var(--cyan)}"
        "nav a.on{color:var(--coral);border-color:var(--coral)}"
        ".constellation{position:sticky;top:0;z-index:9;align-items:center;background:#130f25f5;padding:.7rem 1rem;border:1px solid #82639e;border-radius:4px}"
        ".constellation .mark{font:700 25px Georgia,serif;letter-spacing:.03em;color:var(--orchid);text-shadow:2px 2px #67e8f94d}"
        ".mark:before{content:'\\2723';color:var(--cyan);margin-right:12px}"
        ".main{display:flex;flex:1;justify-content:center;gap:1rem}"
        ".constellation summary{cursor:pointer;display:grid;place-items:center;min-height:44px;font:13px ui-monospace;color:var(--orchid)}"
        ".more{position:absolute;right:0;display:grid;background:var(--panel);border:1px solid #82639e;padding:.6rem 1rem;min-width:180px;box-shadow:0 20px 60px #0008}"
        ".more a{min-height:44px}"
        ".oracle{text-align:center;margin:2rem 0}"
        ".eyebrow{font:12px/1.7 ui-monospace;letter-spacing:.12em;text-transform:uppercase;color:var(--orchid)}"
        ".oracle p{max-width:36rem;margin:auto;color:var(--muted)}"
        "input,select,textarea{background:var(--bg);border:1px solid var(--line);border-radius:3px;color:var(--ink);font:16px/1.5 ui-monospace,monospace;padding:.65rem .75rem;width:100%;min-height:44px}"
        "input{max-width:22rem}"
        "input::placeholder,textarea::placeholder{color:#aa9bbe}"
        "select{margin-top:.2rem}"
        "textarea{min-height:5rem;resize:vertical;margin-top:.6rem}"
        "label{display:block;color:var(--muted);font:12px/1.6 ui-monospace;margin:.8rem 0 .3rem}"
        "button,.g{background:transparent;border:1px solid #82639e;border-radius:3px;color:var(--cyan);font:13px/1.5 ui-monospace,monospace;padding:.65rem 1rem;cursor:pointer;margin:.8rem .4rem 0 0;min-height:44px;text-decoration:none}"
        "button:hover,.g:hover{background:#67e8f910;border-color:var(--cyan)}"
        "button:disabled{color:var(--muted);cursor:not-allowed}"
        ".g{display:inline-block;margin:0 .4rem .6rem 0}"
        "#s{margin-top:1rem;font:13px/1.7 ui-monospace;color:var(--muted);overflow-wrap:anywhere;min-height:1.2em}"
        ".app{max-width:34rem;margin:0 auto;border:1px solid #82639e;border-radius:4px;padding:1.4rem;background:var(--panel);box-shadow:0 0 0 5px #d0a6ff06}"
        ".hd{display:flex;align-items:center;justify-content:space-between;gap:1rem;border-bottom:1px dashed #82639e;padding-bottom:.8rem;margin-bottom:1rem}"
        ".hd b{font:14px ui-monospace;color:var(--cyan)}"
        ".ico,.mx,.lore{background:none;border:0;margin:0;padding:.3rem;color:var(--muted);font-size:12px;letter-spacing:0}"
        ".ico:hover,.mx:hover,.lore:hover{color:var(--cyan);background:none}"
        ".fld{background:var(--bg);border:1px solid var(--line);border-radius:4px;padding:1.1rem;margin:.4rem 0}"
        ".fld:focus-within{border-color:var(--cyan)}"
        ".lbl{display:flex;justify-content:space-between;gap:1rem;color:var(--muted);font-size:13px;margin-bottom:.5rem}"
        ".row{display:flex;align-items:center;gap:.6rem}"
        ".row input{background:none;border:0;padding:0;font:400 1.7rem/1.2 ui-sans-serif,system-ui,sans-serif;max-width:none;flex:1;min-width:0}"
        ".tk{background:var(--panel);border:1px solid var(--line);border-radius:3px;padding:.45rem .7rem;font-size:14px;color:var(--ink);white-space:nowrap;max-width:9rem;overflow:hidden;text-overflow:ellipsis}"
        ".mx{color:var(--cyan)}"
        ".flip{display:block;margin:-.7rem auto;position:relative;z-index:1;width:44px;height:44px;padding:0;background:var(--panel);line-height:1}"
        ".det{margin:.8rem .2rem;font-size:14px;color:var(--muted)}"
        ".det div{display:flex;justify-content:space-between;padding:.35rem 0;gap:1rem}"
        ".det b{font-weight:400;color:var(--ink);text-align:right}"
        ".go{width:100%;margin:1rem 0 0;padding:.9rem;background:var(--coral);border-color:var(--coral);color:var(--bg);font-weight:600;font-size:14px}"
        ".go:hover:not(:disabled){background:#ffa5c9;color:var(--bg);border-color:#ffa5c9}"
        ".go:disabled{background:var(--bg);border-color:var(--line);color:var(--muted)}"
        ".set{background:var(--bg);border:1px solid var(--line);border-radius:4px;padding:1rem;margin-bottom:.6rem;font-size:14px}"
        ".set button{margin:.4rem .3rem 0 0;padding:.4rem .6rem;font-size:12px}"
        ".set input{width:5rem;display:inline-block;margin-top:.4rem}"
        ".tabs{display:flex;flex-wrap:wrap;gap:.5rem;justify-content:center;margin:1rem 0 1.4rem}"
        ".tabs a{display:flex;align-items:center;min-height:44px;font:13px ui-monospace;text-decoration:none;color:var(--muted);padding:.5rem .8rem;border-radius:3px;border:1px solid transparent}"
        ".tabs a.on{border-color:#82639e;background:var(--panel);color:var(--orchid)}"
        ".tr,.chip{margin:.25rem .3rem .25rem 0;padding:.4rem .7rem;font-size:12px}"
        ".tr.on,.chip.on{background:#d0a6ff14;border-color:var(--orchid);color:var(--orchid)}"
        ".ch{display:flex;align-items:flex-end;gap:2px;height:9rem;margin:1rem 0;border-bottom:1px solid var(--line);padding-bottom:2px}"
        ".ch i{flex:1;background:#49365f;border-top:1px solid var(--cyan);min-height:1px}"
        ".ch i:hover{background:var(--orchid)}"
        ".two{display:grid;grid-template-columns:1fr 1fr;gap:.8rem}"
        "#log{max-height:34rem;overflow-y:auto;border:1px solid var(--line);border-radius:4px;padding:1rem 1.4rem;background:var(--panel)}"
        ".msg{display:grid;grid-template-columns:auto auto 1fr;gap:0 .6rem;align-items:baseline;padding:1rem 0;border-top:1px dashed var(--line)}"
        ".msg:first-child{border-top:0}"
        ".msg b{font:13px ui-monospace;color:var(--orchid)}"
        ".msg.me b{color:#94e2b5}"
        ".msg .at{color:var(--muted);font-size:12px;text-align:right}"
        ".msg p{grid-column:1/-1;margin:.3rem 0 0;white-space:pre-wrap;overflow-wrap:anywhere}"
        ".msg .sealed{color:var(--muted);font-style:italic}"
        ".dmlink{font:12px ui-monospace;color:var(--cyan)}"
        ".room{display:flex;justify-content:space-between;align-items:baseline;gap:1rem;border:1px solid var(--line);border-radius:4px;padding:.8rem 1rem;margin:.5rem 0;cursor:pointer}"
        ".room:hover,.room:focus{border-color:var(--orchid);background:var(--panel)}"
        ".room b{font-weight:500;color:var(--ink)}"
        "body.held .gate,body:not(.held) .only{display:none}"
        ".asme{font:13px ui-monospace}"
        ".wals{position:fixed;inset:0;background:#130f25dd;display:grid;place-items:center;z-index:60}"
        ".walc{background:var(--panel);border:1px solid #82639e;border-radius:4px;padding:1.4rem;max-width:24rem;width:92%}"
        ".walb{display:flex;align-items:center;gap:.6rem;width:100%;margin:.6rem 0 0;padding:.7rem;background:var(--bg);font-size:14px}"
        ".walb img{width:24px;height:24px}"
        ".acct{cursor:pointer;text-decoration:underline dotted}"
        ".term{background:var(--bg);border:1px solid var(--line);border-radius:4px;padding:1rem;height:24rem;overflow-y:auto;font:13px/1.7 ui-monospace;margin:1rem 0 .6rem}"
        ".tl{white-space:pre-wrap;overflow-wrap:anywhere}"
        ".tl.in{color:var(--cyan)}"
        ".tinput{max-width:100%}"
        ".gal{display:grid;grid-template-columns:repeat(auto-fill,minmax(10rem,1fr));gap:1rem;margin:1.5rem 0}"
        ".gcell{text-decoration:none;color:inherit;padding:12px}"
        ".gcell:hover{border-color:var(--orchid)}"
        ".gcell img{border:0}"
        ".gid{display:block;font:14px ui-monospace;color:var(--orchid);margin-top:.5rem}"
        ".gname{display:block;font-size:14px}"
        ".gtags{display:block;margin-top:.3rem;min-height:1em}"
        ".gtags i{font-style:normal;font-size:12px;color:var(--muted);margin-right:.5rem}"
        ".gtags i.ok{color:#94e2b5}"
        ".gtags i.w{color:#ffc46b}"
        ".coinaddr{font-size:13px}"
        ".lore{cursor:help}"
        "p.e.hush{display:none}"
        "p.e.hush.shown{display:block;border:1px solid var(--line);border-radius:4px;padding:1rem;background:var(--panel);margin:.4rem 0 1rem}"
        ".tess4{display:flex;flex-direction:column;align-items:center;margin:.6rem 0}"
        ".tess4 canvas{width:min(30rem,88vw);height:auto;background:none;border:0;max-width:none;aspect-ratio:1;cursor:crosshair}"
        ".tdoor{min-height:6.5rem;max-height:11rem;overflow-y:auto}"
        ".tess4 p{min-height:1.1em;font-size:12px;color:var(--orchid)}"
        ".cast{display:grid;grid-template-columns:minmax(0,1.15fr) minmax(0,1fr);gap:2rem;align-items:start;margin:1.4rem 0}"
        "#stage{margin:0;border:1px solid var(--line);border-radius:4px;overflow:hidden;background:var(--panel)}"
        "#stage svg{display:block;width:100%;height:auto;border:0;background:none;max-width:none}"
        ".deck label{margin:.9rem 0 .2rem}"
        "input[type=range]{width:100%;accent-color:var(--cyan);background:transparent;border:0;padding:0;margin:.4rem 0;min-height:32px}"
        "input[type=checkbox]{width:auto;min-height:0}"
        "@media(max-width:52rem){.cast{grid-template-columns:1fr}"
        "@media(max-width:760px){body{padding:10px 14px 3rem}"
        ".constellation{gap:.4rem;padding:.5rem}"
        ".constellation .mark{font-size:22px;margin-right:auto}"
        ".main{order:3;flex-basis:100%;overflow-x:auto;justify-content:flex-start;gap:1.2rem}"
        ".main a{white-space:nowrap}"
        ".app{padding:1rem}"
        "dl{grid-template-columns:minmax(0,1fr)}"
        "dt{margin-top:.7rem}"
        "@media(max-width:30rem){.two{grid-template-columns:1fr}"
        "@media(prefers-reduced-motion:reduce){*{transition:none!important;scroll-behavior:auto!important}";

    /*═══════════════════ the wallet, chosen ═══════════════════*/

    /// @notice The one script every connected page loads first. EIP-6963
    ///         exists so a person with three wallet extensions gets to say
    ///         which one speaks for them; taking the first announcement
    ///         defeats the standard — Phantom and Keplr race to announce,
    ///         and MetaMask loses the sprint on every page load. Every
    ///         announcer is kept, keyed by rdns. A passive read may use any
    ///         provider, but Desk chooses one before a read can determine a
    ///         transaction: otherwise one wallet could supply the terms and
    ///         another could be asked to sign them. The signing identity is
    ///         chosen by the stored choice, by being the only wallet, or by
    ///         the person, from a picker. Clicking your own address clears
    ///         the choice and asks again.
    function wallet() external pure returns (string memory) {
        return string.concat("<script>", WALLET_JS, "</script>");
    }

    string internal constant WALLET_JS =
        "window.IPW=(()=>{"
        "const P=new Map();"
        "addEventListener('eip6963:announceProvider',e=>{const d=e.detail;"
        "if(d&&d.info&&d.info.rdns&&d.provider)P.set(d.info.rdns,d)});"
        "dispatchEvent(new Event('eip6963:requestProvider'));"
        "let CHO=null;"
        "const save=()=>{try{return localStorage.getItem('ipse.wallet')}catch(e){return null}};"
        "const keep=r=>{try{localStorage.setItem('ipse.wallet',r)}catch(e){}};"
        "const drop=()=>{try{localStorage.removeItem('ipse.wallet')}catch(e){};CHO=null};"
        "const pick=()=>{if(CHO)return CHO;const s=save();"
        "if(s&&P.has(s))return CHO=P.get(s);"
        "if(P.size===1)return CHO=P.values().next().value;return null};"
        "const pv=()=>{const d=pick();if(d)return d.provider;"
        "return P.size?P.values().next().value.provider:window.ethereum};"
        "const nm=()=>{const d=pick();return(d&&d.info.name)||'injected wallet'};"
        /*  Names and icons come from extensions: the name goes in through
            textContent, the icon only if it is a data: image, which is what
            the standard says it is.                                       */
        "const ask=()=>new Promise(res=>{"
        "const o=document.createElement('div');o.className='wals';"
        "const c=document.createElement('div');c.className='walc';"
        "const h=document.createElement('p');h.className='k';"
        "h.textContent='which wallet speaks for you?';c.append(h);"
        "for(const d of P.values()){const b=document.createElement('button');"
        "b.type='button';b.className='walb';"
        "const i=document.createElement('img');const ic=String(d.info.icon||'');"
        "if(ic.startsWith('data:image/'))i.src=ic;i.alt='';"
        "const t=document.createElement('span');t.textContent=d.info.name||d.info.rdns;"
        "b.append(i,t);b.addEventListener('click',()=>{o.remove();res(d)});c.append(b)}"
        "const n=document.createElement('p');n.className='e';"
        "n.textContent='Your choice is remembered on this site. Click your address later to switch wallets.';"
        "c.append(n);o.addEventListener('click',e=>{if(e.target===o){o.remove();res(null)}});"
        "document.body.append(o)});"
        "const choose=async()=>{let d=pick();"
        "if(!d&&P.size>1){d=await ask();if(!d)throw new Error('no wallet chosen');}"
        "if(d){CHO=d;keep(d.info.rdns);return d.provider}"
        "return window.ethereum};"
        "return{pv:pv,nm:nm,pick:pick,ask:ask,choose:choose,keep:keep,drop:drop,"
        "all:()=>[...P.values()]}"
        "})();";

    /*═══════════════════ navigation ═══════════════════*/

    /// @dev `here` is an index into the same order the links are written in,
    ///      so the current page is not a link to itself. 255 means none.
    function nav(uint256 id, uint8 here) external pure returns (string memory) {
        string memory t = id.str();
        return string.concat(
            "<nav>",
            _tab("/", "index", here == 0),
            _tab(string.concat("/token/", t), "token", here == 1),
            _tab(string.concat("/token/", t, "/live"), "instrument", here == 2),
            _tab(string.concat("/token/", t, "/market"), "market", here == 3),
            _tab(string.concat("/token/", t, "/rent"), "rent", here == 4),
            _tab(string.concat("/token/", t, "/vault"), "vault", here == 5),
            _tab(string.concat("/dm/", t), "message", here == 18),
            _tab(string.concat("/token/", t, "/services.json"), "json", here == 6),
            "</nav>"
        );
    }

    /// @dev The counter's own tabs, under the site nav: the four things a
    ///      token will do, in the order a person meets them.
    function tabs(string memory t, uint8 here) external pure returns (string memory) {
        return string.concat(
            "<div class=tabs>",
            _tab(string.concat("/token/", t, "/market"), "swap", here == 0),
            _tab(string.concat("/token/", t, "/pool"), "pool", here == 1),
            _tab(string.concat("/token/", t, "/rent"), "rent", here == 2),
            _tab(string.concat("/token/", t, "/vault"), "vault", here == 3),
            "</div>"
        );
    }

    /// @dev The tabs are the site's whole thesis in one row: the door in,
    ///      the terminal that does everything, the swap against the chain's
    ///      own Uniswap, the launchpad, the vault, the social layer, and the
    ///      collection. `here` codes: 0 door · 20 terminal · 9 swap ·
    ///      15 launch · 18 lock · 16 social · 22 market · 6 json.
    function navTop(uint8 here) external pure returns (string memory) {
        return string.concat(
            "<nav class=constellation><a class=mark href=\"/\">IPSEITY</a><div class=main>",
            _tab("/door", "home", here == 0),
            _tab("/swap", "trade", here == 9),
            _tab("/launch", "create", here == 15),
            _tab("/lock", "time-lock", here == 18),
            _tab("/chat", "messages", here == 16),
            _tab("/gallery", "explore", here == 22),
            "</div><details><summary>more +</summary><div class=more>",
            _tab("/", "instrument", here == 30),
            _tab("/modules", "modules", false),
            _tab("/terminal", "terminal", here == 20),
            _tab("/projector", "projector", here == 17),
            _tab("/name", "name", here == 12),
            _tab("/keys", "keys", here == 13),
            _tab("/seal", "seal", here == 14),
            _tab("/estate", "estate", here == 19),
            _tab("/services.json", "manifest", here == 6),
            "</div></details>",
            "</nav>"
        );
    }

    function _tab(string memory href, string memory label, bool on)
        private pure returns (string memory)
    {
        return string.concat(
            "<a", on ? " class=on" : "", " href=\"", href, "\">", label, "</a>"
        );
    }

    /*═══════════════════ the footer, and the client ═══════════════════*/

    function foot(address premises, uint256 chainId) external pure returns (string memory) {
        return string.concat(
            "<h2>about this page</h2>"
            "<p class=e>An ERC-5219 contract at <code>", LibNum.hexAddr(premises),
            "</code> on chain <code>", chainId.str(),
            "</code>, reached over <code>web3://</code> with no DNS and no server. "
            "It holds none of the artwork: every token renders identically whether "
            "this contract exists, is abandoned, or is replaced. Every transaction "
            "offered here is built on chain &mdash; the selector in each "
            "<code>data-call</code> came out of a contract, not out of this page's "
            "JavaScript, and you can check it against the ABI yourself.</p>"
            "<div id=s></div>"
            /*  Explanatory p.e paragraphs fold behind a star, but warnings
                remain visible. With scripts off, nothing hides — the chips
                simply never appear, and the page reads as written.       */
            "<script>(()=>{const l=document.querySelectorAll('p.e:not(.w)');"
            "const ps=l&&l.forEach?l:[];"
            "ps.forEach(p=>{if(!p.parentNode||!p.classList)return;"
            "const c=document.createElement('button');c.className='lore';"
            "c.textContent='\u2726';c.title='read';"
            "c.setAttribute&&c.setAttribute('aria-expanded','false');"
            "p.parentNode.insertBefore(c,p);p.classList.add('hush');"
            "const show=v=>{p.classList.toggle('shown',!!v);"
            "c.setAttribute&&c.setAttribute('aria-expanded',String(!!v))};"
            "c.addEventListener('mouseenter',()=>show(true));"
            "c.addEventListener('mouseleave',()=>{if(!c.pin)show(false)});"
            "c.addEventListener('click',()=>{c.pin=!c.pin;show(c.pin)})})})()</script>"
        );
    }

}
