const assert = require("node:assert/strict");
const path = require("node:path");
const test = require("node:test");

const {
  PALETTE_SIZES,
  SETTINGS_SIZE,
  createPaletteWindow,
  createSettingsWindow,
  openSettingsWindow,
  setPaletteWindowMode
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

test("palette modes retain their fixed footprint and settings owns separate dimensions", () => {
  assert.deepEqual(PALETTE_SIZES, {
    launcher: { width: 376, height: 468 },
    search: { width: 376, height: 468 },
    "all-actions": { width: 376, height: 468 }
  });
  assert.deepEqual(SETTINGS_SIZE, {
    width: 760,
    height: 560
  });

  const calls = [];
  const palette = {
    isDestroyed: () => false,
    setSize: (...args) => calls.push(["setSize", ...args]),
    center: () => calls.push(["center"])
  };
  assert.equal(setPaletteWindowMode(palette, "search"), true);
  assert.deepEqual(calls, [["setSize", 376, 468, false], ["center"]]);
  assert.equal(setPaletteWindowMode(palette, "settings"), false);
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
      alwaysOnTop: false,
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
    assert.equal(typeof palette.listeners.get("blur"), "function");
  });
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
