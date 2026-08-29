# Search matching policy repair — technical design

## 1. Boundary

The repair remains entirely inside the existing Core-owned Search policy plus its tests/spec. Command/localization metadata remains source of truth; `CommandSearchService` remains the only production matcher/ranker; the Search IPC response and Palette consumer do not change.

The implementation must not use `query.length === 1` as an isolated top-level exception. Instead it models two field channels and applies an explicit discovery-eligibility predicate to each query token.

## 2. Projection contract

Replace the merged pinyin arrays with explicit fields:

```js
fields: {
  localizedName: SearchField[],
  englishName: SearchField[],
  nameFullPinyin: SearchField[],
  namePinyinInitials: SearchField[],
  commandId: SearchField[],
  localizedKeywords: SearchField[],
  englishKeywords: SearchField[],
  keywordFullPinyin: SearchField[]
}
```

No generated field crosses Search IPC or is persisted.

### Name pinyin

- Keep the deterministic primary full-pinyin/initials candidate.
- Use `pinyin-pro` polyphonic syllable evidence for Command names only.
- Add bounded alternatives by replacing one primary syllable at a time; never calculate the Cartesian product of all pronunciations. Deduplicate normalized full/initial candidates.
- This linear bound supports `粘 -> zhan` and corresponding name initials without turning every keyword into an abbreviation graph.

### Keyword pinyin

- Localized keywords produce primary compact full pinyin only.
- Do not project keyword initials.
- English keywords remain direct normalized discovery fields; they do not require a second transliteration authority.

## 3. Query policy

Normalize and tokenize exactly once with the existing NFKC/lowercase/whitespace contract.

```js
isWeakLatinToken(token) = /^[a-z]$/.test(compact(token))
discoveryEligible(token) = !isWeakLatinToken(token)
```

For a weak Latin token, evaluate only localized/English name exact/prefix and name pinyin/initials exact/prefix. Do not evaluate keyword fields, Command ID, or any substring fallback.

For every other token, evaluate the complete navigation/discovery table. Multi-token AND behavior remains; each token carries its own eligibility, so `d import` cannot use hidden discovery metadata for `d` merely because the whole query is longer.

Chinese single-character input is not a weak Latin token and retains direct keyword discovery. The policy does not add fuzzy or subsequence matching.

## 4. Relevance policy

Use distinct numeric buckets while preserving the existing lexicographic tuple comparison:

```text
localized name exact / prefix
> English name exact / prefix
> name full-pinyin exact / prefix
> name initials exact / prefix
> Command ID exact / prefix (only when discovery-eligible)
> localized keyword exact / prefix
> English keyword exact / prefix
> keyword full-pinyin exact / prefix
> name substring
> Command-ID / keyword / keyword-pinyin substring
```

Exact/prefix distinctions may remain separate inside a channel. The complete text tuple is still compared before Pin, decayed usage, last-used time, count, and Registry order.

## 5. Compatibility and failure containment

- Empty-query adaptive ordering is untouched.
- Locale replacement still rebuilds one ephemeral current-locale projection.
- Existing Search response shape `{ commands, usedCommandIds }` is untouched.
- Existing usage and execution services are untouched.
- A rollback restores only `CommandSearchService`, transliteration helper/tests, and the matching-policy spec wording.
- `dcsjx` is intentionally not preserved: it can only come from the hidden keyword `导出时间线`, so retaining it would reintroduce the keyword-initial channel this repair removes. `dcdae` is the actual visible-name initials projection.

The bounded name-polyphonic projection may modestly increase the renderer-preview bundle because that preview shares the production Search service. Package/build warnings must be measured and reported, not hidden; no code splitting or frontend redesign belongs to this repair.

## 6. Verification design

- Focused unit tests inspect the projection shape and exact result IDs for navigation/discovery cases.
- Ranking tests pair a visible-name result with a pinned/high-usage hidden-keyword result and prove the name result wins.
- Production Registry probes cover the real Clipboard Image and Export metadata without changing those manifests.
- Boundary scans prove there is no keyword-initial field, Command-specific branch, renderer matcher, Registry matcher, or persisted generated pinyin.
- Full test/build/package/Workflow gates follow the existing Search Foundation release path.
