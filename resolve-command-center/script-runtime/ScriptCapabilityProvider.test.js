const assert = require("node:assert/strict");
const test = require("node:test");

const { ScriptCapabilityProvider } = require("./ScriptCapabilityProvider");

test("script capability provider snapshots scoped config and delegates", async () => {
  const calls = [];
  const logger = { info() {} };
  const provider = new ScriptCapabilityProvider({
    logger,
    scriptExecutor: {
      execute(definition, context) {
        calls.push({ definition, context });
        return context.config;
      },
      checkAvailability() {}
    }
  });
  const values = { output: "D:/exports" };
  const definition = { runtime: "python", entry: "scripts/export.py" };

  assert.deepEqual(await provider.execute(definition, {
    command: { id: "feature.export", name: "ignored" },
    config: { get: () => values },
    capabilityId: "ae.export"
  }), values);
  assert.notEqual(calls[0].context.config, values);
  assert.equal(calls[0].context.commandId, "feature.export");
  assert.equal(calls[0].context.capabilityId, "ae.export");
  assert.equal(calls[0].context.logger, logger);
  assert.throws(() => provider.execute(definition), /Command id/);
  assert.throws(() => provider.execute(definition, { command: { id: " " } }), /Command id/);
  assert.throws(() => provider.execute(definition, { command: { id: "feature.export" } }), /scoped configuration/);
  assert.throws(() => provider.execute(definition, {
    command: { id: "feature.export" }, config: { get: () => ({}) }
  }), /Capability id/);
});

test("script capability provider requires an executor with the full contract", () => {
  assert.throws(
    () => new ScriptCapabilityProvider({ scriptExecutor: { execute() {} } }),
    /requires a script executor/
  );
  assert.throws(
    () => new ScriptCapabilityProvider({ scriptExecutor: { checkAvailability() {} } }),
    /requires a script executor/
  );
});

test("script capability provider delegates availability with only the capability id", async () => {
  const calls = [];
  const provider = new ScriptCapabilityProvider({
    logger: { info() {} },
    scriptExecutor: {
      execute() {},
      checkAvailability(definition, context) {
        calls.push({ definition, context });
        return { status: "ready", message: null, details: { missing: [], action: null } };
      }
    }
  });
  const definition = { runtime: "python", entry: "scripts/export.py" };

  assert.deepEqual(await provider.checkAvailability(definition, { capabilityId: "ae.export" }), {
    status: "ready",
    message: null,
    details: { missing: [], action: null }
  });
  assert.equal(calls[0].definition, definition);
  assert.deepEqual(calls[0].context, { capabilityId: "ae.export" });
  assert.throws(() => provider.checkAvailability(definition), /Capability id/);
  assert.throws(() => provider.checkAvailability(definition, { capabilityId: " " }), /Capability id/);
});
