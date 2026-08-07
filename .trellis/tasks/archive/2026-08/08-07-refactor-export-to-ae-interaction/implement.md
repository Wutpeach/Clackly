# Export to AE Interaction and Async Probe Implementation Plan

## Preconditions

- [ ] Reviewer Orca Worker has reviewed the planning artifacts and blocking findings are resolved.
- [ ] User approves the final reviewed planning summary in a subsequent message.
- [ ] Run `task.py start` only after that approval; product code remains unchanged while status is `planning`.
- [ ] Preserve unrelated worktree changes and record baseline failures before editing.

## Implementation Checklist

### 1. Establish baseline and focused contracts

- [ ] Run focused Command Registry, renderer model, Interaction, Resolve2AE wrapper/core, AE path, AE launcher, and host-composition tests.
- [ ] Run `npm test`, `npm run build`, Python compile checks, and `git diff --check`; record unrelated baseline failures.
- [ ] Confirm the active config/binding fixtures used for migration tests without modifying the user's live AppData.

### 2. Add generic internal Command presentation

- [ ] Extend Command normalization/cloning with `presentation: "visible" | "internal"`, defaulting to `visible`, and reject invalid values.
- [ ] Make `getCommands()`/`getCommandById()` normatively include internal Commands and make `searchCommands()` exclude them, including for an empty query.
- [ ] Add one generic `isCommandPresentable()` predicate used by renderer catalog filtering and Settings Interaction Help target filtering.
- [ ] Preserve the full raw Command list only for binding action-description resolution.
- [ ] Add registry/executor/model/Settings regressions proving internal Commands execute and describe visible-target actions but never appear as Launcher, Search, All Actions, or Settings help targets.

Rollback point: all existing manifests default to visible, so the schema addition can be reverted independently before AE manifests use it.

### 3. Add target/media policy support behind the existing activation

- [ ] Make the thin wrapper map each Command id to an explicit `(mode, target_policy, media_policy)` triple while retaining current activation until the new actions land.
- [ ] Refactor core selection to scan sorted Blue markers only, use the lowest qualifying frame for batch, and fall back to playhead for auto single.
- [ ] Implement the explicit single-scope table: topmost video and topmost audio are selected independently; mixed de-duplicates linked audio and falls back to the available class.
- [ ] Implement batch mixed/audio/video collection with existing linked-audio de-duplication.
- [ ] Replace the `content_type == "video"` OTIO gate with an explicit selected-record `has_video` predicate.
- [ ] Carry media policy through shared JSX generation and force every video layer silent for video-only export.
- [ ] Keep those two adaptations minimal; do not otherwise restructure OTIO parsing, formulas, or JSX generation.
- [ ] Keep `get_target_clips_logic` valid for the full 3×3 policy matrix, but make `process_and_send` accept exactly the six documented command-backed triples and reject the other three before Resolve access.
- [ ] Implement layer-specific result contracts: Core failure exact seven public keys; Core success seven plus reserved `__clacklyDesktopLaunch`; Wrapper success transport unchanged and Core failure converted to script error; RuntimeManager success exact seven after stripping private launch data; failure envelopes remain typed.
- [ ] Preserve downstream target record shapes, terminal envelopes, OTIO/formula code, cleanup, and AE plan.
- [ ] Add policy-level tests before any manifest/default binding points to the new ids.

Rollback point: current manifests/bindings still activate only existing ids, so new policy support can be removed without a broken intermediate product.

### 4. Atomically activate internal AE actions and binding migration

