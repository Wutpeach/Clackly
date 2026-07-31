# Add Capability Config Schema

## Goal

Add a schema-driven configuration system on top of Capability Metadata so capabilities declare required user settings, future Electron Settings UI can render controls from plain metadata, and capability execution reads scoped configuration through an injected context rather than filesystem access.

## Background

- Capability metadata is registered and validated centrally by `capability/registry.js`.
- Capability execution currently calls `capability.execute(command)` and does not provide a separate runtime context.
- Both Electron hosts explicitly compose the capability registry and command executor.
- The repository has no existing configuration manager, persistent configuration storage, schema validator, or settings IPC/UI.
- The Workflow Integration host and standalone Electron host currently use different Electron `userData` roots.

## Requirements

1. Add a `config/` module containing:
   - `ConfigManager`
   - `ConfigStorage`
   - `SchemaValidator`
2. Extend capability metadata with a `configSchema` object. Capabilities without settings use an empty schema.
3. Support schema field types:
   - `string`
   - `number`
   - `boolean`
   - `color`
   - `path`
   - `folder`
   - `select`
4. Each schema field has a required `type`; `label` and `required` are optional. A `select` field must provide string `options`.
5. Validate capability config schemas during registry registration so malformed UI contracts cannot enter the catalog.
6. `ConfigStorage` owns JSON file reading and writing. Capabilities, command engine code, and future renderer code must not read configuration files directly.
7. `ConfigManager` owns capability-scoped save, get, and shallow update operations, resolves schemas from the Capability Registry, validates values before persistence, and exposes copies rather than mutable internal state.
8. Because both Electron hosts share one file, ConfigManager must reload storage before reads and writes so long-running hosts observe sequential changes and preserve other capability sections.
9. Configuration values must match their declared schema types. Unknown configuration keys must be rejected.
10. `path`, `folder`, `color`, and `string` values are strings at this layer. The schema system does not inspect filesystem existence or impose a color syntax.
11. Extend capability execution compatibly from `execute(command)` to `execute(command, context)`. Existing capabilities continue to receive the same first argument.
12. The second execution argument exposes capability-scoped configuration through `context.config.get(key)` and does not expose storage or file paths.
13. Before capability execution, the command executor must centrally reject missing required configuration with an error that names the capability id and missing field names. Blank required string-like values count as missing.
14. Capabilities with an empty schema or complete required configuration continue to execute normally; capabilities do not duplicate required-field checks.
15. Both Electron hosts compose one Config Storage/Manager and inject it into the command executor.
16. Both hosts use the shared file `appData/Clackly/config.json` while retaining their existing separate Electron `userData` roots.
17. Add no Settings UI in this task; the schema is plain serializable metadata for a future Electron consumer.
18. Use Node standard library only; add no dependency or plugin abstraction.

## Acceptance Criteria

- [x] Capability metadata registration accepts valid `configSchema` definitions and rejects unsupported types, malformed descriptors, or invalid `select.options`.
- [x] `marker.add` exposes `configSchema: {}` without changing marker execution or backend selection.
- [x] `ConfigStorage` returns an empty configuration set when its JSON file is absent and persists valid JSON with recoverable write behavior.
- [x] Invalid stored JSON or a non-object storage root fails clearly instead of silently discarding user configuration.
- [x] `ConfigManager.save(capabilityId, values)` replaces one capability's configuration after schema validation.
- [x] `ConfigManager.get(capabilityId, key?)` returns a value or a copy of the capability configuration without exposing mutable storage state.
- [x] `ConfigManager.update(capabilityId, patch)` shallow-merges and validates the complete resulting capability configuration.
- [x] Long-running managers reload before reads and writes, observe sequential changes from the other host, and preserve unrelated capability sections.
- [x] Unknown capability ids, unknown config keys, type mismatches, and invalid select values fail clearly.
- [x] Executing a capability with missing required configuration fails before `capability.execute()` and reports the capability id plus missing fields.
- [x] Blank required `string`, `color`, `path`, or `folder` values are treated as missing, while valid `false` and `0` values remain configured.
- [x] Capabilities with empty schemas execute without configuration setup.
- [x] Command execution still passes the unchanged command object as the first capability argument.
- [x] Capability execution can read its own configuration through `context.config.get("key")` and cannot use that accessor to read another capability's values.
- [x] Both Electron hosts inject the configuration system through the existing composition roots.
- [x] Both hosts resolve configuration to the same `appData/Clackly/config.json` path without changing their `userData` paths.
- [x] Focused config, registry, executor, and marker tests plus the full test command and production build pass.

## Out of Scope

- Settings UI or automatic renderer control generation
- Settings IPC/preload APIs
- Capability-owned UI components
- Plugin Manifest, SDK, or third-party capability loading
- Dynamic schema discovery
- Schema migrations or versioned persisted configuration
- Secrets storage or encryption
- Nested objects, arrays, conditional fields, defaults, numeric ranges, or custom validators
- Filesystem existence checks for `path` and `folder`
- Color parsing or normalization
- Per-project or per-timeline configuration
