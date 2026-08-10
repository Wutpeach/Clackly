const fs = require("node:fs");
const path = require("node:path");

const { ConfigStorage } = require("../config/ConfigStorage");
const { normalizeTrigger } = require("./trigger");

const PRIMARY_AE_TARGET = "timeline.exportToAfterEffects";
const LEGACY_AE_TARGETS = new Set([
  "timeline.exportCurrentToAfterEffects",
  "timeline.exportBlueRangeToAfterEffects",
  "timeline.exportCyanRangeToAfterEffects"
]);

const OLD_DEFAULT_BINDINGS = {
  "timeline.addMarker.left-click": {
    target: "timeline.addMarker",
    trigger: { type: "mouse", button: "left", modifiers: [] },
    action: { command: "timeline.addMarker" }
  }
};

const SHIPPED_AE_DEFAULT_BINDINGS = {
  ...OLD_DEFAULT_BINDINGS,
  "timeline.exportToAfterEffects.left-click": {
    target: PRIMARY_AE_TARGET,
    trigger: { type: "mouse", button: "left", modifiers: [] },
    action: { command: PRIMARY_AE_TARGET }
  },
  "timeline.exportToAfterEffects.ctrl-left-click": {
    target: PRIMARY_AE_TARGET,
    trigger: { type: "mouse", button: "left", modifiers: ["CTRL"] },
    action: { command: "timeline.exportCurrentToAfterEffects" }
  },
  "timeline.exportToAfterEffects.shift-left-click": {
    target: PRIMARY_AE_TARGET,
    trigger: { type: "mouse", button: "left", modifiers: ["SHIFT"] },
    action: { command: "timeline.exportBlueRangeToAfterEffects" }
  },
  "timeline.exportToAfterEffects.ctrl-shift-left-click": {
    target: PRIMARY_AE_TARGET,
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

const PRE_IMAGE_CLIPBOARD_DEFAULT_BINDINGS = {
  ...OLD_DEFAULT_BINDINGS,
  "timeline.exportToAfterEffects.left-click": {
    target: PRIMARY_AE_TARGET,
    trigger: { type: "mouse", button: "left", modifiers: [] },
    action: { command: PRIMARY_AE_TARGET }
  },
  "timeline.exportToAfterEffects.ctrl-left-click": {
    target: PRIMARY_AE_TARGET,
    trigger: { type: "mouse", button: "left", modifiers: ["CTRL"] },
    action: { command: "timeline.exportAudioToAfterEffects" }
  },
  "timeline.exportToAfterEffects.ctrl-shift-left-click": {
    target: PRIMARY_AE_TARGET,
    trigger: { type: "mouse", button: "left", modifiers: ["CTRL", "SHIFT"] },
    action: { command: "timeline.exportVideoToAfterEffects" }
  }
};

const DEFAULT_BINDINGS = {
  ...PRE_IMAGE_CLIPBOARD_DEFAULT_BINDINGS,
  "media.clipboard-image.import.left-click": {
    target: "media.clipboard-image.import",
    trigger: { type: "mouse", button: "left", modifiers: [] },
    action: { command: "media.clipboard-image.import" }
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

function canonicalEntries(bindings) {
  return Object.entries(normalizeBindings(bindings))
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([id, binding]) => [
      id,
      binding.target,
      binding.trigger.type,
      binding.trigger.button,
      ...binding.trigger.modifiers,
      binding.action.command
    ]);
}

function sameBindings(left, right) {
  const leftEntries = canonicalEntries(left);
  const rightEntries = canonicalEntries(right);
  if (leftEntries.length !== rightEntries.length) return false;
  return leftEntries.every((entry, index) => {
    const other = rightEntries[index];
    return entry.length === other.length
      && entry.every((value, valueIndex) => value === other[valueIndex]);
  });
}

function hasLegacyAeTargets(bindings) {
  return Object.values(bindings).some((binding) => LEGACY_AE_TARGETS.has(binding.target));
}

function defaultMigrationWarning(message) {
  console.warn(message);
}

class BindingStorage {
  constructor(filePath, { onMigrationWarning = defaultMigrationWarning } = {}) {
    this.storage = new ConfigStorage(filePath);
    this.filePath = this.storage.filePath;
    this.onMigrationWarning = onMigrationWarning;
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
    if (sameBindings(bindings, OLD_DEFAULT_BINDINGS)
      || sameBindings(bindings, SHIPPED_AE_DEFAULT_BINDINGS)
      || sameBindings(bindings, PRE_IMAGE_CLIPBOARD_DEFAULT_BINDINGS)) {
      return this.save(DEFAULT_BINDINGS);
    }
    if (hasLegacyAeTargets(bindings)) {
      return this.migrateCustomizedRoot(bindings);
    }
    return bindings;
  }

  save(bindings) {
    const normalized = normalizeBindings(bindings);
    this.storage.save(normalized);
    return normalized;
  }

  migrateCustomizedRoot(bindings) {
    const backupPath = `${this.filePath}.backup`;
    const entries = Object.entries(bindings).map(([id, binding]) => ({
      id,
      binding,
      originallyPrimary: binding.target === PRIMARY_AE_TARGET
    }));

    const groups = new Map();
    for (const entry of entries) {
      const binding = LEGACY_AE_TARGETS.has(entry.binding.target)
        ? { ...entry.binding, target: PRIMARY_AE_TARGET }
        : entry.binding;
      const signature = JSON.stringify([
        binding.target,
        binding.trigger.type,
        binding.trigger.button,
        ...binding.trigger.modifiers
      ]);
      const group = groups.get(signature) || [];
      group.push({ ...entry, binding });
      groups.set(signature, group);
    }

    const kept = [];
    const collisions = [];
    for (const group of groups.values()) {
      if (group.length === 1) {
        kept.push(group[0]);
        continue;
      }
      const winner = group.find((entry) => entry.originallyPrimary)
        || group.slice().sort((left, right) => left.id.localeCompare(right.id))[0];
      kept.push(winner);
      for (const loser of group) {
        if (loser.id === winner.id) continue;
        if (loser.binding.action.command !== winner.binding.action.command) {
          collisions.push({ kept: winner, skipped: loser });
        }
      }
    }

    const migrated = Object.fromEntries(kept.map(({ id, binding }) => [id, binding]));
    fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
    fs.writeFileSync(backupPath, `${JSON.stringify(bindings, null, 2)}\n`, "utf8");
    const saved = this.save(migrated);
    if (collisions.length > 0) {
      const details = collisions.map(({ kept: winner, skipped: loser }) => ({
        kept: { id: winner.id, action: winner.binding.action.command },
        skipped: { id: loser.id, action: loser.binding.action.command }
      }));
      this.onMigrationWarning([
        "Clackly migrated customized After Effects bindings to the single Export to After Effects card.",
        `Backup written to ${backupPath}.`,
        `Collisions: ${details.map(({ kept: winner, skipped: loser }) => (
          `kept ${winner.id} (${winner.action}); skipped ${loser.id} (${loser.action})`
        )).join("; ")}`
      ].join(" "));
    }
    return saved;
  }
}

module.exports = { BindingStorage };
