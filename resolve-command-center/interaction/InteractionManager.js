const { normalizeMouseEventTrigger, triggersEqual } = require("./trigger");

function normalizeEvent(event) {
  if (event === null || typeof event !== "object" || Array.isArray(event)) {
    throw new TypeError("Interaction event must be an object");
  }
  if (typeof event.target !== "string" || event.target.trim().length === 0) {
    throw new TypeError("Interaction target must be a non-empty string");
  }
  return {
    target: event.target,
    trigger: normalizeMouseEventTrigger(event)
  };
}

class InteractionManager {
  constructor({ bindingStorage, executeCommand } = {}) {
    if (!bindingStorage || typeof bindingStorage.load !== "function") {
      throw new TypeError("InteractionManager requires bindingStorage.load");
    }
    if (typeof executeCommand !== "function") {
      throw new TypeError("InteractionManager requires executeCommand");
    }

    this.bindingStorage = bindingStorage;
    this.executeCommand = executeCommand;
  }

  listBindings() {
    return Object.entries(this.bindingStorage.load()).map(([id, binding]) => ({
      id,
      target: binding.target,
      trigger: { ...binding.trigger, modifiers: [...binding.trigger.modifiers] },
      action: { command: binding.action.command }
    }));
  }

  async handle(event) {
    const interaction = normalizeEvent(event);
    if (!interaction.trigger.button) {
      return { matched: false };
    }

    const binding = Object.values(this.bindingStorage.load()).find((candidate) =>
      candidate.target === interaction.target
      && triggersEqual(candidate.trigger, interaction.trigger)
    );
    if (!binding) {
      return { matched: false };
    }

    const command = binding.action.command;
    const result = await this.executeCommand(command);
    return { matched: true, command, result };
  }
}

module.exports = { InteractionManager };
