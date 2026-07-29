# Pre-project Baseline Note

This run is not a valid causal baseline because no project was opened.

- Configuration: both Clackly entrypoints held outside Resolve scan roots.
- Resolve launched main loop at `2026-07-29 14:41:07.527`.
- No `Loading project` or `Current project pointer changed to (...)` entry occurred before the normal close.
- 57 Resolve process samples were collected; none reported `Responding=False`.
- Resolve cumulative CPU increased from 0.938s to 31.016s and peak working set was 2071.3 MB.
- Resolve closed normally and both original entrypoints were restored.

Use this only as pre-project startup context. It does not test the reported post-project-open freeze.
