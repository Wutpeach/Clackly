# Search & Ranking Foundation — Technical Design

## 1. Architecture summary

This task replaces the current split Search implementations with one Core-owned Search service and introduces one independent Command Usage History authority.

```text
Command manifests + locale overlays
              │
              ▼
      Command Registry (source metadata)
              │
              ▼
  CommandSearchService ───── effective locale
       │        │
       │        └────────── CommandUsageHistory
       │                         │
       │                         └── %APPDATA%/Clackly/command-usage.json
       ▼
commands:search(query, pinnedIds)
       ▼
Palette: ordered Commands + used Command IDs

Command ID ──► Command Executor acceptance gates ──► record usage ──► Capability.execute
```

- Command manifests and localization overlays remain source of truth.
- Registry remains Command ID / metadata authority and no longer implements Search matching.
- `CommandSearchService`, constructed once by `createClacklyCore`, owns projection, matching, text relevance, Pin tie-breaking, usage tie-breaking, and empty-query ordering.
- `CommandUsageHistory`, also constructed once by the Composition Root, owns persisted usage facts.
- Palette owns only query input, explicit Pin state, selection, and presentation. It does not calculate relevance or usage ranking.
- Command executor remains the only Command ID -> Capability execution authority.

This is one cohesive task rather than a parent/child tree because Search projection, usage recording, and ranking have one cross-layer acceptance contract and must ship together to avoid temporary duplicate authorities.

## 2. Current authority migration

### Remove

- `command-engine/registry.js` `commandMatches` / `searchCommands` semantics.
- Renderer `model.mjs` `matches` / `rankCommands` semantics.
- Renderer-owned Recent facts as a second invocation-history store.

### Retain

- Registry validation, defensive cloning, `getCommands`, `getCommandById`, and the generic `isCommandPresentable` predicate.
- Existing `commands:search` IPC channel name, now routed to `core.searchCommands` in both hosts.
- `commands:list` for the complete raw catalog, including internal Commands needed by binding-derived help.
- Renderer Pin `Set` and the existing `PINNED` / `RECENT` / `COMMANDS` section presentation. Pin IDs are submitted as request facts; the Search service owns their ordering effect.
- Command-ID-only execution IPC and InteractionManager delegation.

## 3. Search Projection contract

### Input

```js
{
  command: BaseCommandMetadata,
  effectiveLocale: "en" | "zh-CN"
}
```

`BaseCommandMetadata` is the Registry-validated Command record. Search reuses the single shared metadata-localization helper rather than duplicating overlay fallback behavior.

### Ephemeral derived record

```js
{
  sourceIndex: number,
  command: LocalizedCommand,
  fields: {
    localizedName: SearchField[],
    englishName: SearchField[],
    localizedKeywords: SearchField[],
    englishKeywords: SearchField[],
    fullPinyin: SearchField[],
    pinyinInitials: SearchField[],
    commandId: SearchField[]
  }
}
```

Each `SearchField` carries only normalized and compact forms needed by the owned matcher. It is not exposed over IPC and is never persisted.

Projection rules:

- Normalize source text with Unicode NFKC, locale-independent lowercase, trim, and collapsed whitespace.
- Keep localized/base name and keyword fields separate so ranking can identify which authority matched.
- English base name/keywords remain present in every locale.
- Generate full pinyin and initials for localized name and localized keyword values. Latin/mixed segments remain searchable as normalized source text.
- Generate one primary contextual reading only; no polyphonic combination expansion.
- `pinyin-pro` provides tone-free syllables. Clackly joins syllables and derives initials.
- Do not include descriptions or presentation category because current Search deliberately excludes presentation-only fields.
- Filter `presentation: "internal"` with the existing generic predicate before Search output; internal Commands remain executable and resolvable by ID elsewhere.

### Cache lifecycle

`CommandSearchService` holds at most one projection snapshot `{ effectiveLocale, entries }`. Every search reads the current `LocalizationService` snapshot. A locale mismatch atomically replaces the cached projection; it never accumulates per-locale indexes. Tests exercise `en -> zh-CN -> en` and prove stale localized terms disappear.

## 4. Query and text-relevance policy

### Query normalization

- Non-string input becomes an empty query at the IPC/service boundary.
- Apply the same NFKC/lowercase/whitespace normalizer as projection fields.
- Split nonempty queries on whitespace; every token must match at least one searchable field.
- Compact matching removes pinyin syllable spacing so `dao`, `daochu`, and `dcsjx` work without input-method changes.

### Relevance classes, strongest to weakest

1. localized name exact
2. localized name prefix
3. English base name exact
4. English base name prefix
5. localized keyword exact
6. localized keyword prefix
7. English keyword exact
8. English keyword prefix
9. stable Command ID exact / prefix
10. full-pinyin exact / prefix
11. pinyin-initials exact / prefix
12. bounded substring containment in the same owned fields

This phase does not add edit-distance typo correction, token reordering grammar, semantic matching, or polyphonic alternatives. The final substring class preserves the useful bounded behavior of the existing implementation without introducing a complex fuzzy parser.

### Multi-token comparison

Each token receives its best field match. A result is excluded if any token has no match. Text ordering is lexicographic over:

1. whole-query match class when present, otherwise the weakest token class;
2. weakest token class;
3. aggregate token strength;
4. exact-match and prefix-match counts.

