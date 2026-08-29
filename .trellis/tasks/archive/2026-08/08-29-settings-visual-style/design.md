# Settings Visual Alignment Design

## Scope and Authority

This task refines the existing Settings surface in `Operate` mode. Root `DESIGN.md` owns the visual world; current shipped Palette and Interaction Information implementation is the visual authority for Settings paint. Settings keeps only its native window/behavioral independence and does not keep a separate legacy Settings visual theme.

The visible composition remains:

1. Existing custom titlebar.
2. Existing `220px` left navigation containing General and grouped features.
3. Existing right detail workspace with independent vertical scroll.
4. Existing fixed action footer for feedback, Reset, and Save.

The native Settings BrowserWindow remains `760x560`, non-resizable, rectangular, and lifecycle-independent from Palette D6/D7. That distinction applies to window construction, geometry, focus/taskbar behavior, and lifecycle—not the rendered visual language.

## Component Boundaries

- `SettingsApp.jsx` continues to own data loading, selection, General/feature branching, lifecycle actions, feedback, and composition.
- `SettingsRenderer.jsx` continues to project schema fields and must not gain domain knowledge.
- Settings-owned `styles.css` rules own the new visual tokens and paint.
- `browserPreview.mjs` may expose isolated local Settings fixtures only when a hostless Settings preview query explicitly requests them. The fixtures cannot import registry, IPC, preload, Resolve, persistence, or executable command authority.
- Existing main-process window helpers and preload contracts remain unchanged.

## Visual Token Strategy

Add a small `--settings-*` projection layer from the shipped Palette/Interaction primitives rather than creating or preserving a second Settings color system. The layer should cover:

- Navigation width/row height and detail padding.
- Title, section, body, label, status, metadata, and keycap typography roles.
- Compact icon slots and status-indicator sizing.
- Navigation hover, selected signal, field/control fill, borders, and focus ring.
- Footer height, hairline boundary, and feedback spacing.

The layer uses `#151619` continuous ink, `rgba(255,255,255,0.052)` hover, `#E7E8EA` / `#17191D` selection, Palette inset control fill, weak Palette hairlines, `30px` row rhythm, `3–4px` radii, and Interaction keycaps. Undocumented `--color-tile`, `--color-tile-hover`, and `--color-tooltip` must not remain Settings authorities.

## Navigation and Selection

The sidebar markup and selection behavior stay unchanged. Visual states become:

- Rest: transparent row, secondary text, monochrome `16px` icon.
- Hover: shared `rgba(255,255,255,0.052)` neutral hover over the continuous ink surface.
- Selected: the exact Palette anchor: `#E7E8EA` background, `#17191D` label and icon, `3px` radius, no orange wash and no location rail.
- Warning/loading: compact status indicator remains distinct from selection and retains accessible tooltip behavior.
- Focus: one consistent accent outline/focus ring that does not change layout.

Sidebar labels receive an explicit label role instead of browser-default font sizing. Category headings use the metadata/caption hierarchy.

## Detail Hierarchy

The detail header keeps category plus title but removes the large bordered accent icon tile. A compact `14–16px` monochrome icon aligns with the title block and does not become a decorative card. The header uses compact spacing and a weak hairline, not a large app-settings hero.

Typography compresses the former app-settings hierarchy into the shipped operational scale:

- Detail title: `16px`, weight `600`.
- Section title: `14px`, weight `600`.
- Body/description: `13px`, weight `400`, compact readable line height.
- Navigation and field labels: `13px`, weight `500`.
- Status/help: `12px`, weight `400`.
- Metadata: `11px`, weight `400`.
- Keycaps/captions: `10px`, weight `600`.

Lifecycle information remains grouped but reads as a compact flat instrument readout with hairline separation, not a raised or framed status card. Settings fields retain native semantic controls, use Palette inset fill, `30–34px` height, `3–4px` radius, visible focus, and existing disabled/required behavior. Actual editable settings remain the primary scan path.

## Interaction Help

Interaction Help keeps the existing command grouping and descriptions. Input labels become read-only keycap/chip primitives matching the Interaction Information vocabulary. They are not buttons, selectable rows, or executable mappings.

## Footer and Feedback

The action footer remains fixed and keeps feedback, Reset, and Save in their current order. It is a compact continuous-ink action strip with one weak top hairline—not a `60px` app footer or a raised card. Save remains the sole orange filled action; secondary controls remain neutral. Busy, disabled, success, neutral, and error feedback must remain localized and accessible through the existing live-region semantics.

## States and Content Ranges

The visual system must cover:

- Loading and General with zero visible features.
- Typical three-category feature catalog.
- Empty-schema capability and configured feature.
- Missing configuration/dependency and disabled/unavailable states.
- Long Windows paths, mixed control types, multi-row Interaction Help.
- English and Simplified Chinese.
- Busy, success, error, and reduced-motion environments.

No state may introduce a new layout topology or hide the fixed actions.

## Preview and Evidence Contract

Create a browser-only Settings fixture switch that returns cloned local feature/status/config/binding data for explicit preview scenarios. It must default to the current hostless behavior when no fixture is requested.

Evidence captures use the shipped `760x560` viewport and cover the acceptance-state matrix in one batched pass. The fixture must be unit-tested for isolation and non-executability. Screenshots prove renderer paint only.

## Compatibility and Rollback

- No migration is required because no persisted data or IPC changes.
- Existing native window construction tests remain authoritative and should not change unless a CSS paint assertion intentionally tracks the new visual rule.
- The visual change can be rolled back by reverting Settings JSX/CSS/fixture/test changes without touching config or host code.
- Any Palette or Interaction Panel visual/lifecycle regression is outside the task and blocks the change.
