const assert = require("node:assert/strict");
const test = require("node:test");

const { ScriptExecutor } = require("./ScriptExecutor");

test("script executor selects the registered runtime provider", async () => {
  const calls = [];
  const executor = new ScriptExecutor(new Map([["python", {
    execute(definition, context) {
      calls.push({ definition, context });
      return { ok: true };
    }
  }]]));
  const definition = { runtime: "python", entry: "scripts/run.py" };
  const context = { config: {} };

  assert.deepEqual(await executor.execute(definition, context), { ok: true });
  assert.deepEqual(calls, [{ definition, context }]);
  assert.throws(() => executor.execute({ runtime: "lua" }, context), /Unsupported script runtime: lua/);
  assert.throws(() => executor.execute({}, context), /non-empty runtime/);
});
