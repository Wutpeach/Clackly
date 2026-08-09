# TimelineRange Minimal Extraction and Export-to-AE Migration

## Goal

Preserve current Export-to-AE behavior exactly while extracting Blue Duration Marker resolution into a small internal Timeline Range capability and making Export-to-AE its first consumer.

## Background

Phase R1 evidence and architecture design completed on 2026-08-09 and was approved for implementation. The approved dependency direction is:

```text
Resolve raw facts -> Timeline Range resolver -> TimelineRange | None -> Export-to-AE policy
```

Phase R2 implementation was approved and completed on 2026-08-09. Phase R3 closes the same task after final architecture audit, real Resolve/AE smoke evidence, full regression, commit, and archive. Work stops with the first source and first consumer sealed.

## Requirements

1. Add characterization tests before production edits for current marker qualification, malformed-data behavior, numeric precedence, timeline offset, `86400` fallback, policy-specific API errors, and clip boundary overlap/no-trimming behavior.
2. Add an independent internal `TimelineRange` value with integer `start_frame`, integer `end_frame_exclusive`, strict `end_frame_exclusive > start_frame`, and diagnostic source `resolve-duration-marker`.
3. Add one pure resolver from already acquired timeline-start and marker facts to `TimelineRange | None`.
4. Support exactly one source: exact-color Blue markers with integer-coercible duration greater than one.
5. Keep Resolve fact acquisition separate from qualification, precedence, range construction, and Export policy.
6. Migrate only the existing marker-read/qualification/precedence/range-construction block in `get_target_clips_logic()`.
7. Keep `single`, `auto`, `blue-range`, playhead fallback, `MissingMarkerError`, FPS/timecode behavior, clip/media selection, linked audio, OTIO, JSX, AE launch, and terminal/error translation in Export-to-AE.
8. Preserve the current try/catch boundary: marker read/scan failures fall back only for `auto`; explicit `blue-range` propagates the original error; `GetStartFrame` failures propagate for every policy.
9. Keep marker coordinates absolute in Resolve timeline-item frame space and range ends exclusive.
10. Run targeted TimelineRange and Export tests, the complete Python suite, and `npm test`.
11. Audit dependency direction and confirm no Command, Capability, ScriptContext, Feature Status, Composition Root, UI, host, or Add Marker backend change.
12. Confirm `TimelineRangeScanError` remains an internal extraction-compatibility detail used only by the resolver, Export's legacy catch boundary, and focused tests.
13. Complete and record real `auto` marker-range, auto playhead-fallback, explicit valid-range, and explicit missing-marker smoke evidence.
14. Run final regression/build checks, commit the single-responsibility change, archive the Trellis task, and seal the Timeline Range phase.

## Compatibility Requirements

- Exact `color == "Blue"` qualification.
- `int(duration) > 1`; point/Cyan/other markers remain ignored.
- Lowest numeric qualifying frame wins independently of marker enumeration order.
- Absolute start remains `int(marker frame) + timeline.GetStartFrame()`.
- `GetStartFrame() is None` remains `86400`.
- Half-open range remains `[start_frame, end_frame_exclusive)`.
- Auto without a usable range remains playhead fallback.
- Explicit range without a usable range remains `MissingMarkerError("No Blue duration marker found")`.
- Per-entry malformed info/duration remains skipped.
- A malformed qualifying frame key retains the current policy-dependent error behavior and accumulated-candidate behavior.
- Clip intersection remains `clipStart < rangeEnd && clipEnd > rangeStart`.
- Selected clips remain untrimmed.
- Missing FPS remains `24.0`; malformed/drop-frame playhead timecode remains frame 0.
- No clamping, non-negative validation, timeline-bound validation, or overflow policy is added.

## Out of Scope

- Any second Range source, including In/Out, selected clips, anchors, point markers, Cyan markers, or other colors.
- Range Command, Capability, UI, shortcut, setting, persistence, store, manager, registry, provider framework, strategy hierarchy, plugin API, or event lifecycle.
- Changes to Command schema, capability definitions, ScriptCapabilityProvider, ScriptExecutor, PythonProvider, ScriptContext, Feature Status, Composition Root, hosts, renderer, or Add Marker backend precedence.
- Fixing known FPS, timecode, drop-frame, offset fallback, negative-frame, overflow, or timeline-bound behavior.
- Any R4, future source, or future consumer work after closure.

## Acceptance Criteria

- [x] Independent `TimelineRange` value and Blue Duration Marker resolver exist under the internal Python Resolve boundary.
- [x] Export-to-AE consumes `TimelineRange | None`; playhead fallback and missing-marker policy remain in Export.
- [x] Characterization tests cover all required current behavior and pass before/after extraction.
- [x] Existing public function signatures and user-visible behavior remain unchanged.
- [x] No second source or speculative framework is introduced.
- [x] Targeted and complete automated suites pass above the existing 302-test baseline.
- [x] Architecture audit finds no forbidden dependency, duplicate wiring, new Capability/Command/UI, or Add Marker precedence change.
- [x] `TimelineRangeScanError` remains internal and the original policy-specific exception behavior is preserved.
- [x] Real Resolve/AE smoke covers auto marker range, auto fallback, explicit range success, and explicit missing-marker behavior.
- [x] Final targeted, Python, Node, build, compile, diff, and architecture checks pass at the 315-test baseline.
- [x] Work stops after R3 closure without beginning a future source or consumer.
