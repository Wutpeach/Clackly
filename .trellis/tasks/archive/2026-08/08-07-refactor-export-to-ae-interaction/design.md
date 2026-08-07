# Export to AE Interaction and Async Probe Design

## Design Summary

Keep the existing one-Capability architecture and split the transient invocation into two independent facts:

```text
Resolve timeline state                     Clackly mouse interaction
Blue duration marker -> batch range        left -> mixed audio/video
no Blue marker -> playhead single          Ctrl+left -> audio only
                                             Ctrl+Shift+left -> video only
                     \                    /
                      -> target clip set -> existing OTIO/JSX/AE pipeline
```

The visible catalog contains one primary Command. Binding-only Commands remain executable but are marked `internal`, allowing the generic Interaction layer and help projection to use them without presenting extra cards.

Separately, both Windows PowerShell probes move from `execFileSync` to bounded asynchronous `execFile` calls. Startup discovery is launched without gating palette/IPC/hotkey readiness; export-time running detection is awaited inside the already asynchronous AE launcher.

## Scope and Ownership

| Concern | Owner |
|---|---|
| Visible/internal Command identity and descriptions | Command manifests/registry |
| Presentation filtering | Generic renderer presentation model |
| Mouse facts to action Command | Interaction Binding |
| Command id to target/media policy | Thin `scripts/resolve2ae_export.py` wrapper |
| Blue/playhead scope and audio/video filtering | `resolve2ae_core/export.py` selection layer |
| OTIO, formulas, JSX, AE plan | Existing shared Resolve2AE core |
| AE configuration persistence | Existing ConfigManager |
| Windows path discovery | `capability/afterEffectsPath.js` |
| AE process-state/desktop launch | `capability/afterEffectsLaunch.js` |
| Startup ordering | Both Electron host composition roots |

Renderer and Command Engine remain unaware of AE modes, marker colors, Python, or Resolve APIs.

## Command Presentation Contract

Extend normalized Command metadata with a generic presentation value:

```js
{
  id,
  name,
  description,
  category,
  icon,
  keywords,
  capability,
  presentation: "visible" | "internal" // default: "visible"
}
```

Contracts:

- `getCommands()` and `getCommandById()` MUST include both visible and internal Commands so cloning, Interaction actions, help descriptions, and execution use one authoritative registry.
- `searchCommands()` MUST exclude `internal` Commands for every query, including the empty query.
- One generic `isCommandPresentable()` predicate owns the visible/internal test. `createPresentationCatalog()` and Settings Interaction Help target selection both use it.
- Settings still receives the full raw Command list so a visible target can resolve an internal action's description, but an internal target/self-binding cannot create a Settings heading or help card.
- Lifecycle joins and execution gates remain capability-based and generic.
- Invalid presentation values fail manifest normalization.

Primary/new action Commands:

| Command | Presentation | Target policy | Media policy |
|---|---|---|---|
| `timeline.exportToAfterEffects` | visible | auto Blue/playhead | mixed |
| `timeline.exportAudioToAfterEffects` | internal | auto Blue/playhead | audio |
| `timeline.exportVideoToAfterEffects` | internal | auto Blue/playhead | video |

All three previously shipped action ids remain mandatory `internal` compatibility aliases for this release. They are never returned by search or any presentation target surface:

- current-clip alias -> forced playhead + mixed;
- Blue-range alias -> required Blue range + video;
- former Cyan-range alias -> required Blue range + mixed.

The former Cyan alias preserves binding executability, not Cyan marker semantics. Alias removal requires a later documented binding-schema migration; it is not allowed in this release.

All internal aliases receive rewritten names, descriptions, and keywords that describe their actual non-Cyan policy. In particular, the legacy Cyan id describes a required Blue range with mixed audio/video and contains no user-facing `Cyan` keyword/text; only the stable opaque id retains that historical token.

## Interaction Binding Contract

Default bindings for target `timeline.exportToAfterEffects` become:

| Trigger | Action Command |
|---|---|
| left click | `timeline.exportToAfterEffects` |
| Ctrl + left click | `timeline.exportAudioToAfterEffects` |
| Ctrl + Shift + left click | `timeline.exportVideoToAfterEffects` |

Remove Shift-only and every auxiliary self-binding. Exact modifier matching remains owned by the existing trigger normalizer/matcher. Keyboard-generated activation keeps the direct primary Command route and therefore mixed behavior.

