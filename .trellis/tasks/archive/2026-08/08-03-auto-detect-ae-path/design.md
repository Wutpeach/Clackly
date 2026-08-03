# After Effects Path Auto-Discovery Design

## Summary

Add one feature-owned Windows path initializer for `ae.export`. Both Clackly Electron hosts invoke it during `app.whenReady()` before creating windows or registering command IPC. The initializer reads the existing capability-scoped configuration, keeps a valid saved path unchanged, discovers a replacement only when needed, and persists the result through `ConfigManager`.

This is not a global After Effects service and does not add a generic plugin-initialization framework. A second independently auto-configured Feature would be the evidence needed for that abstraction.

## Data Flow

```text
Clackly host startup
  -> initialize ae.export configuration
  -> ConfigManager.get("ae.export")
  -> valid saved aePath? keep it and stop
  -> feature-owned Windows detector
       1. running AfterFX process
       2. Windows App Paths registry
       3. standard Adobe installation directories
  -> validate candidate is an existing file
  -> ConfigManager.update("ae.export", { aePath })
  -> Settings reads the same stored capability configuration
  -> Command Engine later injects the scoped snapshot into ae.export
```

## Ownership and Boundaries

| Concern | Owner |
|---|---|
| When initialization runs | Both Clackly Electron hosts |
| Windows/AE-specific discovery rules | Feature-owned `capability/afterEffectsPath.js` |
| Schema validation and persistence | Existing `ConfigManager` / `ConfigStorage` |
| Settings display and manual override | Existing generic Settings IPC and renderer |
| Final execution-boundary file validation | Existing `scripts/resolve2ae_export.py` |

The detector receives no direct path to `config.json` and never writes files itself. Renderer, Command Engine, Python runtime protocol, and Resolve2AE export core remain unchanged.

## Startup Contract

Both `electron/main/main.js` and `workflow-plugin/main.js` call the same initializer before their first window is created. The operation is idempotent:

- valid stored `aePath` -> no subprocess, registry, directory scan, or write;
- missing/blank/stale `aePath` -> run discovery once;
- valid candidate -> update only `aePath`, preserving `prefix` and other capability values;
- no candidate -> do not write an empty or guessed value;
- stale value with no replacement -> remove only stale `aePath` through `ConfigManager`, preserving sibling values, so existing `missing-config` recovery is accurate.

Discovery failures are expected absence, not application-fatal errors. Individual process/registry/directory strategies continue to the next candidate. Unexpected configuration storage errors retain existing error behavior and must not be hidden as “AE not installed.”

## Windows Discovery

Discovery stops at the first existing file:

1. Query the executable path of a running `AfterFX` process. This supports custom and portable locations and honors the version the user is actively using.
2. Query the per-user and machine `App Paths\\AfterFX.exe` registration. This works when AE is installed but not running and supports non-default install roots registered by Adobe.
3. Inspect Adobe directories under the available `ProgramW6432`, `ProgramFiles`, and `ProgramFiles(x86)` environment roots for `Adobe After Effects *\\Support Files\\AfterFX.exe`; when several candidates exist, select the highest numeric product version deterministically.

No PATH lookup or full-disk recursive scan is needed. The implementation uses Node/Windows standard facilities only and adds no dependency.

## Configuration and UX

Keep `aePath.required: true`. Automatic initialization fills the required value before Feature status and Settings are used in normal installations. Keeping the requirement provides the existing `missing-config` warning and `open-settings` recovery when AE is absent or undiscoverable.

No Settings-specific auto-fill state or new IPC is required. `config:get` already reloads the shared config file, so the saved value appears in the existing path input. Saving another path remains the explicit manual override and wins on later startups while that file exists.

## Compatibility and Concurrency

- MVP platform: Windows only. Non-Windows detection returns no candidate without changing configuration.
- Both hosts share `appData/Clackly/config.json`; repeated initialization converges on the same value.
- Existing sequential reload/write behavior remains authoritative. No new file lock is introduced for the already documented last-writer-wins cross-process ceiling.
- Existing configurations require no migration.

## Test Strategy

Unit-test the feature module with injected process, registry, filesystem, environment, and ConfigManager seams rather than relying on the developer machine. Cover precedence, valid-path no-op, stale replacement, stale removal, deterministic multi-version selection, non-Windows no-op, and per-strategy failure fallback.

Host composition tests or boundary assertions must prove both startup files invoke the same initializer before window creation. Existing ConfigManager, FeatureStatus, Settings, Script Runtime, and Resolve2AE tests provide regression coverage; run the full suite and production build.

Manual Windows validation must use a real installed AE and verify first-run persistence, Settings display, restart reuse, stale-path recovery, manual override, and no-AE recovery.

## Rollback

Remove the shared feature initializer and its two host startup calls. No schema or config-file migration is required; any valid saved `aePath` remains compatible with the pre-change behavior.

## Rejected Alternatives

- Global After Effects runtime/config service: no second consumer exists.
- Generic plugin startup/discovery hook: one implementation does not justify a new lifecycle contract.
- Let the Python export process write Clackly config: violates ConfigStorage ownership and cannot populate Settings at startup.
- Extend Script Runtime with a discovery action: broad protocol change for a small host-side Windows lookup.
- Make `aePath` optional: loses the existing missing-config recovery when discovery fails.
- Full-disk scan or new registry dependency: unnecessary; native process, App Paths, and standard-directory checks cover the supported installation shapes.
