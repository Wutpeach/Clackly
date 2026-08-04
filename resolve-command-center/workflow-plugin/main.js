const path = require("node:path");
const { app, dialog, ipcMain } = require("electron");
const {
  createPaletteWindow,
  openSettingsWindow,
  hidePaletteWindow,
  showPaletteWindow,
  setPaletteWindowMode
} = require("../electron/main/window");
const { getPaletteAccelerator, registerPaletteHotkey } = require("../electron/main/hotkey");
const { getCommandById, getCommands, searchCommands } = require("../command-engine/registry");
const { createCommandExecutor } = require("../command-engine/executor");
const { createCapabilityRegistry } = require("../capability/registry");
const { createMarkerCapability } = require("../capability/marker");
const { registerScriptCapabilities } = require("../capability/registerScripts");
const { initializeAfterEffectsPath } = require("../capability/afterEffectsPath");
const { AfterEffectsLauncher } = require("../capability/afterEffectsLaunch");
const { ConfigManager } = require("../config/ConfigManager");
const { ConfigStorage } = require("../config/ConfigStorage");
const { BindingStorage } = require("../interaction/BindingStorage");
const { InteractionManager } = require("../interaction/InteractionManager");
const { createResolveAdapter } = require("../resolve/adapter");
const { ShortcutManager } = require("../shortcut/ShortcutManager");
const { FeatureCatalog } = require("../feature-ui/FeatureCatalog");
const { registerFeatureUiIpc } = require("../feature-ui/registerIpc");
const { FeatureStateStorage } = require("../feature-status/FeatureStateStorage");
const { FeatureStatusManager } = require("../feature-status/FeatureStatusManager");
const { RuntimeManager } = require("../script-runtime/runtime/manager");
const { resolveRuntimeRoot } = require("../script-runtime/runtime/paths");
const packageMetadata = require("../package.json");

const PLUGIN_ID = "com.wutpeach.clackly";

let WorkflowIntegration = null;
let paletteWindow = null;
let settingsWindow = null;
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
const appRoot = path.resolve(__dirname, "..");
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
  hostContextProvider: async () => {
    const resolve = await getResolve();
    const version = typeof resolve.GetVersionString === "function"
      ? await Promise.resolve(resolve.GetVersionString())
      : null;
    return { application: "davinci-resolve", version };
  },
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
const executeCapabilityCommand = createCommandExecutor({
  capabilityRegistry,
  configManager,
  featureStatusManager
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

const interactionManager = new InteractionManager({
  bindingStorage: BindingStorage.fromAppData(app.getPath("appData")),
  executeCommand: executeWorkflowCommand
});

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
    const result = await executeWorkflowCommand(commandId);
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

    initializeAfterEffectsPath(configManager);
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