- [ ] Keep `timeline.exportToAfterEffects` visible; add internal audio/video actions; retain all three shipped legacy action ids as internal aliases for this release.
- [ ] Map aliases exactly: old current=single mixed, old Blue=required Blue video, old Cyan=required Blue mixed; no alias reads Cyan.
- [ ] Rewrite every alias name/description/keywords to its actual non-Cyan behavior; a customized legacy-Cyan action shown under visible-target help must contain no Cyan instruction.
- [ ] Replace defaults with left=mixed, Ctrl+left=audio, Ctrl+Shift+left=video; remove Shift-only and every auxiliary self-binding.
- [ ] Recognize both exact shipped defaults using normalized, binding-id-sorted, key-order-insensitive semantic comparison (marker-only and marker+seven AE records).
- [ ] Structurally retarget customized legacy targets after writing a recoverable backup; original primary-target bindings win regardless of order, otherwise lexical binding id wins; de-duplicate same-action losers and send different-action kept/skipped diagnostics through the generic injected/default warning sink.
- [ ] Test shuffled-key copies of both exact defaults, a one-field-custom negative, backup/write failure/idempotence, every alias through InteractionManager/executor, customized old-Cyan action help text, primary-after-auxiliary order, auxiliary-vs-auxiliary collision with no primary, exact once-only diagnostics, and hidden search/presentation/help.
- [ ] Add the complete Blue/no-Blue × mixed/audio/video matrix, unordered multi-Blue and Cyan-ignore cases, independent single topmost/fallback/dedupe cases, missing explicit Blue, and no-requested-media cases.
- [ ] Add mixed-single and mixed-Blue transformed/speed/crop/lens/blend/LUT regressions and linked-A/V video-only silence assertions.
- [ ] Run all existing golden snapshots and inspect every intentional snapshot change.

Rollback point: restore old manifests/defaults/migration first; only then remove now-unused policy support or generic presentation metadata.

Rollback point: restore the current overloaded `auto/single/video-range/mixed-range` selection function and wrapper mapping.

### 5. Convert AE path discovery to bounded async execution

- [ ] Replace injected `execFileSync` with async `execFile` while retaining native Node facilities and UTF-8 output.
- [ ] Apply a 5-second timeout and hidden/no-shell execution to each PowerShell strategy.
- [ ] Preserve valid-path short circuit, discovery precedence, standard-directory fallback, sibling config preservation, and stale-key removal.
- [ ] Before any post-await write/removal, re-read config and compare the field with its exact starting presence/value so same-host work completed before the synchronous compare+write section is preserved.
- [ ] Document/test that initially-absent Reset is indistinguishable from unchanged absence and intentionally retains auto-discovery, including the absent-with-prefix -> Reset -> probe-settles case.
- [ ] Preserve/document the existing cross-host last-writer-wins ceiling; do not claim atomic CAS or add an interprocess lock.
- [ ] Update tests to await initialization and cover exact execFile options, timeout/error/UTF-8 fallback, stale replacement/removal, deferred manual save/reset cases, and no real PowerShell.
- [ ] Update both hosts to create and immediately observe a named initialization Promise, route unexpected rejection once to the host error surface, and never await it before palette/IPC/hotkey readiness.
- [ ] Add injectable deferred orchestration tests for readiness-before-settlement and observed rejection; do not rely only on source-order string assertions.

Rollback point: the async initializer and host ordering can be reverted without changing stored configuration.

### 6. Convert AE running-state detection to bounded async execution

- [ ] Inject async `execFile` into AfterEffectsLauncher and make `detectRunning()` asynchronous.
- [ ] Apply the same 5-second timeout/no-shell/hidden policy.
- [ ] Make PowerShell emit structured JSON with process count and one path/error record per process; validate completeness and parse every record.
- [ ] Any validated configured-path match wins; otherwise any unresolved record is unknown; only zero processes or all-valid nonmatches are confirmed false.
- [ ] Treat missing prerequisite, timeout, process/decoding error, inconsistent count, malformed JSON/path, and unresolved no-match as controlled `AFTER_EFFECTS_LAUNCH_FAILED` before bootstrap/spawn.
- [ ] Preserve executable canonicalization, running/cold bootstrap, one launch, and temporary JSX cleanup.
- [ ] Add direct tests for zero process, all-valid nonmatch, non-first match, null/inaccessible record, mixed match+invalid, mixed nonmatch+invalid, missing prerequisite, inconsistent count, timeout/process/decoding/malformed error, cleanup with zero spawn/bootstrap on unknown, exactly one cold spawn on confirmed false, and non-Windows behavior.
- [ ] Run launcher/RuntimeManager integration tests to prove no caller contract drift.

