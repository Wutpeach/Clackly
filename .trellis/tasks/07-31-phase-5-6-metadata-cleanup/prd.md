# Phase 5.6 Metadata Cleanup

## Goal

Make the Phase 5 Feature UI Framework fully metadata-driven so Feature Metadata, Command Metadata, Interaction Binding, and Config Schema are the authoritative data sources while renderer code only projects and renders their data.

## Background

- The Phase 5 architecture review passed the core UI/IPC/Command/Capability boundary.
- Functional Feature identity and `configSchema` already come from Capability Metadata through Capability Registry and FeatureCatalog.
- Renderer command presentation still contains hard-coded real-command category/icon/shortcut overrides and a hard-coded prototype catalog.
- Command Metadata currently duplicates mouse triggers inside `interactionHelp`, while BindingStorage owns the executable trigger mapping.
- Schema field-label fallback is independently implemented in ConfigManager and the renderer.
- The current execution chain is `Command ID -> Command Registry -> Capability ID -> Capability -> Execution Adapter` and must remain unchanged.

## Requirements

### R1: Command Metadata Owns Command Presentation

1. Remove real-command presentation overrides from Launcher/renderer code.
2. Extend validated Command Metadata as needed so registered Commands provide their own name, description, category, and icon through Command Registry.
3. Launcher, Search, All Actions, Settings command sections, ranking, and accessibility labels consume the Registry projection without command-id-specific presentation branches.
4. A newly registered Command must appear with its declared presentation metadata without renderer edits.
5. Remove the renderer-owned prototype catalog, browser-preview Command fixture, hard-coded initial pinned/recent Command ids, and the unsupported shortcut badge rather than introducing prototype or shortcut metadata in this task.

### R2: Interaction Binding Owns Triggers

1. Remove `trigger` duplication from Command Metadata and command manifests.
2. Interaction Binding remains the sole owner of target + trigger -> Command ID routing.
3. Interaction Help is projected from normalized Binding data plus the target/action Command description; renderer code does not synthesize command-specific help.
4. Binding edits must automatically change rendered trigger help without editing Command Metadata.
5. Binding validation, matching, persistence, and execution behavior remain owned by the existing interaction layer.

### R3: Shared Schema Label Utility

1. Add one shared Schema utility for explicit-label lookup and field-key fallback formatting.
2. ConfigManager and FeatureCatalog consume the same utility; SettingsRenderer only renders the resolved `field.label`.
3. SchemaValidator remains the owner of supported types and schema/value validation.

### R4: Preserve Execution Boundaries

1. Do not change Command Engine execution behavior or its public contract.
2. Do not change Capability execution, provider selection, or Capability Registry execution-object behavior.
3. Do not change Execution Adapter or Resolve API boundaries.
4. UI continues to use semantic preload/IPC methods and never receives executable Capability objects, ConfigStorage, BindingStorage, or Resolve objects.

## Acceptance Criteria

- [x] No functional Command id is used by renderer code to choose name, category, icon, description, shortcut, or other presentation data.
- [x] Launcher, Search, and All Actions list registered Commands from Command Registry metadata.
- [x] Renderer-owned prototype commands and Command fixtures are removed; an empty browser preview renders the normal empty catalog state.
- [x] Command Metadata validation requires the presentation fields needed by the UI and returns defensive projections through list/search/lookup.
- [x] Command manifests no longer repeat Interaction Binding triggers.
- [x] Rendered Interaction Help is derived from normalized bindings plus Command descriptions.
- [x] Changing a binding trigger changes tooltip/help output without changing Command Metadata or renderer code.
- [x] Settings command-help sections use the same generated help projection as palette surfaces.
- [x] ConfigManager missing-config messages and Settings field labels originate from one Schema label resolver; renderer code contains no fallback formatter.
- [x] FeatureCatalog continues to derive functional Feature identity and schema only from Capability Registry metadata.
- [x] Command execution, interaction execution, lifecycle gates, capability routing, providers, adapters, and Resolve integration remain behaviorally unchanged.
- [x] Focused metadata/binding/help/schema tests, full project tests, production build, boundary searches, and `git diff --check` pass.

## Out of Scope

- Changing Command Engine, Capability execution, backend priority, Execution Adapter, or Resolve API behavior.
- Adding a general metadata registry beyond the existing Command and Capability registries.
- Adding a binding editor, shortcut editor, dependency installer, or new Feature-specific Settings page.
- Persisting renderer presentation state as a replacement for Metadata.
- Refactoring the bridge Command-ID protocol coupling identified by the review.

## Key Decisions

- Remove prototype Command cards. They return only when real Command and Capability metadata exist.
- Remove the hard-coded shortcut badge. Shortcut presentation is deferred until an authoritative metadata source is explicitly designed.
- Keep this as one task because Command metadata, binding-derived help, and renderer cleanup share one catalog projection and one cross-layer validation gate.
