# Phase 5.6 Metadata Cleanup Implementation Plan

## 5.6.1 Command Metadata and Catalog

- [x] Add required Command `description`, `category`, and `icon` validation and defensive cloning.
- [x] Update the live Command manifest and registry tests; remove `interactionHelp` metadata support.
- [x] Remove prototype catalog, real-command presentation overrides, browser Command fixtures, initial pinned/recent ids, shortcut badges, and shortcut hint fallback.
- [x] Make Launcher, Search, All Actions, accessibility labels, and empty states consume only registered Command metadata plus lifecycle projection.

## 5.6.2 Binding-Derived Help

- [x] Add a read-only normalized binding listing operation to the existing interaction layer.
- [x] Register the same binding-list IPC/preload method in standalone and Workflow Integration hosts.
- [x] Add one pure renderer projection that joins target bindings to action Command descriptions and formats generic trigger labels.
- [x] Use the projection in Palette and Settings; remove reads of `command.interactionHelp`.
- [x] Cover left/right/modifier ordering, remapped action Commands, empty bindings, and unresolved action Commands.

## 5.6.3 Shared Schema Labels

- [x] Add the minimum shared Schema label utility with explicit-label and field-key fallback behavior.
- [x] Use it in ConfigManager missing-required projection.
- [x] Use it in FeatureCatalog to return cloned schemas with resolved labels.
- [x] Remove renderer label generation and cover explicit/fallback labels plus immutability.

## Documentation and Specs

- [x] Update README architecture/source-of-truth notes.
- [x] Replace prior backend Interaction Help and Command Metadata contracts with binding-derived help and required presentation metadata.
- [x] Update frontend specs to remove prototype requirements and document Registry-only command presentation.
- [x] Preserve full seven-section cross-layer contract depth.

## Validation

- [x] Focused Command Registry, BindingStorage/InteractionManager, FeatureCatalog, ConfigManager, IPC, and renderer-model tests.
- [x] `npm test`
- [x] `npm run build`
- [x] Syntax checks for changed CommonJS and ESM modules.
- [x] `git diff --check`
- [x] Boundary searches: no renderer Command-id presentation branches, prototypes, duplicated help triggers, renderer label fallback, backend/Resolve imports, or changed executor/adapter code.
- [x] Verify Command Engine, Capability, Execution Adapter, and Resolve files have no behavioral diff.

## Risky Files and Rollback Points

- `command-engine/registry.js`: metadata shape changes only; preserve lookup/search/cache semantics.
- `interaction/InteractionManager.js`: add read-only listing without changing matching/execution.
- Both host entrypoints/preload: keep IPC composition symmetric.
- `electron/renderer/model.mjs` and `App.jsx`: remove fixtures without regressing lifecycle fail-closed behavior, keyboard navigation, or interaction routing.
- `SettingsApp.jsx`: generated help must use the same binding projection without changing config drafts/lifecycle refresh.

## Review Gate

- [x] Prototype removal decision is reflected in code, tests, README, and specs.
- [x] Four authoritative sources remain: Feature Metadata, Command Metadata, Interaction Binding, Config Schema.
- [x] No new registry, metadata store, generic router, binding editor, shortcut schema, or feature-specific UI is introduced.
- [x] Final full-scope Trellis check passes before commit.
