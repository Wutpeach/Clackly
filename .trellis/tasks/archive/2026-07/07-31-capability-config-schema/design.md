# Capability Config Schema Design

## Boundary

The configuration system is an internal runtime service. Capabilities declare plain schemas in metadata, Config modules own validation and persistence, Electron hosts compose the service, and the command executor injects a scoped reader. Capabilities and renderer code never receive file paths or storage objects.

## Schema Contract

Capability metadata adds `configSchema`, keyed by capability-local setting name:

```javascript
configSchema: {
  aePath: {
    type: "path",
    label: "After Effects Path",
    required: true
  },
  outputFolder: {
    type: "folder",
    label: "Export Folder"
  },
  exportMode: {
    type: "select",
    options: ["composition", "selected"]
  }
}
```

`type` is required and must be one of `string`, `number`, `boolean`, `color`, `path`, `folder`, or `select`. `label` is an optional non-empty string and `required` is an optional boolean. `select` requires a non-empty array of non-empty string options. Other types do not interpret `options`.

Capabilities without settings declare `configSchema: {}`. The Capability Registry delegates schema validation to `SchemaValidator` during registration. Full metadata remains available through `getMetadata()` for a future Settings UI; `getAllCapabilities()` remains unchanged.

## Config Modules

### SchemaValidator

`SchemaValidator` owns both schema-shape validation and configuration-value validation:

- string-like types (`string`, `color`, `path`, `folder`) accept strings.
- `number` accepts finite JavaScript numbers.
- `boolean` accepts booleans.
- `select` accepts one of its declared string options.
- unknown configuration keys are rejected.
- missing required fields are reported together so execution can return one clear error.

It performs no filesystem probing, color parsing, defaults, nested validation, or UI work.

### ConfigStorage

`new ConfigStorage(filePath)` synchronously loads and saves the small JSON document. `ConfigStorage.fromAppData(appDataPath)` resolves the shared path as `appDataPath/Clackly/config.json`.

- Missing file loads as `{}`.
- Invalid JSON, arrays, or non-object roots throw clear errors.
- Save creates the parent directory, writes a sibling temporary file, then renames it over the destination so an interrupted write does not truncate the last valid file.

The stored shape is capability-scoped:

```json
{
  "ae.export": {
    "aePath": "C:/Program Files/Adobe/After Effects/AfterFX.exe",
    "exportMode": "composition"
  }
}
```

### ConfigManager

`new ConfigManager({ capabilityRegistry, storage, validator? })` validates storage availability and exposes:

- `save(capabilityId, values)`: validate and replace one capability's complete configuration.
- `get(capabilityId, key?)`: return one value, `null` when a declared key has no value, or a shallow copy of the capability object.
- `update(capabilityId, patch)`: shallow-merge with the current object, validate the complete result, and persist.
- `assertConfigured(capabilityId)`: reject missing required fields with the capability id and all missing field names.
- `forCapability(capabilityId)`: return a scoped `{ get(key) }` reader with no access to other capability ids or persistence.

Schemas are always resolved from `capabilityRegistry.getMetadata(capabilityId).configSchema`; ConfigManager does not maintain a second schema catalog. Unknown stored capability sections are preserved so a temporary downgrade or unavailable capability does not delete user data.

Because both Electron hosts can remain alive against one shared file, ConfigManager reloads storage before every read and write. This makes sequential changes visible across hosts and prevents one host's startup snapshot from overwriting another host's later capability sections.

## Execution Contract

The command executor becomes `createCommandExecutor({ capabilityRegistry, configManager, findCommand? })` and calls:

```javascript
configManager.assertConfigured(command.capability);
return capability.execute(command, {
  config: configManager.forCapability(command.capability)
});
```

The command object remains the first argument, preserving current capability and adapter behavior. Required configuration is checked centrally before capability execution. Future capabilities read values with `context.config.get("aePath")` and never access ConfigStorage or the filesystem.

## Host Composition

Both Electron hosts:

1. create and populate the Capability Registry;
2. create `ConfigStorage.fromAppData(app.getPath("appData"))`;
3. create ConfigManager with that registry and storage;
4. inject ConfigManager into the command executor.

The Workflow Integration host keeps its custom `userData` path. Only the configuration file is shared through the common Electron `appData` root.

## Compatibility and Rollback

- Marker metadata gains only `configSchema: {}`.
- Marker execution, backend priority, adapters, command manifests, IPC, and renderer behavior remain unchanged.
- Existing capability implementations may ignore the new second execution argument.
- Rollback removes the config modules and executor/host injection; no schema migration is required because the first persisted format is a plain capability-id map.

## Risks

- Corrupt manual edits could otherwise be silently lost; storage fails closed and atomic writes preserve the last complete file.
- Duplicate validation across UI and runtime could drift; SchemaValidator is the single contract owner.
- Separate host files would create inconsistent settings; both hosts use the same appData-derived path.
- Truly simultaneous cross-process writes remain last-writer-wins. Add an interprocess file lock only if both hosts gain concurrent Settings writers; the current phase has no Settings UI.
