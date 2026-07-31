const assert = require("node:assert/strict");
const test = require("node:test");

const { SchemaValidator } = require("./SchemaValidator");

const validator = new SchemaValidator();
const schema = {
  title: { type: "string", label: "Title", required: true },
  count: { type: "number" },
  enabled: { type: "boolean" },
  color: { type: "color" },
  file: { type: "path" },
  folder: { type: "folder" },
  mode: { type: "select", options: ["composition", "selected"] }
};

test("schema validator accepts every supported field and value type", () => {
  assert.equal(validator.validateSchema(schema), schema);
  assert.equal(validator.validateValues(schema, {
    title: "Export",
    count: 3,
    enabled: false,
    color: "not parsed here",
    file: "C:/AfterFX.exe",
    folder: "C:/Exports",
    mode: "selected"
  }).mode, "selected");
});

test("schema validator rejects malformed schema fields", () => {
  const invalidSchemas = [
    null,
    [],
    { value: null },
    { value: {} },
    { value: { type: "date" } },
    { value: { type: "string", label: "" } },
    { value: { type: "string", required: "yes" } },
    { value: { type: "select" } },
    { value: { type: "select", options: [] } },
    { value: { type: "select", options: ["valid", 2] } },
    { value: { type: "select", options: new Array(1) } }
  ];

  for (const invalidSchema of invalidSchemas) {
    assert.throws(() => validator.validateSchema(invalidSchema), TypeError);
  }
});

test("schema validator rejects unknown keys, type mismatches, and invalid selects", () => {
  assert.throws(() => validator.validateValues(schema, []), /values must be an object/);
  assert.throws(() => validator.validateValues(schema, { unknown: true }), /Unknown configuration key/);
  assert.throws(() => validator.validateValues(schema, { toString: true }), /Unknown configuration key/);
  assert.throws(() => validator.validateValues(schema, { count: Infinity }), /Invalid value.*count/);
  assert.throws(() => validator.validateValues(schema, { enabled: 1 }), /Invalid value.*enabled/);
  assert.throws(() => validator.validateValues(schema, { mode: "timeline" }), /Invalid value.*mode/);
});

test("schema validator reports all missing required fields", () => {
  const requiredSchema = {
    path: { type: "path", required: true },
    mode: { type: "select", required: true, options: ["one"] },
    enabled: { type: "boolean", required: true }
  };

  assert.deepEqual(
    validator.getMissingRequired(requiredSchema, { path: null, enabled: false }),
    ["path", "mode"]
  );
  assert.deepEqual(
    validator.getMissingRequired(requiredSchema, { path: "  ", mode: "one", enabled: false }),
    ["path"]
  );
});
