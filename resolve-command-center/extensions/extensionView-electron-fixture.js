// Isolated Core/IPC/installed packages/Python, never the user's Resolve or AppData.
const { app, ipcMain, BrowserWindow, clipboard, dialog } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { createClacklyCore } = require('../app/createClacklyCore');
const { createExtensionPythonExecutor } = require('./python');
const { RuntimeLauncher } = require('../script-runtime/runtime/launcher');
const { createExtensionViewHost } = require('./ExtensionViewHost');
const { createCommandUiHost } = require('./CommandUiHost');
const { createPaletteWindow, createExtensionWindow, createCommandWindow, hidePaletteWindow, showPaletteWindow } = require('../electron/main/window');
const { registerLocalizationIpc } = require('../localization/registerIpc');
const { zipBuffer } = require('../electron/main/update/fixtures');
const root = process.env.CLACKLY_VIEW_TEST_ROOT;
if (!root || !path.isAbsolute(root)) throw new Error('Isolated test root required');
app.setPath('userData', path.join(root, 'electron'));
app.whenReady().then(async () => {
  const appRoot = path.resolve(__dirname, '..');
  const core = createClacklyCore({ appRoot, appDataPath: root, temporaryRoot: root,
    hostContextProvider: async () => { throw new Error('No live Resolve'); }, installationPathsProvider: { getSnapshot: async () => ({}) },
    markerBackends: { resolveScriptApi: { isAvailable: async () => false } },
    imageClipboard: { clipboard: { readPng: async () => null }, picturesPath: root,
      resolveMediaPool: { isAvailable: async () => false, getCurrentProjectName: async () => 'Isolated', importMediaToBin: async () => ({}) } },
    afterEffectsProcessProbeFactory: () => ({ prewarm: async () => false, query: async () => ({}), getForegroundProcessName: async () => '', dispose() {} }),
    ordinaryScriptsFactory: () => ({ discover: async () => ({ scripts: [] }), invoke: async () => ({ status: 'not_submitted' }) }) });
  const executable = execFileSync('python', ['-c', 'import sys; print(sys.executable)'], { encoding: 'utf8', windowsHide: true }).trim();
  const fakeModule = path.join(root, 'fake-resolve.py'); fs.copyFileSync(process.env.CLACKLY_VIEW_TEST_MODULE || path.join(__dirname, 'fixtures/view-resolve.py'), fakeModule);
  const environmentFile = path.join(root, 'view-environment.json');
  const setEnvironment = (value) => fs.writeFileSync(environmentFile, JSON.stringify(value));
  setEnvironment({ project: 'p1', timeline: 't1', markers: {} });
  const executor = createExtensionPythonExecutor({ resolveAndProbe: async () => ({ resolution: { source: 'override', executable },
    selectedBootstrap: path.join(appRoot, 'script-runtime/runtime/bootstrap.py'), readiness: { bridge: { modulePath: fakeModule, libraryPath: fakeModule } } }), launcher: new RuntimeLauncher() });
  const requests = [];
  core.extensions.executePython = (request) => { requests.push({ phase: request.phase || 'execute', view: request.view }); return executor(request); };
  core.extensions.checkAvailability = async () => ({ ok: true });
  const install = async (file) => { const p = await core.extensions.preview(file); await core.extensions.install(p.token, p.operation); };
  await install(process.env.CLACKLY_VIEW_TEST_PACKAGE);
  const source = path.resolve(__dirname, '../../skills/clackly-developer/examples/marker-browser');
  const manifest = JSON.parse(fs.readFileSync(path.join(source, 'manifest.json'), 'utf8'));
  const secondPackage = path.join(root, 'second.clackly');
  fs.writeFileSync(secondPackage, zipBuffer([['manifest.json', JSON.stringify({ ...manifest, id: 'test.other-view', name: 'Other tool' })], ['markers.py', fs.readFileSync(path.join(source, 'markers.py'))]]));
  await install(secondPackage);
  const commandPackage = path.join(root, 'command.clackly');
  fs.writeFileSync(commandPackage, zipBuffer([['manifest.json', JSON.stringify({ schemaVersion: 1, id: 'test.static-command', version: '1.0.0', name: 'Static command', commands: [
    { id: 'run', name: 'Command compatibility', entry: 'main.py', ui: { version: 1, inputs: { title: { type: 'string', label: 'Title', default: 'Still works' } } } }] })],
    ['main.py', ['def execute(context):', '    return {"$clackly":"result","version":1,"status":"success","message":"Command completed","text":context.input["title"]}'].join('\n')]]));
  await install(commandPackage);
  const palette = createPaletteWindow(); const windows = [];
  const hidePalette = () => hidePaletteWindow(palette), showPalette = () => showPaletteWindow(palette);
  const viewHost = createExtensionViewHost({ extensions: core.extensions, clipboard, dialog, hidePalette, recordUsage: core.recordViewOpened,
    createWindow: (id, title) => { const w = createExtensionWindow(id, title); windows.push(w); return w; } });
  viewHost.registerIpc(ipcMain);
  const commands = createCommandUiHost({ extensions: core.extensions, execute: core.executeSearchResult, createWindow: createCommandWindow,
    hidePalette, showPalette, dialog, clipboard, openView: viewHost.start });
  ipcMain.handle('commands:execute', commands.registerIpc(ipcMain, () => palette));
  ipcMain.handle('commands:search', (_event, ...args) => core.searchCommands(...args));
  ipcMain.handle('commands:list', () => core.listCommands());
  ipcMain.handle('interactions:list', () => []);
  ipcMain.handle('feature-status:list', () => core.featureStatusManager.list());
  ipcMain.handle('commands:get-pins', () => core.preferences.getPinnedIds());
  ipcMain.handle('commands:set-pin', (_event, id, pinned) => core.preferences.setCommandPinned(id, pinned));
  ipcMain.on('palette:hide', hidePalette);
  registerLocalizationIpc({ ipcMain, localizationService: core.localizationService, getWindows: () => BrowserWindow.getAllWindows() });
  global.viewTest = { core, windows, palette, requests, setEnvironment, readEnvironment: () => JSON.parse(fs.readFileSync(environmentFile, 'utf8')), install, secondPackage, clipboard, viewHost };
  app.on('will-quit', () => { viewHost.dispose(); commands.dispose(); core.disposeExportPythonWorker(); core.disposeAfterEffectsProcessProbe(); });
}).catch((error) => { console.error(error); app.exit(1); });
app.on('window-all-closed', () => {});
