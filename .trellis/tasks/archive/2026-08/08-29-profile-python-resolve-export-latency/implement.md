# Implementation Plan

## 1. Diagnostic contracts

- [x] Define the exact versioned Node record, Python success profile, and stderr phase-line schemas with allowlisted tokens and hard limits.
- [x] Add tests for millisecond conversion, malformed/oversized input, unknown fields, non-finite values, ring length, concurrent invocation isolation, and public-result stripping.
- [x] Add a controlled timeout fixture proving completed phases and the last-call ring survive without a success envelope.

## 2. Temporary instrumentation

- [x] Restore the prior bounded invocation-scoped Node command recorder without restoring the obsolete per-export PowerShell timing assumptions.
- [x] Instrument Runtime/host boundaries using monotonic deltas and preserve the existing Runtime process duration.
- [x] Instrument Bootstrap/runner/Resolve2AE phases and aggregate per-call buckets without retaining user data.
- [x] Parse failure-safe fixed-prefix stderr records at the Runtime boundary and keep raw stderr/public errors unchanged.
- [x] Verify the six command-policy triples, seven-key result, generated JSX snapshots, Runtime timeout, one-process isolation, and AE launch plan remain unchanged.

## 3. Automated qualification

- [x] Run focused Node and Python profiling/Runtime/Resolve2AE tests.
- [x] Run the full `npm test` suite and all Python suites.
- [x] Run `python -m py_compile` for changed Python files, `node --check` for changed JavaScript, `git diff --check`, privacy searches, and public-contract snapshot comparisons.
- [x] Build and stage the managed Runtime, package Windows, and run package verification.

### Lead-review repair (2026-08-29)

- [x] Add failure-safe checkpoints for current-time/track/item/clip scan calls and linked-item track/enabled checks.
- [x] Refresh the private success carrier after measured result serialization so `result-encoding` is present in successful records.
- [x] Remove only valid fixed-prefix profiling lines from Runtime failure details after extracting their bounded evidence.
- [x] Enforce a 512 KiB total JSONL cap, including exact-boundary and over-budget tests.

## 4. Real-host sampling

- [x] Confirm Resolve and After Effects are closed, then install the diagnostic Workflow.
- [x] Ask the user to open a local project and stable timeline, then perform the labeled warm-up and requested mixed/audio/video sampling matrix.
- [x] Require any captured failure to contain completed Python phases and the bounded last-call ring; repeat the transport check if it does not.
- [x] Copy the bounded JSONL into task evidence with a SHA-256 hash and record any user-approved sampling deviation.

## 5. Analysis and decision gate

- [x] Calculate per-mode medians/ranges, nested accounting gaps, phase shares, and workload counts.
- [x] Identify the dominant fixed and variable Python/Resolve costs and the narrowest supported audio-timeout boundary.
- [x] Rank optimization candidates with measured maximum upside, correctness risk, and an explicit implementation gate.
- [x] Keep optimization implementation out of this task.

## 6. Cleanup and restoration

- [x] Remove every temporary recorder, carrier, timer, parser, test fixture, and profiling marker from product source.
- [x] Rerun the complete automated qualification and privacy/boundary sweep on clean source.
- [x] Restage, rebuild, package, verify, and reinstall the clean Workflow while Resolve and AE are closed.
- [x] Verify source/package/installed hashes for affected production files and retain only bounded task evidence.

## 7. Finish

- [x] Run final Trellis quality review and record any reusable Runtime/Resolve profiling contract in backend specs only if it remains valid after cleanup.
- [ ] Commit task-scoped evidence and any approved lasting spec changes in reviewable batches.
- [ ] Archive the task and record the session after user acceptance of the clean installed Workflow.

## Rollback Points

- Before diagnostic install: discard profiling source if privacy, contract, or timeout-fixture gates fail.
- During sampling: stop on export regression or missing failure evidence; reinstall the prior clean Workflow.
- After analysis: remove instrumentation regardless of whether an optimization candidate is selected.
