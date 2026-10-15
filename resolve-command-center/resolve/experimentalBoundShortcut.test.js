const assert = require("node:assert/strict");
const test = require("node:test");

const {
  buildKeySequence,
  createExperimentalBoundShortcutSpike,
  createWindowsNativeShortcut,
  normalizeRequest,
  parseChord,
  WINDOWS_HELPER
} = require("./experimentalBoundShortcut");
const {
  CHANNEL,
  createLastResultStorage,
  isEnabled,
  registerExperimentalResolveShortcut
} = require("../electron/main/experimentalResolveShortcut");

const NOW = Date.parse("2026-09-11T12:05:00.000Z");
const KEYBOARD_LAYOUT = "0000000004090409";

function request(overrides = {}) {
  const evidence = {
    source: "resolve-keyboard-customization",
    confirmedAt: "2026-09-11T12:00:00.000Z",
    resolveVersion: "21.1.0.14",
    preset: "Mabel",
    keyboardLayout: KEYBOARD_LAYOUT,
    keyboardConfig: { sha256: "a".repeat(64), mtimeMs: 1234 },
    context: {
      projectId: "project-1",
      projectName: "Clackly Shortcut Spike",
      timelineId: "timeline-1",
      timelineName: "Bound Shortcut Test",
      page: "edit",
      selectedClipCount: 1,
      selectedClipIds: ["clip-1"]
    }
  };
  return {
    action: "enable-clip",
    chord: "CTRL+ALT+E",
    ...overrides,
    evidence: { ...evidence, ...overrides.evidence, context: { ...evidence.context, ...overrides.evidence?.context } }
  };
}

function resolveFixture({ selectedClipIds = ["clip-1"] } = {}) {
  const timeline = {
    GetUniqueId: () => "timeline-1",
    GetName: () => "Bound Shortcut Test",
    GetSelectedClips: () => selectedClipIds.map((id) => ({ GetUniqueId: () => id }))
  };
  const project = {
    GetUniqueId: () => "project-1",
    GetName: () => "Clackly Shortcut Spike",
    GetCurrentTimeline: () => timeline
  };
  return {
    GetVersionString: () => "21.1.0.14",
    GetCurrentKeyboardPreset: () => "Mabel",
    GetCurrentPage: () => "edit",
    GetProjectManager: () => ({ GetCurrentProject: () => project })
  };
}

test("bound chord validation makes a reversible key-up sequence", () => {
  assert.deepEqual(parseChord("ctrl+alt+e"), {
    canonical: "CTRL+ALT+E",
    keyCodes: [0x11, 0x12, 0x45]
  });
  assert.deepEqual(buildKeySequence([0x11, 0x12, 0x45]), [
    { keyCode: 0x11, type: "down" }, { keyCode: 0x12, type: "down" }, { keyCode: 0x45, type: "down" },
    { keyCode: 0x45, type: "up" }, { keyCode: 0x12, type: "up" }, { keyCode: 0x11, type: "up" }
  ]);
  assert.deepEqual(parseChord("d"), { canonical: "D", keyCodes: [0x44] });
  assert.deepEqual(buildKeySequence([0x44]), [
    { keyCode: 0x44, type: "down" }, { keyCode: 0x44, type: "up" }
  ]);
  assert.throws(() => parseChord("CTRL+ALT"), /modifier and one key/);
  assert.throws(() => parseChord("E+CTRL"), /modifier and one key/);
  assert.throws(() => parseChord("CTRL+E+F"), /modifier and one key/);
  assert.throws(() => normalizeRequest(request({ action: "anything" }), NOW), /approved bound-shortcut/);
  assert.throws(() => normalizeRequest(request({ evidence: { confirmedAt: "2026-09-11T11:00:00.000Z" } }), NOW), /confirmation is stale/);
  assert.throws(() => normalizeRequest(request({ evidence: { keyboardLayout: "US" } }), NOW), /layout evidence/);
  assert.match(WINDOWS_HELPER, /struct MOUSEINPUT/);
  assert.doesNotMatch(WINDOWS_HELPER, /\$pid\s*=/i);
});

test("evidence collection is read-only and never closes the palette or sends keys", async () => {
  const calls = [];
  const spike = createExperimentalBoundShortcutSpike({
    getResolve: async () => resolveFixture(),
    closePalette: () => calls.push("close"),
    native: {
      readConfig: async () => ({ sha256: "a".repeat(64), mtimeMs: 1234 }),
      discoverResolveWindow: async () => ({ pid: 50996, hwnd: "123", keyboardLayout: KEYBOARD_LAYOUT }),
      restoreAndSend: async () => calls.push("send")
    },
    now: () => NOW
  });

  assert.deepEqual(await spike.collectEvidence(), {
    resolveVersion: "21.1.0.14",
    preset: "Mabel",
    keyboardLayout: KEYBOARD_LAYOUT,
    keyboardConfig: { sha256: "a".repeat(64), mtimeMs: 1234 },
    context: {
      projectId: "project-1",
      projectName: "Clackly Shortcut Spike",
      timelineId: "timeline-1",
      timelineName: "Bound Shortcut Test",
      page: "edit",
      selectedClipCount: 1,
      selectedClipIds: ["clip-1"]
    }
  });
  assert.deepEqual(calls, []);
});

