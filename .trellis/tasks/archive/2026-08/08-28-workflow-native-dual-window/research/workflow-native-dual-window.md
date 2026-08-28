# Workflow Native Dual-Window Research

## Scope and evidence status

This research plans the user-selected unified Windows rollout of the manually accepted standalone D6/D7 behavior from `f59566a`. Windows Workflow, development standalone, normal/built standalone, and packaged standalone will share the same product policy. It is not Resolve acceptance evidence. No Electron or Resolve process was launched during planning.

## Confirmed repository facts

| Topic | Evidence anchor | Finding |
| --- | --- | --- |
| Accepted D6/D7 and focus prevention | `.trellis/tasks/archive/2026-08/08-28-d6-d7-native-window-stabilization/evidence.md` | Standalone manual acceptance covers the opaque main, real Panel gap, no-state close, constructor-only Panel focusability, and focused stale-blur guard. The temporary recorder was retired. |
| Isolated pre-unification gate | `resolve-command-center/electron/main/main.js:31-39` | Before this task, only Windows, unpackaged `--dev-renderer` creates the D6 surface, D7 mode, and focused-blur guard. The user selected replacing this with one Windows policy. |
| Workflow composition point | `resolve-command-center/workflow-plugin/main.js:147-195,259-266` | Workflow calls no-option `showPaletteWindow`, `hidePaletteWindow`, and `registerInteractionPanelIpc`, then passes the no-option `createPaletteWindow` into `composeStartup`; this is the second composition root that must select the shared Windows policy. |
| Shared native contracts | `resolve-command-center/electron/main/window.js:257-342,419-529,575-610` | The helper already contains D6/D7 constructor, geometry, bounded snapshot, readiness, opacity/mouse lifecycle, no-state close, failure restore, focus, and stale-blur mechanisms; the policy selects them. |
| Detached renderer boundary | `resolve-command-center/electron/main/preload.js:3-19`; `electron/renderer/DetachedInteractionPanelApp.jsx:4-17`; `interactionPanelPresentation.mjs:1-10` | The detached preload exposes only presentation subscription; the renderer reuses presentation markup and receives only mappings or description. |
| Main renderer behavior | `resolve-command-center/electron/renderer/App.jsx:56-59,346-389,498-535,710-729` | The Electron-host-only D7 marker suppresses attached Panel painting while retaining main-local open state and Info/Tab/Escape; it passes bounded metrics plus presentation only in D7. |
| Preview parity gap | `resolve-command-center/electron/renderer/browserPreview.mjs:76-101`; `styles.css:131-158,358-400`; `App.jsx:48-58,710-729` | Preview repeats Panel inset/height/main-height constants, retains a padded shell, and uses attached DOM markup. It already shares `InteractionPanelContent` and Palette CSS, but must import the canonical geometry/visual contract and explicitly simulate the native visual composition. |
| Workflow lifecycle distinction | `resolve-command-center/workflow-plugin/main.js:31,48-96,225-275` | Workflow has distinct app-data, Resolve bridge initialization, ResolveQuit cleanup, capability injection, and no standalone `activate` handler. |
| Existing automated coverage | `resolve-command-center/electron/main/window.test.js:371-803,883-948,1229-1288`; `composeStartup.test.js:120-151`; renderer diagnostic/presentation tests | Existing tests cover standalone D6/D7 behavior and actively assert Workflow isolation; these tests must be revised into an explicit host-policy matrix rather than simply deleting the isolation assertion. |
| Development install | `resolve-command-center/package.json:8-18`; `scripts/install-workflow-plugin.ps1:1-75`; `README.md` Workflow and Local Development sections | `npm run build` then `npm run workflow:install` builds renderer, copies the Resolve-provided Workflow native module, and installs the source plugin through the supported path. Resolve must be restarted and Clackly loaded from `Workspace > Workflow Integrations`. |
| Historical spec conflict | `.trellis/spec/frontend/quality-guidelines.md:52,116` | The pre-D6/D7 transparent single-window guidance still describes transparent native corners and says the Interaction Hint does not authorize a second window. The current user-approved D6/D7 outcome supersedes that historical constraint for the Windows Workflow policy; planning must not modify the concurrently dirty spec file. |

## Inferences and implementation implications

1. **Use one Windows host-owned policy.** Every Windows native composition root must declare the same D6/D7 product policy. Renderer URL and `app.isPackaged` are testing dimensions, not surface-selection inputs. Non-Windows fallback exists only because DWM contracts are unavailable.
2. **Extract shared orchestration only where it prevents drift.** Workflow and standalone need the same persistent Panel ownership: create/retain/recreate Panel, close it before main hide/reveal and main blur cleanup, pass a detached IPC controller, and restore main bounds on failure. A small shared controller/profile adapter is preferable to independently evolving copies, while each host retains its integration-specific lifecycle.
3. **Make preview visual parity source-driven, not native.** The present bounded snapshot and shared content view already satisfy the detached data boundary. Move preview's copied geometry into a shared visual contract; use it for native geometry, React CSS variables, and the DOM preview stage. Preserve the hostless guard so browser query text cannot grant native authority.
4. **Fail closed before touching main geometry.** Missing/destroyed/unready Panel, invalid request, geometry failure, or presentation-send failure must result in `null`/closed Panel. A no-state close does no native work; an active failure clears the Panel, restores original main bounds, and only restores main focus when explicitly required and absent.
5. **Resolve-specific manual risks remain.** Resolve's Workflow loading, global shortcut ownership, topmost/z-order, focus events, and DWM composition cannot be simulated by Node or browser tests. The source plugin must be installed after automated validation before asking the user for a full restart and manual test.
6. **Reconcile the historical spec only with evidence.** During the eventual Phase 3 spec-update gate, add a narrowly scoped Windows native-dual-window contract (or replace the stale prohibition in a task-owned hunk) only after the manual host result is known. Do not overwrite the existing unrelated quality-guideline edits during this planning turn.

## Policy matrix to implement

| Host / platform | Main policy | Interaction Panel | Status |
| --- | --- | --- | --- |
| Windows standalone dev, normal/built standalone, and packaged standalone | Unified D6 opaque full-bleed policy | Unified D7 detached native Panel | Dev reference manually accepted; normal/package construction and lifecycle need automated regression coverage. |
| Windows Resolve Workflow Integration | Unified D6 opaque full-bleed policy | Unified D7 detached native Panel | Target of this task; manual Resolve acceptance pending. |
| Non-Windows Workflow and standalone | Compatible transparent attached fallback | Attached Panel | Preserve because Windows DWM is unavailable, not because the visual design differs. |
| Root browser preview | Shared DOM visual simulation of D6 | Shared DOM simulation of D7 layout/content | Must gain shared-token parity; never native acceptance evidence. |
| Settings | Existing transparent square Settings window | None | Preserve. |

## Rejected approaches

- Mica, DWM Cloak through a PowerShell helper, minimize/restore, and native hide/show transitions failed earlier diagnostics or violate the accepted immediate persistent-opacity lifecycle.
- Enlarging one Mica-backed native window cannot retain the transparent physical gap: the DWM material fills the complete BrowserWindow rectangle.
- Treating an observed blur effect as UI design is incorrect. This task concerns native focus-loss events only; visible motion/flicker is not a desired effect.
- Keeping browser preview on copied geometry or a separate visual composition would contradict the user's explicit all-unified decision. A DOM stage may emulate DWM appearance, but it must not claim DWM behavior.
