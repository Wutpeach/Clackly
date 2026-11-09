---
name: Clackly website
description: Product introduction and readable documentation within the Clackly visual system.
colors:
  surface: "#151619"
  foreground: "#e7e8ea"
  secondary: "#a6a6a8"
  rule: "#ffffff1f"
  stage: "#111215"
  focus: "#e7e8ea"
typography:
  display:
    fontFamily: "Harmony, Segoe UI, system-ui, sans-serif"
    fontSize: "clamp(3.5rem, 6.3vw, 5.65rem)"
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
  panel: "18px"
  keycap: "7px"
spacing:
  desktop-gutter: "40px"
  tablet-gutter: "24px"
  mobile-gutter: "18px"
components:
  primary-button:
    backgroundColor: "{colors.foreground}"
    textColor: "#151619"
    rounded: "{rounded.control}"
    padding: "0.9rem 1.2rem"
  secondary-button:
    rounded: "{rounded.control}"
    padding: "0.9rem 1.2rem"
---

## Overview

The Issue #14 Chinese and English homepage is a **candidate awaiting user visual acceptance**. It extends the application visual system implemented in [the renderer styles](../resolve-command-center/electron/renderer/styles.css), including its neutral palette and licensed HarmonyOS Sans. The website does not redefine application windows or runtime behavior. Documentation retains its independent Starlight and Black Theme interface.

## Colors

The homepage follows the application Palette surface, with neutral text and light neutral primary actions. The original inline HomeLight.astro SVG adds a silver-white arc and directional falloff behind the hero. The stage and AI workbench remain dark, with neutral highlights. The selected switch uses #17191d text; primary buttons use #151619 text. The existing orange logo remains artwork, not an interaction color. Documentation uses Black Theme's native light/dark modes and respects the reader's selection.

## Typography

The homepage uses HarmonyOS Sans with platform fallbacks. The large centered display and section headings use the frontmatter's responsive sizes; feature titles scale from 1.5rem to 2.15rem. On phones, the display scales from 2.35rem to 3.8rem and headings from 1.85rem to 2.75rem. Documentation follows Black Theme's native Geist Sans/Geist Mono fonts, neutral light/dark palette and reading width, as in Ameow; do not override them with application font or palette tokens. Monospace is reserved for code and copyable Agent source.

## Layout

The candidate home has a 1200px maximum width, centered hero and actions, and a full-width product stage. Search and Extension View appear in open, vertically separated rows with copy and captures on alternating sides; the AI workbench uses two columns. At 1000px gutters narrow to 24px; at 700px they narrow to 18px, feature rows and AI content stack, and the stage recomposes around the product capture. At 360px hero actions stack. Documentation keeps Starlight's sidebar, contents, search, language and mobile menu. Use concise localized sidebar labels and the theme's LinkCards for the documentation overview; long pagination labels wrap.

## Elevation & Depth

Directional light, fine edge highlights and layered soft shadows create depth around the dark stage and product captures. The dark perspective timeline is explicitly labelled as schematic; the palette capture is real and uses demonstration data. The silver halo traces once over 4000ms from the lower right, up the right side and leftward along its curves; five SVG strokes draw via dash offset while the ambient light settles. Hero copy, actions and stage stay stable. Six content groups below the initial viewport reveal once on intersection: text rises 16px without blur, product rows rise 28px from 3px blur, and the AI panel rises 20px from 2px blur. Opacity and blur resolve over 1050ms and position over 1300ms, with cubic-bezier(.22,.61,.36,1) easing. Content starts visible without JavaScript or IntersectionObserver; keyboard focus reveals a pending group immediately. Reduced motion and print stop the halo animation and show the complete light; pending content remains visible.

## Shapes

Controls have modest rounding; the stage and AI workbench use 18px corners, reduced to 14px on phones. Keycaps explain the real palette hotkey. Product captures retain their proportions.

## Components

Primary and secondary buttons have a 50px minimum height (48px on phones), visible hover states and a 2px focus outline with 5px offset. Navigation wraps on phones; the header GitHub link is hidden at 700px. The stage offers a keyboard-accessible Launcher/Search switch. Download links lead to the actual v0.1.6 Release. Documentation and Build with AI preserve locale. Copy controls copy visible text, announce completion and select the text when clipboard access fails. Raw protocol files remain reachable without JavaScript.

## Do's and Don'ts

Keep screenshots labelled and traceable. Keep protocol pages generated from the Skill. Preserve keyboard focus, basic semantics, 320px readability and normal Starlight workflows. Do not add testimonials, invented speed claims, arbitrary extension UI promises or unrequested services.
