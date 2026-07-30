# Polish launcher visual details

## Goal

Refine the existing `376×468` Clackly launcher so its main screen has the precise, compact hardware-panel quality shown in the user-provided reference: tighter controlled corners, layered card borders and shadows, optically balanced card icons and labels, a purpose-drawn CLACKLY SVG wordmark, and a more deliberate inset bottom toolbar. Preserve Clackly's current keyboard-first behavior, fixed footprint, command data, and restrained orange accent.

## Background and Confirmed Facts

- The current launcher is implemented in `resolve-command-center/electron/renderer/App.jsx` and `styles.css`.
- The launcher already uses a fixed `376×468` preview footprint, a `3×3` square grid, custom Clackly SVG branding, and Lucide line icons.
- Current tiles use one flat background, one subtle border, an `8px` radius, and a selected orange border/glow (`styles.css:170`).
- The current footer is a full-width grid row with a top border, a labeled All Actions button, search prompt, shortcut, and brand mark (`App.jsx:448`, `styles.css:272`).
- The current `clackly-logo.svg` is an SVG wrapper around a font-dependent `<text>` element rather than a purpose-drawn vector wordmark; its appearance changes with font availability and does not match the reference's geometric lettering.
- Current card labels are left-aligned while the reference centers icon and label as one command unit (`styles.css:209`, `styles.css:219`).
- The reference image shows an industrial dark control surface: shallow corners, layered outer/inner strokes, restrained recessed shadows, orange hairline selection, and an inset toolbar with icon-led zones and separators.
- The preceding redesign explicitly keeps Launcher, Search, and All Actions at the same `376×468` size and excludes a dedicated History control; this polish must not silently reverse those decisions.
- No stored Impeccable critique snapshot exists for this target, so the user-provided reference and current rendered implementation are the visual evidence for this task.

## Requirements

### R1 — Scope and Preservation

- Polish the Launcher main screen only; Search and All Actions may receive shared token changes only when required for visual consistency.
- Preserve launcher dimensions, `3×3` layout, command ranking, keyboard selection, execution, pinning, Escape behavior, accessibility labels, and Electron/Resolve IPC behavior.
- Keep the existing Clackly visual world and orange accent; this is refinement, not a redesign.

### R2 — Window and Corner Treatment

- Make the outer shell read as a compact professional floating instrument through a crisp outer edge, subtle inner highlight, and controlled ambient shadow.
- Keep corners small and professional. Any radius adjustment must remain below the existing `16px+` prohibition and must not create a consumer-app silhouette.
- Avoid glassmorphism, large blur, strong gradients, or decorative glow.

### R3 — Command Card Surface

- Give each command tile a layered surface comparable to the reference: dark tonal face, precise outer hairline, restrained inner highlight, and a shallow dark separation shadow.
- Default, hover, selected, unavailable, keyboard focus, and pressed states must remain distinct without filling tiles orange.
- Selected tiles use a crisp orange hairline plus dark/neutral separation so the orange edge does not visually bleed into neighboring tiles.
- Preserve square geometry, label legibility, two-line limit, and consistent icon optical weight.

### R4 — Card Icon and Label Composition

- Rebalance each card's internal hierarchy so the icon and label read as one centered command unit, matching the reference's control-surface composition.
- Keep functional icons in the existing Lucide family, but tune optical size, stroke contrast, vertical position, and selected-state color so icons remain crisp on the layered surface.
- Center command labels horizontally, retain a maximum of two lines, and tune weight, line height, width, and spacing for compact professional readability.
- Preserve the existing shortcut/pin metadata and unavailable-state semantics; visual polish must not invent new shortcut numbering or command metadata.

### R5 — CLACKLY Wordmark

- Replace the current font-dependent `<text>` implementation inside `clackly-logo.svg` with purpose-drawn SVG geometry/path shapes.
- The wordmark must reproduce the reference direction: widely tracked geometric uppercase letters, restrained light-gray/white strokes or fills, and an orange open-chevron `A` accent.
- Add the reference's slim orange vertical signal at the left edge of the header brand area as a separate header accent, keeping the reusable wordmark SVG focused on the CLACKLY letterforms.
- The logo must not depend on Inter, Segoe UI, system font rendering, or SVG `<text>` elements.
- Preserve a compact `110–130px` by approximately `20px` header footprint, crisp Electron/Retina scaling, and the existing accessible `alt="Clackly"` behavior.
- Keep the logo as a project-owned asset; do not replace it with a Lucide icon or add an external font/asset dependency.

