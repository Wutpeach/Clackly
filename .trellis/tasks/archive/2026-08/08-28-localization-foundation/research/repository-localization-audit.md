# Repository localization audit

## Scope and method

Read-only inspection on 2026-08-28 covered the composition root, shared config storage, both Electron hosts, preload bridges, Palette/Settings/Interaction renderers, Command and Capability metadata loaders, lifecycle status projection, browser preview fixtures, tests, and relevant Trellis specs. No prior product-level localization decision was found through `trellis mem`; the only `localization` history hit concerned Windows registry encoding and is unrelated.

## Ownership and persistence

- `app/createClacklyCore.js:19-107` is the shared application composition root for standalone and Workflow hosts. It is the correct construction point for one Preferences/Localization service pair.
- `config/ConfigStorage.js:21-75` owns `appData/Clackly/config.json`, UTF-8 JSON, object-root validation, and atomic replacement.
- `config/ConfigManager.js:33-39, 61-112` reloads on every operation and preserves sibling root keys, but is capability-scoped. `ConfigStorage` does not provide serialized mutation or merge: `ConfigStorage.test.js:23-34` proves a second full-root save replaces the first. Atomic rename protects integrity only. Preferences must therefore use `appData/Clackly/preferences.json`, leaving `ConfigManager` the sole capability-domain writer of `config.json`.
- The current storage contract explicitly remains last-writer-wins for simultaneous cross-process writes (`ConfigManager.js:33`). File locking is outside this task.
- Standalone injects `app.getPath("appData")` at `electron/main/main.js:50-67`; Workflow injects the same shared appData at `workflow-plugin/main.js:120-150` while keeping a separate Electron `userData` at line 55. The preference therefore belongs under shared appData, not Workflow `userData`.

## Cross-process and renderer boundaries

- Both hosts duplicate Command and interaction IPC registration (`electron/main/main.js:133-164`; `workflow-plugin/main.js:217-248`) and already share feature UI IPC through `feature-ui/registerIpc.js:1-38`. Localization IPC should likewise have one registration helper used by both.
- Main preload exposes the renderer API at `electron/main/preload.js:20-52`. The detached Interaction Panel receives a deliberately restricted bridge at lines 3-19 and must receive read-only localization get/change operations only.
- Palette shown events already establish a cleanup-safe listener shape at `preload.js:42-50`; localization change should match this subscribe/unsubscribe contract.
- All routes share one renderer entry (`electron/renderer/main.jsx:1-10`) and route inside `App.jsx:742-760`, so a provider above `App` covers Palette, Settings, and detached Panel without per-window language authorities.
- `resolve-command-center/index.html:2` currently hard-codes `lang="en"`; the provider must replace this with the authoritative effective locale after bootstrap.

## Command and feature metadata

- Command registry validation/cloning is centralized at `command-engine/registry.js:29-83`; optional package-owned locale overlays belong here.
- Registry search currently uses English base `id/name/keywords` at `registry.js:128-147`, while the active Palette ranks the list in renderer `model.mjs:91-123`. The presentation model can search localized plus English fallback terms without changing execution mapping.
- Current built-in visible Command metadata lives in `command-engine/commands/timeline.json:3-9`, `after-effects.json:3-9`, and `image-clipboard.json:3-9`; internal action Commands in `after-effects.json:11-59` also need localized names/descriptions because Interaction Help can display them.
- Command execution remains ID-only through preload (`preload.js:22-25`), standalone IPC (`electron/main/main.js:134-146`), Workflow IPC (`workflow-plugin/main.js:218-230`), and `InteractionManager.js:38-54`. Locale must not enter these calls.
- Settings reads cloned full Capability metadata from `feature-ui/FeatureCatalog.js:14-19`. Built-in Capability display sources include `capability/marker.js:71-82`, `capability/imageClipboard.js:195-206`, and `capability/definitions/ae-export.json:1-25`, including schema labels.

## User-visible string hotspots

### Palette

- Accessible Command labels and descriptions: `electron/renderer/App.jsx:97-105, 148-160`.
- Running/error feedback and raw exception exposure: `App.jsx:272-276, 294-295, 416-485, 513-515`.
- Launcher/search headings, placeholders, list labels, and empty states: `App.jsx:579-675`.
- Footer tooltips/ARIA for Settings, pin, and information: `App.jsx:677-724`.
- Feature warning prose, click labels, and launcher headings: `electron/renderer/model.mjs:17-26, 61-87, 126-147`.

### Settings

