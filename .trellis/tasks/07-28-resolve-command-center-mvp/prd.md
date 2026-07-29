# Resolve Command Center MVP

## Goal

Build an architecture-validation MVP for a DaVinci Resolve command palette inspired by Adobe FX Console and the VS Code Command Palette. The MVP proves that Resolve can load a desktop command UI, that `Ctrl+Space` can summon it, and that selecting a command can execute a Resolve API action through a Resolve-side integration layer.

## User Value

The user can trigger Resolve actions from a searchable desktop palette without navigating Resolve menus. The implementation should remain extensible enough to support future command packs, workflow plugins, and 100+ commands without rewriting the core boundaries.

## Confirmed Facts

- The repository currently has no product source files; this task will create the initial MVP structure.
- The requested desktop technology is Electron, React, and Node.js.
- Electron must remain the user experience layer and renderer code must not directly call Resolve APIs.
- Resolve API calls must be centralized in a Resolve-side integration layer. The preferred MVP layer is a Workflow Integration Plugin using Blackmagic's `WorkflowIntegration.node` JavaScript API; the Python Utility bridge remains a fallback for comparison.
- The MVP command set contains exactly one command: `timeline.addMarker`.
- Workflow Integration is now part of the MVP because Utility scripts do not provide a clean app lifecycle. The command registry must still not hardcode command-specific UI logic.

## Requirements

- `R1`: Create an Electron app with a hidden command window that can be shown with `CommandOrControl+Space`.
- `R2`: The command window must be omitted from the taskbar, appear above other windows when opened, focus the search input, and hide on `Escape` or after command execution.
- `R3`: Build a renderer UI containing only search, command list, selection, and keyboard interaction concerns.
- `R4`: Build a command engine that loads command metadata from registry data, initially from a JSON command manifest.
- `R5`: Avoid command-specific conditionals in the UI and command engine such as `if command == "marker"`; route execution through command metadata and executor adapters.
- `R6`: Add the `timeline.addMarker` command with `id`, `name`, `keywords`, and `executor` metadata.
- `R7`: Build a Workflow Integration Plugin entrypoint that Resolve Studio can register from `manifest.xml`.
- `R8`: Implement `timeline.addMarker` through the Workflow Integration JavaScript API by adding a red marker on the current timeline at the current playhead frame.
- `R9`: Preserve the single-file Resolve `Clackly.py` Utility entrypoint as a development fallback that can start the Python bridge and launch the external Electron app.
- `R10`: Avoid hardcoded machine-specific absolute paths; launch and bridge configuration must be supplied through environment variables, relative deployment layout, or documented command arguments.
- `R11`: Preserve future extension points for plugin scanning without implementing a plugin marketplace, Workflow Plugin UI, AI features, cloud sync, accounts, auto-update, Fusion tooling, or additional Resolve commands.

## Acceptance Criteria

- [ ] `npm install` can install the Electron/React app dependencies.
- [ ] `npm run dev` or an equivalent documented command can launch the MVP Electron app for local UI validation.
- [ ] Pressing `Ctrl+Space` or `Cmd+Space` shows the command palette window.
- [ ] The command palette starts hidden, is not shown in the taskbar, is topmost while open, focuses the search input, and hides on `Escape`.
- [ ] Typing `marker` matches `timeline.addMarker` through registry search rather than command-specific UI logic.
- [ ] Pressing `Enter` on `timeline.addMarker` in the Workflow Plugin sends only the command id from the renderer to the main process.
- [ ] The Workflow Plugin maps `timeline.addMarker` to an `addMarker` Resolve action without renderer code importing or invoking Resolve APIs directly.
- [ ] In a Resolve Studio session with an open timeline, invoking `timeline.addMarker` creates a red timeline marker at the current playhead frame and then hides the palette.
- [ ] The Workflow Plugin calls `InitializePromise`, handles `ResolveQuit`, and calls `CleanUp()` during plugin shutdown.
- [ ] `Clackly.py` documents or implements the installation path for Resolve Utility scripts on Windows and can launch the Electron app without hardcoded user-specific paths.
- [ ] The repository contains a clear project structure for Electron, command engine, bridge, and Resolve launch code.

## Out Of Scope

- Fixed Resolve panel beyond the floating command palette.
- Plugin marketplace or third-party plugin installation.
- Fusion, Color, Fairlight, or edit commands beyond `timeline.addMarker`.
- AI features, cloud sync, user accounts, and auto-update.
- Production packaging, signing, installers, automatic menu loading, and cross-platform Resolve installation automation.
- Full Resolve API abstraction beyond the one marker command needed to validate the architecture.

## Risks And Deferred Items

- Resolve scripting path and Python module loading vary by installation. The MVP should document the Windows Utility script copy target and keep app-root lookup configurable.
- The bridge must run where the Resolve Python API is available. Starting a generic system Python server is insufficient unless it can access Resolve's scripting modules.
- Workflow Integration Plugins are supported by Resolve Studio on Windows and macOS, not Linux according to the local Resolve documentation updated 2024-10-03.
- Resolve scans Workflow Integration plugins on startup and registers menu entries, but the official documentation describes loading them from `Workspace > Workflow Integrations`; this is a lifecycle improvement after load, not proof of silent background auto-start.
- Global shortcuts can conflict with OS or Resolve shortcuts. MVP keeps `CommandOrControl+Space` as requested and may expose the accelerator as a small config later.
- Resolve API behavior can only be fully verified on a machine with DaVinci Resolve, a project, and an active timeline.
- Live testing showed Resolve may tear down daemon-thread work after a Utility script finishes. The dev-MVP launcher now keeps the bridge alive by starting it as a detached Python subprocess; that subprocess still owns Resolve API calls, but it needs Resolve scripting modules available through environment configuration because it cannot inherit Resolve's in-process Python globals.
