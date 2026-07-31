const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const {
  getCommands,
  getCommandById,
  loadCommands,
  resetCommandCache,
  searchCommands
} = require("./registry");

function loadFixture(t, command) {
  const commandDir = fs.mkdtempSync(path.join(os.tmpdir(), "clackly-commands-"));
  t.after(() => fs.rmSync(commandDir, { recursive: true, force: true }));
  fs.writeFileSync(path.join(commandDir, "fixture.json"), JSON.stringify([command]), "utf8");
  return loadCommands(commandDir);
}

function fixture(overrides = {}) {
  return {
    id: "test.command",
    name: "Test Command",
    keywords: ["test"],
    capability: "test.run",
    ...overrides
  };
}

test("timeline.addMarker preserves registry search with capability metadata", () => {
  resetCommandCache();

  const command = getCommandById("timeline.addMarker");
  assert.equal(command.capability, "marker.add");
  assert.equal(Object.hasOwn(command, "executor"), false);
  assert.deepEqual(command.interactionHelp, [{
    trigger: { type: "mouse", button: "left", modifiers: [] },
    label: "Click",
    description: "Add marker at current frame"
  }]);
  assert.deepEqual(searchCommands("marker").map(({ id }) => id), ["timeline.addMarker"]);

  command.interactionHelp[0].label = "Changed";
  command.interactionHelp[0].trigger.modifiers.push("ALT");
  assert.equal(getCommandById("timeline.addMarker").interactionHelp[0].label, "Click");
  assert.deepEqual(getCommands()[0].interactionHelp[0].trigger.modifiers, []);
  const searchResult = searchCommands("marker")[0];
  searchResult.interactionHelp[0].description = "Changed";
  assert.equal(searchCommands("marker")[0].interactionHelp[0].description, "Add marker at current frame");
});

test("command registry normalizes supported interaction help triggers", (t) => {
  const interactionHelp = [
    { trigger: { type: "mouse", button: "right", modifiers: [] }, label: "Right Click", description: "Open options" },
    { trigger: { type: "mouse", button: "left", modifiers: ["CTRL"] }, label: "CTRL + Click", description: "Run control action" },
    { trigger: { type: "mouse", button: "left", modifiers: ["SHIFT"] }, label: "SHIFT + Click", description: "Run shift action" },
    { trigger: { type: "mouse", button: "left", modifiers: ["ALT"] }, label: "ALT + Click", description: "Run alt action" },
    { trigger: { type: "mouse", button: "right", modifiers: ["ALT", "CTRL", "SHIFT"] }, label: "Modified Right Click", description: "Run combined action" }
  ];

  const [command] = loadFixture(t, fixture({ interactionHelp }));
  assert.deepEqual(command.interactionHelp[4].trigger.modifiers, ["CTRL", "SHIFT", "ALT"]);
  assert.notEqual(command.interactionHelp, interactionHelp);
  assert.deepEqual(loadFixture(t, fixture())[0].interactionHelp, []);
});

test("command registry rejects malformed or ambiguous interaction help", (t) => {
  const validEntry = {
    trigger: { type: "mouse", button: "left", modifiers: [] },
    label: "Click",
    description: "Run command"
  };
  const invalidValues = [
    null,
    {},
    [null],
    [{ ...validEntry, extra: true }],
    [{ ...validEntry, label: " " }],
    [{ ...validEntry, description: "" }],
    [{ ...validEntry, trigger: { ...validEntry.trigger, type: "keyboard" } }],
    [{ ...validEntry, trigger: { ...validEntry.trigger, button: "middle" } }],
    [{ ...validEntry, trigger: { ...validEntry.trigger, modifiers: "CTRL" } }],
    [{ ...validEntry, trigger: { ...validEntry.trigger, modifiers: ["META"] } }],
    [{ ...validEntry, trigger: { ...validEntry.trigger, modifiers: ["CTRL", "CTRL"] } }],
    [
      { ...validEntry, trigger: { ...validEntry.trigger, modifiers: ["CTRL", "SHIFT"] } },
      { ...validEntry, trigger: { ...validEntry.trigger, modifiers: ["SHIFT", "CTRL"] } }
    ]
  ];

  for (const interactionHelp of invalidValues) {
    assert.throws(() => loadFixture(t, fixture({ interactionHelp })), /interactionHelp|modifier|button|object/);
  }
});
