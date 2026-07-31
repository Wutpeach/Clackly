const assert = require("node:assert/strict");
const test = require("node:test");

const { ConfigManager } = require("./ConfigManager");

function createManager(initial = {}) {
  let persisted = structuredClone(initial);
  const schemas = {
    "ae.export": {
      aePath: { type: "path", label: "After Effects Path", required: true },
      mode: { type: "select", required: true, options: ["composition", "selected"] },
      enabled: { type: "boolean" }
    },
    "caption.set": {
      text: { type: "string" }
    },
    "marker.add": {}
  };
  const manager = new ConfigManager({
    capabilityRegistry: {
      getMetadata: (id) => schemas[id] ? { id, configSchema: schemas[id] } : null
    },
    storage: {
      load: () => structuredClone(persisted),
      save: (config) => { persisted = structuredClone(config); }
    }
  });
  return { manager, getPersisted: () => structuredClone(persisted) };
}

test("config manager saves, copies, updates, and preserves unknown stored capabilities", () => {
  const { manager, getPersisted } = createManager({ legacy: { keep: true } });

  assert.deepEqual(manager.save("ae.export", { aePath: "C:/AfterFX.exe" }), {
    aePath: "C:/AfterFX.exe"
  });
  const copy = manager.get("ae.export");
  copy.aePath = "changed";
  assert.equal(manager.get("ae.export", "aePath"), "C:/AfterFX.exe");
  assert.equal(manager.get("ae.export", "mode"), null);

  assert.deepEqual(manager.update("ae.export", {
    mode: "composition",
    enabled: false
  }), {
    aePath: "C:/AfterFX.exe",
    mode: "composition",
    enabled: false
  });
  assert.deepEqual(getPersisted().legacy, { keep: true });
});

test("config manager rejects unknown capabilities, keys, and invalid values", () => {
  const { manager } = createManager();

  assert.throws(() => manager.get("missing"), /Unknown capability/);
  assert.throws(() => manager.save("ae.export", { other: true }), /Unknown configuration key/);
  assert.throws(() => manager.save("ae.export", { enabled: "yes" }), /Invalid value/);
  assert.throws(() => manager.update("ae.export", []), /patch must be an object/);
  assert.throws(() => manager.update("ae.export", new Date()), /patch must be an object/);
  assert.throws(() => manager.get("ae.export", "other"), /Unknown configuration key/);
});

test("config manager reports every missing required field and accepts complete or empty schemas", () => {
  const { manager } = createManager();

  assert.throws(
    () => manager.assertConfigured("ae.export"),
    /ae\.export.*aePath, mode/
  );
  manager.save("ae.export", { aePath: "   ", mode: "selected" });
  assert.throws(() => manager.assertConfigured("ae.export"), /aePath/);
  manager.save("ae.export", { aePath: "C:/AfterFX.exe", mode: "selected" });
  assert.doesNotThrow(() => manager.assertConfigured("ae.export"));
  assert.doesNotThrow(() => manager.assertConfigured("marker.add"));
  assert.deepEqual(manager.getMissingRequired("ae.export"), []);
});

test("config manager projects missing required keys with schema labels and readable fallback labels", () => {
  const { manager } = createManager();
  assert.deepEqual(manager.getMissingRequired("ae.export"), [
    { key: "aePath", label: "After Effects Path" },
    { key: "mode", label: "Mode" }
  ]);
});

test("config manager validates stored values before exposing or executing them", () => {
  const { manager } = createManager({
    "ae.export": { aePath: "C:/AfterFX.exe", mode: "composition", enabled: "yes" }
  });

  assert.throws(() => manager.get("ae.export"), /Invalid value.*enabled/);
  assert.throws(() => manager.assertConfigured("ae.export"), /Invalid value.*enabled/);

  const { manager: invalidRequired } = createManager({
    "ae.export": { aePath: 42, mode: "composition" }
  });
  assert.throws(() => invalidRequired.assertConfigured("ae.export"), /Invalid value.*aePath/);
});

test("long-lived managers reload the shared file before reads and writes", () => {
  let persisted = {};
  const storage = {
    load: () => structuredClone(persisted),
    save: (config) => { persisted = structuredClone(config); }
  };
  const registry = {
    getMetadata: (id) => ({
      "ae.export": { configSchema: { aePath: { type: "path" } } },
      "caption.set": { configSchema: { text: { type: "string" } } }
    })[id] || null
  };
  const first = new ConfigManager({ capabilityRegistry: registry, storage });
  const second = new ConfigManager({ capabilityRegistry: registry, storage });

  first.save("ae.export", { aePath: "C:/AfterFX.exe" });
  second.save("caption.set", { text: "Fresh" });

  assert.deepEqual(persisted, {
    "ae.export": { aePath: "C:/AfterFX.exe" },
    "caption.set": { text: "Fresh" }
  });
  assert.equal(first.get("caption.set", "text"), "Fresh");
});

test("scoped config readers expose only their capability's declared values", () => {
  const { manager } = createManager({
    "ae.export": { aePath: "C:/AfterFX.exe", mode: "composition" },
    "marker.add": {}
  });
  const config = manager.forCapability("ae.export");

  assert.equal(config.get("aePath"), "C:/AfterFX.exe");
  assert.throws(() => config.get("marker.add"), /Unknown configuration key/);
  assert.deepEqual(Object.keys(config), ["get"]);
});

test("reset removes only the selected capability and rejects unknown capabilities", () => {
  const { manager, getPersisted } = createManager({
    "ae.export": { aePath: "C:/AfterFX.exe" },
    "caption.set": { text: "Keep me" },
    legacy: { keep: true }
  });

  assert.deepEqual(manager.reset("ae.export"), {});
  assert.deepEqual(getPersisted(), {
    "caption.set": { text: "Keep me" },
    legacy: { keep: true }
  });
  assert.throws(() => manager.reset("missing"), /Unknown capability/);
});

test("complete saves reject missing required values without persisting", () => {
  const initial = { legacy: { keep: true } };
  const { manager, getPersisted } = createManager(initial);

  assert.throws(
    () => manager.save("ae.export", { aePath: "C:/AfterFX.exe" }, { requireComplete: true }),
    /missing required configuration: mode/
  );
  assert.deepEqual(getPersisted(), initial);
});
