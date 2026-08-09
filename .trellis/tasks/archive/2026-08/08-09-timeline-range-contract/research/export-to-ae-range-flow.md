# Research: Export-to-AE current range flow and semantics

- Query: Trace the complete current Export-to-AE command/status/provider/Resolve/range/AE flow and pin down all selection, marker, coordinate, end, FPS, timecode, and error behavior from repository code and tests.
- Scope: internal
- Date: 2026-08-09

## Findings

### End-to-end flow

1. Six Command records all target `ae.export`: one visible automatic action and five internal binding aliases (`resolve-command-center/command-engine/commands/after-effects.json:3`, `:12`, `:22`, `:32`, `:42`, `:52`). The Capability manifest selects Python entry `scripts/resolve2ae_export.py` and requires `aePath` (`resolve-command-center/capability/definitions/ae-export.json:2`, `:9`, `:10`, `:15`).
2. The Composition Root discovers/registers Script Capabilities and creates Feature Status plus the shared Command executor (`resolve-command-center/app/createClacklyCore.js:55`, `:62`, `:75`, `:82`, `:87`). Registration wires `ScriptCapabilityProvider -> ScriptExecutor -> PythonProvider -> RuntimeManager` (`resolve-command-center/capability/registerScripts.js:23-30`).
3. Command execution resolves Command and Capability, checks only enabled state and required config, then passes capability-scoped config (`resolve-command-center/command-engine/executor.js:22-37`). It does **not** require the cached Feature Status to be `ready`; `assertEnabled` only checks the persisted enable flag (`resolve-command-center/feature-status/FeatureStatusManager.js:173-177`).
4. Status refresh first reports missing required config, otherwise calls Capability availability (`resolve-command-center/feature-status/FeatureStatusManager.js:112-150`). Script availability validates the entry and asks RuntimeManager to resolve/probe Python plus Resolve (`resolve-command-center/script-runtime/providers/PythonProvider.js:115-140`; `resolve-command-center/script-runtime/runtime/manager.js:174-208`, `:228-240`). It does not run range selection, the feature script, AE-path file validation, or AE launch; this is characterized by `resolve-command-center/script-runtime/runtime-manager.test.js:195`.
5. Execute forwards only Command id, Capability id, and a defensive config snapshot (`resolve-command-center/capability/script.js:10-22`; `resolve-command-center/script-runtime/ScriptCapabilityProvider.js:19-40`). RuntimeManager re-resolves/probes, launches one isolated `script-execute`, and validates the script envelope (`resolve-command-center/script-runtime/runtime/manager.js:81-122`).
6. The Python runner lazily obtains Resolve/project/timeline through `resolve/adapter.py`; the entry itself requests `context.resolve` and `context.project` (`resolve-command-center/script-runtime/python_runner.py:39-69`; `resolve-command-center/scripts/resolve2ae_export.py:31-40`). The adapter owns connection and current-project/current-timeline acquisition only (`resolve-command-center/resolve/adapter.py:41-81`, `:148-162`). Range acquisition/resolution then calls the raw Resolve Timeline object directly inside `resolve2ae_core/export.py`; there is no current TimelineRange object or range adapter.
7. `process_and_send` selects clips, exports/parses OTIO for selected video clips, generates JSX, and returns an internal desktop-launch plan (`resolve-command-center/resolve2ae_core/export.py:542-601`, `:613-629`, `:1022-1037`). RuntimeManager strips the plan from the public result and delegates it to the desktop launcher (`resolve-command-center/script-runtime/runtime/manager.js:123-170`). The launcher validates the configured executable and JSX, writes a temporary JSX, and either sends `AfterFX.exe -r <jsx>` to a running AE or installs a one-shot startup bootstrap before cold-starting AE (`resolve-command-center/capability/afterEffectsLaunch.js:141-169`, `:207-235`).

### Command policy and current selection fields

There is no first-class `source` or `selection` record. The entry maps Command id to a triple `(requested mode, target policy, media policy)` (`resolve-command-center/scripts/resolve2ae_export.py:6-18`):

| Command | requested `mode` | `target_policy` | `media_policy` | Effective source/selection |
|---|---|---|---|---|
| `timeline.exportToAfterEffects` | `auto` | `auto` | `mixed` | first eligible Blue range, else playhead; video plus independent audio |
| `timeline.exportAudioToAfterEffects` | `audio-only` | `auto` | `audio` | first eligible Blue range, else playhead; audio only |
| `timeline.exportVideoToAfterEffects` | `video-only` | `auto` | `video` | first eligible Blue range, else playhead; video only |
| `timeline.exportCurrentToAfterEffects` | `single` | `single` | `mixed` | playhead only, ignoring markers |
| `timeline.exportBlueRangeToAfterEffects` | `video-range` | `blue-range` | `video` | required Blue duration marker; video only |
| `timeline.exportCyanRangeToAfterEffects` | `mixed-range` | `blue-range` | `mixed` | required **Blue** duration marker; mixed; Cyan is only a legacy alias name |

