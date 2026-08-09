const assert = require("node:assert/strict");
const test = require("node:test");

const { createScriptCapability } = require("./script");

function scriptMetadata(id = "ae.export", entry = "scripts/resolve2ae_export.py") {
  return {
    id,
    name: "Export to After Effects",
    description: "Send Resolve timeline clips to After Effects",
    category: "Export",
    icon: "send",
    version: "1.0.0",
    type: "command",
    providers: ["script"],
    executor: { type: "script", runtime: "python", entry },
    configSchema: { aePath: { type: "path", label: "After Effects Path", required: true } }
  };
}

test("script capabilities expose metadata, execute, and availability", () => {
  const provider = { execute() {}, checkAvailability() {} };
  const capability = createScriptCapability(scriptMetadata(), provider);

  assert.deepEqual(Object.keys(capability).sort(), ["checkAvailability", "execute", "metadata"]);
  assert.equal(typeof capability.checkAvailability, "function");
  assert.equal(capability.metadata.id, "ae.export");
  assert.equal(capability.metadata.executor.runtime, "python");
});

test("script capability delegates availability with executor metadata and capability id", async () => {
  const calls = [];
  const capability = createScriptCapability(scriptMetadata(), {
    execute() {},
    checkAvailability(definition, context) {
      calls.push({ definition, context });
      return { status: "unavailable", message: null, details: { missing: [], action: null } };
    }
  });

  assert.deepEqual(await capability.checkAvailability(), {
    status: "unavailable",
    message: null,
    details: { missing: [], action: null }
  });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].definition.entry, "scripts/resolve2ae_export.py");
  assert.deepEqual(calls[0].context, { capabilityId: "ae.export" });
});

test("script capability execute delegates to the provider with command and capability ids", () => {
  const calls = [];
  const capability = createScriptCapability(scriptMetadata(), {
    execute(definition, context) {
      calls.push({ definition, context });
      return { ok: true, value: 42 };
    },
    checkAvailability() {}
  });

  const command = { id: "timeline.exportToAfterEffects" };
  const config = { get: () => ({}) };
  assert.deepEqual(capability.execute(command, { config }), { ok: true, value: 42 });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].definition.entry, "scripts/resolve2ae_export.py");
  assert.equal(calls[0].context.command.id, "timeline.exportToAfterEffects");
  assert.equal(calls[0].context.capabilityId, "ae.export");
  assert.equal(calls[0].context.config, config);
});

test("script capabilities reject non-script metadata and missing providers", () => {
  assert.throws(
    () => createScriptCapability({ executor: { type: "node" } }),
    /requires a script executor/
  );
  assert.throws(
    () => createScriptCapability(scriptMetadata()),
    /requires a script capability provider/
  );
});

test("script capabilities require a provider with the full execute and availability contract", () => {
  assert.throws(
    () => createScriptCapability(scriptMetadata(), { execute() {} }),
    /requires a script capability provider/
  );
  assert.throws(
    () => createScriptCapability(scriptMetadata(), { checkAvailability() {} }),
    /requires a script capability provider/
  );
});
