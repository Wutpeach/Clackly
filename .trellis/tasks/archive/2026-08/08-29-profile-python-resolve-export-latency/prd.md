# Profile Python and Resolve export latency

## Goal

Identify which parts of the isolated Python/Resolve export path account for roughly one second of warm Export-to-AE latency and which native Resolve call blocks during intermittent audio-only timeouts, so the next optimization is selected from measured evidence without weakening runtime isolation or export correctness.

## Background

- The previous packaged profiling run measured a default mixed-export median of 1,471.7 ms, including a 1,033.4 ms isolated Python process and a 424.9 ms After Effects process query.
- The accepted PowerShell helper optimization has reduced the AE process query to about 5 ms after non-blocking prewarm, so the Python/Resolve path is now the largest remaining measured contributor.
- Safe local microbenchmarks attribute about 190-200 ms to interpreter, Bootstrap, imports, and `platform.system()` in a fresh worker. The remaining approximately 800-1,000 ms is likely Resolve `fusionscript` connection or API latency rather than Python CPU.
- The previous Python phase transport converted `time.perf_counter()` deltas incorrectly, so its inner-phase values are not usable. Two audio-only runs also reached the fixed 10-second Runtime timeout before profiling metadata could return.
- Static review found no unbounded Python loop in the audio-only path. A blocking native Resolve call is the leading explanation, but the exact call is not yet known.

## Requirements

- Add temporary, reversible profiling that reports Python durations in milliseconds and never compares clocks across processes.
- Keep the existing Node outer boundaries for command total, host context, Runtime resolution, Probe readiness, Python process, AE detection, and AE spawn acknowledgement.
- Separate Python/Resolve work into at least: worker/bootstrap/entry import, AE path and LUT-directory validation, Resolve connection, project/timeline acquisition, timeline metadata, video-track scan, audio-track scan, OTIO export, OTIO parse, per-clip data/JSX generation, and result encoding/transport.
- Preserve failure evidence when the worker times out or exits before returning its normal envelope. Record a bounded last-eight ring of stable call tokens so an audio-only hang can be localized without logging project or media data.
- Profiling output may contain only stable phase/call tokens, counts, mode/content tokens, outcome tokens, and finite numeric durations. It must not contain project/timeline/clip names, media/LUT/AE paths, JSX, arbitrary configuration, raw native errors, or environment values.
- Keep the public seven-key export result, generated JSX, six supported command-policy triples, Runtime timeout, one-process-per-command isolation, Probe behavior, AE launch behavior, and command bindings unchanged.
- Build and install a diagnostic Workflow before real-host sampling. Use only a local Resolve project and let the user perform the live Resolve/AE actions.
- Capture one labeled warm-up, at least five successful default mixed runs, at least five successful video-only runs, and audio-only runs until either one failure with phase evidence is captured or five successes are collected. Capture one labeled AE-closed control only if needed.
- Analyze phase medians/ranges and call counts, distinguish fixed startup/connect cost from workload-dependent API cost, and rank optimization candidates with measured upside and correctness risk.
- Remove all temporary profiling source after evidence capture, rebuild and reinstall the clean Workflow, and retain only bounded task evidence and analysis.

## Acceptance Criteria

- [x] Successful samples account for Python process time with documented nested phases and an unexplained gap no larger than the greater of 20 ms or 5% of the Python process duration.
- [x] Every duration is transported and interpreted in milliseconds, covered by an automated unit test that would fail on the earlier seconds-versus-milliseconds defect.
- [x] A timeout/failure record contains completed phase timings plus the bounded last-call ring; no failure depends on the normal success envelope to preserve evidence.
- [x] Real-host evidence includes the requested local-project sampling matrix, or explicitly records a user-approved early stop after enough evidence identifies the bottleneck.
- [x] The report identifies the dominant Python/Resolve phases with median/range values and distinguishes interpreter/import cost, Resolve connection/acquisition, track scans, OTIO, and per-clip calls.
- [x] The report either identifies the audio-only blocking boundary or states the narrowest remaining candidate set supported by failure evidence; increasing the 10-second timeout is not presented as a fix.
- [x] Automated tests, Python compilation, production build/package verification, and before/after public-result/JSX snapshots pass.
- [x] Profiling instrumentation is removed, the installed Workflow matches the clean build, and privacy/boundary searches find no retained profiling carrier outside task evidence.

## Out of Scope

- Implementing a persistent Python worker, changing Runtime timeout behavior, retrying a failed export, or sharing Resolve objects across commands.
- Changing Resolve2AE selection, range, OTIO interpretation, generated JSX, media policy, or After Effects launch semantics.
- Optimizing `platform.system()`, unused track scans, media-property calls, or any other candidate before this task's evidence is reviewed.
- Fixing the audio-only timeout in this task; this task localizes it and provides evidence for a separate reliability decision.
- Creating, modifying, or deleting any Resolve project in a network project library.

## Notes

- The PowerShell process-probe optimization is already accepted and archived; this task must not reopen that implementation.
- A persistent Python worker is a later architectural experiment only if measurements show that startup plus Resolve connection/project acquisition dominate enough of the remaining latency to justify weaker failure isolation.
