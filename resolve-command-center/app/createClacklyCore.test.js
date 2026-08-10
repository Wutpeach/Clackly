const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const { createClacklyCore } = require("./createClacklyCore");
const { RuntimeManager } = require("../script-runtime/runtime/manager");
const appRoot = path.resolve(__dirname, "..");

function createCore(overrides = {}) {
  const temporaryDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "clackly-core-"));
  const core = createClacklyCore({
    appRoot,
    appDataPath: path.join(temporaryDirectory, "appdata"),
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
    cleanup() {
      fs.rmSync(temporaryDirectory, { recursive: true, force: true });
    }
  };
}

test("Core returns working application services with marker and script capabilities", async (t) => {
  const { core, cleanup } = createCore();
  t.after(cleanup);

  assert.equal(core.capabilityRegistry.get("marker.add").metadata.id, "marker.add");
  assert.equal(
    core.capabilityRegistry.get("media.clipboard-image.import").metadata.id,
    "media.clipboard-image.import"
  );
  assert.equal(core.capabilityRegistry.get("ae.export").metadata.executor.entry, "scripts/resolve2ae_export.py");

  assert.deepEqual(await core.executeCommand("timeline.addMarker"), {
    ok: true,
    backend: "resolveScriptApi"
  });

  assert.deepEqual(core.featureCatalog.getAllFeatures().map(({ id }) => id).sort(), [
    "ae.export",
    "marker.add",
    "media.clipboard-image.import"
  ]);
  assert.deepEqual(core.configManager.get("marker.add"), {});
  core.configManager.save("ae.export", { aePath: "C:\\fake\\AfterFX.exe" });

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
});
