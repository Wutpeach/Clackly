const assert = require("node:assert/strict");
const { EventEmitter } = require("node:events");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const { AfterEffectsLauncher, JSX_ARGUMENT, PLAN_TYPE } = require("./afterEffectsLaunch");

function fixture(t, overrides = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "clackly-ae-launch-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const executable = path.join(root, "Adobe", "AfterFX.exe");
  fs.mkdirSync(path.dirname(executable), { recursive: true });
  fs.writeFileSync(executable, "AfterFX");
  const calls = [];
  const hostEnvironment = { SystemRoot: "C:\\Windows", APPDATA: "C:\\Users\\host\\AppData" };
  const launcher = new AfterEffectsLauncher({
    hostEnvironment,
    platform: "win32",
    temporaryRoot: root,
    isRunning: () => true,
    spawnProcess(...args) {
      calls.push(args);
      const child = new EventEmitter();
      child.unref = () => { child.unrefCalled = true; };
      queueMicrotask(() => child.emit("spawn"));
      return child;
    },
    ...overrides
  });
  const plan = {
    type: PLAN_TYPE,
    executable,
    args: ["-r", JSX_ARGUMENT],
    jsx: "app.project.items.addComp('test', 1, 1, 1, 1, 24);"
  };
  return { calls, executable, hostEnvironment, launcher, plan, root };
}

test("host launches validated JSX once with shell false and the desktop environment", async (t) => {
  const { calls, executable, hostEnvironment, launcher, plan, root } = fixture(t);

  assert.deepEqual(await launcher.execute(plan, { configuredExecutable: executable }), { mode: "running" });
  assert.equal(calls.length, 1);
  assert.equal(calls[0][0], fs.realpathSync(executable));
  assert.equal(calls[0][1][0], "-r");
  assert.equal(path.dirname(calls[0][1][1]), fs.realpathSync(root));
  assert.equal(fs.readFileSync(calls[0][1][1], "utf8"), plan.jsx);
  assert.equal(calls[0][2].shell, false);
  assert.equal(calls[0][2].env, hostEnvironment);
  assert.equal(calls[0][2].cwd, path.dirname(fs.realpathSync(executable)));
});

test("cold launch writes the existing startup bootstrap and starts AE once", async (t) => {
  const base = fixture(t, { isRunning: () => false });

  assert.deepEqual(await base.launcher.execute(base.plan, {
    configuredExecutable: base.executable
  }), { mode: "cold" });
  assert.equal(base.calls.length, 1);
  assert.deepEqual(base.calls[0][1], []);
  const bootstrap = path.join(path.dirname(base.executable), "Scripts", "Startup", "_resolve2ae_bootstrap.jsx");
  assert.match(fs.readFileSync(bootstrap, "utf8"), /scheduleTask/);
  assert.match(fs.readFileSync(bootstrap, "utf8"), /clackly-ae-.*\.jsx/);
});

test("cold launch does not overwrite an existing bootstrap", async (t) => {
  const base = fixture(t, { isRunning: () => false });
  const bootstrap = path.join(path.dirname(base.executable), "Scripts", "Startup", "_resolve2ae_bootstrap.jsx");
  fs.mkdirSync(path.dirname(bootstrap), { recursive: true });
  fs.writeFileSync(bootstrap, "existing");

  await assert.rejects(
    base.launcher.execute(base.plan, { configuredExecutable: base.executable }),
    (error) => error.code === "AFTER_EFFECTS_LAUNCH_FAILED"
      && error.details.causeCode === "EEXIST"
      && !error.message.includes("EEXIST")
  );
  assert.equal(fs.readFileSync(bootstrap, "utf8"), "existing");
  assert.equal(base.calls.length, 0);
});

test("invalid plans and process failures are controlled and never retry", async (t) => {
  const base = fixture(t);
  await assert.rejects(
    base.launcher.execute({ ...base.plan, args: ["--unsafe"] }, { configuredExecutable: base.executable }),
    (error) => error.code === "AFTER_EFFECTS_LAUNCH_INVALID"
  );
  assert.equal(base.calls.length, 0);

  const failed = fixture(t, {
    spawnProcess(...args) {
      base.calls.push(args);
      const child = new EventEmitter();
      queueMicrotask(() => child.emit("error", Object.assign(new Error("blocked"), { code: "EACCES" })));
      return child;
    }
  });
  await assert.rejects(
    failed.launcher.execute(failed.plan, { configuredExecutable: failed.executable }),
    (error) => error.code === "AFTER_EFFECTS_LAUNCH_FAILED" && error.details.causeCode === "EACCES"
  );
  assert.equal(base.calls.length, 1);
});

