# Repository Research: Command Palette visual density

## Current Surface

- `resolve-command-center/electron/renderer/App.jsx` owns the entire palette renderer. It has three local modes (`launcher`, `search`, `all-actions`), local query/selection/hint/pin/recent state, registered metadata projection, lifecycle gating and keyboard/mouse execution.
- `resolve-command-center/electron/renderer/styles.css` owns palette and Settings styling in one file. Palette rows currently reuse layered tile colors, borders, gradients and shadows; Settings selectors must remain out of scope.
- The same stylesheet hard-codes `376×468` for all `.palette-shell.browser-preview` modes; it must follow the approved `240×320` production geometry while retaining the truthful empty preview catalog.
- `resolve-command-center/electron/renderer/model.mjs` owns pure catalog, ranking, search and grouping behavior; `model.test.mjs` is the focused renderer test surface.
- `resolve-command-center/electron/main/window.js` and its tests own the current fixed `376×468` host footprint and the qualified frameless/transparent rectangular window behavior. The approved plan changes only the shared footprint to `240×320`.

## Main Gaps Against the Supplied Reference

- Default Launcher is a large 3×3 card grid instead of compact Pinned/Recent/Commands rows.
- Search input is `42px`; result rows are about `58px`, default to two text lines, and use a card gradient/outline/shadow.
- Selected is an orange edge/dark fill; the new reference requires the strongest state to be a restrained light fill with dark text.
- Icon containers are `32px` boxed surfaces; the reference calls for `14–16px` monochrome optical slots.
- Footer/header and A–Z rail are visually stronger and taller than the requested information hierarchy.
- Hover and selected are coupled because mouse enter changes selectedIndex.

## Existing Contracts That Limit the Visual Match

- `.trellis/spec/frontend/quality-guidelines.md` requires registered Commands only, empty browser preview, absent shortcut badges until an authoritative contract exists, one mode-independent host size, Lucide icons, and the rectangular compositor-safe shell. Its exact `376×468` value must be updated after the approved `240×320` implementation stabilizes.
- No submenu/nested-menu component or state exists. `interaction-help` is an in-window tooltip/status panel; an adjacent outer panel would be clipped by the BrowserWindow and requires out-of-scope host architecture.
- Current registered visible commands are Add Marker, Export to After Effects and Paste Clipboard Image. Internal AE action Commands must remain hidden.
- Pinned/Recent are process-local Sets. The approved presentation uses a truthful Commands fallback rather than seeded or persisted fake state.

## Minimal Change Surface

- Primary: `electron/renderer/App.jsx`, `electron/renderer/styles.css`.
- Fixed-size migration: `electron/main/window.js`, `electron/main/window.test.js` only; no preload/IPC/Workflow lifecycle edits.
- Conditional: `electron/renderer/model.mjs`, `model.test.mjs` only if a pure tested section-projection helper reduces duplication.
- Durable documentation after implementation: `DESIGN.md`, `.trellis/spec/frontend/quality-guidelines.md`.
- Explicitly unchanged: preload/Workflow window wiring and lifecycle, command engine, command manifests, capability/runtime/Resolve adapters, Settings renderer.

## Verification Evidence and Limits

- Existing scripts provide focused Node tests, full Node/Python tests and a Vite build.
- Existing package-level validation is `npm run package:win`, `npm run package:verify`, then `npm run workflow:install:package`; this is required because screenshots and standalone tests cannot prove Resolve-hosted frameless rendering.
- Vite can preview geometry/empty state, but its fallback catalog is intentionally empty, so it cannot prove populated Launcher/Search without temporary runtime tooling.
- Real Electron is authoritative for the approved `240×320` rendering, cursor placement, focus and preload-backed catalog. Resolve Workflow is authoritative for hosted compositor behavior and actual command/Recent execution.
- The existing process is to complete automated/Electron checks, install the Workflow package, then ask the user to restart Resolve and manually validate in a local project.
