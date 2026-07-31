import test from "node:test";
import assert from "node:assert/strict";
import {
  PROTOTYPE_COMMANDS,
  createPresentationCatalog,
  getCommandHint,
  getInteractionHelp,
  getSettingsControl,
  getSettingsFieldLabel,
  groupFeaturesByCategory,
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
  const interactionHelp = [
    { trigger: { type: "mouse", button: "left", modifiers: [] }, label: "Click", description: "Run command" }
  ];
  const catalog = createPresentationCatalog([
    { id: "timeline.addMarker", name: "Add Marker", keywords: ["marker"], interactionHelp }
  ]);

  assert.equal(catalog[0].available, true);
  assert.equal(catalog[0].interactionHelp, interactionHelp);
  assert.ok(PROTOTYPE_COMMANDS.every((command) => command.available === false));
  assert.ok(catalog.slice(1).every((command) => command.available === false));
});

test("command hints prefer descriptions and fall back to command state", () => {
  assert.equal(getCommandHint({ name: "Add Marker", available: true, shortcut: "M" }), "Add Marker — Shortcut M");
  assert.equal(getCommandHint({ name: "Blade Cut", available: false }), "Blade Cut is prototype-only and cannot be executed.");
  assert.equal(getCommandHint({ name: "Add Marker", description: "Add a marker at the playhead." }), "Add a marker at the playhead.");
});

test("interaction help projects declared rows defensively", () => {
  const interactionHelp = [
    { trigger: { type: "mouse", button: "right", modifiers: [] }, label: "Right Click", description: "Open options" },
    { trigger: { type: "mouse", button: "left", modifiers: ["CTRL", "SHIFT", "ALT"] }, label: "Modified Click", description: "Run alternate action" }
  ];
  const projected = getInteractionHelp({ interactionHelp });

  assert.deepEqual(projected, [
    { label: "Right Click", description: "Open options" },
    { label: "Modified Click", description: "Run alternate action" }
  ]);
  projected[0].label = "Changed";
  assert.equal(interactionHelp[0].label, "Right Click");
  assert.deepEqual(getInteractionHelp({ interactionHelp: [null, { label: "", description: "Missing" }] }), []);
  assert.deepEqual(getInteractionHelp({}), []);
});

test("settings model maps all supported schema types to native controls", () => {
  const fields = {
    title: { type: "string" },
    frame: { type: "number" },
    enabled: { type: "boolean" },
    color: { type: "color" },
    executablePath: { type: "path" },
    output_folder: { type: "folder" },
    mode: { type: "select", options: ["first", "second"] }
  };

  assert.deepEqual(Object.values(fields).map(getSettingsControl), [
    { kind: "input", inputType: "text" },
    { kind: "input", inputType: "number" },
    { kind: "checkbox" },
    { kind: "input", inputType: "color" },
    { kind: "picker", inputType: "text", pickerType: "path" },
    { kind: "picker", inputType: "text", pickerType: "folder" },
    { kind: "select", options: ["first", "second"] }
  ]);
  assert.equal(getSettingsFieldLabel("executablePath", fields.executablePath), "Executable Path");
  assert.equal(getSettingsFieldLabel("output_folder", { ...fields.output_folder, label: "Output" }), "Output");
  assert.throws(() => getSettingsControl({ type: "secret" }), /Unsupported settings field type/);
});

test("feature grouping preserves catalog category and feature order", () => {
  const groups = groupFeaturesByCategory([
    { id: "first", category: "Timeline" },
    { id: "second", category: "Edit" },
    { id: "third", category: "Timeline" }
  ]);

  assert.deepEqual(groups.map(([category]) => category), ["Timeline", "Edit"]);
  assert.deepEqual(groups[0][1].map(({ id }) => id), ["first", "third"]);
});
