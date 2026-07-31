# Current Interaction Help Boundary

## Confirmed Repository Evidence

- `command-engine/registry.js` currently normalizes Commands to `{ id, name, keywords, capability }`; undeclared metadata fields are discarded before `commands:list`, search, and lookup consumers receive them.
- `command-engine/commands/timeline.json` contains only `timeline.addMarker -> marker.add` and no note/template Commands.
- Renderer presentation already consumes Command Metadata and has a bottom hover/focus hint surface driven by `hintedCommand` and `getCommandHint(command)`.
- The existing hint surface renders one string in a fixed `376x468` palette. Multi-operation help needs a compact list in the same bottom overlay rather than a new general tooltip system or a larger window.
- Interaction Binding's canonical trigger is not actually shared: modifier/button normalization is duplicated privately across `BindingStorage.js` and `InteractionManager.js`.
- The persisted binding trigger is `{ type: "mouse", button: "left" | "right", modifiers: Modifier[] }`; it cannot distinguish one click from two clicks.
- The completed third-stage PRD, design, implementation, and backend/frontend specs explicitly exclude Double Click and contain no click arbitration behavior.

## Minimum Supported Direction

- Extract one small shared interaction-trigger module and make BindingStorage, InteractionManager, and Command Metadata validation consume it.
- Keep Interaction Help nested under Command Metadata and return it unchanged/normalized through Command Registry APIs.
- Render only declared Command help; do not infer text from Capability Metadata, bindings, shortcuts, or command ids.
- Use the existing hover/focus bottom overlay with compact rows (`label` + `description`) and preserve keyboard focus/tooltip accessibility.
- Add no dependency, tooltip framework, settings surface, shortcut learning, AI generation, or documentation system.
- The live marker Command should not advertise note/template operations until corresponding Commands and bindings exist; multi-row and modifier behavior can be proven with registry/renderer fixtures.

## Confirmed Double-Click Decision

The current instruction excludes Double Click. This task preserves the third-stage Interaction Binding contract and supports Click, Right Click, and exact `CTRL`, `SHIFT`, `ALT` combinations only.
