# Current-State Research

## Confirmed Pipeline

Export-to-AE routes from the Workflow command through Script Capability, `PythonProvider`, `RuntimeManager`, and one isolated `RuntimeLauncher` CPython process. The Bootstrap loads `python_runner.py`, which imports the Resolve adapter and the `scripts/resolve2ae_export.py` entry. Lazy `context.resolve` and `context.project` access establishes a fresh `fusionscript` connection and acquires the current project/timeline for every command.

`resolve2ae_core/export.py` then reads timeline metadata, scans both video and audio tracks, exports/parses OTIO only when selected targets include video, reads per-clip Resolve/Media Pool properties, and builds JSX. RuntimeManager strips the private AE launch plan and delegates it to the host launcher.

## Measured Baseline

- Previous real-host default mixed median: 1,471.7 ms total; 1,033.4 ms Python process; 424.9 ms legacy AE process detection.
- Previous successful audio-only median: 1,684.3 ms total; 1,190.8 ms Python process; 448.9 ms legacy AE process detection.
- Two audio-only attempts reached about 11 seconds total and were terminated by the fixed 10-second Runtime timeout before entering the AE phase.
- The accepted host-owned PowerShell helper now performs a discarded background prewarm and yields a distinct first user query around 6.1 ms, with steady median around 5.4 ms.
- Safe managed-runtime microbenchmarks measured about 49 ms for interpreter/Bootstrap, about 129 ms including runner/envelope, about 154 ms including Resolve2AE imports, and about 190-200 ms total fixed worker cost including `platform.system()`.
- Mocked Python computation remained about 1.8 ms even for 200 clips. The unmeasured 800-1,000 ms is therefore most likely native Resolve `fusionscript` IPC/API latency.

## Previous Profiling Defect

The earlier Python helper returned `time.perf_counter()` deltas in seconds while the Node recorder interpreted them as milliseconds. Top-level Node timings remain valid, but inner Python phase values are invalid. Profiling metadata also existed only in the success envelope, so a timeout lost the location of the blocked native call.

## Static Audio-Path Findings

The audio-only control flow contains no recursion or unbounded Python loop. It skips OTIO export/parse and linked-video work. All iteration is bounded by Resolve track/item/marker counts. A raised Python exception would fail quickly, so the repeated ten-second behavior is most consistent with a native call that did not return.

Plausible boundaries, pending measurement, are Resolve connection/project acquisition; current timecode or track enumeration during transient UI state; and per-item Media Pool/property/offset/duration calls. Raising the Runtime timeout would only extend the user-visible wait and is not a fix.

## Candidate Optimizations Requiring Evidence

1. Persistent Python worker, only if startup plus Resolve connection/acquisition dominate enough to justify new hang recovery, restart, project-switch, and state-growth risks.
2. Skip unused video scans for audio-only and unused audio scans for video-only if real scan phases are material.
3. Replace Windows `platform.system()` with an `os.name` branch for a measured approximately 37-43 ms fixed saving.
4. Remove unused audio `Input LUT` property calls if the per-call bucket is measurable.
5. Optimize OTIO parse/matching only if the corrected phase proves significant.

No optimization is authorized by this research alone.
