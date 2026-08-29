# After Effects Running-State Detection Implementation Plan

## 1. Process-Probe Module

- [x] Add a Windows-only host process-probe module with injected spawn, environment, timers, and platform dependencies.
- [x] Start one hidden no-shell Windows PowerShell child with a fixed encoded script and versioned readiness handshake.
- [x] Implement bounded line framing, schema validation, finite record count/output size, stable failure tokens, and no raw error/path logging.
- [x] Serialize fresh queries with request ids; prewarm performs one discarded fresh query, clear failed state, allow only later-command restart, and make disposal idempotent.
- [x] Prove non-Windows construction and query paths spawn nothing.

## 2. Launcher Integration

- [x] Replace `AfterEffectsLauncher.detectRunning()` per-call `runExecFile()` with the injected probe result.
- [x] Keep configured/plan/candidate canonicalization and case-insensitive exact-path comparison in Node.
- [x] Preserve match-wins, unresolved-without-match fail-closed, valid-nonmatch stopped, and zero-spawn/zero-bootstrap unknown behavior.
- [x] Keep warm/cold spawn arguments, JSX temp cleanup, public results, and all controlled error codes unchanged.

## 3. Core and Host Lifecycle

- [x] Make the Composition Root own one probe and expose narrow prewarm/dispose lifecycle functions without exposing detector internals.
- [x] Prewarm from shared Electron startup without delaying Palette, IPC, hotkey, Resolve initialization, or AE path discovery; complete and discard one fresh enumeration.
- [x] Dispose the helper from both standalone and Workflow `will-quit` handlers while preserving existing cleanup order.
- [x] Cover startup failure, query during prewarm, host disposal, and repeated disposal in composition/lifecycle tests.

## 4. Automated and Performance Qualification

- [x] Add focused tests for zero/matching/nonmatching/unresolved process sets; match plus unresolved; malformed, oversized, timeout, exit, and wrong-id responses; discarded prewarm, concurrent user query, later restart, disposal, and non-Windows behavior.
- [x] Run focused Capability, Core composition, host composition, and Workflow tests.
- [x] Run `npm test`, Python compilation/suites, Node syntax checks, and `git diff --check`.
- [x] Run the real helper qualification with startup, discarded prewarm, and first user query labeled separately plus at least five steady queries; require a median no greater than 50 ms.
- [x] Confirm no per-export PowerShell child is created after prewarm and no helper remains after host disposal.

## 5. Package and Real-Host Acceptance

- [x] Run `npm run runtime:stage`, `npm run package:win`, and `npm run package:verify`.
- [x] Verify source/staging/package identity for Export-to-AE Python files and confirm the change introduces no Runtime or plan-schema drift.
- [x] Install the packaged Workflow before asking the user to test.
- [x] Ask the user to start AE and Resolve manually, use a local project only, and verify repeated warm Export-to-AE success and visible speed improvement.
- [ ] If the candidate fails correctness, lifecycle, or performance gates, reinstall the pre-task clean Workflow package.

## Review Gates

- No implementation begins until the user approves the final planning summary and `task.py start` changes status to `in_progress`.
- The Orca `developer` Worker owns implementation; the Lead reviews actual diffs, lifecycle behavior, qualification evidence, package identity, and installation.
- Do not combine the Python/Resolve latency work or audio-timeout investigation into this task.

## Rollback Points

- Before host integration: remove the isolated process-probe module if protocol/lifecycle tests cannot remain bounded and fail-closed.
- Before installation: reject the candidate if steady query median exceeds 50 ms or any command creates a second PowerShell process after prewarm.
- After installation: restore the prior clean package if real Resolve/AE warm or cold behavior regresses.
