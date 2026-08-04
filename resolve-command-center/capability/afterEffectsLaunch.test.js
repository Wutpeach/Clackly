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
