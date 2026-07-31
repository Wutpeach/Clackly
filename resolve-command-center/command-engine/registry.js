const fs = require("node:fs");
const path = require("node:path");
const { normalizeTrigger } = require("../interaction/trigger");

const DEFAULT_COMMAND_DIR = path.join(__dirname, "commands");

let cachedCommands = null;

function readJsonFile(filePath) {
  const raw = fs.readFileSync(filePath, "utf8");
  return JSON.parse(raw);
}

function normalizeManifestPayload(payload, filePath) {
  if (Array.isArray(payload)) {
    return payload;
  }

  if (payload && Array.isArray(payload.commands)) {
    return payload.commands;
  }

  if (payload && typeof payload === "object") {
    return [payload];
  }

  throw new Error(`Invalid command manifest format: ${filePath}`);
}

function normalizeCommand(command, filePath) {
  if (!command || typeof command !== "object") {
    throw new Error(`Invalid command entry in ${filePath}`);
  }

  const { id, name, keywords = [], capability, interactionHelp = [] } = command;
  if (typeof id !== "string" || id.length === 0) {
    throw new Error(`Command in ${filePath} is missing a string id`);
  }

  if (typeof name !== "string" || name.length === 0) {
    throw new Error(`Command ${id} in ${filePath} is missing a string name`);
  }

  if (!Array.isArray(keywords) || keywords.some((keyword) => typeof keyword !== "string")) {
    throw new Error(`Command ${id} in ${filePath} must define string keywords`);
  }

  if (typeof capability !== "string" || capability.length === 0) {
    throw new Error(`Command ${id} in ${filePath} is missing a string capability`);
  }

  if (!Array.isArray(interactionHelp)) {
    throw new TypeError(`Command ${id} in ${filePath} interactionHelp must be an array`);
  }

  const seenTriggers = new Set();
  const normalizedHelp = interactionHelp.map((entry, index) => {
    const label = `Command ${id} interactionHelp[${index}]`;
    if (entry === null || typeof entry !== "object" || Array.isArray(entry)) {
      throw new TypeError(`${label} must be an object`);
    }
    const prototype = Object.getPrototypeOf(entry);
    if (prototype !== Object.prototype && prototype !== null) {
      throw new TypeError(`${label} must be a plain object`);
    }
    const keys = Object.keys(entry).sort();
    if (keys.length !== 3 || keys[0] !== "description" || keys[1] !== "label" || keys[2] !== "trigger") {
      throw new TypeError(`${label} must contain only trigger, label, description`);
    }
    if (typeof entry.label !== "string" || entry.label.trim().length === 0) {
      throw new TypeError(`${label} label must be a non-empty string`);
    }
    if (typeof entry.description !== "string" || entry.description.trim().length === 0) {
      throw new TypeError(`${label} description must be a non-empty string`);
    }

    const trigger = normalizeTrigger(entry.trigger, `${label} trigger`);
    const signature = JSON.stringify(trigger);
    if (seenTriggers.has(signature)) {
      throw new TypeError(`Command ${id} has duplicate interactionHelp trigger`);
    }
    seenTriggers.add(signature);
    return { trigger, label: entry.label, description: entry.description };
  });

  return {
    id,
    name,
    keywords: [...keywords],
    capability,
    interactionHelp: normalizedHelp
  };
}

function cloneCommand(command) {
  return {
    ...command,
    keywords: [...command.keywords],
    interactionHelp: command.interactionHelp.map((entry) => ({
      ...entry,
      trigger: { ...entry.trigger, modifiers: [...entry.trigger.modifiers] }
    }))
  };
}

function loadCommands(commandDir = DEFAULT_COMMAND_DIR) {
  if (!fs.existsSync(commandDir)) {
    return [];
  }

  const commands = [];
  const seen = new Set();
  const files = fs
    .readdirSync(commandDir)
    .filter((fileName) => fileName.endsWith(".json"))
    .sort();

  for (const fileName of files) {
    const filePath = path.join(commandDir, fileName);
    const entries = normalizeManifestPayload(readJsonFile(filePath), filePath);

    for (const entry of entries) {
      const command = normalizeCommand(entry, filePath);
      if (seen.has(command.id)) {
        throw new Error(`Duplicate command id ${command.id}`);
      }

      seen.add(command.id);
      commands.push(command);
    }
  }

  return commands;
}

function getCommands() {
  if (!cachedCommands) {
    cachedCommands = loadCommands();
  }

  return cachedCommands.map(cloneCommand);
}

function resetCommandCache() {
  cachedCommands = null;
}

function commandMatches(command, query) {
  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery) {
    return true;
  }

  const haystack = [command.id, command.name, ...command.keywords]
    .join(" ")
    .toLowerCase();

  return normalizedQuery
    .split(/\s+/)
    .every((token) => haystack.includes(token));
}

function searchCommands(query) {
  const text = typeof query === "string" ? query : "";
  return getCommands().filter((command) => commandMatches(command, text));
}

function getCommandById(commandId) {
  return getCommands().find((command) => command.id === commandId) || null;
}

module.exports = {
  loadCommands,
  getCommands,
  resetCommandCache,
  searchCommands,
  getCommandById
};
