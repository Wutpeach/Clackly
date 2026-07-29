# Resolve Startup Freeze Investigation Design

## Investigation Boundary

This task diagnoses the freeze and produces evidence. It may make temporary, reversible installation or instrumentation changes during experiments, but it does not ship the production fix.

## Evidence Sources

- Resolve log: `%APPDATA%\Blackmagic Design\DaVinci Resolve\Support\logs\davinci_resolve.log`.
- Clackly Utility logs: `%APPDATA%\Clackly\clackly.log` and `bridge.log`.
- Installed Workflow Plugin junction and Utility symlink state.
- Windows process data for Resolve, Resolve's bundled Workflow Electron/Chromium processes, Node/npm, Python bridge, CPU time, memory, process start time, GUI `Responding` status, and per-process GPU engine utilization.

All run-specific findings are written under this task's `research/` directory.

## Controlled Run Matrix

Run the smallest sequence that establishes causality:

Every valid run must open a safe project with a usable timeline. The reported symptom was not tied to a specific project, so the exact project identity need not be fixed. Resolve process launch is prelude only; sampling time zero is the log line `Current project pointer changed to (...)`.

1. **Baseline:** move both Clackly entrypoints outside Resolve scan roots, start Resolve, open a safe project, confirm the current-project pointer, and sample the post-open playhead interaction window.
2. **Workflow-only:** restore only the Workflow Plugin, start Resolve, open a safe project, confirm the current-project pointer, and repeat the same timed playhead interaction.
3. **Utility-only:** run only if the first two runs do not explain the symptom or if duplicate-entrypoint behavior remains plausible.
4. **Current dual-installed state:** reuse existing logs or rerun only when needed for comparison.

Stop once one boundary consistently changes the result. Do not run every permutation ceremonially.

The installed-only Utility run is not equivalent to a running standalone path. If baseline, Workflow-only, and Utility-only-installed are all negative, the next minimum test is user-authorized overlap: start the standalone/Utility path in a controlled way while the Workflow Plugin is loaded, then sample duplicate Electron/bridge processes and hotkey ownership. Do not run a passive dual-installed permutation first because the Utility entrypoint does not auto-execute.

## Safe Installation Toggling

- Resolve must not be running while entrypoints are moved.
- Resolve exact absolute source and holding paths before each move.
- Move the Workflow Plugin junction to a holding directory outside `Workflow Integration Plugins` on the same drive.
- Move the Utility symlink to a holding directory outside `Fusion\Scripts` on the same drive.
- Record original paths and states before the first move.
- Use a guaranteed restoration step after each experiment and document recovery commands in case the session is interrupted.
- Never delete the junction, symlink, target repository, plugin source, or user data.

## Sampling Contract

For each run, record:

- run configuration and wall-clock start time;
- project label and the exact `Current project pointer changed to (...)` line used as time zero;
- Resolve main-process creation and main-loop timestamps;
- Workflow Plugin load and interface-ready timestamps;
- child process creation timestamps and command lines;
- Resolve `Responding` state sampled at short intervals;
- cumulative CPU and working-set changes for Resolve and child Electron/Node/Python processes;
- GPU engine utilization keyed by process id for Resolve and Workflow Electron/Chromium children;
- the user-observed start/end of playhead stutter during a defined interaction interval;
- start and end of observed unresponsiveness;
- relevant log gaps and messages.

Native PowerShell/CIM and existing logs are sufficient. Add a small task-local sampling script only if repeated inline commands become error-prone; do not add a dependency or product monitoring framework.

A run that never reaches a current-project pointer is pre-project context only and cannot establish whether Clackly causes the reported freeze.

For the interactive sample, begin dragging the playhead after the timeline is visible, continue for 30 seconds, then leave Resolve idle for the remainder of the sample. Record whether movement stutters, when it starts, and when it clears.

## Isolation Strategy

If Workflow-only reproduces the freeze:

1. Add temporary timestamp logging around the existing `workflow-plugin/main.js` startup milestones.
2. Disable one startup operation at a time, starting with the largest boundaries:
   - Workflow Integration initialization;
   - hidden BrowserWindow/renderer creation;
   - global shortcut registration;
   - single-instance/lifecycle wiring.
3. Restore temporary changes after every run.
4. Attribute the cause only when removing one operation consistently removes or materially shortens the freeze.

If the baseline still freezes, stop modifying Clackly and report that Clackly is not causal under the tested conditions.

## Root-Cause Standard

A conclusion must include:

- a reproducible configuration difference, or explicit evidence that no tested configuration reproduced the symptom;
- timing evidence matching the user-visible freeze;
- the smallest isolated component supported by the experiments;
- at least one rejected competing hypothesis;
- confidence and remaining uncertainty.

## Rollback

Restore both installed entrypoints to their exact original paths, remove temporary diagnostic files or code changes, and verify `git status` contains only intentional task research/artifact changes.
