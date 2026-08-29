const path = require("node:path");
const { app, BrowserWindow, clipboard, dialog, ipcMain } = require("electron");
const {
  createPaletteWindow,
  createDetachedInteractionPanelWindow,
  closeDetachedInteractionPanel,
  openDetachedInteractionPanel,
  openSettingsWindow,
  registerInteractionPanelIpc,
  hidePaletteWindow,
  showPaletteWindow,
  isPaletteWindowShown
} = require("../electron/main/window");
const {
  PALETTE_HOST,
  selectPaletteHostPolicy,
  usesWindowsNativeDualWindow
} = require("../electron/main/paletteHostPolicy");
const { createNativeDualWindowHost } = require("../electron/main/nativeDualWindowHost");
const { getPaletteAccelerator, registerPaletteHotkey } = require("../electron/main/hotkey");
const { composeStartup } = require("../electron/main/composeStartup");
const { getCommandById, getCommands } = require("../command-engine/registry");
const { initializeAfterEffectsPath } = require("../capability/afterEffectsPath");
const { BindingStorage } = require("../interaction/BindingStorage");
const { InteractionManager } = require("../interaction/InteractionManager");
const { createResolveAdapter } = require("../resolve/adapter");
const { registerFeatureUiIpc } = require("../feature-ui/registerIpc");
const { createClacklyCore } = require("../app/createClacklyCore");
const { getElectronSystemLanguages } = require("../localization/LocalizationService");
const { registerLocalizationIpc } = require("../localization/registerIpc");
const { translate } = require("../localization/resources");
const { createClipboardImageReader } = require("../electron/main/clipboard");

const PLUGIN_ID = "com.wutpeach.clackly";

let WorkflowIntegration = null;
let paletteWindow = null;
let settingsWindow = null;
let initPromise = null;
let resolvePromise = null;
let cleanupDone = false;
const paletteHostPolicy = selectPaletteHostPolicy({
  host: PALETTE_HOST.WORKFLOW,
  platform: process.platform
});
const nativeDualWindowHost = usesWindowsNativeDualWindow(paletteHostPolicy)
  ? createNativeDualWindowHost({
    palettePolicy: paletteHostPolicy,
    createPaletteWindow,
    createDetachedInteractionPanelWindow,
    closeDetachedInteractionPanel,
    openDetachedInteractionPanel,
    showPaletteWindow,
    hidePaletteWindow
  })
  : null;

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
  systemLanguagesProvider: () => getElectronSystemLanguages(app),
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
  if (nativeDualWindowHost) {
    nativeDualWindowHost.showPalette();
    return;
  }
  showPaletteWindow(paletteWindow);
}

function hidePalette() {
  if (nativeDualWindowHost) {
    nativeDualWindowHost.hidePalette();
    return;
  }
  hidePaletteWindow(paletteWindow);
}

function createWorkflowPaletteWindow() {
  return nativeDualWindowHost
    ? nativeDualWindowHost.createWindow()
    : createPaletteWindow();
}

function openSettings(featureId) {
  const previousWindow = settingsWindow;
  settingsWindow = openSettingsWindow(settingsWindow, featureId, {
    title: translate(core.localizationService.getSnapshot().effectiveLocale, "settings.title")
  });
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
  ipcMain.handle("commands:search", (_event, query, pinnedIds) => core.searchCommands(query, pinnedIds));
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
  registerLocalizationIpc({
    ipcMain,
    localizationService: core.localizationService,
    getWindows: () => BrowserWindow.getAllWindows().filter((window) => (
      window !== nativeDualWindowHost?.getInteractionPanelWindow()
    ))
  });
  registerInteractionPanelIpc(ipcMain, () => paletteWindow, nativeDualWindowHost
    ? {
      open: (request) => nativeDualWindowHost.openInteractionPanel(request),
      close: () => nativeDualWindowHost.closeInteractionPanel({ restoreFocus: true })
    }
    : undefined);
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
  const t = (key, params) => translate(core.localizationService.getSnapshot().effectiveLocale, key, params);
  showPalette();
  dialog.showMessageBox({
    type: "warning",
    title: t("native.hotkey.title"),
    message: t("native.hotkey.message", { accelerator }),
    detail: t("native.hotkey.detail")
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
    queueMicrotask(() => core.prewarmAfterEffectsProcessProbe().catch(() => {}));
    try {
      await initializeWorkflowIntegration();
    } catch (error) {
      console.error(error);
      const locale = core.localizationService.getSnapshot().effectiveLocale;
      dialog.showErrorBox(translate(locale, "app.title"), translate(locale, "error.generic"));
    }

    paletteWindow = composeStartup({
      initializeAfterEffectsPath: () => initializeAfterEffectsPath(core.configManager),
      createPaletteWindow: createWorkflowPaletteWindow,
      registerIpcHandlers,
      registerPaletteHotkey: () => registerPaletteHotkey(togglePalette),
      reportInitializationError: (error) => {
        console.error(error);
        const locale = core.localizationService.getSnapshot().effectiveLocale;
        dialog.showErrorBox(translate(locale, "app.title"), translate(locale, "error.generic"));
      },
      handleHotkeyRegistrationFailure
    }).paletteWindow;
  });

  app.on("will-quit", () => {
    const { globalShortcut } = require("electron");
    globalShortcut.unregisterAll();
    core.disposeAfterEffectsProcessProbe();
    cleanupWorkflowIntegration();
  });

  app.on("window-all-closed", () => {});
}
