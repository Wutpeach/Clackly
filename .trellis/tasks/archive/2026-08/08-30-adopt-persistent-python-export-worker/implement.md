# Implementation Plan

## 1. Recreate the qualified persistent Runtime boundary

- [x] Export only the narrow pure Runtime helpers needed to keep native-Python crash classification identical; do not refactor the PowerShell probe state machine.
- [x] Recreate `PersistentScriptLauncher` and `persistent_bootstrap.py` from the archived B contracts with strict READY/PREPARED/execute schemas, 1 MiB envelope support, bounded FIFO, health identity, close-before-settle, later replacement, cleanup, and idempotent disposal.
- [x] Keep every PowerShell protocol, validation, error, timer, prewarm, and lifecycle test unchanged except for import-only proof that shared pure helpers preserve behavior.

## 2. Contract Export-to-AE to the three current actions

- [x] Remove current-only, explicit Blue-range, and Cyan-range Command metadata plus their Python policy entries; keep only mixed, audio-only, and video-only.
- [x] Extend one-time binding migration so exact historical shipped-default shapes rewrite directly to `DEFAULT_BINDINGS`, while customized legacy roots are backed up and rewritten to mixed, video-only, or audio-only respectively, with no legacy id retained after load.
- [x] Prove all three supported actions use the existing automatic Blue-duration-range selection and playhead fallback, while Cyan markers remain ignored.
- [x] Inject the persistent launcher at `RuntimeManager`'s business execution seam for Windows, capability `ae.export`, the fixed Resolve2AE entry, and the three supported Command ids.
- [x] Keep Runtime Probe/readiness, other scripts, unsupported entries, and non-Windows execution on the one-shot launcher.
- [x] Preserve existing script-envelope validation, private AE launch-plan stripping, host launch ownership, public results, logs, and errors.
- [x] Reacquire Resolve/project/timeline per request and retire the worker after a real `ResolveAdapterError` before settling its exact envelope.

## 3. Give both hosts the same lifecycle

- [x] Let `createClacklyCore()` own the Python worker and expose only best-effort preparation and disposal functions.
- [x] Start no-Resolve preparation asynchronously after readiness in Workflow Integration and standalone without delaying Palette, IPC, hotkey, Workflow initialization, or the PowerShell helper.
- [x] Dispose Python and PowerShell independently during `will-quit`; prove neither process survives host shutdown.

## 4. Rebuild the permanent qualification suite

- [x] Cover READY/PREPARED, exact schemas, ids, malformed UTF-8/JSON, extra frames, request/response/stream bounds, queue capacity, FIFO order, timers, spawn/stdin/stdout/EOF failures, native crash, and disposal.
- [x] Prove no same-command retry, timeout close/cleanup, queued rejection, immediate later replacement, health-key replacement, and prepared-worker health adoption.
- [x] Prove preparation of the actual Resolve2AE entry never touches Resolve and every business request receives fresh context/config/log state.
- [x] Assert byte-identical public result and JSX across one-shot and persistent execution for all three policies in playhead and Blue-range fixtures, including a response above 64 KiB and below the 1 MiB limit.
- [x] Cover default and customized binding migration, collision/backup behavior, registry absence, policy-map absence, and rejection of direct execution for all three retired ids.
- [x] Run repeated-request memory/state soak and real managed-worker timeout/`ResolveAdapterError` recovery with zero worker directories and zero installed-host child-process orphans; see `evidence/final-installed-acceptance-and-recovery.md`.
- [x] Run the full Node/Python suite, production build, syntax/compile checks, diff/privacy/boundary searches, verify `resolve2ae_core` remains unchanged, and constrain the wrapper diff to retired policy removal.

## 5. Make the managed package authoritative

- [x] Stage and verify `persistent_bootstrap.py` in the locked managed Runtime inventory and package it outside asar.
- [x] Build and verify the Windows package, including exact source/staged/package hashes and hostile-environment execution.
- [x] Update backend Runtime specs with the permanent persistent Export-to-AE contract while retaining the one-shot Probe/other-script boundary and separate PowerShell scenario.

## 6. Installed product acceptance

- [x] Confirm Resolve and AE are closed, install the verified Workflow package, and verify installed hashes and both host lifecycle wiring.
- [x] Retain the archived A/B measurements as quantitative authority and separately record the 2026-08-30 user-reported qualitative installed acceptance; no fresh timing is claimed.
- [x] Keep first-use attribution in the archived quantitative analysis; the final user report is qualitative and is not reclassified as a timing sample.
- [x] Record the user's 2026-08-30 `验收通过` report as qualitative final installed real-host acceptance; it does not assert a live same-process Resolve restart.
- [x] Run the installed timeout/no-retry/later-replacement and real `ResolveAdapterError` recovery harness, then verify no installed Python or PowerShell orphan; see `evidence/final-installed-acceptance-and-recovery.md`.
- [x] Record final source/package/installed identity, archived quantitative authority, qualitative user acceptance, recovery, memory/soak, and cleanup evidence.

## 7. Finish

- [x] Run the final full-scope Trellis check across Runtime, Core, both hosts, PowerShell probe compatibility, packaging, specs, and task evidence.
- [ ] Commit the adopted product/spec changes, archive the task, and record the session journal without pushing.

## Rollback points

- Before installation: reject the candidate on any public-result/JSX drift, PowerShell regression, retry, unbounded state/output, orphan, packaging mismatch, or failure to replace only on a later command.
- During installed acceptance: restore the one-shot A package if steady latency exceeds 200 ms, preparation fails, AE output is wrong, recovery requires a second failure, or either child survives host shutdown.
- Rollback removes only the persistent-Python boundary and restores the RuntimeManager routing default; the command contraction remains an independently testable product decision and never changes Resolve2AE core feature logic or the accepted PowerShell helper.
