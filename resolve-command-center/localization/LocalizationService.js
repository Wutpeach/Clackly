const { isLocalePreference } = require("../preferences/Preferences");

const SUPPORTED_LOCALES = Object.freeze(["en", "zh-CN"]);
const FALLBACK_LOCALE = "en";

function resolveSystemLocale(systemLanguages) {
  const languages = Array.isArray(systemLanguages) ? systemLanguages : [systemLanguages];
  for (const language of languages) {
    if (typeof language !== "string") continue;
    const tag = language.trim();
    if (!tag) continue;
    const normalized = tag.toLowerCase();
    if (normalized === "zh-cn" || normalized === "zh-sg" || /(?:^|-)hans(?:-|$)/.test(normalized)) {
      return "zh-CN";
    }
    if (normalized === "en" || normalized.startsWith("en-")) {
      return "en";
    }
  }
  return FALLBACK_LOCALE;
}

function resolveEffectiveLocale(preference, systemLanguages) {
  if (preference === "en" || preference === "zh-CN") return preference;
  return resolveSystemLocale(systemLanguages);
}

function getElectronSystemLanguages(electronApp) {
  try {
    const preferred = electronApp?.getPreferredSystemLanguages?.();
    if (Array.isArray(preferred) && preferred.length > 0) return preferred;
  } catch (_error) {}
  try {
    const locale = electronApp?.getLocale?.();
    return locale ? [locale] : [];
  } catch (_error) {
    return [];
  }
}

class LocalizationService {
  constructor({ preferences, systemLanguagesProvider = () => [] } = {}) {
    if (!preferences || typeof preferences.getLocale !== "function" || typeof preferences.setLocale !== "function"
      || typeof preferences.subscribe !== "function") {
      throw new TypeError("LocalizationService requires Preferences");
    }
    if (typeof systemLanguagesProvider !== "function") {
      throw new TypeError("LocalizationService requires a system languages provider");
    }
    this.preferences = preferences;
    this.systemLanguagesProvider = systemLanguagesProvider;
    this.listeners = new Set();
    this.unsubscribePreferences = preferences.subscribe(() => this.publish());
  }

  getSnapshot() {
    const preference = this.preferences.getLocale();
    const systemLanguages = this.systemLanguagesProvider();
    return {
      preference: isLocalePreference(preference) ? preference : "system",
      effectiveLocale: resolveEffectiveLocale(preference, systemLanguages)
    };
  }

  setLocalePreference(locale) {
    this.preferences.setLocale(locale);
    return this.getSnapshot();
  }

  subscribe(listener) {
    if (typeof listener !== "function") {
      throw new TypeError("Localization subscriber must be a function");
    }
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  publish() {
    const snapshot = this.getSnapshot();
    this.listeners.forEach((listener) => listener(snapshot));
    return snapshot;
  }
}

module.exports = {
  SUPPORTED_LOCALES,
  FALLBACK_LOCALE,
  resolveSystemLocale,
  resolveEffectiveLocale,
  getElectronSystemLanguages,
  LocalizationService
};
