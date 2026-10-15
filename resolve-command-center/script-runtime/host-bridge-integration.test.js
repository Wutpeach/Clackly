const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const test = require("node:test");
const { RuntimeManager } = require("./runtime/manager");
const { RuntimeLauncher } = require("./runtime/launcher");
const { PersistentScriptLauncher } = require("./runtime/persistent");
const { RuntimeDiagnosticRecord } = require("../resolve/installationPaths");

function fixture(t) {
  const root = fs.mkdtempSync(path.join(fs.realpathSync.native(os.tmpdir()), "clackly-bridge-达芬奇 "));
  const found = spawnSync(process.platform === "win32" ? "python" : "python3", ["-c", "import os,sys;print(os.path.realpath(sys.executable))"], { encoding: "utf8" });
  assert.equal(found.status, 0, found.stderr);
  const executable = found.stdout.trim();
  const resolution = { source: "override", supportStatus: "overridden", executable, profile: null };
  fs.mkdirSync(path.join(root, "scripts"));
  fs.writeFileSync(path.join(root, "scripts", "resolve2ae_export.py"), [
    "import os",
    "def execute(context):",
    "    assert sorted(name for name in dir(context) if not name.startswith('_')) == ['command_id', 'config', 'logger', 'project', 'resolve', 'timeline']",
    "    if context.config.get('lazy'): return {'lazy': True}",
    "    if context.config.get('fail'): raise ValueError('business failure')",
    "    return {'selected': context.resolve.selected, 'library': os.environ['RESOLVE_SCRIPT_LIB']}"
  ].join("\n"));
  let current;
  const installation = (name) => {
    const resolveRoot = path.join(root, name);
    fs.mkdirSync(resolveRoot);
    const modulePath = path.join(resolveRoot, "DaVinciResolveScript.py");
    const libraryPath = path.join(resolveRoot, "fusionscript.dll");
    fs.writeFileSync(libraryPath, name);
    fs.writeFileSync(modulePath, [
      "import os",
      "from pathlib import Path",
      "__file__ = os.environ['RESOLVE_SCRIPT_LIB']",
      "Path(__file__).with_suffix('.imported').write_text('loaded', encoding='utf-8')",
      "class Resolve:",
      "    selected = Path(__file__).parent.name",
      "    def GetVersionString(self): return '20.3.2.9'",
      "def scriptapp(name): return Resolve()"
    ].join("\n"));
    return { resolveRoot, resolveExecutable: path.join(resolveRoot, "Resolve.exe"), modulePath, libraryPath };
  };
  current = installation("D drive 第一套");
  const first = current;
  const launcher = new RuntimeLauncher({ temporaryRoot: root });
  const persistent = new PersistentScriptLauncher({ temporaryRoot: root });
  t.after(() => { persistent.dispose(); });
  // The launchers finish cleanup asynchronously after dispose.
  t.after(async () => {
    persistent.dispose();
    for (let i = 0; i < 100 && persistent.session; i += 1) await new Promise((resolve) => setTimeout(resolve, 10));
    fs.rmSync(root, { recursive: true, force: true });
  });
  const diagnosticPath = path.join(root, "runtime-diagnostic.json");
  const manager = new RuntimeManager({
    resolver: { resolve: () => resolution }, launcher, scriptLauncher: persistent,
    cachePath: path.join(root, "runtime-probe.json"), diagnosticRecord: new RuntimeDiagnosticRecord({ filePath: diagnosticPath }),
    clacklyVersion: "0.1.0", platform: "win32", architecture: "x64", overrideExecutable: executable,
    scriptRoot: root, hostContextProvider: async () => ({ application: "davinci-resolve", version: "20.3.2.9" }),
    installationPathsProvider: { getSnapshot: async () => structuredClone(current) }
  });
  const request = { runtime: "python", capabilityId: "ae.export", entry: "scripts/resolve2ae_export.py",
    commandId: "timeline.exportToAfterEffects", config: {} };
  return { root, manager, persistent, first, request, diagnosticPath,
    changeHost: () => { current = installation("D drive 第二套"); return current; } };
}

test("real isolated one-shot executes with the same custom bridge accepted by Probe", async (t) => {
  const f = fixture(t);
  const readiness = await f.manager.checkAvailability(f.request);
  assert.equal(readiness.bridge.libraryPath, fs.realpathSync(f.first.libraryPath));
  assert.equal((await f.manager.checkAvailability(f.request)).cache.status, "hit");
  const script = await f.manager.execute({ ...f.request, capabilityId: "fixture.generic" });
  assert.equal(script.ok, true);
  assert.equal(fs.realpathSync(script.result.library), fs.realpathSync(readiness.bridge.libraryPath));
  assert.equal(script.result.selected, "D drive 第一套");
  assert.equal(fs.readFileSync(f.diagnosticPath, "utf8").includes("config"), false);
});

test("host-neutral prewarm stays bridge-free; business adopts it and later host changes replace it", async (t) => {
  const f = fixture(t);
  assert.equal(await f.manager.prewarmExportPythonWorker(), true);
  const prewarmedPid = f.persistent.session.child.pid;
  assert.equal(fs.existsSync(f.first.libraryPath.replace(/\.dll$/, ".imported")), false);
  const first = await f.manager.execute(f.request);
  assert.equal(first.ok, true);
  assert.equal(fs.realpathSync(first.result.library), fs.realpathSync(f.first.libraryPath));
  assert.equal(f.persistent.session.child.pid, prewarmedPid);
  const changed = f.changeHost();
  const second = await f.manager.execute(f.request);
  assert.equal(second.ok, true);
  assert.equal(fs.realpathSync(second.result.library), fs.realpathSync(changed.libraryPath));
  assert.equal(second.result.selected, "D drive 第二套");
  assert.notEqual(f.persistent.session.child.pid, prewarmedPid);
  const beforeReplacement = f.persistent.session.child.pid;
  fs.appendFileSync(changed.libraryPath, "replacement");
  const future = new Date(Date.now() + 2000);
  fs.utimesSync(changed.libraryPath, future, future);
  assert.equal(fs.realpathSync((await f.manager.execute(f.request)).result.library), fs.realpathSync(changed.libraryPath));
  assert.notEqual(f.persistent.session.child.pid, beforeReplacement);
  const failed = await f.manager.execute({ ...f.request, config: { fail: true } });
  assert.equal(failed.ok, false);
  assert.equal(failed.error.type, "ValueError");
});

test("malformed or partial bridge tuples are rejected before one-shot or persistent business spawn", async (t) => {
  const f = fixture(t);
  const resolution = f.manager.resolver.resolve();
  const request = { operation: "script-execute", scriptRoot: f.root, entry: f.request.entry,
    commandId: f.request.commandId, config: {}, bridge: { modulePath: f.first.modulePath } };
  await assert.rejects(f.manager.launcher.execute({ resolution, request }), { code: "RUNTIME_LAUNCH_REQUEST_INVALID" });
  await assert.rejects(f.persistent.execute({ resolution, healthKey: "health", identity: "python", request }), { code: "RUNTIME_LAUNCH_REQUEST_INVALID" });
  assert.equal(f.persistent.session, null);
});
