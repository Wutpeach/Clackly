# Quality Guidelines

> Code quality standards for frontend development.

---

## Overview

Frontend code includes Electron main-process code, Workflow Integration Plugin main-process code, preload APIs, and renderer UI. The frontend layer owns desktop behavior and user interaction only; integration actions must cross a narrow IPC/API boundary instead of importing backend or Resolve-specific APIs into renderer code.

### Palette Architecture Authority

- This spec records the accepted D6/D7 contract implemented by `electron/main/paletteHostPolicy.js`, the shared native window helpers, and both Windows host entry points. Windows native behavior is never inferred from a renderer URL, browser screenshot, or preview query.
- `electron/shared/palette-geometry.json` is the cross-layer authority for shared Palette dimensions and visual tokens. The hostless root browser preview consumes that contract as an isolated, non-executable DOM simulation; it does not define or validate DWM, HWND, focus, hit testing, z-order, packaged-runtime, or Resolve behavior.
- The transparent attached `setShape` model is a non-Windows compatibility fallback only. It is not the Windows D6/D7 architecture and must not be described as the production Windows window model.

## Scenario: Electron Command Palette Boundary

### 1. Scope / Trigger

- Trigger: A command palette action crosses renderer UI, Electron main process, command registry, and a backend bridge.
- Applies when adding Electron windows, preload APIs, command UI, command search, or command execution wiring.

### 2. Signatures

- Renderer API exposed by preload:
  - `window.resolveCommandCenter.listCommands() -> Promise<Command[]>`
  - `window.resolveCommandCenter.searchCommands(query: string, pinnedIds: string[]) -> Promise<{ commands: LocalizedVisibleCommand[], usedCommandIds: string[] }>`
  - `window.resolveCommandCenter.executeCommand(commandId: string) -> Promise<object>`
  - `window.resolveCommandCenter.listInteractionBindings() -> Promise<BindingRecord[]>`
  - `window.resolveCommandCenter.hidePalette() -> void`
  - `window.resolveCommandCenter.onPaletteShown(callback: () -> void) -> () -> void`
- `selectPaletteHostPolicy({ host: "standalone" | "workflow", platform }) -> WindowsNativeDualWindowPolicy | TransparentAttachedPolicy`.
- Windows detached Panel request: `openInteractionPanel({ metrics: { anchorY, contentHeight }, presentation }) -> Promise<{ panelTop, panelHeight, anchorY } | null>`, where `presentation` is either `{ kind: "mappings", rows: [{ label, actionName }] }` or `{ kind: "description", description }`.
- Command shape:
  - `{ id: string, name: string, description: string, category: string, icon: string, keywords: string[], capability: string, presentation?: "visible" | "internal" }`

### 3. Contracts

