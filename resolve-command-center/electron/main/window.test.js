const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const { translate } = require("../../localization/resources");

const {
  PALETTE_SHADOW_PADDING,
  PALETTE_SIZE,
  PALETTE_WINDOW_SIZE,
  PALETTE_INTERACTION_PANEL,
  PALETTE_INTERACTION_SIZE,
  PALETTE_INTERACTION_WINDOW_SIZE,
  PALETTE_INTERACTION_MODE,
  PALETTE_SURFACE,
  SETTINGS_SIZE,
  createPaletteWindow,
  createSettingsWindow,
  openSettingsWindow,
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
  showPaletteWindow,
  hidePaletteWindow,
  isPaletteWindowShown
} = require("./window");
const { WINDOWS_NATIVE_DUAL_WINDOW_POLICY } = require("./paletteHostPolicy");

function withoutDevRenderer(callback) {
  const names = [
    "RESOLVE_COMMAND_CENTER_USE_DEV_SERVER",
    "RESOLVE_COMMAND_CENTER_RENDERER_URL",
    "VITE_DEV_SERVER_URL"
  ];
  const previous = Object.fromEntries(names.map((name) => [name, process.env[name]]));
  names.forEach((name) => delete process.env[name]);
  try {
    callback();
  } finally {
    names.forEach((name) => {
      if (previous[name] === undefined) delete process.env[name];
      else process.env[name] = previous[name];
    });
  }
}

function withDevRenderer(callback) {
  const previous = process.env.RESOLVE_COMMAND_CENTER_RENDERER_URL;
  process.env.RESOLVE_COMMAND_CENTER_RENDERER_URL = "http://127.0.0.1:5173";
  try {
    callback();
  } finally {
    if (previous === undefined) delete process.env.RESOLVE_COMMAND_CENTER_RENDERER_URL;
    else process.env.RESOLVE_COMMAND_CENTER_RENDERER_URL = previous;
  }
}

function createShowPaletteWindow(calls) {
  return {
    isDestroyed: () => false,
    isVisible: () => false,
    getOpacity: () => 1,
    setFocusable: (value) => calls.push(["setFocusable", value]),
    setIgnoreMouseEvents: (value) => calls.push(["setIgnoreMouseEvents", value]),
    setOpacity: (value) => calls.push(["setOpacity", value]),
    setPosition: (x, y) => calls.push(["setPosition", x, y]),
    show: () => calls.push("show"),
    focus: () => calls.push("focus"),
    webContents: { send: () => {} }
  };
}

function createAttachedPaletteWindow(calls, initialBounds = { x: 100, y: 100, ...PALETTE_WINDOW_SIZE }) {
  let bounds = { ...initialBounds };
  return {
    isDestroyed: () => false,
    getBounds: () => ({ ...bounds }),
    setBounds: (nextBounds) => {
      bounds = { ...nextBounds };
      calls.push(["setBounds", nextBounds]);
    },
    setShape: (shape) => calls.push(["setShape", shape]),
    isVisible: () => true,
    getOpacity: () => 1,
    setOpacity: (value) => calls.push(["setOpacity", value]),
    setIgnoreMouseEvents: (value) => calls.push(["setIgnoreMouseEvents", value]),
    setFocusable: (value) => calls.push(["setFocusable", value]),
    focus: () => calls.push(["focus"])
  };
}

function createDetachedPanelWindow(calls, initialBounds = { x: 0, y: 0, width: 260, height: 60 }) {
  let bounds = { ...initialBounds };
  return {
    isDestroyed: () => false,
    getBounds: () => ({ ...bounds }),
    setBounds: (nextBounds) => {
      bounds = { ...nextBounds };
      calls.push(["setBounds", nextBounds]);
    },
    setOpacity: (value) => calls.push(["setOpacity", value]),
    setIgnoreMouseEvents: (value) => calls.push(["setIgnoreMouseEvents", value]),
    setFocusable: (value) => calls.push(["setFocusable", value]),
    showInactive: () => calls.push("showInactive"),
    show: () => calls.push("show"),
    hide: () => calls.push("hide"),
    minimize: () => calls.push("minimize"),
    restore: () => calls.push("restore"),
    webContents: { send: (...args) => calls.push(["send", ...args]) }
  };
}

test("palette owns one fixed footprint and settings owns separate dimensions", () => {
  assert.equal(PALETTE_SHADOW_PADDING, 8);
  assert.deepEqual(PALETTE_SIZE, {
    width: 240,
    height: 320
  });
  assert.deepEqual(PALETTE_WINDOW_SIZE, { width: 256, height: 336 });
  assert.deepEqual(SETTINGS_SIZE, {
    width: 760,
    height: 560
  });
});

test("Interaction Panel geometry accepts only bounded semantic metrics and paints two rectangles", () => {
  assert.deepEqual(PALETTE_INTERACTION_PANEL, {
    gap: 16,
    width: 260,
    minHeight: 60,
    maxHeight: 180,
    inset: 8
  });
  assert.deepEqual(PALETTE_INTERACTION_SIZE, { width: 516, height: 320 });
  assert.deepEqual(PALETTE_INTERACTION_WINDOW_SIZE, { width: 532, height: 336 });
  assert.equal(getInteractionPanelGeometry({ anchorY: 80, contentHeight: 155 }).panel.y, 8);
  assert.deepEqual(getInteractionPanelGeometry({ anchorY: 80, contentHeight: 155 }).shape, [
    { x: 0, y: 0, width: 256, height: 336 },
    { x: 256, y: 8, width: 276, height: 171 }
  ]);
  assert.equal(getInteractionPanelGeometry({ anchorY: 80, contentHeight: 155, width: 516 }), null);
  assert.equal(getInteractionPanelGeometry({ anchorY: 80, contentHeight: 181 }), null);
  assert.equal(getInteractionPanelGeometry({ anchorY: -1, contentHeight: 155 }), null);
});

test("padded shape confines the accepted shadow hit region to two exact rectangles", () => {
  const panelHeight = 155;
  const geometry = getInteractionPanelGeometry({ anchorY: 80, contentHeight: panelHeight });
  const [mainHalo, panelHalo] = geometry.shape;
  const nativeHitArea = mainHalo.width * mainHalo.height + panelHalo.width * panelHalo.height;
  const visibleArea = PALETTE_SIZE.width * PALETTE_SIZE.height + PALETTE_INTERACTION_PANEL.width * panelHeight;

  assert.deepEqual(mainHalo, { x: 0, y: 0, width: 256, height: 336 });
  assert.deepEqual(panelHalo, { x: 256, y: 8, width: 276, height: 171 });
  assert.equal(mainHalo.x + mainHalo.width, panelHalo.x, "the two padded rectangles meet without a full-width bridge");
  assert.equal(nativeHitArea - visibleArea, 16_112, "the accepted extra hit area is exactly the two 8px halos and the panel-height gap");
  assert.equal(PALETTE_INTERACTION_PANEL.gap - PALETTE_SHADOW_PADDING * 2, 0, "the 16px visual gap is fully consumed only across the panel's height");
});

