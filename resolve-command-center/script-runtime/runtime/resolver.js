const fs = require("node:fs");
const path = require("node:path");
const { RuntimeError } = require("./errors");

const VERSION = /^(?:0|[1-9]\d*)(?:\.(?:0|[1-9]\d*)){2,}$/;

function isPlainObject(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function isContained(root, target) {
  const relative = path.relative(root, target);
  return relative === "" || (!path.isAbsolute(relative)
    && relative !== ".."
    && !relative.startsWith(`..${path.sep}`));
}

function compareRuntimeVersions(left, right) {
  const leftParts = left.runtimeVersion.split(".").map(Number);
  const rightParts = right.runtimeVersion.split(".").map(Number);
  for (let index = 0; index < 3; index += 1) {
    const difference = rightParts[index] - leftParts[index];
    if (difference) return difference;
  }
  return left.id < right.id ? -1 : left.id > right.id ? 1 : 0;
}

function matchesVersion(version, prefix) {
  const versionParts = version.split(".").map(Number);
  const prefixParts = prefix.split(".").map(Number);
  return versionParts.length >= prefixParts.length
    && prefixParts.every((part, index) => versionParts[index] === part);
}

function validateRequest(request) {
  if (!isPlainObject(request)) {
    throw new RuntimeError("RUNTIME_REQUEST_INVALID", "Runtime resolution requires a request object");
  }
  for (const field of ["runtime", "platform", "architecture", "capabilityId"]) {
    if (typeof request[field] !== "string" || request[field].trim().length === 0) {
      throw new RuntimeError(
        "RUNTIME_REQUEST_INVALID",
        `Runtime resolution requires a non-empty ${field}`,
        { details: { field } }
      );
    }
  }
  if (!isPlainObject(request.host)) {
    throw new RuntimeError(
      "RUNTIME_REQUEST_INVALID",
      "Runtime resolution requires a host object",
      { details: { field: "host" } }
    );
  }
  for (const field of ["application", "version"]) {
    if (typeof request.host[field] !== "string" || request.host[field].trim().length === 0) {
      throw new RuntimeError(
        "RUNTIME_REQUEST_INVALID",
        `Runtime resolution requires a non-empty host ${field}`,
        { details: { field: `host.${field}` } }
      );
    }
  }
  if (!VERSION.test(request.host.version)) {
    throw new RuntimeError(
      "RUNTIME_REQUEST_INVALID",
      "Runtime resolution host version must be a canonical numeric dotted version",
      { details: { field: "host.version" } }
    );
  }
}

function notFound(message, details) {
  throw new RuntimeError("RUNTIME_NOT_FOUND", message, {
    supportStatus: "missing-runtime",
    details
  });
}

class RuntimeResolver {
  constructor({ registry, runtimeRoot = registry?.runtimeRoot, fileSystem = fs } = {}) {
    if (!registry || typeof registry.getAll !== "function") {
      throw new TypeError("Runtime Resolver requires a Registry");
    }
    if (typeof runtimeRoot !== "string" || runtimeRoot.trim().length === 0) {
      throw new TypeError("Runtime Resolver requires a runtime root");
    }
    this.registry = registry;
    this.runtimeRoot = path.resolve(runtimeRoot);
    this.fileSystem = fileSystem;
  }

  resolve(request = {}) {
    if (request?.overrideExecutable !== undefined) {
      return this.resolveOverride(request.overrideExecutable);
    }

    validateRequest(request);
    const matches = this.registry.getAll().filter((profile) => (
      profile.runtime === request.runtime
      && profile.platform === request.platform
      && profile.architecture === request.architecture
      && profile.capabilities.includes(request.capabilityId)
      && profile.host.application === request.host.application
      && matchesVersion(request.host.version, profile.host.versionPrefix)
    ));

    if (matches.length === 0) {
      throw new RuntimeError("RUNTIME_UNSUPPORTED", "No compatible managed runtime profile", {
        supportStatus: "unsupported",
        details: {
          runtime: request.runtime,
          platform: request.platform,
          architecture: request.architecture,
          capabilityId: request.capabilityId,
          host: structuredClone(request.host)
        }
      });
    }

    matches.sort(compareRuntimeVersions);
    const profile = matches[0];
    const candidate = path.resolve(this.runtimeRoot, ...profile.executable.split("/"));
    let executable;
    try {
      const resolvedRoot = this.fileSystem.realpathSync(this.runtimeRoot);
      executable = this.fileSystem.realpathSync(candidate);
      if (!isContained(this.runtimeRoot, candidate)
        || !isContained(resolvedRoot, executable)
        || !this.fileSystem.statSync(executable).isFile()) {
        throw new Error("not a contained regular file");
      }
    } catch (_error) {
      notFound(`Managed runtime executable is missing for profile ${profile.id}`, {
        source: "manifest",
        profileId: profile.id,
        executable: candidate
      });
    }

    return {
      source: "manifest",
      supportStatus: "machine-verified",
      executable,
      profile: structuredClone(profile)
    };
  }

  resolveOverride(overrideExecutable) {
    if (typeof overrideExecutable !== "string"
      || overrideExecutable.trim().length === 0
      || overrideExecutable !== overrideExecutable.trim()
      || !path.isAbsolute(overrideExecutable)) {
      throw new RuntimeError(
        "RUNTIME_OVERRIDE_INVALID",
        "Runtime Override must be one absolute executable path",
        { details: typeof overrideExecutable === "string"
          ? { overrideExecutable }
          : { overrideType: Array.isArray(overrideExecutable) ? "array" : typeof overrideExecutable } }
      );
    }

    let executable;
    try {
      executable = this.fileSystem.realpathSync(overrideExecutable);
      if (!this.fileSystem.statSync(executable).isFile()) throw new Error("not a regular file");
    } catch (_error) {
      if (/\s-{1,2}\S/.test(overrideExecutable)) {
        throw new RuntimeError(
          "RUNTIME_OVERRIDE_INVALID",
          "Runtime Override must not contain command arguments",
          { details: { overrideExecutable } }
        );
      }
      notFound("Runtime Override executable was not found", {
        source: "override",
        executable: overrideExecutable
      });
    }

    return {
      source: "override",
      supportStatus: "overridden",
      executable,
      profile: null
    };
  }
}

module.exports = { RuntimeResolver };
