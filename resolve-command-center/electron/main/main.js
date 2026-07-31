const { app, dialog, ipcMain } = require("electron");
const {
  createPaletteWindow,
  openSettingsWindow,
  showPaletteWindow,
  hidePaletteWindow,
  setPaletteWindowMode
} = require("./window");
const { registerPaletteHotkey } = require("./hotkey");
const { getCommands, searchCommands } = require("../../command-engine/registry");
const { createCommandExecutor } = require("../../command-engine/executor");
const { createCapabilityRegistry } = require("../../capability/registry");
const { createMarkerCapability } = require("../../capability/marker");
const { ConfigManager } = require("../../config/ConfigManager");
const { ConfigStorage } = require("../../config/ConfigStorage");
const { BindingStorage } = require("../../interaction/BindingStorage");
const { InteractionManager } = require("../../interaction/InteractionManager");
const { createBridgeExecutionAdapter } = require("../../execution-adapter/bridge");
const { ShortcutManager } = require("../../shortcut/ShortcutManager");
const { FeatureCatalog } = require("../../feature-ui/FeatureCatalog");
const { registerFeatureUiIpc } = require("../../feature-ui/registerIpc");
const { FeatureStateStorage } = require("../../feature-status/FeatureStateStorage");
const { FeatureStatusManager } = require("../../feature-status/FeatureStatusManager");

let paletteWindow = null;
let settingsWindow = null;

const bridgeExecutionAdapter = createBridgeExecutionAdapter();
const shortcutManager = new ShortcutManager();
const markerCapability = createMarkerCapability({
  resolveScriptApi: bridgeExecutionAdapter,
  keyboardShortcut: {
    isAvailable: () => shortcutManager.canExecute("ADD_MARKER"),
    addMarker: (context) => shortcutManager.execute("ADD_MARKER", context)
  }
});
const capabilityRegistry = createCapabilityRegistry();
capabilityRegistry.register("marker.add", markerCapability);
const featureCatalog = new FeatureCatalog({ capabilityRegistry });
const configManager = new ConfigManager({
  capabilityRegistry,
  storage: ConfigStorage.fromAppData(app.getPath("appData"))
});
const featureStatusManager = new FeatureStatusManager({
  capabilityRegistry,
  configManager,
  stateStorage: FeatureStateStorage.fromAppData(app.getPath("appData"))
});
const executeCommand = createCommandExecutor({
  capabilityRegistry,
  configManager,
  featureStatusManager
});
const interactionManager = new InteractionManager({
  bindingStorage: BindingStorage.fromAppData(app.getPath("appData")),
  executeCommand: executeStandaloneCommand
});

async function executeStandaloneCommand(commandId) {
  try {
    return await executeCommand(commandId);
  } catch (error) {
    if (String(error && error.message).includes("Resolve scripting API is unavailable")) {
      throw new Error(
        `${error.message}. This command was handled by the standalone bridge-backed Electron app, not the Resolve Workflow Integration plugin. Quit any standalone Clackly, npm start/dev, or Utility-script-launched Electron process, then load Clackly from Resolve's Workspace > Workflow Integrations menu.`
      );
    }

    throw error;
  }
}

function showPalette() {
  showPaletteWindow(paletteWindow);
}

function hidePalette() {
  hidePaletteWindow(paletteWindow);
}

function openSettings(featureId) {
  const previousWindow = settingsWindow;
  settingsWindow = openSettingsWindow(settingsWindow, featureId);
  if (settingsWindow !== previousWindow) {
    const openedWindow = settingsWindow;
    openedWindow.once("closed", () => {
      if (settingsWindow === openedWindow) settingsWindow = null;
    });
  }
}

function togglePalette() {
  if (paletteWindow && paletteWindow.isVisible()) {
    hidePalette();
    return;
  }

  showPalette();
}

function registerIpcHandlers() {
  ipcMain.handle("commands:list", () => getCommands());
  ipcMain.handle("commands:search", (_event, query) => searchCommands(query));
  ipcMain.handle("commands:execute", async (_event, commandId) => {
    const result = await executeStandaloneCommand(commandId);
    hidePalette();
    return result;
  });
  ipcMain.handle("interactions:execute", async (_event, interaction) => {
    const result = await interactionManager.handle(interaction);
    if (result.matched) {
      hidePalette();
    }
    return result;
  });
  ipcMain.on("palette:set-mode", (_event, mode) => setPaletteWindowMode(paletteWindow, mode));
  ipcMain.on("palette:hide", hidePalette);
  registerFeatureUiIpc({
    ipcMain,
    dialog,
    featureCatalog,
    configManager,
    featureStatusManager,
    interactionManager,
    openSettings
  });
}

const hasSingleInstanceLock = app.requestSingleInstanceLock();
if (!hasSingleInstanceLock) {
  app.quit();
} else {
  app.on("second-instance", () => {
    showPalette();
  });

  app.whenReady().then(() => {
    paletteWindow = createPaletteWindow();
    registerIpcHandlers();
    registerPaletteHotkey(togglePalette);

    app.on("activate", () => {
      if (!paletteWindow || paletteWindow.isDestroyed()) {
        paletteWindow = createPaletteWindow();
      }
    });
  });

  app.on("will-quit", () => {
    const { globalShortcut } = require("electron");
    globalShortcut.unregisterAll();
  });

  app.on("window-all-closed", () => {});
}
