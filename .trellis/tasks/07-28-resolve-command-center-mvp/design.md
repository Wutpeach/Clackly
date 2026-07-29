# Resolve Command Center MVP Design

## Architecture

The MVP now uses five boundaries:

1. Electron main process: desktop lifecycle, hidden window, global shortcut, IPC.
2. Electron renderer: search box, command list, keyboard interaction, execution request trigger.
3. Command engine: command registry, search, executor routing.
4. Workflow Integration Plugin: Resolve-hosted Electron entrypoint, Resolve lifecycle, and JavaScript Resolve API actions.
5. Resolve Utility fallback: local HTTP command endpoint and Resolve Python API actions for comparison/debugging.

Renderer code is never allowed to import or call Resolve APIs directly. It sends command ids through preload IPC. In the Workflow Plugin path, the plugin main process owns Resolve interaction through Blackmagic's `WorkflowIntegration.node`. In the Utility fallback path, the Python bridge owns Resolve interaction.

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
├── workflow-plugin/
│   └── main.js
├── index.html
├── manifest.xml
├── package.json
└── vite.config.js
```

`preload.js` is added to keep Electron IPC behind a narrow renderer API while preserving the requested module boundaries.

## Data Flow

1. Resolve Studio scans the Workflow Integration Plugins root on startup and registers Clackly from `manifest.xml`.
2. User loads `Clackly` from `Workspace > Workflow Integrations`.
3. Resolve launches `workflow-plugin/main.js` as a Workflow Integration Electron app.
4. The plugin initializes `WorkflowIntegration.node`, registers a `ResolveQuit` callback, creates the hidden palette window, and registers `CommandOrControl+Space`.
5. The main process shows and focuses the palette window when the shortcut fires.
6. Renderer loads searchable command metadata through the preload API.
7. User types a query and selects `timeline.addMarker`.
8. Renderer asks the plugin main process to execute the selected command id.
9. Plugin main validates command metadata, routes to a Resolve handler table, invokes Resolve JavaScript APIs, and returns a JSON result.
10. Electron hides the palette after successful execution.
11. During app quit or Resolve quit, the plugin calls `WorkflowIntegration.CleanUp()`.

Utility fallback flow:

1. Resolve runs `resolve/Clackly.py` from the Resolve Utility scripts directory.
2. `Clackly.py` resolves the app root from `RESOLVE_COMMAND_CENTER_ROOT` first, then from deployment-relative paths only when Resolve provides `__file__`.
3. `Clackly.py` starts the Python bridge as a detached Python subprocess, waits briefly for `/health`, then launches Electron.
4. The external Electron app executes commands through local HTTP to the Python bridge.

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

Workflow Plugin manifest id:

```text
com.wutpeach.clackly
```

Workflow Plugin execution stays on the same command id contract:

```json
{
  "command": "timeline.addMarker"
}
```

## Extension Points

- Additional commands are added by placing more manifest files under `command-engine/commands/`.
- The registry should be shaped so later plugin scanning can merge manifests from `plugins/*/commands/`.
- Executor adapters should be keyed by executor id, not command id. MVP has only `resolve`, but this keeps future workflow or non-Resolve executors possible.
- Resolve bridge command handlers should be registered in one table such as `COMMAND_HANDLERS`, making new Resolve actions additive.
- Workflow Plugin Resolve handlers should be registered in one table such as `RESOLVE_COMMAND_HANDLERS`, making new Resolve actions additive.

## Compatibility Notes

- Use a local HTTP server for MVP IPC between Electron and Python. WebSocket can be added later if commands need progress streaming or live Resolve state.
- The bridge should bind to localhost only.
- The initial bridge port can default to a fixed development value, but should be configurable through `RESOLVE_COMMAND_CENTER_PORT`.
- `Clackly.py` should avoid machine-specific absolute paths and should document required environment variables.
- Resolve's Utility script runner may omit `__file__`, including for symlinked scripts. In that case, `Clackly.py` should try only safe cwd-based fallbacks and otherwise raise a clear error directing the user to set `RESOLVE_COMMAND_CENTER_ROOT`.
- The dev-MVP subprocess bridge does not inherit Resolve's in-process Python globals. It should pass through Resolve scripting environment variables such as `RESOLVE_SCRIPT_API`, `RESOLVE_SCRIPT_LIB`, and `PYTHONPATH` when present. On standard Windows installs it should auto-detect `C:\ProgramData\Blackmagic Design\DaVinci Resolve\Support\Developer\Scripting` only when `Modules\DaVinciResolveScript.py` exists, auto-detect `C:\Program Files\Blackmagic Design\DaVinci Resolve\fusionscript.dll` only when present, prepend the resolved scripting `Modules` path to `PYTHONPATH`, and log whether each scripting value came from env, auto-detection, derivation, or is missing.
- Resolve Utility menu scripts are not a true application startup hook; they run when selected. The MVP entrypoint can launch the bridge and Electron after being triggered, but production auto-start requires an installer, launch wrapper, or separate startup mechanism.
- Workflow Integration Plugins have a clearer loaded-app lifecycle than Utility scripts: `InitializePromise`, app quit, `CleanUp`, and the `ResolveQuit` callback are available.
- Workflow Integration Plugins are scanned and registered on Resolve startup, but official docs still describe manual loading from `Workspace > Workflow Integrations`.
- Development install should copy Resolve's `WorkflowIntegration.node` from the local Resolve Developer examples, not commit it to the repository.

## Tradeoffs

- Local HTTP is simpler than WebSocket and enough for one-shot command execution.
- A JSON command registry is enough for architecture validation and keeps the future plugin shape visible.
- Full packaging is deferred because the MVP validates integration, not distribution.

## Rollback

All MVP files live under the new `resolve-command-center/` app directory plus the task artifacts. If the implementation fails, remove that directory and restore any task artifact edits.
