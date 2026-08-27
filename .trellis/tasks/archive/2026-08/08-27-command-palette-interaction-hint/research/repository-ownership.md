# Repository Ownership Research

Date: 2026-08-27

## Result

No planning blocker is present. The requested Interaction Panel can be implemented as Palette-local presentation derived from the existing selected Command and normalized interaction bindings. The legacy Actions shell does not own an independent product function that must survive.

Research was performed against the current `main` worktree, not by continuing either archived 2026-08-26 task. An Orca `research` Worker independently reached the same blocker assessment and scope conclusion. The working tree was clean before this task; only the new task directory is currently untracked.

## Ownership and Data Flow

### Command and interaction authority

- `resolve-command-center/electron/renderer/App.jsx:329-343` derives `activeCommands` and `selectedCommand` from the existing Palette mode, ranked results, and `selectedIndex`. The legacy `actionsContextCommand` at `App.jsx:302-303,331` is a duplicated captured selection used only by Actions and must be removed.
- `resolve-command-center/electron/renderer/model.mjs:68-87` already joins the selected Command id to normalized bindings and resolves each binding's action Command. Missing action Commands are omitted, so the result is a reliable presentation projection rather than new UI metadata.
- `resolve-command-center/interaction/BindingStorage.js:113-145` validates binding shape, normalizes triggers, and rejects duplicate target/trigger signatures. Default bindings at `BindingStorage.js:14-87` currently yield four interactions for the visible After Effects export Command, one for Add Marker, and one for Paste Clipboard Image.
- `resolve-command-center/interaction/trigger.js:32-49` currently supports mouse triggers with canonical Ctrl/Shift/Alt modifier ordering. The reference design's keyboard-key example is visual direction, not a reason to add unsupported metadata.
- `resolve-command-center/interaction/InteractionManager.js:39-56` remains the execution authority. The panel is read-only and does not need new execution IPC.
- `resolve-command-center/electron/renderer/SettingsApp.jsx:56-70,336-349` also consumes the shared interaction-help projection. Settings retains its wider descriptive help; the Palette panel should consume action labels without removing Settings descriptions.

### Palette state and lifecycle

- `resolve-command-center/electron/renderer/App.jsx:285-330` owns Palette mode, catalog, query, `selectedIndex`, and the derived selected Command.
- `App.jsx:350-409` resets Palette state on show, mode change, and query change. These existing transitions provide the close points for a Palette-local `interactionPanelOpen` boolean.
- `App.jsx:521-559` owns mouse-interaction execution and direct Command execution; both paths can close the panel before or as execution begins without changing execution semantics.
- `App.jsx:615-679` owns the shell keyboard model. `Ctrl+K` is handled only here for Actions. `Esc`, arrow selection, Enter, and type-to-search are already centralized, so `Tab`/`Esc` panel behavior fits without a second focus architecture.
- `resolve-command-center/electron/main/window.js:313-340` closes the attached native shape during Palette show/hide. The same restoration points can be retained under Interaction Panel names.

### Legacy Actions ownership

- Renderer-only Actions state and presentation: `resolve-command-center/electron/renderer/App.jsx:231-281,289-308,331-348,411-470,567-649,703-707,812-880`.
- Actions-only CSS: `resolve-command-center/electron/renderer/styles.css:326-443` (Footer keycaps, search, panel, arrow, and action rows). Generic Settings classes containing the word `actions` at later lines are unrelated and must remain.
- Actions-specific host bridge: `resolve-command-center/electron/main/preload.js:22-23`; `resolve-command-center/electron/main/main.js:6,111`; `resolve-command-center/workflow-plugin/main.js:6,195`; and `resolve-command-center/electron/main/window.js:121-166`.
- Actions-specific host tests and source assertions: `resolve-command-center/electron/main/window.test.js:85-223,590-638`.
- Actions-only developer/test presentation data and Playwright scenarios: `resolve-command-center/scripts/palette-evidence.mjs:39-45,192-270,297-367,420-426,443-606,689-703`.
- Stale documentation/spec authority: `resolve-command-center/README.md:93-97,186`, `DESIGN.md` Palette Composition / Footer / Selected Command Actions sections, and `.trellis/spec/frontend/quality-guidelines.md` Command Palette and Selected Command Actions contracts.

