const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const {
  getCommands,
  getCommandById,
  isCommandPresentable,
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
    capability: "marker.add",
    presentation: "visible"
  });
  assert.deepEqual(searchCommands("marker").map(({ id }) => id), ["timeline.addMarker"]);
  assert.deepEqual(searchCommands("current frame"), []);

  command.keywords.push("changed");
  assert.deepEqual(getCommandById("timeline.addMarker").keywords, ["marker", "mark", "timeline", "red"]);
  const searchResult = searchCommands("marker").find(({ id }) => id === "timeline.addMarker");
  searchResult.keywords[0] = "changed";
  assert.equal(getCommandById("timeline.addMarker").keywords[0], "marker");
});

test("Paste Clipboard Image command registration uses the standard metadata contract", () => {
  resetCommandCache();
  assert.deepEqual(getCommandById("media.clipboard-image.import"), {
    id: "media.clipboard-image.import",
    name: "Paste Clipboard Image",
    description: "Save the Clipboard image and import it into the Resolve Media Pool",
    category: "Media",
    icon: "image",
    keywords: ["clipboard", "image", "paste", "png", "media pool"],
    capability: "media.clipboard-image.import",
    presentation: "visible"
  });
  assert.deepEqual(searchCommands("clipboard image").map(({ id }) => id), [
    "media.clipboard-image.import"
  ]);
});

test("only the visible After Effects export Command is searchable while internal actions stay executable", () => {
  resetCommandCache();
  const commands = searchCommands("after effects");
  assert.deepEqual(commands.map(({ id }) => id), ["timeline.exportToAfterEffects"]);
  assert.equal(commands.some((command) => "runtime" in command || "mode" in command), false);

  const all = getCommands();
  const aeIds = all.filter(({ capability }) => capability === "ae.export").map(({ id }) => id);
  assert.deepEqual(aeIds, [
    "timeline.exportToAfterEffects",
    "timeline.exportAudioToAfterEffects",
    "timeline.exportVideoToAfterEffects",
    "timeline.exportCurrentToAfterEffects",
    "timeline.exportBlueRangeToAfterEffects",
    "timeline.exportCyanRangeToAfterEffects"
  ]);
  assert.equal(all.every((command) => command.presentation === "visible" || command.presentation === "internal"), true);
  assert.equal(getCommandById("timeline.exportAudioToAfterEffects").presentation, "internal");
});

test("internal Commands execute and resolve by id but never appear in search", () => {
  resetCommandCache();
  assert.deepEqual(searchCommands(""), getCommands().filter((command) => command.presentation !== "internal"));
  for (const query of ["", "audio", "video", "blue", "cyan", "after effects", "export"]) {
    assert.equal(
      searchCommands(query).some((command) => command.presentation === "internal"),
      false,
      `internal Command leaked into search for ${JSON.stringify(query)}`
    );
  }
  assert.equal(isCommandPresentable(getCommandById("timeline.exportToAfterEffects")), true);
  assert.equal(isCommandPresentable(getCommandById("timeline.exportAudioToAfterEffects")), false);
  assert.equal(isCommandPresentable(null), false);
});

test("isCommandPresentable defaults to visible and rejects invalid presentation values", (t) => {
  const [visible] = loadFixture(t, fixture({ id: "test.visible", name: "Visible" }));
  assert.equal(visible.presentation, "visible");
  assert.equal(isCommandPresentable(visible), true);
  const [internal] = loadFixture(t, fixture({
    id: "test.internal",
    name: "Internal",
    presentation: "internal"
  }));
  assert.equal(internal.presentation, "internal");
  assert.equal(isCommandPresentable(internal), false);
  assert.throws(
    () => loadFixture(t, fixture({ id: "test.bad", name: "Bad", presentation: "hidden" })),
    /visible or internal presentation/
  );

  const [cloned] = loadFixture(t, fixture({
    id: "test.clone",
    name: "Clone",
    presentation: "internal"
  }));
  cloned.presentation = "visible";
  assert.equal(loadFixture(t, fixture({
    id: "test.clone",
    name: "Clone",
    presentation: "internal"
  }))[0].presentation, "internal");
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