- `commands:search` is the sole production Search entry in both hosts. The renderer submits the string query and its explicit Pin IDs, then consumes the already ordered localized visible Commands plus `usedCommandIds`.
- The renderer owns query, Pins, selection, and presentation only. It has no matcher, text-ranking, usage score, persisted Recent state, or Search storage import. `usedCommandIds` feeds the existing `RECENT` section membership only; it cannot re-rank Commands.
- `presentation` defaults to `visible`; internal Commands stay executable and resolvable for interaction descriptions but never appear in Launcher, Search, or Settings help targets. One shared `isCommandPresentable()` predicate owns that filter in both the command registry and the renderer presentation model; no renderer branch names a Command id or capability.
- Production renderer presentation contains registered Commands only. Renderer Pin state starts empty, while `RECENT` membership may immediately reflect persisted Core usage through `usedCommandIds`. Only the root browser preview path without `window.resolveCommandCenter` may use an isolated renderer-local presentation adapter with representative Commands, lifecycle status, and normalized bindings; it is never registry, preload, IPC, or Resolve authority and never executes a real command.
- `agentation@3.0.2` (PolyForm-Shield-1.0.0) is a development-only browser feedback tool. Lazy-load and mount its official `<Agentation />` only on that same hostless root Palette preview gate; do not render it in Electron dev/packaged renderers, Resolve, or Settings. It remains local annotation/structured-copy UI only: no registry/IPC/Resolve access, callbacks, endpoint, webhook, or automatic external submission.
- Launcher and Search retain Core-provided Search order after Feature visibility filtering. Icons, accessibility names, and generic hints preserve registered Command Metadata; renderer code contains no Command-id presentation override.
- Renderer execution sends only the selected `commandId`.
- Per-command shortcut badges are absent until an authoritative presentation contract exists. The universal selected-Command Footer Info control is derived from interaction metadata and is not command shortcut metadata or a host-wide hotkey.
- Launcher and Search always occupy the fixed visible `240x320` Palette main rectangle. Interaction Panel open/closed remains Palette-local presentation state. The renderer sends only bounded integer `{ anchorY, contentHeight }` metrics plus a validated read-only presentation snapshot; it never supplies screen coordinates, bounds, width, height, shapes, padding, resize policy, commands, query, selection, or arbitrary HTML.
- `electron/shared/palette-geometry.json` is the single cross-layer authority for the main `240x320`, `#151619` surface, `8px` main radius, Panel `260px` width, `16px` gap, `60–180px` height, `8px` inset, `4px` Panel radius, and visual elevation. Native helpers, browser-preview metrics, JSX style projection, and CSS must consume it rather than copy geometry.
- `selectPaletteHostPolicy()` is the only Windows native-surface selector. It maps both `standalone` and `workflow` on `win32` to D6/D7 independent of renderer URL, `--dev-renderer`, or `app.isPackaged`; non-Windows maps to the compatible transparent attached fallback. Settings is outside this policy.
- Windows D6 main construction is `240x320`, `frame:false`, `transparent:false`, `backgroundColor:"#151619"`, `roundedCorners:true`, `thickFrame:true`, `minimizable:false`, `skipTaskbar:true`, and `alwaysOnTop:true`, with no Mica and no base `setShape`. The renderer receives the neutral opaque full-bleed surface marker and paints at `0,0`; DWM owns the outer corners/shadow. First reveal may call `show()` only because the persistent window starts hidden. Repeated conceal/reveal uses immediate `setOpacity(0/1)`, mouse/focus gating, cursor-origin placement, and focus—never minimize, restore, hide/show, timer, or authored motion.
- Windows D7 constructs one persistent detached opaque `260x60` Panel window with `show:true`, `opacity:0`, `frame:false`, `transparent:false`, `backgroundColor:"#151619"`, `roundedCorners:true`, `thickFrame:true`, `minimizable:false`, `skipTaskbar:true`, `alwaysOnTop:true`, and `focusable:false`. It ignores mouse immediately and remains constructor-only nonfocusable: readiness, open, update, and close never call `setFocusable`, `show`, `hide`, `minimize`, or `restore`. The host positions it at main right plus a real screen-space `16px` gap and bounds height to `60–180px`.
- The D7 controller owns Panel creation/recreation, readiness, combined work-area clamp, main-bounds restoration, and lifecycle. A no-state close is a true native no-op. Open/update validate the bounded snapshot, retain the main as focus/selection authority, enable Panel mouse input, send presentation, and set opacity `1`. Actual close sets opacity `0`, ignores mouse, clears presentation, restores the main bounds, deletes state, and restores main focus only when explicitly requested and absent. Unready, destroyed, invalid, or failed delivery paths fail closed without hiding or unfocusing the usable main.
- Windows native blur ignores only a queued event for which `mainWindow.isFocused()` is already true; a real unfocused blur still follows the logical-shown conceal path. This narrow guard prevents Electron focus feedback from a redundant detached operation and is not a debounce or general blur exemption.
- The single Vite root browser preview is a hostless DOM simulation. It uses the canonical `240x320` main, `#151619` surface, `8px`/`4px` painted radii, visual shadow approximation, `16px` physical-looking gap, `260px` Panel, and the same bounded content/anchor rules; its transparent DOM staging and safe-edge scrolling are presentation-only. It cannot claim or emulate DWM, HWND separation, focus, hit testing, z-order, or Resolve acceptance.
- Browser-preview Command activation is deliberately quiet: it opens or retains Interaction Info without invoking its local non-executable API or showing event-error feedback. Only that hostless panel includes the exact subdued note `Preview only — commands run in Electron.`; injected Electron/Resolve panels contain no preview note and retain their normal execution and error paths.
- Palette composition is search-led, not brand-led: Launcher and Search begin with the compact search surface; the Palette itself has no wordmark, orange identity rule, or primary header toolbar. Search is a separate DOM/content mode containing only `RESULTS`, while Launcher projects only nonempty `PINNED`, `RECENT`, and fallback `COMMANDS` sections from its existing ranked source.
- Palette rows are compact list primitives: transparent at rest, soft neutral on pointer hover, and light neutral with dark foreground for keyboard selection. Main list, Footer, and Interaction Panel share the exact `#151619` Palette neutral surface; a subtle panel border and shadow provide separation. Search is the slightly inset control and the Footer may use only a faint hairline, never a separately dominant black toolbar. Command name and the `14–16px` monochrome Lucide icon take priority; category/status, true Launcher numeric keycaps, and the `27px` footer are progressively weaker but remain readable. Settings and the push-pin control stay on the Footer left; Info stays on the right for every selected Command. Search retains only its in-field `ESC` hint and uses it to return to Launcher, without a duplicate footer Back control. Do not synthesize per-command shortcuts or submenu behavior.
- Interaction Panel rows come only from `getInteractionHelp(selectedCommand, commands, bindings)`, which resolves normalized bindings against registered action Commands. The Palette's existing `selectedCommand` remains the sole current-command authority. The panel owns no captured Command, interaction definitions, query, selection, hover, acknowledgement, execution route, global state, or new domain.
- On Windows D7, Interaction Info is two native windows: a `240x320` main left and a detached `260px` Panel right with no native window in the real `16px` gap. Panel content wraps naturally and owns vertical overflow. Combined clamp moves both together when needed and exact pre-Panel main bounds return on close/hide/failure. The host never flips the Panel left.
- On Windows D6, native top-left directly anchors at the cursor and work-area flip/clamp uses the `240x320` footprint. The persistent Palette emits `palette:shown` after reveal and conceals in place without destruction. The compatible non-Windows attached fallback retains the padded transparent `256x336` closed / `532x336` bounded open shape contract.
- The programmatically focused non-interactive `.palette-shell` suppresses only its own default focus outline; interactive controls keep their `:focus-visible` indicators.
- Electron hosts delegate command execution to the command engine, which resolves intent through an injected capability registry. External Electron registers a bridge-backed capability; Workflow Plugin registers a Resolve-backed capability. Renderer code still sends only command ids through preload IPC.
- Functional UI icons use `lucide-react` with the shared optical size/stroke convention. Clackly logo and mark remain project-owned SVG assets rather than Lucide substitutions.
- Clackly wordmark assets are deterministic vector geometry: use SVG paths/shapes only, never `<text>`, font-family declarations, or external font/image dependencies.
- Settings remains separate: square painted `0px`, `760x560`, `frame:false`, `transparent:true`, `backgroundColor:"#00000000"`, `roundedCorners:false`, `thickFrame:false`, `alwaysOnTop:false`, normal taskbar behavior, and its existing singleton show/focus lifecycle. It never adopts D6/D7 policy. The Palette main paints at `8px` and Panel at `4px`; on Windows native hosts those content radii sit inside DWM-owned outer corners/shadow, while the non-Windows fallback retains its padded renderer shadow.
- `setShape(Rectangle[])` is forbidden for Windows D6/D7 Palette and detached Panel windows. It remains available only to the compatible non-Windows attached fallback as the exact closed padded main rectangle and bounded open main-plus-Panel union; no connector, arrow, staircase, rounded/per-pixel region, or full-width hit region is allowed. No Mica, DWM Cloak, PowerShell/native helper, native add-on, subprocess, timer, minimize/restore, repeated hide/show, or authored scale/fade/visual-blur/translation/taskbar motion is an approved substitute.
- Development renderer loading must be explicit, for example `--dev-renderer` or `RESOLVE_COMMAND_CENTER_RENDERER_URL`.
- Default non-packaged startup should load built renderer files so Resolve-launched Electron does not depend on a Vite dev server.

