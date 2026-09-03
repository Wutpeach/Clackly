const fs = require("node:fs");
const path = require("node:path");

function isContained(root, target) {
  const relative = path.relative(root, target);
  return relative === "" || (!path.isAbsolute(relative)
    && !relative.startsWith(`..${path.sep}`)
    && relative !== "..");
}

// Stable internal code for entry errors the provider itself controls. Accidental
// filesystem errors (permissions, races) keep their native codes and rethrow.
function entryError(message) {
  const error = new Error(message);
  error.code = "PYTHON_ENTRY_INVALID";
  return error;
}

// Runtime evidence -> stable Feature Status availability. Every other error
// is rethrown and surfaces as a Feature Status error through the manager's
// catch.
const AVAILABILITY_MESSAGES = {
  RUNTIME_NOT_FOUND: ["missing-dependency", "Python runtime executable is missing", ["python-runtime"]],
  RESOLVE_MODULE_NOT_FOUND: ["missing-dependency", "DaVinci Resolve scripting module or library is missing", ["resolve-scripting"]],
  RESOLVE_LIBRARY_NOT_FOUND: ["missing-dependency", "DaVinci Resolve scripting module or library is missing", ["resolve-scripting"]],
  RUNTIME_UNSUPPORTED: ["unavailable", "No compatible managed Python runtime for this Resolve version", []],
  RUNTIME_ARCHITECTURE_UNSUPPORTED: ["unavailable", "Python runtime architecture is not supported for this Resolve version", []],
  RUNTIME_VERSION_MISMATCH: ["unavailable", "Python runtime version does not match the expected profile", []],
  RESOLVE_NOT_RUNNING: ["unavailable", "DaVinci Resolve is not running or scripting is unavailable", []],
  RUNTIME_PROBE_REQUEST_INVALID: ["unavailable", "Managed Python Runtime Probe setup is invalid (RUNTIME_PROBE_REQUEST_INVALID). Repair the Resolve bridge paths or reinstall Clackly.", []],
  RUNTIME_OVERRIDE_INVALID: ["unavailable", "Managed Python Runtime override is invalid (RUNTIME_OVERRIDE_INVALID). Remove or correct CLACKLY_PYTHON_EXECUTABLE.", []],
  RUNTIME_LAUNCH_REQUEST_INVALID: ["unavailable", "Managed Python Runtime launch setup is invalid (RUNTIME_LAUNCH_REQUEST_INVALID). Reinstall a matching Clackly package.", []],
  RUNTIME_EXECUTABLE_INVALID: ["unavailable", "Managed Python Runtime executable is invalid (RUNTIME_EXECUTABLE_INVALID). Reinstall the complete Clackly package.", []],
  RUNTIME_SPAWN_FAILED: ["unavailable", "Managed Python Runtime could not start (RUNTIME_SPAWN_FAILED). Reinstall the complete Clackly package.", []],
  RUNTIME_STDIN_FAILED: ["unavailable", "Managed Python Runtime could not receive its Probe request (RUNTIME_STDIN_FAILED). Reinstall the complete Clackly package.", []],
  RUNTIME_PROCESS_EXITED: ["unavailable", "Managed Python Runtime exited during its Probe (RUNTIME_PROCESS_EXITED). Reinstall the complete Clackly package.", []],
  RUNTIME_TIMEOUT: ["unavailable", "Managed Python Runtime Probe timed out (RUNTIME_TIMEOUT). Restart Resolve and verify the Runtime installation.", []],
  RUNTIME_OUTPUT_LIMIT: ["unavailable", "Managed Python Runtime Probe exceeded its output limit (RUNTIME_OUTPUT_LIMIT). Reinstall a matching Clackly package.", []],
  RUNTIME_NATIVE_BRIDGE_CRASH: ["unavailable", "Resolve bridge terminated the isolated Runtime (RUNTIME_NATIVE_BRIDGE_CRASH). Restart Resolve and run the check again.", []],
  RUNTIME_PROTOCOL_EMPTY: ["unavailable", "Managed Python Runtime Probe returned no response (RUNTIME_PROTOCOL_EMPTY). Verify package integrity and matching Clackly sources.", []],
  RUNTIME_PROTOCOL_INVALID: ["unavailable", "Managed Python Runtime Probe returned an invalid response (RUNTIME_PROTOCOL_INVALID). Verify package integrity and matching Clackly sources.", []],
  BOOTSTRAP_REQUEST_INVALID: ["unavailable", "Managed Python Runtime Bootstrap request is invalid (BOOTSTRAP_REQUEST_INVALID). Verify matching Clackly application and Runtime files.", []],
  RUNTIME_TEMP_CLEANUP_FAILED: ["unavailable", "Managed Python Runtime Probe cleanup failed (RUNTIME_TEMP_CLEANUP_FAILED). Stop Clackly and check temporary-directory permissions.", []],
  RUNTIME_PROBE_FAILED: ["unavailable", "Managed Python Runtime Probe failed (RUNTIME_PROBE_FAILED). Verify the Runtime and Resolve installation.", []],
  RESOLVE_IMPORT_FAILED: ["unavailable", "DaVinci Resolve bridge could not be imported (RESOLVE_IMPORT_FAILED). Check the Resolve installation and exact bridge paths.", []],
  RESOLVE_CONNECTION_FAILED: ["unavailable", "DaVinci Resolve bridge could not connect (RESOLVE_CONNECTION_FAILED). Check the Resolve installation and exact bridge paths.", []],
  RESOLVE_VERSION_UNVERIFIED: ["unavailable", "DaVinci Resolve version could not be verified (RESOLVE_VERSION_UNVERIFIED). Start Resolve and use Workflow Integration or a healthy bridge.", []]
};

