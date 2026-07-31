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
    findCommand: (commandId) => commandId === command.id ? command : null
  });

  assert.deepEqual(await executeCommand(command.id), { ok: true });
  assert.deepEqual(configured, [command.capability]);
  assert.deepEqual(received, [[command, { config: scopedConfig }]]);
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

test("command executor requires configuration composition", () => {
  assert.throws(
    () => createCommandExecutor({ capabilityRegistry: { get() {} } }),
    /requires a config manager/
  );
});
