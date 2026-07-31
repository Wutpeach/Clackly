# Current Feature UI Boundary

## Confirmed Repository Evidence

- `capability/registry.js` already validates complete Capability Metadata. `getMetadata()` returns full metadata; `getAllCapabilities()` returns ordered catalog summaries only.
- `config/SchemaValidator.js` already owns the seven requested field types and value validation.
- `config/ConfigManager.js` already owns capability-scoped get/save/update and reload-before-read/write behavior. It lacks only reset/removal for the requested UI action.
- Standalone Electron and Workflow Integration each construct the same registry/config services and duplicate a small IPC composition block. Both must receive equivalent UI-framework handlers.
- `electron/main/preload.js` is the renderer trust boundary; context isolation is already enabled.
- `electron/renderer/App.jsx` has a semantic mode state and a Settings button, but Settings is currently a prototype status message.
- Renderer command data already includes `capability` and Command-owned `interactionHelp`, so feature details can associate help without a new metadata field or command table.
- The shared frontend contract fixes Launcher, Search, and All Actions to `376x468`. A separate Settings BrowserWindow can be larger without changing those palette modes.

## Minimal Extension Points

1. One FeatureCatalog service wrapping the existing registry.
2. One ConfigManager reset operation.
3. Narrow, equivalent host IPC plus preload methods.
4. One generic SettingsRenderer and one Settings entry in the existing renderer bundle.
5. Existing Command Metadata reused for Interaction Help.
6. One shared singleton Settings BrowserWindow helper reused by both Electron hosts.

## Excluded Complexity

- No feature manifest, plugin loader, schema library, form state library, custom picker, defaults system, custom field registry, second frontend bundle, or feature-specific window/page hierarchy is needed.
