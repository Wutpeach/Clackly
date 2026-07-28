# Quality Guidelines

> Code quality standards for backend development.

---

## Overview

Backend code includes local bridge processes, Resolve scripting integration, startup scripts, and command handler dispatch. Backend modules own external capability calls and must expose narrow, typed JSON contracts to callers.

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
- Resolve API access is centralized in bridge modules, not Electron code.

### 4. Validation & Error Matrix

- Missing or non-string `command` -> HTTP 400 with an error.
- Unknown command id -> HTTP 400 with an error.
- Invalid JSON -> HTTP 400 with an error.
- Missing Resolve project or timeline -> HTTP 400 with an error from the bridge.
- Unexpected server failure -> HTTP 500 with an error.
- Invalid port env value -> startup/server raises a clear runtime error.

### 5. Good/Base/Bad Cases

- Good: Adding a Resolve action by registering a new handler in `COMMAND_HANDLERS`.
- Base: `timeline.addMarker` maps to `add_marker()` and returns the frame id on success.
- Bad: Electron calls `DaVinciResolveScript.scriptapp("Resolve")` directly or sends arbitrary Python code over HTTP.

### 6. Tests Required

- Compile Python bridge/startup scripts with `python -m py_compile`.
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
