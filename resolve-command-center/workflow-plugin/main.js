const path = require("node:path");
const { app, dialog, ipcMain } = require("electron");
const {
  createPaletteWindow,
  hidePaletteWindow,
  showPaletteWindow,
  setPaletteWindowMode
} = require("../electron/main/window");
const { getPaletteAccelerator, registerPaletteHotkey } = require("../electron/main/hotkey");
const { getCommandById, getCommands, searchCommands } = require("../command-engine/registry");
const { createCommandExecutor } = require("../command-engine/executor");
const { createCapabilityRegistry } = require("../capability/registry");
const { createMarkerCapability } = require("../capability/marker");
const { ConfigManager } = require("../config/ConfigManager");
const { ConfigStorage } = require("../config/ConfigStorage");
const { createResolveAdapter } = require("../resolve/adapter");
const { ShortcutManager } = require("../shortcut/ShortcutManager");

const PLUGIN_ID = "com.wutpeach.clackly";

let WorkflowIntegration = null;
let paletteWindow = null;
let initPromise = null;
let resolvePromise = null;
let cleanupDone = false;

app.setPath("userData", path.join(app.getPath("appData"), "Clackly Workflow Plugin"));

function loadWorkflowIntegration() {
  if (WorkflowIntegration) {
    return WorkflowIntegration;
  }

  try {
    WorkflowIntegration = require("./WorkflowIntegration.node");
    return WorkflowIntegration;
  } catch (error) {
    throw new Error(
      `WorkflowIntegration.node is missing or could not be loaded: ${error.message}`
    );
  }
}

async function initializeWorkflowIntegration() {
  if (initPromise) {
    return initPromise;
  }

  initPromise = (async () => {
    const workflowIntegration = loadWorkflowIntegration();
    const initialized = typeof workflowIntegration.InitializePromise === "function"
      ? await workflowIntegration.InitializePromise(PLUGIN_ID)
      : await Promise.resolve(workflowIntegration.Initialize(PLUGIN_ID));

    if (!initialized) {
      throw new Error("Failed to initialize Resolve Workflow Integration");
    }

    if (typeof workflowIntegration.RegisterCallback === "function") {
      workflowIntegration.RegisterCallback("ResolveQuit", () => {
        app.quit();
      });
    }

    return workflowIntegration;
  })();

  return initPromise;
}

async function getResolve() {
  if (resolvePromise) {
    return resolvePromise;
  }

  resolvePromise = (async () => {
    const workflowIntegration = await initializeWorkflowIntegration();
    const resolve = typeof workflowIntegration.GetResolvePromise === "function"
      ? await workflowIntegration.GetResolvePromise()
      : await Promise.resolve(workflowIntegration.GetResolve());

    if (!resolve) {
      throw new Error("Failed to get Resolve object from Workflow Integration");
    }

    return resolve;
  })();

  return resolvePromise;
}

const resolveAdapter = createResolveAdapter({ getResolve });
const shortcutManager = new ShortcutManager();
const markerCapability = createMarkerCapability({
  workflowPluginApi: {
    isAvailable: async () => {
      try {
        return Boolean(await getResolve());
      } catch (_error) {
        return false;
      }
    },
    addMarker: resolveAdapter.addMarker
  },
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
const executeCapabilityCommand = createCommandExecutor({
  capabilityRegistry,
  configManager
});

async function executeWorkflowCommand(commandId) {
  const command = getCommandById(commandId);
  if (!command) {
    throw new Error(`Unknown command: ${commandId}`);
  }

  const result = await executeCapabilityCommand(command.id);
  return {
    ok: true,
    command: command.id,
    ...result
  };
}

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
    const result = await executeWorkflowCommand(commandId);
    hidePalette();
    return result;
  });
  ipcMain.on("palette:set-mode", (_event, mode) => setPaletteWindowMode(paletteWindow, mode));
  ipcMain.on("palette:hide", hidePalette);
}

function handleHotkeyRegistrationFailure() {
  const accelerator = getPaletteAccelerator();
  showPalette();
  dialog.showMessageBox({
    type: "warning",
    title: "Clackly",
    message: `Clackly could not register ${accelerator}.`,
    detail: [
      "Another process is already using the global shortcut.",
      "Close any old Clackly npm start, Utility script, or Electron dev process, then reload Clackly from Resolve.",
      "You can also set RESOLVE_COMMAND_CENTER_HOTKEY before launching Resolve to test another shortcut."
    ].join(" ")
  }).finally(() => {
    showPalette();
  });
}

function cleanupWorkflowIntegration() {
  if (cleanupDone || !WorkflowIntegration) {
    return;
  }

  cleanupDone = true;

  try {
    if (typeof WorkflowIntegration.DeregisterCallback === "function") {
      WorkflowIntegration.DeregisterCallback("ResolveQuit");
    }
    WorkflowIntegration.CleanUp();
  } catch (error) {
    console.warn(`Failed to clean up Resolve Workflow Integration: ${error.message}`);
  }
}

const hasSingleInstanceLock = app.requestSingleInstanceLock();
if (!hasSingleInstanceLock) {
  app.quit();
} else {
  app.setName("Clackly");

  app.on("second-instance", () => {
    showPalette();
  });

  app.whenReady().then(async () => {
    try {
      await initializeWorkflowIntegration();
    } catch (error) {
      dialog.showErrorBox("Clackly", error.message);
    }

    paletteWindow = createPaletteWindow();
    registerIpcHandlers();
    const hotkeyRegistered = registerPaletteHotkey(togglePalette);
    if (!hotkeyRegistered) {
      handleHotkeyRegistrationFailure();
    }
  });

  app.on("will-quit", () => {
    const { globalShortcut } = require("electron");
    globalShortcut.unregisterAll();
    cleanupWorkflowIntegration();
  });

  app.on("window-all-closed", () => {});
}
