const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { _electron: electron } = require('playwright');

test('Extension Views: real Electron public marker browser, navigation/actions, ordinary windows and Command compatibility', { timeout: 120000 }, async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'clackly-views-ui-'));
  const evidence = path.resolve(__dirname, '../build/issue8a/electron'); fs.mkdirSync(evidence, { recursive: true });
  const archive = path.join(root, 'marker-browser.clackly');
  execFileSync('python', [path.resolve(__dirname, '../../skills/clackly-developer/scripts/package_extension.py'), path.resolve(__dirname, '../../skills/clackly-developer/examples/marker-browser'), archive], { windowsHide: true });
  const env = { ...process.env, CLACKLY_VIEW_TEST_ROOT: root, CLACKLY_VIEW_TEST_PACKAGE: archive }; delete env.ELECTRON_RUN_AS_NODE;
  const app = await electron.launch({ args: [path.join(__dirname, 'extensionView-electron-fixture.js')], env });
  const errors = [];
  app.process().stderr.on('data', (data) => fs.appendFileSync(path.join(evidence, 'electron-stderr.log'), data));
  try {
    const palette = await app.firstWindow();
    await app.evaluate(() => new Promise((resolve) => { const check = () => global.viewTest ? resolve() : setTimeout(check, 25); check(); }));
    const environment = { project: 'p1', timeline: 't1', markers: {
      24: { name: '同名标记', note: '检查色彩与字幕。<script>literal text</script>', color: 'Blue', duration: 1 },
      48: { name: '同名标记', note: '检查声音与剪辑点。', color: 'Red', duration: 2 },
      72: { name: '较长的标记名称，用于检查窄窗口中的截断和可阅读的详情', note: 'Long notes '.repeat(70), color: 'Blue', duration: 3 } } };
    const set = (value) => app.evaluate((_electron, data) => global.viewTest.setEnvironment(data), value);
    const launch = (id = 'extension:clackly.demo.marker-browser/open') => palette.evaluate((value) => window.resolveCommandCenter.executeCommand(value), id);
    const open = async (id) => { const next = app.waitForEvent('window'); await launch(id); const page = await next; page.on('pageerror', e => errors.push(e.message)); return page; };
    const ready = (page) => page.locator('[role=option]').first().waitFor();
    const screenshot = (page, name) => page.screenshot({ path: path.join(evidence, name + '.png') });
    async function verifyCommand() {
      const command = await open('extension:test.static-command/run');
      await command.locator('#setting-title').waitFor(); await command.getByRole('button', { name: /运行命令|Run command/ }).click();
      await command.locator('.command-result').waitFor(); assert.match(await command.locator('.command-result').innerText(), /Still works/); await command.close();
    }
    if (process.env.CLACKLY_VIEW_UI_ONLY_COMMAND) { await verifyCommand(); return; }
    await set(environment);
    const page = await open(); await ready(page);
    assert.equal(await page.locator('[role=option]').count(), 3);
    if (!process.env.CLACKLY_VIEW_UI_AFTER_NAVIGATION) {
    await page.getByRole('combobox', { name: 'Search this list' }).focus();
    const beforeSearch = await app.evaluate(() => global.viewTest.requests.length);
    await page.getByRole('combobox', { name: 'Search this list' }).fill('同名');
    await page.waitForFunction(() => document.querySelectorAll('[role=option]').length === 2);
    assert.equal(await app.evaluate(() => global.viewTest.requests.length), beforeSearch);
    await page.getByRole('combobox', { name: 'Filter', exact: true }).selectOption('Red');
    await page.waitForFunction(() => document.querySelectorAll('[role=option]').length === 1);
    await screenshot(page, 'list-filtered-en');
    await page.getByRole('combobox', { name: 'Search this list' }).press('Enter');
    await page.locator('.view-detail').waitFor(); assert.match(await page.locator('.view-detail').innerText(), /48/);
    await screenshot(page, 'detail-en');
    await page.keyboard.press('Control+.'); await page.getByRole('menu').waitFor();
    await screenshot(page, 'actions-en');
    await page.getByRole('menuitem', { name: '复制标记信息' }).click();
    assert.match(await app.evaluate(() => global.viewTest.clipboard.readText()), /检查声音/);
    await page.keyboard.press('Escape'); await ready(page);
    assert.equal(await page.getByRole('combobox', { name: 'Search this list' }).inputValue(), '同名');
    assert.equal(await page.getByRole('combobox', { name: 'Filter', exact: true }).inputValue(), 'Red');
    await page.keyboard.press('Control+.'); await page.getByRole('menu').waitFor();
    await page.keyboard.press('Escape'); assert.equal(await page.getByRole('menu').count(), 0);
    assert.equal(await page.locator('.view-detail').count(), 0);
    }
    let reopened = page, native = [];
    if (!process.env.CLACKLY_VIEW_UI_AFTER_WINDOWS) {
    await launch(); assert.equal(await app.evaluate(() => global.viewTest.windows.length), 1);
    await app.evaluate(() => global.viewTest.windows[0].minimize()); await launch();
    assert.equal(await app.evaluate(() => global.viewTest.windows[0].isMinimized()), false);
    const other = await open('extension:test.other-view/open'); await ready(other);
    await app.evaluate(() => global.viewTest.palette.show());
    assert.equal(await app.evaluate(() => global.viewTest.windows[0].isVisible()), true);
    native = await app.evaluate(({ screen }) => global.viewTest.windows.map(w => ({ bounds: w.getBounds(), area: screen.getDisplayMatching(w.getBounds()).workArea, topmost: w.isAlwaysOnTop(), resizable: w.isResizable(), minimizable: w.isMinimizable() })));
    assert.ok(native.every(w => !w.topmost && w.resizable && w.minimizable && w.bounds.x >= w.area.x && w.bounds.y >= w.area.y && w.bounds.x + w.bounds.width <= w.area.x + w.area.width && w.bounds.y + w.bounds.height <= w.area.y + w.area.height));
    await other.close();
    await app.evaluate(() => global.viewTest.windows[0].setBounds({ width: 540, height: 420 }));
    const closed = page.waitForEvent('close');
    await page.getByRole('button', { name: 'Close', exact: true }).click(); await closed;
    await set({ ...environment, mode: 'slow' });
    reopened = await open(); await ready(reopened);
    assert.equal(await app.evaluate(() => global.viewTest.windows.at(-1).getBounds().width), 540);
    }
    await app.evaluate(() => global.viewTest.core.localizationService.setLocalePreference('zh-CN'));
    await screenshot(reopened, 'list-zh-min');
    // Reuse this same window for empty/error/refresh and stale-object states.
    await set({ ...environment, markers: {} }); await reopened.getByRole('button', { name: '刷新', exact: true }).click();
    await reopened.getByRole('heading', { name: '暂无内容' }).waitFor(); await screenshot(reopened, 'empty-zh');
    await set({ ...environment, mode: 'failed' }); await reopened.getByRole('button', { name: '刷新', exact: true }).click();
    await reopened.getByRole('heading', { name: '无法加载视图' }).waitFor(); await screenshot(reopened, 'failed-zh');
    await set(environment); await reopened.getByRole('button', { name: '重试', exact: true }).click(); await ready(reopened);
    await reopened.locator('[role=option]').first().click();
    await set({ ...environment, markers: {} });
    await reopened.getByRole('button', { name: '操作', exact: false }).click();
    await reopened.getByRole('menuitem', { name: '核对标记当前状态' }).click();
    await reopened.getByRole('alert').filter({ hasText: '已删除或内容已变化' }).waitFor(); await screenshot(reopened, 'stale-zh');
    await set(environment); await reopened.getByRole('button', { name: '重试', exact: true }).click(); await ready(reopened);
    await reopened.setViewportSize({ width: 480, height: 360 });
    assert.equal(await reopened.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    await screenshot(reopened, 'list-zh-480');
    const closeEvent = reopened.waitForEvent('close');
    await app.evaluate(() => global.viewTest.core.extensions.setEnabled('clackly.demo.marker-browser', false)); await closeEvent;
    await verifyCommand();
    assert.deepEqual(errors, []);
    fs.writeFileSync(path.join(evidence, 'receipt.json'), JSON.stringify({ environment: 'Real isolated Electron/Core/installed public package/IPC/Python; simulated Resolve, no live Workflow acceptance', native, errors, requests: await app.evaluate(() => global.viewTest.requests) }, null, 2));
  } catch (error) {
    console.error(error);
    const page = app.windows().at(-1); if (page && !page.isClosed()) {
      console.error(await page.locator('body').innerText().catch(() => 'Window unavailable'));
      await page.screenshot({ path: path.join(evidence, 'failure.png'), timeout: 2000 }).catch(() => {});
    }
    throw error;
  } finally { await app.close(); fs.rmSync(root, { recursive: true, force: true }); }
});
