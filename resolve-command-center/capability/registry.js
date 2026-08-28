const { SchemaValidator } = require("../config/SchemaValidator");

function isPlainObject(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }

  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function createCapabilityRegistry() {
  const capabilities = new Map();
  const schemaValidator = new SchemaValidator();
  const requiredMetadataStrings = [
    "id",
    "name",
    "description",
    "category",
    "icon",
    "version",
    "type"
  ];

  function register(capabilityId, capability) {
    if (typeof capabilityId !== "string" || capabilityId.trim().length === 0) {
      throw new TypeError("Capability registry requires a non-empty capability id");
    }

    if (!capability || typeof capability !== "object" || typeof capability.execute !== "function") {
      throw new TypeError("Capability registry requires an execution object with execute()");
    }

    const { metadata } = capability;
    if (!metadata || typeof metadata !== "object") {
      throw new TypeError("Capability registry requires capability metadata");
    }

    for (const field of requiredMetadataStrings) {
      if (typeof metadata[field] !== "string" || metadata[field].trim().length === 0) {
        throw new TypeError(`Capability metadata requires a non-empty ${field}`);
      }
    }

    if (!Array.isArray(metadata.providers) || Array.from(metadata.providers).some((provider) => (
      typeof provider !== "string" || provider.trim().length === 0
    ))) {
      throw new TypeError("Capability metadata providers must be an array of non-empty strings");
    }

    if (metadata.executor !== undefined) {
      if (!isPlainObject(metadata.executor)) {
        throw new TypeError("Capability metadata executor must be an object");
      }

      for (const field of ["type", "runtime", "entry"]) {
        if (typeof metadata.executor[field] !== "string"
          || metadata.executor[field].trim().length === 0) {
          throw new TypeError(`Capability metadata executor requires a non-empty ${field}`);
        }
      }

      if (metadata.executor.type !== "script") {
        throw new TypeError(`Unsupported capability executor type: ${metadata.executor.type}`);
      }
    }

    validateMetadataLocalizations(metadata);

    schemaValidator.validateSchema(metadata.configSchema);

    if (metadata.id !== capabilityId) {
      throw new TypeError("Capability metadata id must match the registered capability id");
    }

    if (capabilities.has(capabilityId)) {
      throw new Error(`Capability already registered: ${capabilityId}`);
    }

    capabilities.set(capabilityId, capability);
    return capability;
  }

  function get(capabilityId) {
    return capabilities.get(capabilityId) || null;
  }

  function getMetadata(capabilityId) {
    return get(capabilityId)?.metadata || null;
  }

  function getAllCapabilities() {
    return Array.from(capabilities.values(), ({ metadata }) => ({
      id: metadata.id,
      name: metadata.name,
      category: metadata.category,
      icon: metadata.icon
    }));
  }

  return { register, get, getMetadata, getAllCapabilities };
}

function validateMetadataLocalizations(metadata) {
  if (metadata.localizations !== undefined) {
    if (!isPlainObject(metadata.localizations)) {
      throw new TypeError("Capability metadata localizations must be an object");
    }
    for (const [locale, overlay] of Object.entries(metadata.localizations)) {
      if (!locale.trim() || !isPlainObject(overlay)) {
        throw new TypeError("Capability metadata localization must be an object");
      }
      for (const field of ["name", "description", "category"]) {
        if (overlay[field] !== undefined && (typeof overlay[field] !== "string" || !overlay[field].trim())) {
          throw new TypeError(`Capability metadata localization ${locale} has an invalid ${field}`);
        }
      }
    }
  }
  for (const [key, field] of Object.entries(metadata.configSchema || {})) {
    if (!isPlainObject(field)) continue;
    if (field.optionLabels !== undefined && !isNonEmptyStringMap(field.optionLabels)) {
      throw new TypeError(`Config schema field ${key} optionLabels must be an object of non-empty strings`);
    }
    if (field.localizations === undefined) continue;
    if (!isPlainObject(field.localizations)) {
      throw new TypeError(`Config schema field ${key} localizations must be an object`);
    }
    for (const [locale, overlay] of Object.entries(field.localizations)) {
      if (!locale.trim() || !isPlainObject(overlay)
        || (overlay.label !== undefined && (typeof overlay.label !== "string" || !overlay.label.trim()))
        || (overlay.optionLabels !== undefined && !isNonEmptyStringMap(overlay.optionLabels))) {
      throw new TypeError(`Config schema field ${key} localization ${locale} is invalid`);
      }
    }
  }
}

function isNonEmptyStringMap(value) {
  return isPlainObject(value) && Object.entries(value).every(([key, label]) => (
    typeof key === "string" && key.trim().length > 0
    && typeof label === "string" && label.trim().length > 0
  ));
}

module.exports = { createCapabilityRegistry };