### 7. Documentation and executable specs

- [ ] Update README interaction help, Blue-marker fallback, Cyan removal, valid-path short circuit, no polling, and asynchronous probe behavior.
- [ ] Update backend quality guidelines for the normative visible/internal Command shape, raw lookup versus search, both binding fingerprints/structural migration policy, async AE initializer compare-before-write/rejection ownership, and tri-state running detection/fail-closed launch behavior.
- [ ] Add a backend executable-spec scenario for the full 3×3 selection primitive, six supported Command triples, numeric Blue ordering, independent single fallback/de-duplication, mixed `has_video` OTIO enrichment, video-only muting, layer-specific Core/Wrapper/RuntimeManager result/error contracts, and required matrix tests.
- [ ] Update frontend quality guidelines for the shared presentability predicate, all presentation surfaces, and visible-target/internal-action Interaction Help behavior.
- [ ] Preserve the explicit prohibition on keyboard synthesis/UI automation.

### 8. Automated quality gate

- [ ] Run focused Node tests for changed modules from `resolve-command-center/`; no test may start real PowerShell.
- [ ] Run `python -m unittest discover -s resolve2ae_core/tests -p "test_*.py"` and wrapper tests.
- [ ] Include numeric-vs-lexical marker keys (`"100"`/`"20"`), disabled top-track fallback, genuine mixed video+unlinked-audio OTIO evidence, full 3×3 selection, six supported/rejected execution triples, exact Core failure/success transport, Wrapper script error, RuntimeManager stripped success/typed failure, and multiple video layers all muted in video-only coverage.
- [ ] Run Python compile checks for changed Python modules.
- [ ] Run `npm test` from `resolve-command-center/`.
- [ ] Run `npm run build`.
- [ ] Run `git diff --check`.
- [ ] Boundary-search for AE/marker/media branches in renderer and Command Engine; only generic presentation filtering is allowed.
- [ ] Perform a changed-diff complexity/simplification review: remove duplicate branches/helpers, verify no speculative abstraction/dependency, and re-run affected checks.

### 9. Package, install, and manual Resolve validation

- [ ] From `resolve-command-center/`, run `npm run package:win` and `npm run package:verify`.
- [ ] From `resolve-command-center/`, run `npm run workflow:install:package` before asking the user to test.
- [ ] Ask the user to restart Resolve manually; do not terminate Resolve on the user's behalf.
- [ ] Verify one visible/searchable card, three modifiers, Blue batch, playhead single, Cyan ignored, missing/stale path responsiveness, AE running, and AE cold start.
- [ ] Inspect AE compositions/layers for representative mixed, audio-only, video-only, transformed, speed-ramped, and LUT clips.

## Risky Files and Review Focus

- `command-engine/registry.js` and renderer catalog model: execution visibility must not become renderer-specific or hide action descriptions.
- `interaction/BindingStorage.js`: exact-default migration versus customized binding preservation.
- `resolve2ae_core/export.py`: selection/media refactor must not leak into OTIO/formula/JSX behavior.
- `capability/afterEffectsPath.js`: async precedence, timeout recovery, non-ASCII paths, and config preservation.
- `capability/afterEffectsLaunch.js`: timeout must not create double launch/retry or weaken path validation.
- Both Electron hosts: first-run discovery must not gate palette/IPC/hotkey readiness.

## Completion Gate

- [ ] Every PRD criterion has automated evidence or an explicit packaged/manual record.
- [ ] Reviewer findings are resolved and full-scope Trellis check passes.
- [ ] Required spec updates are complete.
- [ ] Workflow package is installed before user manual validation.
- [ ] User performs the final Resolve restart and hands-on verification.
