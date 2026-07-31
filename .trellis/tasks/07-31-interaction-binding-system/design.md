# Interaction Binding System Design

## Boundary

Interaction Binding is an input-routing service between renderer mouse events and the existing Command Engine. It does not inspect command manifests, resolve Capability IDs, execute capabilities directly, or own shortcut behavior.

```text
generic command card
  -> plain mouse interaction event
  -> preload IPC
  -> InteractionManager
  -> BindingStorage
  -> executeCommand(commandId)
  -> existing Command Registry
  -> existing Capability Registry / Config Manager
  -> Capability Implementation
  -> Execution Adapter
```

The existing `command-engine/registry.js` is already the requested lightweight Command Registry and remains unchanged.

## Contracts

### Renderer Event

The renderer sends structured-clone-safe native interaction facts only:

```javascript
{
  target: "timeline.addMarker",
  type: "mouse",
  button: 0,
  ctrlKey: false,
  shiftKey: false,
  altKey: false
}
```

`target` identifies the generic command card being operated. Using the card's current Command ID avoids new UI metadata and does not choose the executed Command: BindingStorage may map that target to any registered Command ID.

The renderer uses click for button `0` and context-menu for button `2`. It suppresses the browser context menu on command cards and sends the right-click event through the same API. Keyboard Enter keeps the current direct `executeCommand(command.id)` path because keyboard interaction binding is outside this task.

### Stored Binding

Bindings use a plain object keyed by stable human-readable binding ids:

```json
{
  "timeline.addMarker.left-click": {
    "target": "timeline.addMarker",
    "trigger": {
      "type": "mouse",
      "button": "left",
      "modifiers": []
    },
    "action": {
      "command": "timeline.addMarker"
    }
  }
}
```

Only `left` and `right` buttons and `CTRL`, `SHIFT`, `ALT` modifiers are valid. BindingStorage normalizes modifiers to the fixed order `CTRL`, `SHIFT`, `ALT` and rejects duplicates, unknown fields required by the contract, blank ids/targets/commands, malformed roots, and multiple bindings with the same normalized target/trigger signature.

BindingStorage validates only that `action.command` is a non-empty string. It does not query Command Registry; unknown Command behavior stays centralized in the existing executor.

## BindingStorage

`BindingStorage` exposes the minimum persistence contract:

- `BindingStorage.fromAppData(appDataPath, options?)`
- `load()` -> validated defensive copy of the binding object
- `save(bindings)` -> validate, normalize, atomically persist, and return a defensive copy

It stores `appData/Clackly/bindings.json`. It composes the existing `ConfigStorage` JSON writer to reuse directory creation, missing-file handling, atomic temporary-file replacement, and invalid-root errors without putting bindings in `config.json`.

On first load when `bindings.json` is absent, it persists one built-in compatibility binding for unmodified left click on `timeline.addMarker`. After creation, an explicitly saved empty object remains empty; defaults are not silently re-added.

No cache is needed. The binding set is small, and loading on dispatch keeps sequential changes visible without an invalidation system.

## InteractionManager

`new InteractionManager({ bindingStorage, executeCommand })` validates its two dependencies and exposes one async operation such as `handle(event)`.

`handle(event)`:

1. validates and normalizes the plain event;
2. converts button `0`/`2` to `left`/`right`;
3. creates the canonical modifier array in `CTRL`, `SHIFT`, `ALT` order;
4. loads normalized bindings;
5. finds one exact target/type/button/modifier match;
6. returns `{ matched: false }` when none exists;
7. otherwise calls `executeCommand(binding.action.command)` once and returns a matched result containing the Command ID and executor result.

Unsupported mouse buttons are unmatched. Malformed internal IPC payloads fail clearly. Executor errors, including unknown Command IDs and Capability/configuration failures, propagate unchanged.

The manager does a linear scan. Binding counts are expected to remain tiny; an index is deferred until measured scale requires one.

## Host and IPC Composition

Both `electron/main/main.js` and `workflow-plugin/main.js`:

1. keep their existing Command executor construction;
2. create BindingStorage from the common Electron appData root;
3. create InteractionManager with the existing executor;
4. register the same semantic IPC handler, for example `interactions:execute`;
5. hide the palette only after a matched interaction executes successfully.

`electron/main/preload.js` exposes one narrow method such as `executeInteraction(event)`. It exposes no storage, binding mutation, command lookup, or Capability API.

## Compatibility and Rollback

- Command manifests, Command Registry lookup/search, Command Engine execution, Capability Registry, Config Manager, marker Capability, adapters, and ShortcutManager do not change.
- Existing unmodified marker-card clicks keep working through the persisted default binding.
- Keyboard Enter keeps the current direct Command route.
- Browser preview may keep a minimal local fallback that reports execution unavailable; it does not need persistent bindings.
- Rollback removes the interaction modules and IPC/card routing, then restores mouse click to direct Command execution. `bindings.json` is isolated and can remain harmlessly on disk.

## Risks and Deferred Complexity

- A configured unknown Command fails at execution time by design; eager registry validation would couple BindingStorage to command discovery.
- Two live hosts writing simultaneously remain last-writer-wins, matching current config storage behavior. Add locking only if a binding editor creates concurrent writers.
- Linear matching is deliberate; add a normalized signature index only if binding volume becomes measurable.
- No double-click support means no click-delay or click-arbitration state is introduced.
