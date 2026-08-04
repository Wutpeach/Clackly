const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const { RuntimeError } = require("./runtime/errors");
const { loadRuntimeRegistry } = require("./runtime/loader");
const { createRuntimeRegistry } = require("./runtime/registry");
const { RuntimeResolver } = require("./runtime/resolver");

function tempRoot(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "clackly-runtime-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  return root;
}

function profile(overrides = {}) {
  const value = {
    id: "python-cpython-3.13.1-resolve-20.3.2-win32-x64",
    runtime: "python",
    implementation: "cpython",
    runtimeVersion: "3.13.1",
    platform: "win32",
    architecture: "x64",
    capabilities: ["ae.export"],
    host: {
      application: "davinci-resolve",
      versionPrefix: "20.3.2",
      ...(overrides.host || {})
    },
    executable: "python/cpython/python.exe",
    verification: "machine-verified",
    releaseStatus: "candidate",
    ...overrides
  };
  if (Object.hasOwn(overrides, "host")) {
    value.host = overrides.host === null
      ? null
      : { application: "davinci-resolve", versionPrefix: "20.3.2", ...overrides.host };
  }
  return value;
}

function request(overrides = {}) {
  const value = {
    runtime: "python",
    platform: "win32",
    architecture: "x64",
    capabilityId: "ae.export",
    host: {
      application: "davinci-resolve",
      version: "20.3.2.9",
      ...(overrides.host || {})
    },
    ...overrides
  };
  if (Object.hasOwn(overrides, "host")) {
    value.host = overrides.host === null
      ? null
      : { application: "davinci-resolve", version: "20.3.2.9", ...overrides.host };
  }
  return value;
}

function writeManifest(root, payload) {
  fs.writeFileSync(path.join(root, "manifest.json"), JSON.stringify(payload));
}

function writeExecutable(root, relativePath = profile().executable) {
  const executable = path.resolve(root, ...relativePath.split("/"));
  fs.mkdirSync(path.dirname(executable), { recursive: true });
  fs.writeFileSync(executable, "runtime");
  return fs.realpathSync(executable);
}

function expectRuntimeError(callback, code, supportStatus = null) {
  let error;
  try {
    callback();
  } catch (caught) {
    error = caught;
  }
  assert.ok(error instanceof RuntimeError, `Expected RuntimeError, received ${error}`);
  assert.equal(error.code, code);
  assert.equal(error.supportStatus, supportStatus);
  return error;
}

test("loader accepts a valid versioned Manifest without requiring its payload", (t) => {
  const runtimeRoot = tempRoot(t);
  writeManifest(runtimeRoot, { schemaVersion: 1, profiles: [profile()] });

  const registry = loadRuntimeRegistry({ runtimeRoot });
  assert.deepEqual(registry.get(profile().id), profile());
  assert.equal(path.isAbsolute(registry.runtimeRoot), true);
});

test("loader rejects missing, unparseable, malformed, and unsupported Manifests", (t) => {
  const runtimeRoot = tempRoot(t);
  expectRuntimeError(
    () => loadRuntimeRegistry({ runtimeRoot }),
    "RUNTIME_MANIFEST_INVALID"
  );

  fs.writeFileSync(path.join(runtimeRoot, "manifest.json"), "{");
  expectRuntimeError(
    () => loadRuntimeRegistry({ runtimeRoot }),
    "RUNTIME_MANIFEST_INVALID"
  );

  for (const payload of [
    null,
    [],
    {},
    { profiles: [profile()] },
    { schemaVersion: 2, profiles: [profile()] },
    { schemaVersion: 1, profiles: [] },
    { schemaVersion: 1, profiles: [null] }
  ]) {
    writeManifest(runtimeRoot, payload);
    expectRuntimeError(
      () => loadRuntimeRegistry({ runtimeRoot }),
      "RUNTIME_MANIFEST_INVALID"
    );
  }
});

test("Registry validates every required profile field and rejects duplicate ids atomically", (t) => {
  const runtimeRoot = tempRoot(t);
  const scalarFields = [
    "id", "runtime", "implementation", "runtimeVersion", "platform",
    "architecture", "executable", "verification", "releaseStatus"
  ];

  for (const field of scalarFields) {
    const invalid = profile();
    delete invalid[field];
    expectRuntimeError(
      () => createRuntimeRegistry({ profiles: [invalid], runtimeRoot }),
      "RUNTIME_MANIFEST_INVALID"
    );
  }
  for (const field of ["application", "versionPrefix"]) {
    const invalid = profile();
    delete invalid.host[field];
    expectRuntimeError(
      () => createRuntimeRegistry({ profiles: [invalid], runtimeRoot }),
      "RUNTIME_MANIFEST_INVALID"
    );
  }
  const missingCapabilities = profile();
  delete missingCapabilities.capabilities;
  expectRuntimeError(
    () => createRuntimeRegistry({ profiles: [missingCapabilities], runtimeRoot }),
    "RUNTIME_MANIFEST_INVALID"
  );
  const missingHost = profile();
  delete missingHost.host;
  expectRuntimeError(
    () => createRuntimeRegistry({ profiles: [missingHost], runtimeRoot }),
    "RUNTIME_MANIFEST_INVALID"
  );
  expectRuntimeError(
    () => createRuntimeRegistry({ profiles: [profile(), profile()], runtimeRoot }),
    "RUNTIME_MANIFEST_INVALID"
  );
});

