# Interaction Help / Tooltip Schema Implementation Plan

## Implementation

- [x] Add one pure shared trigger module under `interaction/` with canonical modifier ordering, stored-trigger validation, renderer-event normalization, and exact comparison.
- [x] Refactor BindingStorage and InteractionManager to reuse the shared trigger module without changing persisted binding shape or execution behavior.
- [x] Expand focused Interaction tests to prove shared normalization preserves left/right matching, modifiers, duplicates, malformed inputs, and unsupported-button unmatched behavior.
- [x] Extend Command Registry normalization with optional validated `interactionHelp`, duplicate-trigger rejection, and defensive output.
- [x] Add marker Click help to `command-engine/commands/timeline.json` and focused registry fixtures for Right Click plus `CTRL`, `SHIFT`, and `ALT` combinations.
- [x] Add a small renderer-model projection/test for declared Interaction Help while preserving existing generic/prototype hints.
- [x] Render metadata-driven help rows for hover/focus in Launcher, Search, and All Actions using the existing bottom tooltip/status surface and priority rules.
- [x] Add minimal CSS for compact label/description rows without resizing the fixed palette or creating a component framework.
- [x] Update README and executable backend/frontend specs for the shared trigger and Command-owned help contracts.

## Validation

- [x] `Get-ChildItem interaction, command-engine -Filter *.js | ForEach-Object { node --check $_.FullName }`
- [x] `node --test interaction/*.test.js command-engine/*.test.js electron/renderer/*.test.mjs`
- [x] `npm test`
- [x] `npm run build`
- [x] `git diff --check`
- [x] `rg -n "interactionHelp|marker\.add" electron/renderer interaction` confirms renderer/interaction code contains no Capability-owned help or command-specific help copy.
- [x] `rg -n "double|dblclick|onDoubleClick|clicks" interaction command-engine electron/renderer` confirms Double Click was not introduced.
- [x] Verify `timeline.addMarker` still maps to `marker.add`, search results are unchanged, and executor/capability/adapter files are untouched.
- [x] Review Launcher, Search, and All Actions hover/focus paths for the same help overlay, tooltip semantics, and status/error precedence.

## Risky Files and Rollback Points

- `interaction/BindingStorage.js` and `InteractionManager.js`: extraction only; preserve all existing public results, errors, and file shape.
- `command-engine/registry.js`: preserve command search/lookup and execution metadata while adding the optional descriptive field.
- `electron/renderer/App.jsx`: preserve selection, pin/recent state, mouse execution, keyboard activation, error focus restoration, and fixed-window modes.
- `electron/renderer/styles.css`: add only compact help-row styling on the existing surface.
- Rollback requires no storage migration or command/capability changes.

## Review Gate

- [x] Every PRD acceptance criterion maps to a focused test, build/full-suite command, or boundary search.
- [x] Help is declared by Commands and rendered generically; no Capability lookup or command-specific JSX copy exists.
- [x] Binding and Help triggers use the same shared module.
- [x] No Double Click, shortcut learning, AI generation, plugin documentation, new Commands, or tooltip framework appears in the diff.
- [x] Trellis quality check passes before completion.
