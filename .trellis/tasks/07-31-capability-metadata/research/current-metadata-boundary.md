# Current Capability Metadata Boundary

## Evidence

- `capability/registry.js` uses an instance-local `Map`, validates `execute()`, rejects duplicate ids, and returns the stored capability object unchanged.
- `capability/marker.js` owns execution provider priority and returns an object containing `add`, `execute`, and `selectBackend`.
- Both Electron hosts call `registry.register("marker.add", markerCapability)` and inject the registry into the generic command executor.
- `command-engine/executor.js` uses only `registry.get(command.capability)` and `capability.execute(command)`.
- `command-engine/commands/timeline.json` already owns command-specific search metadata; it does not describe execution providers.
- The previous Capability Registry task explicitly deferred metadata and listing until a concrete caller needed them. The current request supplies that need for future Electron UI, configuration, and shortcut consumers.

## Minimal Extension

Keep the existing registration and execution contracts. Add a nested metadata object to the capability, validate it at registration, and project descriptive data through two new registry methods. This avoids host rewiring, a second catalog, new dependencies, and plugin scaffolding.
