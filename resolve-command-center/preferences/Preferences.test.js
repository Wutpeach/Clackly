const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const { ConfigManager } = require("../config/ConfigManager");
const { ConfigStorage } = require("../config/ConfigStorage");
const { Preferences } = require("./Preferences");

function createConfigManager(appDataPath) {
  return new ConfigManager({
    capabilityRegistry: {
      getMetadata: (id) => id === "test.capability" ? {
        configSchema: { enabled: { type: "boolean" } }
      } : null
    },
    storage: ConfigStorage.fromAppData(appDataPath)
  });
}

test("Preferences persists only accepted locale values and invalid persisted data degrades to system", (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "clackly-preferences-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const preferences = new Preferences({ appDataPath: root });
  assert.equal(preferences.getLocale(), "system");
  assert.equal(preferences.setLocale("zh-CN"), "zh-CN");
  assert.equal(new Preferences({ appDataPath: root }).getLocale(), "zh-CN");
  assert.throws(() => preferences.setLocale("fr"), /system, en, or zh-CN/);

  new ConfigStorage(path.join(root, "Clackly", "preferences.json")).save({ locale: "fr" });
  assert.equal(new Preferences({ appDataPath: root }).getLocale(), "system");
});

test("Preferences and ConfigManager retain independent documents in both write orders and overlapping lifetimes", (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "clackly-preference-isolation-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const preferencesA = new Preferences({ appDataPath: root });
  const preferencesB = new Preferences({ appDataPath: root });
  const configA = createConfigManager(root);
  const configB = createConfigManager(root);

  preferencesA.setLocale("zh-CN");
  configA.save("test.capability", { enabled: true });
  assert.deepEqual(ConfigStorage.fromAppData(root).load(), { "test.capability": { enabled: true } });
  assert.deepEqual(new ConfigStorage(path.join(root, "Clackly", "preferences.json")).load(), { locale: "zh-CN" });

  configB.update("test.capability", { enabled: false });
  preferencesB.setLocale("en");
  assert.deepEqual(ConfigStorage.fromAppData(root).load(), { "test.capability": { enabled: false } });
  assert.deepEqual(new ConfigStorage(path.join(root, "Clackly", "preferences.json")).load(), { locale: "en" });
  assert.equal(new Preferences({ appDataPath: root }).getLocale(), "en");
  assert.deepEqual(createConfigManager(root).get("test.capability"), { enabled: false });
});
