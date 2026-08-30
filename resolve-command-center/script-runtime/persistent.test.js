const assert = require("node:assert/strict");
const { EventEmitter } = require("node:events");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { PassThrough } = require("node:stream");
const { spawnSync } = require("node:child_process");
const test = require("node:test");

const {
  DEFAULT_MAX_LINE_BYTES,
  PROTOCOL,
  PersistentScriptLauncher
} = require("./runtime/persistent");
const { RuntimeError } = require("./runtime/errors");
const { RuntimeLauncher } = require("./runtime/launcher");

const BOOTSTRAP = path.resolve(__dirname, "runtime", "persistent_bootstrap.py");

function python() {
  const command = process.platform === "win32" ? "python" : "python3";
  const output = spawnSync(command, ["-c", "import os,sys;print(os.path.realpath(sys.executable))"], { encoding: "utf8" });
  assert.equal(output.status, 0, output.stderr);
  return fs.realpathSync(output.stdout.trim());
}

function resolution(executable = process.execPath) {
  return { source: "override", supportStatus: "overridden", executable, profile: null };
}

function fakeChild() {
  const child = new EventEmitter();
  child.stdout = new PassThrough();
  child.stderr = new PassThrough();
  child.stdin = new EventEmitter();
  child.stdin.writes = [];
  child.stdin.write = (value, encoding, callback) => {
    child.stdin.writes.push([value, encoding]);
    if (callback) callback();
    return true;
  };
  child.stdin.end = () => { child.stdin.ended = true; };
  child.killCalls = 0;
  child.kill = () => {
    child.killCalls += 1;
    queueMicrotask(() => child.emit("close", null, "SIGKILL"));
    return true;
  };
  return child;
}

function fixture(t, overrides = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "clackly-persistent-test-"));
  const children = [];
  const launcher = new PersistentScriptLauncher({
    bootstrapPath: BOOTSTRAP,
    temporaryRoot: root,
    platform: "win32",
    parentEnvironment: { SystemRoot: "C:\\Windows" },
    spawnProcess() {
      const child = fakeChild();
      children.push(child);
      return child;
    },
    ...overrides
  });
  t.after(() => {
    launcher.dispose();
    fs.rmSync(root, { recursive: true, force: true });
  });
  return { children, launcher, root };
}

function ready(child) {
  child.stdout.write(`${JSON.stringify({
    protocol: PROTOCOL,
    type: "ready",
    runtime: { version: "3.13.1", architecture: "64bit", executable: fs.realpathSync(process.execPath) }
  })}\n`);
}

function response(child, requestId, script = { ok: true, result: { ok: true }, logs: [] }) {
  child.stdout.write(`${JSON.stringify({
    requestId, ok: true,
    runtime: { version: "3.13.1", architecture: "64bit", executable: fs.realpathSync(process.execPath) },
    script
  })}\n`);
}

function request(config = {}) {
  return {
    resolution: resolution(),
    healthKey: "live-health",
    identity: "runtime-identity",
    request: {
      operation: "script-execute",
      scriptRoot: path.resolve(__dirname, ".."),
      entry: "scripts/resolve2ae_export.py",
      commandId: "timeline.exportToAfterEffects",
      config
    }
  };
}

async function disposeAndRemove(launcher, root) {
  const child = launcher.session?.child;
  const closed = child ? new Promise((resolve) => child.once("close", resolve)) : null;
  launcher.dispose();
  if (closed) await closed;
  fs.rmSync(root, { recursive: true, force: true });
}

test("persistent launcher starts one hidden protocol worker and preserves the launcher response shape", async (t) => {
  const { children, launcher } = fixture(t);
  const pending = launcher.execute(request());
  assert.equal(children.length, 1);
  ready(children[0]);
  await Promise.resolve();
  assert.equal(children[0].stdin.writes.length, 1);
  const sent = JSON.parse(children[0].stdin.writes[0][0]);
  assert.equal(sent.requestId, 1);
  assert.equal(sent.operation, "script-execute");
  assert.equal(Object.hasOwn(sent, "healthKey"), false);
  response(children[0], 1);
  const launched = await pending;
  assert.deepEqual(launched.response.script, { ok: true, result: { ok: true }, logs: [] });
  assert.equal(launched.process.durationMs >= 0, true);
  assert.equal(children[0].stdin.ended, undefined);
});

