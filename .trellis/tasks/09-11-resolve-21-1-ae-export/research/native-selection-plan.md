# Research: Native Resolve timeline selection migration plan

- Query: Verify `Timeline.GetSelectedClips()` on Resolve 21.1, understand empty/multitrack/disjoint behavior that can be supported from the API contract, and propose the smallest backward-compatible migration from Blue Marker range selection.
- Scope: mixed (Resolve 21.1 API/MCP, repository contracts/tests, prior range research)
- Date: 2026-09-11 (Asia/Shanghai)

## API evidence

### Version and declaration

- The Resolve 21.1 changelog returned by `mcp__davinci__get_whats_new({since:"21.0.0"})` lists under **21.0.4 (2026-08-05)**: “Scripting API to get timeline clip selection.” This is the first local vendor evidence for the method; availability on 21.0.0–21.0.3 is not established.
- `mcp__davinci__search_scripting_api` against the current `DaVinciResolveScript.pyi` returns:

  ```text
  class Timeline
      def GetSelectedClips(self) -> list[TimelineItem]
          Returns the currently selected timeline items
  ```

  The same search returns `MediaPool.GetSelectedClips() -> list[MediaPoolItem]`; these are distinct APIs. `get_scripting_api(types=["Timeline","TimelineItem"])` also exposes `TimelineItem.GetType()`, `GetStart()`, `GetEnd()`, `GetDuration()`, `GetClipEnabled()`, `GetLinkedItems()`, `GetTrackTypeAndIndex()`, `GetMediaPoolItem()`, and `GetUniqueId()`.
- Searching the 21.1 stub for a timeline `SetSelected...` method found none. Only Media Pool has `SetSelectedClip`. Selection is therefore UI-owned for this task; research cannot manufacture a non-empty native selection without interacting with the dirty open Resolve project.

### Live read-only query

The current Resolve MCP call used only getters (`GetCurrentTimeline`, `GetSelectedClips`, item metadata) and returned:

```json
{
  "resolveVersion": "21.1.0.14",
  "selectedType": "list",
  "selectedCount": 0,
  "selectedItems": []
}
```

The current timeline also has no markers, three enabled video tracks (13, 6, 0 items), and three enabled audio tracks (12, 3, 0 items). This verifies method availability and empty-list shape only; it does not prove non-empty ordering, linked-item inclusion, or disjoint selection behavior.

## Current export contract to preserve

- Product Commands and triples are fixed at `resolve-command-center/scripts/resolve2ae_export.py:6-10` and the backend spec `.trellis/spec/backend/quality-guidelines.md:568-575`: mixed (`auto`,`auto`,`mixed`), audio-only (`audio-only`,`auto`,`audio`), and video-only (`video-only`,`auto`,`video`). Do not add a new visible Command as part of the minimum migration.
- Current marker extraction is already a shared pure value/resolver, not an inline TODO: `resolve-command-center/resolve/timeline_range.py:1-74` defines `TimelineRange` with absolute frames and an exclusive end, Blue exact-color/duration qualification, numeric lowest-frame choice, `86400` start fallback, and `TimelineRangeScanError` partial-scan behavior. `resolve2ae_core/export.py:165-186` owns the auto-vs-explicit fallback boundary.
- Existing clip filtering/semantics in `resolve2ae_core/export.py:193-312` are: enabled track and clip only; single/playhead picks the topmost requested class; batch/range includes all overlaps; mixed removes linked audio represented by a selected video; target ranges are membership-only and never trim clips. OTIO runs when any target record has video (`:590-597`), and JSX composition span is the min selected start to max selected end (`:610-612`).
- The active spec requires preservation of half-open overlap, no trimming, linked-audio de-duplication, result/status/error contracts, and the exact three Command triples (`.trellis/spec/backend/quality-guidelines.md:578-627`). Native selection must become an input to this existing core, not a second AE exporter.

## Recommended minimum migration

### Selection-first, compatibility fallback

Keep `target_policy="auto"` as the product path and add one internal selection-first branch before the existing Blue-marker scan:

