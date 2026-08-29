import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rendererDir = path.dirname(fileURLToPath(import.meta.url));
const read = (name) => fs.readFileSync(path.join(rendererDir, name), "utf8");

test("Settings has a fixed three-column projection with application selection outside FeatureCatalog", () => {
  const styles = read("styles.css");
  const app = read("SettingsApp.jsx");

  assert.match(styles, /\.settings-shell\s*\{[^}]*--settings-nav-width:\s*190px[^}]*--settings-inspector-width:\s*220px/s);
  assert.match(styles, /\.settings-workspace\s*\{[^}]*grid-template-columns:\s*var\(--settings-nav-width\) minmax\(0, 1fr\) var\(--settings-inspector-width\)/s);
  assert.match(styles, /\.feature-sidebar\s*\{[^}]*grid-template-rows:\s*auto minmax\(0, 1fr\) auto/s);
  assert.match(styles, /\.settings-configuration\s*\{[^}]*grid-template-rows:\s*minmax\(0, 1fr\) var\(--settings-footer-height\)/s);
  assert.match(styles, /\.settings-inspector\s*\{[^}]*overflow-y:\s*auto[^}]*border-left:\s*1px solid var\(--settings-border\)/s);
  assert.match(app, /const \[selectedFeatureId, setSelectedFeatureId\] = useState\(null\)/);
  assert.match(app, /const applicationSelected = selectedFeatureId === null/);
  assert.match(app, /className="feature-navigation-footer"/);
  assert.match(app, /\{t\("settings\.application"\)\}/);
  assert.match(app, /const selectedFeatureFilteredOut = Boolean\(/);
  assert.match(app, /\[\[t\("settings\.current"\), \[selectedFeature\]\], \.\.\.groupedFeatures\]/);
  assert.match(app, /className=\{selectedFeatureFilteredOut && categoryIndex === 0 \? "feature-category feature-current-category" : "feature-category"\}/);
  assert.doesNotMatch(app, /selectedId|"general"/);
  assert.doesNotMatch(app, /settings\.installed|settings\.enabledLabel|settings\.readiness/);
});

test("Settings uses localized renderer-local Feature search and inspector-only effective context", () => {
  const app = read("SettingsApp.jsx");
  const model = read("model.mjs");

  assert.match(model, /export function filterFeaturesByQuery\(features, query\)/);
  assert.match(model, /\[feature\.name, feature\.category, feature\.description\]/);
  assert.match(model, /String\(query \|\| ""\)\.trim\(\)\.toLowerCase\(\)/);
  assert.doesNotMatch(model, /toLocaleLowerCase/);
  assert.match(app, /const \[featureQuery, setFeatureQuery\] = useState\(""\)/);
  assert.match(app, /filterFeaturesByQuery\(visibleFeatures, featureQuery\)/);
  assert.match(app, /type="search"/);
  assert.match(app, /aria-label=\{t\("settings\.searchFeatures"\)\}/);
  assert.match(app, /className="feature-search-empty" role="status"/);
  assert.match(app, /getEffectiveFeatureStatus\(selectedFeatureStatus, t\)/);
  assert.match(app, /className="settings-inspector"/);
  assert.match(app, /aria-label=\{t\("settings\.contextInspector"\)\}/);
  assert.match(app, /className="feature-ready-dot"/);
  assert.match(app, /getInteractionHelpCommands\(localizedCommands, selectedFeature\.id, bindings, t\)/);
  assert.match(app, /<InteractionInput label=\{entry\.label\}/);
  assert.match(app, /className="inspector-interaction-action-name">\{entry\.actionName\}/);
  assert.doesNotMatch(app, /\{entry\.description\}/);
  assert.doesNotMatch(app, /Check for Updates|shortcut/);
});

test("Settings keeps its titlebar wordmark-free and makes Inspector context and recovery controls explicit", () => {
  const app = read("SettingsApp.jsx");
  const styles = read("styles.css");

  assert.match(app, /<span className="settings-titlebar-label">\{t\("settings\.label"\)\}<\/span>/);
  assert.doesNotMatch(app, /logoUrl|clackly-logo|settings-titlebar-brand/);
  assert.doesNotMatch(styles, /settings-titlebar-brand/);
  assert.match(app, /function formatProviderName\(provider\)/);
  assert.match(app, /selectedFeature\.providers\.map\(formatProviderName\)/);
  assert.match(app, /function presentSettingsOperationError\(error, t, operation\)/);
  assert.match(app, /presentSettingsOperationError\(error, t, "configLoad"\)/);
  assert.match(app, /presentSettingsOperationError\(error, t, "save"\)/);
  assert.match(app, /presentSettingsOperationError\(error, t, "reset"\)/);
  assert.match(app, /presentSettingsOperationError\(error, t, "refresh"\)/);
  assert.match(app, /presentSettingsOperationError\(error, t, enabled \? "enable" : "disable"\)/);
  assert.match(app, /presentSettingsOperationError\(error, t, "locale"\)/);
  assert.match(app, /<Icon name="refresh" size=\{14\} \/>/);
  assert.match(app, /<Icon name="power" size=\{14\} \/>/);
  assert.match(styles, /\.inspector-actions \.secondary-button\s*\{[^}]*min-height:\s*var\(--settings-control-height\)[^}]*border-color:\s*var\(--settings-border\)[^}]*border-radius:\s*var\(--radius-toolbar\)/s);
  assert.doesNotMatch(styles, /\.inspector-actions \.secondary-button\s*\{[^}]*border-color:\s*transparent/s);
});

