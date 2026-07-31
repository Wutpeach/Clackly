const assert = require("node:assert/strict");
const test = require("node:test");

const { InteractionManager } = require("./InteractionManager");

function mouse(button, modifiers = {}) {
  return {
    target: "timeline.addMarker",
    type: "mouse",
    button,
    ctrlKey: false,
    shiftKey: false,
    altKey: false,
    ...modifiers
  };
}

test("interaction manager exactly matches mouse bindings and delegates once", async () => {
  const calls = [];
  const bindings = {
    left: {
      target: "timeline.addMarker",
      trigger: { type: "mouse", button: "left", modifiers: [] },
      action: { command: "left.command" }
    },
    right: {
      target: "timeline.addMarker",
      trigger: { type: "mouse", button: "right", modifiers: ["ALT"] },
      action: { command: "right.command" }
    },
    ctrl: {
      target: "timeline.addMarker",
      trigger: { type: "mouse", button: "right", modifiers: ["CTRL"] },
      action: { command: "ctrl.command" }
    },
    shift: {
      target: "timeline.addMarker",
      trigger: { type: "mouse", button: "right", modifiers: ["SHIFT"] },
      action: { command: "shift.command" }
    },
    ctrlShift: {
      target: "timeline.addMarker",
      trigger: { type: "mouse", button: "left", modifiers: ["CTRL", "SHIFT"] },
      action: { command: "modified.command" }
    }
  };
  const manager = new InteractionManager({
    bindingStorage: { load: () => bindings },
    executeCommand: async (command) => {
      calls.push(command);
      return { ok: true };
    }
  });

  assert.deepEqual(await manager.handle(mouse(0)), {
    matched: true,
    command: "left.command",
    result: { ok: true }
  });
  assert.deepEqual(await manager.handle(mouse(2, { altKey: true })), {
    matched: true,
    command: "right.command",
    result: { ok: true }
  });
  assert.equal((await manager.handle(mouse(2, { ctrlKey: true }))).command, "ctrl.command");
  assert.equal((await manager.handle(mouse(2, { shiftKey: true }))).command, "shift.command");
  assert.deepEqual(await manager.handle(mouse(0, { shiftKey: true, ctrlKey: true })), {
    matched: true,
    command: "modified.command",
    result: { ok: true }
  });
  assert.deepEqual(calls, [
    "left.command",
    "right.command",
    "ctrl.command",
    "shift.command",
    "modified.command"
  ]);

  assert.deepEqual(await manager.handle(mouse(0, { ctrlKey: true })), { matched: false });
  assert.deepEqual(await manager.handle(mouse(0, { ctrlKey: true, shiftKey: true, altKey: true })), { matched: false });
  assert.deepEqual(await manager.handle(mouse(1)), { matched: false });
  assert.equal(calls.length, 5);

  const failure = new Error("unknown command");
  const failingManager = new InteractionManager({
    bindingStorage: { load: () => ({ left: bindings.left }) },
    executeCommand: async () => { throw failure; }
  });
  await assert.rejects(failingManager.handle(mouse(0)), (error) => error === failure);

  assert.throws(() => new InteractionManager(), /bindingStorage/);
  assert.throws(() => new InteractionManager({ bindingStorage: { load() {} } }), /executeCommand/);
  await assert.rejects(manager.handle({}), /target/);
});
