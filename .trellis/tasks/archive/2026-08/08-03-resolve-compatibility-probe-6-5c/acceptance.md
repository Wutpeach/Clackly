# Phase 6.5C Current-Machine Acceptance

Recorded 2026-08-03 on Windows x64. Resolve was started externally before the final read-only Probe; the Probe did not access or mutate projects or timelines.

## Machine tuple

- Clackly: `0.1.0`
- Node: `v22.17.1`, `win32`, `x64`
- Resolve executable: `C:\Program Files\Blackmagic Design\DaVinci Resolve\Resolve.exe`
  - File/product version: `20.3.2.9`
  - Size: `640545824`
  - Modified UTC: `2026-02-11T10:24:36.0000000Z`
- Resolve module: `C:\ProgramData\Blackmagic Design\DaVinci Resolve\Support\Developer\Scripting\Modules\DaVinciResolveScript.py`
  - Size: `1773`
  - Modified UTC: `2026-02-10T10:44:06.0000000Z`
- Resolve library: `C:\Program Files\Blackmagic Design\DaVinci Resolve\fusionscript.dll`
  - File/product version: `20.3.2`
  - Size: `3571200`
  - Modified UTC: `2026-02-10T10:52:56.0000000Z`
- CPython: `C:\Users\Administrator\AppData\Local\Programs\Python\Python313\python.exe`
  - Version: `3.13.1`, `64bit`, `AMD64`
  - Size: `105840`
  - Modified UTC: `2024-12-03T12:58:12.0000000Z`
- The shell-default CPython is `3.11.15`; it was inventoried but never used to import the Resolve bridge.

## Isolated Probe results

The same `RuntimeProbe` instance and cache path were used for both calls. Its instrumented launcher incremented `launchCount` immediately before delegating the unchanged input to the real `RuntimeLauncher.execute()`. The first call took 1243 ms and increased the launch count to 1. The second took 2 ms and left the launch count at 1, proving the cache hit started no Python process.

### First call: uncached live Probe

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
    "executable": "C:\\Users\\Administrator\\AppData\\Local\\Programs\\Python\\Python313\\python.exe"
  },
  "resolve": { "version": "20.3.2.9", "connected": true },
  "bridge": {
    "modulePath": "C:\\ProgramData\\Blackmagic Design\\DaVinci Resolve\\Support\\Developer\\Scripting\\Modules\\DaVinciResolveScript.py",
    "libraryPath": "C:\\Program Files\\Blackmagic Design\\DaVinci Resolve\\fusionscript.dll"
  },
  "cache": { "status": "miss", "reason": "missing" }
}
```

### Second call: no-spawn cache hit

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
    "executable": "C:\\Users\\Administrator\\AppData\\Local\\Programs\\Python\\Python313\\python.exe"
  },
  "resolve": { "version": "20.3.2.9", "connected": true },
  "bridge": {
    "modulePath": "C:\\ProgramData\\Blackmagic Design\\DaVinci Resolve\\Support\\Developer\\Scripting\\Modules\\DaVinciResolveScript.py",
    "libraryPath": "C:\\Program Files\\Blackmagic Design\\DaVinci Resolve\\fusionscript.dll"
  },
  "cache": { "status": "hit" }
}
```

### Persisted fingerprint

The persisted cache envelope had `schemaVersion: 1`; its fingerprint was:

```json
{
  "clacklyVersion": "0.1.0",
  "runtime": {
    "id": "override",
    "version": "3.13.1",
    "executableMtimeMs": 1733230692000
  },
  "resolveVersion": "20.3.2.9",
  "bridge": {
    "modulePath": "C:\\ProgramData\\Blackmagic Design\\DaVinci Resolve\\Support\\Developer\\Scripting\\Modules\\DaVinciResolveScript.py",
    "moduleMtimeMs": 1770720246000,
    "libraryPath": "C:\\Program Files\\Blackmagic Design\\DaVinci Resolve\\fusionscript.dll",
    "libraryMtimeMs": 1770720776000
  },
  "platform": "win32",
  "architecture": "x64",
  "overridePath": "C:\\Users\\Administrator\\AppData\\Local\\Programs\\Python\\Python313\\python.exe"
}
```

## Acceptance conclusion

- The exact Resolve 20.3.2.9 / bridge 20.3.2 / CPython 3.13.1 x64 tuple connected successfully through the isolated Probe.
- Resolver provenance remained `overridden`; Probe success did not promote it to machine-verified and retained `CUSTOM_RUNTIME_UNVERIFIED`.
- The unchanged fingerprint produced a true cache hit with no second spawn.
- No CPython 3.11/3.12 bridge import was attempted during this acceptance run.

## Automated validation

- `node --test script-runtime/runtime-probe.test.js script-runtime/runtime-launcher.test.js script-runtime/runtime.test.js script-runtime/providers/PythonProvider.test.js` — 37 passed.
- `python -m unittest discover -s script-runtime -p "test_*.py"` — 13 passed.
- `python -m py_compile script-runtime/runtime/bootstrap.py script-runtime/test_runtime_bootstrap.py` — passed.
- `npm test` — 136 Node tests plus Python suites of 15, 13, 20, and 2 tests passed.
- `npm run build` — Vite production build passed.
- `node --check` for `runtime/probe.js` and `runtime-probe.test.js`, plus `git diff --check` — passed.
- Boundary searches found no new production process runner: the Probe routes through the existing `runtime/launcher.js`; its direct interpreter lookup is test-only. There is no Probe import in Provider/host/UI code, no dependency change, and only the intentional child-local `RESOLVE_SCRIPT_LIB` assignment in the new Probe path.
