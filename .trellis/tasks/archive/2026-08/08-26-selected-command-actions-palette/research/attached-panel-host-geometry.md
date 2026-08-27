# Attached Actions Panel Host Geometry — Architecture Stop

## Decision Status

**Resolved 2026-08-26: Candidate A is approved.** The prior ADR stop is closed
for this one implementation. Electron 36 `setShape(Rectangle[])` may be used
only for the main rectangle + actual panel rectangle + smallest arrow-envelope
rectangle union described here. A packaged Windows 11 26200/Resolve manual A/B
remains mandatory before native acceptance; headless evidence cannot prove the
native edge or hit region.

The requested `240px main + 6px gap + ~176px content-fit Actions Panel` cannot be shipped safely inside the existing single rectangular BrowserWindow while preserving all of these requirements together:

- a content-fit side panel shorter than the 320px main surface;
- no visually transparent region that blocks Resolve pointer input;
- the existing Windows 11 build 26200 compositor contract;
- no child/popup BrowserWindow architecture;
- no general or per-region mouse-routing protocol.

No product source was changed during this assessment.

## Repository Evidence

- `electron/main/window.js` owns the single `PALETTE_SIZE`, cursor-near flip/clamp, focus, opacity, show/hide, and whole-window mouse hit testing. Standalone Electron and Workflow Integration share this helper.
- The existing only mouse pass-through mechanism is `BrowserWindow.setIgnoreMouseEvents(...)`, which applies to the whole HWND. The renderer cannot create native click-through subregions with CSS `pointer-events`.
- Electron 36.3.2 exposes experimental `BrowserWindow.setShape(Rectangle[])`. Its contract says pixels and mouse events outside the rectangle union fall through to the window behind it.
- The project spec and archived Windows 11 build 26200 compositor investigation explicitly forbid `setShape` after shaped-window experiments produced aliased/unstable native edges. The accepted contract is `roundedCorners: false` plus a rectangular renderer surface.
- Expanding one rectangular HWND to `422×320` while drawing a shorter right panel necessarily leaves transparent pixels below/around the panel. Without `setShape`, those pixels remain part of the HWND and block Resolve input.
- Dynamically toggling whole-window `setIgnoreMouseEvents` based on pointer position is not safe: it introduces click races, continuous renderer/host coordination, and conflicts with the keyboard-first focus model.

The independent Impeccable layout detector returned no mechanical findings for the current `App.jsx` / `styles.css`; the failure is native topology and hit testing, not a CSS layout warning.

## ADR Candidates

### A — Single Window with a Narrow `setShape` Exception

Use a `Rectangle[]` union for the full `240×320` main surface and the actual content-fit Actions Panel rectangle. The 6px gap and unused right-column area become outside the native region and pass through to Resolve.

Benefits:

- one HWND and one renderer;
- existing focus, keyboard, blur/hide, z-order and lifecycle remain structurally intact;
- attached anchor, triangle, tooltip and status can stay renderer-local.

Costs / required proof:

- reverses a qualified production prohibition for one experimental Electron API;
- requires packaged Windows 11 build 26200 and Resolve-host A/B for native edge quality, white/cyan pixels, DWM composition, region updates and input pass-through;
- spec must narrow the prohibition to rounded/stepped shapes and explicitly authorize only this two-rectangle union after host acceptance;
- open/close and content-height changes require idempotent host-owned bounds/shape transitions.

### B — Dedicated Child/Popup BrowserWindow

Keep the main HWND fixed at `240×320` and create a second content-sized Actions window positioned 6px to its right.

Benefits:

- no transparent hit-test dead area;
- preserves the existing rectangular native surface contract;
- panel bounds naturally match content.

Costs / decisions:

- main-window blur currently hides the Palette, so focus transfer to the child would hide its parent unless lifecycle semantics are redesigned;
- Escape/Ctrl+K, focus restoration, hide/reveal, z-order, always-on-top, multi-monitor/DPI positioning and parent-child teardown need explicit ownership;
- both standalone and Workflow hosts must create and coordinate the child through the shared window layer;
- this is a real window-architecture expansion and requires separate packaged/Resolve validation.

## Shared Geometry Notes

- The expanded envelope target is `422×320`; main-left/panel-right should remain invariant.
- Reusing the current right-edge flip would move the complete surface too far left. Expanded positioning should minimally translate/clamp the full envelope inside the work area rather than swap panel sides.
- Renderer may report only semantic open/close plus bounded presentation measurements such as anchor Y and content height. Main owns absolute bounds, work-area clamp and any native shape/window creation.
- Selected-row anchor, triangle, long-label tooltip and transient status remain renderer presentation concerns after the HWND topology is decided.

## Implementation Gate

Do not repair the current page-replacement implementation until the user chooses candidate A or B. Do not substitute a full-height fake panel, a permanently expanded transparent host, or dynamic whole-window mouse-ignore routing.
