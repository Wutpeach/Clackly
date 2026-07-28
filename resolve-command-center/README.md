# Clackly

Architecture-validation MVP for a DaVinci Resolve command palette. Electron owns the desktop UI, the command engine owns registry search and executor routing, and Resolve API calls are isolated in a Python localhost bridge.

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

The dev-MVP bridge subprocess does not inherit Resolve's in-process Python globals. It can still execute Resolve commands if the selected Python can import the Resolve scripting modules and connect to Resolve through Blackmagic's scripting bridge. `Clackly.py` passes through existing `RESOLVE_SCRIPT_API`, `RESOLVE_SCRIPT_LIB`, and `PYTHONPATH` values, and prepends `%RESOLVE_SCRIPT_API%\Modules` to `PYTHONPATH` when `RESOLVE_SCRIPT_API` is set. If those variables are missing, `/health` can still succeed, but `timeline.addMarker` may fail with a Resolve scripting API error until the environment is configured.

## Troubleshooting

- `RuntimeError: Could not locate resolve-command-center app root` from Resolve usually means the Utility runner did not provide `__file__` and `RESOLVE_COMMAND_CENTER_ROOT` is missing or points to the wrong directory. Set `RESOLVE_COMMAND_CENTER_ROOT` to the directory containing `package.json` and `bridge/server.py`, then relaunch Resolve.
- Symlinking `Clackly.py` is useful for source edits, but it does not guarantee Resolve will expose a script filename to Python. Keep `RESOLVE_COMMAND_CENTER_ROOT` set even when using a symlink.
- `connect ECONNREFUSED 127.0.0.1:49371` from Electron means the bridge is not listening on the configured port. Check `%APPDATA%\Clackly\clackly.log` for the app root, Python command, Resolve scripting environment variables, and `/health` wait result. If the bridge subprocess starts and exits, check `%APPDATA%\Clackly\bridge.log` for Python errors from `bridge/server.py`. Common causes are a missing `RESOLVE_COMMAND_CENTER_ROOT`, `python` not being on `PATH`, an incompatible Python selected by `RESOLVE_COMMAND_CENTER_PYTHON_CMD`, or the port already being used by another process.
- If `/health` succeeds but `timeline.addMarker` fails with `Resolve scripting API is unavailable`, configure `RESOLVE_SCRIPT_API`, `RESOLVE_SCRIPT_LIB`, and `PYTHONPATH` for the Python process that runs the bridge, then restart Resolve. For one-off debugging on Windows, set `RESOLVE_COMMAND_CENTER_SHOW_BRIDGE_CONSOLE=1` before launching Resolve.
