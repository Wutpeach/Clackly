# Capability Metadata Design

## Boundary

The change stays inside the existing capability layer and registry. Command metadata, execution adapters, and host composition keep their current responsibilities.

## Capability Contract

Capabilities continue to expose `execute()` and may retain domain methods such as `add()` and `selectBackend()`. They additionally expose a separate `metadata` object:

```javascript
{
  metadata: {
    id: "marker.add",
    name: "Add Marker",
    description: "Add marker at current timeline position",
    category: "Timeline",
    icon: "marker",
    version: "1.0.0",
    type: "command",
    providers: ["resolve-api", "shortcut"]
  },
  execute,
  // existing domain methods remain unchanged
}
```

Keeping metadata nested makes the descriptive contract explicit without mixing it into execution arguments or changing the registry registration signature.

## Registry Contract

`createCapabilityRegistry()` remains an instance-local `Map` registry and exposes:

- `register(capabilityId, capability)`: validates the existing execution contract plus complete metadata and matching ids, stores the same capability object, and returns it.
- `get(capabilityId)`: unchanged; returns the executable capability object or `null`.
- `getMetadata(capabilityId)`: returns the registered capability's full metadata object or `null`.
- `getAllCapabilities()`: returns a fresh summary array containing only `id`, `name`, `category`, and `icon`.

The registry validates required string fields and a string-array `providers` field. No schema library, global catalog, second registry, or plugin abstraction is added.

## Data Flow

```text
host registration
  -> registry.register("marker.add", markerCapability)
  -> registry stores the executable capability with its metadata

command execution
  -> registry.get("marker.add")
  -> capability.execute(command)
  -> existing backend selection and execution adapter

future catalog consumer
  -> registry.getMetadata(id) or registry.getAllCapabilities()
  -> descriptive plain data only
```

## Compatibility

- Existing registry registration calls do not change.
- Existing command executor lookup does not change.
- Marker execution functions and backend ordering do not change.
- Metadata provider names are stable public descriptors and do not expose internal backend ids such as `workflowPluginApi`.
- No Electron IPC is added in this phase; the new registry methods are the data source for that later boundary.

## Risks and Rollback

- Risk: incomplete metadata could break future consumers. Mitigation: validate all required fields during registration.
- Risk: metadata id and registry key could diverge. Mitigation: require exact equality.
- Rollback is limited to the registry, marker metadata, focused tests, and documentation; no stored data or migration exists.
