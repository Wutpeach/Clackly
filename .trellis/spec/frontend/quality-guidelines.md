# Quality Guidelines

> Code quality standards for frontend development.

---

## Overview

Frontend code includes Electron main-process code, Workflow Integration Plugin main-process code, preload APIs, and renderer UI. The frontend layer owns desktop behavior and user interaction only; integration actions must cross a narrow IPC/API boundary instead of importing backend or Resolve-specific APIs into renderer code.

## Scenario: Electron Command Palette Boundary

### 1. Scope / Trigger

- Trigger: A command palette action crosses renderer UI, Electron main process, command registry, and a backend bridge.
- Applies when adding Electron windows, preload APIs, command UI, command search, or command execution wiring.

### 2. Signatures

- Renderer API exposed by preload:
  - `window.resolveCommandCenter.listCommands() -> Promise<Command[]>`
  - `window.resolveCommandCenter.searchCommands(query: string) -> Promise<Command[]>`
  - `window.resolveCommandCenter.executeCommand(commandId: string) -> Promise<object>`
  - `window.resolveCommandCenter.listInteractionBindings() -> Promise<BindingRecord[]>`
  - `window.resolveCommandCenter.hidePalette() -> void`
  - `window.resolveCommandCenter.onPaletteShown(callback: () -> void) -> () -> void`
- Command shape:
  - `{ id: string, name: string, description: string, category: string, icon: string, keywords: string[], capability: string, presentation?: "visible" | "internal" }`

### 3. Contracts

