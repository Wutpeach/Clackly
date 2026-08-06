# U0 observation

- User result: reproduced the whole-Resolve GUI stall.
- User timing: approximately 10 seconds after the project opened, lasting approximately 2 seconds.
- User scope check: all Resolve GUI controls were unclickable; this was not timeline-only stutter.
- Project pointer: `2026-08-04T20:22:47.398+08:00`.
- Clackly Electron process creation: approximately `2026-08-04T20:22:48+08:00`.
- First sampled `Resolve.Responding=False`: `2026-08-04T20:23:00.3159468+08:00`, approximately 12.9 seconds after the project pointer.
- Requested/actual normal Responding cadence: 100ms / 93.93ms median.
- Sampler limitation: querying `Process.Responding` blocked for approximately 5 seconds twice while Resolve was unresponsive and remained false beyond the user's perceived recovery. It supports onset/binary reproduction but does not resolve the user's approximately 2-second duration.
- U0 gate: passed. Proceed to equal traced A1/B1/A2 runs.
