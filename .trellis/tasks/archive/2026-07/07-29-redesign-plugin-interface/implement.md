# Implementation Plan

## Build

- [x] Create first-time root Impeccable Live config targeting the `resolve-command-center` Vite entry; CSP detection is already negative, so no CSP source patch is needed.
- [x] Add the renderer presentation model and a focused Node test for ranking and alphabet grouping.
- [x] Replace `App.jsx` with the three-mode state machine while preserving real command execution and error handling.
- [x] Add `clackly-logo.svg` and `clackly-mark.svg`; use `lucide-react` for consistent SVG command/control icons.
- [x] Replace the renderer's hand-authored icon path table with a small Lucide component map and fixed absolute stroke width.
- [x] Replace `styles.css` with the confirmed tokenized dark visual system and all three layouts/states.
- [x] Add semantic palette-mode IPC to preload, standalone Electron and Workflow Integration hosts.
- [x] Centralize mode sizes in `electron/main/window.js` and change the initial window to `376×468`.
- [x] Add the renderer model test to `npm test` without adding dependencies.
- [x] After the render settles, update root `DESIGN.md` tokens if implementation required any justified adjustment and generate `.impeccable/design.json` from the final system.
- [x] Stop Impeccable Live and remove temporary injection, variant wrappers and carbonize markers before final checks.

## Validation

Run from `resolve-command-center/`:

- [x] `npm test`
- [x] `npm run build`
- [x] `node --check electron/main/window.js`
- [x] `node --check electron/main/preload.js`
- [x] `node --check electron/main/main.js`
- [x] `node --check workflow-plugin/main.js`
- [x] `git diff --check`
- [ ] Launch with `npm run dev` and inspect Launcher, Search and All Actions for clipping, focus, keyboard behavior and actual window resizing.
- [x] Run Impeccable Live against the Vite page during iteration; confirm the picker connects and discarded sessions restore source cleanly.
- [x] `rg -n "impeccable-(live|variants|carbonize)" index.html electron/renderer` returns no unintended temporary markers after cleanup.
- [x] Confirm a real `timeline.addMarker` selection still sends only its command id; do not claim Resolve-side marker execution without manual Resolve validation.

## Risk and Rollback Points

- Window IPC is shared by standalone and Workflow Integration hosts; validate both registrations before visual work is considered complete.
- Fixture commands must never reach `executeCommand`; the model test must cover unavailable entries.
- All semantic modes intentionally share the fixed `376×468` footprint; do not reintroduce mode-specific expansion or accept arbitrary renderer dimensions.
- No changes are permitted under command-engine, capability, bridge or Resolve adapter modules for this prototype.
