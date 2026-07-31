# Interaction Help / Tooltip Schema Design

## Boundary

Interaction Help is descriptive Command Metadata. It travels with the Command catalog to the renderer but never participates in Capability lookup or execution.

```text
command manifest
  -> Command Registry validation/normalization
  -> commands:list / search / lookup
  -> renderer presentation catalog
  -> hovered/focused command card
  -> bottom interaction-help overlay
```

Execution remains unchanged:

```text
user interaction -> binding -> Command ID -> Command Registry -> Capability ID -> Capability
```

## Shared Trigger Contract

Add one pure module under `interaction/` that owns the existing canonical trigger rules:

```javascript
{
  type: "mouse",
  button: "left" | "right",
  modifiers: ("CTRL" | "SHIFT" | "ALT")[]
}
```

The module exposes the minimum reusable operations needed by current callers:

- normalize/validate a stored or metadata trigger;
- normalize a renderer mouse event into the canonical trigger;
- compare two normalized triggers exactly.

Modifier output order is always `CTRL`, `SHIFT`, `ALT`. Unknown or duplicate modifiers and unsupported buttons fail for stored/metadata triggers. Unsupported native mouse buttons normalize as unmatched, preserving current InteractionManager behavior.

BindingStorage delegates trigger validation/normalization to this module. InteractionManager delegates event normalization and exact trigger comparison to it. Existing binding JSON remains valid and unchanged.

No Double Click/click-count field is added.

## Command Metadata Contract

Command manifests may declare:

```json
{
  "id": "timeline.addMarker",
  "name": "Add Marker",
  "keywords": ["marker", "timeline"],
  "capability": "marker.add",
  "interactionHelp": [
    {
      "trigger": {
        "type": "mouse",
        "button": "left",
        "modifiers": []
      },
      "label": "Click",
      "description": "Add marker at current frame"
    }
  ]
}
```

`interactionHelp` is optional and normalizes to `[]`. Every entry must be a plain object containing only `trigger`, `label`, and `description`. Labels/descriptions must be non-empty strings. Duplicate normalized triggers within one Command are rejected because the UI could not distinguish which explanation owns the operation.

Command Registry returns fresh normalized help entries from load/list/search/lookup. It does not inspect bindings or Capability Metadata.

The live marker manifest declares only the actual unmodified left-click behavior. Right-click and modifier combinations are covered with test fixtures until real Commands and bindings exist.

## Renderer Presentation

The existing presentation catalog preserves `interactionHelp` from real Commands. Prototype fixtures may omit it.

The renderer derives one of three bottom-overlay states in priority order:

1. error/status/executing message;
2. declared Interaction Help for the hovered/focused functional Command;
3. existing generic/prototype hint fallback.

Interaction Help renders as a compact stacked list. Each row has a concise operation label and description, using the current status/meta typography and dark tooltip surface. It grows upward over the palette instead of resizing the fixed window. The list is pointer-inert, like the existing tooltip.

The existing `hintedCommand`, focus handlers, `activeHintId`, `role="tooltip"`, and `aria-describedby` relationship are retained so hover and keyboard focus expose the same content. No command-specific copy is added to JSX or CSS.

`getCommandHint()` remains the string fallback. A small renderer-model projection such as `getInteractionHelp(command)` can defensively return the metadata rows without duplicating trigger rules.

## Compatibility and Rollback

- Command execution, search matching, Capability Registry, Capability Metadata, Config Schema, Binding persistence, host IPC, and adapters do not change.
- Commands without help keep working and continue to use existing fallback hints.
- Existing binding files require no migration.
- Rollback removes the shared trigger extraction, Command metadata field, marker help declaration, and help-list rendering; no persisted data changes.

## Risks and Deferred Complexity

- Help and bindings are separately declared and can drift. Runtime cross-validation is deferred because bindings are user-persisted while Command manifests are static; add it only with a binding editor/diagnostics requirement.
- The compact overlay assumes a small operation list. Add overflow behavior only when real metadata demonstrates the need.
- Labels are explicitly authored rather than generated from triggers so product language remains controlled and localizable later.
