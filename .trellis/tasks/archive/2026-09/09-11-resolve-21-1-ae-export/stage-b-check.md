# Stage B check report

## Findings (fixed)

### Export-only raw range adapters remained

- **Files:** `resolve/adapter.py`, `resolve/test_adapter.py`
- **Issue:** `read_timeline_start_frame()` and `read_timeline_markers()` survived after `resolve/timeline_range.py` was removed. Exact fff caller searches found only their definitions and their two self-tests; `git blame` traced both helpers to the original TimelineRange extraction commit (`9d0a404`). They were not shared production Marker APIs.
- **Fix:** Removed both helpers, imports, and obsolete range-fact tests. Kept Python/JavaScript `add_marker` implementations and tests; their `GetMarkers()` reads remain solely for reporting duplicate Marker creation.

### Obsolete Blue regression wording and duplicate work remained

- **File:** `resolve2ae_core/tests/test_export_core.py`
- **Issue:** One playhead OTIO test still called itself `mixed_blue` and repeated the same Marker-free assertions in a second block.
- **Fix:** Renamed it to the playhead behavior it tests and deleted the duplicate block. The focused core suite remains 30 tests.

### Explicit selection unnecessarily read the playhead

- **Files:** `resolve2ae_core/export.py`, `resolve2ae_core/tests/test_export_core.py`
- **Issue:** Native selected records were authoritative for membership, but the shared function still called `GetCurrentTimecode()` before switching to batch mode. A valid explicit selection therefore depended on unrelated playhead state.
- **Fix:** Enter batch mode before playhead acquisition for a non-empty native selection. Added a regression assertion that makes any explicit-selection playhead read fail.

### Shipped README described removed Marker export behavior

- **File:** `README.md`
- **Issue:** The packaged README still claimed Blue Marker ranges and retired range actions were executable.
- **Fix:** Replaced that paragraph with native selected-set, playhead fallback, Marker independence, and legacy-binding migration behavior. Source and packaged README SHA-256 now match (`0C2ECFDE710C306EE2E7F31AE193BA3210495963C61DA09637DD820572499F7E`).

### Stale compiled range caches remained in the source tree

- **Files removed:** `resolve/__pycache__/timeline_range.cpython-312.pyc`, `resolve/__pycache__/timeline_range.cpython-313.pyc`, `resolve/__pycache__/test_timeline_range.cpython-312.pyc`
- **Issue:** Deleted modules still had local bytecode that an unrestricted package glob could potentially copy.
- **Fix:** Removed only those reproducible caches. They are generated artifacts and are not recoverable as source, but Python can regenerate caches for modules that still exist.

### Active selection signature was imprecise

- **File:** `.trellis/spec/backend/quality-guidelines.md`
- **Issue:** The updated signature described `get_target_clips_logic()` as returning only a record list, while the stable public helper result is a four-value tuple.
- **Fix:** Recorded the actual `(mode, list[record], fps, content_type)` shape without changing runtime behavior.

## Findings (not fixed)

None.

The Vite >500 kB chunk advisory and existing electron-builder author/asar/duplicate-dependency advisories remain non-failing baseline warnings outside this task.

## Final behavior review

- Commands and wrapper pairs remain exactly:
  - `timeline.exportToAfterEffects -> (auto, mixed)`
  - `timeline.exportAudioToAfterEffects -> (audio-only, audio)`
  - `timeline.exportVideoToAfterEffects -> (video-only, video)`
- Default bindings remain Click / Ctrl+Click / Ctrl+Shift+Click for mixed / audio / video. Historical binding ids are retained only in `BindingStorage` migration data; retired ids have no Command registration or wrapper route.
- `GetSelectedClips()` is called once when present. A non-empty selected set is authoritative, uses real track type/index, keeps supported enabled media-backed records, preserves deterministic selected-only ordering and composition gaps, and never collects intervening or playhead clips.
- Media filtering and linked A/V de-duplication remain shared with playhead behavior. A non-empty selection filtered to nothing returns `no-clips`; it does not fall back to unrelated content.
- Empty selection and API absence use the existing topmost playhead behavior. API exceptions, non-callable APIs, malformed responses, and malformed item/track facts remain explicit `NativeSelectionError` failures.
- Core success still returns the seven public fields plus the private desktop launch plan; controlled failures return the seven public fields; `target_policy` remains the stable public value `"auto"` without selecting a branch.
- User manual testing was already recorded as passed before cleanup. This check did not repeat live Resolve/AE probes and did not save, reset, or modify live projects.

## Deletion and reference audit

- Final fff search under `resolve-command-center/` returned zero matches for `blue-range`, `MissingMarkerError`, `TimelineRange`, `timeline_range`, `resolve_timeline_range`, `read_timeline_markers`, `read_timeline_start_frame`, `mixed_blue`, and `mixed-Blue`.
- `GetMarkers()` remains only in the unrelated Python/JavaScript Marker-add adapters and their tests. No AE export file imports an adapter Marker reader or reads timeline Markers.
- `resolve/timeline_range.py` and `resolve/test_timeline_range.py` are deleted. No source, staged Runtime, packaged app, packaged Runtime, or compiled-cache filename for either module remains.
- Active backend spec, compatibility matrix, Command descriptions, and shipped README describe native selection plus playhead fallback. Historical task/research records were intentionally preserved.

