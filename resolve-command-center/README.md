# Clackly

Architecture-validation MVP for a DaVinci Resolve command palette. Electron owns the desktop UI, the command engine maps command intent to injected capabilities, and `resolve/` is the Resolve Adapter layer. Both the Workflow Integration path and Python fallback delegate project, timeline, timecode, frame-rate, drop-frame conversion, and marker operations to adapters in that directory.

Four existing sources own UI metadata: Capability Metadata owns Feature identity and schema, Command Metadata owns Command presentation, Interaction Binding owns executable mouse triggers, and Config Schema owns field labels and validation. Renderer code projects these records and contains no Command-id presentation table, prototype catalog, or shortcut badge fixture.

## Command Metadata

Command manifests require `id`, `name`, `description`, `category`, `icon`, `keywords`, and `capability`. The Command Registry validates and defensively projects that fixed shape through list, search, and lookup. Launcher, Search, and All Actions use those registered records directly; the browser preview intentionally returns an empty catalog and renders the normal empty state.

## Interaction Binding

Mouse input is routed separately from command and capability execution:

```text
command card -> interaction binding -> Command ID -> command registry -> Capability ID -> capability -> execution adapter
```

`interaction/BindingStorage.js` persists `appData/Clackly/bindings.json`. Each binding maps a target plus an exact left/right mouse-button and `CTRL`/`SHIFT`/`ALT` modifier set to `action.command`; it never stores a Capability ID. `interaction/trigger.js` is the shared validator/normalizer used by persisted bindings and renderer mouse events. A missing file receives the compatibility default that maps an unmodified left click on `timeline.addMarker` back to that Command. Keyboard Enter still executes the selected Command directly.

Interaction Binding does not implement double-clicks, wildcard modifiers, global shortcuts, key synthesis, or Resolve shortcut discovery/mutation. The existing palette hotkey and `ShortcutManager` remain separate systems.

## Interaction Help

`InteractionManager.listBindings()` exposes normalized defensive binding records through the same semantic preload API in both Electron hosts. One renderer projection selects bindings for the hovered/focused target Command, resolves each `action.command` against loaded Command Metadata, formats the generic trigger label (`Click`, `Shift + Right Click`, and so on), and uses the action Command description. Palette and Settings share this projection, so remapping a binding updates help without changing Command Metadata or renderer branches. Missing action metadata omits only that help row; empty bindings fall back to the target Command description.

## Capability Routing

Command metadata describes intent with `capability: "marker.add"`; it does not select Resolve or keyboard implementation details. The runtime chain is:

```text
command-engine -> capability registry -> capability -> execution adapter -> Resolve / keyboard / future automation
```

Each capability keeps descriptive metadata separate from execution. The registry's `getMetadata(id)` returns the full metadata contract, while `getAllCapabilities()` returns catalog summaries containing only `id`, `name`, `category`, and `icon`. Provider metadata describes supported provider families, not which backend is currently available in a host.

`capability/marker.js` selects the first available marker backend in this order: direct Resolve API, Resolve Script API, Workflow Plugin API, configured keyboard shortcut, then a reserved future UI-automation slot. Availability is checked before execution. Once a backend starts marker execution, any semantic or API error is returned without trying a lower backend, avoiding duplicate or partial actions.

The Workflow Integration host injects `resolve/adapter.js` as the Workflow Plugin API backend. The standalone/Utility host injects `execution-adapter/bridge.js` as the Resolve Script API backend; it checks `/health` before sending the existing command-id request to the Python bridge and `resolve/adapter.py`.

Capability metadata also owns a plain `configSchema`. `config/SchemaValidator.js` validates schema fields and values, while `config/SchemaLabels.js` is the single explicit-label/key-fallback formatter used by `ConfigManager` and `FeatureCatalog`. FeatureCatalog returns cloned schemas with every `field.label` resolved, so Settings only renders labels. `ConfigStorage` persists the shared Electron `appData/Clackly/config.json` document with atomic replacement, and `ConfigManager` reloads that shared document before reads and writes while exposing capability-scoped values. Before execution, the command engine blocks capabilities with missing required settings and passes configuration as the second argument: `execute(command, { config })`. Capabilities read only their own declared values through `config.get(key)`; they do not access the file or storage service directly. The Workflow Integration host still keeps its separate Electron `userData` path.

## Python Script Capabilities

Script-backed Features use the normal Command and Capability path. Add three artifacts without editing either Electron host, the renderer, or Command Engine:

