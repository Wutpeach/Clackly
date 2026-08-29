const { getCommandById } = require("./registry");

function createCommandExecutor({
  capabilityRegistry,
  configManager,
  featureStatusManager,
  usageHistory,
  findCommand = getCommandById
}) {
  if (!capabilityRegistry || typeof capabilityRegistry.get !== "function") {
    throw new TypeError("Command executor requires a capability registry");
  }

  if (!configManager || typeof configManager.assertConfigured !== "function"
    || typeof configManager.forCapability !== "function") {
    throw new TypeError("Command executor requires a config manager");
  }

  if (typeof findCommand !== "function") {
    throw new TypeError("Command executor requires a command lookup function");
  }

  return async function executeCommand(commandId) {
    const command = findCommand(commandId);
    if (!command) {
      throw new Error(`Unknown command: ${commandId}`);
    }

    const capability = capabilityRegistry.get(command.capability);
    if (!capability || typeof capability.execute !== "function") {
      throw new Error(`No capability handler registered for ${command.capability}`);
    }

    featureStatusManager?.assertEnabled(command.capability);
    configManager.assertConfigured(command.capability);
    const config = configManager.forCapability(command.capability);
    try {
      usageHistory?.record?.(command.id);
    } catch (_usageError) {
      // Recommendation history is strictly subordinate to command execution.
    }
    return capability.execute(command, {
      config
    });
  };
}

module.exports = {
  createCommandExecutor
};
