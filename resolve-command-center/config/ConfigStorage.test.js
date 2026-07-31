const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const { ConfigStorage } = require("./ConfigStorage");

function createTempDirectory(t) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "clackly-config-"));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  return directory;
}

test("config storage builds the shared appData path and handles a missing file", (t) => {
  const appDataPath = createTempDirectory(t);
  const storage = ConfigStorage.fromAppData(appDataPath);

  assert.equal(storage.filePath, path.join(appDataPath, "Clackly", "config.json"));
  assert.deepEqual(storage.load(), {});
});

test("config storage round-trips JSON atomically and cleans its temporary file", (t) => {
  const directory = createTempDirectory(t);
  const filePath = path.join(directory, "nested", "config.json");
  const storage = new ConfigStorage(filePath);
  const config = { "ae.export": { mode: "composition" } };

  storage.save(config);

  assert.deepEqual(storage.load(), config);
  storage.save({ "marker.add": {} });
  assert.deepEqual(storage.load(), { "marker.add": {} });
  assert.equal(fs.existsSync(`${filePath}.${process.pid}.tmp`), false);
});

test("config storage rejects invalid JSON and non-object roots", (t) => {
  const directory = createTempDirectory(t);
  const filePath = path.join(directory, "config.json");
  const storage = new ConfigStorage(filePath);

  fs.writeFileSync(filePath, "{broken", "utf8");
  assert.throws(() => storage.load(), /Invalid configuration JSON/);

  for (const root of [null, [], "value", 1]) {
    fs.writeFileSync(filePath, JSON.stringify(root), "utf8");
    assert.throws(() => storage.load(), /must be an object/);
  }
  assert.throws(() => storage.save(new Date()), /root must be an object/);
});

test("a failed atomic replacement preserves the previous config and removes the temp file", (t) => {
  const directory = createTempDirectory(t);
  const filePath = path.join(directory, "config.json");
  const storage = new ConfigStorage(filePath);
  const previous = { "marker.add": { color: "Red" } };
  storage.save(previous);

  const renameSync = fs.renameSync;
  fs.renameSync = () => { throw new Error("replacement failed"); };
  try {
    assert.throws(() => storage.save({ "marker.add": { color: "Blue" } }), /replacement failed/);
  } finally {
    fs.renameSync = renameSync;
  }

  assert.deepEqual(storage.load(), previous);
  assert.equal(fs.existsSync(`${filePath}.${process.pid}.tmp`), false);
});

test("a failed temporary write preserves the previous config and removes partial output", (t) => {
  const directory = createTempDirectory(t);
  const filePath = path.join(directory, "config.json");
  const temporaryPath = `${filePath}.${process.pid}.tmp`;
  const storage = new ConfigStorage(filePath);
  const previous = { "marker.add": { color: "Red" } };
  storage.save(previous);

  const writeFileSync = fs.writeFileSync;
  fs.writeFileSync = (target, source, encoding) => {
    if (target === temporaryPath) {
      writeFileSync(target, source.slice(0, 5), encoding);
      throw new Error("write failed");
    }
    return writeFileSync(target, source, encoding);
  };
  try {
    assert.throws(() => storage.save({ "marker.add": { color: "Blue" } }), /write failed/);
  } finally {
    fs.writeFileSync = writeFileSync;
  }

  assert.deepEqual(storage.load(), previous);
  assert.equal(fs.existsSync(temporaryPath), false);
});
