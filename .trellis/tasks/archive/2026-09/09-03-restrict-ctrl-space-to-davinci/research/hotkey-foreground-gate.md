# Ctrl+Space foreground gate research

## Confirmed call flow

- `resolve-command-center/electron/main/hotkey.js:3-17` defines `CommandOrControl+Space` and registers the supplied toggle callback with Electron `globalShortcut`.
- Standalone host flow: `electron/main/main.js:97-103`, `:130-137`, and `:180-194`.
- Workflow host flow: `electron/workflow-plugin/main.js:175-181`, `:214-221`, and `:295-327`.
- Shared reveal behavior lives in `electron/main/window.js:597-621`; it also has non-hotkey callers, so foreground filtering must not be added there.
- Second-instance handlers call `showPalette` directly and are outside this shortcut-only requirement.

## Foreground identity

- No foreground-window helper or dependency currently exists.
- The repository already identifies DaVinci Resolve on Windows by exact executable name `Resolve.exe` in `resolve-command-center/scripts/internal-beta/ClacklyInstaller.psm1:395-402`.
- `resolve-command-center/package.json` has no active-window native dependency; a fixed Windows/Node standard-library probe avoids adding one.

## Recommended minimum boundary

- Add one foreground predicate for the hidden-to-visible hotkey branch and use it for both hosts.
- Allow reveal only when the foreground process name is `Resolve.exe`, case-insensitively; detection failure denies reveal.
- Preserve the visible-to-hidden Ctrl+Space branch without a foreground-process gate.
- Leave direct/manual reveal callers unchanged.
- Add one focused `electron/main/hotkey.test.js` covering allow and deny branches. Baseline `node --test electron/main/composeStartup.test.js` currently passes 7 tests.

## Live latency follow-up

- Manual Resolve acceptance confirmed the foreground gate works, but the per-key `powershell.exe` plus `Add-Type` path adds perceptible reveal latency.
- Local measurements of the current implementation were 383–408 ms per query.
- An ad-hoc fixed persistent helper measured about 347 ms startup, 83 ms for its first query, and 6.5–7.2 ms for steady-state queries. The 6.5–7.2 ms result is only helper request/response time, not Ctrl+Space-to-panel latency.
- `capability/afterEffectsProcessProbe.js` already owns one prewarmed, serialized, bounded, hidden/no-shell PowerShell helper for each Core. Both hosts already prewarm and dispose it.
- Minimum root-cause fix: extend that fixed helper protocol with a foreground-process query, expose a narrow Core callback to the shared hotkey, and remove per-key process creation from `hotkey.js`. Keep fresh queries, strict request IDs/bounds, failure-triggered helper retirement, fail-closed reveal, immediate visible close, and the post-query visibility recheck.

## Installed optimized build measurements

- The optimized Workflow build was installed byte-for-byte and its helper was already persistent when measured, so these samples are not per-key PowerShell startup costs.
- A first external Win32 key-injection/window-polling pass measured 746.153, 653.712, 608.736, 370.229, and 605.404 ms from injected Ctrl+Space to the Palette becoming foreground.
- A later alpha/focus comparison found hidden-to-visible samples ranging from 31 ms to 1,348 ms, including missed synthetic activations. In the same process, visible-to-hidden Ctrl+Space was stable at about 5–8 ms.
- Palette opacity and foreground-focus changes occurred together after the long wait, so `showPaletteWindow()` focus/paint is not the observed dominant delay.
- Process I/O counters on one 1,364 ms activation showed the Workflow Electron process did not write the 14-byte `FOREGROUND` request until 1,348.548 ms after injection. The persistent PowerShell helper read it at the same sample and returned 15.816 ms later. This rules out helper steady-state execution as the dominant delay for that sample and places the wait before the hidden branch reaches the probe write.
- Synthetic keyboard injection is not reliable enough to publish these values as user-input latency: some attempts were missed, and Computer Use could not focus Resolve for an independent hook run. Application-internal stage timestamps are still required before choosing another product fix.

## Installed internal diagnostic measurements

- A temporary Workflow build recorded 25 real Ctrl+Space callbacks on 2026-09-03: 20 `reveal`, 2 `close`, 2 `already-shown`, and 1 `deny`.
- For the 20 reveals, foreground-probe duration was 52–3,140 ms (281 ms median, 3,013 ms p95, 634.7 ms average), while the existing toggle/show call was 9–36 ms (12 ms median, 13.2 ms average).
- The two visible-to-hidden callbacks completed in 1–2 ms and skipped foreground detection as designed.
- Several overlapping callbacks completed together after the oldest probe, confirming that later requests can queue behind the delayed ready-helper path. Combined with the earlier process-I/O sample, the dominant wait is before the already-running helper receives `FOREGROUND`, not in Palette rendering or the helper's Win32 lookup.
- Minimum supported fix: when the persistent probe session is already ready and idle, `drain()` must call `sendNext()` immediately instead of routing the write through `ensureStarted().then(...)`. Keep the asynchronous startup path only for an unstarted helper, preserve request serialization, and remove the temporary JSONL diagnostic after validation.
