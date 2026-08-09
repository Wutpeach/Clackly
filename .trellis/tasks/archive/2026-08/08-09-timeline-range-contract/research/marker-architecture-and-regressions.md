# Research: Marker architecture and regressions

- Query: Map Marker/Range abstractions and every semantic consumer across the repository; distinguish marker-provider precedence from marker-range precedence; derive the tested/code-supported behavior matrix for valid, multiple, point, absent, malformed, and unavailable marker data.
- Scope: internal
- Date: 2026-08-09

## Findings

### Executive conclusions

1. There is no production `TimelineRange`, Range Capability, Range Provider, Range Resolver, range store, or Mark In/Out integration. Repository-wide semantic searches for `TimelineRange`, Range/Marker Capability/Provider/Resolver variants, `MarkIn`, `MarkOut`, `GetMarkIn`, `GetMarkOut`, `SetMarkIn`, and `SetMarkOut` found no range-domain abstraction or In/Out consumer.
2. The only current marker-to-range implementation is the feature-coupled block inside `resolve-command-center/resolve2ae_core/export.py:149-195`. `get_target_clips_logic()` combines Resolve data acquisition (`GetSetting`, `GetStartFrame`, `GetMarkers`, `GetCurrentTimecode`), range choice/validation, and Export-to-AE clip/media selection in one function. It is re-exported by `resolve-command-center/resolve2ae_core/__init__.py:1-14`, but repository callers are only `process_and_send()` at `resolve-command-center/resolve2ae_core/export.py:570-571` and tests at `resolve-command-center/resolve2ae_core/tests/test_export_core.py:848-1005`.
3. `createMarkerCapability()` is real but unrelated to range resolution: it implements the user action **Add Marker**. Its backend/provider precedence is `resolveApi -> resolveScriptApi -> workflowPluginApi -> keyboardShortcut`, with `uiAutomation` reserved (`resolve-command-center/capability/marker.js:3-8,31-52`). It creates Red point markers of duration 1 through the Resolve adapters (`resolve-command-center/resolve/adapter.js:3-7,89-110`; `resolve-command-center/resolve/adapter.py:210-226`), so its own markers do not qualify as Blue duration ranges.
4. Only three production sites call `Timeline.GetMarkers()`: Export-to-AE range discovery (`resolve-command-center/resolve2ae_core/export.py:166-190`) and the JavaScript/Python Add Marker adapters' duplicate-position diagnostics after `AddMarker` returns false (`resolve-command-center/resolve/adapter.js:115-126`; `resolve-command-center/resolve/adapter.py:233-242`). Therefore there is no non-Export-to-AE range consumer. The non-export consumers of marker data are duplicate detection in those two adapters; the wider Add Marker command/UI path consumes marker intent, not marker ranges.

### Existing abstractions and usage map

| Area | Existing object / utility | Responsibility and consumers |
|---|---|---|
| Add Marker command | `timeline.addMarker` -> `marker.add` | Manifest maps the Command to the Capability (`resolve-command-center/command-engine/commands/timeline.json:3-9`); the generic executor resolves and executes the capability (`resolve-command-center/command-engine/executor.js:22-37`). |
| Marker Capability/provider selection | `createMarkerCapability`, `MARKER_BACKENDS` | Availability-based provider selection and execution only (`resolve-command-center/capability/marker.js:3-28,31-52`). Shared composition registers it (`resolve-command-center/app/createClacklyCore.js:47-56`). Standalone supplies the bridge as `resolveScriptApi` (`resolve-command-center/electron/main/main.js:23-35`); Workflow Integration supplies `workflowPluginApi` (`resolve-command-center/workflow-plugin/main.js:107-117`); the Core also supplies the shortcut backend (`resolve-command-center/app/createClacklyCore.js:48-53`). |
| Marker execution adapters | `resolve/adapter.js`, `resolve/adapter.py` | Resolve project/timeline acquisition, current-frame conversion, `Timeline.AddMarker`, and failed-add duplicate diagnosis. JavaScript adapter entry: `resolve-command-center/resolve/adapter.js:57-86,89-142`; Python bridge entry: `resolve-command-center/resolve/adapter.py:175-207,210-245`. Standalone transport maps back to the same intent at `resolve-command-center/execution-adapter/bridge.js:103-126` and `resolve-command-center/bridge/resolve_bridge.py:14-22`. |
| Add Marker frame utility | `parseFrameRate`, `timecodeToFrames`, `timelineRelativeFrame` | Robust timeline-relative conversion, including drop-frame labels; consumed only by the JavaScript Add Marker adapter (`resolve-command-center/resolve/marker-frame.js:1-83`; import at `resolve-command-center/resolve/adapter.js:1`). Python has equivalent adapter-local functions at `resolve-command-center/resolve/adapter.py:85-153,175-207`. This is a frame-position utility, not a range resolver. |
| Export command policy | `COMMAND_POLICIES` | Six AE Command ids map to explicit `(mode, target_policy, media_policy)` triples (`resolve-command-center/scripts/resolve2ae_export.py:6-18,31-40`). Both the visible command and audio/video actions use `target_policy="auto"`; legacy range aliases use `blue-range`. |
| Marker-to-range and clip selection | `get_target_clips_logic`, `MissingMarkerError` | The only effective range resolver; directly reads Resolve, chooses a Blue duration interval or a playhead point, then collects/export-filters clips (`resolve-command-center/resolve2ae_core/export.py:145-225,253-304`). There is no capability/provider boundary around this read. |
| Export fallback timecode utility | local `timecode_to_frames` | A separate, feature-local converter (`resolve-command-center/resolve2ae_core/export.py:59-63`) used only for the single/playhead path at `resolve-command-center/resolve2ae_core/export.py:192-195`. It is not the robust Add Marker utility and does not share its drop-frame validation. |

