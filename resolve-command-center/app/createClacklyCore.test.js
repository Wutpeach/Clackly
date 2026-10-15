const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const { createClacklyCore } = require("./createClacklyCore");
const { ConfigStorage } = require("../config/ConfigStorage");
const { RuntimeManager } = require("../script-runtime/runtime/manager");
const appRoot = path.resolve(__dirname, "..");

test("Core starts metadata-only discovery and shares that provider with both script consumers", async (t) => {
  let complete;
  const discovery = new Promise((resolve) => { complete = resolve; });
  const installationPaths = { getSnapshot: () => discovery };
  let ordinaryOptions;
  let hostReads = 0;
  const { core, cleanup } = createCore({ installationPathsProvider: installationPaths,
    hostContextProvider: async () => { hostReads += 1; throw new Error("startup must not query Resolve API"); },
    ordinaryScriptsFactory(options) { ordinaryOptions = options; return { discover: async () => ({ scripts: [], diagnostics: [] }), invoke: async () => ({ status: "not_submitted" }) }; }
  });
  t.after(cleanup);
  assert.equal(core.runtimeManager.installationPathsProvider, installationPaths);
  assert.equal(ordinaryOptions.installationPathsProvider, installationPaths);
  assert.equal(core.installationPaths, installationPaths);
  assert.equal(hostReads, 0);
  complete({ modulePath: "D:/unused/module.py", libraryPath: "D:/unused/library.dll" });
  await discovery;
  assert.equal(hostReads, 0);
});

function createCore({ beforeCreate, ...overrides } = {}) {
  const temporaryDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "clackly-core-"));
  const appDataPath = path.join(temporaryDirectory, "appdata");
  if (typeof beforeCreate === "function") {
    beforeCreate({ appDataPath, temporaryDirectory });
  }
  const core = createClacklyCore({
    appRoot,
    appDataPath,
    temporaryRoot: temporaryDirectory,
    hostContextProvider: async () => ({
      application: "davinci-resolve",
      version: "20.3.2.9"
    }),
    markerBackends: {
      resolveScriptApi: {
        isAvailable: async () => true,
        addMarker: async () => ({ ok: true, backend: "resolveScriptApi" })
      }
    },
    imageClipboard: {
      clipboard: { readPng: async () => null },
      picturesPath: path.join(temporaryDirectory, "Pictures"),
      resolveMediaPool: {
        isAvailable: async () => true,
        getCurrentProjectName: async () => "Test Project",
        importMediaToBin: async () => ({ mediaPoolBin: "Clipboard" })
      }
    },
    ...overrides
  });
  return {
    core,
    appDataPath,
    cleanup() {
      fs.rmSync(temporaryDirectory, { recursive: true, force: true });
    }
  };
}

