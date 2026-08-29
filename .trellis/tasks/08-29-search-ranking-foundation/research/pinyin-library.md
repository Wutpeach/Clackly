# Research: Pinyin Transliteration Library Choice

## Decision

Use `pinyin-pro` as a transliteration primitive only. Clackly continues to own field selection, normalization, initials derivation, match categories, multi-token semantics, ranking, and caching.

## Evidence gathered on 2026-08-29

| Package | Current version | Unpacked size | Dependencies | Last published/modified | Interop | Assessment |
|---|---:|---:|---|---|---|---|
| `pinyin-pro` | 3.29.3 | 944,383 B | none reported | 2026-08-19 | explicit ESM and CommonJS exports, types | Selected: maintained, phrase-aware primary transliteration, works in Core CJS and Vite renderer preview |
| `tiny-pinyin` | 1.3.2 | 42,185 B | none reported | 2022-06-27 | CommonJS main only | Smaller but materially older and less suitable for phrase-context transliteration |
| `pinyin` | 4.0.0 | 61,897,172 B | `commander ~1.1.1` | 2025-05-21 | Node-oriented | Rejected: disproportionate footprint and unnecessary CLI dependency |

Registry metadata was queried with `npm view`. `pinyin-pro` declares `main: ./dist/index.js`, `module: ./dist/esm/index.mjs`, typed conditional `exports`, `sideEffects: false`, and MIT licensing. Its documented API supports tone-free syllable arrays through `pinyin(text, { toneType: "none", type: "array" })`.

## Bounded use contract

- Request one deterministic primary/contextual transliteration. Do not enumerate polyphonic combinations.
- Normalize the returned tone-free syllables inside Clackly.
- Build compact full pinyin by joining normalized syllables.
- Build initials inside Clackly from those syllables; do not delegate initials Search semantics or ranking to library-specific matching helpers.
- Preserve non-Chinese source text through Clackly normalization so mixed names such as `导出到 After Effects` remain searchable in Chinese, pinyin, and English.
- Never write generated pinyin or initials into Command manifests or localization resources.
- Test the wrapper contract with production-like phrases, including `导出时间线 -> daochushijianxian / dcsjx`, so a future dependency update cannot silently redefine Search behavior.

## Why not a handwritten dictionary

A small local mapping would appear cheaper for today's Commands but would make external packages require manual updates and create a second metadata authority. `pinyin-pro` supplies transliteration coverage; the thin Clackly wrapper keeps the actual Search policy stable and testable.

