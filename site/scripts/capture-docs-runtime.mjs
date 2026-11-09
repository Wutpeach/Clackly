// Real Electron/Core/preload/Python capture with isolated storage and no Resolve connection.
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
const site = path.resolve(fileURLToPath(new URL('../', import.meta.url)));
const repository = path.dirname(site);
const appRoot = path.resolve(site, '../resolve-command-center');
const require = createRequire(path.join(appRoot, 'package.json'));
const { _electron } = require('playwright');
const root = await mkdtemp(path.join(tmpdir(), 'clackly-docs-runtime-'));
const out = path.join(site, 'public/images/docs');
await mkdir(out, { recursive: true });
// Compare from the repository root: pathspecs from site/ would match nothing.
// Main has newer test orchestration and Skill prose; production runtime and
// executable examples must still match the public release.
const testOnly = new Set([
  'resolve-command-center/extensions/extensionView-edit-ui.integration.js',
  'resolve-command-center/extensions/extensionView-focus.integration.js',
  'resolve-command-center/extensions/prepare-ui.integration.js',
  'resolve-command-center/scripts/test-groups.js',
  'resolve-command-center/scripts/test-groups.test.js'
]);
const releaseDifferences = execFileSync('git', ['diff', '--name-only', 'v0.1.6', '--', 'resolve-command-center', 'skills/clackly-developer'],
  { cwd: repository, encoding: 'utf8' }).trim().split(/\r?\n/).filter(Boolean);
assert.deepEqual(releaseDifferences.filter(file => !testOnly.has(file)
  && !(file.startsWith('skills/clackly-developer/') && file.endsWith('.md'))), [], 'Production code differs from v0.1.6');
const archive = path.join(root, 'summary.clackly');
execFileSync('python', [path.resolve(site, '../skills/clackly-developer/scripts/package_extension.py'),
  path.resolve(site, '../skills/clackly-developer/examples/run-summary'), archive], { windowsHide: true });
