const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { _electron: electron } = require('playwright');

test('isolated Electron: Create/Edit, protected drafts, partial batch, refocus refresh and Command compatibility', { timeout: 100000 }, async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'clackly-views-b-ui-'));
  const evidence = path.resolve(__dirname, '../build/issue8b/electron'); fs.mkdirSync(evidence, { recursive: true });
  const archive = path.join(root, 'manager.clackly');
  execFileSync('python', [path.resolve(__dirname, '../../skills/clackly-developer/scripts/package_extension.py'), path.resolve(__dirname, '../../skills/clackly-developer/examples/timeline-manager'), archive], { windowsHide: true });
  const env = { ...process.env, CLACKLY_VIEW_TEST_ROOT: root, CLACKLY_VIEW_TEST_PACKAGE: archive, CLACKLY_VIEW_TEST_MODULE: path.join(__dirname, 'fixtures/view-edit-resolve.py') }; delete env.ELECTRON_RUN_AS_NODE;
  const app = await electron.launch({ args: [path.join(__dirname, 'extensionView-electron-fixture.js')], env });
  app.process().stderr.on('data', data => fs.appendFileSync(path.join(evidence, 'stderr.log'), data));
  const errors = [], checks = [];
  try {
    const palette = await app.firstWindow();
    await app.evaluate(() => new Promise(resolve => { const check = () => global.viewTest ? resolve() : setTimeout(check, 25); check(); }));
    await app.evaluate(() => global.viewTest.core.localizationService.setLocalePreference('zh-CN'));
    const set = data => app.evaluate((_electron, value) => global.viewTest.setEnvironment(value), data);
    const get = () => app.evaluate(() => global.viewTest.readEnvironment());
    const patch = async data => set({ ...await get(), ...data });
    await set(process.env.CLACKLY_VIEW_B_AFTER_EDIT
      ? { project: 'p1', timelines: { a: 'Renamed', b: 'Beta', c: 'Gamma', 'created-0': 'Created' }, writes: [{ kind: 'create', id: 'created-0', name: 'Created' }, { kind: 'rename', id: 'a', name: 'Renamed' }], writeDelay: 0.3 }
      : { project: 'p1', timelines: { a: 'Alpha', b: 'Beta', c: 'Gamma' }, writes: [], writeDelay: 0.3 });
    const open = async (id) => { const next = app.waitForEvent('window'); await palette.evaluate(value => window.resolveCommandCenter.executeCommand(value), id); const page = await next; page.on('pageerror', error => errors.push(error.message)); return page; };
    const page = await open('extension:clackly.demo.timeline-manager/open');
    const rows = page.locator('[role=option]'); await rows.first().waitFor();
    const snap = name => page.screenshot({ path: path.join(evidence, name + '.png') });
    const menuAction = async name => {
      // Navigation restores focus on the next animation frame after rendering.
      await page.waitForFunction(() => !!document.activeElement?.closest('.extension-view-shell'));
      await page.keyboard.press('Control+.');
      await page.getByRole('menuitem', { name, exact: true }).click();
    };
    const save = async () => { await page.getByRole('button', { name: '保存', exact: true }).click(); await page.getByRole('alertdialog').waitFor(); };
    const confirmSave = async () => { await page.getByRole('alertdialog').getByRole('button', { name: '保存', exact: true }).click(); };
    const batch = async () => { await page.getByRole('button', { name: '批量添加 Review 前缀', exact: true }).click(); await page.getByRole('alertdialog').waitFor(); await page.getByRole('alertdialog').getByRole('button', { name: '批量添加 Review 前缀', exact: true }).click(); };
    if (!process.env.CLACKLY_VIEW_B_AFTER_EDIT) {
    await menuAction('创建空时间线'); await page.locator('#setting-name').waitFor();
    assert.equal(await page.locator('#setting-name').inputValue(), 'Clackly Test');
    await page.locator('#setting-name').fill(''); await page.getByRole('button', { name: '保存', exact: true }).click();
    assert.equal(await page.locator('#setting-name').evaluate(input => input.validity.valueMissing), true); assert.equal((await get()).writes.length, 0);
    await page.locator('#setting-name').fill('Created'); await snap('create-form'); await save(); await snap('save-confirmation'); await confirmSave();
    await page.waitForFunction(() => document.querySelectorAll('[role=option]').length === 4); assert.equal((await get()).writes.length, 1);
    assert.equal(await page.evaluate(async () => (await window.resolveExtensionView.get()).depth), 1); checks.push('Create default/required/confirmed save/fresh List');
    await rows.filter({ hasText: 'Alpha' }).click(); await page.keyboard.press('Enter'); await page.locator('.view-detail').waitFor();
    await menuAction('编辑时间线名称'); await page.locator('#setting-name').waitFor(); assert.equal(await page.locator('#setting-name').inputValue(), 'Alpha');
    await page.locator('#setting-name').fill('My draft'); await page.keyboard.press('Escape'); await page.getByRole('alertdialog').waitFor();
    await page.waitForFunction(() => document.activeElement?.textContent === '继续编辑'); await snap('dirty-back');
    await page.getByRole('button', { name: '继续编辑', exact: true }).click();
    await app.evaluate(() => global.viewTest.windows[0].close()); await page.getByRole('alertdialog').waitFor();
    await page.getByRole('button', { name: '继续编辑', exact: true }).click(); assert.equal(page.isClosed(), false);
    const formVersion = await page.evaluate(async () => (await window.resolveExtensionView.get()).version);
    await app.evaluate(() => { global.viewTest.palette.show(); global.viewTest.palette.focus(); });
    await app.evaluate(() => global.viewTest.windows[0].focus());
    assert.equal(await page.locator('#setting-name').inputValue(), 'My draft');
    assert.equal(await page.evaluate(async () => (await window.resolveExtensionView.get()).version), formVersion); checks.push('Dirty Back/native close protected; refocus keeps Form');
    await patch({ failIds: ['a'] }); await save(); await confirmSave();
    await page.getByRole('alert').filter({ hasText: 'Resolve 拒绝重命名' }).waitFor(); assert.equal(await page.locator('#setting-name').inputValue(), 'My draft');
    assert.equal((await get()).writes.length, 1); await snap('failed-save-keeps-draft');
    await patch({ failIds: [] }); await page.locator('#setting-name').fill('Renamed'); await save(); await confirmSave();
    await page.waitForFunction(() => [...document.querySelectorAll('[role=option]')].some(row => row.textContent.includes('Renamed')));
    assert.equal((await get()).timelines.a, 'Renamed'); checks.push('Edit from Detail; failed save preserves draft; successful save returns fresh List');
    }
    const check = async title => { await page.getByRole('checkbox', { name: '选择 ' + title, exact: true }).click(); await page.waitForFunction(label => [...document.querySelectorAll('input[type=checkbox]')].some(input => input.getAttribute('aria-label') === label && input.checked), '选择 ' + title); };
    await page.getByRole('button', { name: '多选', exact: true }).click();
    await check('Renamed'); await check('Beta');
    await snap('multi-select'); await patch({ failIds: ['b'] }); await batch();
    await page.locator('.view-result').filter({ hasText: '成功 1 项 · 失败 1 项' }).waitFor();
    await snap('batch-partial'); assert.equal((await get()).writes.length, 3);
    assert.match(await page.locator('.view-result').innerText(), /Beta/);
    assert.deepEqual(await page.evaluate(async () => (await window.resolveExtensionView.get()).selectedIds.length), 1);
    await batch(); await page.locator('.view-result').filter({ hasText: '成功 0 项 · 失败 1 项' }).waitFor();
    await patch({ failIds: [] }); await batch(); await page.locator('.view-result').filter({ hasText: '成功 1 项 · 失败 0 项' }).waitFor();
    assert.equal((await get()).writes.length, 4); checks.push('Confirmed batch partial/all failed/all succeeded with per-item result and selection reconciliation');
    await check('Gamma');
    const environment = await get(); delete environment.timelines.c; await set(environment);
    const version = await page.evaluate(async () => (await window.resolveExtensionView.get()).version);
    await app.evaluate(() => { global.viewTest.palette.show(); global.viewTest.palette.focus(); });
    await page.waitForFunction(() => window.resolveExtensionView.get().then(state => !state.confirmation));
    await app.evaluate(() => global.viewTest.windows[0].focus());
    await page.waitForFunction(old => window.resolveExtensionView.get().then(state => state.phase === 'ready' && state.version > old && !state.selectedIds.length), version);
    await page.waitForFunction(() => document.querySelectorAll('[role=option]').length === 3);
    assert.equal(await rows.count(), 3); await snap('refocus-clears-stale-selection'); checks.push('Real native focus refresh removes deleted object and invalid selection');
    // Discard through native Close performs no write.
    await page.getByRole('button', { name: '完成选择', exact: true }).click(); await menuAction('创建空时间线'); await page.locator('#setting-name').fill('Do not create');
    const beforeDiscard = (await get()).writes.length; await app.evaluate(() => global.viewTest.windows[0].close());
    const closed = page.waitForEvent('close'); await page.getByRole('button', { name: '放弃修改', exact: true }).click(); await closed; assert.equal((await get()).writes.length, beforeDiscard); checks.push('Discard/native Close never writes');
    const command = await open('extension:test.static-command/run'); await command.locator('#setting-title').waitFor();
    await command.getByRole('button', { name: /运行命令|Run command/ }).click(); await command.locator('.command-result').waitFor();
    assert.match(await command.locator('.command-result').innerText(), /Still works/); checks.push('#7 Command UI still executes');
    assert.deepEqual(errors, []);
    fs.writeFileSync(path.join(evidence, process.env.CLACKLY_VIEW_B_AFTER_EDIT ? 'receipt-batch.json' : 'receipt.json'), JSON.stringify({ environment: 'Real isolated Electron/Core/preload/IPC/installed public package/short-lived Python; simulated file-backed Resolve. No live Workflow or production data.', checks, errors, writes: (await get()).writes, requests: await app.evaluate(() => global.viewTest.requests) }, null, 2));
  } catch (error) {
    const page = app.windows().at(-1); if (page && !page.isClosed()) { console.error(await page.locator('body').innerText().catch(() => 'Window unavailable')); await page.screenshot({ path: path.join(evidence, 'failure.png'), timeout: 2000 }).catch(() => {}); } throw error;
  } finally { await app.close(); fs.rmSync(root, { recursive: true, force: true }); }
});
