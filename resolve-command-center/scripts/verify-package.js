const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { RuntimeLauncher } = require("../script-runtime/runtime/launcher");
const { resolveRuntimeRoot } = require("../script-runtime/runtime/paths");

const appRoot = path.resolve(__dirname, "..");
const packageRoot = path.resolve(process.argv[2] || path.join(appRoot, "release", "win-unpacked"));
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

function findPython(directory, found = []) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const candidate = path.join(directory, entry.name);
    if (entry.isDirectory()) findPython(candidate, found);
    else if (entry.name.toLowerCase() === "python.exe") found.push(candidate);
  }
  return found;
}

function inventory(directory, root = directory, result = []) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const candidate = path.join(directory, entry.name);
    if (entry.isDirectory()) inventory(candidate, root, result);
    else result.push(path.relative(root, candidate).replaceAll(path.sep, "/"));
  }
  return result.sort();
}
const stagedRoot = path.join(appRoot, "build", "runtime-staging", "runtimes");
const stagedFiles = inventory(stagedRoot);
assert.deepEqual(inventory(runtimeRoot), stagedFiles, "Packaged Runtime inventory differs from staging");
for (const relative of stagedFiles) {
  const hash = (root) => crypto.createHash("sha256").update(fs.readFileSync(path.join(root, ...relative.split("/")))).digest("hex");
  assert.equal(hash(runtimeRoot), hash(stagedRoot), `Packaged Runtime file changed: ${relative}`);
}
assert.deepEqual(findPython(packageRoot).map((item) => fs.realpathSync(item)), [fs.realpathSync(executable)]);
assert.equal(fs.existsSync(path.join(packageRoot, "resources", "app.asar")), false);
assert(fs.statSync(path.join(packageRoot, "resources", "app", "manifest.xml")).isFile());
assert(fs.statSync(path.join(packageRoot, "resources", "app", "workflow-plugin", "WorkflowIntegration.node")).isFile());
assert.equal(resolveRuntimeRoot({
  appRoot: path.join(packageRoot, "resources", "app")
}), runtimeRoot, "Resolve-owned Electron must find the packaged sibling Runtime");

(async () => {
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
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
