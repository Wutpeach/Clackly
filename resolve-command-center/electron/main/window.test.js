const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const {
  PALETTE_SIZE,
  PALETTE_ATTACHED_PANEL,
  PALETTE_EXPANDED_SIZE,
  SETTINGS_SIZE,
  createPaletteWindow,
  createSettingsWindow,
  openSettingsWindow,
  getAttachedPanelGeometry,
  openAttachedActionsPanel,
  closeAttachedActionsPanel,
  registerAttachedActionsIpc,
  showPaletteWindow,
  hidePaletteWindow,
  isPaletteWindowShown
} = require("./window");

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

function createAttachedPaletteWindow(calls, initialBounds = { x: 100, y: 100, width: 240, height: 320 }) {
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
    setFocusable: (value) => calls.push(["setFocusable", value])
  };
}

test("palette owns one fixed footprint and settings owns separate dimensions", () => {
  assert.deepEqual(PALETTE_SIZE, {
    width: 240,
    height: 320
  });
  assert.deepEqual(SETTINGS_SIZE, {
    width: 760,
    height: 560
  });
});

test("attached Actions geometry accepts only bounded semantic metrics and paints the minimal rectangle union", () => {
  assert.deepEqual(PALETTE_ATTACHED_PANEL, {
    gap: 6,
    width: 176,
    minHeight: 65,
    maxHeight: 304,
    inset: 8,
    arrowWidth: 7,
    arrowHeight: 14
  });
  assert.deepEqual(PALETTE_EXPANDED_SIZE, { width: 422, height: 320 });
  assert.equal(getAttachedPanelGeometry({ anchorY: 80, contentHeight: 155 }).panel.y, 8);
  assert.deepEqual(getAttachedPanelGeometry({ anchorY: 80, contentHeight: 155 }).shape, [
    { x: 0, y: 0, width: 240, height: 320 },
    { x: 239, y: 73, width: 7, height: 14 },
    { x: 246, y: 8, width: 176, height: 155 }
  ]);
  assert.equal(getAttachedPanelGeometry({ anchorY: 80, contentHeight: 155, width: 422 }), null);
  assert.equal(getAttachedPanelGeometry({ anchorY: 80, contentHeight: 305 }), null);
  assert.equal(getAttachedPanelGeometry({ anchorY: -1, contentHeight: 155 }), null);
});

test("attached Actions expands, clamps, and applies idempotent panel-only shape updates", () => {
  const calls = [];
  const palette = createAttachedPaletteWindow(calls, { x: 1700, y: 100, width: 240, height: 320 });
  const screenApi = {
    getDisplayMatching: () => ({ workArea: { x: 0, y: 0, width: 1920, height: 1080 } })
  };

  assert.deepEqual(openAttachedActionsPanel(palette, { anchorY: 80, contentHeight: 155 }, { screen: screenApi }), {
    panelTop: 8,
    panelHeight: 155,
    anchorY: 80
  });
  assert.deepEqual(calls[0], ["setBounds", { x: 1498, y: 100, width: 422, height: 320 }]);
  assert.deepEqual(calls[1], ["setShape", [
    { x: 0, y: 0, width: 240, height: 320 },
    { x: 239, y: 73, width: 7, height: 14 },
    { x: 246, y: 8, width: 176, height: 155 }
  ]]);

  calls.length = 0;
  openAttachedActionsPanel(palette, { anchorY: 80, contentHeight: 155 }, { screen: screenApi });
  assert.deepEqual(calls, []);

  openAttachedActionsPanel(palette, { anchorY: 180, contentHeight: 185 }, { screen: screenApi });
  assert.deepEqual(calls, [["setShape", [
    { x: 0, y: 0, width: 240, height: 320 },
    { x: 239, y: 173, width: 7, height: 14 },
    { x: 246, y: 88, width: 176, height: 185 }
  ]]]);

  calls.length = 0;
  assert.equal(closeAttachedActionsPanel(palette), true);
  assert.deepEqual(calls, [
    ["setBounds", { x: 1700, y: 100, width: 240, height: 320 }],
    ["setShape", [{ x: 0, y: 0, width: 240, height: 320 }]]
  ]);
});

test("attached Actions fails closed without setShape and never expands the native rectangle", () => {
  const calls = [];
  const initialBounds = { x: 1700, y: 100, width: 240, height: 320 };
  const palette = createAttachedPaletteWindow(calls, initialBounds);
  delete palette.setShape;

  assert.equal(openAttachedActionsPanel(palette, { anchorY: 80, contentHeight: 155 }), null);
  assert.deepEqual(calls, []);
  assert.deepEqual(palette.getBounds(), initialBounds);
});

