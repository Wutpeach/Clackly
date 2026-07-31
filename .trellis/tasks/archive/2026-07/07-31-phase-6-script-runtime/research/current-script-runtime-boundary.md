# Current Script Runtime Boundary

## Confirmed Repository Facts

- `command-engine/executor.js` owns Command lookup, lifecycle/configuration gates, Capability lookup, and the call to `capability.execute(command, { config })`.
- `capability/registry.js` stores executable objects, validates Capability Metadata and Config Schema, and is the source for FeatureCatalog.
- `command-engine/registry.js` already discovers sorted JSON manifests from a directory; this is the smallest existing pattern for future no-host-edit script Feature onboarding.
- Both Electron hosts explicitly register `marker.add`, then construct ConfigManager, FeatureStatusManager, and Command executor from the same registry.
- `ConfigManager.forCapability(id)` exposes a capability-scoped reader; `get()` with no key returns a defensive snapshot suitable for process transport.
- `resolve/adapter.py` already owns Python Resolve connection plus current project/timeline discovery. Script runtime should reuse it rather than duplicating Resolve API calls outside `resolve/`.
- `bridge/resolve_bridge.py` is a fixed Command ID handler table. Extending it into an arbitrary-code endpoint would violate its existing boundary and is unnecessary for local Python provider execution.
- No dependency is required: Node provides `child_process`, path containment, and JSON; Python provides import loading, async execution, context objects, output capture, and JSON serialization.

## Minimum Architecture Fit

```text
Capability manifest loader
  -> generic script Capability
  -> Script Capability Provider
  -> ScriptExecutor runtime dispatch
  -> PythonProvider process transport
  -> Python runner
  -> feature script execute(context)
```

The manifest loader mirrors Command discovery and registers ordinary executable Capability objects. Registry, FeatureCatalog, ConfigManager, lifecycle, Command Engine, renderer, and Interaction Binding therefore remain unchanged.

## Python Context Transport

- Node sends only serializable capability-scoped configuration to the runner.
- The runner creates `context.logger` and captures script stdout/stderr as structured log records.
- The runner obtains `context.resolve`, `context.project`, and `context.timeline` lazily through `resolve.adapter.py`, keeping Resolve calls under the existing adapter owner and allowing config-only tests outside Resolve.
- The runner returns one JSON envelope containing result or error plus captured logs. Node replays logs to the injected logger and rejects invalid/non-success envelopes.

## Deliberate Limits

- Scripts are trusted and can technically use normal Python filesystem/import APIs; Phase 6 does not claim sandbox enforcement.
- One subprocess per execution is simpler and avoids shared script state. Add pooling only if profiling shows startup cost is material.
- No existing Feature is migrated merely to demonstrate the runtime; test fixtures prove the generic path without changing product behavior.

