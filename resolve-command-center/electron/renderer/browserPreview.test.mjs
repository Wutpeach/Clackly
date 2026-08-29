import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  createBrowserPreviewApi,
  getBrowserSettingsFixture,
  SETTINGS_PREVIEW_SCENARIOS,
  shouldRenderBrowserPreviewAgentation
} from "./browserPreview.mjs";
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

test("Agentation mounts only on the hostless root Palette preview", () => {
  assert.equal(shouldRenderBrowserPreviewAgentation({
    hasElectronHost: false,
    pathname: "/",
    search: ""
  }), true);
  assert.equal(shouldRenderBrowserPreviewAgentation({
    hasElectronHost: true,
    pathname: "/",
    search: ""
  }), false, "Electron dev and packaged renderers keep Agentation out");
  assert.equal(shouldRenderBrowserPreviewAgentation({
    hasElectronHost: false,
    pathname: "/",
    search: "?view=settings"
  }), false, "Settings does not mount the preview tool");
  assert.equal(shouldRenderBrowserPreviewAgentation({
    hasElectronHost: false,
    pathname: "/",
    search: "?preview=agentation"
  }), false, "Agentation has no query-only preview entry");
  assert.equal(shouldRenderBrowserPreviewAgentation({
    hasElectronHost: false,
    pathname: "/renderer/index.html",
    search: ""
  }), false, "Only the normal Vite root URL mounts the preview tool");
});

test("browser preview keeps its locale preference adapter isolated and broadcasts snapshots", async () => {
  const api = createBrowserPreviewApi();
  const changes = [];
  const unsubscribe = api.onLocalizationChanged((snapshot) => changes.push(snapshot));
  assert.equal((await api.getLocalizationSnapshot()).preference, "en");
  assert.deepEqual(await api.setLocalePreference("zh-CN"), { preference: "zh-CN", effectiveLocale: "zh-CN" });
  assert.deepEqual(changes, [{ preference: "zh-CN", effectiveLocale: "zh-CN" }]);
  unsubscribe();
});

test("Settings fixtures are explicit, hostless preview data with defensive copies", async () => {
  assert.deepEqual(SETTINGS_PREVIEW_SCENARIOS, [
    "application-empty",
    "typical-ready",
    "missing-config-long-path",
    "zh-cn-multi-help",
    "busy",
    "error"
  ]);
  assert.equal(getBrowserSettingsFixture("?settings-preview=typical-ready"), null, "fixtures require the Settings view marker");
  assert.equal(getBrowserSettingsFixture("?view=settings&settings-preview=unknown"), null, "unknown preview values keep the ordinary empty hostless Settings state");

  const fixture = getBrowserSettingsFixture("?view=settings&settings-preview=typical-ready");
  assert.equal(fixture.selectedFeatureId, "settings-preview.export");
  assert.equal(fixture.features.length, 3, "typical fixture covers the three-category navigation range");
  assert.equal(fixture.features[0].version, "1.0.0", "typical fixture exposes realistic About version metadata");
  assert.deepEqual(fixture.features[0].providers, ["script", "electron-host"], "typical fixture exposes realistic About provider metadata");
  fixture.features[0].name = "Mutated locally";
  assert.equal(getBrowserSettingsFixture("?view=settings&settings-preview=typical-ready").features[0].name, "Export to After Effects");

  const api = createBrowserPreviewApi({ search: "?view=settings&settings-preview=missing-config-long-path" });
  const features = await api.listFeatures();
  const statuses = await api.listFeatureStatuses();
  const config = await api.getConfig("settings-preview.export");
  assert.equal(features[0].id, "settings-preview.export");
  assert.equal(statuses[0].status, "missing-config");
  assert.match(config.afterEffectsPath, /^C:\\Program Files\\Blackmagic Design\\/);
  features[0].name = "Changed locally";
  assert.equal((await api.listFeatures())[0].name, "Export to After Effects", "fixture callers receive defensive data copies");
  await assert.rejects(api.executeCommand("settings-preview.export"), /cannot execute outside Electron/i);
  await assert.rejects(api.executeInteraction({ target: "settings-preview.export" }), /cannot execute outside Electron/i);

  const busyApi = createBrowserPreviewApi({ search: "?view=settings&settings-preview=busy" });
  const pendingExportConfig = busyApi.getConfig("settings-preview.export");
  assert.deepEqual(await busyApi.getConfig("settings-preview.marker"), {}, "busy fixture isolates the pending config request to its selected Feature");
  let pendingSettled = false;
  pendingExportConfig.then(() => { pendingSettled = true; });
  await Promise.resolve();
  assert.equal(pendingSettled, false, "busy fixture retains an independently cancellable pending Feature config request");
});

test("Settings fixtures simulate only local presentation selection and error states", async () => {
  const selected = await new Promise((resolve) => {
    const api = createBrowserPreviewApi({ search: "?view=settings&settings-preview=zh-cn-multi-help" });
    api.onSettingsFeatureSelected(resolve);
  });
  assert.equal(selected, "settings-preview.export");

  const localized = createBrowserPreviewApi({ search: "?view=settings&settings-preview=zh-cn-multi-help" });
  assert.deepEqual(await localized.getLocalizationSnapshot(), { preference: "zh-CN", effectiveLocale: "zh-CN" });

  const errorApi = createBrowserPreviewApi({ search: "?view=settings&settings-preview=error" });
  await assert.rejects(errorApi.saveConfig("settings-preview.export", {}), /Settings preview save failed/);
});
