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
  - generic routing from command capability metadata to host-injected capability handlers
- [x] Add `timeline.addMarker` command metadata.
- [x] Implement Python bridge:
  - localhost HTTP `POST /command`
  - JSON request and response handling
  - command handler table that delegates Resolve actions to `resolve/adapter.py`
- [x] Implement the Python Resolve Adapter:
  - Resolve connection helper isolated under `resolve/`
  - `add_marker` action with timeline and playhead validation
- [x] Implement `resolve/Clackly.py`:
  - single-file Resolve Utility entrypoint
  - resolve app root from configuration
  - start bridge as a detached Python subprocess by default
  - retain thread bridge mode only for debugging the old Utility-script behavior
  - log startup diagnostics to `%APPDATA%/Clackly/clackly.log`
  - redirect hidden bridge subprocess output to `%APPDATA%/Clackly/bridge.log`
  - auto-detect standard Windows Resolve scripting paths when `RESOLVE_SCRIPT_API` and `RESOLVE_SCRIPT_LIB` are missing
  - prepend the resolved Resolve scripting `Modules` directory to `PYTHONPATH`
  - log whether Resolve scripting values came from env, auto-detection, derivation, or are missing
  - wait briefly for the bridge `/health` endpoint before Electron launch
  - launch Electron if it is not already running
  - document Windows Utility script installation target
- [x] Add README or inline docs covering local dev launch and Resolve Utility script installation.
- [x] Run validation commands and record any Resolve-only manual verification gaps.
- [x] Add Workflow Integration Plugin manifest and main entrypoint.
- [x] Implement Workflow Plugin lifecycle calls:
  - `InitializePromise`
  - `ResolveQuit` callback
  - `CleanUp()` during app shutdown
- [x] Route Workflow Plugin command execution through command capability metadata and the injected JavaScript Resolve Adapter.
- [x] Add a development install script that copies `WorkflowIntegration.node` from Resolve's official examples and registers the plugin under the Workflow Integration Plugins root.
- [x] Update README and task artifacts to make Workflow Integration the preferred MVP path and Utility scripts a fallback.
- [x] Run validation commands after the Workflow Plugin pivot.
- [x] Diagnose post-pivot `commands:execute` bridge error and document that `Resolve scripting API is unavailable; run the bridge inside Resolve` comes from the standalone Electron/Python bridge path, not the Workflow Integration handler.
- [x] Add a clearer standalone Electron IPC error when the bridge-backed app handles a command that was intended for the Workflow Integration path.
- [x] Warn and show the Workflow Plugin palette when the global shortcut is already owned by an old dev/Utility Electron process.
- [x] Isolate all Resolve scripting API access in `resolve/` adapters for both Workflow Integration and Python fallback paths.
- [x] Add a dependency-injected marker capability with ordered availability selection and non-fallback execution errors.
- [x] Replace implementation-specific command executor metadata with `capability: marker.add` while preserving the command id and search behavior.
- [x] Add the ShortcutManager mapping/introspection/execution skeleton without automatic shortcut binding or keyboard/UI automation.
- [x] Inject the Workflow Plugin JavaScript Resolve adapter as `workflowPluginApi` and the health-checked standalone bridge adapter as `resolveScriptApi`.
- [x] Add focused capability, shortcut, command-routing, and bridge execution-adapter tests while preserving Resolve adapter/drop-frame tests.

## Validation Commands

- `npm install` from `resolve-command-center/`
- `npm run build` from `resolve-command-center/`
- `node --check resolve-command-center/workflow-plugin/main.js`, `node --check resolve-command-center/resolve/adapter.js`, and `node --check resolve-command-center/resolve/marker-frame.js`
- `npm run dev` from `resolve-command-center/` for local UI validation
- `python -m py_compile resolve-command-center/bridge/server.py resolve-command-center/bridge/resolve_bridge.py resolve-command-center/resolve/adapter.py resolve-command-center/resolve/Clackly.py`
- `powershell -NoProfile -ExecutionPolicy Bypass -File resolve-command-center/scripts/install-workflow-plugin.ps1` on a Resolve Studio development machine
- Targeted subprocess launcher probe with Electron disabled and `/health` checked on a throwaway local port.
- Targeted environment probe with `RESOLVE_SCRIPT_API`, `RESOLVE_SCRIPT_LIB`, and `PYTHONPATH` unset to confirm standard Windows auto-detection populates bridge env values and prepends `Modules`.

## Manual Validation

- [x] Live Resolve validation confirmed `timeline.addMarker` creates the marker at the current playhead after the relative-frame Adapter fix and Capability Layer wiring.

- Open DaVinci Resolve with a project and active timeline.
- Install the Workflow Integration Plugin with `npm run workflow:install`.
- Restart DaVinci Resolve Studio and load `Clackly` from `Workspace > Workflow Integrations`.
- Ensure any standalone Clackly, `npm run dev`, `npm start`, or Utility-script-launched Electron process is closed before testing the Workflow Integration path.
- Press `Ctrl+Space`, type `marker`, press `Enter`, and confirm a red marker appears at the playhead.
- Copy or symlink `resolve/Clackly.py` into the Windows Resolve Utility scripts directory.
- Ensure `RESOLVE_COMMAND_CENTER_ROOT` points to the app root before launching Resolve, especially when Resolve's Utility script runner does not define `__file__` or when using a symlink.
- Standard Windows Resolve installs should not require manual `RESOLVE_SCRIPT_API` or `RESOLVE_SCRIPT_LIB`; check `%APPDATA%/Clackly/clackly.log` for auto-detection source labels if `timeline.addMarker` cannot import the scripting API.
- Launch Resolve and confirm Electron starts automatically.
- Press `Ctrl+Space`, type `marker`, press `Enter`, and confirm a red marker appears at the playhead.

## Risky Areas

- Resolve Python API availability depends on the bridge Python process being able to import Resolve scripting modules. The dev-MVP subprocess path passes through `RESOLVE_SCRIPT_API`, `RESOLVE_SCRIPT_LIB`, and `PYTHONPATH` when present, auto-detects standard Windows install paths when missing, but it cannot inherit Resolve's in-process `resolve` or `bmd` globals.
- Resolve Utility menu scripts are not true Resolve application startup hooks; production auto-start still needs an installer, launch wrapper, or separate startup trigger.
- Resolve launch process management can accidentally spawn duplicates; implementation should detect or tolerate an already-running Electron app.
- The standalone Electron app and the Workflow Integration plugin register the same `commands:execute` IPC channel in separate processes. The error `Resolve scripting API is unavailable; run the bridge inside Resolve` is a strong signal that the active window is the standalone bridge-backed app, not the plugin.
- Global shortcut registration may fail if another app owns the accelerator; log or surface this in development output.
- Manual Resolve validation cannot be completed in a headless or Resolve-free environment.

## Rollback Points

- If Electron UI scaffolding fails, remove `resolve-command-center/` before adding bridge and Resolve integration.
- If bridge integration fails, keep UI and command engine intact while leaving the standalone Resolve Script API capability backend unavailable during local dev.
- If Resolve Utility script integration fails, retain manual `npm run dev` launch and document the unresolved Resolve launch gap.
