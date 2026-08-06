const path = require("node:path");
const { app, dialog, ipcMain } = require("electron");
const {
  createPaletteWindow,
  openSettingsWindow,
  showPaletteWindow,
  hidePaletteWindow,
  isPaletteWindowShown
} = require("./window");
const { registerPaletteHotkey } = require("./hotkey");
const { getCommands, searchCommands } = require("../../command-engine/registry");
const { createCommandExecutor } = require("../../command-engine/executor");
const { createCapabilityRegistry } = require("../../capability/registry");
const { createMarkerCapability } = require("../../capability/marker");
const { registerScriptCapabilities } = require("../../capability/registerScripts");
const { initializeAfterEffectsPath } = require("../../capability/afterEffectsPath");
const { AfterEffectsLauncher } = require("../../capability/afterEffectsLaunch");
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
const { RuntimeManager } = require("../../script-runtime/runtime/manager");
const { resolveRuntimeRoot } = require("../../script-runtime/runtime/paths");
const packageMetadata = require("../../package.json");

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
const appRoot = path.resolve(__dirname, "../..");
const desktopLauncher = new AfterEffectsLauncher({
  hostEnvironment: process.env,
  temporaryRoot: app.getPath("temp")
});
const runtimeManager = new RuntimeManager({
  runtimeRoot: resolveRuntimeRoot({
    appRoot
  }),
  cachePath: path.join(app.getPath("appData"), "Clackly", "runtime-probe.json"),
  clacklyVersion: packageMetadata.version,
  desktopLauncher,
  hostContextProvider: async () => ({
    application: "davinci-resolve",
    version: await bridgeExecutionAdapter.getResolveVersion()
  }),
  scriptRoot: appRoot,
  ...(process.env.CLACKLY_PYTHON_EXECUTABLE
    ? { overrideExecutable: process.env.CLACKLY_PYTHON_EXECUTABLE }
    : {})
});
registerScriptCapabilities({ capabilityRegistry, appRoot, runtimeManager });
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

function closeSettings() {
  if (settingsWindow && !settingsWindow.isDestroyed()) settingsWindow.close();
}

function togglePalette() {
  if (paletteWindow && isPaletteWindowShown(paletteWindow)) {
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
  ipcMain.on("palette:hide", hidePalette);
  registerFeatureUiIpc({
    ipcMain,
    dialog,
    featureCatalog,
    configManager,
    featureStatusManager,
    interactionManager,
    openSettings,
    closeSettings
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
    initializeAfterEffectsPath(configManager);
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
