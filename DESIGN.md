---
name: Clackly
description: A compact, keyboard-first command instrument for DaVinci Resolve.
colors:
  accent: "#F36A2D"
  accent-hover: "#FF7A3D"
  accent-soft: "rgba(243,106,45,0.15)"
  window-bg: "#151619"
  settings-titlebar-top: "#151619"
  palette-surface: "#151619"
  interaction-panel: "#151619"
  palette-control-fill: "rgba(0,0,0,0.12)"
  palette-muted: "rgba(255,255,255,0.47)"
  palette-separator: "rgba(255,255,255,0.055)"
  panel-bg: "#15181E"
  header-bottom: "#151619"
  row-hover: "rgba(255,255,255,0.052)"
  row-selected: "#E7E8EA"
  row-selected-foreground: "#17191D"
  toolbar-bg: "rgba(24,26,30,0.72)"
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
  settings-shell: "0px"
  palette-main: "8px"
  interaction-panel: "4px"
  search: "4px"
  control: "6px"
  row: "3px"
  rail: "3px"
  toolbar: "4px"
  keycap: "4px"
spacing:
  xs: "4px"
  sm: "8px"
  panel-gap: "16px"
  row: "30px"
  section: "21px"
  footer: "27px"
components:
  command-row:
    backgroundColor: "transparent"
    textColor: "{colors.text-secondary}"
    rounded: "{rounded.row}"
    padding: "0 7px"
    height: "{spacing.row}"
  command-row-selected:
    backgroundColor: "{colors.row-selected}"
    textColor: "{colors.row-selected-foreground}"
    rounded: "{rounded.row}"
    height: "{spacing.row}"
  launcher-search:
    backgroundColor: "{colors.palette-control-fill}"
    textColor: "{colors.text-secondary}"
    rounded: "{rounded.search}"
    padding: "0 9px"
    height: "34px"
  search-input:
    backgroundColor: "{colors.palette-control-fill}"
    textColor: "{colors.text-primary}"
    rounded: "{rounded.search}"
    padding: "0 9px"
    height: "34px"
  palette-footer:
    backgroundColor: "{colors.palette-surface}"
    textColor: "{colors.palette-muted}"
    height: "{spacing.footer}"
  interaction-panel:
    backgroundColor: "{colors.interaction-panel}"
    textColor: "{colors.text-primary}"
    rounded: "{rounded.interaction-panel}"
    padding: "12px"
    width: "260px"
  settings-shell:
    backgroundColor: "{colors.palette-surface}"
    rounded: "{rounded.settings-shell}"
    width: "760px"
    height: "560px"
---

# Design System: Clackly

## Overview

**Creative North Star: "The Resolve Precision Instrument"**

Clackly is a compact professional control surface that appears inside the editor's Resolve workflow, performs one focused job, and returns attention to the timeline. Its visual language combines Resolve-grade dark tonal restraint with the immediacy of Spotlight and FX Console. It rejects oversized cards, generous empty space, and playful consumer-launcher softness.

On Windows, that instrument is a stable native two-window composition: a fixed main Palette and an independent information Panel. The host owns native window behavior; the renderer owns only Palette content and the bounded information presentation. The browser page is a visual DOM simulation of the same shared contract, never evidence of native behavior. Settings is native-window independent, but its painted surface belongs to this same current-generation instrument rather than to a separate desktop-settings theme.

**Architecture authority.** The approved D6/D7 contract as encoded by the native host policy and window helpers defines Windows behavior. `electron/shared/palette-geometry.json` owns the shared dimensions and visual tokens consumed by native helpers and renderers. The hostless root browser preview consumes those sources through an isolated, non-executable presentation adapter; it neither defines the production contract nor validates native behavior.

**Key Characteristics:**

- Dense, keyboard-first, and operational.
- Dark neutral surfaces separated by tone, hairlines, and restrained depth.
- Orange used sparingly for identity, focus, pinning, and essential state.
- Small controlled radii and a consistent `lucide-react` line-icon vocabulary.
- Windows native Palette visibility changes immediately and without authored entry or exit motion.

## Colors

The Palette main field, Footer, information Panel, and painted Settings shell use one shared neutral ink field. Search, Settings fields, and keycaps inset slightly into that field; subtle borders and white-on-black tonal contrast create separation without a second dark toolbar or a Settings-only color world.

