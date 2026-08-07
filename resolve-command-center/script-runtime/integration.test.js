const assert = require("node:assert/strict");
const { execFileSync } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const { registerScriptCapabilities } = require("../capability/registerScripts");
const { createCapabilityRegistry } = require("../capability/registry");
const { createCommandExecutor } = require("../command-engine/executor");
const { loadCommands } = require("../command-engine/registry");
const { FeatureCatalog } = require("../feature-ui/FeatureCatalog");
const { loadCapabilityDefinitions } = require("../capability/loader");
const { RuntimeLauncher } = require("./runtime/launcher");
const { RuntimeManager } = require("./runtime/manager");
const { PythonProvider } = require("./providers/PythonProvider");

function integrationRuntimeManager(scriptRoot, overrides = {}) {
  const executable = execFileSync("python", ["-c", "import os,sys;print(os.path.realpath(sys.executable))"], {
    encoding: "utf8"
  }).trim();
  const resolution = {
    source: "override",
    supportStatus: "overridden",
    executable,
    profile: null
  };
  return new RuntimeManager({
    resolver: { resolve: () => resolution },
    probe: { probe: async () => ({ ok: true, supportStatus: "overridden" }) },
    launcher: new RuntimeLauncher(),
    clacklyVersion: "0.1.0",
    hostContextProvider: async () => ({ application: "davinci-resolve", version: "20.3.2.9" }),
    scriptRoot,
    ...overrides
  });
}

test("a discovered manifest executes its Python feature through the command path", async () => {
  const appRoot = fs.mkdtempSync(path.join(os.tmpdir(), "clackly-script-integration-"));
  const capabilityDir = path.join(appRoot, "capabilities");
  const commandDir = path.join(appRoot, "commands");
  const scriptDir = path.join(appRoot, "scripts");
  fs.mkdirSync(capabilityDir);
  fs.mkdirSync(commandDir);
  fs.mkdirSync(scriptDir);
  fs.writeFileSync(path.join(capabilityDir, "feature.json"), JSON.stringify({
    id: "feature.run",
    name: "Run Feature",
    description: "Run fixture feature",
    category: "Test",
    icon: "play",
    version: "1.0.0",
    type: "command",
    providers: ["script"],
    executor: { type: "script", runtime: "python", entry: "scripts/feature.py" },
    configSchema: { greeting: { type: "string" } }
  }));
  fs.writeFileSync(path.join(commandDir, "feature.json"), JSON.stringify({
    id: "feature.command",
    name: "Run Feature",
    description: "Run fixture feature",
    category: "Test",
    icon: "play",
    keywords: ["fixture"],
    capability: "feature.run"
  }));
  fs.writeFileSync(path.join(scriptDir, "feature.py"), [
    "async def execute(context):",
    "    context.logger.info('feature log')",
    "    print('stdout log')",
    "    return {'commandId': context.command_id, 'greeting': context.config['greeting']}"
  ].join("\n"));

  try {
    const logs = [];
    const registry = createCapabilityRegistry();
    registerScriptCapabilities({
      capabilityRegistry: registry,
      capabilityDir,
      appRoot,
      runtimeManager: integrationRuntimeManager(appRoot),
      logger: { info: (message) => logs.push(message) }
    });
    const [command] = loadCommands(commandDir);
    assert.equal(new FeatureCatalog({ capabilityRegistry: registry }).getAllFeatures()[0].id,
      "feature.run");
    const execute = createCommandExecutor({
      capabilityRegistry: registry,
      configManager: {
        assertConfigured() {},
        forCapability: () => ({ get: () => ({ greeting: "hello" }) })
      },
      findCommand: (commandId) => command.id === commandId ? command : null
    });

    assert.deepEqual(await execute("feature.command"), {
      commandId: "feature.command",
      greeting: "hello"
    });
    assert.deepEqual(logs, ["feature log", "stdout log"]);
  } finally {
    fs.rmSync(appRoot, { recursive: true, force: true });
  }
});

