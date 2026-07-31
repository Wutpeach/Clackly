# Capability Config Schema Implementation Plan

## Implementation

- [x] Add `config/SchemaValidator.js` with schema, type, select-option, unknown-key, and required-field validation.
- [x] Add `config/ConfigStorage.js` with shared appData path construction, missing-file handling, strict JSON root parsing, directory creation, and atomic replacement writes.
- [x] Add `config/ConfigManager.js` with capability-scoped save/get/update, required-config assertion, scoped execution readers, defensive copies, and schema lookup through the registry.
- [x] Add focused config tests covering every supported type, malformed schemas, unknown keys, missing required values, invalid stored JSON, round-trip persistence, updates, and scoped reads.
- [x] Require `configSchema` in capability metadata, validate it during registration, and add `configSchema: {}` to `marker.add`.
- [x] Extend command execution with a required injected ConfigManager, central required-config blocking, and the second `{ config }` execution context while preserving the command first argument.
- [x] Compose the same appData-backed ConfigStorage and ConfigManager in both Electron hosts without changing either host's `userData` behavior.
- [x] Add `config/*.test.js` to the existing test command.
- [x] Update README and backend code-spec contracts for schema ownership, storage, validation, and execution context.
- [x] Search for direct config file access, duplicated schemas, changed marker backend logic, or renderer/IPC work outside scope.

## Validation

- [x] `node --check config/*.js capability/*.js command-engine/*.js`
- [x] `node --test config/*.test.js capability/*.test.js command-engine/*.test.js`
- [x] `npm test`
- [x] `npm run build`
- [x] `git diff --check`
- [x] Verify temporary config files are cleaned after successful writes and the previous destination is not truncated by a failed write test.
- [x] Verify both hosts use `app.getPath("appData")` for shared config while Workflow Integration retains its separate `userData` assignment.
- [x] Verify `capability.execute(command, context)` receives the original command object and a capability-scoped config reader.

## Risky Files and Rollback Points

- `capability/registry.js`: extend metadata validation only; preserve registration identity, duplicate protection, and metadata queries.
- `command-engine/executor.js`: preserve command lookup and missing-capability behavior before adding config validation/context injection.
- Electron host entrypoints: composition changes only; no lifecycle, IPC, window, hotkey, Resolve initialization, or adapter changes.
- `ConfigStorage`: never replace the destination until the complete temporary JSON file has been written.

## Review Gate

- [x] All PRD acceptance criteria map to focused tests or explicit boundary searches.
- [x] No Settings UI, preload/IPC API, capability-owned UI, plugin system, secrets, defaults, nesting, migrations, or filesystem probing appears in the diff.
- [x] Final Trellis full-scope quality check passes before commit.