test("persistent launcher serializes FIFO requests and assigns safe increasing ids", async (t) => {
  const { children, launcher } = fixture(t);
  const first = launcher.execute(request({ sequence: 1 }));
  const second = launcher.execute(request({ sequence: 2 }));
  ready(children[0]);
  await Promise.resolve();
  assert.equal(children[0].stdin.writes.length, 1);
  assert.equal(JSON.parse(children[0].stdin.writes[0][0]).requestId, 1);
  response(children[0], 1, { ok: true, result: { sequence: 1 }, logs: [] });
  await first;
  await Promise.resolve();
  assert.equal(children[0].stdin.writes.length, 2);
  assert.equal(JSON.parse(children[0].stdin.writes[1][0]).requestId, 2);
  response(children[0], 2, { ok: true, result: { sequence: 2 }, logs: [] });
  assert.equal((await second).response.script.result.sequence, 2);
});

test("a malformed or wrong-id response kills the worker and rejects queued work without sending it", async (t) => {
  const { children, launcher } = fixture(t);
  const first = launcher.execute(request());
  const second = launcher.execute(request());
  ready(children[0]);
  await Promise.resolve();
  response(children[0], 99);
  await assert.rejects(first, (error) => error instanceof RuntimeError && error.code === "RUNTIME_PROTOCOL_INVALID");
  await assert.rejects(second, (error) => error.code === "RUNTIME_PROTOCOL_INVALID");
  assert.equal(children[0].killCalls, 1);
  assert.equal(children[0].stdin.writes.length, 1);
});

test("persistent launcher fails closed on output overflow, EOF, and queue overflow", async (t) => {
  const output = fixture(t, { maxLineBytes: 32 });
  const oversized = output.launcher.execute(request());
  ready(output.children[0]);
  await Promise.resolve();
  output.children[0].stdout.write(Buffer.alloc(33, 0x61));
  await assert.rejects(oversized, (error) => error.code === "RUNTIME_OUTPUT_LIMIT");
  assert.equal(output.children[0].killCalls, 1);

  const eof = fixture(t);
  const ended = eof.launcher.execute(request());
  ready(eof.children[0]);
  await Promise.resolve();
  eof.children[0].stdout.emit("end");
  await assert.rejects(ended, (error) => error.code === "RUNTIME_PROCESS_EXITED");
  assert.equal(eof.children[0].killCalls, 1);

  const malformed = fixture(t);
  const invalid = malformed.launcher.execute(request());
  ready(malformed.children[0]);
  await Promise.resolve();
  malformed.children[0].stdout.write(Buffer.from([0xff, 0x0a]));
  await assert.rejects(invalid, (error) => error.code === "RUNTIME_PROTOCOL_INVALID");
  assert.equal(malformed.children[0].killCalls, 1);

  const stdin = fixture(t);
  const unwritable = stdin.launcher.execute(request());
  ready(stdin.children[0]);
  await Promise.resolve();
  stdin.children[0].stdin.emit("error", new Error("fixture"));
  await assert.rejects(unwritable, (error) => error.code === "RUNTIME_STDIN_FAILED");
  assert.equal(stdin.children[0].killCalls, 1);

  const queued = fixture(t, { queueLimit: 1 });
  const first = queued.launcher.execute(request());
  ready(queued.children[0]);
  await Promise.resolve();
  const second = queued.launcher.execute(request({ queued: true }));
  await assert.rejects(
    queued.launcher.execute(request({ overflow: true })),
    (error) => error.code === "RUNTIME_LAUNCH_REQUEST_INVALID" && error.details.reason === "queue-full"
  );
  queued.launcher.dispose();
  await assert.rejects(first, (error) => error.details.reason === "disposed");
  await assert.rejects(second, (error) => error.details.reason === "disposed");
});