test("Core returns working application services with marker and script capabilities", async (t) => {
  const { core, appDataPath, cleanup } = createCore();
  t.after(cleanup);

  assert.equal(core.capabilityRegistry.get("marker.add").metadata.id, "marker.add");
  assert.equal(
    core.capabilityRegistry.get("media.clipboard-image.import").metadata.id,
    "media.clipboard-image.import"
  );
  assert.equal(core.capabilityRegistry.get("ae.export").metadata.executor.entry, "scripts/resolve2ae_export.py");
  assert.equal(typeof core.ordinaryScripts.discover, "function");
  assert.equal(typeof core.ordinaryScripts.invoke, "function");

  assert.deepEqual(await core.executeCommand("timeline.addMarker"), {
    ok: true,
    backend: "resolveScriptApi"
  });
  const usagePath = path.join(appDataPath, "Clackly", "command-usage.json");
  const usage = JSON.parse(fs.readFileSync(usagePath, "utf8"));
  assert.equal(usage["timeline.addMarker"].usageCount, 1);
  assert.equal(Number.isSafeInteger(usage["timeline.addMarker"].lastUsedAt), true);
  assert.deepEqual(Object.keys(usage["timeline.addMarker"]).sort(), ["lastUsedAt", "usageCount"]);
  assert.deepEqual(core.searchCommands("marker", []).commands.map(({ id }) => id), ["timeline.addMarker"]);
  assert.deepEqual(core.searchCommands("", []).usedCommandIds, ["timeline.addMarker"]);

  assert.deepEqual(core.featureCatalog.getAllFeatures().map(({ id }) => id).sort(), [
    "ae.export",
    "marker.add",
    "media.clipboard-image.import"
  ]);
  assert.deepEqual(core.configManager.get("marker.add"), {});
  core.configManager.save("ae.export", { aePath: "C:\\fake\\AfterFX.exe" });
  assert.deepEqual(core.localizationService.getSnapshot(), { preference: "system", effectiveLocale: "en" });
  assert.equal(core.preferences.getLocale(), "system");
  assert.deepEqual(core.localizationService.setLocalePreference("zh-CN"), { preference: "zh-CN", effectiveLocale: "zh-CN" });
  assert.equal(core.preferences.getLocale(), "zh-CN");
  assert.deepEqual(
    JSON.parse(fs.readFileSync(path.join(appDataPath, "Clackly", "preferences.json"), "utf8")),
    { locale: "zh-CN" }
  );

  // The bundled runtime manifest declares a managed python, but the executable is
  // never shipped in the repository, so availability resolves to a stable
  // missing-dependency before any Probe spawns.
  assert.deepEqual(await core.featureStatusManager.refresh("ae.export"), {
    id: "ae.export",
    installed: true,
    enabled: true,
    status: "missing-dependency",
    message: "Python runtime executable is missing",
    details: { missing: ["python-runtime"], action: null }
  });
});

test("Core refreshes ordinary-script Search separately and invokes a selected script once", async (t) => {
  const scriptId = "resolve-workspace-script:c:/scripts/utility/example.py";
  const calls = [];
  let receipt = { status: "api_returned", apiReturn: null };
  const { core, cleanup } = createCore({
    ordinaryScriptsFactory: () => ({
      discover: async () => ({
        scripts: [{
          id: scriptId,
          name: "Example",
          absolutePath: "C:\\Scripts\\Utility\\Example.py",
          language: "python",
          source: "system",
          category: "Utility",
          nesting: []
        }],
        diagnostics: []
      }),
      invoke: async (id) => {
        calls.push(id);
        return receipt;
      }
    })
  });
  t.after(cleanup);

  await core.searchCommands("", [], { refresh: true });
  assert.equal(core.searchCommands("", []).commands.some(({ id }) => id === scriptId), false);
  assert.equal(
    core.searchCommands("example", []).commands.find(({ id }) => id === scriptId).subtitle,
    "Resolve Script · Utility · System · Python"
  );
  assert.deepEqual(await core.executeSearchResult(scriptId), receipt);
  assert.deepEqual(calls, [scriptId]);

  receipt = { status: "not_submitted", reason: "selection_unknown" };
  await assert.rejects(
    () => core.executeSearchResult(scriptId),
    (error) => error.code === "resolve-script-not-submitted"
  );
  receipt = { status: "submission_unknown", reason: "transport_lost" };
  await assert.rejects(
    () => core.executeSearchResult(scriptId),
    (error) => error.code === "resolve-script-submission-unknown"
  );
  assert.deepEqual(calls, [scriptId, scriptId, scriptId], "each selection has exactly one adapter invocation");
});

