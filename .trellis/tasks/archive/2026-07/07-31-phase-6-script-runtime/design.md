# Phase 6 Script Runtime Design

## Architecture Boundary

```text
Command Metadata
  -> Command Engine
  -> Capability Registry
  -> generic script Capability
  -> Script Capability Provider
  -> ScriptExecutor
  -> PythonProvider
  -> Python runner
  -> feature script execute(context)
```

Command Engine, renderer, Interaction Binding, ConfigStorage, and the fixed-command HTTP bridge do not gain script knowledge.

## Capability Metadata and Discovery

Script-backed Capability manifests use the existing Capability Metadata fields plus `executor`:

```json
{
  "id": "media.export",
  "name": "Export Media",
  "description": "Export the current timeline",
  "category": "Export",
  "icon": "download",
  "version": "1.0.0",
  "type": "command",
  "providers": ["script"],
  "executor": {
    "type": "script",
    "runtime": "python",
    "entry": "scripts/export.py"
  },
  "configSchema": {}
}
```

Add a directory loader beside the existing Capability owner. It reads sorted JSON manifests from a fixed definitions directory, normalizes object/array payloads like Command Registry, and creates an ordinary executable Capability for each script definition. Both Electron hosts invoke the same registration helper before constructing FeatureCatalog and ConfigManager.

Capability Registry remains the validation boundary. Existing metadata fields keep their current rules. When `executor` exists, it must be a plain object with non-empty `type`, `runtime`, and `entry`; Phase 6 accepts `type: "script"`. Existing Capabilities without `executor` continue to register unchanged.

## Generic Script Capability and Execution Provider

The generic Capability stores the validated metadata and implements:

```javascript
execute(command, { config })
  -> scriptCapabilityProvider.execute(metadata.executor, { command, config })
```

The Script Capability Provider is the layer boundary between Capability and Script Runtime. It converts the capability-scoped config reader to a defensive plain object, attaches the injected logger, and calls:

```javascript
scriptExecutor.execute(scriptDefinition, scriptContext)
```

It does not inspect `runtime`, spawn processes, or import Python details.

## ScriptExecutor and Runtime Providers

`ScriptExecutor` owns a map keyed by runtime name. Its only branching is provider lookup:

```javascript
providers.get(scriptDefinition.runtime).execute(scriptDefinition, context)
```

Construction registers only `python` for Phase 6. A future Lua/Node/external provider implements the same `execute(scriptDefinition, context)` contract and is added to the map; Capability Metadata, generic Capability, Command Engine, and UI stay unchanged.

Unsupported or malformed runtime definitions fail before process invocation.

## Python Provider and Process Protocol

`PythonProvider` is the sole JavaScript owner of Python process invocation.

- Resolve `executor.entry` against the application root and reject absolute paths or paths escaping that root.
- Spawn the configured Python executable with `shell: false`, the runtime-owned runner, and the resolved feature script path.
- Send one JSON request on stdin containing the capability-scoped config snapshot.
- Collect stdout/stderr and process status.
- Parse one JSON response envelope, replay captured logs to the injected logger, and return `result` only for a successful envelope/exit.
- Convert spawn errors, non-zero exits, invalid JSON/envelopes, and script-reported errors into controlled errors naming the runtime and relative entry.

One process is created per execution. This is the minimum isolation model and avoids shared module/global state. A `ponytail:` comment will record that pooling belongs only after measured startup cost.

## Python Feature Script Contract

The runtime-owned Python runner loads the entry file without adding a feature-specific package requirement. The feature file exports:

```python
def execute(context):
    return {"ok": True}
```

Async `execute(context)` is also accepted. Missing/non-callable `execute`, import failures, runtime exceptions, and non-JSON-serializable results become structured errors.

The runner redirects feature stdout/stderr into captured log records and reserves its real stdout for the single JSON response envelope.

## ScriptContext Contract

The runner creates one context object with exactly these public attributes:

- `resolve`: lazy current Resolve scripting object from `resolve.adapter.get_resolve()`.
- `config`: a defensive plain dictionary containing only this Capability's validated configuration.
- `logger`: runtime logger supporting `debug`, `info`, `warning`, and `error`.
- `project`: lazy current project from `resolve.adapter.get_project_and_timeline()`.
- `timeline`: lazy current timeline from the same adapter boundary.

Resolve/project/timeline are lazy so a script that only needs config can run and be tested without a live Resolve connection. Feature scripts receive the objects but never import Clackly adapter modules to acquire them.

The context is an API boundary, not a security sandbox. Trusted scripts can still use ordinary Python imports and filesystem APIs, but Clackly does not expose internal paths or Electron/UI objects through context.

## Data and Error Flow

```text
ConfigManager scoped reader
  -> plain config snapshot
  -> JSON stdin request
  -> Python ScriptContext
  -> execute(context)
  -> JSON result/error/log envelope
  -> PythonProvider validation
  -> Capability caller result/error
```

Validation owners:

- Capability Registry: Capability and executor metadata shape.
- Manifest loader: JSON file/payload shape and duplicate ids within discovered definitions.
- ScriptExecutor: supported runtime/provider lookup.
- PythonProvider: entry containment, process lifecycle, and response envelope.
- Python runner: script import, callable contract, context creation, result serialization, and script exception capture.

No layer retries another runtime after Python execution starts.

## Compatibility

- `register(capabilityId, capability)`, `get()`, `getMetadata()`, and `getAllCapabilities()` keep their public behavior.
- `marker.add` remains handwritten with its existing backend order and adapters.
- Command manifests still contain only Capability ids, never executor/runtime fields.
- FeatureCatalog automatically projects newly registered script Capabilities without UI changes.
- ConfigManager continues to validate and scope `configSchema`; scripts receive only the resulting snapshot.
- Existing bridge endpoints and Resolve adapter actions remain unchanged.

## Risks and Deferred Items

- Python startup latency: accept one subprocess per call; add pooling only after measurement.
- Live Resolve validation may be unavailable in automated tests; cover context construction with adapter fakes and record the manual validation gap.
- Trusted scripts are not sandboxed; third-party/untrusted scripts require a separate permission/sandbox phase.
- Cancellation, timeouts, streaming, package environments, and interpreter discovery UI are deferred.

## Rollback

Rollback removes the script runtime, script Capability loader/provider, host registration calls, executor metadata validation, focused tests, and documentation. No persisted data migration or existing Capability behavior is changed.

