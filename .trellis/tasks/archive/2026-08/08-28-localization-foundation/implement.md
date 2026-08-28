# Localization foundation — implementation plan

## Preconditions and preservation

- Keep the task in planning until the user approves the final summary in a subsequent message.
- Before editing product code, load `trellis-before-dev` and the relevant frontend/backend specs selected by that skill.
- Preserve all unrelated working-tree changes, especially the Agentation additions in `App.jsx`, `browserPreview.mjs`, tests, and package metadata.
- The Orca `develop` Worker owns the bounded implementation dispatch. It must not revert others' edits or dispatch more Workers. The Lead reviews every change and runs final verification.

## Ordered implementation

1. **Build the preference and locale primitives**
   - Add pure supported-locale resolution and core resource/fallback helpers.
   - Record the repository proof that `ConfigStorage` atomic replacement is not serialized merge semantics.
   - Add application `Preferences` with validation, dedicated `appData/Clackly/preferences.json` persistence, and process-local subscription. Keep `ConfigManager` as the only capability-domain writer of `config.json`.
   - Wire `Preferences` and `LocalizationService` into `createClacklyCore` with an injected system-language provider.
   - Add unit tests proving locale and capability writes survive alternating/concurrent operations without cross-document overwrite before connecting UI.

2. **Add the shared Electron boundary**
   - Register snapshot/get-set IPC once for both standalone and Workflow hosts.
   - Broadcast only after successful persistence to every open renderer.
   - Extend the main preload with localization APIs and cleanup-safe listeners. Keep the restricted Panel preload free of independent locale access.
   - Update host/composition/preload tests, including the detached Panel's projection-sink behavior.

3. **Implement the renderer localization provider**
   - Add a provider/hook wrapping all renderer routes in `main.jsx`.
   - Set document `lang`, use English safe bootstrap copy, and react to authority events.
   - Extend browser preview with an isolated in-memory/navigator adapter and tests.

4. **Implement package-owned metadata projection**
   - Extend Command manifest normalization/validation/cloning with optional `localizations`.
   - Add the same presentation overlay support needed for built-in capability/config-schema metadata.
   - Add Simplified Chinese overlays to every current built-in Command and feature/config field.
   - Make renderer search consume localized plus English fallback metadata without changing execution IDs.

5. **Migrate current UI into the i18n boundary**
   - Palette: chrome, sections, empty/search states, status/error presentation, tooltips, titles, ARIA, command metadata, pin/info controls.
   - Settings: add General/Language, migrate all shell/lifecycle/control/help/feedback copy and localized feature/schema metadata.
   - Interaction Panel: descriptions/actions/input labels, preview note, attached/detached accessibility copy.
   - Make detached presentation revisions complete (`effectiveLocale` plus localized content/ARIA), re-project on locale changes in the Palette owner, and update the already-open D7 window without close/reopen.
   - Native host common dialogs: use authoritative locale and structured/generic presentation errors.
   - Keep CSS changes limited to the minimum layout support required for the General/Language row and bilingual text lengths.

6. **Close presentation leaks**
   - Map stable lifecycle/error codes in presentation and stop rendering raw domain/runtime messages.
   - Run a scoped literal audit across renderer, presentation models, native dialogs, command/capability manifests, and browser fixtures.
   - Move true user-facing literals into core resources or package-owned English fallback metadata; document intentional internal diagnostics and stable key names.

7. **Verify and package**
   - Run targeted localization/preferences/registry/IPC/renderer tests after each boundary.
   - Run `npm test` and `npm run build` from `resolve-command-center`.
   - Use headless Playwright/browser preview for one bounded English/Chinese visual pass and one confirmation pass if fixes are needed.
   - Run `trellis-check`, address findings, and update executable project specs if the finalized boundary adds a durable convention.
   - Build/install the Workflow package with the repository script before asking the user to restart Resolve and manually validate System Default, English, 简体中文, and live multi-window switching.

## Planned validation commands

```powershell
Set-Location D:\Clackly\resolve-command-center
node --test localization/*.test.js preferences/*.test.js command-engine/*.test.js feature-ui/*.test.js electron/main/*.test.js electron/renderer/*.test.mjs
npm test
npm run build
npm run workflow:install
```

The exact targeted glob may be adjusted to the final file locations, but the full `npm test`, production build, and Workflow installation are mandatory.

## Review gates

- Preference write preserves existing capability roots in a real-shaped config fixture.
- Preferences and capability config use distinct persisted documents and cannot overwrite one another; test both write orders and overlapping service lifetimes.
- No locale value crosses `commands:execute`, `interactions:execute`, capability execution, script runtime, or Resolve adapter boundaries.
- Locale event updates Palette, Settings, and detached Panel from one saved preference.
- Detached Panel content has one authority: an open D7 receives complete `en`, `zh-CN`, then `en` revisions from the Palette owner, changes description/action/accessibility copy live, and is never recreated or independently localized.
- English-only Command fixture works; partial Simplified Chinese overlay falls back per field; malformed overlay fails at load.
- Unsupported system locale and missing translations produce English copy, never resource keys.
- The final diff contains no accidental changes to existing Agentation/browser-preview work.
- Final report names any remaining hard-coded user-visible strings and every unresolved architecture risk.

## Rollback points

- After step 1: preference/localization primitives are isolated and can be removed without touching UI.
- After step 2: IPC/preload additions can be reverted independently because existing APIs remain unchanged.
- After step 4: optional manifest fields are backward-compatible; deleting overlays restores current English behavior.
- UI migration is performed by surface so Palette, Settings, and Panel diffs remain independently reviewable.
