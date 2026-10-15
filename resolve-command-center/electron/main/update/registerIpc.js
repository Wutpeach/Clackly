function registerUpdateIpc({ ipcMain, updateService, getSettingsWindow }) {
  const methods = { 'updates:get-state': async () => { await updateService.ready; return updateService.getState(); },
    'updates:check': () => updateService.checkForUpdates(), 'updates:download': () => updateService.downloadUpdate(),
    'updates:cancel': () => updateService.cancelUpdate(),
    'updates:discard': () => updateService.discardUpdate(),
    'updates:prepare-install': () => updateService.prepareUpdateInstall(),
    'updates:confirm-install': () => updateService.confirmUpdateInstall(),
    'updates:cancel-install': () => updateService.cancelUpdateInstall() };
  for (const [channel, action] of Object.entries(methods)) {
    ipcMain.handle(channel, (event, ...args) => {
      const window = getSettingsWindow();
      const contents = window?.webContents;
      if (!window || window.isDestroyed() || !contents || contents.isDestroyed()
        || event?.sender !== contents || !event.senderFrame || event.senderFrame !== contents.mainFrame
        || args.length !== 0) throw new Error('Update request rejected');
      return action();
    });
  }
  return updateService.subscribe((snapshot) => {
    const window = getSettingsWindow();
    if (!window || window.isDestroyed() || window.webContents.isDestroyed()) return;
    try { window.webContents.send('updates:state-changed', snapshot); } catch { /* Settings closed mid-delivery. */ }
  });
}
module.exports = { registerUpdateIpc };
