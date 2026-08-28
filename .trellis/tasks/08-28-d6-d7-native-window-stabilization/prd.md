# Stabilize native D6 D7 Palette windows

## Goal

Commit and archive the accepted D6 opaque Palette and D7 detached Interaction Panel focus stabilization.

## Requirements

- Commit the manually accepted Windows standalone-development D6/D7 Palette stabilization as one self-contained work commit.
- D6: use the opaque `#151619`, full-bleed, native `240x320` Palette surface with DWM rounded corners and shadow.
- D7: use a separate opaque Interaction Panel window with a real 16px gap; the Panel is permanently nonfocusable and opens/closes through immediate opacity and mouse-gating state changes.
- Preserve the focus regression fix: a no-state detached close is a native no-op, and only the D7 main ignores a queued native focus-loss event when it has already regained focus.
- Remove the temporary D7 JSONL recorder/analyzer and all of their runtime and test wiring before the work commit.
- Keep Workflow/Resolve, packaged Electron, Settings, and unrelated dirty work outside the commit.
- Do not introduce visible motion; opacity is immediate lifecycle state, not an authored animation.

## Acceptance Criteria

- [ ] Standalone Windows dev uses the accepted D6 main-window contract and D7 two-window Panel contract.
- [ ] Detached Panel never calls `setFocusable` after construction; no-state close has no native side effects.
- [ ] A stale D7 native focus-loss event is ignored only if the main is already focused; a genuine focus loss still conceals the Palette.
- [ ] No JSONL trace recorder, analyzer, runtime import, or trace-only test remains.
- [ ] Focused and full project tests pass, and the staged work diff contains only D6/D7 code, tests, renderer support, and this task's records.
- [ ] The task is archived and the session journal references the work commit only.

## Notes

- Manual standalone Windows verification accepted stable immediate shortcut reveal/hide, native rounded corners/shadow, the real 16px gap, and Panel focus retention. Workflow/Resolve acceptance remains pending.