function runningFixture(t, overrides = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "clackly-ae-detect-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const executable = path.join(root, "Adobe", "AfterFX.exe");
  fs.mkdirSync(path.dirname(executable), { recursive: true });
  fs.writeFileSync(executable, "AfterFX");
  const other = path.join(root, "Other", "AfterFX.exe");
  fs.mkdirSync(path.dirname(other), { recursive: true });
  fs.writeFileSync(other, "AfterFX");
  const calls = [];
  const launcher = new AfterEffectsLauncher({
    hostEnvironment: { SystemRoot: "C:\\Windows", APPDATA: "C:\\Users\\host\\AppData" },
    platform: "win32",
    temporaryRoot: root,
    spawnProcess(...args) {
      calls.push(args);
      const child = new EventEmitter();
      child.unref = () => { child.unrefCalled = true; };
      queueMicrotask(() => child.emit("spawn"));
      return child;
    },
    ...overrides
  });
  const plan = {
    type: PLAN_TYPE,
    executable,
    args: ["-r", JSX_ARGUMENT],
    jsx: "app.project.items.addComp('test', 1, 1, 1, 1, 24);"
  };
  return { calls, executable, launcher, other, plan, root };
}

function psJson(records) {
  return JSON.stringify({ ProcessCount: records.length, Records: records });
}

function recordPath(value) {
  return { Path: value, Error: null };
}

function recordError(message) {
  return { Path: null, Error: message };
}

test("detectRunning applies the bounded PowerShell contract and reports false on zero processes", async (t) => {
  const base = runningFixture(t, {
    execFile: (executable, args, options, callback) => {
      assert.equal(executable, "C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe");
      assert.equal(options.timeout, 5000);
      assert.equal(options.shell, false);
      assert.equal(options.windowsHide, true);
      assert.equal(options.encoding, "utf8");
      assert.equal(options.env, base.launcher.hostEnvironment);
      callback(null, psJson([]));
    }
  });

  assert.equal(await base.launcher.detectRunning(fs.realpathSync(base.executable)), false);
});

test("detectRunning reports false for all-valid nonmatching processes", async (t) => {
  const base = runningFixture(t, {
    execFile: (executable, args, options, callback) => (
      callback(null, psJson([recordPath(fs.realpathSync(base.other))]))
    )
  });

  assert.equal(await base.launcher.detectRunning(fs.realpathSync(base.executable)), false);
});

test("detectRunning reports true when a later record matches the configured executable", async (t) => {
  const base = runningFixture(t, {
    execFile: (executable, args, options, callback) => (
      callback(null, psJson([
        recordPath(fs.realpathSync(base.other)),
        recordPath(fs.realpathSync(base.executable))
      ]))
    )
  });

  assert.equal(await base.launcher.detectRunning(fs.realpathSync(base.executable)), true);
});

test("detectRunning treats an unresolved record without a match as an unknown failure", async (t) => {
  const base = runningFixture(t, {
    execFile: (executable, args, options, callback) => (
      callback(null, psJson([recordError("path unavailable")]))
    )
  });

  await assert.rejects(
    base.launcher.detectRunning(fs.realpathSync(base.executable)),
    (error) => error.code === "AFTER_EFFECTS_LAUNCH_FAILED"
  );
});

test("a validated match wins over unresolved records", async (t) => {
  const base = runningFixture(t, {
    execFile: (executable, args, options, callback) => (
      callback(null, psJson([
        recordError("path unavailable"),
        recordPath(fs.realpathSync(base.executable))
      ]))
    )
  });

  assert.equal(await base.launcher.detectRunning(fs.realpathSync(base.executable)), true);
});

test("unresolved records without a match fail closed even with valid nonmatches", async (t) => {
  const base = runningFixture(t, {
    execFile: (executable, args, options, callback) => (
      callback(null, psJson([
        recordPath(fs.realpathSync(base.other)),
        recordError("path unavailable")
      ]))
    )
  });

  await assert.rejects(
    base.launcher.detectRunning(fs.realpathSync(base.executable)),
    (error) => error.code === "AFTER_EFFECTS_LAUNCH_FAILED"
  );
});