1. Detect `GetSelectedClips` safely. If the method is absent (older Resolve) or a compatibility check deliberately marks the host as pre-21.0.4, use the existing marker → playhead path unchanged.
2. If the method returns a non-empty list, normalize selected timeline items into the existing target-record shape (`item`, `track_index`, `start_frame`, `track_type`) and use that list as the selection source. Do not collapse it into one range: disjoint clips remain separate records.
3. If the method returns an empty list, preserve current `auto` behavior by falling back to Blue duration marker, then playhead. This avoids silently changing the current no-marker/no-selection workflow to an unexpected error. Make “empty native selection means `no-clips`” an explicit product decision if that safety preference is desired.
4. If the method raises, preserve the current `auto` resilience boundary (record a diagnostic and fall back); an explicit future native-only mode could propagate the error, but that is outside the smallest scope.
5. Leave the existing `blue-range` Core compatibility triples and marker resolver intact for older Resolve and direct regression tests. The native branch is a replacement for the workaround when there is a real UI selection, not a deletion of the compatibility path.

This keeps Command Engine, Capability metadata, ScriptContext, RuntimeManager, AE launcher, and JSON result contracts unchanged. It also reuses the existing marker/range code rather than adding a second range abstraction.

### Normalization rules (proposed)

These are the smallest rules needed to make `GetSelectedClips()` safe for the current exporter; each item must be confirmed by implementation tests:

- **Supported item types:** accept `GetType() == "video"` or `"audio"`; skip transitions/generators/titles that have no media-pool file. If every selected item is unsupported, return the existing controlled `no-clips` result rather than creating an empty AE composition. This closes a current marker-path hazard where `GetMediaPoolItem()` can be `None` and the JSX loop simply skips the item (`export.py:714-716`).
- **Track/clip enablement:** retain current `GetIsTrackEnabled(track_type,index)` and `GetClipEnabled()` filtering. A disabled selected item is not exported; do not re-enable or mutate it.
- **Track identity/order:** prefer `GetTrackTypeAndIndex()` for `track_type`/index. Sort records deterministically by `(track_type, track_index, GetStart(), GetEnd(), GetName(), GetUniqueId())`, with a stable fallback key when an optional getter is unavailable. API enumeration order must not define AE layer order.
- **Duplicate records:** de-duplicate the same TimelineItem/UniqueId. If a host proxy does not expose a stable unique id, use the existing `build_item_key()` style `(track_type, track_index, start, end, name)` only as a fallback; do not deduplicate distinct clips that happen to share names and frames without track identity.
- **Disjoint clips:** retain every normalized selected item. The existing composition remains a span from minimum start to maximum end with gaps; it does not trim clips to a synthetic range. This is the least surprising mapping of explicit UI selection and preserves current full-clip export behavior.
- **Media policy:** for `video`, keep selected video records only; for `audio`, keep selected audio records only; for `mixed`, keep both selected classes and apply the existing linked-audio de-duplication when the linked audio is also in the normalized list. Do not infer an unselected linked audio item unless the user explicitly chooses that behavior.
- **Audio/video selection intent:** if a user selects only video while invoking mixed export, export the selected video (and only selected linked audio if it is present in the returned selection). If a user expects linked audio to follow automatically, that is a product decision requiring a separate acceptance test; it must not be guessed from `GetLinkedItems()`.
- **Empty after filtering:** if the native list was non-empty but every item was disabled/unsupported or filtered out by media policy, return `no-clips` rather than falling back to an unrelated playhead. This distinguishes “the user selected items, but none are exportable” from “there is no native selection.”

### Why this is not a contiguous range

`GetSelectedClips()` returns items, not an in/out interval. Converting the minimum selected start and maximum selected end into one range would reintroduce the marker workaround's main weakness: unselected clips inside a gap would be exported. Native selection must therefore carry individual records through the existing OTIO/JSX loop. The current JSX computes composition extent from target records and adds one layer per record, so disjoint selection needs no new AE protocol.

## Behavior matrix and decisions

