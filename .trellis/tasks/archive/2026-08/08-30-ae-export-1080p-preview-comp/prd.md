# Add optional 1080p AE preview composition

## Goal

Add one shared, default-off `ae.export` setting that can create a 1920 x 1080
preview composition around the existing Resolve-timeline-resolution After
Effects composition. The wrapper makes large or non-16:9 exports convenient to
preview without changing the canonical exported composition or the existing
Resolve-to-AE architecture.

## Background

- All three shipped Export-to-AE Commands target the same `ae.export`
  Capability and managed Python entry
  (`resolve-command-center/command-engine/commands/after-effects.json:1`,
  `resolve-command-center/capability/definitions/ae-export.json:17`).
- The shared entry maps only Command selection/media policy and calls the same
  export core (`resolve-command-center/scripts/resolve2ae_export.py:6`,
  `resolve-command-center/scripts/resolve2ae_export.py:28`).
- The export core owns source composition width, height, duration, frame rate,
  name, JSX generation, and all source layers
  (`resolve-command-center/resolve2ae_core/export.py:579`,
  `resolve-command-center/resolve2ae_core/export.py:616`,
  `resolve-command-center/resolve2ae_core/export.py:618`).
- `RuntimeManager` already sends the complete `ae.export` config through the
  dedicated persistent Python worker and retains the host-owned After Effects
  launch boundary (`resolve-command-center/script-runtime/runtime/manager.js:95`,
  `resolve-command-center/script-runtime/runtime/manager.js:115`,
  `resolve-command-center/script-runtime/runtime/manager.js:142`).
- Boolean schema fields already render as generic Settings checkboxes; the
  renderer has no Capability-specific branch
  (`resolve-command-center/electron/renderer/model.mjs:183`,
  `resolve-command-center/electron/renderer/SettingsRenderer.jsx:22`).

## Requirements

### R1. One default-off Capability setting

- Add one optional boolean field named `create1080pPreviewComp` to the existing
  `ae.export` config schema.
- An absent value and an explicit `false` both mean disabled. Existing saved
  configurations therefore remain disabled without migration or a config-file
  rewrite.
- Use the English label `Create 1080p Preview Comp` and a Simplified Chinese
  localized label through the existing metadata localization mechanism.
- Let the existing schema-driven Settings renderer project the field as a
  checkbox. Do not add Renderer state, a custom control, or a Capability-id
  branch.

### R2. Preserve disabled behavior

- When disabled or absent, all three Commands must retain their current shared
  execution path, result shape, source JSX, composition name, and output.
- Existing export snapshots are compatibility authority and must remain
  unchanged in the disabled state.

### R3. Preserve the canonical source composition

- Always create and completely populate the source composition first using the
  existing timeline-derived width, height, duration, frame rate, pixel aspect,
  naming, layer content, and viewer behavior.
- Do not resize, rename, replace, mutate, or remove source-comp content for the
  preview feature.
- Do not change Resolve adapters, TimelineRange ownership, Command definitions,
  or selection/media policies.

### R4. Create one optional presentation wrapper

- When enabled, append creation of one 1920 x 1080, square-pixel After Effects
  composition after source layer construction and before the existing undo
  group ends.
- Name it by appending the deterministic suffix `_Preview_1080p` to the already
  generated source composition name. This reuses the source prefix, timeline,
  scope, and timestamp collision convention rather than introducing an
  independent naming system.
- Use the source composition's duration and frame rate as the wrapper timing
  authority.
- Add the source composition exactly once as a nested layer. The source
  composition remains independently available.
- Preserve the current source-comp `openInViewer()` behavior; creating the
  optional wrapper does not introduce a second viewer-selection policy.

### R5. Fit inside without crop or stretch

- Center the nested source layer at the preview composition center.
- Compute a uniform AE Scale percentage from
  `min(1920 / sourceWidth, 1080 / sourceHeight) * 100`.
- Set identical X and Y scale values. Do not crop, stretch, fill, or hard-code
  50 percent.
- Keep the calculation local to preview-wrapper JSX generation; do not create a
  generalized layout or resolution abstraction.

### R6. Preserve runtime and ownership boundaries

- Continue using `ae.export` -> shared script entry -> export core -> bounded
  JSX launch plan -> host-owned After Effects launcher.
- Continue using the dedicated persistent Python worker for all three Commands.
- Do not move composition policy into Commands, Settings, Resolve adapters,
  Electron host code, or persistent-worker infrastructure.

## Acceptance Criteria

- [x] AC1: A fresh or legacy config with no `create1080pPreviewComp` value
  presents and executes as disabled.
- [x] AC2: The schema field is a localized boolean and the generic Settings
  renderer projects it as a checkbox without a feature-specific branch.
- [x] AC3: Disabled export snapshots remain byte-for-byte unchanged.
- [x] AC4: Each of the three current Export-to-AE Command ids passes the same
  boolean through `resolve2ae_export.execute()` to `process_and_send()`.
- [x] AC5: Enabled output still creates and fully populates the original
  timeline-resolution source composition under its current name.
- [x] AC6: Enabled output additionally creates exactly one 1920 x 1080 preview
  composition named `<source-name>_Preview_1080p` after source construction.
- [x] AC7: The preview uses source-comp duration and frame rate, nests the source
  comp once, and explicitly centers that layer.
- [x] AC8: A 3840 x 2160 source evaluates to 50 percent uniform scale.
- [x] AC9: At least one non-16:9 source proves the minimum-ratio fit calculation;
  for example, 2048 x 1536 evaluates to 70.3125 percent rather than 50 percent.
- [x] AC10: X/Y scales are equal and the fit ratio leaves the entire source
  visible with no crop or stretch.
- [x] AC11: Command manifests, Resolve adapters, TimelineRange, persistent-worker
  routing, and After Effects host launch lifecycle require no implementation
  changes.
- [x] AC12: Focused bridge/core tests, existing AE export snapshots, the relevant
  Node test suite, and the package build pass.

## Out of Scope

- Configurable preview dimensions or 1440p/4K presets.
- Fit/Fill/Stretch selection.
- Changes to source composition resolution, content, naming, or ownership.
- Per-Command settings or duplicated Command implementations.
- Settings UI redesign or a custom renderer control.
- Export pipeline, persistent worker, Resolve adapter, or TimelineRange refactor.
- A generalized wrapper/layout framework.

## Architecture Conflict Gate

Repository inspection found no conflict with the requested boundaries. If
implementation nevertheless requires bypassing the shared `ae.export` entry,
moving composition construction out of the Python core, or changing the
persistent-worker request/lifecycle contract, implementation must stop and the
conflict must be returned for review.
