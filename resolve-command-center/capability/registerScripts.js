const path = require("node:path");

const { ScriptCapabilityProvider } = require("../script-runtime/ScriptCapabilityProvider");
const { ScriptExecutor } = require("../script-runtime/ScriptExecutor");
const { PythonProvider } = require("../script-runtime/providers/PythonProvider");
const { loadCapabilityDefinitions, DEFAULT_CAPABILITY_DIR } = require("./loader");
const { createCapabilityRegistry } = require("./registry");
const { createScriptCapability } = require("./script");

function registerScriptCapabilities({
  capabilityRegistry,
  capabilityDir = DEFAULT_CAPABILITY_DIR,
  appRoot = path.resolve(__dirname, ".."),
  logger = console,
  runtimeManager,
  scriptCapabilityProvider
} = {}) {
  if (!capabilityRegistry || typeof capabilityRegistry.register !== "function"
    || typeof capabilityRegistry.get !== "function") {
    throw new TypeError("Script capability registration requires a capability registry");
  }

  const provider = scriptCapabilityProvider || new ScriptCapabilityProvider({
    logger,
    scriptExecutor: new ScriptExecutor(new Map([
      ["python", new PythonProvider({ appRoot, runtimeManager })]
    ]))
  });
  const capabilities = loadCapabilityDefinitions(capabilityDir)
    .map((metadata) => createScriptCapability(metadata, provider));

  const validationRegistry = createCapabilityRegistry();
  for (const capability of capabilities) {
    validationRegistry.register(capability.metadata.id, capability);
    if (capabilityRegistry.get(capability.metadata.id)) {
      throw new Error(`Capability already registered: ${capability.metadata.id}`);
    }
  }

  for (const capability of capabilities) {
    capabilityRegistry.register(capability.metadata.id, capability);
  }

  return capabilities;
}

module.exports = { registerScriptCapabilities };
