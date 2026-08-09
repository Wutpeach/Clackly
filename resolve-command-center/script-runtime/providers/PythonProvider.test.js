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
        },
        checkAvailability: async () => ({ ok: true })
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
      runtimeManager: {
        execute: async () => { calls += 1; },
        checkAvailability: async () => ({ ok: true })
      }
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
      runtimeManager: {
        execute: async () => { throw runtimeError; },
        checkAvailability: async () => ({ ok: true })
      }
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
      runtimeManager: {
        execute: async () => ({
          ok: false,
          error: { type: "RuntimeError", message: "boom" },
          logs: []
        }),
        checkAvailability: async () => ({ ok: true })
      }
    });
    await assert.rejects(
      scriptProvider.execute(
        { entry: "scripts/run.py" }, { commandId: "command", capabilityId: "feature" }
      ),
      /failed: RuntimeError: boom/
    );
  })
));

test("python provider reports ready availability through the runtime manager", async () => (
  withApp(async (appRoot) => {
    const calls = [];
    const provider = new PythonProvider({
      appRoot,
      runtimeManager: {
        execute: async () => ({ ok: true, result: null, logs: [] }),
        async checkAvailability(request) {
          calls.push(request);
          return { ok: true, supportStatus: "machine-verified", effectiveStatus: "ready" };
        }
      }
    });

    assert.deepEqual(await provider.checkAvailability(
      { runtime: "python", entry: "scripts/run.py" },
      { capabilityId: "ae.export" }
    ), { status: "ready", message: null, details: { missing: [], action: null } });
    assert.deepEqual(calls, [{ runtime: "python", capabilityId: "ae.export" }]);
  })
));

test("python provider maps runtime evidence to stable Feature Status availability", async () => (
  withApp(async (appRoot) => {
    const mappings = [
      ["RUNTIME_NOT_FOUND", "missing-dependency", ["python-runtime"]],
      ["RESOLVE_MODULE_NOT_FOUND", "missing-dependency", ["resolve-scripting"]],
      ["RESOLVE_LIBRARY_NOT_FOUND", "missing-dependency", ["resolve-scripting"]],
      ["RUNTIME_UNSUPPORTED", "unavailable", []],
      ["RUNTIME_ARCHITECTURE_UNSUPPORTED", "unavailable", []],
      ["RUNTIME_VERSION_MISMATCH", "unavailable", []],
      ["RESOLVE_NOT_RUNNING", "unavailable", []]
    ];
    for (const [code, status, missing] of mappings) {
      const provider = new PythonProvider({
        appRoot,
        runtimeManager: {
          execute: async () => ({}),
          checkAvailability: async () => {
            throw Object.assign(new Error(code), { code });
          }
        }
      });
      const result = await provider.checkAvailability(
        { runtime: "python", entry: "scripts/run.py" },
        { capabilityId: "ae.export" }
      );
      assert.equal(result.status, status);
      assert.deepEqual(result.details.missing, missing);
      assert.equal(result.details.action, null);
      assert.equal(typeof result.message, "string");
    }
  })
));

test("python provider reports a missing script entry and rethrows unexpected runtime errors", async () => (
  withApp(async (appRoot) => {
    let probed = false;
    const entryProvider = new PythonProvider({
      appRoot,
      runtimeManager: {
        execute: async () => ({}),
        checkAvailability: async () => { probed = true; return { ok: true }; }
      }
    });
    assert.deepEqual(await entryProvider.checkAvailability(
      { runtime: "python", entry: "scripts/missing.py" },
      { capabilityId: "ae.export" }
    ), {
      status: "missing-dependency",
      message: "Script entry is not available",
      details: { missing: ["script-entry"], action: null }
    });
    assert.equal(probed, false);

    const failing = new PythonProvider({
      appRoot,
      runtimeManager: {
        execute: async () => ({}),
        checkAvailability: async () => {
          throw Object.assign(new Error("spawn failed"), { code: "RUNTIME_SPAWN_FAILED" });
        }
      }
    });
    await assert.rejects(
      failing.checkAvailability({ runtime: "python", entry: "scripts/run.py" }, { capabilityId: "ae.export" }),
      (error) => error.code === "RUNTIME_SPAWN_FAILED"
    );

    const invalid = new PythonProvider({
      appRoot,
      runtimeManager: {
        execute: async () => ({}),
        checkAvailability: async () => ({ ok: true })
      }
    });
    await assert.rejects(
      invalid.checkAvailability({ runtime: "python", entry: "scripts/run.py" }, { capabilityId: " " }),
      /Capability id/
    );
  })
));

test("python provider requires a runtime manager with the full execute and availability contract", async () => (
  withApp(async (appRoot) => {
    assert.throws(
      () => new PythonProvider({ appRoot, runtimeManager: { execute() {} } }),
      /requires a Runtime Manager/
    );
    assert.throws(
      () => new PythonProvider({ appRoot, runtimeManager: { checkAvailability() {} } }),
      /requires a Runtime Manager/
    );
  })
));

test("python provider rethrows unexpected filesystem errors during availability", async () => (
  withApp(async (appRoot) => {
    const permissionError = Object.assign(new Error("EACCES: permission denied"), { code: "EACCES" });
    const provider = new PythonProvider({
      appRoot,
      runtimeManager: {
        execute: async () => ({}),
        checkAvailability: async () => ({ ok: true })
      },
      fileSystem: {
        realpathSync: fs.realpathSync,
        existsSync: () => true,
        statSync: () => { throw permissionError; }
      }
    });

    await assert.rejects(
      provider.checkAvailability({ runtime: "python", entry: "scripts/run.py" }, { capabilityId: "ae.export" }),
      (error) => error === permissionError
    );
  })
));

test("python provider reports host log replay failures", async () => (
  withApp(async (appRoot) => {
    const provider = new PythonProvider({
      appRoot,
      runtimeManager: {
        execute: async () => ({
          ok: true,
          result: null,
          logs: [{ level: "info", message: "done" }]
        }),
        checkAvailability: async () => ({ ok: true })
      }
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
