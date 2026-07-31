# Add Capability Metadata

## Goal

Extend the existing internal Capability Registry so each registered capability describes itself for future UI, configuration, and shortcut consumers without changing capability execution behavior or introducing a plugin system.

## Background

- The runtime already follows `command engine -> capability registry -> capability -> execution adapter`.
- `createCapabilityRegistry()` currently stores execution objects by capability id and exposes only `register()` and `get()`.
- `createMarkerCapability()` is the only current capability and already owns provider selection and execution fallback.
- Electron hosts explicitly register the marker capability; command execution resolves it through `registry.get()`.
- Command manifest metadata remains separate and continues to describe commands, not execution providers.

## Requirements

1. Every registered capability must expose descriptive metadata containing:
   - `id`
   - `name`
   - `description`
   - `category`
   - `icon`
   - `version`
   - `type`
   - `providers`
2. Preserve the existing `register(capabilityId, capability)` and `get(capabilityId)` execution contract.
3. Registration must reject missing, malformed, or id-mismatched capability metadata so catalog consumers receive a complete internal contract.
4. Add `registry.getMetadata(capabilityId)`, returning the full metadata object or `null` when the capability is not registered.
5. Add `registry.getAllCapabilities()`, returning UI-safe summary objects with only `id`, `name`, `category`, and `icon`.
6. Define metadata for `marker.add` with the requested user-facing values and a semantic version; its supported provider families are `resolve-api` and `shortcut`.
7. Metadata describes supported provider families, not runtime availability in a specific host.
8. Capability backend priority, fallback behavior, adapters, command execution, command manifests, and host composition must remain unchanged.

## Acceptance Criteria

- [x] `registry.get("marker.add")` returns the same executable capability object as before.
- [x] `registry.getMetadata("marker.add")` returns all required metadata fields.
- [x] `registry.getMetadata("missing")` returns `null` for an unknown capability id.
- [x] `registry.getAllCapabilities()` returns `[{ id, name, category, icon }]` for the registered marker capability without execution functions or provider details.
- [x] Registration rejects a capability whose metadata is missing, malformed, or has an `id` different from its registration key.
- [x] `timeline.addMarker` still resolves and executes through the existing registry and marker capability path.
- [x] Marker backend selection and execution-error behavior remain covered by the existing tests.
- [x] The full project test command and production build pass.

## Out of Scope

- Plugin Manifest
- SDK or public extension API
- Third-party or dynamic plugin loading
- Automatic capability discovery or filesystem scanning
- Persisted registry data
- Electron renderer or IPC integration for the capability catalog
- Runtime provider availability reporting
- Refactoring command manifests, execution adapters, or marker backend selection

## Deferred Items

- Expose the capability catalog over Electron IPC when a concrete UI consumer is implemented.
- Add provider-specific configuration schemas or availability state when configuration or diagnostics require them.
