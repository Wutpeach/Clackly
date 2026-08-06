# Fix Resolve Startup Freeze

## Goal

Identify and ultimately remove the intermittent whole-Resolve GUI stall that can occur after Clackly starts with a Resolve project, without disabling Clackly automatic startup or risking the user's Resolve projects, Clackly settings, or Electron profile.

## Confirmed facts

- The target symptom is a whole-Resolve GUI stall: window, menus, and controls become temporarily unclickable and later recover. Timeline-only stutter is out of scope.
- Clackly automatic startup is expected and must remain enabled.
- The symptom predates Export to After Effects, the saved AE path is valid, and traced A1 measured the saved-path check at approximately 2ms. AE discovery is not the historical cause.
- Round 1 reproduced the stall in uninstrumented U0 and traced eager A1. Lazy-window B1 also stalled before any BrowserWindow existed, so eager palette creation was not required for that observation. B1 had project-pointer drift; the candidate was reverted and not shipped.
- Round 2 P0 used only local `(Untitled Project 1)` and reproduced around 30 seconds after project open. The immediately following strict C0 used the restored original plugin and the same sole local project pointer, but continuous interaction for approximately two minutes produced no post-project stall.
- Because strict C0 did not reproduce, the approved native-initializer A1/H1 experiment was not built or installed. No speculative native-handshake change may ship from Round 2.
- The original ProgramData plugin remains installed, the repository has no product-source diff, and installed `workflow-plugin/main.js` SHA-256 is `438F9A2D31FF26B7C9DA46CC5688D054AABE2A27284930BF979C1B5428D92F67`.
- The likely Electron user-data directory is `C:\Users\Administrator\AppData\Roaming\Clackly Workflow Plugin`. With Resolve and matching Clackly processes closed, it was a real non-reparse directory of approximately 8.4 MB.
- On 2026-08-05 the user explicitly authorized a reversible cold/warm experiment on that exact directory. `%APPDATA%\Clackly`, Resolve project/database content, and all other user data remain outside the authorization.
- The first Round-3 C1 attempt produced a direct cold-profile observation (whole-GUI stall approximately 4 seconds after project open for 2–3 seconds), but the sampler rejected the run because Resolve was already running before sampler readiness. The generated profile was retained, the exact original profile was restored, and the result was classified inconclusive/not-positive.
- On 2026-08-05 the user approved executing one strict retry with an explicit sampler-readiness handshake against the current B0 baseline.
- After the restored profile was launched once more, Resolve legitimately changed its user-data tree from the historical 51-file proof to 53 files, 20 directories, 8,880,285 bytes, SHA-256 `F8929578946217BA6BCFDF977DF9F50DA39F70B0241506EF4BFD3A86DFFCD64C`. With Resolve then closed, the user explicitly approved this current canonical tree as retry baseline B0. No attempt may be made to delete the new entries or reconstruct the historical tree.
- Strict retry C1R completed the exact 300s/100ms/2000ms handshake and reproduced a user-observed whole-GUI stall approximately 9 seconds after the local project pointer for about 4 seconds; the sampler recorded a matching 4,538.968ms cadence gap. The run was nevertheless invalid because the clean log offset contained a transient `(Untitled Project)` pointer from a network project library before the intended local pointer. W1/C2 were cancelled, the generated profile was retained, and exact B0 was restored and verified.

## Requirements

