const assert = require("node:assert/strict");
const Module = require("node:module");
const test = require("node:test");

function loadHotkey(globalShortcut) {
  const modulePath = require.resolve("./hotkey");
  const originalLoad = Module._load;
  delete require.cache[modulePath];
  Module._load = (request, parent, isMain) => (
    request === "electron" ? { globalShortcut } : originalLoad(request, parent, isMain)
  );
  try {
    return require("./hotkey");
  } finally {
    Module._load = originalLoad;
    delete require.cache[modulePath];
  }
}

test("foreground detection accepts only Resolve.exe case-insensitively", async () => {
  const { isResolveForeground } = loadHotkey({});

  assert.equal(await isResolveForeground(() => "Resolve.exe"), true);
  assert.equal(await isResolveForeground(() => "resolve.EXE"), true);
  assert.equal(await isResolveForeground(() => "AfterFX.exe"), false);
  assert.equal(await isResolveForeground(() => {
    throw new Error("foreground lookup failed");
  }), false);
});

test("Ctrl+Space closes a visible Palette but reveals a hidden one only from Resolve", async () => {
  async function invoke({ isShown, getProcessName }) {
    let handler;
    let toggles = 0;
    const { registerPaletteHotkey } = loadHotkey({
      register: (_accelerator, callback) => {
        handler = callback;
        return true;
      }
    });
    registerPaletteHotkey(() => {
      toggles += 1;
    }, () => isShown, getProcessName);
    await handler();
    return toggles;
  }

  assert.equal(await invoke({ isShown: false, getProcessName: () => "Resolve.exe" }), 1);
  assert.equal(await invoke({ isShown: false, getProcessName: () => "AfterFX.exe" }), 0);
  assert.equal(await invoke({ isShown: false, getProcessName: () => { throw new Error("lookup failed"); } }), 0);

  let probed = false;
  assert.equal(await invoke({
    isShown: true,
    getProcessName: () => {
      probed = true;
      throw new Error("should not probe while closing");
    }
  }), 1);
  assert.equal(probed, false);
});

test("a pending reveal never closes a Palette opened while it was checking", async () => {
  let handler;
  let resolveProcessName;
  let isShown = false;
  let toggles = 0;
  const { registerPaletteHotkey } = loadHotkey({
    register: (_accelerator, callback) => {
      handler = callback;
      return true;
    }
  });
  registerPaletteHotkey(() => {
    toggles += 1;
  }, () => isShown, () => new Promise((resolve) => {
    resolveProcessName = resolve;
  }));

  const pendingHotkey = handler();
  isShown = true;
  resolveProcessName("Resolve.exe");
  await pendingHotkey;

  assert.equal(toggles, 0);
});
