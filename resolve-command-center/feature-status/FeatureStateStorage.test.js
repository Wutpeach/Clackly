const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const { FeatureStateStorage } = require("./FeatureStateStorage");

test("feature state storage defaults enabled and persists only feature enablement", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "clackly-feature-state-"));
  const storage = FeatureStateStorage.fromAppData(root);

  assert.equal(storage.getEnabled("marker.add"), true);
  storage.setEnabled("marker.add", false);
  assert.equal(storage.getEnabled("marker.add"), false);
  assert.deepEqual(JSON.parse(fs.readFileSync(
    path.join(root, "Clackly", "feature-status.json"),
    "utf8"
  )), { "marker.add": { enabled: false } });
});

test("feature state storage reloads and preserves unrelated feature entries", () => {
  let state = { legacy: { enabled: false } };
  const first = new FeatureStateStorage("ignored");
  const second = new FeatureStateStorage("ignored");
  for (const storage of [first, second]) {
    storage.storage = {
      load: () => structuredClone(state),
      save: (next) => { state = structuredClone(next); }
    };
  }

  first.setEnabled("marker.add", false);
  second.setEnabled("ae.export", true);
  assert.deepEqual(state, {
    legacy: { enabled: false },
    "marker.add": { enabled: false },
    "ae.export": { enabled: true }
  });
  assert.equal(first.getEnabled("ae.export"), true);
});

test("feature state storage rejects malformed persisted enablement", () => {
  for (const entry of [
    { enabled: "yes" },
    {},
    { enabled: false, status: "error" }
  ]) {
    const storage = new FeatureStateStorage("ignored");
    storage.storage = { load: () => ({ broken: entry }) };
    assert.throws(() => storage.getEnabled("broken"), /only enabled boolean/);
  }
});
