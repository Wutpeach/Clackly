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
  assert.throws(
    () => registry.register("invalid", { metadata, execute() {} }),
    /id must match/
  );
  assert.throws(() => registry.register("marker.add", capability), /already registered/);
});
