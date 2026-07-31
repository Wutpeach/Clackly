const assert = require("node:assert/strict");
const { EventEmitter } = require("node:events");
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

function fakeProcess({ stdout = "", stderr = "", code = 0, error } = {}) {
  const child = new EventEmitter();
  child.stdout = new EventEmitter();
  child.stderr = new EventEmitter();
  child.stdout.setEncoding = () => {};
  child.stderr.setEncoding = () => {};
  child.stdin = {
    on() {},
    end(request) {
      child.request = request;
      queueMicrotask(() => {
        if (error) child.emit("error", error);
        if (stdout) child.stdout.emit("data", stdout);
        if (stderr) child.stderr.emit("data", stderr);
        child.emit("close", code);
      });
    }
  };
  return child;
}

test("python provider sends config, replays logs, and returns the result", async () => (
  withApp(async (appRoot) => {
    const child = fakeProcess({ stdout: JSON.stringify({
      ok: true,
      result: { exported: 2 },
      logs: [{ level: "info", message: "done" }]
    }) });
    const spawnCalls = [];
    const logs = [];
    const provider = new PythonProvider({
      appRoot,
      pythonExecutable: "python-test",
      spawnProcess(...args) {
        spawnCalls.push(args);
        return child;
      }
    });

    assert.deepEqual(await provider.execute(
      { runtime: "python", entry: "scripts/run.py" },
      { config: { count: 2 }, logger: { info: (message) => logs.push(message) } }
    ), { exported: 2 });
    assert.deepEqual(JSON.parse(child.request), { config: { count: 2 } });
    assert.equal(spawnCalls[0][2].shell, false);
    assert.deepEqual(logs, ["done"]);
  })
));

test("python provider does not treat the bridge Python command as one executable", () => (
  withApp((appRoot) => {
    const previous = process.env.RESOLVE_COMMAND_CENTER_PYTHON_CMD;
    process.env.RESOLVE_COMMAND_CENTER_PYTHON_CMD = "py -3";
    try {
      assert.equal(new PythonProvider({ appRoot }).pythonExecutable, "python");
    } finally {
      if (previous === undefined) delete process.env.RESOLVE_COMMAND_CENTER_PYTHON_CMD;
      else process.env.RESOLVE_COMMAND_CENTER_PYTHON_CMD = previous;
    }
  })
));

test("python provider rejects missing, absolute, and escaping entries", () => withApp((appRoot) => {
  const provider = new PythonProvider({ appRoot });
  assert.throws(() => provider.resolveEntry("scripts/missing.py"), /not found/);
  assert.throws(() => provider.resolveEntry(path.join(appRoot, "scripts", "run.py")), /relative path/);
  assert.throws(() => provider.resolveEntry("../run.py"), /not found under application root/);
}));

test("python provider surfaces spawn, exit, protocol, and script errors", async () => (
  withApp(async (appRoot) => {
    const cases = [
      [{ error: new Error("missing executable") }, /failed to start: missing executable/],
      [{ code: 2, stderr: "crashed" }, /exited with code 2: crashed/],
      [{ stdout: "not-json" }, /invalid protocol output/],
      [{ stdout: JSON.stringify({ ok: true, logs: "bad" }) }, /invalid protocol envelope/],
      [{ stdout: JSON.stringify({
        ok: true,
        result: null,
        logs: [{ level: "trace", message: "bad" }]
      }) }, /invalid log record/],
      [{ stdout: JSON.stringify({ ok: true, logs: [] }) }, /invalid success envelope/],
      [{ stdout: JSON.stringify({
        ok: false,
        error: { type: "RuntimeError", message: "boom" },
        logs: []
      }) }, /failed: RuntimeError: boom/]
    ];

    for (const [processResult, expected] of cases) {
      const provider = new PythonProvider({
        appRoot,
        spawnProcess: () => fakeProcess(processResult)
      });
      await assert.rejects(
        provider.execute({ runtime: "python", entry: "scripts/run.py" }),
        expected
      );
    }
  })
));
