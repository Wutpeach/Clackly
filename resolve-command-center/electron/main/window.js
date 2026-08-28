const path = require("node:path");
const { BrowserWindow, screen } = require("electron");
const paletteGeometry = require("../shared/palette-geometry.json");
const { translate } = require("../../localization/resources");
const {
  PALETTE_SURFACE,
  PALETTE_INTERACTION_MODE
} = require("./paletteHostPolicy");

const { shadowPadding: PALETTE_SHADOW_PADDING } = paletteGeometry;

const DEFAULT_DEV_SERVER_PORT = "5173";
const PALETTE_SIZE = Object.freeze({
  width: paletteGeometry.main.width,
  height: paletteGeometry.main.height
});
const PALETTE_WINDOW_SIZE = Object.freeze({
  width: PALETTE_SIZE.width + PALETTE_SHADOW_PADDING * 2,
  height: PALETTE_SIZE.height + PALETTE_SHADOW_PADDING * 2
});
const PALETTE_INTERACTION_PANEL = Object.freeze({
  gap: paletteGeometry.interactionPanel.gap,
  width: paletteGeometry.interactionPanel.width,
  minHeight: paletteGeometry.interactionPanel.minHeight,
  maxHeight: paletteGeometry.interactionPanel.maxHeight,
  inset: paletteGeometry.interactionPanel.inset
});
const PALETTE_INTERACTION_SIZE = Object.freeze({
  width: PALETTE_SIZE.width + PALETTE_INTERACTION_PANEL.gap + PALETTE_INTERACTION_PANEL.width,
  height: PALETTE_SIZE.height
});
const PALETTE_INTERACTION_WINDOW_SIZE = Object.freeze({
  width: PALETTE_INTERACTION_SIZE.width + PALETTE_SHADOW_PADDING * 2,
  height: PALETTE_INTERACTION_SIZE.height + PALETTE_SHADOW_PADDING * 2
});
const SETTINGS_SIZE = Object.freeze({
  width: 760,
  height: 560
});
const interactionPanelState = new WeakMap();
const detachedInteractionPanelState = new WeakMap();
const readyDetachedInteractionPanels = new WeakSet();

function clamp(value, minimum, maximum) {
  return Math.min(Math.max(value, minimum), maximum);
}

function isWindowFocused(window) {
  try {
    return typeof window?.isFocused === "function" ? Boolean(window.isFocused()) : false;
  } catch (_error) {
    return false;
  }
}

function paddedPaletteRectangle(rectangle) {
  return {
    x: rectangle.x - PALETTE_SHADOW_PADDING,
    y: rectangle.y - PALETTE_SHADOW_PADDING,
    width: rectangle.width + PALETTE_SHADOW_PADDING * 2,
    height: rectangle.height + PALETTE_SHADOW_PADDING * 2
  };
}

function paletteBaseShape() {
  return [paddedPaletteRectangle({
    x: PALETTE_SHADOW_PADDING,
    y: PALETTE_SHADOW_PADDING,
    ...PALETTE_SIZE
  })];
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
    shape: [
      ...paletteBaseShape(),
      paddedPaletteRectangle({
        x: PALETTE_SHADOW_PADDING + panel.x,
        y: PALETTE_SHADOW_PADDING + panel.y,
        width: panel.width,
        height: panel.height
      })
    ]
  };
}

function getWindowBounds(window) {
  if (typeof window.getBounds === "function") return window.getBounds();
  return { x: 0, y: 0, ...PALETTE_WINDOW_SIZE };
}

