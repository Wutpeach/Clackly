# Feature UI Framework

## Goal

Build a metadata-driven Electron settings surface so a newly registered capability automatically appears as a configurable feature without a feature-specific page or hard-coded feature button.

The framework must preserve the execution boundary:

`Electron UI -> Command Engine -> Capability Registry -> Capability -> Execution Adapter`

Metadata/configuration reads use narrow FeatureCatalog and ConfigManager services; the renderer never imports Resolve APIs, capability implementations, storage modules, or configuration files.

## Background

- Capability metadata is validated and available through `getMetadata()` while registry summaries are available through `getAllCapabilities()` ([capability/registry.js](../../../resolve-command-center/capability/registry.js):60).
- Capability schemas already support `string`, `number`, `boolean`, `color`, `path`, `folder`, and `select` ([config/SchemaValidator.js](../../../resolve-command-center/config/SchemaValidator.js):1).
- ConfigManager already owns schema lookup, reads, saves, and updates ([config/ConfigManager.js](../../../resolve-command-center/config/ConfigManager.js):41).
- Both Electron hosts compose the same Capability Registry and ConfigManager, but currently expose only command/interaction IPC ([electron/main/main.js](../../../resolve-command-center/electron/main/main.js):78, [workflow-plugin/main.js](../../../resolve-command-center/workflow-plugin/main.js):160).
- The renderer Settings button currently reports that settings are outside the prototype ([electron/renderer/App.jsx](../../../resolve-command-center/electron/renderer/App.jsx):355).
- Interaction Help remains Command-owned metadata and must not be moved into Capability Metadata ([backend quality spec](../../../../spec/backend/quality-guidelines.md):412).
- Existing frontend rules require Launcher, Search, and All Actions to retain the fixed `376x468` palette footprint ([frontend quality spec](../../../../spec/frontend/quality-guidelines.md):37). Settings is intentionally a separate window, not another palette mode.

## Requirements

### R1: Feature Catalog

1. Add `FeatureCatalog`, injected with the existing Capability Registry.
2. Treat one registered capability as one feature; do not introduce a second feature manifest or registry.
3. Expose:
   - `getAllFeatures()` returning serializable defensive copies of full Capability Metadata, including `description`, `category`, `icon`, and `configSchema`.
   - `getByCategory(category)` returning only features whose metadata category exactly matches the requested category.
4. Preserve Capability Registry insertion order; the UI may group that result by metadata category.
5. Unknown or blank category input must fail clearly.
6. A newly registered capability must appear without editing renderer feature lists.

### R2: Feature UI IPC Boundary

1. Expose narrow preload APIs for feature listing, capability-scoped config read/save/reset, and native path/folder selection.
2. Register equivalent IPC handlers in standalone Electron and Workflow Integration hosts.
3. Renderer requests capability ids and plain values only; it never receives ConfigStorage, filesystem paths to config files, Capability execution objects, or Resolve objects.
4. Feature discovery and configuration must not call a Resolve API or execute a Command.

### R3: Schema-Driven Settings Renderer

1. Add `SettingsRenderer` as the single generic schema renderer.
2. Generate controls from `configSchema` only:
   - `string`: text input
   - `number`: numeric input producing finite numbers
   - `boolean`: checkbox
   - `color`: native color input
   - `path`: text field plus native file picker
   - `folder`: text field plus native directory picker
   - `select`: native select using declared options
3. Use schema `label` when present; otherwise derive a readable label from the field key without capability-specific copy.
4. Keep edits in a renderer draft until Save.
5. Save the complete capability-scoped value object through ConfigManager.
6. Add `ConfigManager.reset(capabilityId)` to remove that capability's persisted section while preserving all unrelated capability settings.
7. Reset reloads the empty configuration because the current schema contract has no defaults.
8. Required fields use accessible required state and surface ConfigManager validation errors without writing invalid data.
9. An empty schema renders a clear “No settings required” state and no feature-specific fallback UI.

### R4: Dedicated Settings Window and Unified Feature Detail Panel

