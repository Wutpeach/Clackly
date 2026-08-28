# Localization foundation

## Goal

Give Clackly a lightweight, application-owned English / Simplified Chinese localization foundation so users can follow the system language or switch language in Settings and see every open Clackly surface update immediately. Establish an optional Command metadata contract that future package-owned Commands can localize without adding entries to Clackly's core UI resource files.

## Background and Confirmed Repository Facts

- The standalone and Resolve Workflow hosts both construct shared application services through `app/createClacklyCore.js`, but each host currently registers Command IPC separately (`electron/main/main.js:133-164`, `workflow-plugin/main.js:217-248`).
- Capability configuration persists in the shared `appData/Clackly/config.json` document through atomic `ConfigStorage` replacement. `ConfigManager` reloads and preserves sibling root keys on writes (`config/ConfigStorage.js:21-75`, `config/ConfigManager.js:61-112`). There is no application Preferences service today.
- The preload is the renderer boundary for Palette and Settings; the detached Interaction Panel currently has a restricted, presentation-only bridge (`electron/main/preload.js:3-52`).
- User-visible strings are currently distributed across Palette (`electron/renderer/App.jsx:97-105, 148-160, 272-276, 416-515, 579-737`), Settings (`electron/renderer/SettingsApp.jsx:19-35, 64-219, 224-367`), generic settings controls (`electron/renderer/SettingsRenderer.jsx:4-92`), model projection (`electron/renderer/model.mjs:17-26, 61-87, 126-147`), Interaction Panel (`electron/renderer/InteractionPanelContent.jsx:3-35`, `DetachedInteractionPanelApp.jsx:14-17`), browser preview data (`electron/renderer/browserPreview.mjs:3-78`), and native host dialogs (`electron/main/main.js:73-83, 173-180`, `workflow-plugin/main.js:251-307`).
- Command manifests require English `name`, `description`, `category`, and `keywords` and clone only those fields today (`command-engine/registry.js:29-83`). Palette-side search uses the returned display metadata (`electron/renderer/model.mjs:91-123`).
- Capability metadata and config schema labels are also displayed in Settings (`feature-ui/FeatureCatalog.js:14-19`, `electron/renderer/SettingsApp.jsx:241-345`).
- Feature status keeps stable status/action/detail fields, but also carries hard-coded English messages that presentation currently renders (`feature-status/FeatureStatusManager.js:8-54, 80-160`).
- Existing uncommitted Agentation/browser-preview edits overlap `electron/renderer/App.jsx`, `browserPreview.mjs`, `browserPreview.test.mjs`, `package.json`, and `package-lock.json`; implementation must preserve and integrate with them.

## Requirements

### Locale ownership and resolution

- `Preferences` is the only mutable source of truth for locale preference and accepts exactly `system`, `en`, or `zh-CN`.
- Locale preference persists in an application-owned `appData/Clackly/preferences.json` document. `ConfigManager` remains the sole capability-domain writer of `config.json`; Preferences does not create a second full-document write authority for that file.
- The localization layer resolves preference plus host-provided system languages into one effective locale.
- Explicit `en` and `zh-CN` always win. `system` resolves English system locales to `en`, Simplified Chinese locales (`zh-CN`, `zh-SG`, or a `zh-Hans` tag) to `zh-CN`, and unsupported locales—including Traditional Chinese tags—to English.
- Invalid persisted preference degrades to `system`; invalid writes are rejected.
- Windows/components may cache a read-only snapshot for rendering but may not own or independently persist language state.

### Live update behavior

- Settings exposes a coherent application Preferences/General view with a Language selector containing `System Default`, `English`, and `简体中文`.
- Changing the selector persists first, then broadcasts the new preference/effective locale from the main-process authority to every open Clackly renderer.
- Palette, Settings, and detached/attached Interaction Panel update without a process or window restart. The document language and accessible labels update with visible copy.
- The detached Panel does not independently combine a long-lived localized payload with a separately changing locale snapshot. The Palette owner re-projects stable/raw interaction metadata whenever effective locale changes and sends one complete revised presentation (including effective locale and localized accessibility copy) to the existing detached window.
- System locale is supplied by the Electron host. Browser preview may use an isolated in-memory/navigator-backed adapter and must not become production authority.

### Presentation localization boundary

- Core UI translations live in small bundled English and Simplified Chinese resource objects with English as the fallback locale.
- The translation API performs per-key English fallback. If a core key is absent from both locales it returns a safe English presentation fallback and never displays the key.
- Presentation helpers localize standard lifecycle/status/error codes. Domain/runtime/capability execution remains locale-independent and receives only stable IDs and ordinary configuration.
- Known structured runtime error codes are mapped by presentation. Unknown/unstructured errors show a localized generic failure instead of exposing raw implementation messages; internal logs may retain technical details.
- No new user-visible literal may be added directly to Palette, Settings, Interaction Panel, or their presentation models outside locale resources or package-owned metadata fallback fields.

