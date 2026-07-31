const fs = require("node:fs");
const path = require("node:path");

const { ConfigStorage } = require("../config/ConfigStorage");

const MODIFIERS = ["CTRL", "SHIFT", "ALT"];
const DEFAULT_BINDINGS = {
  "timeline.addMarker.left-click": {
    target: "timeline.addMarker",
    trigger: { type: "mouse", button: "left", modifiers: [] },
    action: { command: "timeline.addMarker" }
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

function normalizeModifiers(value, label) {
  if (!Array.isArray(value)) {
    throw new TypeError(`${label} must be an array`);
  }

  const modifiers = new Set();
  for (const modifier of value) {
    if (!MODIFIERS.includes(modifier)) {
      throw new TypeError(`${label} contains unsupported modifier: ${modifier}`);
    }
    if (modifiers.has(modifier)) {
      throw new TypeError(`${label} contains duplicate modifier: ${modifier}`);
    }
    modifiers.add(modifier);
  }

  return MODIFIERS.filter((modifier) => modifiers.has(modifier));
}

function normalizeBindings(bindings) {
  requireObject(bindings, "Bindings root");

  const normalized = [];
  const triggers = new Set();
  for (const [id, binding] of Object.entries(bindings)) {
    requireText(id, "Binding id");
    requireObject(binding, `Binding ${id}`, ["target", "trigger", "action"]);
    requireText(binding.target, `Binding ${id} target`);
    requireObject(binding.trigger, `Binding ${id} trigger`, ["type", "button", "modifiers"]);
    requireObject(binding.action, `Binding ${id} action`, ["command"]);

    if (binding.trigger.type !== "mouse") {
      throw new TypeError(`Binding ${id} trigger type must be mouse`);
    }
    if (binding.trigger.button !== "left" && binding.trigger.button !== "right") {
      throw new TypeError(`Binding ${id} trigger button must be left or right`);
    }
    requireText(binding.action.command, `Binding ${id} action command`);

    const modifiers = normalizeModifiers(binding.trigger.modifiers, `Binding ${id} modifiers`);
    const signature = JSON.stringify([
      binding.target,
      binding.trigger.type,
      binding.trigger.button,
      ...modifiers
    ]);
    if (triggers.has(signature)) {
      throw new TypeError(`Duplicate interaction trigger for binding ${id}`);
    }
    triggers.add(signature);

    normalized.push([id, {
      target: binding.target,
      trigger: {
        type: "mouse",
        button: binding.trigger.button,
        modifiers
      },
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
    return normalizeBindings(this.storage.load());
  }

  save(bindings) {
    const normalized = normalizeBindings(bindings);
    this.storage.save(normalized);
    return normalized;
  }
}

module.exports = { BindingStorage };
