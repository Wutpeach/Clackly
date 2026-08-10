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
    action: { command: "timeline.exportVideoToAfterEffects" }
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
      target: "timeline.exportToAfterEffects", modifiers: ["CTRL"], action: "timeline.exportAudioToAfterEffects"
    },
    "timeline.exportToAfterEffects.ctrl-shift-left-click": {
      target: "timeline.exportToAfterEffects", modifiers: ["CTRL", "SHIFT"], action: "timeline.exportVideoToAfterEffects"
    },
    "media.clipboard-image.import.left-click": {
      target: "media.clipboard-image.import", modifiers: [], action: "media.clipboard-image.import"
    }
  });
  assert.equal(Object.keys(defaultBindings).length, 5);
  assert.deepEqual(defaultBindings["media.clipboard-image.import.left-click"], {
    target: "media.clipboard-image.import",
    trigger: { type: "mouse", button: "left", modifiers: [] },
    action: { command: "media.clipboard-image.import" }
  });
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
      description: "Send the current Resolve audio selection to After Effects"
    },
    {
      label: "Ctrl + Shift + Click",
      description: "Send the current Resolve video selection to After Effects"
    }
  ]);
});

function shippedAeDefaultBindings() {
  return {
    "timeline.addMarker.left-click": {
      target: "timeline.addMarker",
      trigger: { type: "mouse", button: "left", modifiers: [] },
      action: { command: "timeline.addMarker" }
    },
    "timeline.exportToAfterEffects.left-click": {
      target: "timeline.exportToAfterEffects",
      trigger: { type: "mouse", button: "left", modifiers: [] },
      action: { command: "timeline.exportToAfterEffects" }
    },
    "timeline.exportToAfterEffects.ctrl-left-click": {
      target: "timeline.exportToAfterEffects",
      trigger: { type: "mouse", button: "left", modifiers: ["CTRL"] },
      action: { command: "timeline.exportCurrentToAfterEffects" }
    },
    "timeline.exportToAfterEffects.shift-left-click": {
      target: "timeline.exportToAfterEffects",
      trigger: { type: "mouse", button: "left", modifiers: ["SHIFT"] },
      action: { command: "timeline.exportBlueRangeToAfterEffects" }
    },
    "timeline.exportToAfterEffects.ctrl-shift-left-click": {
      target: "timeline.exportToAfterEffects",
      trigger: { type: "mouse", button: "left", modifiers: ["CTRL", "SHIFT"] },
      action: { command: "timeline.exportCyanRangeToAfterEffects" }
    },
    "timeline.exportCurrentToAfterEffects.left-click": {
      target: "timeline.exportCurrentToAfterEffects",
      trigger: { type: "mouse", button: "left", modifiers: [] },
      action: { command: "timeline.exportCurrentToAfterEffects" }
    },
    "timeline.exportBlueRangeToAfterEffects.left-click": {
      target: "timeline.exportBlueRangeToAfterEffects",
      trigger: { type: "mouse", button: "left", modifiers: [] },
      action: { command: "timeline.exportBlueRangeToAfterEffects" }
    },
    "timeline.exportCyanRangeToAfterEffects.left-click": {
      target: "timeline.exportCyanRangeToAfterEffects",
      trigger: { type: "mouse", button: "left", modifiers: [] },
      action: { command: "timeline.exportCyanRangeToAfterEffects" }
    }
  };
}

function shuffled(obj) {
  return Object.fromEntries(Object.entries(obj).reverse());
}

function writeBindings(storage, bindings) {
  fs.mkdirSync(path.dirname(storage.filePath), { recursive: true });
  fs.writeFileSync(storage.filePath, JSON.stringify(bindings), "utf8");
}

test("the shipped marker-plus-seven-AE default fingerprint migrates regardless of outer key order", (t) => {
  const storage = createStorage(t);
  writeBindings(storage, shuffled(shippedAeDefaultBindings()));

  const loaded = storage.load();
  assert.deepEqual(loaded, {
    "timeline.addMarker.left-click": {
      target: "timeline.addMarker",
      trigger: { type: "mouse", button: "left", modifiers: [] },
      action: { command: "timeline.addMarker" }
    },
    "timeline.exportToAfterEffects.left-click": {
      target: "timeline.exportToAfterEffects",
      trigger: { type: "mouse", button: "left", modifiers: [] },
      action: { command: "timeline.exportToAfterEffects" }
    },
    "timeline.exportToAfterEffects.ctrl-left-click": {
      target: "timeline.exportToAfterEffects",
      trigger: { type: "mouse", button: "left", modifiers: ["CTRL"] },
      action: { command: "timeline.exportAudioToAfterEffects" }
    },
    "timeline.exportToAfterEffects.ctrl-shift-left-click": {
      target: "timeline.exportToAfterEffects",
      trigger: { type: "mouse", button: "left", modifiers: ["CTRL", "SHIFT"] },
      action: { command: "timeline.exportVideoToAfterEffects" }
    },
    "media.clipboard-image.import.left-click": {
      target: "media.clipboard-image.import",
      trigger: { type: "mouse", button: "left", modifiers: [] },
      action: { command: "media.clipboard-image.import" }
    }
  });
  assert.equal(fs.existsSync(`${storage.filePath}.backup`), false);
});

