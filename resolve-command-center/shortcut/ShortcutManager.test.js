const assert = require("node:assert/strict");
const test = require("node:test");

const { ShortcutManager } = require("./ShortcutManager");

test("ShortcutManager exposes configured function-name mappings", () => {
  const manager = new ShortcutManager();

  assert.equal(manager.getShortcut("CREATE_FUSION_CLIP"), "CTRL+ALT+F");
  assert.equal(manager.getShortcut("ADD_MARKER"), "CTRL+M");
  assert.equal(manager.get("ADD_MARKER"), "CTRL+M");
  assert.equal(manager.getShortcut("UNKNOWN"), null);
  assert.equal(manager.hasShortcut("ADD_MARKER"), true);
  assert.equal(manager.has("ADD_MARKER"), true);
  assert.deepEqual(manager.listShortcuts(), [
    { functionName: "CREATE_FUSION_CLIP", shortcut: "CTRL+ALT+F" },
    { functionName: "ADD_MARKER", shortcut: "CTRL+M" }
  ]);
});

test("ShortcutManager does not claim execution without an injected executor", async () => {
  const manager = new ShortcutManager();

  assert.equal(manager.canExecute("ADD_MARKER"), false);
  await assert.rejects(
    manager.execute("ADD_MARKER"),
    /Keyboard execution is unavailable for ADD_MARKER/
  );
});

test("ShortcutManager passes introspection data to an injected keyboard executor", async () => {
  const calls = [];
  const manager = new ShortcutManager({
    keyboardExecutor: async (request) => {
      calls.push(request);
      return { ok: true };
    }
  });

  assert.equal(manager.canExecute("ADD_MARKER"), true);
  assert.deepEqual(await manager.execute("ADD_MARKER", { source: "test" }), { ok: true });
  assert.deepEqual(calls, [{
    functionName: "ADD_MARKER",
    shortcut: "CTRL+M",
    context: { source: "test" }
  }]);
});
