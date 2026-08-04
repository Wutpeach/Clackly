const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const test = require("node:test");

const scriptPath = path.join(__dirname, "install-workflow-plugin.ps1");

function createPackage(root) {
  const appRoot = path.join(root, "package", "resources", "app");
  const runtimeRoot = path.join(root, "package", "resources", "runtimes");
  for (const file of [
    "manifest.xml",
    "package.json",
    "workflow-plugin/main.js",
    "workflow-plugin/WorkflowIntegration.node"
  ]) {
    const target = path.join(appRoot, ...file.split("/"));
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, file);
  }
  fs.mkdirSync(runtimeRoot, { recursive: true });
  fs.writeFileSync(path.join(runtimeRoot, "manifest.json"), "{}");
  return path.join(root, "package");
}

function install(mode, packageRoot, pluginRoot) {
  return spawnSync("powershell", [
    "-NoProfile", "-ExecutionPolicy", "Bypass", "-File", scriptPath,
    "-Mode", mode, "-PackageRoot", packageRoot, "-PluginRoot", pluginRoot
  ], { encoding: "utf8" });
}

test("packaged Workflow Integration install targets the packaged app tree", (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "clackly-workflow-install-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const packageRoot = createPackage(root);
  const pluginRoot = path.join(root, "plugins");

  const result = install("Junction", packageRoot, pluginRoot);

  assert.equal(result.status, 0, result.stderr);
  assert.equal(
    fs.readFileSync(path.join(pluginRoot, "com.wutpeach.clackly", "manifest.xml"), "utf8"),
    "manifest.xml"
  );
});

test("packaged copy install carries the external Runtime into the plugin", (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "clackly-workflow-copy-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const packageRoot = createPackage(root);
  const pluginRoot = path.join(root, "plugins");

  const result = install("Copy", packageRoot, pluginRoot);

  assert.equal(result.status, 0, result.stderr);
  assert.equal(fs.existsSync(path.join(
    pluginRoot, "com.wutpeach.clackly", "resources", "runtimes", "manifest.json"
  )), true);
});