test("Interaction Panel expands, clamps, and applies idempotent panel-only shape updates", () => {
  const calls = [];
  const palette = createAttachedPaletteWindow(calls, { x: 1700, y: 100, ...PALETTE_WINDOW_SIZE });
  const screenApi = {
    getDisplayMatching: () => ({ workArea: { x: 0, y: 0, width: 1920, height: 1080 } })
  };

  assert.deepEqual(openInteractionPanel(palette, { anchorY: 80, contentHeight: 155 }, { screen: screenApi }), {
    panelTop: 8,
    panelHeight: 155,
    anchorY: 80
  });
  assert.deepEqual(calls[0], ["setBounds", { x: 1388, y: 100, ...PALETTE_INTERACTION_WINDOW_SIZE }]);
  assert.deepEqual(calls[1], ["setShape", [
    { x: 0, y: 0, width: 256, height: 336 },
    { x: 256, y: 8, width: 276, height: 171 }
  ]]);

  calls.length = 0;
  openInteractionPanel(palette, { anchorY: 80, contentHeight: 155 }, { screen: screenApi });
  assert.deepEqual(calls, []);

  openInteractionPanel(palette, { anchorY: 180, contentHeight: 175 }, { screen: screenApi });
  assert.deepEqual(calls, [["setShape", [
    { x: 0, y: 0, width: 256, height: 336 },
    { x: 256, y: 93, width: 276, height: 191 }
  ]]]);

  calls.length = 0;
  assert.equal(closeInteractionPanel(palette), true);
  assert.deepEqual(calls, [
    ["setBounds", { x: 1700, y: 100, ...PALETTE_WINDOW_SIZE }],
    ["setShape", [{ x: 0, y: 0, width: 256, height: 336 }]]
  ]);
});

test("Interaction Panel fails closed without setShape and never expands the native rectangle", () => {
  const calls = [];
  const initialBounds = { x: 1700, y: 100, ...PALETTE_WINDOW_SIZE };
  const palette = createAttachedPaletteWindow(calls, initialBounds);
  delete palette.setShape;

  assert.equal(openInteractionPanel(palette, { anchorY: 80, contentHeight: 155 }), null);
  assert.deepEqual(calls, []);
  assert.deepEqual(palette.getBounds(), initialBounds);
});

test("Interaction Panel restores base bounds when applying the shape union fails", () => {
  const calls = [];
  const initialBounds = { x: 100, y: 100, ...PALETTE_WINDOW_SIZE };
  const palette = createAttachedPaletteWindow(calls, initialBounds);
  palette.setShape = (shape) => {
    calls.push(["setShape", shape]);
    throw new Error("setShape failed");
  };
  const screenApi = {
    getDisplayMatching: () => ({ workArea: { x: 0, y: 0, width: 1920, height: 1080 } })
  };

  assert.equal(openInteractionPanel(palette, { anchorY: 80, contentHeight: 155 }, { screen: screenApi }), null);
  assert.deepEqual(palette.getBounds(), initialBounds);
  assert.deepEqual(calls, [
    ["setBounds", { x: 100, y: 100, ...PALETTE_INTERACTION_WINDOW_SIZE }],
    ["setShape", [
      { x: 0, y: 0, width: 256, height: 336 },
      { x: 256, y: 8, width: 276, height: 171 }
    ]],
    ["setBounds", initialBounds],
    ["setShape", [{ x: 0, y: 0, width: 256, height: 336 }]]
  ]);
});

test("Interaction Panel close and hide restore the fixed main rectangle", () => {
  const calls = [];
  const palette = createAttachedPaletteWindow(calls);
  openInteractionPanel(palette, { anchorY: 160, contentHeight: 155 });
  calls.length = 0;

  assert.equal(closeInteractionPanel(palette), true);
  assert.deepEqual(calls, [
    ["setBounds", { x: 100, y: 100, ...PALETTE_WINDOW_SIZE }],
    ["setShape", [{ x: 0, y: 0, width: 256, height: 336 }]]
  ]);

  openInteractionPanel(palette, { anchorY: 160, contentHeight: 155 });
  calls.length = 0;
  hidePaletteWindow(palette);
  assert.deepEqual(calls, [
    ["setBounds", { x: 100, y: 100, ...PALETTE_WINDOW_SIZE }],
    ["setShape", [{ x: 0, y: 0, width: 256, height: 336 }]],
    ["setOpacity", 0],
    ["setIgnoreMouseEvents", true],
    ["setFocusable", false]
  ]);
});

test("Interaction Panel IPC exposes semantic bounded metrics rather than renderer bounds", () => {
  const handlers = new Map();
  const listeners = new Map();
  const calls = [];
  const palette = createAttachedPaletteWindow(calls);
  registerInteractionPanelIpc({
    handle: (name, handler) => handlers.set(name, handler),
    on: (name, listener) => listeners.set(name, listener)
  }, () => palette);

  assert.deepEqual(handlers.get("palette:interaction-panel:open")({}, { anchorY: 160, contentHeight: 155 }), {
    panelTop: 83,
    panelHeight: 155,
    anchorY: 160
  });
  assert.equal(handlers.get("palette:interaction-panel:open")({}, { x: 1, y: 2, width: 516, height: 320 }), null);
  listeners.get("palette:interaction-panel:close")();
  assert.ok(calls.some(([name]) => name === "setShape"));
});

test("D7 Interaction Panel IPC delegates only its bounded request to the detached controller", () => {
  const handlers = new Map();
  const listeners = new Map();
  const received = [];
  const request = {
    metrics: { anchorY: 160, contentHeight: 100 },
    presentation: { kind: "description", effectiveLocale: "en", ariaLabel: "Command information", description: "Inspect the selected Command." }
  };
  registerInteractionPanelIpc({
    handle: (name, handler) => handlers.set(name, handler),
    on: (name, listener) => listeners.set(name, listener)
  }, () => {
    throw new Error("D7 must not use the attached host helper");
  }, {
    open: (payload) => {
      received.push(["open", payload]);
      return { panelTop: 110, panelHeight: 100, anchorY: 160 };
    },
    close: () => received.push(["close"])
  });

  assert.deepEqual(handlers.get("palette:interaction-panel:open")({}, request), {
    panelTop: 110,
    panelHeight: 100,
    anchorY: 160
  });
  listeners.get("palette:interaction-panel:close")();
  assert.deepEqual(received, [["open", request], ["close"]]);
});

test("Electron dependency and lockfile stay on the Resolve host baseline", () => {
  const packageMetadata = require("../../package.json");
  const packageLock = require("../../package-lock.json");
  assert.equal(packageMetadata.devDependencies.electron, "36.3.2");
  assert.equal(packageLock.packages[""].devDependencies.electron, "36.3.2");
  assert.equal(packageLock.packages["node_modules/electron"].version, "36.3.2");
});

