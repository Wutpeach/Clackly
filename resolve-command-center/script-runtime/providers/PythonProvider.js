const fs = require("node:fs");
const path = require("node:path");

function isContained(root, target) {
  const relative = path.relative(root, target);
  return relative === "" || (!path.isAbsolute(relative)
    && !relative.startsWith(`..${path.sep}`)
    && relative !== "..");
}

class PythonProvider {
  constructor({ appRoot, runtimeManager } = {}) {
    if (typeof appRoot !== "string" || appRoot.trim().length === 0) {
      throw new TypeError("Python provider requires an application root");
    }
    if (!runtimeManager || typeof runtimeManager.execute !== "function") {
      throw new TypeError("Python provider requires a Runtime Manager");
    }
    this.appRoot = fs.realpathSync(appRoot);
    this.runtimeManager = runtimeManager;
  }

  resolveEntry(entry) {
    if (typeof entry !== "string" || entry.trim().length === 0 || path.isAbsolute(entry)) {
      throw new Error(`Python script entry must be a relative path under the application root: ${entry}`);
    }
    const candidate = path.resolve(this.appRoot, entry);
    if (!isContained(this.appRoot, candidate) || !fs.existsSync(candidate)) {
      throw new Error(`Python script entry not found under application root: ${entry}`);
    }
    const resolved = fs.realpathSync(candidate);
    if (!isContained(this.appRoot, resolved) || !fs.statSync(resolved).isFile()) {
      throw new Error(`Python script entry escapes application root: ${entry}`);
    }
    return resolved;
  }

  async execute(scriptDefinition, context = {}) {
    const entry = scriptDefinition?.entry;
    this.resolveEntry(entry);
    if (typeof context.commandId !== "string" || !context.commandId.trim()) {
      throw new TypeError("Python provider requires a Command id");
    }
    if (typeof context.capabilityId !== "string" || !context.capabilityId.trim()) {
      throw new TypeError("Python provider requires a Capability id");
    }

    let envelope;
    try {
      envelope = await this.runtimeManager.execute({
        runtime: "python",
        capabilityId: context.capabilityId,
        entry,
        commandId: context.commandId,
        config: context.config || {}
      });
    } catch (error) {
      let message = "failed";
      try { message = typeof error?.message === "string" ? error.message : String(error); } catch (_error) {}
      const wrapped = new Error(`Python script ${entry} failed: ${message}`);
      for (const field of ["code", "supportStatus", "details"]) {
        try {
          if (error?.[field] !== undefined) wrapped[field] = structuredClone(error[field]);
        } catch (_error) {}
      }
      throw wrapped;
    }

    try {
      for (const log of envelope.logs) {
        const writer = context.logger?.[log.level]
          || (log.level === "warning" ? context.logger?.warn : undefined)
          || context.logger?.log;
        if (typeof writer === "function") writer.call(context.logger, log.message);
      }
    } catch (error) {
      throw new Error(`Python script ${entry} could not replay logs: ${error.message}`);
    }
    if (!envelope.ok) {
      throw new Error(`Python script ${entry} failed: ${envelope.error.type}: ${envelope.error.message}`);
    }
    return envelope.result;
  }
}

module.exports = { PythonProvider };
