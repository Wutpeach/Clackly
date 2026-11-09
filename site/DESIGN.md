---
name: Clackly website
description: Product introduction and readable documentation within the Clackly visual system.
colors:
  surface: "#151619"
  foreground: "#eeece8"
  secondary: "#b1b0b7"
  rule: "#36373d"
  raised: "#1c1d20"
  light-panel: "#e5ddd2"
  ai-panel: "#d9dbea"
  focus: "#f0c69c"
typography:
  display:
    fontFamily: "Harmony, Segoe UI, system-ui, sans-serif"
    fontSize: "clamp(3.5rem, 6.7vw, 6rem)"
    fontWeight: 600
    lineHeight: 1.12
    letterSpacing: "-0.04em"
  headline:
    fontFamily: "Harmony, Segoe UI, system-ui, sans-serif"
    fontSize: "clamp(2rem, 3.7vw, 3.25rem)"
    fontWeight: 500
    lineHeight: 1.2
    letterSpacing: "-0.035em"
  body:
    fontFamily: "Harmony, Segoe UI, system-ui, sans-serif"
    fontSize: "1rem"
    fontWeight: 400
    lineHeight: 1.85
rounded:
  control: "8px"
  card: "14px"
  panel: "16px"
  keycap: "7px"
spacing:
  desktop-gutter: "40px"
  tablet-gutter: "24px"
  mobile-gutter: "18px"
  grid-gap: "24px"
components:
  primary-button:
    backgroundColor: "{colors.foreground}"
    textColor: "{colors.surface}"
    rounded: "{rounded.control}"
    padding: "0.9rem 1.2rem"
  secondary-button:
    backgroundColor: "{colors.raised}"
    rounded: "{rounded.control}"
    padding: "0.9rem 1.2rem"
---

## Overview

The Issue #14 Chinese and English homepage is a **candidate awaiting user visual acceptance**. It extends the application visual system implemented in [the renderer styles](../resolve-command-center/electron/renderer/styles.css), including its neutral palette and licensed HarmonyOS Sans. The website does not redefine application windows or runtime behavior. Documentation retains its independent Starlight and Black Theme interface.

## Colors

The homepage uses graphite and warm neutral text, with light neutral primary actions. A warm stage and light extension panel contrast with the dark surface; a pale lavender panel identifies the AI section. The existing orange logo remains artwork, not an interaction color. Documentation uses Black Theme's native light/dark modes and respects the reader's selection.

## Typography

The homepage uses HarmonyOS Sans with platform fallbacks. The large centered display and section headings use the frontmatter's responsive sizes; feature titles scale from 1.3rem to 1.65rem. On phones, the display scales from 2.35rem to 3.8rem and headings from 1.85rem to 2.75rem. Documentation follows Black Theme's native Geist Sans/Geist Mono fonts, neutral light/dark palette and reading width, as in Ameow; do not override them with application font or palette tokens. Monospace is reserved for code and copyable Agent source.

## Layout

The candidate home has a 1200px maximum width, centered hero and actions, and a full-width product stage. Two feature cards sit in an asymmetric grid and the AI panel uses two columns. At 1000px gutters narrow to 24px; at 700px they narrow to 18px, cards and AI content stack, and the stage recomposes around the product capture. At 360px hero actions stack. Documentation keeps Starlight's sidebar, contents, search, language and mobile menu. Use concise localized sidebar labels and the theme's LinkCards for the documentation overview; long pagination labels wrap.

## Elevation & Depth

Tonal separation and hairlines define panels; soft shadows lift product captures within the stage and feature cards. The stage uses a warm gradient and explicitly labelled schematic timeline. Its entrance moves 12px over 900ms; reduced motion disables the animation.

## Shapes

Controls have modest rounding; larger cards and panels use 14–16px corners, with 12px panels on phones. Keycaps explain the real palette hotkey. Product captures retain their proportions.

## Components

Primary and secondary buttons have a 50px minimum height (48px on phones), visible hover states and a 2px focus outline with 5px offset. The light AI panel uses a darker focus outline. Navigation wraps on phones; the header GitHub link is hidden at 700px. The stage offers a keyboard-accessible Launcher/Search switch. Download links lead to the actual v0.1.6 Release. Documentation and Build with AI preserve locale. Copy controls copy visible text, announce completion and select the text when clipboard access fails. Raw protocol files remain reachable without JavaScript.

## Do's and Don'ts

Keep screenshots labelled and traceable. Keep protocol pages generated from the Skill. Preserve keyboard focus, basic semantics, 320px readability and normal Starlight workflows. Do not add testimonials, invented speed claims, arbitrary extension UI promises or unrequested services.
