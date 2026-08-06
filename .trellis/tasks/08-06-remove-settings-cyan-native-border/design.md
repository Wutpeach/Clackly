# Technical Design: Transparent Settings Native Surface

## Problem and boundary

The user-visible defect is a transient cyan outer edge on the opaque Settings singleton when it first receives focus in Resolve. Two one-shot per-HWND DWM suppression placements (before first `show()` and after `show() -> focus()`) both failed identically in the packaged Resolve host, and the env-gated discriminator did not produce a usable trace in the user run. The user approved a simpler experiment: give the Settings BrowserWindow the same transparent compositor surface the Launcher already uses, while the renderer keeps painting the fully opaque UI.

## Decision

- Settings BrowserWindow options change to `transparent: true` and `backgroundColor: "#00000000"` — the only product-code change.
- The renderer `.settings-shell` already paints `background: var(--color-window)` at `100vw x 100vh`, so the visible UI stays fully opaque with no renderer change.
- The Launcher is the in-repo proof that Electron 36.3.2 on the qualified Resolve host renders a transparent-surface window without a colored native edge.
- **Live result (2026-08-06)**: installed package validated by the user — no cyan edge and no first-open/reopen flicker (user: "问题解决了，没有青边，也没有闪烁"). The two-option change removed the edge.

## Why DWM suppression was abandoned

- Pre-show application: applied during hidden-window construction; live Resolve still showed the edge, cleared after ~3 s, reappeared on titlebar/close hover, then stayed gone for that window instance.
- Post-show/focus application: applied once after the first native `show() -> focus()`; user observation was identical.
- Discriminator: the `RESOLVE_COMMAND_CENTER_BORDER_TRACE`-gated probe build was packaged, but the user run produced no usable trace, so the diagnostic path is closed with the rest of the DWM machinery.
- Conclusion: ordering is not the deciding factor. Either the Resolve/Electron host overwrites/re-paints the attribute, or the visible edge is not controlled by `DWMWA_BORDER_COLOR` on this HWND. Further DWM timing guesses are speculative and out of scope.

## Contract preserved

- Settings stays one `760x560` singleton with `frame: false`, `thickFrame: false`, `transparent: true`, `backgroundColor: "#00000000"`, fixed sizing, custom drag and close controls, internal scrolling, normal focus, `alwaysOnTop: false`, normal taskbar behavior, and the existing close/destroy and reopen behavior.
- Palette construction and conceal/reveal code receive no changes.
- Renderer CSS, JSX, focus-visible rules, and host call sites are unchanged.
- No registry writes, personalization changes, Electron upgrade, native addon, FFI npm package, Python helper, timer, polling, native hook, `hasShadow` change, or committed executable is introduced.

## Risks and mitigation

- First-show/reopen transparent-surface flicker was the known risk; the renderer paints an opaque full-viewport background, which mitigated it. Live validation observed no flicker, so no lifecycle reuse is needed. If a future host regression shows flicker, return to planning for a Settings lifecycle-reuse decision rather than adding speculative lifecycle code.
- Transparent windows on Windows are not resizable; Settings is already `resizable: false`.
- Transparent surfaces can have no native shadow; Settings is frameless with its own custom titlebar, so no native shadow is expected.

## Validation gate

- Live Resolve A/B was the final acceptance and passed: first open, reopen, focus moves (titlebar/sidebar/controls/Resolve), and close/reopen showed no cyan edge; geometry, drag, close, scroll, singleton reuse, and normal taskbar behavior remained intact.
- Automated gates passed: window/model tests, full `npm test`, `npm run build`, `npm run package:win`, `npm run package:verify`, `git diff --check`.

## Rollback

- Revert the two option lines (`transparent: true`; `backgroundColor: "#00000000"` back to `#101216`) and the matching contract-test assertion. No machine-state restoration is needed.

## Rejected alternatives

| Mechanism | Decision | Reason |
| --- | --- | --- |
| DWM `DWMWA_BORDER_COLOR` pre-show | Reject (tried) | Edge still appears, then clears after ~3 s and on hover; attribute overwritten by host paint. |
| DWM post-show/focus | Reject (tried) | Identical live behavior to pre-show. |
| Env-gated DWM discriminator | Reject (tried) | No usable trace in the user run; readback impossible because the attribute is write-only. |
| Palette conceal/reveal reuse | Reject (not needed) | Live validation showed no flicker with the existing close/destroy and reopen behavior. |
| Global Windows accent change | Reject | Machine-wide user setting, out of scope. |
| Electron 37 `accentColor` | Reject | Unsupported by Resolve's Electron 36 host. |
| `hasShadow` / corner experiments | Reject | Targets shadow/corner policy, not the observed border; not approved. |

## Break-the-Loop Analysis

### 1. Root Cause Category
- **Category**: E - Implicit Assumption, plus D - Test Coverage Gap.
- **Specific Cause**: Similar-looking whole-window colored outlines were treated as one DWM-border class even though the Launcher had already demonstrated a renderer/surface distinction (transparent surface, opaque renderer shell). The assumption that the Settings edge was DWM-owned was never validated against the surface-class difference the Launcher proved.

### 2. Why Fixes Failed
1. Pre-show `DWMWA_BORDER_COLOR` write: surface fix based on the wrong/overconfident ownership model; the Resolve/Electron host re-paints the non-client border after construction.
2. Post-show/focus `DWMWA_BORDER_COLOR` write: same surface fix, moved in time; ordering was not the deciding factor.
3. Env-gated discriminator: added complexity and failed to produce usable user-run evidence (attribute is write-only, trace gated on env).

### 3. Prevention Mechanisms
| Priority | Mechanism | Specific Action | Status |
|----------|-----------|-----------------|--------|
| P0 | Documentation | Project-wide spec captures the verified transparent-surface contract and forbids DWM/Python/timer workarounds for this case | DONE |
| P0 | Test Coverage | Exact BrowserWindow contract test asserts `transparent: true` + `backgroundColor: "#00000000"` plus geometry/palette parity | DONE |
| P1 | Process | For Resolve-host-specific opaque frameless behavior, treat live packaged Resolve A/B as authoritative; standalone Electron cannot reproduce it | DONE (recorded in spec) |

### 4. Systematic Expansion
- **Similar Issues**: any future frameless window in the Resolve host should start from the transparent-surface + opaque-renderer-shell pattern (Launcher and Settings both prove it).
- **Design Improvement**: surface class (transparent vs opaque compositor) is a per-window contract decision; renderer must paint the full viewport when the surface is transparent.
- **Process Improvement**: when a native-edge hypothesis would require OS-level interop, first check whether a sibling window already solved the same class of problem with a surface change.

### 5. Knowledge Capture
- [x] Promote verified contract into `.trellis/spec/frontend/quality-guidelines.md` (Metadata-Driven Feature Settings scenario).
- [x] Record live success and failed routes in task-local prd/design/implement/research.
- [ ] No spec template target exists in this repo (`src/templates` absent) — template sync not applicable.