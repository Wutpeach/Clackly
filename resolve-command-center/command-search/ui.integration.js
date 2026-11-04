const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const { createClacklyCore } = require('../app/createClacklyCore');
const { workspace, manifest } = require('../extensions/fixtures');

test('Palette unifies source identity, durable Pin/Recent, failures and extension lifecycle', { timeout: 90000 }, async (t) => {
  const { directory, pack } = workspace(t);
  const appRoot = path.resolve(__dirname, '..');
  const appDataPath = path.join(directory, 'appdata');
  const scriptId = 'resolve-workspace-script:c:/scripts/utility/add marker.py';
  const luaId = 'resolve-workspace-script:c:/system/edit/add marker.lua';
  const scripts = [
    { id: scriptId, name: 'Add Marker', category: 'Utility', nesting: ['Review'], source: 'user', language: 'python' },
    { id: luaId, name: 'Add Marker', category: 'Edit', nesting: [], source: 'system', language: 'lua' }
  ];
  let discoveryFailed = false, invocation = 'api_returned', pinWriteFailed = false;
  const executions = [];
  const makeCore = () => {
    const instance = createClacklyCore({ appRoot, appDataPath, temporaryRoot: directory,
      hostContextProvider: async () => { throw new Error('Offline test'); },
      installationPathsProvider: { getSnapshot: async () => ({}) },
      markerBackends: { resolveScriptApi: { isAvailable: async () => true, addMarker: async () => ({ ok: true }) } },
      imageClipboard: { clipboard: { readPng: async () => null }, picturesPath: directory,
        resolveMediaPool: { isAvailable: async () => false, getCurrentProjectName: async () => null, importMediaToBin: async () => null } },
      afterEffectsProcessProbeFactory: () => ({ prewarm: async () => false, query: async () => ({}), getForegroundProcessName: async () => '', dispose() {} }),
      ordinaryScriptsFactory: () => ({
        discover: async () => discoveryFailed ? { scripts: [], diagnostics: [{ code: 'transport_unavailable' }] } : { scripts, diagnostics: [] },
        invoke: async (id) => { executions.push(id); return { status: invocation, apiReturn: null }; }
      })
    });
    instance.extensions.executePython = async ({ commandId }) => { executions.push(commandId); return { ok: true, logs: [] }; };
    instance.extensions.checkAvailability = async () => ({ ok: true });
    return instance;
  };
  let core = makeCore();
  const dispose = () => { core.disposeExportPythonWorker(); core.disposeAfterEffectsProcessProbe(); };
  const extensionManifest = (version = '1.0.0') => manifest({ version, configSchema: {},
    commands: [{ id: 'inspect', name: 'Add Marker', entry: 'inspect.py', keywords: ['inspection', '标记'] }] });
  const install = async (version) => {
    const preview = await core.extensions.preview(pack(extensionManifest(version)));
    await core.extensions.install(preview.token, preview.operation);
  };
  await install();
  const extensionId = 'extension:test.tools/inspect';
  const methods = {
    getLocalizationSnapshot: () => core.localizationService.getSnapshot(),
    listCommands: () => core.listCommands(), searchCommands: (...args) => core.searchCommands(...args),
    getPinnedCommandIds: () => core.preferences.getPinnedIds(),
    setCommandPinned: (...args) => { if (pinWriteFailed) throw new Error('disk full'); return core.preferences.setCommandPinned(...args); },
    listInteractionBindings: () => [], listFeatureStatuses: () => core.featureStatusManager.list(),
    refreshFeatureStatuses: () => core.featureStatusManager.refresh(),
    executeCommand: async (id) => {
      try { return await core.executeSearchResult(id); }
      catch (error) { throw new Error("Error invoking remote method 'commands:execute': Error: " + error.message); }
    }
  };
  const { preview } = await import('vite');
  let vite, browser;
  const errors = [];
  try {
    vite = await preview({ configFile: path.join(appRoot, 'vite.config.mjs'), logLevel: 'error',
      preview: { host: '127.0.0.1', port: 0, strictPort: false } });
    const edge = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
    browser = await chromium.launch({ headless: true, ...(fs.existsSync(edge) ? { executablePath: edge } : {}) });
    const context = await browser.newContext({ viewport: { width: 560, height: 420 } });
    await context.exposeFunction('searchTestCall', (name, args) => methods[name](...args));
    await context.addInitScript((names) => {
      window.resolveCommandCenter = { ...Object.fromEntries(names.map((name) => [name, (...args) => window.searchTestCall(name, args)])),
        openSettings() {}, hidePalette() {}, closeInteractionPanel() {}, openInteractionPanel: async () => null,
        executeInteraction: async () => ({ matched: false }), onPaletteShown: () => () => {},
        onLocalizationChanged: () => () => {}, onCommandsChanged: () => () => {} };
    }, Object.keys(methods));
    const page = await context.newPage();
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto('http://127.0.0.1:' + vite.httpServer.address().port, { waitUntil: 'networkidle' });
    const search = async () => {
      if (!await page.locator('.search-control input').count()) await page.locator('.launcher-search').click();
      await page.locator('.search-control input').fill('Add');
      await page.waitForFunction(() => {
        const names = [...document.querySelectorAll('.command-title')];
        return names.length > 0 && names.every((name) => name.textContent === 'Add Marker');
      });
    };
    const row = (source) => page.getByRole('option').filter({ hasText: source });
    const pin = async (source) => {
      await row(source).focus();
      await page.waitForFunction((source) => document.querySelector('.command-row[aria-selected="true"]')?.textContent.includes(source), source);
      await page.getByRole('button', { name: 'Pin Add Marker', exact: true }).click();
      await page.getByRole('button', { name: 'Unpin Add Marker', exact: true }).waitFor();
    };
    await search();
    assert.equal(await page.getByRole('option').count(), 4);
    for (const source of ['Clackly', 'Extension · Test Tools', 'User · Python', 'System · Lua']) assert.equal(await row(source).count(), 1);
    await pin('User · Python');
    assert.deepEqual(core.preferences.getPinnedIds(), [scriptId]);
    await page.waitForFunction(() => document.querySelector('.command-row')?.textContent.includes('User · Python'));
    assert.match(await page.getByRole('option').first().innerText(), /User · Python/);
    await page.locator('.search-control input').press('Escape');
    await row('User · Python').waitFor();
    assert.equal(await row('System · Lua').count(), 0, 'unused scripts do not fill Launcher');
    await row('User · Python').focus();
    await row('User · Python').press('Enter');
    await page.waitForFunction(() => !document.querySelector('[aria-busy="true"]'));
    assert.deepEqual(executions, [scriptId]);
    await search();
    await pin('Extension · Test Tools');
    await row('Extension · Test Tools').click();
    await page.waitForFunction(() => !document.querySelector('[aria-busy="true"]'));
    assert.ok(core.searchCommands('', []).usedCommandIds.includes(extensionId));
    dispose(); core = makeCore();
    await page.reload({ waitUntil: 'networkidle' });
    await row('User · Python').waitFor();
    await row('Extension · Test Tools').waitFor();
    assert.deepEqual(new Set(core.preferences.getPinnedIds()), new Set([scriptId, extensionId]));
    await row('User · Python').focus();
    await page.getByRole('button', { name: 'Unpin Add Marker', exact: true }).click();
    await page.getByRole('button', { name: 'Pin Add Marker', exact: true }).waitFor();
    assert.match(await row('User · Python').locator('xpath=ancestor::section[1]').innerText(), /recent/i);
    pinWriteFailed = true;
    await page.getByRole('button', { name: 'Pin Add Marker', exact: true }).click();
    await page.getByText(/Could not save pin/).waitFor();
    assert.equal(core.preferences.getPinnedIds().includes(scriptId), false);
    pinWriteFailed = false; invocation = 'not_submitted';
    await row('User · Python').focus(); await row('User · Python').press('Enter');
    await page.getByText(/could not accept/i).waitFor();
    const usage = () => JSON.parse(fs.readFileSync(path.join(appDataPath, 'Clackly/command-usage.json'), 'utf8'));
    assert.equal(usage()[scriptId].usageCount, 1);
    discoveryFailed = true;
    await page.reload({ waitUntil: 'networkidle' }); await search();
    await page.getByText(/Some Resolve scripts are unavailable/).waitFor();
    assert.equal(await row('User · Python').count(), 0);
    assert.equal(await row('Extension · Test Tools').count(), 1);
    discoveryFailed = false;
    await page.reload({ waitUntil: 'networkidle' }); await search();
    await row('User · Python').waitFor();
    assert.equal(await page.getByText(/Some Resolve scripts are unavailable/).count(), 0);
    for (const version of ['1.0.0', '1.1.0']) {
      await install(version);
      assert.ok(core.preferences.getPinnedIds().includes(extensionId));
      assert.ok(core.searchCommands('', []).usedCommandIds.includes(extensionId));
    }
    await core.extensions.setEnabled('test.tools', false);
    await page.reload({ waitUntil: 'networkidle' }); await search();
    assert.equal(await row('Extension · Test Tools').getAttribute('aria-disabled'), 'true');
    await assert.rejects(core.executeSearchResult(extensionId), { code: 'EXTENSION_DISABLED' });
    assert.equal(usage()[extensionId].usageCount, 1);
    await core.extensions.uninstall('test.tools', false);
    await page.reload({ waitUntil: 'networkidle' }); await search();
    assert.equal(await row('Extension · Test Tools').count(), 0);
    assert.ok(core.preferences.getPinnedIds().includes(extensionId));
    await install('1.2.0');
    assert.equal(core.extensions.list()[0].enabled, false, 'reinstall retains the saved disabled choice');
    await core.extensions.setEnabled('test.tools', true);
    await page.reload({ waitUntil: 'networkidle' }); await search();
    await row('Extension · Test Tools').waitFor();
    const evidence = path.join(appRoot, 'build/command-search-evidence');
    fs.mkdirSync(evidence, { recursive: true });
    await page.screenshot({ path: path.join(evidence, 'same-name-search.png') });
    const geometry = await page.locator('.palette-main').boundingBox();
    assert.equal(geometry.width, 240); assert.equal(geometry.height, 320);
    for (const height of await page.getByRole('option').evaluateAll((rows) => rows.map((r) => r.getBoundingClientRect().height))) assert.equal(height, 30);
    await page.locator('.search-control input').press('Escape');
    await row('User · Python').waitFor();
    await page.screenshot({ path: path.join(evidence, 'pinned-recent-launcher.png') });
    assert.deepEqual(errors, []);
  } finally { await browser?.close(); await new Promise((resolve) => vite ? vite.httpServer.close(resolve) : resolve()); dispose(); }
});
