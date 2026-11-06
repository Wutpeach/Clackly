// Shipped Settings/preload/Skill host, isolated storage, no Resolve connection.
const { app, BrowserWindow, ipcMain, clipboard, shell } = require('electron');
const path = require('node:path');
const root = process.env.CLACKLY_SKILL_TEST_ROOT;
const appRoot = process.env.CLACKLY_SKILL_TEST_APP;
if (!root || !appRoot || !path.isAbsolute(root) || !path.isAbsolute(appRoot)) throw new Error('Isolated roots required');
app.setPath('userData', path.join(root, 'electron'));
const { registerDeveloperSkillIpc } = require(path.join(appRoot, 'electron/main/developerSkill'));
app.whenReady().then(async () => {
  let locale = 'en', failure = '', opened;
  const window = new BrowserWindow({ width: 760, height: 560, useContentSize: true, show: false,
    webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: false, backgroundThrottling: false,
      preload: path.join(appRoot, 'electron/main/preload.js') } });
  registerDeveloperSkillIpc({ ipcMain, appRoot: process.env.CLACKLY_SKILL_TEST_RESOURCES || appRoot, getSettingsWindow: () => window, getLocale: () => locale,
    clipboard: { writeText(text) { if (failure === 'copy') throw new Error('Clipboard denied'); clipboard.writeText(text); }, readText: () => clipboard.readText() },
    shell: { openPath: async (directory) => {
      if (failure === 'open') return 'Access denied';
      opened = directory;
      return process.env.CLACKLY_SKILL_TEST_OPEN === '1' ? shell.openPath(directory) : '';
    } } });
  for (const name of ['features:list', 'commands:list', 'interactions:list', 'feature-status:list', 'feature-status:refresh', 'extensions:list']) ipcMain.handle(name, () => []);
  const snapshot = () => ({ preference: locale, effectiveLocale: locale });
  ipcMain.handle('localization:get-snapshot', snapshot);
  ipcMain.handle('preferences:set-locale', (_event, value) => {
    locale = value; window.webContents.send('localization:changed', snapshot()); return snapshot();
  });
  ipcMain.handle('updates:get-state', () => ({ status: 'idle', currentVersion: '0.1.5' }));
  global.skillTest = { window, clipboard, opened: () => opened, fail: (value) => { failure = value; },
    missing: (directory) => {
      for (const name of ['developer-skill:get', 'developer-skill:copy', 'developer-skill:open']) ipcMain.removeHandler(name);
      registerDeveloperSkillIpc({ ipcMain, appRoot: directory, clipboard, shell, getSettingsWindow: () => window });
    },
    locale: (value) => { locale = value; window.webContents.send('localization:changed', snapshot()); } };
  await window.loadFile(path.join(appRoot, 'dist/renderer/index.html'), { query: { view: 'settings' } });
}).catch((error) => { console.error(error); app.exit(1); });
app.on('window-all-closed', () => {});
