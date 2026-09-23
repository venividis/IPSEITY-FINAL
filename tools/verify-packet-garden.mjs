#!/usr/bin/env node
/* Packet Garden's regression boundary: the field is inset, while pointer
 * events are in viewport coordinates. Navigation replaces the document;
 * journal deep links select a view and never prepare a transaction.
 * Run after `npm run build && npm run modules:build`.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createServer } from 'node:http';
import { chromium } from 'playwright';

const root = path.resolve(import.meta.dirname, '..');
const state = { id:1, chainId:11155111, collection:'0x'+'11'.repeat(20),
  owner:'0x'+'22'.repeat(20), seed:'0x'+'33'.repeat(32), form:2, hue:151,
  rot:[4381,19818,0,10013,3233,24511], w:37273, ops:17, open:4095 };
const document = file => fs.readFileSync(path.join(root,file),'utf8')
  .replace('</head>','<script>window.IPSE='+JSON.stringify(state)+'</script></head>');
const pages = new Map([
  ['/token/1/live',document('dist/ipseity.min.html')],
  ['/source',document('engine/ipseity.html')],
  ['/token/1/modules',fs.readFileSync(path.join(root,'dist/modules/index.html'))],
  ...['/chat','/swap','/gallery','/launch','/c/1/hold','/c/1/hand'].map(route =>
    [route,'<!doctype html><title>Navigation destination</title><h1>'+route+'</h1>'])
]);
const server = createServer((req,res)=>{
  const page = pages.get(new URL(req.url,'http://localhost').pathname);
  res.writeHead(page ? 200 : 404,{'Content-Type':'text/html; charset=utf-8'});
  res.end(page ?? 'No fixture at this route');
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const base = 'http://127.0.0.1:'+server.address().port;
const executablePath = process.env.IPSEITY_BROWSER || [
  '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  '/opt/pw-browsers/chromium/chrome-linux/chrome'
].find(file=>fs.existsSync(file));
let browser;
let passed = 0;
async function check(name,run){ await run(); passed++; console.log('✓ '+name); }
try {
  browser = await chromium.launch({executablePath,args:[
    '--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'
  ]});
  const context = await browser.newContext({reducedMotion:'reduce'});
  // A software GPU only needs a few frames for these DOM/input assertions.
  // The shipping renderer has no test switch and is not modified by this.
  await context.addInitScript(()=>{
    const raf = requestAnimationFrame.bind(window);
    let budget=4;
    window.requestAnimationFrame = callback => budget-- > 0 ? raf(callback) : 0;
  });
  const errors=[];
  const page=await context.newPage();
  page.on('pageerror',error=>errors.push(error.message));
  const load=async(route='/token/1/live')=>{
    await page.goto(base+route);
    if(route.includes('live') || route==='/source'){
      await page.waitForFunction(()=>document.body.classList.contains('up'),null,{polling:100});
      assert.equal(await page.locator('#fatal.on').count(),0);
      await page.waitForTimeout(1400);
    }
  };
  for(const viewport of [{width:1600,height:1000},{width:900,height:700},
    {width:390,height:844},{width:320,height:640}]){
    await check('Usable artwork, headline and actions at '+viewport.width+'px',async()=>{
      await page.setViewportSize(viewport); await load();
      const boxes=await page.evaluate(()=>{
        const rect=id=>{const r=document.querySelector(id).getBoundingClientRect();
          return {x:r.x,y:r.y,right:r.right,bottom:r.bottom,width:r.width,height:r.height};};
        return {field:rect('#field'),title:rect('#garden-title'),dock:rect('#dock'),
          wallet:rect('#link'),console:rect('#r2d'),command:rect('#rcmd'),
          width:innerWidth,overflow:document.documentElement.scrollWidth>innerWidth};
      });
      assert.equal(boxes.overflow,false);
      assert.ok(boxes.field.width>=280 && boxes.field.height>=180,JSON.stringify(boxes));
      assert.ok(boxes.title.bottom<=boxes.field.y,JSON.stringify(boxes));
      assert.ok(boxes.field.bottom<=boxes.dock.y+1,JSON.stringify(boxes));
      for(const key of ['wallet','console','command']){
        assert.ok(boxes[key].x>=0 && boxes[key].right<=viewport.width,JSON.stringify(boxes));
      }
      await page.locator('#garden-focus').click();
      assert.equal(await page.locator('#garden-focus').getAttribute('aria-pressed'),'true');
      await page.waitForFunction(()=>document.querySelector('#field').getBoundingClientRect().width>=innerWidth-26,null,{polling:100});
      const focused=await page.locator('#field').boundingBox();
      assert.ok(focused.width>=viewport.width-26,JSON.stringify({viewport,focused,css:await page.locator('#garden-field').evaluate(el=>({left:getComputedStyle(el).left,right:getComputedStyle(el).right}))}));
      await page.keyboard.press('Escape');
      assert.equal(await page.locator('#garden-focus').getAttribute('aria-pressed'),'false');
      await page.locator('#garden-shape').click();
      assert.equal(await page.locator('#s-title').textContent(),'Section');
      await page.locator('#shut').click();
      assert.equal(await page.locator('#sheet').getAttribute('aria-hidden'),'true');
    });
  }
  await check('A click on a projected node uses the field origin in both layouts',async()=>{
    await page.setViewportSize({width:1440,height:1000}); await load('/source');
    for(const focus of [false,true]){
      if(focus) await page.locator('#garden-focus').click();
      const hit=await page.evaluate(()=>{
        // Source-only inspection locates a node; the assertion below uses
        // a real mouse event, not open(), dispatchEvent() or a test hook.
        for(const n of nodes){
          const p=project(n.pos);
          if(!p || p.x<24 || p.y<64 || p.x>FW-24 || p.y>FH-70)continue;
          const x=p.x+FX,y=p.y+FY;
          if(pick(x,y)?.i===n.i && document.elementFromPoint(x,y)?.id==='field')
            return {x,y,name:n.name};
        }
      });
      assert.ok(hit,'A projected node is inside the field');
      await page.mouse.click(hit.x,hit.y);
      assert.equal(await page.locator('#s-title').textContent(),hit.name);
      await page.locator('#shut').click();
    }
  });
  await check('Hidden orbit labels stay out of keyboard navigation and can be shown',async()=>{
    await load();
    assert.equal(await page.locator('#nodes .nd:visible').count(),0);
    await page.locator('#garden-labels').click();
    assert.equal(await page.locator('#garden-labels').getAttribute('aria-pressed'),'true');
    await page.waitForFunction(()=>Array.from(document.querySelectorAll('#nodes .nd')).some(el=>getComputedStyle(el).visibility==='visible' && getComputedStyle(el).display!=='none'),null,{polling:100});
    assert.ok(await page.locator('#nodes .nd:visible').count()>0);
    await page.locator('#garden-prompt').click();
    assert.equal(await page.locator('#pal').getAttribute('class'),'open');
    await page.keyboard.press('Escape');
  });
  await check('The journal card navigates once, selects Journal, and sends nothing',async()=>{
    await load();
    assert.equal(await page.locator('[data-garden-route=hold]').getAttribute('href'),'/c/1/hold');
    assert.equal(await page.locator('[data-garden-route=hand]').getAttribute('href'),'/c/1/hand');
    assert.equal(await page.locator('[data-garden-route=trade]').getAttribute('href'),'/swap');
    await page.locator('[data-garden-route=journal]').click();
    assert.equal(new URL(page.url()).pathname,'/token/1/modules');
    assert.equal(new URL(page.url()).hash,'#journal');
    assert.equal(await page.locator('[data-tab=journal]').getAttribute('aria-pressed'),'true');
    assert.equal(await page.locator('[data-panel=journal]').isVisible(),true);
    assert.equal(await page.locator('canvas#field').count(),0);
    assert.equal(await page.locator('[data-node=review]').getAttribute('open'),null);
    await page.goto(base+'/token/1/modules#games');
    assert.equal(await page.locator('[data-tab=games]').getAttribute('aria-pressed'),'true');
    await page.goto(base+'/token/1/modules#not-a-tab');
    assert.equal(await page.locator('[data-tab=catalog]').getAttribute('aria-pressed'),'true');
  });
  await check('All screens completed without an uncaught error',async()=>assert.deepEqual(errors,[]));
  console.log('\n'+passed+' Packet Garden checks passed.');
} finally {
  await browser?.close();
  await new Promise(resolve=>server.close(resolve));
}
