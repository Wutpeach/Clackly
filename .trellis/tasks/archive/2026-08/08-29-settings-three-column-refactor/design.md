# Settings three-column technical design

## 1. Scope and visual authority

This is an Operate-mode refactor of the existing native Settings renderer. The supplied reference contributes topology, column proportions, content organization, and evidence that primary emphasis is now light-neutral. The shipped Palette selection hierarchy, Interaction Panel content, and shared neutral surfaces remain paint authority; stale orange-accent prose/tokens do not.

Two authority conflicts are explicit: `DESIGN.md` and its `.impeccable/design.json` sidecar still preserve two-pane geometry and still call orange the primary accent. The user has now confirmed three columns and a light-neutral emphasis system. Implementation updates both contracts, keeps the sidecar synchronized through the repository's design tooling, and retains the established `760x560` square native window, singleton lifecycle, and current neutral surface primitives.

## 2. Layout topology

The existing titlebar spans the window. The workspace becomes:

```text
Settings titlebar
┌──────────────────┬──────────────────────────────┬──────────────────────┐
│ Feature search   │ compact title + schema form  │ ABOUT                │
│ grouped Features │                              │ STATUS               │
│                  │                              │ INTERACTION          │
│──────────────────│──────────────────────────────│                      │
│ Clackly Settings │ feedback       Reset   Save  │                      │
└──────────────────┴──────────────────────────────┴──────────────────────┘
```

- Workspace grid: approximately `190px minmax(0, 1fr) 220px` within the existing `760px` shell.
- Navigation uses `grid-template-rows: auto minmax(0,1fr) auto`; the compact search field stays above the scrollable filtered Feature list, while the application footer remains fixed.
- Configuration uses `grid-template-rows: minmax(0,1fr) 34px`; only its body scrolls and its feedback/actions remain fixed.
- Inspector has its own vertical scroll and left hairline. Sections are flat and hairline-separated, not cards.
- No responsive alternate topology is added because the native window is fixed and non-resizable.

## 3. Selection and domain boundary

Replace the mixed synthetic `selectedId === "general"` model with a nullable Feature selection:

- `selectedFeatureId === null` -> application context (`Clackly Settings`).
- `selectedFeatureId: string` -> Feature context resolved only from the visible FeatureCatalog projection.

The left footer selects `null`. `onSettingsFeatureSelected(featureId)` continues to accept a real Feature id from the host. When that id is no longer visible, selection returns to application context. No application record is added to FeatureCatalog, CapabilityRegistry, command metadata, status records, or config schemas.

Application context uses only `LocalizationContext`/Preferences for editable locale state and package metadata for read-only name/version. Feature context alone invokes `getConfig`, `saveConfig`, `resetConfig`, `refreshFeatureStatuses(featureId)`, and `setFeatureEnabled(featureId, enabled)`.

Search is renderer-local presentation state. A normalized query filters the already localized visible Feature array by localized `name`, `category`, and `description`; grouping happens after filtering so empty categories disappear. An empty query restores the full list. A no-match result renders localized empty copy without changing the current selection or hiding the application footer. When the selected Feature is filtered out, the renderer prepends one compact localized `Current` group containing that same selected row; it is not a second catalog record, does not alter selection, and is omitted when the selected Feature already matches. The field has no displayed/global shortcut because no shortcut authority exists for it.

## 4. Feature configuration projection

Keep `SettingsRenderer` as the schema-driven form. `SettingsApp` continues to own saved/draft values, path picking, busy state, localized feedback, save/reset, and post-write status refresh.

The center feature body contains:

1. compact icon + localized Feature name,
2. one `Configuration` section,
3. the existing schema projection or truthful no-settings copy.

Description, metadata, lifecycle administration, and interaction rows move out of this body. Reset/Save stay in the center footer. The application context has no Feature Reset/Save controls because Language already persists through Preferences immediately.

## 5. Effective status projection

Add a pure renderer helper such as `getEffectiveFeatureStatus(status, t)` in `model.mjs`. It reads the unchanged FeatureStatusManager record and returns presentation-only `{ kind, label, reason }`:

| Authority record | Effective label | Abnormal reason |
| --- | --- | --- |
| missing/loading record | Checking | status-record message when usable, otherwise localized checking copy |
| `enabled === false` | Disabled | status-record message when usable, otherwise localized disabled explanation |
| `status === "ready"` | Ready | none |
| `missing-config` | Needs Setup | status-record message when usable, otherwise localized required-configuration explanation |
| `missing-dependency` | Needs Setup | status-record message when usable, otherwise localized missing-dependency explanation |
| `unavailable` or `error` | Unavailable | status-record message when usable, otherwise localized unavailable explanation |

