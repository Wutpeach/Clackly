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

test("script executor reports availability for registered and unknown runtimes", async () => {
  const calls = [];
  const executor = new ScriptExecutor(new Map([["python", {
    execute() {},
    async checkAvailability(definition, context) {
      calls.push({ definition, context });
      return { status: "ready", message: null, details: { missing: [], action: null } };
    }
  }]]));
  const definition = { runtime: "python", entry: "scripts/run.py" };
  const context = { capabilityId: "ae.export" };

  assert.deepEqual(await executor.checkAvailability(definition, context), {
    status: "ready",
    message: null,
    details: { missing: [], action: null }
  });
  assert.deepEqual(calls, [{ definition, context }]);

  assert.deepEqual(await executor.checkAvailability({ runtime: "lua" }, context), {
    status: "unavailable",
    message: "Unsupported script runtime: lua",
    details: { missing: [], action: null }
  });
  assert.throws(() => executor.checkAvailability({}, context), /non-empty runtime/);
});

test("script executor distinguishes unknown runtimes from providers without availability", async () => {
  const provider = { execute: () => ({ ok: true }) };
  const executor = new ScriptExecutor(new Map([["python", provider]]));

  assert.deepEqual(await executor.checkAvailability({ runtime: "python" }, {}), {
    status: "unavailable",
    message: "Runtime availability is unavailable: python",
    details: { missing: [], action: null }
  });
  assert.deepEqual(await executor.checkAvailability({ runtime: "lua" }, {}), {
    status: "unavailable",
    message: "Unsupported script runtime: lua",
    details: { missing: [], action: null }
  });
  // Execute still works with a provider that has no availability.
  assert.deepEqual(await executor.execute({ runtime: "python", entry: "scripts/run.py" }, {}), { ok: true });
});
