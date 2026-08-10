const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const {
  PNG_SIGNATURE,
  createImageClipboardCapability,
  getImageClipboardDefaults,
  isWithinRoot,
  sanitizePathSegment
} = require("./imageClipboard");

const PNG = Buffer.concat([PNG_SIGNATURE, Buffer.from("test-image")]);
const FIXED_DATE = new Date(2026, 7, 10, 11, 43, 12, 142);

function createFixture(t, overrides = {}) {
  const picturesPath = fs.mkdtempSync(path.join(os.tmpdir(), "clackly-clipboard-"));
  t.after(() => fs.rmSync(picturesPath, { recursive: true, force: true }));
  const imports = [];
  const resolveMediaPool = {
    isAvailable: async () => true,
    getCurrentProjectName: async () => "Demo Project",
    importMediaToBin: async (options) => {
      imports.push(options);
      return { mediaPoolBin: options.binName };
    },
    ...overrides.resolveMediaPool
  };
  const capability = createImageClipboardCapability({
    clipboard: { readPng: async () => PNG },
    resolveMediaPool,
    picturesPath,
    now: () => FIXED_DATE,
    ...overrides.capability
  });
  return { capability, imports, picturesPath, resolveMediaPool };
}

test("Clipboard image is written as PNG and imported with structured success", async (t) => {
  const { capability, imports, picturesPath } = createFixture(t);
  const result = await capability.execute();

  assert.equal(result.projectName, "Demo Project");
  assert.equal(result.mediaPoolBin, "Clipboard");
  assert.equal(
    result.diskPath,
    path.join(
      picturesPath,
      "Clackly Clipboard",
      "Demo Project",
      "Clipboard_2026-08-10_114312_142.png"
    )
  );
  assert.deepEqual(fs.readFileSync(result.diskPath), PNG);
  assert.deepEqual(imports, [{ diskPath: result.diskPath, binName: "Clipboard" }]);
});

test("empty Clipboard returns clipboard-image-not-found without disk or Resolve side effects", async (t) => {
  const { picturesPath, imports, resolveMediaPool } = createFixture(t);
  let projectCalls = 0;
  resolveMediaPool.getCurrentProjectName = async () => {
    projectCalls += 1;
    return "Demo";
  };
  const capability = createImageClipboardCapability({
    clipboard: { readPng: async () => null },
    resolveMediaPool,
    picturesPath
  });

  await assert.rejects(capability.execute(), (error) => error.code === "clipboard-image-not-found");
  assert.equal(projectCalls, 0);
  assert.deepEqual(imports, []);
  assert.equal(fs.existsSync(path.join(picturesPath, "Clackly Clipboard")), false);
});

test("project names are sanitized and traversal cannot escape the save root", async (t) => {
  const { capability, picturesPath } = createFixture(t, {
    resolveMediaPool: { getCurrentProjectName: async () => "../../CON/Bad:*? ." }
  });
  const result = await capability.execute();
  const root = path.join(picturesPath, "Clackly Clipboard");

  assert.equal(isWithinRoot(root, result.diskPath), true);
  assert.equal(path.dirname(result.diskPath), path.join(root, ".._.._CON_Bad___"));
  assert.equal(sanitizePathSegment("CON"), "_CON");
  assert.equal(sanitizePathSegment(".."), "Untitled Project");
  assert.equal(sanitizePathSegment("AUX.txt"), "_AUX.txt");
});

test("rapid executions use exclusive collision-safe filenames", async (t) => {
  const { capability } = createFixture(t);
  const first = await capability.execute();
  const second = await capability.execute();

  assert.notEqual(first.diskPath, second.diskPath);
  assert.match(first.diskPath, /_142\.png$/);
  assert.match(second.diskPath, /_142_1\.png$/);
});

test("disk write failure is structured and never calls Resolve import", async (t) => {
  const { picturesPath, imports, resolveMediaPool } = createFixture(t);
  const failure = Object.assign(new Error("permission denied"), { code: "EACCES" });
  const capability = createImageClipboardCapability({
    clipboard: { readPng: async () => PNG },
    resolveMediaPool,
    picturesPath,
    fileSystem: {
      mkdir: async () => {},
      writeFile: async () => { throw failure; }
    }
  });

  await assert.rejects(capability.execute(), (error) => (
    error.code === "clipboard-image-save-failed" && error.details.cause === "permission denied"
  ));
  assert.deepEqual(imports, []);
});

test("Resolve import failure keeps the PNG and exposes diskPath", async (t) => {
  const { capability } = createFixture(t, {
    resolveMediaPool: {
      importMediaToBin: async () => {
        throw Object.assign(new Error("import refused"), {
          code: "media-pool-import-failed",
          details: {}
        });
      }
    }
  });

  await assert.rejects(capability.execute(), (error) => {
    assert.equal(error.code, "media-pool-import-failed");
    assert.equal(fs.existsSync(error.details.diskPath), true);
    return true;
  });
});

test("missing current project preserves the runtime error and creates no PNG", async (t) => {
  const { picturesPath, resolveMediaPool } = createFixture(t, {
    resolveMediaPool: {
      getCurrentProjectName: async () => {
        throw Object.assign(new Error("No current Resolve project"), {
          code: "resolve-project-unavailable",
          details: {}
        });
      }
    }
  });
  const capability = createImageClipboardCapability({
    clipboard: { readPng: async () => PNG },
    resolveMediaPool,
    picturesPath
  });

  await assert.rejects(capability.execute(), (error) => error.code === "resolve-project-unavailable");
  assert.equal(fs.existsSync(path.join(picturesPath, "Clackly Clipboard")), false);
});

test("defaults and metadata expose one extensible feature configuration source", () => {
  const defaults = getImageClipboardDefaults("C:\\Users\\Mabel\\Pictures");
  assert.equal(defaults.binName, "Clipboard");
  assert.equal(defaults.organizeByProject, true);
  assert.match(defaults.saveRoot, /Clackly Clipboard$/);
});
