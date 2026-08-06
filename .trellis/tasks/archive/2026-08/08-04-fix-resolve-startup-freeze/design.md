# Resolve Startup Freeze Round 3 Design

## Completed evidence

Round 1 showed that the stall can occur before any BrowserWindow exists; its lazy-window candidate was reverted. Round 2 observed a strict local-project P0 stall followed immediately by a strict original-plugin C0 with no stall during approximately two minutes of interaction. Because C0 failed the predeclared reproduction gate, no native-handshake artifact was built or installed. Details remain in `research/root-cause-report.md`, `research/round2-p0.md`, and `research/20260805-112157-C0/observation.md`.

Those rounds are evidence only. Round 3 makes no product-source or ProgramData-plugin change.

## Active question and boundary

The P0-positive/C0-negative transition is consistent with, but does not prove, cold/warm state in Electron's user-data directory. Round 3 changes only whether the exact canonical profile path exists before Clackly launches:

```text
O0: inventory/hash original profile; atomically retain it outside canonical path
C1: original plugin + absent canonical profile -> Electron creates fresh profile
W1: original plugin + exact C1 profile       -> immediate warm reuse
C2: original plugin + absent canonical profile -> second independent fresh profile
R0: atomically restore and verify exact original profile
```

C1-W1-C2 is deliberately the smallest order-controlled test. A positive result requires a stall in both cold arms and no stall in the intervening exact warm reuse. It identifies profile state as a coarse boundary only; it does not identify a cache, GPU, storage, network, or Chromium subcomponent and does not authorize a fix.

## Profile ownership and safety contract

Authorized canonical path:

`C:\Users\Administrator\AppData\Roaming\Clackly Workflow Plugin`

The original is renamed atomically to a unique sibling backup on the same volume, outside the canonical directory. Normalize all paths; reject equality, containment, a pre-existing destination, or any relevant running process. Prove the same volume by volume identity. Validate the canonical root, backup/test parent, and every existing ancestor by inspecting attributes/handles before traversal; reject unexpected reparse resolution.

Profile traversal is queue-based and no-follow. Inspect each entry's attributes first; if any file or directory is a `ReparsePoint`, fail without opening, hashing, or descending into it. Fail closed on unreadable or changing entries by comparing file identity, size, and timestamp before/after hashing.

The deterministic tree digest is SHA-256 over entries sorted by normalized relative path using ordinal comparison. Each entry contributes one typed record: UInt32 little-endian UTF-8 path-byte length, that many normalized relative-path bytes, one-byte `F`/`D` type, signed Int64 little-endian size (`0` for a directory), UInt32 little-endian hash-byte length, then the 32-byte per-file SHA-256 (`0` hash bytes for a directory). Directories are records, so empty directories are covered. Per-entry paths/hashes remain in memory only; persisted evidence contains the root digest, file/directory counts, and total bytes. Error output is sanitized so it cannot disclose internal profile names.

The original backup is immutable for the experiment. Test-created profiles are moved atomically to separate unique sibling evidence paths when they must vacate the canonical path. They are never confused with the original backup and are not deleted in this task.

Before O0, allocate every unique path and create a write-ahead task-state record containing canonical/all allocated paths, directory and volume identities, original aggregate digest/counts, current phase, and a pending operation `{source,target,expectedIdentity}` or null. State writes use a temp file in the same directory with write-through plus durable flush, followed by atomic replace (or initial absent-destination rename), then durable read-back/parse verification. If any durable state operation fails, perform no profile move.

Before every live directory rename, durably persist the pending operation; execute exactly one same-volume rename-only primitive (`Directory.Move`) with an absent destination; verify source absence, destination presence, volume/directory identity and, when available, aggregate digest; then durably commit the new phase and clear pending. Copy/delete and cross-volume fallbacks are prohibited. Verify the original digest immediately after original-to-backup and backup-to-canonical.

Recovery reconciles each pending operation idempotently: source exists/target absent means the rename was not applied; source absent/target exists with expected identity means it was applied; both exist, neither exists, or identity mismatch means stop without mutation. A missing/corrupt journal also means no move and user escalation. Recovery always prioritizes the known immutable original-backup path and never infers safety from a directory name alone.

Before O0, run the exact journal/rename/recovery routine against unique task-created temporary fixtures, simulating interruption at original-to-backup, C1/W1-to-retained, C2-to-retained, and backup-to-canonical boundaries. O0 is forbidden unless every case restores deterministically.

## Equal run contract

All C1/W1/C2 runs use:

- restored original uninstrumented ProgramData plugin and zero repository product diff;
- the sole project pointer `(Untitled Project 1)` / `Local Database : Local`;
- normal automatic Clackly startup and successful shortcut registration;
- the same manual launch/open steps and at least 120 seconds of continuous post-pointer interaction;
- one clean Resolve log offset;
- the same external responsiveness sampler (100ms requested, actual cadence reported) and separate low-frequency CIM/process metadata collection;
- the user's binary observation of whether all Resolve controls became unclickable.

Any project-pointer drift, process contamination, shortcut failure, missing Electron profile creation, sampler mismatch, or user-step drift invalidates the run. Do not relax the project rule or substitute timing-only improvement.

The user performs every Resolve launch, project open, continuous interaction period, and normal close. Process tooling is observation-only. If Resolve or a matching Clackly/Electron process remains, do not move a profile and never call `Stop-Process`; ask the user to close it. If it cannot close normally, keep the immutable backup untouched, report the blocker, and request separate authority before termination.

After C1 closes and before W1 launches, tooling must not recursively enumerate, hash, inventory, copy, move, or open the generated profile. Exact reuse is established only by its unchanged canonical path, stable directory/volume file identity, and the committed journal phase. Its recursive digest is computed only after W1 completes, or after causality has already been abandoned for safe recovery.

