function registerExtensionIpc({ ipcMain, dialog, extensions, getSettingsWindow, getWindows }) {
  const handlers = {
    'extensions:list': [0, () => extensions.list()],
    'extensions:preview': [0, async () => {
      const result = await dialog.showOpenDialog(getSettingsWindow(), {
        properties: ['openFile'], filters: [{ name: 'Clackly Extension', extensions: ['clackly'] }]
      });
      return result.canceled || !result.filePaths[0] ? null : extensions.preview(result.filePaths[0]);
    }],
    'extensions:cancel': [1, (token) => extensions.cancel(token)],
    'extensions:install': [2, (token, operation) => extensions.install(token, operation)],
    'extensions:set-enabled': [2, (id, enabled) => extensions.setEnabled(id, enabled)],
    'extensions:uninstall': [2, (id, clearConfig) => extensions.uninstall(id, clearConfig)],
    'extensions:save-config': [2, (id, values) => extensions.saveConfig(id, values)]
  };
  for (const [channel, [count, action]] of Object.entries(handlers)) {
    ipcMain.handle(channel, (event, ...args) => {
      const window = getSettingsWindow();
      const contents = window?.webContents;
      if (!window || window.isDestroyed() || !contents || contents.isDestroyed()
        || event?.sender !== contents || !event.senderFrame || event.senderFrame !== contents.mainFrame
        || args.length !== count) throw new Error('Extension request rejected');
      return action(...args);
    });
  }
  return extensions.subscribe(() => {
    for (const window of getWindows()) {
      if (window.isDestroyed() || window.webContents.isDestroyed()) continue;
      try { window.webContents.send('commands:changed'); } catch { /* Renderer closed. */ }
    }
  });
}
module.exports = { registerExtensionIpc };