test("Core silently removes only the retired AE Prefix from persisted capability configuration", (t) => {
  const legacyAeExport = {
    aePath: "C:\\Adobe\\AfterFX.exe",
    create1080pPreviewComp: true,
    prefix: "Legacy Prefix"
  };
  const unrelatedCapability = { keep: "unchanged" };
  const { core, appDataPath, cleanup } = createCore({
    beforeCreate: ({ appDataPath: persistedAppDataPath }) => {
      ConfigStorage.fromAppData(persistedAppDataPath).save({
        "ae.export": legacyAeExport,
        "marker.add": {},
        "unrelated.capability": unrelatedCapability
      });
    }
  });
  t.after(cleanup);

  assert.doesNotThrow(() => core.configManager.assertConfigured("ae.export"));
  assert.deepEqual(core.configManager.get("ae.export"), {
    aePath: "C:\\Adobe\\AfterFX.exe",
    create1080pPreviewComp: true
  });
  assert.deepEqual(ConfigStorage.fromAppData(appDataPath).load(), {
    "ae.export": {
      aePath: "C:\\Adobe\\AfterFX.exe",
      create1080pPreviewComp: true
    },
    "marker.add": {},
    "unrelated.capability": unrelatedCapability
  });
});

test("Core keeps non-legacy unknown AE settings invalid", (t) => {
  const { core, cleanup } = createCore({
    beforeCreate: ({ appDataPath }) => {
      ConfigStorage.fromAppData(appDataPath).save({
        "ae.export": {
          aePath: "C:\\Adobe\\AfterFX.exe",
          create1080pPreviewComp: true,
          unexpected: true
        }
      });
    }
  });
  t.after(cleanup);

  assert.throws(
    () => core.configManager.get("ae.export"),
    /Unknown configuration key: unexpected/
  );
  assert.throws(
    () => core.configManager.assertConfigured("ae.export"),
    /Unknown configuration key: unexpected/
  );
});

test("Core constructs a single RuntimeManager and never resolves host context eagerly", (t) => {
  let hostCalls = 0;
  const { core, cleanup } = createCore({
    hostContextProvider: async () => {
      hostCalls += 1;
      return { application: "davinci-resolve", version: "20.3.2.9" };
    }
  });
  t.after(cleanup);

  assert.ok(core.runtimeManager instanceof RuntimeManager);
  assert.equal(hostCalls, 0);
});

test("Core owns one narrow After Effects process-probe lifecycle", async (t) => {
  const calls = [];
  const processProbe = {
    prewarm() {
      calls.push("prewarm");
      return Promise.resolve(true);
    },
    query: async () => ({ processCount: 0, records: [] }),
    getForegroundProcessName: async () => "Resolve.exe",
    dispose() {
      calls.push("dispose");
    }
  };
  const { core, cleanup } = createCore({
    afterEffectsProcessProbeFactory: (options) => {
      calls.push(options.hostEnvironment === process.env ? "create" : "wrong-environment");
      return processProbe;
    }
  });
  t.after(cleanup);

  assert.equal(await core.prewarmAfterEffectsProcessProbe(), true);
  assert.equal(await core.getForegroundProcessName(), "Resolve.exe");
  core.disposeAfterEffectsProcessProbe();
  assert.deepEqual(calls, ["create", "prewarm", "dispose"]);
  assert.equal(Object.hasOwn(core, "afterEffectsProcessProbe"), false);
});

test("Core owns the persistent Export-to-AE worker lifecycle separately from the PowerShell probe", async (t) => {
  const calls = [];
  const persistentWorker = {
    execute() {},
    prewarm() {
      calls.push("prewarm");
      return Promise.resolve(true);
    },
    dispose() {
      calls.push("dispose");
    }
  };
  const { core, cleanup } = createCore({
    persistentScriptLauncherFactory: (options) => {
      calls.push(options.parentEnvironment === process.env ? "create" : "wrong-environment");
      return persistentWorker;
    }
  });
  t.after(cleanup);

  core.runtimeManager.prewarmExportPythonWorker = () => persistentWorker.prewarm();
  core.runtimeManager.disposeExportPythonWorker = () => persistentWorker.dispose();
  assert.equal(await core.prewarmExportPythonWorker(), true);
  core.disposeExportPythonWorker();
  assert.deepEqual(calls, ["create", "prewarm", "dispose"]);
  assert.equal(Object.hasOwn(core, "persistentWorker"), false);
});

