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
    description: "Run the test command",
    category: "Test",
    icon: "command",
    keywords: ["test"],
    capability: "test.run",
    ...overrides
  };
}

test("timeline.addMarker preserves registry search with capability metadata", () => {
  resetCommandCache();

  const command = getCommandById("timeline.addMarker");
  assert.deepEqual(command, {
    id: "timeline.addMarker",
    name: "Add Marker",
    description: "Add marker at current frame",
    category: "Timeline",
    icon: "marker",
    keywords: ["marker", "mark", "timeline", "red"],
    capability: "marker.add"
  });
  assert.deepEqual(searchCommands("marker").map(({ id }) => id), [
    "timeline.exportBlueRangeToAfterEffects",
    "timeline.exportCyanRangeToAfterEffects",
    "timeline.addMarker"
  ]);
  assert.deepEqual(searchCommands("current frame"), []);

  command.keywords.push("changed");
  assert.deepEqual(getCommandById("timeline.addMarker").keywords, ["marker", "mark", "timeline", "red"]);
  const searchResult = searchCommands("marker").find(({ id }) => id === "timeline.addMarker");
  searchResult.keywords[0] = "changed";
  assert.equal(getCommandById("timeline.addMarker").keywords[0], "marker");
});

test("After Effects export Commands share one capability and remain searchable", () => {
  resetCommandCache();
  const commands = searchCommands("after effects");
  assert.deepEqual(commands.map(({ id }) => id), [
    "timeline.exportToAfterEffects",
    "timeline.exportCurrentToAfterEffects",
    "timeline.exportBlueRangeToAfterEffects",
    "timeline.exportCyanRangeToAfterEffects"
  ]);
  assert.deepEqual(new Set(commands.map(({ capability }) => capability)), new Set(["ae.export"]));
  assert.equal(commands.some((command) => "runtime" in command || "mode" in command), false);
});

test("command registry requires presentation metadata and drops unsupported fields", (t) => {
  for (const field of ["id", "name", "description", "category", "icon", "capability"]) {
    for (const value of [undefined, "", " "]) {
      assert.throws(() => loadFixture(t, fixture({ [field]: value })), new RegExp(field));
    }
  }

  assert.throws(() => loadFixture(t, fixture({ keywords: ["test", 1] })), /string keywords/);
  const [command] = loadFixture(t, fixture({ interactionHelp: "removed", executor: "resolve" }));
  assert.equal(Object.hasOwn(command, "interactionHelp"), false);
  assert.equal(Object.hasOwn(command, "executor"), false);
});