Non-range presentation/interaction consumers remain generic: `timeline.addMarker` is present in the binding defaults and UI catalog, but they route only the Command id. The marker card's icon is projected generically (`resolve-command-center/electron/renderer/App.jsx:81`), and default interaction storage targets the command rather than reading Resolve markers (`resolve-command-center/interaction/BindingStorage.test.js:21-29`).

### Two independent precedence contracts

#### 1. Add Marker provider precedence

- Source order is exactly `resolveApi`, `resolveScriptApi`, `workflowPluginApi`, `keyboardShortcut`; the reserved `uiAutomation` entry is skipped (`resolve-command-center/capability/marker.js:3-8,32-47`).
- Missing backend, missing `addMarker`, false availability, or `CapabilityUnavailableError` during availability moves to the next provider (`resolve-command-center/capability/marker.js:11-28,32-47`). Once selected, `backend.addMarker()` is called directly and its error propagates; there is no lower-provider execution fallback (`resolve-command-center/capability/marker.js:50-52`).
- Tests lock highest-priority selection (`resolve-command-center/capability/marker.test.js:23-48`), unavailable-provider fallback (`resolve-command-center/capability/marker.test.js:68-86`), and no fallback after a semantic execution error (`resolve-command-center/capability/marker.test.js:88-105`). The shared Core repeats the latter two architecture regressions at `resolve-command-center/app/createClacklyCore.test.js:119-167`.

#### 2. Blue range-marker precedence (the exact Export-to-AE regression)

- Before the 2026-08-07 refactor, Export-to-AE scanned Blue/Cyan markers in Resolve API enumeration order (`.trellis/tasks/archive/2026-08/08-07-refactor-export-to-ae-interaction/research/current-state.md:9`); the review explicitly identified deterministic numeric ordering as required (`.trellis/tasks/archive/2026-08/08-07-refactor-export-to-ae-interaction/research/current-state.md:38`).
- The preserved contract is now: qualify only exact-color `"Blue"` markers with integer-convertible `duration > 1`, convert the frame key to `int`, sort ascending numerically, and select the lowest frame (`resolve-command-center/resolve2ae_core/export.py:166-188`). Cyan cannot affect range or media policy.
- The exact regression fixture inserts keys in the order `"100"` (valid Blue), `"5"` (Blue point), `"20"` (valid Blue), `"10"` (Cyan duration). Old first-enumerated selection would choose frame 100; lexical ordering would also put `"100"` before `"20"`. Current code must choose frame 20, then still choose 20 after reversing insertion order (`resolve-command-center/resolve2ae_core/tests/test_export_core.py:887-910`).
- The contract is also recorded in the project backend spec (`.trellis/spec/backend/quality-guidelines.md:521-560`) and the originating requirement (`.trellis/tasks/archive/2026-08/08-07-refactor-export-to-ae-interaction/prd.md:37-39,93-94`).

### Current range coordinate and end semantics

