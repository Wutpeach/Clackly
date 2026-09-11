# Implementation Plan

## Activation and Dispatch
- [x] Presented completed plan; user explicitly approved with “开始实施”. Activated task as in_progress on 2026-09-11.
- [x] Used exact Trellis active path and Orca Run run_33e09f66d5b2. Workers read the selected role TOMLs/context, launched with the configured models/efforts, and did not spawn workers.
- [ ] Follow current AGENTS.md: one filtered lifecycle wait, no progress transcript/state polling. Read completion reports, review, release/reuse, then acknowledge.
- [x] Recorded the dirty baseline and preserved unrelated backend spec, Diagnostic Sampler, package.json and AGENTS.md changes.

## Stage A: Runtime and Native Selection
- [x] Implement worker read specs, task design and research. Qualified CPython 3.14.4 / Resolve 21.1.0.14 through the existing isolated Probe; no known-incompatible probe was run or retried. Exact identities and results are in `stage-a-implementation.md`.
- [x] Added the verified profile/lock/staging/package changes while preserving 20.3.2. A fresh packaged Probe, package identity verification, and isolated packaged export-entry result passed; no new transport/architecture was needed.
- [x] Traced the sole shared target-acquisition caller and minimally updated `resolve2ae_core/export.py`. Command IDs, three media policies, linked-media behavior, result/status protocol, OTIO/JSX and AE launcher remain unchanged.
- [x] Implemented native selected-set filtering or empty-selection playhead fallback. Legacy Marker code remains for compatibility, but native `auto` bypasses it; malformed/error responses do not silently target unrelated clips.
- [x] Added focused existing-suite coverage for media policies, empty/playhead, disjoint/multitrack ordering, unselected gaps, linked/disabled/no-media filtering, API absence/error and Marker independence.
- [x] Independent check worker verified specs and AC1–AC4, fixed track-identity validation, and confirmed package identity; see `stage-a-check.md`.

## Validation Commands
Run focused checks first, then required full checks once the changed scope is clean. From resolve-command-center:

~~~powershell
python -m unittest discover -s resolve2ae_core/tests -p 'test_*.py'
python -m unittest discover -s resolve -p 'test_*.py'
npm test
npm run build
npm run package:win
npm run package:verify
~~~

Runtime/provider/package suites within npm test cover profile/probe regressions. Package only after qualification. Report unrelated baseline failures rather than masking them.

- [x] User reported “手测通过” for the requested non-empty selection/playhead and AE-import manual matrix without an agent saving or resetting the project.
- [x] Updated active Stage-A specs/docs, produced and verified `release/win-unpacked`, and recorded the concise remaining manual checklist in `stage-a-implementation.md`.
- [x] Received explicit user manual-test success; the Marker cleanup gate is satisfied.

## Stage B: Conditional Cleanup
- [x] Recorded user success and dispatched the agreed cleanup implementation.
- [x] Audited callers with fff. Deleted Marker-export branches/policies/errors, the export-only timeline-range module/tests, obsolete compatibility tests, and inaccurate active docs/spec claims; retained three commands/bindings, playhead behavior, shared Marker APIs/features, and historical task records.
- [x] Independent check worker verified and minimally fixed final targeting/cleanup, retained unrelated Marker behavior, and reran focused/full/build/package verification; see `stage-b-check.md`.
- [x] Confirmed no executable Marker export fallback, orphaned export-only helper, or commented-out compatibility path remains. Recorded final implementation evidence in `stage-b-implementation.md`; independent review, commit, and archive remain Lead-owned.

## Gates and Rollback
Stage A requires actual runtime qualification, not prefix-only changes. Stage B requires user test success, not timeout or automated success. Preserve unrelated work and prior qualified Runtime; rollback only task-owned changes. Keep stages separately reviewable.

## User acceptance and Stage B authorization
- User explicitly reported “手测通过” after receiving the reviewed Stage A package and manual checklist. The conditional gate for Marker-export cleanup is satisfied.
- Proceed with the already-approved Stage B scope: remove Marker-based AE export and obsolete exclusive code/tests/docs; preserve three commands/bindings, native selection, playhead fallback and unrelated shared Marker features.

## Stage A review handoff
- Independent Orca check task task_a88652de4cda / dispatch ctx_5e0e5c0b60fb succeeded. Report: stage-a-check.md. Reviewer corrected native track identity validation and rebuilt/verified the package.
- Final package: resolve-command-center/release/win-unpacked. Full suite, build and two-profile package verification passed. Lint/typecheck scripts are not configured.
- Both Stage A workers settled successfully, were released, and their deliveries were acknowledged.
- User handoff checklist: manual-test.md. User later reported “手测通过”; Stage B cleanup is implemented and independently reviewable. Commit batch and archive remain pending.

## Execution Record
- Stage A implement task: task_56522d57d9ed; dispatch: ctx_5186ba4d4e1f; Run: run_33e09f66d5b2. Visible worker launch confirmed gpt-5.6-terra / xhigh.
- Stage B cleanup implementation: task_de3ce1108bb5 / dispatch ctx_4448db12387a. See `stage-b-implementation.md`; independent checking, commit, and archive remain Lead-owned.

## Final review and commit handoff
- Stage B check task task_0c6dab06b437 / dispatch ctx_d8f52b0fa903 succeeded; Lead reviewed stage-b-check.md and the final export-spec diff. No implementation or validation blocker remains.
- Stage B implement worker was released. Release of the settled check worker returned retained/user_takeover; its terminal was preserved under user ownership, not forcibly closed. Both deliveries were acknowledged.
- Final code, source/staged/package absence checks and tests are complete. Commit-plan.md lists exact task-owned paths and exclusions for the Phase 3.4 one-shot approval. Staging, work commit and archive have not run.


## Completion authorization
- User approved commit and archive. Code, spec sync, both implementation/check stages and manual acceptance are complete. Final evidence: stage-b-check.md. Commit and archival bookkeeping follow the approved commit-plan.md; unrelated edits remain excluded.
