# Export to AE Latency Current State

## Confirmed Execution Path

The Workflow Integration IPC handler awaits `InteractionManager.handle()`, which resolves a binding and awaits the Command executor. The executor validates feature/config state, then routes the selected Command through the shared `ae.export` script Capability and `PythonProvider`.

`RuntimeManager.execute()` performs these operations serially:

1. read the live Resolve version through the host context provider;
2. resolve the managed Runtime and validate the Probe cache fingerprint;
3. launch one isolated Python process for the business script;
4. validate the script envelope and extract the private desktop launch plan;
5. await the host `AfterEffectsLauncher` before returning the public result.

The Python runner imports the feature wrapper on every invocation. The wrapper lazily connects to Resolve, acquires the current project/timeline, maps the Command policy, then enters `process_and_send()`.

The Resolve2AE core scans enabled tracks and clips, optionally exports the timeline to OTIO whenever selected targets contain video, parses the OTIO JSON, reads per-clip Resolve/Media Pool properties, and builds one JSX string. It returns the JSX only as a private host launch plan; Python does not launch AE.

For AE-already-running execution, the host writes the JSX to a temporary file, starts Windows PowerShell to enumerate AfterFX processes and canonical paths, then spawns the configured AfterFX executable with `-r <jsx>` and waits only for the process `spawn` event.

## Existing Observability

- `RuntimeLauncher` records one aggregate child-process `durationMs` using `Date.now()`. It includes temporary-directory setup, Python startup, imports, Resolve/OTIO/JSX work, protocol output, and cleanup.
- Successful `RuntimeManager` execution does not expose that process timing to normal logs or the Capability result.
- Python emits user-facing status strings such as `Analyzing...`, `Exporting OTIO...`, and `Parsing Data...`, but they have no timestamps or correlation id.
- No current timing separates host version, cache lookup, Resolve connect/project acquisition, clip scan, OTIO export, OTIO parse, JSX generation, AE detection, or AE spawn acknowledgement.

## Safe Local Baselines (2026-08-29)

- The exact PowerShell command used by `AfterEffectsLauncher.detectRunning()` was executed five times without launching Resolve or AE. Durations were 470.8, 517.7, 367.0, 342.9, and 340.6 ms.
- The packaged CPython 3.13.14 executable was launched with `-I -c "pass"` five times. Durations were 113.1 ms for the first run and 29.5–30.7 ms for the next four runs. This excludes bootstrap imports, the Resolve bridge, and export work.
- `%APPDATA%\Clackly\runtime-probe.json` exists with a passed machine-verified fingerprint for Clackly 0.1.0, Resolve 20.3.2.9, and the packaged CPython 3.13.14 runtime. A normal unchanged execution should therefore use a Probe cache hit instead of launching a second Probe process.

## Current Hypotheses

The 341–518 ms PowerShell process query is a confirmed fixed contributor shared by every AE export mode. Bare Python startup is smaller after the OS cache is warm, but the real isolated process also imports the bootstrap, Resolve bridge, wrapper, and export core and must connect to Resolve, so its aggregate contribution is still unknown. Timeline scanning, OTIO export, and per-clip property reads are likely variable costs that grow with project shape. None of these hypotheses is sufficient to select an optimization until a real host timing breakdown is captured.

## Constraints

- Preserve the exact six Command policy triples and the seven-key public result contract.
- Keep raw Resolve facts, selection policy, OTIO/formula work, and desktop launch in their existing owners.
- Do not expose JSX, media paths, AE executable paths, arbitrary config, or timeline names in profiling output.
- Use a local Resolve project for real smoke evidence.