test("stale keyboard evidence fails before closing the panel or sending", async () => {
  const calls = [];
  const spike = createExperimentalBoundShortcutSpike({
    getResolve: async () => resolveFixture(),
    closePalette: () => calls.push("close"),
    native: {
      readConfig: async () => ({ sha256: "b".repeat(64), mtimeMs: 1234 }),
      discoverResolveWindow: async () => ({ pid: 50996, hwnd: "123", keyboardLayout: KEYBOARD_LAYOUT }),
      restoreAndSend: async () => calls.push("send")
    },
    now: () => NOW
  });

  await assert.rejects(spike.execute(request()), (error) => {
    assert.match(error.message, /configuration changed/);
    assert.deepEqual(error.shortcutDiagnostic, {
      stage: "preflight",
      sendInvoked: false,
      expectedInputs: null,
      sentInputs: null,
      cleanupExpected: null,
      cleanupSent: null,
      helperEntered: false
    });
    return true;
  });
  assert.deepEqual(calls, []);
});

test("same-count selection replacement after palette close fails before sending", async () => {
  const calls = [];
  let reads = 0;
  const spike = createExperimentalBoundShortcutSpike({
    getResolve: async () => ({
      ...resolveFixture(),
      GetProjectManager: () => ({
        GetCurrentProject: () => {
          reads += 1;
          return resolveFixture({ selectedClipIds: [reads === 1 ? "clip-1" : "clip-2"] })
            .GetProjectManager().GetCurrentProject();
        }
      })
    }),
    closePalette: () => calls.push("close"),
    native: {
      readConfig: async () => ({ sha256: "a".repeat(64), mtimeMs: 1234 }),
      discoverResolveWindow: async () => ({ pid: 50996, hwnd: "123", keyboardLayout: KEYBOARD_LAYOUT }),
      restoreAndSend: async () => calls.push("send")
    },
    now: () => NOW
  });

  await assert.rejects(spike.execute(request()), /context or preset changed/);
  assert.deepEqual(calls, ["close"]);
});

test("the injected ShortcutManager sends once after Clackly closes and rejects concurrent execution", async () => {
  const calls = [];
  let finishSend;
  const spike = createExperimentalBoundShortcutSpike({
    getResolve: async () => resolveFixture(),
    closePalette: () => calls.push("close"),
    native: {
      readConfig: async () => ({ sha256: "a".repeat(64), mtimeMs: 1234 }),
      discoverResolveWindow: async () => ({ pid: 50996, hwnd: "123", keyboardLayout: KEYBOARD_LAYOUT }),
      restoreAndSend: ({ target, keyboardLayout, keyCodes, sequence }) => new Promise((resolve) => {
        calls.push({ target, keyboardLayout, keyCodes, sequence });
        finishSend = () => resolve({ foregroundPid: 50996, foregroundHwnd: "123", sentInputs: 6 });
      })
    },
    now: () => NOW
  });

  const first = spike.execute(request());
  await new Promise((resolve) => setImmediate(resolve));
  await assert.rejects(spike.execute(request()), /already running/);
  assert.equal(calls[0], "close");
  assert.equal(calls.filter((call) => typeof call === "object").length, 1);
  finishSend();
  const result = await first;
  assert.equal(result.postconditionRequired, true);
  assert.equal(result.transport.sentInputs, 6);
});

test("a native send failure is surfaced once and never retried", async () => {
  let sends = 0;
  const spike = createExperimentalBoundShortcutSpike({
    getResolve: async () => resolveFixture(),
    closePalette: () => {},
    native: {
      readConfig: async () => ({ sha256: "a".repeat(64), mtimeMs: 1234 }),
      discoverResolveWindow: async () => ({ pid: 50996, hwnd: "123", keyboardLayout: KEYBOARD_LAYOUT }),
      restoreAndSend: async () => {
        sends += 1;
        throw new Error("SendInput did not send the complete key sequence");
      }
    },
    now: () => NOW
  });

  await assert.rejects(spike.execute(request()), /SendInput did not send/);
  assert.equal(sends, 1);
});

