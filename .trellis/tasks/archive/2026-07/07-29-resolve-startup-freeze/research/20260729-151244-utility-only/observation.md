# Interactive Utility-only-installed Run

## Configuration

- Workflow Plugin junction held outside the Resolve scan root.
- Utility symlink installed at its original path.
- Project: `Untitled Project 1`.
- Sampling time zero: `2026-07-29 15:13:34.103`, `Current project pointer changed to (Untitled Project 1)`.
- Interaction: timeline playhead dragged during the same defined 30-second window.

## User observation

- The delayed post-project-open freeze did **not** occur.
- `Ctrl+Space` did not summon Clackly.

## Process and GPU evidence

- No Clackly `fuscript`, bridge Python, npm/Node, standalone Electron, or Workflow Electron process started during the run.
- Resolve: 76 samples from `15:13:34.407` to `15:15:04.221`, zero `Responding=False`, cumulative CPU 30.828s to 60.562s, peak working set 2386 MB.
- NVIDIA per-process sampling recorded Resolve up to 15% SM and 15% memory-engine utilization.

## Interpretation

- Utility-only-installed did not reproduce the freeze because the Utility script remained inert; Resolve Utility scripts are menu-triggered, not automatic startup hooks.
- Shortcut absence is expected in this run because no Clackly process was running.
- Shortcut absence in Workflow-only is different: the plugin and Electron children were confirmed running, so failure to show the palette points to plugin initialization, lifecycle, or global-hotkey registration failure.
- With baseline, Workflow-only, and Utility-only-installed all negative, the historical freeze is more consistent with a stale standalone process or active standalone-plus-Workflow overlap than with passive installation state alone.
- Do not launch that overlap test without explicit user confirmation because it starts bridge/npm/Electron processes and may contend for the global shortcut.
