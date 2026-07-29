# Controlled Standalone + Installed-Workflow Overlap Attempt

## Configuration

- Workflow Plugin junction and Utility symlink both installed at their original paths.
- Existing supported standalone launcher run before Resolve: `python resolve\Clackly.py`.
- Standalone bridge health returned HTTP 200 and `Ctrl+Space` successfully opened the standalone palette before Resolve launch.
- Project: `Untitled Project 1`.
- Sampling time zero: `2026-07-29 15:22:10.436`, `Current project pointer changed to (Untitled Project 1)`.

## User observation

- The delayed post-project-open freeze did **not** occur.
- No Workflow hotkey-conflict warning appeared.
- `Ctrl+Space` continued to summon the standalone palette normally.
- Timeline playhead stutter persisted.

## Process and log evidence

- Resolve: 85 samples, zero `Responding=False`, cumulative CPU 37.688s to 68.188s, peak working set 2384.4 MB.
- The exact standalone tree remained running: bridge Python 70468/23760, Electron launcher Node 3328, Electron main 50784, GPU 66788, network 47260, renderer 83820.
- Standalone processes had zero `Responding=False` samples and low cumulative CPU growth.
- Resolve reached up to 25% NVIDIA SM and 13% memory-engine utilization; the standalone Electron GPU child registered 0% in the available samples.
- Resolve did not log `Loaded plugin:com.wutpeach.clackly` or `Using interface version`, and no Workflow Electron tree appeared.
- Resolve logged `UiWIPlugin : Unloaded plugin:com.wutpeach.clackly` only during shutdown.

## Interpretation

- Active standalone plus an installed Workflow Plugin did not reproduce the freeze.
- The attempt did not produce two concurrent Clackly Electron runtimes: no Workflow Electron process or successful Workflow handshake was observed. An early exit at a single-instance-lock boundary is one possible explanation, but it was not instrumented or established; other Workflow launch or initialization failures remain possible. The evidence establishes only that the standalone process retained `Ctrl+Space` while the Workflow runtime was absent.
- Playhead stutter was also present in the both-disabled and Workflow-only runs. Its presence with both entrypoints disabled establishes that Clackly was not required for the stutter under the tested conditions; the Utility-only observation did not record a playhead result.

## Cleanup

- Resolve exited normally.
- Only exact experiment-created standalone PIDs 70468, 23760, 77960, 35252, 3328, 50784, 66788, 47260, and 83820 were terminated.
- Bridge port 49371 became unavailable.
- Both original installed entrypoints were verified restored with their original link types and targets.
