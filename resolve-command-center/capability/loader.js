const fs = require("node:fs");
const path = require("node:path");

const DEFAULT_CAPABILITY_DIR = path.join(__dirname, "definitions");

function normalizeManifestPayload(payload, filePath) {
  if (Array.isArray(payload)) {
    return payload;
  }

  if (payload && Array.isArray(payload.capabilities)) {
    return payload.capabilities;
  }

  if (payload && typeof payload === "object") {
    return [payload];
  }

  throw new Error(`Invalid capability manifest format: ${filePath}`);
}

function loadCapabilityDefinitions(capabilityDir = DEFAULT_CAPABILITY_DIR) {
  if (!fs.existsSync(capabilityDir)) {
    return [];
  }

  const definitions = [];
  const seen = new Set();
  const files = fs.readdirSync(capabilityDir)
    .filter((fileName) => fileName.endsWith(".json"))
    .sort();

  for (const fileName of files) {
    const filePath = path.join(capabilityDir, fileName);
    const entries = normalizeManifestPayload(
      JSON.parse(fs.readFileSync(filePath, "utf8")),
      filePath
    );

    for (const definition of entries) {
      if (!definition || typeof definition !== "object" || Array.isArray(definition)) {
        throw new Error(`Invalid capability entry in ${filePath}`);
      }
      if (typeof definition.id !== "string" || definition.id.trim().length === 0) {
        throw new Error(`Capability in ${filePath} is missing a non-empty string id`);
      }
      if (seen.has(definition.id)) {
        throw new Error(`Duplicate capability id ${definition.id}`);
      }

      seen.add(definition.id);
      definitions.push(structuredClone(definition));
    }
  }

  return definitions;
}

module.exports = { DEFAULT_CAPABILITY_DIR, loadCapabilityDefinitions };
