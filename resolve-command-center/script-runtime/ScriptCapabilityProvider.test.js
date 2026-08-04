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
      }
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
