const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const { initializeAfterEffectsPath } = require("./afterEffectsPath");

async function withTempDir(callback) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "clackly-ae-path-"));
  try {
    return await callback(directory);
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

function strategyMiss(executable, args, options, callback) {
  callback(Object.assign(new Error("strategy miss"), { code: 1 }));
}

function deferredProbe(result) {
  let release;
  const gate = new Promise((resolve) => {
    release = resolve;
  });
  return {
    execFile: (executable, args, options, callback) => {
      gate.then(() => callback(null, result));
    },
    release: () => release()
  };
}

test("a valid saved path short-circuits discovery and configuration writes", () => (
  withTempDir((directory) => {
    const saved = createFile(path.join(directory, "manual", "AfterFX.exe"));
    const config = createConfig({ aePath: saved, prefix: "Manual" });
    const calls = [];

    return initializeAfterEffectsPath(config.manager, {
      platform: "win32",
      execFile: (...args) => {
        calls.push(args);
        return Promise.resolve("");
      }
    }).then((result) => {
      assert.equal(result, saved);
      assert.deepEqual(calls, []);
      assert.deepEqual(config.getMutations(), []);
    });
  })
));

test("a running After Effects process wins over registry and standard installs", () => (
  withTempDir((directory) => {
    const running = createFile(path.join(directory, "running-路径", "AfterFX.exe"));
    createFile(path.join(directory, "Adobe", "Adobe After Effects 2099", "Support Files", "AfterFX.exe"));
    const config = createConfig();

    return initializeAfterEffectsPath(config.manager, {
      environment: { ProgramFiles: directory },
      platform: "win32",
      execFile: (executable, args, options, callback) => {
        assert.equal(executable, "powershell.exe");
        assert.equal(options.timeout, 5000);
        assert.equal(options.shell, false);
        assert.equal(options.windowsHide, true);
        assert.equal(options.encoding, "utf8");
        assert.match(args.at(-1), /OutputEncoding=.*UTF8Encoding/);
        callback(null, `\n${running}\n`);
      }
    }).then((result) => {
      assert.equal(result, running);
      assert.deepEqual(config.getMutations(), [["update", { aePath: running }]]);
    });
  })
));

test("process failure falls back through App Paths hives", () => (
  withTempDir((directory) => {
    const registeredRoot = path.join(directory, "registered-路径");
    const registered = createFile(path.join(registeredRoot, "AfterFX.exe"));
    createFile(path.join(directory, "Adobe", "Adobe After Effects 2099", "Support Files", "AfterFX.exe"));
    const calls = [];
    const config = createConfig();

    return initializeAfterEffectsPath(config.manager, {
      environment: { ae_test_root: registeredRoot, ProgramFiles: directory },
      platform: "win32",
      execFile: (executable, args, options, callback) => {
        calls.push([executable, ...args]);
        const command = args.at(-1);
        if (command.includes("Get-Process")) return callback(Object.assign(new Error("not running"), { code: 1 }));
        if (command.includes("HKEY_CURRENT_USER")) return callback(Object.assign(new Error("missing key"), { code: 1 }));
        assert.match(command, /HKEY_LOCAL_MACHINE/);
        assert.match(command, /OutputEncoding=.*UTF8Encoding/);
        assert.equal(options.timeout, 5000);
        callback(null, `"%AE_TEST_ROOT%${path.sep}AfterFX.exe"\r\n`);
      }
    }).then((result) => {
      assert.equal(result, registered);
      assert.deepEqual(calls.map(([executable]) => executable), [
        "powershell.exe",
        "powershell.exe",
        "powershell.exe"
      ]);
    });
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
    return initializeAfterEffectsPath(config.manager, {
      environment: { ProgramW6432: directory },
      platform: "win32",
      execFile: strategyMiss
    }).then((result) => {
      assert.equal(result, newest);
    });
  })
));

test("a stale saved path is replaced while sibling settings are preserved", () => (
  withTempDir((directory) => {
    const replacement = createFile(path.join(directory, "AfterFX.exe"));
    const config = createConfig({ aePath: path.join(directory, "missing.exe"), prefix: "Keep" });

    return initializeAfterEffectsPath(config.manager, {
      platform: "win32",
      execFile: (executable, args, options, callback) => {
        if (executable === "powershell.exe") return callback(null, replacement);
        throw new Error("unexpected registry query");
      }
    }).then(() => {
      assert.deepEqual(config.getValues(), { aePath: replacement, prefix: "Keep" });
      assert.deepEqual(config.getMutations(), [["update", { aePath: replacement }]]);
    });
  })
));

test("a stale path with no replacement is removed without clearing sibling settings", () => {
  const config = createConfig({ aePath: "Z:/missing/AfterFX.exe", prefix: "Keep" });

  return initializeAfterEffectsPath(config.manager, {
    environment: {},
    platform: "win32",
    execFile: strategyMiss
  }).then((result) => {
    assert.equal(result, null);
    assert.deepEqual(config.getValues(), { prefix: "Keep" });
    assert.deepEqual(config.getMutations(), [["save", { prefix: "Keep" }]]);
  });
});

test("no discovery result is a no-op when no path was configured", () => {
  const config = createConfig({ prefix: "Keep" });

  return initializeAfterEffectsPath(config.manager, {
    environment: {},
    platform: "win32",
    execFile: strategyMiss
  }).then((result) => {
    assert.equal(result, null);
    assert.deepEqual(config.getMutations(), []);
  });
});

test("non-Windows startup does not discover or mutate a stale path", () => {
  const config = createConfig({ aePath: "/missing/AfterFX", prefix: "Keep" });

  return initializeAfterEffectsPath(config.manager, {
    platform: "darwin",
    execFile: () => assert.fail("discovery must not run")
  }).then((result) => {
    assert.equal(result, null);
    assert.deepEqual(config.getMutations(), []);
  });
});

test("configuration write failures remain visible", () => (
  withTempDir((directory) => {
    const discovered = createFile(path.join(directory, "AfterFX.exe"));
    const configManager = {
      get: () => ({}),
      update: () => {
        throw new Error("configuration write failed");
      }
    };

    return assert.rejects(
      initializeAfterEffectsPath(configManager, {
        platform: "win32",
        execFile: (executable, args, options, callback) => callback(null, discovered)
      }),
      /configuration write failed/
    );
  })
));

test("a deferred valid manual save wins over a discovered path", () => (
  withTempDir((directory) => {
    const discovered = createFile(path.join(directory, "discovered", "AfterFX.exe"));
    const manual = createFile(path.join(directory, "manual", "AfterFX.exe"));
    const probe = deferredProbe(discovered);
    const config = createConfig({ prefix: "Keep" });

    const initialization = initializeAfterEffectsPath(config.manager, {
      platform: "win32",
      execFile: probe.execFile
    });
    config.manager.update("ae.export", { aePath: manual, prefix: "Keep" });
    probe.release();

    return initialization.then((result) => {
      assert.equal(result, manual);
      assert.deepEqual(config.getValues(), { aePath: manual, prefix: "Keep" });
      assert.deepEqual(config.getMutations(), [["update", { aePath: manual, prefix: "Keep" }]]);
    });
  })
));

test("a deferred reset that keeps the field absent still writes auto-discovery", () => (
  withTempDir((directory) => {
    const discovered = createFile(path.join(directory, "discovered", "AfterFX.exe"));
    const probe = deferredProbe(discovered);
    const config = createConfig({ prefix: "Keep" });

    const initialization = initializeAfterEffectsPath(config.manager, {
      platform: "win32",
      execFile: probe.execFile
    });
    config.manager.save("ae.export", { prefix: "Keep" });
    probe.release();

    return initialization.then((result) => {
      assert.equal(result, discovered);
      assert.deepEqual(config.getValues(), { aePath: discovered, prefix: "Keep" });
      assert.deepEqual(config.getMutations(), [
        ["save", { prefix: "Keep" }],
        ["update", { aePath: discovered }]
      ]);
    });
  })
));

test("a deferred reset that removed an initially stale path stays reset", () => (
  withTempDir((directory) => {
    const discovered = createFile(path.join(directory, "discovered", "AfterFX.exe"));
    const probe = deferredProbe(discovered);
    const config = createConfig({ aePath: "Z:/missing/AfterFX.exe", prefix: "Keep" });

    const initialization = initializeAfterEffectsPath(config.manager, {
      platform: "win32",
      execFile: probe.execFile
    });
    config.manager.save("ae.export", { prefix: "Keep" });
    probe.release();

    return initialization.then((result) => {
      assert.equal(result, null);
      assert.deepEqual(config.getValues(), { prefix: "Keep" });
      assert.deepEqual(config.getMutations(), [["save", { prefix: "Keep" }]]);
    });
  })
));

test("a deferred valid manual replacement of a stale path is preserved", () => (
  withTempDir((directory) => {
    const discovered = createFile(path.join(directory, "discovered", "AfterFX.exe"));
    const manual = createFile(path.join(directory, "manual", "AfterFX.exe"));
    const probe = deferredProbe(discovered);
    const config = createConfig({ aePath: "Z:/missing/AfterFX.exe", prefix: "Keep" });

    const initialization = initializeAfterEffectsPath(config.manager, {
      platform: "win32",
      execFile: probe.execFile
    });
    config.manager.update("ae.export", { aePath: manual, prefix: "Keep" });
    probe.release();

    return initialization.then((result) => {
      assert.equal(result, manual);
      assert.deepEqual(config.getValues(), { aePath: manual, prefix: "Keep" });
      assert.deepEqual(config.getMutations(), [["update", { aePath: manual, prefix: "Keep" }]]);
    });
  })
));
