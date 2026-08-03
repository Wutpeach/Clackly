# Phase 6.5C: Resolve Compatibility Probe

## Goal

Verify one exact Clackly Runtime/Resolve bridge tuple in an expendable Python subprocess, return actionable structured diagnostics, and reuse the result only while every compatibility-relevant fingerprint input remains unchanged.

## Background

- Phase 6.5A provides Runtime Manifest, Registry, Resolver, executable-only Override, and typed `RuntimeError` records.
- Phase 6.5B provides `RuntimeLauncher`, an isolated allowlisted environment, one-request Python Bootstrap framing, bounded process diagnostics, timeout handling, and native-crash containment.
- Current-machine evidence shows Resolve 20.3.2's bridge crashing CPython 3.11.15 and 3.12.10 during native module creation, while CPython 3.13.1 x64 imports it and obtains a live Resolve application.
- Production `PythonProvider` is still separate from the Managed Runtime path. This phase establishes compatibility probing and caching, not provider integration.

## Requirements

### Probe boundary

- Add the requested Runtime Probe concepts: `RuntimeProbe`, `ResolvePythonProbe`, `RuntimeFingerprint`, `RuntimeProbeCache`, and `RuntimeDiagnostics`. They may share files when that keeps the implementation smaller; one class or file per name is not required.
- Reuse `RuntimeResolver`, `RuntimeLauncher`, `RuntimeEnvironment`, `RuntimeError`, the existing Bootstrap envelope, and repository JSON storage. Do not add another process runner, environment builder, error hierarchy, cache dependency, or hashing dependency.
- Launch exactly one short-lived isolated Python subprocess per uncached Probe. A native bridge failure must terminate only that child and never crash the Node/Electron parent.
- Keep the Probe independent of Capability, Command Engine, renderer, Resolve2AE core, and production `PythonProvider` wiring.

### Ordered compatibility checks

For an uncached Probe, check and diagnose in this order:

1. The resolved Python executable exists and is a regular file.
2. Python starts successfully through `RuntimeLauncher`.
3. The running interpreter reports 64-bit pointer width.
4. The running interpreter's exact version agrees with the selected Manifest profile when a profile exists. An Override has no Manifest version claim but still records its observed version.
5. `DaVinciResolveScript.py` is located from an explicit Probe input or the standard Windows Resolve scripting location.
6. `fusionscript.dll` is located from an explicit Probe input or the standard Windows Resolve installation location.
7. The Resolve Python module loads inside the isolated child using only explicitly supplied bridge paths.
8. The child attempts `scriptapp("Resolve")` and, when connected, records the actual Resolve version returned by the API.
9. The parent returns one JSON-safe diagnostic result containing runtime, Resolve, bridge, cache, status, warning, and bounded process/error evidence.

The isolated environment must not inherit `PATH`, `PYTHONPATH`, `RESOLVE_SCRIPT_API`, or `RESOLVE_SCRIPT_LIB`; resolved bridge paths must cross the JSON request boundary explicitly.

### Structured status and diagnostics

- Preserve Resolver support as the formal top-level field `supportStatus`. Its vocabulary remains exactly `machine-verified | overridden | unsupported | missing-runtime`; Probe success must never replace or promote it.
- Add the independent top-level field `probeStatus` with vocabulary `not-run | passed | failed | stale`.
- Add the derived top-level field `effectiveStatus` with vocabulary `ready | warning | blocked`.
- Derive status as follows:
  - `machine-verified + passed` -> `ready`.
  - `overridden + passed` -> `ready` plus a structured `CUSTOM_RUNTIME_UNVERIFIED` warning.
  - `unsupported + passed` -> `warning`; whether execution is allowed belongs to a later advanced-mode policy.
  - Any `failed` -> `blocked`.
  - `missing-runtime` -> `blocked`.
  - `not-run` or `stale` -> `blocked` until a fresh Probe passes.
- `ok` reports whether the compatibility Probe passed; it does not erase Resolver support provenance or independently authorize execution policy.
- Success includes `ok: true`, all three status fields, warnings, runtime id/version/architecture/executable, Resolve version and `connected: true`, canonical module/library paths, and cache disposition.
- Failure includes `ok: false`, all safely known context, all three status fields, and one primary diagnostic with a stable code, message, failed stage, and bounded details/process evidence.
- Support at least these primary classifications:
  - `RESOLVE_MODULE_NOT_FOUND`
  - `RESOLVE_LIBRARY_NOT_FOUND`
  - `RESOLVE_IMPORT_FAILED`
  - `RESOLVE_NOT_RUNNING`
  - `RESOLVE_CONNECTION_FAILED`
  - `RUNTIME_TIMEOUT`
  - `RUNTIME_NATIVE_BRIDGE_CRASH`
  - `RESOLVE_VERSION_UNVERIFIED`
- Preserve lower-level Launcher diagnostics in bounded details, but map a native crash during Resolve module import or connection to `RUNTIME_NATIVE_BRIDGE_CRASH` at the Probe boundary.
- Treat `scriptapp("Resolve")` returning no application as `RESOLVE_NOT_RUNNING`; treat an exception while attempting the connection as `RESOLVE_CONNECTION_FAILED`.
- A successful module load, live application, and readable compatible Resolve version are required for `probeStatus: passed`.
- `supportStatus` must remain a first-class structured field, not exist only in diagnostic details.

