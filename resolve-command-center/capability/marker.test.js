const assert = require("node:assert/strict");
const test = require("node:test");

const {
  CapabilityUnavailableError,
  createMarkerCapability
} = require("./marker");

test("marker capability exposes descriptive metadata", () => {
  assert.deepEqual(createMarkerCapability().metadata, {
    id: "marker.add",
    name: "Add Marker",
    description: "Add marker at current timeline position",
    category: "Timeline",
    icon: "marker",
    version: "1.0.0",
    type: "command",
    providers: ["resolve-api", "shortcut"]
  });
});

test("marker execute selects the highest-priority available backend", async () => {
  const calls = [];
  const marker = createMarkerCapability({
    resolveApi: {
      isAvailable: () => true,
      addMarker: async () => {
        calls.push("resolveApi");
        return { backend: "resolveApi" };
      }
    },
    resolveScriptApi: {
      addMarker: async () => {
        calls.push("resolveScriptApi");
        return { backend: "resolveScriptApi" };
      }
    },
    workflowPluginApi: {
      addMarker: async () => {
        calls.push("workflowPluginApi");
        return { backend: "workflowPluginApi" };
      }
    }
  });

  assert.deepEqual(await marker.execute(), { backend: "resolveApi" });
  assert.deepEqual(calls, ["resolveApi"]);
});

test("marker add falls back when higher-priority backends are unavailable", async () => {
  const marker = createMarkerCapability({
    resolveApi: {
      isAvailable: () => false,
      addMarker: () => assert.fail("unavailable backend should not execute")
    },
    resolveScriptApi: {
      isAvailable: () => {
        throw new CapabilityUnavailableError("marker.add");
      },
      addMarker: () => assert.fail("unavailable backend should not execute")
    },
    workflowPluginApi: {
      addMarker: async () => ({ backend: "workflowPluginApi" })
    }
  });

  assert.deepEqual(await marker.add(), { backend: "workflowPluginApi" });
});

test("marker add propagates execution errors without trying a lower backend", async () => {
  const semanticError = new Error("marker already exists");
  let fallbackCalled = false;
  const marker = createMarkerCapability({
    resolveApi: {
      addMarker: async () => {
        throw semanticError;
      }
    },
    resolveScriptApi: {
      addMarker: async () => {
        fallbackCalled = true;
      }
    }
  });

  await assert.rejects(marker.add(), (error) => error === semanticError);
  assert.equal(fallbackCalled, false);
});

test("marker add reports a CapabilityUnavailableError when no backend can execute", async () => {
  const marker = createMarkerCapability({
    keyboardShortcut: {
      isAvailable: () => false,
      addMarker: () => assert.fail("unavailable backend should not execute")
    }
  });

  await assert.rejects(marker.add(), (error) => {
    assert.equal(error instanceof CapabilityUnavailableError, true);
    assert.equal(error.capability, "marker.add");
    assert.deepEqual(error.attemptedBackends, [
      "resolveApi",
      "resolveScriptApi",
      "workflowPluginApi",
      "keyboardShortcut",
      "uiAutomation"
    ]);
    return true;
  });
});
