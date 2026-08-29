# Research: Current Search, Ranking, Execution, and Persistence Boundaries

## Question

Where do Search, localized Command metadata, ranking, execution acceptance, Pin/Recent state, and persistence live today, and which existing boundary can own Search & Ranking Foundation without duplicating authority?

## Confirmed repository facts

### Command and localization metadata

- Bundled JSON manifests are the Command source of truth. `command-engine/registry.js:29-74` validates and normalizes the fixed Command shape, and `command-engine/registry.js:120-155` loads sorted manifests and returns defensive clones.
- Locale overlays are optional manifest metadata. `command-engine/registry.js:77-103` validates `name`, `description`, `category`, and `keywords` overlays.
- Renderer localization currently happens in `localization/presentation.mjs:3-14`. It projects the selected overlay and retains `englishName` / `englishKeywords` fallback metadata; `localization/presentation.mjs:40-41` maps that projection across Commands.
- The visible AE Command already has Chinese metadata, but the natural phrase `导出时间线` is not one current field. Its localized keywords are `导出`, `After Effects`, `AE`, and `时间线` (`command-engine/commands/after-effects.json:3-10`). Adding `导出时间线` as an ordinary localized keyword is enough to give that production Command the required full-pinyin/initials phrase without authored pinyin fields.

### Duplicate Search and ranking authorities

- The main process exposes Registry search through `commands:search` in both hosts (`electron/main/main.js:139-146`, `workflow-plugin/main.js:223-230`). Registry search is a raw, locale-blind substring filter over `id`, English `name`, and English keywords (`command-engine/registry.js:162-181`).
- The production Palette does not call that IPC. It loads all Commands and ranks in the renderer (`electron/renderer/App.jsx:249-261`). Renderer matching in `electron/renderer/model.mjs` includes localized name/keywords and retained English fallbacks, while ordering is only exact localized name/id, then pinned, recent, and source order.
- Therefore Search has two implementations and the Palette-visible implementation is currently renderer-owned. The dormant Registry implementation is still public IPC/spec surface, so leaving both would preserve duplicate authority.

### Pin and Recent presentation

- Pin and Recent are renderer-local `Set` state (`electron/renderer/App.jsx:245-246`). Pin toggling changes ordering in the renderer (`electron/renderer/App.jsx:416-426`).
- Direct success records the row Command in Recent (`electron/renderer/App.jsx:429-455`); matched mouse interaction records `InteractionResult.command`, which may be an internal action different from the target (`electron/renderer/App.jsx:480-495`). Neither state persists.
- Launcher presentation already keeps Pin distinct from Recent/Commands (`electron/renderer/model.mjs`, `projectLauncherSections`; rendered at `electron/renderer/App.jsx:610-635`). No new Recommended/Frequent section is necessary.

### Execution acceptance

- Both hosts delegate to the single Composition Root executor (`app/createClacklyCore.js:105-126`; host wrappers at `electron/main/main.js:77-89` and `workflow-plugin/main.js:156-167`).
- `command-engine/executor.js:13-29` resolves Command ID, finds a Capability, checks Feature enablement, checks required configuration, creates capability-scoped config, and then starts `capability.execute`.
- Mouse interaction also delegates the matched action Command to that same injected executor (`interaction/InteractionManager.js:38-54`). Therefore recording immediately after all executor acceptance gates and immediately before `capability.execute` covers keyboard, accessibility activation, and mapped mouse actions without UI-specific tracking.

### Persistence ownership

- `%APPDATA%/Clackly/config.json` belongs to ConfigManager through `ConfigStorage.fromAppData` (`config/ConfigStorage.js:21-27`).
- `%APPDATA%/Clackly/preferences.json` belongs to Preferences (`preferences/Preferences.js:12-35`), and the Composition Root explicitly keeps it separate from capability config (`app/createClacklyCore.js:86-91`).
- Other independent facts already use separate documents, including `feature-status.json` (`feature-status/FeatureStateStorage.js:11-48`) and `bindings.json` (backend spec, Interaction Binding Dispatch).
- `ConfigStorage` supplies reusable atomic whole-document JSON replacement (`config/ConfigStorage.js:29-75`). A dedicated `command-usage.json` owner can compose that mechanism without becoming Preferences or capability Config.

### Locale lifecycle

- Locale preference is persisted before LocalizationService publishes (`localization/LocalizationService.js:39-58`, `localization/registerIpc.js:13-24`).
- The renderer currently recomputes localized Commands from `effectiveLocale` (`electron/renderer/App.jsx:249-252`). A Core-owned Search service can instead compare the authoritative effective locale on every search and replace its one derived projection cache whenever the locale changes.

## Natural ownership

- Keep Registry as Command/localization metadata authority and executor as Command ID -> Capability authority.
- Add a shared application Search service under a dedicated Search layer, constructed once by `createClacklyCore`. It owns derived projection, query normalization, text relevance, Pin tie-breaking, usage tie-breaking, and empty-query ordering.
- Remove Registry matching and route the existing `commands:search` IPC to the Core Search service in both hosts. The Palette consumes ordered search results and no longer implements Search semantics.
- Add a dedicated Command Usage History service/document, also constructed by the Composition Root. It stores only stable facts and is injected into both Search and executor lifecycle recording.

## Relevant specs

- `.trellis/spec/backend/quality-guidelines.md` — Capability Dispatch, Composition Root, Interaction Binding Dispatch, persistence conventions.
- `.trellis/spec/frontend/quality-guidelines.md` — Electron Command Palette Boundary, Application Localization Boundary, Command Row Mouse Interaction, current Search/Pin/Recent contracts.
- `.trellis/spec/guides/cross-layer-thinking-guide.md` — one payload decoder/projection owner and explicit cross-layer contracts.
- `.trellis/spec/guides/code-reuse-thinking-guide.md` — eliminate duplicate Search and localization projection behavior.

## Risk noted

Both standalone and Workflow hosts can theoretically write the same app-data document concurrently. Reload-before-write plus atomic replacement prevents partial JSON but not a cross-process lost increment. The product normally treats simultaneous standalone and Workflow instances as a conflicting host state; adding a cross-process lock is outside this foundation unless verification demonstrates a real supported concurrent-writer path.