## Restoration state machine

Only Resolve-closed boundaries may mutate profile paths.

1. Ask the user to close Resolve normally and observe that Resolve and matching Clackly/Electron processes are absent.
2. Record and durably commit original aggregate inventory/digest and pending move, then rename original -> immutable backup transactionally.
3. C1 creates canonical test profile. After the user closes C1, durably commit `C1-complete` plus canonical directory/volume identity without recursive profile reads; W1 reuses it untouched.
4. After W1 closes, rename the generated profile -> retained test-profile-1 path.
5. C2 creates a second canonical test profile.
6. After C2 closes, rename it -> retained test-profile-2 path.
7. Rename immutable original backup -> canonical and recompute the digest/counts.

On error or interruption, stop launching, ask the user to close relevant processes normally, reconcile the pending operation, move only an identity-verified task-created canonical profile aside, and perform step 7 transactionally. Never overwrite a canonical path whose identity is ambiguous. If safe atomic restoration cannot be proven, or a profile-owning process remains, stop and report the exact top-level paths rather than attempting destructive recovery.

After successful restore, verify the canonical profile is real/non-reparse, matches the original digest/counts, and the unique original-backup name is absent because the same directory was renamed back. Reconfirm original ProgramData plugin state and clean processes.

## Evidence classification

- Positive: C1 stalled, W1 did not stall, C2 stalled; all strict gates valid.
- Negative for the hypothesis: all three runs complete validly but W1 stalls at all.
- Inconclusive/not-positive: C1 does not stall and the sequence stops early, only one cold run stalls, any run is invalid, or observation/sampler/project conditions drift.

All three classifications restore the original profile. Positive evidence returns to planning for a separate minimal fix experiment; negative or inconclusive evidence ships no change.

## Active critical constraint

"If both strict cold-profile runs do not reproduce the whole-GUI stall, or the exact warm-profile reuse does not remove it, restore the original profile and ship no speculative production change."

## Strict retry coordination amendment

The first C1 attempt was invalid because shell-cell execution was mistaken for sampler readiness while Resolve was already running. The retry keeps the complete profile transaction and C1-W1-C2 design unchanged and adds one explicit file handshake to `capture-u0.ps1`.

Each run receives unique `ready`, `started`, `failed`, and completion paths plus a random token. All final destinations must be absent before readiness publication. Strict mode rejects any duration/cadence other than 300 seconds, 100ms requested responsiveness, and 2000ms CIM, and binds those values into ready/started/completion. The sampler performs its existing plugin/log/run-directory preflight and observes Resolve absent. It inspects only the canonical profile path's top-level Win32 attributes: `Absent` for C1/C2 means no entry of any type; `Present` for W1 means a real non-reparse directory whose volume/file identity equals the committed C1 identity. It then writes readiness JSON to a same-directory temporary file and atomically renames it to the absent final readiness path. The JSON contains schema, run label, token, expected profile state/identity, settings, run directory, sampler PID/start time, readiness timestamp, and wait deadline.

The readiness file is authoritative only while that exact sampler process is live and inside the recorded wait window. Every pre-launch timeout/error/exit after publication atomically consumes `ready` into `failed`; the failure record is never launch authority. When the sampler acquires a newly launched Resolve process, it first atomically consumes/revokes `ready`, then atomically publishes fully bound `started` JSON containing target Resolve PID and process start time. A crash between these steps leaves no launch authority and invalidates/restores. Readiness mode rejects `TargetProcessId` before publication and can enter only the wait-for-a-new-Resolve branch.

Immediately before telling the user to launch, the lead re-reads the exact token, confirms recorded sampler PID and process start time still identify a live sampler, verifies current time is before the wait deadline, verifies completion absent, and re-observes Resolve absent. A stale/existing destination, token/liveness mismatch, sampler exit, profile-state mismatch, already-running Resolve, or `TargetProcessId` produces no valid readiness. Terminal cell status and prose confirmation are not substitutes for this live record.

Strict mode runs in a dedicated `powershell.exe -File capture-u0.ps1` process so sampler PID lifetime equals script lifetime. Immediately after readiness publication, re-observe Resolve absent. Any acquired target must be Resolve, start at/after readiness, and be acquired no later than the deadline. During every 100ms lookup, PID, name, and start time must continue matching; exit or identity drift prevents completion publication. Handshake output is restricted to a normalized non-reparse descendant of task research.

After readiness is relayed, the user manually launches Resolve, opens only the predeclared local project, and continuously interacts. The sampler writes every sample, metadata, cadence, log delta, and trace output first. Only after all output operations succeed does it write a completion JSON to a same-directory temporary file and atomically rename it to the absent `run.json`. Completion contains schema, `status=complete`, run label, readiness token, sampler PID, target Resolve PID/start time, sample start/end, and wait/readiness timing. The lead parses it and matches token/run/sampler identity plus target PID/start time to the same handshake before asking the user to close. A partial, unparsable, stale, or mismatched file is invalid and triggers normal close plus restoration.

The previous transaction journal remains at phase `restored` and is never removed or overwritten. Its 51-file digest is historical restoration evidence, not the new source of truth, because a later normal Resolve launch legitimately updated canonical user data. Before retry O0, require clean processes, absent previous original-backup path, retained first-attempt profile, and the user-approved current B0 aggregate proof: 53 files, 20 directories, 8,880,285 bytes, SHA-256 `F8929578946217BA6BCFDF977DF9F50DA39F70B0241506EF4BFD3A86DFFCD64C`. The retry supplies a new unique journal path to every `profile-experiment.py` action; its O0 digest becomes the immutable restoration proof. No historical tree is reconstructed, and no existing experiment artifact is deleted or reused as canonical.