- Renderer search uses command metadata only: `id`, `name`, and `keywords`.
- `presentation` defaults to `visible`; internal Commands stay executable and resolvable for interaction descriptions but never appear in Launcher, Search, or Settings help targets. One shared `isCommandPresentable()` predicate owns that filter in both the command registry and the renderer presentation model; no renderer branch names a Command id or capability.
- Renderer presentation contains registered Commands only. Browser preview returns an empty catalog, and pinned/recent state starts empty.
- Launcher, Search, ranking, icons, accessibility names, and generic hints preserve registered Command Metadata; renderer code contains no Command-id presentation override.
- Renderer execution sends only the selected `commandId`.
- Per-command shortcut badges are absent until an authoritative presentation contract exists. The approved renderer-local `Ctrl`/`K` Actions toggle is a separate first-level shell, not command shortcut metadata or a host-wide hotkey.
- Launcher and Search always occupy the fixed `240x320` Palette main rectangle. Selected Command Actions is renderer-local state, but its approved right-attached presentation may request only semantic open/close plus bounded integer `{ anchorY, contentHeight }` metrics through the shared host helper. The renderer never supplies screen coordinates, bounds, width, height, shapes, or resize policy.
- Palette composition is search-led, not brand-led: Launcher and Search begin with the compact search surface; the Palette itself has no wordmark, orange identity rule, or primary header toolbar. Search is a separate DOM/content mode containing only `RESULTS`, while Launcher projects only nonempty `PINNED`, `RECENT`, and fallback `COMMANDS` sections from its existing ranked source.
- Palette rows are compact list primitives: transparent at rest, soft neutral on pointer hover, and light neutral with dark foreground for keyboard selection. Main list, Footer, and Attached Actions share the exact `#151619` Palette neutral surface; Search is the slightly inset control and the Footer may use only a faint hairline, never a separately dominant black toolbar. Command name and the `14–16px` monochrome Lucide icon take priority; category/status, true Launcher numeric keycaps, and the `27px` footer are progressively weaker but remain readable. Pin, Settings, and the separate `Ctrl`/`K` Actions toggle belong in the quiet Launcher footer; Search retains only its in-field `ESC` hint and uses it to return to Launcher, without a duplicate footer Back control. Do not synthesize per-command shortcuts or submenu behavior.
- Selected Command Actions has no production Action authority until a formal contract is approved. It may use an explicitly named browser-process developer/test presentation source only for renderer evidence; it must not derive rows from `getInteractionHelp()`, bindings, Command metadata, or another product model. Its query/selection/hover/acknowledgement remain renderer-local, Enter only acknowledges locally, and it sends zero command or interaction IPC.
- While Actions is open, one existing BrowserWindow may temporarily use the approved `422x320` envelope: `240px` main-left, transparent `6px` gap, and a `176px` right panel whose content height is clamped to `65–304px` and vertically anchored to the selected Command row. The host owns final work-area clamp, shape and reset behavior; it never flips the panel to the left.
- Palette construction owns the fixed footprint, initial centering, taskbar skipping, and the stable always-on-top policy. On reveal, its top-left starts at the cursor coordinates; only work-area overflow uses the existing narrow flip/clamp path. Attached Actions continues to clamp the complete `422x320` envelope while keeping the main left and panel right. Showing performs one visibility/focus transition plus a `palette:shown` notification, and hiding conceals the transparent window in place without destroying its native surface.
- The programmatically focused non-interactive `.palette-shell` suppresses only its own default focus outline; interactive controls keep their `:focus-visible` indicators.
- Electron hosts delegate command execution to the command engine, which resolves intent through an injected capability registry. External Electron registers a bridge-backed capability; Workflow Plugin registers a Resolve-backed capability. Renderer code still sends only command ids through preload IPC.
- Functional UI icons use `lucide-react` with the shared optical size/stroke convention. Clackly logo and mark remain project-owned SVG assets rather than Lucide substitutions.
- Clackly wordmark assets are deterministic vector geometry: use SVG paths/shapes only, never `<text>`, font-family declarations, or external font/image dependencies.
- The outer window silhouette is rectangular: the shared `.palette-shell`/`.settings-shell` uses `border-radius: 0`, so all rounding lives inside content surfaces. The `240x320` Palette main uses compact list rows rather than launcher tiles: rows are transparent at rest, softly neutral on hover, and light neutral with dark foreground when selected. The Actions panel uses the same row hierarchy. Interaction Help remains off-layout accessible description text; status/error/local acknowledgement appears only as compact absolute feedback. Only normal acknowledgement auto-dismisses; error/status follows existing clear/recovery semantics and is visually clamped to two or three readable lines while full aria-live text remains available.
- Both Palette and Settings BrowserWindows set `roundedCorners: false` beside the transparent compositor contract (`frame: false`, `transparent: true`, `thickFrame: false`, `backgroundColor: "#00000000"`). The qualified Windows 11 build 26200 rule remains rectangular by default. The sole approved Electron 36 `setShape(Rectangle[])` exception is open Attached Actions: union only the `240x320` main rectangle, actual content-fit right panel, and smallest `7x14px` arrow envelope. Transparent gap and unused right-column pixels must stay outside the native region. If `setShape` is unavailable or the union fails, attached open fails closed before/after restoring exact pre-open `240x320` bounds; it never leaves a 422px rectangular hit region. Close, hide, and show recovery restore that exact base bounds/shape even after a right-edge clamp translation. Any broader/rounded/decorative shape still requires a separate ADR and a permissioned native A/B.
- Development renderer loading must be explicit, for example `--dev-renderer` or `RESOLVE_COMMAND_CENTER_RENDERER_URL`.
- Default non-packaged startup should load built renderer files so Resolve-launched Electron does not depend on a Vite dev server.

### 4. Validation & Error Matrix

- Unknown command id -> command engine rejects with a user-facing error.
- Missing capability handler -> command engine rejects with a user-facing error.
- Unknown palette mode -> renderer state only; the shared window footprint never changes because modes are content-only.
- Empty registered catalog -> Launcher and Search render truthful empty states; browser preview does not inject fixtures. Selected Command Actions is truthfully empty in production until a formal Action contract exists.
- Bridge failure -> renderer keeps the palette open, shows the error, and refocuses search.
- Successful command -> Electron hides the palette.
- Global shortcut registration failure -> main process logs a warning.
- Workflow Plugin global shortcut registration failure -> plugin shows its own palette and warns that another process owns the shortcut, because otherwise an old Utility/dev Electron process can keep routing commands to the Python bridge.

### 5. Good/Base/Bad Cases

