# Feature Lifecycle

## Goal

Add a generic Feature Lifecycle projection so Feature UI can determine whether a feature should be shown, executed, warned, or routed to Settings before users reach avoidable execution errors.

The lifecycle system must preserve the existing execution boundary:

`Command ID -> Command Registry -> Capability ID -> Capability -> Execution Adapter`

It may add a disabled gate before execution, but it must not move Command-to-Capability mapping, configuration validation, provider selection, or Capability execution into the UI.

## Background

- FeatureCatalog currently projects registered Capability Metadata without runtime state.
- ConfigManager and SchemaValidator already own required configuration and can identify missing required keys.
- Capability implementations own provider availability. `marker.add` already checks injected backends and reports `CapabilityUnavailableError` when none can execute.
- Settings and command presentation currently receive metadata only; required config/provider failures are discovered during execution.
- No enablement storage, generic availability probe, lifecycle cache, status IPC, or status UI exists.

## Lifecycle Record

Use three independent dimensions plus structured recovery data:

```json
{
  "id": "ae.export",
  "installed": true,
  "enabled": true,
  "status": "missing-config",
  "message": "Missing After Effects Path",
  "details": {
    "missing": ["aePath"],
    "action": "open-settings"
  }
}
```

### Dimensions

- `installed: boolean` — whether the Capability is registered.
- `enabled: boolean` — persisted user enablement, defaulting to true.
- `status` — readiness health only:
  - `ready`
  - `loading`
  - `missing-config`
  - `missing-dependency`
  - `unavailable`
  - `error`

Installation, enablement, and readiness must remain independent. A feature may be installed and enabled while reporting missing configuration or dependencies.

### Message and Details

- `message` is concise user-facing text; ready may use null/empty text.
- `details` is a plain serializable object and is the machine-readable source for UI behavior.
- Minimum details contract:
  - `missing: string[]`
  - `action: "open-settings" | null`
- Renderer code must not parse `message` to decide behavior.

Status-specific rules:

- `ready`: empty `missing`, null action.
- `loading`: empty `missing`, null action; execution is temporarily unavailable.
- `missing-config`: missing schema keys; action is `open-settings`; message uses schema labels with field-key fallback.
- `missing-dependency`: stable missing dependency ids; action is `open-settings` only when Settings can repair/configure it.
- `unavailable`: no usable provider/backend and no specifically repairable missing dependency.
- `error`: an unexpected lifecycle/config/probe failure; do not serialize stacks or raw exception objects.

## Requirements

### R1: Feature Status Manager

1. Add `feature-status/FeatureStatusManager` as the single owner of lifecycle records and refresh logic.
2. Inject the existing Capability Registry and ConfigManager; do not create a second feature registry or schema catalog.
3. Expose status lookup/listing, refresh, enablement update, and a synchronous disabled assertion for Command Engine use.
4. Keep derived readiness records in memory only. Do not persist `status`, `message`, or `details`.
5. New registered features begin with a `loading` snapshot until refreshed.
6. Unknown feature lookup returns an uninstalled record; normal catalog listing contains registered features only.

### R2: Persisted Enablement

1. Add small `feature-status/FeatureStateStorage` persistence under shared `appData/Clackly/feature-status.json`.
2. Persist only capability-scoped `{ enabled: boolean }` overrides; absence means enabled.
3. Reload before reads/writes and preserve unrelated/unknown feature sections, matching existing shared-host configuration behavior.
4. Both Electron hosts use the same shared enablement file.
5. Settings provides one generic Enable/Disable control; no feature-specific toggle or page.
6. Command Engine keeps its Command-to-Capability routing and existing config checks, but refuses a disabled Capability before `capability.execute()`.

### R3: Readiness Calculation

Refresh registered features with this order:

1. Set/read `installed` from Capability Registry.
2. Read independent persisted `enabled` state.
3. Check missing required configuration through a new non-throwing ConfigManager projection.
4. If config is complete, run the Capability's optional side-effect-free availability probe.
5. Map expected probe results to `ready`, `missing-dependency`, or `unavailable`.
6. Map unexpected config/storage/probe failures to `error`.

Additional rules:

