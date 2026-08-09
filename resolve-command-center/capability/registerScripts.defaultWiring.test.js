const assert = require("node:assert/strict");
const test = require("node:test");

const { registerScriptCapabilities } = require("./registerScripts");
const { createCapabilityRegistry } = require("./registry");

// Characterization of the default host wiring built by registerScriptCapabilities:
// ScriptCapabilityProvider -> ScriptExecutor -> { python: PythonProvider } -> runtimeManager.
// The chain is reachable only through the registered capability; a stub runtimeManager
// at the far end proves the whole delegation path exists without touching product code.
test("default script wiring maps python to PythonProvider and loads shipped definitions", async () => {
  const runtimeManager = {
    execute: async () => ({ ok: true, result: { value: 42 }, logs: [] }),
    checkAvailability: async () => ({ ok: true })
  };
  const registry = createCapabilityRegistry();
  const capabilities = registerScriptCapabilities({ capabilityRegistry: registry, runtimeManager });

  assert.ok(capabilities.length > 0);
  const ids = capabilities.map(({ metadata }) => metadata.id);
  assert.ok(ids.includes("ae.export"));

  const registered = registry.get("ae.export");
  assert.equal(registered.metadata.executor.entry, "scripts/resolve2ae_export.py");

  const command = { id: "timeline.exportToAfterEffects" };
  const config = { get: () => ({}) };
  assert.deepEqual(await registered.execute(command, { config }), { value: 42 });
});

test("default script wiring delegates availability through the same chain", async () => {
  const calls = [];
  const runtimeManager = {
    execute: async () => ({ ok: true, result: {}, logs: [] }),
    async checkAvailability(request) {
      calls.push(request);
      return { ok: true, supportStatus: "machine-verified", effectiveStatus: "ready" };
    }
  };
  const registry = createCapabilityRegistry();
  registerScriptCapabilities({ capabilityRegistry: registry, runtimeManager });

  assert.deepEqual(await registry.get("ae.export").checkAvailability(), {
    status: "ready",
    message: null,
    details: { missing: [], action: null }
  });
  assert.deepEqual(calls, [{ runtime: "python", capabilityId: "ae.export" }]);
});
