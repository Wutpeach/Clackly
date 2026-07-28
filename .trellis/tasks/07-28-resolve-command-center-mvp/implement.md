# Resolve Command Center MVP Implementation Plan

## Checklist

- [x] Scaffold `resolve-command-center/` with Electron, React, Vite, and Node package scripts.
- [x] Implement Electron main modules:
  - hidden window creation
  - always-on-top palette behavior
  - taskbar omission
  - `CommandOrControl+Space` global shortcut
  - IPC events for show, hide, command listing, and command execution
- [x] Implement secure preload API for renderer access to command operations.
- [x] Implement renderer UI:
  - focused search box
  - filtered command list
  - arrow-key selection
  - `Enter` execution
  - `Escape` hide
- [x] Implement command engine:
  - manifest loading from `command-engine/commands/*.json`
  - query matching against id, name, and keywords
  - executor adapter routing by executor id
- [x] Add `timeline.addMarker` command metadata.
- [x] Implement Python bridge:
  - localhost HTTP `POST /command`
  - JSON request and response handling
  - command handler table
  - Resolve connection helper
  - `add_marker` action with timeline and playhead validation
- [x] Implement `resolve/Clackly.py` and `resolve/startup.py`:
  - user-facing `Clackly.py` Utility entrypoint
  - `Clackly.py` delegates to the existing startup implementation
  - resolve app root from configuration
  - start bridge in a background thread inside Resolve scripting context
  - launch Electron if it is not already running
  - document Windows Utility script installation target
- [x] Add README or inline docs covering local dev launch and Resolve startup installation.
- [x] Run validation commands and record any Resolve-only manual verification gaps.

## Validation Commands

- `npm install` from `resolve-command-center/`
- `npm run build` from `resolve-command-center/`
- `npm run dev` from `resolve-command-center/` for local UI validation
- `python -m py_compile resolve-command-center/bridge/server.py resolve-command-center/bridge/resolve_bridge.py resolve-command-center/resolve/startup.py resolve-command-center/resolve/Clackly.py`

## Manual Validation

- Open DaVinci Resolve with a project and active timeline.
- Copy or symlink `resolve/Clackly.py` into the Windows Resolve Utility scripts directory.
- Ensure `RESOLVE_COMMAND_CENTER_ROOT` points to the app root if the deployment is not relative to the startup script.
- Launch Resolve and confirm Electron starts automatically.
- Press `Ctrl+Space`, type `marker`, press `Enter`, and confirm a red marker appears at the playhead.

## Risky Areas

- Resolve Python API availability depends on running inside Resolve's scripting environment.
- Startup process management can accidentally spawn duplicates; implementation should detect or tolerate an already-running Electron app.
- Global shortcut registration may fail if another app owns the accelerator; log or surface this in development output.
- Manual Resolve validation cannot be completed in a headless or Resolve-free environment.

## Rollback Points

- If Electron UI scaffolding fails, remove `resolve-command-center/` before adding bridge/startup integration.
- If bridge integration fails, keep UI and command engine intact while disabling the Resolve executor during local dev.
- If startup integration fails, retain manual `npm run dev` launch and document the unresolved Resolve startup gap.
