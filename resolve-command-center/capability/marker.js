const { CapabilityUnavailableError } = require("./errors");

const MARKER_BACKENDS = [
  { id: "resolveApi", implemented: true },
  { id: "resolveScriptApi", implemented: true },
  { id: "workflowPluginApi", implemented: true },
  { id: "keyboardShortcut", implemented: true },
  { id: "uiAutomation", implemented: false }
];

async function isBackendAvailable(backend) {
  if (!backend || typeof backend.addMarker !== "function") {
    return false;
  }

  if (typeof backend.isAvailable !== "function") {
    return true;
  }

  try {
    return Boolean(await backend.isAvailable());
  } catch (error) {
    if (error instanceof CapabilityUnavailableError) {
      return false;
    }

    throw error;
  }
}

function createMarkerCapability(backends = {}) {
  async function selectBackend() {
    const attemptedBackends = [];

    for (const candidate of MARKER_BACKENDS) {
      attemptedBackends.push(candidate.id);
      if (!candidate.implemented) {
        continue;
      }

      const backend = backends[candidate.id];
      if (await isBackendAvailable(backend)) {
        return { backend, backendId: candidate.id };
      }
    }

    throw new CapabilityUnavailableError("marker.add", attemptedBackends);
  }

  async function add(options) {
    const { backend } = await selectBackend();
    return backend.addMarker(options);
  }

  return {
    add,
    selectBackend
  };
}

module.exports = {
  CapabilityUnavailableError,
  MARKER_BACKENDS,
  createMarkerCapability
};
