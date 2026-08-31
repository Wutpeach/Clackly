const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { RuntimeLauncher } = require("../script-runtime/runtime/launcher");
const { resolveRuntimeRoot } = require("../script-runtime/runtime/paths");

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
      .filter((item) => item.isFile() && item.name.endsWith(".py") && !item.name.startsWith("test_"))
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

async function verifyPackage({
  appRoot = path.resolve(__dirname, ".."),
  packageRoot = path.resolve(process.argv[2] || path.join(path.resolve(__dirname, ".."), "release", "win-unpacked"))
} = {}) {
  const runtimeRoot = path.join(packageRoot, "resources", "runtimes");
  const lock = JSON.parse(fs.readFileSync(path.join(runtimeRoot, "python-win32-x64.lock.json"), "utf8"));
  const manifest = JSON.parse(fs.readFileSync(path.join(runtimeRoot, "manifest.json"), "utf8"));
  const profile = manifest.profiles.find(({ id }) => id === lock.profileId);
  assert(profile, `Packaged Manifest does not contain ${lock.profileId}`);
  assert.equal(manifest.profiles.length, 1, "Package must contain exactly one Runtime profile");
  assert.equal(profile.runtimeVersion, lock.version);
  assert.equal(profile.releaseStatus, lock.releaseStatus);

  const executable = path.join(runtimeRoot, ...profile.executable.split("/"));
  const profileRoot = path.dirname(executable);
  const metadata = JSON.parse(fs.readFileSync(path.join(profileRoot, "runtime.json"), "utf8"));
  assert.equal(metadata.profileId, profile.id);
  assert.equal(metadata.runtimeVersion, lock.version);
  assert.equal(metadata.releaseStatus, lock.releaseStatus);
  assert.equal(metadata.source.sha256, lock.asset.sha256);
  const sourceLock = fs.readFileSync(path.join(appRoot, "resources", "runtimes", "python-win32-x64.lock.json"));
  assert.equal(metadata.build.lockSha256, crypto.createHash("sha256").update(sourceLock).digest("hex"));

  for (const file of [
    "python.exe", "python313.dll", "python313.zip", "python313._pth", "runtime.json",
    "LICENSE.txt", "THIRD_PARTY_NOTICES.md", "python-embed.sigstore",
    "python-embed.spdx.json", "application.spdx.json", "clackly/bootstrap.py",
    "clackly/persistent_bootstrap.py",
    "clackly/python_runner.py", "clackly/scripts/resolve2ae_export.py"
  ]) {
    assert(fs.statSync(path.join(profileRoot, ...file.split("/"))).isFile(), `Missing packaged file: ${file}`);
  }
  assert.deepEqual(
    fs.readFileSync(path.join(profileRoot, "python313._pth"), "utf8").trim().split(/\r?\n/),
    ["python313.zip", ".", "clackly"]
  );
  JSON.parse(fs.readFileSync(path.join(profileRoot, "python-embed.spdx.json"), "utf8"));
  JSON.parse(fs.readFileSync(path.join(profileRoot, "application.spdx.json"), "utf8"));

  const stagedRoot = path.join(appRoot, "build", "runtime-staging", "runtimes");
  const stagedFiles = inventory(stagedRoot);
  assert.deepEqual(inventory(runtimeRoot), stagedFiles, "Packaged Runtime inventory differs from staging");
  for (const relative of stagedFiles) {
    const filePath = relative.split("/");
    assert.equal(sha256(path.join(runtimeRoot, ...filePath)), sha256(path.join(stagedRoot, ...filePath)),
      `Packaged Runtime file changed: ${relative}`);
  }
  const stagedProfileRoot = path.dirname(path.join(stagedRoot, ...profile.executable.split("/")));
  assertApplicationSourceIdentity({
    appRoot,
    stagedProfileRoot,
    packagedProfileRoot: profileRoot,
    metadata
  });
  assert.deepEqual(findPython(packageRoot).map((item) => fs.realpathSync(item)), [fs.realpathSync(executable)]);
  assert.equal(fs.existsSync(path.join(packageRoot, "resources", "app.asar")), false);
  assert(fs.statSync(path.join(packageRoot, "resources", "app", "manifest.xml")).isFile());
  assert(fs.statSync(path.join(packageRoot, "resources", "app", "workflow-plugin", "WorkflowIntegration.node")).isFile());
  assert.equal(resolveRuntimeRoot({
    appRoot: path.join(packageRoot, "resources", "app")
  }), runtimeRoot, "Resolve-owned Electron must find the packaged sibling Runtime");

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

if (require.main === module) {
  verifyPackage().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}

module.exports = { assertApplicationSourceIdentity, productionPythonSourceInventory, verifyPackage };
