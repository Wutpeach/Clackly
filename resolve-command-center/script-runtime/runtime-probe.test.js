const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const { RuntimeError } = require("./runtime/errors");
const { RuntimeLauncher } = require("./runtime/launcher");
const {
  RuntimeProbe,
  RuntimeFingerprint,
  RuntimeProbeCache,
  RuntimeDiagnostics
} = require("./runtime/probe");

function temporaryFixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "clackly-probe-test-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const modulePath = path.join(root, "DaVinciResolveScript.py");
  const libraryPath = path.join(root, "fusionscript.dll");
  fs.writeFileSync(modulePath, "# fixture\n");
  fs.writeFileSync(libraryPath, "fixture");
  return { root, modulePath, libraryPath, cachePath: path.join(root, "probe.json") };
}

function managedResolution(executable = process.execPath) {
  return {
    source: "manifest",
    supportStatus: "machine-verified",
    executable: fs.realpathSync(executable),
    profile: { id: "python-3.13-resolve-20.3", runtimeVersion: "3.13.1" }
  };
}

function overrideResolution(executable = process.execPath) {
  return {
    source: "override",
    supportStatus: "overridden",
    executable: fs.realpathSync(executable),
    profile: null
  };
}

function probeInput(fixture, resolution = managedResolution(), overrides = {}) {
  return {
    resolution,
    clacklyVersion: "0.1.0",
    resolveVersion: "20.3.2.9",
    modulePath: fixture.modulePath,
    libraryPath: fixture.libraryPath,
    ...overrides
  };
}

function successResponse(input, version = "3.13.1") {
  return {
    ok: true,
    runtime: { version, architecture: "64bit", executable: fs.realpathSync(input.resolution.executable) },
    resolve: { version: "20.3.2", connected: true },
    bridge: {
      modulePath: fs.realpathSync(input.modulePath),
      libraryPath: fs.realpathSync(input.libraryPath)
    }
  };
}

function fakeLauncher(handler) {
  return {
    calls: [],
    async execute(input) {
      this.calls.push(structuredClone(input));
      return handler(input, this.calls.length);
    }
  };
}

test("Runtime Diagnostics preserves support provenance across the complete status table", () => {
  for (const supportStatus of ["machine-verified", "overridden", "unsupported", "missing-runtime"]) {
    for (const probeStatus of ["not-run", "passed", "failed", "stale"]) {
      const result = RuntimeDiagnostics.derive(supportStatus, probeStatus);
      assert.equal(result.supportStatus, supportStatus);
      assert.equal(result.probeStatus, probeStatus);
      assert.equal(result.ok, probeStatus === "passed");
      const expected = supportStatus === "missing-runtime" || probeStatus !== "passed"
        ? "blocked" : supportStatus === "unsupported" ? "warning" : "ready";
      assert.equal(result.effectiveStatus, expected);
      assert.deepEqual(
        result.warnings.map(({ code }) => code),
        supportStatus === "overridden" && probeStatus === "passed"
          ? ["CUSTOM_RUNTIME_UNVERIFIED"] : []
      );
    }
  }
});

test("Runtime Fingerprint records every compatibility input and reuses observed Override version", (t) => {
  const fixture = temporaryFixture(t);
  const builder = new RuntimeFingerprint({ platform: "win32", architecture: "x64" });
  const managed = builder.create(probeInput(fixture));
  assert.deepEqual(Object.keys(managed), [
    "clacklyVersion", "runtime", "resolveVersion", "bridge", "platform", "architecture", "overridePath"
  ]);
  assert.equal(managed.runtime.id, "python-3.13-resolve-20.3");
  assert.equal(managed.runtime.version, "3.13.1");
  assert.equal(managed.runtime.executableMtimeMs, fs.statSync(process.execPath).mtimeMs);
  assert.equal(managed.bridge.modulePath, fs.realpathSync(fixture.modulePath));
  assert.equal(managed.bridge.moduleMtimeMs, fs.statSync(fixture.modulePath).mtimeMs);
  assert.equal(managed.bridge.libraryPath, fs.realpathSync(fixture.libraryPath));
  assert.equal(managed.bridge.libraryMtimeMs, fs.statSync(fixture.libraryPath).mtimeMs);
  assert.equal(managed.resolveVersion, "20.3.2.9");
  assert.equal(managed.platform, "win32");
  assert.equal(managed.architecture, "x64");
  assert.equal(managed.overridePath, null);

  const overrideInput = probeInput(fixture, overrideResolution());
  const first = builder.create(overrideInput, { observedRuntimeVersion: "3.13.7" });
  assert.equal(first.runtime.id, "override");
  assert.equal(first.runtime.version, "3.13.7");
  assert.equal(first.overridePath, fs.realpathSync(process.execPath));
  assert.deepEqual(builder.create(overrideInput, {
    cachedRecord: { fingerprint: first }
  }), first);
});

