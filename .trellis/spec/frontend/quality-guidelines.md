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
- Clackly wordmark assets are deterministic vector geometry: use SVG paths/shapes only, never `<text>`, font-family declarations, or external font/image dependencies.
- The launcher visual contract uses an `8px` window radius and `6px` control/tile radius. Launcher tiles separate through layered hairlines and shallow offset/inset depth; selection uses a crisp orange edge without a zero-offset orange halo.
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
- Assert `clackly-logo.svg` parses as XML and contains no `<text>`, font reference, or external image.
- Visually verify the complete launcher at `376x468` after changes to grid, header, tile, or footer geometry.

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
- Font-dependent SVG `<text>` wordmarks or external font/image references inside Clackly brand assets.
- Zero-offset orange selection halos on launcher tiles; use a crisp orange border with neutral inset separation instead.

---

## Required Patterns

- Keep renderer access behind `preload.js` with `contextIsolation: true`.
- Route command execution through command capability metadata and a host-injected capability registry.
- Keep prototype presentation data unavailable and outside executable manifests.
- Keep palette sizing in the shared Electron window helper and expose only semantic mode changes through preload.
- Use Lucide for functional controls/command icons and project SVGs for the Clackly identity.
- Draw the CLACKLY wordmark with project-owned SVG paths/shapes and keep its accessible name on the consuming `<img>`.
- Keep launcher tile icons and one/two-line labels optically centered as one command unit.
- Keep dev renderer startup explicit and separate from built renderer startup.

---

## Testing Requirements

- Run the package build after frontend changes: `npm run build`.
- For command search changes, run a Node-level registry assertion for the changed query and command id.
- For renderer catalog/ranking changes, run the renderer model tests covering search boundaries, grouping, ordering, and unavailable fixtures.

## Scenario: Codex Impeccable Stop Hook

### 1. Scope / Trigger

- Trigger: the project-local Impeccable detector runs from the Codex `Stop` entry in `.codex/hooks.json`.

### 2. Signatures

- Input: Codex Stop event JSON on stdin, including `hook_event_name: "Stop"`, `session_id`, `turn_id`, `cwd`, and `stop_hook_active`.
- Clean output: `{"continue":true}` with exit code `0`.
- Finding output: `{"decision":"block","reason":"<detector findings>"}` with exit code `0`.

### 3. Contracts

- Every Codex Stop path that exits `0` emits exactly one parseable JSON object; empty or plain-text stdout is invalid.
- `turn_id` or explicit `IMPECCABLE_HOOK_HARNESS=codex` identifies the Codex wire contract.
- Claude, Cursor, GitHub Copilot, and PostToolUse payload formats remain provider-specific and unchanged.

### 4. Validation & Error Matrix

- No touched UI files / clean scan / disabled / re-entrant Stop -> `{"continue":true}`.
- Fresh findings -> `decision: "block"` with findings in `reason`, allowing Codex to continue one review pass.
- `stop_hook_active: true` -> continuation JSON without rescanning, preventing a Stop loop.

### 5. Good/Base/Bad Cases

- Good: Codex clean Stop exits `0` and stdout parses as `{"continue":true}`.
- Base: Claude Stop findings retain `hookSpecificOutput.additionalContext`.
- Bad: Codex Stop exits `0` with empty stdout or a Claude-only finding payload.

### 6. Tests Required

- Spawn `hook.mjs` with a clean Codex Stop event and parse stdout as JSON.
- Inject one detector finding into `runStopHook` and assert `decision === "block"`.
- Assert Claude, Cursor, GitHub, and Codex PostToolUse payloads remain unchanged.

### 7. Wrong vs Correct

#### Wrong

```javascript
return { exitCode: 0, stdout: "" };
```

#### Correct

```javascript
return { exitCode: 0, stdout: JSON.stringify({ continue: true }) };
```

---

## Code Review Checklist

- No Resolve scripting API names appear under Electron UI/main files except Workflow Integration lifecycle calls or documentation strings.
- Command ids live in command manifests or bridge handler tables, not renderer conditionals.
- Command manifests describe `capability`, not a Resolve or keyboard execution backend.
- All palette modes remain `376x468`; both Electron hosts share `palette:set-mode` behavior.
- Prototype commands include accessible unavailable messaging and never call execution IPC.
- Functional icons come from Lucide while `clackly-logo.svg` and `clackly-mark.svg` remain custom assets.
- `npm run dev` and built `npm start` behavior remain distinct.