function getInteractionPaletteBounds(baseBounds, screenApi) {
  const display = screenApi?.getDisplayMatching?.(baseBounds) || screenApi?.getDisplayNearestPoint?.(baseBounds);
  const workArea = display?.workArea;
  if (!workArea) {
    return { x: baseBounds.x, y: baseBounds.y, ...PALETTE_INTERACTION_WINDOW_SIZE };
  }
  const maximumX = Math.max(workArea.x, workArea.x + workArea.width - PALETTE_INTERACTION_WINDOW_SIZE.width);
  const maximumY = Math.max(workArea.y, workArea.y + workArea.height - PALETTE_INTERACTION_WINDOW_SIZE.height);
  return {
    x: clamp(baseBounds.x, workArea.x, maximumX),
    y: clamp(baseBounds.y, workArea.y, maximumY),
    ...PALETTE_INTERACTION_WINDOW_SIZE
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

function registerInteractionPanelIpc(ipcMain, getPaletteWindow, detachedPanelController) {
  ipcMain.handle("palette:interaction-panel:open", (_event, payload) => {
    if (detachedPanelController) {
      return detachedPanelController.open(payload);
    }
    return openInteractionPanel(getPaletteWindow(), payload);
  });
  ipcMain.on("palette:interaction-panel:close", () => {
    if (detachedPanelController) {
      detachedPanelController.close();
    }
    else closeInteractionPanel(getPaletteWindow());
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

function loadRenderer(window, view, options = {}) {
  const rendererUrl = getRendererUrl();
  if (rendererUrl) {
    const url = new URL(rendererUrl);
    if (view) url.searchParams.set("view", view);
    if (options.paletteSurface) url.searchParams.set("palette-surface", options.paletteSurface);
    if (options.interactionPanelMode) url.searchParams.set("interaction-panel-mode", options.interactionPanelMode);
    return window.loadURL(url.toString());
  }

  const query = {
    ...(view ? { view } : {}),
    ...(options.paletteSurface ? { "palette-surface": options.paletteSurface } : {}),
    ...(options.interactionPanelMode ? { "interaction-panel-mode": options.interactionPanelMode } : {})
  };
  return window.loadFile(
    path.join(__dirname, "../../dist/renderer/index.html"),
    Object.keys(query).length > 0 ? { query } : undefined
  );
}

function isPaletteWindowShown(window) {
  if (!window || window.isDestroyed()) {
    return false;
  }
  return window.isVisible() && window.getOpacity() > 0;
}

function usesD6OpaqueFullBleed(options) {
  return options?.surface === PALETTE_SURFACE.OPAQUE_FULL_BLEED;
}

function usesDetachedNativePanel(options) {
  return options?.interactionPanel === PALETTE_INTERACTION_MODE.DETACHED_NATIVE;
}

function getPaletteWindowSize(options) {
  return usesD6OpaqueFullBleed(options) ? PALETTE_SIZE : PALETTE_WINDOW_SIZE;
}

function getPaletteInset(options) {
  return usesD6OpaqueFullBleed(options) ? 0 : PALETTE_SHADOW_PADDING;
}

function positionPaletteNearCursor(window, screenApi, options = {}) {
  const cursorPoint = screenApi.getCursorScreenPoint();
  const workArea = screenApi.getDisplayNearestPoint(cursorPoint).workArea;
  const { width, height } = PALETTE_SIZE;
  const { width: windowWidth, height: windowHeight } = getPaletteWindowSize(options);
  const inset = getPaletteInset(options);

  let visibleX = cursorPoint.x;
  let visibleY = cursorPoint.y;

  if (visibleX + width + inset > workArea.x + workArea.width) {
    visibleX = cursorPoint.x - width;
  }
  if (visibleY + height + inset > workArea.y + workArea.height) {
    visibleY = cursorPoint.y - height;
  }

  const maximumX = Math.max(workArea.x, workArea.x + workArea.width - windowWidth);
  const maximumY = Math.max(workArea.y, workArea.y + workArea.height - windowHeight);
  const x = clamp(visibleX - inset, workArea.x, maximumX);
  const y = clamp(visibleY - inset, workArea.y, maximumY);

  window.setPosition(x, y);
}

function createPaletteWindow(options = {}, BrowserWindowType = BrowserWindow) {
  const opaqueFullBleed = usesD6OpaqueFullBleed(options);
  const paletteWindowSize = getPaletteWindowSize(options);
  const window = new BrowserWindowType({
    width: paletteWindowSize.width,
    height: paletteWindowSize.height,
    show: false,
    frame: false,
    roundedCorners: opaqueFullBleed,
    transparent: !opaqueFullBleed,
    thickFrame: opaqueFullBleed,
    resizable: false,
    maximizable: false,
    minimizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    backgroundColor: opaqueFullBleed ? paletteGeometry.main.surface : "#00000000",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  });

  loadRenderer(window, undefined, opaqueFullBleed
    ? {
      paletteSurface: PALETTE_SURFACE.OPAQUE_FULL_BLEED,
      ...(usesDetachedNativePanel(options)
        ? { interactionPanelMode: PALETTE_INTERACTION_MODE.DETACHED_NATIVE }
        : {})
    }
    : undefined);
  window.center();
  if (!opaqueFullBleed) setPaletteShape(window, paletteBaseShape());

  window.on("blur", () => {
    if (options.ignoreFocusedBlur && isWindowFocused(window)) {
      return;
    }
    if (isPaletteWindowShown(window)) hidePaletteWindow(window);
  });

  return window;
}

function hasExactKeys(value, keys) {
  return Object.keys(value).length === keys.length && keys.every((key) => Object.hasOwn(value, key));
}

function isBoundedPresentationText(value, maximumLength) {
  return typeof value === "string" && value.length > 0 && value.length <= maximumLength && !/[<>\u0000-\u001F]/.test(value);
}

function normalizeDetachedInteractionPanelPresentation(presentation) {
  if (!presentation || typeof presentation !== "object" || Array.isArray(presentation)) return null;
  if (presentation.kind === "mappings") {
    if (!hasExactKeys(presentation, ["kind", "effectiveLocale", "ariaLabel", "rows"]) || !Array.isArray(presentation.rows)
      || !["en", "zh-CN"].includes(presentation.effectiveLocale) || !isBoundedPresentationText(presentation.ariaLabel, 240)) return null;
    if (presentation.rows.length < 2 || presentation.rows.length > 16) return null;
    const rows = [];
    for (const row of presentation.rows) {
      if (!row || typeof row !== "object" || Array.isArray(row) || !hasExactKeys(row, ["label", "actionName", "ariaLabel"])) return null;
      if (!isBoundedPresentationText(row.label, 80) || !isBoundedPresentationText(row.actionName, 240) || !isBoundedPresentationText(row.ariaLabel, 320)) return null;
      rows.push({ label: row.label, actionName: row.actionName, ariaLabel: row.ariaLabel });
    }
    return { kind: "mappings", effectiveLocale: presentation.effectiveLocale, ariaLabel: presentation.ariaLabel, rows };
  }
  if (presentation.kind === "description") {
    if (!hasExactKeys(presentation, ["kind", "effectiveLocale", "ariaLabel", "description"])) return null;
    if (!["en", "zh-CN"].includes(presentation.effectiveLocale) || !isBoundedPresentationText(presentation.ariaLabel, 240) || !isBoundedPresentationText(presentation.description, 640)) return null;
    return { kind: "description", effectiveLocale: presentation.effectiveLocale, ariaLabel: presentation.ariaLabel, description: presentation.description };
  }
  return null;
}

function normalizeDetachedInteractionPanelRequest(request) {
  if (!request || typeof request !== "object" || Array.isArray(request) || !hasExactKeys(request, ["metrics", "presentation"])) return null;
  const metrics = normalizeInteractionPanelMetrics(request.metrics);
  const presentation = normalizeDetachedInteractionPanelPresentation(request.presentation);
  return metrics && presentation ? { metrics, presentation } : null;
}

function getDetachedInteractionPanelGeometry(baseBounds, metrics, screenApi) {
  const normalized = normalizeInteractionPanelMetrics(metrics);
  if (!normalized) return null;
  const panelTop = clamp(
    Math.round(normalized.anchorY - normalized.contentHeight / 2),
    PALETTE_INTERACTION_PANEL.inset,
    PALETTE_SIZE.height - PALETTE_INTERACTION_PANEL.inset - normalized.contentHeight
  );
  const display = screenApi?.getDisplayMatching?.(baseBounds) || screenApi?.getDisplayNearestPoint?.(baseBounds);
  const workArea = display?.workArea;
  const combinedWidth = PALETTE_SIZE.width + PALETTE_INTERACTION_PANEL.gap + PALETTE_INTERACTION_PANEL.width;
  const combinedHeight = PALETTE_SIZE.height;
  const maximumX = workArea
    ? Math.max(workArea.x, workArea.x + workArea.width - combinedWidth)
    : baseBounds.x;
  const maximumY = workArea
    ? Math.max(workArea.y, workArea.y + workArea.height - combinedHeight)
    : baseBounds.y;
  const mainBounds = {
    x: workArea ? clamp(baseBounds.x, workArea.x, maximumX) : baseBounds.x,
    y: workArea ? clamp(baseBounds.y, workArea.y, maximumY) : baseBounds.y,
    width: PALETTE_SIZE.width,
    height: PALETTE_SIZE.height
  };
  return {
    panelTop,
    panelHeight: normalized.contentHeight,
    anchorY: normalized.anchorY,
    mainBounds,
    panelBounds: {
      x: mainBounds.x + PALETTE_SIZE.width + PALETTE_INTERACTION_PANEL.gap,
      y: mainBounds.y + panelTop,
      width: PALETTE_INTERACTION_PANEL.width,
      height: normalized.contentHeight
    }
  };
}

function createDetachedInteractionPanelWindow(BrowserWindowType = BrowserWindow) {
  const window = new BrowserWindowType({
    width: PALETTE_INTERACTION_PANEL.width,
    height: PALETTE_INTERACTION_PANEL.minHeight,
    show: true,
    opacity: 0,
    frame: false,
    roundedCorners: true,
    transparent: false,
    thickFrame: true,
    resizable: false,
    maximizable: false,
    minimizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    focusable: false,
    backgroundColor: paletteGeometry.main.surface,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  });
  window.setIgnoreMouseEvents(true);
  loadRenderer(window, "interaction-panel");
  window.webContents.once("did-finish-load", () => {
    markDetachedInteractionPanelReady(window);
  });
  return window;
}

function markDetachedInteractionPanelReady(window) {
  if (!window || window.isDestroyed() || readyDetachedInteractionPanels.has(window)) return false;
  readyDetachedInteractionPanels.add(window);
  return true;
}

function closeDetachedInteractionPanel(mainWindow, panelWindow, { restoreFocus = false } = {}) {
  const state = mainWindow && !mainWindow.isDestroyed() ? detachedInteractionPanelState.get(mainWindow) : null;
  if (!state) return false;
  let closed = false;
  if (panelWindow && !panelWindow.isDestroyed()) {
    try {
      panelWindow.setOpacity(0);
      panelWindow.setIgnoreMouseEvents(true);
      closed = true;
    } catch (_error) {
      closed = false;
    }
    try {
      panelWindow.webContents.send("interaction-panel:presentation", null);
    } catch (_error) {
      closed = false;
    }
  }
  if (mainWindow && !mainWindow.isDestroyed()) {
    try {
      if (!sameBounds(getWindowBounds(mainWindow), state.baseBounds)) {
        mainWindow.setBounds(state.baseBounds);
      }
    } catch (_error) {
      closed = false;
    }
  }
  if (mainWindow && !mainWindow.isDestroyed()) {
    detachedInteractionPanelState.delete(mainWindow);
    const mainIsFocused = isWindowFocused(mainWindow);
    const shouldRestoreFocus = restoreFocus && !mainIsFocused;
    if (shouldRestoreFocus) {
      try {
        mainWindow.focus();
      } catch (_error) {}
    }
  }
  return closed;
}

function openDetachedInteractionPanel(mainWindow, panelWindow, request, options = {}) {
  const normalized = normalizeDetachedInteractionPanelRequest(request);
  if (!normalized || !mainWindow || mainWindow.isDestroyed() || !panelWindow || panelWindow.isDestroyed() || !readyDetachedInteractionPanels.has(panelWindow)) {
    closeDetachedInteractionPanel(mainWindow, panelWindow);
    return null;
  }
  const previous = detachedInteractionPanelState.get(mainWindow);
  const baseBounds = previous?.baseBounds || getWindowBounds(mainWindow);
  const geometry = getDetachedInteractionPanelGeometry(baseBounds, normalized.metrics, options.screen || screen);
  if (!geometry) {
    closeDetachedInteractionPanel(mainWindow, panelWindow);
    return null;
  }
  try {
    // Keep the original D6 bounds available to failure cleanup before moving either native window.
    detachedInteractionPanelState.set(mainWindow, { baseBounds, panelWindow });
    if (!sameBounds(getWindowBounds(mainWindow), geometry.mainBounds)) {
      mainWindow.setBounds(geometry.mainBounds);
    }
    if (!sameBounds(getWindowBounds(panelWindow), geometry.panelBounds)) {
      panelWindow.setBounds(geometry.panelBounds);
    }
    panelWindow.setIgnoreMouseEvents(false);
    panelWindow.webContents.send("interaction-panel:presentation", normalized.presentation);
    panelWindow.setOpacity(1);
    mainWindow.focus();
    return { panelTop: geometry.panelTop, panelHeight: geometry.panelHeight, anchorY: geometry.anchorY };
  } catch (_error) {
    closeDetachedInteractionPanel(mainWindow, panelWindow);
    return null;
  }
}

function createSettingsWindow(
  BrowserWindowType = BrowserWindow,
  { title = translate("en", "settings.title") } = {}
) {
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
    title,
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

function openSettingsWindow(window, featureId, options) {
  const created = !window || window.isDestroyed();
  const settingsWindow = created ? createSettingsWindow(BrowserWindow, options) : window;
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
    positionPaletteNearCursor(window, screenApi, options);
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

function hidePaletteWindow(window, options = {}) {
  if (!window || window.isDestroyed()) {
    return;
  }

  closeInteractionPanel(window);

  const guard = isPaletteWindowShown(window);
  if (!guard) return;

  window.setOpacity(0);
  window.setIgnoreMouseEvents(true);
  window.setFocusable(false);
}

module.exports = {
  PALETTE_SHADOW_PADDING,
  PALETTE_SIZE,
  PALETTE_WINDOW_SIZE,
  PALETTE_INTERACTION_PANEL,
  PALETTE_INTERACTION_SIZE,
  PALETTE_INTERACTION_WINDOW_SIZE,
  PALETTE_SURFACE,
  PALETTE_INTERACTION_MODE,
  SETTINGS_SIZE,
  getInteractionPanelGeometry,
  openInteractionPanel,
  closeInteractionPanel,
  registerInteractionPanelIpc,
  normalizeDetachedInteractionPanelPresentation,
  normalizeDetachedInteractionPanelRequest,
  getDetachedInteractionPanelGeometry,
  createDetachedInteractionPanelWindow,
  markDetachedInteractionPanelReady,
  openDetachedInteractionPanel,
  closeDetachedInteractionPanel,
  shouldLoadDevRenderer,
  createPaletteWindow,
  createSettingsWindow,
  openSettingsWindow,
  showPaletteWindow,
  hidePaletteWindow,
  isPaletteWindowShown
};
