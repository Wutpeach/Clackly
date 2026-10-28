const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const { RuntimeError } = require("./runtime/errors");
const { RuntimeLauncher } = require("./runtime/launcher");

// Real interpreter startup belongs in the serial subprocess group, separate
// from *.test.js logic suites. Keep the fixture deadlines and error contracts.
const WORKER = path.resolve(__dirname, "runtime", "fixtures", "test_worker.py");

function temporaryRoot(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "clackly-launcher-test-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  return root;
}

function resolution(executable) {
  return { source: "override", supportStatus: "overridden", executable, profile: null };
}

async function expectRuntimeError(promise, code) {
  let error;
  try {
    await promise;
  } catch (caught) {
    error = caught;
  }
  assert.ok(error instanceof RuntimeError, `Expected RuntimeError, received ${error}`);
  assert.equal(error.code, code, JSON.stringify(error.details));
  return error;
}

let pythonExecutable;
function realPython() {
  if (pythonExecutable) return pythonExecutable;
  const command = process.platform === "win32" ? "python" : "python3";
  const found = spawnSync(command, ["-c", "import os,sys;sys.stdout.write(os.path.realpath(sys.executable))"], {
    encoding: "utf8",
    shell: false,
    windowsHide: true
  });
  assert.equal(found.status, 0, found.stderr);
  pythonExecutable = fs.realpathSync(found.stdout);
  assert.equal(path.isAbsolute(pythonExecutable), true);
  return pythonExecutable;
}

test("real worker covers success, Bootstrap, exit, protocol, timeout, and stream failures", async (t) => {
  const root = temporaryRoot(t);
  const executable = realPython();
  const execute = (mode, overrides = {}) => new RuntimeLauncher({
    bootstrapPath: WORKER,
    temporaryRoot: root,
    timeoutMs: 1000,
    ...overrides
  }).execute({ resolution: resolution(executable), request: { mode, value: { nested: true } } });

  const success = await execute("success");
  assert.deepEqual(success.response.runtime.value, { nested: true });
  await expectRuntimeError(execute("python-exception"), "RUNTIME_BOOTSTRAP_FAILED");
  const nonzero = await expectRuntimeError(execute("nonzero"), "RUNTIME_PROCESS_EXITED");
  assert.equal(nonzero.details.process.exitCode, 7);
  assert.equal(nonzero.details.process.stderr, "worker exited");
  assert.equal(nonzero.details.process.termination, "exit");
  await expectRuntimeError(execute("empty"), "RUNTIME_PROTOCOL_EMPTY");
  await expectRuntimeError(execute("invalid-json"), "RUNTIME_PROTOCOL_INVALID");
  await expectRuntimeError(execute("invalid-envelope"), "RUNTIME_PROTOCOL_INVALID");
  await expectRuntimeError(execute("stdout-flood", { maxStdoutBytes: 1024 }), "RUNTIME_OUTPUT_LIMIT");
  await expectRuntimeError(execute("stderr-flood", { maxStderrBytes: 1024 }), "RUNTIME_OUTPUT_LIMIT");
  const timeout = await expectRuntimeError(execute("wait", { timeoutMs: 50 }), "RUNTIME_TIMEOUT");
  assert.equal(timeout.details.process.termination, "timeout");
  assert.deepEqual(fs.readdirSync(root), []);
});

test("native worker abort does not terminate the Node parent", async (t) => {
  const root = temporaryRoot(t);
  const launcher = new RuntimeLauncher({
    bootstrapPath: WORKER,
    temporaryRoot: root,
    timeoutMs: 2000
  });
  const aborted = await expectRuntimeError(
    launcher.execute({ resolution: resolution(realPython()), request: { mode: "abort" } }),
    "RUNTIME_NATIVE_CRASH"
  );
  assert.ok(aborted.details.process.signal
    || aborted.details.process.nativeCrash
    || (process.platform === "win32"
      && /^Fatal Python error:/m.test(aborted.details.process.stderr)));

  const after = await launcher.execute({
    resolution: resolution(realPython()),
    request: { mode: "success", value: "parent-alive" }
  });
  assert.equal(after.response.runtime.value, "parent-alive");
  assert.deepEqual(fs.readdirSync(root), []);
});
