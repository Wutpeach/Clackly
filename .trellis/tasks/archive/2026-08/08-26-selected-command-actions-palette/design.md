# Technical Design

> **2026-08-26 approved repair.** Replace the rejected internal Actions page with
> an attached right panel: main-left `240×320`, `6px` visual gap, `176px`
> content-fit panel, maximum panel height about `304px`, and `422×320` only while
> open. The selected Command and its mode/query/selection remain visible and
> frozen beneath independent local Action state. Renderer requests only semantic
> open/close with bounded anchor/content measurements; the shared host helper
> validates them, clamps the expanded envelope, and applies/restores the narrow
> rectangle-union shape. Persistent help/status bars are replaced by
> overflow-only accessible tooltips and transient event feedback.

## Approach

Treat Actions as a renderer-local UI context layered over the existing launcher/search state, not as a fourth command mode and not as a domain feature. `actionsOpen` freezes the current Command context while independent Action query/selection/hover state drives a first-level searchable list.

## State Ownership

`PaletteApp` owns:

- `actionsOpen`
- `actionQuery`
- `selectedActionIndex`
- `hoveredActionIndex` or an equivalent local stable key
- local Action acknowledgement text

Existing `mode`, `query`, `selectedIndex`, `pinnedIds`, `recentIds`, catalog, lifecycle, and execution callbacks remain unchanged and authoritative. Opening Actions does not mutate them; closing Actions clears only Action state and returns focus to the prior Command context.

## Presentation Data Flow

1. Resolve `selectedCommand` through the existing active Command list and `selectedIndex`.
2. Read Actions rows only from an explicitly isolated renderer-local presentation source. In production, that source may be empty until a formal Action contract is approved.
3. For populated developer/Playwright validation, inject clearly labelled test-only rows at the renderer boundary; never derive them from `getInteractionHelp()`.
4. Apply local case-insensitive substring filtering across temporary `label` and optional `description` fields.
5. Clamp/reset the independent Action selection when the filtered result changes.
6. Render rows directly from this disposable adapter. No persisted object, production registry, IPC payload, or formal schema is created.

The adapter remains local to the renderer feature or developer/test harness and must be named/documented as temporary presentation data. It must not be exported from `model.mjs`, reused by Interaction Help, or treated as domain authority.

## Keyboard and Focus Flow

- Shell-level `Ctrl+K` toggles Actions only when a selected Command exists. The footer calls the same local transition.
- Opening clears Command hover, resets Action query/selection, focuses the Action input, and makes the preserved main surface inert without replacing its DOM.
- While open, the Actions branch handles typing, Arrow Up/Down, Enter, Escape, and Ctrl+K before the main Command keyboard branch.
- Enter updates a polite local acknowledgement such as `Selected <label> — execution is not connected in this preview`; it does not call `executeCommand` or `executeInteraction`.
- Escape or Ctrl+K closes Actions, clears local Action state, and restores focus without changing the prior Command mode/query/selected index.
- `palette:shown` closes Actions as part of the existing renderer reset lifecycle.

## Composition

- Main Launcher/Search remains visibly rendered in the fixed `240×320` left rectangle. Its footer keeps Settings and Pin weak at left, with two real keycap elements (`Ctrl`, `K`) plus `Actions` at right.
- Actions renders at `x=246` as a `176px` right panel in the temporary `422×320` envelope. It has a `34px` fixed search, weak `ACTIONS` label, `30px` rows, content-fit `65–304px` height, selected-row anchor clamped inside the main height, and only its list scrolls. A subtle `7×14px` triangle points at the selected Command row.
- Action rows use a distinct class/semantic listbox so Command Enter/click routing cannot accidentally execute. Main and panel selected rows may be visible together.
- Interaction Help stays off-layout as accessible description text. Status/error/executing/acknowledgement uses a compact absolute feedback surface; only normal acknowledgement auto-dismisses, while errors retain existing clear/recovery semantics and clamp to up to three readable lines. Long labels receive only an overflow-detected, delayed or focus-triggered custom tooltip clamped inside the current window.

## Shared Host Intent and Shape Ownership

- Renderer sends only `palette:attached-actions:open` with bounded integer `{ anchorY, contentHeight }`, plus semantic close. It does not send bounds, screen position, panel width, shapes, or hit-test rules.
- Shared standalone and Workflow host code validates metrics, captures exact first-open base bounds, clamps the full main-left `422×320` envelope inside the current work area without moving the panel left, and applies the union of main, actual panel and minimal arrow rectangles through Electron 36 `setShape`.
- Transparent gap and unused right-column pixels are deliberately outside the native shape. Missing or failed `setShape` fails closed without an expanded rectangle. Repeated opens are idempotent and retain the original base; close, hide and later show restore that exact `240×320` bounds/shape.

## All Actions Removal

Remove the exposed all-actions mode JSX, footer branch, grouped/A–Z state/effects, and dedicated CSS. Keep `groupCommands` / `getCommandGroup` pure helpers and existing tests unless another live consumer proves they can be safely removed without scope expansion. Split shared CSS selector groups before deleting all-actions-only selectors.

## Persistent Playwright Tool

Add a narrow developer script under the package's existing scripts/test support, backed by a pinned Playwright dependency appropriate for the Windows/Edge environment. It:

- defaults to headless Chromium/Edge;
- statically serves built or packaged `dist/renderer`;
- reads real visible Commands from the registry;
- injects host API/lifecycle/binding responses only through the browser context;
- exposes scenario selection and output directory arguments;
- records screenshots, assertions, console/page errors, viewport geometry, and action-call spies;
- requires an explicit `--headed` opt-in for any visible browser.

This is a Palette capture/check utility, not a production catalog, native Electron test, or pixel-baseline CI system.

## Compatibility and Boundaries

- `PALETTE_SIZE`, global shortcut, Command Engine, runtime, Resolve providers, Workflow lifecycle, Settings and one-BrowserWindow topology remain unchanged. The minimum shared preload/IPC/main addition is attached-panel semantic intent and host geometry only.
- Interaction Help retains its independent accessible-description flow and is never repurposed as Actions data.
- Browser evidence proves packaged renderer DOM/CSS/keyboard/pointer behavior only. Native DWM/compositor, `setShape` edge quality and transparent-gap hit testing, cursor placement, focus, installation, Workflow lifecycle, and actual Resolve execution remain final handoff checks.

## Rollback

Rollback is limited to `App.jsx`, Palette-scoped CSS, renderer-facing tests/docs, and the Playwright developer utility/dependency. The existing 240×320 Command Palette, window/runtime architecture, and persisted data require no migration.
