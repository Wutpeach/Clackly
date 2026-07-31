# Feature Lifecycle Design

## Boundary

Feature Lifecycle is a projection and enablement gate around existing owners:

```text
Capability Registry -----> installed + Capability object/metadata
ConfigManager -----------> missing required config
FeatureStateStorage -----> persisted enabled override
Capability probe --------> dependency/provider readiness
                              |
                              v
                    FeatureStatusManager
                              |
                plain serializable lifecycle records
                              |
                 Feature UI IPC / preload / renderer
```

Command execution remains:

```text
Command ID -> Command Registry -> Capability ID
  -> FeatureStatusManager.assertEnabled()
  -> ConfigManager.assertConfigured()
  -> Capability.execute() -> Execution Adapter
```

The new gate does not remap Commands, select providers, or replace Capability execution.

## FeatureStateStorage

Use the existing small atomic JSON storage mechanics through composition rather than new filesystem code. Store:

```json
{
  "ae.export": { "enabled": false }
}
```

Missing entry means enabled. Only explicit false/true overrides are accepted. Reads/writes reload the shared document so standalone and Workflow Integration observe sequential changes. Unknown sections are preserved.

## FeatureStatusManager Contract

```javascript
new FeatureStatusManager({ capabilityRegistry, configManager, stateStorage })

manager.list()
manager.get(featureId)
manager.refresh(featureId?)
manager.setEnabled(featureId, enabled)
manager.assertEnabled(featureId)
```

- `list()`/`get()` return defensive snapshots from the in-memory cache, creating `loading` records for registered uncached features.
- `refresh()` is async and computes one/all final records.
- `setEnabled()` validates registration and boolean input, persists the override, updates the cached dimension, then returns/refreshed status.
- `assertEnabled()` is synchronous and storage-backed; it rejects unknown/disabled features without dependency probing.

Every record always contains the same keys: `id`, `installed`, `enabled`, `status`, `message`, and `details: { missing, action }`.

## Readiness Algorithm

For a registered feature:

1. Create/update cached snapshot to `loading`.
2. Read enabled independently.
3. Ask ConfigManager for missing required config keys.
4. If missing, return `missing-config` with schema-label message and `open-settings`.
5. Otherwise call optional `capability.checkAvailability()`.
6. No probe -> `ready` for backwards compatibility.
7. Normalize probe output:
   - available/ready -> `ready`
   - named missing dependencies -> `missing-dependency`
   - unavailable provider -> `unavailable`
8. Unexpected errors -> sanitized `error`.

The algorithm may still calculate readiness for disabled features because the three dimensions are independent. UI prioritizes disabled for execution but may display the underlying readiness reason.

## Capability Availability Contract

Optional side-effect-free method:

```javascript
async checkAvailability() {
  return {
    status: "ready" | "missing-dependency" | "unavailable",
    message: string | null,
    details: {
      missing: string[],
      action: "open-settings" | null
    }
  };
}
```

FeatureStatusManager validates/normalizes this plain result. It does not accept `loading` or `error` from a Capability: loading is manager-owned and exceptions become error.

`marker.add` reuses `selectBackend()` without executing `addMarker()`. A selected backend is ready; `CapabilityUnavailableError` becomes unavailable.

## IPC and Window Selection

Extend the existing shared Feature UI registrar and preload with semantic methods:

- `listFeatureStatuses()`
- `refreshFeatureStatuses(featureId?)`
- `setFeatureEnabled(featureId, enabled)`
- `openSettings(featureId?)`
- `onSettingsFeatureSelected(callback)` for an already-open Settings window

Opening Settings with an id creates the same singleton window or focuses it, then sends the selection after renderer readiness. The renderer never sends window dimensions or Capability methods.

## Renderer Projection

Create pure model helpers for:

- joining feature status to Feature/Command metadata by capability id;
- `isFeatureVisible(record)`;
- `canExecuteFeature(record)`;
- warning/loading presentation;
- recovery action selection.

SettingsApp owns status fetch/refresh state, not the generic SettingsRenderer. Sidebar feature buttons render a small icon/badge with accessible description. Detail renders the generic enable toggle and status explanation.

Palette command activation checks the joined lifecycle snapshot before direct command/interaction IPC:

- ready/enabled -> existing path;
- loading -> show loading feedback;
- open-settings recovery -> open selected Settings feature;
- other non-ready -> show lifecycle message.

The Command Engine disabled gate remains necessary for non-renderer callers and stale UI state.

## Compatibility and Rollback

- Existing config and bindings files are unchanged.
- Existing capabilities without `checkAvailability()` remain ready when configured.
- Existing Command manifests and Capability registration signatures remain valid.
- Rollback removes FeatureStatus modules/APIs/UI and executor enablement injection; the small enablement file can remain harmlessly unused.

## Risks and Deliberate Limits

- Availability probes can become slow; explicit refresh and loading cache avoid polling. Add push events only when real long-running probes require them.
- Double-checking provider availability at UI refresh and Capability execution is intentional: status is advisory, execution remains authoritative.
- The current live Capability has no required config or named external dependency; fixtures must cover missing-config/dependency/error behavior.
