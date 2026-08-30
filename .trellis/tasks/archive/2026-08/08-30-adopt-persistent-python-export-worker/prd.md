# Adopt persistent Python export worker

## Goal

Adopt the measured persistent managed-Python worker as the production Export-to-AE execution path for the three current product actions—mixed, audio-only, and video-only—retaining its approximately 112 ms steady default latency while preserving output, failure isolation, package integrity, and the already accepted persistent PowerShell After Effects process helper.

## Background

- The archived A/B task measured four steady default B samples at a 112.440 ms command median and 50.647 ms persistent-Python median, compared with the corrected A medians of 464.559 ms and approximately 415 ms.
- The B arm passed the <=200 ms total, >=250 ms improvement, and <=35% Python-ratio gates. An installed real-worker harness also passed no-retry timeout replacement, real `ResolveAdapterError` retirement, immediate later-command replacement, cleanup, and orphan checks.
- The experiment restored clean A by design. This task is the separate product-adoption decision authorized by the user on 2026-08-30.
- The existing PowerShell helper and the candidate Python worker share supervision concepts but have different executables, protocols, payloads, owners, timeouts, validation, environments, and failure domains.
- The current product model is three media actions with one shared range rule: each action uses the earliest eligible Blue duration marker when present and otherwise falls back to the playhead/current automatic selection. Cyan markers are retired and ignored.
- Three internal Command ids remain from the pre-Clackly interaction model (`exportCurrentToAfterEffects`, `exportBlueRangeToAfterEffects`, and `exportCyanRangeToAfterEffects`). They are no longer product actions and must be removed after one-time persisted-binding migration.

## Requirements

- Make the persistent Python worker the Windows production path only for the three current Export-to-AE business commands and the fixed Resolve2AE entry; keep Runtime Probe, readiness, other script Capabilities, and non-Windows execution on the one-shot Runtime launcher.
- Keep only mixed, audio-only, and video-only Command ids. Remove the legacy current-only, explicit Blue-range, and Cyan-range Command registrations and Python policy entries.
- Migrate persisted legacy bindings once: exact historical shipped-default shapes rewrite directly to `DEFAULT_BINDINGS`; customized legacy roots are backed up, then migrated with bounded collision warnings. Map current-only to mixed, explicit Blue-range video to video-only, and the retired Cyan audio action to audio-only. After load, no binding may retain a legacy target or action id.
- Preserve the single current range contract for all three actions: an eligible Blue duration marker selects the range; otherwise automatic playhead selection applies. Cyan markers remain ignored and cannot select a range or media policy.
- Prewarm the managed interpreter asynchronously after host readiness without connecting to Resolve or delaying Palette, IPC, hotkey, Workflow initialization, or Resolve readiness.
- Reacquire Resolve, current project, and current timeline for every command; never retain config, project/timeline objects, clip facts, JSX, results, or logs between commands.
- Preserve one in-flight request with bounded FIFO, the 10-second parent timeout, no retry, close-before-settle, later-command-only replacement, health-key replacement, strict protocol/output bounds, cleanup, and idempotent host disposal.
- Preserve exact public result and JSX behavior for the three current Export-to-AE policies and keep After Effects launch ownership in the host.
- Keep the PowerShell AE process helper and Python worker as separate OS processes and separate domain owners.
- Keep their stateful supervisors separate and share only narrow pure helpers whose behavior must be identical, particularly Runtime native-crash classification and optionally stateless bounded UTF-8 line framing. Do not refactor the qualified PowerShell probe into a shared supervisor for this adoption.
- Stage, package, verify, install, and perform local Resolve/AE acceptance before archiving. Record source/package/installed identity and no-orphan evidence.
- Update backend specs to make the adopted persistent Export-to-AE runtime contract executable and testable.

## Acceptance Criteria

- [ ] Production Export-to-AE automatically uses one prewarmed persistent managed-Python worker, while Runtime Probe and unrelated scripts remain one-shot.
- [ ] Steady local default export remains <=200 ms and materially faster than the 464.559 ms A baseline; no first-use regression attributable to failed prewarm.
- [ ] Mixed, audio-only, and video-only retain byte-identical public results and JSX for playhead and Blue-range selection, and local AE import succeeds without observed layer/timing/transform regression.
- [ ] Legacy Command ids are absent from the registry and Python policy map; old persisted bindings migrate to the three supported actions without retaining Cyan/current/range-only ids.
- [ ] Timeout, protocol failure, native crash, Resolve connection failure, and health-key change never retry the failed command; one later command creates one replacement and succeeds.
- [ ] Repeated requests remain bounded, host shutdown leaves no Python or PowerShell orphan, and packaged Runtime inventory/identity checks pass.
- [ ] PowerShell and Python remain separate processes/modules; only narrow stateless helpers are shared, and the qualified PowerShell state machine is not behaviorally changed.
- [ ] Both Electron hosts own non-blocking prewarm and disposal without changing existing Palette or Workflow lifecycle behavior.

## Out of Scope

- Combining PowerShell and Python into one executable or making either child own the other.
- Caching AE running state, Resolve/project/timeline objects, config, JSX, or command results.
- Retrying a failed export, changing the 10-second timeout, changing Resolve2AE selection/range/media semantics, or optimizing track scans/OTIO/Python feature logic.
- General-purpose process pooling for arbitrary script Capabilities.
- Restoring Cyan marker behavior or retaining explicit current-only/Blue-range/Cyan-range product commands.

## Decisions

- On 2026-08-30 the user accepted separate PowerShell and Python services with narrow pure-function reuse only. No shared stateful supervisor or combined process is in scope.
- On 2026-08-30 the user selected the same persistent-Python behavior in both Workflow Integration and standalone hosts so the shared Core contract does not diverge.
- The earlier A/B decisions remain product requirements: automatic no-Resolve prewarm, bounded FIFO for overlapping commands, 10-second parent timeout, no retry, per-command Resolve/project/timeline reacquisition, and later-command-only replacement.
- The first controlled failure after a degraded Resolve connection remains acceptable as defense in depth. A normal Resolve quit closes the Workflow host and worker, so quit/reopen is not treated as a surviving-worker restart case.
- Visual AE composition inspection was deferred during the experiment and is required before permanent adoption is accepted.
- On 2026-08-30 the user confirmed the product model is exactly three media actions with optional Blue-range selection. The old Cyan range represented audio in the legacy interaction model, is now abandoned, and must not survive as a product command or marker behavior.
