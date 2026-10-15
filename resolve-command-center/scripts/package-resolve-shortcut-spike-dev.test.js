const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const { DEVELOPMENT_MARKER } = require("../electron/main/experimentalResolveShortcut");
const { stageDevelopmentPayload } = require("./package-resolve-shortcut-spike-dev");

test("development staging copies the verified payload and marks only the staged app", (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "clackly-shortcut-stage-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const source = path.join(root, "source");
  const stage = path.join(root, "stage");
  fs.mkdirSync(path.join(source, "resources", "app"), { recursive: true });
  fs.mkdirSync(path.join(source, "resources", "runtimes"), { recursive: true });
  fs.writeFileSync(path.join(source, "resources", "app", "manifest.xml"), "payload");
  fs.writeFileSync(path.join(source, "resources", "runtimes", "manifest.json"), "runtime");

  const marker = stageDevelopmentPayload({ sourceRoot: source, stageRoot: stage });

  assert.equal(fs.readFileSync(path.join(stage, "resources", "app", "manifest.xml"), "utf8"), "payload");
  assert.equal(fs.readFileSync(marker, "utf8"), "Resolve bound-shortcut development spike\n");
  assert.equal(fs.existsSync(path.join(source, "resources", "app", DEVELOPMENT_MARKER)), false);
});
