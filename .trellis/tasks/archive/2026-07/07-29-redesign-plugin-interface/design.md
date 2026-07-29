# Technical Design

## Approach

Replace the current single search-list renderer with one React surface containing three explicit modes: `launcher`, `search`, and `all-actions`. Keep state local to `App.jsx`; no router or global store is needed. `lucide-react` is the sole added UI dependency and supplies the interface icon set.

The renderer builds a presentation catalog by combining real command metadata loaded through preload with a small renderer-only fixture catalog used to demonstrate the full specification. Fixture entries carry a generic unavailable/prototype flag and never enter the command engine. Real entries retain their command ids and execute through the existing IPC contract.

## Boundaries

- Renderer: mode state, query, keyboard selection, presentation ranking, pinned/recent prototype state, grouped display and status messages.
- Preload: expose one additional semantic `setPaletteMode(mode)` method; continue exposing existing command operations.
- Electron hosts: validate the requested mode and resize the shared palette window through `electron/main/window.js`.
- Command engine and Resolve adapters: unchanged.

Renderer code must not import Node, bridge, Workflow Integration or Resolve modules. It sends only command ids for execution and a bounded mode name for resizing.

## State and Data Flow

1. `palette:shown` resets query, selection, status and mode to `launcher`, requests launcher size and focuses the keyboard target.
2. Printable input in Launcher sets the query and enters `search` immediately.
3. Search results are ranked by exact match, pinned, recent, then remaining metadata match; unavailable fixtures remain visibly marked.
4. Arrow keys change the active item; Enter executes an available real command or shows a prototype-only status without calling IPC.
5. The Bottom Bar grid button enters `all-actions`; commands are grouped by initial `A–Z/#`, with the visible/selected letter synchronized.
6. Escape hides the palette from every mode. Successful real execution continues to hide through the existing host behavior; errors remain visible and refocus the search path.

## Window Contract

`electron/main/window.js` owns the only size map:

- `launcher`: `376×468`
- `search`: `376×468`
- `all-actions`: `376×468`

Both `electron/main/main.js` and `workflow-plugin/main.js` handle `palette:set-mode` and call the shared resize helper. Unknown modes are ignored or normalized to `launcher`; arbitrary renderer-provided width/height values are not accepted.

The initial BrowserWindow size changes to launcher dimensions. Existing frame, resizable, taskbar, topmost, centering and blur-hide behavior remains unchanged.

## Visual Assets

- Add `electron/renderer/assets/clackly-logo.svg` and `clackly-mark.svg`.
- Preserve those two custom brand assets, and map command/control icon names to tree-shakeable `lucide-react` components.
- Render Lucide icons with a fixed `1.9px` absolute stroke width and existing optical sizes; keep them decorative where the surrounding control already has an accessible label.
- Define the confirmed palette, spacing, radii, motion and typography values as CSS custom properties in `styles.css`.

## Compatibility and Accessibility

- Preserve `contextIsolation: true` and the narrow preload boundary.
- Preserve keyboard search, arrows, Enter and Escape; add semantic buttons, listbox/options or equivalent roles, accessible labels and visible focus/selected states.
- Respect `prefers-reduced-motion` by removing scale/translate transitions.
- Demo commands must announce that they are prototype-only and cannot be executed.

## Testing Strategy

- Extract ranking/grouping into a small renderer model module with one Node test file.
- Add the renderer model test glob to the existing `npm test` script.
- Run existing tests and production build.
- Run the Electron/Vite UI and inspect Launcher, Search and All Actions at their actual host window sizes.
- Configure Impeccable Live against `resolve-command-center/index.html`, use the Vite page at `http://127.0.0.1:5173` for iterative visual preview, then run Live cleanup before final validation.

## Trade-offs

- Local fixture data is deliberate prototype scaffolding. It demonstrates dense states without polluting executable command manifests; remove it when the real command catalog becomes large enough.
- Pinned/recent state remains in-memory because persistence is explicitly out of scope.
- `lucide-react` replaces a growing hand-authored path table with one maintained icon vocabulary; no other UI library is introduced.
- Search stays at `376×468`; the optional `420×560` expansion is deferred because it is not required for MVP acceptance.
- Browser Live preview validates renderer composition and HMR quickly, but Electron remains the authority for frameless-window sizing, always-on-top behavior, blur hiding and preload IPC.

## Rollback

The redesign is isolated to renderer files, two SVG assets, the `lucide-react` dependency metadata, the shared window sizing helper, two IPC registrations, preload exposure and one package test-script addition. Reverting those files restores the current search-only palette without touching command execution or Resolve adapters.