- Good: Adding command intent metadata and registering its capability in each supported host.
- Base: `marker` query matches `timeline.addMarker` via registry search.
- Good: Opening Selected Command Actions retains the visible `240x320` main surface and asks the shared host only for bounded anchor/content metrics; the host validates, clamps, temporarily opens the `422x320` envelope and applies the three-rectangle union, then restores the main shape/bounds on close/hide/show.
- Good: registering a Command with declared description/category/icon makes it appear correctly without renderer edits.
- Bad: UI code checks `if (query === "marker")` or invokes Resolve APIs directly.
- Bad: searching category labels, adding production prototype fixtures, sending renderer-provided bounds/shape/position, using a general resize protocol, or dynamically routing whole-window mouse events.

### 6. Tests Required

- Assert query matching returns expected command ids for names and keywords.
- Assert presentation category text alone does not match a command.
- Assert registered Command presentation is preserved, the empty catalog stays empty, and no shortcut/prototype entries are synthesized.
- Assert Launcher and Search exclude `presentation: "internal"` Commands while `listCommands()`/`getCommandById()` still return them, and that the shared presentability predicate has no Command-id branches.
- Assert the palette owns the `240x320` main footprint, first show uses native `show`, repeat show reveals a concealed window without native `show`, hide conceals in place, and both hosts toggle on the logical shown predicate. Assert attached-open metric validation, rectangle union, edge clamp, idempotence, and close/hide/show restoration through the shared host helper.
- Assert the `.palette-shell` suppresses only its own focus outline while control `:focus-visible` rules remain.
- Assert renderer uses preload APIs instead of direct Node or Resolve imports.
- Assert `npm run build` succeeds and file-backed Electron startup has a built renderer target.
- Assert `clackly-logo.svg` parses as XML and contains no `<text>`, font reference, or external image.
- Visually verify Launcher/Search at `240x320` and Attached Actions at `422x320`, including compact rows, hover versus selection, overflow-only tooltip, transient feedback, and footer geometry. Use the repository `palette:evidence` developer tool headlessly by default; its browser-only evidence does not prove Electron `setShape`, native hit-testing, DWM composition, or Resolve validation.

### 7. Wrong vs Correct

#### Wrong

```javascript
if (query === "marker") {
  resolve.GetProjectManager().GetCurrentProject();
}
```

#### Correct

```javascript
await window.resolveCommandCenter.executeCommand(command.id);
```

---

## Scenario: Selected Command Actions Preview

### 1. Scope / Trigger

- Trigger: extending the Palette with a first-level context shell for the currently selected Command while no formal Action domain contract exists.
- Applies to the renderer surface, Palette-scoped CSS, developer-only Playwright utility, and the minimum shared preload/host path for attached-panel semantic intent. It does not authorize an Action registry, persistence, Actions execution IPC, runtime/Resolve, global-hotkey changes, a second window, or arbitrary resize controls.

### 2. Signatures

- Renderer-local state: `actionsOpen`, `actionQuery`, `selectedActionIndex`, `hoveredActionIndex`, `actionAcknowledgement`, and a captured selected Command context.
- Optional browser-process test input only: `window.__CLACKLY_DEVELOPER_TEST_ACTIONS_PRESENTATION__ = { commandId, rows: [{ label, description? }] }`. This is a disposable renderer evidence shape, not a production Action schema or a host API.
- Developer command: `npm run palette:evidence`; it is headless by default. `node scripts/palette-evidence.mjs --renderer <built|packaged> --scenario <name[,name]> --output <directory>` selects evidence inputs; `--headed` is explicit opt-in.

### 3. Contracts

- Production Actions presentation is empty until an approved Action contract exists. Never derive its rows from `getInteractionHelp()`, bindings, Command metadata, or another product model.
- `Ctrl+K` toggles only while the Palette is focused and a Command is selected. It captures that Command context, focuses Actions Search, and does not mutate the underlying Command mode, query, selection, pin/recent state, or lifecycle state.
- Actions query/Arrow selection/pointer hover are independent renderer-local state. Enter renders only a local acknowledgement and sends zero `executeCommand` / `executeInteraction` calls. Escape and Ctrl+K return to the exact underlying Command context.
- Actions rows are one first-level attached listbox; no nested menu or A–Z browser is permitted. The main Palette remains visible at left, while the `176px` panel stays content-fit at right with only its list scrollable. Interaction Help keeps its semantic data flow off-layout; visible status/acknowledgement is transient event feedback. Overflowed labels alone may show a clamped custom tooltip after a real-overflow check.

