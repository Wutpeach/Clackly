const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const test = require("node:test");
const {
  assertApplicationSourceIdentity,
  productionPythonSourceInventory
} = require("./verify-package");

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

test("Runtime staging and package verification retain the persistent Export-to-AE Bootstrap", () => {
  const source = fs.readFileSync(scriptPath, "utf8");
  const verifier = fs.readFileSync(path.join(__dirname, "verify-package.js"), "utf8");
  assert.match(source, /persistent_bootstrap\.py/);
  assert.match(verifier, /clackly\/persistent_bootstrap\.py/);
});

test("Windows packaging refreshes the managed runtime before Electron Builder", () => {
  const packageScript = JSON.parse(fs.readFileSync(path.join(appRoot, "package.json"), "utf8"))
    .scripts["package:win"];
  assert.match(packageScript, /npm run runtime:stage/);
  assert.ok(packageScript.indexOf("npm run runtime:stage") < packageScript.indexOf("electron-builder"));
});

test("package verification detects stale managed application sources before and after staging", (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "clackly-runtime-source-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const sourceRoot = path.join(root, "source");
  const stagedProfileRoot = path.join(root, "staged-profile");
  const packagedProfileRoot = path.join(root, "packaged-profile");
  const sources = [
    ["script-runtime/runtime/bootstrap.py", "clackly/bootstrap.py", "bootstrap"],
    ["script-runtime/runtime/persistent_bootstrap.py", "clackly/persistent_bootstrap.py", "persistent"],
    ["script-runtime/python_runner.py", "clackly/python_runner.py", "runner"],
    ["resolve/adapter.py", "clackly/resolve/adapter.py", "adapter"],
    ["scripts/resolve2ae_export.py", "clackly/scripts/resolve2ae_export.py", "export"],
    ["scripts/test_ignored.py", "clackly/scripts/test_ignored.py", "ignored"],
    ["resolve2ae_core/export.py", "clackly/resolve2ae_core/export.py", "core"]
  ];
  for (const [sourceRelative, stagedRelative, content] of sources) {
    const sourcePath = path.join(sourceRoot, ...sourceRelative.split("/"));
    fs.mkdirSync(path.dirname(sourcePath), { recursive: true });
    fs.writeFileSync(sourcePath, content);
    if (!sourceRelative.includes("/test_")) {
      for (const profileRoot of [stagedProfileRoot, packagedProfileRoot]) {
        const target = path.join(profileRoot, ...stagedRelative.split("/"));
        fs.mkdirSync(path.dirname(target), { recursive: true });
        fs.copyFileSync(sourcePath, target);
      }
    }
  }

  const applicationSources = productionPythonSourceInventory(sourceRoot);
  assert.equal(applicationSources.some(({ path: itemPath }) => itemPath.endsWith("test_ignored.py")), false);
  const metadata = { build: { applicationSources } };
  assert.doesNotThrow(() => assertApplicationSourceIdentity({
    appRoot: sourceRoot,
    stagedProfileRoot,
    packagedProfileRoot,
    metadata
  }));

  const staleMetadata = structuredClone(metadata);
  staleMetadata.build.applicationSources[0].sha256 = "0".repeat(64);
  assert.throws(() => assertApplicationSourceIdentity({
    appRoot: sourceRoot,
    stagedProfileRoot,
    packagedProfileRoot,
    metadata: staleMetadata
  }), /Staged runtime source inventory differs from the current repository source/);

  fs.writeFileSync(path.join(stagedProfileRoot, "clackly", "scripts", "resolve2ae_export.py"), "stale staging");
  assert.throws(() => assertApplicationSourceIdentity({
    appRoot: sourceRoot,
    stagedProfileRoot,
    packagedProfileRoot,
    metadata
  }), /Staged application source file differs from current source/);

  fs.copyFileSync(
    path.join(sourceRoot, "scripts", "resolve2ae_export.py"),
    path.join(stagedProfileRoot, "clackly", "scripts", "resolve2ae_export.py")
  );
  fs.writeFileSync(path.join(packagedProfileRoot, "clackly", "resolve2ae_core", "export.py"), "stale package");
  assert.throws(() => assertApplicationSourceIdentity({
    appRoot: sourceRoot,
    stagedProfileRoot,
    packagedProfileRoot,
    metadata
  }), /Packaged application source file differs from current source/);
});

test("production hosts inject live Resolve version and Core owns packaged Runtime wiring", () => {
  const standalone = fs.readFileSync(path.join(appRoot, "electron", "main", "main.js"), "utf8");
  const workflow = fs.readFileSync(path.join(appRoot, "workflow-plugin", "main.js"), "utf8");
  const core = fs.readFileSync(path.join(appRoot, "app", "createClacklyCore.js"), "utf8");
  for (const pattern of [
    /new RuntimeManager/,
    /resolveRuntimeRoot/,
    /new AfterEffectsLauncher/,
    /hostEnvironment: process\.env/,
    /runtime-probe\.json/
  ]) {
    assert.match(core, pattern);
  }
  assert.match(standalone, /getResolveVersion/);
  assert.match(workflow, /GetVersionString/);
  assert.doesNotMatch(standalone, /new RuntimeManager/);
  assert.doesNotMatch(workflow, /new RuntimeManager/);
});