test("Registry rejects malformed versions, selectors, capabilities, and executable paths", (t) => {
  const runtimeRoot = tempRoot(t);
  const invalidProfiles = [
    profile({ runtimeVersion: "3.13" }),
    profile({ runtimeVersion: "3.013.1" }),
    profile({ platform: "windows" }),
    profile({ architecture: "amd64" }),
    profile({ capabilities: [] }),
    profile({ capabilities: ["ae.export", "ae.export"] }),
    profile({ capabilities: [" "] }),
    profile({ host: { versionPrefix: "20.03.2" } }),
    profile({ executable: "python.exe" }),
    profile({ executable: "C:/Python/python.exe" }),
    profile({ executable: "../python.exe" }),
    profile({ executable: "python\\python.exe" }),
    profile({ verification: "self-reported" }),
    profile({ releaseStatus: "retired" })
  ];
  const sparseCapabilities = profile();
  sparseCapabilities.capabilities = new Array(1);
  invalidProfiles.push(sparseCapabilities);

  for (const invalid of invalidProfiles) {
    expectRuntimeError(
      () => createRuntimeRegistry({ profiles: [invalid], runtimeRoot }),
      "RUNTIME_MANIFEST_INVALID"
    );
  }
});

test("Registry clones inputs and returns sorted defensive records", (t) => {
  const runtimeRoot = tempRoot(t);
  const later = profile({ id: "z-profile" });
  const earlier = profile({ id: "a-profile" });
  const registry = createRuntimeRegistry({ profiles: [later, earlier], runtimeRoot });

  later.capabilities.push("changed");
  const first = registry.get("z-profile");
  first.host.application = "changed";
  const all = registry.getAll();
  all[0].capabilities.push("changed");

  assert.deepEqual(registry.getAll().map(({ id }) => id), ["a-profile", "z-profile"]);
  assert.deepEqual(registry.get("z-profile").capabilities, ["ae.export"]);
  assert.equal(registry.get("z-profile").host.application, "davinci-resolve");
  assert.equal(registry.get("missing"), null);

  const added = registry.register(profile({ id: "m-profile" }));
  added.capabilities.push("changed");
  assert.deepEqual(registry.get("m-profile").capabilities, ["ae.export"]);
  expectRuntimeError(
    () => registry.register(profile({ id: "m-profile" })),
    "RUNTIME_MANIFEST_INVALID"
  );
});

test("Resolver rejects invalid requests and every selector mismatch as unsupported", (t) => {
  const runtimeRoot = tempRoot(t);
  const resolver = new RuntimeResolver({
    registry: createRuntimeRegistry({ profiles: [profile()], runtimeRoot })
  });

  for (const invalid of [
    null,
    {},
    request({ runtime: "" }),
    request({ platform: "" }),
    request({ architecture: "" }),
    request({ capabilityId: "" }),
    request({ host: null }),
    request({ host: { application: "" } }),
    request({ host: { version: "20.03.2" } })
  ]) {
    expectRuntimeError(
      () => resolver.resolve(invalid),
      "RUNTIME_REQUEST_INVALID"
    );
  }

  for (const mismatch of [
    request({ runtime: "node" }),
    request({ platform: "darwin" }),
    request({ architecture: "arm64" }),
    request({ capabilityId: "marker.add" }),
    request({ host: { application: "other-host" } }),
    request({ host: { version: "20.3.20" } })
  ]) {
    expectRuntimeError(
      () => resolver.resolve(mismatch),
      "RUNTIME_UNSUPPORTED",
      "unsupported"
    );
  }
});

test("Resolver matches numeric host prefixes and selects the highest runtime deterministically", (t) => {
  const runtimeRoot = tempRoot(t);
  const executable = writeExecutable(runtimeRoot);
  const profiles = [
    profile({ id: "z-old", runtimeVersion: "3.13.9" }),
    profile({ id: "z-new", runtimeVersion: "3.13.10" }),
    profile({ id: "a-new", runtimeVersion: "3.13.10" })
  ];
  const resolver = new RuntimeResolver({
    registry: createRuntimeRegistry({ profiles, runtimeRoot })
  });

  const resolution = resolver.resolve(request());
  assert.equal(resolution.profile.id, "a-new");
  assert.equal(resolution.executable, executable);
  assert.equal(path.isAbsolute(resolution.executable), true);
  assert.equal(fs.statSync(resolution.executable).isFile(), true);
  assert.equal(resolution.source, "manifest");
  assert.equal(resolution.supportStatus, "machine-verified");

  const exact = resolver.resolve(request({ host: { version: "20.3.2" } }));
  assert.equal(exact.profile.id, "a-new");
});

