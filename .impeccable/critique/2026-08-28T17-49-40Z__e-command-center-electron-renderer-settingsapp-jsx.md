---
target: Settings visual alignment against DESIGN.md and the shipped Palette / Interaction Panel
total_score: 22
max_score: 40
na_heuristics:
p0_count: 0
p1_count: 3
timestamp: 2026-08-28T17-49-40Z
slug: e-command-center-electron-renderer-settingsapp-jsx
---
# Settings visual-alignment critique

## Design Health Score

| # | Heuristic | Score | Key issue |
|---|---|---:|---|
| 1 | Visibility of System Status | 3 | Status exists, but save/error feedback is visually weak. |
| 2 | Match System / Real World | 3 | Clear language, generic Electron-settings presentation. |
| 3 | User Control and Freedom | 2 | Save/Reset/Close exist; navigation lacks a stronger keyboard model. |
| 4 | Consistency and Standards | 2 | Internally coherent, visually disconnected from Palette and Interaction Panel. |
| 5 | Error Prevention | 2 | Required/missing state exists, recovery remains generic. |
| 6 | Recognition Rather Than Recall | 3 | Feature names and statuses remain visible. |
| 7 | Flexibility and Efficiency | 1 | No Palette-like efficient keyboard navigation model. |
| 8 | Aesthetic and Minimalist Design | 2 | Clean but generic, loose, and card-led. |
| 9 | Error Recovery | 2 | Error feedback lacks a specific recovery action. |
| 10 | Help and Documentation | 2 | Keycap help improved, but still reads as an appended documentation region. |
| **Total** | | **22/40** | **Acceptable; visual consistency is not release-ready.** |

## Design Specificity Verdict

The refreshed Settings surface remains category-interchangeable. Replacing the logo and feature copy could turn it into almost any Electron preferences window. Clackly specificity comes only from the logo, orange accent, feature names, and a few keycaps. The main product's authored traits—30px operational rhythm, continuous ink surface, light-neutral selection anchor, very weak hairlines, single-task focus, and instrument-like density—did not transfer.

The deterministic detector returned zero findings. That proves only that the target avoided its mechanical anti-pattern rules; it cannot detect that the entire surface still belongs to the previous visual generation.

## Overall Impression

This was a token cleanup of the legacy Settings page, not a visual redesign into the current Clackly world. DESIGN.md is the root problem because it specifies Settings geometry and native separation but not a shared visual grammar. The implementation then interpreted that gap conservatively and preserved almost all legacy composition and visual weight.

## What's Working

- The renderer remains behaviorally stable and the two-pane information architecture is clear.
- Typography roles, translucent hover, monochrome icon direction, and keycap help are more internally consistent.
- Long paths, Chinese content, busy/error states, and reduced motion have deterministic evidence.

## Priority Issues

1. **P1 — Missing Settings design contract.** DESIGN.md gives detailed Palette and Interaction Panel component rules but gives Settings only a square 760x560 shell, independent titlebar/lifecycle, and a legacy-looking sidecar sample. Rewrite the Settings section to distinguish native-window independence from shared visual DNA and define navigation, selection, fields, status, footer, density, and icon rules.
2. **P1 — Legacy surface and selection grammar.** The orange-brown full-row selection, panel-like sidebar, framed Feature Status card, and bordered controls are visually heavier than the Palette. Use a continuous ink surface, weak hairlines, a shared selection anchor, and reserve orange for Save, focus, and essential status.
3. **P1 — Generic desktop-settings hierarchy.** The branded titlebar, status administration card, large padding, and fixed action bar dominate before the actual setting fields. Reorder visual emphasis so feature identity, essential status, and editable settings form one direct operational path.
4. **P2 — Token substitution mistaken for design alignment.** The new --settings-* variables mostly rename old values. Add executable Settings component specifications and reference examples rather than more primitives.
5. **P2 — Remaining component-rule drift.** The 18px detail icon still exceeds the documented 14–16px slot, while the title typography's scope is ambiguous.

## Persona Red Flags

- **Alex, power user:** The navigation and administrative status block feel slower than the compact Palette; primary settings are pushed below status management.
- **Sam, keyboard/accessibility user:** Native focus is present, but the feature navigation lacks an explicit roving/arrow-key model and generic error feedback is not sufficiently actionable.
- **Resolve editor:** The surface feels like leaving Resolve for a standalone app preferences window, contradicting the product's precision-instrument identity.

## Minor Observations

- The empty General state exposes a very large inert area, reinforcing the generic application-window feeling.
- Interaction Help keycaps are the strongest successful transfer from the Interaction Panel.
- The sidecar's Settings Shell example actively preserves the previous titlebar visual world.

## Questions to Consider

- Should Settings share the Palette's light-neutral selection anchor, or keep a distinct Settings selection with only a narrow orange location cue?
- Which status facts are truly operational enough to remain visible before the editable fields?
- What is the minimum visual difference needed to keep Settings a native independent window without making it look like a different product?
