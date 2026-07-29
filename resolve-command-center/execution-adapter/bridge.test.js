const assert = require("node:assert/strict");
const test = require("node:test");

const { createBridgeExecutionAdapter } = require("./bridge");

test("bridge execution adapter maps marker intent to the existing HTTP command contract", async () => {
  const calls = [];
  const adapter = createBridgeExecutionAdapter({
    getUrl: () => "http://127.0.0.1:49999",
    checkHealth: async (url) => {
      calls.push({ url });
      return { ok: true };
    },
    request: async (url, payload) => {
      calls.push({ url, payload });
      return { ok: true, command: payload.command };
    }
  });

  assert.equal(await adapter.isAvailable(), true);
  assert.deepEqual(await adapter.addMarker(), {
    ok: true,
    command: "timeline.addMarker"
  });
  assert.deepEqual(calls, [{
    url: "http://127.0.0.1:49999/health"
  }, {
    url: "http://127.0.0.1:49999/command",
    payload: { command: "timeline.addMarker" }
  }]);
});

test("bridge execution adapter reports a dead bridge as unavailable", async () => {
  const adapter = createBridgeExecutionAdapter({
    checkHealth: async () => {
      throw new Error("connection refused");
    }
  });

  assert.equal(await adapter.isAvailable(), false);
});
