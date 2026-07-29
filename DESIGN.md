---
name: Clackly
description: A compact keyboard-first precision command instrument for DaVinci Resolve.
colors:
  accent: "#F36A2D"
  accent-hover: "#FF7A3D"
  accent-soft: "rgba(243,106,45,0.15)"
  window-bg: "#101216"
  panel-bg: "#15181E"
  tile-bg: "#191D24"
  tile-hover: "#202631"
  text-primary: "rgba(255,255,255,0.92)"
  text-secondary: "rgba(255,255,255,0.65)"
  text-muted: "rgba(255,255,255,0.4)"
  border-subtle: "rgba(255,255,255,0.08)"
  shadow-ambient: "rgba(0,0,0,0.35)"
typography:
  title:
    fontFamily: "Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"
    fontSize: "18px"
    fontWeight: 600
    lineHeight: 1
    letterSpacing: "0.16em"
  body:
    fontFamily: "Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"
    fontSize: "15px"
    fontWeight: 400
    lineHeight: 1.4
  label:
    fontFamily: "Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"
    fontSize: "13px"
    fontWeight: 500
    lineHeight: 1.25
  section:
    fontFamily: "Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"
    fontSize: "14px"
    fontWeight: 600
    lineHeight: 1.2
  status:
    fontFamily: "Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"
    fontSize: "12px"
    fontWeight: 400
    lineHeight: 1.35
  meta:
    fontFamily: "Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"
    fontSize: "11px"
    fontWeight: 400
    lineHeight: 1.2
  caption:
    fontFamily: "Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"
    fontSize: "10px"
    fontWeight: 600
    lineHeight: 1
rounded:
  window: "12px"
  control: "8px"
  icon: "6px"
  keycap: "4px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "16px"
components:
  tile:
    backgroundColor: "{colors.tile-bg}"
    textColor: "{colors.text-primary}"
    rounded: "{rounded.control}"
    padding: "12px"
    size: "96px"
  tile-hover:
    backgroundColor: "{colors.tile-hover}"
    textColor: "{colors.text-primary}"
    rounded: "{rounded.control}"
  search-input:
    backgroundColor: "{colors.panel-bg}"
    textColor: "{colors.text-primary}"
    rounded: "{rounded.control}"
    height: "42px"
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

The system uses restrained near-black layers and one precise orange signal. Backgrounds establish hierarchy through small tonal steps; orange never becomes a large fill.

**The Orange Signal Rule.** Use the accent only for the logo mark, focus, active selection, pinned indicators and essential state. Never fill a full tile with orange.

## Typography

**Display Font:** Inter with SF Pro Display, Geist and system sans-serif fallback  
**Body Font:** Inter with system sans-serif fallback

Typography is compact and utilitarian. Labels prioritize fast scanning; the wordmark earns distinction through geometric construction and increased tracking rather than a decorative display face.

**The Two-Line Ceiling Rule.** Command labels may use at most two lines; supporting metadata must truncate before the interface loses density.

## Layout

The launcher is a fixed floating instrument, not a responsive page. Every mode retains the `376×468px` footprint so browsing never occupies more of the Resolve workspace than launching or searching. Launcher uses a `56px` header, a compact `3×3` square grid with `16px` outer padding and `8–10px` gaps, and a `44px` bottom action bar. All Actions fits its grouped command list and narrow `32px` alphabet rail inside the same window.

**The Workspace Preservation Rule.** Every layout must occupy only the space required for the current task and must not turn into a full application window.

## Elevation & Depth

Depth comes primarily from tonal layering and subtle borders. The window alone receives an ambient shadow (`0 16px 40px rgba(0,0,0,0.35)`). Tiles have no resting shadow; selected content may use only a restrained orange halo (`0 0 12px rgba(243,106,45,0.2)`).

## Shapes

The silhouette is precise and lightly softened: `12px` for the window and `8px` for tiles, inputs and buttons. Corners above `16px` are prohibited because they shift the product toward consumer-app softness. Interface icons come from `lucide-react`, use a fixed `1.9px` absolute stroke width and retain matched optical sizes; the Clackly logo and mark remain custom SVG assets.

## Components

### Header

A `56px` bar with `16px` horizontal padding. The CLACKLY SVG wordmark sits left at `110–130px` wide and approximately `20px` high; compact Pin and Settings controls sit right.

### Command Tiles

Square `96px` targets in a three-column CSS Grid. Default tiles use the tile neutral and subtle border. Hover brightens the layer and moves upward by `1px`; selected tiles receive a `1px` orange border. Icons are centered at `28–32px`; labels use the label typography role.

### Search

The search field is `42px` high with an orange active border. Result rows are `54–60px` high and expose icon, name, category, shortcut and availability/pinned status without weakening the command name hierarchy.

### Alphabet Navigation

The All Actions rail is `32px` wide. The selected letter uses orange text plus a short indicator line and must correspond to the visible command group.

### Motion

Window entry lasts `120–160ms`, fading from transparent and scaling from `.98`. Tile feedback lasts `80–120ms`; search transitions last about `120ms`. Reduced-motion environments remove scale and translation while preserving immediate state changes.

## Do's and Don'ts

### Do:

- **Do** preserve complete keyboard operation and visible focus/selection.
- **Do** use CSS variables for every confirmed color and reusable measurement.
- **Do** preserve the custom SVG wordmark and mark, and use `lucide-react` SVG components for interface icons.
- **Do** use demo content only when clearly marked as unavailable prototype data.

### Don't:

- **Don't** use large glow, full-orange tiles, gradient text or decorative glass effects.
- **Don't** use radii above `16px`, oversized whitespace or card-heavy consumer layouts.
- **Don't** let UI code know how Resolve actions are implemented.
- **Don't** add a dedicated History control; history influences ranking instead.
