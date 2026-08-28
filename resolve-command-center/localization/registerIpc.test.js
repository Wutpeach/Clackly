const assert = require("node:assert/strict");
const test = require("node:test");
const { registerLocalizationIpc } = require("./registerIpc");

test("localization IPC returns authoritative snapshots and broadcasts only to live windows", () => {
  const handlers = new Map();
  const listeners = new Set();
  const sent = [];
  let snapshot = { preference: "system", effectiveLocale: "en" };
  const service = {
    getSnapshot: () => snapshot,
    setLocalePreference: (locale) => {
      snapshot = { preference: locale, effectiveLocale: locale };
      listeners.forEach((listener) => listener(snapshot));
      return snapshot;
    },
    subscribe: (listener) => { listeners.add(listener); return () => listeners.delete(listener); }
  };
  registerLocalizationIpc({
    ipcMain: { handle: (channel, handler) => handlers.set(channel, handler) },
    localizationService: service,
    getWindows: () => [
      { isDestroyed: () => false, webContents: { send: (...args) => sent.push(args) } },
      { isDestroyed: () => true, webContents: { send: () => assert.fail("destroyed window sent") } }
    ]
  });
  assert.deepEqual(handlers.get("localization:get-snapshot")(), { preference: "system", effectiveLocale: "en" });
  assert.deepEqual(handlers.get("preferences:set-locale")(null, "zh-CN"), { preference: "zh-CN", effectiveLocale: "zh-CN" });
  assert.deepEqual(sent, [["localization:changed", { preference: "zh-CN", effectiveLocale: "zh-CN" }]]);
});
