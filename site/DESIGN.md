---
name: Clackly website
description: Product introduction and readable documentation within the Clackly visual system.
colors:
  surface: "#151619"
  raised: "#1c1e22"
  foreground: "#e7e8ea"
  secondary: "#b7b9c0"
  muted: "#a3a6af"
  rule: "#32343a"
typography:
  display:
    fontFamily: "Harmony, Segoe UI, system-ui, sans-serif"
    fontSize: "clamp(3.7rem, 7.2vw, 6rem)"
    fontWeight: 600
    lineHeight: 1.08
    letterSpacing: "-0.035em"
  body:
    fontFamily: "HarmonyOS Sans, Segoe UI, system-ui, sans-serif"
    fontSize: "1rem"
    fontWeight: 400
    lineHeight: 1.85
rounded:
  control: "5px"
  keycap: "7px"
spacing:
  desktop-gutter: "40px"
  mobile-gutter: "18px"
components:
  primary-button:
    backgroundColor: "{colors.foreground}"
    textColor: "#17191d"
    rounded: "{rounded.control}"
    padding: "0.85rem 1.15rem"
---

## Overview

This surface extends the application visual system implemented in [the renderer styles](../resolve-command-center/electron/renderer/styles.css), including its neutral palette, HarmonyOS Sans font and compact controls. The home introduces Clackly to Resolve editors; the docs help them complete a task. Product facts come from the actual Release and Developer Skill. The website does not redefine application windows or runtime behavior.

## Colors

The dark homepage continues the application's #151619 neutral surface. Light neutral buttons carry actions. The existing orange logo remains artwork, not an interaction color. Documentation uses Black Theme's native light/dark modes and respects the reader's selection.

## Typography

The product home reuses the application's HarmonyOS Sans asset with platform fallbacks for Chinese. Large two-line home copy has a maximum of 6rem. Documentation follows Black Theme's native Geist Sans/Geist Mono fonts, neutral light/dark palette and reading width, as in Ameow; do not override them with application font or palette tokens. Monospace is reserved for code and copyable Agent source.

## Layout

The desktop home has a 1120px maximum width, clear navigation, a large value statement and download action, then a full-width command demonstration with the actual compact palette at its native screenshot size. Workflow explanations use divided rows; AI authoring has one copyable prompt and a direct guide link. At 600px, content stacks with 18px gutters. Documentation keeps Starlight's sidebar, contents, search, language and mobile menu. Use concise localized sidebar labels and the theme's LinkCards for the documentation overview; long pagination labels wrap.

## Elevation & Depth

Restrained tonal separation and hairlines. A soft offset shadow separates the actual palette screenshot. There are no invented product scenes or animated native windows.

## Shapes

Small controlled radii inherit Clackly's instrument character. Keycaps explain the real palette hotkey. The actual screenshot keeps the application's original proportions.

## Components

Download links lead to the actual v0.1.6 Release. Documentation and Build with AI preserve locale. Copy controls copy visible text, announce completion and select the text when clipboard access fails. Raw protocol files remain reachable without JavaScript.

## Do's and Don'ts

Keep screenshots labelled and traceable. Keep protocol pages generated from the Skill. Preserve keyboard focus, basic semantics, 320px readability and normal Starlight workflows. Do not add testimonials, invented speed claims, arbitrary extension UI promises or unrequested services.
