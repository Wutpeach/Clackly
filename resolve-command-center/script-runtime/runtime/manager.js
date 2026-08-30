const fs = require("node:fs");
const path = require("node:path");
const { RuntimeError } = require("./errors");
const { RuntimeLauncher, serializeRequest } = require("./launcher");
const { loadRuntimeRegistry } = require("./loader");
const { RuntimeProbe } = require("./probe");
const { RuntimeResolver } = require("./resolver");

const VERSION = /^(?:0|[1-9]\d*)(?:\.(?:0|[1-9]\d*)){2,}$/;
const DESKTOP_LAUNCH_FIELD = "__clacklyDesktopLaunch";
const EXPORT_TO_AE_COMMANDS = new Set([
  "timeline.exportToAfterEffects",
  "timeline.exportAudioToAfterEffects",
  "timeline.exportVideoToAfterEffects"
]);

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
    persistentBootstrapPath = path.resolve(__dirname, "persistent_bootstrap.py"),
    scriptLauncher,
    desktopLauncher,
    modulePath,
    libraryPath,
    fileSystem = fs
  } = {}) {
    if (!resolver) {
      const registry = loadRuntimeRegistry({ ...(runtimeRoot ? { runtimeRoot } : {}) });
      resolver = new RuntimeResolver({ registry });
    }
    if (!probe) probe = new RuntimeProbe({ launcher, cachePath, platform, architecture });
    if (!resolver || typeof resolver.resolve !== "function"
      || !probe || typeof probe.probe !== "function"
      || !launcher || typeof launcher.execute !== "function"
      || (scriptLauncher && (typeof scriptLauncher.execute !== "function"
        || typeof scriptLauncher.prewarm !== "function" || typeof scriptLauncher.dispose !== "function"))) {
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
    this.persistentBootstrapPath = persistentBootstrapPath;
    this.scriptLauncher = scriptLauncher || null;
    this.desktopLauncher = desktopLauncher;
    this.modulePath = modulePath;
    this.libraryPath = libraryPath;
    this.fileSystem = fileSystem;
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

    const isPersistentExport = this.platform === "win32" && this.scriptLauncher
      && request.capabilityId === "ae.export" && request.entry === "scripts/resolve2ae_export.py"
      && EXPORT_TO_AE_COMMANDS.has(request.commandId);
    const prepared = await this.resolveAndProbe({
      runtime: request.runtime,
      capabilityId: request.capabilityId
    });
    const { resolution, stagedRoot, selectedBootstrap, readiness } = prepared;
    const launchRequest = {
      resolution,
      bootstrapPath: isPersistentExport
        ? (resolution.source === "manifest"
          ? path.join(stagedRoot, "persistent_bootstrap.py")
          : this.persistentBootstrapPath)
        : selectedBootstrap,
      request: {
        operation: "script-execute",
        scriptRoot: stagedRoot,
        entry: request.entry,
        commandId: request.commandId,
        config: request.config
      }
    };
    if (isPersistentExport) {
      const health = this.workerHealth(resolution, readiness);
      launchRequest.healthKey = health.key;
      launchRequest.identity = health.identity;
    }
    const launched = await (isPersistentExport ? this.scriptLauncher : this.launcher).execute(launchRequest);
    if (!validScriptEnvelope(launched?.response?.script)) {
      throw new RuntimeError("RUNTIME_PROTOCOL_INVALID", "Runtime returned an invalid script envelope", {
        details: { reason: "invalid-script-envelope", process: launched?.process }
      });
    }
    const script = structuredClone(launched.response.script);
    const plan = script.ok && isPlainObject(script.result)
      ? script.result[DESKTOP_LAUNCH_FIELD]
      : undefined;
    if (plan !== undefined) {
      delete script.result[DESKTOP_LAUNCH_FIELD];
      if (!this.desktopLauncher || typeof this.desktopLauncher.execute !== "function"
        || typeof script.result.message !== "string" || !script.result.message.trim()) {
        throw new RuntimeError(
          "AFTER_EFFECTS_LAUNCH_INVALID",
          "Runtime returned an After Effects launch plan without a valid host launcher",
          { details: { stage: "desktop-launch" } }
        );
      }
      let desktop;
      try {
        desktop = await this.desktopLauncher.execute(plan, {
          configuredExecutable: request.config.aePath
        });
      } catch (error) {
        const controlled = ["AFTER_EFFECTS_LAUNCH_INVALID", "AFTER_EFFECTS_LAUNCH_FAILED"]
          .includes(error?.code);
        const code = controlled ? error.code : "AFTER_EFFECTS_LAUNCH_FAILED";
        throw new RuntimeError(
          code,
          controlled && typeof error?.message === "string"
            ? error.message
            : "After Effects could not be launched",
          {
            details: {
              stage: "desktop-launch",
              ...(typeof error?.details?.causeCode === "string"
                ? { causeCode: error.details.causeCode }
                : !controlled && typeof error?.code === "string" ? { causeCode: error.code } : {})
            }
          }
        );
      }
      if (!desktop || !["running", "cold"].includes(desktop.mode)) {
        throw new RuntimeError("AFTER_EFFECTS_LAUNCH_FAILED", "After Effects launcher returned an invalid result", {
          details: { stage: "desktop-launch" }
        });
      }
      script.logs.push({
        level: "info",
        message: desktop.mode === "running" ? "Sending..." : "Starting AE..."
      });
      script.logs.push({ level: "info", message: `✅ ${script.result.message}` });
    }
    return script;
  }

  workerHealth(resolution, readiness) {
    const canonical = (candidate) => {
      const real = this.fileSystem.realpathSync(candidate);
      const stats = this.fileSystem.statSync(real);
      if (!path.isAbsolute(real) || !stats.isFile() || !Number.isFinite(stats.mtimeMs)) throw new Error("invalid health file");
      return { path: real, mtimeMs: stats.mtimeMs };
    };
    try {
      const executable = canonical(resolution.executable);
      const module = canonical(readiness.bridge.modulePath);
      const library = canonical(readiness.bridge.libraryPath);
      const identity = `${executable.path}\u0000${executable.mtimeMs}`;
      return {
        identity,
        key: JSON.stringify({
          executable,
          resolveVersion: readiness.resolve.version,
          bridge: { module, library }
        })
      };
    } catch (_error) {
      throw new RuntimeError("RUNTIME_PROTOCOL_INVALID", "Runtime Probe returned unverifiable worker health", {
        details: { reason: "persistent-worker-health" }
      });
    }
  }

  async prewarmExportPythonWorker() {
    if (!this.scriptLauncher) return false;
    let resolution;
    try {
      if (this.overrideExecutable !== undefined) {
        resolution = this.resolver.resolve({ overrideExecutable: this.overrideExecutable });
      } else if (this.resolver.registry && typeof this.resolver.registry.getAll === "function"
        && typeof this.resolver.runtimeRoot === "string") {
        const matches = this.resolver.registry.getAll().filter((profile) => (
          profile.runtime === "python" && profile.platform === this.platform
          && profile.architecture === this.architecture && profile.capabilities.includes("ae.export")
        ));
        if (matches.length !== 1) return false;
        const profile = matches[0];
        const executable = this.fileSystem.realpathSync(path.resolve(
          this.resolver.runtimeRoot,
          ...profile.executable.split("/")
        ));
        if (!this.fileSystem.statSync(executable).isFile()) return false;
        resolution = { source: "manifest", supportStatus: "machine-verified", executable, profile: structuredClone(profile) };
      } else {
        return false;
      }
      const executable = this.fileSystem.realpathSync(resolution.executable);
      const mtimeMs = this.fileSystem.statSync(executable).mtimeMs;
      if (!Number.isFinite(mtimeMs)) return false;
      const stagedRoot = resolution.source === "manifest"
        ? path.join(path.dirname(executable), "clackly") : this.scriptRoot;
      return await this.scriptLauncher.prewarm({
        resolution,
        bootstrapPath: resolution.source === "manifest"
          ? path.join(stagedRoot, "persistent_bootstrap.py") : this.persistentBootstrapPath,
        scriptRoot: stagedRoot,
        entry: "scripts/resolve2ae_export.py",
        identity: `${executable}\u0000${mtimeMs}`,
        healthKey: `prewarm:${executable}\u0000${mtimeMs}`
      });
    } catch (_error) {
      // Host startup deliberately ignores this best-effort background warm-up.
      return false;
    }
  }

  disposeExportPythonWorker() {
    if (this.scriptLauncher) this.scriptLauncher.dispose();
  }

  // Shared preparation pipeline for execute and availability checks: Override,
  // host context, Resolver, then the isolated resolve Probe. It never touches
  // the script launcher or the desktop plan, so availability stops at Probe.
  async resolveAndProbe({ runtime, capabilityId }) {
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
        runtime,
        platform: this.platform,
        architecture: this.architecture,
        capabilityId,
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

    return { resolution, stagedRoot, selectedBootstrap, readiness };
  }

  async checkAvailability(request) {
    if (!isPlainObject(request)) invalid("Runtime Manager requires a request object", "request");
    for (const field of ["runtime", "capabilityId"]) {
      if (typeof request[field] !== "string" || !request[field].trim()) {
        invalid(`Runtime Manager requires a non-empty ${field}`, field);
      }
    }

    const { readiness } = await this.resolveAndProbe({
      runtime: request.runtime,
      capabilityId: request.capabilityId
    });
    return readiness;
  }
}

module.exports = { RuntimeManager };
