# Stabilize Clackly palette invocation and native window chrome

## Goal

Make repeated `Ctrl+Space` invocation of the Resolve-hosted Clackly palette appear once, at its final position and size, without a transient hide/show, resize/recenter flash, or renderer-owned colored outer stroke. Preserve the existing keyboard-first behavior and fixed footprint, and produce conclusive Resolve evidence before considering any Windows-native DWM helper.

## Background

- The palette's launcher, search, and all-actions modes are all fixed at `376x468` (`resolve-command-center/electron/main/window.js:4`).
- Despite that invariant, renderer mode changes still cross preload IPC and both Electron hosts, then call `setSize()` and `center()` (`resolve-command-center/electron/renderer/App.jsx:246`, `resolve-command-center/electron/main/preload.js:21`, `resolve-command-center/electron/main/window.js:128`).
- Every invocation repeats a launcher reset, size/center mutation, always-on-top mutation, `show()`, `focus()`, and a renderer reset notification (`resolve-command-center/electron/main/window.js:139`). Hiding reverses the always-on-top mutation (`resolve-command-center/electron/main/window.js:152`).
- A window `blur` event immediately hides any visible palette (`resolve-command-center/electron/main/window.js:77`), so redundant focus/native-style transitions can race the hide path.
- The programmatically focused palette root has `tabIndex={-1}` but no root-focus outline rule (`resolve-command-center/electron/renderer/App.jsx:400`, `resolve-command-center/electron/renderer/styles.css:96`). Renderer focus styling must be distinguished from DWM chrome.
- The archived Electron compatibility task already pinned Electron `36.3.2` and set `frame: false` plus `thickFrame: false`. Current Resolve observation shows that this alone did not make invocation stable or conclusively eliminate the transient orange/cyan edge.

## Requirements

### R1. Idempotent palette invocation

- Keep one fixed `376x468` palette size; mode changes alter renderer content only.
- Remove redundant visible-window resize/recenter work and repeated native always-on-top style changes from the hotkey path.
- Use one focus-producing show operation per invocation; do not stack `show()` and an unconditional second focus operation.
- Keep the palette hidden at startup, skipped from the taskbar, above Resolve while visible, and centered at its intended invocation position.
- Preserve `Escape`, successful-command, successful-interaction, and hotkey-toggle hiding.
- Preserve blur-to-hide after the palette has genuinely received focus; ignore only a proven same-invocation transient blur if event tracing shows that guard is still necessary.

### R2. Correctly classify and remove the colored edge

- Explicitly suppress the non-interactive palette shell's default renderer focus outline while retaining visible focus for interactive controls.
- Validate renderer-only and full native-window captures separately in Resolve Workflow Integration.
- If the colored edge disappears after the JS/CSS lifecycle cleanup, do not add native interop.
- If a full-window capture proves an edge remains outside renderer bounds, record the evidence and create a separately approved follow-up task for a narrowly scoped Windows-only DWM suppression path.

### R3. Shared-host behavior and regression coverage

- Keep standalone Electron and Resolve Workflow Integration on the same shared window helper contract.
- Update the frontend spec so it no longer requires semantic mode IPC solely to reapply an identical fixed size.
- Add focused tests for the invocation call sequence, removed/retained IPC boundary, fixed window options, focus/blur behavior, and any native fallback boundary selected during implementation.
- Validate against the qualified Resolve 20.3.2.9 / Electron 36.3.2 host, not only local Electron.

## Acceptance Criteria

- [x] Ten consecutive `Ctrl+Space` show/hide cycles in Resolve display the palette directly at one stable size and position, with no visible intermediate resize, recenter, duplicate focus flash, or immediate self-hide.
- [x] Launcher, Search, and All Actions remain `376x468`, keyboard-operable, and do not trigger BrowserWindow size/position work when switching modes.
- [x] The palette remains above Resolve while visible, stays absent from the taskbar, and reliably hides on `Escape`, toggle, successful execution, and genuine focus loss.
- [x] A renderer capture has no shell-level orange/blue focus outline; buttons, inputs, and other interactive controls retain their intended `:focus-visible` indicators.
- [x] Full Resolve-hosted native-window captures cover first show, repeated show, keyboard focus, and mouse interaction; they either show no remaining orange/cyan outer stroke or conclusively locate a remaining stroke outside renderer bounds and seed the approved native-helper follow-up.
- [x] Standalone Electron and Workflow Integration share the same tested invocation behavior.
- [x] Targeted window/renderer tests, `npm test`, `npm run build`, `npm run package:win`, and `npm run package:verify` pass.
- [x] The packaged Workflow Integration build is installed and manually validated in Resolve after the user confirms Resolve can be safely restarted.

## Out of Scope

- Resizable or mode-dependent palette dimensions.
- A general-purpose window state machine or speculative multi-window framework.
- Redesigning launcher visuals or changing command behavior.
- Supporting unqualified Resolve/Electron versions or macOS native chrome in this task.
- Adding Windows-native DWM interop in this task; confirmed native chrome becomes a separately planned and approved follow-up.

## Key Decisions

- On 2026-08-06 the user chose the staged approach: this task fixes the JS/CSS lifecycle root cause and performs live boundary classification. A Windows-native DWM helper is created only as a separate follow-up if full-window evidence still proves it is necessary.
- The existing blur-to-hide behavior remains unless an event-order trace proves that a same-invocation transient blur still needs a narrow focus-armed guard.
- Identical fixed mode sizes do not justify a renderer-to-main resizing IPC or a general window state machine.
