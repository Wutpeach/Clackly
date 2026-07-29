# Interactive Both-disabled Baseline

## Configuration

- Workflow Plugin junction held outside the Resolve scan root.
- Utility symlink held outside the Resolve scan root.
- Project: `Untitled Project 1`.
- Sampling time zero: `2026-07-29 15:02:34.046`, `Current project pointer changed to (Untitled Project 1)`.
- Interaction: timeline playhead dragged continuously during the defined 30-second window.

## User observation

- The delayed post-project-open freeze did **not** occur.
- Timeline playhead dragging stuttered continuously.

## Interim interpretation

- Absence of the delayed freeze with both Clackly entrypoints disabled supports Clackly causality for the freeze, pending the Workflow-only comparison.
- Persistent playhead stutter with both entrypoints disabled makes that stutter likely independent of Clackly under the tested condition. Do not use playhead stutter alone as the freeze signal in later isolation runs.

## Telemetry note

- Resolve process/UI samples completed and are stored in `process-samples.csv`: 76 samples from `15:02:34.373` to `15:04:03.853`, zero `Responding=False` samples, cumulative CPU 31.656s to 65.094s, and peak working set 2404.3 MB.
- The first background GPU counter attempt produced an empty file; correct the collector before Workflow-only and treat GPU evidence for this run as unavailable.
