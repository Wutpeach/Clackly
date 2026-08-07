# Refactor Export to AE Interaction and Async Probes

## Goal

Adapt the integrated Resolve2AE feature to Clackly's single-card interaction model while preserving the qualified Resolve 20.3.2.9 export path, and remove synchronous PowerShell work from Electron's main thread.

Users should see one searchable `Export to After Effects` card. Resolve state decides the target scope (Blue duration marker range when present, otherwise the playhead clip), while the card's mouse modifiers decide whether the export contains mixed audio/video, audio only, or video only.

## Background

- Resolve 20.3.2.9 cannot expose the current timeline selection through its scripting API. The existing integrated core therefore uses duration markers for batch ranges and the playhead for a single clip.
- Resolve 21.0.4 adds `Timeline.GetSelectedClips()`, but support for that API is deferred. The current release remains qualified against Resolve 20.3.2.9.
- The current integration registers four visible Commands for one `ae.export` Capability. All four appear as cards because the presentation catalog does not distinguish user-facing Commands from binding-only action Commands.
- Blue and Cyan markers currently encode both target scope and media type. The new interaction makes media type explicit, so Cyan is redundant.
- AE path discovery and AE running-state detection currently call synchronous PowerShell from the Electron main process. A valid saved path already short-circuits startup discovery; there is no polling.

## Requirements

### R1: One Visible Export Entry

- Launcher, Search, and All Actions expose exactly one visible/searchable `Export to After Effects` card.
- The implementation may retain internal Command identities for Interaction Binding and execution, but internal Commands must not appear as cards or search results.
- Command presentation remains generic. Renderer code must not branch on `ae.export` or an AE Command id.

### R2: Media-Type Mouse Bindings

The visible card uses these exact default bindings:

- left click: export audio and video;
- Ctrl + left click: export audio only;
- Ctrl + Shift + left click: export video only.

Extra modifiers must not match accidentally. Keyboard Enter on the visible card executes the default audio/video behavior.

### R3: Resolve 20.3.2.9 Target Scope

- A qualifying Blue duration marker selects its range for batch export.
- When multiple qualifying Blue duration markers exist, select the marker with the lowest numeric timeline frame; API/dictionary enumeration order must not affect the result.
- When no qualifying Blue duration marker exists, the playhead selects the single topmost enabled clip for the requested media type.
- Marker presence controls only target scope. It must not select the media type.
- Cyan markers and Cyan-specific failure messages are removed from the active export behavior.
- Single video selects the topmost enabled video item at the playhead; single audio selects the topmost enabled audio item independently.
- Single mixed selects the topmost enabled video item plus eligible audio at the playhead, de-duplicates audio already represented by that video, and falls back to the available media class when only video or only audio exists.
- Batch audio-only considers all enabled overlapping audio tracks; batch video-only considers all enabled overlapping video tracks; batch mixed preserves the existing linked-audio de-duplication behavior.

### R4: Export-Core Preservation

- Preserve the existing OTIO parsing, source linking, timecode, resolution, transforms, blend modes, constant/variable speed, dynamic zoom, crop/lens correction, LUT, JSX generation, cleanup, and AE launch behavior.
- Limit Python changes to mode decoding, target/media selection, and exactly two minimal shared-pipeline adaptations required by the new policies: selected-record `has_video` OTIO gating and `media_policy == "video"` muting on every generated video layer. Other OTIO/formula/JSX restructuring is prohibited.
- Whenever the target set contains any video record, including mixed exports, the existing OTIO parsing and video-property enrichment must run.
- Video-only export must disable audible embedded/linked audio on every generated video layer, not merely omit separate audio-track layers.
- No runtime dependency on the former standalone Resolve2AE repository is introduced.

### R5: Binding and Command Migration

