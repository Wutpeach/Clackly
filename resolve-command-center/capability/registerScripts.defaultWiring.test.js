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
    execute: async () => ({ ok: true, result: { value: 42 }, logs: [] })
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
