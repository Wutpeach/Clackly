const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { _electron: electron } = require('playwright');
const { zipBuffer } = require('../electron/main/update/fixtures');

test('real Electron Launcher discovers extensions, navigates every row and refreshes package lifecycle', { timeout: 90000 }, async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'clackly-launcher-'));
  const evidence = path.resolve(__dirname, '../build/launcher-evidence');
  fs.mkdirSync(evidence, { recursive: true });
  const archive = path.join(root, 'summary.clackly');
  execFileSync('python', [path.resolve(__dirname, '../../skills/clackly-developer/scripts/package_extension.py'),
    path.resolve(__dirname, '../../skills/clackly-developer/examples/run-summary'), archive], { windowsHide: true });
  const extra = path.join(root, 'launcher.clackly');
  fs.writeFileSync(extra, zipBuffer([['manifest.json', JSON.stringify({
    schemaVersion: 1, id: 'test.launcher', name: 'Launcher Tools', version: '1.0.0',
    commands: Array.from({ length: 12 }, (_, index) => ({ id: `command-${index}`, name: `Launcher command ${index}`, entry: 'main.py' }))
  })], ['main.py', 'def execute(context):\n    return {}\n']]));
  const env = { ...process.env, CLACKLY_UI_TEST_ROOT: root, CLACKLY_UI_TEST_PACKAGE: archive };
  delete env.ELECTRON_RUN_AS_NODE;
  let app;
  try {
    app = await electron.launch({ args: [path.resolve(__dirname, '../extensions/commandUi-electron-fixture.js')], env });
    const page = await app.firstWindow();
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.waitForFunction(() => document.querySelectorAll('.launcher-list .command-row').length > 9);
    await app.evaluate(() => new Promise((resolve) => {
      const check = () => global.commandUiTest ? resolve() : setTimeout(check, 25); check();
    }));
    const rows = page.locator('.launcher-list .command-row');
    const selected = page.locator('.launcher-list .command-row[aria-selected="true"]');
    const initialCount = await rows.count();
    const sources = await rows.locator('.command-source').allTextContents();
    assert.equal(sources[0], 'Clackly');
    assert.match(sources[1], /^Extension · /, 'extension appears alongside builtins without search');
    const ordinary = page.locator('#launcher-commands').locator('..');
    await page.screenshot({ path: path.join(evidence, 'launcher-initial.png'), animations: 'disabled' });

    // Real install and production commands:changed subscription, with no reload/search.
    await app.evaluate((_electron, file) => global.commandUiTest.install(file), extra);
    await page.waitForFunction((count) => document.querySelectorAll('.launcher-list .command-row').length === count, initialCount + 12);
    assert.equal(await rows.filter({ hasText: 'Extension · Launcher Tools' }).count(), 12);
    await page.locator('.launcher-content').hover();
    await page.mouse.wheel(0, 600);
    await page.waitForFunction(() => document.querySelector('.launcher-content').scrollTop > 0);
    await page.locator('.palette-shell').focus();
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('ArrowUp');
    const titles = await rows.locator('.command-title').allTextContents();
    assert.deepEqual(await rows.locator('kbd').allTextContents(), ['1', '2', '3', '4', '5', '6', '7', '8', '9']);
    const assertSelection = async (index) => {
      await page.waitForFunction((expected) => document.querySelector('.launcher-list [aria-selected="true"] .command-title')?.textContent === expected, titles[index]);
      assert.equal(await selected.count(), 1);
      const visible = await selected.evaluate((row) => {
        const viewport = row.closest('.launcher-content').getBoundingClientRect();
        const rect = row.getBoundingClientRect();
        return rect.top >= viewport.top - 1 && rect.bottom <= viewport.bottom + 1;
      });
      assert.equal(visible, true, `row ${index} scrolls into view`);
    };
    await page.locator('.palette-shell').focus();
    for (let index = 0; index < titles.length; index += 1) {
      if (index) await page.keyboard.press('ArrowDown');
      await assertSelection(index);
    }
    await page.keyboard.press('ArrowDown'); await assertSelection(titles.length - 1);
    await page.screenshot({ path: path.join(evidence, 'launcher-scrolled.png'), animations: 'disabled' });
    for (let index = titles.length - 2; index >= 0; index -= 1) {
      await page.keyboard.press('ArrowUp'); await assertSelection(index);
    }
    await page.keyboard.press('ArrowUp'); await assertSelection(0);
    assert.equal(await page.locator('.launcher-content').evaluate((node) => node.scrollTop), 0);

    // Pin/unpin a command beyond the old limit; selection follows its new section.
    const tail = page.getByRole('option', { name: 'Launcher command 11', exact: true });
    await tail.focus();
    await page.getByRole('button', { name: 'Pin Launcher command 11', exact: true }).click();
    await page.locator('#launcher-pinned').waitFor();
    await page.waitForFunction(() => document.querySelector('.launcher-list [aria-selected="true"] .command-title')?.textContent === 'Launcher command 11');
    assert.match(await page.locator('#launcher-pinned').locator('..').innerText(), /Launcher command 11/);
    assert.equal(await tail.count(), 1);
    await page.getByRole('button', { name: 'Unpin Launcher command 11', exact: true }).click();
    await page.locator('#launcher-pinned').waitFor({ state: 'hidden' });
    await page.waitForFunction(() => document.querySelector('.launcher-list [aria-selected="true"] .command-title')?.textContent === 'Launcher command 11');
    assert.equal(await selected.getAttribute('data-command-index'), String(titles.length - 1));
    await assertSelection(titles.length - 1);

    // Disable keeps visible rows with their disabled state; uninstall clamps selection.
    await app.evaluate(() => global.commandUiTest.core.extensions.setEnabled('test.launcher', false));
    await page.waitForFunction(() => [...document.querySelectorAll('.command-row')].filter((row) => row.textContent.includes('Launcher Tools')).every((row) => row.getAttribute('aria-disabled') === 'true'));
    assert.equal(await rows.count(), initialCount + 12);
    await app.evaluate(() => global.commandUiTest.core.extensions.uninstall('test.launcher', false));
    await page.waitForFunction((count) => document.querySelectorAll('.launcher-list .command-row').length === count, initialCount);
    assert.equal(await selected.count(), 1);
    assert.equal(await rows.filter({ hasText: 'Launcher Tools' }).count(), 0);
    await app.evaluate((_electron, file) => global.commandUiTest.install(file), extra);
    await page.waitForFunction((count) => document.querySelectorAll('.launcher-list .command-row').length === count, initialCount + 12);
    await app.evaluate(() => global.commandUiTest.core.extensions.setEnabled('test.launcher', true));
    await page.waitForFunction(() => [...document.querySelectorAll('.command-row')].filter((row) => row.textContent.includes('Launcher Tools')).every((row) => row.getAttribute('aria-disabled') === 'false'));

    // Recent and Pinned still precede Commands, and neither duplicates its rows.
    await app.evaluate(async () => {
      await global.commandUiTest.core.executeSearchResult('extension:test.command-ui/legacy');
      global.commandUiTest.palette.webContents.send('commands:changed');
    });
    await page.locator('#launcher-recent').waitFor();
    assert.match(await page.locator('#launcher-recent').locator('..').innerText(), /Legacy direct/);
    await tail.focus();
    await page.getByRole('button', { name: 'Pin Launcher command 11', exact: true }).click();
    await page.locator('#launcher-pinned').waitFor();
    assert.deepEqual(await page.locator('.launcher-list h2').allTextContents(), ['Pinned', 'Recent', 'Commands']);
    assert.equal(await page.getByRole('option', { name: 'Legacy direct', exact: true }).count(), 1);
    assert.equal(await tail.count(), 1);
    assert.ok(await ordinary.locator('.command-row').count() > 9);
    await page.screenshot({ path: path.join(evidence, 'launcher-groups.png'), animations: 'disabled' });

    await page.locator('.launcher-search').click();
    await page.locator('.search-control input').fill('Launcher command');
    await page.waitForFunction(() => document.querySelectorAll('.search-view .command-row').length === 12);
    const expected = await app.evaluate(() => global.commandUiTest.core.searchCommands('Launcher command',
      global.commandUiTest.core.preferences.getPinnedIds()).commands.map(({ name }) => name));
    assert.deepEqual(await page.locator('.search-view .command-title').allTextContents(), expected, 'search retains Core relevance order');
    assert.deepEqual(await page.locator('.palette-main').evaluate((node) => {
      const { width, height } = node.getBoundingClientRect(); return [width, height];
    }), [240, 320]);
    assert.deepEqual(errors, []);
  } finally {
    await app?.close();
    fs.rmSync(root, { recursive: true, force: true });
  }
});
