# Repository Research: Selected Command Actions Palette

## 2026-08-26 Attached Panel Resolution

The user selected ADR candidate A from `attached-panel-host-geometry.md`: one
BrowserWindow with a narrowly scoped Electron 36 rectangle-union `setShape`
exception. The normal native region is the 240×320 main rectangle. While local
Actions is open, the host alone expands to a clamped 422×320 envelope and sets a
union of the main, actual content-fit panel, and minimal arrow-envelope
rectangles so transparent gap/unused right-column pixels pass through. This
supersedes the page-replacement and no-adjacent-panel statements retained below
as historical research; it does not authorize other shape workarounds, another
window, or arbitrary renderer bounds.

## Current Renderer

- `electron/renderer/App.jsx` owns Launcher/Search, main query/selection, hover, Pin/Recent, execution, lifecycle, Actions local state, tooltip and transient feedback presentation.
- Ctrl+K toggles the renderer-local panel only while the Palette is focused; the host-wide Palette shortcut remains Ctrl+Space.
- The All Actions grouped/A–Z browser is removed. The main remains visible at `240×320`; Actions is an independent right-attached panel with its own search/selection/hover and browser-only test presentation input.

## Existing Contextual Action Source

- `getInteractionHelp(command, commands, bindings)` returns per-command binding labels and registered target descriptions, but product direction explicitly keeps it as off-layout accessible description text. It must not become the Actions data authority.
- With no production Action registry/schema, the safe shell boundary is an empty production presentation source plus explicitly isolated developer/test-only populated rows for visual and interaction validation.
- `executeInteraction` is not safe for the preview Enter shell because it can perform real work and hide the Palette. Enter must remain a renderer-local acknowledgement until a formal Action execution contract is approved.
- `getInteractionHelpCommands` is capability/Settings-oriented and is not the correct selected-Command dimension.

## Minimal Change Surface

- Primary: `electron/renderer/App.jsx`, Palette-scoped areas of `styles.css`, and the shared attached-panel helper in `electron/main/window.js`.
- Required host bridge: the existing preload API plus standalone and Workflow IPC registration use only semantic `palette:attached-actions:open/close` intent; the host validates anchor/content metrics and owns window bounds/shapes.
- Conditional tests/docs: renderer/window tests, `DESIGN.md`, `.trellis/spec/frontend/quality-guidelines.md`, README and task artifacts.
- Persistent validation support: one narrow Playwright developer command and its development dependency/configuration.
- Unchanged: command manifests/model authority, Command Engine, runtime/Resolve providers, Settings renderer, PALETTE_SIZE, global hotkey and one-BrowserWindow topology.

## Main Risks

- Action keyboard input leaking into main Command search/selection.
- Action Enter accidentally calling Command/interaction execution.
- Deleting CSS selectors shared by All Actions and live launcher/search/Settings surfaces.
- Temporary presentation rows becoming an implied production Action schema.
- an attached transparent gap or unused right column blocking Resolve input if the native shape is not exact; native DWM/shape quality needs the separately permissioned packaged Resolve A/B.

## Architecture Stop Conditions

Stop for an Architecture Decision Request if implementation requires real Action execution, a production Action registry/schema, persistence, host-wide Ctrl+K outside the open Palette, a second window, arbitrary bounds/shapes, or a broader `setShape` use than the approved main/panel/minimal-arrow union.
