const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const { initializeAfterEffectsPath } = require("./afterEffectsPath");

function withTempDir(callback) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "clackly-ae-path-"));
  try {
    return callback(directory);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
}

function createFile(filePath) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, "AfterFX");
  return filePath;
}

function createConfig(initial = {}) {
  let values = structuredClone(initial);
  const mutations = [];
  return {
    manager: {
      get: (id) => {
        assert.equal(id, "ae.export");
        return structuredClone(values);
      },
      update: (id, patch) => {
        assert.equal(id, "ae.export");
        mutations.push(["update", structuredClone(patch)]);
        values = { ...values, ...patch };
        return structuredClone(values);
      },
      save: (id, next) => {
        assert.equal(id, "ae.export");
        mutations.push(["save", structuredClone(next)]);
        values = structuredClone(next);
        return structuredClone(values);
      }
    },
    getMutations: () => structuredClone(mutations),
    getValues: () => structuredClone(values)
  };
}

test("a valid saved path short-circuits discovery and configuration writes", () => (
  withTempDir((directory) => {
    const saved = createFile(path.join(directory, "manual", "AfterFX.exe"));
    const config = createConfig({ aePath: saved, prefix: "Manual" });

    assert.equal(initializeAfterEffectsPath(config.manager, {
      platform: "win32",
      execFileSync: () => assert.fail("discovery must not run")
    }), saved);
    assert.deepEqual(config.getMutations(), []);
  })
));

test("a running After Effects process wins over registry and standard installs", () => (
  withTempDir((directory) => {
    const running = createFile(path.join(directory, "running-路径", "AfterFX.exe"));
    createFile(path.join(directory, "Adobe", "Adobe After Effects 2099", "Support Files", "AfterFX.exe"));
    const config = createConfig();

    assert.equal(initializeAfterEffectsPath(config.manager, {
      environment: { ProgramFiles: directory },
      platform: "win32",
      execFileSync: (executable, args) => {
        assert.equal(executable, "powershell.exe");
        assert.match(args.at(-1), /OutputEncoding=.*UTF8Encoding/);
        return `\n${running}\n`;
      }
    }), running);
    assert.deepEqual(config.getMutations(), [["update", { aePath: running }]]);
  })
));

test("process failure falls back through App Paths hives", () => (
  withTempDir((directory) => {
    const registeredRoot = path.join(directory, "registered-路径");
    const registered = createFile(path.join(registeredRoot, "AfterFX.exe"));
    createFile(path.join(directory, "Adobe", "Adobe After Effects 2099", "Support Files", "AfterFX.exe"));
    const calls = [];
    const config = createConfig();

    assert.equal(initializeAfterEffectsPath(config.manager, {
      environment: { ae_test_root: registeredRoot, ProgramFiles: directory },
      platform: "win32",
      execFileSync: (executable, args) => {
        calls.push([executable, ...args]);
        const command = args.at(-1);
        if (command.includes("Get-Process")) throw new Error("not running");
        if (command.includes("HKEY_CURRENT_USER")) throw new Error("missing key");
        assert.match(command, /HKEY_LOCAL_MACHINE/);
        assert.match(command, /OutputEncoding=.*UTF8Encoding/);
        return `"%AE_TEST_ROOT%${path.sep}AfterFX.exe"\r\n`;
      }
    }), registered);
    assert.deepEqual(calls.map(([executable]) => executable), [
      "powershell.exe",
      "powershell.exe",
      "powershell.exe"
    ]);
  })
));

test("standard discovery chooses the highest numeric After Effects version", () => (
  withTempDir((directory) => {
    const older = createFile(path.join(
      directory,
      "Adobe",
      "Adobe After Effects 2025.2",
      "Support Files",
      "AfterFX.exe"
    ));
    const newest = createFile(path.join(
      directory,
      "Adobe",
      "Adobe After Effects 2025.10",
      "Support Files",
      "AfterFX.exe"
    ));
    const config = createConfig();

    assert.notEqual(older, newest);
    assert.equal(initializeAfterEffectsPath(config.manager, {
      environment: { ProgramW6432: directory },
      platform: "win32",
      execFileSync: () => { throw new Error("strategy miss"); }
    }), newest);
  })
));

test("a stale saved path is replaced while sibling settings are preserved", () => (
  withTempDir((directory) => {
    const replacement = createFile(path.join(directory, "AfterFX.exe"));
    const config = createConfig({ aePath: path.join(directory, "missing.exe"), prefix: "Keep" });

    initializeAfterEffectsPath(config.manager, {
      platform: "win32",
      execFileSync: (executable) => {
        if (executable === "powershell.exe") return replacement;
        throw new Error("unexpected registry query");
      }
    });

    assert.deepEqual(config.getValues(), { aePath: replacement, prefix: "Keep" });
    assert.deepEqual(config.getMutations(), [["update", { aePath: replacement }]]);
  })
));

test("a stale path with no replacement is removed without clearing sibling settings", () => {
  const config = createConfig({ aePath: "Z:/missing/AfterFX.exe", prefix: "Keep" });

  assert.equal(initializeAfterEffectsPath(config.manager, {
    environment: {},
    platform: "win32",
    execFileSync: () => { throw new Error("strategy miss"); }
  }), null);
  assert.deepEqual(config.getValues(), { prefix: "Keep" });
  assert.deepEqual(config.getMutations(), [["save", { prefix: "Keep" }]]);
});

test("no discovery result is a no-op when no path was configured", () => {
  const config = createConfig({ prefix: "Keep" });

  initializeAfterEffectsPath(config.manager, {
    environment: {},
    platform: "win32",
    execFileSync: () => { throw new Error("strategy miss"); }
  });
  assert.deepEqual(config.getMutations(), []);
});

test("non-Windows startup does not discover or mutate a stale path", () => {
  const config = createConfig({ aePath: "/missing/AfterFX", prefix: "Keep" });

  assert.equal(initializeAfterEffectsPath(config.manager, {
    platform: "darwin",
    execFileSync: () => assert.fail("discovery must not run")
  }), null);
  assert.deepEqual(config.getMutations(), []);
});

test("configuration write failures remain visible", () => (
  withTempDir((directory) => {
    const discovered = createFile(path.join(directory, "AfterFX.exe"));
    const configManager = {
      get: () => ({}),
      update: () => { throw new Error("configuration write failed"); }
    };

    assert.throws(() => initializeAfterEffectsPath(configManager, {
      platform: "win32",
      execFileSync: () => discovered
    }), /configuration write failed/);
  })
));

test("both hosts initialize the path before exposing palette and IPC", () => {
  const standalone = fs.readFileSync(path.join(__dirname, "../electron/main/main.js"), "utf8");
  const workflow = fs.readFileSync(path.join(__dirname, "../workflow-plugin/main.js"), "utf8");
  const assertOrder = (source, after = "app.whenReady()") => {
    const ready = source.indexOf(after);
    const initialize = source.indexOf("initializeAfterEffectsPath(configManager);", ready);
    assert.ok(ready >= 0 && initialize > ready);
    assert.ok(initialize < source.indexOf("paletteWindow = createPaletteWindow();", ready));
    assert.ok(initialize < source.indexOf("registerIpcHandlers();", ready));
  };

  assertOrder(standalone);
  assertOrder(workflow, "await initializeWorkflowIntegration();");
});
