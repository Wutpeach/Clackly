const assert = require("node:assert/strict");
const test = require("node:test");

const { createNativeDualWindowHost } = require("./nativeDualWindowHost");

function createWindow({ destroyed = false } = {}) {
  const listeners = new Map();
  const onceListeners = new Map();
  return {
    destroyed,
    listeners,
    onceListeners,
    isDestroyed() { return this.destroyed; },
    on(event, listener) { listeners.set(event, listener); },
    once(event, listener) { onceListeners.set(event, listener); },
    emit(event) { listeners.get(event)?.(); },
    emitOnce(event) { onceListeners.get(event)?.(); }
  };
}

test("native host owns one policy-aware main and persistent detached Panel lifecycle", () => {
  const calls = [];
  const main = createWindow();
  const panel = createWindow();
  const policy = Object.freeze({ surface: "opaque-full-bleed", interactionPanel: "detached-native-panel" });
  const host = createNativeDualWindowHost({
    palettePolicy: policy,
    createPaletteWindow: (receivedPolicy) => {
      calls.push(["create-main", receivedPolicy]);
      return main;
    },
    createDetachedInteractionPanelWindow: () => {
      calls.push(["create-panel"]);
      return panel;
    },
    closeDetachedInteractionPanel: (...args) => calls.push(["close", ...args]),
    openDetachedInteractionPanel: (...args) => {
      calls.push(["open", ...args]);
      return { panelTop: 8, panelHeight: 60, anchorY: 38 };
    },
    showPaletteWindow: (...args) => calls.push(["show", ...args]),
    hidePaletteWindow: (...args) => calls.push(["hide", ...args])
  });

  assert.equal(host.createWindow(), main);
  assert.equal(host.getPaletteWindow(), main);
  assert.deepEqual(calls, [["create-main", policy], ["create-panel"]]);

  calls.length = 0;
  host.showPalette();
  assert.deepEqual(calls, [["close", main, panel, { restoreFocus: false }], ["show", main, policy]]);

  calls.length = 0;
  const request = { metrics: { anchorY: 38, contentHeight: 60 }, presentation: { kind: "description", description: "Details" } };
  assert.deepEqual(host.openInteractionPanel(request), { panelTop: 8, panelHeight: 60, anchorY: 38 });
  assert.deepEqual(calls, [["open", main, panel, request]]);

  calls.length = 0;
  main.emit("blur");
  assert.deepEqual(calls, [["close", main, panel, { restoreFocus: false }]]);

  calls.length = 0;
  host.hidePalette();
  assert.deepEqual(calls, [["close", main, panel, { restoreFocus: false }], ["hide", main]]);
});

test("destroyed Panel is recreated, and its close handler fails closed without changing main ownership", () => {
  const calls = [];
  const main = createWindow();
  const firstPanel = createWindow();
  const replacementPanel = createWindow();
  const panels = [firstPanel, replacementPanel];
  const host = createNativeDualWindowHost({
    palettePolicy: Object.freeze({ surface: "opaque-full-bleed" }),
    createPaletteWindow: () => main,
    createDetachedInteractionPanelWindow: () => {
      const next = panels.shift();
      calls.push(["create-panel", next]);
      return next;
    },
    closeDetachedInteractionPanel: (...args) => calls.push(["close", ...args]),
    openDetachedInteractionPanel: (...args) => {
      calls.push(["open", ...args]);
      return null;
    },
    showPaletteWindow: () => {},
    hidePaletteWindow: () => {}
  });

  host.createWindow();
  calls.length = 0;
  firstPanel.destroyed = true;
  host.openInteractionPanel({ metrics: { anchorY: 38, contentHeight: 60 }, presentation: { kind: "description", description: "Details" } });
  assert.deepEqual(calls, [
    ["create-panel", replacementPanel],
    ["open", main, replacementPanel, { metrics: { anchorY: 38, contentHeight: 60 }, presentation: { kind: "description", description: "Details" } }]
  ]);

  calls.length = 0;
  replacementPanel.emitOnce("closed");
  assert.deepEqual(calls, [["close", main, null]]);
  assert.equal(host.getPaletteWindow(), main);
});
