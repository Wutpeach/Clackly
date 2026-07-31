# Feature UI Framework Design

## Boundary

Phase 5 adds one metadata/configuration read-write surface without changing execution ownership.

```text
Feature discovery:
Electron Renderer -> preload feature API -> FeatureCatalog -> Capability Registry metadata

Settings read/write:
Electron Renderer -> preload config API -> ConfigManager -> Capability Registry schema + ConfigStorage

Interaction Help display:
Electron Renderer -> existing commands:list -> Command Registry metadata

Command execution (unchanged):
Electron Renderer -> commands:execute/interactions:execute -> Command Engine
  -> Capability Registry -> Capability -> Execution Adapter
```

The renderer knows plain feature, schema, command-help, and configuration records only. It never receives executable capability objects or storage services.

## FeatureCatalog Contract

Add `feature-ui/FeatureCatalog.js` as a small service around the existing registry:

```javascript
new FeatureCatalog({ capabilityRegistry })
catalog.getAllFeatures()
catalog.getByCategory(category)
```

`getAllFeatures()` reuses `getAllCapabilities()` for ordered ids and `getMetadata(id)` for full metadata, then returns structured-cloned records. This preserves the established registry summary contract and avoids a second registry or manifest.

`getByCategory(category)` applies an exact category filter to `getAllFeatures()`. Sorting, aliases, fuzzy matching, and category configuration are unnecessary for the current requirement.

## IPC and Host Composition

Both Electron composition roots construct one FeatureCatalog from their already-populated Capability Registry and expose the same channels:

- `features:list` -> `FeatureCatalog.getAllFeatures()`
- `config:get` -> `ConfigManager.get(capabilityId)`
- `config:save` -> `ConfigManager.save(capabilityId, values)`
- `config:reset` -> `ConfigManager.reset(capabilityId)`
- `dialog:pick-path` -> Electron `dialog.showOpenDialog()` with file or directory properties

Preload exposes semantic methods rather than raw IPC. Picker input is only `"path"` or `"folder"`; the main process owns native dialog options. Cancel returns `null`.

`ConfigManager.reset()` validates that the capability exists, reloads the shared document, deletes only that capability key, persists the remainder, and returns `{}`. No default system is introduced.

## Window Model

Settings is a separate BrowserWindow, not a fourth palette mode.

- Palette window: existing frameless `376x468` Launcher/Search/All Actions surface; existing blur-to-hide and always-on-top-on-show behavior remain unchanged.
- Settings window: one native-framed resizable rectangular desktop window, default `760x560`, minimum `640x480`, not always-on-top, and not hidden on blur.
- Repeated open requests focus the existing Settings window.
- The Settings window loads the existing renderer bundle with a main-process-owned query/entry marker such as `?view=settings`; no second Vite entry or duplicated React application is added.
- The renderer cannot request arbitrary window dimensions.

Both hosts own `settingsWindow` lifecycle next to `paletteWindow`. A shared window helper creates/focuses Settings so standalone Electron and Workflow Integration do not drift.

Opening Settings from the palette naturally moves focus to Settings and allows the palette's existing blur handler to hide it. Closing Settings leaves the palette hidden; the normal hotkey reopens Launcher.

## Renderer Structure

The renderer selects Launcher App or Settings App from the main-process-provided entry marker. Settings uses a normal desktop-window shell while inheriting Clackly colors, typography, icons, spacing, and focus treatment.

```text
Settings window
├─ Feature sidebar
│  └─ categories and features derived from FeatureCatalog data
└─ Feature detail
   ├─ metadata header (icon, name, category)
   ├─ description
   ├─ SettingsRenderer
   ├─ associated Command interaction help
   └─ Save / Reset
```

The larger rectangle uses a stable two-column layout: a compact category/feature sidebar and a wider detail panel. At the minimum supported width, the sidebar stays usable and the detail panel scrolls independently.

`SettingsRenderer` is a controlled component receiving `{ schema, values, onChange, onPick }`. One switch on `field.type` maps the seven validated schema types to native controls. It contains no capability ids and no persistence logic.

The App owns selected feature, loaded values, draft values, loading/saving status, and save/reset actions. It reloads values when selection changes and keeps draft changes local until Save.

## Metadata Composition

Capability Metadata remains the source for feature identity and settings:

- `id`, `name`, `description`, `category`, `icon`, `configSchema`

Interaction Help remains Command-owned. The renderer reuses the existing Command catalog already loaded for Launcher/Search/All Actions, filters real Commands by `command.capability === feature.id`, and renders each Command's existing `interactionHelp` rows under the Command name. No help is copied into Capability Metadata and no trigger labels are generated.

## State and Error Behavior

- Catalog loading: show a compact loading state.
- Empty catalog: show that no features are registered.
- Feature selected: load capability-scoped values and initialize the draft.
- Picker cancel: keep the prior draft value.
- Save success: replace the draft with the validated saved result and show status.
- Reset success: clear the selected capability draft and show status.
- Validation/IPC error: keep the draft and display the error.
- Empty schema: show “No settings required”; Save is disabled, Reset remains available only when saved values exist.
- No associated help: show “No interaction help available.”

## Accessibility and Keyboard Behavior

- Sidebar feature rows are real buttons with visible selected/focus state.
- Every generated input has a label; required fields expose `required`/`aria-required` through native semantics.
- Save and Reset are buttons with disabled busy states.
- Escape does not silently save draft edits; window close follows normal desktop-window behavior.
- Palette-level keyboard command execution/search handlers are not mounted in the Settings entry, preventing typed settings values from entering command search.
- Reduced-motion and existing color/focus tokens remain unchanged.

## Compatibility and Rollback

- Existing registry, command manifests, bindings, capabilities, adapters, and persisted config shape remain compatible.
- Existing capabilities with `configSchema: {}` appear with an empty settings state.
- Rollback removes FeatureCatalog, settings IPC/preload methods, `ConfigManager.reset`, Settings BrowserWindow lifecycle, and the settings renderer entry. Existing config files require no migration.

## Risks and Deliberate Limits

- The proposed `760x560` default and `640x480` minimum are starting sizes; main-process constants keep later visual tuning localized without exposing dimensions to the renderer.
- Feature-to-help composition assumes Commands reference their owning capability, which is already the Command Registry contract.
- There are currently no non-empty live schemas, so focused fixture tests must prove every control type while the live marker feature demonstrates the empty state.
- No generic form abstraction beyond `SettingsRenderer` is added; one implementation is enough.
