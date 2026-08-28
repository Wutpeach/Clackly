import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createTranslator, localizeCommands } from "../../localization/presentation.mjs";
import { createInteractionPanelPresentation } from "./interactionPanelPresentation.mjs";
import { getInteractionHelp } from "./model.mjs";

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
    effectiveLocale: "en",
    ariaLabel: "Command information",
    rows: [
      { label: "Ctrl + Click", actionName: "Add Marker", ariaLabel: "Ctrl + Click: Add Marker" },
      { label: "Right Click", actionName: "Edit Marker", ariaLabel: "Right Click: Edit Marker" }
    ]
  });
  assert.deepEqual(createInteractionPanelPresentation(selectedCommand, [rows[0]]), {
    kind: "description",
    effectiveLocale: "en",
    ariaLabel: "Command information",
    description: "Add a marker at the playhead."
  });
  assert.equal(createInteractionPanelPresentation(null, rows), null);
});

test("Palette owner re-projects localized Command description and mapping copy without giving D7 locale authority", () => {
  const rawCommands = [
    {
      id: "timeline.addMarker",
      name: "Add Marker",
      description: "Add a marker at the playhead.",
      category: "Timeline",
      keywords: [],
      localizations: { "zh-CN": { name: "添加标记", description: "在播放头位置添加标记。" } }
    },
    {
      id: "timeline.editMarker",
      name: "Edit Marker",
      description: "Edit the selected marker.",
      category: "Timeline",
      keywords: [],
      localizations: { "zh-CN": { name: "编辑标记", description: "编辑所选标记。" } }
    }
  ];
  const bindings = [
    { target: "timeline.addMarker", trigger: { button: "left", modifiers: [] }, action: { command: "timeline.addMarker" } },
    { target: "timeline.addMarker", trigger: { button: "right", modifiers: [] }, action: { command: "timeline.editMarker" } }
  ];
  const englishCommands = localizeCommands(rawCommands, "en");
  const chineseCommands = localizeCommands(rawCommands, "zh-CN");
  const englishTarget = englishCommands[0];
  const chineseTarget = chineseCommands[0];
  const englishPresentation = createInteractionPanelPresentation(
    englishTarget,
    getInteractionHelp(englishTarget, englishCommands, bindings, createTranslator("en")),
    "en",
    createTranslator("en")
  );
  const chinesePresentation = createInteractionPanelPresentation(
    chineseTarget,
    getInteractionHelp(chineseTarget, chineseCommands, bindings, createTranslator("zh-CN")),
    "zh-CN",
    createTranslator("zh-CN")
  );

  assert.equal(chineseTarget.name, "添加标记");
  assert.equal(createInteractionPanelPresentation(chineseTarget, [], "zh-CN", createTranslator("zh-CN")).description, "在播放头位置添加标记。");
  assert.deepEqual(englishPresentation, {
    kind: "mappings",
    effectiveLocale: "en",
    ariaLabel: "Command information",
    rows: [
      { label: "Click", actionName: "Add Marker", ariaLabel: "Click: Add Marker" },
      { label: "Right Click", actionName: "Edit Marker", ariaLabel: "Right Click: Edit Marker" }
    ]
  });
  assert.deepEqual(chinesePresentation, {
    kind: "mappings",
    effectiveLocale: "zh-CN",
    ariaLabel: "命令信息",
    rows: [
      { label: "单击", actionName: "添加标记", ariaLabel: "单击：添加标记" },
      { label: "右键单击", actionName: "编辑标记", ariaLabel: "右键单击：编辑标记" }
    ]
  });
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
