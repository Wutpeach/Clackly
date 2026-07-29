# Interactive Workflow-only Run

## Configuration

- Workflow Plugin junction installed at its original path.
- Utility symlink held outside the Resolve scan root.
- Project: `Untitled Project 1`.
- Sampling time zero: `2026-07-29 15:09:01.170`, `Current project pointer changed to (Untitled Project 1)`.
- Interaction: timeline playhead dragged during the same defined 30-second window.

## User observation

- The delayed post-project-open freeze did **not** occur.
- Timeline playhead dragging continued to stutter.

## Process and GPU evidence

- Clackly loaded at `15:09:33.956`, 32.786 seconds after the current-project pointer.
- Workflow Electron main PID 81432 started at `15:09:33`; GPU, network utility, and renderer children started at `15:09:34`.
- Resolve: 64 samples, zero `Responding=False`, cumulative CPU 30.547s to 63.531s, peak working set 2399.9 MB.
- All four Workflow Electron processes had zero `Responding=False` samples; main-process cumulative CPU was 0.109s to 0.469s.
- NVIDIA per-process sampling recorded Resolve up to 16% SM and 11% memory-engine utilization. The Workflow Electron GPU process registered 0% in the available samples.

## Interim interpretation

- Workflow Plugin alone did not reproduce the delayed freeze in this controlled run, despite confirmed plugin and Chromium child-process startup inside the sample window.
- Playhead stutter occurred in both the both-disabled and Workflow-only runs, so it is independent of Clackly under the tested conditions. This does not by itself identify a hardware cause.
- The next minimum boundary is Utility-only. Run dual-installed only if Utility-only is negative and the historical freeze still needs controlled reproduction.