1. A Python feature script under the application root.
2. A Capability JSON manifest in `capability/definitions/`.
3. A Command JSON manifest in `command-engine/commands/` that names the Capability id.

The Capability manifest keeps the existing metadata and `configSchema`, and adds:

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
  "configSchema": {
    "output": { "type": "folder", "label": "Output folder", "required": true }
  }
}
```

The entry must be a relative file path contained by the application root. Python is the only implemented runtime. A script exports one synchronous or asynchronous `execute(context)` function and returns a JSON-serializable value:

```python
async def execute(context):
    context.logger.info("Starting export")
    project_name = context.project.GetName()
    return {
        "command": context.command_id,
        "project": project_name,
        "output": context.config["output"],
    }
```

`context` exposes exactly `command_id`, `resolve`, `config`, `logger`, `project`, and `timeline`. `command_id` is read-only and is the stable id of the Command being executed. The logger supports `debug`, `info`, `warning`, and `error`. Resolve objects are loaded lazily through `resolve/adapter.py`; configuration is a plain snapshot scoped to the Capability. Script stdout, stderr, and logger calls are captured and replayed without entering the JSON result channel.

The script runtime invokes the `python` executable from the host `PATH`. `RESOLVE_COMMAND_CENTER_PYTHON_CMD` remains specific to the Utility bridge because it is a full command and may include arguments.

Scripts are trusted local Feature code, not sandboxed third-party code. Each execution starts one Python subprocess. Sandboxing, permissions, process pooling, cancellation, timeouts, streaming, package environments, interpreter discovery UI, and Lua/Node/shell runtimes are deferred until a concrete need justifies them.

## Resolve2AE Export Feature

The bundled `ae.export` Feature sends Resolve timeline media to After Effects through `scripts/resolve2ae_export.py` and the local `resolve2ae_core/`. On Windows, Clackly automatically discovers `AfterFX.exe` from a running After Effects process, the per-user or machine App Paths registry entry, then standard Adobe installation directories (highest numeric version first), and persists the first existing file as **After Effects Path**. A valid saved path always wins, so the existing Browse control remains a manual override. If discovery fails, the required field stays empty and the existing Settings recovery remains available. **Composition Prefix** is optional and defaults to `Link`; command execution still rejects an invalid or missing executable.

The primary **Export to After Effects** card uses these exact mouse mappings, and all four Commands are searchable and executable with Enter:

| Trigger / Command | Selection |
|---|---|
| Click / Export to After Effects | Legacy automatic marker-or-playhead selection |
| Ctrl+Click / Export Current Clip | Topmost enabled clip under the playhead, with audio fallback |
| Shift+Click / Export Blue Marker Range | Video intersecting the first Blue duration marker |
| Ctrl+Shift+Click / Export Cyan Marker Range with Audio | Video and de-duplicated audio intersecting the first Cyan duration marker |

Blue and Cyan range Commands fail clearly when their required marker is absent; they do not fall back to the playhead. The release target is Windows with Resolve Studio Workflow Integration and After Effects. The retained macOS core path is not release-qualified. Progress streaming, cancellation, timeouts, and multiple-marker queues are intentionally not included.

## Feature UI Framework

The Settings button opens a separate `760x560` window (minimum `640x480`) with a Clackly title bar and native window controls, while Launcher, Search, and All Actions remain in the fixed `376x468` palette. `feature-ui/FeatureCatalog.js` projects full defensive metadata records from the existing Capability Registry, so registering a capability automatically adds it to the category-grouped Settings sidebar.

The unified detail panel renders feature identity and resolved schema from Capability Metadata, binding-derived interaction help for associated Commands, and all settings through the generic `SettingsRenderer`. String, number, boolean, color, path, folder, and select fields use native controls. Path/folder selection uses Electron dialogs, drafts remain local until Save, and Save/Reset cross preload IPC into `ConfigManager`; renderer code never reads config files or calls capabilities and Resolve APIs directly.

Feature Lifecycle adds three independent dimensions to that metadata-driven UI: `installed`, persisted `enabled`, and readiness `status`. Readiness is one of `ready`, `loading`, `missing-config`, `missing-dependency`, `unavailable`, or `error`. Every lifecycle record also contains the fixed structured contract `details: { missing: string[], action: "open-settings" | null }`; renderer code uses these fields for visibility, execution permission, warnings, and Settings recovery without parsing the user-facing `message`.

Only enablement overrides are persisted, in shared `appData/Clackly/feature-status.json`. Derived readiness, messages, errors, and recovery details remain in memory and are refreshed on renderer load and after Save, Reset, or Enable/Disable. Both Electron hosts share this file and the same Feature UI IPC, while retaining their different Capability providers.

Command execution keeps the existing boundary and adds one gate:

```text
Command ID -> Capability ID -> enabled assertion -> configuration assertion -> Capability.execute()
```

Capabilities may optionally expose a side-effect-free `checkAvailability()` returning `ready`, named `missing-dependency`, or `unavailable` data. Capabilities without a probe remain ready after configuration is complete. The marker probe reuses backend selection but never executes a marker action.

`shortcut/shortcuts.json` currently maps `CREATE_FUSION_CLIP` to `CTRL+ALT+F` and `ADD_MARKER` to `CTRL+M`. `ShortcutManager` supports lookup, introspection, and an injected future keyboard executor. It does not bind shortcuts, expose shortcut presentation metadata, or perform keyboard/UI automation in this MVP. The palette therefore shows no Command shortcut badge. The `Ctrl+Space` palette hotkey remains separate Electron window behavior.

## Resolve Workflow Integration Plugin

The preferred Resolve-side MVP path is now the Workflow Integration Plugin. Resolve Studio scans the Workflow Integration Plugins root on startup, registers valid plugin manifests, then loads the selected plugin from `Workspace > Workflow Integrations`. Once loaded, Clackly runs as a Resolve Workflow Integration Electron app. `workflow-plugin/main.js` owns Electron and Workflow Integration lifecycle plus capability injection, while `resolve/adapter.js` owns the Resolve scripting calls.

This is a better fit than a Utility script for lifecycle-sensitive development:

- `WorkflowIntegration.InitializePromise("com.wutpeach.clackly")` initializes the Resolve API bridge.
- `WorkflowIntegration.RegisterCallback("ResolveQuit", ...)` lets Clackly quit when Resolve quits.
- `WorkflowIntegration.CleanUp()` is called during Electron app shutdown.
- The command palette still starts hidden and is summoned with `Ctrl+Space`.

Important boundary: Resolve scans and registers Workflow Integration plugins on startup, but the official documentation describes loading the plugin from `Workspace > Workflow Integrations`. That is a real plugin lifecycle after load, not guaranteed silent background auto-start.

Install the development Workflow Plugin from `resolve-command-center/`:

```powershell
npm install
npm run build
npm run workflow:install
```

`npm run workflow:install` copies `WorkflowIntegration.node` from Resolve's official developer examples into `workflow-plugin/`, then creates a junction at:

```text
%PROGRAMDATA%\Blackmagic Design\DaVinci Resolve\Support\Workflow Integration Plugins\com.wutpeach.clackly
```

Restart DaVinci Resolve Studio after installation, then load `Clackly` from `Workspace > Workflow Integrations`. Press `Ctrl+Space`, type `marker`, and press `Enter`.

Do not use `npm run dev`, `npm start`, the Utility script, or an already-running standalone Electron window to validate the Workflow Integration command path. Those launch the bridge-backed external app from `electron/main/main.js`; Workflow Integration validation must use the Resolve menu-loaded plugin window from `workflow-plugin/main.js`.

If you prefer a physical copy instead of a junction:

```powershell
powershell -ExecutionPolicy Bypass -File scripts/install-workflow-plugin.ps1 -Mode Copy
```

The repository intentionally does not commit `WorkflowIntegration.node`; it is a Resolve-provided native module and is ignored by git.

## Local Development

```bash
npm install
npm run dev
```

`npm run dev` starts Vite and launches Electron with `--dev-renderer`, so the
unpackaged app intentionally loads `http://127.0.0.1:5173`.