function availabilityFor(error) {
  const mapped = AVAILABILITY_MESSAGES[error?.code];
  if (!mapped) return null;
  const [status, message, missing] = mapped;
  return { status, message, details: { missing, action: null } };
}

class PythonProvider {
  constructor({ appRoot, runtimeManager, fileSystem = fs } = {}) {
    if (typeof appRoot !== "string" || appRoot.trim().length === 0) {
      throw new TypeError("Python provider requires an application root");
    }
    if (!runtimeManager || typeof runtimeManager.execute !== "function"
      || typeof runtimeManager.checkAvailability !== "function") {
      throw new TypeError("Python provider requires a Runtime Manager");
    }
    this.appRoot = fileSystem.realpathSync(appRoot);
    this.runtimeManager = runtimeManager;
    this.fileSystem = fileSystem;
  }

  resolveEntry(entry) {
    if (typeof entry !== "string" || entry.trim().length === 0 || path.isAbsolute(entry)) {
      throw entryError(`Python script entry must be a relative path under the application root: ${entry}`);
    }
    const candidate = path.resolve(this.appRoot, entry);
    if (!isContained(this.appRoot, candidate) || !this.fileSystem.existsSync(candidate)) {
      throw entryError(`Python script entry not found under application root: ${entry}`);
    }
    const resolved = this.fileSystem.realpathSync(candidate);
    if (!isContained(this.appRoot, resolved) || !this.fileSystem.statSync(resolved).isFile()) {
      throw entryError(`Python script entry escapes application root: ${entry}`);
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

  async checkAvailability(scriptDefinition, context = {}) {
    try {
      this.resolveEntry(scriptDefinition?.entry);
    } catch (error) {
      if (error?.code !== "PYTHON_ENTRY_INVALID") throw error;
      return {
        status: "missing-dependency",
        message: "Script entry is not available",
        details: { missing: ["script-entry"], action: null }
      };
    }
    if (typeof context.capabilityId !== "string" || !context.capabilityId.trim()) {
      throw new TypeError("Python provider requires a Capability id");
    }

    try {
      await this.runtimeManager.checkAvailability({
        runtime: "python",
        capabilityId: context.capabilityId
      });
    } catch (error) {
      const availability = availabilityFor(error);
      if (availability) return availability;
      throw error;
    }
    return { status: "ready", message: null, details: { missing: [], action: null } };
  }
}

module.exports = { PythonProvider };
