const assert = require("node:assert/strict");
const path = require("node:path");
const test = require("node:test");

const { RuntimeManager } = require("./runtime/manager");

function fixture(overrides = {}) {
  const calls = [];
  const executable = path.resolve("C:/runtime/python.exe");
  const resolution = {
    source: "manifest",
    supportStatus: "machine-verified",
    executable,
    profile: { id: "managed", runtimeVersion: "3.13.14" }
  };
  const manager = new RuntimeManager({
    resolver: {
      resolve(request) {
        calls.push(["resolve", request]);
        return resolution;
      }
    },
    probe: {
      async probe(request) {
        calls.push(["probe", request]);
        return { ok: true, supportStatus: "machine-verified" };
      }
    },
    launcher: {
      async execute(request) {
        calls.push(["launch", request]);
        return {
          response: {
            ok: true,
            runtime: { version: "3.13.14", architecture: "64bit", executable },
            script: { ok: true, result: { sent: true }, logs: [] }
          },
          process: { exitCode: 0 }
        };
      }
    },
    clacklyVersion: "0.1.0",
    platform: "win32",
    architecture: "x64",
    hostContextProvider: async () => ({ application: "davinci-resolve", version: "20.3.2.9" }),
    scriptRoot: path.resolve("C:/app"),
    ...overrides
  });
  return { calls, manager, resolution };
}

const request = {
  runtime: "python",
  capabilityId: "ae.export",
  entry: "scripts/resolve2ae_export.py",
  commandId: "timeline.exportToAfterEffects",
  config: { aePath: "C:/AfterFX.exe" }
};

test("Runtime Manager owns resolve, Probe, then one isolated script launch", async () => {
  const { calls, manager, resolution } = fixture();
  assert.deepEqual(await manager.execute(request), { ok: true, result: { sent: true }, logs: [] });
  assert.deepEqual(calls.map(([name]) => name), ["resolve", "probe", "launch"]);
  assert.equal(calls[0][1].capabilityId, "ae.export");
  assert.equal(calls[1][1].resolution, resolution);
  assert.equal(calls[2][1].request.operation, "script-execute");
  assert.equal(calls[2][1].request.entry, request.entry);
  assert.equal(calls[2][1].bootstrapPath, path.join(path.dirname(resolution.executable), "clackly", "bootstrap.py"));
});

test("Runtime Manager keeps Override authoritative and uses the application script root", async () => {
  const overrideExecutable = path.resolve("C:/custom/python.exe");
  const { calls, manager } = fixture({
    overrideExecutable,
    resolver: {
      resolve(value) {
        calls.push(["resolve", value]);
        return { source: "override", supportStatus: "overridden", executable: overrideExecutable, profile: null };
      }
    }
  });
  await manager.execute(request);
  assert.equal(calls[0][1].overrideExecutable, overrideExecutable);
  assert.equal(calls[2][1].request.scriptRoot, path.resolve("C:/app"));
});

test("Runtime Manager rejects an invalid Override before reading host state", async () => {
  let hostRead = false;
  const invalid = Object.assign(new Error("invalid override"), { code: "RUNTIME_OVERRIDE_INVALID" });
  const { manager } = fixture({
    overrideExecutable: "bad",
    resolver: { resolve: () => { throw invalid; } },
    hostContextProvider: async () => {
      hostRead = true;
      throw new Error("Resolve unavailable");
    }
  });
  await assert.rejects(manager.execute(request), (error) => error.code === "RUNTIME_OVERRIDE_INVALID");
  assert.equal(hostRead, false);
});

