const fs = require("node:fs");
const path = require("node:path");

function isObjectRoot(value) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

class ConfigStorage {
  constructor(filePath) {
    if (typeof filePath !== "string" || filePath.trim().length === 0) {
      throw new TypeError("ConfigStorage requires a file path");
    }

    this.filePath = filePath;
  }

  static fromAppData(appDataPath) {
    if (typeof appDataPath !== "string" || appDataPath.trim().length === 0) {
      throw new TypeError("ConfigStorage requires an appData path");
    }

    return new ConfigStorage(path.join(appDataPath, "Clackly", "config.json"));
  }

  load() {
    let source;
    try {
      source = fs.readFileSync(this.filePath, "utf8");
    } catch (error) {
      if (error.code === "ENOENT") {
        return {};
      }
      throw error;
    }

    let config;
    try {
      config = JSON.parse(source);
    } catch (error) {
      throw new Error(`Invalid configuration JSON in ${this.filePath}: ${error.message}`);
    }

    if (!isObjectRoot(config)) {
      throw new Error(`Configuration root in ${this.filePath} must be an object`);
    }

    return config;
  }

  save(config) {
    if (!isObjectRoot(config)) {
      throw new TypeError("Configuration root must be an object");
    }

    const serialized = `${JSON.stringify(config, null, 2)}\n`;
    const directory = path.dirname(this.filePath);
    const temporaryPath = `${this.filePath}.${process.pid}.tmp`;
    fs.mkdirSync(directory, { recursive: true });

    try {
      fs.writeFileSync(temporaryPath, serialized, "utf8");
      fs.renameSync(temporaryPath, this.filePath);
    } finally {
      try {
        fs.unlinkSync(temporaryPath);
      } catch (error) {
        if (error.code !== "ENOENT") {
          throw error;
        }
      }
    }
  }
}

module.exports = { ConfigStorage };