test("Runtime Override is executable-only, authoritative, and never reads Registry candidates", (t) => {
  const runtimeRoot = tempRoot(t);
  const overrideExecutable = writeExecutable(runtimeRoot, "override/python.exe");
  let registryReads = 0;
  const resolver = new RuntimeResolver({
    runtimeRoot,
    registry: {
      getAll() {
        registryReads += 1;
        throw new Error("Registry must not be read for an Override");
      }
    }
  });

  const resolution = resolver.resolve({ overrideExecutable });
  assert.deepEqual(resolution, {
    source: "override",
    supportStatus: "overridden",
    executable: overrideExecutable,
    profile: null
  });
  assert.equal(registryReads, 0);
  assert.equal(path.isAbsolute(resolution.executable), true);
  assert.equal(fs.statSync(resolution.executable).isFile(), true);

  for (const invalid of [
    "python",
    "relative/python.exe",
    `${overrideExecutable} --version`,
    [overrideExecutable],
    () => {},
    Symbol("python")
  ]) {
    expectRuntimeError(
      () => resolver.resolve({ overrideExecutable: invalid }),
      "RUNTIME_OVERRIDE_INVALID"
    );
  }
  expectRuntimeError(
    () => resolver.resolve({ overrideExecutable: path.join(runtimeRoot, "missing.exe") }),
    "RUNTIME_NOT_FOUND",
    "missing-runtime"
  );
  assert.equal(registryReads, 0);
});

test("Resolver reports missing, non-file, and escaping managed payloads without trying another profile", (t) => {
  const runtimeRoot = tempRoot(t);
  const top = profile({ id: "top", runtimeVersion: "3.13.10" });
  const lower = profile({ id: "lower", runtimeVersion: "3.13.9", executable: "python/lower/python.exe" });
  writeExecutable(runtimeRoot, lower.executable);
  const resolver = new RuntimeResolver({
    registry: createRuntimeRegistry({ profiles: [lower, top], runtimeRoot })
  });

  const missing = expectRuntimeError(
    () => resolver.resolve(request()),
    "RUNTIME_NOT_FOUND",
    "missing-runtime"
  );
  assert.equal(missing.details.profileId, "top");

  const candidate = path.resolve(runtimeRoot, ...top.executable.split("/"));
  fs.mkdirSync(candidate, { recursive: true });
  expectRuntimeError(
    () => resolver.resolve(request()),
    "RUNTIME_NOT_FOUND",
    "missing-runtime"
  );

  fs.rmSync(candidate, { recursive: true });
  const outside = writeExecutable(tempRoot(t), "outside/python.exe");
  fs.mkdirSync(path.dirname(candidate), { recursive: true });
  fs.symlinkSync(outside, candidate, "file");
  expectRuntimeError(
    () => resolver.resolve(request()),
    "RUNTIME_NOT_FOUND",
    "missing-runtime"
  );
});

test("Resolver accepts a contained payload when the runtime root is a symlink", (t) => {
  const base = tempRoot(t);
  const realRoot = path.join(base, "real");
  const runtimeRoot = path.join(base, "linked");
  fs.mkdirSync(realRoot);
  fs.symlinkSync(realRoot, runtimeRoot, process.platform === "win32" ? "junction" : "dir");
  const executable = writeExecutable(realRoot);
  const resolver = new RuntimeResolver({
    registry: createRuntimeRegistry({ profiles: [profile()], runtimeRoot })
  });

  assert.equal(resolver.resolve(request()).executable, executable);
});

test("the committed current profile is selected but reports its deliberately absent source payload", () => {
  const registry = loadRuntimeRegistry();
  const profileId = "python-cpython-3.13.14-resolve-20.3.2-win32-x64";
  assert.equal(registry.get(profileId).releaseStatus, "current");
  const resolver = new RuntimeResolver({ registry });
  const error = expectRuntimeError(
    () => resolver.resolve(request()),
    "RUNTIME_NOT_FOUND",
    "missing-runtime"
  );
  assert.equal(
    error.details.profileId,
    profileId
  );
});

test("RuntimeError defensively copies details", () => {
  const details = { nested: { value: 1 } };
  const error = new RuntimeError("TEST", "test", { details });
  details.nested.value = 2;
  assert.deepEqual(error.details, { nested: { value: 1 } });
});
