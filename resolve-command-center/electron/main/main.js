const path = require("node:path");
const { app, BrowserWindow, clipboard, dialog, ipcMain } = require("electron");
const {
  createPaletteWindow,
  createDetachedInteractionPanelWindow,
  closeDetachedInteractionPanel,
  openDetachedInteractionPanel,
  openSettingsWindow,
  registerInteractionPanelIpc,
  showPaletteWindow,
  hidePaletteWindow,
  isPaletteWindowShown
} = require("./window");
const {
  PALETTE_HOST,
  selectPaletteHostPolicy,
  usesWindowsNativeDualWindow
} = require("./paletteHostPolicy");
const { createNativeDualWindowHost } = require("./nativeDualWindowHost");
const { registerPaletteHotkey } = require("./hotkey");
const { composeStartup } = require("./composeStartup");
const { getCommands } = require("../../command-engine/registry");
const { initializeAfterEffectsPath } = require("../../capability/afterEffectsPath");
const { BindingStorage } = require("../../interaction/BindingStorage");
const { InteractionManager } = require("../../interaction/InteractionManager");
const { createBridgeExecutionAdapter } = require("../../execution-adapter/bridge");
const { registerFeatureUiIpc } = require("../../feature-ui/registerIpc");
const { createClacklyCore } = require("../../app/createClacklyCore");
const { getElectronSystemLanguages } = require("../../localization/LocalizationService");
const { registerLocalizationIpc } = require("../../localization/registerIpc");
const { translate } = require("../../localization/resources");
const { createClipboardImageReader } = require("./clipboard");

let paletteWindow = null;
let settingsWindow = null;
const paletteHostPolicy = selectPaletteHostPolicy({
  host: PALETTE_HOST.STANDALONE,
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

const bridgeExecutionAdapter = createBridgeExecutionAdapter();
const appRoot = path.resolve(__dirname, "../..");
const core = createClacklyCore({
  appRoot,
  appDataPath: app.getPath("appData"),
  temporaryRoot: app.getPath("temp"),
  systemLanguagesProvider: () => getElectronSystemLanguages(app),
  hostContextProvider: async () => ({
    application: "davinci-resolve",
    version: await bridgeExecutionAdapter.getResolveVersion()
  }),
  markerBackends: {
    resolveScriptApi: bridgeExecutionAdapter
  },
  imageClipboard: {
    clipboard: createClipboardImageReader({ clipboard }),
    picturesPath: app.getPath("pictures"),
    resolveMediaPool: bridgeExecutionAdapter
  }
});
const interactionManager = new InteractionManager({
  bindingStorage: BindingStorage.fromAppData(app.getPath("appData")),
  executeCommand: executeStandaloneCommand
});

async function executeStandaloneCommand(commandId) {
  try {
    return await core.executeCommand(commandId);
  } catch (error) {
    if (String(error && error.message).includes("Resolve scripting API is unavailable")) {
      throw new Error(
        `${error.message}. This command was handled by the standalone bridge-backed Electron app, not the Resolve Workflow Integration plugin. Quit any standalone Clackly, npm start/dev, or Utility-script-launched Electron process, then load Clackly from Resolve's Workspace > Workflow Integrations menu.`
      );
    }

    throw error;
  }
}

function createStandalonePaletteWindow() {
  return nativeDualWindowHost
    ? nativeDualWindowHost.createWindow()
    : createPaletteWindow();
}

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

const hasSingleInstanceLock = app.requestSingleInstanceLock();
if (!hasSingleInstanceLock) {
  app.quit();
} else {
  app.on("second-instance", showPalette);

  app.whenReady().then(() => {
    queueMicrotask(() => core.prewarmAfterEffectsProcessProbe().catch(() => {}));
    paletteWindow = composeStartup({
      initializeAfterEffectsPath: () => initializeAfterEffectsPath(core.configManager),
      createPaletteWindow: createStandalonePaletteWindow,
      registerIpcHandlers,
      registerPaletteHotkey: () => registerPaletteHotkey(togglePalette),
      reportInitializationError: (error) => {
        console.error(error);
        const locale = core.localizationService.getSnapshot().effectiveLocale;
        dialog.showErrorBox(translate(locale, "app.title"), translate(locale, "error.generic"));
      }
    }).paletteWindow;

    app.on("activate", () => {
      if (!paletteWindow || paletteWindow.isDestroyed()) {
        paletteWindow = createStandalonePaletteWindow();
      }
    });
  });

  app.on("will-quit", () => {
    const { globalShortcut } = require("electron");
    globalShortcut.unregisterAll();
    core.disposeAfterEffectsProcessProbe();
  });

  app.on("window-all-closed", () => {});
}
