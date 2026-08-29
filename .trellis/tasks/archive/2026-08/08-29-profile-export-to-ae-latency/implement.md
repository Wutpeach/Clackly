# Export to AE Latency Profiling Implementation Plan

## 1. Baseline and Temporary Recorder

- [x] Confirm a clean worktree and preserve the current packaged/export test baseline.
- [x] Add a temporary bounded JSONL recorder with one invocation-scoped trace, monotonic Node timings, diagnostic-only file errors, and exact allowed-field filtering.
- [x] Add focused recorder tests for schema bounds, concurrent trace isolation, failure outcomes, and rejection of paths/JSX/config/raw messages.

## 2. Node Phase Timings

- [x] Wrap Workflow `executeWorkflowCommand()` to capture the outer total without changing its return/error behavior.
- [x] Split RuntimeManager preparation into host-context, resolver, and Probe-readiness durations; retain Probe cache disposition.
- [x] Surface the existing successful RuntimeLauncher child `durationMs` only to the internal trace.
- [x] Split AfterEffectsLauncher work into validation/temp write, running-state detection, and spawn acknowledgement; retain only `running|cold` state.
- [x] Assert public Capability/IPC results and controlled errors remain byte-for-byte equivalent apart from the absent internal profiling transport.

## 3. Python Phase Timings

- [x] Add coarse `perf_counter()` phase measurement for Resolve/project acquisition, target scan, OTIO export, OTIO parse, and per-clip/JSX generation.
- [x] Return only bounded numeric phase data, stable tokens, and target-clip count in a temporary private field.
- [x] Validate and strip that field in RuntimeManager before Provider/public delivery.
- [x] Update exact Core/wrapper/runtime tests to prove generated JSX and public seven-key results are unchanged.

## 4. Automated Qualification

- [x] Run focused Node tests for Command execution, RuntimeManager/Launcher/Probe, AfterEffectsLauncher, and Workflow composition.
- [x] Run Python wrapper and Resolve2AE core suites, including existing golden exports.
- [x] Run the full Node/Python test suite, build, package verification, and `git diff --check`.
- [x] Confirm a synthetic record's non-overlapping phases account for total within max(20 ms, 5%).

## 5. Real Packaged Sampling

- [x] Build and install the diagnostic Workflow package before asking the user to test.
- [x] Ask the user to restart Resolve manually and use a local project only.
- [x] Capture real AE-running samples on stable timeline state; five default and four audio-only records were retained, and video-only sampling was stopped after two repeated audio Runtime timeouts with the user's approval.
- [ ] Optionally capture one labeled AE-closed control without treating startup as warm-send latency.
- [x] Copy the bounded JSONL to `evidence/`, verify no prohibited fields, and record package identity and test scenario.

## 6. Analysis and Cleanup

- [x] Compute median/range by phase and mode; separate fixed shared cost from clip/OTIO-dependent cost to the extent supported by the valid top-level measurements.
- [x] Rank contributors and write an evidence-backed next optimization experiment with estimated maximum upside and correctness risk.
- [x] Remove all temporary profiling code and tests, then rerun the full qualification gate.
- [x] Rebuild and reinstall the clean Workflow package, leaving the user on a non-profiled build.
- [x] Verify final product/public contracts match the pre-task baseline and retain only task artifacts/evidence in the final diff.

Cleanup qualification on 2026-08-29: the post-removal full suite passed (352 Node tests and Python suites 6 + 26 + 15 + 32 + 2), the clean managed Runtime was restaged, `package:win` and `package:verify` passed, source/staging/package hashes matched for both Export-to-AE Python files, and the packaged and installed Workflow contained no profiling markers or temporary modules. The clean package was installed after confirming Resolve and After Effects were not running. The live JSONL matched the retained evidence SHA-256 and was moved to the Recycle Bin. The required spec review concluded that no `.trellis/spec/` update is appropriate: this task introduced no persistent implementation contract, and its measurement limitation plus follow-up guidance are already retained in the task evidence rather than promoted into product coding standards.

## Rollback Points

- Before packaged sampling: remove the temporary recorder and timing hooks if any automated contract or privacy check fails.
- After packaged sampling: retain copied evidence, remove instrumentation, and reinstall the clean package even if the measurements are inconclusive.
- Do not begin an optimization in this task; open a separate task after the profiling report is reviewed.
