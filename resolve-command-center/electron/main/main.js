const { app, ipcMain } = require("electron");
const {
  createPaletteWindow,
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
const { createBridgeExecutionAdapter } = require("../../execution-adapter/bridge");
const { ShortcutManager } = require("../../shortcut/ShortcutManager");

let paletteWindow = null;

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
const configManager = new ConfigManager({
  capabilityRegistry,
  storage: ConfigStorage.fromAppData(app.getPath("appData"))
});
const executeCommand = createCommandExecutor({
  capabilityRegistry,
  configManager
});

function showPalette() {
  showPaletteWindow(paletteWindow);
}

function hidePalette() {
  hidePaletteWindow(paletteWindow);
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
    try {
      const result = await executeCommand(commandId);
      hidePalette();
      return result;
    } catch (error) {
      if (String(error && error.message).includes("Resolve scripting API is unavailable")) {
        throw new Error(
          `${error.message}. This command was handled by the standalone bridge-backed Electron app, not the Resolve Workflow Integration plugin. Quit any standalone Clackly, npm start/dev, or Utility-script-launched Electron process, then load Clackly from Resolve's Workspace > Workflow Integrations menu.`
        );
      }

      throw error;
    }
  });
  ipcMain.on("palette:set-mode", (_event, mode) => setPaletteWindowMode(paletteWindow, mode));
  ipcMain.on("palette:hide", hidePalette);
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
