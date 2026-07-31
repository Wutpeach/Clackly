# Interaction Binding System Implementation Plan

## Implementation

- [x] Add `interaction/BindingStorage.js` with the canonical binding schema, normalization, duplicate-trigger rejection, defensive copies, `bindings.json` appData path, first-run default binding, and atomic persistence reused from ConfigStorage.
- [x] Add one focused BindingStorage test covering first-run default creation, round-trip persistence, modifier normalization, empty persisted bindings, malformed bindings, and duplicate normalized triggers.
- [x] Add `interaction/InteractionManager.js` with dependency validation, mouse-event normalization, exact matching, unmatched result, and delegation to the injected `executeCommand(commandId)`.
- [x] Add one focused InteractionManager test covering left/right click, `CTRL`/`SHIFT`/`ALT` combinations, order-independent exact matching, extra-modifier non-match, unsupported button non-match, one-call delegation, and executor error propagation.
- [x] Compose BindingStorage and InteractionManager in both Electron hosts using the existing Command executor and common appData root.
- [x] Add one preload interaction IPC method and route generic command-card left/right mouse events through it using only target/button/modifier facts.
- [x] Preserve direct keyboard Enter execution and browser-preview behavior.
- [x] Add the Interaction tests to the existing `npm test` script without adding a dependency or test framework.
- [x] Update README and backend/frontend specs with the Interaction -> Command -> Capability boundary and the explicit lack of double-click/global-shortcut behavior.

## Validation

- [x] `node --check interaction/*.js electron/main/*.js electron/main/preload.js workflow-plugin/main.js`
- [x] `node --test interaction/*.test.js command-engine/*.test.js capability/*.test.js config/*.test.js shortcut/*.test.js`
- [x] `npm test`
- [x] `npm run build`
- [x] `rg -n "capability" interaction electron/renderer/App.jsx electron/main/preload.js` confirms Interaction and renderer event-routing code contain no Capability ID mapping or resolution.
- [x] `rg -n "double|dblclick|onDoubleClick|globalShortcut|ShortcutManager" interaction electron/renderer/App.jsx` confirms no double-click or shortcut-manager scope leaked into Interaction Binding.
- [x] Review both host IPC handlers to confirm matched mouse execution still uses the same `executeCommand(commandId)` instance and successful execution hides the palette.
- [x] Review the final diff to confirm `command-engine/registry.js`, `command-engine/executor.js`, Capability code, Config Manager behavior, adapters, and ShortcutManager behavior are unchanged unless a test-script/doc-only adjustment is required.

## Risky Files and Rollback Points

- `electron/renderer/App.jsx`: keep keyboard navigation, selection, unavailable-command behavior, error display, and generic card rendering intact; change mouse dispatch only.
- `electron/main/main.js` and `workflow-plugin/main.js`: add identical interaction composition without altering existing command/capability setup or host-specific adapter wiring.
- `electron/main/preload.js`: expose one narrow interaction API and preserve all existing methods.
- `interaction/BindingStorage.js`: keep binding validation independent from Command and Capability registries; persisted files must never be partially replaced.
- Rollback restores direct mouse `executeCommand(command)` calls and removes interaction IPC/composition; no migration of `config.json` is involved.

## Review Gate

- [x] Every PRD acceptance criterion maps to a focused test, full-suite/build command, or explicit boundary search.
- [x] Bindings reference only Command IDs through `action.command`.
- [x] Existing Command Registry remains the sole Command ID -> Capability ID mapping owner.
- [x] No Double Click, global shortcut, Resolve shortcut mutation, settings UI, new command behavior, plugin system, binding priority, or speculative abstraction appears in the diff.
- [x] Trellis quality check passes before completion.
