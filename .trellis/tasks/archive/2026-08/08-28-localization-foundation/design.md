# Localization foundation — technical design

## Architecture summary

The feature is split into four small boundaries:

```text
Electron system languages ──┐
                            ├─> LocalizationService ──> read-only snapshot
Preferences (persisted) ────┘             │                  │
                                          │                  ├─ IPC get/change event
core English/zh-CN resources ─────────────┘                  │
                                                             v
Command/feature raw metadata + locale overlays ──> renderer presentation adapters
                                                             │
                                                             ├─ Palette / Settings / Panel
stable Command ID ───────────────────────────────────────────> execution/runtime
```

`Preferences` owns only the user's selection. `LocalizationService` owns resolution and snapshot creation. React owns only the current read-only snapshot needed to render. Presentation adapters localize metadata and status/error codes; execution never receives locale.

## 1. Preferences authority and persistence

Add an application-level `preferences/Preferences.js` service, wired once by `createClacklyCore`.

- Repository evidence shows `ConfigStorage` is not a merge/serialization boundary: it exposes independent `load()` and full-root `save()` calls (`config/ConfigStorage.js:29-76`), and its regression explicitly shows a later save replacing all previous roots (`config/ConfigStorage.test.js:23-34`). Atomic rename protects file integrity, not concurrent read-modify-write semantics.
- Therefore Preferences uses a separate application-owned document rather than adding another authority over capability `config.json`:

  ```json
  { "locale": "system" }
  ```

- `getLocale()` returns one of `system | en | zh-CN` and normalizes invalid/missing persisted data to `system`.
- `setLocale(value)` validates, saves atomically through a `ConfigStorage` rooted at `appData/Clackly/preferences.json`, and publishes a change only after persistence succeeds.
- `subscribe(listener)` is process-local notification infrastructure; it does not create a second state store.

The service is separate from `ConfigManager` because locale is application preference, not capability configuration. `ConfigManager` remains the only capability-domain full-document writer for `appData/Clackly/config.json`; Preferences is the only writer for `preferences.json`. Reusing `ConfigStorage` preserves atomic-write and validation mechanics without adding locks, transactions, a new persistence framework, or a synthetic capability. Because the documents are distinct, writes cannot lose updates across the locale/capability boundary even when standalone and Workflow hosts overlap.

## 2. Locale resolution and translation primitives

Add a dependency-free `localization/` module with pure functions and bundled resources.

- `SUPPORTED_LOCALES = ["en", "zh-CN"]`, `FALLBACK_LOCALE = "en"`.
- `resolveEffectiveLocale(preference, systemLanguages)`:
  - explicit locale returns itself;
  - `system` walks host language tags in priority order;
  - `en`/`en-*` -> `en`;
  - `zh-CN`, `zh-SG`, and tags containing script `Hans` -> `zh-CN`;
  - `zh-TW`, `zh-HK`, `zh-MO`, `Hant`, and all other unsupported tags -> no match, eventually `en`.
- `LocalizationService` injects `preferences` and a `systemLanguagesProvider`; Electron hosts provide `app.getPreferredSystemLanguages()` with `app.getLocale()` as a fallback.
- Snapshot contract:

  ```js
  {
    preference: "system" | "en" | "zh-CN",
    effectiveLocale: "en" | "zh-CN"
  }
  ```

- Core `en` and `zh-CN` resource objects use stable dotted keys. `translate(resources, locale, key, params)` falls back per key to English, then to a fixed safe English value such as `"Unavailable"`; it never returns `key`.
- Interpolation supports only named scalar placeholders required by current copy. No ICU/pluralization runtime is added.

## 3. IPC and open-window propagation

Register shared localization/preference IPC from both hosts through one helper rather than duplicating behavior.

- `localization:get-snapshot` returns the authoritative snapshot.
- `preferences:set-locale` persists via `Preferences`, then returns the new snapshot.
- On a successful change the main process broadcasts `localization:changed` with the new snapshot to every non-destroyed `BrowserWindow.webContents`.
- Preload exposes `getLocalizationSnapshot`, `setLocalePreference`, and `onLocalizationChanged` to the Palette/Settings bridge. The detached Panel bridge receives no independent locale snapshot/subscription; it receives only owner-projected Panel presentation revisions.
- A renderer `LocalizationProvider` fetches the initial snapshot, subscribes once, sets `document.documentElement.lang`, and exposes `t`, snapshot values, and the authorized setter.
- The provider wraps the owner routes in `main.jsx`, so Settings, Palette, and the attached Panel use one React boundary. The detached Panel is a projection sink, not a second localization consumer. Components do not initialize locale from `navigator` or local storage in Electron.
- Browser preview supplies a production-isolated adapter backed by navigator languages plus in-memory preference/event listeners so preview tests can exercise language switching without affecting product persistence.

## 4. Command localization contract

Keep the existing English metadata required and add one optional field:

```json
{
  "id": "vendor.command-id",
  "name": "English fallback name",
  "description": "English fallback description",
  "category": "English fallback category",
  "keywords": ["english", "fallback"],
  "capability": "vendor.capability-id",
  "localizations": {
    "zh-CN": {
      "name": "简体中文名称",
      "description": "简体中文说明",
      "category": "简体中文分类",
      "keywords": ["中文", "搜索词"]
    }
  }
}
```

Contract rules:

