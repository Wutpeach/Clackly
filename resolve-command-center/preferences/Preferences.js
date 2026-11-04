const path = require("node:path");

const { ConfigStorage } = require("../config/ConfigStorage");

const LOCALE_PREFERENCES = Object.freeze(["system", "en", "zh-CN"]);
const LOCALE_PREFERENCE_SET = new Set(LOCALE_PREFERENCES);

function isLocalePreference(value) {
  return typeof value === "string" && LOCALE_PREFERENCE_SET.has(value);
}

class Preferences {
  constructor({ appDataPath, storage } = {}) {
    if (!storage && (typeof appDataPath !== "string" || appDataPath.trim().length === 0)) {
      throw new TypeError("Preferences requires an app data path");
    }
    if (storage && (typeof storage.load !== "function" || typeof storage.save !== "function")) {
      throw new TypeError("Preferences requires preference storage");
    }

    this.storage = storage || new ConfigStorage(path.join(appDataPath, "Clackly", "preferences.json"));
    this.listeners = new Set();
  }

  getLocale() {
    const stored = this.storage.load();
    return isLocalePreference(stored.locale) ? stored.locale : "system";
  }

  setLocale(locale) {
    if (!isLocalePreference(locale)) {
      throw new TypeError("Locale preference must be system, en, or zh-CN");
    }
    this.storage.save({ ...this.storage.load(), locale });
    this.listeners.forEach((listener) => listener(locale));
    return locale;
  }

  subscribe(listener) {
    if (typeof listener !== "function") {
      throw new TypeError("Preferences subscriber must be a function");
    }
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  getPinnedIds() {
    const ids = this.storage.load().pinnedCommandIds;
    return Array.isArray(ids) ? [...new Set(ids.filter((id) => typeof id === "string" && id.trim()))] : [];
  }

  setCommandPinned(commandId, pinned) {
    if (typeof commandId !== "string" || !commandId.trim() || typeof pinned !== "boolean") {
      throw new TypeError("Command Pin requires a non-empty id and boolean");
    }
    const ids = new Set(this.getPinnedIds());
    if (pinned) ids.add(commandId);
    else ids.delete(commandId);
    this.storage.save({ ...this.storage.load(), pinnedCommandIds: [...ids] });
    return [...ids];
  }
}

module.exports = { Preferences, LOCALE_PREFERENCES, isLocalePreference };