### 4. Validation & Error Matrix

- Unknown command id -> command engine rejects with a user-facing error.
- Missing capability handler -> command engine rejects with a user-facing error.
- Unknown palette mode -> renderer state only; the shared window footprint never changes because modes are content-only.
- Empty registered catalog -> Launcher and Search render truthful empty states. The root browser preview instead intentionally presents its isolated, renderer-local representative data so the real main Palette and Interaction Panel can be inspected without Electron; this exception does not alter empty registered catalogs or production presentation authority. A selected Command with zero or one resolved interaction still exposes Info and presents only its registered description, never an empty state.
- Bridge failure -> renderer keeps the palette open, shows the error, and refocuses search.
- Successful command -> Electron hides the palette.
- Global shortcut registration failure -> main process logs a warning.
- Workflow Plugin global shortcut registration failure -> plugin shows its own palette and warns that another process owns the shortcut, because otherwise an old Utility/dev Electron process can keep routing commands to the Python bridge.
- Windows D7 Panel unready, destroyed, invalid, or failed delivery -> keep it opacity `0` and mouse-ignored, clear stale presentation, restore any translated main bounds, and leave the main usable/focused.
- Windows D7 close with no open state -> return without a native Panel/main mutation, presentation clear, bounds restore, or focus call.
- Windows D7 blur delivered while `mainWindow.isFocused()` is true -> record/ignore the stale blur; an unfocused blur still takes the existing logical-shown conceal path.

### 5. Good/Base/Bad Cases

- Good: Adding command intent metadata and registering its capability in each supported host.
- Base: `marker` query reaches Core Command Search through preload and returns its ordered localized response.
- Good: Opening Interaction Info on Windows D7 keeps the opaque `240x320` main at left, opens the separately native `260px` Panel at its clamped anchor with no HWND in the real `16px` gap, and restores exact original main bounds on close/hide/failure.
- Base: Windows standalone dev, built, packaged, and Workflow select identical D6/D7 construction and opacity/mouse lifecycle; non-Windows selects the attached transparent compatibility fallback.
- Good: registering a Command with declared description/category/icon makes it appear correctly without renderer edits.
- Bad: UI code checks `if (query === "marker")` or invokes Resolve APIs directly.
- Bad: searching category labels, adding production prototype fixtures, sending renderer-provided bounds/shape/position, using a general resize protocol, or dynamically routing whole-window mouse events.

### 6. Tests Required

- Assert preload Search accepts query plus Pin IDs and returns the `{ commands, usedCommandIds }` contract; Palette ignores stale asynchronous Search responses and does not recreate matching/ranking/usage state.
- Assert query matching returns expected localized/English/pinyin command IDs through shared Command Search, not Registry or renderer matching.
- Assert presentation category text alone does not match a command.
- Assert registered Command presentation is preserved, an empty registered catalog stays empty, and no shortcut/prototype entries are synthesized in production presentation.
- Assert Launcher and Search exclude `presentation: "internal"` Commands while `listCommands()`/`getCommandById()` still return them, and that the shared presentability predicate has no Command-id branches.
- Assert the pure policy matrix maps Windows standalone dev/built/packaged and Workflow to D6/D7 independently of URL/`app.isPackaged`, with non-Windows attached fallback and Settings outside the selector.
- Assert Windows D6 exact `240x320` opaque options, no base shape, cursor/work-area placement, first native show only, and repeat immediate opacity `0/1` conceal/reveal; assert the fallback retains its documented transparent padded shape contract.
- Assert Windows D7 exact persistent opaque constructor, real `16px` screen-space gap, `60–180px` height clamp, prewarm `show:true`/opacity `0`, constructor-only `focusable:false`, mouse gating, no post-construction show/hide/minimize/restore/focusability calls, no-state close no-op, idempotent update, original-main restoration, fail-closed recreation/delivery, and stale-versus-real blur handling.
- Assert the `.palette-shell` suppresses only its own focus outline while control `:focus-visible` rules remain.
- Assert Settings remains its painted square (`0px`) transparent contract; Windows D6/D7 owns native corners/shadow while renderer main/Panel paint the shared `8px`/`4px` content radii, and the fallback retains its padded renderer-shadow contract.
- Assert renderer uses preload APIs instead of direct Node or Resolve imports.
- Assert the root browser preview has no injected Electron host, uses only the isolated renderer-local adapter plus canonical geometry/visual tokens and shared Panel content projection, and renders a centered visual `240x320` main plus `260px` Panel with `16px` gap and `60–180px` clamp. It preserves Info/Tab/Escape lifecycle, opens Information quietly on Command activation with no event-error feedback, places the exact preview-only note inside the panel only, and reaches the full open composition through safe-edge scrolling on a small viewport without claiming native authority.
- Assert Agentation's browser-preview gate accepts only hostless `/` Palette preview and rejects host-injected Electron plus `?view=settings`; browser evidence must find its toolbar beside the open Interaction Panel and must find no toolbar in the injected-host scenario.
- Assert `npm run build` succeeds and file-backed Electron startup has a built renderer target.
- Assert `clackly-logo.svg` parses as XML and contains no `<text>`, font reference, or external image.
- Visually verify the shared `240x320` main and visually detached `260px` Panel with the `16px` gap, universal Info, correct push-pin, mapping-or-description content exclusivity, complete wrapped labels, vertical scroll containment, shared `#151619` surface, `8px`/`4px` painted radii, shadow stage, absence of connector/title/Command-name repetition/footer, transient feedback, and Footer geometry. Use the repository `palette:evidence` developer tool headlessly by default; browser evidence proves visual-token parity only, not DWM composition, HWND separation, native hit testing, focus, z-order, packaged runtime, or Resolve validation. For source Workflow host acceptance, complete the automated gate, `npm run build`, and `npm run workflow:install`, then restart Resolve and manually test the installed source; packaged-distribution installation/acceptance requires separate evidence.

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

