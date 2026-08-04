# Technical Design

## Boundary

Resolve 20.3.2.9 with Electron 36.3.2 is the only qualified host. Local Electron is a compatibility harness for that host, not an independent product target.

## Dependency Baseline

Pin `electron` exactly to `36.3.2` in `package.json` and regenerate `package-lock.json` with npm. An exact version avoids silently widening the local API surface. Existing JavaScript, build, and package commands remain unchanged.

Window tests will assert the complete expected option objects and the exact package baseline. This makes a future native option change an explicit compatibility decision instead of an unnoticed constructor addition.

## Window Contracts

| Window | Size | Windows frame options | Retained behavior |
|---|---:|---|---|
| Palette | `376x468` | `frame: false`, `thickFrame: false`, `resizable: false`, `maximizable: false`, `minimizable: false`, `fullscreenable: false` | Transparent rounded renderer surface, focus, keyboard input, always-on-top while shown, hide on blur |
| Settings | `760x560` | `frame: false`, `thickFrame: false`, `resizable: false`, `maximizable: false`, `minimizable: false`, `fullscreenable: false` | Singleton reuse/focus, custom drag region, custom close button, internal content scrolling |

Settings removes `minWidth`, `minHeight`, `titleBarStyle`, and `titleBarOverlay`. The unsupported `accentColor` option is removed rather than copied to Settings. `thickFrame: false` deliberately removes native DWM shadow/animation and edge resizing.

## Settings Close Flow

The existing shared Feature UI IPC boundary owns the minimal close path:

`Settings title-bar button -> preload closeSettings() -> settings:close -> host closeSettings callback -> settings BrowserWindow.close()`

Both Electron hosts inject their existing Settings singleton into the shared registrar through a one-line callback. No renderer Node access, window lookup protocol, custom resize IPC, or new dependency is introduced.

The close button is excluded from `-webkit-app-region: drag`, has an accessible name, and uses the existing Lucide icon system. The optional minimize button is omitted.

## Scrolling

Keep the `760x560` shell fixed. Reuse the current sidebar/detail overflow containers and verify loading, empty, and populated states. Add only the minimum CSS constraint needed if any state escapes the fixed workspace.

## Validation and Rollback

- Unit tests assert both complete BrowserWindow option contracts and shared close IPC.
- Build and package checks run with Electron 36.3.2.
- Live validation must use Resolve Workflow Integration and inspect both the full native window and renderer capture.
- Restarting Resolve for the live gate requires the user's current Resolve project to be safe first.
- Rollback is the package/lockfile, window helper, close IPC/UI, CSS, docs, and spec diff; no persisted user data changes.