Only after the complete text tuple is equal may Pin and usage participate. Therefore no amount of usage can move a weak substring/pinyin result above a stronger localized/English/keyword target.

### Final nonempty-query ordering

```text
complete text relevance tuple
> explicit Pin membership
> decayed usage score
> lastUsedAt
> usageCount
> Registry source order
```

Pin remains an explicit user request and is not folded into usage. It never crosses a stronger text-relevance boundary.

## 5. Usage History contract

### Persisted document

Path: `%APPDATA%/Clackly/command-usage.json`

```json
{
  "timeline.addMarker": {
    "usageCount": 12,
    "lastUsedAt": 1787961600000
  }
}
```

- Root keys are stable `commandId` facts.
- `usageCount` is a positive safe integer.
- `lastUsedAt` is a nonnegative integer Unix epoch in milliseconds.
- No locale, query, pinyin, UI state, project identity, Pin state, relevance class, decayed score, or final rank is stored.
- Returned snapshots are defensive.

`CommandUsageStorage` composes the existing atomic JSON replacement mechanism but exclusively owns `command-usage.json`. It does not read or write Preferences, `config.json`, Feature state, or bindings.

### Recording lifecycle

The executor flow becomes:

```text
lookup Command
→ resolve Capability
→ assert Feature enabled
→ assert required configuration
→ create capability-scoped config
→ record(command.id, clock.now)
→ start Capability.execute
```

This records accepted/started invocations, including a Capability that later reports an execution error. Unknown Commands, missing Capabilities, disabled Features, missing configuration, hover, selection, exposure, Info, and unmatched interactions never record usage.

InteractionManager automatically records the actual `binding.action.command` because it delegates that ID through the same executor. Usage cannot add a Command, change a Capability mapping, bypass enablement/configuration, or retry execution.

Usage read/write failure is non-authoritative: report through an injectable diagnostic callback, fall back to an empty snapshot or skipped record, and continue Search/Command execution. A damaged recommendation history must not make real Commands undiscoverable or unexecutable.

## 6. Usage ranking policy

Scores are computed dynamically with an injectable clock and never persisted:

```text
age = max(0, now - lastUsedAt)
decayedUsage = ln(1 + usageCount) × 0.5 ^ (age / 30 days)
```

- `ln(1 + count)` gives frequency diminishing returns.
- A 30-day half-life makes old frequency lose influence predictably.
- `lastUsedAt`, then `usageCount`, then Registry order make ties deterministic.
- Missing usage has score zero.

For an empty query, final ordering is:

```text
explicit Pin membership
> decayed usage score
> lastUsedAt
> usageCount
> Registry source order
```

The Search response returns ordered localized Commands plus `usedCommandIds` derived from facts. The renderer uses `usedCommandIds` only to preserve the existing `RECENT` section projection; it does not re-rank them. Pinned Commands continue to project once under `PINNED`, even if they also have usage.

The Palette still slices the already-ranked, feature-visible launcher catalog to nine rows. No Pin capacity, new section, badge, settings editor, or profile UI is added.

## 7. IPC and renderer lifecycle

### IPC request

```js
commands:search(query, pinnedIds)
```

- `query`: string; non-string normalizes to empty.
- `pinnedIds`: array of unique nonempty strings; malformed values reject at the IPC/service boundary.

### IPC response

```js
{
  commands: LocalizedVisibleCommand[],
  usedCommandIds: string[]
}
```

No relevance classes, pinyin fields, usage score, or executable objects cross IPC.

Renderer behavior:

- Initial load / Palette show requests empty-query results in parallel with raw catalog, bindings, and Feature statuses.
- Query, Pin, or effective-locale change requests fresh Search results.
- A monotonically increasing request token ignores stale out-of-order IPC results.
- Renderer joins ordered Search results to Feature status and filters unavailable/uninstalled presentation without changing order.
- Raw Commands are still localized with the shared helper for internal binding-help resolution.
- Locale broadcasts already update `effectiveLocale`; that change triggers Search again, while the service replaces its one projection cache.
- Browser preview implements the same API contract through the shared pure Search service with isolated preview metadata, an in-memory empty usage authority, and its local locale snapshot. It never becomes production authority or executes Commands.

## 8. Compatibility and rollout

- Existing usage starts empty; Registry order remains the fallback, so first-run ordering is stable.
- Existing Pins remain renderer-session state and retain current capacity/controls. The task does not invent Pin persistence.
- No migration touches preferences/config/bindings/feature state.
- A missing usage document is normal and produces an empty history.
- A future missing/renamed Command ID may remain in usage storage but cannot appear or execute because Search intersects only current Registry Commands and executor still resolves Registry IDs.
- Adding `导出时间线` to the visible AE Command's localized keywords is ordinary source metadata, not generated pinyin.

Rollback is straightforward: remove the new Search/usage modules and dependency, restore Registry/renderer search functions and host wiring, and delete no user data. An unused `command-usage.json` is harmless.

## 9. Known ceiling / deferred work

- Atomic whole-file replacement does not serialize writes between a simultaneously running standalone host and Workflow host. Each record operation reloads before writing, which minimizes stale same-process state, but a cross-process collision can still lose one increment. The supported product path discourages simultaneous hosts; cross-process locking is deferred unless real acceptance shows this is a supported concurrency requirement.
- No per-project partitioning, cloud sync, ranking editor, semantic search, typo model, or Command Package implementation is introduced.