**The Orange Signal Rule.** Use the accent only for brand identity, focus indication, pinned indicators, the primary Save action, and essential warning/error state. Palette and Settings selection are always a light neutral anchor with dark foreground; orange never becomes a selected-row fill or location rail.

## Typography

**Display Font:** HarmonyOS Sans with Segoe UI and system sans-serif fallback
**Body Font:** HarmonyOS Sans with Segoe UI and system sans-serif fallback

Typography is compact and utilitarian. Command names lead the scan path; categories, lifecycle status, keycaps, and Footer controls remain weaker. The wordmark earns distinction through geometric SVG construction and tracking rather than a decorative display face.

**The Single-Line Command Rule.** Command names and supporting metadata stay on one line and truncate before row height changes. Interaction action labels wrap naturally inside their own Panel because complete action names outrank horizontal compression there.

## Layout

The Windows D6 main Palette is a fixed, opaque `240×320px` native surface. Its visible top-left starts at the cursor, with the existing work-area flip and clamp protecting screen edges. Launcher and Search always occupy this rectangle; D6 remains full bleed from the renderer origin and has no transparent padding around its native footprint.

Windows D7 is a separate, opaque native information Panel to the right of D6. It is `260px` wide, its measured content height is bounded to `60–180px`, and it is vertically positioned from the selected row within the shared inset rule. A real `16px` desktop gap separates the two windows. When the combined composition needs clamping, both native windows move together; closing D7 restores D6's exact pre-Panel bounds. D7 never flips to the left.

The root browser preview renders one DOM composition from the shared geometry and visual tokens. Its transparent staging exists solely to show the CSS shadow approximation and the visibly empty gap; it does not create physical native separation or validate input, focus, z-order, DWM, HWNDs, or Resolve. Non-Windows keeps the transparent attached presentation as a compatibility fallback, not as a second visual direction.

**The Workspace Preservation Rule.** Every layout occupies only the space required for the current command task and never turns into a full application window.

## Elevation & Depth

On Windows, DWM owns the external corners and shadow of each opaque native window. The main and Panel do not use a rendered halo, connector, or shadow-bearing bridge to impersonate that system treatment. The shared external-shadow token lets the browser preview approximate the visual depth only; it is not native geometry.

Inside the surfaces, depth stays quiet: a faint inner highlight, subtle borders, and small tonal shifts distinguish controls. Command rows are transparent at rest and gain only a low-contrast neutral hover. Keyboard selection is the strongest in-Palette state: a light neutral row with dark foreground. Status and errors are compact event feedback, never a persistent help bar.

**The Native Depth Rule.** Treat immediate opacity `0/1` as a stable visibility state, not an animation. Do not add scale, fade, blur, translation, taskbar animation, or timing choreography to Palette reveal or concealment.

## Shapes

Windows D6 is frameless, opaque, and full bleed, with native DWM corners and shadow. The Palette renderer preserves the small main-radius contract inside that native treatment. Windows D7 follows the same native outer-window policy; browser and compatibility representations preserve the smaller Panel-radius contract. The `16px` gap is empty desktop space, not part of either window.

Settings is deliberately separate: its native window may use transparency, but its visible `760×560px` shell is fully painted, square, and `0px` radius. It retains the ordinary Settings lifecycle, drag/close behavior, taskbar treatment, and two-pane geometry; it does not inherit D6/D7 corners, shadow, focus, or layout rules. That native separation does not create a second visual language: its paint follows the continuous Palette/Panel ink surface, compact list rhythm, weak hairlines, and inset controls. Interface icons remain monochrome `lucide-react` symbols with a fixed optical stroke; the Clackly logo and mark remain project-owned path SVGs with no `<text>` or font dependency.

## Components

### Palette Main

The Windows main Palette is the selection and keyboard authority. It stays at the fixed D6 size, preserves focus across information open and close, and has no wordmark, orange identity rule, or primary toolbar. It is constructed hidden and persistent; first reveal may show it, while subsequent reveal and conceal use the immediate opacity lifecycle with input and focus gating.

### Launcher and Search

Launcher begins with the compact search surface and projects only nonempty `PINNED`, `RECENT`, and fallback `COMMANDS` sections from the existing ranked source. Search is a separate content mode containing only `RESULTS`. Its in-field `ESC` hint returns to Launcher, so Search has no duplicate Footer Back affordance. The main keeps its compact search field, row rhythm, section labels, and quiet Footer.

### Command Rows

