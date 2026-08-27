# Implementation Plan

## Preconditions

- [x] Current repository ownership researched and recorded in `research/repository-ownership.md`.
- [x] All five architecture blocker conditions evaluated as false.
- [x] User approves this final repository-grounded plan in a subsequent message.
- [x] Task is activated with `task.py start` only after that approval.

## Implementation

1. **Update the metadata projection without changing its authority.**
   - Add the resolved action Command name to `getInteractionHelp()` results while retaining description output for Settings and accessibility.
   - Extend renderer model tests for canonical labels, action names, unresolved actions, and multi-versus-single counts.

2. **Replace legacy Actions renderer orchestration.**
   - Remove developer/test Actions input, Actions query/selection/hover/acknowledgement, captured Command state, Actions search/listbox, and `Ctrl+K` handling.
   - Derive interaction rows from the existing `selectedCommand`, raw Commands, and bindings; show Info for every selected Command.
   - Use mapping-only content for more than one resolved interaction and the selected Command description otherwise.
   - Add one local open boolean plus panel measurement/focus refs.
   - Implement universal selected-Command Footer Info and click/Tab/Esc/selection/execute/show/hide lifecycle.
   - Preserve Settings, Pin, ranking/search, direct Enter, mouse interaction, recent/pinned, and existing error behavior.

3. **Implement the compact Interaction Panel visual.**
   - Replace Actions-only CSS with Footer Info and read-only interaction rows.
   - Match the main `#151619` surface, use a `260px` width and `180px` maximum height, wrap action labels, scroll overflow, and retain compact keycaps, restrained active state, subtle border/shadow, and no arrow/title/footer/empty state.
   - Keep the main Palette at `240x320` and preserve focus-visible/reduced-motion behavior.

4. **Rename and adapt the native attached-panel boundary.**
   - Rename preload methods, IPC channels, host registration, window-helper constants/state/functions, and both host imports to Interaction Panel ownership.
   - Change geometry to a `16px` gap, `260px` panel, `516x320` envelope, and two-rectangle shape union.
   - Preserve semantic metrics validation, work-area clamp, idempotence, failure rollback, click-through gap, and show/hide restoration.

5. **Replace Actions tests and browser evidence.**
   - Rewrite window tests/source assertions for the new names and geometry.
   - Remove injected Actions presentation data and Actions-only scenarios from `palette-evidence.mjs`.
   - Add metadata-driven scenarios covering universal Info, mapping/description fallback, wrapping/scrolling, click/Tab toggle, return focus, Esc, selection/execute/Palette-close lifecycle, no auto-open, content restrictions, and visual tokens.
   - Keep existing Launcher/Search/Pin/Settings/interaction execution evidence.

6. **Remove stale product and coding contracts.**
   - Update `resolve-command-center/README.md`, root `DESIGN.md`, and `.trellis/spec/frontend/quality-guidelines.md` to describe Interaction Hint and delete the obsolete Actions authority / `Ctrl+K` / arrow / `422x320` rules.
   - Boundary-search source, tests, docs, and generated evidence code for legacy compatibility names; distinguish unrelated Settings `actions` classes and internal executable action Commands.

## Validation

- [x] `node --test electron/renderer/model.test.mjs electron/main/window.test.js`
- [x] Targeted headless Interaction Panel evidence scenarios against the built renderer.
- [x] `npm run build`
- [x] `npm test`
- [x] Full headless `npm run palette:evidence` (or the updated default scenario set).
- [x] `npm run package:win`
- [x] `npm run package:verify`
- [x] `npm run workflow:install:package`
- [x] Boundary searches find no user-visible `[Ctrl][K]`, legacy Actions trigger/panel, old IPC channels, arrow, developer/test Actions input, or duplicate selected Command state.
- [x] Inspect generated screenshots for shared `#151619`, universal Info, correct Pin, `16px` gap, complete wrapped labels, description fallback, scroll containment, and no triangle/title/footer/navy cast.
- [x] Run `trellis-check` and resolve every verified blocking/major finding.

### Final Validation Results

- Focused renderer/native gate: 42 tests passed.
- Full regression: 271 Node tests and 81 Python tests passed.
- Built renderer: all 9 headless Palette scenarios passed; final independent review evidence is under `evidence/review-final/`.
- Windows directory package generation passed for the approved `260px` / `516px` revision.
- Packaged CPython/runtime verification passed for CPython 3.13.14 x64.
- Packaged renderer: default, description fallback, Interaction Panel, lifecycle, and host-unavailable scenarios passed under `evidence/packaged-revised-final/`.
- Workflow package installation passed on 2026-08-27 and copied the revised package to Resolve's Workflow Integration Plugins directory.
- Final boundary searches found legacy names only in removal assertions, current task history, and archived superseded tasks; no legacy runtime entry, IPC channel, copied selected Command authority, or stale `220px` / `476px` / `#191C20` source contract remains.
- Generated mapping and description screenshots were visually inspected after packaging; both use the shared `#151619` surface and preserve complete readable content.
- `git diff --check` and the Impeccable static detector passed with no findings. The repository defines no lint or typecheck script.

## Native Acceptance and Delivery

- [x] Build/package, verify, and install the revised Workflow package before asking for a real Resolve check, following the project's established install-first rule.
- [ ] Report that automated geometry tests do not prove DWM hit testing or Resolve-host focus; ask the user to restart Resolve and manually verify only after revised installation succeeds.
- [ ] Record the manual result if provided; otherwise clearly mark native host acceptance pending rather than claiming it passed.

## Rollback Points

- After renderer/model change: focused model tests must pass before native helper edits proceed.
- After native helper rename/geometry: focused window tests must pass before evidence/doc updates proceed.
- Before commit: review the complete diff for unrelated Command Engine, Settings, Pin, search, or execution changes; remove any scope creep.

## Finish

- [x] Run the required Trellis spec-update decision and keep updated executable contracts consistent with the revised code.
- [ ] Commit the implementation and task artifacts with the repository clean apart from intentionally installed external package state.
- [ ] Archive the task through the normal Trellis workflow only after required automated checks pass; never claim pending Resolve manual validation as completed.
