---
name: Clackly
description: A compact keyboard-first precision command instrument for DaVinci Resolve.
colors:
  accent: "#F36A2D"
  accent-hover: "#FF7A3D"
  accent-soft: "rgba(243,106,45,0.15)"
  window-bg: "#101216"
  settings-titlebar-top: "#202327"
  palette-surface: "#151619"
  interaction-panel: "#151619"
  palette-control-fill: "rgba(0,0,0,0.12)"
  palette-muted: "rgba(255,255,255,0.47)"
  palette-separator: "rgba(255,255,255,0.055)"
  panel-bg: "#15181E"
  header-bottom: "#1C1F23"
  row-hover: "rgba(255,255,255,0.065)"
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
  window: "0px"
  control: "6px"
  row: "2px"
  rail: "3px"
  toolbar: "4px"
  icon: "6px"
  keycap: "4px"
spacing:
  xs: "4px"
  sm: "8px"
  row: "30px"
  md: "16px"
components:
  command-row:
    backgroundColor: "transparent"
    textColor: "{colors.text-secondary}"
    rounded: "{rounded.row}"
    padding: "0 7px"
    height: "30px"
  command-row-selected:
    backgroundColor: "{colors.row-selected}"
    textColor: "{colors.row-selected-foreground}"
    rounded: "{rounded.control}"
  search-input:
    backgroundColor: "{colors.panel-bg}"
    textColor: "{colors.text-primary}"
    rounded: "{rounded.control}"
    height: "34px"
  palette-footer:
    backgroundColor: "{colors.palette-surface}"
    textColor: "{colors.palette-muted}"
    height: "27px"
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

The system uses restrained near-black layers and one precise orange signal. The Palette main field, Footer, and Interaction Panel share the exact `#151619` neutral instrument field; the Footer is separated only by a faint hairline, and the panel only by a subtle border and shadow. Search is the inset control within the main field. Settings titlebar tones remain independent. Backgrounds establish hierarchy through small tonal steps; orange never becomes a large fill.

**The Orange Signal Rule.** Use the accent only for Settings/brand identity, focus indication, pinned indicators, and essential state. Palette selection is always a light neutral anchor with dark foreground; orange never becomes a Palette row fill.

## Typography

**Display Font:** HarmonyOS Sans with Segoe UI and system sans-serif fallback
**Body Font:** HarmonyOS Sans with system sans-serif fallback

Typography is compact and utilitarian. Labels prioritize fast scanning; the wordmark earns distinction through geometric construction and increased tracking rather than a decorative display face.

**The Single-Line Command Rule.** Command names and supporting metadata stay on one line and truncate before row height changes.

## Layout

The Palette main surface is a fixed `240×320px` floating instrument, not a responsive page. Launcher and Search always occupy that left rectangle. On normal reveal its top-left anchors at the cursor; only a work-area overflow uses the existing flip/clamp rule. When Interaction Info is explicitly open, one existing BrowserWindow temporarily expands to a `516×320px` envelope: the main remains at `x=0`, a transparent `16px` gap follows, and a `260px` content-fit Interaction Panel sits to its right. The panel is clamped to `60–180px` high and scrolls its own vertical overflow; mapping labels wrap naturally instead of ellipsizing. The main keeps its `34px` search surface, `30px` rows, `21px` section labels, and quiet `27px` footer.

**The Workspace Preservation Rule.** Every layout must occupy only the space required for the current task and must not turn into a full application window.

## Elevation & Depth

Depth comes from the rectangular near-black main surface, the matching Interaction Panel, faint inner highlights, restrained borders, and a soft panel shadow. Command rows stay transparent at rest and take only a low-contrast neutral hover fill. Keyboard selection is the strongest state: a light neutral row with dark foreground across primary and secondary text. Interaction mappings remain read-only and introduce no second selection state. Status and errors appear only as compact event feedback, never as a persistent help bar.

## Shapes

The outer main silhouette is a precise rectangle (`border-radius: 0`), because rounded transparent window surfaces are not paint-safe under the qualified Windows 11 build 26200 host compositor. The approved Interaction Panel exception uses Electron 36 `setShape(Rectangle[])` only while open: the native region is exactly the union of the `240×320` main rectangle and the actual content-fit panel rectangle at `x=256`. There is no connector or arrow region. The transparent gap and unused right-column pixels remain outside the native region and must pass through to Resolve. If `setShape` is unavailable or applying the union fails, the host fails closed and never leaves a `516×320` rectangular native window. On close, hide, and show recovery, it restores the exact pre-open main bounds and shape, including a right-edge clamp translation. The Interaction Panel may use an internal `8px` radius; the outer main and command rows remain precise list surfaces. Interface icons come from `lucide-react`, use a fixed `1.9px` absolute stroke width at a `14–16px` slot, and remain monochrome; the Clackly logo and mark remain custom SVG assets.

