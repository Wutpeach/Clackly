const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const appRoot = path.resolve(__dirname, "../..");
const standalone = fs.readFileSync(path.join(appRoot, "electron", "main", "main.js"), "utf8");
const workflow = fs.readFileSync(path.join(appRoot, "workflow-plugin", "main.js"), "utf8");

// Characterization of the current two-Host composition: both hosts duplicate the
// application-level wiring below; only the Resolve access path and Host lifecycle differ.
// Phase 1 moves the shared inventory into a Composition Root and updates this canary.
test("both hosts duplicate the same application-level composition", () => {
  const shared = [
    /composeStartup/,
    /new ShortcutManager\(\)/,
    /createCapabilityRegistry\(\)/,
    /createMarkerCapability/,
    /registerScriptCapabilities/,
    /new AfterEffectsLauncher/,
    /new RuntimeManager/,
    /resolveRuntimeRoot/,
    /new ConfigManager/,
    /ConfigStorage\.fromAppData/,
    /new FeatureCatalog/,
    /new FeatureStatusManager/,
    /FeatureStateStorage\.fromAppData/,
    /createCommandExecutor/,
    /new InteractionManager/,
    /BindingStorage\.fromAppData/,
    /registerFeatureUiIpc/,
    /capabilityRegistry\.register\("marker\.add"/,
    /runtime-probe\.json/,
    /CLACKLY_PYTHON_EXECUTABLE/
  ];
  for (const source of [standalone, workflow]) {
    for (const pattern of shared) {
      assert.match(source, pattern);
    }
  }
});

test("workflow host injects the in-process Resolve adapter; standalone injects the bridge", () => {
  assert.match(workflow, /createResolveAdapter\(\{ getResolve \}\)/);
  assert.match(workflow, /require\("\.\.\/resolve\/adapter"\)/);
  assert.match(workflow, /workflowPluginApi/);
  assert.match(workflow, /GetVersionString/);
  assert.match(workflow, /WorkflowIntegration/);

  assert.match(standalone, /createBridgeExecutionAdapter\(\)/);
  assert.match(standalone, /require\("\.\.\/\.\.\/execution-adapter\/bridge"\)/);
  assert.match(standalone, /resolveScriptApi/);
  assert.match(standalone, /getResolveVersion/);
  assert.doesNotMatch(standalone, /WorkflowIntegration/);
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

test("both hosts register the same IPC surface through shared handlers", () => {
  for (const source of [standalone, workflow]) {
    for (const channel of [
      "commands:list", "commands:search", "commands:execute",
      "interactions:execute", "palette:hide"
    ]) {
      assert.match(source, new RegExp(channel));
    }
  }
});
