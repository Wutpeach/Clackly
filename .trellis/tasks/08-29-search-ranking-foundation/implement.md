# Search & Ranking Foundation — Implementation Plan

## Execution order

### 1. Establish shared metadata localization and transliteration

- [x] Add `pinyin-pro` as the only new runtime dependency and update `package-lock.json` through npm.
- [x] Extract the existing Command/Feature metadata overlay logic into one CommonJS-compatible localization helper consumed by both `localization/presentation.mjs` and the new Search layer.
- [x] Add a thin Clackly transliteration wrapper that requests tone-free primary pinyin, retains mixed Latin text, joins compact full pinyin, and derives initials itself.
- [x] Unit-test `导出时间线 -> daochushijianxian / dcsjx`, mixed Chinese/English text, empty/non-Chinese values, defensive output, and no authored pinyin metadata.

Rollback point: localization presentation tests and production build must pass before changing Search consumers.

### 2. Create the derived Search Projection and text-first ranking policy

- [x] Add a dedicated Search module with query normalization, locale projection, presentability filtering, explicit relevance classes, multi-token matching, deterministic comparison, Pin ordering, and decayed usage tie-breaking.
- [x] Reuse the generic Registry `isCommandPresentable` predicate; do not add Command ID/capability branches.
- [x] Add the ordinary localized keyword phrase `导出时间线` to the visible AE Command so the real production metadata satisfies the requested phrase and automatically receives pinyin/initials projection.
- [x] Add focused tests for Chinese source text, English fallback name/keywords in `zh-CN`, localized keywords, full pinyin, initials, stable ID, bounded substring fallback, multiple tokens, internal exclusion, source-order fallback, and defensive Commands.
- [x] Prove high usage and Pin membership cannot cross any stronger complete text-relevance tuple.

Rollback point: Search policy tests pass independently with an injected clock and in-memory usage snapshots.

### 3. Add one Command Usage History authority

- [x] Add strict storage validation and atomic persistence for `%APPDATA%/Clackly/command-usage.json` using only `commandId`, `usageCount`, and `lastUsedAt` facts.
- [x] Add the usage service with defensive snapshots, reload-before-write incrementing, injected clock, and non-authoritative diagnostic fallback for damaged/unwritable history.
- [x] Add tests for missing file, round-trip/restart persistence, increment and timestamp replacement, malformed roots/records, unknown IDs, defensive snapshots, and separation from Preferences/config/Feature/binding documents.
- [x] Test the 30-day half-life formula with fixed times: recent frequency rises naturally, old frequency decays, and no final score is stored.

Rollback point: usage tests prove command execution/search can continue when history persistence fails.

### 4. Wire Search and usage through the Composition Root and executor lifecycle

- [x] Construct the usage history and Search service once in `createClacklyCore`; return `searchCommands` without exposing storage implementation.
- [x] Inject usage recording into `createCommandExecutor` after Command/Capability/enablement/config acceptance and immediately before `capability.execute`.
- [x] Keep recording failures subordinate and keep every existing execution error/result unchanged.
- [x] Extend executor tests for no record on rejected gates, one record on started success, one record on started Capability failure, and actual internal Interaction action IDs.
- [x] Extend Core integration tests for a separate usage document and restart persistence without contaminating `preferences.json` or `config.json`.

Rollback point: existing Capability and Interaction execution tests must remain unchanged except for explicit usage assertions.

### 5. Make the existing Search IPC the single production entry

- [x] Route both standalone and Workflow `commands:search` handlers to `core.searchCommands(query, pinnedIds)`.
- [x] Remove Registry `commandMatches` / `searchCommands` and update Registry tests/specs to keep it metadata-only.
- [x] Update preload and browser-preview APIs to the ordered `{ commands, usedCommandIds }` response contract.
- [x] Make browser preview use the shared Search policy with isolated data and empty in-memory usage; do not connect it to production Registry/storage/execution.
- [x] Update host composition tests so both hosts expose the same narrow Search IPC and neither imports a second Search implementation.

Rollback point: standalone/Workflow source boundary tests and browser preview tests pass before renderer integration.

### 6. Convert Palette to a Search consumer

