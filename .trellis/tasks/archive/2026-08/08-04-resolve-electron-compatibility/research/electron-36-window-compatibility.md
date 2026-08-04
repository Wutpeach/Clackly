# Electron 36 Window Compatibility Research

## Verified Runtime Boundary

- Resolve 20.3.2.9 launches Workflow Integration plugins with its bundled Electron 36.3.2 executable.
- Local development currently resolves Electron 43.2.0 from `electron: ^43.2.0`.
- The installed Workflow Integration app tree is current; its `electron/main/window.js` hash matches the source tree.

## API Evidence

- Electron 36.3.2 `BaseWindowConstructorOptions` documents `frame`, `resizable`, `maximizable`, `minimizable`, `fullscreenable`, `titleBarOverlay`, and `thickFrame`.
- Electron 36.3.2 documents neither the `accentColor` constructor option nor `setAccentColor()`.
- `accentColor` appears in Electron 37 documentation and later. The prior `accentColor: false` line therefore cannot affect the Resolve-hosted Electron 36 window.
- Electron 36 defines `thickFrame: false` as removing the Windows `WS_THICKFRAME` standard frame, including native shadow and window animations. Fixed-size windows do not need the resizing behavior supplied by that frame.

Official references:

- https://github.com/electron/electron/blob/v36.3.2/docs/api/structures/base-window-options.md
- https://github.com/electron/electron/blob/v36.3.2/docs/api/browser-window.md
- https://github.com/electron/electron/blob/v37.10.3/docs/api/structures/base-window-options.md

## Existing Renderer Evidence

- The palette shell is programmatically focused through `tabIndex={-1}` and has no shell-specific outline reset, so live validation must distinguish renderer focus outlines from DWM borders.
- Settings already constrains its workspace and detail panel with internal overflow containers. Fixed window sizing needs CSS adjustment only if live validation finds an unscrollable state.
- The current Settings title bar uses a drag region plus native Window Controls Overlay. A fully frameless window needs one custom close action; no custom resize implementation is required.

## Planning Conclusion

Pin local Electron exactly to 36.3.2, make both BrowserWindow option sets explicit and testable, remove the unsupported `accentColor` option, and use `thickFrame: false` for the requested fixed frameless Windows behavior. Verify both a renderer screenshot and the complete Resolve window so focus CSS and DWM chrome are not conflated again.
