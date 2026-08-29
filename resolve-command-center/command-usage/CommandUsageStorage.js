const path = require("node:path");

const { ConfigStorage } = require("../config/ConfigStorage");

function isPlainObject(value) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function cloneUsageDocument(document) {
  return Object.fromEntries(Object.entries(document).map(([commandId, fact]) => [commandId, {
    usageCount: fact.usageCount,
    lastUsedAt: fact.lastUsedAt
  }]));
}

function validateUsageDocument(document) {
  if (!isPlainObject(document)) {
    throw new TypeError("Command usage history root must be an object");
  }

  for (const [commandId, fact] of Object.entries(document)) {
    if (typeof commandId !== "string" || commandId.trim().length === 0) {
      throw new TypeError("Command usage history requires non-empty command ids");
    }
    if (!isPlainObject(fact) || Object.keys(fact).length !== 2
      || !Object.hasOwn(fact, "usageCount") || !Object.hasOwn(fact, "lastUsedAt")
      || !Number.isSafeInteger(fact.usageCount) || fact.usageCount <= 0
      || !Number.isSafeInteger(fact.lastUsedAt) || fact.lastUsedAt < 0) {
      throw new TypeError(`Command usage history record for ${commandId} is invalid`);
    }
  }

  return cloneUsageDocument(document);
}

class CommandUsageStorage {
  constructor(filePath) {
    if (typeof filePath !== "string" || filePath.trim().length === 0) {
      throw new TypeError("CommandUsageStorage requires a file path");
    }
    this.filePath = filePath;
    this.storage = new ConfigStorage(filePath);
  }

  static fromAppData(appDataPath) {
    if (typeof appDataPath !== "string" || appDataPath.trim().length === 0) {
      throw new TypeError("CommandUsageStorage requires an appData path");
    }
    return new CommandUsageStorage(path.join(appDataPath, "Clackly", "command-usage.json"));
  }

  load() {
    return validateUsageDocument(this.storage.load());
  }

  save(document) {
    this.storage.save(validateUsageDocument(document));
  }
}

module.exports = {
  CommandUsageStorage,
  validateUsageDocument
};
