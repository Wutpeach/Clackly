# Current-State Research

## Measured Baseline

The archived profiling task measured warm AE detection at 394.3–493.2 ms per successful export. Default Export-to-AE had a 424.9 ms median detection phase and 1471.7 ms total median. The fixed detection cost is therefore the best first optimization target with a measured maximum upside of roughly 0.4 seconds.

## Existing Contract

`capability/afterEffectsLaunch.js` owns desktop validation and launch. On Windows, `detectRunning()` resolves `%SystemRoot%\System32\WindowsPowerShell\v1.0\powershell.exe`, starts it through the shared bounded `runExecFile()` wrapper, enumerates `AfterFX` processes, reads each `Path`, validates each readable path as an existing regular file, and compares it with the configured executable after canonicalization.

The tests in `capability/afterEffectsLaunch.test.js` establish these invariants:

- no process means confirmed stopped;
- only the configured canonical executable means running;
- valid non-matching installations remain stopped;
- an unreadable candidate without a match means unknown/failure;
- a validated match wins over other unreadable candidates;
- malformed output, timeout, or subprocess failure means unknown/failure;
- unknown state cleans the temporary JSX and performs no spawn or bootstrap;
- non-Windows detection does not probe and returns stopped.

The managed Runtime ADR requires the isolated Python worker to remain unable to launch desktop applications. `RuntimeManager` consumes the private plan and the host-owned `AfterEffectsLauncher` validates and executes it, so the optimization belongs on the Node/Electron host side.

## Read-Only Persistent-Helper Experiment

On 2026-08-29, a temporary in-memory experiment launched the same Windows PowerShell executable once with `-NoLogo -NoProfile -NonInteractive -EncodedCommand`. It kept stdin/stdout pipes open and ran the current `Get-Process -Name AfterFX` path query for each `QUERY` line.

- helper startup to `READY`: 203.6 ms;
- first query: 106.9 ms;
- next six queries: 6.0, 5.0, 4.7, 4.4, 4.6, 4.3 ms;
- steady median: 4.7 ms.

This indicates that PowerShell process startup, not fresh process enumeration, owns almost all of the measured 0.4–0.5 second cost. A prewarmed helper can retain fresh-state semantics without adding a native dependency.

## Candidate Boundary

The smallest measured candidate is a Windows-only helper owner beside `AfterEffectsLauncher`:

- one hidden no-shell child per Clackly Core;
- eager background prewarm after Electron readiness, with lazy startup fallback;
- one bounded request/response at a time, with current process enumeration on every request;
- stable line protocol with no configured path or JSX sent to the helper;
- Node retains canonical path validation and all running/unknown decisions;
- failure terminates the helper and fails the current command closed; a later command may start a new helper without retrying the failed export;
- both standalone and Workflow hosts dispose the helper during `will-quit`.

## Real-Host Acceptance Follow-Up

The installed candidate's first ordinary Export-to-AE felt slower, while the
next two were clearly faster. This is consistent with the earlier measured
first-helper-query cost, not a stale-state cache. The approved follow-up is to
complete one fresh process enumeration during background prewarm and discard its
response. The first user export then remains a distinct next query; no Resolve,
Python, audio-timeout, path-identity, or launch behavior changes are implied.

The main product trade-off is the presence of one hidden PowerShell child during the Clackly host lifetime. A native Windows addon/helper would avoid that persistent process but adds ABI, packaging, signing, and maintenance risk disproportionate to the first optimization experiment.