The mapping is tested exhaustively at the entry boundary (`resolve-command-center/scripts/test_resolve2ae_export.py:27-53`) and the complete target/media matrix is tested in the core (`resolve-command-center/resolve2ae_core/tests/test_export_core.py:853-885`). `requested mode` is validated and echoed in terminal results, but range resolution itself consumes only target/media policy (`resolve-command-center/resolve2ae_core/export.py:521-558`, `:570-575`). The actual scope label used in the AE composition name is `single` or `batch`, returned by selection (`resolve-command-center/resolve2ae_core/export.py:161`, `:188`, `:192`, `:620`).

### Marker precedence, fallback, and malformed cases

The resolver reads `timeline.GetMarkers()` only for `auto` or `blue-range` (`resolve-command-center/resolve2ae_core/export.py:166-181`). An eligible candidate has exact case-sensitive color `Blue` and `int(duration) > 1`; Cyan and every other color are ignored (`:171-178`).

| Marker/API state | `auto` behavior | explicit `blue-range` behavior |
|---|---|---|
| One or more eligible candidates | Numerically sort converted frame keys and choose the lowest; playhead is ignored | Same |
| Multiple candidates | Only one range is processed; lowest numeric frame wins, independent of marker enumeration order | Same |
| Point/one-frame marker (`duration <= 1`) | Ignore, then use another eligible marker or playhead | Ignore, then use another eligible marker or return missing-marker |
| Cyan marker | Ignore | Ignore |
| No/empty markers or all entries ignored | Fall back to playhead | `MissingMarkerError("No Blue duration marker found")` |
| `GetMarkers()` raises / container iteration raises | Swallow and fall back to playhead | Propagate the original exception |
| Entry lacks `.get`, or `duration` cannot be converted with `int` | Silently skip that entry and continue | Same |
| Eligible Blue entry has frame key that fails `int(frame_idx)` | Abort the scan; suppress in `auto`, retaining only candidates accumulated before the bad entry (or fall back if none) | Propagate the conversion error, even if a prior candidate was accumulated |

The selection of the lowest marker plus point/Cyan exclusion is directly tested (`resolve-command-center/resolve2ae_core/tests/test_export_core.py:887-910`). Missing marker and API-error asymmetry are tested (`:967-1007`). The malformed-entry behaviors above are code-defined but not directly covered.

Additional exact normalization consequences: numeric strings are accepted; floating numeric values are truncated by `int`; negative frame keys are not rejected; float/string durations are accepted only when Python `int(...)` accepts them; there is no marker start/end bound check. Equal converted frame values are stable-sort ties, so the first enumerated tied candidate wins (`resolve-command-center/resolve2ae_core/export.py:167-187`).

### Coordinates and inclusive/exclusive end

- Resolve marker keys are treated as timeline-relative. The chosen absolute selection start is `int(marker_frame) + timeline.GetStartFrame()`; `GetStartFrame() is None` falls back to `86400` (`resolve-command-center/resolve2ae_core/export.py:163-187`). Clip `GetStart()/GetEnd()` values are treated as the same absolute coordinate system.
- Marker selection is the half-open interval `[start, start + duration)`. A clip is selected exactly when its own half-open interval overlaps: `clip_start < range_end && clip_end > range_start` (`resolve-command-center/resolve2ae_core/export.py:209-216`). Therefore a clip ending at range start or starting at range end is excluded. The effective final included marker frame is `end - 1`.
- A duration of one would naturally denote `[start,start+1)`, but current eligibility rejects it (`duration > 1`), so the smallest supported Blue range is two frames (`resolve-command-center/resolve2ae_core/export.py:174-178`).
- The marker interval determines **membership only**. Selected clips are not trimmed to marker boundaries. AE composition extent is the minimum selected clip start through maximum selected clip end, and every layer uses its full `GetDuration()` (`resolve-command-center/resolve2ae_core/export.py:617-626`, `:716-718`, `:789-812`). A clip that overlaps the range by one frame is exported in full; the resulting composition may begin before and/or end after the marker range.
- Timeline start is reused as the OTIO absolute base (`resolve-command-center/resolve2ae_core/export.py:585-601`; `:320-350`), but there is no range object carrying coordinate-space or end-semantics metadata.