1. Keep the restored original uninstrumented repository source and installed ProgramData plugin identical for every Round-3 run; do not build or install a product candidate.
2. The user performs every Resolve launch, project open, interaction period, and normal close. Tooling only observes processes: if Resolve or any matching Resolve-owned Clackly/Electron process remains, do not move a profile and do not call `Stop-Process`; ask the user to close it normally.
3. Before any profile move, validate the normalized canonical profile and all preallocated backup/test paths, prove the same volume by volume identity, validate every existing ancestor without following reparse points, and reject any reparse entry.
4. Before O0, create and dry-run an idempotent recovery routine on task-created temporary fixtures. Persist a write-ahead state record with canonical/all allocated paths, volume identity, original digest/counts, current phase, and any pending rename. Every state update must use a same-directory atomic temp-write/replace, durable flush, and read-back verification; if that fails, do not move the profile.
5. Compute a deterministic tree digest, file count, and byte count for the original profile with an exact no-follow algorithm. Keep per-entry paths and hashes in memory only and sanitize errors/research output.
6. Atomically rename the original profile to a unique same-volume backup outside the canonical profile path. Never delete or overwrite that backup, and retain it until final restoration is verified.
7. Before every rename, durably record the one pending source/target/expected identity; perform exactly one rename-only same-volume directory move with an absent destination; verify source/destination and identity; then durably commit the new phase and clear pending. Copy/delete and cross-volume fallback are prohibited.
8. Recovery is fail-closed and idempotent: source exists/target absent means not applied; source absent/target exists with expected identity means applied; both, neither, or identity mismatch means no mutation and a user-visible blocker. A missing/corrupt journal also permits no move and requires user direction, with the known immutable original-backup path taking priority.
9. Do not touch `%APPDATA%\Clackly`, Resolve project/database files, ProgramData plugin files, or unrelated user state.
10. Use one original-plugin, same-project, same-steps sequence: fresh absent profile C1, immediate reuse of the exact C1-generated profile W1, then a second fresh absent profile C2.
11. Between C1 close and W1 launch, do not recursively enumerate, hash, inventory, copy, move, or open the generated profile. Confirm it only by the unchanged canonical path, directory/volume file identity, and committed journal phase.
12. For C2, after W1 is complete and the user has closed Resolve normally, hash the test profile, then atomically move it to a unique same-volume retained experiment path; do not delete it.
13. Require exactly the predeclared local `(Untitled Project 1)` / `Local Database : Local` project pointer in every run. A network, different, missing, or manually switched pointer invalidates the run.
14. From the project pointer, continuously interact with Resolve for at least 120 seconds while an external 100ms-requested responsiveness sampler and independent low-frequency process metadata collector run. Record actual cadence, plugin startup, and the user's binary whole-GUI observation.
15. Treat cold/warm profile state as causal evidence only if C1 and C2 both reproduce the whole-GUI stall and W1 does not. Duration-only reduction, a single positive cold run, project drift, shortcut failure, or sampler mismatch is inconclusive.
16. On any failure, interruption, invalid run, or completed sequence, ask the user to close relevant processes normally, move only an identity-verified experiment-created canonical profile aside without deletion, atomically restore the original backup, and verify its tree digest/counts. If a profile-owning process cannot be closed normally, leave the immutable backup untouched and request separate termination authority.
17. Retain only aggregate profile evidence in task research. Do not inspect or copy cookies, local storage, cache payloads, or other profile contents beyond metadata and hashes required for restoration verification. Disclose top-level retained profile paths, but never internal relative paths or individual hashes.
18. After restoration, verify the canonical profile is real/non-reparse, the original backup no longer occupies its backup name, Resolve/Clackly processes are absent, and the installed ProgramData plugin still matches the original hash/inventory.
19. For the retry, reuse the reviewed profile transaction tool with a new unique journal path. Require the previous journal phase `restored`, its original-backup path absent, the previously generated test profile retained untouched, and current canonical B0 equal to the user-approved 53-file `F8929578…` proof. The historical 51-file proof is evidence only and must not be reconstructed.
20. Add one task-local sampler handshake: strict mode requires exactly 300 seconds, 100ms requested responsiveness cadence, and 2000ms CIM cadence. After all sampler preflight checks pass, Resolve is observed absent, and the expected top-level profile state is verified, atomically create a unique readiness JSON binding those settings plus run label, token, expected profile state/identity, run directory, sampler PID/start time, readiness time, and wait deadline.
21. Treat readiness as a live state, not a durable permission. Require every final ready/started/failed/completion destination absent before publication. On every pre-launch timeout/exit, atomically consume authoritative readiness into a non-authoritative failure record. When the newly launched Resolve target is acquired, first atomically consume/revoke readiness, then atomically publish a started record bound to the target PID and process start time; a crash between those steps leaves no launch authority and invalidates the run.
22. Tell the user to launch Resolve only after the lead has re-read that exact readiness token, verified the same sampler PID/start time is live and inside its wait window, verified `run.json` absent, and re-observed Resolve absent. If Resolve is already running or sampler liveness cannot be proven, no authoritative readiness may remain and the run must not start.
23. In readiness mode, reject any supplied `TargetProcessId` and acquire the target only through the post-readiness wait-for-a-new-Resolve branch.
24. Use expected profile state `Absent` for C1/C2 and `Present` for W1. Inspect the canonical path attribute-first without recursion: absent means no entry of any type; present means a real non-reparse directory whose volume/file identity equals committed C1 identity. W1 must still perform no recursive profile read before launch.
25. Once a run begins, the user keeps Resolve open, on the sole local project, and continuously interactive until the lead confirms sampler completion. Publish `run.json` only after every sample/output operation completes, using same-directory temp plus absent-destination atomic rename. Bind it to schema, `status=complete`, run label, readiness token, sampler PID, target Resolve PID/start time, and timing.
26. Ask the user to close only after the lead parses the complete record and matches token/run/sampler identity plus target Resolve PID/start time. Any missing/stale/mismatched readiness, sampler exit, `TargetProcessId` bypass, launch before readiness, incomplete/mismatched completion, or early close invalidates the run and triggers mandatory original-profile restoration.

