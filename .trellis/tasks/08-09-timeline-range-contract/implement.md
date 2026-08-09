# TimelineRange R2 Implementation and R3 Closure

## 1. Start state and baseline

- Record HEAD, branch, task status, and worktree.
- Confirm the only existing uncommitted files belong to this task.
- Run the current full `npm test` baseline before production edits.

## 2. Characterize current behavior first

- Add pure marker-range characterization tests for qualification, malformed entries/durations/frame keys, numeric precedence/order independence, absolute coordinates, `86400`, and end-exclusive ranges.
- Add Export policy tests for marker-read/start-frame errors, `single` no-marker-read, auto fallback, explicit missing/error behavior, and boundary overlap/no trimming.
- Run the new tests against the current implementation where applicable before extraction.

## 3. Extract the minimal public ability

- Add one internal Python `TimelineRange` value and one pure Blue Duration Marker resolver.
- Add only the narrow Resolve fact reads required by the extraction if the existing adapter boundary can carry them without changing error semantics.
- Keep source diagnostic-only and introduce no strategy/provider/registry abstraction.

## 4. Migrate Export-to-AE

- Replace only marker read/qualification/precedence/start/end construction in `get_target_clips_logic()`.
- Preserve the current policy-owned catch placement, playhead fallback, `MissingMarkerError`, FPS/timecode path, overlap predicate, media selection, linked audio, OTIO, JSX, and result handling.

## 5. Verification

- Run targeted TimelineRange tests.
- Run targeted Export-to-AE tests.
- Run every Python unittest group and full `npm test`.
- Run Python compilation, production build, `git diff --check`, and boundary searches.
- Audit dependency direction, cycles, duplicate Resolve wiring, Commands/Capabilities/UI/hosts, and Add Marker precedence.

## Stop gate

- Phase R1 architecture review: approved 2026-08-09.
- Phase R2 implementation: authorized 2026-08-09.
- Stop after R2; do not begin a future Range source or consumer.

## Phase R2 execution record

- Added six Export characterization tests before changing production behavior; the old implementation passed all 32 Export tests.
- Added the `TimelineRange` value, one Blue duration-marker resolver, and two direct raw-fact readers.
- Migrated only Export-to-AE marker range acquisition and construction; Export still owns policy, fallback, errors, overlap, media, OTIO, JSX, and launch behavior.
- Targeted verification passed: Resolve 22/22 and Export-to-AE 32/32.
- Full verification passed: Node 241/241 and Python 74/74, 315 total; production build, Python compilation, and `git diff --check` passed.
- Architecture audit found no Command, Capability, ScriptContext, Feature Status, Composition Root, host/UI, Add Marker precedence, source-branching, duplicate wiring, or dependency-cycle change.
- Phase R2 completed and passed architecture review; R3 closure was authorized under the same task.

## Phase R3 closure record

- Final dependency audit confirmed `Resolve API -> resolve.adapter -> resolve.timeline_range -> resolve2ae_core.export` with no reverse dependency.
- `TimelineRangeScanError` remains limited to the resolver, Export's legacy catch boundary, and focused tests; explicit mode still exposes the original error and auto still recovers the historical partial candidate.
- Real command-path smoke passed on Resolve 20.3.2.9 with managed CPython 3.13.14 and After Effects 2026:
  - auto plus Blue duration marker generated a batch composition, launched AE cold, and imported one clip;
  - auto without Blue generated a single/playhead-fallback composition and selected one clip;
  - explicit Blue range generated a batch composition and selected one clip;
  - explicit without Blue preserved `RuntimeError: No Blue duration marker found` through the existing provider envelope.
- The temporary Resolve project was closed and deleted; the user confirmed no project residue. The user accepted this smoke evidence and requires future unspecified smoke projects to use local, never network, project storage.
- Final targeted verification passed: Resolve 22/22 and Export-to-AE 32/32.
- Final full verification passed: Node 241/241 and Python 74/74, 315 total; production build, Python compilation, `git diff --check`, and dependency searches passed.
- No production cleanup was necessary. No new Range source, consumer, Command, Capability, UI, framework, or historical behavior fix was added.
- Closure action: create one focused implementation commit, archive this task, record the journal, and stop.