test("attached Actions restores base bounds when applying the shape union fails", () => {
  const calls = [];
  const initialBounds = { x: 100, y: 100, width: 240, height: 320 };
  const palette = createAttachedPaletteWindow(calls, initialBounds);
  palette.setShape = (shape) => {
    calls.push(["setShape", shape]);
    throw new Error("setShape failed");
  };
  const screenApi = {
    getDisplayMatching: () => ({ workArea: { x: 0, y: 0, width: 1920, height: 1080 } })
  };

  assert.equal(openAttachedActionsPanel(palette, { anchorY: 80, contentHeight: 155 }, { screen: screenApi }), null);
  assert.deepEqual(palette.getBounds(), initialBounds);
  assert.deepEqual(calls, [
    ["setBounds", { x: 100, y: 100, width: 422, height: 320 }],
    ["setShape", [
      { x: 0, y: 0, width: 240, height: 320 },
      { x: 239, y: 73, width: 7, height: 14 },
      { x: 246, y: 8, width: 176, height: 155 }
    ]],
    ["setBounds", initialBounds],
    ["setShape", [{ x: 0, y: 0, width: 240, height: 320 }]]
  ]);
});

test("attached Actions close and hide restore the fixed main rectangle", () => {
  const calls = [];
  const palette = createAttachedPaletteWindow(calls);
  openAttachedActionsPanel(palette, { anchorY: 160, contentHeight: 155 });
  calls.length = 0;

  assert.equal(closeAttachedActionsPanel(palette), true);
  assert.deepEqual(calls, [
    ["setBounds", { x: 100, y: 100, width: 240, height: 320 }],
    ["setShape", [{ x: 0, y: 0, width: 240, height: 320 }]]
  ]);

  openAttachedActionsPanel(palette, { anchorY: 160, contentHeight: 155 });
  calls.length = 0;
  hidePaletteWindow(palette);
  assert.deepEqual(calls, [
    ["setBounds", { x: 100, y: 100, width: 240, height: 320 }],
    ["setShape", [{ x: 0, y: 0, width: 240, height: 320 }]],
    ["setOpacity", 0],
    ["setIgnoreMouseEvents", true],
    ["setFocusable", false]
  ]);
});

