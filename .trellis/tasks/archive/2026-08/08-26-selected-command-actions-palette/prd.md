# Selected Command Actions Palette

> **2026-08-26 approved attached-panel repair (current authority).** This supersedes
> every earlier internal page-replacement, no-adjacent-panel, no-triangle, and
> fixed-240×320-only statement below. The main 240×320 Launcher/Search remains
> visible while one renderer-local, content-fit Actions panel attaches on the
> right in a `422×320` one-`BrowserWindow` envelope. The narrow Electron 36
> `setShape(Rectangle[])` union is authorized only for the main rectangle, the
> actual panel rectangle, and the smallest arrow-envelope rectangle. Host code
> owns clamped bounds, shapes, and validated semantic measurements; production
> Actions remains empty and test presentation data stays browser-process-only.

## Goal

Replace the main Palette's exposed All Actions browser with a compact `[Ctrl] [K] Actions` entry that opens one renderer-local, first-level searchable Actions panel for the currently selected Command. The `240×320` main Palette remains visible; one shared host expands only while open to the approved shaped `422×320` envelope. Validate the interaction shell without defining a final Action feature set.

## User Value

Resolve editors can keep the keyboard-first flow `Select Command → Ctrl+K → Search Action → Select` without learning nested menus or leaving the 240×320 command surface.

## Confirmed Repository Facts

- `electron/renderer/App.jsx` currently owns launcher/search/all-actions modes, command selection, hover, Pin/Recent, execution, lifecycle gating, and keyboard routing.
- `getInteractionHelp(command, commands, bindings)` remains the authority for compact hint/status presentation only. It must not become the Actions data authority.
- Because no production Action registry/schema exists, populated Actions validation may use explicitly isolated renderer-local developer/test presentation data. That data is disposable evidence scaffolding, not a product contract.
- No Action registry/schema, `actions:*` preload/IPC, or formal action persistence exists. Renderer `Ctrl+K` is currently unused; the host-wide shortcut remains Ctrl+Space.
- The current 240×320 search-led Palette and packaged-renderer Playwright evidence are the visual/behavior baseline. The main Palette still exposes All Actions and a 14px A–Z rail.
- The repository has no component-test framework. Headless Playwright against built/packaged renderer assets is the existing non-intrusive UI validation path.

## Requirements

### R1 — Scope and Boundaries

- Keep Command catalog/ranking, Pinned/Recent projection, selected Command authority, search semantics, execution, lifecycle, runtime/Resolve integration, and the `240×320` main-surface contract unchanged.
- All new Action data/state remains renderer-local; no production Action schema, persistence, Action execution IPC, or Command Engine contract is introduced. The only host addition is the approved semantic attached-panel open/close intent with bounded `anchorY` and `contentHeight` metrics.
- No submenu, nested group, second window, left-side fallback, second-level navigation, arbitrary resize protocol, or general mouse-routing scheme is implemented.
- Attached open fails closed when Electron `setShape` is unavailable or rejects: it must not expand the rectangle or leave an unshaped `422×320` hit region. The host retains exact pre-open base bounds through repeated metric updates and restores them on close/hide/show.

### R2 — Main Palette and Footer

- Remove the user-visible All Actions entry and all-actions mode/browser presentation from the Palette. Pure grouping helpers may remain internally to avoid unrelated cleanup.
- Keep Settings and Pin behavior accessible. Replace the footer's right-side affordance with separate weak `[Ctrl]` and `[K]` keycaps plus `Actions` text.
- The Actions footer control is disabled when the current renderer selection has no valid selected Command; it creates no alternate command authority.

### R3 — Actions Data Isolation

- Do not use `getInteractionHelp()` or another existing product model as the Actions data authority. Interaction Help keeps its separate hint/status responsibility.
- The production renderer may expose an empty Actions shell until a formal Action contract exists. Populated visual and interaction validation may inject clearly labelled developer/test-only presentation rows through an isolated renderer-local adapter.
- Search uses case-insensitive substring matching over temporary row labels/descriptions. The data is not persisted, exported as a domain model, shipped through preload, or sent across IPC/runtime boundaries.
- Do not add placeholder Pin/Edit Shortcut/Change Icon behavior or imply that developer/test labels are committed product features.

### R4 — Renderer State and Keyboard Contract