- Configuration completeness is checked before dependency probing.
- Missing configuration messages use schema field labels.
- A Capability may expose optional `checkAvailability()` returning plain readiness data. This does not replace or alter `execute()`.
- Capabilities without an availability probe default to ready once configuration is complete, preserving compatibility.
- `marker.add` implements the probe by reusing its existing side-effect-free backend selection; no available backend maps to `unavailable`.
- `missing-dependency` is returned only when a Capability probe names stable dependency ids.
- `error` represents the current refresh/probe failure and clears on a later successful refresh; it is not persisted execution history.

### R4: Feature UI Integration

1. Expose status list/refresh/set-enabled through the existing shared Feature UI IPC and preload boundary.
2. Settings loads lifecycle records alongside features/commands/config and refreshes them after Save, Reset, or Enable/Disable.
3. Settings sidebar displays a compact status indicator for non-ready or disabled features.
4. Hover and keyboard focus expose the lifecycle message through an accessible tooltip/description.
5. Feature detail displays current enablement and structured readiness information without capability-specific JSX.
6. Feature UI projection rules:
   - show feature only when installed;
   - allow execution only when installed, enabled, and ready;
   - show warning/progress for disabled or non-ready state;
   - use `details.action` for recovery behavior.
7. `details.action === "open-settings"` opens/focuses Settings and selects the affected feature.
8. Launcher, Search, and All Actions join Command `capability` to lifecycle records so direct command activation does not execute non-ready features.
9. Prototype commands retain their existing unavailable behavior and are not treated as installed capabilities.
10. Mouse Interaction Binding and keyboard execution retain the same Command ID routing. Command Engine remains the final disabled/config/capability gate.

### R5: Loading and Refresh

1. Status listing returns cached snapshots immediately; unrefreshed/new records may be `loading`.
2. Explicit refresh asynchronously computes final records and returns serializable snapshots.
3. No background polling is required. Refresh occurs on renderer load and after lifecycle/config mutations.
4. Status checks must not execute a Command, Capability action, keyboard shortcut, Resolve action, or other side effect.

## Acceptance Criteria

- [x] Lifecycle records expose independent `installed`, `enabled`, and readiness `status` fields plus structured `details`.
- [x] Status supports `ready`, `loading`, `missing-config`, `missing-dependency`, `unavailable`, and `error`.
- [x] Registered features default to enabled; enablement persists across manager/host restarts and unrelated entries are preserved.
- [x] Disabling a feature updates UI state and blocks Command execution before Capability execution without changing Command-to-Capability mapping.
- [x] Missing required configuration produces `missing-config`, schema keys in `details.missing`, an `open-settings` action, and a label-based message.
- [x] Configuration completeness is resolved before dependency probing.
- [x] A side-effect-free Capability availability probe can report ready, named missing dependencies, or unavailable providers.
- [x] Unexpected probe/config/storage failures produce sanitized, non-persisted `error` records and recover after a successful refresh.
- [x] Feature UI uses structured status data to decide visibility, execution permission, warning display, and Settings navigation without parsing messages.
- [x] Settings sidebar exposes status on hover and keyboard focus and offers a generic Enable/Disable control.
- [x] Save, Reset, and Enable/Disable refresh affected lifecycle records.
- [x] `open-settings` recovery selects the affected feature in the singleton Settings window.
- [x] Launcher, Search, and All Actions prevent direct execution of non-ready features while preserving prototype behavior.
- [x] Interaction Binding and Command Engine keep the same Command ID -> Capability ID -> Capability boundary.
- [x] No lifecycle status is persisted except the enablement override.
- [x] Focused lifecycle/storage/config/capability/IPC/renderer tests, full `npm test`, and production build pass.

## Out of Scope

- Installing/uninstalling capabilities or third-party plugin loading.
- Dependency installation, automatic repair, downloads, or package management.
- Persistent error/history/telemetry/health timelines.
- Background polling while Settings is closed.
- A generic action router beyond the single `open-settings` recovery action.
- Executing Commands from the feature detail panel.
- Changing Capability execution backend ordering or Command Metadata ownership.

## Deferred Items

- Add more structured recovery actions only when a real feature needs them.
- Add dependency-specific setup UI when actual Capability metadata/schema can repair that dependency.
- Add status change push events only if explicit refresh becomes insufficient for a real long-running lifecycle source.
