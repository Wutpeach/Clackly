# Implementation Plan

## Before Editing

- [ ] Load `trellis-before-dev` and the frontend quality spec; read Impeccable `craft-floor.md` immediately before UI edits.
- [ ] Reconfirm the worktree and preserve the user's existing `AGENTS.md` change.
- [ ] Search every CSS value/class before replacement and keep Settings selectors outside scope.

## Renderer Composition

- [ ] Derive real `PINNED`, `RECENT`, and fallback `COMMANDS` sections from the existing top-nine launcher list without duplicate commands or a second selection source of truth.
- [ ] Replace launcher tiles with one shared compact command-row presentation while preserving numeric keycaps, Pin, Settings, Search, All Actions, lifecycle gating and execution callbacks.
- [ ] Keep Search as a mutually exclusive mode; add a compact `RESULTS` heading, single-line result metadata and truthful empty result state.
- [ ] Apply the same compact row primitive to All Actions while preserving group order, A–Z navigation and current selected-letter behavior.
- [ ] Separate pointer hover presentation from keyboard selected presentation using only local renderer state/handlers where required; preserve focus, hint and mouse interaction semantics.
- [ ] Recompose the weak footer around existing callbacks; do not display Ctrl+K or synthetic per-command shortcuts.
- [ ] Keep interaction-help/status semantics and restyle it as the only compact secondary panel; do not add submenu behavior or host surfaces.

## Fixed Footprint

- [ ] Change the single shared `PALETTE_SIZE` from `376×468` to the approved `240×320`; keep all three modes and both hosts on that one value.
- [ ] Synchronize the renderer-only `.browser-preview` footprint to `240×320` without adding catalog fixtures.
- [ ] Update only the directly coupled window assertions and cursor placement/flip/clamp expectations, including the existing narrow fake work-area case whose geometry changes at the smaller width.
- [ ] Confirm no mode size map, renderer sizing IPC, show-time resize, recentering or lifecycle mutation is introduced.

## Visual Styling

- [ ] Replace layered tile/card styling with a dense neutral list rhythm: compact search, section labels, `27–29px` rows, `14–16px` monochrome icon slots and a `26–28px` footer.
- [ ] Make default rows transparent, hover softly filled, and selected a restrained light fill with dark high-contrast foreground.
- [ ] Enforce one-line name/metadata truncation, stable right-side metadata/keycap alignment, and lower visual weight for icon/category/status/section/footer.
- [ ] Reduce borders, radii, shadows and separators to the shell/search/secondary surfaces that need them; preserve the rectangular window contract.
- [ ] Cover disabled, active, focus-visible, empty, scroll, reduced-motion and narrow-layout states without touching Settings UI.

## Focused Tests and Documentation

- [ ] Add or update renderer model tests only if a pure section-projection helper is introduced; assert order, dedupe, empty state and registered metadata preservation.
- [ ] Keep shortcut-absence, internal-command filtering, metadata search and command-id execution contracts intact.
- [ ] After the implementation stabilizes, update `DESIGN.md` and `.trellis/spec/frontend/quality-guidelines.md` through the Trellis spec workflow so they record `240×320` and no longer prescribe the replaced 3×3/card presentation; do not refresh stale `.impeccable/design.json` unless separately requested.

## Automated Validation

Run from `resolve-command-center/` unless noted:

- [ ] `node --test electron/renderer/model.test.mjs electron/main/window.test.js`
- [ ] `npm run build`
- [ ] `npm test`
- [ ] `rg -n "Ctrl\\+K|Ctrl K|shortcut" electron/renderer .trellis/spec/frontend/quality-guidelines.md` and verify no synthetic shortcut contract was introduced.
- [ ] Boundary search confirms no renderer Command-id/capability branches and no edits under command-engine/capability/runtime/Resolve execution layers.
- [ ] Run the Impeccable detector/hook if available and verify no applicable UI finding remains.
- [ ] From repository root: `git diff --check` and review the complete diff for unrelated Settings/window/runtime changes.