### Command and feature display metadata

- Existing required Command `name`, `description`, `category`, and `keywords` remain the English fallback and preserve backward compatibility.
- A Command may optionally provide package-owned locale overlays. Each overlay may independently define `name`, `description`, `category`, and `keywords`; missing locale or field falls back to the English base field.
- Malformed locale metadata is rejected at the Command manifest boundary and cloned without sharing mutable arrays/objects.
- Search uses effective-locale name/keywords plus stable Command ID, so Chinese terms work in Simplified Chinese while English fallback remains usable.
- Built-in Commands provide complete Simplified Chinese overlays. Existing capability/feature metadata and config schema fields displayed in Settings receive the same presentation-only overlay behavior needed for a complete bilingual Settings UI.
- Stable Command, capability, feature, binding, and error IDs are never translated.

### Migrated user-visible scope

- Main Palette: search/launcher labels, section headings, command metadata, lifecycle status, loading/execution feedback, tooltips, footer controls, empty/search-empty states, and accessibility copy.
- Settings: native/document title, titlebar, General/Language UI, feature navigation and metadata, lifecycle labels/values/actions, schema labels/options/control prompts, interaction help, feedback, loading/empty/error states, and action buttons.
- Interaction Panel: localized Command descriptions/action names, input labels where linguistic, preview note, and accessibility names in attached and detached presentations.
- Native host presentation: common startup and hotkey-registration dialogs that are part of Clackly's user-facing error path.
- Browser preview/test fixtures: bilingual metadata and a production-isolated preference adapter sufficient to validate both locales.

## Acceptance Criteria

- [ ] English and Simplified Chinese each provide a complete, operable Palette, Settings, and Interaction Panel for every currently visible built-in Command/feature.
- [ ] Settings persists `system`, `en`, and `zh-CN`; reopening the app restores the saved preference.
- [ ] Alternating or concurrent locale-preference and capability-config writes cannot overwrite one another because they have distinct document authorities; tests prove both persisted values survive writes in either order.
- [ ] `system` resolves supported English/Simplified-Chinese tags correctly and falls back to English for unsupported/Traditional-Chinese tags.
- [ ] Changing Language updates every already-open Clackly renderer, including a visible detached Interaction Panel, without restart.
- [ ] While the detached Panel is open, switching `en -> zh-CN -> en` updates Command name/description/interaction copy in the same Panel window without close/reopen and without a second locale/content authority in that renderer.
- [ ] There is one locale preference authority in `Preferences`; no component, Window, Command executor, runtime, or capability persists its own language choice.
- [ ] Command execution and interaction IPC continue to use stable Command IDs and do not receive locale state.
- [ ] Missing Simplified Chinese command metadata fields and missing core translations fall back to safe English copy; no translation key is presented to users.
- [ ] Current built-in Command manifests satisfy the optional localization contract, while an English-only third-party-style fixture remains valid and usable.
- [ ] Chinese command names/keywords are searchable under `zh-CN`; stable IDs and English fallback remain searchable.
- [ ] Locale resolution, translation/metadata fallback, preference validation/persistence, IPC broadcast, open-renderer synchronization, and representative Palette/Settings/Interaction presentation behavior have automated coverage.
- [ ] Production build and the full relevant Node test suite pass; the Workflow package is rebuilt/installed before requesting Resolve-host manual acceptance.
- [ ] A final source audit reports any remaining user-visible hard-coded strings, distinguishing intentional English fallback metadata/internal diagnostics from presentation leaks.

## Out of Scope

- Languages other than English and Simplified Chinese as shipped product locales.
- Remote/online language packs, translation management platforms, automatic translation, pluralization frameworks, or a general-purpose ICU implementation.
- A complete external Command Package loader/SDK; only the metadata/resource contract and current registry support are included.
- Translating stable identifiers, persisted project/user content, file paths, Resolve/After Effects product names, keyboard key names, or internal logs/diagnostic exception text.
- Unrelated visual redesign or Command/runtime architecture refactoring.

## Risks and Deferred Items

- Existing domain errors without machine-readable codes cannot be meaningfully translated; this task will present a localized generic fallback and retain the raw error only for diagnostics rather than expanding every runtime error taxonomy.
- Existing capability configuration retains its current `ConfigManager`/`config.json` last-writer-wins behavior across truly simultaneous host processes. This task does not worsen or redesign that pre-existing capability-only contract: Preferences writes a separate document and therefore cannot participate in or lose updates to capability roots.
- A system-language change made while Electron is already running is not guaranteed to be emitted by the OS. `system` is re-resolved whenever the authoritative snapshot is read/changed and on next launch; OS-level live locale-change monitoring is not added.
