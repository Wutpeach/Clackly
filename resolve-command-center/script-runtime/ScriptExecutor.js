class ScriptExecutor {
  constructor(providers = new Map()) {
    this.providers = new Map(providers);
  }

  execute(scriptDefinition, context) {
    if (!scriptDefinition || typeof scriptDefinition !== "object"
      || typeof scriptDefinition.runtime !== "string"
      || scriptDefinition.runtime.trim().length === 0) {
      throw new TypeError("Script definition requires a non-empty runtime");
    }

    const provider = this.providers.get(scriptDefinition.runtime);
    if (!provider || typeof provider.execute !== "function") {
      throw new Error(`Unsupported script runtime: ${scriptDefinition.runtime}`);
    }

    return provider.execute(scriptDefinition, context);
  }
}

module.exports = { ScriptExecutor };
