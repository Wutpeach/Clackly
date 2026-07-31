const assert = require("node:assert/strict");
const test = require("node:test");

const { registerFeatureUiIpc } = require("./registerIpc");

test("feature UI IPC exposes semantic catalog, config, picker, and settings operations", async () => {
  const handlers = new Map();
  const listeners = new Map();
  const calls = [];
  let saveOptions = null;
  const ipcMain = {
    handle: (channel, handler) => handlers.set(channel, handler),
    on: (channel, handler) => listeners.set(channel, handler)
  };
  const dialog = {
    showOpenDialog: async (options) => {
      calls.push(options);
      return calls.length === 1
        ? { canceled: false, filePaths: ["C:/tool.exe"] }
        : { canceled: true, filePaths: [] };
    }
  };
  let opened = false;

  registerFeatureUiIpc({
    ipcMain,
    dialog,
    featureCatalog: { getAllFeatures: () => [{ id: "marker.add" }] },
    configManager: {
      get: (id) => ({ id }),
      save: (id, values, options) => {
        saveOptions = options;
        return { id, ...values };
      },
      reset: () => ({})
    },
    openSettings: () => { opened = true; }
  });

  assert.deepEqual(await handlers.get("features:list")(), [{ id: "marker.add" }]);
  assert.deepEqual(await handlers.get("config:get")(null, "marker.add"), { id: "marker.add" });
  assert.deepEqual(await handlers.get("config:save")(null, "marker.add", { color: "#f36a2d" }), {
    id: "marker.add",
    color: "#f36a2d"
  });
  assert.deepEqual(saveOptions, { requireComplete: true });
  assert.deepEqual(await handlers.get("config:reset")(null, "marker.add"), {});
  assert.equal(await handlers.get("dialog:pick-path")(null, "path"), "C:/tool.exe");
  assert.equal(await handlers.get("dialog:pick-path")(null, "folder"), null);
  assert.deepEqual(calls, [
    { properties: ["openFile"] },
    { properties: ["openDirectory"] }
  ]);
  await assert.rejects(() => handlers.get("dialog:pick-path")(null, "other"), /path or folder/);
  listeners.get("settings:open")();
  assert.equal(opened, true);
});
