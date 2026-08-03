const path = require("node:path");
const { RuntimeError } = require("./errors");

const NODE_PLATFORMS = new Set([
  "aix", "darwin", "freebsd", "linux", "openbsd", "sunos", "win32"
]);
const NODE_ARCHITECTURES = new Set([
  "arm", "arm64", "ia32", "loong64", "mips", "mipsel", "ppc", "ppc64",
  "riscv64", "s390", "s390x", "x64"
]);
const VERSION = "(?:0|[1-9]\\d*)";
const RUNTIME_VERSION = new RegExp(`^${VERSION}\\.${VERSION}\\.${VERSION}$`);
const VERSION_PREFIX = new RegExp(`^${VERSION}(?:\\.${VERSION}){2,}$`);

function invalid(message, details = {}) {
  throw new RuntimeError("RUNTIME_MANIFEST_INVALID", message, { details });
}

function isPlainObject(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function requireString(record, field, profileId) {
  if (typeof record[field] !== "string" || record[field].trim().length === 0) {
    invalid(`Runtime profile ${profileId} requires a non-empty ${field}`, {
      profileId,
      field
    });
  }
}

function requireDenseArray(value, field, profileId) {
  if (!Array.isArray(value) || value.length === 0) {
    invalid(`Runtime profile ${profileId} requires a non-empty ${field} array`, {
      profileId,
      field
    });
  }
  for (let index = 0; index < value.length; index += 1) {
    if (!Object.hasOwn(value, index)) {
      invalid(`Runtime profile ${profileId} ${field} must be dense`, {
        profileId,
        field
      });
    }
  }
}

function isContained(root, target) {
  const relative = path.relative(root, target);
  return relative === "" || (!path.isAbsolute(relative)
    && relative !== ".."
    && !relative.startsWith(`..${path.sep}`));
}

function validateProfile(input, runtimeRoot) {
  if (!isPlainObject(input)) invalid("Runtime profiles must be plain objects");

  const profileId = typeof input.id === "string" && input.id.trim()
    ? input.id
    : "<unknown>";
  for (const field of [
    "id", "runtime", "implementation", "runtimeVersion", "platform",
    "architecture", "executable", "verification"
  ]) {
    requireString(input, field, profileId);
  }

  if (!RUNTIME_VERSION.test(input.runtimeVersion)) {
    invalid(`Runtime profile ${input.id} has an invalid runtimeVersion`, {
      profileId: input.id,
      field: "runtimeVersion"
    });
  }
  if (!NODE_PLATFORMS.has(input.platform)) {
    invalid(`Runtime profile ${input.id} has an invalid Node platform`, {
      profileId: input.id,
      field: "platform"
    });
  }
  if (!NODE_ARCHITECTURES.has(input.architecture)) {
    invalid(`Runtime profile ${input.id} has an invalid Node architecture`, {
      profileId: input.id,
      field: "architecture"
    });
  }

  requireDenseArray(input.capabilities, "capabilities", input.id);
  const capabilities = new Set();
  for (const capabilityId of input.capabilities) {
    if (typeof capabilityId !== "string" || capabilityId.trim().length === 0) {
      invalid(`Runtime profile ${input.id} capabilities must be non-empty strings`, {
        profileId: input.id,
        field: "capabilities"
      });
    }
    if (capabilities.has(capabilityId)) {
      invalid(`Runtime profile ${input.id} has duplicate capability ${capabilityId}`, {
        profileId: input.id,
        field: "capabilities"
      });
    }
    capabilities.add(capabilityId);
  }

  if (!isPlainObject(input.host)) {
    invalid(`Runtime profile ${input.id} requires a host object`, {
      profileId: input.id,
      field: "host"
    });
  }
  requireString(input.host, "application", input.id);
  requireString(input.host, "versionPrefix", input.id);
  if (!VERSION_PREFIX.test(input.host.versionPrefix)) {
    invalid(`Runtime profile ${input.id} has an invalid host versionPrefix`, {
      profileId: input.id,
      field: "host.versionPrefix"
    });
  }

  const segments = input.executable.split("/");
  if (path.posix.isAbsolute(input.executable)
    || path.win32.isAbsolute(input.executable)
    || input.executable.includes("\\")
    || segments.length < 2
    || segments.some((segment) => !segment || segment === "." || segment === "..")) {
    invalid(`Runtime profile ${input.id} executable must be a contained relative resource path`, {
      profileId: input.id,
      field: "executable"
    });
  }
  const candidate = path.resolve(runtimeRoot, ...segments);
  if (!isContained(runtimeRoot, candidate)) {
    invalid(`Runtime profile ${input.id} executable escapes the runtime root`, {
      profileId: input.id,
      field: "executable"
    });
  }
  if (input.verification !== "machine-verified") {
    invalid(`Runtime profile ${input.id} has an unsupported verification`, {
      profileId: input.id,
      field: "verification"
    });
  }

  return structuredClone(input);
}

function createRuntimeRegistry(options = {}) {
  const { profiles, runtimeRoot } = options;
  const schemaVersion = Object.hasOwn(options, "schemaVersion")
    ? options.schemaVersion
    : 1;
  if (schemaVersion !== 1) {
    invalid(`Unsupported Runtime Manifest schema version: ${schemaVersion}`, {
      field: "schemaVersion",
      schemaVersion
    });
  }
  if (typeof runtimeRoot !== "string" || runtimeRoot.trim().length === 0) {
    invalid("Runtime Registry requires a runtime root", { field: "runtimeRoot" });
  }
  requireDenseArray(profiles, "profiles", "Manifest");

  const absoluteRoot = path.resolve(runtimeRoot);
  const validated = profiles.map((profile) => validateProfile(profile, absoluteRoot));
  const ids = new Set();
  for (const profile of validated) {
    if (ids.has(profile.id)) {
      invalid(`Duplicate runtime profile id ${profile.id}`, {
        profileId: profile.id,
        field: "id"
      });
    }
    ids.add(profile.id);
  }

  const records = new Map(validated.map((profile) => [profile.id, profile]));

  function register(profile) {
    const record = validateProfile(profile, absoluteRoot);
    if (records.has(record.id)) {
      invalid(`Duplicate runtime profile id ${record.id}`, {
        profileId: record.id,
        field: "id"
      });
    }
    records.set(record.id, record);
    return structuredClone(record);
  }

  function get(id) {
    const record = records.get(id);
    return record ? structuredClone(record) : null;
  }

  function getAll() {
    return Array.from(records.values())
      .sort((left, right) => left.id < right.id ? -1 : left.id > right.id ? 1 : 0)
      .map((profile) => structuredClone(profile));
  }

  return { runtimeRoot: absoluteRoot, register, get, getAll };
}

module.exports = { createRuntimeRegistry };
