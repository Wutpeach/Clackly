# Quality Guidelines

> Code quality standards for backend development.

---

## Overview

Backend code includes local bridge processes, Resolve scripting integration, Workflow Integration Plugin Resolve actions, startup scripts, and command handler dispatch. Backend modules own external capability calls and must expose narrow, typed JSON contracts to callers.

## Scenario: Capability Dispatch

### 1. Scope / Trigger

- Trigger: adding a command that may have more than one execution backend, including Resolve APIs, scripts, Workflow Integration, keyboard shortcuts, or future automation.
- Commands describe user intent; capability modules decide how that intent is executed.

### 2. Signatures

- Command manifest: `{ id: string, name: string, keywords: string[], capability: string }`
- Capability metadata: `{ id: string, name: string, description: string, category: string, icon: string, version: string, type: string, providers: string[] }`
- Capability registry: `createCapabilityRegistry() -> { register(capabilityId, capability), get(capabilityId), getMetadata(capabilityId), getAllCapabilities() }`
- Command executor: `createCommandExecutor({ capabilityRegistry, findCommand? }) -> executeCommand(commandId)`
- Marker capability: `createMarkerCapability(backends) -> { metadata, add(options?), execute(command), selectBackend() }`
- Unavailable error: `CapabilityUnavailableError(capability, attemptedBackends)`
- Shortcut manager: `get(name)`, `has(name)`, `canExecute(name)`, and `execute(name, context?)`.

### 3. Contracts

- `command-engine/` validates and routes the `capability` string only. It must not import Resolve APIs, bridge transport, or keyboard implementations.
- Each host creates a capability registry, registers its host-backed capability objects, and injects the registry into the command executor.
- Registered capabilities keep descriptive data under `capability.metadata`; `register(capabilityId, capability)` and `get(capabilityId)` retain their existing execution-object behavior.
- `getMetadata(capabilityId)` returns the full metadata object or `null`. `getAllCapabilities()` returns fresh catalog summaries containing only `id`, `name`, `category`, and `icon`, never execution functions.
- Metadata `providers` names supported provider families such as `resolve-api` and `shortcut`; it does not report host-specific runtime availability or expose internal backend ids.
- `marker.add` checks backends in order: `resolveApi`, `resolveScriptApi`, `workflowPluginApi`, `keyboardShortcut`; `uiAutomation` is reserved and not implemented.
- Hosts inject available execution adapters. Workflow Integration injects the Resolve adapter as `workflowPluginApi`; standalone/Utility injects the health-checked bridge adapter as `resolveScriptApi`.
- Backend fallback happens only during availability selection. Once `addMarker()` starts, its API or semantic error propagates and no lower backend executes.
- Shortcut mappings live in `shortcut/shortcuts.json`. A mapping alone does not mean it can execute: `canExecute()` is true only when a keyboard executor is injected.
- The MVP does not synthesize keys, inspect Resolve Keyboard Customization, bind missing shortcuts, or perform UI automation.

### 4. Validation & Error Matrix

- Unknown command id -> command executor throws `Unknown command`.
- Missing command capability handler -> command executor throws `No capability handler registered`.
- Missing capability metadata, blank required string fields, invalid or sparse `providers`, or a metadata id that differs from the registry key -> registration throws `TypeError`.
- Unknown capability metadata id -> `getMetadata()` returns `null`.
- Backend missing `addMarker` or reporting `isAvailable() === false` -> capability checks the next backend.
- Backend availability raises `CapabilityUnavailableError` -> capability checks the next backend.
- Backend availability raises an unexpected error -> propagate it; do not hide infrastructure bugs.
- No usable backend -> throw `CapabilityUnavailableError` with the capability id and checked backends.
- Selected backend execution fails -> propagate the same error; do not try keyboard or another backend.
- Shortcut mapping missing or keyboard executor absent -> ShortcutManager refuses execution without sending input.

### 5. Good/Base/Bad Cases

- Good: command metadata contains `"capability": "marker.add"`.
- Good: the marker capability exposes nested metadata and the registry projects only catalog fields for future UI consumers.
- Base: Workflow Plugin injects only `workflowPluginApi`, so `marker.add` delegates to `resolve/adapter.js`.
- Good: a dead standalone bridge reports unavailable before execution, allowing a future configured keyboard backend to be selected.
- Bad: command metadata contains `"executor": "resolve"` or a keyboard shortcut string.
- Bad: Electron host registration duplicates marker metadata or computes provider availability for the catalog.
- Bad: catch an `AddMarker` failure and then press `CTRL+M`; the first backend may already have performed a partial action.

