# Feature UI Framework Implementation Plan

## Phase 5.1: Feature Catalog

- [x] Add `feature-ui/FeatureCatalog.js` using the existing Capability Registry only.
- [x] Add focused tests for full metadata, defensive copies, insertion order, exact category filtering, invalid category input, and automatic fixture discovery.
- [x] Compose FeatureCatalog in both Electron hosts.
- [x] Add `features:list` IPC and preload `listFeatures()`.

## Phase 5.2: Settings Renderer

- [x] Add `ConfigManager.reset(capabilityId)` and focused preservation/unknown-capability tests.
- [x] Add equivalent config get/save/reset IPC in both Electron hosts and semantic preload methods.
- [x] Add native path/folder picker IPC using Electron `dialog.showOpenDialog`; cancellation returns `null`.
- [x] Add the generic `SettingsRenderer` for all seven schema types with labels and accessible native controls.
- [x] Reuse/extend renderer model helpers only where a pure transformation needs a runnable test; do not add a form framework.
- [x] Keep draft state local and persist complete values only through ConfigManager on Save.

## Phase 5.3: Feature Detail Panel

- [x] Add a shared native-framed Settings BrowserWindow helper with `760x560` default size, `640x480` minimum size, normal resizing, no blur-to-hide behavior, and singleton focus behavior.
- [x] Keep all existing palette modes and their `376x468` sizing unchanged.
- [x] Compose Settings window lifecycle in standalone Electron and Workflow Integration hosts.
- [x] Add semantic `openSettings()` preload/IPC behavior; renderer never sends dimensions.
- [x] Load the existing renderer bundle with a Settings entry marker instead of adding a second build entry.
- [x] Replace the Settings prototype message with open/focus Settings window behavior.
- [x] Render the FeatureCatalog-driven sidebar grouped by metadata category.
- [x] Render one unified detail panel with metadata header, description, SettingsRenderer, associated Command interaction help, Save, and Reset.
- [x] Add loading, empty, no-settings, no-help, picker-cancel, success, and error states.
- [x] Preserve keyboard/focus/window-close behavior and keep palette command search/execution handlers out of the Settings entry.
- [x] Add rectangular two-column Settings CSS using existing tokens, minimum-size behavior, and scroll containment; add no new visual system or dependency.

## Validation

- [x] `node --check feature-ui/*.js config/*.js electron/main/*.js workflow-plugin/main.js`
- [x] Focused `node --test` for FeatureCatalog, ConfigManager reset, registry, and renderer model behavior.
- [x] `npm test` (62 Node tests and 9 Python tests passed).
- [x] `npm run build`
- [x] `git diff --check`
- [x] Search renderer/UI code for capability-id branches, hard-coded feature rows, Resolve APIs, ConfigStorage imports, raw config-file access, and direct capability execution.
- [x] Verify standalone Electron and Workflow Integration register identical feature/config/picker channels.
- [x] Verify Launcher, Search, and All Actions still map to `376x468` and Settings dimensions remain main-process-owned.
- [x] Verify repeated Settings opens reuse/focus one BrowserWindow and Settings remains visible after losing focus.
- [x] Verify Settings DOM/behavior at default and minimum window constraints; interactive pixel-level screenshot inspection remains a manual follow-up because Electron capture stalled in this environment.

## Risky Files and Rollback Points

- `electron/renderer/App.jsx`: preserve Launcher, Search, All Actions, execution, interaction, and tooltip behavior while adding one isolated mode.
- `electron/main/main.js` and `workflow-plugin/main.js`: keep IPC parity and existing execution/lifecycle handlers unchanged.
- `electron/main/preload.js`: expose semantic methods only; preserve context isolation.
- `config/ConfigManager.js`: reset must preserve unrelated capability sections and reload before write.
- `electron/main/window.js`: preserve palette behavior while adding a separate Settings creator/focuser with no shared blur-to-hide listener.

## Review Gate

- [x] Every PRD acceptance criterion maps to a focused test, build check, boundary search, or window/DOM inspection.
- [x] No feature-specific page/component/window, second renderer bundle, second metadata registry, defaults system, form dependency, plugin SDK, binding editor, or Resolve API call appears in the diff.
- [x] Final Trellis quality check passes before commit.