test("attached Actions IPC exposes semantic bounded metrics rather than renderer bounds", () => {
  const handlers = new Map();
  const listeners = new Map();
  const calls = [];
  const palette = createAttachedPaletteWindow(calls);
  registerAttachedActionsIpc({
    handle: (name, handler) => handlers.set(name, handler),
    on: (name, listener) => listeners.set(name, listener)
  }, () => palette);

  assert.deepEqual(handlers.get("palette:attached-actions:open")({}, { anchorY: 160, contentHeight: 155 }), {
    panelTop: 83,
    panelHeight: 155,
    anchorY: 160
  });
  assert.equal(handlers.get("palette:attached-actions:open")({}, { x: 1, y: 2, width: 422, height: 320 }), null);
  listeners.get("palette:attached-actions:close")();
  assert.ok(calls.some(([name]) => name === "setShape"));
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

    const palette = createPaletteWindow(FakeBrowserWindow);
    assert.deepEqual(palette.options, {
      width: 240,
      height: 320,
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

test("palette anchors its top-left corner at the cursor before restoring visibility", () => {
  const calls = [];
  const window = createShowPaletteWindow(calls);
  const screenApi = {
    getCursorScreenPoint: () => ({ x: 100, y: 100 }),
    getDisplayNearestPoint: () => ({ workArea: { x: 0, y: 0, width: 1920, height: 1080 } })
  };

  showPaletteWindow(window, { screen: screenApi });

  assert.deepEqual(calls, [
    ["setPosition", 100, 100],
    ["setFocusable", true],
    ["setIgnoreMouseEvents", false],
    ["setOpacity", 1],
    "show"
  ]);
});

test("palette flips above-left when the display would overflow right or bottom", () => {
  const calls = [];
  const window = createShowPaletteWindow(calls);
  const screenApi = {
    getCursorScreenPoint: () => ({ x: 1800, y: 900 }),
    getDisplayNearestPoint: () => ({ workArea: { x: 0, y: 0, width: 1920, height: 1080 } })
  };

  showPaletteWindow(window, { screen: screenApi });

  assert.deepEqual(calls[0], ["setPosition", 1560, 580]);
});

test("palette flips at a negative-coordinate display right edge without a cursor gap", () => {
  const calls = [];
  const window = createShowPaletteWindow(calls);
  const screenApi = {
    getCursorScreenPoint: () => ({ x: -100, y: 50 }),
    getDisplayNearestPoint: () => ({ workArea: { x: -1920, y: 0, width: 1920, height: 1080 } })
  };

  showPaletteWindow(window, { screen: screenApi });

  assert.deepEqual(calls[0], ["setPosition", -340, 50]);
});

test("palette clamps into the work area when its cursor-origin placement would overflow", () => {
  const calls = [];
  const window = createShowPaletteWindow(calls);
  const screenApi = {
    getCursorScreenPoint: () => ({ x: 0, y: 500 }),
    getDisplayNearestPoint: () => ({ workArea: { x: 0, y: 0, width: 240, height: 1080 } })
  };

  showPaletteWindow(window, { screen: screenApi });

  assert.deepEqual(calls[0], ["setPosition", 0, 500]);
});

test("palette keeps cursor-origin placement at top-left and independently flips each far edge", () => {
  const workArea = { x: 0, y: 0, width: 1920, height: 1080 };
  const cases = [
    { cursor: { x: 0, y: 0 }, expected: ["setPosition", 0, 0] },
    { cursor: { x: 1919, y: 500 }, expected: ["setPosition", 1679, 500] },
    { cursor: { x: 500, y: 1079 }, expected: ["setPosition", 500, 759] }
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

    const palette = createPaletteWindow(FakeBrowserWindow);
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

test("both hosts share the fixed palette helper and register only semantic attached Actions intent", () => {
  const hostPaths = [
    path.join(__dirname, "main.js"),
    path.join(__dirname, "../../workflow-plugin/main.js")
  ];
  for (const hostPath of hostPaths) {
    const source = fs.readFileSync(hostPath, "utf8");
    assert.match(source, /showPaletteWindow/);
    assert.match(source, /hidePaletteWindow/);
    assert.match(source, /isPaletteWindowShown/);
    assert.match(source, /registerAttachedActionsIpc/);
    assert.doesNotMatch(source, /setPaletteWindowMode/);
    assert.doesNotMatch(source, /palette:set-mode/);
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

test("preload exposes bounded attached Actions intent without a renderer bounds protocol", () => {
  const preload = fs.readFileSync(path.join(__dirname, "preload.js"), "utf8");
  const app = fs.readFileSync(path.join(__dirname, "../renderer/App.jsx"), "utf8");
  const styles = fs.readFileSync(path.join(__dirname, "../renderer/styles.css"), "utf8");

  assert.doesNotMatch(preload, /setPaletteMode/);
  assert.doesNotMatch(preload, /palette:set-mode/);
  assert.match(preload, /openAttachedActions: \(metrics\) => ipcRenderer\.invoke\("palette:attached-actions:open", metrics\)/);
  assert.match(preload, /closeAttachedActions: \(\) => ipcRenderer\.send\("palette:attached-actions:close"\)/);
  assert.doesNotMatch(preload, /setBounds|setSize|palette:bounds/);
  assert.doesNotMatch(app, /setPaletteMode/);
  assert.match(styles, /\.palette-shell:focus/);
  assert.match(styles, /outline:\s*none/);
});

test("palette main and Settings keep rectangular paint while only the attached panel occupies the expanded column", () => {
  const styles = fs.readFileSync(path.join(__dirname, "../renderer/styles.css"), "utf8");

  assert.match(styles, /\.settings-shell,\s*\.palette-main\s*\{[^}]*border:\s*1px solid var\(--color-border-strong\)[^}]*border-radius:\s*0[^}]*box-shadow:/s);
  assert.match(styles, /\.palette-shell\s*\{[^}]*background:\s*transparent/s);
  assert.match(styles, /\.actions-panel\s*\{[^}]*left:\s*246px[^}]*width:\s*176px[^}]*max-height:\s*304px/s);
  assert.doesNotMatch(styles, /\.actions-view/);
  assert.doesNotMatch(styles, /--radius-window/);
  assert.match(styles, /\.settings-titlebar\s*\{[^}]*var\(--header-surface-shadow\)/s);
  assert.match(styles, /\.settings-titlebar-brand::before\s*\{/s);
  assert.match(styles, /\.settings-titlebar-brand img\s*\{/s);
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
      title: "Clackly Settings",
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
