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
  - `window.resolveCommandCenter.listCommands() -> Promise<Command[]>`
  - `window.resolveCommandCenter.searchCommands(query: string) -> Promise<Command[]>`
  - `window.resolveCommandCenter.executeCommand(commandId: string) -> Promise<object>`
  - `window.resolveCommandCenter.hidePalette() -> void`
  - `window.resolveCommandCenter.setPaletteMode(mode: "launcher" | "search" | "all-actions") -> void`
  - `window.resolveCommandCenter.onPaletteShown(callback: () -> void) -> () -> void`
- Command shape:
  - `{ id: string, name: string, keywords: string[], capability: string }`

### 3. Contracts

- Renderer search uses command metadata only: `id`, `name`, and `keywords`.
- Renderer execution sends only the selected `commandId`.
- Prototype-only presentation commands remain outside the command registry, announce that they cannot execute, and are rejected in the renderer before IPC.
- Renderer resizing sends a semantic palette mode, never arbitrary width/height values. Both standalone Electron and Workflow Integration route `palette:set-mode` through the shared window helper.
- Launcher, Search, and All Actions all use the fixed `376x468` window footprint; mode changes replace content without occupying more of the Resolve workspace.
- Electron hosts delegate command execution to the command engine, which resolves intent through an injected capability registry. External Electron registers a bridge-backed capability; Workflow Plugin registers a Resolve-backed capability. Renderer code still sends only command ids through preload IPC.
- Functional UI icons use `lucide-react` with the shared optical size/stroke convention. Clackly logo and mark remain project-owned SVG assets rather than Lucide substitutions.
- Development renderer loading must be explicit, for example `--dev-renderer` or `RESOLVE_COMMAND_CENTER_RENDERER_URL`.
- Default non-packaged startup should load built renderer files so Resolve-launched Electron does not depend on a Vite dev server.

### 4. Validation & Error Matrix

- Unknown command id -> command engine rejects with a user-facing error.
- Missing capability handler -> command engine rejects with a user-facing error.
- Unknown palette mode -> shared window helper refuses the resize; the renderer cannot supply dimensions directly.
- Prototype-only command -> renderer shows an unavailable message and does not invoke `executeCommand`.
- Bridge failure -> renderer keeps the palette open, shows the error, and refocuses search.
- Successful command -> Electron hides the palette.
- Global shortcut registration failure -> main process logs a warning.
- Workflow Plugin global shortcut registration failure -> plugin shows its own palette and warns that another process owns the shortcut, because otherwise an old Utility/dev Electron process can keep routing commands to the Python bridge.

### 5. Good/Base/Bad Cases

- Good: Adding command intent metadata and registering its capability in each supported host.
- Base: `marker` query matches `timeline.addMarker` via registry search.
- Good: Switching to All Actions sends `"all-actions"` while the host keeps the window at `376x468`.
- Good: Presentation fixtures are visibly and accessibly unavailable but can still demonstrate ranking and grouping.
- Bad: UI code checks `if (query === "marker")` or invokes Resolve APIs directly.
- Bad: Searching category labels, registering demo commands as capabilities, or sending `{ width, height }` from the renderer.

### 6. Tests Required

- Assert query matching returns expected command ids for names and keywords.
- Assert presentation category text alone does not match a command.
- Assert prototype entries remain unavailable and cannot reach execution IPC.
- Assert every accepted palette mode maps to `376x468` and standalone/Workflow hosts register the same semantic IPC channel.
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
window.resolveCommandCenter.setPaletteMode("all-actions");
```

---

## Forbidden Patterns

- Command-specific UI branches for execution behavior.
- Renderer imports from backend bridge modules or Resolve scripting modules.
- Renderer imports from `WorkflowIntegration.node` or calls Resolve API methods.
- Implicit dev-server loading for normal Electron startup.
- Renderer-provided window dimensions or mode-specific expansion beyond the fixed palette footprint.
- Hand-authored functional icon path libraries when the existing Lucide dependency provides the icon; brand assets are the exception.

---

## Required Patterns

- Keep renderer access behind `preload.js` with `contextIsolation: true`.
- Route command execution through command capability metadata and a host-injected capability registry.
- Keep prototype presentation data unavailable and outside executable manifests.
- Keep palette sizing in the shared Electron window helper and expose only semantic mode changes through preload.
- Use Lucide for functional controls/command icons and project SVGs for the Clackly identity.
- Keep dev renderer startup explicit and separate from built renderer startup.

---

## Testing Requirements

- Run the package build after frontend changes: `npm run build`.
- For command search changes, run a Node-level registry assertion for the changed query and command id.
- For renderer catalog/ranking changes, run the renderer model tests covering search boundaries, grouping, ordering, and unavailable fixtures.

---

## Code Review Checklist

- No Resolve scripting API names appear under Electron UI/main files except Workflow Integration lifecycle calls or documentation strings.
- Command ids live in command manifests or bridge handler tables, not renderer conditionals.
- Command manifests describe `capability`, not a Resolve or keyboard execution backend.
- All palette modes remain `376x468`; both Electron hosts share `palette:set-mode` behavior.
- Prototype commands include accessible unavailable messaging and never call execution IPC.
- Functional icons come from Lucide while `clackly-logo.svg` and `clackly-mark.svg` remain custom assets.
- `npm run dev` and built `npm start` behavior remain distinct.
