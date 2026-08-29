# Settings three-column implementation plan

## Review gate

- [x] Do not run `task.py start` or edit product code until the user approves this exact planning summary.
- [x] Before implementation, load `trellis-before-dev` and Impeccable's `craft-floor.md`.
- [x] Dispatch the bounded implementation to the existing Orca `develop` Worker with this task path and curated Trellis context. The Worker must not recurse or revert unrelated changes.

## 1. Establish presentation contracts

- [x] Add focused `model.mjs` tests for the effective-status truth table: loading, disabled, ready, missing config, missing dependency, unavailable, and error.
- [x] Add a pure localized Feature-filter projection and tests for empty query, name/category/description matches, case/whitespace normalization, hidden empty groups, and no-results behavior.
- [x] Add/adjust localization-resource assertions for new application/inspector/status copy in English and Simplified Chinese.
- [x] Keep the existing real interaction-binding helper as the only Settings interaction projection; add tests only where the inspector needs a previously uncovered multi-Command or modifier case.

## 2. Reshape Settings composition

- [x] Refactor `SettingsApp.jsx` selection to nullable Feature id so application context is structurally separate from FeatureCatalog.
- [x] Split the renderer into clear navigation, configuration, and inspector regions without creating a registry/provider abstraction.
- [x] Keep grouped flat Feature rows and move `Clackly Settings` to a fixed navigation footer.
- [x] Add the compact navigation search as a real renderer-local filter over the loaded localized Feature projection; do not add IPC, persistence, ranking, or a keyboard shortcut hint.
- [x] Keep schema-driven fields and Feature feedback/Reset/Save in the center; move description, metadata, lifecycle, and interaction presentation to the inspector.
- [x] Render application Language in the center through the current Preferences-backed LocalizationContext and package-owned About/version in the inspector.
- [x] Preserve all loading, invalid selection, busy, path picker, save/reset, enable/disable, refresh, feedback, and localization behavior.

## 3. Apply current visual language

- [x] Replace the two-column Settings workspace rules with a `190px / flexible / 220px` three-column grid at the existing `760x560` native size.
- [x] Give navigation list, configuration body, and inspector independent bounded scrolling; keep navigation/application and configuration/action footers stable.
- [x] Converge the shared renderer accent tokens on the existing light-neutral emphasis (`#E7E8EA` / `#17191D`), including focus, pin, checkbox, and primary Save; split any retained exceptional orange into a separately named warning token.
- [x] Reuse the current surface, row, selected-state, field, keycap, radius, icon, typography, and hairline variables.
- [x] Remove obsolete center lifecycle/description/help styling and add flat inspector section/status/action styles with no legacy orange-heavy/card/dashboard drift.
- [x] Add one small Ready-only semantic green dot backed by the effective status; keep all other status paint and lifecycle controls restrained.
- [x] Preserve the compact custom titlebar, square shell, light-neutral Save emphasis, reduced-motion behavior, and no authored Settings reveal/hide motion.

## 4. Update preview and visual tests

- [x] Replace the hostless General fixture with application Settings context while keeping all fixture data isolated, defensive, and non-executable.
- [x] Update `settingsVisual.test.mjs` to assert three columns, functional search placement, fixed application footer, center action strip, inspector sections, Ready-only dot, effective-status simplification, and shared Palette/Interaction primitives.
- [x] Update `browserPreview.test.mjs` and `palette-evidence.mjs` selectors/assertions for the new topology and state matrix.
- [x] Add a search-match and search-empty browser evidence state, then build once, run `npm run settings:evidence` headlessly, inspect all screenshots in one batch, fix all observed defects in one batch, and run at most one confirmation capture.
- [x] Run the bounded Palette evidence scenarios once after the shared emphasis-token change and confirm focus, selected rows, and pin paint without changing Palette behavior or geometry.

## 5. Preserve contracts and update durable docs

- [x] Update root `DESIGN.md` from the stale Orange Signal rule to the light-neutral emphasis rule, update Settings from two-pane to the approved three-column topology, and synchronize `.impeccable/design.json` through the repository design tooling while retaining current native-window authority.
- [x] Update `.trellis/spec/frontend/quality-guidelines.md` to require the three-column projection, application/Feature boundary, one effective status, and real binding projection.
- [x] Confirm no changes landed in FeatureCatalog, ConfigManager, Preferences storage, FeatureStatusManager, InteractionManager/BindingStorage, command execution, or D6/D7 host policy.

## 6. Validation and handoff

- [x] Run focused renderer/model/localization/browser-preview/feature-UI/feature-status/preferences/window tests.
- [x] Run `npm test` and `npm run build` from `resolve-command-center`.
- [x] Run task-relevant Impeccable detector checks and `git diff --check`; inspect the final diff for authority duplication, handwritten bindings, `Check for Updates`, orange primary emphasis, old lifecycle dimensions, and accidental native-window changes.
- [x] Run Trellis `trellis-check` with a separate review pass and resolve verified findings.
- [x] Run `npm run workflow:install` before asking the user to restart Resolve.
- [ ] Ask the user to restart Resolve and manually verify the installed Settings window: three-column geometry, selection/focus, long configuration controls, save/reset, Language, Refresh, Enable/Disable, close/reopen singleton behavior, and renderer/native paint.
- [x] Final report lists actual structure, visual-authority comparison, application/Feature boundary, status/interaction sources, automated/install results, native manual status, and every intentional difference from the supplied reference.