#### Wrong

```javascript
const nativePolicy = !app.isPackaged && shouldLoadDevRenderer()
  ? nativeDualWindow
  : transparentAttached;
```

#### Correct

```javascript
const policy = selectPaletteHostPolicy({ host, platform: process.platform });
// Renderer URL and packaged state select loading/distribution, never Windows surface policy.
```

---

## Scenario: Command Interaction Hint

### 1. Scope / Trigger

- Trigger: exposing the valid interaction methods of the currently selected Command through explicit progressive disclosure.
- Applies to the renderer projection and lifecycle, Palette-scoped CSS, developer-only Playwright utility, and the minimum shared preload/host path for Interaction Panel semantic intent. It does not authorize a new interaction domain, persistence, interaction execution UI, runtime/Resolve changes, a global hotkey, or arbitrary resize controls. The accepted Windows D7 policy is the narrow exception: it owns one persistent detached read-only presentation window, not a second interaction domain.

### 2. Signatures

- Renderer projection: `getInteractionHelp(command, commands, bindings) -> Array<{ label, actionName, description }>`; unresolved action Commands are omitted.
- Palette-local state: `interactionPanelOpen: boolean` plus returned presentation geometry. `selectedCommand` and interaction definitions are never copied into panel state.
- Preload intent: the non-Windows attached fallback accepts `openInteractionPanel({ anchorY, contentHeight })`; Windows D7 accepts `openInteractionPanel({ metrics: { anchorY, contentHeight }, presentation })`, validates that bounded read-only snapshot, and returns `Promise<{ panelTop, panelHeight, anchorY } | null>`. Both expose `closeInteractionPanel() -> void`.
- Developer command: `npm run palette:evidence`; it is headless by default. `node scripts/palette-evidence.mjs --renderer <built|packaged> --scenario <name[,name]> --output <directory>` selects evidence inputs; `--headed` is explicit opt-in.

### 3. Contracts

- Info eligibility requires only a selected Command. More than one valid resolved interaction renders mappings only; zero or one renders only the selected Command's registered description, never an empty state.
- Info click toggles the panel. `Tab` opens it only while Command selection has focus; `Tab` while open closes it and restores Palette focus. Hover, dwell timers, pointer leave, selection, and result changes never open it.
- `Esc` closes an open panel first. Selection id change, mode/query change, command or interaction execution, Palette show/hide, and host open failure all close it. Existing Search-to-Launcher and Launcher-to-hide `Esc` behavior remains unchanged while the panel is closed.
- The panel consumes the current `selectedCommand` and its derived rows directly. It has no captured Command, selected interaction row, hover state, query, acknowledgement, execution semantics, or independent focus-navigation model.
- Host panel content is either static input-to-action mappings or the selected Command's registered description, never both. It has no connector, title, Command-name repetition, category, explanatory copy, footer, search, or empty state. The hostless browser preview may append only its exact `Preview only — commands run in Electron.` execution note inside that same panel.
- The main Palette remains visible at left. On Windows D7, the `260px` Panel is a separate opaque native window with a real `16px` gap; the browser preview simulates that same composition in DOM and the non-Windows fallback remains attached. All share the exact `#151619` surface, `4px` painted Panel radius, compact keycaps, naturally wrapped action labels, vertical overflow containment, and a content-fit `60–180px` height.

### 4. Validation & Error Matrix

- No selected Command -> no Info control. Unresolved bindings or one valid interaction -> Info opens the registered Command description only.
- Multiple valid interactions -> Info appears and rows use registered action Command names.
- Host returns `null` or rejects -> panel fails closed, restores Palette focus, and reports the existing compact error feedback.
- Selection changes while open -> panel closes before a new Command's mappings can remain visible.
- Escape while Interaction Info is open -> close the panel only; main Palette does not hide.
- Escape in Search -> return to Launcher; Escape in Launcher -> existing `hidePalette()` behavior remains unchanged.
- Windows D7 invalid/unready/destroyed/delivery failure -> detached Panel remains opacity `0`/mouse-ignored, stale content is cleared, temporary main movement is restored, and the focused main stays usable.
- Windows D7 close without open state -> true native no-op; an actual close restores bounds and clears opacity/mouse/presentation exactly once without changing Panel focusability.

### 5. Good/Base/Bad Cases

- Good: a BindingStorage remap changes both Settings help and Palette mappings through the shared projection without renderer branches.
- Base: selecting a multi-interaction Command shows Info; pressing `Tab` opens its static mappings and pressing `Tab` again returns to the Palette.
- Bad: storing `interactionPanelCommand`, copying binding rows into component state, adding hover-open timers, or executing a mapping row as a second Command Palette.

### 6. Tests Required