No current test isolates nonzero timeline-start marker selection or exact boundary-touching clips. The fake Timeline defaults to start frame zero (`resolve-command-center/resolve2ae_core/tests/test_export_core.py:153-189`), so these are source-defined semantics rather than regression-protected semantics.

### Playhead fallback and media selection

When no eligible marker wins, `single` mode converts `GetCurrentTimecode()` to a single lookup frame and uses `[frame, frame+1)` for membership (`resolve-command-center/resolve2ae_core/export.py:192-216`). In single mode:

- disabled tracks and disabled clips are excluded (`resolve-command-center/resolve2ae_core/export.py:197-207`);
- video-only/audio-only returns every overlapping clip on the highest numeric enabled track of that media class (`:253-279`);
- mixed independently chooses topmost video and topmost audio; it drops the audio only when `GetLinkedItems()` proves it is represented by the selected video, otherwise returns both (`:295-314`). This is tested at `resolve-command-center/resolve2ae_core/tests/test_export_core.py:912-948`.

In batch mode, all enabled overlapping clips of the requested media class are selected. Mixed begins with every overlapping video and keeps only audio not linked to any selected video (`resolve-command-center/resolve2ae_core/export.py:280-294`), tested at `resolve-command-center/resolve2ae_core/tests/test_export_core.py:950-965`.

### FPS, timecode, timeline start, and drop-frame behavior

Export-to-AE uses a local, permissive conversion path, not the stricter shared adapter helpers:

- FPS is `float(timeline.GetSetting("timelineFrameRate"))`; missing/falsey value or any exception silently falls back to `24.0` (`resolve-command-center/resolve2ae_core/export.py:154-157`). Decimal strings work. A rational string such as `30000/1001` fails `float` and silently becomes 24. Zero, negative, NaN, and infinity are not explicitly rejected and can fail or corrupt later duration calculations.
- Playhead timecode accepts only four colon-separated integer fields and computes `int(total_seconds * fps + frame_label)`; every parse error silently returns frame zero (`resolve-command-center/resolve2ae_core/export.py:59-63`, `:193-195`). It does not validate minutes, seconds, or frame labels, and fractional-FPS multiplication is truncated by `int`.
- Drop-frame `HH:MM:SS;FF` cannot parse because the last separator is not a colon, so it silently selects frame zero. No nominal-rate/drop-frame correction occurs.
- Playhead conversion does not add or subtract `GetStartFrame()`; it assumes the timecode-derived frame is already in the absolute clip coordinate system. Marker conversion, by contrast, explicitly adds timeline start.
- `resolve/adapter.py` contains validated decimal/rational FPS parsing and 29.97/59.94 drop-frame conversion (`resolve-command-center/resolve/adapter.py:84-145`), with tests including skipped labels and 10-minute drop-frame rules (`resolve-command-center/resolve/test_adapter.py:113-151`), but `resolve2ae_core/export.py` defines and calls its own `timecode_to_frames`; those adapter semantics do not apply to AE selection.

There are no Export-to-AE core tests for nonzero timeline start, decimal/rational FPS, malformed timecode, or drop-frame. Preserving current behavior 1:1 therefore means preserving the permissive/fallback behavior above unless the later phase explicitly authorizes a bug fix.

### Validation and error propagation

