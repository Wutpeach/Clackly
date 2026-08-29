# Python and Resolve Export Latency Profiling Design

## Design Summary

Build a temporary diagnostic Workflow that combines the already validated Node command-level timing model with corrected Python millisecond timings and failure-safe stderr phase stamps. The normal success envelope carries a private validated profile for detailed aggregation; Runtime timeout and failure paths recover only bounded, privacy-safe phase records from retained stderr. All profiling carriers are stripped before normal callers observe results or errors.

The diagnostic code is not a product feature. After local real-host sampling and analysis, remove it, verify source and package cleanliness, and reinstall the clean Workflow.

## Timing and Correlation Model

- Generate one invocation-scoped trace id in the Workflow command boundary.
- Use `process.hrtime.bigint()` for Node deltas and `time.perf_counter()` for Python deltas.
- Convert every Python delta with `round((end - start) * 1000, 3)` before transport.
- Aggregate nested durations only; never subtract a Node timestamp from a Python timestamp.
- Keep the prior Node top-level phases: command total, host context, Runtime resolve, Probe readiness, Python process, AE detect-running, AE spawn acknowledgement, and unattributed host time.
- Record stable counts such as target clips, track count, item count, and call count. Do not record source names or values.

## Python Phase Boundaries

The coarse phase model must cover:

1. Bootstrap, runner, and entry import/setup.
2. AE path validation and LUT-directory resolution.
3. `get_resolve()` / `scriptapp("Resolve")` connection.
4. project manager, current project, and current timeline acquisition.
5. timeline metadata and current-time/range facts.
6. video-track enumeration and item bounds.
7. audio-track enumeration and item bounds.
8. OTIO export and OTIO parse as separate phases when video exists.
9. per-clip data and JSX generation, with aggregate count/sum/min/max buckets for stable call kinds such as media-pool item, file path, input LUT, resolution, offsets, duration, and linked items.
10. result JSON encoding and transport.

Timers remain aggregate. Do not emit one retained record per clip or put raw Resolve values into diagnostics.

## Failure-Safe Evidence Channel

- Save the real `sys.__stderr__` before runner redirection and emit compact, flushed lines with a fixed prefix and stable token grammar.
- Emit a line only at phase completion or bounded call-boundary checkpoints. Maintain an in-memory ring containing at most the last eight stable call tokens.
- On success, also return a reserved private profile field in the normal envelope. RuntimeManager validates the exact schema and strips it before Provider/Capability/IPC output.
- On timeout or child failure, RuntimeLauncher already retains bounded stderr. The profiling parser extracts only valid fixed-prefix lines, rejects unknown tokens/fields, and attaches sanitized evidence to the task recorder without changing the public Runtime error.
- Cap line count, line length, total parsed bytes, counts, and ring length. Malformed or excessive profile data is ignored or converted to a stable diagnostic outcome and must never alter export behavior.

## Privacy and Contract Boundaries

Allowed data is limited to schema version, trace id, command/mode/content/outcome/cache/AE-state tokens, stable phase/call tokens, integer counts, and finite non-negative millisecond durations.

Forbidden data includes project/timeline/clip names, timecodes, media/LUT/AE paths, JSX or derived content, arbitrary configuration, environment data, raw stderr outside the fixed grammar, and native exception text.

The private carrier may travel only through the existing Script Capability, Python Provider, Runtime Manager, and diagnostic recorder boundaries. It must not enter renderer state, public IPC results, Python stdin, normal logs, or the seven-key controlled result.

## Sampling and Analysis

Use one stable local Resolve timeline. Label the first invocation as warm-up. Collect at least five successful default mixed and five successful video-only runs. Run audio-only until one failure with preserved phase/call evidence is captured or five successes complete. An AE-closed control is labeled separately and excluded from warm-send medians.

Report median and range for each phase and relevant counts. Attribute only measured savings. Use the results to evaluate, in order:

- whether a persistent worker experiment is justified by startup plus connection/acquisition share;
- whether unused media-policy track scans are material;
- whether replacing `platform.system()` has a meaningful fixed benefit;
- whether unused audio `Input LUT` calls or OTIO parsing are measurable.

## Rollout and Rollback

1. Add bounded temporary instrumentation and contract tests.
2. Run focused and full automated checks.
3. Stage the managed Runtime, package, verify, and install the diagnostic Workflow while Resolve and AE are closed.
4. Ask the user to restart the applications and perform the local-project matrix.
5. Preserve raw bounded evidence and write the analysis.
6. Remove all instrumentation, rerun the full checks, rebuild/package/verify, and reinstall the clean Workflow.

Abort and clean up the diagnostic candidate if it changes a public result/JSX snapshot, lacks failure evidence after a controlled timeout test, leaks forbidden data, exceeds bounded output, or materially increases the measured workload.
