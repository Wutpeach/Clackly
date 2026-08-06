# Settings Border Ownership Research

## Conclusion

- The transient cyan edge was not suppressible by the two one-shot DWM placements tried, and the env-gated discriminator produced no usable trace in the user run.
- The user approved the transparent-surface experiment: Settings BrowserWindow becomes `transparent: true` with `backgroundColor: "#00000000"`, and the renderer keeps painting the opaque `.settings-shell` background.
- **Live acceptance passed (2026-08-06)**: user reported “问题解决了，没有青边，也没有闪烁” — no cyan edge and no first-open/reopen flicker. The verified contract was promoted into `.trellis/spec/frontend/quality-guidelines.md`.

## Repository evidence

- Settings is created once as a fixed `760x560` frameless BrowserWindow and shown/focused through the shared helpers (`resolve-command-center/electron/main/window.js`).
- The Settings root is a plain `<main className="settings-shell">` with no `tabIndex`, ref focus, or programmatic focus call.
- `.settings-shell` fills the viewport (`width: 100vw; height: 100vh`) with `background: var(--color-window)` and declares no outline or cyan border; it is fully opaque and needed no renderer change.
- Interactive buttons, inputs, selects, and the custom close button keep explicit orange focus indication; a shell-wide focus reset would weaken accessibility and was not part of this experiment.
- The launcher shell outline was a separate renderer-owned issue and is already fixed. The completed palette conceal/reveal lifecycle was not reused by this experiment.

## Qualified platform evidence

- Resolve 20.3.2.9 hosts the plugin with Electron 36.3.2 on x64 Windows. The current qualified Windows build is `26200`, above the Windows 11 Build 22000 boundary.
- Electron 36.3.2 documents `thickFrame`, `hasShadow`, `roundedCorners`, and `getNativeWindowHandle()`, but not `accentColor` or `setAccentColor()`.
- Electron 37 adds `accentColor`; using it in source would silently miss the qualified Resolve host and is not an acceptable compatibility fix.
- The Launcher already runs with `transparent: true` and `backgroundColor: "#00000000"` on this exact host and shows no colored native edge — in-repo proof that the transparent compositor surface is viable here.

## Experiment history

- First A/B (pre-show DWM): applied `DwmSetWindowAttribute(DWMWA_BORDER_COLOR, DWMWA_COLOR_NONE)` during hidden-window construction via the packaged managed CPython runtime. Live Resolve still showed the cyan edge on first open, cleared after ~3 s, reappeared on titlebar/close hover, cleared again, then stayed gone for that window instance. Conclusion: construction-time application is overwritten by first native show/focus and non-client initialization.
- Second A/B (post-show/focus DWM): applied the same per-HWND call once, strictly after `show() -> focus()`, for a newly created singleton. User observation was identical to the pre-show build. Conclusion: ordering alone does not decide the issue; the attribute is being overwritten/re-painted by the host, or the visible edge is not `DWMWA_BORDER_COLOR` on this HWND.
- Discriminator (env-gated trace): `RESOLVE_COMMAND_CENTER_BORDER_TRACE`-gated probes were added, but the user run produced no usable trace. Readback of the write-only attributes is impossible (DwmGetWindowAttribute returns E_INVALIDARG for `DWMWA_BORDER_COLOR` 34 and `DWMWA_CAPTION_COLOR` 35; re-verified live on build 26200). The discriminator path is closed together with all DWM machinery.

## Decision record

- Settings adopts only the transparent surface properties, not Launcher product behavior: `alwaysOnTop: false`, normal taskbar behavior, `760x560` fixed geometry, custom titlebar, focus, scroll, close/destroy, and existing host calls all stay as-is.
- No conceal/reveal reuse: current Settings close/destroy and reopen behavior is preserved, and live validation proved it is flicker-free.
- No Python helper, DWM call, timer, polling, native hook, new dependency, Electron upgrade, `hasShadow` experiment, or global Windows setting was introduced.
- The transparent contract is promoted into project-wide `.trellis/spec/frontend/quality-guidelines.md` after live Resolve validation succeeded.

## Remaining risk

- First-show/reopen transparent-surface flicker was mitigated by the renderer's full-viewport opaque `.settings-shell` background and was not observed in live validation. If a future host regression shows flicker, revisit lifecycle reuse in planning; do not ship speculative lifecycle code.

## Mechanism comparison (outcome)

| Mechanism | Outcome |
| --- | --- |
| DWM pre-show suppression | Tried, failed live. |
| DWM post-show/focus suppression | Tried, failed live. |
| Env-gated DWM discriminator | Tried, no usable trace in the user run; closed. |
| Transparent compositor surface | Live-validated fix (this task). |
| Palette conceal/reveal reuse | Rejected (not needed; live validation showed no flicker). |
| Global accent / personalization change | Rejected. |
| Electron 37 `accentColor` | Rejected (unsupported host). |
| `hasShadow` / corner experiments | Rejected. |

## Official references

- Electron 36 BaseWindow options: https://github.com/electron/electron/blob/v36.3.2/docs/api/structures/base-window-options.md
- Electron 36 BrowserWindow native handle: https://github.com/electron/electron/blob/v36.3.2/docs/api/browser-window.md#wingetnativewindowhandle
- Electron 37 accent option (comparison only): https://github.com/electron/electron/blob/v37.10.3/docs/api/structures/base-window-options.md
- Microsoft `DwmSetWindowAttribute`: https://learn.microsoft.com/en-us/windows/win32/api/dwmapi/nf-dwmapi-dwmsetwindowattribute
- Microsoft `DWMWA_BORDER_COLOR`: https://learn.microsoft.com/en-us/windows/win32/api/dwmapi/ne-dwmapi-dwmwindowattribute
