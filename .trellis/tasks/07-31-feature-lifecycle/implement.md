# Feature Lifecycle Implementation Plan

## Phase 5.5.1: Lifecycle Core

- [x] Add FeatureStateStorage using existing atomic JSON storage mechanics and shared appData path.
- [x] Add FeatureStatusManager with fixed record shape, loading cache, list/get/refresh, setEnabled, and assertEnabled.
- [x] Add ConfigManager non-throwing missing-required projection with schema keys and labels available to the manager.
- [x] Add focused storage/manager tests for defaults, persistence, defensive reloads, unknown features, independent dimensions, precedence, details, sanitized errors, and recovery.

## Phase 5.5.2: Availability and Execution Gate

- [x] Add optional normalized `checkAvailability()` handling without changing Capability registration or execution signatures.
- [x] Reuse marker backend selection for its side-effect-free availability probe.
- [x] Map named dependencies, unavailable providers, malformed results, and unexpected errors in focused tests.
- [x] Inject FeatureStatusManager into both Command Executors and block disabled features before existing config/execution checks.
- [x] Preserve Command ID -> Capability ID mapping and Interaction Binding routing.

## Phase 5.5.3: IPC and Feature UI

- [x] Compose shared FeatureStateStorage/FeatureStatusManager in standalone and Workflow Integration hosts.
- [x] Extend shared Feature UI IPC/preload with list/refresh/set-enabled and feature-targeted Settings navigation.
- [x] Add renderer model helpers for visibility, execution permission, warnings, and recovery actions.
- [x] Update Settings sidebar/detail with accessible status indicator, tooltip/focus description, structured details, and generic Enable/Disable control.
- [x] Refresh lifecycle after load, Save, Reset, and enablement changes.
- [x] Join command capability ids to statuses in Launcher, Search, and All Actions; intercept non-ready activation without capability-specific branches.
- [x] Preserve prototype commands and existing status/help precedence.
- [x] Add/update CSS using existing tokens and Lucide icons only.

## Documentation and Specs

- [x] Update README with lifecycle dimensions, status taxonomy, details contract, persistence, and execution boundary.
- [x] Update backend/frontend quality specs with full cross-layer signatures, validation matrix, cases, tests, and wrong/correct examples.

## Validation

- [x] Syntax checks for feature-status/config/capability/command/electron modules.
- [x] Focused lifecycle/storage/config/capability/executor/IPC/renderer-model tests.
- [x] `npm test`
- [x] `npm run build`
- [x] `git diff --check`
- [x] Boundary searches for renderer Capability/provider/config parsing, message parsing, command-id feature branches, status persistence, and changed execution routing.
- [x] Verify both hosts use the same lifecycle IPC and appData file while keeping separate Capability providers.
- [x] Verify loading, ready, disabled, missing-config, missing-dependency, unavailable, error, open-settings selection, and recovery refresh states.

## Risky Files and Rollback Points

- `command-engine/executor.js`: add disabled gate only; preserve command lookup, config assertion, and capability execution order.
- Electron host entrypoints: keep lifecycle composition symmetric without changing Resolve/bridge setup.
- `electron/renderer/App.jsx`: preserve keyboard/mouse Interaction Binding semantics and prototype behavior while adding generic status interception.
- `SettingsApp.jsx`: status refresh must not overwrite unsaved draft config.
- FeatureStateStorage: never persist derived readiness/status/error data.

## Review Gate

- [x] All acceptance criteria map to focused tests, build checks, or boundary searches.
- [x] No second feature registry, dependency installer, polling system, execution history, generic action router, feature-specific UI, or changed Command/Capability mapping appears.
- [x] Final full-scope Trellis check passes before commit.
