const CAPABILITY_ID = "ae.export";
const LEGACY_PREFIX_KEY = "prefix";

function isPlainObject(value) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

/**
 * Removes the retired ae.export Prefix setting before ConfigManager validates
 * the current capability schema. This intentionally leaves every other value
 * (including unknown keys) untouched so normal schema validation still owns
 * all non-legacy compatibility failures.
 */
function migrateLegacyAfterEffectsExportPrefix(storage) {
  if (!storage || typeof storage.load !== "function" || typeof storage.save !== "function") {
    throw new TypeError("After Effects configuration migration requires configuration storage");
  }

  const config = storage.load();
  const values = config[CAPABILITY_ID];
  if (!isPlainObject(values) || !Object.hasOwn(values, LEGACY_PREFIX_KEY)) {
    return false;
  }

  delete values[LEGACY_PREFIX_KEY];
  storage.save(config);
  return true;
}

module.exports = { migrateLegacyAfterEffectsExportPrefix };
