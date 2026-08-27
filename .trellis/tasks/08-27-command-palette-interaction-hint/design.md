# Technical Design

## Summary

Replace the renderer-local Actions preview with a read-only Interaction Panel that consumes the existing Palette selection and interaction metadata. Keep the existing single-BrowserWindow shaped-region technique, but rename it to Interaction Panel ownership and narrow its contract to the new reference geometry.

No Command Engine, binding schema, Settings domain, Pin domain, or global shortcut change is required.

## Architecture Boundaries

### Authorities retained

- **Interaction definition:** normalized BindingStorage records plus registered action Commands.
- **Current Command:** `selectedCommand`, derived inside `PaletteApp` from `activeCommands[selectedIndex]`.
- **Execution:** existing direct Command execution and `InteractionManager`; the panel is read-only.
- **Native placement:** shared Electron window helper; renderer sends only semantic `anchorY` and `contentHeight`.

### Palette-local presentation state

Add only:

- `interactionPanelOpen: boolean`
- a panel DOM ref used for measurement/focus
- host-returned panel geometry used for renderer placement

Do not add a captured selected Command, selected interaction row, hover interaction row, query, acknowledgement, global store, or new domain object.

## Data Flow

```text
listCommands + listInteractionBindings
              |
              v
activeCommands[selectedIndex]  (existing Palette selection authority)
              |
              v
getInteractionHelp(selectedCommand, commands, bindings)
              |
              +--> selected Command -> show Footer Info
              |
              +--> length > 1 -> mapping rows: input label + resolved action Command name
              |
              +--> length <= 1 -> registered selected Command description
```

The shared projection retains action description data for Settings/accessibility consumers and adds the resolved action label for the compact Palette row. A missing action Command still removes that binding from the projection. Info eligibility requires only a current selected Command; the content mode is derived without copying either the Command or its interactions.

## Interaction Lifecycle

| Event | Panel closed | Panel open |
|---|---|---|
| Info click | Open for the selected Command | Close and restore Palette focus |
| `Tab` | Open if eligible; otherwise retain normal browser behavior | Close and restore Palette focus |
| `Esc` | Existing Search -> Launcher / Launcher -> hide behavior | Close only |
| Selection id changes | Remain closed | Close before rows can present a new Command |
| Query/mode changes | Remain closed | Close through selection/mode lifecycle |
| Command/interaction execution begins | Remain closed | Close before existing execution route continues |
| Palette shown/hidden | Reset closed | Host restores base shape; renderer resets closed |

Opening is explicit only. No effect keyed to hover, dwell time, search-result changes, or selection may set `interactionPanelOpen` to true.

The panel container receives programmatic focus and an accessible label when opened. Rows are static mappings, not buttons or listbox options. `Tab` from the focused panel closes it and returns focus to the existing Palette shell/search target. No second row-selection model is introduced.

## Renderer Presentation

### Footer

- Preserve Settings first and Pin second on the left.
- Continue using Lucide `Pin` as the explicit push-pin glyph.
- Place a Lucide Info control after the spacer on the right whenever a Command is selected.
- Use `aria-expanded` / `aria-pressed` semantics and normal, hover, focus-visible, and muted active styling.
- Remove all `Ctrl+K`, Actions copy, keycaps, and Actions tooltips.

### Panel

- Visually separate on the right by a `16px` transparent gap.
- `260px` fixed width, content-fit height, max `180px`, and vertically scrollable overflow.
- Exact `#151619` main-Palette background, subtle border, restrained shadow, `8px` internal radius.
- Mapping labels wrap naturally instead of ellipsizing; the normal target is complete presentation within roughly two lines.
- No triangle, search, heading, command-name repetition, footer, empty state, or interaction-row selection.
- Render exactly one content mode: mapping rows for more than one resolved interaction, otherwise the selected Command's registered description.
- Each row uses the existing keycap vocabulary on the left and the registered action Command name on the right.
- Modifier/mouse tokens are split for compact keycaps without changing the underlying canonical label.

## Native Window Contract

Adapt the existing attached-panel helper rather than creating another window or overlay abstraction:

- Rename Actions symbols and IPC channels to Interaction Panel ownership.
- Constants: main `240x320`, gap `16`, panel width `260`, content height bounded to the measured content with maximum `180`.
- Expanded envelope width: `240 + 16 + 260 = 516px`.
- Shape union contains only two rectangles: the full main rectangle and actual panel rectangle.
- Preserve work-area right-edge clamp, idempotence, `setShape` fail-closed behavior, exact base bounds restoration, and show/hide recovery.
- Renderer continues to send only bounded integer `{ anchorY, contentHeight }`; it never sends bounds, width, shape, or screen coordinates.

Both standalone Electron and Workflow Integration hosts register the renamed shared IPC helper.

## Legacy Removal

Delete, rather than retain as compatibility:

- Actions query/selection/hover/acknowledgement/captured-command state.
- `ActionRow` and developer/test Actions presentation input.
- `Ctrl+K` handlers, Footer keycaps/copy, search/empty states, triangle, and Actions-only tooltips.
- Actions IPC names, preload methods, host registration names, styles, tests, and evidence scenarios.
- README, `DESIGN.md`, and frontend quality-contract statements that forbid deriving panel rows from Interaction Help.

Preserve unrelated generic classes such as Settings `*-actions`, internal executable action Commands, normalized bindings, InteractionManager, Settings Interaction Help, and real mouse-interaction IPC.

## Compatibility and Failure Behavior

- There is no `Ctrl+K` compatibility path.
- If `setShape` is unavailable or fails, opening fails closed, restores the main rectangle, closes the Interaction Panel, returns focus, and shows concise existing event feedback.
- If selection loses eligibility while open, the panel closes; it never renders an empty state.
- Existing Search Esc, Launcher Esc, Settings, Pin, ranking, direct Enter, mouse interactions, and lifecycle gating remain unchanged.

## Testing Strategy

- Pure model tests prove resolved action labels, missing-command omission, and multi/single content-mode inputs.
- Window tests prove `516x320`, `16px` gap, `260px` width, two-rectangle shape, max height, clamp, idempotence, failure restoration, hide/show restoration, and renamed IPC boundaries.
- Headless Playwright evidence proves Info on every selected Command, mapping/description exclusivity, complete wrapped labels, scroll containment, click/Tab toggle, Tab return, Esc behavior, selection/execute close, no auto-open, no legacy text, exact shared surface, gap, and compact geometry.
- Full Node/Python regression and Vite build prove no command/settings/search regressions.

## Rollback

The change is localized to renderer presentation, its native shape helper, tests/evidence, and design contracts. Before commit, rollback is a normal patch revert of this task's diff. No data migration, persisted schema, or external compatibility state is introduced.
