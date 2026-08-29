# Repository motion audit

## Stack and renderer shape

- Clackly has one npm package under `resolve-command-center/`; no workspace/package split was found.
- The production renderer is React `^18.3.1` with `react-dom` `^18.3.1` (`package.json:48-49`), built by Vite `^8.1.5` and `@vitejs/plugin-react` `^6.0.4` (`package.json:52,58`; `vite.config.mjs:1,6-9`). Electron is pinned to `36.3.2` (`package.json:55`).
- `electron/renderer/main.jsx:2-12` creates one browser root and imports one global `styles.css`. Palette, detached Interaction Panel, browser preview, and Settings are route/state projections from that renderer bundle rather than separate frontend packages.
- Vite builds a relative-base browser bundle into `dist/renderer` (`vite.config.mjs:9,16`). The current clean production build passes. Before Motion, the main JS output is about `501.99 kB` minified / `211.32 kB` gzip; the existing development-only Agentation chunk is separate.
- Tests are Node's built-in runner plus Playwright evidence scripts, not jsdom/component-test infrastructure (`package.json:17`). Visual/reduced-motion behavior is therefore validated most naturally through the existing Playwright evidence harness.
- `build/package-check-review-20260804/` is an ignored historical package snapshot, not current source. Its older `palette-enter`, command-tile transform, and All Actions motion must not be counted as current implementation or revived as foundation evidence.

## Renderer presentation motion

All production-authored CSS motion is in `electron/renderer/styles.css`; no second CSS file or inline React animation style was found.

| Evidence | Current behavior | Classification | Foundation implication |
| --- | --- | --- | --- |
| `styles.css:53-54` | `--motion-fast: 100ms`; `--motion-mode: 120ms` | Existing renderer motion vocabulary | Preserve the established `80-120ms` operating range; do not invent a broad timing scale. |
| `styles.css:174-205` | Launcher Search hover/focus border, color, and background transition | Renderer micro-feedback | CSS is already the simpler owner. No reason to migrate it to Motion. |
| `styles.css:285-309` | Footer control hover/focus/active feedback | Renderer micro-feedback | Keep CSS-first. |
| `styles.css:328-334`, `1390-1395` | Search view enters with opacity plus `translateY(3px)` over `120ms` | Renderer content-mode presence | The strongest low-risk presence validation candidate; it is content-only and explicitly survives past removal of outer-window entry motion. |
| `styles.css:505-540` | Command-row background/color transition and immediate pressed state | Renderer selection/press feedback | Keep CSS-first; Motion would add indirection without a missing behavior. |
| `styles.css:913-947` | Settings Feature-row hover/selection transition | Renderer micro-feedback | Keep CSS-first. |
| `styles.css:958-965`, `1397-1400` | Infinite SVG loading rotation | Renderer status animation | Keep CSS keyframes. It is a deterministic loop and does not need presence/layout orchestration. |
| `styles.css:1280-1315`, `1353-1388` | Settings picker and action hover/focus transitions | Renderer micro-feedback | Keep CSS-first. |
| `styles.css:1403-1420` | Reduced-motion disables Search entrance, Settings/row transitions, and spinner | Renderer accessibility policy | Retain and extend; current coverage is incomplete because Launcher Search and Footer control transitions are not in the media-query selector list. |

The existing historical contract is consistent: archived Palette work fixes normal interaction motion at `80-120ms`, preserves content-mode transitions, and removes outer-shell entry animation after Resolve compositor diagnostics (`07-30-polish-launcher-ui/prd.md:67`; `08-06-extract-shared-window-visual-tokens/prd.md:15-16,30`).

## Timing code that is not presentation animation

