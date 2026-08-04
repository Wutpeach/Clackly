# 修复 Resolve2AE 导出原生崩溃

## Goal

Restore `Export to After Effects` on Windows and define a distributable Python runtime contract: a valid auto-discovered AE path must reach the existing Resolve2AE export flow without depending on whichever `python` happens to appear first on an end user's PATH.

## Background

- After Effects path auto-discovery succeeds and the saved path is available to `ae.export`.
- Executing the Feature through `interactions:execute` reports that `scripts/resolve2ae_export.py` exited with code `3221225477` and no stderr.
- This exit code is a Windows native access violation, so the failure occurs below normal Python exception handling and must be localized before choosing a fix.
- Windows Event 1000 proves that Clackly's bare `python` selected uv CPython 3.11.15 while Resolve's native bridge loaded `python313.dll`; the process faulted with `0xc0000005` during `DaVinciResolveScript` module creation.
- Isolated probes reproduce the crash under Python 3.11 and 3.12. The same Resolve 20.3.2 binding imports and connects to the live Resolve process under installed Python 3.13.1 (`python3`).
- `resolve2ae_core` imports successfully and the crash occurs at `context.resolve` before `process_and_send()` or any After Effects launch, excluding AE path discovery and export-core behavior as causes.

## Requirements

- Select or explicitly configure a Resolve-compatible interpreter at the shared Script Runtime boundary instead of relying on the first bare `python` on PATH.
- Distribution must either ship a known 64-bit Python runtime or detect and verify an external compatible runtime before Feature execution; an accidental PATH interpreter is not an acceptable product dependency.
- Fix the shared root cause without disabling AE path discovery, bypassing configuration validation, changing Resolve2AE core, or adding blind retries.
- Preserve the existing capability-scoped configuration and Resolve2AE export behavior.
- Enable native fault diagnostics on stderr so a future interpreter/native-module crash identifies its Python boundary while stdout remains the single JSON protocol envelope.

## Acceptance Criteria

- [ ] `Export to After Effects` no longer exits with `3221225477` in the reported Windows environment.
- [ ] The configured `ae.export.aePath` remains the executable used by the export flow.
- [ ] The smallest reproducible crash probe and an automated regression check pass.
- [ ] Existing AE path, Python runtime, Resolve2AE, and full project tests continue to pass.
- [ ] A machine with no usable runtime receives a controlled, actionable compatibility error instead of `0xc0000005` or a generic missing-executable failure.
- [ ] A real Resolve-to-AE export is recorded as passing, or any unavailable external prerequisite is explicitly recorded as a manual validation gap.

## Out of Scope

- Replacing Resolve2AE or changing its output format without evidence that the core design is the cause.
- Adding generic subprocess restart infrastructure.
- Changes to macOS support.

## Resolution

- Superseded and resolved by archived task `08-03-managed-runtime-python-provider-export-ae-6-5d`.
- Managed CPython 3.13.14 now owns Python execution without PATH fallback, contains native bridge crashes, and launches After Effects from the host desktop environment.
- Packaged Workflow Integration, Probe miss/hit, warm and cold real Export-to-AE sends, and the original configured `ae.export.aePath` behavior passed.
- Implementation commits: `206fdc1`, `ad77115`, `5763ae0`, `a96e31c`; the 6.5D task archive commit is `35e44db`.
