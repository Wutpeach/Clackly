const assert = require("node:assert/strict");
const test = require("node:test");

const { migrateLegacyAfterEffectsExportPrefix } = require("./afterEffectsConfigMigration");

function createStorage(initial) {
  let persisted = structuredClone(initial);
  const saves = [];
  return {
    storage: {
      load: () => structuredClone(persisted),
      save: (config) => {
        persisted = structuredClone(config);
        saves.push(structuredClone(config));
      }
    },
    getPersisted: () => structuredClone(persisted),
    getSaves: () => structuredClone(saves)
  };
}

test("AE Prefix migration does not write configuration when Prefix is absent", () => {
  const fixture = {
    "ae.export": {
      aePath: "C:\\Adobe\\AfterFX.exe",
      create1080pPreviewComp: true
    },
    "other.capability": { keep: true }
  };
  const storage = createStorage(fixture);

  assert.equal(migrateLegacyAfterEffectsExportPrefix(storage.storage), false);
  assert.deepEqual(storage.getPersisted(), fixture);
  assert.deepEqual(storage.getSaves(), []);
});

test("AE Prefix migration removes only the legacy key once", () => {
  const storage = createStorage({
    "ae.export": {
      aePath: "C:\\Adobe\\AfterFX.exe",
      create1080pPreviewComp: true,
      prefix: "Legacy Prefix"
    },
    "other.capability": { keep: true }
  });
  const expected = {
    "ae.export": {
      aePath: "C:\\Adobe\\AfterFX.exe",
      create1080pPreviewComp: true
    },
    "other.capability": { keep: true }
  };

  assert.equal(migrateLegacyAfterEffectsExportPrefix(storage.storage), true);
  assert.deepEqual(storage.getPersisted(), expected);
  assert.deepEqual(storage.getSaves(), [expected]);

  assert.equal(migrateLegacyAfterEffectsExportPrefix(storage.storage), false);
  assert.deepEqual(storage.getSaves(), [expected]);
});
