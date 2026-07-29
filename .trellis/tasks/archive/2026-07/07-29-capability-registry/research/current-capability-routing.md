# Current Capability Routing

## Evidence

- `command-engine/executor.js` currently accepts `capabilityHandlers` and directly indexes `capabilityHandlers[command.capability]`.
- `electron/main/main.js` constructs the bridge-backed marker capability and injects `{ "marker.add": markerCapability.add }`.
- `workflow-plugin/main.js` constructs the Workflow Integration-backed marker capability and injects the same plain-object mapping.
- `capability/marker.js` already owns backend availability, priority, and execution fallback behavior through `add()` and `selectBackend()`.
- Command manifests already expose intent-only `capability` metadata.
- Existing backend specs require `command-engine/` to remain free of concrete adapters and keyboard/Resolve implementations.

## Prior Decisions Recovered from Session History

- Commands describe intent and must not know Resolve APIs or keyboard operations.
- Only pre-execution unavailability may fall through to another backend; execution errors propagate immediately.
- Each host injects the adapter available in that runtime.
- Shortcut mapping alone must not claim executable keyboard support.

## Planning Conclusion

The smallest registry is an explicit, instance-level `Map` wrapper placed between executor and capability. It replaces duplicated plain handler tables without changing adapter or backend-selection code. A plugin/bootstrap system is unnecessary for the current internal-only scope.

