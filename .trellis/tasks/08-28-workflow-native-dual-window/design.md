# Design: Unified Windows Native Dual-Window Policy

## Architecture boundary

The native dual-window behavior is a **Windows host policy**, not a renderer feature and not a consequence of the standalone dev-server flag. Windows Workflow, standalone development, normal built-renderer standalone, and packaged standalone all select the same D6/D7 product policy. The shared native-window helper executes the policy, while each host entry point retains its own startup and integration ownership.

The implementation must make policy selection testable without importing Workflow Integration or checking process arguments deep in the window helper. A small pure policy selector may receive host identity and platform; host entry points provide those values. The result is a narrow immutable policy/options object that controls only:

- main surface (`transparent`, background color, window size, native corners/frame, base shape, renderer full-bleed marker);
- interaction composition (attached versus detached);
- the D7-only stale native blur guard.

`workflow-plugin/main.js` and `electron/main/main.js` each declare their host identity. A pure selector maps every Windows native invocation to D6/D7; it maps non-Windows Workflow and standalone to the compatible transparent attached fallback. Renderer URL selection (`--dev-renderer`, Vite URL, or built `loadFile`) remains independent of this policy, so `app.isPackaged` cannot silently change the Windows surface.

## Window and data flow

```text
Windows native host (Workflow, dev, normal, packaged)
  -> one explicit D6/D7 policy
  -> shared main Palette helper (D6 BrowserWindow)
  -> persistent detached Panel controller (D7 BrowserWindow)
  -> bounded IPC controller
  -> main renderer owns selected Command + interaction help
  -> { metrics, presentation } only
  -> detached preload exposes presentation subscription only
  -> detached renderer reuses InteractionPanelContent
```

The main renderer remains the only state and execution authority. Its host-validated policy marker chooses full-bleed main layout and suppresses duplicate attached Panel markup. It derives either `{ kind:"mappings", rows:[{label,actionName}] }` or `{ kind:"description", description }`, combines it with `{anchorY,contentHeight}`, and invokes the existing semantic IPC. It never sends native coordinates, unbounded HTML, query data, commands, or execution APIs to the detached window.

### Shared visual contract and browser preview

Expand the existing cross-layer Palette geometry/token authority rather than leaving `240`, `320`, `260`, `16`, `60`, `180`, panel inset, `#151619`, and the painted radii split between `window.js`, `browserPreview.mjs`, JSX, and CSS. The canonical contract must supply:

- main visible size `240x320`, opaque surface `#151619`, and painted main radius `8px`;
- Panel width `260px`, gap `16px`, height range `60–180px`, selected-row inset/clamp `8px`, and painted Panel radius `4px`;
- the visual elevation specification used by browser preview to approximate the native DWM external shadow.

`window.js` derives Windows D6/D7 geometry and BrowserWindow options from this contract. `browserPreview.mjs` derives its bounded Panel metrics from it. `App.jsx` exposes the contract as CSS custom properties, and CSS consumes those variables for both the main/Panels. `InteractionPanelContent` remains the shared markup. This eliminates browser-specific copied panel geometry while preserving hostless presentation data as the only preview exception.

Browser preview continues to render one DOM composition rather than two HWNDs: a transparent preview stage may reserve only enough external space for CSS shadow falloff, while its visible main is `240x320` and its Panel begins after a visible `16px` gap. CSS approximates the native shadow/radius appearance from the shared visual contract; it must not be described as native shadow, real physical window separation, or native input/focus behavior.

## Lifecycle and focus contract

### Windows main D6 window

- Construct persistent, hidden `240x320`, frameless, opaque `#151619`, `roundedCorners:true`, `thickFrame:true`, `minimizable:false`, no Mica, and no base `setShape`.
- First reveal may perform the existing native `show()` because the window starts hidden. Later reveal uses the existing immediate `setOpacity(1)`, input restore, positioning, and focus branch; conceal uses immediate `setOpacity(0)`, ignore-mouse, and main `setFocusable(false)`. No minimize, restore, hide, show, timer, or authored animation is introduced for repeat lifecycle.
- Cursor origin and D6 `240x320` work-area flip/clamp remain unchanged. Main visible top-left anchors at the cursor.
- The only Windows D7 blur exception is a queued blur for which `mainWindow.isFocused()` is already true. It returns without concealment. If false, the unchanged logical shown check conceals the main.

