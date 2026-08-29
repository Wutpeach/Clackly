# Optimize After Effects Running-State Detection

## Goal

Reduce the fixed latency of warm Export-to-AE commands by replacing the per-export PowerShell process startup while preserving the existing determination of whether the configured After Effects executable is already running.

## Background

- Real packaged profiling on 2026-08-29 measured After Effects running-state detection at 394.3–493.2 ms per successful export, with a 424.9 ms median for the default command.
- The current host-owned `AfterEffectsLauncher.detectRunning()` starts Windows PowerShell for every export, enumerates `AfterFX` processes, reads each executable path, and compares canonical paths case-insensitively.
- A read-only local experiment using one hidden PowerShell helper measured 203.6 ms startup, a 106.9 ms first query, and 4.7 ms median steady queries. Each query still enumerated the live process table; no AE state was cached.
- Real-host acceptance found the first ordinary Export-to-AE felt slower while the second and third were clearly faster. The helper's first query is therefore a separate cold cost that must complete before the first user command can reach it.
- The managed Python worker must remain isolated and must not own desktop process detection or application launch.

## Requirements

- Eliminate a new Windows PowerShell process startup from the normal warm Export-to-AE path.
- Query live `AfterFX` process state for every export; do not use an unbounded or stale running-state cache.
- Preserve exact canonical executable-path identity. A different `AfterFX.exe` installation must not count as the configured executable.
- Preserve fail-closed behavior: if any candidate path is unreadable and no validated match exists, the command must report an unknown running state and perform no AE spawn or bootstrap write.
- Preserve the rule that a validated matching process wins even if another candidate is unreadable.
- Keep the helper hidden, no-shell, bounded by startup/query/output limits, invocation-safe under concurrent commands, restartable after failure for later commands, and explicitly terminated when either Clackly host quits.
- Background prewarm must complete one real process enumeration and discard its result. Every actual export must still issue a distinct fresh query and never consume the prewarm result.
- Preserve public command results, launch plan validation, warm/cold launch behavior, JSX generation, bootstrap behavior, managed Runtime isolation, and non-Windows behavior.
- Build, package, verify, and install the Workflow candidate before asking the user for real-host validation. Use a local Resolve project only.

## Acceptance Criteria

- [x] Five or more steady helper queries against a live or absent AE process have a median of at most 50 ms on the profiling machine, excluding one labeled helper startup/warm-up sample.
- [x] Export-to-AE no longer creates one PowerShell process per command after helper prewarm; one host-owned helper serves fresh bounded queries and exits with the host.
- [x] Automated tests cover zero processes, exact match, valid non-match, unreadable path, match plus unreadable path, malformed/oversized output, startup/query timeout, child exit, concurrent queries, later restart, disposal, and non-Windows behavior.
- [x] Unknown state still performs zero AE spawn and zero bootstrap write; cold and running sends remain exactly once.
- [x] Full Node/Python tests, Runtime staging, Windows packaging, and package verification pass.
- [x] The packaged Workflow is installed and a user-approved local Resolve/AE smoke confirms the warm export still succeeds and feels measurably faster, without changing the generated export result.

## Out of Scope

- Optimizing the approximately 1.0–1.2 second Python/Resolve stage.
- Investigating the repeated audio-only Runtime timeout.
- Moving desktop detection or launch into the isolated Python worker.
- Caching Resolve timeline data, retaining a Python worker, or changing Export-to-AE formulas and selection behavior.
- Qualifying network Resolve project libraries.

## Key Decision

- The user approved one hidden Windows PowerShell helper for the Clackly host lifetime. It must query the current process table for every export and terminate with the host; it is not an AE-state cache.
