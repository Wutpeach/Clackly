import test from "node:test";
import assert from "node:assert/strict";
import {
  canExecuteCommand,
  canExecuteFeature,
  createPresentationCatalog,
  getCommandHint,
  getFeatureWarning,
  getInteractionHelp,
  getInteractionHelpCommands,
  getRecoveryAction,
  getSettingsControl,
  groupFeaturesByCategory,
  groupCommands,
  isCommandPresentable,
  isFeatureVisible,
  joinFeatureStatuses,
  projectLauncherSections,
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

test("launcher sections preserve ranked order while projecting pinned and recent commands once", () => {
  const ranked = [commands[1], commands[2], commands[0]];
  const sections = projectLauncherSections(
    ranked,
    new Set(["beta"]),
    new Set(["beta", "recent"])
  );

  assert.deepEqual(sections.map(([id]) => id), ["pinned", "recent", "commands"]);
  assert.deepEqual(
    sections.flatMap(([, , sectionCommands]) => sectionCommands).map(({ id }) => id),
    ["beta", "recent", "alpha"]
  );
  assert.deepEqual(projectLauncherSections([], new Set(["alpha"]), new Set(["recent"])), []);
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

test("presentation catalog preserves registered command metadata only", () => {
  const catalog = createPresentationCatalog([
    {
      id: "timeline.addMarker",
      capability: "marker.add",
      name: "Add Marker",
      description: "Add marker at current frame",
      category: "Timeline",
      icon: "marker",
      keywords: ["marker"],
    }
  ], [{
    id: "marker.add",
    installed: true,
    enabled: true,
    status: "ready",
    message: null,
    details: { missing: [], action: null }
  }]);

  assert.equal(catalog.length, 1);
  assert.equal(catalog[0].available, true);
  assert.equal(catalog[0].description, "Add marker at current frame");
  assert.equal(catalog[0].category, "Timeline");
  assert.equal(catalog[0].icon, "marker");
  assert.equal(Object.hasOwn(catalog[0], "shortcut"), false);
});

test("presentation catalog hides internal Commands from every palette surface", () => {
  const visible = {
    id: "timeline.exportToAfterEffects",
    capability: "ae.export",
    name: "Export to After Effects",
    description: "Automatically send the current Resolve selection to After Effects",
    category: "Export",
    icon: "send",
    keywords: ["after effects"],
    presentation: "visible"
  };
  const internal = {
    ...visible,
    id: "timeline.exportAudioToAfterEffects",
    name: "Export Audio to After Effects",
    description: "Send the current Resolve audio selection to After Effects",
    keywords: ["audio"],
    presentation: "internal"
  };
  const status = {
    id: "ae.export",
    installed: true,
    enabled: true,
    status: "ready",
    message: null,
    details: { missing: [], action: null }
  };

  assert.equal(isCommandPresentable(visible), true);
  assert.equal(isCommandPresentable(internal), false);
  assert.equal(isCommandPresentable(null), false);
  assert.deepEqual(
    createPresentationCatalog([visible, internal], [status]).map(({ id }) => id),
    ["timeline.exportToAfterEffects"]
  );
});

test("internal action descriptions resolve under visible targets but never create help headings", () => {
  const target = {
    id: "timeline.exportToAfterEffects",
    capability: "ae.export",
    name: "Export to After Effects",
    description: "Automatically send the current Resolve selection to After Effects",
    presentation: "visible"
  };
  const audioAction = {
    id: "timeline.exportAudioToAfterEffects",
    capability: "ae.export",
    name: "Export Audio to After Effects",
    description: "Send the current Resolve audio selection to After Effects",
    presentation: "internal"
  };
  const commands = [target, audioAction];
  const bindings = [{
    id: "audio",
    target: target.id,
    trigger: { type: "mouse", button: "left", modifiers: ["CTRL"] },
    action: { command: audioAction.id }
  }];

  assert.deepEqual(getInteractionHelp(target, commands, bindings), [
    {
      label: "Ctrl + Click",
      actionName: "Export Audio to After Effects",
      description: "Send the current Resolve audio selection to After Effects"
    }
  ]);
  assert.deepEqual(getInteractionHelpCommands(commands, "ae.export", bindings).map(({ id }) => id), [
    "timeline.exportToAfterEffects"
  ]);
  assert.deepEqual(getInteractionHelpCommands(commands, "ae.export", []), []);
  assert.deepEqual(getInteractionHelpCommands([audioAction], "ae.export", bindings), []);
  assert.deepEqual(getInteractionHelpCommands(commands, "other.capability", bindings), []);
});

test("feature lifecycle projection drives visibility, execution, warning, and recovery", () => {
  const ready = {
    id: "marker.add",
    installed: true,
    enabled: true,
    status: "ready",
    message: null,
    details: { missing: [], action: null }
  };
  const missing = {
    ...ready,
    status: "missing-config",
    message: "Missing Resolve Path",
    details: { missing: ["resolvePath"], action: "open-settings" }
  };
  const disabled = { ...ready, enabled: false };
  const loading = { ...ready, status: "loading", message: "Checking feature availability…" };

  assert.equal(isFeatureVisible(ready), true);
  assert.equal(isFeatureVisible({ ...ready, installed: false }), false);
  assert.equal(canExecuteFeature(ready), true);
  assert.equal(canExecuteFeature(missing), false);
  assert.equal(canExecuteFeature(disabled), false);
  assert.equal(canExecuteFeature(loading), false);
  assert.deepEqual(getFeatureWarning(missing), {
    kind: "missing-config",
    message: "Missing Resolve Path"
  });
  assert.deepEqual(getFeatureWarning(disabled), {
    kind: "disabled",
    message: "Feature is disabled."
  });
  assert.deepEqual(getFeatureWarning(loading), {
    kind: "loading",
    message: "Checking feature availability…"
  });
  assert.equal(getRecoveryAction(missing), "open-settings");
  assert.equal(getRecoveryAction(ready), null);

  const [command] = createPresentationCatalog([
    { id: "timeline.addMarker", capability: "marker.add", name: "Add Marker", keywords: [] }
  ], [missing]);
  assert.equal(command.featureStatus, missing);
  assert.equal(canExecuteCommand(command), false);
  assert.equal(getCommandHint(command), "Missing Resolve Path");
  assert.deepEqual(joinFeatureStatuses([{ id: "marker.add" }], [ready])[0].featureStatus, ready);

  const withoutStatus = createPresentationCatalog([
    { id: "timeline.addMarker", capability: "marker.add", name: "Add Marker", keywords: [] }
  ]);
  assert.equal(withoutStatus.some(({ id }) => id === "timeline.addMarker"), false);
  assert.equal(canExecuteCommand({ available: true, featureStatus: null }), false);
});

test("command hints prefer descriptions and fall back to command state", () => {
  assert.equal(getCommandHint({ name: "Add Marker", description: "Add a marker at the playhead." }), "Add a marker at the playhead.");
  assert.equal(getCommandHint({ name: "Add Marker" }), "Add Marker");
});

test("interaction help joins normalized bindings to registered action labels and descriptions", () => {
  const target = { id: "timeline.addMarker", name: "Add Marker", description: "Add marker at current frame" };
  const commands = [
    target,
    { id: "timeline.openOptions", name: "Open Marker Options", description: "Open marker options" },
    { id: "timeline.addNote", name: "Add Marker Note", description: "Add a marker note" }
  ];
  const bindings = [
    {
      id: "left",
      target: target.id,
      trigger: { type: "mouse", button: "left", modifiers: [] },
      action: { command: "timeline.addMarker" }
    },
    {
      id: "right",
      target: target.id,
      trigger: { type: "mouse", button: "right", modifiers: ["SHIFT"] },
      action: { command: "timeline.openOptions" }
    },
    {
      id: "modified",
      target: target.id,
      trigger: { type: "mouse", button: "left", modifiers: ["CTRL", "SHIFT", "ALT"] },
      action: { command: "timeline.addNote" }
    },
    {
      id: "unresolved",
      target: target.id,
      trigger: { type: "mouse", button: "right", modifiers: [] },
      action: { command: "missing.command" }
    }
  ];
  const projected = getInteractionHelp(target, commands, bindings);

  assert.deepEqual(projected, [
    { label: "Click", actionName: "Add Marker", description: "Add marker at current frame" },
    { label: "Shift + Right Click", actionName: "Open Marker Options", description: "Open marker options" },
    { label: "Ctrl + Shift + Alt + Click", actionName: "Add Marker Note", description: "Add a marker note" }
  ]);
  projected[0].label = "Changed";
  assert.equal(bindings[0].trigger.button, "left");
  assert.deepEqual(getInteractionHelp(target, commands, []), []);
  assert.deepEqual(getInteractionHelp(target, commands, [{ ...bindings[0], target: "other" }]), []);
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
