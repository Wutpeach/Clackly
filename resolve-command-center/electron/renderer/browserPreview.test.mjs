import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createBrowserPreviewApi } from "./browserPreview.mjs";
import { getInteractionHelp } from "./model.mjs";

test("browser preview keeps representative presentation data isolated and non-executable", async () => {
  const api = createBrowserPreviewApi();
  const commands = await api.listCommands();
  const bindings = await api.listInteractionBindings();
  const statuses = await api.listFeatureStatuses();

  assert.deepEqual(commands.filter((command) => command.presentation !== "internal").map(({ id }) => id), [
    "preview.primary",
    "preview.secondary"
  ]);
  assert.deepEqual(getInteractionHelp(commands[0], commands, bindings).map(({ actionName }) => actionName), [
    "Preview Color Grade",
    "Inspect Preview Details",
    "Adjust Preview Settings"
  ]);
  assert.equal(statuses[0].id, "preview.palette");

  commands[0].name = "Changed locally";
  assert.equal((await api.listCommands())[0].name, "Preview Color Grade", "preview callers receive defensive data copies");
  await assert.rejects(api.executeCommand("preview.primary"), /cannot execute outside Electron/i);
  await assert.rejects(api.executeInteraction({ target: "preview.primary" }), /cannot execute outside Electron/i);
});

test("browser preview calculates only local bounded panel presentation geometry", async () => {
  const api = createBrowserPreviewApi();

  assert.deepEqual(await api.openInteractionPanel({ anchorY: 160, contentHeight: 100 }), {
    panelTop: 110,
    panelHeight: 100,
    anchorY: 160
  });
  assert.deepEqual(await api.openInteractionPanel({ anchorY: 0, contentHeight: 999 }), {
    panelTop: 8,
    panelHeight: 180,
    anchorY: 0
  });
  assert.deepEqual(await api.openInteractionPanel({ anchorY: 320, contentHeight: 10 }), {
    panelTop: 252,
    panelHeight: 60,
    anchorY: 320
  });
});

test("browser preview reads the canonical visual contract while remaining a hostless DOM composition", () => {
  const previewSource = fs.readFileSync(new URL("./browserPreview.mjs", import.meta.url), "utf8");
  const appSource = fs.readFileSync(new URL("./App.jsx", import.meta.url), "utf8");
  const styles = fs.readFileSync(new URL("./styles.css", import.meta.url), "utf8");
  const geometryPath = path.join(path.dirname(fileURLToPath(import.meta.url)), "../shared/palette-geometry.json");
  const geometry = JSON.parse(fs.readFileSync(geometryPath, "utf8"));

  assert.match(previewSource, /import paletteGeometry from "\.\.\/shared\/palette-geometry\.json"/);
  assert.match(previewSource, /const \{ inset: PANEL_INSET, minHeight: PANEL_MIN_HEIGHT, maxHeight: PANEL_MAX_HEIGHT \} = paletteGeometry\.interactionPanel/);
  assert.match(previewSource, /const PALETTE_HEIGHT = paletteGeometry\.main\.height/);
  assert.equal(geometry.main.width, 240);
  assert.equal(geometry.main.height, 320);
  assert.equal(geometry.main.surface, "#151619");
  assert.deepEqual(geometry.interactionPanel, {
    gap: 16,
    width: 260,
    minHeight: 60,
    maxHeight: 180,
    inset: 8,
    radius: 4
  });
  assert.match(appSource, /getPaletteVisualStyle\(paletteShadowPadding\)/);
  assert.match(styles, /\.palette-shell\.browser-preview\[data-interaction-panel-open\]\s*\{[^}]*var\(--interaction-panel-gap\)[^}]*var\(--interaction-panel-width\)/s);
  assert.match(styles, /#root:has\(> \.palette-shell\.browser-preview\)/);
  assert.doesNotMatch(previewSource, /BrowserWindow|ipcRenderer|resolveCommandCenterPanel|palette-surface/);
});