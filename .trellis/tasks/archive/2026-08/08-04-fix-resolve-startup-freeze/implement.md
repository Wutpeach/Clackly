# Resolve Startup Freeze Round 3 Experiment Plan

## Completed prior rounds

- Round 1 lazy-window B1 stalled before BrowserWindow creation and was reverted.
- Round 2 P0 reproduced on the sole local project; immediate strict original C0 did not reproduce during approximately two minutes.
- The strict C0 failure stopped the native-handshake A1/H1 work before any artifact build or install.
- Original repository product source, ProgramData plugin, and user profile remain unchanged at plan time.

No prior candidate work remains active.

## 1. Preflight and immutable original backup

- [ ] Reconfirm zero repository product diff, original installed-plugin inventory/hash, and one canonical ProgramData manifest.
- [ ] Ask the user to close Resolve normally; observe Resolve and every matching Resolve-owned Clackly/Electron process absent. Never call `Stop-Process` without separate authority.
- [ ] Resolve the exact canonical profile `C:\Users\Administrator\AppData\Roaming\Clackly Workflow Plugin`; validate every existing ancestor and use queue-based attribute-first no-follow traversal that rejects every reparse entry before open/hash/descent.
- [ ] Allocate unique same-volume sibling paths for the immutable original backup and two retained experiment profiles; prove common volume identity and require all targets absent and outside the canonical directory.
- [ ] Implement the specified ordinal, length-delimited deterministic tree digest; fail closed on unreadable/changing entries and persist only aggregate digest/counts while sanitizing filenames/individual hashes from output.
- [ ] Implement atomic durable write-ahead state updates containing all paths/identities, phase, and pending rename. Refuse all moves if atomic temp-write/replace, flush, or read-back fails.
- [ ] Implement idempotent pending-operation recovery using source/target existence plus expected identity; both/neither/mismatch or missing/corrupt journal performs no mutation and asks the user.
- [ ] Dry-run interruption recovery on task-created temporary fixtures for all four move boundaries.
- [ ] Durably record pending original -> backup, perform one rename-only `Directory.Move`, verify identity/digest and canonical absence, then commit phase/clear pending.

Rollback point: before any Resolve launch, atomically rename the verified original backup back to canonical and revalidate.

## 2. Cold C1

- [ ] Arm the external responsiveness sampler, low-frequency process metadata collector, and clean Resolve log offset.
- [ ] Launch Resolve, manually open only `(Untitled Project 1)` if it is not restored automatically, and require the sole pointer `Local Database : Local`.
- [ ] Verify automatic Clackly startup, successful shortcut registration, and creation of one canonical test profile.
- [ ] From the project pointer, continuously interact with Resolve for at least 120 seconds and record the user's binary whole-GUI observation plus actual sampler cadence.
- [ ] Ask the user to close Resolve normally and observe all relevant processes absent. If C1 is invalid or does not reproduce, restore the original and stop as inconclusive/not-positive.
- [ ] If C1 remains valid, durably commit `C1-complete` plus canonical directory/volume identity without recursively reading the generated profile.

## 3. Exact warm W1

- [ ] Between C1 close and W1 launch, do not recursively enumerate, hash, inventory, copy, move, or open the C1 profile. Verify exact reuse only by canonical path, directory/volume identity, and committed phase.
- [ ] Repeat the identical launch/project/sampler/interaction contract.
- [ ] Require no whole-GUI stall for at least 120 seconds. If W1 stalls or any gate is invalid, restore the original and stop; do not infer a cold/warm effect.
- [ ] After the user closes normally and processes are absent, compute the test-profile digest, transactionally rename it -> retained test-profile-1 path, and verify identity/canonical absence.

## 4. Second cold C2

- [ ] Repeat the identical run with canonical absent so Electron creates an independent fresh profile.
- [ ] Require the sole local pointer, successful automatic startup/shortcut, at least 120 seconds of continuous interaction, valid sampler cadence, and recurrence of the whole-GUI stall.
- [ ] After the user closes normally and processes are absent, compute the C2 digest, transactionally rename it -> retained test-profile-2 path.
- [ ] Classify positive only when C1=yes, W1=no, C2=yes. Otherwise classify negative/inconclusive and ship no product change.

## 5. Mandatory restoration and verification

- [ ] With canonical absent and observed-clean processes, transactionally rename immutable original backup -> canonical and immediately verify its digest/counts.
- [ ] Verify deterministic tree digest, file count, byte count, real/non-reparse state, and absence of the original-backup path.
- [ ] Reconfirm `%APPDATA%\Clackly`, Resolve project/database state, repository product source, and ProgramData plugin were not modified.
- [ ] Reconfirm original installed-plugin hash/inventory and no remaining Resolve/Clackly process.
- [ ] Retain experiment-created profiles outside canonical; request separate user approval before any deletion.
- [ ] Write one evidence report containing only run conditions, project pointers, timestamps, responsiveness summaries, binary user observations, aggregate profile digests/counts, and restoration proof.

## Interruption recovery

- [ ] Before every action, durably read/parse the task-state record, reconcile pending state, and check the known immutable original-backup identity/path first.
- [ ] On failure, launch nothing further. Ask the user to close relevant processes normally; never force-terminate. Move only an identity-verified task-created canonical profile aside, then transactionally restore the original.
- [ ] For each pending move: source-only means not applied; identity-matching target-only means applied; both/neither/mismatch means no mutation and user escalation.
- [ ] If the journal is missing/corrupt, a process remains, or identity/restoration safety is ambiguous, perform no move and report the exact top-level blocker/paths to the user.

