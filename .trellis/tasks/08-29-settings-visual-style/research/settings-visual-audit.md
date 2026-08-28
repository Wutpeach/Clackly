# Settings Visual Audit

## Current Surface

- `resolve-command-center/electron/renderer/SettingsApp.jsx` owns a fixed-size two-pane Settings surface: General/feature navigation on the left and scrollable detail plus a fixed action footer on the right.
- `SettingsRenderer.jsx` projects schema fields without owning product behavior. `styles.css` owns the current visual system.
- `electron/main/window.js` fixes Settings at `760x560`, non-resizable, with its own native window lifecycle. This task must not apply Palette D6/D7 behavior to it.

## Confirmed Visual Drift

- Settings introduces undocumented opaque tile and tooltip neutrals instead of the shared translucent neutral-hover family.
- Sidebar selection combines an accent wash, inset bar, and accent icon. The recommended refinement keeps a restrained orange location signal but returns icons to monochrome.
- Several Settings labels inherit browser defaults or use local font sizes/weights that do not map to `DESIGN.md` typography roles.
- The `44px` detail icon tile and `26px` accent icon exceed the compact interface-icon language.
- Settings fields, navigation, footer, and detail spacing use hard-coded values rather than a coherent `--settings-*` token set.
- The raised footer shadow and repeated inset control shadows add more elevation than the Settings hierarchy needs. The existing shell/titlebar shadows are explicitly authorized and should remain.
- Interaction Help uses plain bold labels even though the read-only Interaction Information vocabulary already has compact keycaps/chips.

## Content Ranges

- Minimum: General plus loading, no registered capabilities, or load-error state.
- Typical: three shipped feature categories, lifecycle card, empty-schema capability, or After Effects path/prefix configuration.
- Maximum: Simplified Chinese copy, long Windows executable paths, missing-dependency/configuration detail, mixed schema control types, and the shipped multi-row interaction bindings.

## Recommended Direction

Retain the current two-pane information architecture and refine its hierarchy. It already fits the fixed window, preserves the host's feature-selection contract, and matches the feature/detail mental model. A navigation restructure would broaden the task into new keyboard behavior, General pseudo-feature semantics, localization, and host-selection risks without solving an observed layout failure.

## Likely Affected Files

- `resolve-command-center/electron/renderer/SettingsApp.jsx`
- `resolve-command-center/electron/renderer/SettingsRenderer.jsx`
- Settings-owned rules in `resolve-command-center/electron/renderer/styles.css`
- A small browser-renderable Settings fixture/evidence path and focused presentation tests
- Existing `electron/main/window.test.js` only if a pinned Settings paint assertion intentionally changes; native size/lifecycle assertions should remain unchanged.

## Evidence Boundary

Browser screenshots may verify renderer paint and content stress states at `760x560`. They cannot establish native Electron focus, transparency, DWM, taskbar, or Resolve behavior.