1. Clicking the existing Settings button opens a separate Settings BrowserWindow rather than replacing Launcher, Search, or All Actions content.
2. Keep Launcher, Search, and All Actions in the existing `376x468` palette unchanged.
3. The Settings window is a larger rectangular management surface with a default size of `760x560`, minimum size `640x480`, and normal resizing. Window dimensions remain owned by Electron main-process code, never renderer input.
4. Reuse the existing renderer build with a settings entry state/route; do not create a second frontend bundle or duplicate application shell.
5. Keep only one Settings window alive per Electron host. Repeated Settings clicks focus the existing window instead of creating duplicates.
6. Opening Settings transfers focus to the new window; the existing palette may hide through its current blur behavior. Closing Settings does not execute a command or mutate configuration.
7. Settings behaves like a normal native-framed desktop management window: it does not auto-hide on blur and is not forced always-on-top.
8. Render a metadata-driven sidebar grouped by category. No feature id, name, category, or icon may be hard-coded in JSX.
9. Selecting a sidebar item renders one unified detail panel containing:
   - Feature name
   - Icon
   - Description
   - SettingsRenderer output
   - Interaction Help
   - Save and Reset actions
10. Feature name, icon, description, category, and schema come from Capability Metadata.
11. Interaction Help remains sourced from Command Metadata: list Commands, select those whose `capability` matches the feature id, and render each Command's declared help rows under that Command name.
12. Do not generate help labels from triggers, infer help from capability ids, or duplicate Command Registry validation.
13. Support loading, empty catalog, no-settings, no-help, save-success, reset-success, picker-cancel, and error states.
14. Preserve keyboard access, visible focus, Escape/window-close behavior, responsive sidebar/detail layout, and scroll containment at the minimum window size.

### R5: Architectural Constraints

1. Do not add feature-specific pages, feature-specific components, renderer command tables, or renderer Capability branches.
2. Do not let UI call Resolve APIs, execution adapters, capability `execute()`, ConfigStorage, or configuration files.
3. Existing command execution and interaction binding flows remain unchanged.
4. Use Electron/native controls and existing dependencies; add no UI framework, form library, schema library, or picker dependency.

## Acceptance Criteria

- [x] `FeatureCatalog.getAllFeatures()` returns every registered capability as a defensive full-metadata feature record.
- [x] `FeatureCatalog.getByCategory()` filters exact metadata categories, preserves order, and rejects blank/invalid input.
- [x] Registering a fixture capability makes it appear in the catalog without editing UI data.
- [x] Both Electron hosts expose equivalent feature/config/picker IPC through preload with context isolation preserved.
- [x] The Settings button opens or focuses one separate `760x560` resizable Settings window, constrained to at least `640x480`, with a metadata-driven category/feature sidebar.
- [x] Launcher, Search, and All Actions remain in the original `376x468` palette and retain existing behavior.
- [x] The Settings window does not auto-hide on blur, is not always-on-top, and repeated open requests do not create duplicates.
- [x] No functional feature button or feature detail content is hard-coded by capability id.
- [x] All seven supported schema types render the specified native/generic control.
- [x] Path and folder fields use Electron native dialogs and picker cancellation leaves the draft unchanged.
- [x] Draft edits do not persist before Save.
- [x] Save routes through ConfigManager validation and persists only the selected capability's complete values.
- [x] Reset removes only the selected capability's persisted values and preserves unrelated capability sections.
- [x] Required-field/type/select validation errors are displayed and invalid data is not persisted.
- [x] Empty schemas and absent Interaction Help render truthful empty states.
- [x] Feature detail name, icon, description, schema, and category come from Capability Metadata.
- [x] Feature Interaction Help comes from associated Command Metadata and remains separate from Capability Metadata and bindings.
- [x] Existing command execution, mouse interaction binding, and Resolve adapter behavior are unchanged.
- [x] Focused catalog/config/renderer-model tests, full `npm test`, and production `npm run build` pass.

## Out of Scope

- Feature-specific pages or custom controls.
- Editing Interaction Bindings or Command Metadata.
- Executing Commands from the feature detail panel.
- Dynamic capability/plugin loading or third-party plugin SDK work.
- Schema defaults, descriptions/help text per field, nested objects, arrays, conditional fields, ranges, secrets, migrations, or filesystem existence validation.
- Double Click, shortcut discovery, or Resolve keyboard customization.
- Changing the size or behavior of the Launcher, Search, or All Actions palette.
- A separate frontend build, feature-specific BrowserWindow, or multiple simultaneous Settings windows.

## Deferred Items

- Add schema defaults only when a real capability needs them; Reset can then restore defaults instead of clearing values.
- Add field-level descriptions, numeric constraints, or custom controls only when the plain seven-type schema is insufficient for a real capability.
- Add binding editing/cross-validation only as a separate Interaction Binding UI task.