test("Runtime Probe caches only passed results and a hit does not spawn", async (t) => {
  const fixture = temporaryFixture(t);
  const input = probeInput(fixture, overrideResolution());
  const launcher = fakeLauncher(async () => ({ response: successResponse(input, "3.13.7"), process: {} }));
  const probe = new RuntimeProbe({ launcher, cachePath: fixture.cachePath });

  const miss = await probe.probe(input);
  assert.equal(miss.cache.status, "miss");
  assert.equal(miss.supportStatus, "overridden");
  assert.equal(miss.probeStatus, "passed");
  assert.equal(miss.effectiveStatus, "ready");
  assert.deepEqual(miss.warnings.map(({ code }) => code), ["CUSTOM_RUNTIME_UNVERIFIED"]);
  const hit = await probe.probe(input);
  assert.equal(hit.cache.status, "hit");
  assert.equal(hit.runtime.version, "3.13.7");
  assert.equal(launcher.calls.length, 1);
  const forced = await probe.probe({ ...input, force: true });
  assert.equal(forced.cache.status, "forced");
  assert.equal(launcher.calls.length, 2);
  assert.deepEqual(launcher.calls[0].request, {
    operation: "resolve-probe",
    expectedRuntimeVersion: null,
    expectedResolveVersion: "20.3.2.9",
    modulePath: fs.realpathSync(fixture.modulePath),
    libraryPath: fs.realpathSync(fixture.libraryPath)
  });
});

test("Runtime Probe Cache reports every fingerprint change as stale", (t) => {
  const fixture = temporaryFixture(t);
  const storage = new RuntimeProbeCache({ filePath: fixture.cachePath });
  const fingerprint = new RuntimeFingerprint({ platform: "win32", architecture: "x64" })
    .create(probeInput(fixture));
  const result = {
    ...RuntimeDiagnostics.derive("machine-verified", "passed"),
    runtime: {
      id: fingerprint.runtime.id,
      version: fingerprint.runtime.version,
      architecture: "x64",
      executable: fs.realpathSync(process.execPath)
    },
    resolve: { version: "20.3.2", connected: true },
    bridge: {
      modulePath: fingerprint.bridge.modulePath,
      libraryPath: fingerprint.bridge.libraryPath
    },
    cache: { status: "miss" }
  };
  storage.save(fingerprint, result);
  assert.equal(storage.lookup(fingerprint).status, "hit");

  const changes = {
    clacklyVersion: "clacklyVersion",
    "runtime.id": "runtime.id",
    "runtime.version": "runtime.version",
    "runtime.executableMtimeMs": "runtime.executableMtimeMs",
    resolveVersion: "resolveVersion",
    "bridge.modulePath": "bridge.modulePath",
    "bridge.moduleMtimeMs": "bridge.moduleMtimeMs",
    "bridge.libraryPath": "bridge.libraryPath",
    "bridge.libraryMtimeMs": "bridge.libraryMtimeMs",
    platform: "platform",
    architecture: "architecture",
    overridePath: "overridePath"
  };
  for (const [field, reason] of Object.entries(changes)) {
    const changed = structuredClone(fingerprint);
    const parts = field.split(".");
    const key = parts.pop();
    const owner = parts.reduce((value, part) => value[part], changed);
    owner[key] = typeof owner[key] === "number" ? owner[key] + 1 : `${owner[key]}-changed`;
    const lookup = storage.lookup(changed);
    assert.equal(lookup.status, "stale", field);
    assert.deepEqual(lookup.reasons, [reason]);
  }
  assert.equal(storage.lookup(fingerprint, { force: true }).status, "forced");
});

test("Runtime Probe treats corrupt cache as a miss, saves atomically, and surfaces write failure", async (t) => {
  const fixture = temporaryFixture(t);
  fs.writeFileSync(fixture.cachePath, "{broken", "utf8");
  const input = probeInput(fixture);
  const launcher = fakeLauncher(async () => ({ response: successResponse(input), process: {} }));
  const probe = new RuntimeProbe({ launcher, cachePath: fixture.cachePath });
  const result = await probe.probe(input);
  assert.equal(result.ok, true);
  assert.equal(result.cache.status, "miss");
  assert.equal(result.cache.reason, "read-failed");
  assert.equal(result.cache.diagnostic.code, "CACHE_READ_FAILED");
  assert.equal(fs.existsSync(`${fixture.cachePath}.${process.pid}.tmp`), false);

  const failingStorage = {
    load: () => ({}),
    save: () => { throw Object.assign(new Error("denied"), { code: "EACCES" }); }
  };
  const writeFailure = await new RuntimeProbe({
    launcher,
    cache: new RuntimeProbeCache({ storage: failingStorage })
  }).probe(input);
  assert.equal(writeFailure.ok, true);
  assert.equal(writeFailure.cache.status, "write-failed");
  assert.equal(writeFailure.cache.diagnostic.code, "CACHE_WRITE_FAILED");
});

