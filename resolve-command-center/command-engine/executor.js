const { getCommandById } = require("./registry");

function createCommandExecutor({
  capabilityHandlers,
  findCommand = getCommandById
}) {
  if (!capabilityHandlers || typeof capabilityHandlers !== "object") {
    throw new TypeError("Command executor requires capability handlers");
  }

  if (typeof findCommand !== "function") {
    throw new TypeError("Command executor requires a command lookup function");
  }

  return async function executeCommand(commandId) {
    const command = findCommand(commandId);
    if (!command) {
      throw new Error(`Unknown command: ${commandId}`);
    }

    const handler = capabilityHandlers[command.capability];
    if (typeof handler !== "function") {
      throw new Error(`No capability handler registered for ${command.capability}`);
    }

    return handler(command);
  };
}

module.exports = {
  createCommandExecutor
};