### 4. Validation & Error Matrix

- No selected Command -> Actions footer control is disabled.
- No test input / production -> show truthful “No contextual actions”.
- Test rows present but query has no match -> show truthful “No matching actions”.
- Enter on an Action -> acknowledgement only; command and interaction IPC spies remain empty.
- Escape while Actions is open -> close Actions only; main Palette does not hide.
- Escape in Search -> return to Launcher; Escape in Launcher -> existing `hidePalette()` behavior remains unchanged.

### 5. Good/Base/Bad Cases

- Good: a Playwright `addInitScript` injects clearly labelled developer/test rows before the renderer loads and the Actions view filters those rows locally.
- Base: pressing Ctrl+K on `timeline.addMarker` opens the first-level Actions shell, Arrow Down moves only `selectedActionIndex`, and Enter acknowledges locally.
- Bad: using `getInteractionHelp(selectedCommand, commands, bindings)` as Actions rows, calling `executeInteraction` from an Action row, or writing Action data through preload.

### 6. Tests Required

- Run `npm run palette:evidence` against built or packaged renderer assets; assert exact `240x320` main geometry and `422x320` Attached Actions envelope, visible/frozen main state, content-fit right panel, no All Actions/A–Z DOM, single-line Action rows, focus, filtering, independent hover/selection, zero execution/interaction IPC on Enter, Escape preservation, overflow-only tooltip, transient feedback, and console/page-error capture.
- Run focused renderer/window tests, `npm run build`, and `npm test`. Package and verify before a packaged renderer evidence pass.

### 7. Wrong vs Correct

#### Wrong

```javascript
const actions = getInteractionHelp(selectedCommand, commands, bindings);
await api.executeInteraction(actions[selectedActionIndex]);
```

#### Correct

```javascript
const previewRows = getDeveloperTestActionPresentation(selectedCommand.id); // empty outside test injection
setActionAcknowledgement(`Selected ${previewRows[selectedActionIndex].label} — execution is not connected in this preview.`);
```

---

## Scenario: Metadata-Driven Feature Settings

### 1. Scope / Trigger

- Trigger: exposing Capability Metadata or configuration in Electron UI.
- Applies to FeatureCatalog, Settings BrowserWindow lifecycle, preload/IPC, SettingsRenderer, and the unified feature detail panel.

### 2. Signatures

- `new FeatureCatalog({ capabilityRegistry }).getAllFeatures() -> CapabilityMetadata[]`.
- Preload APIs: `listFeatures()`, `listInteractionBindings()`, `getConfig(capabilityId)`, `saveConfig(capabilityId, values)`, `resetConfig(capabilityId)`, `pickPath("path" | "folder")`, `openSettings()`, and `closeSettings()`.
- `SettingsRenderer({ schema, values, onChange, onPick, disabled })`.

### 3. Contracts

- One registered Capability is one feature; there is no second feature manifest, registry, feature-id branch, or feature-specific page.
- Feature identity and schema come from Capability Metadata. Help targets Commands through `command.capability === feature.id` and derives rows from normalized bindings plus action Command descriptions.
- Standalone Electron and Workflow Integration register the same feature/config/picker channels through the shared IPC helper.
- Resolve 20.3.2.9 with bundled Electron 36.3.2 is the qualified desktop host; local Electron must remain exactly pinned to that API baseline.
- Settings is one fixed frameless `760x560` window with the exact Electron 36 BrowserWindow options `show: false`, `frame: false`, `roundedCorners: false`, `transparent: true`, `thickFrame: false`, `resizable: false`, `maximizable: false`, `minimizable: false`, `fullscreenable: false`, `alwaysOnTop: false`, `autoHideMenuBar: true`, `backgroundColor: "#00000000"`, and `title: "Clackly Settings"`. Its renderer `.settings-shell` must paint the opaque `--color-window` background across the full `100vw x 100vh` viewport so the transparent compositor surface never shows through. Do not use the Electron 37+ `accentColor` API, and do not add DWM/Python/timer/native-hook workarounds for the Resolve-host opaque frameless edge — the verified fix is the transparent surface plus the opaque renderer shell (live-validated 2026-08-06).
- The `240x320` palette keeps its own separate surface contract — `transparent: true`, `backgroundColor: "#00000000"`, `roundedCorners: false`, `skipTaskbar: true`, `alwaysOnTop: true`, and the completed conceal/reveal lifecycle. Settings must not adopt palette product behavior: it stays `alwaysOnTop: false` with normal taskbar behavior.
- Repeated Settings opens reuse and focus the singleton; it does not hide on blur or become always-on-top. Its custom drag region and accessible close button replace native title-bar controls, and overflow scrolls inside the fixed workspace.
- Launcher and Search remain on the frameless fixed `240x320` Palette main surface. Selected Command Actions temporarily attaches inside the same frameless `422x320` envelope under the separately documented narrow shape-union exception.
- The existing renderer bundle selects Settings through a main-process-owned `?view=settings` marker. Renderer code never sends dimensions.
- Draft values remain local until Save. Save and Reset route through ConfigManager; path and folder fields route through Electron native dialogs.
- FeatureCatalog clones schemas with resolved labels from the shared backend utility. SettingsRenderer maps only the seven validated schema types to native controls and renders `field.label` without fallback formatting.

