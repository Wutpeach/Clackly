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
    providers: ["resolve-api", "shortcut"],
    configSchema: {}
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

test("marker execute preserves the command argument when a config context is provided", async () => {
  const command = { id: "timeline.addMarker", capability: "marker.add" };
  const marker = createMarkerCapability({
    resolveApi: {
      addMarker: async (received) => {
        assert.equal(received, command);
        return { ok: true };
      }
    }
  });

  assert.deepEqual(
    await marker.execute(command, { config: { get: () => null } }),
    { ok: true }
  );
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

test("marker availability reuses backend selection without executing an action", async () => {
  let executed = false;
  const available = createMarkerCapability({
    resolveApi: { isAvailable: () => true, addMarker: () => { executed = true; } }
  });
  assert.deepEqual(await available.checkAvailability(), {
    status: "ready",
    message: null,
    details: { missing: [], action: null }
  });
  assert.equal(executed, false);

  assert.deepEqual(await createMarkerCapability().checkAvailability(), {
    status: "unavailable",
    message: "No marker provider is available.",
    details: { missing: [], action: null }
  });
});
