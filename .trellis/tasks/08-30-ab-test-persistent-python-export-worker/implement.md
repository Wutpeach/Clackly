# Implementation Plan

## 1. Persistent protocol and worker

- [x] Define versioned READY/PREPARED/request/response schemas, safe request ids, byte/line/queue limits, health key, process evidence, and stable error mapping.
- [x] Add `persistent_bootstrap.py` with EOF-driven loop, strict decoding/validation, prepare-without-Resolve, per-request runner execution, and protocol-only stdout.
- [x] Add `PersistentScriptLauncher` with isolated spawn, non-blocking prewarm, FIFO serialization, per-request timeout, output bounds, crash/EOF handling, queued-work rejection, next-command restart, and idempotent disposal.
- [x] Reuse only narrow pure Runtime helpers where it avoids divergent crash/environment behavior; do not change `RuntimeLauncher` pooling semantics or extract a generic supervisor.

## 2. Runtime and host composition

- [x] Inject the B launcher only at RuntimeManager's business `script-execute` seam; keep Runtime Probe on the existing launcher.
- [x] Make Export-to-AE the only B consumer and preserve other Python Capability behavior unless the exact routing contract requires an explicit safe fallback.
- [x] Add Core-owned prewarm/disposal methods and wire both hosts after readiness/at `will-quit`, separately from the PowerShell helper.
- [x] Ensure prewarm loads Runtime/entry dependencies and platform identity without connecting to Resolve or delaying Palette/IPC/hotkey/Workflow readiness.

## 3. Correctness and failure qualification

- [x] Cover READY/PREPARED, strict schemas, wrong ids, malformed UTF-8, extra frames, stream/line/queue limits, spawn/stdin errors, timeout kill, crash/EOF, FIFO ordering, queue rejection, health-key replacement, prewarm failure recovery, and disposal.
- [x] Prove per-request Resolve/project/timeline reacquisition and no cross-request config/log/result/JSX state.
- [x] Prove forced timeout has no retry and the next new command starts exactly one replacement and succeeds.
- [x] Prove same-version Resolve restart allows at most one controlled first failure and then recovers through replacement.
- [x] Run a repeated-request memory/state soak and assert no unbounded retained arrays/maps/modules/temporary directories or orphan child.
- [x] Assert byte-identical public result and JSX snapshots across A and B for all six policies.
- [x] Lead-review repair: align persistent response framing with the bounded 1 MiB Runtime stdout/JSX envelope and reject over-budget output closed.
- [x] Lead-review repair: retire a ResolveAdapterError worker through close/cleanup before settling its exact script envelope, so the immediate next command creates one replacement.
- [x] Lead-review repair: retain bounded request-local/startup stderr and match the one-shot Windows exit-code-3 Fatal Python error native-crash mapping.
- [x] Lead-review repair: cap diagnostic durations, require an existing diagnostic target to be a regular file, and keep file failures silent.
- [x] Lead-review repair: prove the actual Export-to-AE prepare path avoids Resolve and that python_runner transports ResolveAdapterError exactly.

## 4. Diagnostic B candidate

- [x] Add a temporary bounded privacy-safe B recorder for command total, persistent request duration, worker warm/restart state, Probe cache, AE state, and outcome.
- [x] Run focused Node/Python tests, full `npm test`, Python compilation, Node syntax, production build, diff/privacy/boundary checks, and source snapshot comparisons.
- [x] Stage the managed Runtime including the persistent Bootstrap, package Windows, verify exact Runtime inventory, and confirm package/source hashes.
- [x] Confirm Resolve and AE are closed, then install the B diagnostic Workflow.

## 5. Real-host A/B and recovery gates

- [x] Ask the user to open the same local-project timeline with AE running and collect one B warm-up plus steady default/audio samples; the user stopped at six successful serial exports after the improvement was clear.
- [x] Compare B with archived corrected A and require <=200 ms default median, >=250 ms improvement, and <=35% Python ratio.
- [ ] Ask the user to inspect imported AE composition parity.
- [x] Run the controlled forced-timeout recovery gate without retrying the failed command: the installed managed worker returned `RUNTIME_TIMEOUT` at 10,103.863 ms, then one later safe command created exactly one replacement and succeeded.
- [x] Qualify the approved same recovery mechanism through an actual `ResolveAdapterError` from the installed Python runner: its worker retired before envelope settlement, queued work rejected, and an immediate later command succeeded through one replacement. A live same-version Resolve restart was not performed because quitting Resolve closes the owning Workflow host and worker.
- [x] Retain raw bounded performance evidence, package hashes, medians/ranges, and the performance-gate decision; correctness/recovery and clean-restoration evidence remain pending.

## 6. Mandatory restoration

- [x] Remove the B launcher, persistent Bootstrap, host lifecycle wiring, temporary recorder, A/B switch, staging/verification additions, and all experiment-only tests.
- [x] Restore exact A product behavior and rerun the complete automated/privacy/boundary qualification.
- [x] Restage, rebuild, package, verify, and reinstall clean A while Resolve and AE are closed.
- [x] Verify source/package/installed hashes, no B/profiling markers, no live diagnostic file, and no orphan Python worker.

## 7. Finish

- [x] Keep the measured persistent-worker candidate in task evidence rather than backend specs because clean A remains the current product authority; permanent adoption requires a separate task.
- [ ] Commit only bounded task evidence plus any approved lasting spec update.
- [ ] Archive and journal the task after clean-A restoration and user review of the A/B conclusion.

## Rollback points

- Before B install: reject the candidate on any protocol, privacy, isolation, result/JSX, memory, or package-identity failure.
- During host testing: stop on unexpected Resolve/AE behavior, retry, orphan, second recovery failure, or output mismatch; close hosts and restore clean A.
- After evidence capture: restore clean A regardless of B performance. Adoption is a separate task.
