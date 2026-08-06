# Round 2 C0 observation

- Installed state: restored original uninstrumented plugin, original `main.js` hash.
- User action: manually opened only local `(Untitled Project 1)` because Resolve did not auto-restore it.
- Sole project pointer: `(Untitled Project 1)` from `Local Database : Local` at `2026-08-05T11:23:34.214+08:00`.
- Clackly daemon/plugin/interface: `11:23:34.932` / `11:23:34.963` / `11:23:35.249`.
- User observation: continuously interacted with Resolve for approximately two minutes after project open; no whole-GUI stall occurred and all controls remained clickable.
- Sampler window: `11:22:38.697` to `11:24:39.823`; because the project was opened manually, instrumented post-pointer coverage was approximately 65.6 seconds. The user's direct observation continued beyond the sampler to approximately two minutes post-pointer.
- `Resolve.Responding=False` samples occurred only from `11:23:08.037` to `11:23:31.029`, before the project pointer. They do not represent the target post-project stall.
- C0 project identity gate: valid; no network/different pointer occurred.
- C0 reproduction gate: failed. The immediately preceding P0 reproduced around 30 seconds post-project, but strict C0 did not. The baseline is intermittent and cannot support the predeclared native-initializer A/B.
- Required outcome: do not build/install A1 or H1; keep original product and installed plugin unchanged.
