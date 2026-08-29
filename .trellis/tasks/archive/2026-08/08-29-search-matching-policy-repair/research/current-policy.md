# Current matching-policy evidence

## Production cause

`command-search/CommandSearchService.mjs` currently builds `localizedText = [localized.name, ...localized.keywords]`, transliterates the combined array, and stores the results in shared `fullPinyin` and `pinyinInitials` fields. `bestFieldMatch()` therefore cannot tell whether `d` came from a visible name or hidden keyword.

The production Clipboard Image metadata contains localized keyword `导入`. The current projection derives `daoru`, so `d` is a `FULL_PINYIN_PREFIX` even though the visible name is `粘贴剪贴板图像`.

## Library evidence

Local `pinyin-pro@3.29.3` probes on 2026-08-29 returned:

```text
pinyin("粘贴") -> ["nian", "tie"]
polyphonic("粘贴") -> [["nian", "zhan"], ["tie"]]
```

Therefore `z` / `zhan` name navigation requires bounded library-supplied alternative projection; it cannot be obtained from the existing primary-only wrapper. A name-only, one-position-at-a-time alternative policy satisfies that requirement without authored metadata, Command-specific branches, or polyphonic Cartesian expansion.

The visible Export name `导出到 After Effects` has name initials `dcdae`. The formerly accepted `dcsjx` comes only from hidden keyword `导出时间线`; the user chose on 2026-08-29 to remove that acceptance rather than retain a general keyword-initial projection.

## Preserved boundaries

- Core `CommandSearchService` remains sole production matcher/ranker.
- Registry and renderer remain matcher-free.
- Search IPC, usage persistence, executor lifecycle, empty-query ordering, Pin, and locale ownership do not change.
- Existing archived research selected `pinyin-pro` as transliteration primitive while reserving all Search semantics for Clackly.
