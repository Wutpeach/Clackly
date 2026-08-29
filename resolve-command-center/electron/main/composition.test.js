const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const appRoot = path.resolve(__dirname, "../..");
const standalone = fs.readFileSync(path.join(appRoot, "electron", "main", "main.js"), "utf8");
const workflow = fs.readFileSync(path.join(appRoot, "workflow-plugin", "main.js"), "utf8");
const preload = fs.readFileSync(path.join(appRoot, "electron", "main", "preload.js"), "utf8");
const coreSource = fs.readFileSync(path.join(appRoot, "app", "createClacklyCore.js"), "utf8");

// Architecture canary: hosts delegate shared application wiring to the Composition
// Root; the Root owns the shared constructions and never imports Electron.
test("both hosts call the shared Composition Root and no longer construct shared wiring", () => {
  for (const source of [standalone, workflow]) {
    assert.match(source, /createClacklyCore\(/);
    assert.match(source, /app\/createClacklyCore/);
    for (const pattern of [
      /new ShortcutManager\(\)/,
      /createCapabilityRegistry\(\)/,
      /registerScriptCapabilities/,
      /new AfterEffectsLauncher/,
      /new RuntimeManager/,
      /new ConfigManager/,
      /new FeatureCatalog/,
      /new FeatureStatusManager/,
      /createCommandExecutor/
    ]) {
      assert.doesNotMatch(source, pattern);
    }
  }
});

test("Core owns the shared application wiring without Electron or Resolve globals", () => {
  for (const pattern of [
    /new ShortcutManager\(\)/,
    /createCapabilityRegistry\(\)/,
    /createMarkerCapability/,
    /createImageClipboardCapability/,
    /registerScriptCapabilities/,
    /new AfterEffectsLauncher/,
    /new RuntimeManager/,
    /resolveRuntimeRoot/,
    /new ConfigManager/,
    /ConfigStorage\.fromAppData/,
    /new FeatureCatalog/,
    /new FeatureStatusManager/,
    /FeatureStateStorage\.fromAppData/,
    /CommandUsageStorage/,
    /CommandUsageHistory/,
    /CommandSearchService/,
    /createCommandExecutor/,
    /runtime-probe\.json/,
    /CLACKLY_PYTHON_EXECUTABLE/
  ]) {
    assert.match(coreSource, pattern);
  }
  assert.doesNotMatch(coreSource, /require\(["']electron["']\)/);
  assert.doesNotMatch(coreSource, /ipcMain|dialog|BrowserWindow|globalShortcut/);
  assert.doesNotMatch(coreSource, /WorkflowIntegration/);
  assert.doesNotMatch(coreSource, /clipboard\.readImage|require\(["']electron["']\)/);
});

test("workflow host injects the in-process Resolve adapter; standalone injects the bridge", () => {
  assert.match(workflow, /createResolveAdapter\(\{ getResolve \}\)/);
  assert.match(workflow, /workflowPluginApi/);
  assert.match(workflow, /GetVersionString/);
  assert.match(workflow, /WorkflowIntegration/);

  assert.match(standalone, /createBridgeExecutionAdapter\(\)/);
  assert.match(standalone, /resolveScriptApi/);
  assert.match(standalone, /getResolveVersion/);
  assert.doesNotMatch(standalone, /WorkflowIntegration/);
  assert.match(workflow, /resolveMediaPool: resolveAdapter/);
  assert.match(standalone, /resolveMediaPool: bridgeExecutionAdapter/);
  for (const source of [workflow, standalone]) {
    assert.match(source, /createClipboardImageReader/);
    assert.match(source, /app\.getPath\("pictures"\)/);
  }
});

test("host-specific lifecycle differences remain in each Host", () => {
  assert.match(workflow, /app\.setPath\("userData"/);
  assert.match(workflow, /handleHotkeyRegistrationFailure/);
  assert.match(workflow, /cleanupWorkflowIntegration/);
  assert.match(workflow, /executeWorkflowCommand/);
  assert.doesNotMatch(workflow, /app\.on\("activate"/);

  assert.match(standalone, /executeStandaloneCommand/);
  assert.match(standalone, /app\.on\("activate"/);
  assert.doesNotMatch(standalone, /handleHotkeyRegistrationFailure/);
  assert.doesNotMatch(standalone, /app\.setPath\("userData"/);
});

test("both hosts prewarm and dispose the Core-owned process probe without delaying host startup", () => {
  for (const source of [standalone, workflow]) {
    assert.match(source, /queueMicrotask\(\(\) => core\.prewarmAfterEffectsProcessProbe\(\)\.catch\(\(\) => \{\}\)\)/);
    assert.match(source, /core\.disposeAfterEffectsProcessProbe\(\)/);
  }
  assert.match(workflow, /app\.whenReady\(\)\.then\(async \(\) => \{\s*queueMicrotask\(/s);
  assert.match(standalone, /app\.whenReady\(\)\.then\(\(\) => \{\s*queueMicrotask\(/s);
});

test("both hosts keep the IPC surface and host bootstrap", () => {
  for (const source of [standalone, workflow]) {
    assert.match(source, /registerFeatureUiIpc/);
    assert.match(source, /composeStartup/);
    assert.match(source, /new InteractionManager/);
    for (const channel of [
      "commands:list", "commands:search", "commands:execute",
      "interactions:execute", "palette:hide"
    ]) {
      assert.match(source, new RegExp(channel));
    }
  }
});

test("both hosts expose one Core-owned Search contract through preload", () => {
  for (const source of [standalone, workflow]) {
    assert.match(source, /ipcMain\.handle\("commands:search", \(_event, query, pinnedIds\) => core\.searchCommands\(query, pinnedIds\)\)/);
    assert.doesNotMatch(source, /commandMatches/);
  }
  assert.match(preload, /searchCommands: \(query, pinnedIds\) => ipcRenderer\.invoke\("commands:search", query, pinnedIds\)/);
});
