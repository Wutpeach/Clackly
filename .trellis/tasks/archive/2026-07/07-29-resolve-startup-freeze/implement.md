# Resolve Startup Freeze Investigation Plan

## Checklist

- [x] Snapshot git status, installed entrypoint paths/types/targets, relevant environment variables, existing logs, and currently running Resolve/Clackly processes.
- [x] Prepare exact same-drive holding paths and restoration commands for the Workflow Plugin junction and Utility symlink.
- [x] Use a safe project with a timeline and its `Current project pointer changed to (...)` log line as sampling time zero.
- [x] Capture a baseline run with both Clackly entrypoints disabled and a defined 30-second playhead-drag window.
- [x] Capture a Workflow Plugin-only run with the same timed playhead interaction.
- [x] Compare GUI responsiveness, CPU/memory, GPU utilization, Workflow Electron/Chromium child-process starts, and log timing between the runs.
- [x] Preserve the 2026-07-29 14:40 no-project baseline as non-diagnostic pre-project context only.
- [x] Report that the freeze is non-reproducible and Clackly causation is not established by the controlled evidence.
- [x] Do not run startup-operation isolation because Workflow-only did not reproduce the freeze.
- [x] Run Utility-only-installed after baseline and Workflow-only remained negative.
- [x] Attempt the user-authorized active-overlap test with a healthy standalone bridge/Electron path, installed Workflow Plugin, process capture, and confirmed standalone hotkey ownership; no Workflow Electron runtime appeared.
- [x] Skip a passive dual-installed-only run because Utility installation is inert and the installed-Workflow plus active-standalone attempt was already freeze-negative.
- [x] Restore the installed Workflow Plugin junction and Utility symlink.
- [x] Revert/remove all temporary product instrumentation; only task-local research tooling remains.
- [x] Write `research/root-cause-report.md` with reproduction steps, run table, evidence, conclusion, confidence, rejected hypotheses, and recommended follow-ups.
- [x] Verify the repository and installed entrypoints are restored before presenting the diagnosis.

## Validation Commands

- `git status --short`
- `Get-Item -Force <workflow-plugin-path>, <utility-script-path> | Select FullName, LinkType, Target`
- `Get-CimInstance Win32_Process` filtered to Resolve/Electron/Node/npm/Python processes
- `rg -n -i "clackly|com\.wutpeach|workflow integration|fuscript" <davinci_resolve.log>`
- Existing project tests only if temporary product instrumentation becomes necessary and touches executable code.

## Safety Gates

- Do not move entrypoints while Resolve is running.
- Do not force-kill Resolve when a project may contain unsaved work.
- Do not delete plugin links or targets; moves must remain reversible.
- Do not leave Resolve with both entrypoints disabled after the investigation.
- Do not commit temporary diagnostic instrumentation.

## Deliverable

The task is complete when `research/root-cause-report.md` identifies whether Clackly is causal and, if so, isolates the responsible entrypoint/operation with enough evidence to plan a separate minimal fix.
