const path = require("node:path");
const { BrowserWindow } = require("electron");

const DEFAULT_DEV_SERVER_PORT = "5173";
const PALETTE_SIZES = Object.freeze({
  launcher: { width: 376, height: 468 },
  search: { width: 376, height: 468 },
  "all-actions": { width: 376, height: 468 }
});

function shouldLoadDevRenderer() {
  return (
    process.argv.includes("--dev-renderer") ||
    process.env.RESOLVE_COMMAND_CENTER_USE_DEV_SERVER === "1" ||
    Boolean(process.env.RESOLVE_COMMAND_CENTER_RENDERER_URL || process.env.VITE_DEV_SERVER_URL)
  );
}

function getRendererUrl() {
  const configuredUrl = process.env.RESOLVE_COMMAND_CENTER_RENDERER_URL || process.env.VITE_DEV_SERVER_URL;
  if (configuredUrl) {
    return configuredUrl;
  }

  if (shouldLoadDevRenderer()) {
    const port = process.env.VITE_DEV_SERVER_PORT || DEFAULT_DEV_SERVER_PORT;
    return `http://127.0.0.1:${port}`;
  }

  return null;
}

function createPaletteWindow() {
  const initialSize = PALETTE_SIZES.launcher;
  const window = new BrowserWindow({
    width: initialSize.width,
    height: initialSize.height,
    show: false,
    frame: false,
    resizable: false,
    maximizable: false,
    minimizable: false,
    skipTaskbar: true,
    alwaysOnTop: false,
    backgroundColor: "#101216",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  });

  const rendererUrl = getRendererUrl();
  if (rendererUrl) {
    window.loadURL(rendererUrl);
  } else {
    window.loadFile(path.join(__dirname, "../../dist/renderer/index.html"));
  }

  window.on("blur", () => {
    if (window.isVisible()) {
      hidePaletteWindow(window);
    }
  });

  return window;
}

function setPaletteWindowMode(window, mode) {
  const size = PALETTE_SIZES[mode];
  if (!window || window.isDestroyed() || !size) {
    return false;
  }

  window.setSize(size.width, size.height, false);
  window.center();
  return true;
}

function showPaletteWindow(window) {
  if (!window || window.isDestroyed()) {
    return;
  }

  setPaletteWindowMode(window, "launcher");
  window.setSkipTaskbar(true);
  window.setAlwaysOnTop(true, "floating");
  window.show();
  window.focus();
  window.webContents.send("palette:shown");
}

function hidePaletteWindow(window) {
  if (!window || window.isDestroyed()) {
    return;
  }

  window.hide();
  window.setAlwaysOnTop(false);
}

module.exports = {
  createPaletteWindow,
  showPaletteWindow,
  hidePaletteWindow,
  setPaletteWindowMode
};
