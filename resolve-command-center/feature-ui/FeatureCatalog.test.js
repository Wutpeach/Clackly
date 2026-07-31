const assert = require("node:assert/strict");
const test = require("node:test");

const { createCapabilityRegistry } = require("../capability/registry");
const { FeatureCatalog } = require("./FeatureCatalog");

function capability(id, category, configSchema = {}) {
  return {
    metadata: {
      id,
      name: id,
      description: `${id} description`,
      category,
      icon: "command",
      version: "1.0.0",
      type: "command",
      providers: [],
      configSchema
    },
    execute() {}
  };
}

test("feature catalog returns ordered defensive copies of full capability metadata", () => {
  const registry = createCapabilityRegistry();
  registry.register("first", capability("first", "Timeline", {
    color: { type: "color", label: "Color" }
  }));
  registry.register("second", capability("second", "Edit"));
  registry.register("third", capability("third", "Timeline"));
  const catalog = new FeatureCatalog({ capabilityRegistry: registry });

  const features = catalog.getAllFeatures();
  assert.deepEqual(features.map(({ id }) => id), ["first", "second", "third"]);
  assert.equal(features[0].description, "first description");
  assert.deepEqual(features[0].configSchema, { color: { type: "color", label: "Color" } });

  features[0].name = "Changed";
  features[0].configSchema.color.label = "Changed";
  assert.equal(catalog.getAllFeatures()[0].name, "first");
  assert.equal(catalog.getAllFeatures()[0].configSchema.color.label, "Color");
});

test("feature catalog filters exact categories and discovers later registrations", () => {
  const registry = createCapabilityRegistry();
  registry.register("first", capability("first", "Timeline"));
  const catalog = new FeatureCatalog({ capabilityRegistry: registry });

  registry.register("second", capability("second", "Timeline"));
  registry.register("third", capability("third", "timeline"));

  assert.deepEqual(catalog.getByCategory("Timeline").map(({ id }) => id), ["first", "second"]);
  assert.throws(() => catalog.getByCategory("timeline "), /Unknown feature category/);
  assert.throws(() => catalog.getByCategory(""), /non-empty string/);
  assert.throws(() => catalog.getByCategory(null), /non-empty string/);
});
