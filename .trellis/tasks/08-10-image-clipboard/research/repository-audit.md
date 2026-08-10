# Repository Audit: Image Clipboard

## Confirmed Integration Points

- Commands: `resolve-command-center/command-engine/commands/*.json`, loaded and validated by `command-engine/registry.js`.
- Execution: `command-engine/executor.js` gates Feature enablement and configuration before Capability execution.
- Capability composition: `app/createClacklyCore.js`; hand-written example `capability/marker.js`.
- Readiness: `feature-status/FeatureStatusManager.js` accepts `ready`, `missing-dependency`, and `unavailable` probes and separately persists enablement.
- Electron Hosts: `electron/main/main.js` and `workflow-plugin/main.js`; both must inject Clipboard access because `electron/main/composition.test.js` forbids Electron imports in Core.
- Resolve access: direct `resolve/adapter.js` for Workflow Integration, `execution-adapter/bridge.js` plus `bridge/resolve_bridge.py` and `resolve/adapter.py` for standalone.
- Settings: `ConfigManager` and `SchemaValidator` persist explicit schema values but do not materialize defaults.
- Errors/results: ordinary structured objects on success; thrown Error objects, including existing `code/details` convention in `capability/afterEffectsLaunch.js`.
- Logging: localized `console.warn` for best-effort cleanup in the Workflow Host; no shared logger service.
- Tests: Node `node:test` with fake adapters/Resolve objects and Python `unittest`; full suite is defined in `resolve-command-center/package.json`.

## Source Behavior

`D:/Toolbox/modules/ImageClipboard.svelte` reads Electron Clipboard directly, converts with `toPNG()`, saves under a project-name directory with second-only filenames, switches to/creates a `Clipboard` bin, imports, and never restores the previous Media Pool folder. Only its validated product/API behavior is relevant.

## Minimal Decision

Use one hand-written Capability/service and extend existing Host/Resolve adapters. Keep MVP settings as centralized defaults because adding visible empty schema controls would require a broader default-value design. Do not introduce a script Capability: OS Clipboard bytes belong to Electron Host and the transaction crosses disk plus Resolve in one application operation.