test("palette window uses the complete Electron 36 fixed frameless contract", () => {
  withoutDevRenderer(() => {
    class FakeBrowserWindow {
      constructor(options) {
        this.options = options;
        this.listeners = new Map();
      }

      loadFile(filePath, options) {
        this.loaded = { filePath, options };
      }

      center() {
        this.centered = true;
      }

      on(event, listener) {
        this.listeners.set(event, listener);
      }
    }

    const palette = createPaletteWindow({}, FakeBrowserWindow);
    assert.deepEqual(palette.options, {
      width: 256,
      height: 336,
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
    assert.equal(palette.loaded.filePath, path.join(__dirname, "../../dist/renderer/index.html"));
    assert.equal(palette.loaded.options, undefined);
    assert.equal(palette.centered, true);
    assert.equal(typeof palette.listeners.get("blur"), "function");
  });
});

test("the Windows native policy uses an opaque full-bleed Palette without a shape or Mica", () => {
  withDevRenderer(() => {
    class FakeBrowserWindow {
      constructor(options) {
        this.options = options;
        this.listeners = new Map();
        this.shapeCalls = [];
      }

      loadURL(url) {
        this.loadedUrl = url;
      }

      center() {
        this.centered = true;
      }

      setShape(shape) {
        this.shapeCalls.push(shape);
      }

      on(event, listener) {
        this.listeners.set(event, listener);
      }
    }

    const palette = createPaletteWindow({ surface: PALETTE_SURFACE.OPAQUE_FULL_BLEED }, FakeBrowserWindow);
    assert.deepEqual(palette.options, {
      width: 240,
      height: 320,
      show: false,
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
      backgroundColor: "#151619",
      webPreferences: {
        preload: path.join(__dirname, "preload.js"),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: false
      }
    });
    assert.equal(palette.loadedUrl, "http://127.0.0.1:5173/?palette-surface=opaque-full-bleed");
    assert.deepEqual(palette.shapeCalls, []);
    assert.equal(palette.centered, true);
    assert.equal(typeof palette.listeners.get("blur"), "function");
    assert.equal(Object.hasOwn(palette.options, "backgroundMaterial"), false);
  });
});

test("the Windows native policy keeps its exact full-bleed contract for the built or packaged renderer", () => {
  withoutDevRenderer(() => {
    class FakeBrowserWindow {
      constructor(options) {
        this.options = options;
        this.listeners = new Map();
        this.shapeCalls = [];
      }

      loadFile(filePath, options) { this.loaded = { filePath, options }; }
      center() {}
      setShape(shape) { this.shapeCalls.push(shape); }
      on(event, listener) { this.listeners.set(event, listener); }
    }

    const palette = createPaletteWindow(WINDOWS_NATIVE_DUAL_WINDOW_POLICY, FakeBrowserWindow);
    assert.deepEqual(palette.options, {
      width: 240,
      height: 320,
      show: false,
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
      backgroundColor: "#151619",
      webPreferences: {
        preload: path.join(__dirname, "preload.js"),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: false
      }
    });
    assert.deepEqual(palette.loaded, {
      filePath: path.join(__dirname, "../../dist/renderer/index.html"),
      options: {
        query: {
          "palette-surface": "opaque-full-bleed",
          "interaction-panel-mode": "detached-native-panel"
        }
      }
    });
    assert.deepEqual(palette.shapeCalls, []);
  });
});

test("the Windows native policy creates an opaque detached Panel with no native gap occupant", () => {
  withDevRenderer(() => {
    class FakeBrowserWindow {
      constructor(options) {
        this.options = options;
        this.listeners = new Map();
        this.calls = [];
        this.webContents = {
          listeners: new Map(),
          once: (event, listener) => this.webContents.listeners.set(event, listener)
        };
      }

      loadURL(url) {
        this.loadedUrl = url;
      }

      center() {
        this.centered = true;
      }

      once(event, listener) {
        this.listeners.set(event, listener);
      }

      on() {}

      isDestroyed() {
        return false;
      }

      setIgnoreMouseEvents(value) {
        this.calls.push(["setIgnoreMouseEvents", value]);
      }

      setSkipTaskbar(value) {
        this.calls.push(["setSkipTaskbar", value]);
      }

      show() {
        this.calls.push("show");
      }

      showInactive() {
        this.calls.push("showInactive");
      }

      hide() {
        this.calls.push("hide");
      }

      minimize() {
        this.calls.push("minimize");
      }

      restore() {
        this.calls.push("restore");
      }

      focus() {
        this.calls.push("focus");
      }
    }

    const main = createPaletteWindow({
      surface: PALETTE_SURFACE.OPAQUE_FULL_BLEED,
      interactionPanel: PALETTE_INTERACTION_MODE.DETACHED_NATIVE
    }, FakeBrowserWindow);
    const panel = createDetachedInteractionPanelWindow(FakeBrowserWindow);

    assert.equal(main.options.width, 240);
    assert.equal(main.options.height, 320);
    assert.equal(main.options.transparent, false);
    assert.equal(main.options.backgroundColor, "#151619");
    assert.equal(main.options.roundedCorners, true);
    assert.equal(main.options.thickFrame, true);
    assert.match(main.loadedUrl, /palette-surface=opaque-full-bleed/);
    assert.match(main.loadedUrl, /interaction-panel-mode=detached-native-panel/);
    assert.deepEqual(main.calls, [["setSkipTaskbar", true]], "D6 reasserts its taskbar policy after native construction");

    assert.deepEqual(panel.options, {
      width: 260,
      height: 60,
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
      backgroundColor: "#151619",
      webPreferences: {
        preload: path.join(__dirname, "preload.js"),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: false
      }
    });
    assert.equal(panel.loadedUrl, "http://127.0.0.1:5173/?view=interaction-panel");
    assert.equal(Object.hasOwn(panel.options, "backgroundMaterial"), false);
    assert.deepEqual(panel.calls, [
      ["setSkipTaskbar", true],
      ["setIgnoreMouseEvents", true]
    ], "D7 reasserts its taskbar policy and ignores input immediately");
    assert.equal(panel.listeners.has("ready-to-show"), false);
    const ready = panel.webContents.listeners.get("did-finish-load");
    assert.equal(typeof ready, "function");
    ready();
    assert.deepEqual(panel.calls, [
      ["setSkipTaskbar", true],
      ["setIgnoreMouseEvents", true]
    ], "renderer readiness has no native visibility or focus transition");
  });
});

test("D7 renderer readiness cannot trigger a detached visibility or focus transition while the main Palette reveals", () => {
  withDevRenderer(() => {
    const panelCalls = [];
    class FakeBrowserWindow {
      constructor() {
        this.webContents = {
          listeners: new Map(),
          once: (event, listener) => this.webContents.listeners.set(event, listener)
        };
      }

      loadURL() {}
      isDestroyed() { return false; }
      setIgnoreMouseEvents(value) { panelCalls.push(["setIgnoreMouseEvents", value]); }
      setOpacity(value) { panelCalls.push(["setOpacity", value]); }
      setFocusable(value) { panelCalls.push(["setFocusable", value]); }
      show() { panelCalls.push("show"); }
      showInactive() { panelCalls.push("showInactive"); }
      hide() { panelCalls.push("hide"); }
      minimize() { panelCalls.push("minimize"); }
      restore() { panelCalls.push("restore"); }
      focus() { panelCalls.push("focus"); }
    }

    const panel = createDetachedInteractionPanelWindow(FakeBrowserWindow);
    const mainCalls = [];
    const main = createShowPaletteWindow(mainCalls);
    showPaletteWindow(main);
    panel.webContents.listeners.get("did-finish-load")();
    showPaletteWindow(main);

    assert.deepEqual(panelCalls, [["setIgnoreMouseEvents", true]]);
    assert.ok(mainCalls.filter((call) => call === "show").length >= 1, "the D6 main can reveal around Panel readiness");
  });
});

test("D7 Info requested before detached renderer readiness fails closed without moving or hiding the main Palette", () => {
  const mainCalls = [];
  const panelCalls = [];
  const originalMainBounds = { x: 900, y: 300, width: 240, height: 320 };
  const main = createAttachedPaletteWindow(mainCalls, originalMainBounds);
  const panel = createDetachedPanelWindow(panelCalls);

  assert.equal(openDetachedInteractionPanel(main, panel, {
    metrics: { anchorY: 160, contentHeight: 100 },
    presentation: { kind: "description", effectiveLocale: "en", ariaLabel: "Command information", description: "Inspect the selected Command." }
  }), null);
  assert.deepEqual(main.getBounds(), originalMainBounds);
  assert.deepEqual(mainCalls, []);
  assert.deepEqual(panelCalls, []);
  assert.equal(panelCalls.some((call) => ["show", "showInactive", "hide", "minimize", "restore"].includes(call)), false);
});

test("D7 accepts only a bounded read-only presentation snapshot and clamps its two-window composition", () => {
  const mappings = {
    kind: "mappings",
    effectiveLocale: "en",
    ariaLabel: "Command information",
    rows: [
      { label: "Ctrl + Left Click", actionName: "Add Marker", ariaLabel: "Ctrl + Left Click: Add Marker" },
      { label: "Right Click", actionName: "Edit Marker", ariaLabel: "Right Click: Edit Marker" }
    ]
  };
  assert.deepEqual(normalizeDetachedInteractionPanelPresentation(mappings), mappings);
  assert.deepEqual(normalizeDetachedInteractionPanelPresentation({
    kind: "description",
    effectiveLocale: "en",
    ariaLabel: "Command information",
    description: "Open the selected Command's details."
  }), {
    kind: "description",
    effectiveLocale: "en",
    ariaLabel: "Command information",
    description: "Open the selected Command's details."
  });
  assert.equal(normalizeDetachedInteractionPanelPresentation({ ...mappings, commandId: "timeline.addMarker" }), null);
  assert.equal(normalizeDetachedInteractionPanelPresentation({
    kind: "mappings",
    effectiveLocale: "en", ariaLabel: "Command information",
    rows: [{ label: "<button>", actionName: "Run", ariaLabel: "bad" }, { label: "Ctrl", actionName: "Run again", ariaLabel: "bad" }]
  }), null);
  assert.equal(normalizeDetachedInteractionPanelPresentation({ kind: "description", effectiveLocale: "en", ariaLabel: "Command information", description: "<img src=x>" }), null);
  assert.equal(normalizeDetachedInteractionPanelRequest({
    metrics: { anchorY: 160, contentHeight: 90 },
    presentation: mappings,
    bounds: { x: 0, y: 0, width: 516, height: 320 }
  }), null, "the renderer cannot supply screen coordinates or native bounds");

  const screenApi = {
    getDisplayMatching: () => ({ workArea: { x: 0, y: 0, width: 1920, height: 1080 } })
  };
  const rightBottom = getDetachedInteractionPanelGeometry(
    { x: 1700, y: 1000, width: 240, height: 320 },
    { anchorY: 300, contentHeight: 60 },
    screenApi
  );
  assert.deepEqual(rightBottom.mainBounds, { x: 1404, y: 760, width: 240, height: 320 });
  assert.deepEqual(rightBottom.panelBounds, { x: 1660, y: 1012, width: 260, height: 60 });
  assert.equal(rightBottom.panelBounds.x - (rightBottom.mainBounds.x + rightBottom.mainBounds.width), 16);
  assert.equal(rightBottom.panelBounds.x + rightBottom.panelBounds.width, 1920);
  assert.equal(rightBottom.panelBounds.y + rightBottom.panelBounds.height, 1072);

  const leftTop = getDetachedInteractionPanelGeometry(
    { x: -2000, y: -100, width: 240, height: 320 },
    { anchorY: 80, contentHeight: 155 },
    { getDisplayMatching: () => ({ workArea: { x: -1920, y: 0, width: 1920, height: 1080 } }) }
  );
  assert.deepEqual(leftTop.mainBounds, { x: -1920, y: 0, width: 240, height: 320 });
  assert.deepEqual(leftTop.panelBounds, { x: -1664, y: 8, width: 260, height: 155 });
  assert.equal(leftTop.panelBounds.x - (leftTop.mainBounds.x + 240), 16);
});

test("D7 readiness has no native visibility transition, then opens, updates, and closes without native show/hide cycles", () => {
  const mainCalls = [];
  const panelCalls = [];
  const originalMainBounds = { x: 1700, y: 100, width: 240, height: 320 };
  const main = createAttachedPaletteWindow(mainCalls, originalMainBounds);
  const panel = createDetachedPanelWindow(panelCalls);
  const originalPanel = panel;
  const request = {
    metrics: { anchorY: 80, contentHeight: 155 },
    presentation: {
      kind: "mappings",
      effectiveLocale: "en",
      ariaLabel: "Command information",
      rows: [
        { label: "Ctrl + Click", actionName: "Add Marker", ariaLabel: "Ctrl + Click: Add Marker" },
        { label: "Right Click", actionName: "Edit Marker", ariaLabel: "Right Click: Edit Marker" }
      ]
    }
  };
  const screenApi = {
    getDisplayMatching: () => ({ workArea: { x: 0, y: 0, width: 1920, height: 1080 } })
  };

  assert.equal(markDetachedInteractionPanelReady(panel), true);
  assert.deepEqual(panelCalls, [], "readiness marks the already-visible opacity-zero Panel only");
  assert.equal(markDetachedInteractionPanelReady(panel), false, "readiness is idempotent");
  panelCalls.length = 0;

  assert.deepEqual(openDetachedInteractionPanel(main, panel, request, { screen: screenApi }), {
    panelTop: 8,
    panelHeight: 155,
    anchorY: 80
  });
  assert.deepEqual(mainCalls, [
    ["setBounds", { x: 1404, y: 100, width: 240, height: 320 }],
    ["focus"]
  ]);
  assert.deepEqual(panelCalls, [
    ["setBounds", { x: 1660, y: 108, width: 260, height: 155 }],
    ["setIgnoreMouseEvents", false],
    ["send", "interaction-panel:presentation", request.presentation],
    ["setOpacity", 1]
  ]);
  assert.equal(panelCalls.some(([name]) => name === "setFocusable"), false, "opening preserves the constructor-owned nonfocusable contract");
  assert.equal(mainCalls.some(([name]) => name === "focus"), true, "main remains the focus authority");

  mainCalls.length = 0;
  panelCalls.length = 0;
  openDetachedInteractionPanel(main, panel, request, { screen: screenApi });
  assert.equal(mainCalls.some(([name]) => name === "setBounds"), false, "repeat opens do not translate the main again");
  assert.equal(panelCalls.some(([name]) => name === "setBounds"), false, "repeat opens retain the panel bounds");
  assert.equal(panelCalls.some(([name]) => name === "setFocusable"), false, "repeat opens never revisit Panel focusability");
  assert.equal(panelCalls.some((call) => ["show", "hide", "minimize", "restore", "showInactive"].includes(call)), false);

  mainCalls.length = 0;
  panelCalls.length = 0;
  const chineseRevision = {
    ...request,
    presentation: {
      kind: "mappings",
      effectiveLocale: "zh-CN",
      ariaLabel: "命令信息",
      rows: [
        { label: "Ctrl + 单击", actionName: "添加标记", ariaLabel: "Ctrl + 单击：添加标记" },
        { label: "右键单击", actionName: "编辑标记", ariaLabel: "右键单击：编辑标记" }
      ]
    }
  };
  assert.ok(openDetachedInteractionPanel(main, panel, chineseRevision, { screen: screenApi }));
  assert.equal(mainCalls.some(([name]) => name === "setBounds"), false, "locale revision keeps the same D6 bounds");
  assert.equal(panelCalls.some(([name, value]) => name === "setOpacity" && value === 0), false, "locale revision never closes D7");
  assert.deepEqual(panelCalls.filter(([name]) => name === "send"), [["send", "interaction-panel:presentation", chineseRevision.presentation]]);
  assert.equal(panelCalls.some(([name]) => name === "setFocusable"), false, "D7 remains a read-only nonfocusable sink");
  assert.equal(panel, originalPanel, "locale revision reuses the already-created D7 Panel object");
  assert.equal(panelCalls.some(([name, value]) => (
    ["close", "destroy", "show", "hide", "recreate"].includes(name)
    || (name === "setOpacity" && value === 0)
  )), false, "locale revision has no close/reopen/recreate/show/hide/opacity-zero transition");

  mainCalls.length = 0;
  panelCalls.length = 0;
  const englishReturnRevision = {
    ...request,
    presentation: {
      kind: "mappings",
      effectiveLocale: "en",
      ariaLabel: "Command information",
      rows: [
        { label: "Ctrl + Click", actionName: "Add Marker", ariaLabel: "Ctrl + Click: Add Marker" },
        { label: "Right Click", actionName: "Edit Marker", ariaLabel: "Right Click: Edit Marker" }
      ]
    }
  };
  assert.ok(openDetachedInteractionPanel(main, panel, englishReturnRevision, { screen: screenApi }));
  assert.equal(panel, originalPanel, "zh-CN -> en reuses the same D7 Panel object");
  assert.equal(mainCalls.some(([name]) => name === "setBounds"), false, "return locale revision keeps D6 bounds");
  assert.deepEqual(panelCalls.filter(([name]) => name === "send"), [["send", "interaction-panel:presentation", englishReturnRevision.presentation]]);
  assert.equal(panelCalls.some(([name, value]) => (
    ["close", "destroy", "show", "hide", "recreate"].includes(name)
    || (name === "setOpacity" && value === 0)
  )), false, "en -> zh-CN -> en has no D7 lifecycle transition");

  mainCalls.length = 0;
  panelCalls.length = 0;
  assert.equal(closeDetachedInteractionPanel(main, panel), true);
  assert.deepEqual(mainCalls, [
    ["setBounds", originalMainBounds]
  ]);
  assert.deepEqual(panelCalls, [
    ["setOpacity", 0],
    ["setIgnoreMouseEvents", true],
    ["send", "interaction-panel:presentation", null]
  ]);
  assert.equal(panelCalls.some(([name]) => name === "setFocusable"), false, "close never toggles the permanently nonfocusable Panel");
});

test("D7 no-state detached close is a native no-op", () => {
  const mainCalls = [];
  const panelCalls = [];
  const main = createAttachedPaletteWindow(mainCalls, { x: 500, y: 300, width: 240, height: 320 });
  const panel = createDetachedPanelWindow(panelCalls);

  assert.equal(closeDetachedInteractionPanel(main, panel, { restoreFocus: true }), false);
  assert.deepEqual(mainCalls, []);
  assert.deepEqual(panelCalls, []);
});

test("D7 restores main focus only for an active Panel close that explicitly needs it", () => {
  const mainCalls = [];
  const panelCalls = [];
  let focused = false;
  const main = createAttachedPaletteWindow(mainCalls, { x: 900, y: 300, width: 240, height: 320 });
  main.isFocused = () => focused;
  main.focus = () => {
    focused = true;
    mainCalls.push(["focus"]);
  };
  const panel = createDetachedPanelWindow(panelCalls);
  const request = {
    metrics: { anchorY: 160, contentHeight: 100 },
    presentation: { kind: "description", effectiveLocale: "en", ariaLabel: "Command information", description: "Inspect the selected Command." }
  };
  const options = {
    screen: { getDisplayMatching: () => ({ workArea: { x: 0, y: 0, width: 1920, height: 1080 } }) }
  };

  markDetachedInteractionPanelReady(panel);
  assert.ok(openDetachedInteractionPanel(main, panel, request, options));
  mainCalls.length = 0;
  panelCalls.length = 0;
  focused = false;

  assert.equal(closeDetachedInteractionPanel(main, panel, { ...options, restoreFocus: true }), true);
  assert.equal(mainCalls.filter(([name]) => name === "focus").length, 1);
  assert.equal(panelCalls.some(([name]) => name === "setFocusable"), false);
});

test("D7 ignores only a stale focused blur and preserves the ordinary blur-to-hide path", () => {
  class FakeBrowserWindow {
    constructor() {
      this.listeners = new Map();
    }

    loadFile() {}
    center() {}
    on(event, listener) {
      const listeners = this.listeners.get(event) || [];
      listeners.push(listener);
      this.listeners.set(event, listeners);
    }
    isDestroyed() { return false; }
    isVisible() { return true; }
    isFocused() { return this.focused; }
    getOpacity() { return this.opacity; }
    setOpacity(value) { this.opacity = value; this.calls.push(["setOpacity", value]); }
    setIgnoreMouseEvents(value) { this.calls.push(["setIgnoreMouseEvents", value]); }
    setFocusable(value) { this.calls.push(["setFocusable", value]); }
    blur() { this.calls.push("blur"); }
    emitBlur() { this.listeners.get("blur").forEach((listener) => listener()); }
  }

  const d7 = createPaletteWindow({
    surface: PALETTE_SURFACE.OPAQUE_FULL_BLEED,
    ignoreFocusedBlur: true
  }, FakeBrowserWindow);
  d7.calls = [];
  d7.focused = true;
  d7.opacity = 1;
  d7.emitBlur();
  assert.deepEqual(d7.calls, []);

  d7.focused = false;
  d7.opacity = 1;
  d7.emitBlur();
  assert.deepEqual(d7.calls, [
    ["setOpacity", 0],
    ["setIgnoreMouseEvents", true],
    "blur"
  ]);

  const defaultPalette = createPaletteWindow({}, FakeBrowserWindow);
  defaultPalette.calls = [];
  defaultPalette.focused = true;
  defaultPalette.opacity = 1;
  defaultPalette.emitBlur();
  assert.deepEqual(defaultPalette.calls, [
    ["setOpacity", 0],
    ["setIgnoreMouseEvents", true],
    ["setFocusable", false]
  ], "non-D7 blur behavior remains unchanged even when the window reports focused");
});

test("D7 fails closed when detached presentation delivery fails and restores the D6 main bounds", () => {
  const mainCalls = [];
  const panelCalls = [];
  const originalMainBounds = { x: 1700, y: 100, width: 240, height: 320 };
  const main = createAttachedPaletteWindow(mainCalls, originalMainBounds);
  const panel = createDetachedPanelWindow(panelCalls);
  panel.webContents.send = (_channel, presentation) => {
    panelCalls.push(["send", presentation]);
    if (presentation) throw new Error("renderer delivery failed");
  };
  markDetachedInteractionPanelReady(panel);
  mainCalls.length = 0;
  panelCalls.length = 0;

  assert.equal(openDetachedInteractionPanel(main, panel, {
    metrics: { anchorY: 80, contentHeight: 155 },
    presentation: { kind: "description", effectiveLocale: "en", ariaLabel: "Command information", description: "Inspect the current Command." }
  }, {
    screen: { getDisplayMatching: () => ({ workArea: { x: 0, y: 0, width: 1920, height: 1080 } }) }
  }), null);
  assert.deepEqual(main.getBounds(), originalMainBounds);
  assert.ok(panelCalls.some((call) => call[0] === "setOpacity" && call[1] === 0));
  assert.ok(panelCalls.some((call) => call[0] === "setIgnoreMouseEvents" && call[1] === true));
  assert.ok(panelCalls.some((call) => call[0] === "send" && call[1] === null), "failure clears stale detached content");
});

test("showing a natively hidden palette restores defaults before native show", () => {
  const calls = [];
  const messages = [];
  const window = {
    isDestroyed: () => false,
    isVisible: () => false,
    isFocused: () => false,
    getOpacity: () => 1,
    setFocusable: (...args) => calls.push(["setFocusable", ...args]),
    setIgnoreMouseEvents: (...args) => calls.push(["setIgnoreMouseEvents", ...args]),
    setOpacity: (...args) => calls.push(["setOpacity", ...args]),
    show: () => calls.push("show"),
    focus: () => calls.push("focus"),
    webContents: {
      send: (...args) => messages.push(args)
    }
  };

  showPaletteWindow(window);

  assert.deepEqual(calls, [
    ["setFocusable", true],
    ["setIgnoreMouseEvents", false],
    ["setOpacity", 1],
    "show"
  ]);
  assert.deepEqual(messages, [["palette:shown"]]);
});

test("showing the palette tolerates missing or destroyed windows", () => {
  assert.doesNotThrow(() => showPaletteWindow(null));
  assert.doesNotThrow(() => showPaletteWindow({ isDestroyed: () => true }));
});

test("palette anchors its visible main top-left at the cursor inside the padded native envelope", () => {
  const calls = [];
  const window = createShowPaletteWindow(calls);
  const screenApi = {
    getCursorScreenPoint: () => ({ x: 100, y: 100 }),
    getDisplayNearestPoint: () => ({ workArea: { x: 0, y: 0, width: 1920, height: 1080 } })
  };

  showPaletteWindow(window, { screen: screenApi });

  assert.deepEqual(calls, [
    ["setPosition", 92, 92],
    ["setFocusable", true],
    ["setIgnoreMouseEvents", false],
    ["setOpacity", 1],
    "show"
  ]);
  assert.deepEqual({ x: calls[0][1] + PALETTE_SHADOW_PADDING, y: calls[0][2] + PALETTE_SHADOW_PADDING }, { x: 100, y: 100 });
});

test("D6 keeps focusability stable so taskbar policy reassertion never produces an AddTab lifecycle", () => {
  const calls = [];
  let visible = false;
  let opacity = 0;
  const window = {
    isDestroyed: () => false,
    isVisible: () => visible,
    getOpacity: () => opacity,
    setPosition: (x, y) => calls.push(["setPosition", x, y]),
    setFocusable: (value) => calls.push(["setFocusable", value]),
    setSkipTaskbar: (value) => calls.push(["setSkipTaskbar", value]),
    setIgnoreMouseEvents: (value) => calls.push(["setIgnoreMouseEvents", value]),
    setOpacity: (value) => {
      opacity = value;
      calls.push(["setOpacity", value]);
    },
    show: () => {
      visible = true;
      calls.push("show");
    },
    focus: () => calls.push("focus"),
    blur: () => calls.push("blur"),
    hide: () => calls.push("hide"),
    minimize: () => calls.push("minimize"),
    restore: () => calls.push("restore"),
    webContents: { send: () => {} }
  };
  const options = {
    surface: PALETTE_SURFACE.OPAQUE_FULL_BLEED,
    screen: {
      getCursorScreenPoint: () => ({ x: 100, y: 100 }),
      getDisplayNearestPoint: () => ({ workArea: { x: 0, y: 0, width: 1920, height: 1080 } })
    }
  };

  showPaletteWindow(window, options);
  assert.deepEqual(calls, [
    ["setPosition", 100, 100],
    ["setSkipTaskbar", true],
    ["setIgnoreMouseEvents", false],
    ["setOpacity", 1],
    "show"
  ]);

  calls.length = 0;
  hidePaletteWindow(window);
  assert.deepEqual(calls, [
    ["setOpacity", 0],
    ["setIgnoreMouseEvents", true],
    "blur"
  ]);

  calls.length = 0;
  showPaletteWindow(window, options);
  assert.deepEqual(calls, [
    ["setPosition", 100, 100],
    ["setSkipTaskbar", true],
    ["setIgnoreMouseEvents", false],
    ["setOpacity", 1],
    "focus"
  ]);
  assert.equal(calls.includes("show"), false);
  assert.equal(calls.includes("hide"), false);
  assert.equal(calls.includes("minimize"), false);
  assert.equal(calls.includes("restore"), false);
  assert.equal(calls.some(([name]) => name === "setFocusable"), false, "D6 never toggles focusability during reveal or conceal");
});

test("D6 conceal blur re-entry is absorbed after opacity and mouse input are disabled", () => {
  withoutDevRenderer(() => {
    const calls = [];
    class FakeBrowserWindow {
      constructor() {
        this.listeners = new Map();
        this.opacity = 1;
      }

      loadFile() {}
      center() {}
      on(event, listener) { this.listeners.set(event, listener); }
      isDestroyed() { return false; }
      isVisible() { return true; }
      getOpacity() { return this.opacity; }
      setSkipTaskbar(value) { calls.push(["setSkipTaskbar", value]); }
      setOpacity(value) { this.opacity = value; calls.push(["setOpacity", value]); }
      setIgnoreMouseEvents(value) { calls.push(["setIgnoreMouseEvents", value]); }
      blur() {
        calls.push("blur");
        this.listeners.get("blur")();
      }
    }

    const palette = createPaletteWindow({ surface: PALETTE_SURFACE.OPAQUE_FULL_BLEED }, FakeBrowserWindow);
    calls.length = 0;

    hidePaletteWindow(palette);

    assert.deepEqual(calls, [
      ["setOpacity", 0],
      ["setIgnoreMouseEvents", true],
      "blur"
    ]);
  });
});

test("D6 uses the 240×320 native footprint for work-area flipping", () => {
  const calls = [];
  const window = createShowPaletteWindow(calls);
  showPaletteWindow(window, {
    surface: PALETTE_SURFACE.OPAQUE_FULL_BLEED,
    screen: {
      getCursorScreenPoint: () => ({ x: 1800, y: 900 }),
      getDisplayNearestPoint: () => ({ workArea: { x: 0, y: 0, width: 1920, height: 1080 } })
    }
  });
  assert.deepEqual(calls[0], ["setPosition", 1560, 580]);
});

test("palette flips above-left when the display would overflow right or bottom", () => {
  const calls = [];
  const window = createShowPaletteWindow(calls);
  const screenApi = {
    getCursorScreenPoint: () => ({ x: 1800, y: 900 }),
    getDisplayNearestPoint: () => ({ workArea: { x: 0, y: 0, width: 1920, height: 1080 } })
  };

  showPaletteWindow(window, { screen: screenApi });

  assert.deepEqual(calls[0], ["setPosition", 1552, 572]);
});

test("palette flips at a negative-coordinate display right edge without a cursor gap", () => {
  const calls = [];
  const window = createShowPaletteWindow(calls);
  const screenApi = {
    getCursorScreenPoint: () => ({ x: -100, y: 50 }),
    getDisplayNearestPoint: () => ({ workArea: { x: -1920, y: 0, width: 1920, height: 1080 } })
  };

  showPaletteWindow(window, { screen: screenApi });

  assert.deepEqual(calls[0], ["setPosition", -348, 42]);
});

test("palette clamps into the work area when its cursor-origin placement would overflow", () => {
  const calls = [];
  const window = createShowPaletteWindow(calls);
  const screenApi = {
    getCursorScreenPoint: () => ({ x: 0, y: 500 }),
    getDisplayNearestPoint: () => ({ workArea: { x: 0, y: 0, width: 240, height: 1080 } })
  };

  showPaletteWindow(window, { screen: screenApi });

  assert.deepEqual(calls[0], ["setPosition", 0, 492]);
});

test("palette keeps visible cursor-origin placement when unconstrained and clamps its padded envelope at each far edge", () => {
  const workArea = { x: 0, y: 0, width: 1920, height: 1080 };
  const cases = [
    { cursor: { x: 100, y: 100 }, expected: ["setPosition", 92, 92] },
    { cursor: { x: 1919, y: 500 }, expected: ["setPosition", 1664, 492] },
    { cursor: { x: 500, y: 1079 }, expected: ["setPosition", 492, 744] }
  ];

  for (const { cursor, expected } of cases) {
    const calls = [];
    const window = createShowPaletteWindow(calls);
    showPaletteWindow(window, {
      screen: {
        getCursorScreenPoint: () => cursor,
        getDisplayNearestPoint: () => ({ workArea })
      }
    });
    assert.deepEqual(calls[0], expected);
  }
});

test("isPaletteWindowShown requires native visibility and positive opacity", () => {
  assert.equal(isPaletteWindowShown(null), false);
  assert.equal(isPaletteWindowShown({ isDestroyed: () => true }), false);
  assert.equal(
    isPaletteWindowShown({ isDestroyed: () => false, isVisible: () => true, getOpacity: () => 1 }),
    true
  );
  assert.equal(
    isPaletteWindowShown({ isDestroyed: () => false, isVisible: () => true, getOpacity: () => 0 }),
    false
  );
  assert.equal(
    isPaletteWindowShown({ isDestroyed: () => false, isVisible: () => false, getOpacity: () => 1 }),
    false
  );
});

test("hiding a shown palette conceals in place without native hide", () => {
  const calls = [];
  let visible = true;
  let opacity = 1;
  const window = {
    isDestroyed: () => false,
    isVisible: () => visible,
    isFocused: () => true,
    getOpacity: () => opacity,
    setOpacity: (value) => {
      opacity = value;
      calls.push(["setOpacity", value]);
    },
    setIgnoreMouseEvents: (value) => calls.push(["setIgnoreMouseEvents", value]),
    setFocusable: (value) => calls.push(["setFocusable", value]),
    hide: () => calls.push("hide")
  };

  hidePaletteWindow(window);
  assert.deepEqual(calls, [
    ["setOpacity", 0],
    ["setIgnoreMouseEvents", true],
    ["setFocusable", false]
  ]);

  calls.length = 0;
  hidePaletteWindow(window);
  assert.deepEqual(calls, []);
});

test("revealing a concealed palette restores input and focus without native show", () => {
  const calls = [];
  let visible = true;
  let opacity = 0;
  const window = {
    isDestroyed: () => false,
    isVisible: () => visible,
    isFocused: () => false,
    getOpacity: () => opacity,
    setOpacity: (value) => {
      opacity = value;
      calls.push(["setOpacity", value]);
    },
    setIgnoreMouseEvents: (value) => calls.push(["setIgnoreMouseEvents", value]),
    setFocusable: (value) => calls.push(["setFocusable", value]),
    focus: () => calls.push("focus"),
    show: () => {
      visible = true;
      calls.push("show");
    },
    webContents: { send: () => {} }
  };

  showPaletteWindow(window);

  assert.deepEqual(calls, [
    ["setFocusable", true],
    ["setIgnoreMouseEvents", false],
    ["setOpacity", 1],
    "focus"
  ]);
  assert.equal(opacity, 1);
});

test("natively hidden concealed palette restores input and opacity before native show", () => {
  const calls = [];
  let visible = false;
  let opacity = 0;
  let focusable = false;
  let ignoreMouse = true;
  const window = {
    isDestroyed: () => false,
    isVisible: () => visible,
    isFocused: () => false,
    getOpacity: () => opacity,
    setFocusable: (value) => {
      focusable = value;
      calls.push(["setFocusable", value]);
    },
    setIgnoreMouseEvents: (value) => {
      ignoreMouse = value;
      calls.push(["setIgnoreMouseEvents", value]);
    },
    setOpacity: (value) => {
      opacity = value;
      calls.push(["setOpacity", value]);
    },
    show: () => {
      visible = true;
      calls.push("show");
    },
    focus: () => calls.push("focus"),
    webContents: { send: () => {} }
  };

  showPaletteWindow(window);

  assert.deepEqual(calls, [
    ["setFocusable", true],
    ["setIgnoreMouseEvents", false],
    ["setOpacity", 1],
    "show"
  ]);
  assert.equal(focusable, true);
  assert.equal(ignoreMouse, false);
  assert.equal(opacity, 1);
  assert.equal(visible, true);
});

test("hiding the palette tolerates missing or destroyed windows", () => {
  assert.doesNotThrow(() => hidePaletteWindow(null));
  assert.doesNotThrow(() => hidePaletteWindow({ isDestroyed: () => true }));
});

test("palette blur conceals once while logically shown", () => {
  withoutDevRenderer(() => {
    const calls = [];
    let visible = true;
    let opacity = 1;
    class FakeBrowserWindow {
      constructor(options) {
        this.options = options;
        this.listeners = new Map();
      }

      loadFile() {}

      center() {}

      on(event, listener) {
        this.listeners.set(event, listener);
      }

      isVisible() {
        return visible;
      }

      isDestroyed() {
        return false;
      }

      getOpacity() {
        return opacity;
      }

      setOpacity(value) {
        opacity = value;
        calls.push(["setOpacity", value]);
      }

      setIgnoreMouseEvents(value) {
        calls.push(["setIgnoreMouseEvents", value]);
      }

      setFocusable(value) {
        calls.push(["setFocusable", value]);
      }
    }

    const palette = createPaletteWindow({}, FakeBrowserWindow);
    const blurListener = palette.listeners.get("blur");

    blurListener();
    assert.deepEqual(calls, [
      ["setOpacity", 0],
      ["setIgnoreMouseEvents", true],
      ["setFocusable", false]
    ]);

    calls.length = 0;
    blurListener();
    assert.deepEqual(calls, []);
  });
});

test("both hosts share the fixed palette helper and register only semantic Interaction Panel intent", () => {
  const hostPaths = [
    path.join(__dirname, "main.js"),
    path.join(__dirname, "../../workflow-plugin/main.js")
  ];
  for (const hostPath of hostPaths) {
    const source = fs.readFileSync(hostPath, "utf8");
    assert.match(source, /showPaletteWindow/);
    assert.match(source, /hidePaletteWindow/);
    assert.match(source, /isPaletteWindowShown/);
    assert.match(source, /registerInteractionPanelIpc/);
    assert.doesNotMatch(source, /setPaletteWindowMode/);
    assert.doesNotMatch(source, /palette:set-mode/);
  }
});

test("both Windows composition roots use the shared native detached Panel controller", () => {
  const standalone = fs.readFileSync(path.join(__dirname, "main.js"), "utf8");
  const workflow = fs.readFileSync(path.join(__dirname, "../../workflow-plugin/main.js"), "utf8");

  for (const [source, host] of [[standalone, "STANDALONE"], [workflow, "WORKFLOW"]]) {
    assert.match(source, new RegExp(`host:\\s*PALETTE_HOST\\.${host}`));
    assert.match(source, /selectPaletteHostPolicy\(/);
    assert.match(source, /usesWindowsNativeDualWindow\(paletteHostPolicy\)/);
    assert.match(source, /createNativeDualWindowHost\(/);
    assert.match(source, /createDetachedInteractionPanelWindow/);
    assert.match(source, /openDetachedInteractionPanel/);
    assert.match(source, /closeDetachedInteractionPanel/);
    assert.match(source, /close:\s*\(\)\s*=> nativeDualWindowHost\.closeInteractionPanel\(\{ restoreFocus: true \}\)/);
    assert.doesNotMatch(source, /app\.isPackaged|shouldLoadDevRenderer|backgroundMaterial|mica/);
  }
});

test("both hosts toggle on the logical shown predicate", () => {
  for (const hostPath of [
    path.join(__dirname, "main.js"),
    path.join(__dirname, "../../workflow-plugin/main.js")
  ]) {
    const source = fs.readFileSync(hostPath, "utf8");
    assert.match(source, /isPaletteWindowShown\(paletteWindow\)/);
    assert.doesNotMatch(source, /paletteWindow\.isVisible\(\)/);
  }
});

test("preload exposes bounded Interaction Panel intent without a renderer bounds protocol", () => {
  const preload = fs.readFileSync(path.join(__dirname, "preload.js"), "utf8");
  const app = fs.readFileSync(path.join(__dirname, "../renderer/App.jsx"), "utf8");
  const styles = fs.readFileSync(path.join(__dirname, "../renderer/styles.css"), "utf8");
  const [detachedPreload, palettePreload] = preload.split("} else {");

  assert.doesNotMatch(preload, /setPaletteMode/);
  assert.doesNotMatch(preload, /palette:set-mode/);
  assert.match(preload, /openInteractionPanel: \(metrics\) => ipcRenderer\.invoke\("palette:interaction-panel:open", metrics\)/);
  assert.match(preload, /closeInteractionPanel: \(\) => ipcRenderer\.send\("palette:interaction-panel:close"\)/);
  assert.doesNotMatch(preload, /setBounds|setSize|palette:bounds/);
  assert.match(preload, /view"\) === "interaction-panel"/);
  assert.match(preload, /resolveCommandCenterPanel/);
  assert.match(preload, /onPresentation: \(callback\)/);
  assert.match(preload, /interaction-panel:presentation/);
  assert.match(palettePreload, /getLocalizationSnapshot/);
  assert.match(palettePreload, /setLocalePreference/);
  assert.match(palettePreload, /onLocalizationChanged/);
  assert.doesNotMatch(detachedPreload, /getLocalizationSnapshot|setLocalePreference|onLocalizationChanged/);
  assert.doesNotMatch(detachedPreload, /executeCommand|executeInteraction|listCommands|openSettings/);
  assert.match(palettePreload, /executeCommand/);
  assert.doesNotMatch(app, /setPaletteMode/);
  assert.match(app, /usesDetachedNativePanel/);
  assert.match(app, /interaction-panel-measure/);
  assert.match(app, /!detachedNativeInteractionPanel/);
  assert.match(styles, /\.palette-shell:focus/);
  assert.match(styles, /outline:\s*none/);
});

test("Palette and Settings retain their qualified painted radii while native window geometry stays rectangular", () => {
  const styles = fs.readFileSync(path.join(__dirname, "../renderer/styles.css"), "utf8");
  const app = fs.readFileSync(path.join(__dirname, "../renderer/App.jsx"), "utf8");
  const settingsApp = fs.readFileSync(path.join(__dirname, "../renderer/SettingsApp.jsx"), "utf8");
  const sharedGeometry = JSON.parse(fs.readFileSync(path.join(__dirname, "../shared/palette-geometry.json"), "utf8"));

  assert.equal(sharedGeometry.shadowPadding, PALETTE_SHADOW_PADDING, "native helper reads the shared shadow-padding authority");
  assert.match(app, /import paletteGeometry from "\.\.\/shared\/palette-geometry\.json"/);
  assert.match(app, /import \{ getPaletteShadowPadding, usesDetachedNativePanel \} from "\.\/paletteDiagnostic\.mjs"/);
  assert.match(app, /getPaletteVisualStyle\(paletteShadowPadding\)/);
  assert.match(styles, /--palette-elevation:\s*var\(--palette-external-shadow\)/);
  assert.match(styles, /\.settings-shell,\s*\.palette-main\s*\{[^}]*border:\s*1px solid var\(--color-border-strong\)/s);
  assert.match(styles, /\.settings-shell\s*\{[^}]*border-radius:\s*0[^}]*box-shadow:\s*inset 0 1px/s);
  assert.match(styles, /\.palette-main\s*\{[^}]*top:\s*var\(--palette-shadow-padding\)[^}]*left:\s*var\(--palette-shadow-padding\)[^}]*width:\s*var\(--palette-main-width\)[^}]*height:\s*var\(--palette-main-height\)[^}]*border-radius:\s*var\(--palette-main-radius\)[^}]*box-shadow:\s*var\(--palette-elevation\)/s);
  assert.match(styles, /\.palette-shell\s*\{[^}]*background:\s*transparent/s);
  assert.match(styles, /\.interaction-panel\s*\{[^}]*top:\s*calc\(var\(--palette-shadow-padding\) \+ var\(--interaction-panel-top\)\)[^}]*left:\s*calc\(var\(--palette-main-width\) \+ var\(--interaction-panel-gap\) \+ var\(--palette-shadow-padding\)\)[^}]*width:\s*var\(--interaction-panel-width\)[^}]*max-height:\s*var\(--interaction-panel-max-height\)[^}]*border-radius:\s*var\(--interaction-panel-radius\)[^}]*box-shadow:\s*var\(--palette-elevation\)/s);
  assert.match(styles, /--color-palette-surface:\s*var\(--palette-surface\)/);
  assert.match(styles, /--color-interaction-panel:\s*var\(--color-palette-surface\)/);
  assert.doesNotMatch(styles, /actions-panel|actions-view|panel-arrow/);
  assert.doesNotMatch(styles, /--radius-window/);
  assert.match(styles, /\.settings-titlebar\s*\{[^}]*background:\s*var\(--color-palette-surface\)[^}]*box-shadow:\s*none/s);
  assert.doesNotMatch(styles, /\.settings-titlebar\s*\{[^}]*linear-gradient/s);
  assert.match(settingsApp, /<span className="settings-titlebar-label">\{t\("settings\.label"\)\}<\/span>/);
  assert.doesNotMatch(settingsApp, /clackly-logo|logoUrl|settings-titlebar-brand/);
  assert.doesNotMatch(styles, /settings-titlebar-brand/);
  assert.doesNotMatch(styles, /palette-enter/);
});

