# Resolve Post-project Freeze Root-cause Report

## Conclusion

The reported delayed freeze is currently **non-reproducible**. Four controlled post-project configurations were freeze-negative:

1. both Clackly entrypoints disabled;
2. Workflow Plugin only;
3. Utility installed only;
4. a controlled standalone bridge/Electron process running while both entrypoints were installed.

No controlled run produced a Resolve `Responding=False` sample. Historical Resolve logs correlate Clackly plugin load with later 12–29 second log gaps, but the controlled A/B evidence does not establish Clackly causation. No production fix should be shipped from this task.

Timeline playhead stutter was recorded with both entrypoints disabled, Workflow-only, and the standalone-overlap attempt. The Utility-only observation did not record a playhead result. Its presence with both Clackly entrypoints disabled establishes that Clackly is not required for the stutter under the tested conditions. This finding does not identify a hardware fault or any other root cause for the stutter.

## Controlled reproduction procedure

For each valid run:

1. Verify Resolve and old Clackly processes are closed.
2. Set the intended installation/process configuration with reversible same-drive link moves.
3. Launch Resolve visibly and open a safe project with a timeline.
4. Use the exact Resolve log line `Current project pointer changed to (...)` as time zero.
5. Wait five seconds, drag the playhead left/right for 30 seconds, then leave Resolve idle.
6. Sample Resolve and Clackly process creation, command lines, `Responding`, cumulative CPU, working set, and NVIDIA per-process utilization.
7. Close Resolve normally, restore both entrypoints, and terminate only experiment-created standalone processes.

## Run table

| Run | Time zero | Clackly runtime state | Delayed freeze | Playhead stutter | Resolve non-responding samples | Key evidence |
| --- | --- | --- | --- | --- | ---: | --- |
| Pre-project context | none | Both disabled | Not diagnostic | Not tested | 0 | No project pointer occurred. |
| Both disabled baseline | 15:02:34.046 | No Clackly process | No | Yes | 0/76 | Peak WS 2404.3 MB; Workflow and Utility held. |
| Workflow-only | 15:09:01.170 | Workflow Electron main + GPU/network/renderer children | No | Yes | 0/64 | Plugin loaded 32.786s after pointer; Ctrl+Space did not show palette. |
| Utility-only-installed | 15:13:34.103 | No Clackly process | No | Not recorded | 0/76 | Utility script did not auto-run; shortcut absence expected. |
| Active standalone overlap | 15:22:10.436 | Healthy bridge + standalone Electron tree; no Workflow Electron tree | No | Yes | 0/85 | Standalone owned Ctrl+Space; no Workflow `Loaded plugin` event or warning. |

## Evidence details

### Historical correlation

Earlier sessions logged `Loaded plugin:com.wutpeach.clackly` followed by long gaps of 14.070s, 15.158s, 12.684s, and 28.642s. Those timings matched the user's earlier description, but a log gap is not a GUI responsiveness measurement and did not recur as a freeze in controlled runs.

### Workflow-only lifecycle

Workflow-only conclusively started the plugin:

- project pointer: `15:09:01.170`;
- plugin loaded: `15:09:33.956`;
- interface ready: `15:09:34.130`;
- Workflow Electron main and three Chromium children started at `15:09:33–34`.

Resolve stayed responsive throughout. This rejects ordinary warm-profile Workflow startup as a sufficient cause of the freeze. However, `Ctrl+Space` did not show the palette, which remains a separate initialization/hotkey-registration defect worth fixing in a separate scoped task.

### Utility installation versus execution

The Utility-only-installed run created no `fuscript`, bridge Python, npm/Node, or standalone Electron process. Resolve Utility scripts are menu-triggered and are not automatic startup hooks. Passive dual installation therefore does not mean two Clackly runtimes are active.

### Active standalone overlap attempt

The supported launcher created a healthy bridge and standalone Electron tree and successfully owned `Ctrl+Space`. When Resolve started, no Workflow Electron tree or Workflow `Loaded plugin` event appeared. The plugin was only logged as unloaded during Resolve shutdown, showing that Resolve still recognized the installed entrypoint but did not complete the usual Workflow handshake.

