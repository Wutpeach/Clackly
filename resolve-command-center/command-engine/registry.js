const fs = require("node:fs");
const path = require("node:path");

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

  const { id, name, keywords = [], executor } = command;
  if (typeof id !== "string" || id.length === 0) {
    throw new Error(`Command in ${filePath} is missing a string id`);
  }

  if (typeof name !== "string" || name.length === 0) {
    throw new Error(`Command ${id} in ${filePath} is missing a string name`);
  }

  if (!Array.isArray(keywords) || keywords.some((keyword) => typeof keyword !== "string")) {
    throw new Error(`Command ${id} in ${filePath} must define string keywords`);
  }

  if (typeof executor !== "string" || executor.length === 0) {
    throw new Error(`Command ${id} in ${filePath} is missing a string executor`);
  }

  return {
    id,
    name,
    keywords,
    executor
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

  return cachedCommands;
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
