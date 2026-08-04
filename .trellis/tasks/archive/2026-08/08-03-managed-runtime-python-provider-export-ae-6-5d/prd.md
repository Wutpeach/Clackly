# Phase 6.5D PythonProvider and Export to AE Managed Runtime Integration

## Goal

Ship a complete Windows x64 Managed Python Runtime with Clackly and move the existing Python Script execution path, including Export to After Effects, onto that Runtime so end users do not need a system Python and cannot accidentally select one through PATH, Conda, uv, or Microsoft Store aliases.

## Background

- The current production flow is `Feature -> Capability -> ScriptCapabilityProvider -> ScriptExecutor -> PythonProvider -> child_process.spawn -> python_runner.py -> Resolve Script API -> After Effects`.
- `PythonProvider` currently defaults to bare `python`, owns process startup/protocol parsing, and both production hosts register it without an executable override.
- Phase 6.5A provides the Manifest, Registry, deterministic Resolver, authoritative executable-only Override, and typed selection errors.
- Phase 6.5B provides the isolated short-lived Launcher, allowlisted child environment, bounded protocol/process diagnostics, timeout handling, and native-crash containment.
- Phase 6.5C provides the Resolve compatibility Probe, success-only Probe Cache, material fingerprint invalidation, and native bridge crash mapping. It verified Resolve `20.3.2.9`, bridge `20.3.2`, and CPython `3.13.1` x64 on the current machine.
- The current Manifest names CPython `3.13.1`, but the payload is absent. The repository also has no Electron packaging tool; its existing install script copies or links the source tree.
- Official CPython `3.13.14` Windows x64 Embeddable Package is available at `https://www.python.org/ftp/python/3.13.14/python-3.13.14-embed-amd64.zip` with SHA-256 `90b4e5b9898b72d744650524bff92377c367f44bd5fbd09e3148656c080ad907`, plus official Sigstore and SPDX sidecars.
- The reported Export crash is a Windows native access violation caused when PATH selected CPython 3.11 while Resolve loaded a Python 3.13 bridge. CPython patch-family compatibility must therefore be proven by a real Probe and export, not inferred from `3.13.x`.

## Requirements

### R1. Production execution chain

- The production chain must become `Export to AE Feature -> Capability -> Execution Provider -> PythonProvider -> RuntimeManager -> RuntimeResolver -> Probe Cache -> Isolated Python Worker -> Resolve Script API -> After Effects`.
- `RuntimeManager` is the single orchestration owner for resolution, Probe/cache use, and isolated script execution.
- Existing Registry, Resolver, Launcher, Probe, Probe Cache, Bootstrap, ConfigStorage, logging, configuration snapshot, Script Context, and result protocols must be reused.

### R2. PythonProvider boundary

- `PythonProvider` may validate the trusted relative script entry, translate the existing Script request into a Runtime request, call `RuntimeManager`, replay log records, return the existing result, and map Runtime failures into the existing Capability-facing `Error` contract while preserving stable Runtime fields.
- It must not start Python, read/search PATH, guess Python versions, implement Conda/uv/Microsoft Store compatibility, hard-code Resolve/Python mappings, Probe compatibility, or maintain Runtime cache state.
- `ScriptCapabilityProvider`, `ScriptExecutor`, Capability-scoped configuration, `ScriptContext` public attributes, log levels, script error envelope, and successful JSON result contract remain compatible.

### R3. Runtime selection, Override, and isolation

- Manifest selection remains deterministic by runtime, platform, architecture, Capability id, and live Resolve host/version conditions.
- The live Resolve version must come from the host/Resolve boundary, never a PythonProvider or Feature constant.
- An explicitly configured executable-only Override is authoritative. A correct Override may execute only after a successful Probe and remains `overridden` with `CUSTOM_RUNTIME_UNVERIFIED`; an invalid or missing Override fails without Manifest or PATH fallback.
- The Runtime child environment must remain the Phase 6.5B allowlist and must exclude PATH, Python environment variables, virtual environments, Conda, uv, and unrelated parent state.
- Missing managed files return `RUNTIME_NOT_FOUND` / `missing-runtime`. Probe or execution native crashes remain inside the worker and preserve bounded diagnostics while Clackly stays alive.

### R4. Runtime qualification and release selection

- CPython `3.13.14` Windows x64 Embeddable Package is the mandatory first candidate.
- Qualification requires three independent proofs: final-package identity and Probe execution under hostile PATH/Conda/Python settings; automated proof that the isolated worker cannot launch AE and the host-owned launcher uses the normal Electron environment; and post-fix real warm/cold Export-to-AE sends from the packaged Workflow Integration without the prior Preferences/CEP errors.
- Every proof must pass, and membership in the same `3.13.x` family never substitutes for a real compatibility run. A redundant hostile-parent GUI actual-send is not required when those independent Runtime-isolation, process-boundary, and real-GUI proofs are all recorded.
- If all checks pass, `3.13.14` becomes the first formal Managed Runtime with release status `current`.
- If `3.13.14` fails while the previously verified `3.13.1` passes the same packaged-artifact checks, release `3.13.1` with release status `legacy-pinned`, retain the complete `3.13.14` failure evidence, and create a blocking follow-up security-upgrade task.
- If neither version passes, Phase 6.5D is not complete and no Managed Runtime release may be claimed.

