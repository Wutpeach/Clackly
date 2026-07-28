const { app, ipcMain } = require("electron");
const { createPaletteWindow, showPaletteWindow, hidePaletteWindow } = require("./window");
const { registerPaletteHotkey } = require("./hotkey");
const { getCommands, searchCommands } = require("../../command-engine/registry");
const { executeCommand } = require("../../command-engine/executor");

let paletteWindow = null;

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
    const result = await executeCommand(commandId);
    hidePalette();
    return result;
  });
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
