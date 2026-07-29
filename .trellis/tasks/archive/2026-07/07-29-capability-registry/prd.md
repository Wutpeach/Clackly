# Add Lightweight Capability Registry

## Goal

Add a small internal Capability Registry so command execution discovers capabilities by intent id instead of receiving a host-owned plain handler table. This keeps the command engine independent from concrete capability files and provides a clear registration point as the command catalog grows.

## Background

- Commands already describe intent with `capability`, for example `marker.add`.
- `createCommandExecutor` currently receives a plain `capabilityHandlers` object and indexes it directly.
- The standalone Electron host and Workflow Integration host each construct `markerCapability` and duplicate the `"marker.add": markerCapability.add` mapping.
- Capability backend selection and execution-adapter behavior are already implemented and must remain unchanged.

## Requirements

1. Add an internal Capability Registry with explicit `register(capabilityId, capability)` and `get(capabilityId)` operations.
2. Register the marker capability as an execution object under `marker.add`.
3. Give capability execution objects a generic `execute(command)` entry point; the marker capability may retain its existing `add()` API.
4. Change the command executor to retrieve `command.capability` from the injected registry and invoke the returned execution object.
5. Keep concrete capability imports and backend construction in host composition code, outside `command-engine/`.
6. Preserve the existing architecture and backend-selection semantics:

   ```text
   command-engine
     -> capability registry
     -> capability
     -> execution adapter
   ```

7. Reject duplicate capability ids instead of silently replacing an existing registration.
8. Preserve existing unknown-command and missing-capability error behavior.

## Acceptance Criteria

- [x] `command-engine/executor.js` does not import or name any concrete capability module.
- [x] Both Electron hosts register `marker.add` through the Capability Registry.
- [x] Executing `timeline.addMarker` resolves `marker.add` from the registry and invokes the marker capability execution object.
- [x] An unknown command still reports `Unknown command`.
- [x] An unregistered capability still reports `No capability handler registered`.
- [x] Duplicate capability registration fails clearly.
- [x] Existing marker backend priority and no-fallback-after-execution semantics remain covered by tests.
- [x] JavaScript and Python tests pass, and the Electron production build succeeds.

## Out of Scope

- Plugin SDK
- Plugin manifests
- Dynamic plugin discovery or loading
- Filesystem scanning or automatic registration
- Third-party capabilities
- Registry persistence, lifecycle hooks, metadata catalogs, versioning, or dependency resolution
- Refactoring the existing Resolve adapters, Shortcut Manager, or capability backend-selection rules

## Technical Notes

- Use the platform-native `Map`; no dependency is needed.
- Prefer an instance factory over a process-global singleton so each host can register capabilities backed by its own adapters.
- Keep the registry API intentionally limited to registration and lookup. Add listing or plugin-oriented metadata only when a concrete caller needs it.
