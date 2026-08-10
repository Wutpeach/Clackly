const assert = require("node:assert/strict");
const test = require("node:test");

const { createBridgeExecutionAdapter } = require("./bridge");

test("bridge execution adapter maps marker intent to the existing HTTP command contract", async () => {
  const calls = [];
  const adapter = createBridgeExecutionAdapter({
    getUrl: () => "http://127.0.0.1:49999",
    checkHealth: async (url) => {
      calls.push({ url });
      return { ok: true, resolveVersion: "20.3.2.9" };
    },
    request: async (url, payload) => {
      calls.push({ url, payload });
      return { ok: true, command: payload.command };
    }
  });

  assert.equal(await adapter.isAvailable(), true);
  assert.equal(await adapter.getResolveVersion(), "20.3.2.9");
  assert.deepEqual(await adapter.addMarker(), {
    ok: true,
    command: "timeline.addMarker"
  });
  assert.deepEqual(calls, [{
    url: "http://127.0.0.1:49999/health"
  }, {
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

test("bridge adapter forwards Image Clipboard project and import facts", async () => {
  const calls = [];
  const adapter = createBridgeExecutionAdapter({
    getUrl: () => "http://127.0.0.1:49999",
    request: async (url, payload) => {
      calls.push({ url, payload });
      return payload.command === "media.clipboard-image.project"
        ? { ok: true, projectName: "Demo Project" }
        : { ok: true, mediaPoolBin: payload.binName };
    }
  });

  assert.equal(await adapter.getCurrentProjectName(), "Demo Project");
  assert.deepEqual(await adapter.importMediaToBin({
    diskPath: "C:\\Pictures\\image.png",
    binName: "Clipboard"
  }), { ok: true, mediaPoolBin: "Clipboard" });
  assert.deepEqual(calls.map(({ payload }) => payload), [{
    command: "media.clipboard-image.project"
  }, {
    command: "media.clipboard-image.import",
    diskPath: "C:\\Pictures\\image.png",
    binName: "Clipboard"
  }]);
});