test("hostContextProvider failures surface unchanged through script execution", async (t) => {
  const workflowStyleError = new Error("Failed to get Resolve object from Workflow Integration");
  const { core, cleanup } = createCore({
    hostContextProvider: async () => {
      throw workflowStyleError;
    }
  });
  t.after(cleanup);
  core.configManager.save("ae.export", { aePath: "C:\\fake\\AfterFX.exe" });

  await assert.rejects(
    () => core.executeCommand("timeline.exportToAfterEffects"),
    (error) => {
      assert.equal(error.code, "RESOLVE_VERSION_UNVERIFIED");
      assert.equal(error.details.cause, "Failed to get Resolve object from Workflow Integration");
      return true;
    }
  );
});

test("bridge-style hostContextProvider failures keep their error message", async (t) => {
  const { core, cleanup } = createCore({
    hostContextProvider: async () => {
      throw new Error("Bridge did not return a Resolve version");
    }
  });
  t.after(cleanup);
  core.configManager.save("ae.export", { aePath: "C:\\fake\\AfterFX.exe" });

  await assert.rejects(
    () => core.executeCommand("timeline.exportToAfterEffects"),
    (error) => {
      assert.equal(error.code, "RESOLVE_VERSION_UNVERIFIED");
      assert.equal(error.details.cause, "Bridge did not return a Resolve version");
      return true;
    }
  );
});

test("Core threads marker backends through with explicit precedence", async (t) => {
  const workflowPluginCalls = [];
  const { core, cleanup } = createCore({
    markerBackends: {
      resolveScriptApi: {
        isAvailable: async () => true,
        addMarker: async () => ({ ok: true, backend: "resolveScriptApi" })
      },
      workflowPluginApi: {
        isAvailable: async () => true,
        addMarker: async () => {
          workflowPluginCalls.push("workflowPluginApi");
          return { ok: true, backend: "workflowPluginApi" };
        }
      }
    }
  });
  t.after(cleanup);

  assert.deepEqual(await core.executeCommand("timeline.addMarker"), {
    ok: true,
    backend: "resolveScriptApi"
  });
  assert.deepEqual(workflowPluginCalls, []);
});

test("Core propagates marker execution errors without backend fallback", async (t) => {
  const semanticError = new Error("marker already exists");
  let fallbackCalled = false;
  const { core, cleanup } = createCore({
    markerBackends: {
      resolveScriptApi: {
        isAvailable: async () => true,
        addMarker: async () => {
          throw semanticError;
        }
      },
      workflowPluginApi: {
        isAvailable: async () => true,
        addMarker: async () => {
          fallbackCalled = true;
          return { ok: true };
        }
      }
    }
  });
  t.after(cleanup);

  await assert.rejects(() => core.executeCommand("timeline.addMarker"), (error) => error === semanticError);
  assert.equal(fallbackCalled, false);
});

test("Core rejects missing dependencies", () => {
  assert.throws(() => createClacklyCore(), /application root/);
  assert.throws(
    () => createClacklyCore({ appRoot, appDataPath: "x", temporaryRoot: "x" }),
    /host context provider/
  );
  assert.throws(
    () => createClacklyCore({
      appRoot,
      appDataPath: "x",
      temporaryRoot: "x",
      hostContextProvider: async () => ({}),
      markerBackends: null
    }),
    /marker backends/
  );
  assert.throws(
    () => createClacklyCore({
      appRoot,
      appDataPath: "x",
      temporaryRoot: "x",
      hostContextProvider: async () => ({}),
      markerBackends: {}
    }),
    /Image Clipboard host adapters/
  );
  assert.throws(
    () => createClacklyCore({
      appRoot,
      appDataPath: "x",
      temporaryRoot: "x",
      hostContextProvider: async () => ({}),
      markerBackends: {},
      imageClipboard: {},
      afterEffectsProcessProbeFactory: null
    }),
    /process probe factory/
  );
});