- Unsupported Command id fails before AE-path validation (`resolve-command-center/scripts/resolve2ae_export.py:16-24`). Unsupported mode/target/media triples fail before Resolve access (`resolve-command-center/resolve2ae_core/export.py:521-558`), tested at `resolve-command-center/resolve2ae_core/tests/test_export_core.py:1009-1026`.
- Command execution rejects disabled Feature and missing required `aePath` before the Capability (`resolve-command-center/command-engine/executor.js:33-37`; `resolve-command-center/config/ConfigManager.js:115-125`). Runtime status can still be stale/non-ready because execute does not consult status; RuntimeManager performs a fresh resolve/probe.
- Entry execution separately requires `aePath` to name an existing file and defaults a blank/non-string prefix to `Link` (`resolve-command-center/scripts/resolve2ae_export.py:22-30`), tested at `resolve-command-center/scripts/test_resolve2ae_export.py:55-78`.
- Explicit missing marker becomes core terminal result `{ok:false, code:"missing-marker", ...}`, with status `No Blue duration marker found` (`resolve-command-center/resolve2ae_core/export.py:568-579`; test `resolve-command-center/resolve2ae_core/tests/test_export_core.py:967-992`). The entry then converts every non-ok core result, including `missing-marker` and `no-clips`, into `RuntimeError(message)` (`resolve-command-center/scripts/resolve2ae_export.py:41-42`); the Python envelope and JS provider surface it as a failed Python script (`resolve-command-center/script-runtime/python_runner.py:101-116`; `resolve-command-center/script-runtime/providers/PythonProvider.js:99-112`). Thus callers do not currently receive the core `code` for these failures.
- Auto marker API failures are intentionally hidden by fallback; explicit marker API failures propagate. Malformed timecode and FPS are also hidden by fallback-to-zero/fallback-to-24 rather than reported.
- The core has a direct `no-timeline` terminal result (`resolve-command-center/resolve2ae_core/export.py:562-566`; direct test at `resolve-command-center/resolve2ae_core/tests/test_export_core.py:825-832`), but the real ScriptContext path asks `resolve.adapter.get_project_and_timeline()` first, which raises `ResolveAdapterError("No current timeline")` (`resolve-command-center/resolve/adapter.py:148-162`). Therefore the terminal result is not normally reachable through the shipped entry.
- No selected clips returns `no-clips` in the core (`resolve-command-center/resolve2ae_core/export.py:576-579`; test `resolve-command-center/resolve2ae_core/tests/test_export_core.py:834-845`) and then becomes an execution error at the script boundary.

### Behavior that a later extraction must preserve

The minimum preservation set is: exact Blue case match; duration `>1`; numeric `int` coercions; lowest numeric candidate; one range only; Cyan ignored; `auto` marker-before-playhead precedence; explicit missing-marker/no-fallback; marker API auto/explicit asymmetry; malformed-entry skip versus bad-frame scan-abort asymmetry; marker-relative plus timeline-start coordinates with `86400` fallback; half-open overlap; membership-only/no trimming; current permissive FPS/timecode/drop-frame behavior; enabled track/clip filtering; topmost single selection; batch all-overlap selection; linked-audio de-duplication; existing policy triples; and current terminal/error translation.

## Files Found

- `resolve-command-center/command-engine/commands/after-effects.json` — visible command and five internal aliases.
- `resolve-command-center/capability/definitions/ae-export.json` — Script Capability, Python entry, and config schema.
- `resolve-command-center/app/createClacklyCore.js` — shared Capability/status/executor/runtime composition.
- `resolve-command-center/feature-status/FeatureStatusManager.js` — config-first readiness refresh and enable gate.
- `resolve-command-center/capability/registerScripts.js` — concrete Script provider chain.
- `resolve-command-center/script-runtime/runtime/manager.js` — resolve/probe/execute pipeline and AE launch-plan handoff.
- `resolve-command-center/script-runtime/python_runner.py` — lazy Resolve ScriptContext and structured error envelope.
- `resolve-command-center/resolve/adapter.py` — Resolve connection/current timeline plus stricter but unused-for-AE frame conversion.
- `resolve-command-center/scripts/resolve2ae_export.py` — Command policy mapping and entry validation.
- `resolve-command-center/resolve2ae_core/export.py` — marker/playhead resolution, clip membership, JSX creation, and AE plan.
- `resolve-command-center/resolve2ae_core/tests/test_export_core.py` — current selection/range regression coverage and notable gaps.
- `resolve-command-center/scripts/test_resolve2ae_export.py` — command mapping and entry error behavior.

## External References

None. Per query, conclusions use repository code and tests only; no external Resolve/AE documentation was used to reinterpret current behavior.

## Related Specs

- `.trellis/spec/backend/quality-guidelines.md` — current project contracts for Capability dispatch, Script Capability runtime, readiness, Resolve ownership, and execute-time validation.
- `.trellis/spec/guides/cross-layer-thinking-guide.md` — cross-layer data-flow and error-path review guidance.

## Caveats / Not Found

- No production TimelineRange/Range object, source enum, coordinate-space field, end-semantics field, or reusable range resolver was found on this flow; range is implicit local variables in `get_target_clips_logic`.
- No direct tests cover malformed marker entries/frame keys, exact boundary overlap, nonzero timeline-start marker selection, FPS fallback/rational FPS, malformed playhead timecode, or drop-frame AE selection. The documented behavior for those cases is derived directly from executable control flow.
- No tests were run during this research pass. The most range-relevant core suite creates a repository-local `_tmp_export_core` work directory (`resolve-command-center/resolve2ae_core/tests/test_export_core.py:14`, `:342-353`), which conflicts with this research agent's write-only-in-task-research constraint. Existing tests were inspected only.