test("Runtime Probe rejects cached support provenance that does not match its fingerprint", async (t) => {
  const fixture = temporaryFixture(t);
  const input = probeInput(fixture);
  const fingerprint = new RuntimeFingerprint().create(input);
  const corruptResult = {
    ...RuntimeDiagnostics.derive("unsupported", "passed"),
    runtime: {
      id: fingerprint.runtime.id,
      version: fingerprint.runtime.version,
      architecture: "x64",
      executable: fs.realpathSync(process.execPath)
    },
    resolve: { version: "20.3.2", connected: true },
    bridge: {
      modulePath: fingerprint.bridge.modulePath,
      libraryPath: fingerprint.bridge.libraryPath
    },
    cache: { status: "miss" }
  };
  fs.writeFileSync(fixture.cachePath, JSON.stringify({
    schemaVersion: 1,
    fingerprint,
    result: corruptResult
  }));
  const launcher = fakeLauncher(async () => ({ response: successResponse(input), process: {} }));

  const result = await new RuntimeProbe({ launcher, cachePath: fixture.cachePath }).probe(input);

  assert.equal(result.cache.status, "miss");
  assert.equal(result.cache.reason, "schema-invalid");
  assert.equal(result.supportStatus, "machine-verified");
  assert.equal(launcher.calls.length, 1);
});

test("Runtime Probe discovers only the standard Windows bridge defaults", async () => {
  const fileSystem = {
    realpathSync: (candidate) => candidate,
    statSync: () => ({ isFile: () => true, mtimeMs: 1 })
  };
  let saved = {};
  const cache = new RuntimeProbeCache({
    storage: { load: () => saved, save: (value) => { saved = value; } }
  });
  const launcher = fakeLauncher(async ({ resolution, request }) => ({
    response: {
      ok: true,
      runtime: { version: "3.13.1", architecture: "64bit", executable: resolution.executable },
      resolve: { version: "20.3.2", connected: true },
      bridge: { modulePath: request.modulePath, libraryPath: request.libraryPath }
    },
    process: {}
  }));
  const probe = new RuntimeProbe({ launcher, cache, fileSystem, platform: "win32", architecture: "x64" });
  const result = await probe.probe({
    resolution: managedResolution(), clacklyVersion: "0.1.0", resolveVersion: "20.3.2.9"
  });

  assert.equal(result.ok, true);
  assert.equal(launcher.calls[0].request.modulePath,
    "C:\\ProgramData\\Blackmagic Design\\DaVinci Resolve\\Support\\Developer\\Scripting\\Modules\\DaVinciResolveScript.py");
  assert.equal(launcher.calls[0].request.libraryPath,
    "C:\\Program Files\\Blackmagic Design\\DaVinci Resolve\\fusionscript.dll");
});

test("Runtime Probe maps Bootstrap, timeout, and native failures and clears reusable state", async (t) => {
  const fixture = temporaryFixture(t);
  const input = probeInput(fixture);
  const cases = [
    ["RESOLVE_MODULE_NOT_FOUND", new RuntimeError("RUNTIME_BOOTSTRAP_FAILED", "failed", {
      details: {
        bootstrapError: {
          code: "RESOLVE_MODULE_NOT_FOUND",
          type: "FileNotFoundError",
          message: "missing",
          stage: "module-path",
          details: {
            runtime: { version: "3.13.1", architecture: "64bit", executable: process.execPath }
          }
        },
        process: { stdout: "", stderr: "", stdoutBytes: 0, stderrBytes: 0 }
      }
    })],
    ["RUNTIME_TIMEOUT", new RuntimeError("RUNTIME_TIMEOUT", "timed out", { details: { process: {} } })],
    ["RUNTIME_NATIVE_BRIDGE_CRASH", new RuntimeError("RUNTIME_NATIVE_CRASH", "crashed", {
      details: { process: { signal: "SIGABRT", stderr: "bounded" } }
    })]
  ];
  for (const [expectedCode, failure] of cases) {
    fs.writeFileSync(fixture.cachePath, JSON.stringify({ stale: true }));
    const launcher = fakeLauncher(async () => { throw failure; });
    const result = await new RuntimeProbe({ launcher, cachePath: fixture.cachePath }).probe(input);
    assert.equal(result.ok, false);
    assert.equal(result.supportStatus, "machine-verified");
    assert.equal(result.probeStatus, "failed");
    assert.equal(result.effectiveStatus, "blocked");
    assert.equal(result.error.code, expectedCode);
    if (expectedCode === "RESOLVE_MODULE_NOT_FOUND") assert.equal(result.runtime.version, "3.13.1");
    assert.equal(result.cache.cleared, true);
    assert.equal(fs.existsSync(fixture.cachePath), false);
  }

  const clearFailure = await new RuntimeProbe({
    launcher: fakeLauncher(async () => { throw cases[1][1]; }),
    cache: new RuntimeProbeCache({
      filePath: fixture.cachePath,
      storage: { load: () => ({}) },
      fileSystem: { unlinkSync: () => { throw Object.assign(new Error("denied"), { code: "EACCES" }); } }
    })
  }).probe(input);
  assert.equal(clearFailure.error.code, "RUNTIME_TIMEOUT");
  assert.equal(clearFailure.cache.status, "clear-failed");
  assert.equal(clearFailure.cache.diagnostic.code, "CACHE_CLEAR_FAILED");
});