- Resolve marker keys are treated as timeline-relative frame offsets. A chosen range starts at `int(marker_key) + timeline.GetStartFrame()` (`resolve-command-center/resolve2ae_core/export.py:163-187`). If `GetStartFrame()` returns `None`, the code substitutes `86400` (`resolve-command-center/resolve2ae_core/export.py:163-164`); exceptions from `GetStartFrame()` are not caught.
- A marker duration `d` produces `end_frame = start_frame + d` (`resolve-command-center/resolve2ae_core/export.py:185-187`). Batch clip intersection is half-open: `clip_start < end_frame and clip_end > start_frame` (`resolve-command-center/resolve2ae_core/export.py:209-216`). Thus current evidence supports `[start_frame, end_frame)` and a duration of `d` frames, not an inclusive end.
- The 3x3 selection test uses marker `[48, 72)` (`frame=48`, `duration=24`) and selects clips `[48,72)` for auto/explicit range across mixed/video/audio policies (`resolve-command-center/resolve2ae_core/tests/test_export_core.py:853-886`).
- A single/playhead selection uses a one-frame interval: `start_frame = timecode_to_frames(current_tc, fps)` and `end_frame = start_frame + 1`; point hit is `clip_start <= start_frame < clip_end` (`resolve-command-center/resolve2ae_core/export.py:192-216`). `target_policy="single"` bypasses marker acquisition entirely (`resolve-command-center/resolve2ae_core/export.py:166,192-195`).
- Export's local FPS/timecode behavior is permissive and distinct from Add Marker: timeline FPS is `float(GetSetting("timelineFrameRate"))`, falling back to `24.0` on empty/exception (`resolve-command-center/resolve2ae_core/export.py:154-157`); only colon-separated `HH:MM:SS:FF` parses, and any parse error (including a semicolon drop-frame string) returns frame 0 (`resolve-command-center/resolve2ae_core/export.py:59-63`). By contrast, the Add Marker utility validates colon/semicolon forms and drop-frame labels (`resolve-command-center/resolve/marker-frame.js:23-76`) with tests at `resolve-command-center/resolve/marker-frame.test.js:5-40`. No code evidence supports treating these converters as interchangeable.

### Behavior/regression matrix

`auto` means the visible/default export policy; `blue-range` means an explicit legacy range alias.

| Marker/API condition | `auto` behavior | `blue-range` behavior | Evidence strength |
|---|---|---|---|
| One valid Blue duration marker (`duration > 1`) | Batch range at `timeline_start + marker_frame`; end exclusive at `start + duration`. | Same range. | Direct code (`export.py:166-190`) and full 3x3 test (`test_export_core.py:853-886`). |
| Multiple valid Blue duration markers | Choose the lowest **numeric** frame, independent of API/dict enumeration order. | Same selection rule. | Direct regression test with `"100"` vs `"20"` and reversed insertion (`test_export_core.py:887-910`). |
| Blue point marker (`duration == 1`) | Ignored; if no other qualifying Blue remains, use single/playhead fallback. | Ignored; if no qualifying Blue remains, raise `MissingMarkerError`. | Point ignore is directly tested in the multiple-marker fixture (`test_export_core.py:892-903`); point-only outcomes are code-derived (`export.py:177-190`). Duration `0`, negative duration, missing duration, and values converted to integers `<=1` follow the same code path. |
| Cyan or other color | Ignored. Cyan does not encode range scope or media. | Ignored, then missing-marker if no Blue qualifies. | Cyan ignore tested at `test_export_core.py:892-903`; exact controlled missing result tested with Cyan-only input at `test_export_core.py:967-992`. |
| No markers / falsey marker result | Single/playhead fallback, not an error. | `MissingMarkerError("No Blue duration marker found")`; `process_and_send()` converts it to exact `code="missing-marker"` terminal data. | Auto empty-marker behavior is exercised indirectly by the default-empty `FakeTimeline` (`test_export_core.py:153-195`) and single export snapshots such as `test_export_core.py:426-445`; explicit no-qualifying behavior is tested at `test_export_core.py:967-992`. No dedicated explicit-empty test exists. |
| Per-entry malformed `info` or malformed/non-integer `duration` | Entry is skipped; if nothing qualifies, playhead fallback. | Entry is skipped; if nothing qualifies, missing-marker. | Code only: `info.get` and `int(duration)` are inside the per-entry catch (`export.py:171-176`). No malformed-entry regression test exists. |
| Qualifying Blue with malformed/non-integer frame key; truthy non-mapping marker container | The exception reaches the outer catch and is swallowed for `auto`; normally this falls back to playhead. A previously appended valid range can survive if the malformed key occurs later, because `blue_ranges` is not cleared. | Original exception propagates (it is not converted to `MissingMarkerError`). | Code only: frame conversion is outside the per-entry catch (`export.py:171-181`). No regression test exists. This order-sensitive malformed-data edge is a caveat, not a proposed behavior change. |
| Marker API missing/throws/unavailable | Exception is swallowed and selection falls back to single/playhead. | Same original API exception propagates. | Direct test installs a throwing `GetMarkers`: explicit raises and auto returns mode `single` (`test_export_core.py:994-1006`). Missing method follows the same outer catch by code. |
| Marker scan skipped via `target_policy="single"` | Not applicable; policy ignores all markers and selects playhead. | Not applicable. | Direct code (`export.py:166,192-195`) and 3x3 test (`test_export_core.py:867-884`). |
| `timeline.GetStartFrame()` returns `None` | Uses hard-coded base `86400` before either marker scan or playhead selection. | Same. | Code only (`export.py:163-164`); no focused range regression test. If the call throws, both policies propagate before marker handling. |

