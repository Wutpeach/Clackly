import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createInteractionPanelPresentation } from "./interactionPanelPresentation.mjs";

const dirname = path.dirname(fileURLToPath(import.meta.url));

test("D7 presentation projects only static mapping text or the selected Command description", () => {
  const selectedCommand = {
    id: "timeline.addMarker",
    name: "Add Marker",
    description: "Add a marker at the playhead.",
    capability: "marker.add"
  };
  const rows = [
    { label: "Ctrl + Click", actionName: "Add Marker", description: "ignored", execute: true },
    { label: "Right Click", actionName: "Edit Marker", description: "ignored", commandId: "timeline.editMarker" }
  ];

  assert.deepEqual(createInteractionPanelPresentation(selectedCommand, rows), {
    kind: "mappings",
    rows: [
      { label: "Ctrl + Click", actionName: "Add Marker" },
      { label: "Right Click", actionName: "Edit Marker" }
    ]
  });
  assert.deepEqual(createInteractionPanelPresentation(selectedCommand, [rows[0]]), {
    kind: "description",
    description: "Add a marker at the playhead."
  });
  assert.equal(createInteractionPanelPresentation(null, rows), null);
});

test("detached Panel renderer receives presentation only and reuses the shared static content view", () => {
  const detached = fs.readFileSync(path.join(dirname, "DetachedInteractionPanelApp.jsx"), "utf8");
  const preload = fs.readFileSync(path.join(dirname, "../main/preload.js"), "utf8");
  const [detachedPreload] = preload.split("} else {");

  assert.match(detached, /InteractionPanelContent/);
  assert.match(detached, /resolveCommandCenterPanel/);
  assert.doesNotMatch(detached, /executeCommand|executeInteraction|listCommands|openSettings|selectedCommand/);
  assert.match(detachedPreload, /onPresentation/);
  assert.doesNotMatch(detachedPreload, /executeCommand|executeInteraction|listCommands|openSettings|hidePalette/);
});
