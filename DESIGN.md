---
name: Clackly
description: A compact keyboard-first precision command instrument for DaVinci Resolve.
colors:
  accent: "#F36A2D"
  accent-hover: "#FF7A3D"
  accent-soft: "rgba(243,106,45,0.15)"
  window-bg: "#101216"
  launcher-bg: "#202327"
  panel-bg: "#15181E"
  header-bottom: "#1C1F23"
  tile-bg: "#191D24"
  tile-top: "#24262C"
  tile-bottom: "#21242A"
  tile-hover: "#292D34"
  toolbar-bg: "rgba(24,26,30,0.72)"
  tile-border-inner: "rgba(255,255,255,0.055)"
  tile-border-middle: "rgba(0,0,0,0.88)"
  tile-border-outer: "rgba(255,255,255,0.12)"
  text-primary: "rgba(255,255,255,0.92)"
  text-secondary: "rgba(255,255,255,0.65)"
  text-muted: "rgba(255,255,255,0.4)"
  border-subtle: "rgba(255,255,255,0.08)"
  border-strong: "rgba(255,255,255,0.13)"
  shadow-ambient: "rgba(0,0,0,0.35)"
typography:
  title:
    fontFamily: "'HarmonyOS Sans', 'Segoe UI', system-ui, sans-serif"
    fontSize: "18px"
    fontWeight: 600
    lineHeight: 1
    letterSpacing: "0.16em"
  body:
    fontFamily: "'HarmonyOS Sans', 'Segoe UI', system-ui, sans-serif"
    fontSize: "15px"
    fontWeight: 400
    lineHeight: 1.4
  label:
    fontFamily: "'HarmonyOS Sans', 'Segoe UI', system-ui, sans-serif"
    fontSize: "13px"
    fontWeight: 500
    lineHeight: 1.25
  section:
    fontFamily: "'HarmonyOS Sans', 'Segoe UI', system-ui, sans-serif"
    fontSize: "14px"
    fontWeight: 600
    lineHeight: 1.2
  status:
    fontFamily: "'HarmonyOS Sans', 'Segoe UI', system-ui, sans-serif"
    fontSize: "12px"
    fontWeight: 400
    lineHeight: 1.35
  meta:
    fontFamily: "'HarmonyOS Sans', 'Segoe UI', system-ui, sans-serif"
    fontSize: "11px"
    fontWeight: 400
    lineHeight: 1.2
  caption:
    fontFamily: "'HarmonyOS Sans', 'Segoe UI', system-ui, sans-serif"
    fontSize: "10px"
    fontWeight: 600
    lineHeight: 1
rounded:
  window: "8px"
  control: "6px"
  tile: "2px"
  rail: "3px"
  toolbar: "4px"
  icon: "6px"
  keycap: "4px"
spacing:
  xs: "4px"
  sm: "8px"
  launcher-gap: "9px"
  md: "16px"
components:
  tile:
    backgroundColor: "{colors.tile-bg}"
    textColor: "{colors.text-primary}"
    rounded: "{rounded.tile}"
    padding: "8px 10px 10px"
    size: "113px"
  tile-hover:
    backgroundColor: "{colors.tile-hover}"
    textColor: "{colors.text-primary}"
    rounded: "{rounded.control}"
  search-input:
    backgroundColor: "{colors.panel-bg}"
    textColor: "{colors.text-primary}"
    rounded: "{rounded.control}"
    height: "42px"
  header-surface:
    backgroundColor: "{colors.launcher-bg}"
    textColor: "{colors.text-primary}"
    rounded: "{rounded.toolbar}"
    height: "40px"
  launcher-toolbar:
    backgroundColor: "{colors.toolbar-bg}"
    textColor: "{colors.text-muted}"
    rounded: "{rounded.toolbar}"
    height: "38px"
    width: "357px"
---

# Design System: Clackly

## Overview

**Creative North Star: "The Resolve Precision Instrument"**

Clackly is a compact professional control surface that appears inside the editor's existing Resolve workflow, performs one focused job, and gets out of the way. Its visual language combines Resolve-grade dark tonal layering with the immediacy of Spotlight and FX Console, while rejecting the oversized cards, generous empty space and playful softness of consumer launchers.

**Key Characteristics:**

- Dense, keyboard-first and operational.
- Dark neutral layers separated by tone and hairline borders.
- Orange used sparingly for active state, focus and identity.
- Small controlled radii and a consistent `lucide-react` line-icon vocabulary.
- Fast motion that confirms state without becoming decoration.

## Colors

The system uses restrained near-black layers and one precise orange signal. The Launcher command field uses `#202327`, sitting close to the tile tones while remaining visibly distinct from the darker internal surfaces. Backgrounds establish hierarchy through small tonal steps; orange never becomes a large fill.

**The Orange Signal Rule.** Use the accent only for the logo mark, focus, active selection, pinned indicators and essential state. Never fill a full tile with orange.

## Typography

**Display Font:** HarmonyOS Sans with Segoe UI and system sans-serif fallback
**Body Font:** HarmonyOS Sans with system sans-serif fallback

Typography is compact and utilitarian. Labels prioritize fast scanning; the wordmark earns distinction through geometric construction and increased tracking rather than a decorative display face.

**The Two-Line Ceiling Rule.** Command labels may use at most two lines; supporting metadata must truncate before the interface loses density.

## Layout

The launcher is a fixed floating instrument, not a responsive page. Every mode retains the `376×468px` footprint so browsing never occupies more of the Resolve workspace than launching or searching. Launcher uses a compact `48px` header, a centered `3×3` square grid with `8px` outer padding and `9px` gaps, and a `44px` bottom action bar. The `113px` tiles and wider gaps preserve the matrix's previous `357px` total footprint while adding breathing room. All Actions fits its grouped command list and narrow `32px` alphabet rail inside the same window.

