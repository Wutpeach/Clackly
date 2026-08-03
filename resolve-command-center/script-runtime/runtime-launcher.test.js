const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const { EventEmitter } = require("node:events");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { PassThrough } = require("node:stream");
const test = require("node:test");
const { createRuntimeEnvironment } = require("./runtime/environment");
const { RuntimeError } = require("./runtime/errors");
const { RuntimeLauncher } = require("./runtime/launcher");

const BOOTSTRAP = path.resolve(__dirname, "runtime", "bootstrap.py");
const WORKER = path.resolve(__dirname, "runtime", "fixtures", "test_worker.py");

function temporaryRoot(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "clackly-launcher-test-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  return root;
}

function resolution(executable = process.execPath) {
  return { source: "override", supportStatus: "overridden", executable, profile: null };
}

function successEnvelope(extra = {}) {
  return {
    ok: true,
    runtime: {
      version: "3.13.1",
      architecture: "64bit",
      executable: fs.realpathSync(process.execPath),
      ...extra
    }
  };
}

function fakeChild({ stdout = "", stderr = "", code = 0, signal = null, stdinError = null } = {}) {
  const child = new EventEmitter();
  child.stdout = new PassThrough();
  child.stderr = new PassThrough();
  child.stdin = new EventEmitter();
  child.stdin.end = (request) => {
    child.request = request;
    queueMicrotask(() => {
      if (stdinError) child.stdin.emit("error", stdinError);
      if (stdout) child.stdout.write(stdout);
      if (stderr) child.stderr.write(stderr);
      child.emit("close", code, signal);
    });
  };
  child.killCalls = [];
  child.kill = (killSignal) => {
    child.killCalls.push(killSignal);
    queueMicrotask(() => child.emit("close", null, killSignal));
    return true;
  };
  return child;
}