BindingStorage recognizes both shipped defaults:

1. marker-only default;
2. current marker plus seven AE binding records.

Both fingerprints are compared as canonical normalized structures: normalize every trigger/action, sort entries by binding id, and compare semantic fields rather than raw `JSON.stringify` insertion order. Shuffled-key copies still take the exact-default path; any one-field semantic change does not. Both exact fingerprints become marker plus the three new primary-target bindings. Customized roots use a structural migration:

- write one recoverable sibling backup before changing the active file;
- retarget every legacy auxiliary target id to `timeline.exportToAfterEffects` while retaining binding id, trigger, and action;
- resolve every target/trigger collision with a total order: an originally primary-target binding wins regardless of file order; if no original primary exists, the lexically lowest binding id wins;
- when loser and winner have the same action, drop the redundant loser without a behavior warning;
- when actions differ, retain the backup and emit exactly one warning containing the kept/skipped binding ids and actions;
- never silently replace the entire customized root with defaults.

Compatibility aliases keep every preserved action id executable. BindingStorage accepts an injected `onMigrationWarning` callback for tests/hosts and defaults to a developer-visible `console.warn` sink; hosts do not add AE-specific handling. Tests own backup naming, write failure, original-primary/lexical precedence, exact diagnostics, idempotence, and once-only warning delivery after a successful migration write.

## Python Invocation Contract

The wrapper maps every stable Command id to one explicit triple:

```python
mode = "auto" | "audio-only" | "video-only" | "single" | "video-range" | "mixed-range"
target_policy = "auto" | "single" | "blue-range"
media_policy = "mixed" | "audio" | "video"
```

Only the wrapper knows Command ids. The core receives explicit policies:

```python
get_target_clips_logic(timeline, target_policy="auto", media_policy="mixed")
process_and_send(..., mode="auto", target_policy="auto", media_policy="mixed")
```

`get_target_clips_logic` is a combinatorial selection primitive and supports/tests the complete 3×3 target/media policy matrix. `process_and_send` is a Command execution primitive and accepts exactly the six command-backed triples in the table below; it validates the triple before Resolve access and rejects single+audio, single+video, and blue-range+audio because no Command owns those labels. This keeps selection orthogonal without inventing unused public modes.

The seven public result fields are additive and exact where a terminal result is public:

```python
{
    "ok": bool,
    "code": str,
    "mode": str,
    "target_policy": "auto" | "single" | "blue-range",
    "media_policy": "mixed" | "audio" | "video",
    "clip_count": int,
    "message": str,
}
```

Existing keys and meanings remain. `target_policy` and `media_policy` are the only additive keys. `mode` remains the stable action label:

| Action | `mode` | `target_policy` | `media_policy` |
|---|---|---|---|
| visible primary | `auto` | `auto` | `mixed` |
| new audio action | `audio-only` | `auto` | `audio` |
| new video action | `video-only` | `auto` | `video` |
| legacy current alias | `single` | `single` | `mixed` |
| legacy Blue alias | `video-range` | `blue-range` | `video` |
| legacy Cyan id alias | `mixed-range` | `blue-range` | `mixed` |

Layer contracts are deliberately different:

- Core controlled failure returns exactly the seven public fields.
- Core success returns the seven public fields plus the single reserved private `__clacklyDesktopLaunch` directive required by the existing desktop handoff.
- The thin wrapper returns Core success transport unchanged, but converts `ok: false` Core terminal results into the existing exception/Python script-error envelope.
- RuntimeManager strips the private launch directive after successful desktop launch and exposes exactly the seven public fields.
- Desktop launch, wrapper, Python, or RuntimeManager failures remain their existing typed error envelopes; they are not fabricated as seven-key success results.

Tests assert exact equality at each layer. Unknown Command ids, unsupported triples, or invalid policies fail before export.

## Target and Media Selection

### Target policy

- `auto`: scan only Blue duration markers, sort qualifying entries by numeric timeline frame ascending, and use the lowest frame as `batch`; absence falls back to `single` at the current timecode.
- `single`: ignore markers and use the playhead (compatibility alias only).
- `blue-range`: require a qualifying Blue duration marker and return the existing controlled missing-marker result (compatibility alias only).

Cyan is not scanned and cannot affect scope.

### Media policy

