const fs = require("node:fs");
const path = require("node:path");

const { ConfigStorage } = require("../config/ConfigStorage");
const { normalizeTrigger } = require("./trigger");

const OLD_DEFAULT_BINDINGS = {
  "timeline.addMarker.left-click": {
    target: "timeline.addMarker",
    trigger: { type: "mouse", button: "left", modifiers: [] },
    action: { command: "timeline.addMarker" }
  }
};

const DEFAULT_BINDINGS = {
  ...OLD_DEFAULT_BINDINGS,
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

function requireObject(value, label, fields = null) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError(`${label} must be an object`);
  }
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) {
    throw new TypeError(`${label} must be a plain object`);
  }

  if (fields) {
    const keys = Object.keys(value).sort();
    const expected = [...fields].sort();
    if (keys.length !== expected.length || keys.some((key, index) => key !== expected[index])) {
      throw new TypeError(`${label} must contain only ${fields.join(", ")}`);
    }
  }
}

function requireText(value, label) {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new TypeError(`${label} must be a non-empty string`);
  }
}

function normalizeBindings(bindings) {
  requireObject(bindings, "Bindings root");

  const normalized = [];
  const triggers = new Set();
  for (const [id, binding] of Object.entries(bindings)) {
    requireText(id, "Binding id");
    requireObject(binding, `Binding ${id}`, ["target", "trigger", "action"]);
    requireText(binding.target, `Binding ${id} target`);
    requireObject(binding.action, `Binding ${id} action`, ["command"]);
    requireText(binding.action.command, `Binding ${id} action command`);

    const trigger = normalizeTrigger(binding.trigger, `Binding ${id} trigger`);
    const signature = JSON.stringify([
      binding.target,
      trigger.type,
      trigger.button,
      ...trigger.modifiers
    ]);
    if (triggers.has(signature)) {
      throw new TypeError(`Duplicate interaction trigger for binding ${id}`);
    }
    triggers.add(signature);

    normalized.push([id, {
      target: binding.target,
      trigger,
      action: { command: binding.action.command }
    }]);
  }

  return Object.fromEntries(normalized);
}

class BindingStorage {
  constructor(filePath) {
    this.storage = new ConfigStorage(filePath);
    this.filePath = this.storage.filePath;
  }

  static fromAppData(appDataPath) {
    if (typeof appDataPath !== "string" || appDataPath.trim().length === 0) {
      throw new TypeError("BindingStorage requires an appData path");
    }

    return new BindingStorage(path.join(appDataPath, "Clackly", "bindings.json"));
  }

  load() {
    if (!fs.existsSync(this.filePath)) {
      return this.save(DEFAULT_BINDINGS);
    }
    const bindings = normalizeBindings(this.storage.load());
    if (JSON.stringify(bindings) === JSON.stringify(normalizeBindings(OLD_DEFAULT_BINDINGS))) {
      return this.save(DEFAULT_BINDINGS);
    }
    return bindings;
  }

  save(bindings) {
    const normalized = normalizeBindings(bindings);
    this.storage.save(normalized);
    return normalized;
  }
}

module.exports = { BindingStorage };
