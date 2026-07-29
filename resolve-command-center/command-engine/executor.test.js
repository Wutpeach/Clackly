const assert = require("node:assert/strict");
const test = require("node:test");

const { createCommandExecutor } = require("./executor");

test("command execution routes intent metadata to an injected capability handler", async () => {
  const command = {
    id: "timeline.addMarker",
    name: "Add Marker",
    keywords: ["marker"],
    capability: "marker.add"
  };
  const received = [];
  const executeCommand = createCommandExecutor({
    capabilityHandlers: {
      "marker.add": async (selectedCommand) => {
        received.push(selectedCommand);
        return { ok: true };
      }
    },
    findCommand: (commandId) => commandId === command.id ? command : null
  });

  assert.deepEqual(await executeCommand(command.id), { ok: true });
  assert.deepEqual(received, [command]);
});

test("command execution reports unknown commands and missing capabilities", async () => {
  const executeUnknown = createCommandExecutor({
    capabilityHandlers: {},
    findCommand: () => null
  });
  await assert.rejects(executeUnknown("missing"), /Unknown command: missing/);

  const executeMissingCapability = createCommandExecutor({
    capabilityHandlers: {},
    findCommand: () => ({ id: "timeline.addMarker", capability: "marker.add" })
  });
  await assert.rejects(
    executeMissingCapability("timeline.addMarker"),
    /No capability handler registered for marker\.add/
  );
});