- `video`: collect enabled overlapping video items only. For single scope choose the greatest video track index. Carry `media_policy` through JSX generation and set `layer.audioEnabled = false` for every generated video layer, including linked/embedded audio.
- `audio`: collect enabled overlapping audio items only. For single scope choose the greatest audio track index independently.
- `mixed` batch: collect all overlapping video and audio, then use the existing linked-item de-duplication so audio already represented by selected video is not duplicated.
- `mixed` single: first choose the topmost video independently and the topmost audio independently; discard the audio item when it is linked to/represented by the chosen video; otherwise keep both. If only one media class exists, export that class.

Downstream code consumes the same target-clip record shape. Replace the current `content_type == "video"` OTIO gate with `has_video = any(record["track_type"] == "video" for record in target_clips)`; run the existing OTIO parse/property enrichment for video-only and mixed targets alike. `content_type` may remain a terminal/display projection, but it must not suppress video processing. No transform/OTIO/JSX branch is duplicated.

## Asynchronous PowerShell Contract

### Shared behavior

- Use Node's existing `child_process.execFile` API; add no dependency.
- Execute with `shell: false`, `windowsHide: true`, UTF-8 output, and a 5,000 ms timeout.
- Path discovery treats expected non-zero exit, timeout, missing process/key, and malformed candidate as a strategy miss and continues its fallback chain.
- Running-state detection distinguishes a successful non-match from an unknown timeout/error; unknown fails closed as specified below.
- Preserve injection seams so tests never invoke real PowerShell.
- Keep finite standard-directory filesystem inspection synchronous; only external PowerShell work is in scope.

### Path discovery

`initializeAfterEffectsPath()` becomes asynchronous. It still short-circuits a valid saved path before any subprocess. Running-process and registry strategies await asynchronous results in existing precedence order; standard directories remain the last fallback.

Each host starts a named initialization Promise during `app.whenReady()` and attaches its rejection handler immediately. Palette creation and IPC/hotkey registration happen without awaiting that Promise. Unexpected ConfigManager/storage failure is routed once to the existing host error-dialog/log surface; expected discovery misses resolve normally. No unobserved/background Promise is allowed.

The initializer snapshots whether `aePath` existed and its exact starting value. After any awaited subprocess and immediately before update/removal, it re-reads the current capability values:

- initially absent -> write if still absent. A concurrent Reset cannot be distinguished from unchanged absence by current ConfigManager and intentionally leaves auto-discovery enabled, so the discovered path may be written;
- initially stale -> write/remove only if the same stale value is still present;
- a new/different valid manual value -> return it without mutation;
- a reset that removed an initially stale value -> preserve the reset and do not repopulate it from the stale probe.

This compare-before-write rule applies to discovered replacement and stale-key removal within one host: Settings work that completes before the synchronous compare+write section is observed. The shared config file remains cross-process last-writer-wins because ConfigManager does not provide atomic CAS/locking; this task adds neither. The rule therefore improves same-host races without claiming cross-host atomicity, and it avoids a generation/tombstone solely for initially absent Reset.

Feature status already refreshes explicitly on palette load/show. If the palette is opened during first-run discovery, it may briefly show missing configuration; no renderer polling or AE-specific refresh channel is added.

### Running-state detection

`AfterEffectsLauncher.detectRunning()` becomes async and uses an injected `execFile`. PowerShell emits one structured JSON object with `processCount` and exactly one record per AfterFX process; every record contains either a non-empty path or an explicit access/error marker. The consumer verifies object shape and record count before deciding:

- any canonical path matching the configured executable -> `true`;
- if no match exists and any record is unresolved/null/inaccessible -> throw controlled `AFTER_EFFECTS_LAUNCH_FAILED` (unknown state);
- zero processes or complete all-valid nonmatches -> `false`;
- missing SystemRoot/PowerShell prerequisite, timeout, subprocess/decoding failure, inconsistent count, or malformed JSON/path -> controlled unknown failure.

For mixed valid/invalid records, a validated configured-path match takes precedence and returns `true`; without a match, any unresolved record takes precedence over `false`.

`execute()` already awaits `this.isRunning(executable)`, so upstream RuntimeManager/Capability contracts do not change. Unknown state is caught by existing cleanup, removes the temporary JSX, creates no bootstrap, performs zero spawn, and never retries. Only confirmed `false` may enter the cold branch.

