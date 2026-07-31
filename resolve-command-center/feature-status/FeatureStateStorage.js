const path = require("node:path");

const { ConfigStorage } = require("../config/ConfigStorage");

function isPlainObject(value) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

class FeatureStateStorage {
  constructor(filePath) {
    this.storage = new ConfigStorage(filePath);
  }

  static fromAppData(appDataPath) {
    if (typeof appDataPath !== "string" || appDataPath.trim().length === 0) {
      throw new TypeError("FeatureStateStorage requires an appData path");
    }
    return new FeatureStateStorage(path.join(appDataPath, "Clackly", "feature-status.json"));
  }

  load() {
    const state = this.storage.load();
    for (const [featureId, entry] of Object.entries(state)) {
      if (!isPlainObject(entry)) {
        throw new TypeError(`Stored feature state for ${featureId} must be an object`);
      }
      if (Object.keys(entry).length !== 1 || typeof entry.enabled !== "boolean") {
        throw new TypeError(`Stored feature state for ${featureId} must contain only enabled boolean`);
      }
    }
    return state;
  }

  getEnabled(featureId) {
    const entry = this.load()[featureId];
    return entry?.enabled ?? true;
  }

  setEnabled(featureId, enabled) {
    if (typeof enabled !== "boolean") {
      throw new TypeError("Feature enabled state must be a boolean");
    }
    const state = this.load();
    state[featureId] = { enabled };
    this.storage.save(state);
    return enabled;
  }
}

module.exports = { FeatureStateStorage };
