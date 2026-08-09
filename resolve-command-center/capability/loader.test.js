const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const { loadCapabilityDefinitions } = require("./loader");
const { registerScriptCapabilities } = require("./registerScripts");
const { createCapabilityRegistry } = require("./registry");

function metadata(id, entry = `scripts/${id}.py`) {
  return {
    id,
    name: id,
    description: `Run ${id}`,
    category: "Test",
    icon: "play",
    version: "1.0.0",
    type: "command",
    providers: ["script"],
    executor: { type: "script", runtime: "python", entry },
    configSchema: {}
  };
}

function withTempDir(callback) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "clackly-capability-"));
  try {
    return callback(directory);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
}

test("capability loader reads sorted object and array manifests", () => withTempDir((directory) => {
  fs.writeFileSync(path.join(directory, "b.json"), JSON.stringify({ capabilities: [metadata("b")] }));
  fs.writeFileSync(path.join(directory, "a.json"), JSON.stringify(metadata("a")));

  assert.deepEqual(loadCapabilityDefinitions(directory).map(({ id }) => id), ["a", "b"]);
}));

test("capability loader rejects malformed payloads and duplicate ids", () => withTempDir((directory) => {
  fs.writeFileSync(path.join(directory, "a.json"), "null");
  assert.throws(() => loadCapabilityDefinitions(directory), /Invalid capability manifest format/);

  fs.writeFileSync(path.join(directory, "a.json"), JSON.stringify(metadata("duplicate")));
  fs.writeFileSync(path.join(directory, "b.json"), JSON.stringify(metadata("duplicate")));
  assert.throws(() => loadCapabilityDefinitions(directory), /Duplicate capability id duplicate/);
}));

test("script registration validates every manifest before changing the host registry", () => (
  withTempDir((directory) => {
    fs.writeFileSync(path.join(directory, "a.json"), JSON.stringify(metadata("valid")));
    fs.writeFileSync(path.join(directory, "b.json"), JSON.stringify({
      ...metadata("invalid"),
      executor: { type: "script", runtime: "python", entry: "" }
    }));
    const registry = createCapabilityRegistry();

    assert.throws(() => registerScriptCapabilities({
      capabilityRegistry: registry,
      capabilityDir: directory,
      scriptCapabilityProvider: { execute() {}, checkAvailability() {} }
    }), /non-empty entry/);
    assert.equal(registry.get("valid"), null);
  })
));

test("script registration discovers a new capability without host-specific edits", () => (
  withTempDir((directory) => {
    fs.writeFileSync(path.join(directory, "feature.json"), JSON.stringify(metadata("feature.run")));
    const registry = createCapabilityRegistry();
    const calls = [];

    registerScriptCapabilities({
      capabilityRegistry: registry,
      capabilityDir: directory,
      scriptCapabilityProvider: {
        execute(definition, context) {
          calls.push({ definition, context });
          return { ok: true };
        },
        checkAvailability() {}
      }
    });

    const config = { get: () => ({}) };
    assert.deepEqual(registry.getAllCapabilities(), [{
      id: "feature.run",
      name: "feature.run",
      category: "Test",
      icon: "play"
    }]);
    assert.deepEqual(registry.get("feature.run").execute({ id: "command" }, { config }), { ok: true });
    assert.equal(calls[0].definition.entry, "scripts/feature.run.py");
    assert.equal(calls[0].context.config, config);
  })
));
