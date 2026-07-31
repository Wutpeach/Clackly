# Current Configuration Boundary

## Evidence

- No `config/` implementation, persisted settings file, schema validator, or settings UI contract currently exists.
- Capability schemas naturally extend the existing nested `capability.metadata` contract validated by `capability/registry.js`.
- `command-engine/executor.js` currently passes the command object as the sole argument to `capability.execute()`. A second context argument preserves that first-argument contract.
- Both Electron hosts are composition roots and already create the registry and executor, so they are the correct place to create ConfigStorage and ConfigManager.
- Workflow Integration deliberately changes `userData` to `Clackly Workflow Plugin`, while both hosts share the same Electron `appData` root. Building the config path from `appData` shares user settings without merging Chromium/process state.
- The existing test command does not include `config/*.test.js` and must be extended.

## Decisions

- Required configuration is enforced centrally before capability execution and reports the capability id plus all missing fields.
- Schemas are resolved from Capability Registry metadata; there is no second schema registry.
- Capabilities receive only a scoped `context.config.get(key)` reader, not ConfigManager, ConfigStorage, other capability ids, or file paths.
- ConfigStorage uses one small JSON document and Node standard library atomic replacement. No database, dependency, encryption, migration framework, or plugin layer is justified for this phase.
- Both hosts share `appData/Clackly/config.json` while keeping separate Electron `userData` roots.
- ConfigManager reloads before reads and writes so long-running hosts see sequential changes and do not overwrite unrelated capability sections from stale startup state.
- Simultaneous cross-process writes remain a deferred last-writer-wins ceiling until more than one Settings writer exists.
