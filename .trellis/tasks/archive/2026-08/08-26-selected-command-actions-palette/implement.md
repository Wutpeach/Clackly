# Implementation Plan

> **2026-08-26 repair order (supersedes page-replacement steps below):** retain
> the main Palette DOM while rendering a selected-row-anchored right Actions
> panel; add overflow-detected tooltip/transient feedback; then wire the shared
> preload/IPC/window semantic intent and rectangle-union geometry for both
> hosts. Validate expanded clamp/shape/reset with host tests and the packaged
> headless matrix. No visible native host or Workflow installation is permitted
> before a separate permissioned A/B.

## Preparation

- [ ] Read the parent task's final renderer composition and Playwright evidence as the baseline; preserve all user-owned dirty changes.
- [ ] Load frontend quality guidelines and Impeccable craft-floor immediately before Palette UI edits.
- [ ] Search the whole repository for `all-actions`, grouped/A–Z selectors, Ctrl+K, and interaction-help consumers before removing presentation code.

## Renderer and Attached Host Shell

- [ ] Remove the user-visible all-actions mode, footer entry, grouped list, A–Z rail, and dedicated renderer state/effects while retaining unrelated pure helpers.
- [ ] Add renderer-local Actions state with independent query/selection/hover/ack ownership and no model/runtime/Resolve changes. Keep the visible main DOM frozen at `240×320` while Actions opens to its right.
- [ ] Add an explicitly isolated renderer-local Actions presentation source that is empty in production unless real Actions later exist; do not derive it from `getInteractionHelp()`.
- [ ] Support clearly labelled developer/test-only populated rows for Playwright validation, with local substring filtering and truthful empty/no-result states.
- [ ] Add shell/footer Ctrl+K toggle, Action input focus, Arrow navigation, Enter local acknowledgement with zero execution/interaction IPC, and Escape return that preserves Command mode/query/selection.
- [ ] Use distinct Action row semantics/classes and retain accessible listbox/option/status/focus relationships.

## Presentation Polish

- [ ] Replace the footer's All Actions area with separate weak Ctrl/K keycaps and Actions text; retain weak Settings/Pin and correct disabled/hover/focus behavior.
- [ ] Compose Actions Search, label, rows, selected/hover, long-description truncation, and empty/no-result states in the right `176px`, content-fit attached panel; retain the `240×320` main Palette and apply no full-height fake panel.
- [ ] Replace persistent interaction-help/status with off-layout accessible description, overflow-only tooltip, and compact transient status/acknowledgement feedback.
- [ ] Remove only all-actions-specific CSS and carefully split selectors shared with launcher/search/Settings.

## Persistent Headless Validation

- [ ] Convert the proven temporary Playwright approach into a repo-local, headless-default Palette capture/check command with real registry metadata and browser-process-only host injection.
- [ ] Keep screenshots/assertions as artifacts without adding pixel baselines or production fixtures; require explicit `--headed` for visible execution.
- [ ] Capture exact `240×320` Default/Search plus `422×320` attached Actions, filtered, selected/hover, no-results, tooltip, and transient-feedback states from final packaged renderer assets.
- [ ] Assert Ctrl+K, focus, typing/filter, Arrow, Enter no-execution/interaction-IPC acknowledgement, Escape return, preserved Command selection/query, main visibility, host metric bounds, no All Actions DOM, no overflow, single-line rows, and no unexpected console/page errors.

## Tests and Documentation

- [ ] Add the narrowest renderer tests available for any new pure helper; otherwise keep model.mjs unchanged and prove UI behavior through Playwright.
- [ ] Add shared host tests for metric validation, union shape rectangles, open/close idempotence, full-envelope clamp and hide/show restoration in both registered hosts.
- [ ] Assert unavailable/failed `setShape` leaves base bounds untouched; assert a right-edge expanded clamp restores the exact pre-open main bounds after repeated metric updates.
- [ ] Update DESIGN.md, frontend quality guidelines, README/task artifacts to remove the rejected page-replacement rules and record the narrow shape exception, renderer-local Action data/Enter-ack boundary, tooltip, and transient feedback contracts.

## Validation and Handoff

- [ ] Run focused renderer/window tests, `npm run build`, full `npm test`, Impeccable detector, boundary searches, and `git diff --check`.
- [ ] Run `npm run package:win` and `npm run package:verify`, then execute the persistent headless Palette matrix against packaged renderer assets.
- [ ] Assert null/rejected attached-host intent closes safely with persistent concise error feedback and no page error; assert normal acknowledgement auto-dismisses while compact command-error feedback remains until normal clear/recovery.
- [ ] Do not install or launch native hosts in this repair pass. Ask for explicit permission before the final local-project Resolve handoff for `setShape` compositor/hit-test/focus/lifecycle and unchanged real Command execution; Action Enter remains a truthful non-executing preview.

## Risks and Rollback Points

- Actions keyboard handling must short-circuit main Command handlers to prevent selection/search leakage.
- Action rows must never reuse Command execution handlers or `.command-row` activation detection.
- Deleting grouped/A–Z CSS requires splitting shared selectors so launcher/search/Settings do not regress.
- Temporary presentation data must remain explicitly developer/test-only and renderer-local; it must not use Interaction Help as authority. Any need for a formal Action schema, real execution, persistence, preload/IPC, or host-wide Ctrl+K stops implementation for an Architecture Decision Request.