### Files found

- `resolve-command-center/resolve2ae_core/export.py` — sole marker-to-range resolver, clip intersection, media selection, and AE export pipeline.
- `resolve-command-center/resolve2ae_core/__init__.py` — public re-export of the feature-coupled selector; no additional repository consumer found.
- `resolve-command-center/scripts/resolve2ae_export.py` — Command-id-to-target/media policy mapping.
- `resolve-command-center/resolve2ae_core/tests/test_export_core.py` — numeric precedence, point/Cyan ignore, selection matrix, missing-marker terminal, API-error/fallback regressions.
- `resolve-command-center/capability/marker.js` — Add Marker Capability and backend selection; not a range capability.
- `resolve-command-center/capability/marker.test.js` and `resolve-command-center/app/createClacklyCore.test.js` — Add Marker provider precedence, availability fallback, and execution no-fallback regressions.
- `resolve-command-center/app/createClacklyCore.js`, `resolve-command-center/electron/main/main.js`, `resolve-command-center/workflow-plugin/main.js` — Marker Capability registration and host-specific provider injection.
- `resolve-command-center/resolve/adapter.js`, `resolve-command-center/resolve/adapter.py` — Resolve Add Marker execution plus duplicate reads through `GetMarkers()`.
- `resolve-command-center/resolve/marker-frame.js`, `resolve-command-center/resolve/marker-frame.test.js`, `resolve-command-center/resolve/test_adapter.py` — robust Add Marker frame/timecode conversion and parity tests; distinct from export range fallback conversion.
- `resolve-command-center/execution-adapter/bridge.js`, `resolve-command-center/bridge/resolve_bridge.py` — standalone Add Marker transport.
- `resolve-command-center/command-engine/commands/timeline.json`, `resolve-command-center/command-engine/commands/after-effects.json` — Marker and AE Command metadata, including internal compatibility range aliases.
- `.trellis/tasks/archive/2026-08/08-07-refactor-export-to-ae-interaction/{research/current-state.md,prd.md,design.md}` — historical enumeration-order/Cyan behavior and the current numeric-Blue contract.
- `resolve-command-center/README.md:176` — current product-facing summary: lowest numeric Blue duration range, otherwise playhead; Cyan ignored.

### External references

No external documentation was needed to establish repository behavior. This report intentionally does not infer additional Resolve API semantics beyond what the current code and tests encode. The repository identifies Resolve `20.3.2.9` as the current validated baseline in the archived 2026-08-07 task, but the range rules above are derived from local code/tests rather than external version documentation.

### Related specs

- `.trellis/spec/backend/quality-guidelines.md:521-562` — authoritative current Resolve2AE selection/export contract and required regressions.
- `.trellis/spec/backend/quality-guidelines.md:728-766` — Add Marker Resolve adapter, timeline-relative frame, FPS/drop-frame, error, and parity contract.
- `.trellis/spec/backend/quality-guidelines.md:26-89` — Add Marker Capability/provider precedence and no-execution-fallback contract.
- `.trellis/spec/guides/cross-layer-thinking-guide.md` — relevant because current selection crosses script policy, Resolve data, domain-like range resolution, and export behavior.
- `.trellis/spec/guides/code-reuse-thinking-guide.md` — relevant because current range logic and Add Marker frame conversion are separate; any later extraction must avoid assuming semantic parity without evidence.

## Caveats / Not Found

- No tests cover malformed marker `info`, malformed duration, malformed qualifying frame keys, non-mapping `GetMarkers()` payloads, or `GetStartFrame() is None` for the range path. Their matrix entries above are precise code-path observations, not claimed product intent.
- No dedicated test covers a timeline containing only a Blue point marker or an explicitly empty marker map under `blue-range`; current outcomes are unambiguous in code and partially covered by the combined point/Cyan and missing-marker tests.
- The current feature-local fallback converter does not support semicolon drop-frame timecode and silently maps malformed timecode to frame 0. Robust drop-frame behavior belongs to the separate Add Marker adapters/tests, not the current Export-to-AE range contract.
- The term “Marker precedence” is ambiguous in archived architecture tasks. Both preserved contracts must be named explicitly in R2: Add Marker **provider precedence** and Blue duration-marker **range precedence**. They are independent and owned by different code.
- Complete-repository searches produced no non-AE marker-range reader and no Mark In/Out implementation. Generic uses of “marker” in Trellis hooks, UI design tooling, prose, and parser sentinels are textual false positives and not timeline-marker consumers.