- [x] Remove renderer `matches` / `rankCommands` and renderer-owned Recent facts.
- [x] Fetch ordered Search results on initial load, Palette show, query change, Pin change, and locale change; ignore stale asynchronous responses by request revision.
- [x] Preserve current selection reset, Pin toggle behavior/capacity, Feature-status filtering, launcher nine-row limit, `PINNED` / `RECENT` / `COMMANDS` projection, Search-only `RESULTS`, keyboard flow, and execution-by-ID routes. Pin toggles retain the toggled Command's selection only when its accepted, current Core response still exposes it in the active (nine-row Launcher or full Search) result set.
- [x] Use `usedCommandIds` only for the existing Recent section projection; do not re-rank in renderer.
- [x] Keep complete raw localized Commands available for internal binding-derived Interaction Help.
- [x] Update model/browser-preview/localization tests and source-boundary checks so Search/ranking/usage authority cannot drift back into Palette code.

Rollback point: focused renderer tests and `npm run build` pass with no layout, window geometry, or visual-style change.

### 7. Full validation and spec convergence

- [x] Run focused Node tests for Search, usage, Registry, executor, Core, Interaction, localization, host composition, preload/browser preview, and renderer model.
- [x] Run `npm test` from `resolve-command-center`.
- [x] Run `npm run build`.
- [x] Run built and packaged headless Palette evidence to confirm the existing Palette/Panel presentation and browser preview remain intact.
- [x] Re-run `npm run package:win` and `npm run package:verify` after the final Palette review fixes before release packaging.
- [x] Run `git diff --check` and JSON/package-lock validation after the final review fixes.
- [x] Boundary-search for duplicate Registry/renderer matching, persisted ranking scores/pinyin/locale/query fields, renderer storage imports, and Command-ID execution branches.
- [x] Update backend/frontend Trellis specs to replace the old id/name/keywords renderer-search contract with the new Search Projection, usage ownership, IPC, ranking, and lifecycle contracts.
- [x] Lead performs the independent Trellis/acceptance review after final worker verification.
- [x] Install the Workflow package with `npm run workflow:install` only after automated/package checks pass; then report the exact remaining Resolve manual checks rather than claiming native acceptance.

## Review-closeout status (2026-08-29)

- [x] Restored the pre-Search-migration Pin-toggle selection behavior without reintroducing renderer ranking: the accepted current Search response keeps the toggled Command selected when it remains in the active result list, otherwise Launcher/Search fall back to their first row.
- [x] Refresh Search after accepted Command/Interaction execution on both success and failure paths, so a started Capability failure still updates Core usage/`RECENT` without reopening the Palette.
- [x] Changed developer-only Palette evidence Search to call the shared `CommandSearchService` through its isolated local host fixture; query filtering/ranking is no longer a permissive stub.
- [x] Lead reran the full gate: 345 Node tests plus Python suites 6/26/15/32/2, production build, built and packaged headless evidence, Windows package/verify, the focused Impeccable detector, adversarial Registry-backed Search probes, authority scans, and `git diff --check` all passed.
- [x] Workflow installation recreated the Resolve plugin junction after copying `WorkflowIntegration.node`. Resolve-native/DWM/focus/hit-test behavior remains an explicit post-install manual acceptance step and is not claimed by automation.

## Validation examples

- In `zh-CN`, the visible AE Command matches `导出`, `dao`, `daochu`, and `dcsjx` from ordinary localized metadata.
- In `zh-CN`, `Export to After Effects`, `after effects`, `export`, and `timeline` still match English base metadata.
- A localized-name prefix outranks a high-usage substring or pinyin match.
- Equal relevance may be reordered by Pin, then decayed usage.
- Empty query ranks a recent repeated Command ahead of unused Commands, while a very old high count decays below meaningfully newer use.
- `en -> zh-CN -> en` switches projection without retaining stale Chinese fields.
- Unknown persisted IDs never appear; disabled/misconfigured/unknown Commands do not record usage; a started Capability does record even if it later fails.

## Expected changed areas

- `resolve-command-center/command-search/**` (new)
- `resolve-command-center/command-usage/**` (new)
- `resolve-command-center/localization/**`
- `resolve-command-center/command-engine/**`
- `resolve-command-center/app/**`
- `resolve-command-center/electron/main/**`
- `resolve-command-center/electron/renderer/**`
- `resolve-command-center/workflow-plugin/main.js`
- `resolve-command-center/package.json` / `package-lock.json`
- `.trellis/spec/backend/quality-guidelines.md`
- `.trellis/spec/frontend/quality-guidelines.md`

No Resolve adapter, script-runtime, Capability implementation, native window geometry, Pin capacity, Preferences schema, capability Config schema, or cloud/project profile code is expected to change.