test("Settings cancels stale Feature config loads without clearing newer busy operations", () => {
  const app = read("SettingsApp.jsx");

  assert.match(app, /import React, \{ useEffect, useMemo, useRef, useState \} from "react"/);
  assert.match(app, /const busyOperation = useRef\(0\)/);
  assert.match(app, /function beginBusyOperation\(\) \{[\s\S]*?setBusy\(true\);[\s\S]*?return operation;/);
  assert.match(app, /function isCurrentBusyOperation\(operation\) \{[\s\S]*?return busyOperation\.current === operation;/);
  assert.match(app, /function finishBusyOperation\(operation\) \{[\s\S]*?if \(!isCurrentBusyOperation\(operation\)\) return;[\s\S]*?setBusy\(false\);/);
  assert.match(app, /function cancelBusyOperation\(operation\) \{[\s\S]*?if \(!isCurrentBusyOperation\(operation\)\) return;[\s\S]*?busyOperation\.current \+= 1;[\s\S]*?setBusy\(false\);/);
  assert.match(app, /const operation = beginBusyOperation\(\);[\s\S]*?api\.getConfig\(selectedFeature\.id\)[\s\S]*?if \(!active \|\| !isCurrentBusyOperation\(operation\)\) return;[\s\S]*?finally\(\(\) => \{[\s\S]*?finishBusyOperation\(operation\);[\s\S]*?return \(\) => \{[\s\S]*?active = false;[\s\S]*?cancelBusyOperation\(operation\);/);
  assert.doesNotMatch(app, /disabled=\{busy\}\s*\n\s*onClick=\{\(\) => setSelectedFeatureId/);
});

test("Settings preserves host Feature selection during initial loading and clears completed Feature feedback on application selection", () => {
  const app = read("SettingsApp.jsx");

  assert.match(app, /api\.onSettingsFeatureSelected\(\(featureId\) => \{\s*if \(typeof featureId === "string"\) setSelectedFeatureId\(featureId\);/);
  assert.match(app, /if \(!loading && selectedFeatureId !== null && !visibleFeatures\.some\(\(\{ id \}\) => id === selectedFeatureId\)\) \{\s*setSelectedFeatureId\(null\);\s*\}\s*\}, \[loading, selectedFeatureId, visibleFeatures\]\);/);
  const applicationSelection = app.match(/function selectApplicationContext\(\) \{[\s\S]*?\n  \}\n\n  const localizedFeatures/)?.[0] || "";
  assert.match(applicationSelection, /setStatus\(null\);\s*setSelectedFeatureId\(null\);/);
  assert.doesNotMatch(applicationSelection, /cancelBusyOperation|busyOperation/);
  assert.match(app, /onClick=\{selectApplicationContext\}/);
});

test("Settings and Palette share light-neutral primary emphasis while orange is warning-only", () => {
  const styles = read("styles.css");

  assert.match(styles, /--color-accent:\s*#e7e8ea;/);
  assert.match(styles, /--color-accent-foreground:\s*#17191d;/);
  assert.match(styles, /--color-warning:\s*#f36a2d;/);
  assert.match(styles, /button:focus-visible,[\s\S]*?outline:\s*1px solid var\(--color-accent\)/);
  assert.match(styles, /\.pin-indicator\s*\{[^}]*background:\s*var\(--color-accent\)/s);
  assert.match(styles, /\.checkbox-field input\s*\{[^}]*accent-color:\s*var\(--color-accent\)/s);
  assert.match(styles, /\.settings-actions \.primary-button\s*\{[^}]*color:\s*var\(--color-accent-foreground\)[^}]*background:\s*var\(--color-accent\)/s);
  assert.match(styles, /\.feature-ready-dot\s*\{[^}]*background:\s*var\(--color-status-ready\)/s);
  assert.match(styles, /--settings-status-warning:\s*var\(--color-warning\)/);
  assert.doesNotMatch(styles, /--color-accent:\s*#f36a2d/);
});

test("Settings retains compact Palette controls and bounded action feedback", () => {
  const styles = read("styles.css");
  const app = read("SettingsApp.jsx");

  assert.match(styles, /\.feature-search\s*\{[^}]*height:\s*var\(--settings-control-height\)[^}]*border-radius:\s*var\(--radius-toolbar\)/s);
  assert.match(styles, /\.feature-button\.selected\s*\{[^}]*color:\s*var\(--settings-selected-foreground\)[^}]*background:\s*var\(--settings-selected\)/s);
  assert.match(styles, /\.settings-field input:not\(\[type="checkbox"\]\),[\s\S]*?height:\s*var\(--settings-control-height\)[\s\S]*?background:\s*var\(--settings-control-surface\)/);
  assert.match(styles, /\.inspector-interaction-input kbd\s*\{[^}]*height:\s*20px[^}]*border-radius:\s*var\(--radius-keycap\)/s);
  assert.match(styles, /\.inspector-interaction-action-name\s*\{[^}]*font-weight:\s*500/s);
  assert.match(styles, /\.settings-actions\s*\{[^}]*padding:\s*4px 10px[^}]*border-top:\s*1px solid var\(--settings-hairline\)[^}]*background:\s*var\(--color-palette-surface\)/s);
  assert.match(app, /function Feedback\(\{ status \}\)/);
  assert.match(app, /className=\{applicationSelected \? "settings-actions application-settings-actions" : "settings-actions"\}/);
  assert.doesNotMatch(styles, /\.feature-lifecycle\s*\{/);
});