test("bundled After Effects manifests expose one Feature, one visible Command, and five internal actions", () => {
  const definitions = loadCapabilityDefinitions();
  const aeDefinitions = definitions.filter(({ id }) => id === "ae.export");
  assert.equal(aeDefinitions.length, 1);
  assert.deepEqual(Object.keys(aeDefinitions[0].configSchema), ["aePath", "prefix"]);
  assert.equal(aeDefinitions[0].executor.entry, "scripts/resolve2ae_export.py");

  const commands = loadCommands().filter(({ capability }) => capability === "ae.export");
  assert.equal(commands.length, 6);
  assert.equal(commands.filter((command) => command.presentation === "internal").length, 5);
  assert.equal(commands.filter((command) => command.presentation !== "internal").length, 1);
  assert.equal(commands.every((command) => !("mode" in command) && !("runtime" in command)), true);

  const registry = createCapabilityRegistry();
  registerScriptCapabilities({
    capabilityRegistry: registry,
    appRoot: path.resolve(__dirname, ".."),
    runtimeManager: { execute() {} }
  });
  const features = new FeatureCatalog({ capabilityRegistry: registry })
    .getAllFeatures()
    .filter(({ id }) => id === "ae.export");
  assert.equal(features.length, 1);
  assert.deepEqual(Object.keys(features[0].configSchema), ["aePath", "prefix"]);
});

test("the bundled After Effects entry runs through the real Python command path", async () => {
  const registry = createCapabilityRegistry();
  const appRoot = path.resolve(__dirname, "..");
  registerScriptCapabilities({
    capabilityRegistry: registry,
    appRoot,
    runtimeManager: integrationRuntimeManager(appRoot)
  });
  const execute = createCommandExecutor({
    capabilityRegistry: registry,
    configManager: {
      assertConfigured() {},
      forCapability: () => ({ get: () => ({ aePath: "Z:/missing/AfterFX.exe" }) })
    }
  });

  await assert.rejects(
    execute("timeline.exportToAfterEffects"),
    /After Effects path must point to an existing executable file/
  );
});

test("the real Python path hands desktop launch to the host and preserves public output", async () => {
  const appRoot = fs.mkdtempSync(path.join(os.tmpdir(), "clackly-desktop-plan-"));
  try {
    const scriptDir = path.join(appRoot, "scripts");
    const aePath = path.join(appRoot, "AfterFX.exe");
    fs.mkdirSync(scriptDir);
    fs.writeFileSync(aePath, "AfterFX");
    fs.writeFileSync(path.join(scriptDir, "feature.py"), [
      "def execute(context):",
      "    return {",
      "        'ok': True, 'code': 'exported', 'mode': 'single',",
      "        'clip_count': 1, 'message': 'Sent 1 Clips',",
      "        '__clacklyDesktopLaunch': {",
      "            'type': 'after-effects-jsx',",
      "            'executable': context.config['aePath'],",
      "            'args': ['-r', '$CLACKLY_JSX'],",
      "            'jsx': 'app.project.items.addComp(\"test\", 1, 1, 1, 1, 24);'",
      "        }",
      "    }"
    ].join("\n"));
    const desktopCalls = [];
    const provider = new PythonProvider({
      appRoot,
      runtimeManager: integrationRuntimeManager(appRoot, {
        desktopLauncher: {
          async execute(plan, context) {
            desktopCalls.push([plan, context]);
            return { mode: "cold" };
          }
        }
      })
    });
    const logs = [];

    const result = await provider.execute(
      { entry: "scripts/feature.py" },
      {
        capabilityId: "ae.export",
        commandId: "timeline.exportCurrentToAfterEffects",
        config: { aePath },
        logger: { info: (message) => logs.push(message) }
      }
    );

    assert.deepEqual(result, {
      ok: true, code: "exported", mode: "single", clip_count: 1, message: "Sent 1 Clips"
    });
    assert.equal(desktopCalls.length, 1);
    assert.deepEqual(desktopCalls[0][1], { configuredExecutable: aePath });
    assert.deepEqual(logs, ["Starting AE...", "✅ Sent 1 Clips"]);
  } finally {
    fs.rmSync(appRoot, { recursive: true, force: true });
  }
});
