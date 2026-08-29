const assert = require("node:assert/strict");
const test = require("node:test");

const { createCommandExecutor } = require("./executor");

test("command execution routes intent metadata through the capability registry", async () => {
  const command = {
    id: "timeline.addMarker",
    name: "Add Marker",
    keywords: ["marker"],
    capability: "marker.add"
  };
  const received = [];
  const scopedConfig = { get: () => null };
  const capability = {
    execute: async (...args) => {
      received.push(args);
      return { ok: true };
    }
  };
  const configured = [];
  const enabled = [];
  const executeCommand = createCommandExecutor({
    capabilityRegistry: {
      get: (capabilityId) => capabilityId === command.capability ? capability : null
    },
    configManager: {
      assertConfigured: (capabilityId) => configured.push(capabilityId),
      forCapability: (capabilityId) => {
        assert.equal(capabilityId, command.capability);
        return scopedConfig;
      }
    },
    featureStatusManager: { assertEnabled: (id) => enabled.push(id) },
    findCommand: (commandId) => commandId === command.id ? command : null
  });

  assert.deepEqual(await executeCommand(command.id), { ok: true });
  assert.deepEqual(configured, [command.capability]);
  assert.deepEqual(enabled, [command.capability]);
  assert.deepEqual(received, [[command, { config: scopedConfig }]]);
});

test("command execution blocks disabled features before configuration and capability execution", async () => {
  let configured = false;
  let executed = false;
  const executeCommand = createCommandExecutor({
    capabilityRegistry: { get: () => ({ execute: () => { executed = true; } }) },
    configManager: {
      assertConfigured: () => { configured = true; },
      forCapability: () => ({ get: () => null })
    },
    featureStatusManager: {
      assertEnabled: () => { throw new Error("Feature is disabled: marker.add"); }
    },
    findCommand: () => ({ id: "timeline.addMarker", capability: "marker.add" })
  });

  await assert.rejects(executeCommand("timeline.addMarker"), /disabled: marker\.add/);
  assert.equal(configured, false);
  assert.equal(executed, false);
});

test("command execution reports unknown commands and missing capabilities", async () => {
  const capabilityRegistry = { get: () => null };
  const configManager = {
    assertConfigured() {},
    forCapability() { return { get: () => null }; }
  };
  const executeUnknown = createCommandExecutor({
    capabilityRegistry,
    configManager,
    findCommand: () => null
  });
  await assert.rejects(executeUnknown("missing"), /Unknown command: missing/);

  const executeMissingCapability = createCommandExecutor({
    capabilityRegistry,
    configManager,
    findCommand: () => ({ id: "timeline.addMarker", capability: "marker.add" })
  });
  await assert.rejects(
    executeMissingCapability("timeline.addMarker"),
    /No capability handler registered for marker\.add/
  );
});

test("command execution blocks missing required configuration before capability execution", async () => {
  let executed = false;
  const executeCommand = createCommandExecutor({
    capabilityRegistry: {
      get: () => ({ execute: () => { executed = true; } })
    },
    configManager: {
      assertConfigured: () => {
        throw new Error("Capability ae.export is missing required configuration: aePath, mode");
      },
      forCapability: () => assert.fail("scoped config should not be created")
    },
    findCommand: () => ({ id: "ae.export", capability: "ae.export" })
  });

  await assert.rejects(
    executeCommand("ae.export"),
    /ae\.export.*aePath, mode/
  );
  assert.equal(executed, false);
});

test("internal command ids execute through the default command lookup", async () => {
  const received = [];
  const executeCommand = createCommandExecutor({
    capabilityRegistry: {
      get: () => ({
        execute: async (command) => {
          received.push(command.id);
          return { ok: true };
        }
      })
    },
    configManager: {
      assertConfigured() {},
      forCapability: () => ({ get: () => null })
    }
  });

  assert.deepEqual(await executeCommand("timeline.exportAudioToAfterEffects"), { ok: true });
  assert.deepEqual(received, ["timeline.exportAudioToAfterEffects"]);
});

test("command executor requires configuration composition", () => {
  assert.throws(
    () => createCommandExecutor({ capabilityRegistry: { get() {} } }),
    /requires a config manager/
  );
});

test("usage records only accepted starts, immediately before Capability execution, including failures", async () => {
  const events = [];
  const command = { id: "timeline.addMarker", capability: "marker.add" };
  const executeCommand = createCommandExecutor({
    capabilityRegistry: {
      get: () => ({
        execute: async () => {
          events.push("execute");
          throw new Error("Capability started then failed");
        }
      })
    },
    configManager: {
      assertConfigured: () => events.push("configured"),
      forCapability: () => {
        events.push("scoped-config");
        return { get() {} };
      }
    },
    featureStatusManager: { assertEnabled: () => events.push("enabled") },
    usageHistory: { record: (commandId) => events.push(`usage:${commandId}`) },
    findCommand: () => command
  });

  await assert.rejects(executeCommand(command.id), /started then failed/);
  assert.deepEqual(events, [
    "enabled",
    "configured",
    "scoped-config",
    "usage:timeline.addMarker",
    "execute"
  ]);
});

test("rejected Command gates and usage diagnostics never alter execution authority", async () => {
  const records = [];
  const usageHistory = { record: (id) => records.push(id) };
  const base = {
    configManager: { assertConfigured() {}, forCapability: () => ({ get() {} }) },
    usageHistory
  };
  await assert.rejects(
    createCommandExecutor({ ...base, capabilityRegistry: { get() {} }, findCommand: () => null })("unknown"),
    /Unknown command/
  );
  await assert.rejects(
    createCommandExecutor({ ...base, capabilityRegistry: { get: () => null }, findCommand: () => ({ id: "known", capability: "missing" }) })("known"),
    /No capability handler/
  );
  await assert.rejects(
    createCommandExecutor({
      ...base,
      capabilityRegistry: { get: () => ({ execute() {} }) },
      featureStatusManager: { assertEnabled: () => { throw new Error("disabled"); } },
      findCommand: () => ({ id: "known", capability: "feature" })
    })("known"),
    /disabled/
  );
  await assert.rejects(
    createCommandExecutor({
      ...base,
      capabilityRegistry: { get: () => ({ execute() {} }) },
      configManager: { assertConfigured: () => { throw new Error("missing config"); }, forCapability() { assert.fail("not reached"); } },
      findCommand: () => ({ id: "known", capability: "feature" })
    })("known"),
    /missing config/
  );
  assert.deepEqual(records, []);

  const executeWithBrokenUsage = createCommandExecutor({
    ...base,
    usageHistory: { record: () => { throw new Error("history unavailable"); } },
    capabilityRegistry: { get: () => ({ execute: () => ({ ok: true }) }) },
    findCommand: () => ({ id: "known", capability: "feature" })
  });
  assert.deepEqual(await executeWithBrokenUsage("known"), { ok: true });
});
