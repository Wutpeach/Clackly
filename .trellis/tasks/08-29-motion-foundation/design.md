# Motion Foundation design

## Decision

Motion for React is technically compatible and may be adopted in one bounded Renderer-only slice. The first slice must prove a centralized presence contract against the existing Search content-mode transition; it is not permission to animate other surfaces.

Use `motion` with synchronous `LazyMotion`, `domAnimation`, the slim `m` component, and strict mode. Do not use the full `motion` component, `domMax`, drag/pan/scroll features, layout projection, or arbitrary springs in the first slice.

## Ownership boundary

```text
Host / Electron main
  BrowserWindow, HWND geometry, reveal/conceal, focus, hit-test, native opacity
  D6 Palette + D7 detached Panel + Settings window lifecycle
                  │
                  │ stable IPC / settled metrics only
                  ▼
Renderer UI state
  query, selection, conditional content, feedback, accessibility
                  │
                  ▼
Clackly Motion Foundation
  approved Renderer-only presets + reduced-motion policy
                  │
                  ▼
Motion for React
  DOM/SVG presentation only
```

The dependency and all direct imports belong under `electron/renderer/motion/`. Product components consume the local foundation module. A boundary test rejects `motion` or `framer-motion` imports anywhere else, including `electron/main`, preload, Workflow Plugin, script runtime, and ordinary Renderer components.

The first `MotionBoundary` wraps Palette/browser-preview Renderer content only. `DetachedInteractionPanelApp` remains explicitly outside the boundary. Settings may enter the boundary only if the optional feedback-presence candidate is separately included. Merely wrapping a route must never imply lifecycle ownership.

## Minimal contract

### Existing CSS-owned vocabulary

- `--motion-fast: 100ms`: simple hover, focus, selection, and press feedback. Existing CSS consumers remain CSS.
- CSS `@keyframes status-spin`: deterministic Settings loading indication remains CSS.
- The reduced-motion media query remains the authority for CSS-owned effects and must cover every CSS transition/animation consumer.

### Motion-owned vocabulary

- `softPresence`: a single Renderer content-presence preset derived from the current Search entrance (`120ms`, opacity, at most `3px` vertical displacement, existing `cubic-bezier(0.16, 1, 0.3, 1)`). It owns no native/window property and no layout-driving property.

No other JS preset is created in the first slice. In particular there is no spring scale, stagger, shared-layout ID, list-layout preset, generic variants factory, animation DSL, wrapper component family, or duration ramp.

## Reduced-motion contract

- `MotionConfig reducedMotion="user"` is mandatory at the local boundary.
- Normal mode may use the bounded `softPresence` opacity/3px transition.
- Reduced mode removes spatial transform. Opacity may remain only as a short state cue that does not delay interaction; the browser evidence must assert the actual chosen result.
- CSS-owned feedback keeps an intentional reduced path. The current omissions for `.launcher-search` and `.footer-control` are closed in the first slice.
- Focus, keyboard selection, ARIA live/status semantics, and state changes never wait for an animation to finish.
- No essential loading/status meaning may depend on movement. When the spinner stops under reduced motion, accompanying text remains the status authority.

## Validation candidate

### Required: Palette Launcher/Search content presence

- Replace only the existing Search `mode-enter` implementation at `App.jsx:701-744` / `styles.css:328-334,1390-1395` with `softPresence`.
- Preserve the fixed `240x320` surface, Launcher/Search DOM semantics, query state, Escape behavior, and post-mode focus scheduling.
- Do not add Palette invocation/reveal/conceal animation. The outer shell and `.palette-main` do not become Motion elements.
- Repeated Launcher/Search toggles must be interruptible and leave exactly one mode visible without stale focus or delayed input.

### Optional: Settings feedback presence

- If a second candidate is needed to validate true mount/unmount presence, limit it to `Feedback` at `SettingsApp.jsx:69-78,451-463`.
- Preserve `role="status"`, fixed footer layout, immediate Save/Reset behavior, and the Settings BrowserWindow lifecycle.
- Omit this candidate if the required candidate and contract tests already prove the foundation.

## Compatibility and packaging

- React `18.3.1` satisfies Motion's React `18.2+` requirement and current peer range.
- Vite 8 can consume the official ESM `motion/react` and `motion/react-m` exports.
- Electron context isolation/node-integration settings do not change; Motion is bundled browser code and receives no preload or IPC access.
- `asar:false` and the broad package include make installed size material. Record baseline and post-change Vite gzip size, Windows unpacked package size, and `package:verify` result.
- Adding `domMax` later is a separate architecture decision because it adds layout/drag features and documented bundle cost. No unused feature bundle is preloaded now.

## Failure and rollback

Rollback triggers:

- Any visible motion during native Palette reveal/conceal, D7 open/close, or Settings window open/close.
- Any change in focus, hit testing, cursor placement, D7 geometry, panel measurement, or native opacity ordering.
- Repeated Search toggles leave stale content, delay typing/Escape, or break keyboard focus.
- Reduced motion retains spatial displacement or erases essential state feedback.
- Actual bundle/package cost is disproportionate to the one validated use, or direct raw imports spread beyond the foundation boundary.

Rollback is local: restore the current CSS Search keyframe, remove the Motion boundary/module/dependency, and retain any independent reduced-motion coverage corrections. Never roll back or tune `window.js` to accommodate Renderer motion.

## Deferred decisions

- Layout/list transitions are deferred until a real low-frequency continuity problem justifies `domMax`.
- Hover/press conversion is deferred indefinitely while CSS remains simpler.
- Detached Interaction Panel content motion is deferred because its measured height and Host-owned native geometry make it a higher-risk boundary.
