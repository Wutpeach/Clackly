function createCapabilityRegistry() {
  const capabilities = new Map();

  function register(capabilityId, capability) {
    if (typeof capabilityId !== "string" || capabilityId.trim().length === 0) {
      throw new TypeError("Capability registry requires a non-empty capability id");
    }

    if (!capability || typeof capability !== "object" || typeof capability.execute !== "function") {
      throw new TypeError("Capability registry requires an execution object with execute()");
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

  return { register, get };
}

module.exports = { createCapabilityRegistry };
