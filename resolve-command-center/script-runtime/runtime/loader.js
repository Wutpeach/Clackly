const fs = require("node:fs");
const path = require("node:path");
const { RuntimeError } = require("./errors");
const { createRuntimeRegistry } = require("./registry");

const DEFAULT_RUNTIME_ROOT = path.resolve(__dirname, "..", "..", "resources", "runtimes");

function loadRuntimeRegistry({ runtimeRoot = DEFAULT_RUNTIME_ROOT, fileSystem = fs } = {}) {
  const manifestPath = path.join(runtimeRoot, "manifest.json");
  let payload;
  try {
    payload = JSON.parse(fileSystem.readFileSync(manifestPath, "utf8"));
  } catch (error) {
    throw new RuntimeError(
      "RUNTIME_MANIFEST_INVALID",
      `Could not read Runtime Manifest ${manifestPath}: ${error.message}`,
      { details: { manifestPath } }
    );
  }

  try {
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
      throw new RuntimeError(
        "RUNTIME_MANIFEST_INVALID",
        "Runtime Manifest root must be a plain object"
      );
    }
    return createRuntimeRegistry({
      schemaVersion: payload.schemaVersion,
      profiles: payload.profiles,
      runtimeRoot
    });
  } catch (error) {
    if (!(error instanceof RuntimeError)) throw error;
    throw new RuntimeError(error.code, `${error.message} (${manifestPath})`, {
      supportStatus: error.supportStatus,
      details: { ...error.details, manifestPath }
    });
  }
}

module.exports = { DEFAULT_RUNTIME_ROOT, loadRuntimeRegistry };
