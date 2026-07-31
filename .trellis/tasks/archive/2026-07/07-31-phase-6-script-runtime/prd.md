# Phase 6 Script Runtime

## Goal

Make Python scripts a first-class Clackly Capability execution path:

```text
Command -> Capability Registry -> Capability -> Execution Provider -> Script Runtime -> Python Script
```

A future script-backed Feature should require only its Script file, Capability Metadata with Config Schema, and Command Metadata; it must not require Command Engine or UI changes.

## Background

- Phase 5.6 established Capability Metadata, Command Metadata, Interaction Binding, and Config Schema as authoritative sources.
- Command Engine already resolves a Command to a registered Capability, applies lifecycle/configuration gates, and calls `capability.execute(command, { config })`.
- Capability Registry currently stores executable Capability objects and validates their descriptive metadata.
- Command Metadata is discovered from JSON manifests, while Capability Metadata is currently embedded in handwritten Capability modules.
- The existing Python bridge dispatches fixed Command IDs and is not a generic Script Runtime or ScriptContext transport.

## Requirements

### R1: Script Executor Core

- Add a `script-runtime/` module with `ScriptExecutor` and a Python runtime provider.
- Expose `execute(scriptDefinition, context)` as the runtime entry point.
- `ScriptExecutor` selects a runtime provider by `scriptDefinition.runtime`; runtime providers own interpreter invocation, context transport, result collection, and error capture.
- Only the Python provider may invoke Python or use `child_process` for script execution.

### R2: Script Capability Execution Provider

- Extend Capability Metadata with:

  ```json
  {
    "executor": {
      "type": "script",
      "runtime": "python",
      "entry": "scripts/export.py"
    }
  }
  ```

- Validate the executor contract before registration.
- Add a generic script-backed Capability path that delegates to a Script execution provider and then `ScriptExecutor`; it must not know Python process details.
- Discover script Capability Metadata using the existing manifest-loading style so adding a script-backed Feature does not require host, Command Engine, or UI edits.
- Keep the existing Capability Registry as the only Feature registry and keep `configSchema` under Capability Metadata.

### R3: Python ScriptContext

- Python scripts export one sync or async `execute(context)` function and return a JSON-serializable result.
- The runtime supplies:
  - `context.resolve`
  - `context.config`
  - `context.logger`
  - `context.project`
  - `context.timeline`
- Resolve, project, and timeline objects are obtained by runtime-owned integration through the existing Resolve adapter boundary; feature scripts do not import Electron, UI, or Clackly internal modules/files to obtain them.
- Configuration is a capability-scoped snapshot, not ConfigStorage or unrestricted config access.
- Script stdout/stderr and `context.logger` output are captured without corrupting the result protocol.

### R4: Compatibility and Extensibility

- Preserve Command Engine behavior and its public execution contract.
- Preserve existing handwritten/non-script Capabilities.
- Provider selection must allow a future runtime provider to be registered by runtime name without changing Command, Capability, or UI contracts.
- Phase 6 MVP implements Python only.

## Constraints

- Do not refactor Command Engine.
- Do not let UI or renderer code invoke scripts.
- Do not let scripts bypass Capability Registry, lifecycle, or configuration gates.
- Do not add Lua, Node, shell, or external-process provider files or placeholders.
- Do not add third-party dependencies when Node/Python standard libraries cover the runtime.
- Python scripts are trusted local Capability code. Phase 6 defines an API boundary but does not enforce an OS or filesystem sandbox.

## Acceptance Criteria

- [ ] A discovered Capability manifest with `executor.type = "script"`, `runtime = "python"`, and a valid entry registers in the existing Capability Registry and appears through the existing Feature catalog path.
- [ ] Executing its Command follows the standard Command -> Capability -> Script execution provider -> ScriptExecutor -> Python provider path.
- [ ] Capability and Command Engine code contain no interpreter or `child_process` calls.
- [ ] A Python script receives all five ScriptContext fields and can use capability-scoped config and logger without importing Electron, UI, ConfigStorage, or Clackly internals.
- [ ] Python startup failures, missing/escaping entry paths, unsupported runtimes, non-zero exits, script exceptions, invalid protocol output, and non-serializable results surface as controlled errors.
- [ ] Script logs do not corrupt the returned result.
- [ ] Existing marker execution, non-script Capability registration, lifecycle/configuration gates, both Electron hosts, and renderer behavior remain unchanged.
- [ ] Focused automated tests prove manifest-to-Python execution, context/log/result transport, and representative failure paths; full tests and production build pass.

## Out of Scope

- Lua, Node, shell, or external-process runtimes.
- Migrating `marker.add` or another existing Feature to Python.
- OS/filesystem sandboxing, permissions, package management, virtual environments, process pooling, cancellation, streaming results, or long-running script services.
- Direct script invocation from UI, Command Engine, Interaction Binding, or the existing fixed-command HTTP bridge.
- Separating Config Schema into a new metadata store.

## Key Decisions

- Python is the only Phase 6 runtime; no Lua placeholder is created.
- Scripts are trusted local Feature code with a narrow runtime context, not sandboxed third-party code.
- Capability manifests are auto-discovered, mirroring existing Command manifest loading, so a new script Feature does not require host composition edits.
- Existing `configSchema` ownership remains unchanged inside Capability Metadata.
- The Python feature contract is one `execute(context)` function with a JSON-serializable return value.
- Each execution uses one Python subprocess for isolation and simple error handling; pooling is deferred until measured startup cost requires it.

