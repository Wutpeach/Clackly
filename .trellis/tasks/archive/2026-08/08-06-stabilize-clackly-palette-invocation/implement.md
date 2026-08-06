# Implementation Plan

1. Add focused tests that record the current palette create/show/hide call sequence and fail on visible-window resize/recenter, duplicate focus, and repeated always-on-top mutation.
2. Collapse the three identical palette size entries to one fixed footprint and remove the renderer-to-main semantic mode sizing path after a final caller search.
3. Make palette construction own fixed size, initial centering, taskbar behavior, and the stable topmost policy; reduce show/hide to the minimum visibility and notification calls.
4. Preserve current blur-to-hide first. Run an event-order probe in the qualified Resolve host and add a focus-armed guard only if a same-invocation transient blur still reproduces.
5. Add a `.palette-shell` focus rule that removes only the shell's default outline, leaving existing control focus-visible rules intact.
6. Update `.trellis/spec/frontend/quality-guidelines.md`, preload/API tests, host IPC tests, and renderer tests to describe content-only mode changes and the stable invocation contract.
7. Run targeted tests, `npm test`, and `npm run build`; inspect the diff for deleted IPC/callers and unchanged command behavior.
8. Build and verify the Windows package, then ask before restarting Resolve or installing the Workflow Integration package.
9. In Resolve, perform ten show/hide cycles and capture both renderer-only and full-window evidence across keyboard and mouse focus transitions.
10. If and only if the full-window evidence still proves a DWM border, append the evidence to task research and create a focused native-helper follow-up; do not add native interop to this task.

## Validation Commands

Run from `resolve-command-center`:

```powershell
node --test electron/main/*.test.js electron/renderer/*.test.mjs
npm test
npm run build
npm run package:win
npm run package:verify
```

Final boundary searches:

```powershell
rg -n "palette:set-mode|setPaletteMode|setPaletteWindowMode|PALETTE_SIZES" electron workflow-plugin .
rg -n "setSize|center|setAlwaysOnTop|\.focus\(" electron/main/window.js
```

## Review and Rollback Gates

- Before live validation: confirm only the planned window/preload/renderer/spec/test files and generated package output changed.
- Before Resolve restart/install: obtain explicit user confirmation that the current Resolve project is safe.
- If native fallback is required: verify the follow-up contains the qualified host evidence, packaging constraints, failure behavior, and rollback questions before closing this task.
- Final: confirm the full acceptance matrix in both standalone Electron and Resolve Workflow Integration.
