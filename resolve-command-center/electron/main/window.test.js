const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const {
  PALETTE_SIZE,
  SETTINGS_SIZE,
  createPaletteWindow,
  createSettingsWindow,
  openSettingsWindow,
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

test("palette owns one fixed footprint and settings owns separate dimensions", () => {
  assert.deepEqual(PALETTE_SIZE, {
    width: 376,
    height: 468
  });
  assert.deepEqual(SETTINGS_SIZE, {
    width: 760,
    height: 560
  });
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
      width: 376,
      height: 468,
      show: false,
      frame: false,
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

test("both hosts share the fixed palette helper and drop the mode-resize IPC", () => {
  const hostPaths = [
    path.join(__dirname, "main.js"),
    path.join(__dirname, "../../workflow-plugin/main.js")
  ];
  for (const hostPath of hostPaths) {
    const source = fs.readFileSync(hostPath, "utf8");
    assert.match(source, /showPaletteWindow/);
    assert.match(source, /hidePaletteWindow/);
    assert.match(source, /isPaletteWindowShown/);
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

test("preload and renderer stop exposing the semantic mode resize channel", () => {
  const preload = fs.readFileSync(path.join(__dirname, "preload.js"), "utf8");
  const app = fs.readFileSync(path.join(__dirname, "../renderer/App.jsx"), "utf8");
  const styles = fs.readFileSync(path.join(__dirname, "../renderer/styles.css"), "utf8");

  assert.doesNotMatch(preload, /setPaletteMode/);
  assert.doesNotMatch(preload, /palette:set-mode/);
  assert.doesNotMatch(app, /setPaletteMode/);
  assert.match(styles, /\.palette-shell:focus/);
  assert.match(styles, /outline:\s*none/);
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