- `localizations` is optional. A package that supplies only the required English base remains valid.
- Locale tags are resource-map keys owned by the Command/package. Clackly consumes supported locales now and can ignore unknown locale resources without requiring core language-file changes.
- Every overlay field is optional and falls back independently to the English base field.
- Overlay strings must be non-empty when present; keywords must be an array of non-empty strings.
- The registry validates once at load, clones locale maps/arrays, and does not translate stable IDs, icon IDs, capability IDs, or `presentation`.
- `localizeCommandMetadata(command, effectiveLocale)` is a presentation projection. The raw registry remains the execution authority by ID.
- Search haystack contains stable ID, localized name/keywords, and English base name/keywords. Thus localized discovery works without making English fallback undiscoverable.

The same overlay shape is accepted for built-in capability metadata/config schema display fields needed by Settings. This is presentation metadata only and does not enter capability execution. A future package loader can pass its manifest object through the same validator/projection without registering translations in Clackly core.

## 5. Presentation migration

### Palette

- Replace literal chrome, section labels, empty states, running/error feedback, status labels, tooltip/title/ARIA copy, pin/info/settings control text, and interaction input labels with `t` calls.
- Keep raw Commands/statuses in state. Derive localized Commands and presentation catalog with `useMemo` from `effectiveLocale`, so an event updates names, search results, descriptions, and open Panel content immediately without refetching execution data.
- Convert `projectLauncherSections`, `getFeatureWarning`, `getInteractionHelp`, accessible-description generation, and error presentation into locale-aware pure presentation helpers.

### Settings

- Add a first application-level `General` destination in the existing sidebar. It contains one Language select bound to the authoritative preference and the three requested options.
- Locale change awaits persistence. On success the broadcast updates the same Settings window and all other windows; on failure the selector remains on the authoritative snapshot and shows localized feedback.
- Localize feature metadata/schema display overlays before grouping/rendering. Localize lifecycle status enums rather than rendering `replaceAll("-", " ")`.
- Migrate title/document title, loading/empty/error states, buttons, setting-control prompts, picker cancellation, help headings, status feedback, yes/no/readiness labels, and ARIA/title text.

### Interaction Panel and native presentation

- The Palette remains the selected-Command and interaction-data owner. Its data flow is `stable/raw Commands + bindings + effectiveLocale -> localized interaction presentation`.
- A detached presentation revision is complete and internally consistent: `{ effectiveLocale, ariaLabel, kind, ...localizedContent }`. It contains localized description or mapping/action copy plus localized accessibility copy for that same locale.
- On `localization:changed`, the Palette provider updates, localized Command/interaction projections recompute, and the existing Interaction Panel layout effect calls the native host's open/update path with the revised complete presentation. The native D7 controller sends the revision to the already-created Panel window without close/reopen.
- The detached renderer holds only the latest owner-projected revision. It sets document language and renders content/ARIA from that revision; it does not fetch, persist, or subscribe to locale independently and cannot re-project raw Command data.
- Localize the browser-preview note.
- Native startup/hotkey dialogs use the main-process translator from the current snapshot. Unknown technical exceptions are logged and presented as a generic localized error; known structured error codes use mapped copy.

## 6. Error boundary

- Add a presentation mapper keyed by stable status/error code.
- Current known structured capability codes (for example Image Clipboard codes) receive English/Chinese UI messages.
- Standard feature lifecycle states are localized from `status` and `details`, not from domain `message` prose.
- Unknown Electron/runtime errors return a localized generic presentation message. Raw `error.message`, paths, and diagnostic details remain available to logs/tests but are not rendered as translated UI.
- Existing runtime error creation remains otherwise unchanged; expanding all domain error codes is deferred.

## 7. Compatibility, rollout, and rollback

- Existing command/capability manifests without `localizations` remain valid and display their English base metadata.
- Existing installs remain valid because missing `preferences.json` defaults to `system`; `config.json` and all capability roots remain untouched.
- No new runtime dependency is added. Resources ship in the existing renderer/main bundle.
- Existing Agentation/browser preview working-tree changes must be retained. Localization changes will extend its fake API rather than replace the route-gating code.
- Rollback is bounded: remove the Preferences/localization modules and optional manifest overlays; existing English base fields and execution IDs remain intact.

## 8. Verification design

- Pure unit tests: locale resolution matrix, translation fallback/no-key exposure/interpolation, command overlay validation/cloning/per-field fallback/localized search, error/status mapping.
- Persistence tests: default, valid round-trip, invalid input, malformed stored preference, and alternating/concurrent Preferences plus capability-config writes proving neither document can overwrite the other.
- IPC/preload tests: get/set channels, post-save broadcast, no detached-Panel locale API, and listener unsubscribe.
- Renderer/native presentation tests: English/Chinese Palette sections and status/empty/error strings; Settings option labels/lifecycle/schema copy; with D7 already open, `en -> zh-CN -> en` owner re-projection sends changed Command description/action/accessibility copy to the same Panel window without construction, close, or reopen.
- Integration/build: existing full Node/Python suite, Vite production build, targeted browser preview screenshots in both locales, Workflow package build/install, then Resolve-host manual switching across Palette + Settings + detached Panel.

## Unresolved architecture issues

- Electron does not provide a portable guaranteed live event for OS language changes. System preference is re-resolved on snapshot access/change and startup, not continuously monitored.
- Simultaneous capability-config writers from separate running Clackly hosts retain the repository's pre-existing last-writer-wins behavior inside `config.json`; locale persistence is isolated and cannot be overwritten by that document.
- External Command Package discovery/loading is not present, so this phase proves the contract through registry fixtures and built-in manifests only.
