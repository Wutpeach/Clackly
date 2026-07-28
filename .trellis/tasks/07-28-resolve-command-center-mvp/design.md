# Resolve Command Center MVP Design

## Architecture

The MVP uses four boundaries:

1. Electron main process: desktop lifecycle, hidden window, global shortcut, IPC.
2. Electron renderer: search box, command list, keyboard interaction, execution request trigger.
3. Command engine: command registry, search, executor routing.
4. Resolve bridge: local HTTP command endpoint and Resolve Python API actions.

Electron is never allowed to import or call the Resolve Python API directly. It sends command ids to a local bridge, and the bridge owns all Resolve interaction.

## Proposed Source Layout

```text
resolve-command-center/
├── bridge/
│   ├── resolve_bridge.py
│   └── server.py
├── command-engine/
│   ├── commands/
│   │   └── timeline.json
│   ├── executor.js
│   └── registry.js
├── electron/
│   ├── main/
│   │   ├── hotkey.js
│   │   ├── main.js
│   │   ├── preload.js
│   │   └── window.js
│   └── renderer/
│       ├── App.jsx
│       ├── SearchBox.jsx
│       ├── main.jsx
│       └── styles.css
├── resolve/
│   └── Clackly.py
├── index.html
├── package.json
└── vite.config.js
```

`preload.js` is added to keep Electron IPC behind a narrow renderer API while preserving the requested module boundaries.

## Data Flow

1. Resolve runs `resolve/Clackly.py` from the Resolve Utility scripts directory.
2. `Clackly.py` resolves the app root from `RESOLVE_COMMAND_CENTER_ROOT` first, then from deployment-relative paths only when Resolve provides `__file__`.
3. `Clackly.py` starts the Python bridge as a detached Python subprocess, waits briefly for the bridge health endpoint, then launches Electron.
4. Electron starts hidden and registers `CommandOrControl+Space`.
5. The main process shows and focuses the palette window when the shortcut fires.
6. Renderer loads searchable command metadata through the preload API.
7. User types a query and selects `timeline.addMarker`.
8. Renderer asks the command engine to execute the selected command.
9. Command engine resolves the command's executor id, then sends `{ "command": "timeline.addMarker" }` to the bridge executor.
10. Bridge receives the command id, maps it to `add_marker`, invokes Resolve APIs, and returns JSON success or error.
11. Electron hides the palette after successful execution.

## Contracts

Command manifest entry:

```json
{
  "id": "timeline.addMarker",
  "name": "Add Marker",
  "keywords": ["marker", "mark"],
  "executor": "resolve"
}
```

Electron-to-bridge request:

```json
{
  "command": "timeline.addMarker"
}
```

Bridge success response:

```json
{
  "ok": true,
  "command": "timeline.addMarker"
}
```

Bridge error response:

```json
{
  "ok": false,
  "error": "No current timeline"
}
```

## Extension Points

- Additional commands are added by placing more manifest files under `command-engine/commands/`.
- The registry should be shaped so later plugin scanning can merge manifests from `plugins/*/commands/`.
- Executor adapters should be keyed by executor id, not command id. MVP has only `resolve`, but this keeps future workflow or non-Resolve executors possible.
- Resolve bridge command handlers should be registered in one table such as `COMMAND_HANDLERS`, making new Resolve actions additive.

## Compatibility Notes

- Use a local HTTP server for MVP IPC between Electron and Python. WebSocket can be added later if commands need progress streaming or live Resolve state.
- The bridge should bind to localhost only.
- The initial bridge port can default to a fixed development value, but should be configurable through `RESOLVE_COMMAND_CENTER_PORT`.
- `Clackly.py` should avoid machine-specific absolute paths and should document required environment variables.
- Resolve's Utility script runner may omit `__file__`, including for symlinked scripts. In that case, `Clackly.py` should try only safe cwd-based fallbacks and otherwise raise a clear error directing the user to set `RESOLVE_COMMAND_CENTER_ROOT`.
- The dev-MVP subprocess bridge does not inherit Resolve's in-process Python globals. It should pass through Resolve scripting environment variables such as `RESOLVE_SCRIPT_API`, `RESOLVE_SCRIPT_LIB`, and `PYTHONPATH` when present, and log a clear caveat when they are missing.

## Tradeoffs

- Local HTTP is simpler than WebSocket and enough for one-shot command execution.
- A JSON command registry is enough for architecture validation and keeps the future plugin shape visible.
- Full packaging is deferred because the MVP validates integration, not distribution.

## Rollback

All MVP files live under the new `resolve-command-center/` app directory plus the task artifacts. If the implementation fails, remove that directory and restore any task artifact edits.