test("persistent launcher accepts the one-shot JSX response class and fails closed beyond its 1 MiB budget", async (t) => {
  assert.equal(DEFAULT_MAX_LINE_BYTES, 1024 * 1024);
  const accepted = fixture(t);
  const success = accepted.launcher.execute(request());
  ready(accepted.children[0]);
  await Promise.resolve();
  const jsx = "x".repeat(80 * 1024);
  response(accepted.children[0], 1, { ok: true, result: { jsx }, logs: [] });
  assert.equal((await success).response.script.result.jsx.length, jsx.length);

  const rejected = fixture(t);
  const failed = rejected.launcher.execute(request());
  ready(rejected.children[0]);
  await Promise.resolve();
  response(rejected.children[0], 1, {
    ok: true,
    result: { jsx: "x".repeat(DEFAULT_MAX_LINE_BYTES) },
    logs: []
  });
  await assert.rejects(failed, (error) => error.code === "RUNTIME_OUTPUT_LIMIT"
    && error.details.limit === DEFAULT_MAX_LINE_BYTES);
  assert.equal(rejected.children[0].killCalls, 1);
});

test("persistent launcher keeps RuntimeLauncher's Windows fatal-Python crash classification for an active request", async (t) => {
  const { children, launcher } = fixture(t);
  const pending = launcher.execute(request());
  ready(children[0]);
  await Promise.resolve();
  children[0].stderr.write("Fatal Python error: fixture native crash\n");
  children[0].emit("close", 3, null);
  await assert.rejects(pending, (error) => error.code === "RUNTIME_NATIVE_CRASH"
    && error.details.process.exitCode === 3
    && /^Fatal Python error:/m.test(error.details.process.stderr));
});

test("persistent launcher retains bounded startup stderr for the same Windows fatal-Python classification", async (t) => {
  const { children, launcher } = fixture(t);
  const pending = launcher.execute(request());
  children[0].stderr.write("Fatal Python error: fixture startup crash\n");
  children[0].emit("close", 3, null);
  await assert.rejects(pending, (error) => error.code === "RUNTIME_NATIVE_CRASH"
    && /^Fatal Python error:/m.test(error.details.process.stderr));
});

test("a spawn failure rejects before a request is sent and leaves no worker directory", async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "clackly-persistent-spawn-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const launcher = new PersistentScriptLauncher({
    bootstrapPath: BOOTSTRAP,
    temporaryRoot: root,
    spawnProcess() { throw new Error("fixture spawn failure"); }
  });
  await assert.rejects(launcher.execute(request()), (error) => error.code === "RUNTIME_SPAWN_FAILED");
  assert.deepEqual(fs.readdirSync(root), []);
});

test("a timed-out request is never retried and a later request creates exactly one replacement", async (t) => {
  const timers = [];
  const { children, launcher } = fixture(t, {
    setTimer(callback, milliseconds) {
      const timer = { callback, milliseconds, cleared: false };
      timers.push(timer);
      return timer;
    },
    clearTimer(timer) { timer.cleared = true; }
  });
  const timedOut = launcher.execute(request());
  ready(children[0]);
  await Promise.resolve();
  timers.at(-1).callback();
  await assert.rejects(timedOut, (error) => error.code === "RUNTIME_TIMEOUT");
  assert.equal(children.length, 1);

  const next = launcher.execute(request({ next: true }));
  assert.equal(children.length, 2);
  ready(children[1]);
  await new Promise((resolve) => setImmediate(resolve));
  response(children[1], 2);
  assert.equal((await next).response.script.ok, true);
  assert.equal(children.length, 2);
});

