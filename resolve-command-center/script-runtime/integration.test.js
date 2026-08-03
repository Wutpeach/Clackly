const assert = require("node:assert/strict");
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

test("bundled After Effects manifests expose one Feature and four Commands", () => {
  const definitions = loadCapabilityDefinitions();
  const aeDefinitions = definitions.filter(({ id }) => id === "ae.export");
  assert.equal(aeDefinitions.length, 1);
  assert.deepEqual(Object.keys(aeDefinitions[0].configSchema), ["aePath", "prefix"]);
  assert.equal(aeDefinitions[0].executor.entry, "scripts/resolve2ae_export.py");

  const commands = loadCommands().filter(({ capability }) => capability === "ae.export");
  assert.equal(commands.length, 4);
  assert.equal(commands.every((command) => !("mode" in command) && !("runtime" in command)), true);

  const registry = createCapabilityRegistry();
  registerScriptCapabilities({
    capabilityRegistry: registry,
    appRoot: path.resolve(__dirname, "..")
  });
  const features = new FeatureCatalog({ capabilityRegistry: registry })
    .getAllFeatures()
    .filter(({ id }) => id === "ae.export");
  assert.equal(features.length, 1);
  assert.deepEqual(Object.keys(features[0].configSchema), ["aePath", "prefix"]);
});

test("the bundled After Effects entry runs through the real Python command path", async () => {
  const registry = createCapabilityRegistry();
  registerScriptCapabilities({ capabilityRegistry: registry });
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
