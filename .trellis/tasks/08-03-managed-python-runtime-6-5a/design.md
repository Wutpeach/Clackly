# Phase 6.5A Managed Python Runtime Design

## Summary

Add a metadata-only Managed Runtime boundary under `script-runtime/runtime/`. It loads one versioned repository Manifest, validates defensive Registry records, and resolves one compatible absolute executable or a typed error. Phase 6.5A never launches Python and does not connect the Resolver to `PythonProvider`.

```text
resources/runtimes/manifest.json
  -> Runtime Loader
  -> Runtime Registry
  -> Runtime Resolver(request)
  -> resolution | RuntimeError

PythonProvider remains unchanged and unused by this flow.
```

## Layout

```text
resolve-command-center/
  resources/runtimes/
    manifest.json
    python/cpython-3.13.1/win32-x64/python.exe # future; absent in 6.5A
  script-runtime/
    runtime/
      errors.js
      loader.js
      registry.js
      resolver.js
    runtime.test.js
```

The test stays at `script-runtime/runtime.test.js` because the existing `npm test` glob includes `script-runtime/*.test.js`, not nested tests. No package script change is needed.

## Manifest Schema Version 1

```json
{
  "schemaVersion": 1,
  "profiles": [
    {
      "id": "python-cpython-3.13.1-resolve-20.3.2-win32-x64",
      "runtime": "python",
      "implementation": "cpython",
      "runtimeVersion": "3.13.1",
      "platform": "win32",
      "architecture": "x64",
      "capabilities": ["ae.export"],
      "host": {
        "application": "davinci-resolve",
        "versionPrefix": "20.3.2"
      },
      "executable": "python/cpython-3.13.1/win32-x64/python.exe",
      "verification": "machine-verified"
    }
  ]
}
```

Schema version 1 requires one plain root object, integer `schemaVersion: 1`, and a non-empty dense `profiles` array. Required strings are non-empty. `runtimeVersion` is exactly `major.minor.patch`; `host.versionPrefix` is a canonical numeric dotted value with at least three components. Capability ids are non-empty and unique. Platform/architecture use Node values (`win32`, `x64`). Executable is a contained relative resource path. Phase 6.5A accepts only `machine-verified` verification.

Python `3.13.1` appears only in Manifest data. Feature, Provider, Registry, and Resolver code contain no Python version branch.

## Contracts

### Errors

```javascript
new RuntimeError(code, message, { supportStatus = null, details = {} } = {})
```

The error carries stable `code`, nullable `supportStatus`, and defensive `details`.

| Condition | Code | Status |
|---|---|---|
| Missing/unparseable/invalid Manifest | `RUNTIME_MANIFEST_INVALID` | `null` |
| Invalid resolve request | `RUNTIME_REQUEST_INVALID` | `null` |
| Override is not one absolute executable path | `RUNTIME_OVERRIDE_INVALID` | `null` |
| No profile matches | `RUNTIME_UNSUPPORTED` | `unsupported` |
| Override or managed executable is absent/not a file | `RUNTIME_NOT_FOUND` | `missing-runtime` |

### Loader

```javascript
loadRuntimeRegistry({ runtimeRoot?, fileSystem? }?) -> RuntimeRegistry
```

Default `runtimeRoot` is `<app root>/resources/runtimes`. Loader synchronously reads `manifest.json`, validates the versioned envelope atomically, and returns a Registry. Missing Manifest is invalid; missing runtime payload is allowed until resolution. No Ajv/semver dependency, directory watcher, or cache is introduced.

### Registry

```javascript
createRuntimeRegistry({ profiles, runtimeRoot }) -> {
  get(id),
  getAll()
}
```

The Registry validates all profiles before construction, rejects duplicate ids and escaping executable paths, sorts records by id, clones inputs, and returns fresh defensive clones. It performs no environment lookup, existence check, host detection, or launch.

### Resolver

```javascript
new RuntimeResolver({ registry, fileSystem? }).resolve({
  runtime,
  platform,
  architecture,
  capabilityId,
  host: { application, version },
  overrideExecutable?
})
```

Manifest success:

```javascript
{
  source: "manifest",
  supportStatus: "machine-verified",
  executable: "C:\\absolute\\contained\\python.exe",
  profile: { /* defensive profile */ }
}
```

Override success:

```javascript
{
  source: "override",
  supportStatus: "overridden",
  executable: "C:\\absolute\\operator\\python.exe",
  profile: null
}
```

## Resolver Flow

1. If `overrideExecutable` is provided, validate it first as one absolute existing regular file. Return `overridden`; invalid/missing Override fails immediately without reading Registry or PATH.
2. Validate the normal request.
3. Match exact runtime, platform, architecture, Capability id, and host application.
4. Match host version by numeric component prefix: `20.3.2` matches `20.3.2` and `20.3.2.9`, never `20.3.20`.
5. With multiple matches, choose highest numeric `runtimeVersion`; use lexical id as the deterministic tie break.
6. Require the selected executable to exist as a regular file and resolve symlinks inside `runtimeRoot`.
7. Return the absolute path and defensive profile with `machine-verified` status.

No match is `unsupported`; a matching profile with absent payload is `missing-runtime`. Neither case checks PATH, invokes `where`/`which`, returns a bare `python`/`python3`, probes Resolve, or retries a lower execution backend.

## Support Status

- `machine-verified`: selected committed profile whose payload exists.
- `overridden`: operator-supplied executable exists, but compatibility is not claimed.
- `unsupported`: no Manifest profile matches request conditions.
- `missing-runtime`: a selected/overridden file is absent or not a regular file.

## Boundaries and Deferred Work

- `PythonProvider`, registration, hosts, ScriptExecutor, runner, Resolve adapter, Resolve2AE, Feature/UI, and Command Engine remain unchanged.
- Host version is request data; discovery belongs to later integration.
- Probe, Probe Cache, DLL ABI detection, Launcher, packaging, download/install/update, and runtime files remain later phases.
- The committed real profile must currently resolve to `RUNTIME_NOT_FOUND` because Phase 6.5A deliberately ships no Python payload.
- The next integration seam is the existing `registerScriptCapabilities({ pythonExecutable })`; a later phase injects `resolution.executable` there.

## Test Strategy

Use temporary Manifest/runtime roots and injected filesystem seams. Cover schema fields, defensive Registry behavior, selector mismatches, numeric host prefix and runtime ordering, Override priority/failures, all statuses, symlink/path containment, real profile `RUNTIME_NOT_FOUND`, and explicit absence of PATH/process lookup. Full tests/build prove production execution stayed unchanged.

## Rollback

Delete `script-runtime/runtime/`, `script-runtime/runtime.test.js`, and `resources/runtimes/manifest.json`. No persisted data, host composition, or execution migration exists.
