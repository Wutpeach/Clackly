# Bug Analysis: DWM white corner pixels on repeat Palette reveals

## 1. Root Cause Category

- **Category**: E — Implicit Assumption (primary), plus D — Test Coverage Gap
- **Specific Cause**: Transparent CSS corner pixels were assumed to be renderer-owned: the shared `border-radius` shell should have made the corners fully transparent and paint-safe. On Windows build 26200, DWM/non-client composition appears only inside the packaged Resolve host during the repeat opacity-conceal lifecycle, so the first native show was clean while every `setOpacity(0) -> setOpacity(1)` reveal repainted bright host corner pixels. Standalone Electron tests could not observe this host-only compositor behavior.

## 2. Why Earlier Fixes Failed

1. **Window entry animation removal**: Removing `palette-enter` (`scale(0.98)`) cleared the pixel only on first native show; every repeat reveal still reproduced it. This disproved animation and isolated the defect to the native opacity lifecycle.
2. **Palette-only `roundedCorners: false`**: Did not remove the repeat-reveal pixel and created an unjustified native-surface difference from Settings, so it was reverted rather than retained.
3. **Renderer `visibility: hidden` concealment**: Replacing native opacity concealment left the fully transparent, still-visible native window exposed, showing a bright host fallback/title surface labeled `Clackly`. Rolled back immediately.
4. **Shared `hasShadow: false`**: Did not remove the repeat-reveal pixel on either window, ruling out the native shadow fringe. Rolled back.
5. **`setShape` 4px band A/B (this task)**: Approximating the corner with horizontal rectangle bands removed the DWM white pixel, but Electron 36 `setShape` accepts only rectangles, so the stepped native silhouette introduced unavoidable edge aliasing. It was a useful discriminating experiment, not production code.
6. **Final minimal fix**: Keep both native surfaces rectangular (`roundedCorners: false` on Palette and Settings) and the shared renderer outer shell rectangular (`border-radius: 0`, `--radius-window` removed). Internal control/tile/rail/toolbar radii are unchanged. The user accepted this surface (2026-08-07).

## 3. Prevention Mechanisms

| Priority | Mechanism | Specific Action | Status |
|---|---|---|---|
| P0 | Architecture | Both BrowserWindows use `roundedCorners: false`; shared outer `.palette-shell`/`.settings-shell` is `border-radius: 0`; no `setShape`. | Done |
| P0 | Test coverage | Exact BrowserWindow option contracts pin `roundedCorners: false` for both windows; renderer treatment test asserts `border-radius: 0` and no `--radius-window` token. | Done |
| P1 | Documentation | Frontend quality spec records exact native+renderer contracts and forbids `setShape` for the qualified Windows 11 build 26200 case; DESIGN.md outer radius corrected to rectangular. | Done |
| P1 | Live validation | Require packaged Resolve manual acceptance for outer-surface changes; unit tests cannot observe DWM composition. | Done |

## 4. Systematic Expansion

- **Similar Issues**: Any transparent, frameless Electron window on Windows build 26200 can expose DWM-composed corner pixels; rounded CSS shells on transparent windows are not paint-safe across hosts, and repeat opacity reveals exercise recomposition paths that first show does not.
- **Design Improvement**: Keep outer window silhouettes rectangular at both native and renderer layers; express all rounding inside content surfaces.
- **Process Improvement**: Native paint defects need packaged Resolve A/B evidence comparing first show versus repeat reveals before adopting any native-surface mechanism; standalone Electron cannot reproduce the host compositor.

## 5. Knowledge Capture

- [x] Frontend quality spec updated with exact BrowserWindow contracts, rectangular outer shell, and the `setShape` prohibition.
- [x] Task PRD updated with the experiment history, final rectangular decision, and user acceptance quote.
- [x] DESIGN.md outer-window radius corrected to the accepted rectangular silhouette.
- [x] Permanent regression tests added to `window.test.js`.
