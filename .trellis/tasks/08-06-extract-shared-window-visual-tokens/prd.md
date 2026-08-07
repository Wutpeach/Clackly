# Extract shared window visual tokens

## Goal

Consolidate the stable visual rules shared by the Launcher/Palette and Settings window shells, and apply one Clackly outer-window treatment to both surfaces, without coupling their distinct native-window behavior.

## Background

- Launcher is a mode of the fixed `376x468` Palette BrowserWindow; Settings is a separate fixed `760x560` BrowserWindow.
- Both native windows already share the verified transparent compositor contract (`frame: false`, `transparent: true`, `thickFrame: false`, and `backgroundColor: "#00000000"`). Their topmost, taskbar, focus, conceal/reveal, and close/reopen behavior intentionally differ.
- Renderer colors, typography, spacing, base radii, header height, and header surface shadow already live under the shared `:root` token block in `resolve-command-center/electron/renderer/styles.css:10`.
- The Palette and Settings title treatments still repeat the same semantic values: a `48px` header, `118x18px` logo, `2x24px` orange brand signal, its glow, and the same header gradient/shadow (`styles.css:125-168`, `styles.css:754-813`).
- The Palette outer shell originally owned a border, radius, ambient shadow, and entry animation (`styles.css:100-112`); Settings did not.
- The user chose to share the Palette outer edge, window radius, and ambient shadow with Settings.
- Packaged Resolve validation exposed one bright pixel at each Palette top corner. The supplied crop measured the left pixel as `#E5E8EF`, far brighter than the semi-transparent shared border can produce. Because the Palette-only `scale(0.98)` entry animation was visually negligible and the remaining renderer-level compositor difference, the user chose to remove the window entry animation while keeping content-mode motion.
- Removing the entry animation cleared the pixel only on first native show; every reveal after `setOpacity(0) -> setOpacity(1)` still reproduced it. This disproved animation as the root cause and isolated the defect to the Palette's native opacity lifecycle.
- A Palette-only `roundedCorners: false` A/B experiment did not remove the repeat-reveal pixel. It also created an unjustified native-surface difference from Settings, so the experiment is reverted rather than retained.
- Replacing native opacity concealment with renderer `visibility: hidden` was also rejected: the fully transparent, still-visible native window exposed a bright host fallback/title surface labeled `Clackly` after concealment. The candidate was rolled back immediately.
- A shared `hasShadow: false` A/B on both BrowserWindows did not remove the Palette repeat-reveal corner pixel. It was rejected and rolled back, confirming the artifact is not the native shadow fringe.
- A shared `setShape` A/B (this task) approximated the `4px` corner with horizontal rectangle bands, then a stepped `2px` silhouette. It removed the DWM white corner pixel on repeat reveals, but Electron 36 `setShape` accepts only rectangles, so the stepped native silhouette introduced unavoidable edge aliasing. It is recorded as a useful discriminating experiment, not production code.
- Final decision (user-accepted 2026-08-07): keep both native surfaces rectangular with `roundedCorners: false` on Palette and Settings, and make the shared renderer outer shell rectangular with `border-radius: 0` (the one-purpose `--radius-window` token is removed). Internal control/tile/rail/toolbar radii are unchanged.

## Requirements

- Reuse and extend only stable values with the same visual intent; do not create a general component library or speculative design-system layer.
- Keep reusable primitive/semantic values in the existing `:root` CSS token block and use semantic names consistent with the current stylesheet.
- Prefer a shared CSS selector for an identical declaration group over creating single-purpose custom properties used by only two selectors.
- Migrate both Launcher/Palette and Settings to the shared outer-shell and header/brand rules, then remove the replaced hard-coded duplicates.
- Apply the Palette outer border, ambient shadow, and inset top highlight to `.settings-shell` with a rectangular silhouette (`border-radius: 0`), while preserving its opaque full-viewport renderer background.
- Do not animate either outer window shell. Keep the existing Search and All Actions content-mode transitions.
- Keep the shared native surface options identical; both Palette and Settings set `roundedCorners: false` so no Palette-only rounded-corner configuration exists.
- Do not ship `setShape`: it removes the DWM white corner pixel but aliases under Electron 36 rectangle-only shapes.
- Preserve the last qualified Palette concealment lifecycle while investigating the corner pixel: native surface stays alive, opacity concealment remains in place, mouse input passes through, and the concealed window is not focusable. Do not return to native `hide()/show()` and do not leave the renderer fully transparent while its native surface is visible.
- Preserve visible keyboard focus, the orange signal rule, renderer viewport coverage, and the verified transparent-surface contracts.
- Preserve all native-window product behavior: geometry, topmost/taskbar policy, Palette blur/conceal/reveal semantics, and Settings singleton close/reopen behavior.
- Keep Launcher-only and Settings-only layout values local when their intent differs, including Palette mode rows and Settings workspace/titlebar structure.
- Keep the change dependency-free and CSS-first; no React abstraction is introduced unless repository evidence reveals a third identical structural consumer.

## Acceptance Criteria

- [x] Existing tokens are reused wherever they already express the shared intent; no one-off or two-consumer value is tokenized when one shared declaration block is clearer.
- [x] Launcher/Palette and Settings consume shared outer-shell and header/brand declarations with no equivalent hard-coded duplicate left in their owning rules.
- [x] Settings visibly uses the same rectangular outer edge, ambient shadow, and inset top highlight as Launcher/Palette, while its titlebar/sidebar/content hierarchy remains unchanged.
- [x] Neither outer window shell uses an entry animation; Search and All Actions retain their content-mode transitions.
- [x] Repeated Palette reveals after native opacity conceal show no bright top-corner pixel (user-validated 2026-08-07).
- [x] Palette and Settings retain their intentional dimensions, native-window options, focus behavior, and lifecycle behavior; both set `roundedCorners: false` symmetrically and all failed experiments (Palette-only `roundedCorners: false`, `hasShadow: false`, `visibility: hidden`, entry animation, opacity removal, `setShape`) are absent from production code.
- [x] Keyboard focus indicators remain visible and unchanged.
- [x] The renderer tests and production build pass; stylesheet boundary searches confirm migrated values no longer remain duplicated in the two shell/header paths.
- [x] Packaged Resolve validation confirms no white point, no edge aliasing, and no orange/cyan native edge or first/repeat-open flicker regression in either window (user-accepted 2026-08-07).

## Validation

- User accepted the installed packaged Workflow package on 2026-08-07: "手工验收完毕，白点、锯齿、彩色边缘都已经消失，提交并归档任务吧。"

## Out of Scope

- Unifying Palette and Settings native-window behavior.
- Creating a new token package, CSS framework, theme provider, React shell component, Storybook, or dependency.
- Redesigning command tiles, Settings forms, navigation, content hierarchy, copy, or adding Settings motion.
- Changing the transparent compositor, DWM, taskbar policy, Settings lifecycle, returning Palette repeat invocation to native `hide()/show()`, or shipping another concealment mechanism without packaged Resolve evidence.
