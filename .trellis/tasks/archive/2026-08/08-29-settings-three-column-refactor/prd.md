# Refactor Settings into three-column architecture

## Goal

Refactor the existing Clackly Settings window into a stable three-column operational surface—Feature Navigation, Configuration, and Context Inspector—while preserving all current settings authorities and making the renderer visibly use the same current-generation language as the Command Palette and Interaction Panel.

The result should let a Resolve user choose a Feature, edit only its schema-driven configuration in the center, and understand its metadata, effective lifecycle status, and real interaction bindings in the inspector without reconstructing state from duplicate or contradictory sections.

## Background and authority

- The working tree was clean when planning began on 2026-08-29. The active renderer is `resolve-command-center/electron/renderer/SettingsApp.jsx`; schema controls remain in `SettingsRenderer.jsx`; current paint is in `styles.css`.
- The current Settings implementation is two-pane and already preserves a fixed `760x560`, frameless, non-resizable, singleton Electron window contract.
- The shipped Palette's dominant current emphasis is already the light-neutral `#E7E8EA` / `#17191D` selection anchor, and the supplied Settings direction uses the same light emphasis for primary actions. Root `DESIGN.md`, `.impeccable/design.json`, and some renderer tokens still describe orange as the primary accent; those are stale and must converge to the current light-neutral emphasis system.
- `DESIGN.md` still says Settings retains two-pane geometry. That structural clause is superseded by this task's user-confirmed three-column requirement. All current visual tokens and the independent native Settings window contract remain authoritative.
- The supplied reference image is an information-architecture and proportion reference only. Its specific color, control, radius, titlebar, and status treatments are not implementation authority.

## Requirements

### Three-column structure

1. Keep one independent Settings native window and one renderer shell. Inside the existing titlebar, render three stable columns: left Feature Navigation, center Configuration, and right Context Inspector.
2. Keep the existing `760x560` native geometry and singleton show/focus/close behavior unless implementation evidence proves the three columns cannot remain usable at that size. The planned renderer proportions are approximately `190px / minmax(0, 1fr) / 220px`.
3. Add a compact Feature search field above the navigation. It performs a real renderer-local, case-insensitive filter over already loaded localized Feature name, category, and description; it hides empty category groups and shows a truthful no-results state. It never changes the current selection while typing: when the selected Feature does not match, a compact localized `Current` group retains that real row without duplicating matching rows. It creates no IPC, registry, persistence, remote lookup, or command-palette shortcut.
4. The filtered navigation keeps one flat Feature list. Do not add tabs, accordions, drill-down, a feature tree, or “show more” behavior.
5. Put `Clackly Settings` in a footer separated from the searchable Feature list. It remains visible while filtering and is an application-domain destination, never a FeatureCatalog record and never a synthetic capability.

### Center configuration

6. When a Feature is selected, show a compact Feature title and schema-driven configuration only. Remove the duplicated Feature description, lifecycle summary, metadata, and Interaction Help from the center.
7. Preserve `SettingsRenderer`, Feature metadata/configSchema authority, ConfigManager IPC, drafts, path picking, Save, Reset, busy state, feedback live regions, and status refresh after save/reset.
8. Keep Reset and Save in the center configuration action strip. A Feature with no schema truthfully shows that no settings are required and does not invent controls.
9. When `Clackly Settings` is selected, show application-level settings in the center. The existing Language preference remains owned by Preferences/LocalizationService and continues its current immediate-save behavior; it does not enter ConfigManager or FeatureCatalog.

### Context Inspector

10. Under Feature context, render three mostly read-only sections:
   - **About:** the selected Feature description plus meaningful existing metadata such as version and providers.
   - **Status:** one derived effective status—Ready, Disabled, Needs Setup, Unavailable, or the truthful loading equivalent. Do not separately list Installed, Enabled, and Readiness. Show a short reason only outside Ready, preferring a concise usable status-record message and otherwise a localized renderer fallback. Keep Refresh and Enable/Disable as visibly available bordered secondary lifecycle actions with monochrome Refresh and Power icons; retain the label `Refresh`.
   - **Interaction:** project the selected Feature's presentable Commands and their real binding rows from the current command/binding authority. Reuse the Interaction Panel's keycap-plus-action grammar and support the existing Click, right-click, Ctrl, Shift, and Alt projection without hand-authored shortcut copy.
11. Effective status is a renderer presentation derived from the unchanged FeatureStatusManager record. It must not change runtime probing, persistence, enable behavior, or status vocabulary at the authority boundary.
12. Add one small semantic green indicator beside the effective `Ready` label. It is backed by the real ready record, scoped to the Inspector status indicator, and does not color the surrounding section, action buttons, navigation, or editable controls. Other effective states use the existing restrained neutral/warning/error language.
13. Under application context, switch the inspector to read-only About Clackly information. The application version comes from the existing package metadata; do not create a Settings registry/provider abstraction. Feature About presents existing version/providers metadata with a small deterministic renderer-only display formatting step when raw provider ids would not read naturally.

### Visual and compatibility requirements

