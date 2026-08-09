const assert = require("node:assert/strict");
const test = require("node:test");

const { FeatureStatusManager } = require("./FeatureStatusManager");

function createManager({ missing = [], probe, enabled = true, getMissingRequired } = {}) {
  const capability = { execute() {}, ...(probe ? { checkAvailability: probe } : {}) };
  let persistedEnabled = enabled;
  const manager = new FeatureStatusManager({
    capabilityRegistry: {
      get: (id) => id === "ae.export" ? capability : null,
      getAllCapabilities: () => [{ id: "ae.export" }]
    },
    configManager: {
      getMissingRequired: getMissingRequired || (() => structuredClone(missing))
    },
    stateStorage: {
      getEnabled: () => persistedEnabled,
      setEnabled: (_id, next) => { persistedEnabled = next; }
    }
  });
  return { manager, getEnabled: () => persistedEnabled };
}

test("feature status starts loading, returns defensive records, and projects unknown features", () => {
  const { manager } = createManager({ enabled: false });
  const first = manager.list();
  assert.deepEqual(first, [{
    id: "ae.export",
    installed: true,
    enabled: false,
    status: "loading",
    message: "Checking feature availability…",
    details: { missing: [], action: null }
  }]);
  first[0].details.missing.push("changed");
  assert.deepEqual(manager.get("ae.export").details.missing, []);
  assert.deepEqual(manager.get("missing"), {
    id: "missing",
    installed: false,
    enabled: true,
    status: "unavailable",
    message: "Feature is not installed.",
    details: { missing: [], action: null }
  });
});

test("missing configuration wins over availability and uses structured keys plus labels", async () => {
  let probed = false;
  const { manager } = createManager({
    missing: [
      { key: "aePath", label: "After Effects Path" },
      { key: "mode", label: "Export Mode" }
    ],
    probe: () => { probed = true; }
  });

  assert.deepEqual(await manager.refresh("ae.export"), {
    id: "ae.export",
    installed: true,
    enabled: true,
    status: "missing-config",
    message: "Missing After Effects Path, Export Mode",
    details: { missing: ["aePath", "mode"], action: "open-settings" }
  });
  assert.equal(probed, false);
});

test("availability results preserve independent enabled state and fixed details", async () => {
  const { manager } = createManager({
    enabled: false,
    probe: async () => ({
      status: "missing-dependency",
      message: "After Effects is not installed.",
      details: { missing: ["after-effects"], action: "open-settings" }
    })
  });
  const result = await manager.refresh("ae.export");
  assert.equal(result.enabled, false);
  assert.equal(result.status, "missing-dependency");
  assert.deepEqual(result.details, { missing: ["after-effects"], action: "open-settings" });
});

test("configured capabilities default ready without a probe and normalize unavailable probes", async () => {
  assert.equal((await createManager().manager.refresh("ae.export")).status, "ready");
  const { manager } = createManager({
    probe: async () => ({
      status: "unavailable",
      message: "No provider is available.",
      details: { missing: [], action: null }
    })
  });
  assert.deepEqual(await manager.refresh("ae.export"), {
    id: "ae.export",
    installed: true,
    enabled: true,
    status: "unavailable",
    message: "No provider is available.",
    details: { missing: [], action: null }
  });
});

test("unexpected or malformed probes become sanitized error records and recover", async () => {
  let broken = true;
  const { manager } = createManager({
    probe: async () => {
      if (broken) throw new Error("C:/secret/path\nprivate stack");
      return { status: "ready", message: null, details: { missing: [], action: null } };
    }
  });

  assert.deepEqual(await manager.refresh("ae.export"), {
    id: "ae.export",
    installed: true,
    enabled: true,
    status: "error",
    message: "Unable to determine feature status.",
    details: { missing: [], action: null }
  });
  broken = false;
  assert.equal((await manager.refresh("ae.export")).status, "ready");
});

test("malformed availability results are rejected as sanitized errors", async () => {
  const malformedResults = [
    { status: "loading", message: null, details: { missing: [], action: null } },
    { status: "missing-dependency", message: null, details: { missing: [], action: null } },
    { status: "ready", message: null, details: { missing: ["after-effects"], action: null } },
    { status: "unavailable", message: null, details: { missing: [], action: "open-settings" } },
    { status: "ready", message: 42, details: { missing: [], action: null } }
  ];

  for (const result of malformedResults) {
    const { manager } = createManager({ probe: async () => result });
    assert.equal((await manager.refresh("ae.export")).status, "error");
  }
});

test("config and storage failures stay sanitized and preserve last known enablement", async () => {
  let configBroken = true;
  const { manager } = createManager({
    getMissingRequired: () => {
      if (configBroken) throw new Error("C:/private/config.json");
      return [];
    }
  });
  assert.equal((await manager.refresh("ae.export")).status, "error");
  configBroken = false;
  assert.equal((await manager.refresh("ae.export")).status, "ready");

  let persistedEnabled = true;
  let storageBroken = false;
  const storageManager = new FeatureStatusManager({
    capabilityRegistry: {
      get: (id) => id === "ae.export" ? { execute() {} } : null,
      getAllCapabilities: () => [{ id: "ae.export" }]
    },
    configManager: { getMissingRequired: () => [] },
    stateStorage: {
      getEnabled: () => {
        if (storageBroken) throw new Error("C:/private/feature-status.json");
        return persistedEnabled;
      },
      setEnabled: (_id, enabled) => {
        persistedEnabled = enabled;
        storageBroken = true;
      }
    }
  });
  storageManager.get("ae.export");
  assert.deepEqual(await storageManager.setEnabled("ae.export", false), {
    id: "ae.export",
    installed: true,
    enabled: false,
    status: "error",
    message: "Unable to determine feature status.",
    details: { missing: [], action: null }
  });
});

test("an in-flight refresh keeps the loading record visible and settles once", async () => {
  let probeCalls = 0;
  let resolveProbe;
  const gate = new Promise((resolve) => { resolveProbe = resolve; });
  const { manager } = createManager({
    probe: async () => {
      probeCalls += 1;
      return gate;
    }
  });

  const pending = manager.refresh("ae.export");
  assert.equal(manager.get("ae.export").status, "loading");
  resolveProbe({ status: "ready", message: null, details: { missing: [], action: null } });
  assert.equal((await pending).status, "ready");
  assert.equal(probeCalls, 1);
});

test("enablement persists, refreshes readiness, and gates execution synchronously", async () => {
  const { manager, getEnabled } = createManager();
  assert.equal((await manager.setEnabled("ae.export", false)).enabled, false);
  assert.equal(getEnabled(), false);
  assert.throws(() => manager.assertEnabled("ae.export"), /disabled: ae\.export/);
  await assert.rejects(() => manager.setEnabled("missing", true), /Unknown feature/);
  await assert.rejects(() => manager.setEnabled("ae.export", "yes"), /must be a boolean/);
});