### Fingerprint and cache

- The stored fingerprint must include at least Clackly version, Runtime id, Runtime version, Runtime executable modification time, supplied Resolve version, `DaVinciResolveScript.py` path/mtime, `fusionscript.dll` path/mtime, platform, architecture, and Runtime Override path including an explicit no-Override value.
- Build fingerprints from canonical paths and stable JSON data. For an Override, use a stable `override` Runtime id and the interpreter version observed by the successful Probe; an unchanged canonical executable and mtime allow that observed version to participate in later cache comparisons.
- Cache only a fully successful result. A valid cache hit returns `probeStatus: passed` without starting Python.
- Re-probe on first use, Clackly update, Runtime id/version/executable mtime change, supplied Resolve version change, either bridge path/mtime change, platform/architecture change, Override change, a prior failed/native-crash Probe, or an explicit user-diagnostics force flag.
- A mismatched cached success is `stale` during cache evaluation and must be replaced by the fresh Probe result before `RuntimeProbe.probe()` settles.
- A missing prior record is `not-run` during cache evaluation. The settled result of an actual Probe is `passed` or `failed`.
- Use one schema-versioned persistent JSON cache record with atomic replacement and defensive reads. Corrupt, missing, unreadable, or schema-incompatible cache data is a miss, not a Probe failure.
- Clear any reusable cached success when a fresh Probe fails. A cache write failure must not hide a valid Probe result; report it as bounded cache diagnostics.
- Do not add TTLs, file watchers, background polling, retries, a cache database, multi-entry eviction, or cross-process locking.

### Current-machine acceptance evidence

- Validate and record exact installed versions and the full Probe result on Windows x64 with Resolve 20.3.2 and CPython 3.13.x x64.
- Any Python 3.11 or 3.12 compatibility validation must run only through the isolated Probe subprocess. Never import the Resolve bridge for those interpreters in the parent or a long-lived process.
- Automated tests use temporary files/fake bridge modules for normal branches plus an aborting imported fixture for crash containment. Host-dependent live Resolve validation is recorded current-machine evidence, not a portable CI precondition.

## Acceptance Criteria

- [ ] An uncached Probe performs the nine ordered checks through the existing isolated Launcher and never imports Resolve in the parent.
- [ ] `supportStatus`, `probeStatus`, and `effectiveStatus` remain separate top-level fields and every settled derivation rule is covered by focused tests.
- [ ] Override success returns `supportStatus: overridden`, `probeStatus: passed`, `effectiveStatus: ready`, and `CUSTOM_RUNTIME_UNVERIFIED`; it is never promoted to official verification.
- [ ] Unsupported Probe success returns `effectiveStatus: warning` without implementing or assuming the later advanced-mode execution policy.
- [ ] A native bridge crash becomes `RUNTIME_NATIVE_BRIDGE_CRASH`, preserves bounded process evidence, leaves the parent alive, clears reusable cache state, and forces the next request to Probe again.
- [ ] Every required error code is produced by a deterministic test or documented host-only scenario.
- [ ] Success and failure diagnostics are JSON-safe, bounded, defensive, and contain no raw exception objects or unbounded output.
- [ ] Fingerprint equality produces a cache hit without spawning; every required fingerprint change produces a fresh Probe.
- [ ] Forced diagnostics bypasses cache, while failed Probes and corrupt cache data never become reusable hits.
- [ ] Cache replacement is atomic and a cache write failure does not replace the successful Probe outcome.
- [ ] No new dependency, PATH lookup, process framework, retry, watcher, polling loop, cross-process lock, or production Provider integration is introduced.
- [ ] Focused Node/Python tests, full project tests, Python compilation, production build, syntax/whitespace checks, and boundary searches pass.
- [ ] The completion record includes Windows/Resolve/CPython/bridge/Clackly versions, canonical paths/mtimes, cache disposition, all three statuses, warnings, and the complete sanitized Probe result.

## Out of Scope

- Switching `PythonProvider` or production Feature execution to the Managed Runtime.
- Implementing advanced-mode policy for `unsupported + passed`.
- Runtime download, installation, packaging, update, or fallback selection.
- UI/IPC for diagnostics; the result shape only preserves enough information for later copy such as “verified combination, Probe passed” and “custom Runtime, Probe passed, not officially verified.”
- Long-lived workers, pools, retries, background probes, telemetry, or cross-machine compatibility claims.
- General PE parsing. Windows PE Import Table inspection for `python313.dll` / `python312.dll` is deferred because it is advisory and cannot replace the real Probe.

## Key Decisions

- Resolver support provenance and current-machine Probe state are independent dimensions. `effectiveStatus` is derived without mutating either source field.
- The five requested concepts form one cohesive Phase 6.5C task and do not require child tasks or one-file-per-concept scaffolding.
- `RuntimeLauncher` remains the sole process lifecycle owner. Resolve-specific behavior extends the existing Bootstrap operation protocol.
- The caller supplies the Resolve compatibility version already required by the Resolver request; the live Probe reads the API version and verifies numeric component compatibility. This phase does not invent host-version discovery.
- Only fully successful results are reusable; all failures remove reusable state. This handles Resolve start/stop and crash recovery without TTLs.
- PE Import Table inspection remains deferred under YAGNI.

