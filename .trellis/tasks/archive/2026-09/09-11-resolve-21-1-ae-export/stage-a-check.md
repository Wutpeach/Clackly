# Stage A check report

## Findings (fixed)

### Native selection track identity

- **File:** `resolve-command-center/resolve2ae_core/export.py`
- **Issue:** Native normalization called `GetTrackTypeAndIndex()` but used only its index; the record type came from `GetType()`. That did not validate the full real track identity required by the Stage A contract and could accept contradictory proxy metadata.
- **Fix:** Use the track type and index from `GetTrackTypeAndIndex()`, keep `GetType()` as the supported-item filter, and raise the existing explicit `NativeSelectionError` when the two identities conflict. Unsupported/no-media items still filter to `no-clips` without playhead fallback.
- **Regression check:** Extended the existing native-selection error test with contradictory item/track metadata. The focused core suite remains 42 tests.

### Compatibility-matrix status

- **File:** `resolve-command-center/docs/resolve-python-matrix.md`
- **Issue:** The Resolve 21.1 row still said package verification was pending although the staged and packaged identities had passed.
- **Fix:** Record package identity verification as passed while leaving the user-owned non-empty selection and actual AE import explicitly pending.

## Findings (not fixed)

No remaining automated Stage A correctness or spec findings.

The following are validation gates, not code defects, and remain intentionally open:

- The live timeline currently returns an empty native selection. Non-empty UI selection, selection persistence when invoking Clackly, disjoint/multitrack behavior, linked A/V behavior, and all three product commands still require the user-owned manual test.
- Actual running and cold-start After Effects import/layer/timing validation remains pending. This review did not launch AE or modify/save/reset a Resolve or AE project.
- Stage B Marker deletion remains forbidden until explicit user manual-test success. The retained Marker compatibility paths and the unchecked manual/user-test items in `implement.md` were not changed.

## Contract and flow review

- The only production target-acquisition caller remains `process_and_send() -> get_target_clips_logic()`; no duplicate exporter or selection framework was added.
- Product command ids, wrapper triples, and default bindings remain:
  - `timeline.exportToAfterEffects -> (auto, auto, mixed)`
  - `timeline.exportAudioToAfterEffects -> (audio-only, auto, audio)`
  - `timeline.exportVideoToAfterEffects -> (video-only, auto, video)`
  - left click / Ctrl+left / Ctrl+Shift+left retain mixed / audio / video actions.
- Native `auto` calls `GetSelectedClips()` once. A non-empty list is authoritative; media and enabled-item filtering preserves gaps and cannot fall back to unrelated timeline content. Empty native selection bypasses Markers and uses the existing playhead path. API absence retains the Stage A legacy Marker/playhead path; callable, response, and item/track failures remain explicit.
- Existing linked-media de-duplication, full-clip extents, OTIO/JSX generation, status/result protocol, and desktop launcher ownership are unchanged.

## Runtime and package evidence reviewed

- Source Manifest retains exact Resolve `20.3.2` / CPython `3.13.14` as `legacy-pinned` and selects CPython `3.14.4` only for Resolve prefix `21.1.0` as `current`. The resolver test confirms `21.0.4` remains explicitly unsupported.
- The forced qualification cache records CPython `3.14.4` x64, profile `python-cpython-3.14.4-resolve-21.1-win32-x64`, Resolve `21.1.0.14`, `probeStatus: passed`, `effectiveStatus: ready`, and `cache.status: forced`.
- Read-only local identity checks matched the implementation report:
  - Resolve `fusionscript.dll` version `21.1`, SHA-256 `94880a09044c390540f0b5dc1806ae02aeb2912f976a953f6d563a57fc56c2dc`.
  - Resolve vendor `python314.dll` version `3.14.4`, SHA-256 `b68cec4ab95facf667f0c95560b3facf9f4d5fb9372de03091b684f190759e2c`.
  - Locked official ZIP SHA-256 `cda80a9b1e75c0f1b4f9872ca1b417f0d19bce32facc811aea9180e70fad5fb9`; the cached Sigstore bundle's signed SHA2-256 digest decodes to the same value.
  - Cached ZIP, Sigstore, SPDX, and license hashes all match the new lock. A fresh external Sigstore fetch was attempted but timed out; qualification is based on the hash-verified official artifacts plus the successful isolated Probe, not connectivity alone.
- A controlled live read-only Resolve 21.1.0.14 check confirmed `Timeline.GetSelectedClips` is present/callable and returns a Python `list` (currently empty). Existing video/audio samples returned `GetType() == "video"/"audio"`, `GetTrackTypeAndIndex() == [type, 1]`, enabled state, media-pool items, and string unique ids. No project state was changed.
- `package:win` restaged both profiles and rebuilt `resolve-command-center/release/win-unpacked`. `package:verify` passed both hostile-environment runtime-info checks and current-source/staging/package identity.
- The reviewed `export.py` SHA-256 is `808e48cb3050d20aca3f72bcd5e3920566fea1f65a9b4a3a031d6cb79a021899` in source, both staged profiles, both packaged profiles, and the packaged app tree. The updated compatibility-matrix hash also matches its packaged copy.

## Verification

| Check | Result |
| --- | --- |
| `python -m unittest resolve2ae_core.tests.test_export_core` | pass — 42 tests |
| `node --test script-runtime/runtime.test.js scripts/stage-managed-python.test.js` | pass — 20 tests |
| `python -m py_compile resolve2ae_core/export.py scripts/resolve2ae_export.py` | pass |
| `npm test` | pass — Node 410 tests plus Python suites 6, 26, 21, 42, and 2 |
| `npm run build` | pass; existing >500 kB chunk advisory only |
| `npm run package:win` | pass — staged 2 profiles and rebuilt final unpacked package; existing builder advisories only |
| `npm run package:verify` | pass — CPython 3.13.14 and 3.14.4 verified |
| `git diff --check` | pass; line-ending conversion warnings only |
| Lint / typecheck scripts | not configured in `package.json` |

The implement worker's pre-review packaged Probe and controlled packaged export-entry both passed. This review did not repeat a live native Probe or AE launch; the track-identity fix is covered by the focused suite, and the rebuilt package is byte-identical to current staged source.

## Changed files

Reviewer changes:

- `resolve-command-center/resolve2ae_core/export.py`
- `resolve-command-center/resolve2ae_core/tests/test_export_core.py`
- `resolve-command-center/docs/resolve-python-matrix.md`
- `.trellis/tasks/09-11-resolve-21-1-ae-export/stage-a-check.md`

Reviewed pre-existing Stage A changes:

- `.trellis/spec/backend/quality-guidelines.md` (native selection contract only; unrelated diagnostic-sampler edits preserved)
- `resolve-command-center/resources/runtimes/manifest.json`
- `resolve-command-center/resources/runtimes/python-win32-x64.lock.json`
- `resolve-command-center/resources/runtimes/python-cpython-3.14.4-win32-x64.lock.json`
- `resolve-command-center/script-runtime/runtime.test.js`
- `resolve-command-center/scripts/stage-managed-python.ps1`
- `resolve-command-center/scripts/verify-package.js`
- task planning and Stage A evidence artifacts

Pre-existing `AGENTS.md`, Diagnostic Sampler files/package script, older-task research, and unrelated backend-spec edits were preserved.

## Readiness

Stage A is ready for the explicit user manual test using `resolve-command-center/release/win-unpacked`. It is not ready for Stage B cleanup or overall task completion until the user confirms the actual non-empty selection/playhead and After Effects import matrix.
