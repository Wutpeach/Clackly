# Repository contracts applicable to the preview-comp change

## Confirmed current flow

- Exactly three active Export-to-AE Commands share the `ae.export` Capability;
  selection/media differences are data in `COMMAND_POLICIES`, not separate
  implementations (`scripts/resolve2ae_export.py:6-10`).
- The script entry forwards one config object into
  `resolve2ae_core.export.process_and_send()` (`scripts/resolve2ae_export.py:23-35`).
- RuntimeManager validates and serializes the complete config, selects the
  persistent launcher only for the fixed Windows `ae.export` entry, and passes
  the same config into the worker request (`script-runtime/runtime/manager.js:95-142`).
- The persistent bootstrap creates a fresh ScriptContext for each execution and
  retains no Resolve or After Effects project state
  (`script-runtime/runtime/persistent_bootstrap.py:1-6`,
  `script-runtime/runtime/persistent_bootstrap.py:124-139`).
- The export core reads timeline resolution, creates the source comp, opens it,
  builds every source layer, and ends one undo group
  (`resolve2ae_core/export.py:579-621`, `resolve2ae_core/export.py:1019`).

## Applicable Trellis contracts

- Capability configuration owns typed boolean values and Capability-scoped
  persistence (`.trellis/spec/backend/quality-guidelines.md:452-483`).
- Only the three current Windows Export-to-AE actions may use the dedicated
  persistent Python launcher; Python returns a bounded JSX plan while the host
  alone owns desktop launch (`.trellis/spec/backend/quality-guidelines.md:1067-1113`).
- Settings derives Feature identity and schema from Capability metadata and
  must not add Capability-specific JSX
  (`.trellis/spec/frontend/quality-guidelines.md:228-258`,
  `.trellis/spec/frontend/quality-guidelines.md:340-359`).

## Planning consequence

The safe change boundary is the `ae.export` manifest, the shared script-entry
config mapping, and the export-core JSX tail. Command manifests, renderer code,
Resolve adapters, TimelineRange, RuntimeManager, persistent bootstrap/launcher,
and desktop launch code are protected regression surfaces, not edit targets.
The current source name already uses prefix, timeline, scope, and a timestamp;
the approved fixed preview suffix extends that convention without adding a
separate collision authority (`resolve2ae_core/export.py:588-618`).