For the Resolve Utility script path or a file-backed local launch:

```bash
npm start
```

`npm start` builds `dist/renderer/` first, then launches Electron against the
built `dist/renderer/index.html`. Use `npm run start:electron` only when the
renderer has already been built.

Run the Resolve Adapter regression tests for both integration paths with:

```bash
npm test
```

Build and verify the Windows package with its hash-locked Managed Python Runtime:

```powershell
npm run runtime:stage
npm run package:win
npm run package:verify
```

The Runtime candidate is intentionally not a released compatibility claim until the
live Resolve/After Effects matrix passes. See [Managed Python Runtime](docs/managed-python-runtime.md),
[compatibility matrix](docs/resolve-python-matrix.md), and
[Runtime troubleshooting](docs/resolve-python-runtime-troubleshooting.md).

The Electron palette starts hidden. Press `Ctrl+Space` on Windows/Linux or `Cmd+Space` on macOS to show it. The default bridge endpoint is `http://127.0.0.1:49371`; override it with `RESOLVE_COMMAND_CENTER_BRIDGE_URL` or set `RESOLVE_COMMAND_CENTER_PORT`.

## Resolve Utility Entrypoint

The Utility script path is now a development fallback, not the preferred lifecycle model.

Copy or symlink `resolve/Clackly.py` into Resolve's Utility scripts directory. On Windows, the user-level location is usually:

