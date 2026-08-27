const path = require("node:path");
const { BrowserWindow, screen } = require("electron");

const DEFAULT_DEV_SERVER_PORT = "5173";
const PALETTE_SIZE = Object.freeze({
  width: 240,
  height: 320
});
const PALETTE_INTERACTION_PANEL = Object.freeze({
  gap: 16,
  width: 260,
  minHeight: 60,
  maxHeight: 180,
  inset: 8
});
const PALETTE_INTERACTION_SIZE = Object.freeze({
  width: PALETTE_SIZE.width + PALETTE_INTERACTION_PANEL.gap + PALETTE_INTERACTION_PANEL.width,
  height: PALETTE_SIZE.height
});
const SETTINGS_SIZE = Object.freeze({
  width: 760,
  height: 560
});
const interactionPanelState = new WeakMap();

function clamp(value, minimum, maximum) {
  return Math.min(Math.max(value, minimum), maximum);
}

function paletteBaseShape() {
  return [{ x: 0, y: 0, width: PALETTE_SIZE.width, height: PALETTE_SIZE.height }];
}

function setPaletteShape(window, rectangles) {
  if (typeof window.setShape !== "function") return false;
  try {
    window.setShape(rectangles);
    return true;
  } catch (_error) {
    return false;
  }
}

function normalizeInteractionPanelMetrics(metrics) {
  if (!metrics || typeof metrics !== "object" || Array.isArray(metrics)) return null;
  const keys = Object.keys(metrics);
  if (keys.some((key) => key !== "anchorY" && key !== "contentHeight")) return null;
  const { anchorY, contentHeight } = metrics;
  if (!Number.isInteger(anchorY) || !Number.isInteger(contentHeight)) return null;
  if (anchorY < 0 || anchorY > PALETTE_SIZE.height) return null;
  if (contentHeight < PALETTE_INTERACTION_PANEL.minHeight || contentHeight > PALETTE_INTERACTION_PANEL.maxHeight) return null;
  return { anchorY, contentHeight };
}

function getInteractionPanelGeometry(metrics) {
  const normalized = normalizeInteractionPanelMetrics(metrics);
  if (!normalized) return null;

  const panelTop = clamp(
    Math.round(normalized.anchorY - normalized.contentHeight / 2),
    PALETTE_INTERACTION_PANEL.inset,
    PALETTE_SIZE.height - PALETTE_INTERACTION_PANEL.inset - normalized.contentHeight
  );
  const panel = {
    x: PALETTE_SIZE.width + PALETTE_INTERACTION_PANEL.gap,
    y: panelTop,
    width: PALETTE_INTERACTION_PANEL.width,
    height: normalized.contentHeight
  };
  return {
    ...normalized,
    panel,
    shape: [...paletteBaseShape(), panel]
  };
}

function getWindowBounds(window) {
  if (typeof window.getBounds === "function") return window.getBounds();
  return { x: 0, y: 0, width: PALETTE_SIZE.width, height: PALETTE_SIZE.height };
}

function getInteractionPaletteBounds(baseBounds, screenApi) {
  const display = screenApi?.getDisplayMatching?.(baseBounds) || screenApi?.getDisplayNearestPoint?.(baseBounds);
  const workArea = display?.workArea;
  if (!workArea) {
    return { x: baseBounds.x, y: baseBounds.y, ...PALETTE_INTERACTION_SIZE };
  }
  const maximumX = Math.max(workArea.x, workArea.x + workArea.width - PALETTE_INTERACTION_SIZE.width);
  const maximumY = Math.max(workArea.y, workArea.y + workArea.height - PALETTE_INTERACTION_SIZE.height);
  return {
    x: clamp(baseBounds.x, workArea.x, maximumX),
    y: clamp(baseBounds.y, workArea.y, maximumY),
    ...PALETTE_INTERACTION_SIZE
  };
}

function sameBounds(left, right) {
  return left.x === right.x && left.y === right.y && left.width === right.width && left.height === right.height;
}

function sameShape(left, right) {
  return left.length === right.length && left.every((rectangle, index) => {
    const other = right[index];
    return rectangle.x === other.x && rectangle.y === other.y && rectangle.width === other.width && rectangle.height === other.height;
  });
}

function openInteractionPanel(window, metrics, options = {}) {
  if (!window || window.isDestroyed()) return null;
  if (typeof window.setShape !== "function") return null;
  const geometry = getInteractionPanelGeometry(metrics);
  if (!geometry) return null;

  const previous = interactionPanelState.get(window);
  const baseBounds = previous?.baseBounds || getWindowBounds(window);
  const nextBounds = getInteractionPaletteBounds(baseBounds, options.screen || screen);
  if (!previous || !sameBounds(previous.bounds, nextBounds)) {
    if (typeof window.setBounds === "function") window.setBounds(nextBounds);
  }
  if (!previous || !sameShape(previous.shape, geometry.shape)) {
    if (!setPaletteShape(window, geometry.shape)) {
      const current = getWindowBounds(window);
      if (!sameBounds(current, baseBounds) && typeof window.setBounds === "function") window.setBounds(baseBounds);
      setPaletteShape(window, paletteBaseShape());
      interactionPanelState.delete(window);
      return null;
    }
  }
  interactionPanelState.set(window, { baseBounds, bounds: nextBounds, shape: geometry.shape });
  return { panelTop: geometry.panel.y, panelHeight: geometry.panel.height, anchorY: geometry.anchorY };
}

function closeInteractionPanel(window) {
  if (!window || window.isDestroyed()) return false;
  const previous = interactionPanelState.get(window);
  if (!previous) return false;

  const current = getWindowBounds(window);
  const { baseBounds } = previous;
  if (!sameBounds(current, baseBounds) && typeof window.setBounds === "function") window.setBounds(baseBounds);
  setPaletteShape(window, paletteBaseShape());
  interactionPanelState.delete(window);
  return true;
}

function registerInteractionPanelIpc(ipcMain, getPaletteWindow) {
  ipcMain.handle("palette:interaction-panel:open", (_event, metrics) => (
    openInteractionPanel(getPaletteWindow(), metrics)
  ));
  ipcMain.on("palette:interaction-panel:close", () => {
    closeInteractionPanel(getPaletteWindow());
  });
}

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

  let x = cursorPoint.x;
  let y = cursorPoint.y;

  if (x + width > workArea.x + workArea.width) {
    x = cursorPoint.x - width;
  }
  if (y + height > workArea.y + workArea.height) {
    y = cursorPoint.y - height;
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
  setPaletteShape(window, paletteBaseShape());

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

  closeInteractionPanel(window);
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

  closeInteractionPanel(window);

  if (!isPaletteWindowShown(window)) {
    return;
  }

  window.setOpacity(0);
  window.setIgnoreMouseEvents(true);
  window.setFocusable(false);
}

module.exports = {
  PALETTE_SIZE,
  PALETTE_INTERACTION_PANEL,
  PALETTE_INTERACTION_SIZE,
  SETTINGS_SIZE,
  getInteractionPanelGeometry,
  openInteractionPanel,
  closeInteractionPanel,
  registerInteractionPanelIpc,
  createPaletteWindow,
  createSettingsWindow,
  openSettingsWindow,
  showPaletteWindow,
  hidePaletteWindow,
  isPaletteWindowShown
};
