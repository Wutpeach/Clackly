const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const { CommandUsageStorage, validateUsageDocument } = require("./CommandUsageStorage");
const { CommandUsageHistory } = require("./CommandUsageHistory");

function createHistory(t, now = 1_800_000_000_000) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "clackly-command-usage-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const storage = CommandUsageStorage.fromAppData(root);
  return { root, storage, history: new CommandUsageHistory({ storage, now: () => now }) };
}

test("usage history owns a dedicated stable-facts document and survives restart", (t) => {
  const { root, storage, history } = createHistory(t);
  assert.deepEqual(history.getSnapshot(), {});
  assert.deepEqual(history.record("timeline.addMarker"), { usageCount: 1, lastUsedAt: 1_800_000_000_000 });
  assert.deepEqual(history.record("timeline.addMarker", 1_800_000_000_100), { usageCount: 2, lastUsedAt: 1_800_000_000_100 });
  assert.equal(storage.filePath, path.join(root, "Clackly", "command-usage.json"));
  assert.deepEqual(JSON.parse(fs.readFileSync(storage.filePath, "utf8")), {
    "timeline.addMarker": { usageCount: 2, lastUsedAt: 1_800_000_000_100 }
  });
  assert.equal(fs.existsSync(path.join(root, "Clackly", "preferences.json")), false);
  assert.equal(fs.existsSync(path.join(root, "Clackly", "config.json")), false);

  const restarted = new CommandUsageHistory({ storage: new CommandUsageStorage(storage.filePath) });
  const snapshot = restarted.getSnapshot();
  snapshot["timeline.addMarker"].usageCount = 999;
  assert.deepEqual(restarted.getSnapshot(), {
    "timeline.addMarker": { usageCount: 2, lastUsedAt: 1_800_000_000_100 }
  });
});

test("usage storage rejects malformed roots and records while permitting harmless unknown historic ids", (t) => {
  const { storage, history } = createHistory(t);
  assert.throws(() => validateUsageDocument([]), /root/);
  assert.throws(() => validateUsageDocument({ command: { usageCount: 0, lastUsedAt: 0 } }), /invalid/);
  assert.throws(() => validateUsageDocument({ command: { usageCount: 1, lastUsedAt: 0, score: 1 } }), /invalid/);
  storage.save({ "removed.command": { usageCount: 1, lastUsedAt: 0 } });
  assert.deepEqual(history.getSnapshot(), { "removed.command": { usageCount: 1, lastUsedAt: 0 } });
  fs.writeFileSync(storage.filePath, "[]", "utf8");
  assert.deepEqual(history.getSnapshot(), {});
});

test("usage read and write failures are diagnostic-only", () => {
  const diagnostics = [];
  const history = new CommandUsageHistory({
    storage: {
      load() { throw new Error("damaged history"); },
      save() { throw new Error("unreachable"); }
    },
    onDiagnostic: (error) => diagnostics.push(error.message)
  });
  assert.deepEqual(history.getSnapshot(), {});
  assert.equal(history.record("timeline.addMarker", 1), null);
  assert.deepEqual(diagnostics, ["damaged history", "damaged history"]);
});
