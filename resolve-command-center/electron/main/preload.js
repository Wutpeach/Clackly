const { contextBridge, ipcRenderer } = require("electron");
const path = require("node:path");
const { isEnabled: isResolveShortcutSpikeEnabled } = require("./experimentalResolveShortcut");
const enableResolveShortcutSpike = isResolveShortcutSpikeEnabled({
  appRoot: path.resolve(__dirname, "..", "..")
});

const rendererView = new URLSearchParams(window.location.search).get("view");
const isDetachedInteractionPanel = rendererView === "interaction-panel";

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
  getUpdateState: () => ipcRenderer.invoke("updates:get-state"),
  checkForUpdates: () => ipcRenderer.invoke("updates:check"),
  downloadUpdate: () => ipcRenderer.invoke("updates:download"),
  cancelUpdate: () => ipcRenderer.invoke("updates:cancel"),
  discardUpdate: () => ipcRenderer.invoke("updates:discard"),
  prepareUpdateInstall: () => ipcRenderer.invoke("updates:prepare-install"),
  confirmUpdateInstall: () => ipcRenderer.invoke("updates:confirm-install"),
  cancelUpdateInstall: () => ipcRenderer.invoke("updates:cancel-install"),
  onUpdateStateChanged: (callback) => {
    const listener = (_event, snapshot) => callback(snapshot);
    ipcRenderer.on("updates:state-changed", listener);
    return () => ipcRenderer.removeListener("updates:state-changed", listener);
  },
  getLocalizationSnapshot: () => ipcRenderer.invoke("localization:get-snapshot"),
  setLocalePreference: (locale) => ipcRenderer.invoke("preferences:set-locale", locale),
  searchCommands: (query, pinnedIds, options) => ipcRenderer.invoke("commands:search", query, pinnedIds, options),
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
  ...(enableResolveShortcutSpike && rendererView === null ? {
    collectResolveBoundShortcutEvidence: () => ipcRenderer.invoke("experiments:resolve-bound-shortcut:collect"),
    runResolveBoundShortcutSpike: (request) => ipcRenderer.invoke("experiments:resolve-bound-shortcut", request),
    getResolveBoundShortcutLastResult: () => ipcRenderer.invoke("experiments:resolve-bound-shortcut:last-result")
  } : {}),
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
