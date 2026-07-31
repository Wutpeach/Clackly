# Current Interaction Boundary

## Repository Evidence

- `command-engine/executor.js` exposes `executeCommand(commandId)`. It looks up a command manifest entry, reads that entry's `capability`, resolves the capability through the Capability Registry, validates capability configuration, and executes it.
- The only executable command currently registered is `timeline.addMarker`, whose manifest maps to capability `marker.add`.
- `marker.add.note` and `marker.add.template` do not exist as command ids or registered capabilities. Their domain behavior is not defined in the repository.
- Renderer execution currently sends only a command id through preload IPC. `App.jsx` contains repeated `onClick={() => executeCommand(command)}` handlers, but no modifier, right-click, double-click, or capability-selection branches.
- Both Electron hosts independently compose the same Command Engine contract and expose `commands:execute(commandId)`.
- Capability Metadata owns capability description and `configSchema`; Config Manager owns capability-scoped settings in `appData/Clackly/config.json`.
- `ConfigStorage` already provides small JSON-object persistence with missing-file handling and atomic replacement, but its path and errors are configuration-specific.
- `ShortcutManager` maps Resolve function names to keyboard shortcuts and intentionally does not register global shortcuts, synthesize keys without an injected executor, or alter Resolve shortcut configuration.

## Minimum Architecture Supported by Evidence

```text
renderer card
  -> normalized interaction event containing binding target + mouse trigger
  -> preload IPC
  -> host-owned InteractionManager
  -> BindingStorage lookup/match
  -> existing executeCommand(commandId)
  -> command manifest capability
  -> Capability Registry / Config Manager / capability execution
```

- Matching belongs outside UI cards and outside capabilities.
- The binding target should be a stable UI interaction target such as `marker.card`; trigger matching then selects an executable action.
- Modifier normalization should be centralized and order-independent.
- Normal absence of a binding should return an unmatched result and execute nothing.
- Binding persistence should use its own document (recommended `appData/Clackly/bindings.json`) because the stored root is interaction-target keyed rather than capability-config keyed. The storage implementation can reuse the proven ConfigStorage persistence pattern without coupling bindings to capability schemas.
- No new dependency, plugin abstraction, global hotkey work, Resolve shortcut mutation, or settings UI is needed.

## Confirmed Product Contract

- Binding actions reference Command IDs only.
- `command-engine/registry.js` remains the Command ID -> Capability ID owner.
- Interaction Binding does not inspect command manifests or reference Capability IDs.
- The current Command Registry already satisfies the requested lightweight registry requirement; no replacement is needed.

## Double-Click Scope Decision

The product will not expose double-click interactions. Interaction Binding supports left click, right click, and the requested modifier combinations only. This avoids browser click/double-click arbitration, delayed single-click execution, and duplicate command risk.