- Run `npm run palette:evidence` against built or packaged renderer assets; assert shared visual `240x320` main / `260px` Panel / `16px` gap / `60–180px` height, `8px`/`4px` radii, shadow stage, universal Info, explicit click/Tab open, Tab/Esc return, selection/execute/show close, no hover/timer open, metadata-derived mappings and description fallback, no connector/title/Command-name repetition/footer/empty state in host panels, wrapped labels, contained overflow, `#151619`, console/page-error capture, quiet root-preview activation, and its panel-only note. Browser evidence is DOM-only.
- Run focused policy/window/Workflow/renderer tests, `npm run build`, `npm test`, `npm run package:win`, and `npm run package:verify`. For source Workflow acceptance, then run `npm run workflow:install` and manually test after a full Resolve restart. Do not claim packaged distribution installation or Resolve acceptance without separate proof.

### 7. Wrong vs Correct

#### Wrong

```javascript
const [interactionPanelCommand, setInteractionPanelCommand] = useState(selectedCommand);
const [interactionRows, setInteractionRows] = useState(copiedInteractionDefinitions);
```

#### Correct

```javascript
const interactionRows = getInteractionHelp(selectedCommand, commands, bindings);
const hasSelectedCommand = Boolean(selectedCommand);
const interactionPanelUsesMappings = interactionRows.length > 1;
```

---

## Scenario: Metadata-Driven Feature Settings

### 1. Scope / Trigger

- Trigger: exposing Capability Metadata or configuration in Electron UI.
- Applies to FeatureCatalog, Settings BrowserWindow lifecycle, preload/IPC, SettingsRenderer, the renderer-local Settings projection, and the inspector-only status/interaction presentation.

### 2. Signatures

- `new FeatureCatalog({ capabilityRegistry }).getAllFeatures() -> CapabilityMetadata[]`.
- Preload APIs: `listFeatures()`, `listInteractionBindings()`, `getConfig(capabilityId)`, `saveConfig(capabilityId, values)`, `resetConfig(capabilityId)`, `pickPath("path" | "folder")`, `openSettings()`, and `closeSettings()`.
- `SettingsRenderer({ schema, values, onChange, onPick, disabled })`.
- Renderer-only projections: `filterFeaturesByQuery(features, query) -> Feature[]` and `getEffectiveFeatureStatus(record, t) -> { kind, label, reason }`.

### 3. Contracts

- One registered Capability is one feature; there is no second feature manifest, registry, feature-id branch, or feature-specific page.
- Feature identity and schema come from Capability Metadata. Application selection is structurally `selectedFeatureId === null`; `Clackly Settings` is a fixed navigation footer destination, never a FeatureCatalog record, Capability, config schema, or lifecycle record.
- Feature search is renderer-local and case-insensitive over already localized Feature `name`, `category`, and `description`, using deterministic locale-independent casing. It filters before category grouping, hides empty groups, preserves the current selection, and exposes a truthful accessible no-results state. If a nonmatching selected Feature is still current, one renderer-local localized Current group retains that real row without a duplicate or selection change. It adds no IPC, persistence, ranking, shortcut, or remote lookup.
- Feature identity and schema remain FeatureCatalog-owned. Inspector help targets Commands through `command.capability === feature.id` and derives rows from `getInteractionHelpCommands()` / normalized bindings plus registered action Command names; it never hand-authors shortcut strings.
- Standalone Electron and Workflow Integration register the same feature/config/picker channels through the shared IPC helper.
- Resolve 20.3.2.9 with bundled Electron 36.3.2 is the qualified desktop host; local Electron must remain exactly pinned to that API baseline.
- Settings is one fixed frameless `760x560` window with the exact Electron 36 BrowserWindow options `show: false`, `frame: false`, `roundedCorners: false`, `transparent: true`, `thickFrame: false`, `resizable: false`, `maximizable: false`, `minimizable: false`, `fullscreenable: false`, `alwaysOnTop: false`, `autoHideMenuBar: true`, `backgroundColor: "#00000000"`, and `title: "Clackly Settings"`. Its renderer `.settings-shell` must paint the opaque `--color-window` background across the full `100vw x 100vh` viewport so the transparent compositor surface never shows through. Do not use the Electron 37+ `accentColor` API, and do not add DWM/Python/timer/native-hook workarounds for the Resolve-host opaque frameless edge — the verified fix is the transparent surface plus the opaque renderer shell (live-validated 2026-08-06).
- On Windows, Palette uses the unified D6/D7 policy: the opaque `#151619` full-bleed `240x320` D6 main has native corners/shadow and persistent opacity lifecycle, while D7 supplies the detached `260px` Panel with real `16px` gap and bounded snapshot presentation. Non-Windows keeps the transparent attached compatibility fallback. Settings must not adopt Palette product behavior: it remains `760x560`, painted square, `alwaysOnTop: false`, and uses normal taskbar behavior.
- Repeated Settings opens reuse and focus the singleton; it does not hide on blur or become always-on-top. Its custom drag region and accessible close button replace native title-bar controls, and overflow scrolls inside the fixed workspace.
- Launcher and Search remain on the fixed visible `240x320` Palette main surface. On Windows, Interaction Info is D7's detached `260px` native Panel; on non-Windows it remains the documented attached fallback. Renderer code never supplies window dimensions or native placement.
- The existing renderer bundle selects Settings through a main-process-owned `?view=settings` marker. Renderer code never sends dimensions.
- Draft values remain local until Save. Save and Reset route through ConfigManager; path and folder fields route through Electron native dialogs.
- Feature context alone calls config/status APIs. Application context renders Preferences-owned Language with immediate localization persistence and package-owned About/version; it never calls Feature config/status APIs.
- FeatureCatalog clones schemas with resolved labels from the shared backend utility. SettingsRenderer maps only the seven validated schema types to native controls and renders `field.label` without fallback formatting.
- The `760x560` Settings renderer is a stable `190px / minmax(0, 1fr) / 220px` Navigation / Configuration / Context Inspector grid. Each column owns bounded scrolling where needed; navigation and center action footers remain fixed. Its compact titlebar has only the localized Settings title plus existing drag/close controls; it does not render a Clackly wordmark.
- Context Inspector derives exactly one effective status from unchanged lifecycle records: missing/loading -> Checking, disabled -> Disabled, ready -> Ready, missing-config/missing-dependency -> Needs Setup, and unavailable/error -> Unavailable. Only Ready has a small semantic green dot; abnormal statuses may show a concise status-record message or localized fallback, never a parsed message branch. Installed, Enabled, and Readiness are not parallel Settings labels. Refresh and Enable/Disable are bordered compact secondary controls with monochrome Lucide Refresh/Power icons.
- Shared primary emphasis is light-neutral `#E7E8EA` with `#17191D` foreground for focus, Palette pin, checkbox, Settings selection, and Save. Orange is separately named warning semantics only; project-owned logo SVG artwork remains unchanged.

