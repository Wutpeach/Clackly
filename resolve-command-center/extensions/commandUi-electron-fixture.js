// Isolated real-Electron transport fixture. Never loads Resolve or user state.
const { app, ipcMain, BrowserWindow, dialog, clipboard } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const { execFileSync } = require('node:child_process');
const { createClacklyCore } = require('../app/createClacklyCore');
const { createExtensionPythonExecutor } = require('./python');
const { createCommandUiHost } = require('./CommandUiHost');
const { RuntimeLauncher } = require('../script-runtime/runtime/launcher');
const { createPaletteWindow, createCommandWindow, hidePaletteWindow, showPaletteWindow } = require('../electron/main/window');
const { selectPaletteHostPolicy } = require('../electron/main/paletteHostPolicy');
const { registerLocalizationIpc } = require('../localization/registerIpc');
const { registerExtensionIpc } = require('./registerIpc');
const { zipBuffer } = require('../electron/main/update/fixtures');

const root = process.env.CLACKLY_UI_TEST_ROOT;
if (!root || !path.isAbsolute(root)) throw new Error('Isolated test root required');
app.setPath('userData', path.join(root, 'electron'));
app.whenReady().then(async () => {
  const appRoot = path.resolve(__dirname, '..');
  const core = createClacklyCore({ appRoot, appDataPath: root, temporaryRoot: root,
    hostContextProvider: async () => { throw new Error('No Resolve in isolated Electron test'); },
    installationPathsProvider: { getSnapshot: async () => ({}) },
    markerBackends: { resolveScriptApi: { isAvailable: async () => false } },
    imageClipboard: { clipboard: { readPng: async () => null }, picturesPath: root,
      resolveMediaPool: { isAvailable: async () => false, getCurrentProjectName: async () => 'Isolated', importMediaToBin: async () => ({}) } },
    afterEffectsProcessProbeFactory: () => ({ prewarm: async () => false, query: async () => ({}), getForegroundProcessName: async () => '', dispose() {} }),
    ordinaryScriptsFactory: () => ({ discover: async () => ({ scripts: [] }), invoke: async () => ({ status: 'not_submitted' }) })
  });
  const executable = execFileSync('python', ['-c', 'import sys; print(sys.executable)'], { encoding: 'utf8', windowsHide: true }).trim();
  const executor = createExtensionPythonExecutor({
    resolveAndProbe: async () => ({ resolution: { source: 'override', executable }, selectedBootstrap: path.join(appRoot, 'script-runtime/runtime/bootstrap.py'), readiness: {} }),
    launcher: new RuntimeLauncher()
  });
  const requests = [];
  core.extensions.executePython = (request) => { requests.push({ input: request.input, config: request.config }); return executor(request); };
  core.extensions.checkAvailability = async () => ({ ok: true });
  const install = async (file) => { const preview = await core.extensions.preview(file); await core.extensions.install(preview.token, preview.operation); await core.extensions.refreshAvailability(); };
  await install(process.env.CLACKLY_UI_TEST_PACKAGE);
  core.extensions.saveConfig('clackly.demo.run-summary', { prefix: 'Saved prefix' });
  const fixtureManifest = { schemaVersion: 1, id: 'test.command-ui', version: '1.0.0', name: 'Test commands', commands: [
    { id: 'legacy', name: 'Legacy direct', entry: 'main.py' },
    { id: 'error', name: 'Raise failure', entry: 'main.py' },
    { id: 'timeout', name: 'Timeout command', entry: 'main.py' },
    { id: 'malformed', name: 'Malformed result', entry: 'main.py' },
    { id: 'business', name: 'Business failure', entry: 'main.py' },
    { id: 'multiline', name: 'Multiline message', entry: 'main.py' },
    { id: 'long-message', name: 'Long message', entry: 'main.py' },
    { id: 'input', name: 'Bounded input', entry: 'main.py', ui: { version: 1, inputs: {
      count: { type: 'number', label: 'Count', min: 1, max: 3, default: 2, required: true },
      flag: { type: 'boolean', label: 'Flag', required: true },
      color: { type: 'color', label: 'Optional color' }
    } } },
    { id: 'confirm', name: 'Confirm only', entry: 'main.py', ui: { version: 1, confirm: { message: 'Confirm this test operation.' } } }
  ] };
  const source = [
    'import time', 'def execute(context):', '    command = context.command_id.rsplit("/", 1)[-1]',
    '    if command == "timeout": time.sleep(12)', '    if command == "error": raise ValueError("Test failure reason")',
    '    if command == "malformed": return {"$clackly": "result", "version": 2}',
    '    if command == "business": return {"$clackly": "result", "version": 1, "status": "error", "message": "No matching entries", "diagnostic": "Try another selection"}',
    '    if command == "multiline": return {"$clackly": "result", "version": 1, "status": "success", "message": "Line one\\n" * 20}',
    '    if command == "long-message": return {"$clackly": "result", "version": 1, "status": "success", "message": "Readable result " * 20}',
    '    if command == "legacy": return {"message": "legacy payload", "items": ["not UI"]}',
    '    time.sleep(1)',
    '    return {"$clackly": "result", "version": 1, "status": "success", "message": "Input accepted", "text": str(context.input)}'
  ].join('\n');
  const fixture = path.join(root, 'fixture.clackly');
  fs.writeFileSync(fixture, zipBuffer([['manifest.json', JSON.stringify(fixtureManifest)], ['main.py', source]]));
  await install(fixture);
  core.localizationService.setLocalePreference('en');
  const palette = createPaletteWindow(selectPaletteHostPolicy({ host: 'standalone', platform: process.platform }));
  const windows = [];
  const host = createCommandUiHost({ extensions: core.extensions, execute: core.executeSearchResult,
    createWindow: (options) => { const window = createCommandWindow(options); windows.push(window); return window; },
    hidePalette: () => hidePaletteWindow(palette), showPalette: () => showPaletteWindow(palette), dialog, clipboard });
  ipcMain.handle('commands:execute', host.registerIpc(ipcMain, () => palette));
  ipcMain.handle('commands:list', () => core.listCommands());
  ipcMain.handle('commands:search', (_event, ...args) => core.searchCommands(...args));
  ipcMain.handle('commands:get-pins', () => core.preferences.getPinnedIds());
  ipcMain.handle('commands:set-pin', (_event, ...args) => core.preferences.setCommandPinned(...args));
  ipcMain.handle('interactions:list', () => []);
  ipcMain.handle('feature-status:list', () => core.featureStatusManager.list());
  ipcMain.handle('feature-status:refresh', (_event, id) => core.featureStatusManager.refresh(id));
  registerExtensionIpc({ ipcMain, dialog, extensions: core.extensions, getSettingsWindow: () => null, getWindows: () => [palette] });
  registerLocalizationIpc({ ipcMain, localizationService: core.localizationService, getWindows: () => BrowserWindow.getAllWindows() });
  ipcMain.on('palette:hide', () => hidePaletteWindow(palette));
  global.commandUiTest = { core, requests, windows, palette, host, clipboard, install };
  palette.once('ready-to-show', () => showPaletteWindow(palette));
}).catch((error) => { console.error(error); app.exit(1); });
app.on('window-all-closed', () => {});
