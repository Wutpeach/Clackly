# Unified Windows Native Dual-Window Palette

## Goal

Use one D6/D7 product policy for every Windows native Palette entry—Resolve Workflow, standalone development, normal standalone, and packaged standalone—so the formal host and the browser preview share one visual specification instead of drifting. The Windows product result is an immediate, stable opaque native-corner `240x320` main Palette and a detached, permanently nonfocusable Interaction Panel with a real 16px gap. Browser preview simulates that visual contract in DOM; it does not claim native-window validation.

## Background and confirmed facts

- Commit `f59566a` manually accepted the Windows D6/D7 reference: opaque `#151619`, full-bleed `240x320` main with DWM rounded corners/shadow; a second opaque Panel with a real 16px gap; and immediate persistent opacity `0/1` state changes.
- The focus evidence established four non-negotiable safeguards: a no-state detached close has no native side effects; the Panel sets `focusable:false` only at construction; native D7 ignores a blur only when the main is already focused; a genuine unfocused blur still hides the Palette.
- The completed implementation selects one explicit Windows product policy shared by Workflow and every standalone execution form, without relying on dev-renderer arguments to select native surface behavior.
- The renderer shares the main Palette and Interaction Panel content view between host contexts, and the browser preview now consumes the canonical geometry/visual contract as a hostless DOM simulation.
- Resolve 20.3.2.9 with Electron 36.3.2 on Windows is the qualified native-host baseline. Browser or Node evidence cannot establish DWM, HWND, focus, hit testing, z-order, or Resolve acceptance.
- The source Workflow-plugin handoff completed with `npm run build` then `npm run workflow:install`, followed by a full Resolve restart and loading Clackly from `Workspace > Workflow Integrations`. The user reported `效果不错，提交并且归档任务吧`; this accepts source Workflow on Windows only. Packaged-distribution installation is a later rollout step and remains untested.

## Requirements

1. A pure, explicit host/platform policy must select D6/D7 for all Windows native entries: Resolve Workflow, standalone `npm run dev`, normal built-renderer standalone, and packaged standalone. The dev-renderer flag may choose the renderer URL only; it must not be the product-surface decision.
2. Every Windows native main Palette must use the accepted D6 contract: `240x320`, `transparent:false`, `backgroundColor:"#151619"`, `roundedCorners:true`, `thickFrame:true`, `frame:false`, no Mica, no base `setShape`, full-bleed renderer at `0,0`, native DWM shadow/corners, and the existing persistent immediate opacity reveal/conceal lifecycle.
3. Every Windows native Interaction Panel must use the accepted D7 contract: a persistent opaque `260px`-wide native window, content height bounded to `60–180px`, `focusable:false` only at construction, `show:true` plus `opacity:0` initially, mouse ignored while closed, and a physical 16px gap. It must use no Mica, native shape, hide/show/minimize/restore cycle, or focusability toggle after construction.
4. Browser preview must render the same visual specification from shared sources: the `240x320` main, `#151619` surface, 8px main / 4px Panel painted radii, native-equivalent external-shadow appearance, a visually physical 16px gap, the `260px` Panel, the same content/height clamp/anchor rules, and the same shared Interaction Panel content view. Its shadow staging is a DOM presentation aid, never native geometry.
5. The main renderer remains the sole selection, interaction-help, query, and execution authority. The detached renderer receives only the existing bounded mappings-or-description snapshot. Browser preview remains hostless and non-executable; it may simulate layout/content but cannot claim HWND, DWM, focus, hit-testing, z-order, or Resolve behavior.
6. Opening, updating, closing, hiding, and renderer-readiness failure must fail closed: the Panel is noninteractive and invisible, stale presentation is cleared, any temporary main translation is restored, and the usable main Palette is neither hidden nor unfocused by a failed Panel operation.
7. A no-state detached close remains a native no-op. The D7 stale-blur guard applies only to the Windows native policy and only when `mainWindow.isFocused()` is true; a real focus-loss event retains the established hide behavior.
8. Non-Windows Workflow and standalone Electron retain the supported transparent attached fallback because Windows DWM contracts do not exist there. This is platform compatibility, not an intentional visual-design fork; their renderer content and shared tokens remain aligned.
9. Settings, command execution, Resolve capability ownership, browser-preview authority boundaries, and unrelated dirty work remain unchanged.
10. No authored reveal/hide motion is added. Scale, fade, visual blur, translation, taskbar animation, flicker, or focus failure are acceptance failures. Opacity `0/1` is immediate stability state, not animation.
11. Before manual Resolve validation, the implementation flow must complete automated checks, build the renderer, and install the source Workflow plugin. The user then restarts Resolve and loads the plugin; no automated result may claim Resolve acceptance before that host test.

