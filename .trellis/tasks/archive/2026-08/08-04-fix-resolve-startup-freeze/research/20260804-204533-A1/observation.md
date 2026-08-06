# A1 observation

- User result: reproduced the whole-Resolve GUI stall again under traced eager startup.
- User timing: no stall during the first 10-20+ seconds, then the whole GUI became unclickable.
- Scope check: every Resolve control was unclickable; this was not timeline-only stutter.
- Project pointer: `2026-08-04T20:46:16.343+08:00`.
- Clackly Electron launch: approximately `2026-08-04T20:46:17.160+08:00`.
- Workflow initialization: `20:46:17.538` to `20:46:17.554` local time after UTC conversion.
- AE check: `20:46:17.558` to `20:46:17.560` local time after UTC conversion.
- BrowserWindow constructor: `20:46:17.561` to `20:46:17.615` local time after UTC conversion.
- Renderer ready-to-show: `20:46:17.971` local time after UTC conversion.
- Shortcut registration: successful for `CommandOrControl+Space`.
- First sampled `Resolve.Responding=False`: `2026-08-04T20:46:31.3558645+08:00`, approximately 15.0 seconds after the project pointer.
- Requested/actual normal Responding cadence: 100ms / 94.303ms median. A 5.023-second blocking sample occurred after the false state, so sampled duration is not treated as user-visible duration.
- A1 gate: passed. Proceed to traced lazy B1.
