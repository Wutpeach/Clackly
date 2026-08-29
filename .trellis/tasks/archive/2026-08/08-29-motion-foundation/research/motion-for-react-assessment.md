# Motion for React compatibility and dependency assessment

## Sources checked

- Repository package/build evidence: `resolve-command-center/package.json`, `package-lock.json`, `vite.config.mjs`, renderer entry, Electron window configuration, and a clean `npm run build` on 2026-08-29.
- npm registry metadata for `motion@13.1.1`, `framer-motion@13.1.1`, `motion-dom@13.1.1`, `motion-utils@13.0.0`, and `tslib` on 2026-08-29.
- Official Motion documentation:
  - <https://motion.dev/docs/react-installation>
  - <https://motion.dev/docs/react-motion-config>
  - <https://motion.dev/docs/react-use-reduced-motion>
  - <https://motion.dev/docs/react-reduce-bundle-size>
  - <https://motion.dev/docs/react-animate-presence>
  - <https://motion.dev/docs/react-layout-animations>

## Compatibility result: technically compatible

- Current `motion@13.1.1` declares React/ReactDOM peers `^18.0.0 || ^19.0.0`; official installation guidance requires React `18.2+`. Clackly uses React `18.3.1`.
- The official installation guide names Vite and the ESM import `motion/react`. Clackly is already an ESM Vite browser renderer; no SSR, React Server Components, or hydration boundary exists.
- Motion exports ESM and CJS entry points, including `motion/react`, `motion/react-m`, and client/mini variants, and declares `sideEffects: false`. Vite can tree-shake it.
- Electron `contextIsolation: true` and `nodeIntegration: false` do not block a bundled browser-side React library. No repository CSP or packaging rule was found that conflicts with local bundled Motion code.
- The clean baseline build transformed 1,834 modules successfully. There is already a main-chunk size warning at roughly `211.32 kB` gzip, so dependency delta must be measured and treated as an acceptance constraint rather than ignored.

There is no compatibility evidence requiring a stop. Motion for React is a viable technical option.

## Cost and import-shape assessment

- `motion@13.1.1` depends on `framer-motion@13.1.1` and `tslib`; Framer Motion depends on `motion-dom` and `motion-utils`.
- npm unpacked metadata totals roughly 9 MB across these packages before filesystem overhead. Clackly packages with `asar:false` and a broad file include, so installed/package footprint—not just browser gzip—is relevant.
- Official Motion guidance states that the full `motion` component is about `34 kB` gzip and cannot be tree-shaken smaller. `LazyMotion` with `m` is about `4.6 kB` initially; `domAnimation` adds about `15 kB`, while `domMax` adds about `25 kB` and is the bundle needed for layout/drag features.
- Clackly does not need drag, pan, scroll, or complex gestures. Pulling full `motion`/`domMax` into the first foundation would be unjustified.
- Async feature loading would add lifecycle complexity to a renderer that must be immediately keyboard-ready. If adopted, use synchronous `LazyMotion features={domAnimation}` plus `m` and `strict`; accept the approximately 20 kB documented feature cost, measure the actual Vite gzip delta, and defer `domMax`/layout support until a separately approved validation requires it.

## Adoption decision

Recommend a **bounded adoption**, not a general animation rollout:

1. Add `motion` only with one real content-presence validation candidate.
2. Expose it through one Renderer-local foundation boundary with approved presets and `MotionConfig reducedMotion="user"`.
3. Use `LazyMotion` + `m` + `domAnimation` in strict mode; do not use the full `motion` component, arbitrary springs, or `domMax` in the first slice.
4. Keep current CSS transitions and keyframes where CSS is already the correct owner.
5. Record and gate actual build gzip/package delta. If the measured cost, focus behavior, or high-frequency feel fails acceptance, remove the dependency and retain the clarified CSS/reduced-motion contract.

This recommendation is justified because Clackly already has a real content-mode presence transition and repeated React conditional-presence surfaces. It is deliberately narrower than a list/layout system. If the implementation is reduced to simple hover/color/one-shot CSS effects, Motion should be rejected as unnecessary.

## Minimal vocabulary recommendation

The first slice needs only two concepts:

- `fastFeedback`: the existing `100ms` semantic for hover/press/color feedback. It remains CSS-owned initially and exists in the foundation contract to prevent arbitrary component timing.
- `softPresence`: the existing `120ms`, 3px-or-less content entrance vocabulary for Renderer-local conditional content. The reduced-motion variant removes transform and uses either immediate state or a short opacity-only confirmation.

Do **not** add `spring`, `stagger`, `layout`, `sharedLayout`, `exitFast`, or a duration/easing scale until a chosen, tested repository scenario needs them. A later layout candidate must explicitly justify switching from `domAnimation` to `domMax` and its bundle cost.

## Candidate assessment

### Candidate A — Palette Launcher to Search content presence (recommended first)

- Real source: conditional Launcher/Search sections at `App.jsx:657-744`; current Search-only CSS entrance at `styles.css:328-334,1390-1395`.
- Why: it validates React presence/interruption and the reduced-motion path while remaining entirely inside the fixed `240x320` Renderer surface.
- Guardrails: no animation on Palette invocation/concealment, outer `.palette-shell`, native opacity, focus timing, or D7. Focus must land exactly as today (`App.jsx:378-388`). Total motion remains at or below the established `120ms`; repeated Escape/type toggles must be interruptible and never delay input.
- Rollback: restore the current CSS `mode-enter` rule and remove Motion from this path.

### Candidate B — Settings feedback message presence (optional second)

- Real source: conditional footer feedback at `SettingsApp.jsx:69-78,451-463`, styled at `styles.css:1338-1351`.
- Why: it is a small, bounded information-state change inside an already-open Settings renderer and tests meaningful status presence without touching the Settings BrowserWindow lifecycle.
- Guardrails: preserve `role="status"` semantics, no layout choreography of the Settings shell/footer, no delay to Save/Reset, and no window reveal/hide effect.
- This candidate should be deferred if Candidate A plus foundation tests already proves the contract; it is not required to justify the dependency.

Rejected first candidates:

- D7 Interaction Panel presence or content-height transition: too close to Host measurement, native bounds, opacity, and focus authority.
- Search result/list layout animation while typing: high-frequency, potentially distracting, and would require `domMax` solely to validate a speculative vocabulary.
- Settings spinner: CSS keyframes are already the correct owner.
- Command-row hover/press: CSS is already simpler and complete.