| Evidence | Actual owner/purpose | Why Motion must not absorb it |
| --- | --- | --- |
| `App.jsx:115-143` | A `450ms` delayed overflow-tooltip reveal with cancellation | This is disclosure timing and geometry calculation, not visual interpolation. Motion may animate the tooltip only if later approved, but must not own the delay or overflow test. |
| `App.jsx:324-337`, `378-388`, `412-415`, `507`, `554`, `563-565` | `requestAnimationFrame` schedules focus after React/DOM state changes | Focus correctness and post-commit timing are interaction logic. Converting these frames to animation callbacks would create accessibility/focus races. |
| `App.jsx:417-456` | `useLayoutEffect` measures selected-row anchor and Interaction Panel content height before asking the Host to position/open the panel | This is the Renderer-to-Host geometry handoff. Animated transforms or intermediate heights must never become host metrics. |
| `browserPreview.mjs:446-461` | `requestAnimationFrame`/zero-timeout emits preview lifecycle fixtures and selected-Feature callbacks | Hostless preview scheduling only, not product motion. |
| `scripts/palette-evidence.mjs:318,341` | Playwright fixture synchronization | Test harness timing only. |
| `script-runtime/runtime/launcher.js:228,400` | Child-runtime hard timeout and cleanup | Backend/runtime reliability boundary, unrelated to Renderer presentation. |

No production Web Animations API calls, `Element.animate`, `Animation`, `KeyframeEffect`, `setInterval`, transition/animation event handlers, Framer Motion, Motion, or another animation dependency were found.

The development-only `agentation@3.0.2` browser-preview toolbar contains third-party popup/shake/expand motion without a repository-owned reduced-motion contract. It is lazy-loaded only in the hostless preview and remains outside product Motion Foundation scope; its behavior must not be used as Palette, Electron, or Resolve motion authority.

## Host/native lifecycle: prohibited territory

- `electron/main/window.js:302-343` creates the persistent D6 Palette window and binds blur to Host concealment.
- D7 is a persistent second BrowserWindow created visible but at native opacity `0`, permanently nonfocusable, and mouse-ignored until opened (`window.js:421-451`). Open/close changes native bounds, mouse input, presentation IPC, opacity, and main focus synchronously (`window.js:460-530`).
- Settings keeps its own singleton create/show/focus/restore lifecycle (`window.js:533-577`).
- D6 reveal/conceal uses cursor positioning, `setFocusable`, mouse gating, immediate `setOpacity(1/0)`, focus, and first-show only (`window.js:580-615`). Tests lock the D7 no-show/hide-cycle contract and persistent D6 opacity contract (`window.test.js:703,994`).
- `nativeDualWindowHost.js:35-72` owns the D6/D7 orchestration; both standalone and Workflow hosts use it through `paletteHostPolicy.js`.
- `DESIGN.md:143,176,217,234` and `.trellis/spec/frontend/quality-guidelines.md:51,67` make immediate native visibility and the absence of authored outer-window motion an explicit architecture contract.

Therefore Motion must never import into `electron/main`, `workflow-plugin`, preload, `nativeDualWindowHost`, or any window-policy/geometry module. It must not animate an element whose measured intermediate size or transform is sent to the D7 Host. Detached Panel DOM may use internal content feedback only after the native window is already open and only if measurements remain based on the settled, unanimated layout.

## Existing accessibility evidence and gaps

- The CSS reduced-motion branch is real and an existing Settings Playwright scenario asserts zero transition duration (`scripts/palette-evidence.mjs:71-93,928,992-996`).
- Search entrance and the loading spinner are explicitly disabled under reduced motion (`styles.css:1403-1419`).
- The existing evidence only asserts two Settings controls; it does not assert Palette Search presence, row feedback, Launcher Search, Footer controls, or any future Motion provider policy.
- The current policy removes all covered transitions, while Motion's recommended user policy preserves non-transform properties. A foundation must state the intended Clackly behavior instead of mixing these defaults accidentally.

## Audit conclusion

The repository already has a small, coherent CSS motion vocabulary. The debt risk is not current sprawl; it is future React presence/layout work bypassing that vocabulary. A foundation should preserve CSS for ordinary hover/press/spinner behavior and add the smallest possible Motion boundary only for presence/interruption/layout cases that CSS does not own cleanly.

The high-frequency command-row transition is useful reduced-motion evidence, but not a Motion migration candidate: CSS already owns it cleanly. The adjacent `450ms` overflow-tooltip delay remains disclosure timing and must be tested independently rather than converted into a preset.
