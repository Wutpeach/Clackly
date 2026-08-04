# Phase 6.5D Implementation Plan

## Preconditions

- [ ] User approves the final PRD/design/implementation summary in a subsequent message.
- [ ] Run `task.py start` only after that approval.
- [ ] Dispatch implementation with the curated Trellis context; preserve unrelated `.claude/` and `08-03-fix-resolve2ae-export-crash/` work.

## 1. Baseline and release inputs

- [ ] Run current focused Runtime/Provider/Resolve2AE tests, full `npm test`, Python compilation, Vite build, and `git diff --check`.
- [ ] Record the current machine Resolve/bridge/AE paths and whether a live export selection is safe/available.
- [ ] Add task-local evidence for official 3.13.14 URLs, SHA-256, SPDX/Sigstore, license source, and package-tool choice.

Rollback point: no product files changed before a green or documented baseline.

## 2. Add deterministic Runtime staging and package configuration

- [ ] Commit the Windows x64 lock file with 3.13.14 candidate metadata and exact official SHA-256.
- [ ] Add the PowerShell staging script using explicit lock/cache/staging paths, SHA-256 verification before extraction, fresh staging, exact required-file checks, `_pth` configuration, Clackly Python source injection, deterministic `runtime.json`, license/notices, official SPDX, and application SBOM.
- [ ] Add build-script tests for malformed lock, cache hit, download failure seam, hash mismatch, incomplete ZIP/payload, `_pth`, source exclusions, metadata, and no Python/PATH lookup.
- [ ] Add electron-builder as the sole packaging dependency/configuration, unpack the app for Workflow Integration compatibility, and copy only staged Runtime external resources.
- [ ] Ignore generated cache/staging/release files and add artifact-layout verification.

Rollback point: staging tests and source build must pass before production Runtime wiring.

## 3. Add RuntimeManager and script-execute Bootstrap operation

- [ ] Add `runtime/manager.js` composing the existing loader/Resolver/Probe/cache/Launcher with injected seams.
- [ ] Validate the Runtime request, authoritative Override, live host context, Probe readiness, and single execution launch without PATH or retry.
- [ ] Extend Bootstrap with `script-execute`, staged-root containment, runtime identity, and a nested existing script envelope by reusing `python_runner`.
- [ ] Preserve `runtime-info` and `resolve-probe` byte-for-byte behavior where their contracts are unchanged.
- [ ] Add focused Node/Python tests for success, script failure, malformed envelope, Resolve Probe failure, cache hit, native crash containment, entry escape, and defensive Runtime errors.

Rollback point: RuntimeManager/Bootstrap tests plus all 6.5A-6.5C tests pass before provider switching.

## 4. Switch PythonProvider and host composition

- [ ] Pass Capability id internally without changing the public ScriptContext.
- [ ] Replace PythonProvider spawn/cache/protocol ownership with request translation, manager call, log replay, result translation, and Runtime error field preservation.
- [ ] Remove `pythonExecutable`/`spawnProcess` production seams and every bare-Python behavior/test expectation.
- [ ] Compose one RuntimeManager per host with packaged/development Runtime root, AppData Probe cache, package version, live Resolve version provider, and explicit optional Override.
- [ ] Keep `RESOLVE_COMMAND_CENTER_PYTHON_CMD`, PATH, Conda, uv, and Store aliases out of the new chain.
- [ ] Update integration tests so an ordinary Python Feature and bundled AE Feature traverse the real Manager/Launcher contract.

Rollback point: both host composition tests, provider tests, integration tests, and full existing Script Context tests pass.

## 5. Qualify and select the release Runtime

