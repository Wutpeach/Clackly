function registerFeatureUiIpc({
  ipcMain,
  dialog,
  featureCatalog,
  configManager,
  featureStatusManager,
  openSettings
}) {
  ipcMain.handle("features:list", () => featureCatalog.getAllFeatures());
  ipcMain.handle("feature-status:list", () => featureStatusManager.list());
  ipcMain.handle("feature-status:refresh", (_event, featureId) => (
    featureStatusManager.refresh(featureId)
  ));
  ipcMain.handle("feature-status:set-enabled", (_event, featureId, enabled) => (
    featureStatusManager.setEnabled(featureId, enabled)
  ));
  ipcMain.handle("config:get", (_event, capabilityId) => configManager.get(capabilityId));
  ipcMain.handle("config:save", (_event, capabilityId, values) => (
    configManager.save(capabilityId, values, { requireComplete: true })
  ));
  ipcMain.handle("config:reset", (_event, capabilityId) => configManager.reset(capabilityId));
  ipcMain.handle("dialog:pick-path", async (_event, type) => {
    if (type !== "path" && type !== "folder") {
      throw new TypeError("Path picker type must be path or folder");
    }
    const result = await dialog.showOpenDialog({
      properties: [type === "folder" ? "openDirectory" : "openFile"]
    });
    return result.canceled ? null : result.filePaths[0] || null;
  });
  ipcMain.on("settings:open", (_event, featureId) => openSettings(featureId));
}

module.exports = { registerFeatureUiIpc };
