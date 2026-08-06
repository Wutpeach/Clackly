const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("resolveCommandCenter", {
  listCommands: () => ipcRenderer.invoke("commands:list"),
  searchCommands: (query) => ipcRenderer.invoke("commands:search", query),
  executeCommand: (commandId) => ipcRenderer.invoke("commands:execute", commandId),
  executeInteraction: (event) => ipcRenderer.invoke("interactions:execute", event),
  listInteractionBindings: () => ipcRenderer.invoke("interactions:list"),
  listFeatures: () => ipcRenderer.invoke("features:list"),
  listFeatureStatuses: () => ipcRenderer.invoke("feature-status:list"),
  refreshFeatureStatuses: (featureId) => ipcRenderer.invoke("feature-status:refresh", featureId),
  setFeatureEnabled: (featureId, enabled) => (
    ipcRenderer.invoke("feature-status:set-enabled", featureId, enabled)
  ),
  getConfig: (capabilityId) => ipcRenderer.invoke("config:get", capabilityId),
  saveConfig: (capabilityId, values) => ipcRenderer.invoke("config:save", capabilityId, values),
  resetConfig: (capabilityId) => ipcRenderer.invoke("config:reset", capabilityId),
  pickPath: (type) => ipcRenderer.invoke("dialog:pick-path", type),
  openSettings: (featureId) => ipcRenderer.send("settings:open", featureId),
  closeSettings: () => ipcRenderer.send("settings:close"),
  hidePalette: () => ipcRenderer.send("palette:hide"),
  onPaletteShown: (callback) => {
    const listener = () => callback();
    ipcRenderer.on("palette:shown", listener);
    return () => ipcRenderer.removeListener("palette:shown", listener);
  },
  onSettingsFeatureSelected: (callback) => {
    const listener = (_event, featureId) => callback(featureId);
    ipcRenderer.on("settings:select-feature", listener);
    return () => ipcRenderer.removeListener("settings:select-feature", listener);
  }
});
