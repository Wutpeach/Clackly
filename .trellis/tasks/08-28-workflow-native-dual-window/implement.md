# Implementation Plan: Workflow Native Dual-Window

## Preconditions and ownership

- Stay in planning until this final summary receives fresh user approval; do not run `task.py start` yet.
- Preserve unrelated dirty Agentation/browser-preview/package/spec/DESIGN and `.agents`/`.claude` work. Stage only the eventual policy, Workflow host, focused test, and task-owned artifact hunks.
- Do not launch Electron or Resolve during implementation automation. Do not add Mica, Cloak, PowerShell, native add-ons, subprocesses, dependencies, or visible-motion lifecycle calls.

## Ordered implementation

1. Introduce a small explicit, unit-testable window-host policy selector. It maps Windows Workflow plus every Windows standalone execution form (dev, built renderer, and packaged) to D6/D7 independently of renderer URL or `app.isPackaged`; non-Windows maps to the supported attached fallback without deep `argv` lookup in shared window code.
2. Refactor only enough shared D6/D7 orchestration to let all Windows native entries use one detached Panel lifecycle. Keep source-specific Workflow/Resolve initialization, capability, hotkey, Settings, and cleanup code in `workflow-plugin/main.js`, and standalone bridge/single-instance/activate ownership in `electron/main/main.js`.
3. Apply the policy at both composition roots. Wire policy-aware main creation, Panel ensure/recreation, detached IPC controller, show/hide cleanup, main-blur cleanup, and D6 positioning for Windows. Preserve compatible attached behavior on non-Windows only.
4. Expand the shared Palette visual contract and move browser preview's copied Panel geometry into it. Derive native options/geometry, preview metrics, React CSS variables, `#151619`, radii, gap, and visual shadow specification from that source. Keep one shared `InteractionPanelContent`; preview simulates the detached layout in DOM without gaining native authority.
5. Keep the existing bounded renderer/preload snapshot contract. If marker names become product-neutral policy names, update main, renderer policy helper, and focused tests together while retaining the injected-Electron guard and browser-preview/Settings exclusions.
6. Extend tests before manual host validation:
   - pure policy matrix covering Windows Workflow/dev/built/packaged entries, non-Windows fallback, and no renderer-URL/package-state policy drift;
   - exact Windows D6/D7 BrowserWindow contracts, renderer marker, no base shape, D6 cursor/work-area geometry, and physical 16px no-window gap;
   - Panel readiness/no-native-transition, open/update/close idempotence, no-state close, permanent nonfocusability, focus retention, stale-versus-real blur, destroyed/recreated Panel, and fail-closed restoration;
   - bounded semantic request/presentation rejection and detached preload authority;
   - browser-preview visual parity: shared geometry/token imports, exact main/Panel footprint/radii/surface/gap/height rules, shared content view, CSS shadow staging, and explicit hostless/native-boundary assertions;
   - unchanged Settings and non-Windows compatible fallback renderer/content contracts.
7. Run headless browser evidence for the root preview after unit tests to compare the closed main and open Panel visual composition. Record it only as DOM visual parity evidence, not native validation.
8. Run Windows package/static verification without installation: cover packaged-state policy in unit tests, run the existing package verifier, and—when the planned package build is part of the automated gate—run `npm run package:win` plus `npm run package:verify` without `workflow:install:package`.
9. Review source diffs and task criteria. Do not request manual testing until all automated gates pass.
10. Build and install the source Workflow plugin, then hand off the exact Resolve restart/manual checklist. Treat any host issue as pending evidence, not acceptance.
11. At the later Phase 3 spec-update gate, reconcile the historical transparent/single-window wording in `.trellis/spec/frontend/quality-guidelines.md` through a task-owned hunk only after the manual Workflow result is known. Do not disturb the pre-existing dirty spec work.

## Validation commands

Run from `resolve-command-center/` unless noted otherwise:

```powershell
node --test electron/main/window.test.js electron/main/composeStartup.test.js electron/main/composition.test.js electron/renderer/paletteDiagnostic.test.mjs electron/renderer/interactionPanelPresentation.test.mjs
node --check electron/main/main.js electron/main/window.js electron/main/preload.js workflow-plugin/main.js
npm test
npm run build
node scripts/verify-package.js
git diff --check
```

Run focused source and boundary searches to prove that all Windows native entries select the one policy regardless of renderer URL/package state; non-Windows alone retains attached fallback; browser preview consumes the shared visual contract but lacks native authority; Settings lacks native-policy markers; no Mica/Cloak/PowerShell/timer/native-add-on path exists; and detached Panel lifecycle has no post-constructor `setFocusable`, `show`, `hide`, `minimize`, or `restore` call.

When the automated package gate is authorized for this implementation, also run:

```powershell
npm run package:win
npm run package:verify
```

This builds and verifies a local artifact only. Do not run `npm run workflow:install:package` as part of the immediate Resolve acceptance.

After the automated gate passes, perform the developer source-plugin handoff:

```powershell
npm run build
npm run workflow:install
```

The install command is a state-changing developer handoff and is intentionally after test/build review. It must not run during planning.

## Manual Workflow/Resolve handoff

1. Fully exit and restart DaVinci Resolve Studio.
2. Load **Clackly** from `Workspace > Workflow Integrations`.
3. With the Interaction Panel closed, invoke the Palette shortcut 10–20 times. Confirm immediate stable reveal/hide, native rounded corners and shadow, correct cursor placement, no cyan/white native edge, no backing rectangle, no focus failure, and no scale/fade/visual-blur/translation/taskbar animation/flicker.
4. Open Info by click and by `Tab`. Confirm a detached opaque Panel appears to the right with a true 16px physical gap, native corners/shadow, correct bounded height/anchor, and main Palette focus/selection retained.
5. Close by `Tab` and `Escape`; change selection or query; execute a command/interaction; hide the Palette. Confirm the Panel clears/closes, the main restores its original position, and the next reveal is stable.
6. Open Settings and browser preview separately only as regression checks; they must retain their existing appearance and behavior.

Do not characterize this task as accepted until the user reports this installed Workflow-host test. If a future real Resolve smoke is authorized, use local projects only.

## Review and rollback gates

- **Before installation:** all automated validation green; staged diff contains only task-owned product changes/tests/docs; no unrelated dirty path is staged.
- **Before manual acceptance:** source plugin installation completed after build; Resolve restart required.
- **Rollback trigger:** any native backing, occupied gap, visual motion/flicker, focus failure, geometry leak, or failed cleanup. Reverse the unified Windows policy selection; do not bring back rejected Mica/Cloak/minimize/hide-show experiments.
