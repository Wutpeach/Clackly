const assert = require("node:assert/strict");
const { EventEmitter } = require("node:events");
const test = require("node:test");

const {
  HELPER_SCRIPT,
  PROCESS_PROBE_MAX_RESPONSE_BYTES,
  READY_LINE,
  WindowsAfterEffectsProcessProbe
} = require("./afterEffectsProcessProbe");

function fakeChild() {
  const child = new EventEmitter();
  child.stdout = new EventEmitter();
  child.stdin = new EventEmitter();
  child.stdin.writes = [];
  child.stdin.write = (value, encoding, callback) => {
    child.stdin.writes.push([value, encoding]);
    if (typeof callback === "function") callback();
    return true;
  };
  child.stdin.end = () => { child.stdin.ended = true; };
  child.kill = () => { child.killed = (child.killed || 0) + 1; };
  return child;
}

function fixture(t, overrides = {}) {
  const children = [];
  const spawns = [];
  const timers = [];
  const probe = new WindowsAfterEffectsProcessProbe({
    hostEnvironment: { SystemRoot: "C:\\Windows", APPDATA: "C:\\Users\\host\\AppData" },
    platform: "win32",
    spawnProcess(executable, args, options) {
      const child = fakeChild();
      children.push(child);
      spawns.push([executable, args, options]);
      return child;
    },
    setTimer(callback, milliseconds) {
      const timer = { callback, milliseconds, cleared: false };
      timers.push(timer);
      return timer;
    },
    clearTimer(timer) {
      timer.cleared = true;
    },
    ...overrides
  });
  t.after(() => probe.dispose());
  return { children, probe, spawns, timers };
}

function ready(child) {
  child.stdout.emit("data", Buffer.from(`${READY_LINE}\r\n`, "utf8"));
}

async function readyForQuery(child) {
  ready(child);
  await Promise.resolve();
}

function response(child, value) {
  child.stdout.emit("data", Buffer.from(`${JSON.stringify(value)}\n`, "utf8"));
}

function result(requestId, records = []) {
  return { requestId, processCount: records.length, records };
}

test("starts one hidden no-shell helper with a fixed encoded protocol and no host payload", async (t) => {
  const { children, probe, spawns } = fixture(t);
  const pending = probe.query();

  assert.equal(spawns.length, 1);
  assert.equal(spawns[0][0], "C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe");
  assert.deepEqual(spawns[0][1].slice(0, -1), [
    "-NoLogo", "-NoProfile", "-NonInteractive", "-EncodedCommand"
  ]);
  assert.equal(Buffer.from(spawns[0][1].at(-1), "base64").toString("utf16le"), HELPER_SCRIPT);
  assert.equal(spawns[0][2].shell, false);
  assert.equal(spawns[0][2].windowsHide, true);
  assert.equal(spawns[0][2].stdio[0], "pipe");
  assert.equal(spawns[0][2].stdio[1], "pipe");
  assert.equal(spawns[0][2].stdio[2], "ignore");
  assert.doesNotMatch(HELPER_SCRIPT, /\$CLACKLY_JSX|aePath|CONFIG|QUERY .*AfterFX/i);

  await readyForQuery(children[0]);
  assert.deepEqual(children[0].stdin.writes, [["QUERY 1\n", "utf8"]]);
  response(children[0], result(1));
  assert.deepEqual(await pending, { processCount: 0, records: [] });
});

test("prewarm performs exactly one discarded fresh query and the first user query is distinct", async (t) => {
  const { children, probe, spawns } = fixture(t);
  const warming = probe.prewarm();

  assert.equal(probe.prewarm(), warming, "repeated host prewarm shares its one discarded query");
  assert.equal(spawns.length, 1);
  await readyForQuery(children[0]);
  assert.deepEqual(children[0].stdin.writes, [["QUERY 1\n", "utf8"]]);
  response(children[0], result(1, [{ status: "unresolved" }]));
  assert.equal(await warming, true, "the prewarm record is discarded outside the user result path");

  const userQuery = probe.query();
  await Promise.resolve();
  assert.deepEqual(children[0].stdin.writes, [["QUERY 1\n", "utf8"], ["QUERY 2\n", "utf8"]]);
  response(children[0], result(2, [{ status: "ok", path: "C:\\Other\\AfterFX.exe" }]));
  assert.deepEqual(await userQuery, {
    processCount: 1,
    records: [{ status: "ok", path: "C:\\Other\\AfterFX.exe" }]
  });
  assert.equal(spawns.length, 1, "the user query re-enumerates through the one helper, not a new PowerShell process");
});

test("a user query arriving during prewarm shares the helper but waits for its own next query", async (t) => {
  const { children, probe, spawns } = fixture(t);
  const warming = probe.prewarm();
  const userQuery = probe.query();

  assert.equal(spawns.length, 1);
  await readyForQuery(children[0]);
  assert.deepEqual(children[0].stdin.writes, [["QUERY 1\n", "utf8"]]);
  response(children[0], result(1));
  assert.equal(await warming, true);
  await Promise.resolve();
  assert.deepEqual(children[0].stdin.writes, [["QUERY 1\n", "utf8"], ["QUERY 2\n", "utf8"]]);
  response(children[0], result(2, [{ status: "unresolved" }]));
  assert.deepEqual(await userQuery, { processCount: 1, records: [{ status: "unresolved" }] });
  assert.equal(spawns.length, 1);
});

