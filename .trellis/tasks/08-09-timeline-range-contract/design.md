# Phase R1 — Timeline Range Evidence and Contract Design

## 1. Repository State

- Branch: `main`
- HEAD: `0c7234f150fc7c90314192dad3d41c81a2b44ee6`
- Initial worktree: clean.
- Active task before this phase: none.
- Current task: `.trellis/tasks/08-09-timeline-range-contract`, status `planning`.
- Current worktree: only this new Trellis task directory is untracked; production and test files are unchanged.
- Test baseline: `npm test` passed. Node: 241/241. Python groups: 3 + 15 + 15 + 26 + 2 = 61/61. Total observed: 302 passed.
- Trellis reported update `0.6.10 -> 0.6.14`; it was not applied because it is out of scope.

## 2. Current Export-to-AE Range Flow

```text
Command id
  -> Command executor
  -> ae.export Script Capability
  -> ScriptCapabilityProvider
  -> ScriptExecutor
  -> PythonProvider / RuntimeManager
  -> isolated Python ScriptContext
  -> scripts/resolve2ae_export.py policy mapping
  -> resolve2ae_core.process_and_send()
  -> get_target_clips_logic()
  -> raw Resolve Timeline GetStartFrame/GetMarkers/GetCurrentTimecode
  -> implicit marker/playhead start_frame + end_frame
  -> clip overlap/media selection
  -> OTIO + JSX
  -> host-owned After Effects launch
```

Key evidence:

- Commands and one shared Capability: `resolve-command-center/command-engine/commands/after-effects.json:3-59`, `resolve-command-center/capability/definitions/ae-export.json:2-24`.
- Generic execution/provider chain: `resolve-command-center/command-engine/executor.js:22-37`, `resolve-command-center/capability/registerScripts.js:23-41`, `resolve-command-center/script-runtime/ScriptCapabilityProvider.js:19-40`, `resolve-command-center/script-runtime/runtime/manager.js:81-170`.
- Python context and Resolve acquisition: `resolve-command-center/script-runtime/python_runner.py:39-69`, `resolve-command-center/resolve/adapter.py:41-81,148-162`.
- Command-policy mapping: `resolve-command-center/scripts/resolve2ae_export.py:6-40`.
- Range and export: `resolve-command-center/resolve2ae_core/export.py:145-314,542-629`.

Feature Status only validates configuration and Python/Resolve runtime readiness. It does not read markers or resolve a range (`FeatureStatusManager.js:112-150`; `PythonProvider.js:115-140`).

The six current policy triples are:

| Command | mode | target policy | media policy |
|---|---|---|---|
| visible Export to AE | `auto` | `auto` | `mixed` |
| internal audio action | `audio-only` | `auto` | `audio` |
| internal video action | `video-only` | `auto` | `video` |
| legacy current-clip action | `single` | `single` | `mixed` |
| legacy Blue-range action | `video-range` | `blue-range` | `video` |
| legacy Cyan-named action | `mixed-range` | `blue-range` | `mixed` |

The Cyan-named action now requires a Blue marker; Cyan is only a compatibility name.

## 3. Current Range Semantics

### Source and selection

- There is no first-class range/source object. `start_frame`, `end_frame`, and `mode` are local variables in `get_target_clips_logic()`.
- A candidate is accepted only when `info.get("color") == "Blue"` and `int(info.get("duration", 0)) > 1` (`export.py:171-178`). Name, note, and customData are ignored.
- Candidate marker keys are converted with `int`, sorted numerically, and the lowest numeric frame wins (`export.py:182-185`). Only one range is used.
- `auto` precedence is: eligible Blue duration marker, then playhead fallback.
- `single` ignores markers entirely.
- `blue-range` requires an eligible Blue duration marker and never falls back to playhead.

### Coordinates and end semantics

