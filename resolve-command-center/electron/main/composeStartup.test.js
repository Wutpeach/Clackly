const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const { composeStartup } = require("./composeStartup");

function deferred() {
  let resolve;
  const promise = new Promise((resolver) => {
    resolve = resolver;
  });
  return { promise, resolve };
}

test("palette, IPC, and hotkey readiness happen before the AE path initialization settles", async () => {
  const gate = deferred();
  const calls = [];
  const result = composeStartup({
    initializeAfterEffectsPath: () => {
      calls.push("initialize");
      return gate.promise;
    },
    createPaletteWindow: () => {
      calls.push("palette");
      return { id: "palette" };
    },
    registerIpcHandlers: () => {
      calls.push("ipc");
    },
    registerPaletteHotkey: () => {
      calls.push("hotkey");
      return true;
    },
    reportInitializationError: (error) => {
      calls.push(`error:${error.message}`);
    },
    handleHotkeyRegistrationFailure: () => {
      calls.push("hotkey-failure");
    }
  });

  assert.deepEqual(calls, ["initialize", "palette", "ipc", "hotkey"]);
  assert.deepEqual(result.paletteWindow, { id: "palette" });
  gate.resolve();
  await gate.promise;
  assert.deepEqual(calls, ["initialize", "palette", "ipc", "hotkey"]);
});

test("a rejected AE path initialization is routed once to the error surface", async () => {
  const errors = [];
  const initialization = Promise.reject(new Error("configuration write failed"));

  composeStartup({
    initializeAfterEffectsPath: () => initialization,
    createPaletteWindow: () => ({}),
    registerIpcHandlers: () => {},
    registerPaletteHotkey: () => true,
    reportInitializationError: (error) => errors.push(error.message)
  });

  await initialization.catch(() => {});
  assert.deepEqual(errors, ["configuration write failed"]);
});

test("a failed hotkey registration is routed to the host handler", () => {
  const calls = [];

  composeStartup({
    initializeAfterEffectsPath: () => Promise.resolve(),
    createPaletteWindow: () => ({}),
    registerIpcHandlers: () => {
      calls.push("ipc");
    },
    registerPaletteHotkey: () => {
      calls.push("hotkey");
      return false;
    },
    reportInitializationError: () => {},
    handleHotkeyRegistrationFailure: () => {
      calls.push("hotkey-failure");
    }
  });

  assert.deepEqual(calls, ["ipc", "hotkey", "hotkey-failure"]);
});

test("both hosts wire real readiness functions into the shared composition", () => {
  for (const hostPath of [
    path.join(__dirname, "main.js"),
    path.join(__dirname, "../../workflow-plugin/main.js")
  ]) {
    const source = fs.readFileSync(hostPath, "utf8");
    assert.match(source, /composeStartup\(\{/);
    assert.match(source, /createPaletteWindow(?:,|:\s*createStandalonePaletteWindow)/);
    assert.match(source, /registerIpcHandlers,/);
    assert.match(source, /registerPaletteHotkey:\s*\(\)\s*=>\s*registerPaletteHotkey\(/);
    assert.match(source, /togglePalette/);
    assert.match(source, /initializeAfterEffectsPath:\s*\(\)\s*=>\s*initializeAfterEffectsPath\(core\.configManager\)/);
    assert.match(source, /reportInitializationError:/);
    assert.doesNotMatch(source, /initializeAfterEffectsPath\(core\.configManager\);/);
  }
});

test("composition creates the Palette through its no-argument transparent default", () => {
  const receivedArguments = [];
  composeStartup({
    initializeAfterEffectsPath: () => Promise.resolve(),
    createPaletteWindow: (...args) => {
      receivedArguments.push(args);
      return {};
    },
    registerIpcHandlers: () => {},
    registerPaletteHotkey: () => true,
    reportInitializationError: () => {}
  });
  assert.deepEqual(receivedArguments, [[]]);
});

test("D6 is limited to standalone Windows dev while Workflow retains the shared transparent opacity Palette contract", () => {
  const paletteSource = fs.readFileSync(path.join(__dirname, "window.js"), "utf8");
  const standaloneSource = fs.readFileSync(path.join(__dirname, "main.js"), "utf8");
  const workflowSource = fs.readFileSync(path.join(__dirname, "../../workflow-plugin/main.js"), "utf8");

  assert.match(standaloneSource, /process\.platform === "win32" && !app\.isPackaged && shouldLoadDevRenderer\(\)/);
  assert.match(standaloneSource, /surface:\s*PALETTE_SURFACE\.D6_OPAQUE_FULL_BLEED/);
  assert.match(standaloneSource, /ignoreFocusedBlur:\s*true/);
  assert.match(standaloneSource, /createPaletteWindow:\s*createStandalonePaletteWindow/);
  assert.match(standaloneSource, /showPaletteWindow\(paletteWindow, standaloneDevRendererPaletteOptions\)/);
  assert.match(standaloneSource, /hidePaletteWindow\(paletteWindow\)/);
  assert.match(workflowSource, /showPaletteWindow\(paletteWindow\)/);
  assert.match(workflowSource, /hidePaletteWindow\(paletteWindow\)/);
  assert.doesNotMatch(workflowSource, /PALETTE_SURFACE|D6_OPAQUE_FULL_BLEED|backgroundMaterial|paletteDiagnostic|shouldLoadDevRenderer/);
  assert.doesNotMatch(workflowSource, /ignoreFocusedBlur|stale-ignored/);
  assert.doesNotMatch(paletteSource, /backgroundMaterial|mica|NATIVE_MICA_HIDE_SHOW|usesNativeMicaHideShow|nativeHiddenPaletteWindows/);
  assert.match(paletteSource, /transparent:\s*true/);
  assert.match(paletteSource, /backgroundColor:\s*"#00000000"/);
  assert.match(paletteSource, /roundedCorners:\s*false/);
  assert.match(paletteSource, /thickFrame:\s*false/);
  assert.match(paletteSource, /window\.setOpacity\(1\)/);
  assert.match(paletteSource, /window\.setOpacity\(0\)/);
});

test("accepted D7 implementation retains no runtime trace recorder or analyzer", () => {
  const standaloneSource = fs.readFileSync(path.join(__dirname, "main.js"), "utf8");
  const windowSource = fs.readFileSync(path.join(__dirname, "window.js"), "utf8");
  const workflowSource = fs.readFileSync(path.join(__dirname, "../../workflow-plugin/main.js"), "utf8");

  assert.doesNotMatch(standaloneSource, /d7WindowTrace|D7WindowTrace|clackly-d7-window-trace/);
  assert.doesNotMatch(windowSource, /traceWindow|traceDetachedPanelIpc|d7WindowTrace/);
  assert.doesNotMatch(workflowSource, /d7WindowTrace|D7WindowTrace|clackly-d7-window-trace/);
  assert.equal(fs.existsSync(path.join(__dirname, "d7WindowTrace.js")), false);
  assert.equal(fs.existsSync(path.join(__dirname, "../../scripts/analyze-d7-window-trace.js")), false);
});
