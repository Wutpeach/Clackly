# Resolve Command Center MVP Design

## Architecture

The MVP now uses eight boundaries:

1. Electron main process: desktop lifecycle, hidden window, global shortcut, IPC.
2. Electron renderer: search box, command list, keyboard interaction, execution request trigger.
3. Command engine: command registry, search, and dependency-injected intent routing.
4. Capability layer: operation-level backend selection without Resolve or keyboard implementation knowledge.
5. Execution adapters: host-specific transport or integration adapters, including the standalone HTTP bridge adapter.
6. Shortcut layer: function-name mappings and an injected future keyboard executor interface; no automatic binding or automation.
7. Workflow Integration Plugin: Resolve-hosted Electron entrypoint, Workflow Integration lifecycle, and capability injection.
8. Resolve Adapter and Utility fallback: all JavaScript/Python Resolve scripting API access under `resolve/`, with localhost HTTP transport for fallback execution.

Renderer and command-engine code are never allowed to import Resolve APIs, bridge transport, or keyboard details. Commands carry intent such as `marker.add`. In the Workflow Plugin path, the host injects `resolve/adapter.js` into the marker capability's `workflowPluginApi` slot. In the Utility fallback path, the standalone host injects the health-checked HTTP bridge adapter into `resolveScriptApi`, and the Python bridge delegates to `resolve/adapter.py`.

## Proposed Source Layout

```text
resolve-command-center/
├── capability/
│   ├── errors.js
│   └── marker.js
├── bridge/
│   ├── resolve_bridge.py
│   └── server.py
├── command-engine/
│   ├── commands/
│   │   └── timeline.json
│   ├── executor.js
│   └── registry.js
├── execution-adapter/
│   └── bridge.js
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
│   ├── adapter.js
│   ├── adapter.py
│   ├── marker-frame.js
│   └── Clackly.py
├── shortcut/
│   ├── ShortcutManager.js
│   └── shortcuts.json
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
9. The generic command executor routes `marker.add` to the injected marker capability.
10. The capability selects the Workflow Plugin API backend and invokes the JavaScript Resolve Adapter.
11. The adapter gets the current project and timeline, reads the current and start timecodes and frame rate, converts the playhead to the timeline-relative frame id (including 29.97/59.94 drop-frame), calls `Timeline.AddMarker`, and returns a JSON result.
12. Electron hides the palette after successful execution.
13. During app quit or Resolve quit, the plugin calls `WorkflowIntegration.CleanUp()`.

Utility fallback flow:

1. Resolve runs `resolve/Clackly.py` from the Resolve Utility scripts directory.
2. `Clackly.py` resolves the app root from `RESOLVE_COMMAND_CENTER_ROOT` first, then from deployment-relative paths only when Resolve provides `__file__`.
3. `Clackly.py` starts the Python bridge as a detached Python subprocess, waits briefly for `/health`, then launches Electron.
4. The external Electron app routes `marker.add` through the marker capability.
5. The capability checks bridge `/health`, selects the Resolve Script API backend, and invokes the bridge execution adapter.
6. The adapter sends the existing command id over local HTTP; the bridge dispatches to `resolve/adapter.py`, which performs the same timeline-relative marker operation through the Python Resolve API.

## Contracts

Command manifest entry:

```json
{
  "id": "timeline.addMarker",
  "name": "Add Marker",
  "keywords": ["marker", "mark"],
  "capability": "marker.add"
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
- Capability handlers are keyed by operation intent such as `marker.add`; host code injects implementation backends.
- Marker backend priority is Resolve API, Resolve Script API, Workflow Plugin API, keyboard shortcut, then reserved future UI automation. Only availability checks may fall through; execution errors do not.
- Shortcut mappings support introspection and future injected execution, but this MVP performs no keyboard automation and binds no command shortcuts automatically.
- Bridge command handlers should be registered in one table such as `COMMAND_HANDLERS`, making new adapter actions additive without putting Resolve calls in the transport layer.
- Workflow Plugin and standalone hosts should register capability handlers in the generic command executor and inject their execution backends outside `command-engine/`.

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
- During development, an old external Electron app launched by `npm start` or the Utility script can still own `CommandOrControl+Space`. If Workflow Plugin hotkey registration fails, it should show its own palette and warn that the user is probably still interacting with the old Python-bridge path.

## Tradeoffs

- Local HTTP is simpler than WebSocket and enough for one-shot command execution.
- A JSON command registry is enough for architecture validation and keeps the future plugin shape visible.
- Full packaging is deferred because the MVP validates integration, not distribution.

## Rollback

All MVP files live under the new `resolve-command-center/` app directory plus the task artifacts. If the implementation fails, remove that directory and restore any task artifact edits.