## Review and approval gates

- [ ] Existing reviewer Orca Worker reviews path containment, reparse handling, digest scope, state recovery, equal-run causality, classification, and mandatory restoration.
- [ ] Present the reviewed final plan to the user and obtain fresh implementation approval before moving the profile.
- [ ] No source implementation, package build, ProgramData install, or product-fix claim is part of Round 3.

## Active critical constraint

"If both strict cold-profile runs do not reproduce the whole-GUI stall, or the exact warm-profile reuse does not remove it, restore the original profile and ship no speculative production change."

## Round 3 execution outcome

- [x] Implemented `research/profile-experiment.py` with durable write-ahead state, no-follow digesting, identity-verified rename-only moves, fail-closed recovery, and observation-only process checks.
- [x] Passed `py_compile` and 15 task-created transaction/recovery fixtures.
- [x] Orca Worker developer performed a read-only implementation audit, identified the orphaned-original prepare gap, and re-audited the fix as `SAFE TO PREPARE` with no blocker or major issue.
- [x] O0 backed up and verified the exact original profile before C1.
- [x] User observed a cold-profile whole-GUI stall around 4 seconds after project open for approximately 2–3 seconds.
- [x] Rejected C1 because the sampler detected Resolve was already running and produced no responsiveness run; cancelled W1/C2 as required.
- [x] Transactionally retained the generated cold profile and restored/verified the exact original profile, original installed plugin hash, real-directory state, and zero matching processes.
- [x] Classified Round 3 as inconclusive/not-positive and shipped no product change. Evidence: `research/round3-c1-invalid.md`.

## Round 3 strict retry plan

### 1. Minimal sampler handshake

- [ ] Extend `capture-u0.ps1` with mandatory retry parameters for unique ready/started/failed paths, random token, and expected top-level profile state (`Absent`/`Present`).
- [ ] Before writing readiness, require Resolve absent and verify the expected profile state without recursive profile enumeration.
- [ ] Require exact strict settings `DurationSeconds=300`, `RespondingIntervalMs=100`, and `CimIntervalMs=2000`; bind and later match them in ready/started/completion.
- [ ] Use attribute-first top-level inspection: cold rejects any entry; warm requires one real non-reparse directory matching committed C1 volume/file identity.
- [ ] Require a dedicated `powershell.exe -File` sampler, task-research-contained non-reparse handshake root, post-publication Resolve-absent check, deadline/start-time-bounded acquisition, and per-sample target identity validation.
- [ ] In readiness mode reject any `TargetProcessId`; acquire only a newly launched Resolve through the post-readiness wait branch.
- [ ] Atomically write schema/run/token/profile-state-and-identity/settings/run-directory/sampler-PID/start-time/ready-time/deadline JSON to an absent destination; a stale destination or any preflight failure writes no readiness.
- [ ] Require ready/started/failed/completion destinations absent before publication. On timeout/error consume ready -> failed; on target acquisition first consume/revoke ready, then atomically publish started bound to target PID/start time. Any crash gap invalidates/restores.
- [ ] Publish `run.json` through temp + absent-destination atomic rename only after every output completes; include schema, `status=complete`, run/token/sampler PID/target PID/start-time/timing.
- [ ] Add a task-local self-test proving profile-state mismatch, stale destination, already-running Resolve, `TargetProcessId`, and pre-launch timeout/exit leave no authoritative readiness; valid ready/started/completion records round-trip and bind the exact identities.

### 2. Retry O0 preflight

- [ ] Re-run profile transaction `self-test`, AST parse, `git diff --check`, and original installed-plugin hash check.
- [ ] Verify the previous journal is `restored`, its original backup is absent, retained first-attempt C1 profile remains outside canonical, no matching process runs, and current user-approved B0 matches 53 files/20 directories/8,880,285 bytes/`F8929578…`.
- [ ] Allocate a new unique retry journal path and use it consistently for every retry transaction action; do not remove/overwrite the previous journal or retained profile.
- [ ] Transactionally prepare a fresh cold canonical-absent state and verify the new immutable backup exactly matches B0. Never reconstruct the superseded 51-file proof or inspect/delete the legitimate additions.

### 3. Handshaked C1 -> W1 -> C2

- [x] Start C1 sampler with unique readiness token and expected profile `Absent`; re-read exact token, verify same live sampler PID/start time inside deadline, completion absent, and Resolve absent before telling the user to launch.
- [x] User launches, opens the intended local project, and interacts until atomic completion parses and matches token/run/sampler/target PID; only then closes normally and reports binary stall/time.
- [x] Require valid project pointer, shortcut, cadence, full sampling, and C1 stall. C1R reproduced the stall and completed sampling, but the clean log offset contained a transient network-project pointer before the intended local pointer, so the run was invalid and the sequence stopped.
- [x] Cancel W1/C2 after invalid C1R; do not commit C1 identity or infer a cold/warm effect.
- [x] Retain the generated profile transactionally, restore exact B0, and classify the strict retry inconclusive/not-positive with no product change.

### 4. Retry review and approval

- [x] Reviewer Orca Worker approved the coordination amendment and later audited the implemented handshake as `SAFE TO PREPARE RETRY` before being closed by the user.
- [x] User declined creation of a replacement reviewer after approving current canonical B0; B0 review remains in the main session and the developer Worker is not substituted as reviewer.
- [x] Present the reviewed retry summary and obtain fresh user implementation approval before modifying the sampler or moving the profile again.
