const { SchemaValidator } = require("./SchemaValidator");

function isPlainObject(value) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

class ConfigManager {
  constructor({ capabilityRegistry, storage, validator = new SchemaValidator() } = {}) {
    if (!capabilityRegistry || typeof capabilityRegistry.getMetadata !== "function") {
      throw new TypeError("ConfigManager requires a capability registry");
    }

    if (!storage || typeof storage.load !== "function" || typeof storage.save !== "function") {
      throw new TypeError("ConfigManager requires configuration storage");
    }

    if (!validator || typeof validator.validateValues !== "function"
      || typeof validator.getMissingRequired !== "function") {
      throw new TypeError("ConfigManager requires a schema validator");
    }

    this.capabilityRegistry = capabilityRegistry;
    this.storage = storage;
    this.validator = validator;
    this.loadConfig();
  }

  // ponytail: reloads cover sequential host changes; simultaneous cross-process writes stay last-writer-wins until concurrent settings writers justify a file lock.
  loadConfig() {
    const config = this.storage.load();
    if (!isPlainObject(config)) {
      throw new TypeError("Stored configuration root must be an object");
    }
    return config;
  }

  getSchema(capabilityId) {
    const metadata = this.capabilityRegistry.getMetadata(capabilityId);
    if (!metadata) {
      throw new Error(`Unknown capability: ${capabilityId}`);
    }
    return metadata.configSchema;
  }

  getCapabilityValues(capabilityId, config = this.loadConfig()) {
    const values = Object.hasOwn(config, capabilityId) ? config[capabilityId] : undefined;
    if (values === undefined) {
      return {};
    }
    if (!isPlainObject(values)) {
      throw new TypeError(`Stored configuration for ${capabilityId} must be an object`);
    }
    return values;
  }

  save(capabilityId, values, { requireComplete = false } = {}) {
    const schema = this.getSchema(capabilityId);
    this.validator.validateValues(schema, values);
    const missing = requireComplete ? this.validator.getMissingRequired(schema, values) : [];
    if (missing.length > 0) {
      throw new Error(
        `Capability ${capabilityId} is missing required configuration: ${missing.join(", ")}`
      );
    }

    const nextConfig = {
      ...this.loadConfig(),
      [capabilityId]: { ...values }
    };
    this.storage.save(nextConfig);
    return { ...nextConfig[capabilityId] };
  }

  get(capabilityId, key) {
    const schema = this.getSchema(capabilityId);
    const values = this.getCapabilityValues(capabilityId);
    this.validator.validateValues(schema, values);
    if (key === undefined) {
      return { ...values };
    }
    if (!Object.hasOwn(schema, key)) {
      throw new TypeError(`Unknown configuration key: ${key}`);
    }
    return Object.hasOwn(values, key) ? values[key] : null;
  }

  update(capabilityId, patch) {
    if (!isPlainObject(patch)) {
      throw new TypeError("Capability configuration patch must be an object");
    }
    const schema = this.getSchema(capabilityId);
    const config = this.loadConfig();
    const values = {
      ...this.getCapabilityValues(capabilityId, config),
      ...patch
    };
    this.validator.validateValues(schema, values);
    this.storage.save({ ...config, [capabilityId]: { ...values } });
    return { ...values };
  }

  reset(capabilityId) {
    this.getSchema(capabilityId);
    const config = this.loadConfig();
    delete config[capabilityId];
    this.storage.save(config);
    return {};
  }

  assertConfigured(capabilityId) {
    const schema = this.getSchema(capabilityId);
    const values = this.getCapabilityValues(capabilityId);
    const missing = this.validator.getMissingRequired(schema, values);
    if (missing.length > 0) {
      throw new Error(
        `Capability ${capabilityId} is missing required configuration: ${missing.join(", ")}`
      );
    }
    this.validator.validateValues(schema, values);
  }

  forCapability(capabilityId) {
    this.getSchema(capabilityId);
    return {
      get: (key) => this.get(capabilityId, key)
    };
  }
}

module.exports = { ConfigManager };
