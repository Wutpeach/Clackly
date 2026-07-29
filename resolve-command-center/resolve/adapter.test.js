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
