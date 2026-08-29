const { contextBridge, ipcRenderer } = require("electron");

const isDetachedInteractionPanel = new URLSearchParams(window.location.search).get("view") === "interaction-panel";

if (isDetachedInteractionPanel) {
  let presentation = null;
  const presentationListeners = new Set();
  ipcRenderer.on("interaction-panel:presentation", (_event, nextPresentation) => {
    presentation = nextPresentation;
    presentationListeners.forEach((listener) => listener(presentation));
  });

  contextBridge.exposeInMainWorld("resolveCommandCenterPanel", {
    onPresentation: (callback) => {
      presentationListeners.add(callback);
      callback(presentation);
      return () => presentationListeners.delete(callback);
    }
  });
} else {
  contextBridge.exposeInMainWorld("resolveCommandCenter", {
  listCommands: () => ipcRenderer.invoke("commands:list"),
  getLocalizationSnapshot: () => ipcRenderer.invoke("localization:get-snapshot"),
  setLocalePreference: (locale) => ipcRenderer.invoke("preferences:set-locale", locale),
  searchCommands: (query, pinnedIds) => ipcRenderer.invoke("commands:search", query, pinnedIds),
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
  openInteractionPanel: (metrics) => ipcRenderer.invoke("palette:interaction-panel:open", metrics),
  closeInteractionPanel: () => ipcRenderer.send("palette:interaction-panel:close"),
  onPaletteShown: (callback) => {
    const listener = () => callback();
    ipcRenderer.on("palette:shown", listener);
    return () => ipcRenderer.removeListener("palette:shown", listener);
  },
  onLocalizationChanged: (callback) => {
    const listener = (_event, snapshot) => callback(snapshot);
    ipcRenderer.on("localization:changed", listener);
    return () => ipcRenderer.removeListener("localization:changed", listener);
  },
  onSettingsFeatureSelected: (callback) => {
    const listener = (_event, featureId) => callback(featureId);
    ipcRenderer.on("settings:select-feature", listener);
    return () => ipcRenderer.removeListener("settings:select-feature", listener);
  }
  });
}