`installed` is not displayed as a separate dimension. It remains an upstream visibility/authority field. Status refresh keeps the exact label `Refresh`; enable/disable continues to call the existing API. Their compact bordered secondary controls use the shared control height/radius/focus grammar and monochrome Refresh/Power Lucide icons, never the light-neutral primary treatment. No “Check for Updates” concept is introduced.

The effective `ready` row alone receives a small semantic green dot. The dot is conditional on the real derived Ready state and is the only new success-green token; status text, section surfaces, lifecycle actions, navigation, and fields remain in the established neutral/light-emphasis system. Disabled, Needs Setup, Checking, and Unavailable use muted or separately named warning/error presentation without fabricating additional color semantics.

## 6. About and interaction projection

Feature About reads only localized Feature metadata already returned by FeatureCatalog: description, version, and nonempty providers. Provider ids receive only a deterministic renderer display transform (for example `resolve-api` to `Resolve API`); no provider registry or metadata mutation is added. Application About reads product name, localized product description, and package version.

Feature Interaction reuses `getInteractionHelpCommands(localizedCommands, selectedFeatureId, bindings, t)`. Its rows therefore continue to come from registered Command metadata plus normalized InteractionManager bindings and reuse `getInteractionHelp()` for mouse/modifier labels and action names. The inspector may group rows under a Command name when a Feature owns multiple presentable Commands. Empty real binding results show a truthful localized empty copy.

The keycap renderer and CSS use the same `label.split(" + ")`, `kbd`, plus-sign, border, fill, radius, and type grammar as `InteractionPanelContent`. They remain read-only and non-executable.

## 7. Visual token projection

Retain the current Settings token layer and reshape it rather than creating new palette values:

- continuous `#151619` surfaces with column hairlines,
- `30px` navigation rows and light-neutral selection,
- compact `16px` Lucide icons,
- `30px` controls with current `4px` field radius,
- Interaction keycaps with current `4px` radius,
- compact `16/14/13/12/11/10px` type roles,
- shared primary emphasis is the existing light neutral (`#E7E8EA` with `#17191D` foreground), used for selected rows, primary Save, focus, checkbox accent, and pin indication;
- orange is removed from `accent` and may survive only under a separately named warning semantic where an actual warning needs it;
- no cards, hero header, broad green success system, reference-image control chrome, or new animation.
- one narrowly scoped semantic Ready dot rather than a general green success system.

The existing compact titlebar remains a continuous ink strip, but it contains only the localized `Settings` title and the existing close affordance. Settings does not render the project wordmark or logo; this keeps the dense window operational while leaving Palette and project-owned brand assets unchanged.

## 8. Localization and accessibility

Add English and Simplified Chinese strings for `Clackly Settings`, Current, Context Inspector, About, Status, Interaction, provider/version labels, effective-status reasons, operation-specific recovery feedback, and application description. Preserve focus-visible outlines, `aria-current`, button labels, live-region feedback, semantic headings, and read-only list semantics.

Each column owns bounded scrolling. Long descriptions, providers, reasons, paths, and translated labels may wrap; navigation row labels remain one line and truncate. Primary center actions remain visible.

## 9. Browser evidence and compatibility

Update isolated Settings fixtures so application context replaces the old General fixture and Feature scenarios still exercise ready, missing-config, multi-interaction, busy, error, and reduced-motion states. Update `palette-evidence.mjs` Settings selectors and assertions for the three regions, one effective status, real keycaps, and absence of old lifecycle dimensions.

Because the shared renderer accent token changes, capture the bounded Palette visual scenario set as well and confirm that focus, selection, and pin remain readable without geometry, behavior, or lifecycle changes.

Browser screenshots prove renderer paint only. Existing `window.test.js` remains the authority for `760x560`, transparent, frameless, non-resizable, singleton show/focus, close, and host feature-selection behavior.

## 10. Rollback

The refactor has no persisted-data migration and no authority-schema change. Rollback is a revert of renderer composition/styles/localization/fixtures/tests plus the structural docs. Config, Preferences, Feature status, bindings, IPC, and native window data remain compatible throughout.
