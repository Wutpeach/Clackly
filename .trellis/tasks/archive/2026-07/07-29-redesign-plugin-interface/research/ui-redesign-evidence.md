# UI Redesign Evidence

## Current implementation

- `resolve-command-center/electron/renderer/App.jsx` owns search state, keyboard selection, execution status and palette-show reset.
- `resolve-command-center/electron/renderer/styles.css` is a single flat search-list theme with no reusable tokens.
- `resolve-command-center/electron/main/window.js` creates a frameless, non-resizable `720×360` window that starts hidden, skips the taskbar, floats while visible and hides on blur.
- Both standalone Electron and Workflow Integration use the shared window helper and the same renderer/preload boundary.
- `preload.js` exposes command list/search/execute, hide and palette-shown events; the renderer has no direct Node or Resolve access.
- The real command registry currently contains only `timeline.addMarker`.

## Preserved prior decisions

The archived Resolve Command Center MVP and prior conversation establish:

- Renderer code owns search, presentation and keyboard interaction only.
- Execution crosses preload IPC using only the selected command id.
- Command-specific Resolve behavior must not be added to renderer code.
- The palette starts hidden, stays off the taskbar, floats when opened, focuses its keyboard path, hides on Escape and hides after successful execution.
- Workflow Integration remains the preferred Resolve lifecycle path; the standalone path shares the renderer and remains a development fallback.

## Redesign implications

- The user clarified that Launcher, Search and All Actions must all remain `376×468`; mode changes update content without changing workspace occupation.
- Prototype-only commands must be presentation fixtures and visibly unavailable, never registered as executable command capabilities.
- Launcher, Search and All Actions can share one renderer catalog and a small state model; no router, state library or new dependency is required.
