const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const { resolveRuntimeRoot } = require("./runtime/paths");

test("Resolve Workflow Integration finds the packaged sibling Runtime", (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "clackly-runtime-path-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const appRoot = path.join(root, "resources", "app");
  const runtimeRoot = path.join(root, "resources", "runtimes");
  fs.mkdirSync(appRoot, { recursive: true });
  fs.mkdirSync(runtimeRoot, { recursive: true });
  fs.writeFileSync(path.join(runtimeRoot, "manifest.json"), "{}");
  const resolveResources = path.join(root, "Resolve", "resources");
  fs.mkdirSync(path.join(resolveResources, "runtimes"), { recursive: true });
  fs.writeFileSync(path.join(resolveResources, "runtimes", "manifest.json"), "{}");

  assert.equal(resolveRuntimeRoot({
    appRoot,
    isPackaged: true,
    resourcesPath: resolveResources
  }), runtimeRoot);
});

test("development keeps using the source Runtime Manifest", (t) => {
  const appRoot = fs.mkdtempSync(path.join(os.tmpdir(), "clackly-runtime-source-"));
  t.after(() => fs.rmSync(appRoot, { recursive: true, force: true }));
  const runtimeRoot = path.join(appRoot, "resources", "runtimes");
  fs.mkdirSync(runtimeRoot, { recursive: true });
  fs.writeFileSync(path.join(runtimeRoot, "manifest.json"), "{}");

  assert.equal(resolveRuntimeRoot({ appRoot }), runtimeRoot);
});
