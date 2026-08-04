const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const test = require("node:test");

const appRoot = path.resolve(__dirname, "..");
const scriptPath = path.join(__dirname, "stage-managed-python.ps1");

function run(lockPath, cacheDirectory, outputName) {
  return spawnSync("powershell", [
    "-NoProfile", "-ExecutionPolicy", "Bypass", "-File", scriptPath,
    "-LockPath", lockPath,
    "-CacheDirectory", cacheDirectory,
    "-OutputDirectory", path.join(appRoot, "build", outputName)
  ], { cwd: appRoot, encoding: "utf8" });
}

test("Runtime staging validates the lock before download or output mutation", (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "clackly-stage-invalid-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const lockPath = path.join(root, "lock.json");
  fs.writeFileSync(lockPath, "{}");
  const outputName = `stage-invalid-${process.pid}`;
  const result = run(lockPath, root, outputName);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /unsupported identity metadata/);
  assert.equal(fs.existsSync(path.join(appRoot, "build", outputName)), false);
});

test("Runtime staging fails closed on a cached asset hash mismatch", (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "clackly-stage-hash-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const lock = JSON.parse(fs.readFileSync(path.join(appRoot, "resources", "runtimes", "python-win32-x64.lock.json")));
  lock.asset.sha256 = "0".repeat(64);
  const lockPath = path.join(root, "lock.json");
  fs.writeFileSync(lockPath, JSON.stringify(lock));
  fs.writeFileSync(path.join(root, lock.asset.fileName), "not a runtime");
  const result = run(lockPath, root, `stage-hash-${process.pid}`);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /SHA-256 mismatch/);
});

test("Runtime staging rejects an output beneath a junction", (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "clackly-stage-link-"));
  const linkName = `stage-link-${process.pid}`;
  const linkPath = path.join(appRoot, "build", linkName);
  fs.mkdirSync(path.dirname(linkPath), { recursive: true });
  fs.symlinkSync(root, linkPath, "junction");
  t.after(() => {
    fs.unlinkSync(linkPath);
    fs.rmSync(root, { recursive: true, force: true });
  });
  const lockPath = path.join(root, "lock.json");
  fs.writeFileSync(lockPath, "{}");

  const result = run(lockPath, root, path.join(linkName, "runtime"));

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /must not traverse a link/);
});

test("Runtime staging source contains no interpreter or PATH lookup", () => {
  const source = fs.readFileSync(scriptPath, "utf8");
  for (const forbidden of [
    /\bwhere(?:\.exe)?\s+python/i,
    /\bGet-Command\s+(?:python|py)\b/i,
    /\b(?:python|python3|py)(?:\.exe)?\s+-/i,
    /CONDA_PREFIX|VIRTUAL_ENV|RESOLVE_COMMAND_CENTER_PYTHON_CMD/
  ]) assert.doesNotMatch(source, forbidden);
});

test("both production hosts inject live Resolve version and packaged Runtime paths", () => {
  const standalone = fs.readFileSync(path.join(appRoot, "electron", "main", "main.js"), "utf8");
  const workflow = fs.readFileSync(path.join(appRoot, "workflow-plugin", "main.js"), "utf8");
  for (const source of [standalone, workflow]) {
    assert.match(source, /new RuntimeManager/);
    assert.match(source, /process\.resourcesPath, "runtimes"/);
    assert.match(source, /runtime-probe\.json/);
  }
  assert.match(standalone, /getResolveVersion/);
  assert.match(workflow, /GetVersionString/);
});
