const { SchemaValidator } = require("../config/SchemaValidator");

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

module.exports = { createCapabilityRegistry };