### 4. Validation & Error Matrix

- Empty feature catalog -> truthful empty state.
- Empty schema -> “No settings required”; Save disabled.
- Missing help -> “No interaction help available.”
- Picker cancellation -> `null`; draft remains unchanged.
- Invalid required/type/select value -> ConfigManager error shown; persisted values remain unchanged.
- Settings close or feature navigation -> never executes a Command or capability.

### 5. Good/Base/Bad Cases

- Good: registering a new Capability with metadata and a schema makes it appear in the shared Settings window without renderer edits.
- Base: `marker.add` appears under Timeline, renders its metadata and binding-derived Interaction Help, and truthfully shows that no settings are required.
- Good: both Electron hosts call the shared IPC registrar and shared Settings window helper while retaining their own Capability providers.
- Bad: adding a renderer branch such as `if (feature.id === "marker.add")`, a feature-specific BrowserWindow, or a second renderer bundle.
- Bad: reading `config.json`, importing ConfigStorage, resolving a Capability implementation, or calling Resolve APIs from renderer code.

### 6. Tests Required

- Assert catalog ordering, full defensive metadata, exact category filtering, and discovery after registration.
- Assert all seven schema types map to their native controls, resolved explicit/fallback labels are immutable, and feature category grouping preserves registry order.
- Assert feature/config/picker IPC semantics, picker cancellation, ConfigManager reset preservation, and complete-save validation.
- Assert the exact Electron dependency/lockfile baseline and both complete BrowserWindow option contracts — the Settings contract test asserts the exact options object including `transparent: true` and `backgroundColor: "#00000000"`, and the palette contract stays separate — plus Settings close IPC, fixed dimensions, and existing-window restore/focus behavior.
- Run `npm test`, `npm run build`, and boundary searches for renderer Capability/Resolve/storage coupling.
- After any Settings surface-contract change, package, install, and run the packaged Resolve manual A/B (first open, reopen, titlebar/sidebar/controls focus moves) — no cyan/blue edge and no first-open/reopen flicker; standalone Electron cannot reproduce Resolve-host opaque frameless behavior.

### 7. Wrong vs Correct

#### Wrong

```javascript
if (feature.id === "marker.add") {
  return <MarkerSettings />;
}
```

#### Correct

```javascript
const features = await window.resolveCommandCenter.listFeatures();
return <SettingsRenderer schema={feature.configSchema} values={draft} />;
```

#### Wrong

```javascript
// DWM/Python/timer workaround for the Resolve-host Settings edge — failed live,
// added complexity, forbidden for this known case.
DwmSetWindowAttribute(hwnd, DWMWA_BORDER_COLOR, DWMWA_COLOR_NONE, ...);
```

#### Correct

```javascript
// Transparent compositor surface + opaque renderer shell (verified live fix).
new BrowserWindow({
  frame: false,
  transparent: true,
  backgroundColor: "#00000000" // .settings-shell paints the opaque 100vw x 100vh UI
});
```

---

## Scenario: Feature Lifecycle UI

### 1. Scope / Trigger

- Trigger: Feature Settings or command surfaces need lifecycle visibility, warnings, execution gating, or recovery navigation.
- Applies to shared Feature UI IPC/preload, Settings, Launcher, and Search. Selected Command Actions never executes and does not make lifecycle decisions.