```text
%APPDATA%\Blackmagic Design\DaVinci Resolve\Support\Fusion\Scripts\Utility\
```

`resolve/Clackly.py` is the Resolve entrypoint and contains the launch implementation. Set `RESOLVE_COMMAND_CENTER_ROOT` to the app root before launching Resolve:

```powershell
$env:RESOLVE_COMMAND_CENTER_ROOT="<path-to-resolve-command-center>"
```

That PowerShell form only applies to Resolve if Resolve is launched from the same PowerShell process. To launch Resolve from the Start menu, set a user-level environment variable instead, then restart Resolve:

```powershell
setx RESOLVE_COMMAND_CENTER_ROOT "D:\Clackly\resolve-command-center"
```

Resolve's embedded Utility script runner may execute `Clackly.py` without defining `__file__`, including when `Clackly.py` is symlinked into the Utility directory. In that runner mode the script cannot reliably infer its own source-tree location, so `RESOLVE_COMMAND_CENTER_ROOT` is the most reliable path source. If `__file__` is available, the script still checks source-tree and symlink-friendly paths next to the script.

The script is safe to run more than once; it checks the bridge health endpoint before starting another bridge instance. By default it starts `bridge/server.py` as a background Python subprocess, waits briefly for `/health`, then launches Electron. The bridge handles HTTP transport and command dispatch, while `resolve/adapter.py` owns all Python Resolve API access. Startup diagnostics are written to:

```text
%APPDATA%\Clackly\clackly.log
```

Override the log path with `RESOLVE_COMMAND_CENTER_LOG`.

Optional environment variables:

- `RESOLVE_COMMAND_CENTER_PORT`: localhost bridge port, default `49371`; must be an integer from `1` to `65535`.
- `RESOLVE_COMMAND_CENTER_PYTHON_CMD`: Python command used to start `bridge/server.py`; defaults to `sys.executable` when it looks like a Python launcher, otherwise `python`.
- `RESOLVE_COMMAND_CENTER_BRIDGE_MODE`: bridge launch mode, default `subprocess`; set to `thread` only when debugging the old in-process Resolve Utility behavior.
- `RESOLVE_COMMAND_CENTER_BRIDGE_HEALTH_TIMEOUT`: seconds to wait for `GET /health` before Electron launch, default `5`.
- `RESOLVE_COMMAND_CENTER_BRIDGE_LOG`: bridge subprocess stdout/stderr log path, default `%APPDATA%\Clackly\bridge.log`.
- `RESOLVE_COMMAND_CENTER_SHOW_BRIDGE_CONSOLE=1`: show a bridge console window on Windows. By default the subprocess has no console and its output is appended to the bridge log.
- `RESOLVE_COMMAND_CENTER_ELECTRON_CMD`: command used by `Clackly.py` to launch the Electron app, default `npm run start`.
- `RESOLVE_COMMAND_CENTER_RENDERER_URL`: explicit renderer URL for custom dev-server launches.
- `RESOLVE_COMMAND_CENTER_USE_DEV_SERVER=1`: make Electron load Vite using `VITE_DEV_SERVER_PORT`, default `5173`.
- `RESOLVE_COMMAND_CENTER_ALLOWED_ORIGIN`: bridge CORS origin for custom browser-based tooling, default `http://127.0.0.1:5173`.
- `RESOLVE_COMMAND_CENTER_DISABLE_ELECTRON=1`: start only the Python bridge.
- `RESOLVE_SCRIPT_API`: Resolve scripting API directory. On standard Windows installs, `Clackly.py` auto-detects `C:\ProgramData\Blackmagic Design\DaVinci Resolve\Support\Developer\Scripting` when it contains `Modules\DaVinciResolveScript.py`.
- `RESOLVE_SCRIPT_LIB`: Resolve scripting library path. On standard Windows installs, `Clackly.py` auto-detects `C:\Program Files\Blackmagic Design\DaVinci Resolve\fusionscript.dll` when present.
- `PYTHONPATH`: additional Python import paths. `Clackly.py` prepends `%RESOLVE_SCRIPT_API%\Modules` after reading or auto-detecting `RESOLVE_SCRIPT_API`.

