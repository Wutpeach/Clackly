# Current Metadata Duplication

## Confirmed Sources

- Functional Feature identity and `configSchema` originate in Capability Metadata and reach UI through Capability Registry and FeatureCatalog.
- Command execution mapping originates in command manifests and Command Registry.
- Mouse execution routing originates in BindingStorage.
- Capability configuration values originate in `appData/Clackly/config.json` through ConfigManager.

## Cleanup Evidence

- `electron/renderer/model.mjs` owns `PROTOTYPE_COMMANDS` and `REAL_COMMAND_PRESENTATION`, including a hard-coded `timeline.addMarker` icon/category/shortcut.
- `electron/renderer/App.jsx` owns `PREVIEW_COMMANDS` plus initial pinned/recent Command ids.
- `shortcut/shortcuts.json` declares `ADD_MARKER: CTRL+M` while renderer presentation shows `M`; shortcut display has no authoritative UI contract.
- `command-engine/commands/timeline.json` repeats a left-click trigger under `interactionHelp`.
- `interaction/BindingStorage.js` already owns the same target/left-click/action mapping and is the executable source.
- `config/ConfigManager.js` and `electron/renderer/model.mjs` separately implement the same Schema field-label fallback.

## Existing Boundaries to Preserve

- Renderer uses semantic preload APIs and has no Resolve/Capability execution imports.
- `command-engine/executor.js` owns Command lookup, Capability lookup, enabled/config gates, and `capability.execute()`.
- InteractionManager resolves bindings to Command ids and delegates to the existing executor.
- FeatureStatusManager and FeatureCatalog reuse Capability Registry; no second Feature registry exists.
- Standalone and Workflow Integration hosts share appData config/binding/status files while injecting different execution providers.

## Planning Conclusion

- Remove renderer-owned prototypes instead of extending Command Registry with non-executable semantics.
- Require Command presentation fields in existing Command Metadata.
- Expose normalized bindings read-only and derive help from Binding + action Command description.
- Resolve Schema labels before Feature Metadata crosses IPC so SettingsRenderer only renders labels.
- Do not touch Command Engine, Capability, Execution Adapter, bridge protocol, or Resolve integration.
