# Phase 6.5C Resolve Compatibility Probe Design

## Summary

Extend the existing isolated Bootstrap with one Resolve-specific operation and add one small JavaScript orchestration module. Resolver support provenance remains untouched; Probe state and effective readiness are separate fields.

```text
resolution + Clackly/Resolve/bridge inputs
  -> RuntimeProbe
     -> RuntimeFingerprint -> RuntimeProbeCache
        -> hit: cached passed diagnostics
        -> miss/stale/force:
           ResolvePythonProbe -> RuntimeLauncher -> bootstrap resolve-probe
           -> RuntimeDiagnostics
           -> cache success / clear failure
```

## Layout

```text
resolve-command-center/script-runtime/
  runtime/
    probe.js                  # five named Probe concepts
    bootstrap.py             # add resolve-probe operation
  runtime-probe.test.js       # Node orchestration/cache/crash tests
  test_runtime_bootstrap.py   # Python operation tests
```

`probe.js` exports `RuntimeProbe`, `ResolvePythonProbe`, `RuntimeFingerprint`, `RuntimeProbeCache`, and `RuntimeDiagnostics`. Keeping the small pure helpers together avoids five one-use modules. `RuntimeProbeCache` wraps the existing `ConfigStorage` for atomic JSON persistence.

## Input Contract

```javascript
await runtimeProbe.probe({
  resolution,                 // existing successful Resolver record
  clacklyVersion,             // canonical package version
  resolveVersion,             // Resolver/host compatibility version
  modulePath,                 // optional explicit DaVinciResolveScript.py
  libraryPath,                // optional explicit fusionscript.dll
  force: false
});
```

- `resolution` remains the source of `supportStatus`, executable, profile id/version, source, and Override provenance.
- `clacklyVersion` and `resolveVersion` are explicit, non-empty canonical versions. This boundary does not search package or host processes.
- Explicit bridge paths are optional on Windows and take precedence over the two standard candidates. Non-Windows requires explicit paths.
- Constructor dependencies provide `RuntimeLauncher`, cache path/storage, filesystem, platform, and architecture test seams. There is no global singleton.

## Status Contract

Every diagnostic snapshot contains:

```javascript
{
  ok,
  supportStatus,
  probeStatus,
  effectiveStatus,
  warnings
}
```

`RuntimeDiagnostics` owns one pure status table:

| supportStatus | probeStatus | effectiveStatus | warning |
|---|---|---|---|
| `machine-verified` | `passed` | `ready` | none |
| `overridden` | `passed` | `ready` | `CUSTOM_RUNTIME_UNVERIFIED` |
| `unsupported` | `passed` | `warning` | none required by this phase |
| any | `failed` | `blocked` | none required |
| `missing-runtime` | any | `blocked` | none required |
| any | `not-run` / `stale` | `blocked` | none required |

`ok` is true only for `probeStatus: passed`. A later execution policy consumes `effectiveStatus`; this phase does not implement advanced-mode authorization.

## RuntimeFingerprint

The full schema-version-1 fingerprint is a stable plain object:

```javascript
{
  clacklyVersion,
  runtime: { id, version, executableMtimeMs },
  resolveVersion,
  bridge: {
    modulePath, moduleMtimeMs,
    libraryPath, libraryMtimeMs
  },
  platform,
  architecture,
  overridePath
}
```

- Paths are canonical absolute paths; no digest is needed because stable deep equality of this fixed object is enough.
- Managed Runtime id/version come from the profile and must agree with observed Python.
- Override id is `override`; its version comes from the last successful observed interpreter. A cache candidate can reuse that stored version only if its canonical executable path and mtime still match.
- `overridePath` is the canonical path for Override resolutions and `null` for Manifest resolutions.
- Missing bridge files cannot produce a reusable fingerprint; the uncached child still reports the ordered missing-file diagnostic.

## RuntimeProbeCache

One cache file contains:

```javascript
{
  schemaVersion: 1,
  fingerprint: { /* full fingerprint */ },
  result: { /* sanitized successful result */ }
}
```