test("native diagnostics retain partial counts and leave timed-out sends unknown", async () => {
  const partialNative = createWindowsNativeShortcut({
    platform: "win32",
    run: async () => ({
      ok: false,
      stage: "sendinput",
      sendInvoked: true,
      expectedInputs: 6,
      sentInputs: 2,
      cleanupExpected: 3,
      cleanupSent: 3,
      error: "SendInput sent 2 of 6 inputs"
    })
  });
  await assert.rejects(partialNative.restoreAndSend({
    target: { pid: 50996, hwnd: "123" },
    keyboardLayout: KEYBOARD_LAYOUT,
    keyCodes: [0x11, 0x10, 0x41],
    sequence: buildKeySequence([0x11, 0x10, 0x41])
  }), (error) => {
    assert.deepEqual(error.shortcutDiagnostic, {
      stage: "sendinput",
      sendInvoked: true,
      expectedInputs: 6,
      sentInputs: 2,
      cleanupExpected: 3,
      cleanupSent: 3
    });
    return true;
  });

  const spike = createExperimentalBoundShortcutSpike({
    getResolve: async () => resolveFixture(),
    closePalette: () => {},
    native: {
      readConfig: async () => ({ sha256: "a".repeat(64), mtimeMs: 1234 }),
      discoverResolveWindow: async () => ({ pid: 50996, hwnd: "123", keyboardLayout: KEYBOARD_LAYOUT }),
      restoreAndSend: async () => { throw new Error("Windows shortcut helper failed: timed out"); }
    },
    now: () => NOW
  });
  await assert.rejects(spike.execute(request()), (error) => {
    assert.equal(error.shortcutDiagnostic.stage, "native-restore");
    assert.equal(error.shortcutDiagnostic.helperEntered, true);
    assert.equal(error.shortcutDiagnostic.sendInvoked, null);
    assert.equal(error.shortcutDiagnostic.expectedInputs, 6);
    return true;
  });
});

test("the host trigger is Windows-only and absent without the staged development marker", async () => {
  assert.equal(isEnabled({ appRoot: "C:\\Clackly", fileExists: () => false, platform: "win32" }), false);
  assert.equal(isEnabled({ appRoot: "C:\\Clackly", fileExists: () => true, platform: "linux" }), false);
  const handlers = new Map();
  const trustedEvent = { sender: {} };
  const registered = registerExperimentalResolveShortcut({
    ipcMain: { handle: (channel, handler) => handlers.set(channel, handler) },
    getResolve: async () => resolveFixture(),
    hidePalette: () => {},
    appRoot: "C:\\Clackly",
    platform: "win32",
    fileExists: () => true,
    createSpike: () => ({
      collectEvidence: async () => ({ readOnly: true }),
      execute: async (value) => ({ received: value })
    }),
    isTrustedSender: (event) => event === trustedEvent
  });
  assert.equal(registered, true);
  await assert.rejects(handlers.get(CHANNEL)({ sender: {} }, { action: "test" }), /untrusted renderer/);
  const response = await handlers.get(CHANNEL)(trustedEvent, { action: "test" });
  assert.equal(response.ok, true);
  assert.deepEqual(response.result, { received: { action: "test" } });
  assert.deepEqual(await handlers.get(`${CHANNEL}:collect`)(trustedEvent), { readOnly: true });
});

test("the host retains one sanitized diagnostic for a later panel reopen", async () => {
  const handlers = new Map();
  const trustedEvent = { sender: {} };
  let saved = null;
  const registered = registerExperimentalResolveShortcut({
    ipcMain: { handle: (channel, handler) => handlers.set(channel, handler) },
    getResolve: async () => resolveFixture(),
    hidePalette: () => {},
    appRoot: "C:\\Clackly",
    platform: "win32",
    fileExists: () => true,
    createSpike: () => ({
      collectEvidence: async () => ({ readOnly: true }),
      execute: async () => {
        const error = new Error("SendInput sent 2 of 6 inputs");
        error.transportAttempted = true;
        error.shortcutDiagnostic = {
          stage: "sendinput",
          helperEntered: true,
          sendInvoked: true,
          expectedInputs: 6,
          sentInputs: 2,
          cleanupExpected: 3,
          cleanupSent: 3
        };
        throw error;
      }
    }),
    isTrustedSender: (event) => event === trustedEvent,
    lastResultStorage: {
      load: () => saved,
      save: (value) => { saved = value; }
    }
  });
  assert.equal(registered, true);
  const response = await handlers.get(CHANNEL)(trustedEvent, {});
  assert.deepEqual(response.lastResult, {
    version: 1,
    outcome: "failed",
    stage: "sendinput",
    error: "sendinput-partial",
    helperEntered: true,
    sendInvoked: true,
    expectedInputs: 6,
    sentInputs: 2,
    cleanupExpected: 3,
    cleanupSent: 3
  });
  assert.deepEqual(await handlers.get(`${CHANNEL}:last-result`)(trustedEvent), response.lastResult);
});

test("persisted shortcut diagnostics reject extra or unsanitized fields", () => {
  const valid = {
    version: 1,
    outcome: "failed",
    stage: "sendinput",
    error: "sendinput-partial",
    helperEntered: true,
    sendInvoked: true,
    expectedInputs: 6,
    sentInputs: 2,
    cleanupExpected: 3,
    cleanupSent: 3
  };
  let loaded = valid;
  const storage = createLastResultStorage({ storage: { load: () => loaded, save: () => {} } });
  assert.deepEqual(storage.load(), valid);
  loaded = { ...valid, nativeError: "raw helper details" };
  assert.equal(storage.load(), null);
  loaded = { ...valid, error: "raw helper details" };
  assert.equal(storage.load(), null);
});
