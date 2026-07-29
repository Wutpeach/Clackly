# Capability Registry Implementation Plan

## Checklist

- [x] Add `capability/registry.js` with a minimal `Map`-backed `register()` / `get()` contract and duplicate protection.
- [x] Add one focused registry test covering registration, lookup, invalid execution objects, missing ids, and duplicate ids.
- [x] Add the generic `execute` entry point to `createMarkerCapability()` without changing backend selection.
- [x] Change `createCommandExecutor()` to require a capability registry and invoke the discovered object's `execute(command)` method.
- [x] Update executor tests to exercise registry-based routing and existing errors.
- [x] Update the standalone Electron and Workflow Integration composition roots to create a registry and register `marker.add`.
- [x] Update architecture documentation/spec contracts that still describe `capabilityHandlers`.
- [x] Search for stale `capabilityHandlers` mappings and direct command-engine imports of concrete capabilities.

## Validation

Run from `resolve-command-center/`:

- `npm test`
- `npm run build`
- `node --check capability/registry.js`
- `node --check command-engine/executor.js`
- `node --check electron/main/main.js`
- `node --check workflow-plugin/main.js`

Repository checks:

- `rg -n "capabilityHandlers" resolve-command-center .trellis/spec`
- `rg -n "require\\(.*capability/(marker|registry)" resolve-command-center/command-engine`

## Risk and Rollback Points

- Executor contract changes affect both host composition roots; update and validate them in the same change.
- Do not alter marker backend fallback semantics while adding `execute`.
- If registry integration fails, restore the injected handler object; adapters and command manifests remain untouched.
