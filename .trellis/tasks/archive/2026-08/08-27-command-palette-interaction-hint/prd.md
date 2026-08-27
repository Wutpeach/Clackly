# Command Palette Interaction Hint and Legacy Actions Removal

## Goal

Replace the legacy Actions Panel / `Ctrl+K Actions` presentation with one explicit, selection-scoped interaction-help path:

`Command selection -> Info entry -> Interaction Panel`

The panel answers either “What additional interaction methods are available?” or, when there is no additional interaction to teach, “What does this Command do?”

## Background

- The current committed product exposes a renderer-local `Ctrl+K Actions` preview with its own query, row selection, captured Command context, developer/test-only rows, and attached native-window orchestration.
- Existing Command bindings provide authoritative interaction mappings and Command Metadata provides the authoritative fallback description. Current production data includes both a multi-interaction Command and single-interaction Commands, so both content modes are testable without inventing fixtures or metadata.
- Repository research found no independent `Ctrl+K` product behavior and no architecture blocker. Shared interaction execution, internal action Commands, Settings Interaction Help, and normalized binding metadata remain required.

## Requirements

### Source of truth and visibility

- Derive interaction availability from existing command / interaction domain metadata.
- Show the Footer Info entry for every selected Command.
- Do not create UI-only interaction definitions, duplicate selected-command state, or a new Interaction Hint domain.
- A Command with more than one valid interaction shows only interaction-to-action mappings.
- A Command with only its default interaction, or no resolved interaction, shows only its registered Command description.

### Open and close lifecycle

- Open or close the Interaction Panel by clicking the Footer Info entry.
- `Tab` opens the panel while command selection has focus; when the panel is open, `Tab` returns to the Command Palette.
- Selection, hover, timers, pointer dwell, and search-result changes must not auto-open the panel.
- `Esc` closes an open panel; when it is already closed, preserve the Palette's existing Esc behavior.
- Changing the selected command, executing a command, or closing the Palette closes the panel.
- The Palette remains the sole selected-command authority; the panel consumes the current selection and its derived interactions.

### Footer

- Footer left: existing Settings function and existing Pin function.
- Pin uses an unambiguous push-pin icon without changing Pin domain behavior.
- Footer right: Info entry with normal, hover, and subdued active states.
- Remove every user-visible `[Ctrl][K]`, `Actions`, `[Ctrl][K] Actions`, Actions trigger, and Actions-specific tooltip / hint.

### Interaction Panel presentation

- Render as an independent right-side floating surface with about 16 px visual gap from the Command Palette.
- No connector triangle, title, command name, category / metadata, explanatory copy, or footer.
- Content is either compact `interaction input -> action label` rows or the registered Command description fallback, never both.
- Use the existing keycap / mouse-input vocabulary and avoid a second row-selection model.
- Match the main Palette surface exactly at `#151619`; use border and shadow, not a different hue, to separate the panel.
- Use a `260px` panel. Action labels wrap naturally instead of ellipsizing, with normal content fitting in roughly two lines.
- Height fits content up to `180px`; overflow scrolls vertically inside the panel without introducing row selection.

### Legacy removal

- Remove UI, local state, keyboard handling, lifecycle, event / IPC wiring, styles, and tests that exist only for the legacy Actions Panel.
- Preserve shared command / interaction metadata and any independently valid `Ctrl+K` behavior.
- `Ctrl+K` must not remain as a hidden compatibility entry to another Actions UI.
- Do not expand into an unrelated Command system refactor or a generic overlay framework.

## Out of Scope

- Command Palette visual redesign beyond the Footer and Interaction Panel.
- Search / ranking or command execution semantic changes.
- Command metadata system refactoring.
- Settings or Pin domain redesign.
- Shortcut customization or a general overlay / panel abstraction.
- Unrelated cleanup.

## Acceptance Criteria

- [ ] Footer left contains Settings and the correct push-pin icon; Footer right contains Info for every selected Command.
- [ ] No user-visible `[Ctrl][K]`, Actions label, Actions trigger, or Actions-specific hint remains.
- [ ] A selected Command with multiple valid interactions shows only mappings; a Command with only default Click or no resolved interaction shows only its description.
- [ ] Clicking Info toggles the Interaction Panel and exposes a clear subdued active state.
- [ ] `Tab` opens the panel and, when open, returns to the Command Palette according to the established focus model.
- [ ] Hover, pointer dwell, selection, and search changes never auto-open the panel.
- [ ] The panel has no connector triangle and never combines mapping rows with the description fallback.
- [ ] The panel matches the main `#151619` surface, uses a `260px` width, approximately 16 px gap, readable wrapped labels, content-fit height, and vertical overflow containment.
- [ ] Selection changes cannot leave content from the previously selected command.
- [ ] Execute, Esc, and Palette close terminate the panel lifecycle without stale state.
- [ ] The implementation does not duplicate selected-command authority or interaction definitions.
- [ ] Existing command execution, Settings, Pin, search, keyboard navigation, and Palette close behavior have no regression.
- [ ] Actions-only presentation / orchestration code and tests are removed; shared domain capability is preserved.
- [ ] Targeted lifecycle / visibility tests, relevant regression tests, the configured build, package verification, and Workflow installation validation pass; the repository currently has no lint or typecheck script.

## Stop Conditions

Implementation must stop before product-code changes if subsequent evidence contradicts the completed research and shows that:

- `Ctrl+K` owns another important product function that conflicts with removal.
- Existing metadata cannot reliably identify commands with multiple interactions.
- The panel cannot consume current selection without copying command state.
- Removing Actions requires a Command Engine architecture change outside this task.
- The requested design conflicts structurally with current keyboard accessibility / focus architecture.
