const test = require("node:test");
const assert = require("node:assert/strict");
const { createResolveAdapter } = require("./adapter");

function createResolve({ added = true, markers = {}, addMarkerError = null } = {}) {
  const timeline = {
    GetCurrentTimecode: () => "01:00:10:00",
    GetStartTimecode: () => "01:00:00:00",
    GetStartFrame: () => 86400,
    GetEndFrame: () => 90000,
    GetSetting: name => name === "timelineFrameRate" ? "24" : null,
    GetMarkers: () => markers,
    AddMarker(...args) {
      this.addMarkerArgs = args;
      if (addMarkerError) {
        throw addMarkerError;
      }
      return added;
    }
  };
  const project = { GetCurrentTimeline: () => timeline };
  const projectManager = { GetCurrentProject: () => project };

  return {
    resolve: { GetProjectManager: () => projectManager },
    timeline
  };
}

test("adds a marker using a timeline-relative frame id", async () => {
  const { resolve, timeline } = createResolve();
  const adapter = createResolveAdapter({ getResolve: async () => resolve });

  assert.deepEqual(await adapter.addMarker(), { ok: true, frame: 240 });
  assert.deepEqual(timeline.addMarkerArgs, [
    240,
    "Red",
    "Clackly Marker",
    "Added from Clackly",
    1,
    "clackly"
  ]);
});

test("reports a marker already present at the relative frame", async () => {
  const { resolve } = createResolve({ added: false, markers: { 240: {} } });
  const adapter = createResolveAdapter({ getResolve: async () => resolve });

  await assert.rejects(adapter.addMarker(), /already exists.*timeline-relative frame 240/);
});

test("wraps Resolve marker errors with timecode and frame context", async () => {
  const { resolve } = createResolve({ addMarkerError: new Error("native failure") });
  const adapter = createResolveAdapter({ getResolve: async () => resolve });

  await assert.rejects(
    adapter.addMarker(),
    /01:00:10:00.*timeline-relative frame 240.*native failure/
  );
});

function createMediaPoolResolve({
  existingBin = true,
  importResult = [{}],
  createResult = undefined,
  openResult = true,
  restoreResult = true
} = {}) {
  const calls = [];
  const original = { GetName: () => "Original" };
  const clipboardBin = { GetName: () => "Clipboard" };
  const root = {
    GetSubFolderList: () => existingBin ? { 1: clipboardBin } : {}
  };
  let setCount = 0;
  const mediaPool = {
    GetRootFolder: () => root,
    GetCurrentFolder: () => original,
    AddSubFolder(parent, name) {
      calls.push(["AddSubFolder", parent, name]);
      return createResult === undefined ? clipboardBin : createResult;
    },
    SetCurrentFolder(folder) {
      setCount += 1;
      calls.push(["SetCurrentFolder", folder]);
      return setCount === 1 ? openResult : restoreResult;
    },
    ImportMedia(paths) {
      calls.push(["ImportMedia", paths]);
      if (importResult instanceof Error) throw importResult;
      return importResult;
    }
  };
  const project = {
    GetName: () => "Demo Project",
    GetMediaPool: () => mediaPool,
    GetCurrentTimeline: () => null
  };
  const resolve = {
    GetProjectManager: () => ({ GetCurrentProject: () => project })
  };
  return { calls, clipboardBin, original, resolve };
}

test("Media Pool import reuses Clipboard bin and restores the original folder", async () => {
  const fixture = createMediaPoolResolve();
  const adapter = createResolveAdapter({ getResolve: async () => fixture.resolve });

  assert.equal(await adapter.getCurrentProjectName(), "Demo Project");
  assert.deepEqual(await adapter.importMediaToBin({
    diskPath: "C:\\Pictures\\image.png",
    binName: "Clipboard"
  }), { mediaPoolBin: "Clipboard", imported: true });
  assert.deepEqual(fixture.calls, [
    ["SetCurrentFolder", fixture.clipboardBin],
    ["ImportMedia", ["C:\\Pictures\\image.png"]],
    ["SetCurrentFolder", fixture.original]
  ]);
});

test("Media Pool import creates a missing root-level Clipboard bin", async () => {
  const fixture = createMediaPoolResolve({ existingBin: false });
  const adapter = createResolveAdapter({ getResolve: async () => fixture.resolve });
  await adapter.importMediaToBin({ diskPath: "image.png", binName: "Clipboard" });

  assert.equal(fixture.calls[0][0], "AddSubFolder");
  assert.equal(fixture.calls[0][2], "Clipboard");
  assert.equal(fixture.calls.some(([name]) => name === "ImportMedia"), true);
});

test("Media Pool bin creation failure stops before import", async () => {
  const fixture = createMediaPoolResolve({ existingBin: false, createResult: null });
  const adapter = createResolveAdapter({ getResolve: async () => fixture.resolve });

  await assert.rejects(
    adapter.importMediaToBin({ diskPath: "image.png", binName: "Clipboard" }),
    (error) => error.code === "media-pool-bin-create-failed"
  );
  assert.equal(fixture.calls.some(([name]) => name === "ImportMedia"), false);
});

test("ImportMedia failure still restores the original Media Pool folder", async () => {
  const fixture = createMediaPoolResolve({ importResult: new Error("native import failure") });
  const adapter = createResolveAdapter({ getResolve: async () => fixture.resolve });

  await assert.rejects(
    adapter.importMediaToBin({ diskPath: "image.png", binName: "Clipboard" }),
    (error) => error.code === "media-pool-import-failed"
  );
  assert.deepEqual(fixture.calls.at(-1), ["SetCurrentFolder", fixture.original]);
});

test("opening the target bin has its own structured error and still restores", async () => {
  const fixture = createMediaPoolResolve({ openResult: false });
  const adapter = createResolveAdapter({ getResolve: async () => fixture.resolve });

  await assert.rejects(
    adapter.importMediaToBin({ diskPath: "image.png", binName: "Clipboard" }),
    (error) => error.code === "media-pool-bin-open-failed"
  );
  assert.equal(fixture.calls.some(([name]) => name === "ImportMedia"), false);
  assert.deepEqual(fixture.calls.at(-1), ["SetCurrentFolder", fixture.original]);
});

test("restore failure returns successful import with warning and logs it", async () => {
  const fixture = createMediaPoolResolve({ restoreResult: false });
  const warnings = [];
  const adapter = createResolveAdapter({
    getResolve: async () => fixture.resolve,
    logger: { warn: (message) => warnings.push(message) }
  });

  const result = await adapter.importMediaToBin({ diskPath: "image.png", binName: "Clipboard" });
  assert.equal(result.imported, true);
  assert.deepEqual(result.warnings, [{
    code: "media-pool-folder-restore-failed",
    message: "Resolve could not restore the previous Media Pool folder"
  }]);
  assert.equal(warnings.length, 1);
});

test("missing current project returns a structured Resolve runtime error", async () => {
  const adapter = createResolveAdapter({
    getResolve: async () => ({
      GetProjectManager: () => ({ GetCurrentProject: () => null })
    })
  });
  await assert.rejects(
    adapter.getCurrentProjectName(),
    (error) => error.code === "resolve-project-unavailable"
  );
});