### 6. Tests Required

- Assert the highest-priority available backend is selected.
- Assert unavailable higher backends fall through in priority order.
- Assert selected-backend execution errors do not call lower backends.
- Assert no backend produces `CapabilityUnavailableError` with useful metadata.
- Assert registry lookup preserves the same execution object while metadata lookup returns the full metadata object.
- Assert catalog listing returns only `id`, `name`, `category`, and `icon`.
- Assert missing, malformed, id-mismatched, and sparse-provider metadata cannot register.
- Assert command registry preserves search while returning capability metadata.
- Assert ShortcutManager mapping, no-executor behavior, and injected-executor request shape.
- Assert bridge availability uses `/health` and marker execution preserves the existing command-id HTTP payload.

### 7. Wrong vs Correct

#### Wrong

```javascript
// command-engine
if (command.executor === "resolve") {
  return resolveAdapter.addMarker();
}
```

#### Correct

```javascript
const capabilityRegistry = createCapabilityRegistry();
capabilityRegistry.register("marker.add", markerCapability);
capabilityRegistry.getMetadata("marker.add");
capabilityRegistry.getAllCapabilities();
const executeCommand = createCommandExecutor({
  capabilityRegistry,
});
```

## Scenario: Resolve Adapter Boundary

### 1. Scope / Trigger

- Trigger: adding or changing a command that reads from or writes to the DaVinci Resolve scripting API.
- Applies to both the Workflow Integration JavaScript path and the Python Utility fallback.

### 2. Signatures

- JavaScript adapter factory: `createResolveAdapter({ getResolve }) -> { addMarker(): Promise<{ ok: true, frame: number }> }`
- Python adapter action: `add_marker() -> Dict[str, Any]` containing the timeline-relative `frame`.
- Command contract remains `timeline.addMarker` with `capability: marker.add`; callers pass intent and do not pass Resolve objects or arbitrary API method names.

### 3. Contracts

- All Resolve scripting object calls such as `GetProjectManager`, `GetCurrentTimeline`, `GetCurrentTimecode`, and `AddMarker` live under `resolve/`.
- `workflow-plugin/main.js` owns Electron and `WorkflowIntegration.node` lifecycle (`Initialize`, `GetResolve`, callbacks, and `CleanUp`) and delegates Resolve scripting actions to `resolve/adapter.js`.
- `bridge/` owns HTTP transport and command dispatch only; it delegates Python Resolve scripting actions to `resolve/adapter.py`.
- `command-engine/` owns registry/search metadata and dependency-injected capability routing; it must not import Resolve adapters, bridge transport, shortcut implementations, or Resolve APIs.
- `capability/marker.js` selects available backends before execution. Once `addMarker()` starts, its error propagates without falling through to a lower backend.
- `Timeline.AddMarker` receives a zero-based frame id relative to the timeline start, not the absolute `GetStartFrame()` value.
- The adapter derives the marker frame from `GetCurrentTimecode() - GetStartTimecode()` using the timeline frame rate.
- Semicolon timecodes at 29.97 and 59.94 use drop-frame numbering. Drop-frame conversion skips timecode labels only; it does not remove media frames.

### 4. Validation & Error Matrix

- No current project or timeline -> adapter raises a user-facing error.
- Missing current/start timecode or frame rate -> adapter raises a conversion error before calling `AddMarker`.
- Playhead before timeline start or beyond timeline bounds -> adapter rejects the frame id.
- Invalid drop-frame label (for example `01:01:00;00` at 29.97) -> adapter rejects the timecode.
- `AddMarker` returns false with an existing marker at that frame -> adapter reports the duplicate position.
- `AddMarker` throws or returns false otherwise -> adapter reports the timecode and timeline-relative frame.

### 5. Good/Base/Bad Cases

