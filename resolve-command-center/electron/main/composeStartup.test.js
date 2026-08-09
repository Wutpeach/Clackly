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
    assert.match(source, /createPaletteWindow,/);
    assert.match(source, /registerIpcHandlers,/);
    assert.match(source, /registerPaletteHotkey:\s*\(\)\s*=>\s*registerPaletteHotkey\(togglePalette\)/);
    assert.match(source, /initializeAfterEffectsPath:\s*\(\)\s*=>\s*initializeAfterEffectsPath\(core\.configManager\)/);
    assert.match(source, /reportInitializationError:/);
    assert.doesNotMatch(source, /initializeAfterEffectsPath\(core\.configManager\);/);
  }
});
