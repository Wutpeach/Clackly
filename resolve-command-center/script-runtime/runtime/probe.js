const fs = require("node:fs");
const path = require("node:path");
const { ConfigStorage } = require("../../config/ConfigStorage");
const { RuntimeError } = require("./errors");
const { RuntimeLauncher } = require("./launcher");

const VERSION = /^(?:0|[1-9]\d*)(?:\.(?:0|[1-9]\d*)){2,}$/;
const SUPPORT_STATUSES = new Set(["machine-verified", "overridden", "unsupported", "missing-runtime"]);
const PROBE_STATUSES = new Set(["not-run", "passed", "failed", "stale"]);
const DEFAULT_MODULE = "C:\\ProgramData\\Blackmagic Design\\DaVinci Resolve\\Support\\Developer\\Scripting\\Modules\\DaVinciResolveScript.py";
const DEFAULT_LIBRARY = "C:\\Program Files\\Blackmagic Design\\DaVinci Resolve\\fusionscript.dll";
const STRING_LIMIT = 4096;

function isPlainObject(value) {
  try {
    if (!value || typeof value !== "object" || Array.isArray(value)) return false;
    const prototype = Object.getPrototypeOf(value);
    return prototype === Object.prototype || prototype === null;
  } catch (_error) {
    return false;
  }
}

function diagnostic(error, code) {
  let message = "Unknown error";
  try {
    message = typeof error?.message === "string" ? error.message : String(error);
  } catch (_error) {}
  const result = { code, message: message.slice(0, STRING_LIMIT) };
  try {
    if (typeof error?.code === "string") result.causeCode = error.code.slice(0, 128);
  } catch (_error) {}
  return result;
}

function jsonSafe(value, depth = 0, seen = new Set()) {
  if (value === null || typeof value === "boolean") return value;
  if (typeof value === "string") return value.slice(0, STRING_LIMIT);
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (depth >= 6 || typeof value !== "object" || seen.has(value)) return null;
  seen.add(value);
  let result;
  if (Array.isArray(value)) {
    result = value.slice(0, 50).map((item) => jsonSafe(item, depth + 1, seen));
  } else {
    result = {};
    try {
      for (const [key, item] of Object.entries(value).slice(0, 50)) {
        result[key] = jsonSafe(item, depth + 1, seen);
      }
    } catch (_error) {}
  }
  seen.delete(value);
  return result;
}

function probeError(message, field) {
  return new RuntimeError("RUNTIME_PROBE_REQUEST_INVALID", message, { details: { field } });
}

function canonicalFile(fileSystem, candidate) {
  try {
    const canonical = fileSystem.realpathSync(candidate);
    const stats = fileSystem.statSync(canonical);
    return path.isAbsolute(canonical) && stats.isFile()
      ? { path: canonical, mtimeMs: stats.mtimeMs }
      : null;
  } catch (_error) {
    return null;
  }
}

function mismatchReasons(left, right, prefix = "") {
  if (!isPlainObject(left) || !isPlainObject(right)) return [prefix || "fingerprint"];
  const reasons = [];
  for (const key of new Set([...Object.keys(left), ...Object.keys(right)])) {
    const field = prefix ? `${prefix}.${key}` : key;
    if (isPlainObject(left[key]) && isPlainObject(right[key])) {
      reasons.push(...mismatchReasons(left[key], right[key], field));
    } else if (!Object.is(left[key], right[key])) {
      reasons.push(field);
    }
  }
  return reasons;
}

class RuntimeDiagnostics {
  static derive(supportStatus, probeStatus) {
    if (!SUPPORT_STATUSES.has(supportStatus) || !PROBE_STATUSES.has(probeStatus)) {
      throw new TypeError("Runtime Diagnostics requires known support and Probe statuses");
    }
    const passed = probeStatus === "passed";
    const effectiveStatus = supportStatus === "missing-runtime" || !passed
      ? "blocked"
      : supportStatus === "unsupported" ? "warning" : "ready";
    const warnings = supportStatus === "overridden" && passed ? [{
      code: "CUSTOM_RUNTIME_UNVERIFIED",
      message: "Custom Runtime passed this machine Probe but is not a Clackly-verified combination."
    }] : [];
    return { ok: passed, supportStatus, probeStatus, effectiveStatus, warnings };
  }
}

class RuntimeFingerprint {
  constructor({ fileSystem = fs, platform = process.platform, architecture = process.arch } = {}) {
    this.fileSystem = fileSystem;
    this.platform = platform;
    this.architecture = architecture;
  }

