const path = require("node:path");
const { app, clipboard, dialog, ipcMain } = require("electron");
const {
  createPaletteWindow,
  openSettingsWindow,
  hidePaletteWindow,
  showPaletteWindow,
  isPaletteWindowShown
} = require("../electron/main/window");
const { getPaletteAccelerator, registerPaletteHotkey } = require("../electron/main/hotkey");
const { composeStartup } = require("../electron/main/composeStartup");
const { getCommandById, getCommands, searchCommands } = require("../command-engine/registry");
const { initializeAfterEffectsPath } = require("../capability/afterEffectsPath");
const { BindingStorage } = require("../interaction/BindingStorage");
const { InteractionManager } = require("../interaction/InteractionManager");
const { createResolveAdapter } = require("../resolve/adapter");
const { registerFeatureUiIpc } = require("../feature-ui/registerIpc");
const { createClacklyCore } = require("../app/createClacklyCore");
const { createClipboardImageReader } = require("../electron/main/clipboard");

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
const appRoot = path.resolve(__dirname, "..");
const core = createClacklyCore({
  appRoot,
  appDataPath: app.getPath("appData"),
  temporaryRoot: app.getPath("temp"),
  hostContextProvider: async () => {
    const resolve = await getResolve();
    const version = typeof resolve.GetVersionString === "function"
      ? await Promise.resolve(resolve.GetVersionString())
      : null;
    return { application: "davinci-resolve", version };
  },
  markerBackends: {
    workflowPluginApi: {
      isAvailable: async () => {
        try {
          return Boolean(await getResolve());
        } catch (_error) {
          return false;
        }
      },
      addMarker: resolveAdapter.addMarker
    }
  },
  imageClipboard: {
    clipboard: createClipboardImageReader({ clipboard }),
    picturesPath: app.getPath("pictures"),
    resolveMediaPool: resolveAdapter
  }
});

async function executeWorkflowCommand(commandId) {
  const command = getCommandById(commandId);
  if (!command) {
    throw new Error(`Unknown command: ${commandId}`);
  }

  const result = await core.executeCommand(command.id);
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
  ipcMain.on("palette:hide", hidePalette);
  registerFeatureUiIpc({
    ipcMain,
    dialog,
    featureCatalog: core.featureCatalog,
    configManager: core.configManager,
    featureStatusManager: core.featureStatusManager,
    interactionManager,
    openSettings,
    closeSettings
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

    paletteWindow = composeStartup({
      initializeAfterEffectsPath: () => initializeAfterEffectsPath(core.configManager),
      createPaletteWindow,
      registerIpcHandlers,
      registerPaletteHotkey: () => registerPaletteHotkey(togglePalette),
      reportInitializationError: (error) => dialog.showErrorBox("Clackly", error.message),
      handleHotkeyRegistrationFailure
    }).paletteWindow;
  });

  app.on("will-quit", () => {
    const { globalShortcut } = require("electron");
    globalShortcut.unregisterAll();
    cleanupWorkflowIntegration();
  });

  app.on("window-all-closed", () => {});
}
