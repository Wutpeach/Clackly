const READY_DETAILS = Object.freeze({ missing: [], action: null });
const PROBE_STATUSES = new Set(["ready", "missing-dependency", "unavailable"]);

function snapshot(record) {
  return structuredClone(record);
}

function record(id, installed, enabled, status, message = null, missing = [], action = null) {
  return { id, installed, enabled, status, message, details: { missing, action } };
}

function loadingRecord(id, enabled) {
  return record(id, true, enabled, "loading", "Checking feature availability…");
}

function normalizeProbeResult(result) {
  if (!result || typeof result !== "object" || Array.isArray(result)
    || !PROBE_STATUSES.has(result.status)) {
    throw new TypeError("Capability availability probe returned an invalid status");
  }

  const details = result.details ?? READY_DETAILS;
  if (!details || typeof details !== "object" || Array.isArray(details)
    || !Array.isArray(details.missing)
    || details.missing.some((item) => typeof item !== "string" || !item.trim())
    || (details.action !== null && details.action !== "open-settings")) {
    throw new TypeError("Capability availability probe returned invalid details");
  }

  if (result.message !== undefined && result.message !== null && typeof result.message !== "string") {
    throw new TypeError("Capability availability probe returned an invalid message");
  }
  if (result.status === "missing-dependency" && details.missing.length === 0) {
    throw new TypeError("Missing dependency status requires dependency ids");
  }
  if (result.status !== "missing-dependency" && details.missing.length > 0) {
    throw new TypeError("Only missing dependency status may name dependencies");
  }
  if ((result.status === "ready" || result.status === "unavailable") && details.action !== null) {
    throw new TypeError(`${result.status} status cannot expose a recovery action`);
  }

  const missing = [...details.missing];
  const defaults = {
    ready: null,
    "missing-dependency": `Missing ${missing.join(", ")}`,
    unavailable: "Feature is unavailable."
  };
  return {
    status: result.status,
    message: result.message ?? defaults[result.status],
    missing,
    action: details.action
  };
}

class FeatureStatusManager {
  constructor({ capabilityRegistry, configManager, stateStorage } = {}) {
    if (!capabilityRegistry || typeof capabilityRegistry.get !== "function"
      || typeof capabilityRegistry.getAllCapabilities !== "function") {
      throw new TypeError("FeatureStatusManager requires a capability registry");
    }
    if (!configManager || typeof configManager.getMissingRequired !== "function") {
      throw new TypeError("FeatureStatusManager requires a config manager");
    }
    if (!stateStorage || typeof stateStorage.getEnabled !== "function"
      || typeof stateStorage.setEnabled !== "function") {
      throw new TypeError("FeatureStatusManager requires feature state storage");
    }
    this.capabilityRegistry = capabilityRegistry;
    this.configManager = configManager;
    this.stateStorage = stateStorage;
    this.cache = new Map();
  }

  isInstalled(featureId) {
    return Boolean(this.capabilityRegistry.get(featureId));
  }

  get(featureId) {
    if (!this.isInstalled(featureId)) {
      return record(featureId, false, true, "unavailable", "Feature is not installed.");
    }
    if (!this.cache.has(featureId)) {
      try {
        this.cache.set(featureId, loadingRecord(featureId, this.stateStorage.getEnabled(featureId)));
      } catch (_error) {
        this.cache.set(featureId, record(
          featureId,
          true,
          true,
          "error",
          "Unable to determine feature status."
        ));
      }
    }
    return snapshot(this.cache.get(featureId));
  }

  list() {
    return this.capabilityRegistry.getAllCapabilities().map(({ id }) => this.get(id));
  }

  async refresh(featureId) {
    if (featureId !== undefined) {
      if (!this.isInstalled(featureId)) return this.get(featureId);
      return this.refreshOne(featureId);
    }
    return Promise.all(this.capabilityRegistry.getAllCapabilities().map(({ id }) => this.refreshOne(id)));
  }

  async refreshOne(featureId) {
    let enabled = this.cache.get(featureId)?.enabled ?? true;
    try {
      enabled = this.stateStorage.getEnabled(featureId);
      this.cache.set(featureId, loadingRecord(featureId, enabled));
      const missingFields = this.configManager.getMissingRequired(featureId);
      if (missingFields.length > 0) {
        const next = record(
          featureId,
          true,
          enabled,
          "missing-config",
          `Missing ${missingFields.map(({ label }) => label).join(", ")}`,
          missingFields.map(({ key }) => key),
          "open-settings"
        );
        this.cache.set(featureId, next);
        return snapshot(next);
      }

      const capability = this.capabilityRegistry.get(featureId);
      if (typeof capability.checkAvailability !== "function") {
        const next = record(featureId, true, enabled, "ready");
        this.cache.set(featureId, next);
        return snapshot(next);
      }

      const probe = normalizeProbeResult(await capability.checkAvailability());
      const next = record(
        featureId,
        true,
        enabled,
        probe.status,
        probe.message,
        probe.missing,
        probe.action
      );
      this.cache.set(featureId, next);
      return snapshot(next);
    } catch (_error) {
      const next = record(
        featureId,
        true,
        enabled,
        "error",
        "Unable to determine feature status."
      );
      this.cache.set(featureId, next);
      return snapshot(next);
    }
  }

  async setEnabled(featureId, enabled) {
    if (!this.isInstalled(featureId)) throw new Error(`Unknown feature: ${featureId}`);
    if (typeof enabled !== "boolean") throw new TypeError("Feature enabled state must be a boolean");
    this.stateStorage.setEnabled(featureId, enabled);
    const current = this.get(featureId);
    this.cache.set(featureId, { ...current, enabled });
    return this.refreshOne(featureId);
  }

  assertEnabled(featureId) {
    if (!this.isInstalled(featureId)) throw new Error(`Unknown feature: ${featureId}`);
    if (!this.stateStorage.getEnabled(featureId)) {
      throw new Error(`Feature is disabled: ${featureId}`);
    }
  }
}

module.exports = { FeatureStatusManager };
