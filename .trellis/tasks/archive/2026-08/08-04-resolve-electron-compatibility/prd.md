# Align Resolve Electron compatibility and remove window accent borders

## Goal

Make Clackly's development and validation baseline match the Electron runtime that actually hosts the Resolve Workflow Integration plugin, then remove the native active-window accent borders from both the command palette and Settings without regressing focus or plugin lifecycle behavior.

## Background

- Resolve Workflow Integration is the preferred production path; standalone Electron is a development or compatibility fallback.
- The currently qualified Resolve 20.3.2.9 installation launches Workflow Integration plugins with Electron 36.3.2.
- Local development currently installs Electron `^43.2.0`, so it can accept APIs unavailable in the production host.
- The prior palette fix added `accentColor: false`, but Electron 36.3.2 has no `accentColor` constructor option or `setAccentColor()` API and silently ignores the option.
- The installed Workflow Integration app tree and the current source contain the same prior fix, so stale packaging is not the cause.
- Settings uses a separate `BrowserWindow` configuration and currently has no equivalent accent-border suppression.
- This task qualifies only Resolve 20.3.2.9 with its bundled Electron 36.3.2.

## Requirements

- Establish and document an explicit Electron compatibility baseline derived from the supported Resolve host.
- Make local dependency resolution and automated checks prevent accidental use of Electron APIs newer than that baseline.
- Remove the yellow/orange palette window border and the transient blue Settings window border in the Resolve-hosted plugin.
- Preserve palette hotkey invocation, focus, always-on-top behavior, blur-to-hide behavior, fixed dimensions, transparency, and rounded visual corners.
- Keep Settings fixed at `760x560`; remove its `640x480` minimum size, native resizing, maximizing, fullscreen, and native window frame.
- Keep the custom Settings drag region and provide an accessible custom close button. A minimize button is optional and omitted from this task.
- Keep overflow inside the fixed Settings content area scrollable rather than growing the BrowserWindow.
- Validate behavior through the Resolve Workflow Integration path, not only through standalone Electron unit tests.

## Acceptance Criteria

- [x] The committed Electron dependency and lockfile resolve to the selected compatibility baseline without a semver range drifting to a newer API surface.
- [x] Automated tests fail if window configuration relies on an Electron API unavailable in the baseline host.
- [x] `npm test`, `npm run build`, and the Windows packaging/verification path pass.
- [x] In Resolve Workflow Integration, opening the palette produces no system-colored outer border.
- [x] In Resolve Workflow Integration, first opening and interacting with Settings produces no system-colored outer border.
- [x] Both windows use fixed, frameless Electron 36-compatible configurations with `frame: false`, `resizable: false`, `maximizable: false`, `fullscreenable: false`, and `thickFrame: false` on Windows.
- [x] Settings remains exactly `760x560`, has no minimum dimensions, can be moved through its custom drag region, and closes through an accessible custom title-bar button.
- [x] Settings content scrolls internally when it exceeds the fixed content height.
- [x] The palette still focuses for keyboard control and hides on blur.
- [x] Documentation identifies the supported Resolve/Electron pair and requires live Workflow Integration validation for native-window behavior.

## Out of Scope

- Maintaining a second, newer Electron runtime for a speculative standalone desktop product.
- Broad renderer redesign or replacement of the existing custom Settings title bar.
- Custom resize hit-testing, edge resizing, maximizing, fullscreen, and a Settings minimize button.
- macOS release qualification.
- Supporting unverified Resolve/Electron combinations in this task.

## Notes

- The border workaround for Electron 36 must be chosen from host-supported behavior; merely adding `accentColor: false` to more windows is not sufficient.
- `thickFrame: false` intentionally trades native DWM shadow/animation and edge resizing for borderless fixed windows.