### 2. Signatures

- Preload: `listFeatureStatuses()`, `refreshFeatureStatuses(featureId?)`, `setFeatureEnabled(featureId, enabled)`, `openSettings(featureId?)`, and `onSettingsFeatureSelected(callback)`.
- Lifecycle record: `{ id, installed, enabled, status, message, details: { missing: string[], action: "open-settings" | null } }`.
- Renderer projections: `joinFeatureStatuses`, `isFeatureVisible`, `canExecuteFeature`, `getFeatureWarning`, `getRecoveryAction`, and `canExecuteCommand`.

### 3. Contracts

- Renderer joins Commands and Feature metadata to lifecycle records only by existing Capability id; it never resolves Capability objects or provider implementations.
- Feature visibility uses `installed`; execution requires installed + enabled + ready; warnings use enabled/status; recovery uses structured `details.action`.
- A functional Command without a matching installed lifecycle record fails closed: do not display or execute it.
- Renderer may display `message` but must not parse it or branch on its wording.
- Settings shows one generic Enable/Disable control, status details, and a compact non-ready/disabled sidebar indicator with hover and focus description.
- Save, Reset, and Enable/Disable refresh lifecycle without replacing unsaved draft configuration.
- `open-settings` focuses/reuses the native Settings singleton and selects the affected Feature through a semantic main-process event.
- Launcher and Search intercept non-ready activation generically; no unregistered presentation fixtures enter lifecycle projection.
- Direct keyboard execution still sends Command id; mouse Interaction Binding still sends target and mouse facts. Command Engine remains the final stale-state gate.
- Lifecycle refresh is explicit on load/show and after mutations; no renderer polling or Capability-specific JSX is added.
- Render cached lifecycle snapshots, including initial `loading`, before awaiting explicit refresh so the UI never temporarily assumes readiness.

### 4. Validation & Error Matrix

- Installed + enabled + ready -> existing command/interaction route.
- Disabled or non-ready -> no execution IPC; show lifecycle warning.
- `details.action === "open-settings"` -> reuse/focus Settings and select `command.capability`.
- Loading -> temporarily unavailable with progress text.
- Unknown/uninstalled Feature -> hidden from Settings.
- Missing lifecycle record for a functional Command -> hidden and non-executable.
- Unregistered Command -> absent from catalog and lifecycle projection.
- Lifecycle IPC failure -> existing status/error surface remains visible and palette stays open.

### 5. Good/Base/Bad Cases

- Good: a new registered Capability automatically receives Settings status UI and palette gating without renderer edits.
- Base: `marker.add` reports provider readiness through the generic record and remains associated through `command.capability`.
- Good: sidebar tooltip is available on both hover and keyboard focus with `aria-describedby`.
- Bad: `if (command.capability === "ae.export")`, provider checks, config-schema completeness logic, or `message.includes(...)` in renderer code.
- Bad: a second Settings window, background polling, or renderer-owned status persistence.

### 6. Tests Required

- Pure model tests cover joins, visibility, execution, warnings, recovery, and missing-status fail-closed behavior.
- IPC tests cover list/refresh/set-enabled and targeted Settings selection.
- Build and boundary searches prove no renderer Capability/provider/config/message parsing or command-specific lifecycle branch.
- Manually verify ready, loading, disabled, missing config/dependency, unavailable, error, focus tooltip, and Settings recovery states when fixtures exist.

### 7. Wrong vs Correct

#### Wrong

```javascript
if (status.message.startsWith("Missing")) {
  openSettings(command.id);
}
```

#### Correct

```javascript
if (!canExecuteCommand(command)) {
  showWarning(getFeatureWarning(command.featureStatus));
  if (getRecoveryAction(command.featureStatus) === "open-settings") {
    api.openSettings(command.capability);
  }
}
```

## Scenario: Command Row Mouse Interaction

### 1. Scope / Trigger

- Trigger: changing compact command-row mouse handlers, the preload interaction method, or Electron host interaction IPC.
- Applies to Launcher and Search command rows in both standalone and Workflow Integration hosts. Selected Command Actions rows are renderer-local acknowledgements and never use this route.

