const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const { BindingStorage } = require("./BindingStorage");
const { loadCommands } = require("../command-engine/registry");

function createStorage(t) {
  const appDataPath = fs.mkdtempSync(path.join(os.tmpdir(), "clackly-bindings-"));
  t.after(() => fs.rmSync(appDataPath, { recursive: true, force: true }));
  return BindingStorage.fromAppData(appDataPath);
}

test("binding storage initializes, normalizes, persists, and validates bindings", (t) => {
  const storage = createStorage(t);
  const defaultBindings = storage.load();

  assert.equal(storage.filePath.endsWith(path.join("Clackly", "bindings.json")), true);
  assert.deepEqual(defaultBindings["timeline.addMarker.left-click"], {
    target: "timeline.addMarker",
    trigger: { type: "mouse", button: "left", modifiers: [] },
    action: { command: "timeline.addMarker" }
  });
  assert.deepEqual(defaultBindings["timeline.exportToAfterEffects.ctrl-shift-left-click"], {
    target: "timeline.exportToAfterEffects",
    trigger: { type: "mouse", button: "left", modifiers: ["CTRL", "SHIFT"] },
    action: { command: "timeline.exportCyanRangeToAfterEffects" }
  });
  assert.deepEqual(Object.fromEntries(
    Object.entries(defaultBindings).map(([id, binding]) => [id, {
      target: binding.target,
      modifiers: binding.trigger.modifiers,
      action: binding.action.command
    }])
  ), {
    "timeline.addMarker.left-click": {
      target: "timeline.addMarker", modifiers: [], action: "timeline.addMarker"
    },
    "timeline.exportToAfterEffects.left-click": {
      target: "timeline.exportToAfterEffects", modifiers: [], action: "timeline.exportToAfterEffects"
    },
    "timeline.exportToAfterEffects.ctrl-left-click": {
      target: "timeline.exportToAfterEffects", modifiers: ["CTRL"], action: "timeline.exportCurrentToAfterEffects"
    },
    "timeline.exportToAfterEffects.shift-left-click": {
      target: "timeline.exportToAfterEffects", modifiers: ["SHIFT"], action: "timeline.exportBlueRangeToAfterEffects"
    },
    "timeline.exportToAfterEffects.ctrl-shift-left-click": {
      target: "timeline.exportToAfterEffects", modifiers: ["CTRL", "SHIFT"], action: "timeline.exportCyanRangeToAfterEffects"
    },
    "timeline.exportCurrentToAfterEffects.left-click": {
      target: "timeline.exportCurrentToAfterEffects", modifiers: [], action: "timeline.exportCurrentToAfterEffects"
    },
    "timeline.exportBlueRangeToAfterEffects.left-click": {
      target: "timeline.exportBlueRangeToAfterEffects", modifiers: [], action: "timeline.exportBlueRangeToAfterEffects"
    },
    "timeline.exportCyanRangeToAfterEffects.left-click": {
      target: "timeline.exportCyanRangeToAfterEffects", modifiers: [], action: "timeline.exportCyanRangeToAfterEffects"
    }
  });
  assert.equal(Object.keys(defaultBindings).length, 8);
  assert.deepEqual(JSON.parse(fs.readFileSync(storage.filePath, "utf8")), defaultBindings);

  const oldDefault = {
    "timeline.addMarker.left-click": {
      target: "timeline.addMarker",
      trigger: { type: "mouse", button: "left", modifiers: [] },
      action: { command: "timeline.addMarker" }
    }
  };
  fs.writeFileSync(storage.filePath, JSON.stringify(oldDefault), "utf8");
  assert.deepEqual(storage.load(), defaultBindings);

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
    { broken: { target: "timeline.addMarker", trigger: { type: "mouse", button: "left", modifiers: ["META"] }, action: { command: "x" } } },
    { broken: { target: "timeline.addMarker", trigger: { type: "mouse", button: "left", modifiers: ["CTRL", "CTRL"] }, action: { command: "x" } } }
  ]) {
    assert.throws(() => storage.save(invalid), /must|unsupported|duplicate/);
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

test("default After Effects bindings generate interaction help from Command descriptions", async (t) => {
  const { getInteractionHelp } = await import("../electron/renderer/model.mjs");
  const bindings = Object.entries(createStorage(t).load()).map(([id, binding]) => ({
    id,
    ...binding
  }));
  const commands = loadCommands();
  const target = commands.find(({ id }) => id === "timeline.exportToAfterEffects");

  assert.deepEqual(getInteractionHelp(target, commands, bindings), [
    {
      label: "Click",
      description: "Automatically send the current Resolve selection to After Effects"
    },
    {
      label: "Ctrl + Click",
      description: "Send the current Resolve clip to After Effects"
    },
    {
      label: "Shift + Click",
      description: "Send video in the Blue marker range to After Effects"
    },
    {
      label: "Ctrl + Shift + Click",
      description: "Send video and audio in the Cyan marker range to After Effects"
    }
  ]);
});