- New/default profiles receive only the three confirmed bindings on the visible card; auxiliary self-card bindings are removed.
- Both shipped exact default fingerprints (marker-only and the current marker-plus-seven-AE-binding root) migrate deterministically to the new defaults using canonical normalized, binding-id-sorted comparison that is independent of JSON property order.
- All three shipped legacy AE action ids remain mandatory internal compatibility aliases for this release so customized bindings cannot reference an unknown Command.
- Compatibility mappings are explicit: old current-clip -> forced playhead mixed; old Blue-range -> required Blue video; old Cyan-range -> required Blue mixed. No alias reads Cyan.
- Every legacy alias receives truthful internal name/description/keywords for its new non-Cyan behavior so visible-target Interaction Help cannot display stale Cyan instructions.
- Customized legacy target ids are structurally retargeted to the visible primary Command while preserving binding ids, triggers, and actions.
- Non-conflicting custom bindings are preserved. Before structural migration the original file is backed up. For every target/trigger collision, an originally primary-target binding wins regardless of file order; otherwise the lexically lowest binding id wins. Same-action losers are de-duplicated; different-action losers retain the recoverable backup and emit one developer-visible migration warning through an injected/default host warning sink naming the kept and skipped ids.

### R6: Asynchronous AE Path Discovery

- A valid saved `ae.export.aePath` remains authoritative and performs no PowerShell discovery.
- Missing or stale paths retain the current discovery precedence: running AE process, HKCU/HKLM App Paths, then the highest numeric standard installation.
- PowerShell calls are asynchronous, hidden, UTF-8 decoded, and bounded by a timeout.
- Discovery may begin during host readiness, but palette creation, IPC registration, and global-hotkey registration must not wait on a PowerShell process.
- Expected process/registry misses remain recoverable; configuration/storage failures remain visible.
- Both hosts immediately observe the background initialization Promise and route unexpected rejection to an explicit host error surface; no unhandled rejection is permitted.
- Before writing or deleting `aePath` after an awaited probe, the initializer re-reads configuration and mutates only when the field is still in its starting state. Within one host/event loop, a manual save or stale-value Reset that completes before the synchronous compare+write section wins. Cross-host writes retain the documented last-writer-wins limitation; this task does not claim atomic compare-and-swap or add interprocess locking. When `aePath` was initially absent, Reset is intentionally equivalent to remaining in auto-discovery state and may still be followed by a discovered-path write because current ConfigManager exposes no reset generation/tombstone.

### R7: Asynchronous AE Running-State Detection

- Each export may still check whether the configured AE executable is already running; this is an on-demand check, not polling.
- The running-state PowerShell call is asynchronous and bounded by the same timeout policy.
- PowerShell returns a structured completeness result containing process count and one path/error record per AfterFX process. Any validated configured-path match confirms running; otherwise any unresolved/null/inaccessible record means unknown; only zero processes or all validated nonmatches confirm not running.
- Timeout, missing PowerShell prerequisite, subprocess failure, inconsistent/undecodable/malformed structured output, or inability to validate returned process paths means "unknown" and fails the export before any cold-start spawn/bootstrap.
- The query evaluates every returned AfterFX path, not only the first process.
- The existing running/cold AE launch behavior, validation, one-launch rule, and cleanup remain unchanged.

### R8: Documentation and Qualified Scope

- User/developer documentation explains the single-card bindings, Blue-marker fallback, lack of continuous path polling, manual-path short circuit, and asynchronous probe behavior.
- Automated validation covers both standalone Electron and Workflow Integration composition.
- Windows with Resolve 20.3.2.9 remains the release baseline.

## Acceptance Criteria

