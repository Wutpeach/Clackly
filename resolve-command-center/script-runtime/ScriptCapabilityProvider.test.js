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

  assert.deepEqual(await provider.execute(definition, { config: { get: () => values } }), values);
  assert.notEqual(calls[0].context.config, values);
  assert.equal(calls[0].context.logger, logger);
  assert.throws(() => provider.execute(definition), /scoped configuration/);
});