## Acceptance criteria

- [ ] Preflight proves clean processes, original product/plugin state, canonical profile safety, and an exact restorable original-profile digest.
- [ ] The original profile is held by one unique same-volume backup outside the canonical path for the full experiment and is never deleted or overwritten.
- [ ] Transaction-journal recovery passes interruption fixtures for every rename boundary before O0; every live rename is write-ahead, identity-verified, and recoverable without inference from names.
- [ ] C1 begins with no canonical profile and runs only the expected local project for at least 120 seconds of post-pointer interaction.
- [ ] W1 reuses the exact profile generated by C1 with no intervening profile mutation and otherwise repeats the same run conditions.
- [ ] C2 again begins with no canonical profile after the C1/W1 profile is safely retained elsewhere and otherwise repeats the same run conditions.
- [ ] A cold/warm result is called positive only if both C1 and C2 reproduce the whole-GUI stall and W1 does not; every other outcome is explicitly inconclusive or negative.
- [ ] The exact original profile is atomically restored and its deterministic tree digest, file count, and byte count match the pre-move values.
- [ ] `%APPDATA%\Clackly`, Resolve project/database content, ProgramData plugin content, and repository product source remain unchanged.
- [ ] Experiment-created profiles remain retained outside the canonical path until the user separately authorizes their deletion.
- [ ] No product fix is implemented or shipped from Round 3; a positive result requires a newly reviewed causal-fix plan and fresh user approval.
- [ ] Retry C1/W1/C2 each has a unique atomically created readiness record whose token is verified before the user is told to launch Resolve.
- [ ] The sampler's expected profile-state check is `Absent`, `Present`, `Absent` for C1, W1, C2 respectively, without recursively reading the W1 profile.
- [ ] No retry run is counted unless sampling begins before Resolve launch and completes before the user closes Resolve.
- [ ] Pre-launch timeout/exit or already-running Resolve leaves no authoritative readiness; target acquisition consumes readiness into a non-authoritative started record.
- [ ] Readiness mode rejects `TargetProcessId`, and atomic completion matches the exact token/run/sampler PID/target Resolve PID before close.
- [ ] Every handshake record binds exact 300s/100ms/2000ms settings; ready/started/completion with different settings is invalid.
- [ ] Cold absence rejects files and reparse entries; warm presence requires the exact committed C1 directory identity without recursive reads.
- [ ] Retry restoration returns exactly to B0 (53 files, 20 directories, 8,880,285 bytes, `F8929578…`), not the superseded historical 51-file proof.

## Out of scope

- Fixing generic Resolve timeline stutter.
- Reintroducing lazy palette BrowserWindow creation.
- Building or installing the Round-2 native-handshake candidate after its failed strict C0 gate.
- Changing Export to After Effects behavior or AE path semantics.
- Disabling Clackly automatic startup.
- Modifying `%APPDATA%\Clackly`, Resolve projects/databases, or ProgramData plugin content.
- Inspecting profile payload contents, permanently resetting the original profile, or deleting any profile directory.
- Automatically terminating Resolve or a matching Clackly/Electron process.
- Adding permanent telemetry, dependencies, services, generic lifecycle abstractions, or fixed-time startup delays.
- Treating terminal/tool “running” status alone as sampler readiness; only the explicit run-token file is authoritative.

## Key decisions

- Round 3 is a reversible diagnostic experiment, not implementation of a product fix.
- Binary whole-GUI stall presence is the materiality rule; timing differences alone are insufficient.
- A strict C1-W1-C2 result controls both profile state and run order: both cold runs must stall and the intervening exact warm reuse must not.
- The user's original profile has priority over completing evidence. Any ambiguity triggers restoration and stop.
- The retry changes coordination only, not the causal boundary, profile contents, materiality rule, or restoration contract.
- B0 is the current user-owned state after the latest normal Resolve close. Preserving it exactly is safer than attempting to reverse legitimate application writes whose internal names/content remain uninspected.
- The active gate is: "If both strict cold-profile runs do not reproduce the whole-GUI stall, or the exact warm-profile reuse does not remove it, restore the original profile and ship no speculative production change."
