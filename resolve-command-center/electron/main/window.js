const path = require("node:path");
const { BrowserWindow } = require("electron");

const DEFAULT_DEV_SERVER_PORT = "5173";
const PALETTE_SIZES = Object.freeze({
  launcher: { width: 376, height: 468 },
  search: { width: 376, height: 468 },
  "all-actions": { width: 376, height: 468 }
});
const SETTINGS_SIZE = Object.freeze({
  width: 760,
  height: 560
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

function loadRenderer(window, view) {
  const rendererUrl = getRendererUrl();
  if (rendererUrl) {
    const url = new URL(rendererUrl);
    if (view) url.searchParams.set("view", view);
    return window.loadURL(url.toString());
  }

  return window.loadFile(
    path.join(__dirname, "../../dist/renderer/index.html"),
    view ? { query: { view } } : undefined
  );
}

function createPaletteWindow(BrowserWindowType = BrowserWindow) {
  const initialSize = PALETTE_SIZES.launcher;
  const window = new BrowserWindowType({
    width: initialSize.width,
    height: initialSize.height,
    show: false,
    frame: false,
    transparent: true,
    thickFrame: false,
    resizable: false,
    maximizable: false,
    minimizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    alwaysOnTop: false,
    backgroundColor: "#00000000",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  });

  loadRenderer(window);

  window.on("blur", () => {
    if (window.isVisible()) {
      hidePaletteWindow(window);
    }
  });

  return window;
}

function createSettingsWindow(BrowserWindowType = BrowserWindow) {
  const window = new BrowserWindowType({
    width: SETTINGS_SIZE.width,
    height: SETTINGS_SIZE.height,
    show: false,
    frame: false,
    thickFrame: false,
    resizable: false,
    maximizable: false,
    minimizable: false,
    fullscreenable: false,
    alwaysOnTop: false,
    autoHideMenuBar: true,
    backgroundColor: "#101216",
    title: "Clackly Settings",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  });

  loadRenderer(window, "settings");
  window.center();
  return window;
}

function openSettingsWindow(window, featureId) {
  const created = !window || window.isDestroyed();
  const settingsWindow = created ? createSettingsWindow() : window;
  if (typeof featureId === "string" && featureId.trim()) {
    const selectFeature = () => settingsWindow.webContents.send("settings:select-feature", featureId);
    if (created) settingsWindow.once("ready-to-show", selectFeature);
    else selectFeature();
  }
  if (settingsWindow.isMinimized()) settingsWindow.restore();
  settingsWindow.show();
  settingsWindow.focus();
  return settingsWindow;
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
  PALETTE_SIZES,
  SETTINGS_SIZE,
  createPaletteWindow,
  createSettingsWindow,
  openSettingsWindow,
  showPaletteWindow,
  hidePaletteWindow,
  setPaletteWindowMode
};