- Reuse `ConfigStorage.save()` for directory creation and atomic temp-file rename.
- `lookup()` defensively validates the exact envelope, fingerprint, passed result, three statuses, and managed/Override support provenance. Missing/corrupt/unreadable/unknown schema is a miss.
- Exact fingerprint equality is a hit. A valid prior record with different material is stale. Force bypasses both.
- Only `passed` results are saved. Any fresh failed Probe clears the cache; a prior native crash therefore cannot be reused.
- Cache read/write/delete failures are bounded cache diagnostics. A write failure returns the real successful Probe result with `cache.status: write-failed`.
- One record avoids eviction and locking policy. The caller owns the cache file location, enabling AppData integration later without adding it here.

## ResolvePythonProbe and Bootstrap

`ResolvePythonProbe` calls the existing Launcher once:

```javascript
launcher.execute({
  resolution,
  request: {
    operation: "resolve-probe",
    expectedRuntimeVersion,
    expectedResolveVersion,
    modulePath,
    libraryPath
  }
});
```

Bootstrap performs only standard-library checks before touching the native bridge:

1. Build the existing runtime record, validate `64bit`, and compare the optional expected Runtime version.
2. Validate the module and library paths as absolute regular files.
3. Set `RESOLVE_SCRIPT_LIB` from the request.
4. Import `DaVinciResolveScript` from the exact canonical module file and verify its loaded native module came from the supplied canonical library.
5. Call `scriptapp("Resolve")`.
6. Call the Resolve version API, require a canonical numeric version, and compare numeric prefix compatibility with the expected version.
7. Return the existing `ok/runtime` envelope plus Resolve and bridge records.

Expected Python failures return the existing structured Bootstrap failure envelope with the requested stable code. `ResolvePythonProbe` unwraps that code from `RUNTIME_BOOTSTRAP_FAILED`. Launcher timeout is preserved. Launcher native crash while this operation is active maps to `RUNTIME_NATIVE_BRIDGE_CRASH` and retains the bounded Launcher process record.

Additional precise internal failures such as Runtime architecture/version mismatch may retain stable Runtime codes; they do not replace the minimum required error vocabulary.

## Result Shape

Successful Override example:

```json
{
  "ok": true,
  "supportStatus": "overridden",
  "probeStatus": "passed",
  "effectiveStatus": "ready",
  "warnings": [
    {
      "code": "CUSTOM_RUNTIME_UNVERIFIED",
      "message": "Custom Runtime passed this machine Probe but is not a Clackly-verified combination."
    }
  ],
  "runtime": {
    "id": "override",
    "version": "3.13.1",
    "architecture": "x64",
    "executable": "C:\\Python313\\python.exe"
  },
  "resolve": {
    "version": "20.3.2",
    "connected": true
  },
  "bridge": {
    "modulePath": "C:\\...\\DaVinciResolveScript.py",
    "libraryPath": "C:\\...\\fusionscript.dll"
  },
  "cache": {
    "status": "miss"
  }
}
```

Failure replaces the success-only data that could not be established with `null` or omission and adds:

```javascript
error: { code, message, stage, details? }
```

Raw exceptions are never returned. Launcher stdout/stderr remain bounded by the existing Launcher.

## Tests

- Pure status-table tests cover all requested combinations and warning behavior.
- Cache tests use temporary files and a fake Launcher to cover hit/miss/stale/force, every fingerprint field, corrupt data, atomic saves, clear-on-failure, and write-failure diagnostics.
- Bootstrap unit tests use temporary fake `DaVinciResolveScript.py` modules plus placeholder library files for pass, import exception, no application, connection exception, missing/invalid version, bridge file failures, architecture/version validation, and preserved `runtime-info` behavior.
- A fake module that aborts during import is launched only through `RuntimeProbe`; assert `RUNTIME_NATIVE_BRIDGE_CRASH`, parent survival, bounded evidence, cache clearing, and a following successful Probe.
- Live acceptance runs the new Probe with Resolve 20.3.2 and CPython 3.13.x x64, then records versions, paths, mtimes, statuses, warning set, cache miss result, and cache hit result.

## Compatibility and Rollback

- `runtime-info` remains backward compatible.
- No production caller or stored user configuration changes.
- Cache schema is disposable; incompatible data becomes a miss.
- Rollback deletes `probe.js` and its tests and removes only the `resolve-probe` Bootstrap branch/tests. Existing Resolver/Launcher/Provider behavior remains intact.

## Deferred Work

- Advanced-mode execution policy and UI/IPC presentation.
- Production `PythonProvider` integration.
- PE Import Table advisory detection.
- Multi-entry cache, TTL, watchers, telemetry, and background probing.