The attempt therefore did not achieve two active Clackly Electron runtimes. A shared single-instance-lock boundary is one possible explanation for the early exit, but it was not instrumented or established; the standalone and Workflow hosts also use different user-data directories, so lock identity cannot be inferred from the process outcome alone. Other Workflow launch or initialization failures remain possible. The evidence establishes only that standalone retained shortcut ownership, no Workflow runtime was observed, and this installed-Workflow plus active-standalone state did not reproduce the freeze.

### GPU and responsiveness

- Resolve produced zero `Responding=False` samples in every controlled run.
- Workflow-only Resolve GPU peaked at 16% SM / 11% memory-engine; Workflow Electron GPU registered 0% in available samples.
- Utility-only Resolve GPU peaked at 15% / 15%.
- Active overlap Resolve GPU peaked at 25% / 13%; standalone Electron GPU registered 0%.

The process sampler produced roughly 1.2-second Resolve sample spacing because CIM collection added overhead despite the script's 500 ms sleep. That cadence should have exposed the reported 10–30 second freeze, but it can miss shorter stalls, and Windows `Responding` is only a GUI message-loop heuristic. The interactive observations are therefore part of the conclusion, not replaced by this field.

No controlled run showed Clackly GPU saturation. Because the historical freeze did not reproduce, these samples cannot rule out transient GPU behavior during an earlier event.

## Rejected or unsupported hypotheses

- **Workflow Plugin startup always freezes Resolve:** rejected for the tested warm-profile state; the plugin and Chromium children loaded without a freeze.
- **Installing both entrypoints automatically runs two Clackly instances:** rejected; Utility installation alone started nothing.
- **An active standalone plus Workflow process causes resource contention:** not tested directly because the overlap attempt did not produce a Workflow Electron runtime. The tested state—active standalone plus installed Workflow entrypoint—was freeze-negative.
- **Clackly causes the playhead stutter:** rejected under the tested conditions; stutter persisted with both entrypoints disabled.
- **GPU saturation causes the freeze:** not observed in the freeze-negative controlled runs, but not ruled out for an earlier transient event because the freeze did not reproduce.
- **The playhead stutter proves a hardware problem:** unsupported. The experiment isolates it from Clackly only.

## Deferred hypothesis: cold Chromium profile initialization

Both standalone and Workflow controlled runs used existing warm user-data directories:

- `%APPDATA%\clackly`
- `%APPDATA%\Clackly Workflow Plugin`

A one-time Chromium/Electron cache migration, profile repair, or cold initialization remains an untested hypothesis for a historical freeze that disappeared during repeated warm launches; no evidence from these runs favors it over other transient external state. Testing it requires separate user authorization because it would temporarily move a user-data directory. A safe test must move—not delete—the exact directory to a same-drive holding path, run once, then restore it after Resolve and Electron close.

No user-data or cache directory was moved in this task.

## Confidence and remaining uncertainty

- **High confidence:** the freeze was absent in all controlled runs performed today.
- **High confidence:** playhead stutter is independent of Clackly under the tested conditions.
- **High confidence:** Utility installation alone does not auto-start the standalone path.
- **Low confidence:** a single-instance boundary explains the missing Workflow runtime in the overlap attempt; no lock instrumentation was added and other early-launch failures remain possible.
- **Low confidence:** cold Chromium user-data initialization explains the historical freeze; it remains untested and unsupported by direct evidence.

The historical freeze could also depend on transient external state not present during the controlled runs. If it recurs, capture the exact wall-clock onset and preserve the corresponding Resolve log and process tree before restarting anything.

## Recommended follow-ups

1. Create a separate small fix task for Workflow-only `Ctrl+Space`/palette initialization and make hotkey registration success observable.
2. If the freeze recurs, rerun the smallest matching configuration immediately with the sampler before warming caches or restarting repeatedly.
3. Only with explicit authorization, run the reversible cold user-data experiment described above.
4. Investigate playhead stutter separately from Clackly using Resolve-native performance diagnostics, project/timeline complexity, storage/cache behavior, and GPU driver/render settings.

## Restoration verification

- Resolve closed normally after every experiment.
- Workflow Plugin restored as a junction to `D:\Clackly\resolve-command-center`.
- Utility restored as a symbolic link to `D:\Clackly\resolve-command-center\resolve\Clackly.py`.
- No experiment-created Clackly bridge, npm/Node, or Electron process remains.
- No production code or user-data directory was changed.