Rows are compact list primitives: transparent at rest, soft neutral on hover, and light neutral with dark foreground for keyboard selection. The command name and monochrome icon lead; category/status and true Launcher numeric keycaps are progressively weaker. There are no invented per-command shortcuts, submenu behavior, card borders, or gradients. Empty catalogs and searches use truthful empty states.

### Palette Footer

The Footer is a weak hairline within the same continuous Palette surface. Settings and the push-pin control stay on the left; the universal Info control stays on the right for every selected Command. Info is subdued in every state. Search uses only its in-field `ESC` return; the Footer never adds a Back control, Favorites, or History control.

### Interaction Information

Info click or `Tab` opens information for the selected Command; `Tab` or `Escape` closes it while preserving Palette keyboard behavior. On Windows, the main renderer measures bounded content but the actual information surface is D7: a persistent, independent native window constructed with `focusable:false`. It never steals focus or changes focusability after construction. The host gates its mouse hit target only with the visible read-only information surface; D7 never becomes a focusable, executable, or settings/control panel. Open/update sends only validated mappings-or-description presentation data; close clears it, disables panel mouse input, restores D6 bounds, and leaves no stale content.

The content is shared across the native detached renderer, compatibility fallback, and browser preview. It shows either valid input-to-action mappings or the selected Command description, never both. It has no title, Command-name repetition, category, explanatory Footer, search, row selection, hover model, acknowledgement, or empty state. The browser preview alone adds its subdued preview-only note and never executes commands.

### Settings

Settings remains a separate native window with a fully painted square visible shell and its existing singleton show/focus lifecycle. The Palette Main and Interaction Information content are its visual authority; only D6/D7 native geometry and lifecycle stay separate.

- **Titlebar:** keep the existing drag and close contract, but paint a compact continuous ink strip with only a weak bottom hairline. The wordmark is quiet; do not use a branded gradient, tall orange rule, or app-header depth.
- **Navigation:** preserve the left feature navigation and categories. Rows follow the `30px` command-row rhythm with `3px` radius, `16px` monochrome icons, transparent rest state, and the shared low-contrast neutral hover. Selection is exactly `#E7E8EA` with `#17191D` text and icon—no orange wash or location rail.
- **Detail:** use a compact `14–16px` monochrome icon and a direct title/description path. Category metadata stays subdued. Do not promote status administration before the actual editable settings.
- **Lifecycle/status:** present status as a compact, flat, hairline-separated operational readout. It is not a framed card, a colored tile, or an app-dashboard summary.
- **Fields and help:** fields use the Palette's inset `rgba(0,0,0,0.12)` treatment, weak borders, `30–34px` controls, and `3–4px` radii. Interaction Help uses the existing read-only Interaction Information keycap grammar.
- **Action area:** preserve its fixed feedback, Reset, Save semantics, but render a `30px`-class quiet continuous footer with a single weak top hairline. Reset stays neutral; Save is the sole orange filled action.
- **Density and motion:** favor direct operational scan paths, compact gaps, subdued metadata, and no authored reveal/hide animation.

## Do's and Don'ts

### Do:

- **Do** preserve complete keyboard operation and visible focus/selection.
- **Do** consume the shared Palette geometry and visual tokens for native hosts and browser simulation.
- **Do** keep the Windows main and information Panel as independent opaque native windows with a genuinely empty gap.
- **Do** preserve the path-only custom SVG wordmark and mark, and use `lucide-react` SVG components for interface icons.
- **Do** keep production Command presentation Registry-only and use the truthful empty state when no registered Commands exist; only the hostless root browser preview may use isolated representative presentation data.
- **Do** keep Settings on its existing separate square-window contract.
- **Do** make Settings visibly use the current Palette/Interaction Panel row, selection, field, keycap, and footer grammar.

### Don't:

- **Don't** add a rendered bridge, connector, or occupied hit area between the Windows native windows.
- **Don't** add authored Palette reveal or conceal motion, or treat opacity state changes as animation.
- **Don't** represent browser-preview output as proof of DWM, HWND separation, focus, hit testing, z-order, or Resolve acceptance.
- **Don't** use large glow, full-orange rows, gradient text, decorative glass effects, oversized whitespace, or card-heavy consumer layouts.
- **Don't** let UI code know how Resolve actions are implemented.
- **Don't** make Settings adopt the Palette's native D6/D7 treatment or let native-window independence become a separate legacy Settings visual system.
- **Don't** use an orange Settings selection, gradient/branded titlebar, framed Feature Status card, oversized padding, or a tall application-style footer.