**The Workspace Preservation Rule.** Every layout must occupy only the space required for the current task and must not turn into a full application window.

## Elevation & Depth

Depth comes from tonal layering, precise hairlines and shallow physical separation. The window receives an ambient shadow (`0 18px 44px rgba(0,0,0,0.35)`) plus a faint inner top highlight. Launcher tiles use a restrained vertical dark gradient and a three-layer edge: inner white highlight, middle near-black physical border, and outer gray outline. A soft `0 7px 16px rgba(0,0,0,0.26)` shadow separates each tile from the `#202327` launcher field. Selection changes only the middle border from black to orange, retaining the inner and outer layers plus a minimal low-opacity glow. The footer strip floats subtly with a faint border, inner highlight and `0 8px 20px rgba(0,0,0,0.22)` shadow.

## Shapes

The silhouette is precise and lightly softened: `8px` for the window, `2px` for launcher tiles, and `6px` for inputs and buttons. Corners above `16px` are prohibited because they shift the product toward consumer-app softness. Interface icons come from `lucide-react`, use a fixed `1.9px` absolute stroke width and retain matched optical sizes; the Clackly logo and mark remain custom SVG assets.

## Components

### Header

A compact `48px` header row uses the same `#202327` field background as the Launcher, with `4px` vertical and `8px` horizontal inset. Brand, Pin and Settings share one continuous `40px` high physical surface with a restrained `#202327` to `#1C1F23` gradient, keeping the title bar within the Launcher's tonal family. Its structure uses a four-sided inset white highlight at `2.5%` and a restrained `0 2px 2px -2px rgba(0,0,0,0.8)` external shadow confined to the lower edge, without an external border. The brand flexes to fill the remaining width; Pin and Settings each occupy a `40px` zone. Two short inset dividers separate Brand from Pin and Pin from Settings without splitting the shared surface into separate cards. A `2×24px` orange signal line introduces the brand area. The CLACKLY wordmark sits left at `118px` wide and `18px` high, drawn entirely with project-owned SVG paths/shapes: geometric light letterforms and an orange open-chevron `A`, with no `<text>` or font dependency.

### Command Tiles

Square `113px` targets in a three-column CSS Grid with `9px` gaps that visually match the matrix's outer inset. Default tiles use a `#24262C` to `#21242A` vertical gradient, sitting slightly above the Launcher field rather than dropping into a darker layer, with three concentric edge layers: subtle white inset, black middle border and gray outer outline. Hover brightens the edge and increases physical separation by `1px`; selected tiles replace only the black middle border with orange. Launcher position keycaps `1–9` sit at the top-left and the pinned indicator sits at the top-right. Only registered Commands render; an empty registry uses the normal empty state. Icons are optically centered at `32px`; one- and two-line labels use HarmonyOS Sans at `450` weight to keep the dense grid visually light.

### Launcher Toolbar

The `44px` footer row shares the Launcher's `#202327` field background and contains a centered `38px` instrument strip with `6px` breathing room below it. Its width is calculated from the same tokens as the Launcher grid: three tile widths plus two grid gaps, so its left and right edges align exactly with the card matrix. The strip starts at the top of the footer row so the gap from the final card row mirrors the first card row's distance from the Launcher field edge. The strip itself uses the near-field reference surface `rgba(24,26,30,0.72)`, remaining only modestly darker than the Launcher field, with a faint `rgba(255,255,255,0.05)` border, compact `4px` radius and soft suspended shadow. A theme-orange Lucide Grip button opens All Actions, and the search prompt is centered within its remaining zone at `12px` in muted text. A short inset divider separates the two zones without touching the toolbar edges. Decorative branding and dedicated Favorites or History controls do not occupy the toolbar.

### Search

The search field is `42px` high with an orange active border. Result rows are `54–60px` high and expose registered icon, name, category, lifecycle status and pinned state without weakening the command name hierarchy.

### Alphabet Navigation

The All Actions field uses the same `#202327` background as the Launcher field and the outer Header row, preserving one continuous instrument body across modes. Its list remains scrollable while the native scrollbar stays hidden. A persistent `32px` `# / A–Z` alphabet rail occupies the far-right column inside a compact `3px` radius container using the same `#202327` fill, a faint full outline and black inset edge. The shared fill keeps it integrated while the edge treatment establishes the control boundary. The selected letter uses orange text plus a short indicator line and must correspond to the visible command group.

### Motion

Window entry lasts `120–160ms`, fading from transparent and scaling from `.98`. Tile feedback lasts `80–120ms`; search transitions last about `120ms`. Reduced-motion environments remove scale and translation while preserving immediate state changes.

## Do's and Don'ts

### Do:

- **Do** preserve complete keyboard operation and visible focus/selection.
- **Do** use CSS variables for every confirmed color and reusable measurement.
- **Do** preserve the path-only custom SVG wordmark and mark, and use `lucide-react` SVG components for interface icons.
- **Do** keep launcher icons and one/two-line command labels optically centered as one command unit.
- **Do** render only registered Command metadata and use the truthful empty state when none is available.

### Don't:

- **Don't** use large glow, full-orange tiles, gradient text or decorative glass effects.
- **Don't** use SVG `<text>` or font-dependent rendering for the CLACKLY wordmark.
- **Don't** use radii above `16px`, oversized whitespace or card-heavy consumer layouts.
- **Don't** let UI code know how Resolve actions are implemented.
- **Don't** add a dedicated History control; history influences ranking instead.
