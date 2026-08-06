# Bug Analysis: Transparent palette flashes after repeat invocation

## 1. Root Cause Category

- **Category**: E — Implicit Assumption
- **Specific Cause**: The palette treated Electron `BrowserWindow.hide()` as a paint-neutral visibility operation. In Resolve's Electron 36 host on Windows, hiding a transparent BrowserWindow discards or detaches its composed surface; the next native `show()` briefly presents a transparent/stale surface before the renderer is composited again.

## 2. Why Earlier Fixes Failed

1. **Window mutation cleanup**: Removing repeat size, center, always-on-top, and duplicate focus calls was correct simplification but did not cross the actual failure boundary. The flash remained even when no extra mutation or JS hide occurred during show.
2. **Renderer focus outline**: Removing the non-interactive shell outline fixed the launcher orange edge, but that renderer paint was independent from the whole-window flash.
3. **`backgroundThrottling: false`**: Keeping the renderer active while natively hidden did not preserve the Windows transparent surface. First show stayed clean while every post-`hide()` show still flashed.
4. **Initial race hypothesis**: A temporary event trace disproved duplicate shortcuts and immediate blur/hide during a clean single show. The decisive comparison was first show versus repeat show after native hide.

## 3. Prevention Mechanisms

| Priority | Mechanism | Specific Action | Status |
|---|---|---|---|
| P0 | Architecture | Preserve the native transparent surface after first show; conceal with opacity `0`, mouse pass-through, and non-focusability. | Done |
| P0 | Test coverage | Assert first native show, repeat reveal without native show, conceal ordering, logical shown state, blur idempotence, and OS-hidden recovery. | Done |
| P1 | Documentation | Record the surface-preserving window contract in `.trellis/spec/frontend/quality-guidelines.md`. | Done |
| P1 | Live validation | Require qualified Resolve-host testing for native window paint behavior; unit tests cannot observe DWM composition. | Done |

## 4. Systematic Expansion

- **Similar Issues**: Any transparent, repeatedly hidden Electron window on Windows can exhibit the same surface reconstruction flash.
- **Design Improvement**: Separate logical presentation state from Electron's native `isVisible()` when the native surface must stay alive.
- **Process Improvement**: For native paint defects, compare first show, repeat show, and event traces before adding timers or renderer workarounds.
- **Known Separate Issue**: Settings still shows a transient cyan outer edge. It uses a different non-transparent window contract and needs its own native-chrome task rather than inheriting the palette concealment mechanism.

## 5. Knowledge Capture

- [x] Frontend quality spec updated with content-only mode changes and the surface-preserving palette lifecycle.
- [x] Permanent regression tests added.
- [x] Resolve/Electron/Windows live evidence summarized in task research.
- [x] Settings native-chrome issue split into a separate follow-up boundary.
