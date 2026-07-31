const MODIFIERS = [
  ["ctrlKey", "CTRL"],
  ["shiftKey", "SHIFT"],
  ["altKey", "ALT"]
];

function normalizeEvent(event) {
  if (event === null || typeof event !== "object" || Array.isArray(event)) {
    throw new TypeError("Interaction event must be an object");
  }
  if (typeof event.target !== "string" || event.target.trim().length === 0) {
    throw new TypeError("Interaction target must be a non-empty string");
  }
  if (event.type !== "mouse") {
    throw new TypeError("Interaction type must be mouse");
  }
  if (!Number.isInteger(event.button)) {
    throw new TypeError("Interaction button must be an integer");
  }
  for (const [key] of MODIFIERS) {
    if (typeof event[key] !== "boolean") {
      throw new TypeError(`Interaction ${key} must be a boolean`);
    }
  }

  const button = event.button === 0 ? "left" : event.button === 2 ? "right" : null;
  return {
    target: event.target,
    type: "mouse",
    button,
    modifiers: MODIFIERS.filter(([key]) => event[key]).map(([, modifier]) => modifier)
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

  async handle(event) {
    const interaction = normalizeEvent(event);
    if (!interaction.button) {
      return { matched: false };
    }

    const binding = Object.values(this.bindingStorage.load()).find((candidate) =>
      candidate.target === interaction.target
      && candidate.trigger.type === interaction.type
      && candidate.trigger.button === interaction.button
      && candidate.trigger.modifiers.length === interaction.modifiers.length
      && candidate.trigger.modifiers.every((modifier, index) => modifier === interaction.modifiers[index])
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
