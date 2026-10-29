const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { RuntimeLauncher } = require("../script-runtime/runtime/launcher");
const { resolveRuntimeRoot } = require("../script-runtime/runtime/paths");
const { listTree } = require("./package-internal-beta");

// The fixed entrypoints and their adjacent module closure. Test/diagnostic tools
// are deliberately outside the installed executor and source-staleness set.
const PRODUCTION_INSTALLER_FILES = [
  "scripts/install-workflow-plugin.ps1",
  ...["bootstrap.ps1", "executor.ps1", "launch.ps1", "recover.ps1",
    "WorkflowTransaction.psm1", "ExecutorSupport.psm1", "LocalNative.psm1"]
    .map((name) => `scripts/workflow-update/${name}`)
];

function assertProductPayload(files) {
  for (const file of files) {
    const name = file.toLowerCase();
    const base = name.split("/").at(-1);
    const nonproduct = name.startsWith("resolve/feasibility/")
      || name.split("/").some((part) => ["test", "tests", "__tests__", "fixtures", "__fixtures__",
      "snapshots", "output", "outputs", "test-output", "test-outputs", "diagnostics", "evidence", "private", "sdk", "__pycache__"].includes(part))
      || name.split("/").some((part) => part.startsWith("."))
      || /[.](?:test|spec|integration)[.]/.test(base) || /^test_.*[.]py$/.test(base)
      || /^(?:fixtures|.*-fixture)[.]js$/.test(base)
      || /[.](?:otio|aep|jsx|log|dmp|pyc|pyo|node)$/.test(base);
    const product = ["package.json", "manifest.xml", "clackly-release.json",
      "workflow-plugin/main.js", "scripts/resolve2ae_export.py", ...PRODUCTION_INSTALLER_FILES].includes(file)
      || ["node_modules/", "resources/runtimes/", "dist/renderer/"].some((prefix) => file.startsWith(prefix))
      || (["app", "bridge", "capability", "command-engine", "command-search", "command-usage", "config", "execution-adapter",
        "feature-status", "feature-ui", "interaction", "localization", "preferences", "resolve", "resolve2ae_core", "script-runtime", "shortcut"]
        .includes(file.split("/")[0]) || file.startsWith("electron/main/") || file.startsWith("electron/shared/"))
        && /[.](?:js|mjs|json|py)$/.test(file);
    if (nonproduct || !product) throw new Error(`Nonproduct release payload: ${file}`);
  }
}

function sha256(filePath) {
  return crypto.createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
}

function inventory(directory, root = directory, result = []) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const candidate = path.join(directory, entry.name);
    if (entry.isDirectory()) inventory(candidate, root, result);
    else result.push(path.relative(root, candidate).replaceAll(path.sep, "/"));
  }
  return result.sort();
}

function productionPythonSourceInventory(appRoot) {
  const sourceFiles = [
    ["script-runtime/runtime/bootstrap.py", "clackly/bootstrap.py"],
    ["script-runtime/runtime/persistent_bootstrap.py", "clackly/persistent_bootstrap.py"],
    ["script-runtime/python_runner.py", "clackly/python_runner.py"]
  ];
  for (const directory of ["resolve", "scripts", "resolve2ae_core"]) {
    const sourceDirectory = path.join(appRoot, directory);
    for (const entry of fs.readdirSync(sourceDirectory, { withFileTypes: true })
      .filter((item) => item.isFile() && item.name.endsWith(".py")
        && !item.name.startsWith("test_") && item.name !== "ordinary_scripts.py")
      .sort((left, right) => left.name.localeCompare(right.name))) {
      sourceFiles.push([
        path.join(directory, entry.name),
        path.posix.join("clackly", directory, entry.name)
      ]);
    }
  }
  return sourceFiles
    .map(([sourceRelative, stagedRelative]) => ({
      path: stagedRelative,
      sha256: sha256(path.join(appRoot, ...sourceRelative.split("/")))
    }))
    .sort((left, right) => left.path.localeCompare(right.path));
}

function assertApplicationSourceIdentity({ appRoot, stagedProfileRoot, packagedProfileRoot, metadata }) {
  const currentSources = productionPythonSourceInventory(appRoot);
  assert.ok(metadata.build && Array.isArray(metadata.build.applicationSources),
    "Runtime metadata is missing the managed application source inventory");
  assert.deepEqual(metadata.build.applicationSources, currentSources,
    "Staged runtime source inventory differs from the current repository source");

  for (const source of currentSources) {
    const relativePath = source.path.split("/");
    assert.equal(sha256(path.join(stagedProfileRoot, ...relativePath)), source.sha256,
      `Staged application source file differs from current source: ${source.path}`);
    assert.equal(sha256(path.join(packagedProfileRoot, ...relativePath)), source.sha256,
      `Packaged application source file differs from current source: ${source.path}`);
  }
}

function findPython(directory, found = []) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const candidate = path.join(directory, entry.name);
    if (entry.isDirectory()) findPython(candidate, found);
    else if (entry.name.toLowerCase() === "python.exe") found.push(candidate);
  }
  return found;
}

function loadLockedProfiles(runtimeRoot) {
  const manifest = JSON.parse(fs.readFileSync(path.join(runtimeRoot, "manifest.json"), "utf8"));
  const locks = fs.readdirSync(runtimeRoot)
    .filter((name) => name.endsWith(".lock.json"))
    .map((name) => ({ name, ...JSON.parse(fs.readFileSync(path.join(runtimeRoot, name), "utf8")) }));
  assert.equal(manifest.profiles.length, locks.length,
    "Every packaged Runtime profile must have one lock file");
  return manifest.profiles.map((profile) => {
    const lock = locks.find(({ profileId }) => profileId === profile.id);
    assert(lock, `Packaged Runtime Manifest has no lock for ${profile.id}`);
    assert.equal(profile.runtimeVersion, lock.version);
    assert.equal(profile.releaseStatus, lock.releaseStatus);
    return { profile, lock };
  }).sort((left, right) => left.profile.id.localeCompare(right.profile.id));
}

