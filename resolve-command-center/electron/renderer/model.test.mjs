import test from "node:test";
import assert from "node:assert/strict";
import {
  PROTOTYPE_COMMANDS,
  createPresentationCatalog,
  getCommandHint,
  groupCommands,
  rankCommands
} from "./model.mjs";

const commands = [
  { id: "alpha", name: "Alpha", keywords: [], category: "Test" },
  { id: "beta", name: "Beta", keywords: ["alpha"], category: "Test" },
  { id: "recent", name: "Recent Alpha", keywords: [], category: "Test" }
];

test("ranking prioritizes exact, pinned, recent, then source order", () => {
  const ranked = rankCommands(
    commands,
    "alpha",
    new Set(["beta"]),
    new Set(["recent"])
  );

  assert.deepEqual(ranked.map(({ id }) => id), ["alpha", "beta", "recent"]);
});

test("search matches command metadata, not presentation-only categories", () => {
  assert.deepEqual(rankCommands(commands, "test"), []);
});

test("grouping sorts commands and collects non-letter initials under #", () => {
  const grouped = groupCommands([
    { name: "Zulu" },
    { name: "2-Up View" },
    { name: "Alpha" }
  ]);

  assert.deepEqual(grouped.map(([letter]) => letter), ["#", "A", "Z"]);
  assert.equal(grouped[1][1][0].name, "Alpha");
});

test("prototype entries stay unavailable when combined with real commands", () => {
  const catalog = createPresentationCatalog([
    { id: "timeline.addMarker", name: "Add Marker", keywords: ["marker"] }
  ]);

  assert.equal(catalog[0].available, true);
  assert.ok(PROTOTYPE_COMMANDS.every((command) => command.available === false));
  assert.ok(catalog.slice(1).every((command) => command.available === false));
});

test("command hints prefer descriptions and fall back to command state", () => {
  assert.equal(getCommandHint({ name: "Add Marker", available: true, shortcut: "M" }), "Add Marker — Shortcut M");
  assert.equal(getCommandHint({ name: "Blade Cut", available: false }), "Blade Cut is prototype-only and cannot be executed.");
  assert.equal(getCommandHint({ name: "Add Marker", description: "Add a marker at the playhead." }), "Add a marker at the playhead.");
});
