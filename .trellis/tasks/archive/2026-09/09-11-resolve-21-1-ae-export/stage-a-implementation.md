# Stage A implementation report

## Change boundary — recorded before code

- **Behavior gap:** Resolve 21.1.0.14 is rejected before the Python feature because the managed registry only contains a 20.3.2 / CPython 3.13.14 profile. In the existing export core, `auto` targeting only uses Blue Markers or the playhead, so it cannot make native selected items authoritative.
- **Root boundary:** add one independently qualified Resolve 21.1 CPython profile to the existing managed runtime/staging/package pipeline, then add native selection at `resolve2ae_core.export.get_target_clips_logic`, the single shared target-acquisition path. The command wrapper, runtime transport, OTIO/JSX generation, AE launcher, public result shape, and legacy Marker resolver stay unchanged.
- **Expected task-owned files:** runtime manifest/new lock/staging/package verification and their focused tests; `resolve2ae_core/export.py` plus its existing tests; active Resolve/Python compatibility documentation and the scoped backend selection contract; this task checklist/evidence report.
- **Explicitly excluded:** no resolver prefix relaxation, PATH fallback, MCP/product transport, command or binding changes, UI rewrite, media-policy redesign, Diagnostic Sampler edits, live export/project mutation, or Stage B Marker deletion. The retained Marker path remains available only for legacy API-absent hosts/compatibility calls; native hosts bypass it for both selected and empty selection.
- **Behavior proof:** resolver/profile tests cover 20.3.2 retention, 21.1 selection, and explicit unsupported hosts; core tests cover selected-only/deterministic/gap/media cases and native empty/playhead/Marker independence; package verification confirms every staged and packaged profile identity.

## Runtime qualification evidence

- **Candidate:** official `python-3.14.4-embed-amd64.zip`, SHA-256 `cda80a9b1e75c0f1b4f9872ca1b417f0d19bce32facc811aea9180e70fad5fb9`, isolated under `build/runtime-qualification-3.14.4`.
- **Host bridge identity:** Resolve 21.1.0.14; `fusionscript.dll` 21.1 SHA-256 `94880a09044c390540f0b5dc1806ae02aeb2912f976a953f6d563a57fc56c2dc`; Resolve vendor `python314.dll` 3.14.4 SHA-256 `b68cec4ab95facf667f0c95560b3facf9f4d5fb9372de03091b684f190759e2c`.
- **Probe:** one forced, existing `RuntimeProbe`/`RuntimeLauncher` child (10-second cap, source bootstrap, disposable cache) passed: CPython 3.14.4 x64 connected to Resolve 21.1.0.14 through `ResolvePython/lib/modules/DaVinciResolveScript.py` and `fusionscript.dll`. It did not run an export or mutate a project; no incompatible candidate was invoked and no crash was retried.

## Implementation and validation

### Changed files

- `resolve-command-center/resolve2ae_core/export.py` and `resolve2ae_core/tests/test_export_core.py` — native selected-item acquisition at the one shared target boundary, plus focused regression coverage.
- `resolve-command-center/resources/runtimes/manifest.json`, `python-win32-x64.lock.json`, and new `python-cpython-3.14.4-win32-x64.lock.json` — retain 20.3.2 / CPython 3.13.14 as `legacy-pinned`; add exact 21.1.0 / CPython 3.14.4 as `current` with official artifact hashes.
- `resolve-command-center/scripts/stage-managed-python.ps1`, `scripts/verify-package.js`, and `script-runtime/runtime.test.js` — stage and verify every locked profile, including version-specific embedded DLL/ZIP/PTH identities and exact resolver selection.
- `resolve-command-center/docs/resolve-python-matrix.md` and `.trellis/spec/backend/quality-guidelines.md` — record qualification limits and the native selection contract.
- `implement.md` — Stage A evidence/checklist only. Legacy Marker implementation was deliberately retained; Stage B is not started.

### Result

- `auto` calls `Timeline.GetSelectedClips()` once when available. A non-empty response is selected-set authoritative, preserves every eligible selected item and their gaps, uses real track identity, retains existing media/linked-media filtering, and never falls back to unselected playhead/range content when filtering yields none.
- A native empty list bypasses `GetMarkers()` and uses the pre-existing playhead policy. API absence retains the legacy Marker-then-playhead path; API exceptions/malformed responses are explicit `NativeSelectionError` failures.
- The three existing product command IDs and their mixed/audio/video policies remain untouched. The package reached `scripts/resolve2ae_export.py` through the packaged 3.14.4 bootstrap and returned `exported`, `clipCount: 1`, `mode: auto`, with `Analyzing...`, `Exporting OTIO...`, and `Parsing Data...`; the direct isolated check did not invoke the desktop launcher or alter Resolve/AE projects.

### Runtime/package evidence

- Isolated candidate Probe: CPython 3.14.4 x64 from official `python-3.14.4-embed-amd64.zip` (SHA-256 `cda80a9b1e75c0f1b4f9872ca1b417f0d19bce32facc811aea9180e70fad5fb9`) connected to Resolve `21.1.0.14` through `C:\Program Files\Blackmagic Design\DaVinci Resolve\ResolvePython\lib\modules\DaVinciResolveScript.py` and `fusionscript.dll`; result `ok`, `ready`, forced-cache miss.
- Packaged Probe: `release/win-unpacked/resources/runtimes/python/cpython-3.14.4/win32-x64/python.exe` passed the same forced isolated 21.1.0.14 Probe. Resolve `fusionscript.dll` version `21.1`, SHA-256 `94880a09044c390540f0b5dc1806ae02aeb2912f976a953f6d563a57fc56c2dc`; vendor `python314.dll` version `3.14.4`, SHA-256 `b68cec4ab95facf667f0c95560b3facf9f4d5fb9372de03091b684f190759e2c`.
- Package output: `resolve-command-center/release/win-unpacked`. `package:verify` confirmed CPython 3.13.14 and 3.14.4 profiles, their staged/package file inventories, source hashes, and hostile-environment `runtime-info` identities.

### Checks run

| Command | Result |
| --- | --- |
| `python -m unittest resolve2ae_core.tests.test_export_core` | passed — 42 tests |
| `node --test script-runtime/runtime.test.js scripts/stage-managed-python.test.js` | passed — 20 tests |
| `npm run runtime:stage` | passed — staged 2 managed profiles |
| `npm test` | passed — complete existing Node/Python suite |
| `npm run build` | passed |
| `npm run package:win` | passed — final unpacked Windows package |
| `npm run package:verify` | passed — both profiles verified |
| packaged 3.14.4 Probe / packaged export entry | passed — `ready`; then controlled bootstrap export reached `exported` without desktop launch |

`vite` reported the existing >500 kB chunk advisory. `electron-builder` reported existing author/asar/duplicate-dependency advisories; neither failed a command. No task-caused baseline failure remains.

### Remaining live/user checks — required before Stage B

1. Install/test the final package in a disposable or user-approved Resolve 21.1.0.14 context; refresh Feature Status and record the packaged 3.14.4 identity.
2. Test all three existing commands with a non-empty selected video, selected audio, linked A/V pair, and disjoint clips on multiple tracks. Confirm selected-only layers, gap timing, media policy and linked-audio de-duplication in After Effects.
3. With no timeline selection and a Blue Marker present, confirm each command uses playhead targeting and ignores the Marker on the native host.
4. Confirm actual AE import in both running and cold-start AE. Do not save/reset the user's Resolve or AE project while testing.
5. Record explicit user manual-test success before dispatching Stage B Marker cleanup. Until then, do not remove the retained legacy Marker code or compatibility tests.
