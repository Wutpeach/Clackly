const assert = require("node:assert/strict");
const test = require("node:test");

const { createCapabilityRegistry } = require("./registry");

test("capability registry validates registration and preserves execution objects", () => {
  const registry = createCapabilityRegistry();
  const capability = { execute: async () => ({ ok: true }) };

  assert.equal(registry.register("marker.add", capability), capability);
  assert.equal(registry.get("marker.add"), capability);
  assert.equal(registry.get("missing"), null);
  assert.throws(() => registry.register(), /non-empty capability id/);
  assert.throws(() => registry.register("invalid", {}), /execute\(\)/);
  assert.throws(() => registry.register("marker.add", capability), /already registered/);
});
