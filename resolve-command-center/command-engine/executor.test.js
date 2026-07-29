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
  const capability = {
    execute: async (selectedCommand) => {
      received.push(selectedCommand);
      return { ok: true };
    }
  };
  const executeCommand = createCommandExecutor({
    capabilityRegistry: {
      get: (capabilityId) => capabilityId === command.capability ? capability : null
    },
    findCommand: (commandId) => commandId === command.id ? command : null
  });

  assert.deepEqual(await executeCommand(command.id), { ok: true });
  assert.deepEqual(received, [command]);
});

test("command execution reports unknown commands and missing capabilities", async () => {
  const capabilityRegistry = { get: () => null };
  const executeUnknown = createCommandExecutor({
    capabilityRegistry,
    findCommand: () => null
  });
  await assert.rejects(executeUnknown("missing"), /Unknown command: missing/);

  const executeMissingCapability = createCommandExecutor({
    capabilityRegistry,
    findCommand: () => ({ id: "timeline.addMarker", capability: "marker.add" })
  });
  await assert.rejects(
    executeMissingCapability("timeline.addMarker"),
    /No capability handler registered for marker\.add/
  );
});