## Visual and Interaction Acceptance

- [ ] Launch the real Electron renderer and inspect the production `240×320` Default view with the three registered commands.
- [ ] Verify Search with an empty query (multiple results), a matching query, a no-result query, and the longest real command/category.
- [ ] Verify Arrow/Enter/Escape, focus-visible, pointer hover distinct from selected, click/context-menu path, Pin reorder, All Actions switching/A–Z navigation, numeric/ESC keycaps, disabled/recovery and interaction help.
- [ ] Verify all three modes at the actual `240×320` production footprint, including content scrolling, no shell overflow and no control overlap.
- [ ] Capture screenshots through an existing usable preview/capture path if available. Do not add fixtures or new visual-regression infrastructure; browser fallback empty state is not sufficient evidence for populated views.

## Workflow / Resolve Handoff

- [x] After automated and Electron validation pass, run `npm run package:win`, `npm run package:verify`, and `npm run workflow:install:package` before asking for manual validation.
- [ ] Ask the user to restart Resolve and manually verify hosted Default/Search/hover/selected/Pin/Recent/All Actions/interaction help and actual command execution using a local project only.
- [ ] Report unavoidable reference differences: no real submenu and no Ctrl+K/per-command shortcut contract.

## Risk and Rollback Points

- `App.jsx`: keep one flattened command order for keyboard selection; section markup must not create index drift.
- `styles.css`: palette and Settings share tokens/selectors in places; scope compact overrides so Settings is unchanged.
- `window.js` / `window.test.js`: update the single fixed footprint and geometry expectations only; preserve cursor-near placement and conceal/reveal behavior.
- Hover/selected split: ensure pointer hints and direct pointer execution still target the hovered command while keyboard Enter targets selectedIndex.
- Footer/header recomposition: preserve every existing control and accessible name even when its visual position changes.
- Rollback restores renderer files and the prior `376×468` constant/assertions; no data, IPC or lifecycle migration is allowed.

## Acceptance Status — 2026-08-26

Completed:

- Search-led presentation repair, fixed `240×320` footprint, model/window regression coverage, DESIGN/spec synchronization, and dead Palette-header CSS cleanup.
- Final `npm test`: 264 Node tests plus every invoked Python suite passed after the repair and cleanup.
- Final `npm run package:win` and `npm run package:verify` passed; packaged CPython 3.13.14 x64 and the rebuilt renderer assets were verified.
- Temporary Playwright 1.62.1 with Microsoft Edge 151 ran fully headless against only `release/win-unpacked/resources/app/dist/renderer`. Seven exact `240×320` screenshots cover truthful Commands, real UI-driven Pin/Recent projection, Search results/no-results, All Actions/A–Z, simultaneous keyboard selection versus pointer hover, and long unavailable/status help.
- Headless assertions cover exact geometry, no horizontal/footer overflow, single-line rows, separate Search DOM, keyboard entry/Arrow/Enter/Escape semantics, no duplicate Pin/Recent projection, All Actions reachability, no unexpected console/page errors, and Selected > Hover > Default luminance hierarchy.
- Lead visually reviewed all seven packaged-renderer screenshots against the approved reference and accepted the direction. Impeccable returned `{"continue":true}`; `git diff --check` and scope/boundary searches passed.

Pending user-hosted acceptance:

- The final repaired Workflow package was installed after Resolve closed. The packaged renderer and `WorkflowIntegration.node` hashes match the ProgramData installation copy.
- Restart Resolve and perform one concentrated local-project handoff for native transparent-window/DWM composition, cursor-near placement/native focus, Workflow lifecycle, and real command execution.
- Keep the Trellis task `in_progress` until that native/Resolve validation is reported; headless Chromium proves packaged renderer DOM/CSS/keyboard/mouse presentation but not Electron or Resolve host behavior.
