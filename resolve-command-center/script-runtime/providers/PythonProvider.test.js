const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const { PythonProvider } = require("./PythonProvider");

async function withApp(callback) {
  const appRoot = fs.mkdtempSync(path.join(os.tmpdir(), "clackly-python-provider-"));
  fs.mkdirSync(path.join(appRoot, "scripts"));
  fs.writeFileSync(path.join(appRoot, "scripts", "run.py"), "# fixture");
  try {
    return await callback(appRoot);
  } finally {
    fs.rmSync(appRoot, { recursive: true, force: true });
  }
}

test("python provider translates the request, replays logs, and returns the result", async () => (
  withApp(async (appRoot) => {
    const calls = [];
    const logs = [];
    const provider = new PythonProvider({
      appRoot,
      runtimeManager: {
        async execute(request) {
          calls.push(request);
          return {
            ok: true,
            result: { exported: 2 },
            logs: [{ level: "info", message: "done" }]
          };
        }
      }
    });

    assert.deepEqual(await provider.execute(
      { runtime: "python", entry: "scripts/run.py" },
      {
        capabilityId: "ae.export",
        commandId: "timeline.export",
        config: { count: 2 },
        logger: { info: (message) => logs.push(message) }
      }
    ), { exported: 2 });
    assert.deepEqual(calls, [{
      runtime: "python",
      capabilityId: "ae.export",
      entry: "scripts/run.py",
      commandId: "timeline.export",
      config: { count: 2 }
    }]);
    assert.deepEqual(logs, ["done"]);
  })
));

test("python provider validates entry and execution identity before Runtime Manager", async () => (
  withApp(async (appRoot) => {
    let calls = 0;
    const provider = new PythonProvider({
      appRoot,
      runtimeManager: { execute: async () => { calls += 1; } }
    });
    assert.throws(() => provider.resolveEntry("scripts/missing.py"), /not found/);
    assert.throws(() => provider.resolveEntry(path.join(appRoot, "scripts", "run.py")), /relative path/);
    assert.throws(() => provider.resolveEntry("../run.py"), /not found under application root/);
    await assert.rejects(provider.execute({ entry: "scripts/run.py" }, { commandId: " " }), /Command id/);
    await assert.rejects(provider.execute(
      { entry: "scripts/run.py" }, { commandId: "command", capabilityId: " " }
    ), /Capability id/);
    assert.equal(calls, 0);
  })
));

test("python provider preserves Runtime fields and existing script errors", async () => (
  withApp(async (appRoot) => {
    const runtimeError = Object.assign(new Error("runtime missing"), {
      code: "RUNTIME_NOT_FOUND",
      supportStatus: "missing-runtime",
      details: { profileId: "managed" }
    });
    const runtimeProvider = new PythonProvider({
      appRoot,
      runtimeManager: { execute: async () => { throw runtimeError; } }
    });
    await assert.rejects(
      runtimeProvider.execute(
        { entry: "scripts/run.py" }, { commandId: "command", capabilityId: "feature" }
      ),
      (error) => error.code === "RUNTIME_NOT_FOUND"
        && error.supportStatus === "missing-runtime"
        && error.details.profileId === "managed"
    );

    const scriptProvider = new PythonProvider({
      appRoot,
      runtimeManager: { execute: async () => ({
        ok: false,
        error: { type: "RuntimeError", message: "boom" },
        logs: []
      }) }
    });
    await assert.rejects(
      scriptProvider.execute(
        { entry: "scripts/run.py" }, { commandId: "command", capabilityId: "feature" }
      ),
      /failed: RuntimeError: boom/
    );
  })
));

test("python provider reports host log replay failures", async () => (
  withApp(async (appRoot) => {
    const provider = new PythonProvider({
      appRoot,
      runtimeManager: { execute: async () => ({
        ok: true,
        result: null,
        logs: [{ level: "info", message: "done" }]
      }) }
    });
    await assert.rejects(provider.execute(
      { entry: "scripts/run.py" },
      {
        commandId: "command",
        capabilityId: "feature",
        logger: { info: () => { throw new Error("logger failed"); } }
      }
    ), /could not replay logs: logger failed/);
  })
));