- Good: `workflow-plugin/main.js` injects `resolveAdapter.addMarker` into the `workflowPluginApi` marker backend.
- Base: at 24 fps, `01:00:10:00 - 01:00:00:00` produces frame id `240`.
- Good: at 29.97 drop-frame, `01:01:00;02 - 01:00:00;00` produces frame id `1800`.
- Bad: adding `GetStartFrame()` back to the relative result and passing an absolute value such as `86640` to `AddMarker`.
- Bad: calling `timeline.AddMarker` from `command-engine/`, renderer code, Workflow Plugin routing, or the HTTP bridge.

### 6. Tests Required

- JavaScript adapter tests assert the full `AddMarker` argument list and the relative frame id.
- JavaScript and Python conversion tests cover 24 fps plus valid and invalid 29.97/59.94 drop-frame boundaries.
- Python fallback tests assert parity with JavaScript marker arguments and errors.
- Boundary grep must find Resolve scripting calls only under `resolve/` (test doubles are exempt).
- Manual Resolve validation must confirm the marker appears at the current playhead.

### 7. Wrong vs Correct

#### Wrong

```javascript
// workflow-plugin/main.js
const timeline = project.GetCurrentTimeline();
timeline.AddMarker(frameId, "Red", "Marker", "", 1);
```

#### Correct

```javascript
// workflow-plugin/main.js
const resolveAdapter = createResolveAdapter({ getResolve });
const handlers = {
  "timeline.addMarker": resolveAdapter.addMarker,
};
```

## Scenario: Local Resolve Bridge

### 1. Scope / Trigger

- Trigger: Electron sends local HTTP command requests to a Python bridge that executes Resolve scripting actions.
- Applies when adding bridge endpoints, Resolve handlers, startup scripts, or command payload fields.

### 2. Signatures

- HTTP endpoint: `POST /command`
- Request body: `{ "command": string }`
- Success response: `{ "ok": true, "command": string, ...result }`
- Error response: `{ "ok": false, "error": string }`
- Handler table: `COMMAND_HANDLERS: Dict[str, Callable[[], Dict[str, Any]]]`

### 3. Contracts

- Bridge binds to `127.0.0.1` only for MVP local IPC.
- `RESOLVE_COMMAND_CENTER_PORT` controls the bridge port and must parse to `1..65535`.
- `RESOLVE_COMMAND_CENTER_ALLOWED_ORIGIN` controls CORS for browser-based dev tooling.
- `RESOLVE_COMMAND_CENTER_ROOT` points startup scripts to the app root; prefer it for Resolve Utility launches because Resolve may omit `__file__`, and do not hardcode machine-specific absolute paths.
- `RESOLVE_SCRIPT_API` points to the Resolve scripting API directory. Startup scripts preserve an explicit env value, but on Windows may auto-detect the standard vendor install path `C:\ProgramData\Blackmagic Design\DaVinci Resolve\Support\Developer\Scripting` only when `Modules\DaVinciResolveScript.py` exists.
- `RESOLVE_SCRIPT_LIB` points to the Resolve scripting library. Startup scripts preserve an explicit env value, but on Windows may auto-detect the standard vendor install path `C:\Program Files\Blackmagic Design\DaVinci Resolve\fusionscript.dll` only when the file exists.
- `PYTHONPATH` must include the Resolve scripting `Modules` directory before launching the bridge subprocess. If `RESOLVE_SCRIPT_API` is provided or auto-detected, prepend `%RESOLVE_SCRIPT_API%\Modules` while preserving existing `PYTHONPATH` entries.
- Startup diagnostics must log whether Resolve scripting values came from the environment, auto-detection, derivation, or are missing.
- Resolve scripting API access is centralized under `resolve/`, not in bridge, command-engine, renderer, or Workflow Plugin routing code.
- In the Workflow Integration Plugin path, `workflow-plugin/main.js` owns `WorkflowIntegration.node` lifecycle and delegates Resolve scripting actions to `resolve/adapter.js`.
- Workflow Integration plugins should call `InitializePromise` or `Initialize` before Resolve API access, register `ResolveQuit` when available, and call `CleanUp()` during plugin app shutdown.
- `WorkflowIntegration.node` is a Resolve-provided native module copied from the local Resolve Developer examples for development installs; do not commit it to the repository.

### 4. Validation & Error Matrix