const env = { ...process.env, CLACKLY_UI_TEST_ROOT: root, CLACKLY_UI_TEST_PACKAGE: archive };
delete env.ELECTRON_RUN_AS_NODE;
const entry = path.join(root, 'capture.cjs');
await writeFile(entry, 'global.docsRequire = require; require(' + JSON.stringify(path.join(appRoot, 'extensions/commandUi-electron-fixture.js')) + ');');
const app = await _electron.launch({ args: [entry, '--force-device-scale-factor=2'], env });
const receipts = [];
const errors = [];
try {
  const palette = await app.firstWindow();
  palette.on('pageerror', error => errors.push(error.message));
  await app.evaluate(() => new Promise(resolve => {
    const check = () => global.commandUiTest ? resolve() : setTimeout(check, 25); check();
  }));
  await app.evaluate(({ ipcMain, dialog, clipboard, BrowserWindow }, appRoot) => {
    const require = global.docsRequire;
    const { core } = global.commandUiTest;
    core.extensions.uninstall('test.command-ui', true);
    core.extensions.saveConfig('clackly.demo.run-summary', { prefix: 'Review' });
    for (const name of ['interactions:list', 'feature-status:list', 'feature-status:refresh']) ipcMain.removeHandler(name);
    require(appRoot + '/feature-ui/registerIpc').registerFeatureUiIpc({ ipcMain, dialog,
      featureCatalog: core.featureCatalog, configManager: core.configManager, featureStatusManager: core.featureStatusManager,
      interactionManager: { listBindings: () => [] }, openSettings() {}, closeSettings() {} });
    for (const name of ['list', 'preview', 'cancel', 'install', 'set-enabled', 'uninstall', 'save-config']) ipcMain.removeHandler('extensions:' + name);
    require(appRoot + '/extensions/registerIpc').registerExtensionIpc({ ipcMain, dialog, extensions: core.extensions,
      getSettingsWindow: () => global.docsSettings, getWindows: () => BrowserWindow.getAllWindows() });
    require(appRoot + '/electron/main/developerSkill').registerDeveloperSkillIpc({ ipcMain,
      appRoot: require('node:path').dirname(appRoot), clipboard, shell: { openPath: async () => '' },
      getSettingsWindow: () => global.docsSettings, getLocale: () => core.localizationService.getSnapshot().effectiveLocale });
    ipcMain.handle('updates:get-state', () => ({ status: 'idle', currentVersion: '0.1.6' }));
    global.docsSettings = require(appRoot + '/electron/main/window').openSettingsWindow(null);
    global.docsSettings.webContents.setBackgroundThrottling(false);
  }, appRoot);
  const settings = app.windows().find(page => page.url().includes('settings')) || await app.waitForEvent('window');
  settings.on('pageerror', error => errors.push(error.message));
  const capture = async (page, name, locale, target = page) => {
    console.log('Capturing ' + name + '-' + locale);
    const window = await app.browserWindow(page);
    await window.evaluate(window => { window.show(); window.focus(); window.webContents.setBackgroundThrottling(false); });
    await page.mouse.move(4, 4);
    await page.waitForFunction(() => document.fonts.status === 'loaded', null, { timeout: 5000 });
    const bytes = await target.screenshot({ animations: 'disabled', timeout: 10000 });
    const image = sharp(bytes); const metadata = await image.metadata();
    assert(metadata.width > 400 && metadata.height > 200);
    const encoded = await image.webp({ lossless: true, effort: 6 }).toBuffer();
    await writeFile(path.join(out, name + '-' + locale + '.webp'), encoded);
    receipts.push({ file: name + '-' + locale + '.webp', width: metadata.width, height: metadata.height,
      bytes: encoded.length, sha256: createHash('sha256').update(encoded).digest('hex') });
  };
  const summaryId = 'extension:clackly.demo.run-summary/summary';
  // Execute the official non-Resolve example once: Recent comes from a real successful Python run.
  const commandWindow = app.waitForEvent('window');
  await palette.evaluate(id => window.resolveCommandCenter.executeCommand(id), summaryId);
  const command = await commandWindow;
  await command.locator('#setting-title').fill('Review notes');
  await command.getByRole('switch').uncheck();
  await command.locator('.command-confirm input').check();
  await command.getByRole('button', { name: 'Run command', exact: true }).click();
  await command.getByRole('button', { name: 'Copy result', exact: true }).waitFor();
  await command.keyboard.press('Escape').catch(error => { if (!command.isClosed()) throw error; });
  await app.evaluate(() => {
    const { core } = global.commandUiTest;
    const marker = core.listCommands().find(command => command.id === 'timeline.addMarker');
    if (!marker) throw Error('Marker command missing');
    core.preferences.setCommandPinned(marker.id, true);
  });
  for (const locale of ['zh', 'en']) {
    await app.evaluate((_electron, locale) => global.commandUiTest.core.localizationService.setLocalePreference(locale === 'zh' ? 'zh-CN' : 'en'), locale);
    await palette.reload(); await palette.locator('#launcher-pinned').waitFor();
    await palette.locator('#launcher-recent').waitFor();
    await capture(palette, 'launcher', locale);
    await palette.locator('.launcher-search').click();
    await palette.locator('input').fill('摘要');
    await palette.locator('.command-row').filter({ hasText: '生成运行摘要' }).waitFor();
    await capture(palette, 'search', locale);
    await palette.keyboard.press('Escape');
    await settings.reload(); await settings.locator('.settings-titlebar').waitFor();
    await settings.locator('.feature-button').filter({ hasText: locale === 'zh' ? '导出到 After Effects' : 'Export to After Effects' }).click();
    await settings.locator('#feature-title').waitFor();
    await capture(settings, 'settings', locale);
    await settings.getByRole('button', { name: locale === 'zh' ? '扩展' : 'Extensions', exact: true }).click();
    await settings.locator('.extension-row').waitFor();
    await settings.getByText('Clackly Developer Skill', { exact: true }).waitFor();
    await capture(settings, 'developer-skill', locale, settings.locator('.developer-skill-section'));
    await settings.locator('.extension-row').click();
    await settings.locator('.extension-commands').waitFor();
    await capture(settings, 'extensions', locale);
    const next = app.waitForEvent('window');
    await palette.evaluate(id => window.resolveCommandCenter.executeCommand(id), summaryId);
    const form = await next;
    form.on('pageerror', error => errors.push(error.message));
    await form.locator('#setting-title').fill(locale === 'zh' ? '审阅备注' : 'Review notes');
    await capture(form, 'command-ui', locale);
    await form.keyboard.press('Escape').catch(error => { if (!form.isClosed()) throw error; });
  }
  assert.deepEqual(errors, []);
  const requestCount = await app.evaluate(() => global.commandUiTest.requests.length);
  assert.equal(requestCount, 1, 'Only the non-Resolve example should execute');
  await writeFile(path.join(out, 'provenance.json'), JSON.stringify({
    date: '2026-11-09', version: '0.1.6', sourceCommit: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: site, encoding: 'utf8' }).trim(),
    releaseDifferences,
    capture: 'Real Electron 36.3.2, Windows, production built renderer/preload/Core/IPC and official Run Summary Python',
    script: 'site/scripts/capture-docs-runtime.mjs', data: 'Temporary isolated AppData; official Run Summary package; one real successful non-Resolve Python execution; one pinned built-in',
    limitations: 'No Resolve connection or native Workflow Integration acceptance. Extension readiness and update-state adapters are test fixtures; version display is pinned to public 0.1.6, no update request made. Example-authored Chinese field labels remain in both UI languages. Content captures exclude OS frames/shadows.',
    receipts
  }, null, 2) + String.fromCharCode(10));
  console.log(JSON.stringify({ output: out, screenshots: receipts.length, requestCount, isolatedRoot: root }));
} finally { await app.close(); }