test("opening settings reuses, restores, shows, and focuses an existing window", () => {
  const calls = [];
  const settings = {
    isDestroyed: () => false,
    isMinimized: () => true,
    restore: () => calls.push("restore"),
    show: () => calls.push("show"),
    focus: () => calls.push("focus")
  };

  assert.equal(openSettingsWindow(settings), settings);
  assert.deepEqual(calls, ["restore", "show", "focus"]);
});

test("opening existing settings selects the requested feature", () => {
  const messages = [];
  const settings = {
    isDestroyed: () => false,
    isMinimized: () => false,
    show() {},
    focus() {},
    webContents: { send: (...args) => messages.push(args) }
  };
  openSettingsWindow(settings, "ae.export");
  assert.deepEqual(messages, [["settings:select-feature", "ae.export"]]);
});

test("settings window uses the complete Electron 36 fixed frameless contract", () => {
  withoutDevRenderer(() => {
    class FakeBrowserWindow {
      constructor(options) {
        this.options = options;
      }

      loadFile(filePath, options) {
        this.loaded = { filePath, options };
      }

      center() {
        this.centered = true;
      }
    }

    const settings = createSettingsWindow(FakeBrowserWindow);
    assert.deepEqual(settings.options, {
      width: 760,
      height: 560,
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
      title: translate("en", "settings.title"),
      webPreferences: {
        preload: path.join(__dirname, "preload.js"),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: false
      }
    });
    assert.equal(settings.loaded.filePath, path.join(__dirname, "../../dist/renderer/index.html"));
    assert.deepEqual(settings.loaded.options, { query: { view: "settings" } });
    assert.equal(settings.centered, true);
  });
});

test("settings window preserves configured dev URL state and adds its view marker", () => {
  const previous = process.env.RESOLVE_COMMAND_CENTER_RENDERER_URL;
  process.env.RESOLVE_COMMAND_CENTER_RENDERER_URL = "http://127.0.0.1:4173/app?source=test";
  try {
    class FakeBrowserWindow {
      constructor() {}
      loadURL(url) { this.url = url; }
      center() {}
    }

    const settings = createSettingsWindow(FakeBrowserWindow);
    const url = new URL(settings.url);
    assert.equal(url.origin, "http://127.0.0.1:4173");
    assert.equal(url.pathname, "/app");
    assert.equal(url.searchParams.get("source"), "test");
    assert.equal(url.searchParams.get("view"), "settings");
  } finally {
    if (previous === undefined) delete process.env.RESOLVE_COMMAND_CENTER_RENDERER_URL;
    else process.env.RESOLVE_COMMAND_CENTER_RENDERER_URL = previous;
  }
});
