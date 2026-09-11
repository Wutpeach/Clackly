# Stage B implementation report

## Scope completed

After the user reported “手测通过”, removed Marker-based AE targeting while preserving the three existing commands/bindings, media policies, selected-only relative timing/gaps, linked-media de-duplication, and the public result shape.

- `resolve2ae_core/export.py` now reads `Timeline.GetSelectedClips()` once when available; a non-empty list remains authoritative, and an empty list or absent API uses the existing playhead selection. It never reads timeline Markers.
- `scripts/resolve2ae_export.py` keeps `timeline.exportToAfterEffects`, `timeline.exportAudioToAfterEffects`, and `timeline.exportVideoToAfterEffects`, with their normal/audio/video modes and media policies. The result still exposes `target_policy: "auto"` as its stable compatibility value, but no target-policy branch remains.
- Removed export-only `resolve/timeline_range.py` and `resolve/test_timeline_range.py`, Marker range/errors/compatibility triples, and their obsolete core/wrapper tests. Kept `resolve.adapter.read_timeline_markers`, `read_timeline_start_frame`, `add_marker`, and their adapter tests because they are shared Marker APIs outside AE export.
- Updated the active backend contract and Resolve/Python compatibility matrix to final selected-item/playhead behavior. Historical Stage A reports and older task research were not changed.

## Caller audit

fff searches before deletion found `process_and_send() -> get_target_clips_logic()` as the sole production acquisition caller; Marker/range imports and branches occurred only in `resolve2ae_core/export.py` and dedicated tests. The post-cleanup fff audit finds no `blue-range`, `MissingMarkerError`, `TimelineRange`, or range resolver use in `resolve-command-center`; the only raw Marker-reader references are their retained adapter definitions/tests.

## Checks

| Command | Result |
| --- | --- |
| `python -m py_compile resolve2ae_core/export.py scripts/resolve2ae_export.py resolve/adapter.py` | passed |
| `python -m unittest resolve2ae_core.tests.test_export_core` | passed — 30 tests |
| `python -m unittest discover -s resolve -p 'test_*.py'` | passed — 21 tests |
| `python -m unittest discover -s scripts -p 'test_*.py'` | passed — 2 tests |
| `npm test` | passed — full configured Node/Python suite |
| `npm run build` | passed — existing >500 kB chunk advisory only |
| `npm run package:win` | passed — refreshed `release/win-unpacked` with both managed profiles |
| `npm run package:verify` | passed — packaged CPython 3.13.14 and 3.14.4 verified |

`package.json` has no configured lint or typecheck script. Electron Builder retains its existing author/asar/duplicate-dependency advisories; they did not fail packaging.

## Package freshness and limits

The final package is `resolve-command-center/release/win-unpacked`, rebuilt after cleanup and verified against the current source/staged runtime profiles. The user-reported manual test satisfies the cleanup gate; this worker did not repeat live Resolve/After Effects interaction or modify/save a user project. Independent review, commit, and task archive remain with the Lead.