test("Runtime Probe rejects malformed input before cache or process work", async (t) => {
  const fixture = temporaryFixture(t);
  const launcher = fakeLauncher(async () => { throw new Error("must not run"); });
  const probe = new RuntimeProbe({ launcher, cachePath: fixture.cachePath });
  for (const input of [
    null,
    probeInput(fixture, { ...managedResolution(), supportStatus: "unsupported" }),
    probeInput(fixture, managedResolution(), { resolveVersion: "20.3" }),
    probeInput(fixture, managedResolution(), { force: "yes" }),
    probeInput(fixture, managedResolution(), { modulePath: "relative.py" })
  ]) {
    await assert.rejects(() => probe.probe(input), (error) => error.code === "RUNTIME_PROBE_REQUEST_INVALID");
  }
  assert.equal(launcher.calls.length, 0);
});

let pythonExecutable;
function realPython() {
  if (pythonExecutable) return pythonExecutable;
  const found = spawnSync(process.platform === "win32" ? "python" : "python3", [
    "-c", "import os,sys;sys.stdout.write(os.path.realpath(sys.executable))"
  ], { encoding: "utf8", shell: false, windowsHide: true });
  assert.equal(found.status, 0, found.stderr);
  pythonExecutable = fs.realpathSync(found.stdout);
  return pythonExecutable;
}

test("an aborting bridge crashes only the isolated child and the following Probe succeeds", async (t) => {
  const fixture = temporaryFixture(t);
  fs.writeFileSync(fixture.modulePath, "import os\nos.abort()\n", "utf8");
  const executable = realPython();
  const version = spawnSync(executable, ["-c", "import sys;print('.'.join(map(str,sys.version_info[:3])))"], {
    encoding: "utf8", shell: false, windowsHide: true
  }).stdout.trim();
  const input = probeInput(fixture, overrideResolution(executable));
  const probe = new RuntimeProbe({
    launcher: new RuntimeLauncher({ timeoutMs: 2000 }),
    cachePath: fixture.cachePath
  });
  const fingerprint = new RuntimeFingerprint().create(input, { observedRuntimeVersion: version });
  new RuntimeProbeCache({ filePath: fixture.cachePath }).save(fingerprint, {
    ...RuntimeDiagnostics.derive("overridden", "passed"),
    runtime: {
      id: "override", version, architecture: process.arch, executable
    },
    resolve: { version: "20.3.2", connected: true },
    bridge: {
      modulePath: fs.realpathSync(fixture.modulePath),
      libraryPath: fs.realpathSync(fixture.libraryPath)
    },
    cache: { status: "miss" }
  });

  const crashed = await probe.probe({ ...input, force: true });
  assert.equal(crashed.error.code, "RUNTIME_NATIVE_BRIDGE_CRASH");
  assert.ok(crashed.error.details.process.signal
    || crashed.error.details.process.nativeCrash
    || /^Fatal Python error:/m.test(crashed.error.details.process.stderr));
  assert.equal(fs.existsSync(fixture.cachePath), false);

  fs.writeFileSync(fixture.modulePath, [
    "print('suppressed import noise')",
    "import os",
    "__file__ = os.environ['RESOLVE_SCRIPT_LIB']",
    "class App:",
    "    def GetVersionString(self): return '20.3.2'",
    "def scriptapp(name): return App()",
    ""
  ].join("\n"), "utf8");
  const passed = await probe.probe(input);
  assert.equal(passed.ok, true);
  assert.equal(passed.runtime.version, version);
  assert.equal(passed.cache.status, "miss");
});
