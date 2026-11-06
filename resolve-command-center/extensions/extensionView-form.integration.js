const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');

test('built Form controls inherit Settings, preserve failed input and trap draft confirmation focus at narrow sizes', { timeout: 25000 }, async () => {
  const root = path.resolve(__dirname, '../dist/renderer'), evidence = path.resolve(__dirname, '../build/issue8b/headless');
  fs.mkdirSync(evidence, { recursive: true });
  const server = http.createServer((req, res) => {
    const name = new URL(req.url, 'http://localhost').pathname;
    const file = path.resolve(root, '.' + (name === '/' ? '/index.html' : name));
    if (!file.startsWith(root + path.sep) || !fs.existsSync(file)) { res.writeHead(404).end(); return; }
    res.setHeader('Content-Type', file.endsWith('.js') ? 'text/javascript' : file.endsWith('.css') ? 'text/css' : 'text/html');
    fs.createReadStream(file).pipe(res);
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const browser = await chromium.launch({ headless: true, ...(process.platform === 'win32' ? { channel: 'msedge' } : {}) });
  try {
    const page = await browser.newPage({ viewport: { width: 480, height: 360 } });
    const errors = []; page.on('pageerror', error => errors.push(error.message));
    await page.addInitScript(() => {
      let listener;
      let state = { serial: 1, version: 1, phase: 'ready', depth: 2, extensionName: 'Extension Views', dirty: false, values: { name: '测试时间线', enabled: false },
        view: { type: 'form', id: 'edit', title: '编辑时间线名称', subtitle: '仅在可丢弃的测试项目中使用。',
          inputs: { name: { type: 'string', label: '时间线名称', required: true }, note: { type: 'text', label: '备注' },
            enabled: { type: 'boolean', label: '审阅完成' }, color: { type: 'select', label: '分类', options: ['Review', 'Ready'] },
            path: { type: 'folder', label: '导出目录' }, count: { type: 'number', label: '数量', min: 0 } }, submit: { id: 'save', title: '保存' } } };
      const publish = patch => { state = { ...state, ...patch, serial: state.serial + 1 }; listener(state); };
      window.resolveCommandCenter = { getLocalizationSnapshot: async () => ({ preference: 'zh-CN', effectiveLocale: 'zh-CN' }), onLocalizationChanged: () => () => {} };
      window.resolveExtensionView = { get: async () => state, onChanged: fn => { listener = fn; return () => {}; }, window: () => {},
        draft: async request => publish({ values: request.values, dirty: true }),
        submit: async () => publish({ error: { message: 'Fixture 保存失败' } }),
        pick: async () => null, back: async () => publish({ confirmation: { kind: 'discard' } }),
        cancelConfirmation: async () => publish({ confirmation: null }) };
    });
    await page.goto('http://127.0.0.1:' + server.address().port + '/?view=extension-view');
    await page.getByLabel('时间线名称', { exact: false }).fill('保留我的草稿');
    await page.getByRole('button', { name: '保存', exact: true }).click();
    await page.getByRole('alert').filter({ hasText: 'Fixture 保存失败' }).waitFor();
    assert.equal(await page.locator('#setting-name').inputValue(), '保留我的草稿');
    await page.getByRole('button', { name: '返回', exact: true }).click();
    await page.getByRole('alertdialog').waitFor();
    await page.waitForFunction(() => document.activeElement?.textContent === '继续编辑');
    await page.keyboard.press('Tab'); assert.equal(await page.evaluate(() => !!document.activeElement?.closest('.view-confirmation')), true);
    await page.screenshot({ path: path.join(evidence, 'draft-480.png') });
    await page.keyboard.press('Escape'); await page.getByRole('alertdialog').waitFor({ state: 'hidden' });
    assert.equal(await page.locator('#setting-name').inputValue(), '保留我的草稿');
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    await page.setViewportSize({ width: 640, height: 560 });
    await page.screenshot({ path: path.join(evidence, 'form-controls-640.png') });
    assert.deepEqual(errors, []);
    console.log('Headless Edge: six shared field types, failed save, discard focus/Tab/Escape, 480×360 and 640×560; no Resolve writes.');
  } finally { await browser.close(); server.close(); }
});
