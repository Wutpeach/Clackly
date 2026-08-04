# Phase 6.5D Managed Runtime Integration Design

## Summary

Build one hash-locked external CPython payload, package it beside the unpacked Electron app, and add one `RuntimeManager` that composes the existing Resolver, Probe/cache, and Launcher. PythonProvider becomes a request/result adapter and no longer owns a process.

```text
Build:
official CPython ZIP + lock + Clackly Python sources
  -> hash verification -> Runtime staging -> runtime.json/licenses/SBOM
  -> Electron external resources -> packaged artifact

Execution:
Feature -> Capability -> ScriptCapabilityProvider -> ScriptExecutor
  -> PythonProvider -> RuntimeManager
     -> RuntimeResolver -> RuntimeProbe/Probe Cache
     -> RuntimeLauncher -> staged Bootstrap script-execute
     -> existing ScriptContext -> Resolve Script API -> After Effects
```

## Proposed layout

```text
resolve-command-center/
  docs/
    managed-python-runtime.md
    resolve-python-matrix.md
    resolve-python-runtime-troubleshooting.md
    ADR-managed-python-runtime.md
  resources/runtimes/
    manifest.json
    python-win32-x64.lock.json
  scripts/
    stage-managed-python.ps1
  script-runtime/runtime/
    manager.js
    bootstrap.py
  build/runtime-staging/                 # generated, ignored
  release/win-unpacked/resources/
    runtimes/manifest.json
    runtimes/<profile-id>/
      python.exe, python313.dll, python313.zip, ...
      python313._pth
      runtime.json
      LICENSE.txt
      THIRD_PARTY_NOTICES.md
      python-embed.spdx.json
      clackly/
        bootstrap.py
        python_runner.py
        resolve/
        scripts/
        resolve2ae_core/
```

Keep the app unpacked (`asar: false`) for the first Workflow Integration release and still copy Runtime staging through Electron external resources. Artifact checks reject any Python executable below an `.asar` path. Add electron-builder as the only packaging dependency; use native PowerShell ZIP/hash operations and existing `npm sbom` instead of more build libraries.

## Locked asset and staging contract

`python-win32-x64.lock.json` is a small versioned build input containing the selected version, asset URL, SHA-256, Sigstore/SPDX/license URLs and hashes, platform, architecture, upstream filename, and `releaseStatus: candidate | current | legacy-pinned`.

The staging script:

1. Validates the lock before network or filesystem mutation.
2. Uses an explicit cache path when provided; otherwise downloads only the locked HTTPS URL.
3. Computes SHA-256 and stops before extraction on mismatch.
4. Expands into a fresh task-specific staging directory.
5. Requires the expected executable/DLL/stdlib archive and rejects unexpected architecture/version identity during the subsequent runtime-info check.
6. Writes `python313._pth` with only `python313.zip`, `.`, and `clackly`; it does not enable `site`.
7. Copies the trusted Clackly Python production sources and excludes tests, caches, and bytecode.
8. Copies the pinned LICENSE, third-party notice, upstream SPDX, and generated application SBOM.
9. Generates deterministic `runtime.json`, then emits the Runtime directory consumed by packaging.

The build never invokes Python. It may use its explicitly launched Node/npm/PowerShell toolchain, but performs no `python`, `py`, `where python`, PATH interpreter search, venv, Conda, or uv lookup. A missing cache/network asset or bad hash fails the build.

## Release qualification branch

The initial lock is the official CPython 3.13.14 candidate and exact SHA-256 already recorded in research.

- Pass: record packaged runtime-info and Probe/cache evidence under hostile Python parent settings, automated host-launch environment-boundary evidence, and post-fix warm/cold live Export evidence; promote the lock/Manifest profile to `runtimeVersion: 3.13.14`, `releaseStatus: current`.
- Fail: preserve complete failure stage/code/process evidence. Build 3.13.1 from its separately SHA-256-pinned official asset and repeat every packaged check. Only a complete pass may set `releaseStatus: legacy-pinned`; create a linked P1 security-upgrade blocker containing the 3.13.14 failure.
- Both fail: keep the task in progress/blocked by evidence; do not silently select another interpreter.

Manifest schema gains a required release-status field (with a schema bump if required by validation compatibility). `releaseStatus` is release provenance, not Resolver `supportStatus`: a passing legacy-pinned official profile can remain `machine-verified` while diagnostics/docs expose its upgrade debt.

## RuntimeManager contract

```javascript
await runtimeManager.execute({
  runtime: "python",
  capabilityId: "ae.export",
  entry: "scripts/resolve2ae_export.py",
  commandId,
  config,
  host: { application: "davinci-resolve", version }
});
// -> existing { ok, result?, error?, logs } script envelope
```