## Acceptance criteria

- [x] The host-policy matrix is pure and unit-tested: all Windows native entries choose D6/D7 independently of renderer URL or packaged state; non-Windows hosts choose the compatible attached fallback; Settings is outside the matrix.
- [x] Windows Workflow, dev standalone, normal built-renderer standalone, and packaged standalone share exact D6/D7 BrowserWindow construction, renderer surface mode, cursor/work-area placement, Panel gap, opacity/mouse lifecycle, and stale-blur rules.
- [x] Windows native Info click and Tab open the detached Panel without transferring focus; Tab/Escape close it and preserve the existing Palette keyboard behavior. Selection, mode/query changes, command/interaction execution, Palette hide, and Panel failures clear it safely.
- [x] Browser preview parity tests prove it imports the canonical geometry/visual tokens and shared content projection, renders the same main/Panel dimensions, surface, radii, shadow stage, gap, and bounded panel layout, and cannot opt into native-window authority through query text.
- [x] Browser evidence is described only as visual DOM evidence. It does not claim DWM composition, native corners/shadow, HWND separation, native focus, hit testing, z-order, packaged behavior, or Resolve validation.
- [x] Workflow tests cover bounded snapshot validation, readiness gating, combined work-area clamping, original-main-bounds restoration, repeat/idempotent open-close, destroyed/recreated Panel handling, no-state close, and stale-versus-real blur behavior.
- [x] Windows packaged/normal standalone has construction and lifecycle regression coverage plus package/static verification sufficient to prove the built app retains the unified policy; distribution installation is not part of immediate Resolve acceptance.
- [x] Focused Electron/Workflow/renderer tests, full `npm test`, `npm run build`, Windows package/static verification, Node syntax checks, diff checks, and policy/boundary searches pass without launching Electron or Resolve.
- [x] After the automated gate, `npm run build` and `npm run workflow:install` prepared the source Workflow plugin; the user completed the Resolve restart/manual validation and accepted the installed source Workflow. Packaged-distribution installation and acceptance remain untested.

## Out of scope

- Reintroducing Mica, DWM Cloak, PowerShell helpers, native add-ons, subprocesses, minimize/restore, hide/show-based repeat lifecycle, or authored motion.
- Manufacturing native behavior in a browser or changing browser preview into an execution, Resolve, IPC, focus, hit-test, or window-authority surface.
- Changing Settings, command/Resolve capability behavior, the Workflow plugin load model, or unrelated Agentation/browser-preview/package/spec/DESIGN work beyond task-owned parity changes.
- Installing a packaged distribution, publishing a release, or claiming packaged Resolve acceptance. A package may be built and statically verified during automation but is not installed for the immediate Workflow acceptance.
- Launching Resolve, Electron, or a real Resolve smoke test during automated implementation. Any future authorized real smoke uses local projects only.

## Risks and deferred host validation

- Resolve owns plugin startup, focus context, global-shortcut availability, topmost/z-order, DWM composition, and native hit testing. Node/browser tests prove policy and call ordering only; the installed source Workflow host test completed successfully on 2026-08-28. Packaged-distribution host validation remains deferred.
- Browser preview can make a native-equivalent shadow and gap visually inspectable, but cannot create an HWND gap or validate DWM. A visual discrepancy blocks preview parity; a host discrepancy blocks native acceptance.
- The source install script replaced the authorized plugin target and copied Resolve-provided `WorkflowIntegration.node` only after the automated gate. The source target was then manually accepted; do not infer that result for a packaged install.
- Any backing rectangle, native edge, occupied gap, unintended visible motion, flicker, focus loss, geometry leak, or failed cleanup blocks acceptance. Roll back the unified Windows policy rather than tuning Mica/CSS or adding timing workarounds.
