const assert = require("node:assert/strict");
const test = require("node:test");

const { createCapabilityRegistry } = require("./registry");

test("capability registry validates registration and preserves execution objects", () => {
  const registry = createCapabilityRegistry();
  const metadata = {
    id: "marker.add",
    name: "Add Marker",
    description: "Add marker at current timeline position",
    category: "Timeline",
    icon: "marker",
    version: "1.0.0",
    type: "command",
    providers: ["resolve-api", "shortcut"],
    configSchema: {
      color: { type: "color", label: "Marker color" }
    }
  };
  const capability = { metadata, execute: async () => ({ ok: true }) };

  assert.equal(registry.register("marker.add", capability), capability);
  assert.equal(registry.get("marker.add"), capability);
  assert.equal(registry.get("missing"), null);
  assert.equal(registry.getMetadata("marker.add"), metadata);
  assert.equal(registry.getMetadata("missing"), null);
  assert.deepEqual(registry.getAllCapabilities(), [{
    id: "marker.add",
    name: "Add Marker",
    category: "Timeline",
    icon: "marker"
  }]);
  assert.throws(() => registry.register(), /non-empty capability id/);
  assert.throws(() => registry.register("invalid", {}), /execute\(\)/);
  assert.throws(
    () => registry.register("invalid", { execute() {} }),
    /requires capability metadata/
  );
  assert.throws(
    () => registry.register("invalid", {
      metadata: { ...metadata, id: "invalid", name: "" },
      execute() {}
    }),
    /non-empty name/
  );
  assert.throws(
    () => registry.register("invalid", {
      metadata: { ...metadata, id: "invalid", providers: ["resolve-api", 1] },
      execute() {}
    }),
    /providers must be an array of non-empty strings/
  );
  assert.throws(
    () => registry.register("invalid", {
      metadata: { ...metadata, id: "invalid", providers: new Array(1) },
      execute() {}
    }),
    /providers must be an array of non-empty strings/
  );
  assert.throws(
    () => registry.register("invalid", {
      metadata: { ...metadata, id: "invalid", configSchema: undefined },
      execute() {}
    }),
    /configSchema must be an object/
  );
  assert.throws(
    () => registry.register("invalid", {
      metadata: {
        ...metadata,
        id: "invalid",
        configSchema: { mode: { type: "select", options: [] } }
      },
      execute() {}
    }),
    /select options must be a non-empty array/
  );
  const scriptCapability = {
    metadata: {
      ...metadata,
      id: "script.run",
      providers: ["script"],
      executor: { type: "script", runtime: "python", entry: "scripts/run.py" }
    },
    execute() {}
  };
  assert.equal(registry.register("script.run", scriptCapability), scriptCapability);
  for (const executor of [
    null,
    [],
    { type: "", runtime: "python", entry: "scripts/run.py" },
    { type: "script", runtime: "", entry: "scripts/run.py" },
    { type: "script", runtime: "python", entry: "" },
    { type: "native", runtime: "python", entry: "scripts/run.py" }
  ]) {
    assert.throws(
      () => registry.register("invalid", {
        metadata: { ...metadata, id: "invalid", executor },
        execute() {}
      }),
      /executor|Unsupported capability executor type/
    );
  }
  assert.throws(
    () => registry.register("invalid", { metadata, execute() {} }),
    /id must match/
  );
  assert.throws(() => registry.register("marker.add", capability), /already registered/);

  for (const optionLabels of [{ "": "Fast" }, { fast: "" }, { fast: 1 }]) {
    assert.throws(() => registry.register("invalid", {
      metadata: {
        ...metadata,
        id: "invalid",
        configSchema: { mode: { type: "select", options: ["fast"], optionLabels } }
      },
      execute() {}
    }), /optionLabels must be an object of non-empty strings/);
  }
  assert.throws(() => registry.register("invalid", {
    metadata: {
      ...metadata,
      id: "invalid",
      configSchema: {
        mode: {
          type: "select",
          options: ["fast"],
          localizations: { "zh-CN": { optionLabels: { fast: "" } } }
        }
      }
    },
    execute() {}
  }), /localization zh-CN is invalid/);
});