The dev-MVP bridge subprocess does not inherit Resolve's in-process Python globals. It can still execute Resolve commands if the selected Python can import the Resolve scripting modules and connect to Resolve through Blackmagic's scripting bridge. `Clackly.py` preserves existing `RESOLVE_SCRIPT_API`, `RESOLVE_SCRIPT_LIB`, and `PYTHONPATH` values, fills standard Windows Resolve scripting defaults when those variables are missing, and logs whether each value came from the environment or auto-detection. Users normally should not need to set scripting API paths manually on standard Windows installs.

Resolve Utility menu scripts are run when selected from the menu; they are not a true Resolve application startup hook. The MVP entrypoint can start the bridge and Electron after the Utility script is triggered. A final installer, launch wrapper, or separate startup mechanism still needs to install and trigger that entrypoint automatically for true Resolve auto-start.

## Troubleshooting

- `RuntimeError: Could not locate resolve-command-center app root` from Resolve usually means the Utility runner did not provide `__file__` and `RESOLVE_COMMAND_CENTER_ROOT` is missing or points to the wrong directory. Set `RESOLVE_COMMAND_CENTER_ROOT` to the directory containing `package.json` and `bridge/server.py`, then relaunch Resolve.
- Symlinking `Clackly.py` is useful for source edits, but it does not guarantee Resolve will expose a script filename to Python. Keep `RESOLVE_COMMAND_CENTER_ROOT` set even when using a symlink.
- `Error invoking remote method 'commands:execute': Error: Resolve scripting API is unavailable; run the bridge inside Resolve` means the command reached the old bridge-backed external app, not the Workflow Integration handler. Quit any standalone Clackly, `npm run dev`, `npm start`, or Utility-script-launched Electron process, restart Resolve Studio, then open Clackly from `Workspace > Workflow Integrations`.
- `connect ECONNREFUSED 127.0.0.1:49371` from Electron means the bridge is not listening on the configured port. Check `%APPDATA%\Clackly\clackly.log` for the app root, Python command, Resolve scripting environment variables, and `/health` wait result. If the bridge subprocess starts and exits, check `%APPDATA%\Clackly\bridge.log` for Python errors from `bridge/server.py`. Common causes are a missing `RESOLVE_COMMAND_CENTER_ROOT`, `python` not being on `PATH`, an incompatible Python selected by `RESOLVE_COMMAND_CENTER_PYTHON_CMD`, or the port already being used by another process.
- If `/health` succeeds but `timeline.addMarker` fails with `Resolve scripting API is unavailable`, check `%APPDATA%\Clackly\clackly.log` for `RESOLVE_SCRIPT_API`, `RESOLVE_SCRIPT_LIB`, and `PYTHONPATH` source labels. On standard Windows installs these should be auto-detected. If auto-detection fails because Resolve is installed somewhere else, set those variables manually for the Python process that runs the bridge, then restart Resolve.
- If Workflow Plugin loading shows a warning that the configured global shortcut could not be registered, another app already owns it. Close the old Clackly dev Electron process or set `RESOLVE_COMMAND_CENTER_HOTKEY` before launching Resolve to test another shortcut.
- If marker creation is refused, move the playhead inside the active timeline and make sure there is not already a timeline marker on that frame. Clackly converts Resolve's displayed playhead timecode to the timeline-relative frame id required by `Timeline.AddMarker`; the error includes both values for diagnosis.
- A visible `cmd.exe` window during launch is normally the `npm run start` Electron launcher, not the hidden bridge diagnostics. Bridge startup diagnostics are in `%APPDATA%\Clackly\clackly.log`; bridge subprocess stdout and stderr are in `%APPDATA%\Clackly\bridge.log`. For one-off bridge console debugging on Windows, set `RESOLVE_COMMAND_CENTER_SHOW_BRIDGE_CONSOLE=1` before launching Resolve.
