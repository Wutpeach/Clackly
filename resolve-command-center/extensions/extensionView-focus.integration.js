const test = require('node:test');
const { chromium } = require('playwright');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '../dist/renderer');
const evidence = path.resolve(__dirname, '../build/issue8a/electron');
fs.mkdirSync(evidence, { recursive: true });
const server = http.createServer((req, res) => {
  const name = new URL(req.url, 'http://localhost').pathname;
  const file = path.resolve(root, '.' + (name === '/' ? '/index.html' : name));
  if (!file.startsWith(root + path.sep) || !fs.existsSync(file)) { res.writeHead(404).end(); return; }
  res.setHeader('Content-Type', file.endsWith('.js') ? 'text/javascript' : file.endsWith('.css') ? 'text/css' : 'text/html');
  fs.createReadStream(file).pipe(res);
});
test('built View renderer restores focus after confirmation/copy and keeps Escape navigation usable', { timeout: 20000 }, async (t) => {
  t.after(() => server.close());
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const browser = await chromium.launch({ headless: true, ...(process.platform === 'win32' ? { channel: 'msedge' } : {}) });
  try {
    const page = await browser.newPage({ viewport: { width: 480, height: 360 } });
    const errors = []; page.on('pageerror', e => errors.push(e.message));
    await page.addInitScript(() => {
      let state = { phase: 'ready', serial: 1, version: 1, depth: 2, extensionName: '标记浏览器',
        view: { id:'markers', type:'detail', title:'同名标记', text:'只读详情', actions:[{id:'copy',title:'复制标记信息',type:'copy'}, {id:'verify',title:'核对状态',type:'extension',confirm:{message:'确认核对当前状态？'}}] } };
      let listener;
      window.resolveCommandCenter = { getLocalizationSnapshot: async () => ({ preference:'zh-CN',effectiveLocale:'zh-CN' }),onLocalizationChanged:()=>()=>{} };
      window.resolveExtensionView = { get: async()=>state,onChanged:fn=>{listener=fn;return()=>{};},
        action: async(request)=>{state={...state,serial:state.serial+1,...(request.id==='verify'?{confirmation:{message:'确认核对当前状态？'}}:{message:'copied'})};listener(state);},
        cancelConfirmation:async()=>{state={...state,serial:state.serial+1,confirmation:null};listener(state);},
        back:async()=>{state={...state,depth:1,serial:state.serial+1,query:'',filter:'',selectedId:'a',view:{id:'markers',type:'list',title:'时间线标记',items:[{id:'a',title:'同名标记'}]}};listener(state);},window:()=>{} };
    });
    await page.goto('http://127.0.0.1:' + server.address().port + '/?view=extension-view');
    await page.locator('.view-detail').waitFor();
    // The shortcut bubbles through the shell only after its deferred focus lands.
    await page.waitForFunction(() => !!document.activeElement?.closest('.extension-view-shell'));
    await page.keyboard.press('Control+.'); await page.getByRole('menu').waitFor();
    await page.getByRole('menuitem', {name:'核对状态'}).click();
    await page.getByRole('alertdialog').waitFor();
    await page.keyboard.press('Tab');
    assert.equal(await page.evaluate(()=>!!document.activeElement?.closest('.view-confirmation')),true);
    await page.screenshot({path:path.join(evidence,'confirmation-headless.png')});
    await page.keyboard.press('Escape');
    await page.waitForFunction(()=>!document.querySelector('[role=alertdialog]') && document.activeElement?.getAttribute('aria-haspopup')==='menu');
    await page.keyboard.press('Control+.'); await page.getByRole('menu').waitFor();
    await page.getByRole('menuitem', {name:'复制标记信息'}).click();
    await page.waitForFunction(()=>document.activeElement?.getAttribute('aria-haspopup')==='menu');
    await page.keyboard.press('Escape'); await page.locator('[role=option]').waitFor();
    assert.equal(await page.getByRole('combobox',{name:'搜索当前列表'}).inputValue(),'');
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
    assert.deepEqual(errors,[]);
    await page.screenshot({path:path.join(evidence,'focus-fixed-headless.png')});
    console.log(JSON.stringify({passed:true,evidence:'Headless Edge built renderer, seeded Detail/actions/confirmation/back; real keyboard focus and confirmation Tab/Escape regression only',errors}));
  } finally { await browser.close(); server.close(); }
});
