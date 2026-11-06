const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { _electron: electron } = require('playwright');

test('real Electron Prepare: public extension, loading, refresh, empty, retry, stale target/config and keyboard', { timeout: 180000 }, async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'clackly-prepare-ui-'));
  const evidence = path.resolve(__dirname, '../build/issue7b/electron'); fs.mkdirSync(evidence, { recursive: true });
  const helper = path.resolve(__dirname, '../../skills/clackly-developer/scripts/package_extension.py');
  const archive = path.join(root, 'static.clackly'), preparedArchive = path.join(root, 'prepare.clackly');
  for (const [example, output] of [['run-summary', archive], ['timeline-summary', preparedArchive]]) {
    execFileSync('python', [helper, path.resolve(__dirname, '../../skills/clackly-developer/examples', example), output], { windowsHide: true });
  }
  const env = { ...process.env, CLACKLY_UI_TEST_ROOT: root, CLACKLY_UI_TEST_PACKAGE: archive, CLACKLY_PREPARE_TEST_PACKAGE: preparedArchive };
  delete env.ELECTRON_RUN_AS_NODE;
  const app = await electron.launch({ args: [path.join(__dirname, 'commandUi-electron-fixture.js')], env });
  const errors = [];
  try {
    const palette = await app.firstWindow();
    await app.evaluate(() => new Promise((resolve) => { const check = () => global.commandUiTest ? resolve() : setTimeout(check, 25); check(); }));
    const set = (data) => app.evaluate((_electron, value) => global.commandUiTest.setEnvironment(value), data);
    const environment = { project: 'p1', current: 't2', timelines: ['t1', 't2'], mode: 'slow' };
    const requests = () => app.evaluate(() => global.commandUiTest.requests);
    const open = async () => {
      const next = app.waitForEvent('window');
      await palette.evaluate(() => window.resolveCommandCenter.executeCommand('extension:example.timeline-report-cn/report'));
      const page = await next; page.on('pageerror', (error) => errors.push(error.message)); return page;
    };
    const close = async (page) => { const closed = page.waitForEvent('close'); await page.keyboard.press('Escape').catch((e) => { if (!page.isClosed()) throw e; }); await closed; };
    await set(environment);
    let page = await open();
    await page.getByRole('heading', { name: 'Preparing options…' }).waitFor();
    await page.screenshot({ path: path.join(evidence, 'loading-en.png') });
    await close(page);
    await set({ ...environment, mode: 'ready' });
    page = await open();
    await page.locator('#setting-timeline').waitFor();
    await page.waitForFunction(() => document.querySelector('#setting-timeline')?.value.length > 0);
    const selected = JSON.parse(await page.locator('#setting-timeline').inputValue());
    assert.deepEqual(selected, ['p1', 't2']);
    assert.equal(await page.locator('#setting-timeline option').count(), 3);
    assert.equal(await page.evaluate(() => document.activeElement.id), 'setting-timeline');
    await page.keyboard.press('Tab'); assert.equal(await page.evaluate(() => document.activeElement.id), 'setting-title');
    await page.locator('#setting-title').fill('我的报告');
    await page.screenshot({ path: path.join(evidence, 'ready-en.png') });
    await page.getByRole('button', { name: 'Refresh', exact: true }).click();
    await page.getByRole('heading', { name: 'Ready', exact: true }).waitFor();
    assert.equal(await page.locator('#setting-title').inputValue(), '我的报告');
    await set({ ...environment, mode: 'ready', current: 't1', timelines: ['t1'] });
    await page.getByRole('button', { name: 'Refresh', exact: true }).click();
    await page.getByRole('heading', { name: 'Ready', exact: true }).waitFor();
    assert.equal(await page.locator('#setting-timeline').inputValue(), '');
    assert.equal(await page.locator('#setting-title').inputValue(), '我的报告');
    await page.getByRole('alert').filter({ hasText: 'no longer valid' }).waitFor();
    const before = (await requests()).filter((r) => r.phase === 'execute').length;
    await page.getByRole('button', { name: 'Run command', exact: true }).click();
    assert.equal((await requests()).filter((r) => r.phase === 'execute').length, before);
    await page.screenshot({ path: path.join(evidence, 'selection-cleared.png') });
    await page.locator('#setting-timeline').selectOption(JSON.stringify(['p1', 't1']));
    await page.locator('#setting-title').press('Enter');
    await page.getByRole('heading', { name: '时间线摘要已生成' }).waitFor();
    assert.match(await page.locator('.command-result').innerText(), /t1/);
    await page.getByRole('button', { name: 'Copy result' }).click();
    assert.match(await app.evaluate(() => global.commandUiTest.clipboard.readText()), /我的报告/);
    await page.screenshot({ path: path.join(evidence, 'result.png') }); await close(page);
    // Target deletion and project switch happen after Prepare, before Execute.
    for (const kind of ['deleted', 'switched']) {
      await set({ ...environment, mode: 'ready' }); page = await open(); await page.locator('#setting-timeline').waitFor();
      await set({ ...environment, mode: 'ready', project: kind === 'switched' ? 'p2' : 'p1', timelines: ['t1'] });
      await page.getByRole('button', { name: 'Run command', exact: true }).click();
      await page.locator('.command-result').waitFor();
      assert.match(await page.locator('.command-result').innerText(), kind === 'deleted' ? /已删除/ : /已关闭或切换/);
      await page.screenshot({ path: path.join(evidence, kind + '.png') }); await close(page);
    }
    for (const empty of [{ project: null, timelines: [] }, { project: 'p1', timelines: [] }]) {
      await set({ ...environment, ...empty, mode: 'ready' }); page = await open();
      await page.getByRole('heading', { name: 'No available options' }).waitFor();
      assert.equal(await page.getByRole('button', { name: 'Run command', exact: true }).isDisabled(), true);
      await page.screenshot({ path: path.join(evidence, empty.project ? 'empty.png' : 'no-project.png') });
      await set({ ...environment, mode: 'ready' });
      await page.getByRole('button', { name: 'Refresh', exact: true }).click();
      await page.getByRole('heading', { name: 'Ready', exact: true }).waitFor(); await close(page);
    }
    for (const mode of ['failed', 'timeout']) {
      await set({ ...environment, mode }); page = await open();
      await page.getByRole('heading', { name: mode === 'timeout' ? 'Preparation timed out' : 'Preparation failed' }).waitFor();
      assert.equal(await page.getByRole('button', { name: 'Run command', exact: true }).count(), 0);
      await page.screenshot({ path: path.join(evidence, mode + '.png') });
      await set({ ...environment, mode: 'ready' });
      await page.getByRole('button', { name: 'Retry', exact: true }).click();
      await page.getByRole('heading', { name: 'Ready', exact: true }).waitFor(); await close(page);
    }
    await set({ ...environment, mode: 'ready' }); page = await open(); await page.locator('#setting-timeline').waitFor();
    const executeBeforeStale = (await requests()).filter((r) => r.phase === 'execute').length;
    await app.evaluate(() => global.commandUiTest.core.extensions.saveConfig('example.timeline-report-cn', {}));
    await page.getByRole('button', { name: 'Run command', exact: true }).click();
    await page.locator('.command-result').waitFor();
    assert.equal((await requests()).filter((r) => r.phase === 'execute').length, executeBeforeStale); await close(page);
    await app.evaluate(() => global.commandUiTest.core.localizationService.setLocalePreference('zh-CN'));
    page = await open(); await page.getByRole('heading', { name: '已就绪', exact: true }).waitFor();
    await page.setViewportSize({ width: 320, height: 480 });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    for (const name of ['取消', '刷新', '运行命令']) assert.equal(await page.getByRole('button', { name, exact: true }).isVisible(), true);
    await page.screenshot({ path: path.join(evidence, 'ready-zh-320.png') });
    const bounds = await app.evaluate(({ screen }) => { const w = global.commandUiTest.windows.at(-1); const b = w.getBounds(); return { bounds: b, area: screen.getDisplayMatching(b).workArea, focused: w.isFocused(), topmost: w.isAlwaysOnTop() }; });
    assert.ok(bounds.focused && bounds.topmost);
    assert.deepEqual(errors, []);
    fs.writeFileSync(path.join(evidence, 'receipt.json'), JSON.stringify({ environment: 'Real Electron, Core, installed public package and Python; Resolve API is an isolated fixture, not live Resolve', bounds, errors, requests: await requests() }, null, 2));
    await close(page);
  } catch (error) {
    const page = app.windows().at(-1);
    if (page && !page.isClosed()) {
      console.error(JSON.stringify({ errors, snapshot: await page.evaluate(() => window.resolveCommandUi?.get()), html: await page.locator('main').innerHTML() }));
      await page.screenshot({ path: path.join(evidence, 'failure.png') });
    }
    throw error;
  } finally { await app.close(); fs.rmSync(root, { recursive: true, force: true }); }
});
