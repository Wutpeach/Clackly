# Search matching policy repair

## Goal

Repair the completed Search & Ranking Foundation so visible Command-name navigation and hidden keyword discovery have distinct matching semantics. Extremely weak Latin input must not surface Commands solely through invisible keyword metadata, while useful Chinese, English, full-pinyin, and Command-name-initial searches remain intact.

This is a scoped follow-up to `.trellis/tasks/archive/2026-08/08-29-search-ranking-foundation`. It changes matching policy only; it does not reopen the Search architecture, persistence model, execution path, or Palette design.

## Confirmed current behavior

- `CommandSearchService` is the sole production Search/ranking authority and already keeps text relevance ahead of Pin and usage.
- The current projection merges localized Command names and localized keywords into shared `fullPinyin` and `pinyinInitials` arrays.
- Consequently, the `粘贴剪贴板图像` keyword `导入` produces `daoru` and makes the one-letter query `d` match a result whose visible name does not explain that match.
- The selected library's primary reading for `粘贴` is `niantie`; its bounded polyphonic API also exposes `zhan`, so satisfying name navigation for `z` / `zhan` does not require authored Command metadata or a Command-specific branch.

## Requirements

### Navigation versus discovery

Search Projection must keep these channels distinct:

- Identity / navigation: localized name, English base name, Command-name full-pinyin, Command-name initials, and stable Command ID.
- Discovery: localized keywords, English keywords, and localized-keyword full-pinyin.

Name-derived navigation fields help users locate a Command from the name shown in the Palette. Keyword-derived discovery fields help users find a function without knowing its exact name. They must not share one relevance bucket or one initials projection.

### Weak Latin query policy

- A single normalized Latin letter may match strong name-derived exact/prefix, Command-name full-pinyin prefix, and Command-name initials prefix signals.
- A single normalized Latin letter must not activate localized/English keyword matching, keyword full-pinyin, stable-ID matching, substring fallback, fuzzy matching, or subsequence matching.
- Discovery eligibility is evaluated per normalized token so a multi-token query cannot smuggle a one-letter token into the discovery channel.
- A non-Latin query such as `导入` may still match localized keyword metadata directly.
- A Latin discovery token of at least two characters may use keyword exact/prefix, keyword full-pinyin, and the existing bounded substring fallback.

### Pinyin derivation

- Command names continue to derive full pinyin and initials.
- Command-name navigation may include a bounded set of library-supplied polyphonic alternatives so `粘贴...` can be found through `z` / `zhan` without authored pinyin.
- Alternative generation must be bounded and must not form a Cartesian product of every multi-pronunciation character.
- Localized keywords derive primary full pinyin only. They do not derive initials or abbreviation combinations such as `drmt`, `dm`, or `d` from `导入媒体`.
- Generated search fields stay ephemeral and never enter Command manifests or localization resources.

### Ranking

Text relevance remains lexicographically authoritative over Pin and decayed usage. Within text relevance, the policy must preserve this channel order:

1. localized / English Command-name exact and prefix matches;
2. Command-name full-pinyin and initials matches;
3. stable Command-ID exact/prefix navigation for discovery-eligible input;
4. localized / English keyword exact and prefix matches;
5. keyword full-pinyin discovery matches;
6. weaker bounded substring matches, with visible name substrings ahead of hidden keyword substrings.

No usage amount or Pin state may cross a stronger text-relevance boundary.

## Acceptance criteria

- [ ] `d` does not return `media.clipboard-image.import` solely because `导入 -> daoru` exists in localized keyword metadata.
- [ ] `da`, `dao`, and `daoru` continue to find that Command through keyword full-pinyin discovery.
- [ ] `导入` continues to find that Command through the localized keyword.
- [ ] `dr`, `dm`, and other keyword-derived initials do not find that Command.
- [ ] `z`, `zhan`, and a valid Command-name initials prefix can find `粘贴剪贴板图像` through name-derived projection; no Command-specific metadata or branch is added.
- [ ] A Command whose visible English or localized name begins with a Latin letter remains reachable by that single letter.
- [ ] Existing `dao`, `daochu`, and full `daochushijianxian` discovery searches do not regress; the visible name remains reachable through its actual name initials `dcdae`.
- [ ] A one-letter Latin query does not match solely through an English/localized keyword, Command-ID substring, or generic substring fallback.
- [ ] Name-derived navigation results outrank keyword-derived discovery results at equal query text, even when the discovery result is pinned or highly used.
- [ ] `text relevance > Pin > decayed usage` remains unchanged.
- [ ] Projection, IPC response, usage-history persistence, execution authority, Pin capacity, locale lifecycle, and renderer ownership remain unchanged.
- [ ] Focused Search tests, full `npm test`, production build, package verification, boundary checks, and Workflow installation pass before handoff.

## Out of scope

- Replacing `CommandSearchService`, changing Search IPC, moving ranking to Registry or renderer, or persisting the projection.
- Editing Command/localization metadata to make a testcase pass.
- Command-ID/capability special cases.
- AI/vector/semantic search, arbitrary subsequence matching, typo models, complex NLP, or unbounded polyphonic combinations.
- Preserving `dcsjx`: that abbreviation is derived only from the hidden keyword `导出时间线` and is intentionally removed so the no-keyword-initials contract remains coherent.
- Usage policy, persistence schema, Pin behavior/capacity, per-project ranking, cloud sync, or UI redesign.
