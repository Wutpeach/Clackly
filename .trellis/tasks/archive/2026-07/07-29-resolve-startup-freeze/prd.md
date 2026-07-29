# Investigate Resolve Startup Freeze

## Goal

Determine why DaVinci Resolve becomes unresponsive after a project opens and why dragging the timeline playhead/time indicator stutters. Produce an evidence-backed root-cause report before changing production behavior.

## User-Observed Symptom

- Resolve initially starts and responds normally.
- The freeze occurs only after a project has opened; startup that remains in Project Manager is not a valid reproduction.
- Approximately five seconds after project open, Resolve enters a temporary unresponsive state.
- The unresponsive period lasts roughly ten to several tens of seconds.
- Dragging the timeline playhead/time indicator visibly stutters during the affected post-open period.
- Resolve eventually recovers without being killed.

## Confirmed Environment Facts

- Clackly has two installed Resolve integration entrypoints on this machine:
  - Workflow Integration Plugin junction at `C:\ProgramData\Blackmagic Design\DaVinci Resolve\Support\Workflow Integration Plugins\com.wutpeach.clackly`.
  - Utility script symlink at `%APPDATA%\Blackmagic Design\DaVinci Resolve\Support\Fusion\Scripts\Utility\Clackly.py`.
- Resolve logs show `com.wutpeach.clackly` automatically loading during multiple startup sessions.
- After plugin load, repeated sessions contain long log gaps matching the reported timing:
  - `10:23:48.912` plugin load, followed by a `14.070s` gap beginning at `10:23:51.688`.
  - `11:27:31.257` plugin load, followed by a `15.158s` gap beginning at `11:27:45.344`.
  - `13:42:29.379` plugin load, followed by a `12.684s` gap beginning at `13:42:55.542`.
  - `14:17:21.962` plugin load, followed by a `28.642s` gap beginning at `14:17:29.019`.
- The Utility launcher log last records execution at `09:59:05`; later Resolve startup sessions still loaded the Workflow Plugin without another Utility launcher log entry.
- When the Utility path does run, it starts a Python bridge, waits for health, then runs `npm.cmd run start`; that npm script performs `npm run build` before launching Electron.
- Controlled post-project runs found no delayed freeze with both entrypoints disabled, Workflow-only, or Utility-only-installed.
- The Utility-only-installed run started no `fuscript`, bridge Python, npm/Node, or standalone Electron process; the Utility script is not an automatic startup hook.
- `Ctrl+Space` did not summon Clackly in Workflow-only despite confirmed plugin/Electron load. This indicates a Workflow initialization, lifecycle, or hotkey-registration problem independent of the delayed freeze result.

## Initial Working Hypotheses

1. The Workflow Integration Plugin startup or its Resolve-bundled Electron child blocks or starves Resolve during late startup.
2. Resolve is loading both integration paths or retaining a standalone Clackly process, causing resource contention or duplicated lifecycle work.
   - This required a controlled standalone/Utility launch attempt while the Workflow Plugin was installed, because merely installing the Utility script did not start it.
3. A specific operation inside `workflow-plugin/main.js` causes the pause: Workflow Integration initialization, renderer/window creation, global shortcut registration, or single-instance handling.
4. The freeze is unrelated to Clackly and only happens near plugin load by coincidence; a Clackly-disabled baseline must test this.

These are hypotheses, not conclusions.

## Requirements

1. Build a timestamped startup timeline from Resolve logs, Clackly logs, and child-process creation.
2. Reproduce the symptom consistently enough to compare controlled runs.
   - Use any safe project with a timeline; the exact project identity is not causal and need not be fixed across runs.
   - Define sampling time zero from the Resolve log entry `Current project pointer changed to (...)`, not process launch.
   - Include a defined playhead-drag interaction window after the timeline becomes usable.
3. Use reversible A/B runs to separate:
   - baseline with Clackly disabled;
   - Workflow Plugin only;
   - Utility entrypoint only, if needed;
   - current dual-installed state, if needed.
4. If the Workflow Plugin is isolated, narrow the cause by disabling or instrumenting one startup operation at a time.
5. Record CPU, memory, GPU engine utilization, Resolve GUI responsiveness, and relevant Resolve/Workflow Electron or Chromium child-process timestamps during the freeze window when practical.
6. Distinguish correlation from causation and document evidence against rejected hypotheses.
7. Do not implement the production fix in this task unless the user explicitly expands the scope after reviewing the diagnosis.
8. The user has authorized temporarily disabling and restoring the installed Clackly Workflow Plugin and Utility symlink and restarting Resolve several times for controlled tests.

## Acceptance Criteria

- [x] At least one controlled baseline and one Clackly-enabled run open a safe project with a timeline, exercise the playhead during a defined window, and are recorded from the confirmed current-project pointer timestamp.
- [x] The investigation determines whether the freeze persists when Clackly is disabled.
- [x] Conditional isolation is not applicable because controlled evidence did not establish Clackly causality.
- [x] The report includes reproduction steps, observed durations, logs/process evidence, the non-reproducible conclusion, confidence level, and rejected hypotheses.
- [x] Any temporary installation or instrumentation changes are reversible and restored or clearly documented.
- [x] No production fix is shipped as part of the diagnosis-only scope.

## Out of Scope

- Refactoring Capability Registry, command routing, or marker execution.
- Adding new commands or plugin ecosystem features.
- Optimizing unrelated Resolve startup behavior.
- Shipping a speculative fix before controlled evidence identifies the cause.

## Key Decision

- Controlled A/B restarts and reversible movement of both installed Clackly entrypoints are authorized.
