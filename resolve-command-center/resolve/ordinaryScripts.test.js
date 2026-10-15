const assert = require("node:assert/strict");
const { EventEmitter } = require("node:events");
const { PassThrough } = require("node:stream");
const test = require("node:test");
const path = require("node:path");

const {
  createOrdinaryScripts,
  createResolvePythonTransport,
  resolveQualifiedRuntime
} = require("./ordinaryScripts");

const scripts = [
  {
    id: "resolve-workspace-script:c:/scripts/utility/example.py",
    name: "Example",
    absolutePath: "C:\\Scripts\\Utility\\Example.py",
    language: "python",
    source: "system",
    category: "Utility",
    nesting: []
  },
  {
    id: "resolve-workspace-script:c:/scripts/edit/example.lua",
    name: "Example",
    absolutePath: "C:\\Scripts\\Edit\\Example.lua",
    language: "lua",
    source: "user",
    category: "Edit",
    nesting: []
  }
];

function service(run, ids = ["discover-request", "invoke-request"]) {
  return createOrdinaryScripts({
    runtime: { qualified: true },
    transport: { run },
    createRequestId: () => ids.shift()
  });
}

test("shared current installation drives discover/invoke and a changed host invalidates old selections", async () => {
  let snapshot = { resolveExecutable: "D:/Resolve 第一套/Resolve.exe", resolvePythonExecutable: "D:/Resolve 第一套/ResolvePython/ResolvePython.exe",
    modulePath: "C:/Scripting/Modules/DaVinciResolveScript.py", libraryPath: "D:/Resolve 第一套/fusionscript.dll", scriptingRoot: "C:/Scripting", files: { libraryPath: { mtimeMs: 1 } } };
  const selectedRuntimes = [];
  const adapter = createOrdinaryScripts({ installationPathsProvider: { getSnapshot: async () => snapshot },
    helperPath: path.join(__dirname, "ordinary_scripts.py"), transport: { async run(request, runtime) {
      selectedRuntimes.push(runtime);
      return request.operation === "discover"
        ? { operation: "discover", requestId: request.requestId, status: "discovered", scripts, diagnostics: [] }
        : { operation: "invoke", requestId: request.requestId, status: "api_returned", apiReturn: null };
    } } });
  assert.equal((await adapter.discover()).scripts.length, scripts.length);
  assert.equal((await adapter.invoke(scripts[0].id)).status, "api_returned");
  assert.equal(selectedRuntimes[1].executable, snapshot.resolvePythonExecutable);
  assert.equal(selectedRuntimes[1].libraryPath, snapshot.libraryPath);
  snapshot = { ...snapshot, resolveExecutable: "D:/Resolve 第二套/Resolve.exe", files: { libraryPath: { mtimeMs: 2 } } };
  assert.equal((await adapter.invoke(scripts[0].id)).reason, "selection_unknown");
  snapshot = { ...snapshot, resolvePythonExecutable: null };
  assert.equal((await adapter.discover()).diagnostics[0].code, "RESOLVE_PYTHON_NOT_FOUND");
  assert.equal(selectedRuntimes.length, 2);
});

test("discovers helper metadata and submits one stored absolute path", async () => {
  const calls = [];
  const ordinaryScripts = service(async (request) => {
    calls.push(request);
    if (request.operation === "discover") {
      return { operation: "discover", requestId: request.requestId, status: "discovered", scripts, diagnostics: [] };
    }
    return {
      operation: "invoke",
      requestId: request.requestId,
      status: "api_returned",
      apiReturn: null
    };
  });

  const snapshot = await ordinaryScripts.discover();
  assert.deepEqual(snapshot, { scripts, diagnostics: [] });
  snapshot.scripts[0].absolutePath = "C:\\untrusted.py";
  snapshot.scripts[0].nesting.push("untrusted");
  assert.deepEqual(await ordinaryScripts.invoke(scripts[0].id), {
    operation: "invoke",
    requestId: "invoke-request",
    status: "api_returned",
    apiReturn: null
  });
  assert.equal(calls.length, 2);
  assert.deepEqual(calls[1], {
    operation: "invoke",
    requestId: "invoke-request",
    scriptId: scripts[0].id,
    absolutePath: scripts[0].absolutePath
  });
});

test("converts an early helper stdin failure into one transport failure", async () => {
  const child = new EventEmitter();
  let kills = 0;
  child.stdin = new PassThrough();
  child.stdout = new PassThrough();
  child.stderr = new PassThrough();
  child.kill = () => {
    kills += 1;
    return true;
  };
  const transport = createResolvePythonTransport({
    spawnProcess: () => child,
    timeoutMs: 1_000
  });

  const receipt = transport.run({ operation: "invoke" }, {
    executable: "C:\\ResolvePython.exe",
    helperPath: "C:\\ordinary_scripts.py",
    scriptingRoot: "C:\\Scripting",
    libraryPath: "C:\\fusionscript.dll",
    moduleDirectory: "C:\\Modules"
  });
  queueMicrotask(() => child.stdin.emit("error", new Error("EPIPE")));

  await assert.rejects(receipt, /EPIPE/);
  assert.equal(kills, 1);
});

