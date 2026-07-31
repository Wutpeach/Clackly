const { withResolvedSchemaLabels } = require("../config/SchemaLabels");

class FeatureCatalog {
  constructor({ capabilityRegistry } = {}) {
    if (!capabilityRegistry
      || typeof capabilityRegistry.getAllCapabilities !== "function"
      || typeof capabilityRegistry.getMetadata !== "function") {
      throw new TypeError("FeatureCatalog requires a capability registry");
    }

    this.capabilityRegistry = capabilityRegistry;
  }

  getAllFeatures() {
    return this.capabilityRegistry.getAllCapabilities().map(({ id }) => {
      const feature = structuredClone(this.capabilityRegistry.getMetadata(id));
      feature.configSchema = withResolvedSchemaLabels(feature.configSchema);
      return feature;
    });
  }

  getByCategory(category) {
    if (typeof category !== "string" || category.trim().length === 0) {
      throw new TypeError("Feature category must be a non-empty string");
    }

    const features = this.getAllFeatures().filter((feature) => feature.category === category);
    if (features.length === 0) {
      throw new Error(`Unknown feature category: ${category}`);
    }
    return features;
  }
}

module.exports = { FeatureCatalog };