- Missing or non-string `command` -> HTTP 400 with an error.
- Unknown command id -> HTTP 400 with an error.
- Invalid JSON -> HTTP 400 with an error.
- Missing Resolve project or timeline -> HTTP 400 with an error from the bridge.
- Unexpected server failure -> HTTP 500 with an error.
- Invalid port env value -> startup/server raises a clear runtime error.
- Missing Resolve scripting env plus failed Windows auto-detection -> bridge `/health` may succeed, but Resolve commands can fail with a clear scripting API error; startup logs must show missing `RESOLVE_SCRIPT_API`, `RESOLVE_SCRIPT_LIB`, and `PYTHONPATH` sources.

### 5. Good/Base/Bad Cases

- Good: Adding a Resolve action by registering a new handler in `COMMAND_HANDLERS`.
- Good: Leaving user-provided `RESOLVE_SCRIPT_API` and `RESOLVE_SCRIPT_LIB` untouched, then prepending the resolved `Modules` directory to `PYTHONPATH`.
- Base: `timeline.addMarker` maps to `add_marker()` and returns the frame id on success.
- Base: Standard Windows Resolve installs work without manual scripting env configuration when the ProgramData scripting module and Program Files `fusionscript.dll` exist.
- Bad: Electron calls `DaVinciResolveScript.scriptapp("Resolve")` directly or sends arbitrary Python code over HTTP.
- Bad: Renderer, command-engine, bridge transport, or Workflow Plugin routing code calls Resolve scripting methods directly.
- Bad: Hardcoding a user-specific Resolve install path such as a home directory, or overwriting explicit scripting env values during auto-detection.

### 6. Tests Required

- Compile Python bridge/startup scripts with `python -m py_compile`.
- Probe startup environment construction with `RESOLVE_SCRIPT_API`, `RESOLVE_SCRIPT_LIB`, and `PYTHONPATH` unset on a standard Windows install; assert defaults are set and the Resolve `Modules` path is first in `PYTHONPATH`.
- Exercise `/health` and invalid `/command` payloads when changing server request handling.
- Manually validate Resolve-only actions in a live Resolve project with an active timeline.

### 7. Wrong vs Correct

#### Wrong

```python
if command_id == "timeline.addMarker":
    ...
```

spread across multiple server branches.

#### Correct

```python
COMMAND_HANDLERS = {
    "timeline.addMarker": add_marker,
}
handler = COMMAND_HANDLERS.get(command_id)
```

#### Wrong

```python
environment["RESOLVE_SCRIPT_API"] = r"C:\Users\alice\Resolve\Scripting"
environment["RESOLVE_SCRIPT_LIB"] = r"C:\custom\fusionscript.dll"
```

#### Correct

```python
if not environment.get("RESOLVE_SCRIPT_API") and standard_module_path.exists():
    environment["RESOLVE_SCRIPT_API"] = str(standard_scripting_dir)
```

---

## Forbidden Patterns

- Machine-specific absolute paths in startup scripts.
- Running Resolve scripting logic outside `resolve/`.
- Storing execution backend names or keyboard shortcuts in command manifests.
- Falling back to another backend after execution has started.
- Sending executable code over local HTTP; send command ids only.

---

## Required Patterns

- Bind local bridge servers to `127.0.0.1`.
- Validate JSON payload shape at the HTTP boundary.
- Keep Resolve command dispatch in one handler table.
- Keep command-engine dispatch generic and register capabilities from each host.
- Delegate every Resolve scripting action to `resolve/adapter.js` or `resolve/adapter.py`.
- Route command intent through the capability registry before selecting an execution adapter.
- Treat configured shortcuts and executable shortcuts as separate states.
- Make ports, app roots, launch commands, and dev origins configurable through environment variables.

---

## Testing Requirements

- Run `python -m py_compile` for changed Python bridge or startup scripts.
- Run available build/check commands for any caller that depends on the bridge contract.
- Record unresolved live-Resolve validation gaps when the environment cannot run Resolve.

---

## Code Review Checklist

- New bridge request fields have documented validation and error behavior.
- Resolve handler additions are registered in `COMMAND_HANDLERS`.
- Resolve scripting calls are contained under `resolve/`; command-engine and transport layers contain only command ids and delegation.
- Command manifests expose `capability`, not an execution backend.
- Capability tests prove both priority fallback and no fallback after execution begins.
- Startup scripts are idempotent or tolerate existing bridge/app instances.
- No `__pycache__`, `.pyc`, or build cache files are left as source changes.
