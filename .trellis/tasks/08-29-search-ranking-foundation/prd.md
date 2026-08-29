# Search & Ranking Foundation

## Goal

Make Command Palette discovery work naturally across Chinese and English metadata, and make commonly invoked Commands easier to reach without weakening explicit text intent. Users in a Chinese locale can search Chinese Commands with Chinese text, full pinyin, or pinyin initials without switching input methods. Empty-query ordering adapts to real invocation history.

## User Value

- Chinese-speaking users can keep their current input method and still find localized Commands.
- English base names and keywords remain discoverable in every locale.
- Frequently and recently used Commands surface earlier when the user has not expressed a text query.
- Search relevance remains predictable: usage can break comparable matches, but cannot override a stronger textual match.

## Background

- Command JSON manifests plus their optional locale overlays are the current metadata authority.
- The production Palette currently searches and ranks inside renderer `model.mjs`, while the Command Registry exposes a second locale-blind substring Search over IPC that the Palette does not use. This task must converge those paths into one Search authority.
- Current Pin and Recent state are renderer-session Sets. Pin is explicit user state; Recent currently approximates invocation history but is not persisted.
- Both direct and mapped mouse execution already converge on the shared Composition Root Command executor, which supplies one lifecycle boundary for accepted/started usage recording.
- Preferences, capability Config, Feature state, and bindings already own separate app-data documents. Usage history requires its own document and owner.

## Requirements

### Search projection

- Command and localization metadata remain the source of truth.
- The Search layer derives a projection containing the localized name, English base name, localized keywords, English keywords, full pinyin, pinyin initials, and stable Command ID as applicable.
- Pinyin and initials are generated automatically; they are not written into Command manifests or localization resources and do not become developer-maintained metadata.
- Future external Command Packages receive pinyin search from their ordinary metadata/localization without package-specific pinyin fields.
- Locale changes rebuild or replace the derived projection from current metadata. There must not be a second long-lived stale index authority.
- The real visible AE Command gains `导出时间线` only as an ordinary localized keyword phrase; `dao`, `daochu`, and `dcsjx` remain generated projection data.

### Text matching and ranking

- Search supports Chinese source text, English fallback metadata, localized keywords, English keywords, full-pinyin prefixes, pinyin-initial prefixes, stable Command IDs, and the existing bounded fuzzy behavior where repository evidence shows it should remain.
- Search semantics and ranking policy are owned by Clackly. A third-party pinyin dependency, if selected, is only a transliteration mechanism.
- Text relevance is the primary ordering dimension. Stronger textual matches always rank before weaker textual matches, regardless of usage history.
- Ranking uses explicit, testable relevance tiers or an equivalent lexicographic policy rather than an opaque blended score that lets usage cross text-relevance boundaries.
- Deterministic fallback ordering is retained for otherwise equal results.

### Usage history

- A single usage-history authority persists stable facts only: `commandId`, `usageCount`, and `lastUsedAt`.
- Usage history is independent of locale, pinyin, search query, renderer/UI state, and final ranking scores.
- Usage is recorded at a real Command invocation acceptance/start boundary, never for hover, selection, pinning, search exposure, or other presentation interactions.
- Usage history does not alter Command execution authority or success/error semantics.
- Persistence has its own ownership and does not pollute Preferences or general Config ownership.
- Unknown/removed Command IDs are harmless and do not manufacture executable Commands.

### Adaptive ordering

- With an empty query, the existing Pin semantics remain distinct and stable, while unpinned Commands adapt to usage frequency and recency.
- Pin capacity and explicit Pin behavior do not expand or change for this feature.
- Recency decay prevents old frequency from permanently dominating current habits.
- With a non-empty query, usage/recency is a secondary signal only within equal text-relevance strength.
- No new complex Recommended/Frequent UI section is required; ordering alone is sufficient unless repository constraints require otherwise.
- The existing Recent section may be fed by read-only facts from the single usage authority, but it does not compute ordering or persist a second history.

## Acceptance Criteria

- [ ] In the Chinese locale, the visible AE Command's localized phrase `导出时间线` is discoverable by `导出`, `dao`, `daochu`, and `dcsjx`.
- [ ] English base-name and English-keyword matches remain searchable while the Chinese locale is active.
- [ ] Localized keywords participate in matching.
- [ ] A high-usage weak text match cannot rank above a low-usage strong text match.
- [ ] Usage breaks ties or near-ties only inside the same explicit textual relevance tier.
- [ ] Frequently and recently invoked Commands naturally move earlier among unpinned empty-query results.
- [ ] A historically frequent but long-unused Command decays behind meaningfully newer usage under the documented policy.
- [ ] Pin behavior, capacity, and explicit-user semantics remain unchanged.
- [ ] Locale switching replaces/recomputes the Search Projection and tests prove stale localized terms are not retained as a second authority.
- [ ] Usage is persisted as stable facts outside Preferences/general Config and survives process restart.
- [ ] Presentation-only interactions do not increment usage; a real accepted/started execution does.
- [ ] Search and usage ranking cannot create or execute Commands outside the existing Command execution authority.
- [ ] Focused unit and integration tests cover projection, transliteration, relevance ordering, adaptive ordering, persistence, locale changes, pins, and execution lifecycle.
- [ ] First-run/empty history preserves deterministic Registry order after Pins, so rollout does not arbitrarily reshuffle Commands.

## Constraints

- Do not add AI recommendations, vector/semantic search, user profiling, per-project ranking, cloud sync, custom ranking editors, complex search syntax, or the Command Package system itself.
- Avoid combinatorial polyphonic-character expansion and an over-complex fuzzy parser; optimize for common launcher behavior.
- Do not let Palette renderer state own usage or ranking authority.
- Do not persist final ranking scores.

## Out of Scope

- AI or semantic recommendations
- Vector search
- User behavior profiles
- Per-project recommendations
- Cloud usage synchronization
- User-authored ranking rules
- Complex query languages
- Command Package system implementation
- Increasing Pin capacity
