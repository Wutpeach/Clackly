const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const { BindingStorage } = require("./BindingStorage");

function createStorage(t) {
  const appDataPath = fs.mkdtempSync(path.join(os.tmpdir(), "clackly-bindings-"));
  t.after(() => fs.rmSync(appDataPath, { recursive: true, force: true }));
  return BindingStorage.fromAppData(appDataPath);
}

test("binding storage initializes, normalizes, persists, and validates bindings", (t) => {
  const storage = createStorage(t);
  const defaultBindings = storage.load();

  assert.equal(storage.filePath.endsWith(path.join("Clackly", "bindings.json")), true);
  assert.deepEqual(defaultBindings, {
    "timeline.addMarker.left-click": {
      target: "timeline.addMarker",
      trigger: { type: "mouse", button: "left", modifiers: [] },
      action: { command: "timeline.addMarker" }
    }
  });
  assert.deepEqual(JSON.parse(fs.readFileSync(storage.filePath, "utf8")), defaultBindings);

  const bindings = {
    modified: {
      target: "timeline.addMarker",
      trigger: { type: "mouse", button: "right", modifiers: ["ALT", "CTRL", "SHIFT"] },
      action: { command: "timeline.otherCommand" }
    }
  };
  const saved = storage.save(bindings);
  bindings.modified.action.command = "changed.after.save";
  saved.modified.trigger.modifiers.push("ALT");
  assert.deepEqual(storage.load(), {
    modified: {
      target: "timeline.addMarker",
      trigger: { type: "mouse", button: "right", modifiers: ["CTRL", "SHIFT", "ALT"] },
      action: { command: "timeline.otherCommand" }
    }
  });

  storage.save({});
  assert.deepEqual(storage.load(), {});

  fs.writeFileSync(storage.filePath, JSON.stringify({ broken: { target: "timeline.addMarker" } }), "utf8");
  assert.throws(() => storage.load(), /Binding broken/);

  for (const invalid of [
    [],
    new Date(),
    { broken: { target: "timeline.addMarker", trigger: {}, action: { command: "x" } } },
    { broken: { target: "timeline.addMarker", trigger: { type: "mouse", button: "middle", modifiers: [] }, action: { command: "x" } } },
    { broken: { target: "timeline.addMarker", trigger: { type: "mouse", button: "left", modifiers: ["META"] }, action: { command: "x" } } }
  ]) {
    assert.throws(() => storage.save(invalid), /must|unsupported/);
  }

  assert.throws(() => storage.save({
    first: {
      target: "timeline.addMarker",
      trigger: { type: "mouse", button: "left", modifiers: ["CTRL", "SHIFT"] },
      action: { command: "first.command" }
    },
    second: {
      target: "timeline.addMarker",
      trigger: { type: "mouse", button: "left", modifiers: ["SHIFT", "CTRL"] },
      action: { command: "second.command" }
    }
  }), /Duplicate interaction trigger/);
});
