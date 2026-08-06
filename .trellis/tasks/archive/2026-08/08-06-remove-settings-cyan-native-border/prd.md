# Remove transient Settings cyan native border (transparent-surface experiment)

## Goal

Remove the cyan outer edge that appears when the Resolve-hosted Clackly Settings window opens and then disappears after several seconds, by switching the Settings native surface to a transparent Electron compositor surface while the renderer continues painting the existing fully opaque Settings UI. Preserve the fixed frameless Settings experience, keyboard focus, custom drag/close controls, and the shared Electron 36 compatibility baseline.

## Background

- Final live validation on 2026-08-06 confirmed the launcher has no orange outline or repeat invocation flash, while Settings still showed a cyan edge immediately after opening.
- Two one-shot DWM suppression placements both failed live in packaged Resolve: applying `DwmSetWindowAttribute(DWMWA_BORDER_COLOR, DWMWA_COLOR_NONE)` before the first native `show()` and again once immediately after `show() -> focus()`. In both builds the cyan edge still appeared on first open, cleared after ~3 seconds, reappeared on titlebar/close-button hover, then cleared for that window instance until close/reopen.
- The env-gated diagnostic discriminator (`RESOLVE_COMMAND_CENTER_BORDER_TRACE`) was built and packaged, but did not produce a usable trace in the user run, so the discriminator path is abandoned together with the rest of the DWM machinery.
- The user compared Settings with the already-fixed Launcher and approved the simpler experiment: give the Settings native surface the same transparent compositor surface the Launcher uses, and let the renderer's existing opaque `.settings-shell` background paint the UI. The Launcher is in-repo proof that Electron 36.3.2 on this host renders a transparent-surface window without a colored native edge.
- **Live success (2026-08-06)**: after installing the verified package, the user reported “问题解决了，没有青边，也没有闪烁” — no cyan edge and no first-open/reopen flicker.

## Requirements

- Settings BrowserWindow gets `transparent: true` and `backgroundColor: "#00000000"`.
- The renderer `.settings-shell` must keep painting the existing opaque window background (`--color-window`) across the full `760x560` viewport. No renderer JSX/CSS change unless a test proves the shell does not fully cover the viewport (verified: it does).
- Preserve current Settings product behavior: `alwaysOnTop: false`, normal taskbar behavior, fixed `760x560` geometry, custom titlebar, focus, scrolling, close/destroy, and existing host calls.
- Do not copy the Launcher conceal/reveal lifecycle. Current Settings close/destroy and reopen behavior is preserved; live validation proved no flicker, so no lifecycle reuse is needed.
- No Python helper, DWM call, timer, polling, native hook, new dependency, Electron upgrade, `hasShadow` experiment, global Windows setting, or conceal/reveal addition.
- Keep the completed palette surface-preserving lifecycle unchanged.

## Acceptance Criteria (final status: PASSED)

- [x] First opening Settings in Resolve shows no cyan/blue system-colored outer edge (live A/B — user: “没有青边”).
- [x] Reopening Settings and moving focus between the title bar, sidebar, controls, and Resolve does not reveal the edge (live A/B — user: “没有闪烁”).
- [x] Renderer control focus indicators remain visible and accessible (no renderer change; palette/launcher parity checks passed).
- [x] Settings remains fixed at `760x560`, draggable, closable, internally scrollable, and reusable as one singleton (exact-contract test asserts the full options object).
- [x] Settings still behaves like a normal window (`alwaysOnTop: false`, normal taskbar behavior — asserted by contract test).
- [x] Launcher invocation remains free of orange outline and repeat-show flicker (palette unchanged byte-for-byte; contract test asserts palette parity).
- [x] Automated window/UI tests, build, Windows package, package verification, and workflow install pass (see `implement.md` command log).
- [x] The transparent Settings contract is promoted into project-wide `.trellis/spec/frontend/quality-guidelines.md` after live validation succeeded.

## Out of Scope

- Copying the palette conceal/reveal lifecycle into Settings (live validation proved no flicker, so it stays out).
- Changing global Windows accent colors or user personalization settings.
- Settings resizing, maximizing, fullscreen, minimize controls, or visual redesign.
- Unqualified Resolve/Electron versions and macOS native chrome.
- Electron upgrade, new native-addon/FFI dependency, `hasShadow` experiments, DWM/Python helpers, timers, polling, or native hooks.

## Break-the-Loop Summary

- **Root cause**: E - Implicit Assumption (plus D - Test Coverage Gap): similar whole-window colored outlines were treated as one DWM-border class despite the Launcher already demonstrating a renderer/surface distinction.
- **Failed fixes**: pre-show and post-show/focus `DWMWA_BORDER_COLOR` writes were surface fixes on the wrong ownership model; the env-gated discriminator added complexity without usable user-run evidence.
- **Successful mechanism**: `transparent: true` + `backgroundColor: "#00000000"` with the renderer's opaque 100vw×100vh `.settings-shell` painting the surface; live validation showed no cyan edge and no flicker.
- **Prevention**: verified contract promoted into `.trellis/spec/frontend/quality-guidelines.md`; exact-contract test added. Full analysis in `design.md`.

## Planning Status

- Closed: user approved the transparent-surface experiment, live validation passed, and the verified contract was promoted to project-wide spec. See `design.md`, `implement.md`, and `research/settings-border-ownership.md` for the full record and Break-the-Loop analysis.