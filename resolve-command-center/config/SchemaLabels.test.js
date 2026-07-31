const assert = require("node:assert/strict");
const test = require("node:test");

const { resolveSchemaFieldLabel, withResolvedSchemaLabels } = require("./SchemaLabels");

test("schema labels prefer explicit labels and clone readable fallbacks", () => {
  const schema = {
    aePath: { type: "path", label: "After Effects Path" },
    output_folder: { type: "folder" },
    "render.mode-name": { type: "select", options: ["draft", "final"] }
  };

  assert.equal(resolveSchemaFieldLabel("aePath", schema.aePath), "After Effects Path");
  assert.equal(resolveSchemaFieldLabel("output_folder", schema.output_folder), "Output folder");
  assert.equal(resolveSchemaFieldLabel("render.mode-name", schema["render.mode-name"]), "Render mode name");

  const resolved = withResolvedSchemaLabels(schema);
  assert.equal(resolved.output_folder.label, "Output folder");
  assert.equal(resolved["render.mode-name"].label, "Render mode name");
  resolved.aePath.label = "Changed";
  resolved["render.mode-name"].options.push("changed");
  assert.equal(schema.aePath.label, "After Effects Path");
  assert.deepEqual(schema["render.mode-name"].options, ["draft", "final"]);
});