  create({ clacklyVersion, resolution, resolveVersion, modulePath, libraryPath }, {
    observedRuntimeVersion = null,
    cachedRecord = null
  } = {}) {
    const executable = canonicalFile(this.fileSystem, resolution.executable);
    const module = canonicalFile(this.fileSystem, modulePath);
    const library = canonicalFile(this.fileSystem, libraryPath);
    if (!executable || !module || !library) return null;

    let runtimeVersion = resolution.profile?.runtimeVersion || observedRuntimeVersion;
    if (!runtimeVersion && resolution.source === "override") {
      const cached = cachedRecord?.fingerprint;
      if (cached?.overridePath === executable.path
        && cached?.runtime?.executableMtimeMs === executable.mtimeMs) {
        runtimeVersion = cached.runtime.version;
      }
    }
    if (!VERSION.test(runtimeVersion || "")) return null;

    return {
      clacklyVersion,
      runtime: {
        id: resolution.source === "override" ? "override" : resolution.profile.id,
        version: runtimeVersion,
        executableMtimeMs: executable.mtimeMs
      },
      resolveVersion,
      bridge: {
        modulePath: module.path,
        moduleMtimeMs: module.mtimeMs,
        libraryPath: library.path,
        libraryMtimeMs: library.mtimeMs
      },
      platform: this.platform,
      architecture: this.architecture,
      overridePath: resolution.source === "override" ? executable.path : null
    };
  }
}

function validFingerprint(value) {
  return isPlainObject(value)
    && typeof value.clacklyVersion === "string"
    && isPlainObject(value.runtime)
    && typeof value.runtime.id === "string"
    && VERSION.test(value.runtime.version)
    && Number.isFinite(value.runtime.executableMtimeMs)
    && VERSION.test(value.resolveVersion)
    && isPlainObject(value.bridge)
    && typeof value.bridge.modulePath === "string"
    && Number.isFinite(value.bridge.moduleMtimeMs)
    && typeof value.bridge.libraryPath === "string"
    && Number.isFinite(value.bridge.libraryMtimeMs)
    && typeof value.platform === "string"
    && typeof value.architecture === "string"
    && (value.overridePath === null || typeof value.overridePath === "string");
}

function validCachedResult(value) {
  if (!isPlainObject(value) || value.ok !== true || value.probeStatus !== "passed"
    || !SUPPORT_STATUSES.has(value.supportStatus) || !isPlainObject(value.runtime)
    || typeof value.runtime.id !== "string" || !VERSION.test(value.runtime.version)
    || typeof value.runtime.architecture !== "string"
    || typeof value.runtime.executable !== "string" || !path.isAbsolute(value.runtime.executable)
    || !isPlainObject(value.resolve) || value.resolve.connected !== true
    || !VERSION.test(value.resolve.version)
    || !isPlainObject(value.bridge)
    || ![value.bridge.modulePath, value.bridge.libraryPath]
      .every((item) => typeof item === "string" && path.isAbsolute(item))
    || !Array.isArray(value.warnings)) return false;
  const derived = RuntimeDiagnostics.derive(value.supportStatus, "passed");
  return value.effectiveStatus === derived.effectiveStatus
    && value.warnings.length === derived.warnings.length
    && value.warnings.every((warning, index) => warning?.code === derived.warnings[index].code);
}

function consistentRecord(value) {
  const { fingerprint, result } = value;
  const expectedSupportStatus = fingerprint.overridePath === null ? "machine-verified" : "overridden";
  return result.runtime.id === fingerprint.runtime.id
    && result.runtime.version === fingerprint.runtime.version
    && result.supportStatus === expectedSupportStatus
    && result.bridge.modulePath === fingerprint.bridge.modulePath
    && result.bridge.libraryPath === fingerprint.bridge.libraryPath
    && (fingerprint.overridePath === null
      || (result.supportStatus === "overridden" && result.runtime.executable === fingerprint.overridePath));
}

class RuntimeProbeCache {
  constructor({ filePath, storage, fileSystem = fs } = {}) {
    if (!storage && (typeof filePath !== "string" || filePath.trim().length === 0)) {
      throw new TypeError("Runtime Probe Cache requires storage or a file path");
    }
    this.storage = storage || new ConfigStorage(filePath);
    this.filePath = filePath || storage.filePath || null;
    this.fileSystem = fileSystem;
  }

  load() {
    let value;
    try {
      value = this.storage.load();
    } catch (error) {
      return { record: null, reason: "read-failed", diagnostic: diagnostic(error, "CACHE_READ_FAILED") };
    }
    if (!isPlainObject(value) || value.schemaVersion !== 1
      || !validFingerprint(value.fingerprint) || !validCachedResult(value.result)
      || !consistentRecord(value)) {
      return {
        record: null,
        reason: isPlainObject(value) && Object.keys(value).length ? "schema-invalid" : "missing"
      };
    }
    return { record: value };
  }