function preImageClipboardDefaultBindings() {
  return {
    "timeline.addMarker.left-click": {
      target: "timeline.addMarker",
      trigger: { type: "mouse", button: "left", modifiers: [] },
      action: { command: "timeline.addMarker" }
    },
    "timeline.exportToAfterEffects.left-click": {
      target: "timeline.exportToAfterEffects",
      trigger: { type: "mouse", button: "left", modifiers: [] },
      action: { command: "timeline.exportToAfterEffects" }
    },
    "timeline.exportToAfterEffects.ctrl-left-click": {
      target: "timeline.exportToAfterEffects",
      trigger: { type: "mouse", button: "left", modifiers: ["CTRL"] },
      action: { command: "timeline.exportAudioToAfterEffects" }
    },
    "timeline.exportToAfterEffects.ctrl-shift-left-click": {
      target: "timeline.exportToAfterEffects",
      trigger: { type: "mouse", button: "left", modifiers: ["CTRL", "SHIFT"] },
      action: { command: "timeline.exportVideoToAfterEffects" }
    }
  };
}

test("an installed pre-Image-Clipboard default migrates to the shipped default with left-click binding", (t) => {
  const storage = createStorage(t);
  writeBindings(storage, shuffled(preImageClipboardDefaultBindings()));

  const loaded = storage.load();
  assert.deepEqual(loaded, {
    ...preImageClipboardDefaultBindings(),
    "media.clipboard-image.import.left-click": {
      target: "media.clipboard-image.import",
      trigger: { type: "mouse", button: "left", modifiers: [] },
      action: { command: "media.clipboard-image.import" }
    }
  });
  assert.equal(fs.existsSync(`${storage.filePath}.backup`), false);
  assert.equal(JSON.parse(fs.readFileSync(storage.filePath, "utf8"))["media.clipboard-image.import.left-click"].target, "media.clipboard-image.import");
});

test("a customized root with the Image Clipboard card absent stays user-owned", (t) => {
  const storage = createStorage(t);
  const customized = preImageClipboardDefaultBindings();
  customized["timeline.addMarker.left-click"].action.command = "custom.marker";
  writeBindings(storage, customized);

  const loaded = storage.load();
  assert.equal(loaded["timeline.addMarker.left-click"].action.command, "custom.marker");
  assert.equal(Object.hasOwn(loaded, "media.clipboard-image.import.left-click"), false);
  assert.equal(Object.keys(loaded).length, 4);
});

test("a one-field customization does not take the wholesale default path", (t) => {
  const storage = createStorage(t);
  const customized = shippedAeDefaultBindings();
  customized["timeline.exportToAfterEffects.ctrl-left-click"].action.command = "custom.audio";
  writeBindings(storage, shuffled(customized));

  const loaded = storage.load();
  assert.equal(loaded["timeline.exportToAfterEffects.ctrl-left-click"].action.command, "custom.audio");
  assert.equal(loaded["timeline.exportToAfterEffects.left-click"].action.command, "timeline.exportToAfterEffects");
  assert.equal(Object.keys(loaded).length, 5);
  assert.equal(JSON.parse(fs.readFileSync(`${storage.filePath}.backup`, "utf8"))["timeline.exportToAfterEffects.ctrl-left-click"].action.command, "custom.audio");
});

