const { createExperimentalBoundShortcutSpike } = require("../../resolve/experimentalBoundShortcut");
const fs = require("node:fs");
const path = require("node:path");
const { ConfigStorage } = require("../../config/ConfigStorage");

const CHANNEL = "experiments:resolve-bound-shortcut";
const DEVELOPMENT_MARKER = ".clackly-resolve-shortcut-spike-dev";
const LAST_RESULT_FILE = "resolve-bound-shortcut-spike-last-result.json";
const DIAGNOSTIC_STAGES = new Set(["preflight", "palette-hidden", "posthide-guard", "native-restore", "sendinput", "complete"]);
const DIAGNOSTIC_ERRORS = new Set(["request-rejected", "context-changed", "keyboard-config-changed", "keyboard-layout-changed", "foreground-restore-failed", "foreground-check-failed", "held-modifier", "sendinput-partial", "native-output-unparseable", "native-helper-unknown", "unknown"]);
const LAST_RESULT_KEYS = ["version", "outcome", "stage", "error", "helperEntered", "sendInvoked", "expectedInputs", "sentInputs", "cleanupExpected", "cleanupSent"];

function count(value, maximum = 24) {
  return Number.isSafeInteger(value) && value >= 0 && value <= maximum ? value : null;
}

function sanitizeError(error) {
  const message = typeof error?.message === "string" ? error.message : "";
  if (/shortcut binding|shortcut chord|action is not|evidence/.test(message)) return "request-rejected";
  if (/context or preset changed/.test(message)) return "context-changed";
  if (/keyboard configuration changed/.test(message)) return "keyboard-config-changed";
  if (/keyboard layout changed/.test(message)) return "keyboard-layout-changed";
  if (/Could not restore Resolve foreground/.test(message)) return "foreground-restore-failed";
  if (/foreground verification|foreground changed/.test(message)) return "foreground-check-failed";
  if (/Held modifier/.test(message)) return "held-modifier";
  if (/SendInput sent/.test(message)) return "sendinput-partial";
  if (/invalid telemetry/.test(message)) return "native-output-unparseable";
  if (/Windows shortcut helper failed/.test(message)) return "native-helper-unknown";
  return "unknown";
}

function createLastResult({ result, error }) {
  const source = result?.diagnostic || error?.shortcutDiagnostic || {};
  const helperEntered = Boolean(source.helperEntered);
  const expectedInputs = count(source.expectedInputs);
  const stage = result
    ? "complete"
    : DIAGNOSTIC_STAGES.has(source.stage)
      ? source.stage
      : helperEntered ? "native-restore" : "preflight";
  const sendInvoked = result
    ? true
    : source.sendInvoked === true ? true : source.sendInvoked === false ? false : null;
  return {
    version: 1,
    outcome: result ? "complete" : helperEntered ? "failed" : "rejected",
    stage,
    error: result ? null : sanitizeError(error),
    helperEntered,
    sendInvoked,
    expectedInputs,
    sentInputs: count(source.sentInputs, expectedInputs ?? 24),
    cleanupExpected: count(source.cleanupExpected, expectedInputs ?? 24),
    cleanupSent: count(source.cleanupSent, expectedInputs ?? 24)
  };
}

function isLastResult(value) {
  return value && typeof value === "object" && value.version === 1
    && Object.keys(value).length === LAST_RESULT_KEYS.length
    && LAST_RESULT_KEYS.every((key) => Object.hasOwn(value, key))
    && ["complete", "failed", "rejected"].includes(value.outcome)
    && DIAGNOSTIC_STAGES.has(value.stage)
    && typeof value.helperEntered === "boolean"
    && [true, false, null].includes(value.sendInvoked)
    && (value.error === null || DIAGNOSTIC_ERRORS.has(value.error))
    && ["expectedInputs", "sentInputs", "cleanupExpected", "cleanupSent"].every((key) => value[key] === null || count(value[key]) === value[key]);
}

function createLastResultStorage({ appDataPath, storage } = {}) {
  const configured = storage || (typeof appDataPath === "string" && appDataPath.trim()
    ? new ConfigStorage(path.join(appDataPath, "Clackly", LAST_RESULT_FILE))
    : null);
  if (!configured) return null;
  return {
    load() {
      try {
        const value = configured.load();
        return isLastResult(value) ? value : null;
      } catch (_error) {
        return null;
      }
    },
    save(result) {
      if (!isLastResult(result)) throw new TypeError("Resolve shortcut diagnostic is invalid");
      try {
        configured.save(result);
      } catch (_error) {
        // A diagnostic write must not alter a single, user-owned shortcut attempt.
      }
      return result;
    }
  };
}

function isEnabled({
  appRoot,
  fileExists = fs.existsSync,
  platform = process.platform
} = {}) {
  return platform === "win32" && typeof appRoot === "string"
    && fileExists(path.join(appRoot, DEVELOPMENT_MARKER));
}

function registerExperimentalResolveShortcut({
  ipcMain,
  getResolve,
  hidePalette,
  appRoot,
  appDataPath,
  platform = process.platform,
  createSpike = createExperimentalBoundShortcutSpike,
  isTrustedSender,
  fileExists = fs.existsSync,
  lastResultStorage = createLastResultStorage({ appDataPath })
} = {}) {
  if (!isEnabled({ appRoot, fileExists, platform })) return false;
  if (!ipcMain || typeof ipcMain.handle !== "function") throw new TypeError("Resolve shortcut spike requires ipcMain.handle");
  if (typeof isTrustedSender !== "function") throw new TypeError("Resolve shortcut spike requires a trusted IPC sender check");
  const spike = createSpike({ getResolve, closePalette: hidePalette });
  const persistLastResult = (value) => lastResultStorage?.save(value) || value;
  ipcMain.handle(CHANNEL, async (event, request) => {
    if (!isTrustedSender(event)) throw new Error("Resolve shortcut spike rejected an untrusted renderer");
    try {
      const result = await spike.execute(request);
      return { ok: true, result, lastResult: persistLastResult(createLastResult({ result })) };
    } catch (error) {
      const lastResult = persistLastResult(createLastResult({ error }));
      return { ok: false, transportAttempted: Boolean(error?.transportAttempted), lastResult };
    }
  });
  ipcMain.handle(`${CHANNEL}:collect`, async (event) => {
    if (!isTrustedSender(event)) throw new Error("Resolve shortcut spike rejected an untrusted renderer");
    return spike.collectEvidence();
  });
  ipcMain.handle(`${CHANNEL}:last-result`, (event) => {
    if (!isTrustedSender(event)) throw new Error("Resolve shortcut spike rejected an untrusted renderer");
    return lastResultStorage?.load() || null;
  });
  return true;
}

module.exports = {
  CHANNEL,
  DEVELOPMENT_MARKER,
  LAST_RESULT_FILE,
  createLastResult,
  createLastResultStorage,
  isEnabled,
  registerExperimentalResolveShortcut
};
