# Interaction Binding System

## Goal

Add a persisted Interaction Binding layer so one UI command card can route different mouse operations to different user-executable Commands without embedding Command selection or Capability knowledge in the card.

The required execution chain is:

`Interaction -> Command ID -> Command Registry -> Capability ID -> Capability Implementation -> Execution Adapter`

## Background

- The repository already has a lightweight Command Registry in `command-engine/registry.js`.
- The current Command Engine accepts `executeCommand(commandId)`, resolves the Command through that registry, then resolves and executes its Capability.
- The current executable marker Command is `timeline.addMarker`, mapped by its manifest to Capability `marker.add`.
- Capability Metadata and capability-scoped Config Schema are already implemented.
- Renderer command cards currently invoke Command execution directly on click.
- `ShortcutManager` is a separate system for Resolve function-to-key mappings and must remain unchanged.

## Requirements

1. Add an `interaction/` module containing `InteractionManager` and `BindingStorage`.
2. Interaction Binding maps a UI interaction target plus mouse trigger to a Command ID.
3. Binding data must never contain or resolve Capability IDs.
4. Preserve these ownership boundaries:
   - Interaction Binding: user operation -> Command ID.
   - Command Registry: Command ID -> Capability ID.
   - Capability Registry: Capability ID -> Capability Implementation.
   - Capability Implementation: Execution Adapter selection.
5. Reuse the existing Command Registry and `executeCommand(commandId)` contract without changing existing Command Engine behavior.
6. Support mouse triggers for:
   - left click
   - right click
7. Support exact modifier combinations using:
   - `CTRL`
   - `SHIFT`
   - `ALT`
8. Modifier order must not affect matching. Extra modifiers must prevent a less-specific binding from matching.
9. The renderer sends only a plain user-operation event containing the interaction target, mouse button, and modifier state. It must not select a Command or inspect a Capability.
10. A command card's existing Command ID is its interaction target, allowing another configured Command ID to be selected for modified clicks without adding card-specific UI logic.
11. `InteractionManager` normalizes the event, loads bindings, performs one exact match, and delegates the matched Command ID to the injected existing Command executor.
12. An unmatched supported interaction executes nothing and returns a defined unmatched result.
13. Ambiguous duplicate bindings for the same target, button, and modifier set must be rejected instead of relying on object or file order.
14. `BindingStorage` owns binding validation and a dedicated `appData/Clackly/bindings.json` document.
15. Binding persistence may reuse the existing atomic JSON file behavior from `ConfigStorage`, but bindings must not be stored inside capability configuration sections or validated through capability Config Schema.
16. A missing bindings file is initialized with the existing left-click behavior: `timeline.addMarker` target + unmodified left click -> `timeline.addMarker` Command.
17. The architecture must allow future bindings such as unmodified click, `CTRL` click, and `CTRL+SHIFT` click to select different Command IDs, including multiple Commands that later map to the same Capability.
18. Do not implement global system shortcuts, key synthesis, Resolve shortcut discovery, or automatic Resolve shortcut changes.

## Acceptance Criteria

- [x] Binding data uses `action.command` Command IDs and contains no Capability ID field.
- [x] A fresh installation persists and loads the default `timeline.addMarker` unmodified left-click binding.
- [x] Left-click and right-click bindings can be represented, persisted, reloaded, matched, and delegated.
- [x] `CTRL`, `SHIFT`, and `ALT` work individually and in combinations; stored modifier order does not affect matching.
- [x] `CTRL+SHIFT` does not accidentally match a `CTRL`-only binding.
- [x] Duplicate normalized triggers for one interaction target are rejected clearly.
- [x] A matched interaction calls the injected executor exactly once with the configured Command ID.
- [x] An unmatched interaction calls no executor and returns `{ matched: false }` or an equivalent documented result.
- [x] Unknown configured Command IDs remain the existing Command Engine's responsibility and produce its existing unknown-command error when invoked.
- [x] Renderer command-card mouse handlers send plain interaction event data through preload IPC and contain no Command-selection table or Capability ID.
- [x] Keyboard-driven Command execution such as Enter continues to use the existing direct Command execution path.
- [x] `command-engine/registry.js` continues to map `timeline.addMarker` to `marker.add` without Interaction Binding inspecting that mapping.
- [x] Existing Command Engine, Capability Registry, Config Manager, Capability implementation, adapters, and Shortcut Manager behavior remain unchanged.
- [x] Focused InteractionManager and BindingStorage tests, the full project test command, and the production renderer build pass.

## Out of Scope

- Double-click interactions.
- Global OS shortcuts or palette hotkey changes.
- Reading, registering, synthesizing, or rewriting DaVinci Resolve keyboard shortcuts.
- Settings UI for editing bindings.
- Capability implementations for marker notes or marker templates.
- Adding speculative `timeline.addMarkerNote` or `timeline.addMarkerTemplate` Commands before their behavior is defined.
- Input devices other than the requested mouse buttons and modifiers.
- Wildcard or partial-modifier matching, binding priorities, contexts, profiles, migrations, or plugin APIs.

## Deferred Items

- Add concrete modified-click default bindings only after their target Commands exist in the Command Registry.
- Add a binding editor or schema versioning when users can edit bindings through the product.