### R6 — Bottom Toolbar

- Restyle the footer as an inset control strip with clear left, center, and right zones, compact icon alignment, subtle internal separators, and the same restrained depth language as the cards.
- The center search affordance must remain the dominant entry point and continue to work by click and keyboard typing.
- The All Actions entry must remain discoverable and keyboard accessible.
- Preserve the existing All Actions and search semantics. Do not add the reference image's Star or Clock/History controls.

### R7 — Tokens and Maintainability

- Reuse current CSS and component structure wherever possible; do not add a dependency or new abstraction for this polish.
- Promote repeated border, inset-highlight, and shadow values to the existing CSS token block only when reused across multiple launcher elements.
- Keep motion within the existing `80–120ms` interaction range and honor `prefers-reduced-motion`.

### R8 — Adjacent Codex Stop Hook Fix

- Fix the Impeccable Stop hook failure discovered while completing this task: Codex must receive valid JSON whenever the hook exits with code `0`.
- Clean, skipped, re-entrant, and recovered Codex Stop paths return `{"continue":true}`.
- Fresh detector findings use the Codex-supported continuation shape `{"decision":"block","reason":"..."}`.
- Preserve Claude, Cursor, GitHub Copilot, and non-Stop/PostToolUse payload behavior.
- Leave the registered `.codex/hooks.json` command unchanged; fix the shared skill implementation and add a focused regression test.

## Acceptance Criteria

- [ ] At `376×468`, the launcher remains unclipped and the complete header, `3×3` grid, and bottom toolbar fit without scrollbars.
- [ ] Window and tile corners visually match the reference's small, controlled industrial character rather than rounded consumer cards.
- [ ] Resting tiles visibly separate through layered hairlines and shallow depth; no large resting glow is present.
- [ ] Hover, keyboard-selected, pressed, unavailable, and focus-visible tile states are visually distinguishable and meet the existing keyboard workflow.
- [ ] Selected tiles use a crisp restrained orange edge without full-orange fill or excessive halo.
- [ ] Card icons are optically centered, consistent in stroke/visual weight, and clearly separated from the labels across default and selected states.
- [ ] One- and two-line command labels are centered, compact, legible, and do not overflow their square cards.
- [ ] `clackly-logo.svg` contains purpose-drawn vector geometry with no `<text>` element or runtime font dependency, and visually matches the reference's geometric wordmark direction.
- [ ] The header brand area includes the reference's slim orange vertical signal without reducing drag behavior or crowding the wordmark.
- [ ] The bottom toolbar reads as one inset instrument strip with clear zones and separators, while preserving approved Clackly functionality.
- [ ] Launcher interactions, command execution boundaries, Search transition, All Actions transition, and accessibility semantics do not regress.
- [ ] Existing renderer tests and production build pass; the launcher receives a visual review against the supplied reference at its real fixed size.
- [ ] A clean Codex Stop subprocess exits `0` with parseable continuation JSON instead of empty stdout.
- [ ] Focused hook tests cover clean Codex Stop, findings continuation, and unchanged provider/PostToolUse payloads.

## Out of Scope

- Changing Search or All Actions information architecture.
- Changing the `376×468` window size or the `3×3` command layout.
- Adding Resolve commands, persistence, settings behavior, or new dependencies.
- Replacing the Lucide functional icon family, changing command copy, or changing the orange brand color.
- Adding decorative effects that are not present in the reference's restrained professional surface treatment.

## Key Decisions

- The reference image is a visual-quality target, not a request to copy its command set or toolbar features.
- The bottom toolbar will adopt the reference's inset strip, zones, separators, icon proportions, and restrained depth while retaining only Clackly's current All Actions and search functionality.
- No Star, Favorites, Clock, or dedicated History button will be introduced; recent usage remains a ranking signal.
- The existing font-based SVG wordmark is not sufficient; implementation must replace its `<text>` node with bespoke vector geometry while keeping the same asset path and accessible image usage.
- Card icon and label alignment are part of the polish scope, not incidental cleanup.
- The Stop hook error was an output-contract defect, not a launcher failure. The fix belongs in the project-local Impeccable skill and is committed separately from the visual polish.
- This is a lightweight renderer polish task. It does not require architecture changes, new dependencies, or separate `design.md` / `implement.md` artifacts.
