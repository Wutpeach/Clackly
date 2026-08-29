# Motion Foundation implementation plan

Architecture Review passed and the user explicitly approved this bounded implementation on 2026-08-29. The scope is locked to the Search validation candidate; the optional Settings candidate remains deferred.

## 1. Capture baselines and protect boundaries

- Record the current Vite main-chunk minified/gzip sizes and Windows unpacked package size.
- Add/extend a source-boundary test that permits `motion`/`framer-motion` imports only under `electron/renderer/motion/` and confirms `electron/main`, preload, Workflow Plugin, and detached-panel code remain free of the dependency.
- Keep the existing D6/D7 host-policy and window lifecycle tests unchanged as regression authority.

## 2. Add the bounded dependency and local foundation

- Add the current reviewed `motion` release to npm dependencies and update the lockfile.
- Create the smallest Renderer-local foundation module(s):
  - `MotionBoundary` using `LazyMotion`, synchronous `domAnimation`, `strict`, and `MotionConfig reducedMotion="user"`.
  - one immutable `softPresence` preset derived from the current `120ms`/3px Search transition.
- Do not export a generic transition builder, spring factory, or raw full `motion` component.
- Keep the detached Interaction Panel route outside the boundary. Wrap Settings only if the optional Settings feedback candidate is included.

## 3. Validate one real presence path

- Migrate only the existing Search content entrance to the local `softPresence` preset.
- Remove only the replaced `mode-enter` CSS declaration/keyframe; leave all CSS-owned hover, press, selection, and spinner behavior in place.
- Preserve Launcher/Search conditional rendering, focus scheduling, query state, Escape, and the fixed Palette footprint.
- Optionally add Settings feedback presence only if the first candidate cannot exercise the required mount/unmount contract without widening Palette behavior.

## 4. Complete the reduced-motion contract

- Extend the CSS reduced-motion selector coverage to `.launcher-search` and `.footer-control` and verify all remaining CSS transition/animation consumers are intentionally covered or documented.
- Add a Palette reduced-motion evidence scenario using Playwright media emulation.
- Assert that Search mode has no spatial transform under reduced motion, state/focus changes are immediate, and exactly one mode remains interactive after repeated toggles.
- Retain the existing Settings reduced-motion assertions and status text when the loading spinner is stopped.

## 5. Verify cost, behavior, and native non-regression

Run from `resolve-command-center/`:

1. Focused pure/source tests for preset immutability, import boundary, and reduced-motion coverage.
2. Focused Playwright Palette default/reduced-motion scenarios.
3. `npm test`.
4. `npm run build`, comparing the baseline and post-change main-chunk gzip delta with the documented `LazyMotion + domAnimation` expectation.
5. `npm run package:win` and `npm run package:verify`, recording unpacked package-size delta because `asar:false` packages dependency files.
6. `git diff --check` and a boundary search for forbidden raw imports, `domMax`, arbitrary spring parameters, and any changes under `electron/main/window.js`, `nativeDualWindowHost.js`, `paletteHostPolicy.js`, or `workflow-plugin/main.js`.

## 6. Host acceptance and rollback gate

- After automated checks pass, install the Workflow package before requesting manual Resolve validation.
- In a local Resolve project, verify repeated Palette reveal/conceal remains immediate and motionless; Search presence stays inside the already-visible Renderer; D7 open/close, geometry, focus, and hit testing remain unchanged; Settings window open/close remains unchanged.
- If any rollback trigger in `design.md` fires, restore the CSS Search keyframe and remove Motion/foundation/dependency changes. Keep only independently valid reduced-motion test/coverage improvements.

Final acceptance: the packaged Workflow was installed before handoff, and the user reported Resolve-host validation passed on 2026-08-29. No rollback trigger fired.

## Files expected to change

- `resolve-command-center/package.json`
- `resolve-command-center/package-lock.json`
- new files under `resolve-command-center/electron/renderer/motion/`
- `resolve-command-center/electron/renderer/App.jsx`
- `resolve-command-center/electron/renderer/styles.css`
- focused renderer/source tests and `scripts/palette-evidence.mjs`

Files explicitly not in scope:

- `resolve-command-center/electron/main/window.js`
- `resolve-command-center/electron/main/nativeDualWindowHost.js`
- `resolve-command-center/electron/main/paletteHostPolicy.js`
- `resolve-command-center/workflow-plugin/main.js`
- preload/IPC geometry contracts
