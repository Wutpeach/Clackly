const assert = require("node:assert/strict");
const test = require("node:test");

const {
  getCommandById,
  resetCommandCache,
  searchCommands
} = require("./registry");

test("timeline.addMarker preserves registry search with capability metadata", () => {
  resetCommandCache();

  const command = getCommandById("timeline.addMarker");
  assert.equal(command.capability, "marker.add");
  assert.equal(Object.hasOwn(command, "executor"), false);
  assert.deepEqual(searchCommands("marker").map(({ id }) => id), ["timeline.addMarker"]);
});
