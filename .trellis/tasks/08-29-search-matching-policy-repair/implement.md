# Search matching policy repair — implementation plan

## 1. Separate projection channels

- [x] Split merged `fullPinyin` / `pinyinInitials` into name-derived and keyword-derived fields.
- [x] Keep initials only for Command names.
- [x] Add bounded name-only polyphonic alternatives using the existing library, with deduplication and no Cartesian expansion.
- [x] Preserve current localization fallback, presentability filtering, defensive output, locale-cache replacement, and stable source order.

Rollback point: projection/transliteration tests pass before changing matching buckets.

## 2. Implement token-aware navigation/discovery matching

- [x] Add one owned predicate for weak single-letter Latin tokens.
- [x] For such tokens, evaluate only strong name-derived exact/prefix and name-pinyin/initials exact/prefix fields.
- [x] For discovery-eligible tokens, retain localized/English keyword and keyword-full-pinyin matching.
- [x] Separate name, Command-ID, keyword, and keyword-pinyin substring fallbacks so hidden discovery signals never share name relevance.
- [x] Preserve multi-token AND semantics and the complete text tuple before Pin/usage.

Rollback point: focused policy tests prove the repair without any renderer/Registry changes.

## 3. Add regressions

- [x] Realistic Clipboard Image fixture: `d` excluded; `da`, `dao`, `daoru`, and `导入` included; keyword initials excluded.
- [x] Name navigation: `z`, `zhan`, primary/alternative full pinyin, and valid name initials remain usable through the visible name projection.
- [x] Single-letter Latin keyword/ID/substring-only matches are excluded, while a visible name prefix remains included.
- [x] Existing export `dao`, `daochu`, and `daochushijianxian` discovery remains green; actual visible-name initials `dcdae` remain usable, while hidden-keyword initials `dcsjx` are intentionally absent.
- [x] Name-derived relevance beats pinned/high-usage keyword discovery; text relevance remains ahead of Pin and usage.

## 4. Converge spec and validate

- [x] Update the backend Search contract to distinguish navigation/discovery channels, keyword-full-pinyin eligibility, name-only initials, and bounded name polyphony.
- [x] Run focused Command Search/transliteration/Registry tests and production metadata probes.
- [x] Run full `npm test`, `npm run build`, boundary checks, and `git diff --check`.
- [x] Lead-owned release validation: isolated `npm run package:win`, `npm run package:verify`, packaged headless evidence, and Workflow package installation passed.
- [ ] Resolve-native acceptance remains a post-install user handoff; no visible Electron or Resolve launch was performed during automated validation.
- [x] Lead-owned independent review found no blocking issues.
- [ ] Lead-owned commit, archive, and journal update remain pending until Phase 3.4 / finish-work completes.

## Expected product-code scope

- `resolve-command-center/command-search/CommandSearchService.mjs`
- `resolve-command-center/command-search/CommandSearchService.test.js`
- `resolve-command-center/command-search/transliteration.mjs` and its test only if the bounded name-polyphonic helper belongs there
- `.trellis/spec/backend/quality-guidelines.md`

No Command manifest, localization resource, Registry matcher, renderer ranking, usage persistence, IPC, execution, native-window, or Pin-capacity change is expected.

## Validation record — 2026-08-29

- Focused Search/transliteration/Registry suite: 19/19 passed.
- Full `npm test`: 349 Node tests plus 81 Python tests passed.
- `npm run build`: passed. The existing Vite large-chunk warning remains; the main renderer bundle is 504.28 kB (211.99 kB gzip), a measured +2.29 kB (+0.67 kB gzip) from the `HEAD` baseline. No code-splitting change belongs in this repair.
- Production Registry probes passed for Clipboard Image (`d` excluded; `da`/`dao`/`daoru`/`导入` and name alternatives included) and Export (`dao`/`daochu`/`daochushijianxian`/`dcdae` included; `dcsjx` excluded).
- Boundary scans found no old merged pinyin fields, keyword-initial persistence, Command-specific search branches, or Registry/renderer matcher. The only renderer `searchCommands` reference delegates to the shared preview Search service.
- `git diff --check` passed. Package, Workflow installation, and Resolve-native validation are explicitly left to the Lead.
- Built headless evidence alignment: `node scripts/palette-evidence.mjs --renderer built --scenario search-results` passed. The evidence now sends the shared Search service `clipboard` then discovery-eligible `ar`, verifies the latest request is `ar`, and requires multiple real results instead of relying on weak one-letter `a`.
- The post-alignment full `npm test` rerun passed 352 Node tests plus 81 Python tests. The higher Node count includes concurrent Motion Foundation coverage and does not alter Search policy scope.
- Lead isolated the repair from concurrent Motion Foundation work at detached `HEAD`, applied only the Search/spec/evidence hunks, and reran `npm test`: 349 Node tests plus 81 Python tests passed. The first clean checkout exposed one unrelated CRLF-sensitive Settings source-regex test; restoring that unchanged baseline file with LF made the targeted test and complete suite pass.
- Isolated `npm run build`, managed Runtime staging, `npm run package:win`, and `npm run package:verify` passed. The packaged headless `npm run palette:evidence` passed all 19 pre-Motion scenarios, including the updated shared-policy Search scenario.
- `npm run workflow:install:package` installed the isolated packaged repair to `C:\ProgramData\Blackmagic Design\DaVinci Resolve\Support\Workflow Integration Plugins\com.wutpeach.clackly`. Resolve was not launched; restart/manual host acceptance remains the user handoff.