- Titlebar/document title and close label: `electron/renderer/SettingsApp.jsx:19-35, 64-65`.
- Feedback/status literals and raw caught errors: `SettingsApp.jsx:87-92, 119-120, 138-213`.
- Loading/no-feature states: `SettingsApp.jsx:215-234`.
- Feature/lifecycle headings, yes/no/readiness/missing values, actions, interaction help, and footer controls: `SettingsApp.jsx:237-367`.
- Generic empty settings, select prompt, and Browse control: `electron/renderer/SettingsRenderer.jsx:4-92`.
- Feature category/name/description/config labels originate in Capability metadata as noted above.

### Interaction Panel and browser preview

- Interaction row accessible label composes localized action metadata at `InteractionPanelContent.jsx:3-16`; preview note is literal at lines 33-35.
- Attached Panel label is literal at `App.jsx:712-724`; detached Panel label at `DetachedInteractionPanelApp.jsx:14-17`.
- Panel presentation intentionally carries only localized mappings or description (`interactionPanelPresentation.mjs:1-10`), which is compatible with live recomputation.
- Browser-only Command fixtures and execution error are English literals at `browserPreview.mjs:3-78`; the preview adapter is isolated from production at lines 104-132 and can host an in-memory locale adapter.

### Native and lifecycle errors

- Workflow hotkey warning dialog is user-visible at `workflow-plugin/main.js:251-265`; startup error boxes appear at lines 295-308 and standalone `electron/main/main.js:173-180`.
- `FeatureStatusManager.js:8-54, 80-160` provides stable status/detail/action fields plus English messages. Presentation can localize by stable status and details rather than display the prose.
- Image Clipboard already emits structured codes (`capability/imageClipboard.js:8-11, 56-92, 121-170`), making it a useful first error-code presentation map. Other errors remain unstructured and require a generic localized fallback.

## Existing tests and validation seams

- `config/ConfigStorage.test.js` and `ConfigManager.test.js` provide persistence/atomic/sibling-preservation patterns for Preferences tests.
- `command-engine/registry.test.js` owns manifest validation, cloning, search, and compatibility fixtures.
- `feature-ui/registerIpc.test.js`, `electron/main/window.test.js`, `composition.test.js`, and `composeStartup.test.js` own shared IPC/preload/host composition assertions.
- `electron/renderer/model.test.mjs`, `interactionPanelPresentation.test.mjs`, and `browserPreview.test.mjs` are pure Node presentation seams; the Vite build validates React integration.
- `npm test` covers all Node/Python suites; `npm run build` is the renderer/package integration gate.
- Project feedback requires headless browser visual validation first and Workflow package installation before asking for Resolve-host manual testing.

## Working-tree preservation

Before this task, tracked changes already existed in `App.jsx`, `browserPreview.mjs`, `browserPreview.test.mjs`, `package.json`, `package-lock.json`, and `scripts/palette-evidence.mjs`, with untracked `BrowserPreviewAgentation.jsx`. The localization implementation must integrate rather than revert these changes. No localization change should remove the hostless-root Agentation gate.

## Recommended minimal boundary

1. `Preferences` persists/validates `system | en | zh-CN` in `preferences.json` and is the only mutable locale authority; it never writes capability `config.json`.
2. `LocalizationService` injects system languages and derives `{ preference, effectiveLocale }`.
3. Shared IPC exposes get/set plus post-save broadcast to owner renderers; detached Panel has no independent locale API.
4. One renderer provider consumes snapshots and owns derived presentation state. While D7 is open it sends a complete, locale-stamped localized presentation revision on every effective-locale change; D7 is only a projection sink.
5. Core resources localize UI chrome/status/error codes. Package metadata owns optional locale overlays with required English base fields as fallback.
6. Presentation localizes data before rendering; stable IDs continue across execution/runtime unchanged.

The Orca research Worker also considered storing locale as a synthetic capability to reuse the existing generic Settings renderer. That option is rejected because it would make an application preference look capability-owned and conflict with the explicit requirement that `Preferences` be the locale source of truth. The dedicated Preferences service still reuses the established `ConfigStorage` document and atomic-write behavior.

## Risks

- Renderer initialization is asynchronous; use complete English fallback resources for the bootstrap render and update from the authoritative snapshot without creating a renderer-persisted locale.
- Settings currently has only feature destinations. A small `General` destination is the least disruptive coherent location for Language.
- System-language changes during an already-running Electron session do not have a guaranteed portable event; re-resolve on snapshot/change/startup.
- A literal audit must distinguish intentional English fallback metadata and internal diagnostics from strings that can reach rendered UI.
