const { validateInput, parseUiResult } = require('./commandUi');

// Both Electron hosts own the session, revision and execution; renderer sends input only.
function createCommandUiHost({ extensions, execute, createWindow, hidePalette, showPalette, dialog, clipboard }) {
  let session = null;
  let notification = null;
  let notificationTimer = null;
  let notificationState = null;
  const trusted = (event, window) => window && !window.isDestroyed()
    && event?.sender === window.webContents && event.senderFrame === window.webContents.mainFrame;
  function publish() {
    if (session?.window && !session.window.isDestroyed()) session.window.webContents.send('command-ui:changed', snapshot());
  }
  function snapshot() {
    if (!session) return null;
    const { command, phase, result, error } = session;
    return { command: { name: command.name, description: command.description, extensionName: command.extensionName, ui: command.ui },
      phase, result, error };
  }
  function open() {
    if (session.window && !session.window.isDestroyed()) { session.window.show(); session.window.focus(); return; }
    const current = session;
    current.window = createWindow();
    current.window.on('close', (event) => { if (current.phase === 'running') event.preventDefault(); });
    current.window.once('closed', () => { if (session === current) session = null; });
    current.window.once('ready-to-show', () => {
      if (session !== current) return;
      publish(); current.window.show(); current.window.focus();
    });
    hidePalette();
  }
  function notify(message) {
    clearTimeout(notificationTimer);
    if (notification && !notification.isDestroyed()) notification.destroy();
    const window = createWindow({ notification: true });
    notification = window;
    notificationState = { phase: 'notification', result: { message } };
    window.once('ready-to-show', () => {
      if (window.isDestroyed()) return;
      window.webContents.send('command-ui:changed', notificationState);
      window.showInactive();
      notificationTimer = setTimeout(() => { if (!window.isDestroyed()) window.close(); }, 2800);
    });
  }
  async function run(input, confirmed) {
    const current = session;
    current.phase = 'running'; publish();
    try {
      const receipt = await execute(current.command.id, { input, confirmed, revision: current.command.revision });
      if (session !== current) return receipt;
      const result = parseUiResult(receipt?.result);
      const meaningful = result && (result.message.length > 60 || /[\r\n]/.test(result.message)
        || result.text || result.fields?.length || result.items?.length || result.diagnostic);
      if (!result && !current.command.ui) { session = null; hidePalette(); return receipt; }
      current.result = result || { status: 'success', message: 'Command completed.' };
      if (current.result.status === 'success' && !meaningful) {
        current.phase = 'complete';
        current.window?.close(); session = null; hidePalette(); notify(current.result.message);
      } else { current.phase = current.result.status === 'error' ? 'error' : 'result'; open(); publish(); }
      return receipt;
    } catch (error) {
      if (session !== current) return;
      current.phase = 'error';
      current.result = error.uiResult || null;
      current.error = { timeout: /timeout|timed.out/i.test(String(error.code) + ' ' + error.message),
        reason: error.userMessage || null, kind: error.code === 'EXTENSION_STALE_COMMAND' ? 'stale'
          : error.code === 'EXTENSION_UI_INVALID' ? 'invalidResult' : 'failed',
        diagnostic: String(error.message || error).slice(0, 32768) };
      open(); publish();
    }
  }
  async function start(id) {
    if (session) { if (session.window) open(); return { dialog: true }; }
    const command = extensions.describeCommand(id);
    if (!command) { const result = await execute(id); hidePalette(); return result; }
    session = { command, phase: command.ui ? 'input' : 'running', window: null, result: null, error: null };
    if (command.ui) { open(); return { dialog: true }; }
    return run({}, false);
  }
  function registerIpc(ipcMain, getPaletteWindow) {
    ipcMain.handle('command-ui:get', (event) => {
      if (!trusted(event, session?.window) && !trusted(event, notification)) throw new Error('Command UI request rejected');
      return trusted(event, notification) ? notificationState : snapshot();
    });
    ipcMain.handle('command-ui:submit', async (event, values, confirmed) => {
      if (!trusted(event, session?.window) || session.phase !== 'input') throw new Error('Command UI request rejected');
      const input = validateInput(session.command.ui.inputs, values);
      if (session.command.ui.confirm && confirmed !== true) throw new Error('Please confirm this operation.');
      await run(input, confirmed === true);
    });
    ipcMain.handle('command-ui:pick', async (event, key) => {
      if (!trusted(event, session?.window) || session.phase !== 'input') throw new Error('Command UI request rejected');
      const current = session;
      const type = current.command.ui.inputs[key]?.type;
      if (!['path', 'folder'].includes(type)) throw new Error('Invalid picker field');
      const result = await dialog.showOpenDialog(current.window, { properties: [type === 'folder' ? 'openDirectory' : 'openFile'] });
      return session === current && current.phase === 'input' && !result.canceled ? result.filePaths[0] || null : null;
    });
    ipcMain.handle('command-ui:copy', (event) => {
      if (!trusted(event, session?.window) || !['result', 'error'].includes(session.phase)) throw new Error('Command UI request rejected');
      const result = session.result;
      clipboard.writeText([result?.message, result?.text,
        ...(result?.fields || []).map((field) => field.label + ': ' + field.value), ...(result?.items || []),
        result?.diagnostic || session.error?.diagnostic].filter(Boolean).join('\n'));
    });
    ipcMain.on('command-ui:close', (event) => {
      if (!trusted(event, session?.window) || session.phase === 'running') return;
      const cancelled = session.phase === 'input';
      session.window.close();
      if (cancelled) showPalette();
    });
    return async (event, id) => {
      if (!trusted(event, getPaletteWindow()) || typeof id !== 'string') throw new Error('Command execution rejected');
      return start(id);
    };
  }
  return { start, registerIpc, focus: () => { if (!session) return false; if (session.window) open(); return true; },
    dispose: () => {
      const current = session; session = null; clearTimeout(notificationTimer);
      if (current?.window && !current.window.isDestroyed()) current.window.destroy();
      if (notification && !notification.isDestroyed()) notification.destroy();
    } };
}
module.exports = { createCommandUiHost };
