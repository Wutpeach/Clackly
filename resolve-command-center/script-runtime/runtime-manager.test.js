const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const { RuntimeManager } = require("./runtime/manager");
const { RuntimeProbe } = require("./runtime/probe");

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

test("Runtime Manager routes only the three Windows Export-to-AE actions through the persistent launcher", async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "clackly-persistent-route-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const executable = path.join(root, "python.exe");
  const modulePath = path.join(root, "DaVinciResolveScript.py");
  const libraryPath = path.join(root, "fusionscript.dll");
  for (const file of [executable, modulePath, libraryPath]) fs.writeFileSync(file, "fixture");
  const resolution = { source: "manifest", supportStatus: "machine-verified", executable, profile: {} };
  const calls = [];
  const response = {
    response: {
      ok: true,
      runtime: { version: "3.13.14", architecture: "64bit", executable },
      script: { ok: true, result: { sent: true }, logs: [] }
    },
    process: { exitCode: 0, durationMs: 1 },
    worker: { state: "warm", restarted: false }
  };
  const manager = new RuntimeManager({
    resolver: { resolve: () => resolution },
    probe: { probe: async () => ({
      ok: true,
      resolve: { version: "20.3.2" },
      bridge: { modulePath, libraryPath }
    }) },
    launcher: { execute: async (input) => { calls.push(["one-shot", input]); return response; } },
    scriptLauncher: { execute: async (input) => { calls.push(["persistent", input]); return response; }, prewarm: async () => true, dispose() {} },
    clacklyVersion: "0.1.0",
    platform: "win32",
    architecture: "x64",
    hostContextProvider: async () => ({ application: "davinci-resolve", version: "20.3.2.9" }),
    scriptRoot: root,
    fileSystem: fs
  });

  for (const commandId of [
    "timeline.exportToAfterEffects",
    "timeline.exportAudioToAfterEffects",
    "timeline.exportVideoToAfterEffects"
  ]) {
    await manager.execute({ ...request, commandId });
  }
  assert.deepEqual(calls.slice(0, 3).map(([kind]) => kind), ["persistent", "persistent", "persistent"]);
  assert.equal(calls.filter(([kind]) => kind === "persistent").length, 3);
  const persistent = calls[0][1];
  assert.match(persistent.bootstrapPath, /persistent_bootstrap\.py$/);
  assert.equal(typeof persistent.healthKey, "string");
  assert.equal(typeof persistent.identity, "string");

  for (const commandId of [
    "timeline.exportCurrentToAfterEffects",
    "timeline.exportBlueRangeToAfterEffects",
    "timeline.exportCyanRangeToAfterEffects"
  ]) {
    await manager.execute({ ...request, commandId });
  }
  assert.deepEqual(calls.slice(-3).map(([kind]) => kind), ["one-shot", "one-shot", "one-shot"]);
  assert.equal(calls.filter(([kind]) => kind === "persistent").length, 3);
  assert.equal(calls.filter(([kind]) => kind === "one-shot").length, 3);

  await manager.execute({ ...request, commandId: "timeline.unsupportedExportToAfterEffects" });
  await manager.execute({ ...request, entry: "scripts/other.py" });
  assert.equal(calls.filter(([kind]) => kind === "one-shot").length, 5);

  manager.platform = "darwin";
  await manager.execute({ ...request, commandId: "timeline.exportToAfterEffects" });
  assert.equal(calls.at(-1)[0], "one-shot");
  assert.equal(calls.filter(([kind]) => kind === "persistent").length, 3);
  assert.equal(calls.filter(([kind]) => kind === "one-shot").length, 6);
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

test("Runtime Manager availability resolves and probes without launching scripts", async () => {
  const { calls, manager, resolution } = fixture();
  const result = await manager.checkAvailability({ runtime: "python", capabilityId: "ae.export" });

  assert.deepEqual(calls.map(([name]) => name), ["resolve", "probe"]);
  assert.equal(result.ok, true);
  assert.equal(result.supportStatus, "machine-verified");
  assert.equal(calls[1][1].resolution, resolution);
});

test("Runtime Manager availability validates requests and blocks unverified hosts without probing", async () => {
  const { manager, calls } = fixture();
  await assert.rejects(
    manager.checkAvailability({ runtime: "", capabilityId: "ae.export" }),
    (error) => error.code === "RUNTIME_REQUEST_INVALID"
  );
  await assert.rejects(
    manager.checkAvailability({ runtime: "python" }),
    (error) => error.code === "RUNTIME_REQUEST_INVALID"
  );
  await assert.rejects(manager.checkAvailability(null), (error) => error.code === "RUNTIME_REQUEST_INVALID");
  assert.equal(calls.length, 0);

  const invalidHost = fixture({
    hostContextProvider: async () => ({ application: "davinci-resolve", version: "20.3" })
  });
  await assert.rejects(
    invalidHost.manager.checkAvailability({ runtime: "python", capabilityId: "ae.export" }),
    (error) => error.code === "RESOLVE_VERSION_UNVERIFIED"
  );
  assert.equal(invalidHost.calls.length, 0);
});

test("Runtime Manager availability surfaces failed Probes and never launches", async () => {
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
    launcher: { execute: async () => { throw new Error("must not launch"); } }
  });
  await assert.rejects(
    failed.manager.checkAvailability({ runtime: "python", capabilityId: "ae.export" }),
    (error) => error.code === "RUNTIME_NATIVE_BRIDGE_CRASH" && error.details.probe.ok === false
  );
});

function probeFixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "clackly-manager-availability-"));
  const modulePath = path.join(root, "DaVinciResolveScript.py");
  const libraryPath = path.join(root, "fusionscript.dll");
  fs.writeFileSync(modulePath, "# fixture\n");
  fs.writeFileSync(libraryPath, "fixture");
  const executable = fs.realpathSync(process.execPath);
  const resolution = {
    source: "manifest",
    supportStatus: "machine-verified",
    executable,
    profile: { id: "managed", runtimeVersion: "3.13.14" }
  };
  return { root, modulePath, libraryPath, executable, resolution };
}

function validProbeResponse(input) {
  // The real bootstrap echoes the bridge paths it probed, which the manager
  // resolves from its defaults or injected module/library paths.
  return {
    response: {
      ok: true,
      runtime: { version: "3.13.14", architecture: "64bit", executable: fs.realpathSync(input.resolution.executable) },
      resolve: { version: "20.3.2", connected: true },
      bridge: {
        modulePath: input.request.modulePath,
        libraryPath: input.request.libraryPath
      }
    },
    process: { exitCode: 0 }
  };
}

function availabilityManager(state, launcherHandler) {
  const launcherCalls = [];
  const probe = new RuntimeProbe({
    launcher: {
      async execute(input) {
        launcherCalls.push(input.request.operation);
        return launcherHandler(input);
      }
    },
    cachePath: path.join(state.root, "probe.json"),
    platform: "win32",
    architecture: "x64"
  });
  const manager = new RuntimeManager({
    resolver: { resolve: () => state.resolution },
    probe,
    launcher: { execute: async () => { throw new Error("script launcher must not run"); } },
    clacklyVersion: "0.1.0",
    platform: "win32",
    architecture: "x64",
    hostContextProvider: async () => ({ application: "davinci-resolve", version: "20.3.2.9" }),
    scriptRoot: path.resolve("C:/app"),
    modulePath: state.modulePath,
    libraryPath: state.libraryPath
  });
  return { manager, launcherCalls };
}

test("Runtime Manager availability reuses the shared Probe cache without a second spawn", async (t) => {
  const state = probeFixture();
  t.after(() => fs.rmSync(state.root, { recursive: true, force: true }));
  const { manager, launcherCalls } = availabilityManager(state, (input) => validProbeResponse(input));
  const request = { runtime: "python", capabilityId: "ae.export" };

  const first = await manager.checkAvailability(request);
  assert.equal(first.ok, true);
  const second = await manager.checkAvailability(request);
  assert.equal(second.ok, true);
  assert.equal(second.cache.status, "hit");
  assert.deepEqual(launcherCalls, ["resolve-probe"]);
});

test("Runtime Manager availability clears a failed Probe and recovers on the next check", async (t) => {
  const state = probeFixture();
  t.after(() => fs.rmSync(state.root, { recursive: true, force: true }));
  let fail = true;
  const { manager, launcherCalls } = availabilityManager(state, (input) => {
    if (fail) return { response: { ok: true, script: { ok: false, logs: [] } } };
    return validProbeResponse(input);
  });
  const request = { runtime: "python", capabilityId: "ae.export" };

  await assert.rejects(
    manager.checkAvailability(request),
    (error) => error.code === "RUNTIME_PROTOCOL_INVALID"
  );
  fail = false;
  const recovered = await manager.checkAvailability(request);
  assert.equal(recovered.ok, true);
  assert.equal(recovered.cache.status, "miss");
  assert.deepEqual(launcherCalls, ["resolve-probe", "resolve-probe"]);
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
