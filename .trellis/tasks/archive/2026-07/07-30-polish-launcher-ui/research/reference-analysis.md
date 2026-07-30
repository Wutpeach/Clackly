# Launcher reference analysis

## Evidence

- Source: user-provided launcher reference image in the 2026-07-30 planning conversation.
- Target: Clackly Launcher at its fixed `376×468` footprint.
- Existing implementation: `resolve-command-center/electron/renderer/App.jsx` and `styles.css`.

## Transferable visual traits

### Shell

- Compact rectangular silhouette with a small controlled radius.
- Dark outer edge, faint inner top highlight, and a soft ambient shadow outside the window.
- Tonal separation is subtle; the shell should not read as translucent glass.

### Cards

- Square cards with approximately half the visual corner softness of common consumer cards.
- Three-part edge treatment: dark outer separation, restrained light inner hairline, and shallow lower shadow.
- Card faces use a very mild center/top lift rather than a conspicuous gradient.
- Selected cards use a thin orange outline separated from the card face by a dark neutral line; the orange does not bloom across the surface.
- Resting cards retain depth without a visible floating drop shadow.
- Icons are the card's strongest internal signal: visually larger than metadata, near-white, optically centered, and consistent in line weight.
- Labels sit centered below the icon with compact leading; two-line labels remain a single centered block rather than left-aligned copy.

### Wordmark

- The reference uses bespoke geometric uppercase lettering with generous tracking rather than a standard typeset word.
- The `A` is an orange open chevron without a conventional crossbar; the remaining letters are restrained light gray/white.
- A narrow orange vertical signal sits at the far left of the brand area in the reference. Implement it as a header accent separate from the reusable wordmark asset.
- The current `clackly-logo.svg` uses `<text>` with a font stack, so it is not visually deterministic. Replace it with SVG paths/shapes and keep the existing file path.

### Bottom toolbar

- One inset dark strip, separated from the grid by breathing room rather than a full-width divider.
- Strong left icon zone, quiet center search prompt, compact right utility zone, and thin internal dividers.
- For Clackly, transfer the structure and surface treatment only. Keep All Actions and search; do not copy the reference's Star or Clock controls.

## Implementation constraints

- Keep the fixed `376×468` shell and existing `3×3` grid.
- Prefer CSS pseudo-elements, inset shadows, borders, and existing tokens over extra markup.
- If toolbar zoning needs a small markup adjustment, preserve button semantics, labels, keyboard behavior, and hit targets.
- Keep functional command icons in Lucide; adjust CSS sizing, contrast, and spacing instead of drawing a second icon family.
- The wordmark asset must contain no `<text>` nodes or external font references.
- Orange remains a signal for active/selected state, not a resting surface fill.
- Validate default, hover, selected, active/pressed, disabled/unavailable, and reduced-motion states.
