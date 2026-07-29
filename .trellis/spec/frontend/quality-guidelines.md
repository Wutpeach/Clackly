# Quality Guidelines

> Code quality standards for frontend development.

---

## Overview

Frontend code includes Electron main-process code, Workflow Integration Plugin main-process code, preload APIs, and renderer UI. The frontend layer owns desktop behavior and user interaction only; integration actions must cross a narrow IPC/API boundary instead of importing backend or Resolve-specific APIs into renderer code.

## Scenario: Electron Command Palette Boundary

### 1. Scope / Trigger

- Trigger: A command palette action crosses renderer UI, Electron main process, command registry, and a backend bridge.
- Applies when adding Electron windows, preload APIs, command UI, command search, or command execution wiring.

### 2. Signatures

- Renderer API exposed by preload:
  - `window.resolveCommandCenter.searchCommands(query: string) -> Promise<Command[]>`
  - `window.resolveCommandCenter.executeCommand(commandId: string) -> Promise<object>`
  - `window.resolveCommandCenter.hidePalette() -> void`
  - `window.resolveCommandCenter.onPaletteShown(callback: () -> void) -> () -> void`
- Command shape:
  - `{ id: string, name: string, keywords: string[], executor: string }`

### 3. Contracts

- Renderer search uses command metadata only: `id`, `name`, and `keywords`.
- Renderer execution sends only the selected `commandId`.
- External Electron main delegates command execution to the command engine and local bridge. Workflow Plugin main may call Resolve through `WorkflowIntegration.node`, but renderer code must still send only command ids through preload IPC.
- Development renderer loading must be explicit, for example `--dev-renderer` or `RESOLVE_COMMAND_CENTER_RENDERER_URL`.
- Default non-packaged startup should load built renderer files so Resolve-launched Electron does not depend on a Vite dev server.

### 4. Validation & Error Matrix

- Unknown command id -> command engine rejects with a user-facing error.
- Missing executor adapter -> command engine rejects with a user-facing error.
- Bridge failure -> renderer keeps the palette open, shows the error, and refocuses search.
- Successful command -> Electron hides the palette.
- Global shortcut registration failure -> main process logs a warning.
- Workflow Plugin global shortcut registration failure -> plugin shows its own palette and warns that another process owns the shortcut, because otherwise an old Utility/dev Electron process can keep routing commands to the Python bridge.

### 5. Good/Base/Bad Cases

- Good: Adding a command by adding manifest metadata and, if needed, an executor adapter.
- Base: `marker` query matches `timeline.addMarker` via registry search.
- Bad: UI code checks `if (query === "marker")` or invokes Resolve APIs directly.

### 6. Tests Required

- Assert query matching returns expected command ids for names and keywords.
- Assert renderer uses preload APIs instead of direct Node or Resolve imports.
- Assert `npm run build` succeeds and file-backed Electron startup has a built renderer target.

### 7. Wrong vs Correct

#### Wrong

```javascript
if (query === "marker") {
  resolve.GetProjectManager().GetCurrentProject();
}
```

#### Correct

```javascript
await window.resolveCommandCenter.executeCommand(command.id);
```

---

## Forbidden Patterns

- Command-specific UI branches for execution behavior.
- Renderer imports from backend bridge modules or Resolve scripting modules.
- Renderer imports from `WorkflowIntegration.node` or calls Resolve API methods.
- Implicit dev-server loading for normal Electron startup.

---

## Required Patterns

- Keep renderer access behind `preload.js` with `contextIsolation: true`.
- Route command execution through command metadata and executor adapters.
- Keep dev renderer startup explicit and separate from built renderer startup.

---

## Testing Requirements

- Run the package build after frontend changes: `npm run build`.
- For command search changes, run a Node-level registry assertion for the changed query and command id.

---

## Code Review Checklist

- No Resolve API names appear under Electron UI/main files except in documentation strings.
- Command ids live in command manifests or bridge handler tables, not renderer conditionals.
- `npm run dev` and built `npm start` behavior remain distinct.
