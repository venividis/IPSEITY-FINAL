#!/usr/bin/env node
/* The living crystal is a view, never an unreviewed section edit. Real
 * WebGL pixels prove that the tour changes the picture; liveWord proves
 * the same tour does not change what would be committed. The browser's
 * clock is advanced explicitly so software-GPU speed cannot fake motion.
 * Run after npm run build. No wallet, network or test hook ships in the art.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createServer } from 'node:http';
import { chromium } from 'playwright';

const root=path.resolve(import.meta.dirname,'..');
const state={id:1,chainId:11155111,collection:'0x'+'11'.repeat(20),
  owner:'0x'+'22'.repeat(20),seed:'0x'+'33'.repeat(32),form:2,hue:151,
  rot:[4381,19818,0,10013,3233,24511],w:34768,ops:17,open:4095};
const doc=file=>fs.readFileSync(path.join(root,file),'utf8')
  .replace('</head>','<script>window.IPSE='+JSON.stringify(state)+'</script></head>');
const docs={'/':doc('dist/ipseity.min.html'),'/source':doc('engine/ipseity.html'),
  '/study':fs.readFileSync(path.join(root,'design/packet-garden/living-crystal.html'),'utf8')};
const server=createServer((req,res)=>{
  res.writeHead(docs[req.url]?200:404,{'Content-Type':'text/html'});
  res.end(docs[req.url]||'No fixture');
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const base='http://127.0.0.1:'+server.address().port;
const executablePath=process.env.IPSEITY_BROWSER||[
  '/opt/pw-browsers/chromium/chrome-linux/chrome',
  '/opt/pw-browsers/chromium-1194/chrome-linux/chrome'
].find(fs.existsSync);
let browser,passed=0;
const check=async(name,fn)=>{await fn();passed++;console.log('✓ '+name);};
try{
  browser=await chromium.launch({executablePath,args:[
    '--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'
  ]});
  const context=await browser.newContext({viewport:{width:640,height:640},reducedMotion:'reduce'});
  await context.addInitScript(()=>{
    // Hold the scheduler, not the renderer. Each assertion invokes its
    // saved callback; GLSL compilation and every draw still reach WebGL.
    window.requestAnimationFrame=callback=>{window.__nextFrame=callback;return 1;};
    window.__walletCalls=[];
    window.ethereum={request:async request=>{window.__walletCalls.push(request.method);return [];}};
  });
  const page=await context.newPage();
  const errors=[];page.on('pageerror',error=>errors.push(error.message));
  const load=async(route='/source')=>{
    await page.goto(base+route);
    await page.waitForFunction(()=>document.body.classList.contains('up'),null,{polling:100});
    assert.equal(await page.locator('#fatal.on').count(),0);
    await page.waitForTimeout(1500);
  };
  const advance=async(frames=3)=>page.evaluate(count=>{
    for(let i=0;i<count;i++)frame(last+1000/30);
    gl.finish();
  },frames);
  const word=()=>page.evaluate(()=>({word:liveWord().toString(),state:JSON.stringify(S),dirty:L.dirty}));
  const pixels=()=>page.evaluate(()=>{
    // Read the presented image immediately after drawing; the canvas is
    // deliberately not created with preserveDrawingBuffer in production.
    accFrames=0;lastDraw=0;frame(last+1000/30);
    const bytes=new Uint8Array(W*H*4);gl.readPixels(0,0,W,H,gl.RGBA,gl.UNSIGNED_BYTE,bytes);
    let hash=2166136261,lit=0,coloured=0;
    for(let i=0;i<bytes.length;i+=4){
      hash=Math.imul(hash^bytes[i],16777619);hash=Math.imul(hash^bytes[i+1],16777619);
      if(Math.max(bytes[i],bytes[i+1],bytes[i+2])>90)lit++;
      if(Math.max(bytes[i],bytes[i+1],bytes[i+2])-Math.min(bytes[i],bytes[i+1],bytes[i+2])>35)coloured++;
    }
    return {hash:hash>>>0,lit,coloured,error:gl.getError()};
  });
  await check('The built document compiles its shaders and exposes usable motion controls',async()=>{
    await load('/');
    for(const id of ['garden-orbit','garden-flow','garden-play','garden-reset'])assert.ok(await page.locator('#'+id).isVisible());
    await page.locator('#garden-flow').click();
    assert.equal(await page.locator('#garden-flow').getAttribute('aria-pressed'),'true');
    await page.locator('#garden-play').click();
    assert.equal(await page.locator('#garden-play').textContent(),'Play');
  });
  await check('Reduced motion starts with a still, saved section',async()=>{
    await load();const before=await word();await advance(12);
    assert.equal(await page.evaluate(()=>VIEW.running),false);
    assert.equal(await page.evaluate(()=>VIEW.clock),0);
    assert.equal(before.dirty,false);assert.deepEqual(await word(),before);
  });
  await check('A 4D tour changes real pixels and orientation without changing the section word',async()=>{
    const before=await word();await page.locator('#garden-flow').click();
    const start=await pixels();await advance(24);const end=await pixels();
    assert.notEqual(start.hash,end.hash);assert.ok(end.lit>100&&end.coloured>100,JSON.stringify(end));
    assert.equal(end.error,0);assert.deepEqual(await word(),before);
    assert.notDeepEqual(await page.evaluate(()=>viewRotation()),await page.evaluate(()=>L.rot));
  });
  await check('Pause holds every animation clock; reset preserves unsaved edits',async()=>{
    await page.locator('#garden-play').click();
    const before=await page.evaluate(()=>({time:VIEW.clock,phase:VIEW.phase,nodes:nodes.map(n=>n.pos),yaw:cam.yaw}));
    await advance(8);
    assert.deepEqual(await page.evaluate(()=>({time:VIEW.clock,phase:VIEW.phase,nodes:nodes.map(n=>n.pos),yaw:cam.yaw})),before);
    await page.locator('#wtrack').focus();await page.keyboard.press('ArrowRight');
    assert.equal(await page.locator('#garden-flow').getAttribute('aria-pressed'),'false');
    const edit=await word();assert.equal(edit.dirty,true);
    await page.locator('#garden-reset').click();assert.deepEqual(await word(),edit);
    assert.equal(await page.evaluate(()=>VIEW.phase),0);
  });
  await check('Opening the section editor leaves the tour and shows the editable geometry',async()=>{
    await page.locator('#garden-flow').click();await advance(3);
    await page.locator('#garden-shape').click();
    assert.equal(await page.locator('#garden-flow').getAttribute('aria-pressed'),'false');
    assert.deepEqual(await page.evaluate(()=>viewRotation()),await page.evaluate(()=>L.rot));
    await page.locator('#shut').click();
  });
  await check('All eight solids render coloured pixels without a GPU error',async()=>{
    await page.locator('#garden-play').click();
    for(let form=0;form<8;form++){
      await page.evaluate(f=>{L.form=f;L.w=0.08;accFrames=0;},form);
      const image=await pixels();
      assert.equal(image.error,0,'form '+form);assert.ok(image.lit>100&&image.coloured>100,'form '+form+': '+JSON.stringify(image));
    }
  });
  await check('Motion controls fit a phone, and viewing requests no signatures or transactions',async()=>{
    await page.setViewportSize({width:320,height:640});await advance();
    const bounds=await page.locator('#garden-motion button').evaluateAll(buttons=>buttons.map(button=>{
      const b=button.getBoundingClientRect();return {x:b.x,right:b.right,y:b.y,bottom:b.bottom};
    }));
    for(const b of bounds)assert.ok(b.x>=0&&b.right<=320&&b.bottom<400,JSON.stringify(b));
    assert.deepEqual(await page.evaluate(()=>window.__walletCalls.filter(method=>/send|sign|requestAccounts/i.test(method))),[]);
    assert.deepEqual(errors,[]);
  });
  await check('The downloadable study uses the real renderer and works without network requests',async()=>{
    const requests=[];page.on('request',request=>requests.push(request.url()));
    await page.setViewportSize({width:900,height:760});await load('/study');
    await page.locator('#garden-flow').click();await advance(3);
    await page.locator('#study-form').selectOption('1');await advance(3);
    assert.equal(await page.evaluate(()=>L.form),1);
    const image=await pixels();assert.ok(image.lit>100&&image.coloured>100);
    assert.deepEqual(requests,[base+'/study']);assert.deepEqual(errors,[]);
  });
  console.log('\n'+passed+' living crystal checks passed.');
}finally{await browser?.close();await new Promise(resolve=>server.close(resolve));}