test("structural migration prefers original primary targets and warns once with diagnostics", (t) => {
  const storage = createStorage(t);
  const warnings = [];
  storage.onMigrationWarning = (message) => warnings.push(message);
  writeBindings(storage, {
    "timeline.exportCyanRangeToAfterEffects.left-click": {
      target: "timeline.exportCyanRangeToAfterEffects",
      trigger: { type: "mouse", button: "left", modifiers: [] },
      action: { command: "timeline.exportCyanRangeToAfterEffects" }
    },
    "timeline.exportToAfterEffects.left-click": {
      target: "timeline.exportToAfterEffects",
      trigger: { type: "mouse", button: "left", modifiers: [] },
      action: { command: "timeline.exportToAfterEffects" }
    },
    "timeline.exportToAfterEffects.ctrl-left-click": {
      target: "timeline.exportToAfterEffects",
      trigger: { type: "mouse", button: "left", modifiers: ["CTRL"] },
      action: { command: "timeline.exportCurrentToAfterEffects" }
    }
  });

  const loaded = storage.load();
  assert.equal(loaded["timeline.exportToAfterEffects.left-click"].action.command, "timeline.exportToAfterEffects");
  assert.equal(Object.hasOwn(loaded, "timeline.exportCyanRangeToAfterEffects.left-click"), false);
  assert.equal(loaded["timeline.exportToAfterEffects.ctrl-left-click"].action.command, "timeline.exportCurrentToAfterEffects");
  assert.equal(warnings.length, 1);
  assert.match(warnings[0], /kept timeline\.exportToAfterEffects\.left-click \(timeline\.exportToAfterEffects\)/);
  assert.match(warnings[0], /skipped timeline\.exportCyanRangeToAfterEffects\.left-click \(timeline\.exportCyanRangeToAfterEffects\)/);
  assert.match(warnings[0], /Backup written to .*bindings\.json\.backup/);

  // Idempotent reload: no re-migration, no second warning.
  assert.deepEqual(storage.load(), loaded);
  assert.equal(warnings.length, 1);
});

test("structural migration uses lexical precedence when no original primary exists", (t) => {
  const storage = createStorage(t);
  const warnings = [];
  storage.onMigrationWarning = (message) => warnings.push(message);
  writeBindings(storage, {
    "z.legacy.left-click": {
      target: "timeline.exportCyanRangeToAfterEffects",
      trigger: { type: "mouse", button: "left", modifiers: [] },
      action: { command: "timeline.exportCyanRangeToAfterEffects" }
    },
    "a.legacy.left-click": {
      target: "timeline.exportBlueRangeToAfterEffects",
      trigger: { type: "mouse", button: "left", modifiers: [] },
      action: { command: "timeline.exportBlueRangeToAfterEffects" }
    }
  });

  const loaded = storage.load();
  assert.deepEqual(Object.keys(loaded), ["a.legacy.left-click"]);
  assert.equal(loaded["a.legacy.left-click"].target, "timeline.exportToAfterEffects");
  assert.equal(loaded["a.legacy.left-click"].action.command, "timeline.exportBlueRangeToAfterEffects");
  assert.equal(warnings.length, 1);
  assert.match(warnings[0], /kept a\.legacy\.left-click/);
  assert.match(warnings[0], /skipped z\.legacy\.left-click/);
});

test("structural migration drops same-action losers without a warning", (t) => {
  const storage = createStorage(t);
  const warnings = [];
  storage.onMigrationWarning = (message) => warnings.push(message);
  writeBindings(storage, {
    "a.legacy.left-click": {
      target: "timeline.exportBlueRangeToAfterEffects",
      trigger: { type: "mouse", button: "left", modifiers: [] },
      action: { command: "timeline.exportBlueRangeToAfterEffects" }
    },
    "b.legacy.left-click": {
      target: "timeline.exportCyanRangeToAfterEffects",
      trigger: { type: "mouse", button: "left", modifiers: [] },
      action: { command: "timeline.exportBlueRangeToAfterEffects" }
    }
  });

  const loaded = storage.load();
  assert.deepEqual(Object.keys(loaded), ["a.legacy.left-click"]);
  assert.equal(warnings.length, 0);
  assert.equal(fs.existsSync(`${storage.filePath}.backup`), true);
});

test("structural migration backup failures abort before changing the active file", (t) => {
  const storage = createStorage(t);
  writeBindings(storage, {
    "legacy.only": {
      target: "timeline.exportBlueRangeToAfterEffects",
      trigger: { type: "mouse", button: "left", modifiers: [] },
      action: { command: "timeline.exportBlueRangeToAfterEffects" }
    }
  });
  const original = fs.readFileSync(storage.filePath, "utf8");
  fs.mkdirSync(`${storage.filePath}.backup`);

  assert.throws(() => storage.load(), /EISDIR|EEXIST|ENOTDIR|EPERM|failed/i);
  assert.equal(fs.readFileSync(storage.filePath, "utf8"), original);
});
