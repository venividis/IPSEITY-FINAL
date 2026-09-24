#!/usr/bin/env node
/* A shareable offline study built from the actual instrument's renderer.
 * Stop before THE CHAIN: this document contains no RPC, wallet, ABI coder,
 * signing, navigation or transaction client. Its state is a named fixture.
 * Rebuilding it carries shader and interaction improvements into the study
 * without maintaining a second implementation of the artwork.
 */
import fs from 'node:fs';
import path from 'node:path';
const root=path.resolve(import.meta.dirname,'..');
const source=fs.readFileSync(path.join(root,'engine/ipseity.html'),'utf8');
const begin=source.indexOf('"use strict";');
const end=source.lastIndexOf('/*',source.indexOf('  7 · THE CHAIN'));
if(begin<0||end<=begin)throw Error('Instrument extraction markers changed');
const code=source.slice(begin,end);
if(/\bfetch\s*\(|eth_sendTransaction|personal_sign|ethereum\.request/.test(code))throw Error('The study must contain only the renderer');
const state={id:1,seed:'0x'+'33'.repeat(32),form:2,hue:151,
  rot:[4381,19818,0,10013,3233,24511],w:34768,ops:17,open:4095};
const head=source.slice(0,source.indexOf('</head>')).replace('<title>IPSEITY</title>','<title>Packet Garden · Living crystal</title>');
const html=head+`
<style>
:root{--left:16px;--right:16px;--ftop:96px;--fbottom:170px}
body{min-height:480px}#study-title{position:fixed;top:22px;left:28px;right:28px;display:flex;justify-content:space-between;align-items:center;gap:20px}
#study-title h1{font:30px Georgia,serif;color:var(--orchid);margin:0}
#study-title p{font:10px var(--mono);letter-spacing:.13em;color:var(--mid);margin:8px 0 0}
#study-title a{font:12px var(--mono);color:var(--a)}
#dock{bottom:16px}#tick{bottom:calc(var(--fbottom) + 10px)}#garden-view-note{bottom:58px}
#study-options{display:flex;gap:16px;align-items:center;margin-bottom:10px;font:11px var(--mono);color:var(--mid)}
#study-options label{display:flex;align-items:center;gap:9px}#study-options select{font:12px var(--mono);min-height:34px;padding:6px;background:var(--void);color:var(--lit);border:1px solid var(--rule-3)}
#study-options input{width:120px;accent-color:var(--a)}#v-form{margin-left:auto;color:var(--orchid)}
#planes{display:none}#wrow{height:34px}#fatal{background:var(--void)}
@media(max-width:600px){:root{--left:10px;--right:10px;--ftop:106px;--fbottom:165px}#study-title{left:20px;right:20px;top:18px}#study-title h1{font-size:25px}#study-title a{display:none}#study-options{flex-wrap:wrap;gap:8px}#v-form{display:none}#study-options input{width:80px}#dock{bottom:10px}#tick{font-size:10px}}
@media(max-width:480px) and (max-height:360px){#garden-motion{display:flex}#garden-view-note{display:block}}
</style>
<script>window.IPSE=${JSON.stringify(state)}</script></head>
<body class="up">
<header id="study-title"><div><h1>Packet Garden / Living crystal</h1><p>LOCAL RENDER STUDY · DRAG TO ORBIT · SCROLL TO ZOOM</p></div><a href="https://github.com/venividis/IPSEITY-FINAL">IPSEITY ↗</a></header>
<main id="garden-field" aria-label="Interactive three-dimensional section of a four-dimensional solid">
<canvas id="field" aria-label="Drag to orbit the crystal. Use the buttons for 3D orbit or 4D flow."></canvas>
<div id="garden-motion" role="group" aria-label="Artwork viewing controls">
<button id="garden-orbit" type="button" aria-pressed="true">3D orbit</button><button id="garden-flow" type="button" aria-pressed="false">4D flow</button><button id="garden-play" type="button">Pause</button><button id="garden-reset" type="button">Reset view</button></div>
<div id="garden-view-note" role="status">LIVE CRYSTAL / DRAG TO EXPLORE</div>
<button id="garden-labels" type="button" aria-pressed="false">Node labels</button>
<svg id="wires" aria-hidden="true"></svg><div id="nodes"></div><div id="nest"></div>
</main>
<div id="tick" role="status" aria-live="polite">A three-dimensional section of a four-dimensional solid. Turn through w to see it change.</div>
<div id="dock">
<div id="study-options"><label>Solid <select id="study-form"><option value="2">24-cell</option><option value="1">16-cell</option><option value="0">Tesseract</option><option value="3">Duocylinder</option><option value="4">Clifford torus</option><option value="5">Tiger</option><option value="6">Ditorus</option><option value="7">Quaternion Julia</option></select></label><label>Color <input id="study-hue" type="range" min="0" max="255" value="151"></label><span id="v-form"></span></div>
<div id="planes"></div><div id="wrow"><span class="k">Section w</span><div id="wtrack" role="slider" tabindex="0" aria-label="Section along the fourth axis" aria-valuemin="-1.6" aria-valuemax="1.6" aria-valuenow="0"><div id="wticks"></div><div id="whead"></div></div><span id="wval" class="n"></span><button id="wauto" type="button">Drift</button></div>
</div>
<div id="fatal"><div><h4>The crystal cannot be drawn</h4><p id="fatalmsg"></p></div></div>
<script>
${code}
const plateI=-1;
function open(i){VIS.sel=i;say(MODULES[i].name+" · "+MODULES[i].blurb);}
function shut(){VIS.sel=-1;}
function fatal(message){$("#fatalmsg").textContent=message;$("#fatal").classList.add("on");}
$("#garden-labels").onclick=()=>{const show=$("#garden-field").classList.toggle("show-labels");$("#garden-labels").setAttribute("aria-pressed",String(show));};
$("#study-form").onchange=e=>{endFlow();L.form=C.form=Number(e.target.value);VIS.ghost=0;markDirty();accFrames=0;};
$("#study-hue").oninput=e=>{L.hue=C.hue=Number(e.target.value);accFrames=0;};
addEventListener("keydown",e=>{if(e.code==="Space"&&!/INPUT|SELECT|BUTTON/.test(e.target.tagName)){e.preventDefault();$("#garden-play").click();}});
addEventListener("visibilitychange",()=>{paused=document.hidden;last=performance.now();accFrames=0;lastDraw=0;});
setInterval(()=>{if(wDrift&&!paused&&VIEW.running){wPhase+=0.016;setW(Math.sin(wPhase*0.21)*1.12);}},33);
try{initGL();resize();paintW();paintDock();placeNodes(0);updateCam(0);layout();requestAnimationFrame(frame);}catch(error){fatal(String(error.message||error));}
</script></body></html>`;
const destination=path.join(root,'design/packet-garden/living-crystal.html');
fs.writeFileSync(destination,html);
console.log('Wrote '+path.relative(root,destination)+' ('+Buffer.byteLength(html)+' bytes); renderer only, fixture state, no network client.');