- [ ] Stage/package CPython 3.13.14 from the locked asset; do not use a locally installed interpreter.
- [ ] From the packaged paths run runtime-info and record exact version, x64 architecture, executable, payload hash, `_pth`, runtime.json, and license/SBOM inventory.
- [ ] With Resolve 20.3.2 running, run the isolated Probe twice and record miss/hit plus bridge/application/version evidence.
- [ ] Verify final-package runtime identity and Probe behavior with system Python hidden/uninstalled, Python entries removed from PATH, Conda active, and PATH pointed to Python 3.11; record the exact Manifest executable without launching a GUI.
- [ ] Verify automated Manager/Launcher coverage keeps the Runtime worker allowlist unchanged and launches AE only from the Electron host environment.
- [ ] Launch final packaged Clackly through Workflow Integration and record sanitized post-fix real exports for both warm AE and cold host-launched AE, including absence of the prior Preferences/CEP errors.
- [ ] Treat those three independent proofs as the release gate; do not require a redundant hostile-parent GUI actual-send after the user-approved final release decision.
- [ ] If all pass, promote 3.13.14 lock/Manifest/runtime metadata to `current`.
- [ ] If any 3.13.14 compatibility step fails, retain complete sanitized evidence, pin the official 3.13.1 asset SHA-256, repeat every packaged test, and only on full success select `legacy-pinned` plus create/link the P1 security-upgrade blocker.
- [ ] If neither candidate passes, stop without claiming completion or falling back further.

## 6. Regression and failure matrix

- [ ] Verify missing payload -> `RUNTIME_NOT_FOUND`; malformed/missing Override -> no Manifest/PATH fallback; valid Override -> Probe plus unverified warning.
- [ ] Verify Probe abort/native crash leaves the main process alive, clears cache, and a later request re-Probes.
- [ ] Verify Clackly/runtime/Resolve/bridge/Override fingerprint changes invalidate cache and unchanged packaged inputs do not spawn a second Probe.
- [ ] Verify script execution native crash is bounded by Launcher and never retried.
- [ ] Search production code/build scripts for bare `python`, `python3`, `py`, `where python`, `which python`, PATH selection, Conda/uv compatibility, duplicate spawn, duplicate Probe, and duplicate cache implementations.

## 7. Documentation and quality gate

- [ ] Add the four requested docs with final selected version/status, full error table, exact compatibility evidence, staging/package instructions, troubleshooting, rollback, unfinished work, and risks.
- [ ] Update README build/install/troubleshooting references without duplicating the detailed docs.
- [ ] Run focused Node tests for Runtime/Probe/Launcher/Provider/package/integration.
- [ ] Run Python unittest suites and compile every staged production Python source with the selected packaged Runtime, not PATH Python.
- [ ] Run full `npm test`, Vite build, electron-builder package, application SBOM generation, artifact verification, Node syntax checks, `git diff --check`, and boundary searches.
- [ ] Dispatch full-scope Trellis check; fix verified findings and rerun affected/full gates.
- [ ] Update the backend Runtime spec with settled integration/distribution contracts and prepare the requested final report.

## Required validation commands

Exact new script names may be finalized during implementation, but the gate must expose reproducible equivalents of:

```powershell
npm test
npm run build
npm run runtime:stage
npm run package:win
npm run package:verify
npm sbom --package-lock-only --omit=dev --sbom-format=spdx --sbom-type=application
node --test script-runtime/runtime*.test.js script-runtime/providers/PythonProvider.test.js
<packaged-python.exe> -I -m unittest discover -s script-runtime -p "test_*.py"
<packaged-python.exe> -I -m unittest discover -s resolve2ae_core/tests -p "test_*.py"
git diff --check
```

## Risky files and review focus

- Runtime lock/staging: supply-chain integrity, fail-closed hashing, deterministic output, safe target paths, and no dev-Python substitution.
- `_pth`/staged source layout: stdlib plus Clackly imports must work without `site`, PATH, or source tree.
- `runtime/manager.js`: exact resolution -> Probe -> execution order; no duplicate state or fallback.
- `bootstrap.py`/`python_runner.py`: one stdout envelope and separation of script failure from process/native failure.
- Host composition: live Resolve version, packaged `process.resourcesPath`, AppData cache, and no hard-coded compatibility version.
- Packaging: Workflow Integration launchability and Runtime outside asar are live release gates.

## Completion gate

- [ ] Every PRD acceptance criterion has automated and/or recorded packaged live evidence.
- [ ] One candidate is fully qualified and selected, or the task remains incomplete.
- [ ] Full Trellis check passes after fixes.
- [ ] Final report includes every user-requested chain/module/rule/code/test/matrix/risk item.
