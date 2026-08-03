# Phase 6.5C Research: Current State

## Query

Find the smallest repository-native design for an isolated Resolve compatibility Probe, structured status derivation, fingerprint caching, crash containment, and current-machine validation without integrating production execution.

## Confirmed Repository Evidence

- Resolver results already expose `supportStatus: machine-verified` and `supportStatus: overridden`; Resolver failures expose `unsupported` and `missing-runtime` (`script-runtime/runtime/resolver.js:77,112,145,185`). These values are provenance/support policy and must remain unchanged by a Probe.
- `RuntimeLauncher` already owns isolated spawn, environment, timeout, bounded output, native-crash detection, Bootstrap envelope validation, and temporary cleanup. It emits `RUNTIME_TIMEOUT` and `RUNTIME_NATIVE_CRASH` (`script-runtime/runtime/launcher.js:237,253`) and builds the isolated environment at `:353`.
- `RuntimeEnvironment` already prevents inherited Python and Resolve variables (`script-runtime/runtime/environment.js:1-31`). Resolve bridge paths therefore must be explicit JSON request fields and applied inside the child.
- Bootstrap currently supports only `runtime-info` (`script-runtime/runtime/bootstrap.py:30-40`). Adding one `resolve-probe` operation reuses the established one-request process contract.
- The shared adapter's actual connection flow adds Resolve module paths, imports `DaVinciResolveScript`, and calls `scriptapp("Resolve")` (`resolve/adapter.py:13-29,60-79`). The Probe must reproduce only this compatibility boundary, not import the adapter's command/project/timeline behavior.
- `ConfigStorage` already supplies schema-agnostic JSON parsing and atomic `write temp -> rename -> cleanup` persistence (`config/ConfigStorage.js:12-72`). A thin defensive Probe cache wrapper can reuse it.
- Clackly version already has one source of truth in `package.json:3`.
- Existing tests already prove the Launcher parent survives an abort, output remains bounded, and temporary directories are cleaned. Probe tests can reuse that seam rather than build another worker framework.

## Settled Product Contract

- Keep `supportStatus` as a formal top-level Resolver field: `machine-verified | overridden | unsupported | missing-runtime`.
- Add orthogonal `probeStatus: not-run | passed | failed | stale` and derived `effectiveStatus: ready | warning | blocked`.
- `overridden + passed` is ready on this machine but always carries `CUSTOM_RUNTIME_UNVERIFIED`; it is never promoted to an official Clackly combination.
- `unsupported + passed` is warning. Advanced-mode allow/deny policy is explicitly later work.
- Any failure, missing runtime, not-run state, or stale state is blocked until a valid Probe passes.

## Minimal Data and Control Flow

```text
Resolver success + Probe inputs
  -> RuntimeFingerprint preflight/cache lookup
     -> valid cached success: structured passed result, no spawn
     -> miss/stale/force: ResolvePythonProbe
        -> existing RuntimeLauncher
           -> existing bootstrap.py, operation resolve-probe
              -> runtime/arch/version
              -> module/library files
              -> native import
              -> scriptapp + Resolve version
        -> RuntimeDiagnostics + status derivation
        -> save one successful cache record or clear on failure
```

The Probe accepts only a successful Resolver-shaped resolution. Resolver errors can still be projected through `RuntimeDiagnostics` as `not-run/blocked`; Phase 6.5C does not change Resolver control flow.

## Bridge and Version Details

- Standard Windows module candidate: `C:\ProgramData\Blackmagic Design\DaVinci Resolve\Support\Developer\Scripting\Modules\DaVinciResolveScript.py`.
- Standard Windows library candidate: `C:\Program Files\Blackmagic Design\DaVinci Resolve\fusionscript.dll`.
- Explicit module/library inputs override only their respective standard candidates and are canonicalized as regular files.
- Bootstrap loads the exact canonical module file, sets `RESOLVE_SCRIPT_LIB` from the JSON request, and verifies the loaded native module came from that canonical library. No parent `PYTHONPATH`/Resolve environment is needed.
- `scriptapp("Resolve") is None` maps to `RESOLVE_NOT_RUNNING`; a Python exception from `scriptapp` maps to `RESOLVE_CONNECTION_FAILED`.
- A missing, blank, or incompatible API version maps to `RESOLVE_VERSION_UNVERIFIED`. Compare canonical numeric components so normalized `20.3.2` and executable build `20.3.2.9` remain compatible without general semver.

## Fingerprint and Override Constraint

Managed profiles supply Runtime id/version before launch. Override resolutions have `profile: null`, so the successful Probe supplies the observed version and uses stable Runtime id `override`. A later cache lookup may reuse that stored observed version only when the canonical Override executable and its mtime are unchanged. The stored full fingerprint still contains every required field.

Use one cache entry because only one current selection is consumed. Multi-entry eviction, TTL, watchers, hashing, and cross-process locks add no value to this phase.

## Current-Machine Evidence

Prior isolated probes recorded:

- Windows x64.
- Resolve executable version `20.3.2.9`; bridge release/file version `20.3.2`.
- `fusionscript.dll` at the standard Program Files path.
- `DaVinciResolveScript.py` at the standard ProgramData path.
- CPython 3.13.1 x64 imports and returns a live Resolve object.
- CPython 3.11.15 and 3.12.10 x64 terminate with access violation `0xC0000005` during module creation.

Implementation acceptance must repeat the successful live Probe through the new API and record its sanitized result. Any 3.11/3.12 repeat must also use only the new isolated Probe.

## Expected File Surface

- `script-runtime/runtime/probe.js` — five named Probe concepts, path/fingerprint/status/cache orchestration, and Launcher error mapping.
- `script-runtime/runtime/bootstrap.py` — add `resolve-probe` while preserving `runtime-info`.
- `script-runtime/runtime-probe.test.js` — focused parent/cache/status/crash tests under the existing Node glob.
- `script-runtime/test_runtime_bootstrap.py` — focused Python operation/error tests.
- Backend quality spec and task acceptance evidence after implementation.

No evidence supports edits to Resolver, Launcher, Environment, Provider, Capability, hosts, UI, Resolve2AE, or package dependencies.

## Risks and Deferred Items

- A native process can crash before returning a structured Bootstrap error; the parent must infer the failed stage from the operation plus Launcher crash evidence and map it to `RUNTIME_NATIVE_BRIDGE_CRASH`.
- Cache persistence is an optimization. Read/write corruption or permission failures must not redefine compatibility results.
- PE Import Table parsing is advisory only and deferred.
- Live Resolve availability is host-dependent and cannot be mandatory in portable CI.