  lookup(fingerprint, { force = false, loaded = this.load() } = {}) {
    if (force) return { status: "forced", ...loaded };
    if (!loaded.record) return { status: "miss", ...loaded };
    if (!fingerprint) {
      return { status: "stale", record: loaded.record, reasons: ["fingerprint-unavailable"] };
    }
    const reasons = mismatchReasons(loaded.record.fingerprint, fingerprint);
    return reasons.length
      ? { status: "stale", record: loaded.record, reasons }
      : { status: "hit", record: loaded.record };
  }

  save(fingerprint, result) {
    if (!validFingerprint(fingerprint) || !validCachedResult(result)) {
      throw new TypeError("Runtime Probe Cache stores only passed schema-version-1 records");
    }
    this.storage.save({ schemaVersion: 1, fingerprint, result });
  }

  clear() {
    if (!this.filePath) {
      this.storage.save({});
      return;
    }
    try {
      this.fileSystem.unlinkSync(this.filePath);
    } catch (error) {
      if (error?.code !== "ENOENT") throw error;
    }
  }
}

class ResolvePythonProbe {
  constructor({ launcher = new RuntimeLauncher() } = {}) {
    if (!launcher || typeof launcher.execute !== "function") {
      throw new TypeError("Resolve Python Probe requires a Runtime Launcher");
    }
    this.launcher = launcher;
  }

  async probe({ resolution, expectedRuntimeVersion, expectedResolveVersion, modulePath, libraryPath, bootstrapPath }) {
    const launched = await this.launcher.execute({
      resolution,
      ...(bootstrapPath !== undefined ? { bootstrapPath } : {}),
      request: {
        operation: "resolve-probe",
        expectedRuntimeVersion,
        expectedResolveVersion,
        modulePath,
        libraryPath
      }
    });
    const { response } = launched;
    if (!isPlainObject(response.resolve) || response.resolve.connected !== true
      || !VERSION.test(response.resolve.version)
      || !isPlainObject(response.bridge)
      || ![response.bridge.modulePath, response.bridge.libraryPath]
        .every((value) => typeof value === "string" && path.isAbsolute(value))) {
      throw new RuntimeError("RUNTIME_PROTOCOL_INVALID", "Resolve Probe returned an invalid envelope", {
        details: { reason: "invalid-resolve-envelope", process: launched.process }
      });
    }
    return launched;
  }
}

class RuntimeProbe {
  constructor({
    launcher,
    resolvePythonProbe,
    cache,
    cachePath,
    fileSystem = fs,
    platform = process.platform,
    architecture = process.arch
  } = {}) {
    this.resolvePythonProbe = resolvePythonProbe || new ResolvePythonProbe({ launcher });
    this.cache = cache || new RuntimeProbeCache({ filePath: cachePath, fileSystem });
    this.fingerprint = new RuntimeFingerprint({ fileSystem, platform, architecture });
    this.fileSystem = fileSystem;
    this.platform = platform;
    this.architecture = architecture;
  }

  validate(input) {
    if (!isPlainObject(input)) throw probeError("Runtime Probe requires an input object", "input");
    const { resolution } = input;
    if (!isPlainObject(resolution)
      || !((resolution.source === "manifest" && resolution.supportStatus === "machine-verified")
        || (resolution.source === "override" && resolution.supportStatus === "overridden"))
      || typeof resolution.executable !== "string"
      || resolution.executable !== resolution.executable.trim()
      || !path.isAbsolute(resolution.executable)) {
      throw probeError("Runtime Probe requires a successful Resolver-shaped resolution", "resolution");
    }
    if (resolution.source === "manifest" && (!isPlainObject(resolution.profile)
      || typeof resolution.profile.id !== "string" || resolution.profile.id.trim().length === 0
      || !VERSION.test(resolution.profile.runtimeVersion))) {
      throw probeError("Runtime Probe requires valid managed Runtime profile metadata", "resolution.profile");
    }
    for (const field of ["clacklyVersion", "resolveVersion"]) {
      if (!VERSION.test(input[field] || "")) {
        throw probeError(`Runtime Probe requires a canonical numeric ${field}`, field);
      }
    }
    if (input.force !== undefined && typeof input.force !== "boolean") {
      throw probeError("Runtime Probe force must be boolean", "force");
    }

    const bridge = {};
    for (const [field, fallback] of [["modulePath", DEFAULT_MODULE], ["libraryPath", DEFAULT_LIBRARY]]) {
      const candidate = input[field] ?? (this.platform === "win32" ? fallback : null);
      if (typeof candidate !== "string" || candidate.trim().length === 0
        || candidate !== candidate.trim() || !path.isAbsolute(candidate)) {
        throw probeError(`Runtime Probe ${field} must be one absolute path`, field);
      }
      bridge[field] = canonicalFile(this.fileSystem, candidate)?.path || candidate;
    }
    return { ...input, force: input.force || false, ...bridge };
  }