function pythonStem(version) {
  return `python${version.split(".").slice(0, 2).join("")}`;
}

async function verifyPackage({
  appRoot = path.resolve(__dirname, ".."),
  packageRoot = path.resolve(process.argv[2] || path.join(path.resolve(__dirname, ".."), "release", "win-unpacked"))
} = {}) {
  assertProductPayload(listTree(path.join(packageRoot, "resources", "app")).map((item) => item.relativePath));
  assertProductPayload(listTree(path.join(packageRoot, "resources", "runtimes"))
    .map((item) => `resources/runtimes/${item.relativePath}`));
  const runtimeRoot = path.join(packageRoot, "resources", "runtimes");
  const profiles = loadLockedProfiles(runtimeRoot);
  const stagedRoot = path.join(appRoot, "build", "runtime-staging", "runtimes");
  const stagedFiles = inventory(stagedRoot);
  assert.deepEqual(inventory(runtimeRoot), stagedFiles, "Packaged Runtime inventory differs from staging");
  for (const relative of stagedFiles) {
    const filePath = relative.split("/");
    assert.equal(sha256(path.join(runtimeRoot, ...filePath)), sha256(path.join(stagedRoot, ...filePath)),
      `Packaged Runtime file changed: ${relative}`);
  }

  for (const { profile, lock } of profiles) {
    const executable = path.join(runtimeRoot, ...profile.executable.split("/"));
    const profileRoot = path.dirname(executable);
    const stagedProfileRoot = path.dirname(path.join(stagedRoot, ...profile.executable.split("/")));
    const metadata = JSON.parse(fs.readFileSync(path.join(profileRoot, "runtime.json"), "utf8"));
    assert.equal(metadata.profileId, profile.id);
    assert.equal(metadata.runtimeVersion, lock.version);
    assert.equal(metadata.releaseStatus, lock.releaseStatus);
    assert.equal(metadata.source.sha256, lock.asset.sha256);
    const sourceLock = fs.readFileSync(path.join(appRoot, "resources", "runtimes", lock.name));
    assert.equal(metadata.build.lockSha256, crypto.createHash("sha256").update(sourceLock).digest("hex"));

    const stem = pythonStem(lock.version);
    for (const file of [
      "python.exe", `${stem}.dll`, `${stem}.zip`, `${stem}._pth`, "runtime.json",
      "LICENSE.txt", "THIRD_PARTY_NOTICES.md", "python-embed.sigstore",
      "python-embed.spdx.json", "application.spdx.json", "clackly/bootstrap.py",
      "clackly/persistent_bootstrap.py", "clackly/python_runner.py",
      "clackly/scripts/resolve2ae_export.py"
    ]) {
      assert(fs.statSync(path.join(profileRoot, ...file.split("/"))).isFile(), `Missing packaged file: ${file}`);
    }
    assert.deepEqual(
      fs.readFileSync(path.join(profileRoot, `${stem}._pth`), "utf8").trim().split(/\r?\n/),
      [`${stem}.zip`, ".", "clackly"]
    );
    JSON.parse(fs.readFileSync(path.join(profileRoot, "python-embed.spdx.json"), "utf8"));
    JSON.parse(fs.readFileSync(path.join(profileRoot, "application.spdx.json"), "utf8"));
    assertApplicationSourceIdentity({ appRoot, stagedProfileRoot, packagedProfileRoot: profileRoot, metadata });

    const launcher = new RuntimeLauncher({
      bootstrapPath: path.join(profileRoot, "clackly", "bootstrap.py"),
      parentEnvironment: {
        ...process.env,
        PATH: "C:\\hostile-python-3.11",
        CONDA_PREFIX: "C:\\hostile-conda",
        VIRTUAL_ENV: "C:\\hostile-venv",
        PYTHONHOME: "C:\\hostile-python-home"
      }
    });
    const { response } = await launcher.execute({
      resolution: {
        source: "manifest",
        supportStatus: "machine-verified",
        executable,
        profile
      },
      request: { operation: "runtime-info" }
    });
    assert.equal(response.runtime.version, lock.version);
    assert.equal(response.runtime.architecture, "64bit");
    assert.equal(fs.realpathSync(response.runtime.executable), fs.realpathSync(executable));
    console.log(`Verified packaged CPython ${lock.version} x64 at ${executable}`);
  }

  assert.deepEqual(
    findPython(packageRoot).map((item) => fs.realpathSync(item)).sort(),
    profiles.map(({ profile }) => fs.realpathSync(path.join(runtimeRoot, ...profile.executable.split("/")))).sort()
  );
  assert.equal(fs.existsSync(path.join(packageRoot, "resources", "app.asar")), false);
  assert(fs.statSync(path.join(packageRoot, "resources", "app", "manifest.xml")).isFile());
  assert.equal(inventory(packageRoot).some((name) => /(?:^|\/)WorkflowIntegration\.node(?:\/|$)/i.test(name)), false,
    "Packaged application must exclude the locally provisioned WorkflowIntegration.node");
  assert.equal(resolveRuntimeRoot({
    appRoot: path.join(packageRoot, "resources", "app")
  }), runtimeRoot, "Resolve-owned Electron must find the packaged sibling Runtime");
}

if (require.main === module) {
  verifyPackage().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}

module.exports = { assertApplicationSourceIdentity, productionPythonSourceInventory, verifyPackage,
  assertProductPayload, PRODUCTION_INSTALLER_FILES };