The developer/test Actions data is explicitly isolated from interaction metadata and has no production authority. It should be deleted, while the real binding/Command metadata and Settings interaction help remain.

### Ctrl+K ownership

- Repository-wide source search excluding generated/package directories finds the `Ctrl+K` UI and key handling only in legacy Actions renderer code, its evidence script, README, design authority, and tests.
- The actual Palette global hotkey is independent (`Ctrl+Space`) and is owned by the Electron/Workflow host hotkey path, not by Actions.
- Therefore `Ctrl+K` can be removed completely from Palette behavior; no hidden compatibility entry is required.

### Footer and icons

- `resolve-command-center/electron/renderer/App.jsx:78-101` maps interface icons to Lucide and currently maps `pin` to Lucide `Pin`, an explicit push-pin glyph.
- `App.jsx:795-825` renders Settings, Pin, spacer, then the legacy Actions control. Settings and Pin behavior can remain unchanged while the right slot becomes universal selected-Command Info.

### Native placement and shape

- `resolve-command-center/electron/main/window.js:5-21,46-87` owns the fixed `240x320` main rectangle and the current attached-panel semantic metrics / geometry.
- `window.js:95-107,121-156` owns work-area clamping, temporary BrowserWindow expansion, fail-closed `setShape`, idempotence, and exact base-bound restoration.
- Reuse this narrow Palette helper by renaming it to Interaction Panel ownership and changing its fixed presentation constants: `260px` panel width, `16px` transparent gap, `180px` maximum content height, no arrow rectangle. This is a task-specific helper, not a new overlay framework.
- The resulting native shape is exactly the union of the `240x320` main rectangle and the actual Interaction Panel rectangle; the gap and unused right-column pixels remain click-through.

## Blocker Evaluation

| Candidate blocker | Finding |
|---|---|
| Ctrl+K has another important function | No. Current ownership is legacy Actions-only. |
| Metadata cannot identify multiple interactions | No. `getInteractionHelp()` resolves valid target bindings; current production data provides both multi- and single-interaction examples. |
| Panel requires copied selected Command state | No. It can derive rows directly from `selectedCommand`, `commands`, and `bindings`; only open/closed is local state. |
| Removing Actions requires Command Engine refactor | No. Actions is presentation/orchestration; shared registry, bindings, and InteractionManager remain intact. |
| Design conflicts with focus/accessibility architecture | No. The shell owns one keyboard handler and can focus a non-interactive panel container on open, then restore the existing shell/search focus on close. |

## Smallest Implementation Scope

1. Extend the existing interaction-help projection with the resolved action Command label while preserving description consumers.
2. Replace Actions state/rendering with one derived `interactionRows` list and one local `interactionPanelOpen` state; add universal selected-Command Info, mapping-or-description panel content, and the explicit Tab/click/Esc/selection/execute/Palette-close lifecycle.
3. Replace Actions CSS with compact read-only interaction rows and the supplied neutral panel tokens.
4. Rename/adapt the existing attached native helper and IPC to Interaction Panel ownership, remove the arrow, and adopt the reference geometry.
5. Replace Actions evidence scenarios with Interaction Panel visibility/lifecycle/visual scenarios; update focused model/window tests.
6. Remove Actions-only documentation/test data and update README, `DESIGN.md`, and the executable frontend quality contract.

Do not modify Command search/ranking, Command Engine execution, BindingStorage/InteractionManager behavior, Settings/Pin domain behavior, or introduce a generic overlay system.

## Validation Targets

- Focused Node tests: `node --test electron/renderer/model.test.mjs electron/main/window.test.js`
- Headless renderer evidence: new Interaction Panel scenarios through `npm run palette:evidence` / targeted `--scenario` runs.
- Package build: `npm run build`
- Full regression: `npm test`
- Boundary searches for `Ctrl+K`, Actions-only names, old IPC channels, developer/test Actions data, duplicated selected-Command state, and arrow styles.
- Because native `setShape` is involved, automated tests prove geometry/contracts but not Resolve-host DWM/hit testing. Packaged Workflow installation and a user-run Resolve check remain the final native acceptance step if this session reaches implementation.
