# Clackly

Architecture-validation MVP for a DaVinci Resolve command palette. Electron owns the desktop UI, the command engine owns registry search and executor routing, and Resolve integration is isolated behind a Resolve-side integration layer.

## Resolve Workflow Integration Plugin

The preferred Resolve-side MVP path is now the Workflow Integration Plugin. Resolve Studio scans the Workflow Integration Plugins root on startup, registers valid plugin manifests, then loads the selected plugin from `Workspace > Workflow Integrations`. Once loaded, Clackly runs as a Resolve Workflow Integration Electron app and calls Resolve through Blackmagic's `WorkflowIntegration.node` JavaScript API.

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

The script is safe to run more than once; it checks the bridge health endpoint before starting another bridge instance. By default it starts `bridge/server.py` as a background Python subprocess, waits briefly for `/health`, then launches Electron. Startup diagnostics are written to:

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
- `connect ECONNREFUSED 127.0.0.1:49371` from Electron means the bridge is not listening on the configured port. Check `%APPDATA%\Clackly\clackly.log` for the app root, Python command, Resolve scripting environment variables, and `/health` wait result. If the bridge subprocess starts and exits, check `%APPDATA%\Clackly\bridge.log` for Python errors from `bridge/server.py`. Common causes are a missing `RESOLVE_COMMAND_CENTER_ROOT`, `python` not being on `PATH`, an incompatible Python selected by `RESOLVE_COMMAND_CENTER_PYTHON_CMD`, or the port already being used by another process.
- If `/health` succeeds but `timeline.addMarker` fails with `Resolve scripting API is unavailable`, check `%APPDATA%\Clackly\clackly.log` for `RESOLVE_SCRIPT_API`, `RESOLVE_SCRIPT_LIB`, and `PYTHONPATH` source labels. On standard Windows installs these should be auto-detected. If auto-detection fails because Resolve is installed somewhere else, set those variables manually for the Python process that runs the bridge, then restart Resolve.
- A visible `cmd.exe` window during launch is normally the `npm run start` Electron launcher, not the hidden bridge diagnostics. Bridge startup diagnostics are in `%APPDATA%\Clackly\clackly.log`; bridge subprocess stdout and stderr are in `%APPDATA%\Clackly\bridge.log`. For one-off bridge console debugging on Windows, set `RESOLVE_COMMAND_CENTER_SHOW_BRIDGE_CONSOLE=1` before launching Resolve.
