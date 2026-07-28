# Clackly

Architecture-validation MVP for a DaVinci Resolve command palette. Electron owns the desktop UI, the command engine owns registry search and executor routing, and Resolve API calls are isolated in a Python localhost bridge.

## Local Development

```bash
npm install
npm run dev
```

`npm run dev` starts Vite and launches Electron with `--dev-renderer`, so the
unpackaged app intentionally loads `http://127.0.0.1:5173`.

For the Resolve startup path or a file-backed local launch:

```bash
npm start
```

`npm start` builds `dist/renderer/` first, then launches Electron against the
built `dist/renderer/index.html`. Use `npm run start:electron` only when the
renderer has already been built.

The Electron palette starts hidden. Press `Ctrl+Space` on Windows/Linux or `Cmd+Space` on macOS to show it. The default bridge endpoint is `http://127.0.0.1:49371`; override it with `RESOLVE_COMMAND_CENTER_BRIDGE_URL` or set `RESOLVE_COMMAND_CENTER_PORT`.

## Resolve Startup Script

Copy or symlink `resolve/Clackly.py` into Resolve's Utility scripts directory. On Windows, the user-level location is usually:

```text
%APPDATA%\Blackmagic Design\DaVinci Resolve\Support\Fusion\Scripts\Utility\
```

`resolve/Clackly.py` is the user-facing entrypoint and delegates to the existing `resolve/startup.py` implementation. Set `RESOLVE_COMMAND_CENTER_ROOT` to the app root before launching Resolve if `Clackly.py` is copied outside the source tree:

```powershell
$env:RESOLVE_COMMAND_CENTER_ROOT="<path-to-resolve-command-center>"
```

The script is safe to run more than once; it checks the bridge health endpoint before starting another bridge instance.

Optional environment variables:

- `RESOLVE_COMMAND_CENTER_PORT`: localhost bridge port, default `49371`.
- `RESOLVE_COMMAND_CENTER_ELECTRON_CMD`: command used by the startup implementation to launch the Electron app, default `npm run start`.
- `RESOLVE_COMMAND_CENTER_RENDERER_URL`: explicit renderer URL for custom dev-server launches.
- `RESOLVE_COMMAND_CENTER_USE_DEV_SERVER=1`: make Electron load Vite using `VITE_DEV_SERVER_PORT`, default `5173`.
- `RESOLVE_COMMAND_CENTER_ALLOWED_ORIGIN`: bridge CORS origin for custom browser-based tooling, default `http://127.0.0.1:5173`.
- `RESOLVE_COMMAND_CENTER_DISABLE_ELECTRON=1`: start only the Python bridge.

The bridge must run inside Resolve's Python scripting context so it can access the Resolve Script API. A regular system Python process cannot validate the marker command unless Resolve scripting modules are available.
