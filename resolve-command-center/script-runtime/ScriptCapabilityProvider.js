function isPlainObject(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

class ScriptCapabilityProvider {
  constructor({ scriptExecutor, logger = console } = {}) {
    if (!scriptExecutor || typeof scriptExecutor.execute !== "function") {
      throw new TypeError("Script capability provider requires a script executor");
    }
    this.scriptExecutor = scriptExecutor;
    this.logger = logger;
  }

  execute(scriptDefinition, { command, config, capabilityId } = {}) {
    if (typeof command?.id !== "string" || command.id.trim().length === 0) {
      throw new TypeError("Script capability provider requires a Command id");
    }
    if (!config || typeof config.get !== "function") {
      throw new TypeError("Script capability provider requires scoped configuration");
    }
    if (typeof capabilityId !== "string" || capabilityId.trim().length === 0) {
      throw new TypeError("Script capability provider requires a Capability id");
    }

    const snapshot = config.get();
    if (!isPlainObject(snapshot)) {
      throw new TypeError("Script capability configuration must be an object");
    }

    return this.scriptExecutor.execute(scriptDefinition, {
      commandId: command.id,
      capabilityId,
      config: { ...snapshot },
      logger: this.logger
    });
  }
}

module.exports = { ScriptCapabilityProvider };
