# Phase 5.6 Metadata Cleanup Design

## Boundary

Phase 5.6 removes duplicate presentation declarations without changing execution ownership.

```text
Feature presentation:
Capability Metadata -> Capability Registry -> FeatureCatalog -> renderer

Command presentation:
Command manifest -> Command Registry -> renderer

Interaction help:
BindingStorage + Command Registry descriptions -> renderer projection -> tooltip

Settings labels:
Config Schema -> shared Schema Utility -> FeatureCatalog / ConfigManager -> renderer

Execution (unchanged):
Command ID -> Command Registry -> Capability ID -> Capability -> Execution Adapter
```

The renderer receives plain serializable records only. It does not receive registries, storage objects, Capability implementations, adapters, or Resolve objects.

## Command Metadata Contract

The Command manifest becomes:

```json
{
  "id": "timeline.addMarker",
  "name": "Add Marker",
  "description": "Add marker at current frame",
  "category": "Timeline",
  "icon": "marker",
  "keywords": ["marker", "timeline"],
  "capability": "marker.add"
}
```

`description`, `category`, and `icon` are required non-empty strings. `interactionHelp` is removed. Command Registry validates and defensively clones the new fixed shape through list, search, and lookup.

Renderer catalog creation joins lifecycle status by `command.capability`, marks registered Commands as executable presentation entries, and otherwise preserves Command Metadata verbatim. It contains no Command-id presentation table or generic category/icon fallback.

Remove:

- `PROTOTYPE_COMMANDS`;
- `REAL_COMMAND_PRESENTATION`;
- `PREVIEW_COMMANDS`;
- hard-coded initial pinned/recent ids;
- command shortcut badges and shortcut hint text.

The browser-only fallback returns empty commands/bindings and exercises the truthful empty catalog state. Pinning and recency may remain local runtime state, both starting empty.

## Binding-Derived Interaction Help

BindingStorage remains the only trigger owner. Add one read-only projection operation to the existing interaction boundary: `InteractionManager.listBindings()`, returning normalized defensive binding records from `BindingStorage.load()`.

Both Electron hosts expose the same semantic IPC/preload method:

```javascript
listInteractionBindings() -> Promise<Array<{
  id: string,
  target: string,
  trigger: CanonicalMouseTrigger,
  action: { command: string }
}>>
```

No binding mutation IPC is added.

The shared renderer model builds help for a target Command:

1. select normalized bindings whose `target === targetCommand.id`;
2. resolve each `binding.action.command` against the loaded Command catalog;
3. format a generic trigger label from `button` and canonical modifiers;
4. use the resolved action Command's `description` as the help description;
5. preserve BindingStorage order;
6. omit bindings whose action Command has no Registry metadata.

Example projection:

```javascript
{
  label: "Click",
  description: "Add marker at current frame"
}
```

Modifier labels are deterministic, for example `Ctrl + Click`, `Shift + Right Click`, using the already normalized `CTRL`, `SHIFT`, `ALT` order. This formatting is generic and contains no Command ids.

Palette and Settings use the same projection helper. Settings continues to select target Commands with `command.capability === feature.id`; it no longer reads Command-owned `interactionHelp`.

Interaction execution remains unchanged: renderer sends native mouse facts, InteractionManager resolves the Binding, and the existing Command executor runs the action Command.

## Shared Schema Label Utility

Add one CommonJS utility beside the config owner, for example:

```javascript
resolveSchemaFieldLabel(key, field) -> string
withResolvedSchemaLabels(schema) -> cloned schema
```

Rules:

- a non-empty explicit `field.label` wins;
- otherwise split camelCase and `.`, `_`, `-` separators and capitalize the first character;
- never mutate Capability Metadata or the input Schema.

ConfigManager uses `resolveSchemaFieldLabel()` for missing-config projections. FeatureCatalog uses `withResolvedSchemaLabels()` before returning Capability Metadata to Feature UI. SettingsRenderer renders `field.label` and contains no fallback formatter.

SchemaValidator remains the sole owner of supported field types, schema structure, and value validation.

## Compatibility

- Existing `bindings.json`, `config.json`, and `feature-status.json` need no migration.
- The live Command manifest loses only duplicated `interactionHelp` and gains required presentation fields.
- Command search semantics remain id/name/keywords only unless separately requested.
- Lifecycle visibility and execution gating remain unchanged.
- FeatureCatalog remains a projection over Capability Registry, not a second metadata registry.
- Command Engine, Capability Registry execution lookup, Capability implementations, backend priority, bridge protocol, adapters, and Resolve integration are untouched.

## Error Behavior

- Missing/malformed Command description/category/icon -> Command Registry rejects the manifest at load.
- Missing binding action Command metadata -> omit that help row; execution keeps its existing unknown-Command error behavior.
- Empty bindings -> no interaction help; use Command description as the generic hint.
- Empty registered Command catalog -> render a truthful empty state, not prototype fixtures.
- Invalid Schema label input is rejected by existing schema validation; the label utility only handles validated fields.

## Risks and Deliberate Limits

- Removing prototypes reduces demo density but restores single-source architecture; they return only as registered features.
- Shortcut display is removed instead of inventing another metadata contract.
- Binding counts are small; reuse the existing linear order and do not add an index or cache.
- The bridge Command-id transport duplication remains intentionally out of scope.
- No generic metadata framework or action router is added.