- Use an `actionsOpen` UI context with independent action query, selected action index, hover state, and local acknowledgement. Do not reuse Command `selectedIndex` for Action selection.
- `Ctrl+K` toggles Actions for the current selected Command. Opening focuses Action Search immediately; query changes reset Action selection to the first result.
- Arrow Up/Down moves only Action selection. Enter produces a truthful local "selected / execution not connected" acknowledgement and sends no command/interaction IPC. Escape closes Actions immediately and restores the exact prior Command mode/query/selection.
- While Actions is open, typing and navigation cannot leak into main Command search/selection. Closing or palette reveal resets only the appropriate local Actions state.

### R5 — Actions Presentation

- Actions uses the approved Palette language: search first, weak `ACTIONS` label, 30px single-line rows, transparent default, subtle pointer hover, strongest light-neutral selected row, truncated secondary description, truthful empty/no-result states, and no submenu markers.
- The visible main surface remains `240×320`; while Actions is open, its right panel is `176px` wide, content-fit (`65–304px` high), selected-row anchored and separated by a transparent `6px` gap in a `422×320` host envelope. Only the Actions list scrolls; no footer belongs in the panel.

### R6 — Hint and Footer Polish

- Remove persistent visible interaction-help/status composition. Preserve Interaction Help as off-layout accessible description text; show status/error/local acknowledgement as concise event feedback. Only normal acknowledgement auto-dismisses; errors retain existing clear/recovery semantics with a compact two-to-three-line maximum. Overflowed labels alone may show a delayed, clamped custom tooltip.
- Lower default contrast for Settings, Pin, Back, keycaps, and Actions text; hover/focus restores clear feedback without recreating a toolbar/card.

### R7 — Persistent Headless Validation

- Turn the proven temporary Playwright approach into a narrow repository developer tool used by this feature and future Palette screenshot/interaction checks.
- The tool is headless by default, reads real registered Command metadata, injects host responses only inside the browser test process, runs against built or packaged renderer assets, and produces screenshots plus structural assertions. Visible/headed execution must require an explicit opt-in.
- Do not introduce pixel-baseline CI or a general visual-regression platform in this task.

## Acceptance Criteria

- [ ] Main Palette exposes no All Actions button, mode, grouped browser, or A–Z rail.
- [ ] Footer shows weak Settings/Pin plus separate `[Ctrl] [K] Actions`; disabled behavior follows the current selected Command lifecycle.
- [ ] Ctrl+K opens and closes one first-level right-attached Actions panel scoped to the selected Command, while the original Launcher/Search and selected Command remain visibly rendered.
- [ ] Actions Search focuses immediately, filters case-insensitively, resets selection on query change, and shows truthful empty/no-result states; populated evidence uses isolated developer/test presentation data only.
- [ ] Arrow Up/Down, Enter acknowledgement, Escape return, focus-visible, and pointer hover work; Enter sends no execution/interaction IPC.
- [ ] Closing Actions preserves original Command mode, query, selected index, Pin/Recent state, and execution behavior.
- [ ] Command and Action selections have independent renderer-local authority; no Action data crosses preload/main/runtime/persistence. Renderer-to-host presentation intent is limited to validated semantic open/close metrics.
- [ ] Actions rows and long descriptions remain single-line/truncated in the content-fit right panel with no overlap or horizontal overflow; the main stays `240×320` and the attached envelope stays `422×320`.
- [ ] Interaction Help is available to assistive technology without a persistent visual bar; overflow tooltip and transient feedback are truthful, compact, and clamped.
- [ ] Main Launcher/Search/Pin/Recent/command execution/lifecycle behavior has no regression.
- [ ] Headless Playwright provides `240×320` Default/Search evidence plus `422×320` attached Actions, filtered, selected/hover, no-results, overflow-tooltip, and transient-feedback evidence.
- [ ] Focused tests, full `npm test`, build, package verification, Impeccable, boundary searches, and `git diff --check` pass.

## Out of Scope

- Final Action feature inventory, real Action execution, shortcut/icon editors, command rename/duplication, complex settings, persistence, or a production Action schema/registry.
- Nested actions, submenu positioning, a child/popup/second window, host-wide Ctrl+K, arbitrary geometry IPC, Action execution/preload/runtime contracts, or Settings redesign.
- Removing pure grouping utilities solely because the All Actions renderer is no longer exposed.
- Pixel-diff baselines, CI visual regression, or a general cross-product design-test platform.

## Open Questions

None. Real Action execution and its formal contract are explicitly deferred to a later Architecture Decision.
