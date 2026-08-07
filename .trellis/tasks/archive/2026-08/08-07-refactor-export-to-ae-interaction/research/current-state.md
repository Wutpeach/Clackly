# Current-State Evidence and Superseded Assumptions

## Current Implementation Evidence

- `command-engine/commands/after-effects.json` registers four public Commands for one `ae.export` Capability. `command-engine/registry.js` currently has one fixed public Command shape and does not distinguish execution identity from presentation.
- `electron/renderer/model.mjs#createPresentationCatalog` projects every installed Command into Launcher/Search/All Actions. `SettingsApp.jsx` separately uses the raw Command list for binding-derived help, so internal filtering must distinguish help targets from action-description lookup.
- `interaction/BindingStorage.js` currently knows two shipped shapes: `OLD_DEFAULT_BINDINGS` (marker only) and `DEFAULT_BINDINGS` (marker plus four primary AE triggers and three auxiliary self-bindings).
- `scripts/resolve2ae_export.py` maps four Command ids to the overloaded `auto/single/video-range/mixed-range` strings.
- `resolve2ae_core/export.py#get_target_clips_logic` scans Blue/Cyan markers in API enumeration order, uses Cyan to include audio, and applies one final top-track filter across the combined single selection.
- The current OTIO parse path is gated by `content_type == "video"`; a mixed selection can therefore skip video OTIO/property enrichment.
- Current JSX audio behavior can leave linked/embedded audio enabled on a video layer, so filtering separate audio records alone does not implement silent video.
- `capability/afterEffectsPath.js` uses synchronous PowerShell only when a saved path is missing/stale. It snapshots config before probing and currently writes/removes after the probe without a compare-before-write race check.
- `capability/afterEffectsLaunch.js#detectRunning` synchronously queries only the first AfterFX path and collapses every query error into `false`, which makes unknown state enter the cold-launch branch.
- Both Electron hosts invoke path initialization before palette/IPC/hotkey readiness.

## User-Owned Decisions

- One visible/searchable Export to AE card.
- Left=mixed, Ctrl+left=audio-only, Ctrl+Shift+left=video-only.
- Resolve 20.3.2.9 remains the current baseline.
- Blue duration marker remains the batch-range fallback; Cyan is removed.
- Resolve 21.0.4 `Timeline.GetSelectedClips()` is deferred.
- Keyboard synthesis/UI automation is not part of export correctness.
- Both PowerShell probes become bounded async operations.
- Package/install precedes user-owned Resolve restart and manual validation.

## Superseded Historical Assumptions

- The archived Resolve2AE integration task intentionally exposed four searchable Commands and auxiliary self-cards. This task supersedes that presentation decision while retaining one Capability and internal action identities.
- The archived auto-detect task required path initialization to complete before window/IPC exposure. This task supersedes only that blocking startup order; discovery precedence, config ownership, valid-path short circuit, and missing-config recovery remain authoritative.
- Blue/Cyan previously encoded both scope and media type. This task makes Blue scope-only and makes media policy explicit.

## Review-Critical Constraints

- Internal Commands must remain executable/raw for actions and descriptions while being absent from every target presentation surface, including Settings help targets.
- Mixed targets containing video must still execute the full existing OTIO/video-property pipeline.
- Video-only must disable embedded/linked audio at JSX layer creation.
- Multiple Blue markers require deterministic numeric-frame ordering.
- Background path discovery must have immediate rejection ownership and compare-before-write configuration semantics.
- Current ConfigManager cannot distinguish unchanged initial absence from Reset-to-absence; the minimal contract preserves manual save and stale-present Reset, while initially-absent Reset intentionally leaves auto-discovery enabled.
- Running-state completeness needs process count plus per-process path/error records; timeout/error/unresolved no-match is unknown, not confirmed stopped, and must perform zero bootstrap/spawn.
- Selection supports a full 3×3 policy matrix, while Command execution supports only the six documented `(mode, target_policy, media_policy)` triples.
- Result contracts are layer-specific: Core success also carries the private launch directive, Wrapper turns controlled Core failure into a script error, and RuntimeManager strips the directive from successful public output.
- Same-host compare-before-write reduces config races, but cross-host persistence remains the existing last-writer-wins contract.