### Windows detached D7 Panel

- Construct a persistent `260x60` opaque `#151619` frameless window with native corners/frame shadow, `show:true`, `opacity:0`, `focusable:false`, `skipTaskbar:true`, and immediate mouse-ignore. Its first renderer-ready event only marks readiness; it causes no visibility or focus call.
- Open only after readiness: validate bounded semantic request, retain base main bounds, compute the combined `240 + 16 + 260` work-area clamp, move both windows together when needed, set Panel bounds, enable Panel mouse interaction, send validated presentation, then set opacity to `1` and keep the main focused.
- Update repeats those bounded operations idempotently. Close an actual state uses only Panel opacity `0`, mouse-ignore, presentation clear, main-bounds restoration, and state deletion. It restores main focus only when a caller explicitly requests it and the main is not focused.
- A close with no open state is a true native no-op. The Panel never invokes `setFocusable` after its constructor and never invokes show/hide/minimize/restore during its lifecycle.
- Invalid request, unready/destroyed Panel, geometry failure, presentation failure, or close race returns failure without moving/hiding the main. Active-state failure restores base bounds and leaves the Panel opacity `0`, mouse-ignored, and cleared.

## Native-host composition

Both native host entries need a small policy-aware adapter around `createPaletteWindow`, `showPalette`, `hidePalette`, and `registerInteractionPanelIpc`. They must use the same detached controller mechanics without moving Workflow-specific Resolve code into the shared helper:

1. construct the D6 main with the Workflow native policy;
2. create/retain the D7 Panel under that same policy, clear/recreate its handle after `closed`, and close active state safely if it disappears;
3. close the detached Panel before host show/hide paths and on main focus loss cleanup;
4. hand `registerInteractionPanelIpc` a detached controller only for the native Workflow policy; otherwise use its current attached behavior;
5. pass the D6 policy to `showPaletteWindow` so cursor placement uses the full-bleed footprint.

The Workflow adapter must not change `app.setPath`, WorkflowIntegration initialization and cleanup, Resolve capability provider, command execution, settings, or hotkey error handling. The standalone adapter must not change its bridge capability, single-instance, `activate`, settings, or hotkey ownership.

## Compatibility and rollout

| Boundary | Required behavior |
| --- | --- |
| Windows Workflow Integration | Select unified native D6/D7; manual Resolve host verification required. |
| Windows standalone dev | Select unified native D6/D7; retain as development regression reference. |
| Windows normal/built standalone and packaged standalone | Select unified native D6/D7 independently of renderer URL and packaged state; static/package verification required. |
| Non-Windows Workflow and standalone | Use transparent attached fallback because the DWM native contract is unavailable; not a visual-design fork. |
| Browser preview | Use shared visual contract and DOM simulation; hostless query values cannot enable native policy. |
| Settings | Retain current separate transparent square Settings contract. |

After automated checks, build and install the **source Workflow plugin** using `npm run build` then `npm run workflow:install`; only then ask the user to restart Resolve Studio and load Clackly from the Workflow Integrations menu. This source-host validation is the first rollout step. Automated Windows package/static verification may build and inspect the package but must not install it. A later distribution path uses `runtime:stage`, `package:win`, `package:verify`, and `workflow:install:package` only after the source Workflow host has been accepted.

## Rollback

The rollback must be a policy-selection reversal, not a lifecycle rewrite: reverse the unified Windows mapping to the supported attached fallback across the affected Windows native entries, while retaining shared D6/D7 regression evidence and keeping Mica/Cloak/minimize paths absent. If preview parity fails, fix only the shared visual-token consumption; do not add a browser-only design. If any native host shows artifacts, focus loss, gap occupancy, or motion/flicker, do not tune Mica/CSS or add timing workarounds; revert the unified policy and retain evidence for a separate investigation.
