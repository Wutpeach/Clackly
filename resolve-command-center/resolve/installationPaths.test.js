const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const { ConfigStorage } = require("../config/ConfigStorage");
const { ResolveInstallationPaths, RuntimeDiagnosticRecord, queryLiveResolveImages } = require("./installationPaths");

function fixture(t, root = "D:\\DaVinci 达芬奇 21") {
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), "resolve-paths-"));
  t.after(() => fs.rmSync(temporary, { recursive: true, force: true }));
  const scripting = "C:\\ProgramData\\Blackmagic Design\\DaVinci Resolve\\Support\\Developer\\Scripting";
  const entries = new Map();
  const add = (file, size = 10, mtimeMs = 1) => entries.set(file, { size, mtimeMs, isFile: () => true });
  for (const relative of ["Resolve.exe", "Electron\\electron.exe", "fusionscript.dll", "ResolvePython\\ResolvePython.exe"]) add(path.win32.join(root, relative));
  add(path.win32.join(scripting, "Modules", "DaVinciResolveScript.py"));
  const fileSystem = {
    realpathSync(file) { if (!entries.has(file)) throw Object.assign(new Error("missing"), { code: "ENOENT" }); return file; },
    statSync(file) { return entries.get(file); }
  };
  const storage = new ConfigStorage(path.join(temporary, "resolve-installation.json"));
  const diagnosticStorage = new ConfigStorage(path.join(temporary, "runtime-diagnostic.json"));
  const options = { host: { kind: "workflow", execPath: path.win32.join(root, "Electron", "electron.exe") },
    storage, pathApi: path.win32, fileSystem, environment: { PROGRAMDATA: "C:\\ProgramData" },
    diagnosticRecord: new RuntimeDiagnosticRecord({ storage: diagnosticStorage }) };
  return { root, entries, add, options, storage, diagnosticStorage, provider: new ResolveInstallationPaths(options) };
}

test("current Workflow custom installation wins over another installed Resolve and restarts reuse metadata", async (t) => {
  const f = fixture(t);
  f.add("C:\\Program Files\\Blackmagic Design\\DaVinci Resolve\\fusionscript.dll");
  const [a, b] = await Promise.all([f.provider.getSnapshot(), f.provider.getSnapshot()]);
  assert.equal(a.resolveRoot, f.root);
  assert.equal(a.libraryPath, path.win32.join(f.root, "fusionscript.dll"));
  assert.deepEqual(a, b);
  assert.equal(a.cache.status, "miss");
  assert.equal(f.storage.load().schemaVersion, 1);
  assert.equal(Object.hasOwn(f.storage.load(), "ready"), false);
  a.files.libraryPath.size = 999;
  assert.equal((await f.provider.getSnapshot()).files.libraryPath.size, 10);
  const restarted = new ResolveInstallationPaths(f.options);
  assert.equal((await restarted.getSnapshot()).cache.status, "hit");
  assert.equal(f.diagnosticStorage.load().status, "discovered");
});

test("default installation and optional ResolvePython absence keep managed paths usable", async (t) => {
  const f = fixture(t, "C:\\Program Files\\Blackmagic Design\\DaVinci Resolve");
  f.entries.delete(path.win32.join(f.root, "ResolvePython", "ResolvePython.exe"));
  const snapshot = await f.provider.getSnapshot();
  assert.equal(snapshot.resolvePythonExecutable, null);
  assert.equal(snapshot.files.resolvePythonExecutable, null);
  assert.equal((await new ResolveInstallationPaths(f.options).getSnapshot()).cache.status, "hit");
});

test("file replacement and missing current-host library invalidate without selecting another installation", async (t) => {
  const f = fixture(t);
  await f.provider.getSnapshot();
  const library = path.win32.join(f.root, "fusionscript.dll");
  f.add(library, 11, 2);
  assert.equal((await f.provider.getSnapshot()).files.libraryPath.mtimeMs, 2);
  f.entries.delete(library);
  f.add("C:\\Program Files\\Blackmagic Design\\DaVinci Resolve\\fusionscript.dll");
  await assert.rejects(f.provider.getSnapshot(), { code: "RESOLVE_LIBRARY_NOT_FOUND" });
  assert.equal(f.diagnosticStorage.load().libraryPath, library);
  assert.equal(f.diagnosticStorage.load().stage, "library-path");
  f.add(library, 12, 3);
  assert.equal((await f.provider.getSnapshot()).files.libraryPath.size, 12);
});

test("moved host, corrupt cache, denied read and denied write preserve current host authority", async (t) => {
  const f = fixture(t);
  f.storage.save({ schemaVersion: 1, resolveRoot: "C:\\Old Resolve" });
  assert.equal((await f.provider.getSnapshot()).resolveRoot, f.root);
  fs.writeFileSync(f.storage.filePath, "{");
  assert.equal((await new ResolveInstallationPaths(f.options).getSnapshot()).cache.code, "CACHE_READ_FAILED");
  const failed = new ResolveInstallationPaths({ ...f.options, storage: {
    load() { throw new Error("denied"); }, save() { throw new Error("denied"); }
  } });
  assert.equal((await failed.getSnapshot()).cache.status, "write-failed");
  assert.equal((await failed.getSnapshot()).resolveRoot, f.root);
});

