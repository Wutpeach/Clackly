# Iterate Settings visual style

## Goal

Bring the existing Settings window into the same restrained, dense, precision-instrument visual language as the current Palette and Interaction Information Panel, without changing what Settings does or how configuration data flows.

## Confirmed Facts

- Settings is an existing `760x560` Electron surface implemented by `SettingsApp.jsx`, `SettingsRenderer.jsx`, and the Settings section of `styles.css`.
- Its current two-pane feature navigation, feature detail, lifecycle controls, schema-driven fields, Interaction Help, loading/empty/error states, and Save/Reset behavior are functional product structure, not placeholder content.
- Root `DESIGN.md` is the current visual authority. Settings remains a separate fully painted square window and must not inherit the Palette's D6/D7 native-window lifecycle or detached-panel behavior.
- The current Settings paint introduces its own opaque hover, accent-tinted selection, large icon tile, heavier shadows, and local type/spacing values; these are the primary visual consistency gaps.
- The existing two-pane layout is structurally sound at `760x560`: the sidebar and detail areas scroll independently, primary actions remain visible, and realistic long paths/help content fit without a known clipping defect.
- Root `.impeccable/design.json` explicitly authorizes the existing Settings ambient shell and titlebar shadows. Those shadows are not visual drift; the undocumented tile/tooltip neutrals, opaque hover, typography, icon scale, raised footer, and local spacing values are.
- The shipped surface includes a pinned General/Language pane plus capability panes, localized English and Simplified Chinese content, lifecycle readiness/warnings, schema-driven controls, Interaction Help, and a fixed action footer.
- The repository currently contains another unrelated planning task. This task must remain independently reviewable and must not absorb or revert that work.

## Requirements

- Preserve all Settings capabilities, labels, configuration schemas, IPC contracts, keyboard access, focus behavior, and window lifecycle.
- Retain the established Clackly palette: near-black neutral surfaces, faint borders, compact HarmonyOS Sans typography, restrained orange signaling, and Lucide icon vocabulary.
- Establish a Settings-specific hierarchy that feels related to the Palette without copying the Palette's fixed `240x320` composition, light-neutral command selection, or D6/D7 native treatment.
- Reduce bespoke visual rules by expressing reusable Settings colors, spacing, sizing, type, focus, selection, and control treatments through coherent tokens or shared variables.
- Preserve the current two-pane feature-navigation/detail information architecture unless the user explicitly chooses a broader interaction redesign during planning.
- Use a restrained Settings selection idiom: orange may identify the selected destination through a narrow signal and soft wash, while interface icons remain monochrome and text contrast carries the hierarchy.
- Normalize Settings typography to the documented title/section/label/body/meta/status roles, including explicit sizing for sidebar and empty-state copy instead of browser defaults.
- Reduce the detail icon treatment to the shared compact icon vocabulary, render Interaction Help inputs with the established keycap/chip language, and keep the primary Save action as the strongest orange control.
- Keep the authorized Settings shell/titlebar elevation, but replace the raised action-footer effect and ad hoc control inset shadows with the quieter border-and-tonal separation used elsewhere in Clackly.
- Keep dense professional scanability at the shipped `760x560` size, including realistic long feature names, warnings, paths, missing-dependency text, and validation/error feedback.
- Cover loading, no-features, selected feature, disabled/busy, warning, error, success, long-content, and reduced-motion states.
- Exercise minimum, typical, and maximum realistic data: General with no capabilities; three shipped capability categories; required After Effects path and prefix; missing-configuration details; long Windows paths; Simplified Chinese copy; and the shipped multi-row interaction mappings.
- Produce bounded visual evidence from the browser-renderable Settings surface or equivalent test harness; do not treat browser evidence as native Electron/Resolve acceptance.

## Acceptance Criteria

- [ ] At `760x560`, the Settings titlebar, feature navigation, detail header, status area, fields, Interaction Help, and action footer read as one coherent Clackly surface with no clipped primary actions or accidental overflow.
- [ ] Feature selection, hover, focus, warning, disabled, and primary/secondary action states follow one documented Settings visual grammar and use orange only as a restrained signal.
- [ ] Sidebar labels no longer inherit the browser's default `16px` size; headings, fields, help rows, status copy, and empty states map consistently to the documented typography roles.
- [ ] Settings interface icons remain monochrome and use a compact optical slot; the detail header no longer reads as a large accent-colored tile.
- [ ] Interaction Help input labels use the same compact keycap/chip vocabulary as Interaction Information while remaining noninteractive help content.
- [ ] Settings typography, icon sizing, neutral surfaces, borders, radii, and elevation visibly align with the current root `DESIGN.md` while preserving the square Settings shell.
- [ ] Existing Settings behaviors and data contracts remain unchanged and their focused automated tests pass.
- [ ] Loading, empty, error, success, busy, long-content, and reduced-motion states remain legible and keyboard accessible.
- [ ] A bounded screenshot review is completed at the shipped Settings size, with at most one batched correction pass and one confirmation pass.
- [ ] Visual evidence covers General/empty, typical ready, missing-config with a long path, Simplified Chinese with multi-row help, busy, error, and reduced-motion variants.
- [ ] The implementation changes only task-owned Settings presentation files and any directly necessary tests/preview fixtures; unrelated dirty work remains untouched.

## Out of Scope

- Changing feature registration, configuration schemas, Resolve capabilities, IPC payloads, persistence, or command execution.
- Making Settings a Palette-attached panel or applying the Windows D6/D7 native dual-window lifecycle.
- Redesigning the main Palette, Interaction Information content, product logo, or root visual identity.
- Adding new settings, preferences, onboarding, search, navigation destinations, or factual product claims.
- Shipping authored window reveal/hide motion.

## Open Product Decision

- Decide whether this iteration preserves the current two-pane information architecture and refines its visual hierarchy, or materially restructures Settings into a different navigation/composition model.

## Notes

- Keep `prd.md` focused on requirements, constraints, and acceptance criteria.
- Lightweight tasks can remain PRD-only.
- For complex tasks, add `design.md` for technical design and `implement.md` for execution planning before `task.py start`.