Constructor composition owns Registry/Resolver, Probe/cache path, Launcher, Clackly version, platform/architecture, packaged Runtime root, optional absolute Override, and host-context provider. Defaults reuse the existing modules; tests inject fakes.

Execution order:

1. Validate one plain Runtime request; never read PATH.
2. Resolve the authoritative Override or Manifest profile.
3. Probe using the live host version and existing cache. A failed/blocked result becomes a `RuntimeError` with the Probe code and diagnostics.
4. Launch the same resolution once with Bootstrap operation `script-execute`.
5. Validate and return the nested existing script envelope. Do not retry a Runtime or backend.

The host boundary supplies live Resolve version data. Workflow Integration uses its existing `getResolve()` object and Resolve version API; any standalone host adapter must return an equally explicit value or a typed `RESOLVE_VERSION_UNVERIFIED` failure. Provider, Feature, and Manifest composition never invent a live version.

## Bootstrap and script protocol

Extend the existing Bootstrap rather than introduce a second worker launcher. `script-execute` receives the relative entry, canonical staged script root, Command id, and config through stdin. It validates containment, imports the existing `python_runner.run_script`, and returns transport success with a nested script envelope:

```json
{
  "ok": true,
  "runtime": { "version": "3.13.14", "architecture": "64bit", "executable": "..." },
  "script": { "ok": true, "result": {}, "logs": [] }
}
```

A Feature exception remains `script.ok: false`; it is not misclassified as a Launcher/Bootstrap crash. Transport/validation failure remains the existing Launcher/Runtime error vocabulary. PythonProvider replays `script.logs`, throws the existing user-facing script error on `script.ok: false`, and returns `script.result` on success.

## PythonProvider and Capability mapping

`createScriptCapability`/`ScriptCapabilityProvider` pass the Capability id internally so PythonProvider can build the Runtime selector without changing Python ScriptContext. PythonProvider retains application-root entry containment but drops `pythonExecutable`, `spawnProcess`, runner argv, output accumulation, and process protocol ownership.

Runtime errors already extend `Error`. PythonProvider adds the script-entry context expected by current callers while preserving `code`, `supportStatus`, and defensive `details`; no second error class hierarchy is added.

The advanced Override is one explicit absolute executable path supplied at host composition (documented operator configuration, no UI). Invalid/missing values remain authoritative failures. Existing `RESOLVE_COMMAND_CENTER_PYTHON_CMD` is not reused because it may contain arguments and belongs to the legacy bridge.

## Packaging and artifact validation

electron-builder produces Windows unpacked directory output with application files unpacked and Runtime staging copied to `process.resourcesPath/runtimes`. Packaged host composition selects this Runtime root; development/test composition uses an explicit root/Override and may never substitute PATH Python.

Automated package checks assert:

- Manifest/lock/runtime.json agreement and exact selected executable.
- SHA-256 and required file/license/SBOM presence.
- no `python.exe` under app source, asar, node_modules, or another profile.
- Runtime `-I` identity succeeds under hostile PATH/Conda environments.
- Probe operates on packaged canonical paths and cache invalidates on material changes.

Release acceptance composes three boundary-specific proofs instead of requiring one
redundant end-to-end variant:

1. The final package verifier executes the exact Manifest Runtime and Probe contract with
   system Python unavailable/irrelevant, Python removed from `PATH`, Conda active, and
   `PATH` pointed to Python 3.11.
2. Automated Manager/Launcher tests prove the Runtime process retains its strict allowlist
   and After Effects starts only from the Electron host with its normal desktop environment.
3. The final packaged Workflow Integration completes post-fix real exports with After
   Effects already running and with AE closed and host-launched, without Preferences/CEP
   recurrence.

These proofs jointly establish Runtime selection/isolation and real desktop behavior. Per
the final user-approved release decision, another actual GUI send from a hostile parent is
not required.

## Compatibility, rollback, and risks

- The existing ScriptContext and Feature result contracts remain stable; external callers see only improved Runtime error fields.
- Probe cache schema remains success-only; release-status changes are covered by Clackly/profile/version fingerprint changes.
- Rollback restores the old provider only as a code rollback; released builds must not re-enable PATH fallback.
- Main risk: Resolve Workflow Integration may reject the new packaged directory layout. Live packaged launch is therefore a release gate, not documentation-only evidence.
- Native patch-version ABI behavior is unknown until tested. The explicit 3.13.14/3.13.1 branch prevents inference.
- Runtime increases artifact size and creates Python security/license maintenance. `legacy-pinned` makes that debt blocking and visible.

## Deferred

Runtime downloader/updater, online catalogs, multiple installed Runtimes, settings UI, signing the complete Clackly installer, macOS qualification, worker pools, and background Probe.
