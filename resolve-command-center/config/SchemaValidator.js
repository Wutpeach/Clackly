const FIELD_TYPES = new Set([
  "string",
  "number",
  "boolean",
  "color",
  "path",
  "folder",
  "select"
]);

const STRING_TYPES = new Set(["string", "color", "path", "folder"]);

function isPlainObject(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }

  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

class SchemaValidator {
  validateSchema(schema) {
    if (!isPlainObject(schema)) {
      throw new TypeError("Capability configSchema must be an object");
    }

    for (const [key, field] of Object.entries(schema)) {
      if (key.trim().length === 0) {
        throw new TypeError("Capability configSchema field names must be non-empty");
      }

      if (!isPlainObject(field)) {
        throw new TypeError(`Config schema field ${key} must be an object`);
      }

      if (!FIELD_TYPES.has(field.type)) {
        throw new TypeError(`Config schema field ${key} has unsupported type: ${field.type}`);
      }

      if (field.label !== undefined && (
        typeof field.label !== "string" || field.label.trim().length === 0
      )) {
        throw new TypeError(`Config schema field ${key} label must be a non-empty string`);
      }

      if (field.required !== undefined && typeof field.required !== "boolean") {
        throw new TypeError(`Config schema field ${key} required must be a boolean`);
      }

      if (field.type === "select" && (
        !Array.isArray(field.options)
        || field.options.length === 0
        || Array.from(field.options).some((option) => (
          typeof option !== "string" || option.trim().length === 0
        ))
      )) {
        throw new TypeError(
          `Config schema field ${key} select options must be a non-empty array of non-empty strings`
        );
      }
    }

    return schema;
  }

  validateValues(schema, values) {
    this.validateSchema(schema);

    if (!isPlainObject(values)) {
      throw new TypeError("Capability configuration values must be an object");
    }

    for (const [key, value] of Object.entries(values)) {
      if (!Object.hasOwn(schema, key)) {
        throw new TypeError(`Unknown configuration key: ${key}`);
      }
      const field = schema[key];

      const valid = STRING_TYPES.has(field.type)
        ? typeof value === "string"
        : field.type === "number"
          ? typeof value === "number" && Number.isFinite(value)
          : field.type === "boolean"
            ? typeof value === "boolean"
            : field.options.includes(value);

      if (!valid) {
        throw new TypeError(`Invalid value for configuration key ${key}`);
      }
    }

    return values;
  }

  getMissingRequired(schema, values) {
    this.validateSchema(schema);
    const configuredValues = isPlainObject(values) ? values : {};

    return Object.entries(schema)
      .filter(([key, field]) => field.required && (
        !Object.hasOwn(configuredValues, key)
        || configuredValues[key] === null
        || configuredValues[key] === undefined
        || (STRING_TYPES.has(field.type)
          && typeof configuredValues[key] === "string"
          && configuredValues[key].trim().length === 0)
      ))
      .map(([key]) => key);
  }
}

module.exports = { SchemaValidator };
