# Export to AE Latency Profiling Design

## Design Summary

Build a temporary, reversible profiling candidate that records one bounded JSONL event per Export to AE invocation. Use monotonic clocks inside each process, aggregate the Python phase durations through private metadata, and strip all diagnostics before the existing public Capability result is returned.

The profiling code is evidence-gathering scaffolding, not a product feature. After the real packaged samples are captured, remove the scaffolding, rebuild, reinstall the clean Workflow package, and retain only the task evidence and analysis.

## Timing Model

Each record has this bounded shape:

```json
{
  "schemaVersion": 1,
  "traceId": "random UUID",
  "commandId": "timeline.exportToAfterEffects",
  "outcome": "success",
  "probeCache": "hit",
  "aeState": "running",
  "counts": { "targetClips": 3 },
  "durationMs": {
    "commandTotal": 1038.2,
    "hostContext": 4.1,
    "runtimeResolve": 1.2,
    "probeReadiness": 2.8,
    "pythonProcess": 498.4,
    "pythonImportAndResolveConnect": 91.0,
    "targetScan": 48.2,
    "otioExport": 112.5,
    "otioParse": 8.7,
    "clipDataAndJsx": 181.4,
    "aeValidateAndWrite": 2.3,
    "aeDetectRunning": 376.8,
    "aeSpawnAck": 3.7,
    "unattributed": 9.3
  }
}
```

The exact values above are illustrative. Durations are finite non-negative numbers rounded to tenths of a millisecond. Clocks are not compared across processes: Python reports duration deltas, and Node combines nested deltas with its own outer totals.

`unattributed` is calculated from the outer command total and non-overlapping top-level phases. The accepted measurement gap is the greater of 20 ms or 5% of `commandTotal`; larger gaps require another phase boundary before analysis.

## Instrumentation Boundaries

### Node / Electron

- Start the trace at `executeWorkflowCommand()` before `core.executeCommand()` and finish it after success or failure.
- Time RuntimeManager request validation/preparation, host context, resolution, Probe readiness, isolated execution, desktop launch, and result validation with `process.hrtime.bigint()` or `performance.now()`.
- Preserve and use the existing RuntimeLauncher `process.durationMs` as `pythonProcess`; do not add another Python launch.
- Time AE plan validation/temp write, running-state detection, and spawn acknowledgement inside `AfterEffectsLauncher.execute()`.
- Append the final bounded record to `%APPDATA%\Clackly\export-to-ae-profile.jsonl`. File-write failure is diagnostic-only and must never change command success/failure.

### Python

- Use `time.perf_counter()` for wrapper/core durations.
- Separate module/wrapper setup plus lazy Resolve/project acquisition, target scan, OTIO export, OTIO parse, and remaining per-clip data/JSX work.
- Return durations and target-clip count in a reserved temporary private field. RuntimeManager validates and deletes that field before Provider log replay or public result delivery.
- Do not add timestamps around every Resolve item call; phase timers should be coarse enough to avoid materially changing the workload.

### Correlation and Failures

- One Node-generated UUID owns the trace. The trace object stays internal to the current asynchronous command invocation.
- Success and controlled failure records share the schema. Missing later phases are omitted, and `outcome` is a bounded stable code rather than a raw error message.
- Concurrent invocations must not mix. If a minimal context carrier is needed, use an invocation-scoped object passed through existing internal collaborators; do not introduce renderer state or global mutable timing arrays.

## Privacy and Compatibility

Allowed fields are the stable Command id, stable outcome/cache/AE-state tokens, integer counts, and numeric durations. The recorder rejects or drops all unknown fields.

The JSONL must not contain timeline/project/clip names, media or LUT paths, AE executable path, configuration values, JSX text/size-derived content, raw errors, or host environment values.

Existing public contracts remain exact:

- Core controlled failures retain the existing seven public keys.
- Temporary private profiling metadata may exist only on diagnostic-candidate success transport and is stripped by RuntimeManager alongside the existing desktop launch directive.
- Provider/Capability/IPC results, status messages, Command bindings, selection policy, generated JSX, Runtime isolation, and AE warm/cold behavior remain unchanged.

## Sampling Matrix

Use one representative local Resolve project/timeline and keep its state stable during each comparison block.

1. Discard or label one warm-up invocation.
2. With AE already running, capture at least five steady-state samples for each:
   - default mixed `timeline.exportToAfterEffects`;
   - audio-only `timeline.exportAudioToAfterEffects`;
   - video-only `timeline.exportVideoToAfterEffects`.
3. Record target clip count and whether OTIO ran so fixed and variable costs can be separated.
4. Optionally capture one AE-closed run as a qualitative control. Do not include AE application startup or the scheduled three-second bootstrap in the warm-send latency aggregate.

Report each phase's median and range per mode, plus the combined fixed-cost pattern. Five samples support a median/range comparison; do not claim a statistically stable p95.

## Rollout and Rollback

1. Add profiling scaffolding and automated contract tests.
2. Build and install the diagnostic Workflow package.
3. Ask the user to restart Resolve and execute the sampling matrix manually.
4. Copy the bounded JSONL into the task evidence directory and analyze it.
5. Remove only the profiling scaffolding, rerun the full checks, rebuild, and reinstall the clean Workflow package.
6. Confirm the worktree contains no retained instrumentation and the installed package matches the clean build.

If instrumentation changes result/JSX snapshots, causes export failure, adds more than the accepted measurement gap, or cannot keep records private and bounded, abort the candidate and remove it before any real-host sampling.

## Optimization Decision Gate

This task ends with ranked evidence and a recommended next experiment. Replacing PowerShell, retaining a worker, changing Probe/host caching, or reducing Resolve/OTIO calls requires a separate approved implementation task whose expected gain is tied to the measured phase.
