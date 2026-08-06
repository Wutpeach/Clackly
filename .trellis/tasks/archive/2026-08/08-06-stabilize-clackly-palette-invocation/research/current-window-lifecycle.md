# Current Window Lifecycle Evidence

## Confirmed Call Chain

- `window.js` defines three palette modes with identical `376x468` sizes.
- `showPaletteWindow()` calls `setPaletteWindowMode("launcher")`, toggles skip-taskbar and always-on-top, calls `show()`, calls `focus()`, then emits `palette:shown`.
- The renderer handles `palette:shown` by resetting mode/state and later sends the semantic mode back through preload IPC.
- Both Electron hosts route that IPC to `setPaletteWindowMode()`, which calls `setSize()` and `center()` even though the footprint did not change.
- `hidePaletteWindow()` hides and clears always-on-top; the next invocation re-applies it.
- The window's `blur` listener immediately calls the same hide path.

## Chrome Classification Evidence

- Electron is already pinned to the Resolve 20.3.2.9 host baseline, Electron 36.3.2.
- Both palette and Settings already use `frame: false` and `thickFrame: false`.
- Electron 36 has no `accentColor` API, as recorded by the archived compatibility task.
- The palette root is programmatically focused through `tabIndex={-1}` and lacks a shell-specific focus outline reset.

## Planning Conclusion

Delete redundant native mutations before adding coordination or native dependencies. Then compare renderer and complete-window captures. This orders the work from the smallest root-cause repair to the highest-cost platform-specific fallback.