  mapFailure(error) {
    const launcherDetails = isPlainObject(error?.details) ? error.details : {};
    const bootstrap = isPlainObject(launcherDetails.bootstrapError) ? launcherDetails.bootstrapError : null;
    if (error?.code === "RUNTIME_BOOTSTRAP_FAILED" && bootstrap) {
      return {
        code: bootstrap.code,
        message: bootstrap.message,
        stage: typeof bootstrap.stage === "string" ? bootstrap.stage : "bootstrap",
        details: jsonSafe({
          ...(isPlainObject(bootstrap.details) ? bootstrap.details : {}),
          process: launcherDetails.process
        })
      };
    }
    const nativeCrash = error?.code === "RUNTIME_NATIVE_CRASH";
    return {
      code: nativeCrash ? "RUNTIME_NATIVE_BRIDGE_CRASH" : (error?.code || "RUNTIME_PROBE_FAILED"),
      message: nativeCrash
        ? "Resolve bridge terminated the isolated Runtime process"
        : (typeof error?.message === "string" ? error.message.slice(0, STRING_LIMIT) : "Runtime Probe failed"),
      stage: nativeCrash ? "resolve-bridge" : error?.code === "RUNTIME_TIMEOUT" ? "runtime-timeout" : "runtime-launch",
      details: jsonSafe(launcherDetails)
    };
  }

  cacheDisposition(lookup) {
    return {
      status: lookup.status,
      ...(typeof lookup.reason === "string" ? { reason: lookup.reason } : {}),
      ...(Array.isArray(lookup.reasons) ? { reasons: lookup.reasons } : {}),
      ...(isPlainObject(lookup.diagnostic) ? { diagnostic: lookup.diagnostic } : {})
    };
  }

  async probe(rawInput) {
    const input = this.validate(rawInput);
    const loaded = this.cache.load();
    const preFingerprint = this.fingerprint.create(input, { cachedRecord: loaded.record });
    const lookup = this.cache.lookup(preFingerprint, { force: input.force, loaded });
    if (lookup.status === "hit") {
      return { ...structuredClone(lookup.record.result), cache: { status: "hit" } };
    }

    const expectedRuntimeVersion = input.resolution.profile?.runtimeVersion || null;
    try {
      const { response } = await this.resolvePythonProbe.probe({
        resolution: input.resolution,
        expectedRuntimeVersion,
        expectedResolveVersion: input.resolveVersion,
        modulePath: input.modulePath,
        libraryPath: input.libraryPath,
        bootstrapPath: input.bootstrapPath
      });
      const statuses = RuntimeDiagnostics.derive(input.resolution.supportStatus, "passed");
      const result = {
        ...statuses,
        runtime: {
          id: input.resolution.source === "override" ? "override" : input.resolution.profile.id,
          version: response.runtime.version,
          architecture: this.architecture,
          executable: response.runtime.executable
        },
        resolve: response.resolve,
        bridge: response.bridge,
        cache: this.cacheDisposition(lookup)
      };
      const fingerprint = this.fingerprint.create(input, {
        observedRuntimeVersion: response.runtime.version,
        cachedRecord: loaded.record
      });
      try {
        if (!fingerprint) throw new Error("Successful Probe inputs could not be fingerprinted");
        this.cache.save(fingerprint, result);
      } catch (error) {
        result.cache = { status: "write-failed", diagnostic: diagnostic(error, "CACHE_WRITE_FAILED") };
      }
      return result;
    } catch (error) {
      const statuses = RuntimeDiagnostics.derive(input.resolution.supportStatus, "failed");
      const observedRuntimeVersion = error?.details?.bootstrapError?.details?.runtime?.version;
      const result = {
        ...statuses,
        runtime: {
          id: input.resolution.source === "override" ? "override" : input.resolution.profile.id,
          version: VERSION.test(observedRuntimeVersion || "")
            ? observedRuntimeVersion : (input.resolution.profile?.runtimeVersion || null),
          architecture: this.architecture,
          executable: input.resolution.executable
        },
        resolve: { version: input.resolveVersion, connected: false },
        bridge: { modulePath: input.modulePath, libraryPath: input.libraryPath },
        cache: this.cacheDisposition(lookup),
        error: this.mapFailure(error)
      };
      try {
        this.cache.clear();
        result.cache.cleared = true;
      } catch (clearError) {
        result.cache = {
          status: "clear-failed",
          previousStatus: lookup.status,
          diagnostic: diagnostic(clearError, "CACHE_CLEAR_FAILED")
        };
      }
      return result;
    }
  }
}

module.exports = {
  RuntimeProbe,
  ResolvePythonProbe,
  RuntimeFingerprint,
  RuntimeProbeCache,
  RuntimeDiagnostics
};
