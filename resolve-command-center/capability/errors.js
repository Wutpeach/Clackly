class CapabilityUnavailableError extends Error {
  constructor(capability, attemptedBackends = []) {
    const suffix = attemptedBackends.length > 0
      ? `; checked ${attemptedBackends.join(", ")}`
      : "";
    super(`Capability ${capability} is unavailable${suffix}`);
    this.name = "CapabilityUnavailableError";
    this.capability = capability;
    this.attemptedBackends = [...attemptedBackends];
  }
}

module.exports = {
  CapabilityUnavailableError
};
