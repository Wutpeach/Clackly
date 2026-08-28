function registerLocalizationIpc({ ipcMain, localizationService, getWindows = () => [] } = {}) {
  if (!ipcMain || typeof ipcMain.handle !== "function") {
    throw new TypeError("Localization IPC requires ipcMain");
  }
  if (!localizationService || typeof localizationService.getSnapshot !== "function"
    || typeof localizationService.setLocalePreference !== "function" || typeof localizationService.subscribe !== "function") {
    throw new TypeError("Localization IPC requires LocalizationService");
  }
  if (typeof getWindows !== "function") {
    throw new TypeError("Localization IPC requires a window provider");
  }

  ipcMain.handle("localization:get-snapshot", () => localizationService.getSnapshot());
  ipcMain.handle("preferences:set-locale", (_event, locale) => localizationService.setLocalePreference(locale));
  return localizationService.subscribe((snapshot) => {
    for (const window of getWindows()) {
      if (!window || window.isDestroyed?.()) continue;
      try {
        window.webContents.send("localization:changed", snapshot);
      } catch (_error) {
        // A renderer can disappear between getAllWindows and send.
      }
    }
  });
}

module.exports = { registerLocalizationIpc };
