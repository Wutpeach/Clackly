# Quality Guidelines

> Code quality standards for backend development.

---

## Overview

Backend code includes local bridge processes, Resolve scripting integration, Workflow Integration Plugin Resolve actions, startup scripts, and command handler dispatch. Backend modules own external capability calls and must expose narrow, typed JSON contracts to callers.

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
- Resolve API access is centralized in bridge modules, not Electron code.
- In the Workflow Integration Plugin path, Resolve API access is centralized in `workflow-plugin/` main-process integration code through `WorkflowIntegration.node`; renderer/UI code still must not import or call Resolve APIs.
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
- Bad: Renderer code calls `WorkflowIntegration.node` or Resolve API methods directly.
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
- Running Resolve API logic from Electron or generic UI code.
- Sending executable code over local HTTP; send command ids only.

---

## Required Patterns

- Bind local bridge servers to `127.0.0.1`.
- Validate JSON payload shape at the HTTP boundary.
- Keep Resolve command dispatch in one handler table.
- Keep Workflow Plugin Resolve command dispatch in one handler table such as `RESOLVE_COMMAND_HANDLERS`.
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
- Startup scripts are idempotent or tolerate existing bridge/app instances.
- No `__pycache__`, `.pyc`, or build cache files are left as source changes.