### 2. Signatures

- Preload API: `window.resolveCommandCenter.executeInteraction(event) -> Promise<InteractionResult>`.
- Read-only preload API: `window.resolveCommandCenter.listInteractionBindings() -> Promise<BindingRecord[]>`.
- Event: `{ target: command.id, type: "mouse", button: event.button, ctrlKey: boolean, shiftKey: boolean, altKey: boolean }`.
- Result: `{ matched: false }` or `{ matched: true, command: string, result: unknown }`.

### 3. Contracts

- Generic command rows send only `{ target, type: "mouse", button, ctrlKey, shiftKey, altKey }` through the preload interaction method.
- Left click and suppressed context-menu events share the same interaction route. Rows contain no Command-selection table or Capability ID mapping.
- Keyboard Enter and keyboard-generated button activation keep the direct `executeCommand(command.id)` route.
- Successful matched mouse execution is hidden by the host; unmatched interactions execute nothing and leave the palette available.
- Browser preview returns empty Commands and bindings and renders the normal empty catalog state.
- Double-click handlers and global-shortcut behavior are outside renderer interaction binding.
- Hover and keyboard focus use the same existing `aria-describedby` tooltip relationship in Launcher and Search. Selected Command Actions has its own listbox semantics and does not reuse Interaction Help as row data.
- Status, error, and executing messages replace interaction help until cleared; Commands without target bindings retain their metadata description.

### 4. Validation & Error Matrix

- Physical left/right interaction matches -> host executes the returned Command and hides the palette after success.
- No binding -> renderer clears the executing state and leaves the palette open.
- Interaction/executor error -> renderer displays the error and restores focus using the existing command error path.
- Keyboard Enter or keyboard-generated button click (`event.detail === 0`) -> execute the selected Command directly; do not route it through mouse bindings.
- Empty or unresolved binding help -> omit the row and retain the target Command description.
- Binding-derived functional-command help -> render compact label/description rows in the existing bottom overlay without resizing the `240x320` palette.

### 5. Good/Base/Bad Cases

- Good: every command-row view uses the same event projection helper.
- Base: physical unmodified click sends target `timeline.addMarker` and native mouse facts.
- Good: recency records `InteractionResult.command`, because a modified click may execute a Command different from the row target.
- Bad: `if (event.ctrlKey) executeCommand("timeline.addMarkerNote")` inside a row.
- Bad: treating keyboard-generated `click` as physical mouse input and silently ignoring Space activation.

### 6. Tests Required

- Run Interaction unit tests, `npm test`, and `npm run build`.
- Search renderer/preload interaction routing for Capability mapping, double-click handlers, and shortcut-manager coupling.
- Assert the renderer model joins target bindings to remapped action Command descriptions, preserves normalized left/right/modifier order, and handles empty/unresolved bindings.
- Assert visible targets resolve internal action Command descriptions for interaction help while help targets themselves never include internal Commands.

### 7. Wrong vs Correct

#### Wrong

```javascript
onClick={(event) => event.ctrlKey
  ? api.executeCommand("timeline.addMarkerNote")
  : api.executeCommand(command.id)}
```

#### Correct

```javascript
onClick={(event) => executeInteraction(command, event)}
onContextMenu={(event) => executeInteraction(command, event)}
```

---

## Forbidden Patterns

- Command-specific UI branches for execution behavior.
- Renderer imports from backend bridge modules or Resolve scripting modules.
- Renderer imports from `WorkflowIntegration.node` or calls Resolve API methods.
- Implicit dev-server loading for normal Electron startup.
- Renderer-provided screen bounds, panel placement coordinates, whole-window dimensions, shapes, or hit-test policy.
- A semantic mode IPC that re-applies arbitrary geometry rather than the approved bounded attached-actions open/close metrics.
- `setShape` on Clackly BrowserWindows except the approved open Attached Actions union of main rectangle, actual panel rectangle, and minimal arrow envelope; rounded, stepped, decorative, or general shaped-window uses remain forbidden.
- Hand-authored functional icon path libraries when the existing Lucide dependency provides the icon; brand assets are the exception.
- Font-dependent SVG `<text>` wordmarks or external font/image references inside Clackly brand assets.
- Selection halos, orange row fills, and card-like row borders; use the light neutral selected row with dark foreground instead.