test("prewarm sends one discarded PREPARED request and the first user request is distinct", async (t) => {
  const { children, launcher } = fixture(t);
  const warming = launcher.prewarm({
    resolution: resolution(),
    bootstrapPath: BOOTSTRAP,
    scriptRoot: path.resolve(__dirname, ".."),
    entry: "scripts/resolve2ae_export.py",
    identity: "runtime-identity",
    healthKey: "prewarm-runtime-identity"
  });
  assert.equal(launcher.prewarmPromise, warming);
  ready(children[0]);
  await Promise.resolve();
  assert.equal(JSON.parse(children[0].stdin.writes[0][0]).operation, "prepare");
  children[0].stdout.write(`${JSON.stringify({ requestId: 1, ok: true, prepared: true })}\n`);
  assert.equal(await warming, true);

  const user = launcher.execute(request());
  await Promise.resolve();
  const sent = JSON.parse(children[0].stdin.writes[1][0]);
  assert.equal(sent.requestId, 2);
  assert.equal(sent.operation, "script-execute");
  response(children[0], 2);
  assert.equal((await user).worker.state, "prewarmed");
  assert.equal(children.length, 1);
});

test("a failed background prewarm is contained and a later command starts one replacement", async (t) => {
  const { children, launcher } = fixture(t);
  const warming = launcher.prewarm({
    resolution: resolution(), bootstrapPath: BOOTSTRAP,
    scriptRoot: path.resolve(__dirname, ".."), entry: "scripts/resolve2ae_export.py",
    identity: "runtime-identity", healthKey: "prewarm-runtime-identity"
  });
  ready(children[0]);
  await Promise.resolve();
  children[0].emit("close", 1, null);
  await assert.rejects(warming, (error) => error.code === "RUNTIME_PROCESS_EXITED");

  const user = launcher.execute(request());
  assert.equal(children.length, 2);
  ready(children[1]);
  await Promise.resolve();
  response(children[1], 2);
  assert.equal((await user).worker.state, "restarted");
});

test("a Resolve connection script failure settles only after retirement so the immediate next command replaces it", async (t) => {
  const { children, launcher } = fixture(t);
  const failed = launcher.execute(request());
  const overlapping = launcher.execute(request({ overlapping: true }));
  ready(children[0]);
  await Promise.resolve();
  response(children[0], 1, {
    ok: false,
    error: { type: "ResolveAdapterError", message: "Resolve unavailable" },
    logs: []
  });
  assert.equal((await failed).response.script.ok, false);
  assert.equal(children[0].killCalls, 1);
  await assert.rejects(overlapping, (error) => error.code === "RUNTIME_PROCESS_EXITED"
    && error.details.reason === "script-resolve-failure");

  // No timer turn is needed here: awaiting the first envelope observes a
  // cleared session, not the dying worker that produced it.
  const next = launcher.execute(request({ next: true }));
  assert.equal(children.length, 2);
  ready(children[1]);
  await Promise.resolve();
  response(children[1], 2);
  assert.equal((await next).response.script.ok, true);
});

test("a changed live health key replaces the idle worker before sending the next command", async (t) => {
  const { children, launcher } = fixture(t);
  const first = launcher.execute(request());
  ready(children[0]);
  await Promise.resolve();
  response(children[0], 1);
  await first;

  const changed = launcher.execute({ ...request(), healthKey: "changed-live-health" });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(children[0].killCalls, 1);
  assert.equal(children.length, 2);
  assert.equal(launcher.session?.child, children[1]);
  ready(children[1]);
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(launcher.session?.ready, true);
  assert.equal(JSON.parse(children[1].stdin.writes[0][0]).requestId, 2);
  response(children[1], 2);
  await changed;
});

test("real persistent bootstrap prepares and resets feature config and logs per request", async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "clackly-persistent-real-"));
  const scriptRoot = path.join(root, "app");
  fs.mkdirSync(path.join(scriptRoot, "scripts"), { recursive: true });
  fs.writeFileSync(path.join(scriptRoot, "scripts", "feature.py"), [
    "def execute(context):",
    "    context.logger.info(context.config['value'])",
    "    return {'value': context.config['value'], 'command': context.command_id}"
  ].join("\n"));
  const launcher = new PersistentScriptLauncher({
    bootstrapPath: BOOTSTRAP,
    temporaryRoot: root,
    platform: process.platform
  });
  t.after(async () => disposeAndRemove(launcher, root));
  const executable = python();
  const base = {
    resolution: resolution(executable), healthKey: "real-health", identity: "real-identity",
    request: { operation: "script-execute", scriptRoot, entry: "scripts/feature.py", commandId: "fixture.one", config: { value: "one" } }
  };
  assert.equal(await launcher.prewarm({
    resolution: base.resolution, bootstrapPath: BOOTSTRAP, scriptRoot, entry: "scripts/feature.py",
    identity: base.identity, healthKey: "prewarm-real"
  }), process.platform === "win32");
  const one = await launcher.execute(base);
  const two = await launcher.execute({ ...base, request: { ...base.request, commandId: "fixture.two", config: { value: "two" } } });
  assert.deepEqual(one.response.script.result, { value: "one", command: "fixture.one" });
  assert.deepEqual(two.response.script.result, { value: "two", command: "fixture.two" });
  assert.deepEqual(one.response.script.logs, [{ level: "info", message: "one" }]);
  assert.deepEqual(two.response.script.logs, [{ level: "info", message: "two" }]);
});

