const { getCommandById } = require("./registry");

function createCommandExecutor({
  capabilityRegistry,
  findCommand = getCommandById
}) {
  if (!capabilityRegistry || typeof capabilityRegistry.get !== "function") {
    throw new TypeError("Command executor requires a capability registry");
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

    return capability.execute(command);
  };
}

module.exports = {
  createCommandExecutor
};