### R5. Reproducible Runtime staging and packaging

- Commit a version lock file containing selected candidate metadata, official HTTPS asset/sidecar URLs, platform/architecture, exact SHA-256, and release status. Do not commit the Runtime ZIP or expanded binaries.
- A Windows build script must download the locked ZIP or reuse an exact build-cache entry, verify SHA-256 before extraction, fail closed on mismatch/missing input, and never find or substitute a development-machine Python.
- Staging must configure `python313._pth` without enabling ambient `site`, include the required Clackly Bootstrap/runner/Feature Python sources, and generate a final `runtime.json` describing source, version, architecture, hash, release status, staged paths, and build provenance.
- Include the CPython LICENSE, a third-party notice, the official CPython SPDX sidecar, and an application SBOM generated from the committed npm lockfile.
- Package the selected Runtime as a real Electron external resource under `process.resourcesPath/runtimes`; `python.exe` and required Python sources must not live inside asar.
- Final artifact verification must inspect the packaged layout and execute the packaged Runtime. Source-tree or system-Python-only evidence is insufficient.

### R6. Probe and cache policy

- Resolve-dependent execution requires a successful Phase 6.5C Probe before business script execution. Only passed results are reusable, and a cache hit starts no Probe process.
- Clackly version, Runtime id/version/executable mtime, live Resolve version, bridge canonical paths/mtimes, platform, architecture, or Override changes invalidate a cached success.
- Failed/native-crash Probes, corrupt/incompatible cache records, and forced diagnostics never become reusable hits.

### R7. Export to After Effects and documentation

- `scripts/resolve2ae_export.py` and `resolve2ae_core` retain only existing Command/mode mapping, AE path validation, prefix normalization, Resolve timeline access, export, and result handling.
- The configured `ae.export.aePath` remains the After Effects executable used by the export flow.
- Add `docs/managed-python-runtime.md`, `docs/resolve-python-matrix.md`, `docs/resolve-python-runtime-troubleshooting.md`, and `docs/ADR-managed-python-runtime.md`.
- Document chains, module ownership, asset/version lock, selection/Override rules, Probe/cache rules, error codes, current compatibility matrix, troubleshooting, rollback, incomplete work, and residual risks.

## Acceptance Criteria

- [ ] A normal Python Script Feature executes through `PythonProvider -> RuntimeManager -> RuntimeLauncher` with unchanged Context, configuration, logs, script errors, and result contracts.
- [ ] The final packaged artifact contains exactly the locked Managed Runtime outside asar, with matching `runtime.json`, LICENSE/notices, official CPython SPDX, application SBOM, and no source-tree/runtime-cache dependency.
- [ ] The staging build fails on a missing asset, SHA-256 mismatch, malformed lock, incomplete payload, or attempted system-Python substitution.
- [ ] CPython 3.13.14 receives separate recorded evidence for runtime identity, x64 architecture, Resolve 20.3.2 Bridge import, Resolve connection, and real Export to AE sending.
- [ ] If 3.13.14 passes, the final Manifest selects it as `current`; if it fails and 3.13.1 passes, the final Manifest selects only 3.13.1 as `legacy-pinned`, records the failure, and links the security-upgrade blocker.
- [ ] With system Python hidden/uninstalled, Python entries removed from PATH, Conda active, and PATH separately pointed to Python 3.11, the final packaged verifier uses the Manifest executable and completes isolated runtime identity/Probe checks without fallback.
- [ ] Automated host-boundary tests prove the Runtime worker retains its isolated allowlist while After Effects is launched only by Electron with the normal host environment.
- [ ] Post-fix real exports pass both with After Effects already running and with AE closed and host-launched, without recurrence of the Preferences/CEP errors.
- [ ] A missing Managed Runtime returns actionable `RUNTIME_NOT_FOUND` / `missing-runtime` without fallback.
- [ ] A valid Override executes after Probe and retains unverified provenance; an invalid/missing Override fails without Manifest or PATH fallback.
- [ ] Probe native crash returns `RUNTIME_NATIVE_BRIDGE_CRASH`, leaves the Clackly process alive, clears reusable cache state, and permits a later re-Probe.
- [ ] Resolve or Bridge changes invalidate the prior Probe success.
- [ ] Existing Runtime, Python Script, Capability, Resolve2AE, full Node/Python tests, Python compilation, production build/package, syntax, whitespace, and boundary checks pass.
- [ ] Final reporting lists before/after chains, added/modified modules, selection and Probe/cache rules, Runtime and build error codes, exact test results, compatibility matrix, unfinished items, and residual risks.

## Out of Scope

- Product runtime downloader, automatic updater, online Runtime catalog, or multi-Runtime lifecycle management.
- Runtime binaries committed to source control.
- Python implementations other than CPython; non-Windows release qualification.
- Long-lived workers, pools, retries, PATH fallback, background Probe, polling, watchers, or telemetry.
- Rewriting Resolve2AE business logic or output formats.
- A Runtime settings UI; the advanced executable-only Override remains a documented operator configuration seam.

## Key Product Decisions

- Payload distribution is part of 6.5D because no-system-Python execution is a release acceptance criterion.
- Version selection is evidence-gated: 3.13.14 is preferred but not pre-approved; 3.13.1 is fallback-only and must be visibly legacy-pinned.
- Distribution is build-time only. Runtime download/update never occurs in the product process.