## Error Handling

- Missing Blue for an explicit compatibility alias -> existing `missing-marker` terminal result.
- Auto mode without Blue -> playhead, not an error.
- No target clips for requested media -> existing controlled no-clips failure with a media-appropriate message where needed.
- PowerShell path strategy miss/timeout -> continue discovery; no guessed configuration.
- PowerShell running-state successful non-match -> confirmed stopped and use validated cold launch.
- PowerShell running-state timeout/error/malformed path -> controlled launch failure, cleanup, and zero spawn/bootstrap.
- ConfigManager/storage failure -> propagate; do not disguise it as missing AE.
- Invalid internal Command metadata/policies -> fail before feature execution.

## Compatibility and Rollout

- Resolve 20.3.2.9 and Electron 36.3.2 remain the qualified host baseline.
- No config schema or AE path migration is required.
- Existing exact default bindings migrate. Internal aliases protect custom binding references without retaining Cyan-marker behavior.
- Resolve 21.0.4 selection is deferred; a future implementation should duck-type `callable(timeline.GetSelectedClips)` and fall back to this Blue/playhead path.

## Test Strategy

### Automated

- Command Registry: default/invalid presentation, internal lookup/execution, internal exclusion from search, defensive cloning.
- Renderer/Settings model: internal exclusion from every target presentation surface while a visible target still resolves internal action descriptions from raw Commands.
- Interaction: exact three bindings, no Shift-only/self-bindings, extra-modifier non-match, both default fingerprints, structural custom migration, backup/idempotence, same/different-action collisions, and every compatibility alias through InteractionManager/executor.
- Selection primitive: full 3×3 target/media matrix, unordered multi-Blue selection, non-duration/Cyan ignore, Blue absence, explicit missing Blue, independent topmost audio/video, and mixed fallback/de-duplication.
- Command execution: exactly six supported `(mode, target_policy, media_policy)` triples plus rejection of the other three policy pairs before Resolve access; every compatibility alias maps to its documented triple.
- Preserve all golden snapshots and downstream transform/JSX tests. Add mixed-single and mixed-Blue transformed/speed/crop/lens/blend/LUT cases that prove OTIO enrichment still runs, plus linked-A/V video-only cases that assert `audioEnabled = false`.
- Path discovery: async valid-path short circuit, ordered fallbacks, exact execFile options, timeout/UTF-8, same-host compare-before-write save/reset races, documented cross-host last-writer-wins, observed storage rejection, stale replacement/removal, and no real subprocess.
- AE launcher: zero process, all-valid nonmatch, non-first match, null/inaccessible record, mixed match+invalid, mixed nonmatch+invalid, missing prerequisite, inconsistent count, timeout/error/malformed JSON, cleanup, zero-spawn unknown, and exactly one cold spawn only after confirmed false.
- Host composition: injectable/deferred orchestration tests prove palette/IPC/hotkey registration before settlement and prove rejection is observed; source-order string assertions are insufficient.

### Manual packaged gate

Install the packaged Workflow Integration build, restart Resolve manually, and validate:

- one visible/searchable AE card;
- playhead single and Blue batch;
- left/Ctrl/Ctrl+Shift media results;
- Cyan marker has no effect;
- configured valid path starts without discovery;
- missing/stale path does not freeze the palette;
- AE already running and cold start both receive the composition.

## Rollback

- Roll back activation in reverse order: restore old manifests/default bindings first, then remove unused new policy support, then remove generic presentation metadata only after no manifest uses it.
- If either async probe cannot satisfy the fail-closed/race contracts, abort the task and return to the pre-task baseline. Restoring synchronous probes is not an acceptable completed release for R6/R7.
- No persistent export data migration is introduced; valid `aePath` and unrelated settings remain usable.

## Rejected Alternatives

- Renderer-side AE filtering: violates generic presentation and repeats business identity in UI code.
- One Command plus modifier parameters crossing Interaction/Command Engine: broadens execution contracts more than internal action Commands.
- Simulated Resolve shortcuts/temporary markers: focus, remapping, timing, cleanup, and observability are weaker than the existing API/Blue fallback and violate current specs.
- Polling/caching AE process state: unnecessary; path discovery is already persisted and running state must be fresh at export.
- Requiring Resolve 21.0.4 now: conflicts with the current qualified baseline and user decision.