test("the permanent worker preserves byte-identical script results and JSX for all three export command ids", async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "clackly-persistent-parity-"));
  const scriptRoot = path.join(root, "app");
  fs.mkdirSync(path.join(scriptRoot, "scripts"), { recursive: true });
  fs.writeFileSync(path.join(scriptRoot, "scripts", "feature.py"), [
    "def execute(context):",
    "    return {",
    "        'ok': True, 'code': 'exported', 'mode': context.command_id, 'clip_count': 1,",
    "        'message': 'Sent 1 Clips',",
    "        '__clacklyDesktopLaunch': {",
    "            'type': 'after-effects-jsx', 'executable': 'safe.exe',",
    "            'args': ['-r', '$CLACKLY_JSX'], 'jsx': 'jsx:' + context.command_id",
    "        }",
    "    }"
  ].join("\n"));
  const executable = python();
  const persistent = new PersistentScriptLauncher({ bootstrapPath: BOOTSTRAP, temporaryRoot: root });
  const oneShot = new RuntimeLauncher({
    bootstrapPath: path.resolve(__dirname, "runtime", "bootstrap.py"),
    temporaryRoot: root
  });
  t.after(async () => disposeAndRemove(persistent, root));
  const commands = [
    "timeline.exportToAfterEffects", "timeline.exportAudioToAfterEffects",
    "timeline.exportVideoToAfterEffects"
  ];
  for (const commandId of commands) {
    const businessRequest = {
      operation: "script-execute", scriptRoot, entry: "scripts/feature.py", commandId, config: {}
    };
    const a = await oneShot.execute({ resolution: resolution(executable), request: businessRequest });
    const b = await persistent.execute({
      resolution: resolution(executable), healthKey: "parity-health", identity: "parity-identity",
      request: businessRequest
    });
    assert.deepEqual(b.response.script, a.response.script, commandId);
  }
});

test("a repeated safe-worker soak retains no queued request state or worker directories after disposal", async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "clackly-persistent-soak-"));
  const scriptRoot = path.join(root, "app");
  fs.mkdirSync(path.join(scriptRoot, "scripts"), { recursive: true });
  fs.writeFileSync(path.join(scriptRoot, "scripts", "feature.py"), [
    "def execute(context):",
    "    return {'value': context.config['value']}"
  ].join("\n"));
  const persistent = new PersistentScriptLauncher({ bootstrapPath: BOOTSTRAP, temporaryRoot: root });
  t.after(async () => disposeAndRemove(persistent, root));
  const executable = python();
  for (let value = 0; value < 64; value += 1) {
    const result = await persistent.execute({
      resolution: resolution(executable), healthKey: "soak-health", identity: "soak-identity",
      request: {
        operation: "script-execute", scriptRoot, entry: "scripts/feature.py",
        commandId: "safe.soak", config: { value }
      }
    });
    assert.deepEqual(result.response.script.result, { value });
  }
  assert.equal(persistent.queue.length, 0);
  assert.equal(persistent.active, null);
  const closed = new Promise((resolve) => persistent.session.child.once("close", resolve));
  persistent.dispose();
  await closed;
  assert.deepEqual(
    fs.readdirSync(root).filter((name) => name.startsWith("clackly-persistent-runtime-")),
    []
  );
});