### 4. Validation & Error Matrix

- Empty feature catalog -> truthful empty state.
- Nonempty local search with no match -> hide matching Feature groups, retain the application footer and current configuration context, render the selected Feature only in the localized Current group when applicable, and announce localized no-results copy.
- Empty schema -> “No settings required”; Save disabled.
- Missing help -> “No interaction help available.”
- Picker cancellation -> `null`; draft remains unchanged.
- Invalid required/type/select value -> ConfigManager error shown; persisted values remain unchanged.
- Settings close or feature navigation -> never executes a Command or capability.

### 5. Good/Base/Bad Cases

- Good: registering a new Capability with metadata and a schema makes it appear in the shared Settings window without renderer edits.
- Base: `marker.add` appears under Timeline, renders schema-driven configuration in the center, binding-derived Interaction rows in the inspector, and truthfully shows that no settings are required.
- Good: selecting the fixed `Clackly Settings` footer switches to Preferences-owned Language and package About without creating a synthetic Feature or calling Feature config/status APIs.
- Good: both Electron hosts call the shared IPC registrar and shared Settings window helper while retaining their own Capability providers.
- Bad: adding a renderer branch such as `if (feature.id === "marker.add")`, a feature-specific BrowserWindow, or a second renderer bundle.
- Bad: reading `config.json`, importing ConfigStorage, resolving a Capability implementation, or calling Resolve APIs from renderer code.

### 6. Tests Required

- Assert catalog ordering, full defensive metadata, exact category filtering, and discovery after registration.
- Assert all seven schema types map to their native controls, resolved explicit/fallback labels are immutable, and feature category grouping preserves registry order.
- Assert effective-status truth tables and local Feature filtering for localized name/category/description, whitespace/case normalization, hidden empty groups, no-results, and unchanged current selection.
- Assert the three column grid, localized wordmark-free Settings titlebar, application footer boundary, Current search-context row, Inspector-only About/one-status/real-interaction rows, Ready-only green dot, bordered secondary lifecycle actions, light-neutral focus/pin/checkbox/Save emphasis, and no legacy Installed/Enabled/Readiness labels.
- Assert feature/config/picker IPC semantics, picker cancellation, ConfigManager reset preservation, and complete-save validation.
- Assert the exact Electron dependency/lockfile baseline and both complete BrowserWindow option contracts — the Settings contract test asserts the exact options object including `transparent: true` and `backgroundColor: "#00000000"`, and the palette contract stays separate — plus Settings close IPC, fixed dimensions, and existing-window restore/focus behavior.
- Run `npm test`, `npm run build`, and boundary searches for renderer Capability/Resolve/storage coupling.
- After any Settings surface-contract change, run headless `npm run settings:evidence` with application, ready, missing-config/long-path, Simplified Chinese multi-interaction, busy, error, search-match, search-empty, and reduced-motion fixtures. Then package/install and run the packaged Resolve manual A/B (first open, reopen, titlebar/sidebar/controls focus moves) — no cyan/blue edge and no first-open/reopen flicker; standalone Electron cannot reproduce Resolve-host opaque frameless behavior.

### 7. Wrong vs Correct

#### Wrong

```javascript
if (feature.id === "marker.add") {
  return <MarkerSettings />;
}
```

#### Correct

