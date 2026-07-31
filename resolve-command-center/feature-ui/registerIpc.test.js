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
  let openedFeature = null;

  registerFeatureUiIpc({
    ipcMain,
    dialog,
    featureCatalog: { getAllFeatures: () => [{ id: "marker.add" }] },
    featureStatusManager: {
      list: () => [{ id: "marker.add", status: "loading" }],
      refresh: (id) => ({ id, status: "ready" }),
      setEnabled: (id, enabled) => ({ id, enabled })
    },
    configManager: {
      get: (id) => ({ id }),
      save: (id, values, options) => {
        saveOptions = options;
        return { id, ...values };
      },
      reset: () => ({})
    },
    interactionManager: {
      listBindings: () => [{ id: "left", target: "timeline.addMarker" }]
    },
    openSettings: (id) => { opened = true; openedFeature = id; }
  });

  assert.deepEqual(await handlers.get("interactions:list")(), [
    { id: "left", target: "timeline.addMarker" }
  ]);
  assert.deepEqual(await handlers.get("features:list")(), [{ id: "marker.add" }]);
  assert.deepEqual(await handlers.get("feature-status:list")(), [
    { id: "marker.add", status: "loading" }
  ]);
  assert.deepEqual(await handlers.get("feature-status:refresh")(null, "marker.add"), {
    id: "marker.add",
    status: "ready"
  });
  assert.deepEqual(await handlers.get("feature-status:set-enabled")(null, "marker.add", false), {
    id: "marker.add",
    enabled: false
  });
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
  listeners.get("settings:open")(null, "marker.add");
  assert.equal(opened, true);
  assert.equal(openedFeature, "marker.add");
});
