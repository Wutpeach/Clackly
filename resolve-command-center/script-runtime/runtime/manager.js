const path = require("node:path");
const { RuntimeError } = require("./errors");
const { RuntimeLauncher, serializeRequest } = require("./launcher");
const { loadRuntimeRegistry } = require("./loader");
const { RuntimeProbe } = require("./probe");
const { RuntimeResolver } = require("./resolver");

const VERSION = /^(?:0|[1-9]\d*)(?:\.(?:0|[1-9]\d*)){2,}$/;

function isPlainObject(value) {
  try {
    if (!value || typeof value !== "object" || Array.isArray(value)) return false;
    const prototype = Object.getPrototypeOf(value);
    return prototype === Object.prototype || prototype === null;
  } catch (_error) {
    return false;
  }
}

function invalid(message, field) {
  throw new RuntimeError("RUNTIME_REQUEST_INVALID", message, { details: { field } });
}

function validScriptEnvelope(value) {
  return isPlainObject(value) && typeof value.ok === "boolean" && Array.isArray(value.logs)
    && value.logs.every((log) => isPlainObject(log)
      && ["debug", "info", "warning", "error"].includes(log.level)
      && typeof log.message === "string")
    && (value.ok ? Object.hasOwn(value, "result") : isPlainObject(value.error)
      && typeof value.error.type === "string" && typeof value.error.message === "string");
}

class RuntimeManager {
  constructor({
    runtimeRoot,
    resolver,
    probe,
    launcher = new RuntimeLauncher(),
    cachePath,
    clacklyVersion,
    platform = process.platform,
    architecture = process.arch,
    overrideExecutable,
    hostContextProvider,
    scriptRoot,
    bootstrapPath = path.resolve(__dirname, "bootstrap.py"),
    modulePath,
    libraryPath
  } = {}) {
    if (!resolver) {
      const registry = loadRuntimeRegistry({ ...(runtimeRoot ? { runtimeRoot } : {}) });
      resolver = new RuntimeResolver({ registry });
    }
    if (!probe) probe = new RuntimeProbe({ launcher, cachePath, platform, architecture });
    if (!resolver || typeof resolver.resolve !== "function"
      || !probe || typeof probe.probe !== "function"
      || !launcher || typeof launcher.execute !== "function") {
      throw new TypeError("Runtime Manager requires Resolver, Probe, and Launcher collaborators");
    }
    if (!VERSION.test(clacklyVersion || "") || typeof hostContextProvider !== "function"
      || typeof scriptRoot !== "string" || !path.isAbsolute(scriptRoot)) {
      throw new TypeError("Runtime Manager requires a version, host provider, and absolute script root");
    }
    this.resolver = resolver;
    this.probe = probe;
    this.launcher = launcher;
    this.clacklyVersion = clacklyVersion;
    this.platform = platform;
    this.architecture = architecture;
    this.overrideExecutable = overrideExecutable;
    this.hostContextProvider = hostContextProvider;
    this.scriptRoot = scriptRoot;
    this.bootstrapPath = bootstrapPath;
    this.modulePath = modulePath;
    this.libraryPath = libraryPath;
  }

  async execute(request) {
    if (!isPlainObject(request)) invalid("Runtime Manager requires a request object", "request");
    for (const field of ["runtime", "capabilityId", "entry", "commandId"]) {
      if (typeof request[field] !== "string" || !request[field].trim()) {
        invalid(`Runtime Manager requires a non-empty ${field}`, field);
      }
    }
    if (!isPlainObject(request.config)) invalid("Runtime Manager config must be an object", "config");
    if (path.isAbsolute(request.entry) || path.posix.isAbsolute(request.entry)
      || path.win32.isAbsolute(request.entry)
      || request.entry.split(/[\\/]/).some((segment) => segment === "..")) {
      invalid("Runtime Manager entry must be a contained relative path", "entry");
    }
    try {
      serializeRequest({ config: request.config });
    } catch (_error) {
      invalid("Runtime Manager config must contain only JSON values", "config");
    }

    let resolution = null;
    if (this.overrideExecutable !== undefined) {
      resolution = this.resolver.resolve({ overrideExecutable: this.overrideExecutable });
    }

    let host;
    try {
      host = await this.hostContextProvider();
    } catch (error) {
      throw new RuntimeError("RESOLVE_VERSION_UNVERIFIED", "DaVinci Resolve version could not be read", {
        details: { cause: typeof error?.message === "string" ? error.message : String(error) }
      });
    }
    if (!isPlainObject(host) || host.application !== "davinci-resolve" || !VERSION.test(host.version || "")) {
      throw new RuntimeError("RESOLVE_VERSION_UNVERIFIED", "DaVinci Resolve version could not be verified", {
        details: { reason: "invalid-host-context" }
      });
    }

    if (!resolution) {
      resolution = this.resolver.resolve({
        runtime: request.runtime,
        platform: this.platform,
        architecture: this.architecture,
        capabilityId: request.capabilityId,
        host
      });
    }
    const managed = resolution.source === "manifest";
    const stagedRoot = managed ? path.join(path.dirname(resolution.executable), "clackly") : this.scriptRoot;
    const selectedBootstrap = managed ? path.join(stagedRoot, "bootstrap.py") : this.bootstrapPath;
    const readiness = await this.probe.probe({
      resolution,
      clacklyVersion: this.clacklyVersion,
      resolveVersion: host.version,
      bootstrapPath: selectedBootstrap,
      ...(this.modulePath ? { modulePath: this.modulePath } : {}),
      ...(this.libraryPath ? { libraryPath: this.libraryPath } : {})
    });
    if (!readiness?.ok) {
      throw new RuntimeError(
        readiness?.error?.code || "RUNTIME_PROBE_FAILED",
        readiness?.error?.message || "Runtime Probe failed",
        { supportStatus: readiness?.supportStatus || resolution.supportStatus, details: { probe: readiness } }
      );
    }

    const launched = await this.launcher.execute({
      resolution,
      bootstrapPath: selectedBootstrap,
      request: {
        operation: "script-execute",
        scriptRoot: stagedRoot,
        entry: request.entry,
        commandId: request.commandId,
        config: request.config
      }
    });
    if (!validScriptEnvelope(launched?.response?.script)) {
      throw new RuntimeError("RUNTIME_PROTOCOL_INVALID", "Runtime returned an invalid script envelope", {
        details: { reason: "invalid-script-envelope", process: launched?.process }
      });
    }
    return structuredClone(launched.response.script);
  }
}

module.exports = { RuntimeManager };
