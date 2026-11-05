const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { chromium } = require('playwright');
const { createClacklyCore } = require('../app/createClacklyCore');
const { RuntimeLauncher } = require('../script-runtime/runtime/launcher');
const { createExtensionPythonExecutor } = require('./python');
const { workspace, manifest } = require('./fixtures');

test('running Settings and Palette complete the local package lifecycle using real Core, filesystem and Python', { timeout: 90000 }, async (t) => {
  const { directory, pack } = workspace(t);
  const appRoot = path.resolve(__dirname, '..');
  const core = createClacklyCore({ appRoot, appDataPath: path.join(directory, 'appdata'), temporaryRoot: directory,
    hostContextProvider: async () => { throw new Error('Offline UI fixture has no Resolve host'); },
    installationPathsProvider: { getSnapshot: async () => ({}) },
    markerBackends: { resolveScriptApi: { isAvailable: async () => true, addMarker: async () => ({ ok: true }) } },
    imageClipboard: { clipboard: { readPng: async () => null }, picturesPath: directory,
      resolveMediaPool: { isAvailable: async () => true, getCurrentProjectName: async () => 'Fixture', importMediaToBin: async () => ({}) } },
    afterEffectsProcessProbeFactory: () => ({ prewarm: async () => false, query: async () => ({}), getForegroundProcessName: async () => '', dispose() {} }),
    ordinaryScriptsFactory: () => ({ discover: async () => ({ scripts: [] }), invoke: async () => ({ status: 'not_submitted' }) })
  });
  const executable = execFileSync('python', ['-c', 'import sys; print(sys.executable)'], { encoding: 'utf8', windowsHide: true }).trim();
  core.extensions.executePython = createExtensionPythonExecutor({
    resolveAndProbe: async () => ({ resolution: { source: 'override', executable }, selectedBootstrap: path.join(appRoot, 'script-runtime/runtime/bootstrap.py'), readiness: {} }),
    launcher: new RuntimeLauncher()
  });
  core.extensions.checkAvailability = async () => ({ ok: true });
  let nextPackage = pack();
  let lastExecution;
  const methods = {
    getPinnedCommandIds: () => core.preferences.getPinnedIds(),
    setCommandPinned: (...args) => core.preferences.setCommandPinned(...args),
    getLocalizationSnapshot: () => core.localizationService.getSnapshot(),
    listCommands: () => core.listCommands(), searchCommands: (...args) => core.searchCommands(...args),
    listInteractionBindings: () => [], listFeatures: () => core.featureCatalog.getAllFeatures(),
    listFeatureStatuses: () => core.featureStatusManager.list(), refreshFeatureStatuses: (...args) => core.featureStatusManager.refresh(...args),
    getConfig: (...args) => core.configManager.get(...args), saveConfig: (id, values) => core.configManager.save(id, values, { requireComplete: true }),
    listExtensions: () => core.extensions.list(), previewExtension: () => core.extensions.preview(nextPackage),
    cancelExtensionPreview: (...args) => core.extensions.cancel(...args), installExtension: (...args) => core.extensions.install(...args),
    setExtensionEnabled: (...args) => core.extensions.setEnabled(...args), uninstallExtension: (...args) => core.extensions.uninstall(...args),
    saveExtensionConfig: (...args) => core.extensions.saveConfig(...args),
    executeCommand: async (id) => { lastExecution = await core.executeSearchResult(id); return lastExecution; }
  };
  const { preview } = await import('vite');
  let vite, browser;
  const errors = [];
  try {
    // Exercise the shipped renderer without racing the dev server's dependency optimizer.
    vite = await preview({ configFile: path.join(appRoot, 'vite.config.mjs'), logLevel: 'error',
      preview: { host: '127.0.0.1', port: 0, strictPort: false } });
    const edge = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
    browser = await chromium.launch({ headless: true, ...(fs.existsSync(edge) ? { executablePath: edge } : {}) });
    const context = await browser.newContext({ viewport: { width: 760, height: 560 } });
    await context.exposeFunction('extensionTestCall', (name, args) => methods[name](...args));
    await context.addInitScript((names) => {
      window.extensionChanged = [];
      const api = Object.fromEntries(names.map((name) => [name, (...args) => window.extensionTestCall(name, args)]));
      Object.assign(api, { closeSettings() {}, openSettings() {}, closeInteractionPanel() {}, hidePalette() {},
        openInteractionPanel: async () => null, executeInteraction: async () => ({ matched: false }), pickPath: async () => null,
        onSettingsFeatureSelected: () => () => {}, onLocalizationChanged: () => () => {}, onPaletteShown: () => () => {},
        onCommandsChanged: (callback) => { window.extensionChanged.push(callback); return () => { window.extensionChanged = window.extensionChanged.filter((item) => item !== callback); }; } });
      window.resolveCommandCenter = api;
    }, Object.keys(methods));
    const settings = await context.newPage();
    const palette = await context.newPage();
    for (const page of [settings, palette]) { page.on('pageerror', (error) => errors.push(error.message)); await page.route('**/favicon.ico', (route) => route.fulfill({ status: 204 })); }
    const unsubscribe = core.extensions.subscribe(() => {
      for (const page of [settings, palette]) page.evaluate(() => window.extensionChanged.forEach((callback) => callback())).catch(() => {});
    });
    const origin = 'http://127.0.0.1:' + vite.httpServer.address().port;
    await settings.goto(origin + '/?view=settings', { waitUntil: 'networkidle' });
    await palette.goto(origin, { waitUntil: 'networkidle' });
    await settings.getByRole('button', { name: 'Extensions', exact: true }).click();
    await settings.getByRole('button', { name: 'Install…', exact: true }).click();
    const dialog = settings.getByRole('dialog');
    await dialog.waitFor();
    assert.match(await dialog.innerText(), /not sandboxed/);
    await dialog.getByRole('button', { name: 'Install Extension', exact: true }).click();
    await settings.getByRole('button', { name: /Test Tools.*1.0.0/ }).click();
    await settings.getByLabel('Label').fill('saved in running UI');
    await settings.getByRole('button', { name: 'General Settings', exact: true }).click();
    await dialog.waitFor();
    await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
    assert.equal(await settings.getByLabel('Label').inputValue(), 'saved in running UI');
    await settings.getByRole('button', { name: 'Save changes', exact: true }).click();
    await settings.getByRole('button', { name: 'Save changes', exact: true }).waitFor({ state: 'visible' });
    await settings.waitForFunction(() => document.querySelector('#setting-label')?.value === 'saved in running UI' && document.querySelector('.settings-actions .primary-button')?.disabled);
    await palette.locator('.launcher-search').click();
    await palette.locator('.search-control input').fill('Inspect project');
    await palette.getByRole('option', { name: /Inspect project/ }).waitFor();
    await palette.getByRole('option', { name: /Inspect project/ }).click();
    await palette.waitForFunction(() => !document.querySelector('[aria-busy="true"]'));
    await new Promise((resolve) => {
      const deadline = Date.now() + 10000;
      const check = () => lastExecution ? resolve() : Date.now() > deadline ? resolve() : setTimeout(check, 25);
      check();
    });
    assert.equal(lastExecution?.result.label, 'saved in running UI');
    const evidence = path.join(appRoot, 'build/extension-v1-evidence'); fs.mkdirSync(evidence, { recursive: true });
    await settings.screenshot({ path: path.join(evidence, 'settings-extension-detail.png') });
    nextPackage = pack(manifest({ commands: [{ id: 'inspect', name: 'Changed live', entry: 'inspect.py' }] }));
    await settings.getByRole('button', { name: 'Install…', exact: true }).click();
    await dialog.getByRole('button', { name: 'Replace Same Version', exact: true }).waitFor();
    await settings.screenshot({ path: path.join(evidence, 'settings-replace-confirmation.png') });
    await dialog.getByRole('button', { name: 'Replace Same Version', exact: true }).click();
    await settings.getByText('Extension installed. Commands are available without restarting.', { exact: true }).waitFor();
    assert.equal(core.searchCommands('Inspect project', []).commands.length, 0);
    assert.equal(core.searchCommands('Changed live', []).commands[0].id, 'extension:test.tools/inspect');
    await palette.getByRole('option', { name: /Inspect project/ }).waitFor({ state: 'hidden' });
    await palette.locator('.search-control input').fill('Changed live');
    await palette.getByRole('option', { name: /Changed live/ }).waitFor();
    assert.equal(await settings.getByLabel('Label').inputValue(), 'saved in running UI');
    await settings.getByRole('button', { name: 'Disable', exact: true }).click();
    await settings.getByRole('button', { name: 'Enable', exact: true }).waitFor();
    assert.equal(core.searchCommands('Changed live', []).commands[0].featureStatus.enabled, false);
    await palette.waitForFunction(() => document.querySelector('[role="option"]')?.getAttribute('aria-disabled') === 'true');
    await settings.getByRole('button', { name: 'Enable', exact: true }).click();
    await settings.getByRole('button', { name: 'Disable', exact: true }).waitFor();
    nextPackage = pack(manifest({ version: '0.9.0' }));
    await settings.getByRole('button', { name: 'Install…', exact: true }).click();
    await dialog.getByRole('button', { name: 'Confirm Downgrade', exact: true }).click();
    await settings.getByText('Extension installed. Commands are available without restarting.', { exact: true }).waitFor();
    assert.equal(core.extensions.list()[0].version, '0.9.0');
    await settings.getByRole('button', { name: 'Uninstall', exact: true }).click();
    await dialog.getByRole('button', { name: 'Uninstall', exact: true }).click();
    await settings.getByText('Install a local .clackly package to add commands.', { exact: true }).waitFor();
    assert.equal(core.searchCommands('Inspect project', []).commands.length, 0);
    await assert.rejects(core.executeCommand('extension:test.tools/inspect'), /Unknown command/);
    core.localizationService.setLocalePreference('zh-CN');
    await settings.reload({ waitUntil: 'networkidle' });
    await settings.getByRole('button', { name: '扩展', exact: true }).click();
    nextPackage = pack();
    await settings.getByRole('button', { name: '安装…', exact: true }).click();
    await dialog.waitFor();
    assert.equal(await dialog.getByRole('button', { name: '取消', exact: true }).evaluate((element) => element === document.activeElement), true);
    await settings.keyboard.press('Escape');
    await dialog.waitFor({ state: 'hidden' });
    await settings.getByRole('button', { name: '安装…', exact: true }).click();
    await dialog.getByRole('button', { name: '安装扩展', exact: true }).click();
    await settings.getByRole('button', { name: /Test Tools.*1.0.0/ }).click();
    assert.equal(await settings.getByLabel('Label').inputValue(), 'saved in running UI');
    await settings.screenshot({ path: path.join(evidence, 'settings-extension-detail-zh-CN.png') });
    assert.deepEqual(errors, []);
    unsubscribe();
  } finally {
    await browser?.close();
    await new Promise((resolve) => vite ? vite.httpServer.close(resolve) : resolve());
    core.disposeAfterEffectsProcessProbe(); core.disposeExportPythonWorker();
  }
});
