# Current-State Research

## Measured authority

The archived task `08-29-profile-python-resolve-export-latency` is the A-arm authority. Nine successful local-project samples measured approximately 465-470 ms command medians and 413-415 ms Python-process medians. Resolve API, scan, OTIO, and JSX phases are small compared with an approximately 344-354 ms short-lived worker envelope.

## Minimal seam

`RuntimeManager.execute()` has one business `script-execute` call to `RuntimeLauncher.execute()`. A dedicated B launcher can implement the same `{ response, process }` result without changing PythonProvider, public envelopes, desktop-plan stripping, or Runtime Probe. Probe remains one-shot through the existing RuntimeLauncher.

## Required lifecycle

The persistent worker uses a READY handshake and strict request-id JSON framing, handles one request at a time, reacquires Resolve/project/timeline per request, and retains only imported code. Parent timeout/crash/protocol failure kills the worker and never retries the failed command. Only a later command creates a replacement. Host shutdown disposes the worker idempotently.

## Relationship to the PowerShell helper

The AE process helper and Python worker share supervision concepts—READY, request ids, serialization, timers, kill, disposal, later restart—but their protocols, owners, timeouts, environments, and failure domains differ. Keep separate modules and processes. Do not extract a generic supervisor with only two divergent consumers.

## Principal risks

- Same-version Resolve restart may leave native module state degraded; at most the first post-restart export may fail, after which the worker must be replaced.
- A single B worker intentionally serializes concurrent exports, unlike the current parallel short-lived workers.
- Long-lived imported/native state must pass repeated-request memory and shutdown checks.
- The user approved background prewarm on 2026-08-30 so the first user export can use an already-ready worker. Prewarm must not connect to Resolve or delay host readiness.
- The user accepted on 2026-08-30 that the first export after a same-version Resolve restart may fail in a controlled way; that failure kills the worker, and the next export must start a replacement and succeed without retrying the failed command.
- The user selected bounded FIFO waiting on 2026-08-30. Real-host sampling remains serial; automated tests own overlapping-request behavior.
- The experiment will install only the B diagnostic package and compare it with the archived corrected A evidence, avoiding a second A installation. The clean A package is restored after evidence capture.