## Components

### Palette Composition

The Palette has no wordmark, colored identity line, or primary toolbar. Launcher and Search start with the search surface; Search is a separate DOM/content mode that renders only `RESULTS`, never Launcher sections. Its in-field `ESC` hint returns to Launcher, so Search has no duplicate footer Back affordance. Settings and Pin live at the left of the quiet Footer. A subdued Info control appears at the right for every selected Command. Clicking Info or pressing `Tab` while Command selection has focus explicitly opens the Interaction Panel; selection and hover never open it. The CLACKLY wordmark remains a project-owned path SVG with no `<text>` or font dependency where product identity is needed outside this Palette composition.

### Command Rows

Launcher projects its existing ranked top-nine commands into truthful `PINNED`, `RECENT`, and fallback `COMMANDS` sections without duplication or a second source of truth; empty sections are absent. Search presents only `RESULTS`. All Command rows use the same `30px` rhythm: command name first with a monochrome `16px` Lucide slot where needed, then weaker single-line metadata. Default rows suppress redundant category metadata, have no card border or gradient, and retain only real Launcher position keycaps `1–9`; Search retains `ESC`. Hover is a soft neutral fill while keyboard selection is the strongest light-neutral anchor. Empty catalogs and searches use honest empty states.

### Palette Footer

The `27px` footer is a weak separator within the continuous Palette surface rather than a floating card or dark toolbar. Settings and the push-pin control stay on the left. The Info icon stays on the right for every selected Command with normal, hover, and subdued active states; it uses no saturated accent. Search leaves the in-field `ESC` hint as its only Launcher-return affordance. There are no per-command shortcut badges, Favorites, History controls, or hidden compatibility triggers.

### Search

The search field is `34px` high with a neutral focus border. Result rows remain `30px` high with one-line registered name, category, lifecycle status, and pinned state; long metadata truncates instead of enlarging the list.

### Interaction Panel

The Interaction Panel answers either which valid input-to-action mappings exist for the currently selected Command or what that Command does. It derives rows from normalized bindings plus registered action Command labels and consumes the Palette's existing `selectedCommand`; it owns only local open/closed presentation state. More than one resolved interaction renders only the mapping rows; zero or one renders only the selected Command's registered description. It has no title, Command-name repetition, category, explanatory footer, search, row selection, hover model, acknowledgement, or empty state. The renderer sends only semantic open/close intent plus bounded integer `anchorY` and `contentHeight` measurements through the shared host helper; the host alone validates them, owns bounds/work-area clamping, and applies/restores the two-rectangle shape union. `Tab`, `Esc`, selection change, execution, and Palette close end the lifecycle before stale content can remain.

### Overflow and Event Feedback

Command labels remain single-line ellipses, while Interaction Panel action labels wrap naturally and present fully in roughly two lines. A custom tooltip is eligible for Command labels only after actual overflow detection: pointer hover waits about `450ms`, keyboard focus may reveal it immediately, and the readable `180–210px`, two-to-three-line surface is clamped inside the current BrowserWindow; native `title` remains a fallback. Status and failure feedback is an absolute compact toast with concise visible copy and full aria-live detail; error/status follows its existing clear or recovery path and may use up to three readable lines.

### Motion

Mode entry lasts about `120ms`; row hover/selection feedback lasts `80–120ms`. Reduced-motion environments remove motion while preserving immediate state changes.

## Do's and Don'ts

### Do:

- **Do** preserve complete keyboard operation and visible focus/selection.
- **Do** use CSS variables for every confirmed color and reusable measurement.
- **Do** preserve the path-only custom SVG wordmark and mark, and use `lucide-react` SVG components for interface icons.
- **Do** keep names single-line, selection obvious, and metadata progressively weaker.
- **Do** render only registered Command metadata and use the truthful empty state when none is available.

### Don't:

- **Don't** use large glow, full-orange rows, gradient text or decorative glass effects.
- **Don't** use SVG `<text>` or font-dependent rendering for the CLACKLY wordmark.
- **Don't** use radii above `16px`, oversized whitespace or card-heavy consumer layouts.
- **Don't** let UI code know how Resolve actions are implemented.
- **Don't** add a dedicated History control; history influences ranking instead.