test("a failed background prewarm is silent to later query recovery and does not retry itself", async (t) => {
  const { children, probe, spawns } = fixture(t);
  const warming = probe.prewarm();
  await readyForQuery(children[0]);
  assert.deepEqual(children[0].stdin.writes, [["QUERY 1\n", "utf8"]]);
  children[0].emit("exit", 1);
  await assert.rejects(warming, (error) => error.details.reason === "child-exit");
  assert.equal(spawns.length, 1, "failed prewarm does not retry in the background");

  const laterUserQuery = probe.query();
  assert.equal(spawns.length, 2, "a later user command may start one replacement helper");
  await readyForQuery(children[1]);
  assert.deepEqual(children[1].stdin.writes, [["QUERY 2\n", "utf8"]]);
  response(children[1], result(2));
  assert.deepEqual(await laterUserQuery, { processCount: 0, records: [] });
});

test("rejects malformed, oversized, non-UTF8, and wrong-id output closed", async (t) => {
  const cases = [
    { emit: (child) => child.stdout.emit("data", Buffer.from("not json\n")), reason: "malformed-response" },
    { emit: (child) => response(child, result(9)), reason: "wrong-request-id" },
    { emit: (child) => response(child, { requestId: 1, processCount: 1, records: [] }), reason: "malformed-response" },
    { emit: (child) => child.stdout.emit("data", Buffer.from([0xff, 0x0a])), reason: "non-utf8-output" },
    { emit: (child) => child.stdout.emit("data", Buffer.alloc(PROCESS_PROBE_MAX_RESPONSE_BYTES + 1, 0x61)), reason: "output-too-large" }
  ];

  for (const item of cases) {
    const local = fixture(t);
    const pending = local.probe.query();
    await readyForQuery(local.children[0]);
    item.emit(local.children[0]);
    await assert.rejects(pending, (error) => (
      error.code === "AFTER_EFFECTS_PROCESS_PROBE_FAILED" && error.details.reason === item.reason
    ));
    assert.equal(local.children[0].killed, 1);
  }
});

test("rejects unknown fields, record overflow, and unsafe records without exposing them", async (t) => {
  const cases = [
    { requestId: 1, processCount: 0, records: [], unexpected: "private" },
    { requestId: 1, processCount: 257, records: Array.from({ length: 257 }, () => ({ status: "unresolved" })) },
    { requestId: 1, processCount: 1, records: [{ status: "ok", path: "C:\\AfterFX.exe", error: "private" }] },
    { requestId: 1, processCount: 1, records: [{ status: "unresolved", path: "C:\\private" }] }
  ];

  for (const payload of cases) {
    const local = fixture(t);
    const pending = local.probe.query();
    await readyForQuery(local.children[0]);
    response(local.children[0], payload);
    await assert.rejects(pending, (error) => error.code === "AFTER_EFFECTS_PROCESS_PROBE_FAILED");
  }
});

test("startup and query timeout reject the current command and terminate the helper", async (t) => {
  const startup = fixture(t);
  const startPending = startup.probe.query();
  startup.timers.at(-1).callback();
  await assert.rejects(startPending, (error) => error.details.reason === "startup-timeout");
  assert.equal(startup.children[0].killed, 1);

  const query = fixture(t);
  const queryPending = query.probe.query();
  await readyForQuery(query.children[0]);
  query.timers.at(-1).callback();
  await assert.rejects(queryPending, (error) => error.details.reason === "query-timeout");
  assert.equal(query.children[0].killed, 1);
});

test("stdout ending rejects the active query promptly and terminates the helper", async (t) => {
  const { children, probe } = fixture(t);
  const pending = probe.query();
  await readyForQuery(children[0]);
  children[0].stdout.emit("end");
  await assert.rejects(pending, (error) => error.details.reason === "stdout-end");
  assert.equal(children[0].killed, 1);
});

test("a failed helper rejects active work without retry and a later query starts once", async (t) => {
  const { children, probe, spawns } = fixture(t);
  const failed = probe.query();
  await readyForQuery(children[0]);
  children[0].emit("exit", 1);
  await assert.rejects(failed, (error) => error.details.reason === "child-exit");
  assert.equal(spawns.length, 1);

  const recovered = probe.query();
  assert.equal(spawns.length, 2, "only the later invocation may start a replacement helper");
  await readyForQuery(children[1]);
  response(children[1], result(2));
  assert.deepEqual(await recovered, { processCount: 0, records: [] });
});

test("dispose is idempotent, ends stdin, kills the helper, and rejects queued work", async (t) => {
  const { children, probe } = fixture(t);
  const pending = probe.query();
  probe.dispose();
  probe.dispose();

  await assert.rejects(pending, (error) => error.details.reason === "disposed");
  await assert.rejects(probe.query(), (error) => error.details.reason === "disposed");
  assert.equal(children[0].stdin.ended, true);
  assert.equal(children[0].killed, 1);
});

test("non-Windows paths never spawn and report a stopped live-process set", async (t) => {
  let spawned = false;
  const probe = new WindowsAfterEffectsProcessProbe({
    platform: "darwin",
    spawnProcess: () => { spawned = true; throw new Error("must not spawn"); }
  });
  assert.equal(await probe.prewarm(), false);
  assert.deepEqual(await probe.query(), { processCount: 0, records: [] });
  assert.equal(spawned, false);
});