- Marker keys are treated as timeline-relative Resolve marker frames.
- The selected start is converted once into the absolute Resolve timeline-item coordinate system: `int(marker_frame) + timeline.GetStartFrame()` (`export.py:163-187`). This is the same coordinate space used by `TimelineItem.GetStart()/GetEnd()`.
- `GetStartFrame() is None` uses the existing hard-coded `86400` fallback. A throwing `GetStartFrame()` propagates.
- The effective interval is half-open: `[start_frame, end_frame)`, where `end_frame = start_frame + duration`.
- Clip membership is also half-open overlap: `clip_start < range_end and clip_end > range_start` (`export.py:209-216`). Boundary-touch-only clips are excluded.
- The marker range controls membership only. Clips are exported whole and the AE composition spans selected clip bounds, so output may extend beyond marker boundaries (`export.py:617-626,716-718`).

### Playhead, FPS, and drop-frame

- Playhead fallback forms a one-frame lookup `[frame, frame + 1)` but uses the point predicate `clip_start <= frame < clip_end`.
- FPS is `float(timeline.GetSetting("timelineFrameRate"))`, with silent `24.0` fallback on missing value or exception.
- Export's local timecode converter accepts only colon-separated `HH:MM:SS:FF`; any parse failure returns frame 0. It truncates fractional-FPS arithmetic with `int`.
- It does not support semicolon drop-frame timecode; such a string silently resolves to frame 0.
- The robust FPS/drop-frame helpers in `resolve/adapter.py` and `resolve/marker-frame.js` belong to Add Marker and are not used by Export-to-AE. R2 must not substitute them during extraction.

### Validation and errors

- Timeline absence is owned by the Resolve/script boundary. Direct core calls can return `code="no-timeline"`, while the shipped ScriptContext path normally raises `ResolveAdapterError("No current timeline")` before the core sees a missing timeline.
- Per-entry failure reading `info.get` or converting duration skips that entry.
- A qualifying Blue marker with an invalid frame key fails outside the per-entry catch. `auto` suppresses the scan failure and may retain candidates accumulated before it; `blue-range` propagates the original error.
- Marker API/container failure is suppressed only by `auto`; explicit `blue-range` propagates it.
- No valid marker in explicit mode raises `MissingMarkerError("No Blue duration marker found")`; the core translates this to exact `code="missing-marker"`, then the feature wrapper translates the non-ok result to `RuntimeError(message)`.
- No selected clips remains the existing `no-clips` core result and wrapper execution error.
- There is no timeline-bound clamping, negative-frame rejection, or integer-overflow policy.

### Two independent Marker precedence contracts

1. Add Marker provider precedence: `resolveApi -> resolveScriptApi -> workflowPluginApi -> keyboardShortcut`; availability may fall through, but an execution error never falls through (`capability/marker.js:3-52`; `marker.test.js:23-105`; `createClacklyCore.test.js:119-167`).
2. Export range precedence: lowest numeric qualifying Blue duration marker, independent of enumeration order; point and Cyan markers do not win (`test_export_core.py:887-910`).

R2 touches only the second contract and must leave the first entirely unchanged.

## 4. Existing Architecture Boundary

### Already shared

- Command-to-Capability routing and script registration/provider execution are generic and shared.
- `ScriptContext` already provides lazy, cached `resolve`, `project`, and `timeline` objects.
- `resolve/adapter.py` owns the managed Python Resolve connection and current project/timeline acquisition.
- Add Marker has shared provider selection and separate robust frame/timecode conversion, but those semantics are not Export range semantics.

### Still coupled to Export to AE

- `GetStartFrame`, `GetMarkers`, marker parsing, marker precedence, range construction, playhead fallback, clip intersection, media policy, and linked-audio de-duplication are all inside `get_target_clips_logic()`.
- Only marker-to-range resolution is a candidate for extraction. Clip/media selection, OTIO, JSX, AE payload/launch, policy triples, and terminal results remain Export-to-AE business logic.

### Resolve API concerns that do not belong in the domain value

- Acquiring the current project/timeline.
- Invoking `GetStartFrame`, `GetMarkers`, `GetCurrentTimecode`, and `GetSetting`.
- Preserving raw API failure versus absence.
- Normalizing the API mapping boundary without changing current coercion/error behavior.