test("an inaccessible running path without a match is an unknown failure", async (t) => {
  const base = runningFixture(t, {
    execFile: (executable, args, options, callback) => (
      callback(null, psJson([recordPath(path.join(base.root, "missing", "AfterFX.exe"))]))
    )
  });

  await assert.rejects(
    base.launcher.detectRunning(fs.realpathSync(base.executable)),
    (error) => error.code === "AFTER_EFFECTS_LAUNCH_FAILED"
  );
});

test("a missing SystemRoot prerequisite is an unknown failure", async (t) => {
  const base = runningFixture(t, {
    hostEnvironment: { APPDATA: "C:\\Users\\host\\AppData" },
    execFile: () => assert.fail("probe must not run")
  });

  await assert.rejects(
    base.launcher.detectRunning(fs.realpathSync(base.executable)),
    (error) => error.code === "AFTER_EFFECTS_LAUNCH_FAILED"
  );
});

test("inconsistent counts, malformed JSON, and malformed records are unknown failures", async (t) => {
  const base = runningFixture(t, {
    execFile: (executable, args, options, callback) => callback(null, "not json")
  });
  await assert.rejects(
    base.launcher.detectRunning(fs.realpathSync(base.executable)),
    (error) => error.code === "AFTER_EFFECTS_LAUNCH_FAILED"
  );

  const countMismatch = runningFixture(t, {
    execFile: (executable, args, options, callback) => (
      callback(null, JSON.stringify({ ProcessCount: 2, Records: [] }))
    )
  });
  await assert.rejects(
    countMismatch.launcher.detectRunning(fs.realpathSync(countMismatch.executable)),
    (error) => error.code === "AFTER_EFFECTS_LAUNCH_FAILED"
  );

  const emptyRecord = runningFixture(t, {
    execFile: (executable, args, options, callback) => (
      callback(null, psJson([{ Path: null, Error: null }]))
    )
  });
  await assert.rejects(
    emptyRecord.launcher.detectRunning(fs.realpathSync(emptyRecord.executable)),
    (error) => error.code === "AFTER_EFFECTS_LAUNCH_FAILED"
  );
});

test("a probe timeout or subprocess failure is an unknown failure", async (t) => {
  const base = runningFixture(t, {
    execFile: (executable, args, options, callback) => (
      callback(Object.assign(new Error("Command timed out"), { code: "ETIMEDOUT" }))
    )
  });

  await assert.rejects(
    base.launcher.detectRunning(fs.realpathSync(base.executable)),
    (error) => error.code === "AFTER_EFFECTS_LAUNCH_FAILED"
      && error.details.causeCode === "ETIMEDOUT"
  );
});

test("non-Windows running detection never probes and reports false", async (t) => {
  const base = runningFixture(t, {
    platform: "darwin",
    execFile: () => assert.fail("probe must not run")
  });

  assert.equal(await base.launcher.detectRunning(fs.realpathSync(base.executable)), false);
});

test("an unknown running state cleans up and performs zero spawn and bootstrap", async (t) => {
  const base = runningFixture(t, {
    execFile: (executable, args, options, callback) => (
      callback(Object.assign(new Error("timed out"), { code: "ETIMEDOUT" }))
    )
  });

  await assert.rejects(
    base.launcher.execute(base.plan, { configuredExecutable: base.executable }),
    (error) => error.code === "AFTER_EFFECTS_LAUNCH_FAILED"
      && error.details.causeCode === "ETIMEDOUT"
  );
  assert.equal(base.calls.length, 0);
  assert.deepEqual(
    fs.readdirSync(base.root).filter((name) => name.startsWith("clackly-ae-")),
    []
  );
  assert.equal(
    fs.existsSync(path.join(path.dirname(base.executable), "Scripts", "Startup", "_resolve2ae_bootstrap.jsx")),
    false
  );
});

test("a confirmed stopped state cold launches exactly once", async (t) => {
  const base = runningFixture(t, {
    execFile: (executable, args, options, callback) => callback(null, psJson([]))
  });

  assert.deepEqual(await base.launcher.execute(base.plan, {
    configuredExecutable: base.executable
  }), { mode: "cold" });
  assert.equal(base.calls.length, 1);
  assert.deepEqual(base.calls[0][1], []);
  const bootstrap = path.join(path.dirname(base.executable), "Scripts", "Startup", "_resolve2ae_bootstrap.jsx");
  assert.match(fs.readFileSync(bootstrap, "utf8"), /scheduleTask/);
});
