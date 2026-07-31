const assert = require("node:assert/strict");
const test = require("node:test");

const { normalizeTrigger, normalizeMouseEventTrigger, triggersEqual } = require("./trigger");

test("interaction triggers normalize canonical modifiers and compare exactly", () => {
  const stored = normalizeTrigger({
    type: "mouse",
    button: "right",
    modifiers: ["ALT", "CTRL", "SHIFT"]
  });
  const mouseEvent = {
    type: "mouse",
    button: 2,
    ctrlKey: true,
    shiftKey: true,
    altKey: true
  };
  const event = normalizeMouseEventTrigger(mouseEvent);

  assert.deepEqual(stored, {
    type: "mouse",
    button: "right",
    modifiers: ["CTRL", "SHIFT", "ALT"]
  });
  assert.equal(triggersEqual(stored, event), true);
  assert.equal(triggersEqual(stored, { ...event, modifiers: ["CTRL", "ALT"] }), false);
  assert.equal(normalizeMouseEventTrigger({ ...mouseEvent, button: 1 }).button, null);

  assert.throws(() => normalizeTrigger({ type: "mouse", button: "left", modifiers: ["CTRL", "CTRL"] }), /duplicate modifier/);
  assert.throws(() => normalizeTrigger({ type: "mouse", button: "middle", modifiers: [] }), /left or right/);
  assert.throws(() => normalizeTrigger({ type: "mouse", button: "left", modifiers: ["META"] }), /unsupported modifier/);
  assert.throws(() => normalizeTrigger({ type: "mouse", button: "left", modifiers: [], extra: true }), /contain only/);
});
