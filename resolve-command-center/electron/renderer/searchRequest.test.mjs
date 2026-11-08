import assert from "node:assert/strict";
import test from "node:test";
import { createSearchRequestGate, findSelectedCommandIndex } from "./searchRequest.mjs";

test("Search request revisions reject out-of-order results", () => {
  const gate = createSearchRequestGate();
  const first = gate.begin();
  const second = gate.begin();
  assert.equal(gate.isCurrent(first), false);
  assert.equal(gate.isCurrent(second), true);
  assert.equal(gate.isCurrent(0), false);
});

test("selection follows a toggled Command throughout the active list without truncation", () => {
  const reordered = Array.from({ length: 30 }, (_value, index) => ({ id: `command-${index}` }));
  assert.equal(findSelectedCommandIndex(reordered, "command-7"), 7);
  assert.equal(findSelectedCommandIndex(reordered, "command-29"), 29);
  assert.equal(findSelectedCommandIndex(reordered, "removed-command"), 0);
  assert.equal(findSelectedCommandIndex(null, "command-0"), 0);
});