async function expectRuntimeError(promise, code) {
  let error;
  try {
    await promise;
  } catch (caught) {
    error = caught;
  }
  assert.ok(error instanceof RuntimeError, `Expected RuntimeError, received ${error}`);
  assert.equal(error.code, code);
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

test("Runtime Environment emits only the platform allowlist", () => {
  const parentEnvironment = {
    systemroot: "C:\\Windows",
    windir: "C:\\WINDOWS",
    PATH: "forbidden",
    PYTHONHOME: "forbidden",
    PYTHONPATH: "forbidden",
    PYTHONUSERBASE: "forbidden",
    PYTHONSTARTUP: "forbidden",
    VIRTUAL_ENV: "forbidden",
    CONDA_PREFIX: "forbidden",
    CONDA_DEFAULT_ENV: "forbidden",
    CONDA_PYTHON_EXE: "forbidden",
    UV_PYTHON: "forbidden",
    UNRELATED: "forbidden"
  };
  const windowsEnvironment = createRuntimeEnvironment({
    parentEnvironment,
    temporaryDirectory: "C:\\Temp\\run",
    platform: "win32"
  });
  assert.deepEqual(windowsEnvironment, {
    SystemRoot: "C:\\Windows",
    WINDIR: "C:\\WINDOWS",
    TEMP: "C:\\Temp\\run",
    TMP: "C:\\Temp\\run"
  });
  assert.deepEqual(createRuntimeEnvironment({
    parentEnvironment,
    temporaryDirectory: "/tmp/run",
    platform: "linux"
  }), { TMPDIR: "/tmp/run" });
  assert.notEqual(windowsEnvironment, createRuntimeEnvironment({
    parentEnvironment,
    temporaryDirectory: "C:\\Temp\\run",
    platform: "win32"
  }));
  assert.equal(parentEnvironment.PATH, "forbidden");
  assert.throws(
    () => createRuntimeEnvironment({ parentEnvironment: {}, temporaryDirectory: "C:\\Temp", platform: "win32" }),
    /SystemRoot/
  );
});

test("Launcher validates resolution, files, request, and limits before spawning", async (t) => {
  const root = temporaryRoot(t);
  let spawned = false;
  const launcher = new RuntimeLauncher({
    temporaryRoot: root,
    spawnProcess() { spawned = true; }
  });

  await expectRuntimeError(launcher.execute({ resolution: null, request: {} }), "RUNTIME_LAUNCH_REQUEST_INVALID");
  await expectRuntimeError(launcher.execute(null), "RUNTIME_LAUNCH_REQUEST_INVALID");
  await expectRuntimeError(
    launcher.execute({ resolution: resolution("runtime"), request: {} }),
    "RUNTIME_EXECUTABLE_INVALID"
  );
  await expectRuntimeError(
    launcher.execute({ resolution: resolution(root), request: {} }),
    "RUNTIME_EXECUTABLE_INVALID"
  );
  await expectRuntimeError(
    new RuntimeLauncher({ bootstrapPath: path.join(root, "missing.py"), temporaryRoot: root })
      .execute({ resolution: resolution(), request: {} }),
    "RUNTIME_LAUNCH_REQUEST_INVALID"
  );
  const circular = {};
  circular.self = circular;
  await expectRuntimeError(
    launcher.execute({ resolution: resolution(), request: circular }),
    "RUNTIME_LAUNCH_REQUEST_INVALID"
  );
  assert.equal(spawned, false);
  assert.deepEqual(fs.readdirSync(root), []);
  for (const limits of [{ timeoutMs: 0 }, { maxStdoutBytes: 1.5 }, { maxStderrBytes: Infinity }]) {
    assert.throws(
      () => new RuntimeLauncher(limits),
      (error) => error.code === "RUNTIME_LAUNCH_REQUEST_INVALID"
    );
  }

  let executableStats = 0;
  const executable = fs.realpathSync(process.execPath);
  const fileSystem = {
    ...fs,
    statSync(candidate) {
      if (candidate === executable && ++executableStats === 2) return { isFile: () => false };
      return fs.statSync(candidate);
    }
  };
  const changed = new RuntimeLauncher({ temporaryRoot: root, fileSystem, spawnProcess() { spawned = true; } });
  await expectRuntimeError(
    changed.execute({ resolution: resolution(executable), request: {} }),
    "RUNTIME_EXECUTABLE_INVALID"
  );
  assert.equal(executableStats, 2);
  assert.deepEqual(fs.readdirSync(root), []);
});

test("Launcher uses the canonical executable, fixed argv/options, and stdin-only request", async (t) => {
  const root = temporaryRoot(t);
  const response = successEnvelope();
  const child = fakeChild({ stdout: JSON.stringify(response) });
  const calls = [];
  const request = { operation: "runtime-info", nested: { dangerous: "value with spaces; & symbols" } };
  const launcher = new RuntimeLauncher({
    bootstrapPath: BOOTSTRAP,
    temporaryRoot: root,
    platform: "win32",
    parentEnvironment: { systemroot: "C:\\Windows", PATH: "forbidden", PYTHONHOME: "forbidden" },
    spawnProcess(...args) {
      calls.push(args);
      return child;
    }
  });

  const result = await launcher.execute({ resolution: resolution(), request });
  assert.deepEqual(result.response, response);
  assert.equal(result.process.exitCode, 0);
  assert.equal(result.process.termination, "exit");
  assert.deepEqual(JSON.parse(child.request), request);
  assert.equal(calls[0][0], fs.realpathSync(process.execPath));
  assert.deepEqual(calls[0][1], ["-I", "-u", "-X", "faulthandler", fs.realpathSync(BOOTSTRAP)]);
  assert.deepEqual(calls[0][2].env, {
    SystemRoot: "C:\\Windows",
    WINDIR: "C:\\Windows",
    TEMP: calls[0][2].cwd,
    TMP: calls[0][2].cwd
  });
  assert.deepEqual(calls[0][2].stdio, ["pipe", "pipe", "pipe"]);
  assert.equal(calls[0][2].shell, false);
  assert.equal(calls[0][2].windowsHide, true);
  assert.equal(calls[0][1].join(" ").includes(request.nested.dangerous), false);
  assert.equal(fs.existsSync(calls[0][2].cwd), false);
});

test("Launcher distinguishes spawn, stdin, ordinary exit, signal, and native status", async (t) => {
  const root = temporaryRoot(t);
  const make = (spawnProcess, platform = process.platform) => new RuntimeLauncher({
    bootstrapPath: BOOTSTRAP,
    temporaryRoot: root,
    platform,
    parentEnvironment: { SystemRoot: "C:\\Windows" },
    spawnProcess
  });

  await expectRuntimeError(
    make(() => { throw Object.assign(new Error("missing"), { code: "ENOENT" }); })
      .execute({ resolution: resolution(), request: {} }),
    "RUNTIME_SPAWN_FAILED"
  );
  const asyncSpawn = fakeChild();
  asyncSpawn.stdin.end = () => queueMicrotask(() => asyncSpawn.emit("error", new Error("missing")));
  const asyncPromise = make(() => asyncSpawn).execute({ resolution: resolution(), request: {} });
  let asyncSettled = false;
  asyncPromise.finally(() => { asyncSettled = true; }).catch(() => {});
  await new Promise((resolveTick) => setImmediate(resolveTick));
  assert.equal(asyncSettled, false);
  assert.equal(fs.readdirSync(root).length, 1);
  asyncSpawn.emit("close", -2, null);
  await expectRuntimeError(asyncPromise, "RUNTIME_SPAWN_FAILED");
  assert.deepEqual(fs.readdirSync(root), []);
  await expectRuntimeError(
    make(() => fakeChild({
      stdout: JSON.stringify(successEnvelope()),
      stdinError: new Error("broken pipe")
    })).execute({ resolution: resolution(), request: {} }),
    "RUNTIME_STDIN_FAILED"
  );
  await expectRuntimeError(
    make(() => fakeChild({ code: null, stdinError: new Error("broken pipe") }))
      .execute({ resolution: resolution(), request: {} }),
    "RUNTIME_STDIN_FAILED"
  );
  await expectRuntimeError(
    make(() => fakeChild({ code: 5, stdinError: new Error("broken pipe") }))
      .execute({ resolution: resolution(), request: {} }),
    "RUNTIME_PROCESS_EXITED"
  );
  await expectRuntimeError(
    make(() => fakeChild({ code: null, signal: "SIGABRT" }), "linux")
      .execute({ resolution: resolution(), request: {} }),
    "RUNTIME_NATIVE_CRASH"
  );
  const native = await expectRuntimeError(
    make(() => fakeChild({ code: 0xC0000409 }), "win32")
      .execute({ resolution: resolution(), request: {} }),
    "RUNTIME_NATIVE_CRASH"
  );
  assert.deepEqual(native.details.process.nativeCrash, { exitCodeHex: "0xC0000409" });
  await expectRuntimeError(
    make(() => fakeChild({ code: 0xC0000409 }), "linux")
      .execute({ resolution: resolution(), request: {} }),
    "RUNTIME_PROCESS_EXITED"
  );
  await expectRuntimeError(
    make(() => fakeChild({ code: 1, stderr: "Fatal Python error: application text" }))
      .execute({ resolution: resolution(), request: {} }),
    "RUNTIME_PROCESS_EXITED"
  );
  assert.deepEqual(fs.readdirSync(root), []);
});

test("Launcher rejects malformed runtime-info success envelopes", async (t) => {
  const root = temporaryRoot(t);
  const execute = (runtime) => new RuntimeLauncher({
    bootstrapPath: BOOTSTRAP,
    temporaryRoot: root,
    spawnProcess: () => fakeChild({ stdout: JSON.stringify({ ok: true, runtime }) })
  }).execute({ resolution: resolution(), request: {} });

  for (const runtime of [
    null,
    { version: "3.13", architecture: "64bit", executable: process.execPath },
    { version: "3.13.1", architecture: "32bit", executable: process.execPath },
    { version: "3.13.1", architecture: "64bit", executable: "python" }
  ]) {
    await expectRuntimeError(execute(runtime), "RUNTIME_PROTOCOL_INVALID");
  }
  assert.deepEqual(fs.readdirSync(root), []);
});

test("Launcher bounds output, kills once, waits for close, and cleans before rejection", async (t) => {
  const root = temporaryRoot(t);
  const child = fakeChild();
  const oversized = Buffer.alloc(12, "a");
  let close;
  child.stdin.end = () => queueMicrotask(() => {
    child.stdout.write(oversized);
    oversized.fill("b");
  });
  child.kill = (signal) => {
    child.killCalls.push(signal);
    return true;
  };
  const promise = new RuntimeLauncher({
    bootstrapPath: BOOTSTRAP,
    temporaryRoot: root,
    maxStdoutBytes: 8,
    spawnProcess: () => child
  }).execute({ resolution: resolution(), request: {} });
  promise.then(() => { close = "resolved"; }, () => { close = "rejected"; });

  await new Promise((resolveTick) => setImmediate(resolveTick));
  assert.equal(close, undefined);
  assert.deepEqual(child.killCalls, ["SIGKILL"]);
  const cwd = fs.readdirSync(root)[0];
  assert.ok(cwd);
  child.emit("close", null, "SIGKILL");
  const error = await expectRuntimeError(promise, "RUNTIME_OUTPUT_LIMIT");
  assert.equal(error.details.stream, "stdout");
  assert.equal(error.details.process.stdout, "aaaaaaaa");
  assert.equal(error.details.process.stdoutBytes, 12);
  assert.deepEqual(fs.readdirSync(root), []);

  const timeoutChild = fakeChild();
  timeoutChild.stdin.end = () => {};
  let killed;
  const killedPromise = new Promise((resolveKilled) => { killed = resolveKilled; });
  timeoutChild.kill = (signal) => {
    timeoutChild.killCalls.push(signal);
    killed();
    return true;
  };
  const timeoutPromise = new RuntimeLauncher({
    bootstrapPath: BOOTSTRAP,
    temporaryRoot: root,
    timeoutMs: 10,
    spawnProcess: () => timeoutChild
  }).execute({ resolution: resolution(), request: {} });
  let timeoutSettled = false;
  timeoutPromise.finally(() => { timeoutSettled = true; }).catch(() => {});
  await killedPromise;
  assert.equal(timeoutSettled, false);
  assert.deepEqual(timeoutChild.killCalls, ["SIGKILL"]);
  assert.equal(fs.readdirSync(root).length, 1);
  timeoutChild.emit("close", null, "SIGKILL");
  await expectRuntimeError(timeoutPromise, "RUNTIME_TIMEOUT");
  assert.deepEqual(fs.readdirSync(root), []);
});

test("Launcher reports cleanup alone and appends cleanup diagnostics to a primary failure", async (t) => {
  const root = temporaryRoot(t);
  const fileSystem = {
    ...fs,
    rmSync() { throw Object.assign(new Error("cleanup denied"), { code: "EACCES" }); }
  };
  const make = (stdout) => new RuntimeLauncher({
    bootstrapPath: BOOTSTRAP,
    temporaryRoot: root,
    fileSystem,
    spawnProcess: () => fakeChild({ stdout })
  });

  const cleanup = await expectRuntimeError(
    make(JSON.stringify(successEnvelope())).execute({ resolution: resolution(), request: {} }),
    "RUNTIME_TEMP_CLEANUP_FAILED"
  );
  assert.equal(cleanup.details.cleanupError.code, "EACCES");
  const protocol = await expectRuntimeError(
    make("bad-json").execute({ resolution: resolution(), request: {} }),
    "RUNTIME_PROTOCOL_INVALID"
  );
  assert.equal(protocol.details.cleanupError.code, "EACCES");
});

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
  await expectRuntimeError(execute("nonzero"), "RUNTIME_PROCESS_EXITED");
  await expectRuntimeError(execute("empty"), "RUNTIME_PROTOCOL_EMPTY");
  await expectRuntimeError(execute("invalid-json"), "RUNTIME_PROTOCOL_INVALID");
  await expectRuntimeError(execute("invalid-envelope"), "RUNTIME_PROTOCOL_INVALID");
  await expectRuntimeError(execute("stdout-flood", { maxStdoutBytes: 1024 }), "RUNTIME_OUTPUT_LIMIT");
  await expectRuntimeError(execute("stderr-flood", { maxStderrBytes: 1024 }), "RUNTIME_OUTPUT_LIMIT");
  await expectRuntimeError(execute("wait", { timeoutMs: 50 }), "RUNTIME_TIMEOUT");
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