test("decodes a receipt when a Unicode character spans stdout chunks", async () => {
  const child = new EventEmitter();
  child.stdin = new PassThrough();
  child.stdout = new PassThrough();
  child.stderr = new PassThrough();
  child.kill = () => true;
  const transport = createResolvePythonTransport({ spawnProcess: () => child, timeoutMs: 1_000 });
  const receipt = transport.run({}, {
    executable: "C:\\ResolvePython.exe",
    helperPath: "C:\\ordinary_scripts.py",
    scriptingRoot: "C:\\Scripting",
    libraryPath: "C:\\fusionscript.dll",
    moduleDirectory: "C:\\Modules"
  });
  const body = Buffer.from(JSON.stringify({ name: "夏" }));
  const split = body.indexOf(Buffer.from("夏")) + 1;
  child.stdout.write(body.subarray(0, split));
  child.stdout.write(body.subarray(split));
  child.emit("close", 0);

  assert.deepEqual(await receipt, { name: "夏" });
});

test("preserves explicit host rejection and never sends an unknown selection", async () => {
  const calls = [];
  const ordinaryScripts = service(async (request) => {
    calls.push(request);
    if (request.operation === "discover") {
      return { operation: "discover", requestId: request.requestId, status: "discovered", scripts, diagnostics: [] };
    }
    return { operation: "invoke", requestId: request.requestId, status: "not_submitted", reason: "host_unavailable" };
  }, ["discover", "rejected", "unknown"]);

  await ordinaryScripts.discover();
  assert.deepEqual(await ordinaryScripts.invoke(scripts[1].id), {
    operation: "invoke", requestId: "rejected", status: "not_submitted", reason: "host_unavailable"
  });
  assert.deepEqual(await ordinaryScripts.invoke("not-a-discovered-script"), {
    requestId: "unknown", status: "not_submitted", reason: "selection_unknown"
  });
  assert.equal(calls.length, 2);
});

test("treats a malformed or lost final receipt as unknown without retrying", async () => {
  let invokes = 0;
  const ordinaryScripts = service(async (request) => {
    if (request.operation === "discover") {
      return { operation: "discover", requestId: request.requestId, status: "discovered", scripts, diagnostics: [] };
    }
    invokes += 1;
    return { operation: "invoke", requestId: request.requestId, status: "completed" };
  });

  await ordinaryScripts.discover();
  assert.deepEqual(await ordinaryScripts.invoke(scripts[0].id), {
    requestId: "invoke-request", status: "submission_unknown", reason: "receipt_invalid"
  });
  assert.equal(invokes, 1);
});

test("overlapping discoveries replace the snapshot atomically", async () => {
  const pending = new Map();
  const ordinaryScripts = createOrdinaryScripts({
    runtime: { qualified: true },
    transport: {
      run: (request) => request.operation === "discover"
        ? new Promise((resolve) => pending.set(request.requestId, resolve))
        : Promise.resolve({
          operation: "invoke", requestId: request.requestId, status: "api_returned", apiReturn: null
        })
    },
    createRequestId: (() => {
      const ids = ["first", "second", "invoke"];
      return () => ids.shift();
    })()
  });
  const first = ordinaryScripts.discover();
  const second = ordinaryScripts.discover();
  pending.get("second")({
    operation: "discover", requestId: "second", status: "discovered", scripts: [scripts[1]], diagnostics: []
  });
  assert.deepEqual((await second).scripts, [scripts[1]]);
  pending.get("first")({
    operation: "discover", requestId: "first", status: "discovered", scripts: [scripts[0]], diagnostics: []
  });
  assert.deepEqual((await first).scripts, [scripts[0]]);
  assert.deepEqual(await ordinaryScripts.invoke(scripts[1].id), {
    requestId: "invoke", status: "not_submitted", reason: "selection_unknown"
  });
});

test("makes a nonqualified platform/runtime explicit without a transport fallback", async () => {
  const ordinaryScripts = createOrdinaryScripts({
    runtime: null,
    transport: { run: async () => assert.fail("runtime-unavailable discovery must not start transport") }
  });

  assert.deepEqual(await ordinaryScripts.discover(), {
    scripts: [],
    diagnostics: [{ code: "runtime_unavailable", message: "The qualified Windows ResolvePython layout is unavailable" }]
  });
});

test("qualifies only the fixed Windows ResolvePython layout", () => {
  const expectedFiles = new Set([
    "C:\\Program Files\\Blackmagic Design\\DaVinci Resolve\\ResolvePython\\ResolvePython.exe",
    "C:\\Program Files\\Blackmagic Design\\DaVinci Resolve\\fusionscript.dll",
    "C:\\app\\ordinary_scripts.py"
  ]);
  const runtime = resolveQualifiedRuntime({
    platform: "win32",
    helperPath: "C:\\app\\ordinary_scripts.py",
    environment: { ProgramFiles: "C:\\Program Files", PROGRAMDATA: "C:\\ProgramData" },
    fileSystem: {
      statSync(candidate) {
        return {
          isFile: () => expectedFiles.has(candidate),
          isDirectory: () => candidate === "C:\\ProgramData\\Blackmagic Design\\DaVinci Resolve\\Support\\Developer\\Scripting\\Modules"
        };
      }
    }
  });

  assert.deepEqual(runtime, {
    executable: "C:\\Program Files\\Blackmagic Design\\DaVinci Resolve\\ResolvePython\\ResolvePython.exe",
    libraryPath: "C:\\Program Files\\Blackmagic Design\\DaVinci Resolve\\fusionscript.dll",
    moduleDirectory: "C:\\ProgramData\\Blackmagic Design\\DaVinci Resolve\\Support\\Developer\\Scripting\\Modules",
    scriptingRoot: "C:\\ProgramData\\Blackmagic Design\\DaVinci Resolve\\Support\\Developer\\Scripting",
    helperPath: "C:\\app\\ordinary_scripts.py"
  });
  assert.equal(resolveQualifiedRuntime({ platform: "darwin" }), null);
});