## Package freshness and absence evidence

After the final fixes, `package:win` restaged both managed profiles, ran the production build, and rebuilt `release/win-unpacked`; `package:verify` passed CPython 3.13.14 and 3.14.4.

- `resolve2ae_core/export.py` SHA-256 is `BAD4A1327D9F92DC02A33654386AD5A68F03B10C12E84BDC60D753DC29246AD3` in source, both staged Runtime profiles, the packaged app tree, and both packaged Runtime profiles.
- `resolve/adapter.py` SHA-256 is `559290495EE64BC951871576B9EC50B7143F0DE6FA081B4912FFF17F4061A13E` in the same source/staged/package locations.
- Text scans excluding third-party `node_modules` found zero legacy-policy/helper references in staged Runtimes, the packaged app, or packaged Runtimes. Filename scans found zero deleted range modules/tests/bytecode in all three locations.

## Verification

| Check | Result |
| --- | --- |
| `python -m py_compile resolve2ae_core/export.py scripts/resolve2ae_export.py resolve/adapter.py` | pass |
| `python -m unittest resolve2ae_core.tests.test_export_core` | pass — 30 tests |
| `python -m unittest discover -s resolve -p 'test_*.py'` | pass — 19 tests after removing two obsolete range-helper tests |
| `python -m unittest discover -s scripts -p 'test_*.py'` | pass — 2 tests |
| `npm test` | pass — Node 410; Python 6, 19, 21, 30, and 2 |
| `npm run package:win` | pass — includes Runtime staging and `npm run build` |
| `npm run package:verify` | pass — CPython 3.13.14 and 3.14.4 |
| `git diff --check` | pass; line-ending conversion warnings only |
| Lint / typecheck | not configured in `package.json` |

## Task-owned changed/deleted/new paths

Modified task-owned paths:

- `.trellis/spec/backend/quality-guidelines.md` — selection/export section only; the same file also contains unrelated Diagnostic Sampler edits, so the Lead must stage this path by hunk.
- `resolve-command-center/README.md`
- `resolve-command-center/docs/resolve-python-matrix.md`
- `resolve-command-center/resolve/adapter.py`
- `resolve-command-center/resolve/test_adapter.py`
- `resolve-command-center/resolve2ae_core/export.py`
- `resolve-command-center/resolve2ae_core/tests/test_export_core.py`
- `resolve-command-center/resources/runtimes/manifest.json`
- `resolve-command-center/resources/runtimes/python-win32-x64.lock.json`
- `resolve-command-center/script-runtime/runtime.test.js`
- `resolve-command-center/scripts/resolve2ae_export.py`
- `resolve-command-center/scripts/stage-managed-python.ps1`
- `resolve-command-center/scripts/test_resolve2ae_export.py`
- `resolve-command-center/scripts/verify-package.js`

Deleted task-owned paths:

- `resolve-command-center/resolve/timeline_range.py`
- `resolve-command-center/resolve/test_timeline_range.py`

New task-owned paths:

- `resolve-command-center/resources/runtimes/python-cpython-3.14.4-win32-x64.lock.json`
- `.trellis/tasks/09-11-resolve-21-1-ae-export/task.json`
- `.trellis/tasks/09-11-resolve-21-1-ae-export/prd.md`
- `.trellis/tasks/09-11-resolve-21-1-ae-export/design.md`
- `.trellis/tasks/09-11-resolve-21-1-ae-export/implement.md`
- `.trellis/tasks/09-11-resolve-21-1-ae-export/implement.jsonl`
- `.trellis/tasks/09-11-resolve-21-1-ae-export/check.jsonl`
- `.trellis/tasks/09-11-resolve-21-1-ae-export/research/export-regression.md`
- `.trellis/tasks/09-11-resolve-21-1-ae-export/research/native-selection-plan.md`
- `.trellis/tasks/09-11-resolve-21-1-ae-export/stage-a-implementation.md`
- `.trellis/tasks/09-11-resolve-21-1-ae-export/stage-a-check.md`
- `.trellis/tasks/09-11-resolve-21-1-ae-export/manual-test.md`
- `.trellis/tasks/09-11-resolve-21-1-ae-export/stage-b-implementation.md`
- `.trellis/tasks/09-11-resolve-21-1-ae-export/stage-b-check.md`

Generated outputs `build/runtime-staging`, `release/win-unpacked`, and repository-root `build/runtime-qualification-3.14.4` are verification/package artifacts, not commit paths.

Explicitly unrelated and excluded: `AGENTS.md`, the `package.json` diagnostics entry, Diagnostic Sampler files/task, older 09-02 research, and non-selection backend-spec edits.

## Readiness

Stage B and the combined Resolve 20.3/21.1 implementation are ready for Lead review and commit preparation. No unresolved product or validation blocker remains; commit, worker release/acknowledgement, and task archive remain Lead-owned.
