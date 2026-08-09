function createScriptCapability(metadata, scriptCapabilityProvider) {
  if (!metadata || metadata.executor?.type !== "script") {
    throw new TypeError("Script capability metadata requires a script executor");
  }
  if (!scriptCapabilityProvider || typeof scriptCapabilityProvider.execute !== "function"
    || typeof scriptCapabilityProvider.checkAvailability !== "function") {
    throw new TypeError("Script capability requires a script capability provider");
  }

  return {
    metadata,
    execute(command, { config } = {}) {
      return scriptCapabilityProvider.execute(metadata.executor, {
        command,
        config,
        capabilityId: metadata.id
      });
    },
    checkAvailability() {
      return scriptCapabilityProvider.checkAvailability(metadata.executor, {
        capabilityId: metadata.id
      });
    }
  };
}

module.exports = { createScriptCapability };
