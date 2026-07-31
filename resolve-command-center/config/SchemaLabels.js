function resolveSchemaFieldLabel(key, field = {}) {
  if (typeof field.label === "string" && field.label.trim()) {
    return field.label;
  }

  const words = key
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[._-]+/g, " ")
    .trim();
  return words ? words.charAt(0).toUpperCase() + words.slice(1) : key;
}

function withResolvedSchemaLabels(schema) {
  return Object.fromEntries(Object.entries(schema).map(([key, field]) => [
    key,
    { ...structuredClone(field), label: resolveSchemaFieldLabel(key, field) }
  ]));
}

module.exports = { resolveSchemaFieldLabel, withResolvedSchemaLabels };