## 7. Post-critique corrective scope

- [x] Remove the Settings titlebar wordmark while retaining the localized title, drag region, close control, and existing native lifecycle.
- [x] Keep a query-filtered-out selected Feature in one localized renderer-local Current group without changing selection or duplicating matching rows.
- [x] Make Inspector lifecycle controls compact bordered secondary actions with monochrome Refresh/Power icons; localize the Inspector landmark and operation-specific recovery feedback.
- [x] Prefer concise status-record messages for abnormal effective-status reasons, add readable provider-id presentation, and cover version/providers in browser fixtures/evidence.
- [x] Synchronize task/root/sidecar/frontend contracts, execute the required Settings evidence pass, and leave native Resolve acceptance pending.

## Evidence recorded (2026-08-29)

- Focused renderer/model/localization/browser-contract suites passed, including the effective-status and localized search projections.
- Full `npm test` passed: 327 JavaScript tests plus all configured Python suites. `npm run build` passed.
- Headless `npm run settings:evidence` passed for application/empty, ready, missing-config long-path, Simplified Chinese multi-interaction, busy, error, search match, search empty, and reduced-motion. The inspected screenshots and report are under `C:\\Users\\Administrator\\AppData\\Local\\Temp\\clackly-palette-evidence\\`.
- Bounded Palette evidence passed for `default,pinned-recent`, including light-neutral focus and pin assertions. The first visual batch identified narrow Inspector wrapping; the single corrective batch stacked keycaps above descriptions, and the confirmation batch passed.
- The Impeccable detector returned `[]`; DESIGN.md and its schema-version-2 sidecar were parsed/validated by the repository design tooling. `git diff --check` passed. The final boundary review found no changes in the protected authorities or native host policy.
- Corrective pass: Inspector mappings now render the registered action Command `actionName` (not `description`) with source, focused, and English/Simplified-Chinese headless-evidence regression assertions. Feature search now uses deterministic `toLowerCase()` normalization. Renderer-local busy operation tokens cancel stale pending `getConfig` work without allowing it to clear a newer operation; the busy fixture verifies Feature-to-Feature and Feature-to-application cancellation paths.
- Corrective validation: focused renderer/model/browser/visual tests passed; full `npm test` passed (328 JavaScript tests plus all configured Python suites); `npm run build` and headless `npm run settings:evidence` passed. The refreshed typical-ready and Simplified-Chinese screenshots were inspected: registered action names are visible without Inspector clipping. No Palette evidence rerun was needed because shared tokens were unchanged.
- Corrective install: `npm run workflow:install` passed again after the updated build, copying `WorkflowIntegration.node` and recreating the `com.wutpeach.clackly` junction at the Resolve Workflow Integration Plugins location. Resolve was not started or restarted.
- Final corrective guard: host-pushed Feature selection now remains intact while initial Feature/status loading is in progress, then falls back to application context only after that load completes when the id is absent. The fixed application footer clears completed Feature feedback before switching context, without cancelling non-config operations; source-contract regression assertions cover both boundaries. `node --test electron/renderer/model.test.mjs electron/renderer/settingsVisual.test.mjs electron/renderer/browserPreview.test.mjs` passed (27 tests); `npm test` passed (329 JavaScript tests plus all five Python suites); `npm run build`, the focused Impeccable detector (`[]`), and `git diff --check` passed; `npm run workflow:install` recopied `WorkflowIntegration.node` and recreated the Workflow plugin junction. Settings screenshot evidence was intentionally not rerun because this renderer-state guard does not alter fixture paint.
- Native Resolve acceptance remains intentionally pending. Browser evidence validates renderer paint only; it does not prove Electron/Resolve focus, DWM composition, singleton lifecycle, or host hit testing.
- Post-critique polish validation: the focused Settings/model/localization/window suites passed (78 tests); full `npm test` passed (329 JavaScript tests plus all five configured Python suites); `npm run build` passed; the Impeccable detector returned `[]`; and `git diff --check` passed. The final authority audit found no protected FeatureCatalog/config/status/preferences/interaction/command/native-window implementation changes and no direct renderer host/storage/provider coupling.
- Post-critique visual evidence: `npm run settings:evidence` passed all nine bounded scenarios. The one complete screenshot review at `C:\Users\Administrator\AppData\Local\Temp\clackly-palette-evidence\` confirmed the wordmark-free localized titlebar, Current-group context, readable About version/providers, contextual abnormal-status copy, compact icon secondary actions, and English/Simplified-Chinese action names. Long Inspector content remains in its intentionally bounded independent scroll region; no second visual pass was needed.
- Post-critique install: `npm run workflow:install` passed after the production build, copied `WorkflowIntegration.node`, and recreated the `com.wutpeach.clackly` Workflow Integration junction. Resolve was not started or restarted; native acceptance remains unchecked.

## Rollback points

- After Step 2: renderer composition can be reverted without persisted-data changes.
- After Step 3: Settings-owned CSS can be reverted independently of data authorities.
- If `760x560` produces unrecoverable clipping, stop and return to planning rather than silently changing the native window contract.
- If real interaction rows require new binding authority or runtime status changes, stop and return to planning; those changes are outside scope.
