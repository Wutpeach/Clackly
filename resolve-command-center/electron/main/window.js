const path = require("node:path");
const { BrowserWindow, screen } = require("electron");

const DEFAULT_DEV_SERVER_PORT = "5173";
const PALETTE_SIZE = Object.freeze({
  width: 376,
  height: 468
});
const PALETTE_CURSOR_GAP = 12;
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

function isPaletteWindowShown(window) {
  if (!window || window.isDestroyed()) {
    return false;
  }
  return window.isVisible() && window.getOpacity() > 0;
}

function positionPaletteNearCursor(window, screenApi) {
  const cursorPoint = screenApi.getCursorScreenPoint();
  const workArea = screenApi.getDisplayNearestPoint(cursorPoint).workArea;
  const { width, height } = PALETTE_SIZE;

  let x = cursorPoint.x + PALETTE_CURSOR_GAP;
  let y = cursorPoint.y + PALETTE_CURSOR_GAP;

  if (x + width > workArea.x + workArea.width) {
    x = cursorPoint.x - PALETTE_CURSOR_GAP - width;
  }
  if (y + height > workArea.y + workArea.height) {
    y = cursorPoint.y - PALETTE_CURSOR_GAP - height;
  }

  x = Math.min(Math.max(x, workArea.x), workArea.x + workArea.width - width);
  y = Math.min(Math.max(y, workArea.y), workArea.y + workArea.height - height);

  window.setPosition(x, y);
}

function createPaletteWindow(BrowserWindowType = BrowserWindow) {
  const window = new BrowserWindowType({
    width: PALETTE_SIZE.width,
    height: PALETTE_SIZE.height,
    show: false,
    frame: false,
    roundedCorners: false,
    transparent: true,
    thickFrame: false,
    resizable: false,
    maximizable: false,
    minimizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    backgroundColor: "#00000000",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  });

  loadRenderer(window);
  window.center();

  window.on("blur", () => {
    if (isPaletteWindowShown(window)) {
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
    roundedCorners: false,
    transparent: true,
    thickFrame: false,
    resizable: false,
    maximizable: false,
    minimizable: false,
    fullscreenable: false,
    alwaysOnTop: false,
    autoHideMenuBar: true,
    backgroundColor: "#00000000",
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

function showPaletteWindow(window, options = {}) {
  if (!window || window.isDestroyed()) {
    return;
  }

  const screenApi = options.screen || screen;
  if (screenApi) {
    positionPaletteNearCursor(window, screenApi);
  }

  window.setFocusable(true);
  window.setIgnoreMouseEvents(false);
  window.setOpacity(1);
  if (window.isVisible()) {
    window.focus();
  } else {
    window.show();
  }
  window.webContents.send("palette:shown");
}

function hidePaletteWindow(window) {
  if (!window || window.isDestroyed()) {
    return;
  }

  if (!isPaletteWindowShown(window)) {
    return;
  }

  window.setOpacity(0);
  window.setIgnoreMouseEvents(true);
  window.setFocusable(false);
}

module.exports = {
  PALETTE_SIZE,
  SETTINGS_SIZE,
  createPaletteWindow,
  createSettingsWindow,
  openSettingsWindow,
  showPaletteWindow,
  hidePaletteWindow,
  isPaletteWindowShown
};