Repository-wide search found no `TimelineRange`, Marker Resolver/Provider for reads, Mark In/Out integration, selected-clip range integration, or non-AE marker-range consumer. The only other `GetMarkers()` production calls diagnose duplicate Add Marker failures.

## 5. Proposed Minimal TimelineRange Contract

Recommended in-process Python value:

```python
@dataclass(frozen=True, slots=True)
class TimelineRange:
    start_frame: int
    end_frame_exclusive: int
    source: Literal["resolve-duration-marker"]
```

This is a Python-internal value, not JSON, Capability metadata, Feature status, or ScriptContext state.

- `start_frame`: absolute Resolve timeline-item frame coordinate, after adding the timeline start offset exactly once.
- `end_frame_exclusive`: first frame outside the range. The explicit name prevents inclusive/exclusive ambiguity.
- `source`: provenance only. V1 allows exactly `resolve-duration-marker`; Blue/color qualification remains resolver logic, not consumer logic. Consumers must not branch on this token to determine export behavior.

Invariant ownership:

- `TimelineRange` construction owns exact integer frames (not booleans), finite-by-integer representation, `end_frame_exclusive > start_frame`, and the supported source token.
- The resolver owns source qualification and precedence: exact Blue, `int(duration) > 1`, numeric marker key, lowest frame.
- The Resolve adapter boundary owns timeline existence and raw API calls/errors.
- Export owns optional-range policy: `auto` fallback versus explicit missing-marker, playhead/FPS/timecode behavior, clip overlap, and all AE/media behavior.

The resolver returns `TimelineRange | None`. `None` means no qualifying currently supported range source; it is not itself an error. This keeps AE-specific fallback/error policy out of the public domain ability.

No duration/FPS/color/name/customData/timeline id is added. They are either derivable, source-specific, or unnecessary to current consumers.

## 6. Proposed Extraction Boundary

### Phase R2 changes

1. Add one small internal module, proposed `resolve/timeline_range.py`, containing `TimelineRange` and one pure resolver from acquired timeline-start/marker facts.
2. Add only narrow raw fact accessors to the existing Python Resolve adapter for timeline start frame and marker mapping. Do not use `_call_optional`, because it would hide errors that explicit range currently propagates.
3. Replace only the Blue-marker parsing/range-construction block in `get_target_clips_logic()` with those calls.
4. Keep `GetStartFrame` evaluation outside the marker-scan catch and keep the current `auto` versus `blue-range` catch placement exactly.
5. Keep `MissingMarkerError`, its message, terminal result, wrapper translation, playhead fallback, FPS/timecode conversion, and clip/media/export code behavior unchanged.
6. Add focused resolver tests and compatibility tests for the currently unprotected boundary cases before moving code.

### Explicitly unchanged

- Command manifests and policy triples.
- `ae.export` Capability manifest and Feature Status.
- ScriptCapabilityProvider, ScriptExecutor, PythonProvider, RuntimeManager.
- Python `ScriptContext` public fields.
- Composition Root and both hosts.
- JavaScript Workflow Resolve adapter and Add Marker Capability/provider precedence.

```text
Before

resolve2ae_core/export.py
  -> raw Resolve timeline facts
  -> marker parsing/precedence/range locals
  -> clip/media selection
  -> AE export

After

resolve/adapter.py
  -> raw start-frame + marker facts
        |
resolve/timeline_range.py
  -> TimelineRange | None
        |
resolve2ae_core/export.py
  -> unchanged fallback + clip/media selection + AE export
```

This is not a new Capability: Timeline Range is per-execution internal domain state, not a searchable action or readiness-managed Feature.

## 7. Regression Matrix

