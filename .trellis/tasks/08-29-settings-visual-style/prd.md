# Align Settings Visual Style

## Goal

Make the existing Settings window visibly belong to Clackly's current precision-instrument design system while preserving its information architecture, behavior, and native window contract. Users should recognize the same restrained dark surfaces, compact hierarchy, monochrome icon language, and deliberate orange signaling used by the Palette and Interaction Information Panel.

## Background

- Settings is a fixed, non-resizable `760x560` Electron surface implemented by `SettingsApp.jsx`, `SettingsRenderer.jsx`, and Settings-owned rules in `styles.css`.
- Its left feature navigation, right detail workspace, pinned General/Language destination, lifecycle controls, schema-driven fields, Interaction Help, localized content, and fixed Save/Reset footer are working product structure.
- Root `DESIGN.md` and `.impeccable/design.json` are the current visual authority. Settings remains a separate, fully painted square window and must not inherit Palette D6/D7 native-window behavior.
- The current visual drift is concentrated in undocumented opaque tile/tooltip tones, accent-colored selected icons, inconsistent typography, a large detail icon tile, repeated local measurements, raised footer depth, and Interaction Help labels that do not use the established keycap vocabulary.
- The existing Settings ambient shell and titlebar shadows are explicitly authorized design tokens and are not drift.
- On 2026-08-29 the user considered structural redesign, rejected the proposed structures, and explicitly chose to defer information-architecture changes in favor of visual alignment only.

## Corrected Visual Authority (2026-08-29)

The first paint pass is rejected. Current shipped Palette and Interaction Information content—not the old Settings sample in `DESIGN.md` or its sidecar—are the visual authority. Settings remains independently native only in window behavior and geometry. Its rendered surface must use the same continuous ink, compact operational rhythm, light-neutral selection, weak hairlines, inset controls, keycaps, and quiet footer. This supersedes the former orange-wash/left-rail Settings selection direction and any legacy gradient-titlebar, framed-status-card, or tall app-footer direction.

## Requirements

1. Preserve the current two-pane navigation/detail topology, `760x560` window size, General destination, host-driven feature selection, independent scrolling, and fixed action footer.
2. Preserve all feature IDs, capabilities, configuration schemas, IPC contracts, persistence, lifecycle actions, labels, localization behavior, keyboard access, focus behavior, and Settings window lifecycle.
3. Introduce a coherent Settings token layer that projects the shipped Palette/Interaction Panel grammar for navigation, spacing, typography, icons, inset controls, focus, selection, footer, and feedback instead of renaming the legacy Settings paint.
4. Retain Clackly's established continuous `#151619` ink surface, faint hairlines, HarmonyOS Sans type, Lucide icons, compact `30px` row rhythm, `3–4px` operational radii, and restrained elevation.
5. Use orange only for focus, essential warnings/errors, and the primary Save action. Navigation selection is exactly the Palette anchor: `#E7E8EA` background, `#17191D` foreground, and monochrome icon; it has no orange wash or location rail.
6. Map visible copy to the compact shared operating scale: `16/600` detail title, `14/600` section heading, `13/500` navigation/field label, `13/400` body, `12/400` status/help, `11/400` metadata, and `10/600` keycap/caption where those roles apply.
7. Replace the large accent detail icon tile with a compact `14–16px` monochrome icon treatment consistent with the shared optical icon vocabulary.
8. Render Interaction Help input labels as compact, read-only keycap/chip primitives while retaining existing descriptions and behavior.
9. Replace the legacy branded/gradient titlebar hierarchy, framed Feature Status card, loose detail spacing, heavy control stack, and tall app-like footer with continuous Palette-world paint. Preserve drag/close/native behavior while using compact titlebar, flat hairline-separated lifecycle readout, inset controls, and quiet action strip.
10. Preserve dense scanability and legibility for loading, no-features, General, ready, warning, missing-config, unavailable, disabled, busy, success, error, long-path, multi-help-row, English, Simplified Chinese, and reduced-motion states.
11. Add an isolated hostless Settings fixture/evidence path that can render realistic minimum, typical, and maximum states at `760x560` without importing registry, preload, IPC, Resolve, or execution authority.
12. Treat browser screenshots only as renderer-paint evidence. They cannot establish native Electron focus, transparency, DWM, taskbar, or Resolve behavior.

## Acceptance Criteria

- [ ] At `760x560`, titlebar, sidebar, detail header, lifecycle status, fields, Interaction Help, and footer visibly read as the same current-generation Palette/Interaction Panel surface with no clipped primary actions or accidental overflow.
- [ ] The two-pane topology, General/feature selection model, fixed footer, window geometry, and every existing Settings operation remain unchanged.
- [ ] Sidebar labels no longer inherit browser-default sizing; all Settings headings, labels, descriptions, status copy, help rows, and empty states map consistently to documented typography roles.
- [ ] Navigation rest/hover/selection exactly follows the Palette grammar: transparent rest, shared neutral hover, and `#E7E8EA` / `#17191D` selection with monochrome icon; orange does not mark a selected row.
- [ ] The detail header no longer presents a large accent-colored icon tile.
- [ ] Interaction Help input labels use the compact keycap/chip vocabulary while remaining read-only help content.
- [ ] The titlebar is a compact continuous ink strip rather than a gradient/branded app header; lifecycle status is not a framed card; fields and fixed action area use the shared inset/hairline grammar and no bespoke upward shadow.
- [ ] Reusable Settings colors, measurements, and state treatments are expressed through a coherent token set; dead Settings-only responsive or impossible-width rules are removed when proven unreachable.
- [ ] Existing focused Settings/window/model tests pass, and new tests cover the hostless Settings fixtures and any new presentation helpers or selectors.
- [ ] One bounded screenshot pass covers General/empty, typical ready, missing-config with a long Windows path, Simplified Chinese with multi-row help, busy, error, and reduced-motion states; one batched correction pass and one confirmation pass are the maximum.
- [ ] `npm test`, `npm run build`, task-relevant detector checks, and diff/boundary checks pass without launching Electron or Resolve.
- [ ] Only Settings presentation, isolated Settings preview/evidence, focused tests, and task artifacts change; unrelated work remains untouched.

## Out of Scope

- Restructuring navigation, replacing the two-pane layout, adding arrow-key navigation, search, tabs, accordion, drill-down, overlay, grid, or other new Settings interaction models.
- Changing feature registration, schemas, config values, missing-field semantics, lifecycle policy, Resolve capabilities, IPC payloads, persistence, or command execution.
- Changing the Palette, Interaction Information content or lifecycle, product logo, root brand identity, native Settings geometry, taskbar behavior, or D6/D7 host policy.
- Adding new settings, preferences, onboarding, destinations, claims, or authored window reveal/hide motion.
- Treating browser screenshots as native host acceptance.

## Risks and Deferred Items

- Icon-only rail, tab, accordion, drill-down, grid, and other structural concepts are explicitly deferred.
- The fixed window makes the existing `680px` media query unreachable and the current `520px` fields maximum wider than the effective detail column. Removing or correcting those rules is permitted only as Settings-owned cleanup with regression coverage.
- Browser fixtures must stay isolated from production capability and execution authority; fixture leakage is a blocking failure.
- A future large feature catalog may justify information-architecture work, but it is not part of this iteration.