---

## Required Patterns

- Keep renderer access behind `preload.js` with `contextIsolation: true`.
- Route command execution through command capability metadata and a host-injected capability registry.
- Keep Command presentation Registry-only; do not add prototype catalogs, browser fixtures, or Command-id overrides.
- Keep palette sizing, centering, taskbar, and topmost policy in the shared Electron window helper; renderer mode changes are content-only and cross no sizing IPC.
- Set `roundedCorners: false` on both Palette and Settings BrowserWindows and keep the shared outer renderer shell at `border-radius: 0`; express all rounding inside content controls.
- Use Lucide for functional controls/command icons and project SVGs for the Clackly identity.
- Draw the CLACKLY wordmark with project-owned SVG paths/shapes and keep its accessible name on the consuming `<img>`.
- Keep command names and metadata single-line, with a shared `14–16px` Lucide icon slot and stable truncation.
- Keep dev renderer startup explicit and separate from built renderer startup.

---

## Testing Requirements

- Run the package build after frontend changes: `npm run build`.
- After any outer-window surface change, run `npm run package:win`, `npm run package:verify`, and `npm run workflow:install:package`, then require packaged Resolve manual validation of first open, repeated Palette reveals, and Settings open — unit tests cannot observe DWM composition.
- For command search changes, run a Node-level registry assertion for the changed query and command id.
- For renderer catalog/ranking changes, run the renderer model tests covering search boundaries, grouping, ordering, and unavailable fixtures.

## Scenario: Codex Impeccable Stop Hook

### 1. Scope / Trigger

- Trigger: the project-local Impeccable detector runs from the Codex `Stop` entry in `.codex/hooks.json`.

### 2. Signatures

- Input: Codex Stop event JSON on stdin, including `hook_event_name: "Stop"`, `session_id`, `turn_id`, `cwd`, and `stop_hook_active`.
- Clean output: `{"continue":true}` with exit code `0`.
- Finding output: `{"decision":"block","reason":"<detector findings>"}` with exit code `0`.

### 3. Contracts

- Every Codex Stop path that exits `0` emits exactly one parseable JSON object; empty or plain-text stdout is invalid.
- `turn_id` or explicit `IMPECCABLE_HOOK_HARNESS=codex` identifies the Codex wire contract.
- Claude, Cursor, GitHub Copilot, and PostToolUse payload formats remain provider-specific and unchanged.

### 4. Validation & Error Matrix

- No touched UI files / clean scan / disabled / re-entrant Stop -> `{"continue":true}`.
- Fresh findings -> `decision: "block"` with findings in `reason`, allowing Codex to continue one review pass.
- `stop_hook_active: true` -> continuation JSON without rescanning, preventing a Stop loop.

### 5. Good/Base/Bad Cases

- Good: Codex clean Stop exits `0` and stdout parses as `{"continue":true}`.
- Base: Claude Stop findings retain `hookSpecificOutput.additionalContext`.
- Bad: Codex Stop exits `0` with empty stdout or a Claude-only finding payload.

### 6. Tests Required

- Spawn `hook.mjs` with a clean Codex Stop event and parse stdout as JSON.
- Inject one detector finding into `runStopHook` and assert `decision === "block"`.
- Assert Claude, Cursor, GitHub, and Codex PostToolUse payloads remain unchanged.

### 7. Wrong vs Correct

#### Wrong

```javascript
return { exitCode: 0, stdout: "" };
```

#### Correct

```javascript
return { exitCode: 0, stdout: JSON.stringify({ continue: true }) };
```

---

## Code Review Checklist

- No Resolve scripting API names appear under Electron UI/main files except Workflow Integration lifecycle calls or documentation strings.
- Command ids live in command manifests or bridge handler tables, not renderer conditionals.
- Command manifests describe `capability`, not a Resolve or keyboard execution backend.
- All palette modes remain `240x320`; both Electron hosts share the fixed window helper with no renderer mode-resize IPC.
- Browser preview and empty registries render the normal empty catalog state without fixtures.
- Functional icons come from Lucide while `clackly-logo.svg` and `clackly-mark.svg` remain custom assets.
- `npm run dev` and built `npm start` behavior remain distinct.