- [ ] Launcher, Search, and All Actions show exactly one `Export to After Effects` entry; searching AE terms cannot reveal internal actions.
- [ ] The visible card's left, Ctrl+left, and Ctrl+Shift+left interactions execute mixed, audio-only, and video-only exports respectively; Enter executes mixed export.
- [ ] A Blue duration marker causes batch range selection for all three media policies; without Blue, all three policies use the playhead single-clip path.
- [ ] Multiple unordered Blue markers always choose the lowest numeric frame; point markers, Cyan markers, and enumeration order do not change the selected range.
- [ ] Cyan markers are ignored by active selection, no active Command requires Cyan, and no Cyan-specific error is emitted.
- [ ] Single mixed/audio/video selection follows the explicit per-track-type topmost/fallback table; mixed export preserves linked-audio de-duplication.
- [ ] Audio-only produces no video layers; video-only produces no audible embedded/linked audio and no audio-only layers.
- [ ] Mixed single and Blue-range exports containing transformed, speed-ramped, cropped/lens-corrected, blended, or LUT video retain the same OTIO/JSX evidence as video-only export while also including eligible audio.
- [ ] Existing transform, speed, crop/lens, blend, LUT, OTIO, JSX, AE running, and AE cold-start regressions remain green.
- [ ] Both shipped default binding fingerprints migrate to the new three-trigger shape regardless of outer JSON key order, while a one-field semantic customization does not take the wholesale-default path; every legacy action id remains executable internally; custom legacy targets migrate or produce an explicit backed-up collision warning without another visible card/help target.
- [ ] Legacy alias metadata and visible-target help contain no stale Cyan wording; collision tests prove original-primary precedence, lexical auxiliary precedence, exact kept/skipped diagnostics, backup, and once-only/idempotent reload behavior.
- [ ] A valid saved AE path starts no PowerShell discovery and remains unchanged.
- [ ] Missing/stale AE path discovery and per-export running detection use asynchronous bounded subprocesses and cannot synchronously block Electron's main event loop.
- [ ] Palette creation, IPC, and hotkey registration occur without awaiting startup PowerShell completion in both Electron hosts.
- [ ] Deferred same-host startup tests prove a manual save and stale-present Reset completed before compare+write win, initially-absent Reset retains documented auto-discovery behavior, storage rejection is observed once, and no unhandled Promise rejection occurs; cross-host last-writer-wins remains documented and is not presented as atomic.
- [ ] Running detection covers zero process, all-valid nonmatch, non-first match, null/inaccessible path, mixed valid+invalid records, missing prerequisite, and malformed structured output; every unknown case performs zero cold spawn/bootstrap and returns a controlled launch failure.
- [ ] Layer-specific result tests pass: Core failure is the exact seven public keys; Core success adds only the reserved private AE launch directive; Wrapper returns success transport but converts Core terminal failure to the existing script-error envelope; RuntimeManager public success is the exact seven keys after stripping the directive, while failures remain typed runtime/script errors.
- [ ] Focused tests, the full Node/Python suite, Python compilation, production renderer build, and `git diff --check` pass.
- [ ] Packaged Workflow Integration is installed and manually validated in Resolve after implementation, including all three modifiers, Blue batch, playhead single, AE running, and AE cold start.

## Out of Scope

- Resolve 21.0.4 `Timeline.GetSelectedClips()` integration or raising the minimum Resolve version.
- Removing Blue marker compatibility from Resolve 20.x.
- Keyboard synthesis, Resolve UI automation, shortcut inspection/remapping, clipboard-based selection, or temporary automated markers.
- New interaction-binding editor UI, global keyboard shortcuts, double-click gestures, or a second export card/menu.
- Rewriting the Resolve2AE export pipeline or AE JSX formulas.
- Background polling, a global AE service, a process cache, or a new child-process dependency.
- macOS release qualification.

## Key Decisions

- Keep one `ae.export` Capability and one configuration scope.
- Separate target scope from media type: Blue/playhead chooses scope; mouse modifiers choose media.
- Remove Cyan now; defer native selected-clip export to a future Resolve 21.0.4 task.
- Model binding-only actions as generic internal Commands instead of renderer-specific filtering.
- Keep probe frequency unchanged and make the existing on-demand work asynchronous rather than adding caches or polling.

## Risks and Deferred Items

- A persistent Blue marker elsewhere on the timeline continues to make the default target a batch range; users remove/adjust the marker to return to playhead selection. A separate explicit scope selector is not part of this task.
- The exact PowerShell timeout is an implementation constant, initially planned as 5 seconds per process call and reviewable through tests.
- Resolve 21.0.4 selected-clip support should be implemented later with runtime capability detection rather than a version-string branch.
