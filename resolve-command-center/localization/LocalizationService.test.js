const assert = require("node:assert/strict");
const test = require("node:test");

const { LocalizationService, resolveEffectiveLocale, resolveSystemLocale } = require("./LocalizationService");

function createPreferences(initial = "system") {
  let locale = initial;
  const listeners = new Set();
  return {
    getLocale: () => locale,
    setLocale: (next) => { locale = next; listeners.forEach((listener) => listener(next)); },
    subscribe: (listener) => { listeners.add(listener); return () => listeners.delete(listener); }
  };
}

test("system locale resolution prefers supported English and Simplified Chinese tags and rejects Traditional Chinese", () => {
  assert.equal(resolveSystemLocale(["zh-CN", "en-US"]), "zh-CN");
  assert.equal(resolveSystemLocale(["zh-SG"]), "zh-CN");
  assert.equal(resolveSystemLocale(["zh-Hans-HK"]), "zh-CN");
  assert.equal(resolveSystemLocale(["zh-TW", "zh-HK"]), "en");
  assert.equal(resolveSystemLocale(["fr-FR"]), "en");
  assert.equal(resolveEffectiveLocale("en", ["zh-CN"]), "en");
  assert.equal(resolveEffectiveLocale("zh-CN", ["en-US"]), "zh-CN");
});

test("LocalizationService derives snapshots from Preferences and publishes only the saved preference", () => {
  const preferences = createPreferences();
  const service = new LocalizationService({ preferences, systemLanguagesProvider: () => ["zh-CN"] });
  const received = [];
  service.subscribe((snapshot) => received.push(snapshot));
  assert.deepEqual(service.getSnapshot(), { preference: "system", effectiveLocale: "zh-CN" });
  assert.deepEqual(service.setLocalePreference("en"), { preference: "en", effectiveLocale: "en" });
  assert.deepEqual(received, [{ preference: "en", effectiveLocale: "en" }]);
});