| Situation | Current result that R2 must preserve |
|---|---|
| valid Blue marker, duration > 1 | absolute half-open batch range at `timeline_start + marker_frame`; select all enabled overlapping requested-media clips |
| multiple valid Blue markers | lowest numeric frame wins; one range only; dictionary/API enumeration order irrelevant |
| Blue point/duration <= 1 | ignored; auto falls back if no other candidate, explicit reports missing marker |
| Cyan/other color | ignored; Cyan-named legacy action still uses Blue |
| no/empty/all-invalid markers | auto uses playhead single; explicit returns exact missing-marker core result/message |
| malformed marker info/duration | skip that entry |
| qualifying marker with malformed frame key | auto suppresses scan failure (retaining earlier accumulated candidates); explicit propagates original error |
| `GetMarkers` missing/throws/non-mapping | auto falls back; explicit propagates original error |
| `GetStartFrame() is None` | use `86400` |
| `GetStartFrame()` throws | propagate for all policies |
| `single` target policy | do not read markers; use playhead |
| range boundary touch only | excluded by half-open overlap |
| range overlaps one frame of a clip | include and export the whole clip; do not trim |
| playhead FPS missing/throws | use 24.0 |
| malformed/drop-frame playhead timecode | silently resolve to frame 0 under current local converter |
| no matching clips | existing `no-clips` result/error path |
| missing timeline | preserve current ScriptContext adapter error and direct-core terminal behavior |
| Add Marker multiple backends | keep existing provider precedence and no execution fallback; unrelated to range extraction |

Directly protected today: full target/media matrix, numeric marker precedence and order independence, point/Cyan exclusion, explicit missing-marker result, explicit/auto marker API error asymmetry, policy triples, Add Marker backend precedence/no-fallback.

Source-defined but not directly protected today: malformed payloads/frame keys, nonzero timeline-start marker offset, exact boundary-touch overlap, `86400` fallback, rational/invalid FPS, malformed/drop-frame playhead timecode.

## 8. Risks / Open Questions

- The main risk is accidental cleanup during extraction: using the robust Add Marker converter, normalizing malformed markers, moving catch boundaries, or clamping ranges would change current behavior.
- A frozen dataclass is the recommended minimal representation, but a small validated factory returning the same three fields would not change the architecture. This is an internal implementation choice, not a blocking design decision.
- Current edge-case behavior is under-tested; R2 must characterize it before moving the block.

No blocking architecture decision.

## 9. Recommendation for Phase R2

Create a separate reviewed R2 implementation task limited to:

1. Characterization tests for unprotected current behavior.
2. One `TimelineRange` value and one pure current-source resolver in the Python Resolve layer.
3. Two narrow Resolve fact reads using the existing adapter boundary.
4. Replacement of the marker-to-range block in `get_target_clips_logic()`.
5. Full existing test suite plus focused parity tests.

Do not add future sources, a public Command/Capability, JS/Python protocol fields, UI/settings, storage/registry/manager/event infrastructure, or any behavioral correction.

Phase R1 architecture review was approved on 2026-08-09. Phase R2 is authorized under this same task with the contract and compatibility matrix above; implementation must stop after the first resolver and Export-to-AE migration.

## 10. Final Implemented Architecture and Closure

The approved proposal is now implemented as:

```text
Resolve Timeline API
  -> resolve.adapter raw fact readers
  -> resolve.timeline_range Blue duration-marker resolver
  -> TimelineRange | None
  -> resolve2ae_core.export consumer policy
```

- `TimelineRange` is the internal public domain value. Its absolute start, exclusive end, single `resolve-duration-marker` source, and invariants match Section 5.
- `None` is the normal no-supported-range result. Auto fallback and explicit missing-marker policy remain in Export.
- `TimelineRangeScanError` is not part of the public Range contract. It is referenced only by the resolver implementation, Export's legacy compatibility catch, and focused tests so malformed-frame partial-scan behavior remains unchanged.
- No reverse dependency, second source, second consumer, Command, Capability, UI, persistence, registry, or provider framework was added.
- Phase R3 final automated validation passed 241 Node plus 74 Python tests, 315 total. Real command-path smoke covered marker-backed auto, playhead fallback, explicit range success, explicit missing-marker failure, and an AE cold launch/import.

The Timeline Range architecture phase is sealed. Reopen this boundary only when a second real range source or consumer exists.
