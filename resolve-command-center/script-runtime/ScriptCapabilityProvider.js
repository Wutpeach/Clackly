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

  execute(scriptDefinition, { config } = {}) {
    if (!config || typeof config.get !== "function") {
      throw new TypeError("Script capability provider requires scoped configuration");
    }

    const snapshot = config.get();
    if (!isPlainObject(snapshot)) {
      throw new TypeError("Script capability configuration must be an object");
    }

    return this.scriptExecutor.execute(scriptDefinition, {
      config: { ...snapshot },
      logger: this.logger
    });
  }
}

module.exports = { ScriptCapabilityProvider };