14. Preserve the current square, fully painted Settings shell and compact custom titlebar contract. The titlebar contains only a localized, legible `Settings` label plus the existing drag and close behavior: it renders no Clackly logo or wordmark, large logo treatment, or reference-image window controls.
15. Use the current Palette/Interaction paint primitives: neutral `#151619` surfaces, restrained separators, compact spacing, HarmonyOS Sans roles, monochrome Lucide icons, current field/control/keycap radii, and light-neutral emphasis with dark foreground. Selection, focus, pin indicators, and the primary Save action belong to this light-neutral emphasis system. The Ready dot is the only new semantic success-green primitive.
16. Orange is no longer Clackly's primary interaction accent. Remove it from shared focus, pin, checkbox, selection, and primary-action roles. If orange remains for an exceptional warning, expose it as a separate semantic warning token rather than as `accent`; project-owned logo artwork is a brand asset and remains outside this task.
17. Do not introduce orange selected rows, orange-heavy controls, framed status cards, oversized cards, hero icons, decorative headers, glass, gradients, SaaS-dashboard styling, large whitespace, or authored reveal/hide motion.
18. Preserve localization, accessible names, keyboard focus visibility, warning indicators/tooltips, loading/search-empty/error states, long Windows paths, and bounded scrolling in each column. The Inspector aside is localized as `Context Inspector`; failed config load, Save, Reset, Refresh, Enable/Disable, and locale changes use operation-specific localized recovery feedback while preserving known structured error presentation.
19. Browser Settings fixtures and screenshots remain isolated renderer-paint evidence. They do not validate native Electron/Resolve focus, transparency, taskbar, or lifecycle behavior.

## Acceptance Criteria

- [ ] Settings renders a stable three-column Navigation / Configuration / Context Inspector layout at `760x560`, with independent bounded scrolling and no clipped primary actions.
- [ ] The navigation search is a real localized client-side Feature filter, hides empty categories, has an accessible no-results state, and does not expose a fake shortcut or require new IPC/domain authority.
- [ ] A filtered-out selected Feature remains in a compact localized Current group, without duplicate matching rows or search-driven selection changes.
- [ ] Feature navigation remains category-grouped and flat; `Clackly Settings` is isolated in the navigation footer and absent from FeatureCatalog/capability data.
- [ ] Feature center content contains a compact title, schema-driven fields, feedback, Reset, and Save, without duplicated description, lifecycle table, metadata, or Interaction Help.
- [ ] Application center content contains Language and other existing application preferences only; it does not call Feature config/status APIs.
- [ ] Feature inspector About uses existing Feature metadata, including version/providers where present.
- [ ] Feature inspector Status shows one effective label and only abnormal reason text; Refresh and Enable/Disable preserve current behavior and `Refresh` naming.
- [ ] The Inspector shows a small green dot only when the real effective status is Ready; it does not become a generic decorative accent or imply readiness for other states.
- [ ] Feature inspector Interaction rows derive from existing registered Commands and `listInteractionBindings()` data through the existing interaction projection, with no duplicate handwritten binding map.
- [ ] Application inspector displays read-only About Clackly context and package-owned version information.
- [ ] Settings titlebar contains only the localized Settings title and the existing close/drag behavior; it contains no Clackly wordmark.
- [ ] Navigation selection, controls, keycaps, typography, density, borders, and surfaces visibly match the current Palette/Interaction language; no legacy orange-heavy or card-heavy drift appears.
- [ ] Save, focus rings, checkbox accent, and Palette/Settings pin or primary emphasis use the light-neutral emphasis token; orange is absent from primary interaction roles and, if retained, is named and scoped only as warning semantics.
- [ ] Existing window construction, singleton selection, config save/reset, path picker, language preference, feature enable, status refresh, localization, and feedback behaviors have focused regression coverage and pass.
- [ ] Updated browser evidence covers application/empty, typical ready, missing configuration with long path, Simplified Chinese with multiple interactions, busy, error, and reduced-motion states in one bounded pass plus at most one correction and one confirmation pass.
- [ ] Focused tests, full `npm test`, `npm run build`, `npm run settings:evidence`, detector/diff checks, and `npm run workflow:install` pass before asking the user to restart Resolve for manual native acceptance.
- [ ] `DESIGN.md`, its `.impeccable/design.json` sidecar, and the active frontend quality spec no longer claim that Settings must remain two-pane; they record the three-column projection while preserving the native window and authority boundaries.

## Out of Scope

- Changing Feature metadata/configSchema, ConfigManager, Preferences storage format, FeatureStatusManager probing, InteractionManager/BindingStorage, command execution, or Resolve capability behavior.
- Adding a new Settings registry/provider, FeatureCatalog entry for Clackly, binding editor, shortcut editor, dependency installer, update checker, or “Check for Updates” action.
- Adding fuzzy/ranked/remote search, search persistence, a global search shortcut, multilevel trees, “Show More,” responsive/mobile Settings behavior, new application preferences, or a resizable/maximizable window.
- Changing Palette D6/D7 geometry, lifecycle, content behavior, or native host policy. Shared renderer emphasis-token convergence is in scope, but no Palette topology or behavior change is permitted.
- Treating browser evidence as native Resolve acceptance or creating/modifying Resolve projects.

## Risks and deferred items

- Three columns make the fixed `760px` width denser. The plan protects the center with a flexible column, compact `190px` navigation, `220px` inspector, independent scrolling, and long-path evidence rather than widening the native window without evidence.
- Repointing the shared renderer accent affects Palette focus and pin paint as well as Settings. Bounded Palette visual evidence is required even though Palette behavior and layout remain unchanged.
- A Feature may own multiple presentable Commands. The inspector will preserve command grouping while deriving every row from the existing binding projection; it will not pretend the Feature itself is a Command.
- Current bindings are mouse-trigger records with modifier support. Keyboard-only binding design remains outside this task; future interaction types should extend the existing authority before Settings presents them.