test("standalone deduplicates one live host, memoizes discovery and rejects ambiguity or denied images", async (t) => {
  const f = fixture(t);
  let images = [{ path: path.win32.join(f.root, "Resolve.exe"), pid: 42 }, { path: path.win32.join(f.root, "Resolve.exe"), pid: 43 }];
  const provider = new ResolveInstallationPaths({ ...f.options, host: { kind: "standalone" }, queryImages: async () => images, isProcessAlive: () => true });
  assert.equal((await provider.getSnapshot()).resolveRoot, f.root);
  // A later command uses the known installation without another process query.
  images = [null];
  assert.equal((await provider.getSnapshot()).resolveRoot, f.root);
  provider.invalidate();
  await assert.rejects(provider.getSnapshot(), { code: "RESOLVE_IDENTITY_DENIED" });
  f.add("C:\\Other Resolve\\Resolve.exe");
  images = [{ path: path.win32.join(f.root, "Resolve.exe"), pid: 42 }, { path: "C:\\Other Resolve\\Resolve.exe", pid: 43 }];
  provider.invalidate();
  await assert.rejects(provider.getSnapshot(), { code: "RESOLVE_IDENTITY_AMBIGUOUS" });
  images = [];
  provider.invalidate();
  await assert.rejects(provider.getSnapshot(), { code: "RESOLVE_NOT_RUNNING" });
});

test("Workflow unrelated executable and inaccessible files fail closed", async (t) => {
  const f = fixture(t);
  await assert.rejects(new ResolveInstallationPaths({ ...f.options, host: { kind: "workflow", execPath: path.win32.join(f.root, "Resolve.exe") } }).getSnapshot(), { code: "RESOLVE_IDENTITY_INVALID" });
  await assert.rejects(new ResolveInstallationPaths({ ...f.options, fileSystem: {
    realpathSync() { throw Object.assign(new Error("denied"), { code: "EACCES" }); }
  } }).getSnapshot(), { code: "RESOLVE_PATH_DENIED" });
});

test("standalone host exit rediscovers a new root while old files remain; denied liveness fails closed", async (t) => {
  const f = fixture(t);
  const nextRoot = path.win32.join(f.root, "new installation");
  for (const name of ["Resolve.exe", "fusionscript.dll"]) f.add(path.win32.join(nextRoot, name));
  let images = [{ path: path.win32.join(f.root, "Resolve.exe"), pid: 42 }];
  const live = new Set([42]);
  let denied = false;
  const provider = new ResolveInstallationPaths({ ...f.options, host: { kind: "standalone" },
    queryImages: async () => images,
    isProcessAlive: (pid) => { if (denied) throw Object.assign(new Error("denied"), { code: "EPERM" }); return live.has(pid); }
  });
  assert.equal((await provider.getSnapshot()).resolveRoot, f.root);
  assert.equal(Object.hasOwn(f.storage.load(), "processIds"), false);
  images = [{ path: path.win32.join(nextRoot, "Resolve.exe"), pid: 43 }];
  live.delete(42); live.add(43);
  assert.equal((await provider.getSnapshot()).resolveRoot, nextRoot);
  assert.equal(f.entries.has(path.win32.join(f.root, "fusionscript.dll")), true);
  denied = true;
  await assert.rejects(provider.getSnapshot(), { code: "RESOLVE_IDENTITY_DENIED" });
  assert.equal(f.diagnosticStorage.load().stage, "host-liveness");
});

test("in-flight discovery cannot restore an identity invalidated by a newer host observation", async (t) => {
  const f = fixture(t);
  const nextRoot = path.win32.join(f.root, "new installation");
  for (const name of ["Resolve.exe", "fusionscript.dll"]) f.add(path.win32.join(nextRoot, name));
  let release;
  const delayed = new Promise((resolve) => { release = resolve; });
  let images = delayed;
  const provider = new ResolveInstallationPaths({ ...f.options, host: { kind: "standalone" },
    queryImages: () => images, isProcessAlive: () => true });
  const old = provider.getSnapshot();
  provider.invalidate();
  images = Promise.resolve([{ path: path.win32.join(nextRoot, "Resolve.exe"), pid: 43 }]);
  assert.equal((await provider.getSnapshot()).resolveRoot, nextRoot);
  release([{ path: path.win32.join(f.root, "Resolve.exe"), pid: 42 }]);
  assert.equal((await old).resolveRoot, nextRoot);
  assert.equal(f.storage.load().resolveRoot, nextRoot);
});

test("bounded image query rejects inaccessible and malformed records and never launches Resolve", async () => {
  for (const payload of [{ count: 1, records: [{ path: null }] }, { count: 2, records: [] }]) {
    await assert.rejects(queryLiveResolveImages({ environment: { SystemRoot: "C:\\Windows" }, execute(executable, args, options, callback) {
      assert.ok(executable.endsWith("powershell.exe"));
      assert.equal(options.timeout, 5000);
      assert.equal(options.windowsHide, true);
      assert.ok(args.includes("-NonInteractive"));
      callback(null, JSON.stringify(payload));
    } }), { code: "RESOLVE_IDENTITY_DENIED" });
  }
  assert.deepEqual(await queryLiveResolveImages({ environment: { SystemRoot: "C:\\Windows" }, execute(_exe, _args, _options, callback) {
    callback(null, JSON.stringify({ count: 1, records: [{ path: "D:\\Resolve\\Resolve.exe", pid: 42 }] }));
  } }), [{ path: "D:\\Resolve\\Resolve.exe", pid: 42 }]);
});