| Native/API state | Recommended behavior | Evidence / decision needed |
| --- | --- | --- |
| `GetSelectedClips` missing (Resolve <21.0.4) | Existing marker range then playhead (`auto`); direct `blue-range` remains unchanged. | Changelog establishes introduction at 21.0.4; older exact versions remain unverified. |
| Method raises / returns malformed non-list | `auto`: log bounded diagnostic and use existing marker/playhead fallback; native-only future mode may error. | Preserve current `auto` resilience; add focused fake-timeline tests. |
| Method returns empty list | Recommended: existing marker/playhead fallback to preserve semantics. | User must decide whether intentional “nothing selected” should instead be `no-clips`. |
| One selected enabled video | Mixed/video exports that video; audio-only has no selected audio and returns `no-clips`. | Product decision whether linked audio should be implicitly included. |
| One selected enabled audio | Mixed/audio exports that audio; video-only returns `no-clips`. | Existing policy is class-specific; no new behavior needed. |
| Several selected items on multiple tracks | Keep all supported selected items, sort deterministically by track/type/position; no topmost collapse. | Tests need fake items with identical positions on tracks 1/2. |
| Disjoint selected items | Keep exactly the selected records; AE comp spans min→max with gaps and no trimming. | Manual AE check should confirm gaps/clip timing are expected. |
| Linked video+audio both selected | Mixed removes the linked audio duplicate as current batch behavior; class-specific commands filter first. | Verify `GetLinkedItems()` direction and proxy identity in a real selected pair. |
| Disabled track/clip in returned list | Skip it; do not mutate Resolve. | Existing marker path already filters these. |
| Generator/title/transition selected | Skip unsupported item; all-unsupported selection returns `no-clips`. | Confirm whether Resolve returns these from `GetSelectedClips()` in UI; API type allows generic TimelineItem. |
| Non-empty selection with no media-pool file | Skip and return `no-clips` if nothing remains. | Existing JSX loop silently skips `GetMediaPoolItem() == None`; native path should avoid counting false success. |

## Compatibility and packaging plan

Native selection is not reachable until the 21.1 runtime gate is fixed. The package currently qualifies CPython 3.13.14 only for Resolve 20.3.2 (`resources/runtimes/manifest.json:5-20`, `docs/resolve-python-matrix.md:3-23`). Resolve 21.1 documentation returned by MCP says the application includes a custom Python 3.14 distribution; that is a warning not to assume the old 3.13 bridge is ABI-compatible.

Minimum runtime options, in order of safety:

1. Qualify and package a Resolve 21.1-compatible runtime (likely the host's documented 3.14 family or another tested compatible interpreter) in a new profile while retaining the 20.3.2 profile if both releases remain supported. Keep exact executable/module/library identity in the lock/Probe fingerprint and add package tests.
2. If product support is intentionally narrowed to 21.1+, replace the profile prefix and runtime qualification artifacts, with a migration note; do not loosen prefix matching or silently use PATH/system Python.
3. Only after a successful isolated 21.1 Probe should the native-selection code be enabled. If probe fails, stay at the runtime/status diagnostic stage; do not blame selection or run AE export.

The ADR rejects version guessing, PATH fallback, retries, and mixed application/runtime artifacts (`resolve-command-center/docs/ADR-managed-python-runtime.md:27-41`). Existing packaged/native-bridge reports already document the old 3.11/3.12 ABI crash; do not rerun those unsafe probes merely because 21.1 is present (`.trellis/tasks/09-02-fix-packaged-ae-export-status/research/native-bridge-crash-isolation.md:9-35,51-86`).

## Files and implementation ownership (for a later implement task)

Research found the smallest likely product diff, but this worker made no product edits:

- `resolve-command-center/resolve2ae_core/export.py:151-312` — add native selected-item acquisition/normalization ahead of marker fallback and preserve media/linked/disabled contracts. Keep OTIO/JSX/result code unchanged unless tests expose a selection-specific issue.
- `resolve-command-center/resolve2ae_core/tests/test_export_core.py` — fake `Timeline.GetSelectedClips()` cases for absent/raising/empty/non-empty, disabled and unsupported items, multi-track/disjoint order, media policies, and linked de-duplication.
- `resolve-command-center/resolve/timeline_range.py` and `resolve/test_timeline_range.py` — no change expected unless selection source vocabulary is added; avoid turning item selection into a fake range.
- `resolve-command-center/resources/runtimes/manifest.json`, `python-win32-x64.lock.json`, package verification/compatibility docs — runtime profile and qualification changes must be a separate reviewed scope.
- `.trellis/spec/backend/quality-guidelines.md:555-627` — update the selection contract after implementation is reviewed; this research report intentionally does not edit specs.
- No changes are needed in Command manifests, `ScriptContext`, `RuntimeManager`, `AfterEffectsLauncher`, legacy bridge handlers, or renderer interaction code for the minimum selection-first design.

## Acceptance checks

### Automated

- Resolver/Probe: both supported host profiles resolve to their qualified executable; unsupported versions produce stable `RUNTIME_UNSUPPORTED`; a fresh 21.1 Probe succeeds before any feature script.
- Core selection: absent method, method error, empty list, non-empty single/multitrack/disjoint list, disabled items/tracks, unsupported item types, media policies, and linked pair behavior match the matrix. Existing marker/range tests remain green.
- Determinism: reverse `GetSelectedClips()` order and verify identical normalized record/layer order. Verify no unselected gap item is included.
- Result/status: selected records still produce the existing seven public result keys, private launch directive, `Analyzing...`/OTIO status, and Runtime Manager's `Sending...`/`Starting AE...`/success logs. No new JSON field is necessary.

### Manual (requires user-owned Resolve/AE state)

1. Restart the known packaged Workflow host after installing a qualified 21.1 profile; refresh `ae.export` Feature Status and record runtime/profile/bridge identity.
2. In Resolve's Edit timeline, select one video, a linked video+audio pair, and two disjoint clips on different tracks in separate runs. Do not save/reset the dirty AE project during research.
3. Invoke visible export, audio-only, and video-only bindings. Confirm selected-only layers, linked-audio policy, composition gaps/timing, and AE import while AE is running and cold-started as separate runs.
4. Repeat with no selection and a Blue duration marker to verify the chosen empty-selection fallback. Repeat on a pre-21.0.4 host only if that release remains supported, verifying marker fallback.
5. If any stage fails, run the existing diagnostic sampler once; preserve probe cache, WER, process, and bounded logs before restarting hosts.

## Remaining user decisions / missing evidence

- Support matrix: both Resolve 20.3.2 and 21.1, or 21.1-only? Which exact runtime executable is approved for 21.1, and has it passed isolated import/connection and warm/cold AE tests?
- Empty native selection: preserve marker/playhead fallback (recommended for compatibility) or return `no-clips` to prevent accidental playhead export?
- Linked media: should selected video implicitly bring unselected linked audio, or must users select both? Recommended minimum is selected-set authority with de-duplication only when both are selected.
- Unsupported selected item: skip and `no-clips` if none remain (recommended), or surface a distinct user-facing error?
- Disjoint composition gaps: accept one min→max comp with gaps (current layer model), or require a future per-range/sequence presentation change?
- Runtime failure evidence: no non-empty live selection, 21.1 Clackly export, 21.1 packaged Probe, or AE import was observed in this task. These require user-controlled manual acceptance; no safe script setter exists.

## Caveats / Not Found

- The vendor API stub documents return type and item getters but not ordering, whether linked A/V are both returned, or treatment of transitions/generators. Those properties are intentionally hypotheses until fake and live UI tests are available.
- A live `GetSelectedClips()` empty result is not proof that Resolve 21.1 selection is broken; it only reflects the current UI selection state.
- This report does not recommend deleting Marker support. The existing Blue range remains the only known compatibility path for older Resolve and the explicit Core regression triples.
- No code, package, test, spec, Resolve, AE, cache, or log files were modified by this research worker.
