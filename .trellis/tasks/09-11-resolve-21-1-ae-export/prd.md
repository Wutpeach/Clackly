# Resolve 21.1 Export to AE

## Goal
Restore export on Resolve 21.1 and replace Marker-based targeting with native selected items while retaining all three export modes and playhead fallback.

## Evidence
- Runtime manifest at resolve-command-center/resources/runtimes/manifest.json:5 and :16 qualifies only Python 3.13.14 / Resolve 20.3.2. Resolver at script-runtime/runtime/resolver.js:95 and :106 rejects observed 21.1.0.14 with RUNTIME_UNSUPPORTED before export starts.
- Live Timeline.GetSelectedClips returned an empty list on 21.1.0.14; vendor changelog introduces it in 21.0.4. AE responded as 26.3x87. Non-empty selection and full 21.1 export still require validation.
- research/export-regression.md records the full flow and evidence limits. research/native-selection-plan.md contains initial proposals; the decisions below supersede its permanent Marker fallback recommendation.

## Requirements
- R1: Qualify a working 21.1 Runtime, then update profiles/packaging. No guessed interpreter compatibility, relaxed version matching, or silent PATH Python fallback. Preserve existing qualified profiles.
- R2: Preserve normal/mixed, audio-only and video-only modes, command IDs, bindings and existing media/linked-media handling: timeline.exportToAfterEffects, timeline.exportAudioToAfterEffects, timeline.exportVideoToAfterEffects.
- R3: Non-empty native selection is authoritative. Export only selected timeline items, apply the existing media policy, and preserve relative timing/gaps. Do not include unselected items inside the enclosing interval or fall back to unrelated content if filtering leaves no eligible items.
- R4: Empty selection uses existing playhead targeting, with no select-first prompt. Preserve full-clip/no-trimming behavior and existing playhead media rules.
- R5: Deliver native selection first. On a native-selection host, Markers must not affect either selected-item or playhead export. Retain existing Marker code temporarily for comparison/rollback and legacy compatibility calls without adding a permanent switch.
- R6: Only after explicit successful user manual testing, remove obsolete Marker-export branches, uncalled dedicated helpers, obsolete tests and inaccurate active specs/docs. Preserve all three modes, playhead fallback, shared Marker functionality with other callers and historical task records. No dead/commented-out compatibility code remains.
- R7: Reuse existing export core, OTIO/JSX, AE launcher and public status/result protocol. MCP remains a developer tool, not a new product dependency.

## Acceptance Criteria
- AC1 (R1): A fresh qualified 21.1 Probe passes; a known package reaches the export script. Record interpreter, bridge and package identities. Existing qualified profiles still resolve and unsupported versions fail explicitly.
- AC2 (R2–R4): All three existing commands/bindings work with selected items and empty-selection/playhead fallback. Disjoint/multitrack selection preserves timing/gaps and excludes unselected intervening items.
- AC3 (R3–R5): Markers do not change native-host export results. Existing media, linked-media and enabled-track/clip handling remain intact; filtered-out explicit selection never triggers unrelated fallback.
- AC4 (R1–R5,R7): Verify actual AE import, layers/timing and stage-specific status. Mock tests and MCP connectivity alone do not establish end-to-end success.
- AC5 (R6): Record user manual-test success before cleanup. After cleanup no executable Marker export path or orphaned helper remains, active docs/tests reflect final behavior, and unrelated Marker features still work.
- AC6: Relevant focused tests, existing full test command, build and package verification pass or specific environment/baseline limitations are reported. Overall task stays open until manual testing and conditional cleanup finish.

## Scope and Constraints
- Preserve unrelated working-tree edits and open user projects. Never reset/save the user's dirty project during diagnosis; use disposable validation context or coordinate the user's manual test.
- Preserve already-qualified older hosts. Once Marker export is removed, hosts without native selection retain playhead export; this task does not claim new selected-item support for unqualified versions.
- Runtime choice is technical qualification work. If 21.1 requires a new transport or material architecture/support change, report evidence and revise the design before that change.
- No command consolidation, UI redesign, extra media features, permanent migration switches or unrelated Marker deletion.

## Planning Status
User confirmed three modes, selected-set timing/gaps, playhead fallback and cleanup only after their manual test. No product question blocks stage A. Runtime qualification and non-empty live export are explicit technical validation gates. Final design, implementation steps and both curated context manifests are prepared for review.