```javascript
const selectedFeatureId = null; // application context, never a FeatureCatalog entry
const features = await window.resolveCommandCenter.listFeatures();
return selectedFeatureId === null
  ? <LanguagePreference />
  : <SettingsRenderer schema={feature.configSchema} values={draft} />;
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
- Applies to shared Feature UI IPC/preload, Settings, Launcher, and Search. Interaction Info is eligible for every selected Command, while existing executability gating remains responsible only for command execution; the panel never executes a mapping or adds lifecycle decisions.

### 2. Signatures

- Preload: `listFeatureStatuses()`, `refreshFeatureStatuses(featureId?)`, `setFeatureEnabled(featureId, enabled)`, `openSettings(featureId?)`, and `onSettingsFeatureSelected(callback)`.
- Lifecycle record: `{ id, installed, enabled, status, message, details: { missing: string[], action: "open-settings" | null } }`.
- Renderer projections: `joinFeatureStatuses`, `isFeatureVisible`, `canExecuteFeature`, `getFeatureWarning`, `getEffectiveFeatureStatus`, `getRecoveryAction`, and `canExecuteCommand`.

### 3. Contracts

- Renderer joins Commands and Feature metadata to lifecycle records only by existing Capability id; it never resolves Capability objects or provider implementations.
- Feature visibility uses `installed`; execution requires installed + enabled + ready; warnings use enabled/status; recovery uses structured `details.action`.
- A functional Command without a matching installed lifecycle record fails closed: do not display or execute it.
- Renderer may display `message` but must not parse it or branch on its wording.
- Settings Inspector shows one generic Enable/Disable control and exactly one pure effective status: Checking, Disabled, Ready, Needs Setup, or Unavailable. It shows a reason only outside Ready and one small semantic green dot only for the real Ready projection; the compact non-ready/disabled sidebar indicator keeps its hover/focus description.
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

- Good: a new registered Capability automatically receives Settings Inspector status UI and Palette gating without renderer edits.
- Base: `marker.add` reports provider readiness through the generic record and remains associated through `command.capability`.
- Good: sidebar tooltip is available on both hover and keyboard focus with `aria-describedby`.
- Bad: `if (command.capability === "ae.export")`, provider checks, config-schema completeness logic, or `message.includes(...)` in renderer code.
- Bad: a second Settings window, background polling, or renderer-owned status persistence.

### 6. Tests Required

- Pure model tests cover joins, visibility, execution, warnings, recovery, missing-status fail-closed behavior, and the effective-status truth table including ready-only dot eligibility.
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

## Scenario: Application Localization Boundary

### 1. Scope / Trigger

- Trigger: adding or changing user-visible copy, locale preference behavior, localized Command/Capability metadata, localization IPC, or Interaction Panel presentation.
- Applies to `preferences/`, `localization/`, both Electron hosts, preload APIs, Palette, Settings, and attached/detached Interaction Panel renderers.

### 2. Signatures

- `Preferences.getLocale() -> "system" | "en" | "zh-CN"`.
- `Preferences.setLocale(locale) -> locale`; invalid values throw before persistence or notification.
- `LocalizationService.getSnapshot() -> { preference, effectiveLocale: "en" | "zh-CN" }`.
- Main preload: `getLocalizationSnapshot()`, `setLocalePreference(locale)`, and `onLocalizationChanged(callback) -> unsubscribe`.
- Optional package-owned metadata: `localizations[locale] = { name?, description?, category?, keywords? }`; config fields may use `{ label?, optionLabels? }`.
- Detached presentation revision is exactly one of:
  - `{ kind: "description", effectiveLocale, ariaLabel, description }`
  - `{ kind: "mappings", effectiveLocale, ariaLabel, rows: [{ label, actionName, ariaLabel }] }`

### 3. Contracts

- `Preferences` is the only mutable locale-preference authority and writes `%APPDATA%/Clackly/preferences.json`. `ConfigManager` remains the only capability-domain writer of `%APPDATA%/Clackly/config.json`; atomic whole-file replacement is not merge or serialized-mutation safety, so these authorities must not share one document.
- The localization service resolves `system` from Electron system languages. English is the effective and per-key fallback; unsupported and Traditional Chinese system tags resolve to English.
- Locale snapshots are read-only presentation state. Stable Command/Capability/feature/binding/error IDs and execution IPC never carry display locale.
- Core UI copy comes from bundled resources. Package metadata keeps required English base fields and may add partial locale overlays; each missing field or option label falls back independently to its English/base value.
- Locale persistence completes before `localization:changed` is broadcast. A failed write leaves renderers on the previous authoritative snapshot.
- The detached D7 Panel has no locale getter, setter, subscription, raw Command catalog, or projection logic. The Palette owner computes `stable/raw interaction data + effectiveLocale -> complete presentation revision` and sends each revision to the existing Panel window.
- A locale change while D7 is open updates that same window through `interaction-panel:presentation`; it must not close, hide, recreate, refocus, change opacity to zero, or independently combine old localized content with a new locale snapshot.

### 4. Validation & Error Matrix

- Missing/invalid persisted preference -> `system`; invalid requested preference -> reject without saving or broadcasting.
- `system` + `en-*` -> `en`; `zh-CN`, `zh-SG`, or `zh-Hans*` -> `zh-CN`; unsupported/`zh-Hant*` -> `en`.
- Missing localized resource key -> English resource; missing in English too -> safe English fallback, never the key.
- Missing metadata locale/field/option label -> required English/base metadata value.
- Malformed metadata overlay or option-label map -> reject at registry boundary.
- Known structured error code -> localized presentation; unknown/unstructured error -> localized generic failure while diagnostic details remain internal.
- Destroyed renderer during broadcast -> ignore that send failure; other open owner renderers still receive the snapshot.
- Invalid, incomplete, oversized, or markup-bearing detached presentation -> reject and fail closed.

### 5. Good/Base/Bad Cases

- Good: Settings saves `zh-CN`, every open owner renderer receives one authoritative snapshot, Palette re-projects Commands, and the already-open D7 receives one complete Chinese revision.
- Base: an English-only third-party Command remains valid and usable in both locales through field-level English fallback.
- Good: Preferences and Capability config writes overlap in time but survive because they have distinct file authorities.
- Bad: adding locale under a Capability config root, writing `config.json` from Preferences, or persisting locale in a component/window.
- Bad: sending a new locale snapshot to D7 while retaining an already-localized presentation payload there.
- Bad: rendering resource keys, raw runtime `error.message`, or new hard-coded user-facing JSX strings.

### 6. Tests Required

- Unit-test locale resolution, invalid preference handling, resource fallback, interpolation, and no-key exposure.
- Persist locale and Capability config in both write orders and with overlapping service lifetimes; assert both `preferences.json` and `config.json` retain their values.
- Test IPC get/set, broadcast only after successful persistence, unsubscribe behavior, and absence of localization APIs from the detached preload.
- Test English-only, partial localized, malformed, cloned, and searchable Command metadata; test partial config `optionLabels` fallback.
- With one D7 object already open, assert `en -> zh-CN -> en` changes description/mapping/action/ARIA presentation and performs no close/reopen/recreate/show/hide/opacity-zero transition.
- Run `npm test`, `npm run build`, bilingual headless browser evidence, and the repository literal audit. Install the Workflow package before requesting Resolve-host manual acceptance.

### 7. Wrong vs Correct

#### Wrong

```javascript
// Two independent full-document writers can lose sibling-root changes.
const document = configStorage.load();
document.preferences = { locale };
configStorage.save(document);
```

#### Correct

```javascript
preferences.setLocale(locale);       // preferences.json authority
configManager.save(capabilityId, v); // config.json authority
```

#### Wrong

```javascript
// D7 now owns two independently changing presentation inputs.
panel.setState({ localizedPayload, effectiveLocale: nextLocale });
```

#### Correct

```javascript
const revision = projectInteraction(rawCommands, bindings, effectiveLocale);
panel.webContents.send("interaction-panel:presentation", revision);
```

---

## Scenario: Command Row Mouse Interaction

### 1. Scope / Trigger

- Trigger: changing compact command-row mouse handlers, the preload interaction method, or Electron host interaction IPC.
- Applies to Launcher and Search command rows in both standalone and Workflow Integration hosts. Interaction Panel rows are static help mappings and never use this execution route.

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
- The root browser preview deliberately omits Electron host injection and uses only the isolated renderer-local adapter/data. It may render representative bindings through the existing `getInteractionHelp()` projection so developers can inspect the real Interaction Panel; activation opens Information quietly instead of invoking its non-executable adapter, and it never imports registry/preload/IPC/Resolve authority or executes a real command.
- Double-click handlers and global-shortcut behavior are outside renderer interaction binding.
- Hover and keyboard focus use the same existing `aria-describedby` tooltip relationship in Launcher and Search. Interaction Info reuses the same metadata projection as visible static mapping rows, without a second listbox selection model.
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
- A semantic mode IPC that re-applies arbitrary geometry rather than the approved bounded Interaction Panel open/close metrics.
- `setShape` on Windows D6/D7 Palette or detached Panel windows; DWM owns their outer silhouette. The non-Windows fallback alone may use the documented attached closed padded main and bounded open main-plus-Panel union. Connector, arrow, rounded, stepped, decorative, per-pixel, full-column, or general shaped-window uses remain forbidden everywhere.
- Hand-authored functional icon path libraries when the existing Lucide dependency provides the icon; brand assets are the exception.
- Font-dependent SVG `<text>` wordmarks or external font/image references inside Clackly brand assets.
- Selection halos, orange row fills, and card-like row borders; use the light neutral selected row with dark foreground instead.

---

## Required Patterns

- Keep renderer access behind `preload.js` with `contextIsolation: true`.
- Route command execution through command capability metadata and a host-injected capability registry.
- Keep production Command presentation Registry-only; do not add production prototype catalogs, fixtures, or Command-id overrides. The sole exception is the root browser preview's isolated renderer-local adapter, gated on missing `window.resolveCommandCenter`, with no imports from registry/preload/IPC/Resolve code and no executable route.
- Keep palette sizing, cursor/work-area placement, taskbar, and topmost policy in shared host helpers; renderer mode changes are content-only and never supply native sizing/placement IPC.
- Select native surface only through the pure `selectPaletteHostPolicy({ host, platform })`: Windows D6/D7 is opaque `roundedCorners:true`/`thickFrame:true` with native DWM outer corners/shadow; the non-Windows transparent attached fallback retains `roundedCorners:false`/`thickFrame:false` and its documented shape. Settings is always separate and painted square.
- Use Lucide for functional controls/command icons and project SVGs for the Clackly identity.
- Draw the CLACKLY wordmark with project-owned SVG paths/shapes and keep its accessible name on the consuming `<img>`.
- Keep command names and metadata single-line, with a shared `14–16px` Lucide icon slot and stable truncation.
- Keep dev renderer startup explicit and separate from built renderer startup.

---

## Testing Requirements

- Run the package build after frontend changes: `npm run build`.
- After a Windows native Palette surface/lifecycle change, run `npm run package:win` and `npm run package:verify` for static package coverage. For source Workflow host validation, then run `npm run build` and `npm run workflow:install` before a full Resolve restart/manual check of first open, 10–20 repeated Palette reveals, Info/Tab/Escape, focus, real gap, corners, and shadow. Packaged-distribution installation and Resolve acceptance require separate explicit evidence; unit/browser tests cannot observe DWM composition.
- For command search changes, run a Node-level registry assertion for the changed query and command id.
- For renderer catalog/ranking changes, run the renderer model tests covering search boundaries, grouping, ordering, and unavailable fixtures.
- For root browser-preview changes, run `palette:evidence` against the built renderer and prove the closed/open composition, Info/Tab/Escape lifecycle, quiet command activation plus panel-only preview note, host absence, and small-viewport reachability.
- For the development-only Agentation integration, prove the toolbar is fixed above root browser-preview content without changing Palette geometry, while Electron-host evidence remains toolbar-free.

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
- All Electron Palette modes keep the visible `240x320` main surface. Windows standalone dev/built/packaged and Workflow share the D6/D7 host policy: opaque native D6 plus detached D7 without a native gap occupant; non-Windows retains the compatible attached fallback. No renderer mode supplies native resize IPC.
- Empty registered catalogs render the normal empty catalog state. The single root browser preview is the narrow exception: it uses isolated renderer-local representative data to show the interactive Palette and Panel without an Electron host; no query-only preview entry or production fixture is allowed.
- Agentation is a lazily loaded devDependency in the same hostless-root browser-preview exception only; it keeps its local click/annotation/copy behavior and has no external-send configuration or production host mount.
- Functional icons come from Lucide while `clackly-logo.svg` and `clackly-mark.svg` remain custom assets.
- `npm run dev` and built `npm start` behavior remain distinct.