test("Runtime Manager blocks unverified hosts and failed Probes without launching", async () => {
  let launched = false;
  const invalidHost = fixture({
    hostContextProvider: async () => ({ application: "davinci-resolve", version: "20.3" })
  });
  await assert.rejects(invalidHost.manager.execute(request), (error) => error.code === "RESOLVE_VERSION_UNVERIFIED");
  assert.equal(invalidHost.calls.length, 0);

  const failed = fixture({
    probe: {
      async probe() {
        return {
          ok: false,
          supportStatus: "machine-verified",
          error: { code: "RUNTIME_NATIVE_BRIDGE_CRASH", message: "bridge crashed" }
        };
      }
    },
    launcher: { execute: async () => { launched = true; } }
  });
  await assert.rejects(failed.manager.execute(request), (error) => (
    error.code === "RUNTIME_NATIVE_BRIDGE_CRASH" && error.details.probe.ok === false
  ));
  assert.equal(launched, false);
});

test("Runtime Manager rejects malformed requests and script envelopes", async () => {
  const { manager, calls } = fixture();
  await assert.rejects(manager.execute({ ...request, commandId: "" }), (error) => error.code === "RUNTIME_REQUEST_INVALID");
  await assert.rejects(manager.execute({ ...request, entry: "../escape.py" }), (error) => error.code === "RUNTIME_REQUEST_INVALID");
  const circular = {};
  circular.self = circular;
  await assert.rejects(manager.execute({ ...request, config: circular }), (error) => error.code === "RUNTIME_REQUEST_INVALID");
  assert.equal(calls.length, 0);

  const malformed = fixture({
    launcher: { execute: async () => ({ response: { ok: true, script: { ok: true, logs: [] } } }) }
  });
  await assert.rejects(malformed.manager.execute(request), (error) => error.code === "RUNTIME_PROTOCOL_INVALID");
});

test("Runtime Manager executes one internal desktop plan and strips it from public output", async () => {
  const plan = {
    type: "after-effects-jsx",
    executable: "C:/AfterFX.exe",
    args: ["-r", "$CLACKLY_JSX"],
    jsx: "app.project.items.addComp('test', 1, 1, 1, 1, 24);"
  };
  const desktopCalls = [];
  const { manager } = fixture({
    desktopLauncher: {
      async execute(value, context) {
        desktopCalls.push([value, context]);
        return { mode: "running" };
      }
    },
    launcher: {
      async execute() {
        return {
          response: {
            ok: true,
            runtime: { version: "3.13.14", architecture: "64bit", executable: path.resolve("C:/runtime/python.exe") },
            script: {
              ok: true,
              result: {
                ok: true,
                code: "exported",
                mode: "auto",
                clip_count: 1,
                message: "Sent 1 Clips",
                __clacklyDesktopLaunch: plan
              },
              logs: [{ level: "info", message: "Analyzing..." }]
            }
          }
        };
      }
    }
  });

  const result = await manager.execute(request);

  assert.equal(desktopCalls.length, 1);
  assert.deepEqual(desktopCalls[0], [plan, { configuredExecutable: request.config.aePath }]);
  assert.equal(Object.hasOwn(result.result, "__clacklyDesktopLaunch"), false);
  assert.deepEqual(result.logs.map(({ message }) => message), [
    "Analyzing...", "Sending...", "✅ Sent 1 Clips"
  ]);
});

test("Runtime Manager maps desktop launch failures without leaking the internal plan", async () => {
  const { manager } = fixture({
    desktopLauncher: {
      async execute() {
        throw Object.assign(new Error("After Effects could not be started"), {
          code: "EACCES"
        });
      }
    },
    launcher: {
      async execute() {
        return {
          response: {
            ok: true,
            script: {
              ok: true,
              result: {
                message: "Sent 1 Clips",
                __clacklyDesktopLaunch: {
                  type: "after-effects-jsx",
                  executable: "C:/AfterFX.exe",
                  args: ["-r", "$CLACKLY_JSX"],
                  jsx: "private jsx"
                }
              },
              logs: []
            }
          }
        };
      }
    }
  });

  await assert.rejects(manager.execute(request), (error) => (
    error.code === "AFTER_EFFECTS_LAUNCH_FAILED"
      && error.details.stage === "desktop-launch"
      && error.details.causeCode === "EACCES"
      && !JSON.stringify(error).includes("private jsx")
  ));
});
