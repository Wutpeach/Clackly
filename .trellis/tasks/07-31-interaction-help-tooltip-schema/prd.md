# Interaction Help / Tooltip Schema

## Goal

Add Command-owned Interaction Help metadata so Electron command cards automatically render accurate hover/focus operation guidance without hard-coded command descriptions or Capability knowledge in the UI.

Preserve the boundary:

`User Interaction -> Command ID -> Command Registry -> Capability ID -> Capability`

## Background

- The existing Command Registry normalizes Commands to `id`, `name`, `keywords`, and `capability`; new metadata must be explicitly validated and returned.
- Interaction Binding already maps a command-card target and canonical mouse trigger to a Command ID.
- Binding trigger validation and event normalization currently live separately inside `BindingStorage` and `InteractionManager`.
- The renderer already has a bottom hover/focus hint overlay driven by Command Metadata.
- The only real Command is `timeline.addMarker`; no note/template Commands or modified-click bindings currently exist.

## Requirements

1. Extend Command Metadata with optional `interactionHelp`, normalized to an array.
2. Each help entry contains exactly:
   - `trigger`: the shared Interaction Binding trigger.
   - `label`: a non-empty user-facing operation label.
   - `description`: a non-empty user-facing explanation.
3. Use the existing canonical trigger shape:

   ```javascript
   {
     type: "mouse",
     button: "left" | "right",
     modifiers: ("CTRL" | "SHIFT" | "ALT")[]
   }
   ```

4. Extract one small shared trigger module so BindingStorage, InteractionManager, and Command Metadata validation use the same modifier ordering, button validation, and exact-match semantics.
5. Interaction Help belongs to Commands. It must not contain, look up, or infer Capability IDs.
6. Command Registry remains the owner that returns Command Metadata, including normalized `interactionHelp`, through list, search, and lookup operations.
7. Renderer reads `command.interactionHelp` and renders it. It must not contain command-specific help strings, trigger-description tables, or Capability logic.
8. Show declared help when a functional command card is hovered or focused in Launcher, Search, or All Actions.
9. Reuse the existing bottom hint/status overlay as a compact list of `label` and `description`; do not add a tooltip framework or enlarge the fixed `376x468` palette.
10. Status/error/executing messages keep priority over hover help.
11. Cards without `interactionHelp` remain usable and retain existing generic/prototype hint behavior without fabricated operation rows.
12. The live `timeline.addMarker` Command declares only the currently truthful unmodified Click help. Modified-click help is added only when corresponding Commands and bindings exist.
13. Support Click, Right Click, and exact `CTRL`, `SHIFT`, `ALT` modifier combinations.
14. Do not support Double Click in this task.
15. Do not implement automatic shortcut learning, AI-generated help, or third-party plugin documentation.

## Acceptance Criteria

- [x] Command manifests accept valid optional `interactionHelp` and return normalized defensive metadata through list, search, and lookup.
- [x] Missing `interactionHelp` normalizes to `[]` without breaking existing Commands.
- [x] Malformed help arrays, triggers, labels, descriptions, duplicate modifiers, unsupported modifiers/buttons, and duplicate normalized help triggers fail clearly during Command loading.
- [x] BindingStorage and InteractionManager consume the same shared trigger normalization/matching code used by Command Metadata validation.
- [x] Existing persisted bindings retain their current shape and behavior; no migration is needed.
- [x] Renderer help content comes only from the hovered/focused Command Metadata.
- [x] Launcher, Search, and All Actions render the same compact help rows.
- [x] Errors and execution status replace hover help until cleared.
- [x] Keyboard focus exposes the same help through the existing `aria-describedby` tooltip relationship.
- [x] `timeline.addMarker` displays `Click` and `Add marker at current frame` from its manifest.
- [x] Fixtures prove Right Click and `CTRL`, `SHIFT`, `ALT` combinations render consistently without adding nonexistent live Commands.
- [x] No Double Click handler, schema value, or help row is introduced.
- [x] No Interaction Help code resolves or stores Capability IDs, and existing command execution behavior is unchanged.
- [x] Focused registry/trigger/renderer-model tests, full `npm test`, and production build pass.

## Out of Scope

- Double Click.
- Automatic shortcut learning or Resolve shortcut inspection.
- AI-generated labels or descriptions.
- Third-party plugin documentation or documentation-site infrastructure.
- Capability-owned help metadata.
- Cross-validating persisted bindings against Command help at startup.
- A settings/help editor or general rich-tooltip component system.
- New marker note/template Commands, bindings, or Capability behavior.

## Deferred Items

- Add modified-click help entries when their target Commands and bindings are implemented.
- Add overflow/scroll behavior only if real Commands exceed the compact help list that fits the current palette.
