# Capability Registry Design

## Boundaries

The registry lives in `capability/` because it owns capability discovery, not command metadata. The command executor depends only on the registry contract. Host entrypoints remain composition roots: they construct adapters, construct capabilities, register those capabilities, and inject the registry into the executor.

```text
host composition
  -> registry.register("marker.add", markerCapability)

command id
  -> command registry
  -> command.capability
  -> capability registry.get()
  -> capability.execute(command)
  -> marker capability backend selection
  -> execution adapter
```

## Registry Contract

`createCapabilityRegistry()` returns one registry instance with:

- `register(capabilityId, capability)`: validates a non-empty id and an object with `execute()`, rejects duplicates, stores the object, and returns it.
- `get(capabilityId)`: returns the registered execution object or `null`.

The implementation uses JavaScript's built-in `Map`. It has no global state, scanning, metadata, or plugin behavior.

## Capability Contract

Registered capabilities expose `execute(command)`. `createMarkerCapability()` keeps `add(options)` and `selectBackend()` for its domain API and adds `execute` as the generic registry entry point, delegating to `add`.

The executor treats the capability as opaque. It does not parse `marker.add`, infer method names, or know backend details.

## Compatibility

- Command manifests remain unchanged.
- Marker capability selection order and errors remain unchanged.
- The existing missing-capability error text remains unchanged.
- The two Electron hosts keep their current host-specific adapter injection.

## Trade-offs

- Registration remains explicit in each host. A shared automatic bootstrap is deferred because the hosts currently inject different adapters and only one capability exists.
- Duplicate ids throw instead of overwrite, making internal registration mistakes visible early.
- Registry enumeration is deferred until an actual diagnostics or UI consumer requires it.

## Rollback

Revert the registry module, the executor injection change, the marker `execute` alias, and the two host registration changes. Command manifests and adapters require no rollback.

