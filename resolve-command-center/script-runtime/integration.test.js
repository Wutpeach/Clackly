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
    "    return {'greeting': context.config['greeting']}"
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

    assert.deepEqual(await execute("feature.command"), { greeting: "hello" });
    assert.deepEqual(logs, ["feature log", "stdout log"]);
  } finally {
    fs.rmSync(appRoot, { recursive: true, force: true });
  }
});
