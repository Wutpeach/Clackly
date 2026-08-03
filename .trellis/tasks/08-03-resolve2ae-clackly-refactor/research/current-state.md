# Resolve2AE → Clackly Current-State Research

## Executive Finding

The shortest viable migration is to treat Resolve2AE's existing Python export core as one Clackly script-backed Feature, not to port the standalone PySide desktop product. Clackly already owns command discovery, capability registration, configuration UI, lifecycle gating, Electron/Resolve integration, and Python process execution. The legacy repository already isolated the behavior-sensitive export engine into `resolve2ae_core/` and protected it with snapshot tests.

This direction is technically plausible, but the current Clackly Python runner cannot discover the installed Resolve Python module on this machine without an environment/path fix. Product scope—Feature-only integration versus full standalone-product replacement—must be decided before the final design.

## Confirmed Legacy Architecture

- `D:\Resolve2AE\Resolve2AE.py:4-7` is now only a Resolve-side launcher for the desktop runtime; it no longer owns export behavior.
- `D:\Resolve2AE\resolve2ae_desktop\` owns the PySide UI, subprocess orchestration, config, license, diagnostics, update, release, and single-instance concerns. `D:\Resolve2AE\README_DESKTOP.md:7-10` documents that split.
- The shared export engine is `D:\Resolve2AE\resolve2ae_core\export.py` (1,031 lines). It uses Python stdlib plus Resolve's injected module; desktop-only third-party packages are not required by the export engine (`D:\Resolve2AE\resolve2ae_core\export.py:15-39`).
- `process_and_send(resolve, project, ae_path, status_callback, config)` is already the stable integration seam (`D:\Resolve2AE\resolve2ae_core\export.py:535`). It:
  - derives the current timeline and target selection (`:541-546`);
  - exports/parses OTIO for video metadata (`:563-576`);
  - generates JSX and applies transforms, speed changes, crop/distortion, audio, and LUT behavior (`:579-992`);
  - invokes a running AE with `-r`, or installs a one-shot Startup bootstrap before launching AE (`:1000-1027`).
- Selection behavior includes playhead/single mode plus blue-marker video batch and cyan-marker video/audio batch (`D:\Resolve2AE\resolve2ae_core\export.py:196-324`; `D:\Resolve2AE\使用说明手册.md:98-121`).
- The current core has 17 focused tests and six golden snapshot scenarios covering OTIO success/fallback, mixed video/audio, LUT, speed ramp, and crop/distortion (`D:\Resolve2AE\tests\test_export_core.py:427-531`).
- The old project's prior Trellis decision explicitly favored behavior-preserving mechanical reuse of this core before any cleanup: `D:\Resolve2AE\.trellis\tasks\archive\2026-03\03-17-desktop-core-separation\prd.md`.

## Confirmed Clackly Architecture

- Product direction is a compact Resolve command palette, with Workflow Integration as the preferred host (`PRODUCT.md`).
- Commands already route through the required boundary:

  ```text
  Command metadata → Capability Registry → lifecycle/config gates → Capability.execute()
  ```

  Evidence: `resolve-command-center/command-engine/executor.js:22-37`.
- Script Features are discovered from Capability JSON, use the same registry, and are registered symmetrically in standalone and Workflow Integration hosts (`resolve-command-center/capability/registerScripts.js:10-44`, `resolve-command-center/workflow-plugin/main.js:119-135`).
- Capability metadata already owns `configSchema`; Settings renders `string`, `boolean`, `path`, and other supported field types. Required fields are checked before execution (`resolve-command-center/README.md:41`, `resolve-command-center/feature-ui/registerIpc.js:24-30`).
- A Python Feature entry exports `execute(context)`. The runtime supplies `context.resolve`, `context.project`, `context.timeline`, scoped config, and logger (`resolve-command-center/script-runtime/python_runner.py:38-96`).
- Each invocation starts plain `python` as a child process and keeps the Feature entry under the app root (`resolve-command-center/script-runtime/providers/PythonProvider.js:28-50,64-68`). No new Python dependency is needed for the legacy export engine.
- The palette waits with `Running command…`, hides only after success, and shows only terminal errors (`resolve-command-center/electron/renderer/App.jsx:286-305`, `resolve-command-center/workflow-plugin/main.js:188-191`).
- Script logs are buffered until the Python process exits; cancellation, timeout, streaming results, package environments, and interpreter discovery are explicitly deferred (`resolve-command-center/README.md:83-87`).

## Fit and Gaps

| Concern | Existing reusable owner | Minimum adaptation |
|---|---|---|
| Command/search/keyboard entry | Clackly command metadata and renderer | Add one `ae.export` Command JSON |
| Feature registration/settings | Clackly Capability metadata, ConfigManager, Settings | Add one script Capability JSON with required AE path and optional prefix |
| Resolve timeline access | Clackly Python ScriptContext | Pass `context.resolve` and `context.project` into the legacy core |
| Export formulas/JSX/AE launch | Resolve2AE shared core | Reuse behavior-first; do not rewrite in JavaScript |
| Legacy config names | Wrapper boundary | Map Clackly keys to `ae_path`, `prefix`, and forced non-debug execution |
| Export feedback | Clackly terminal command state | MVP can show only running/success/error; streaming needs a later shared runtime feature |
| License/update/installer/desktop UI | Resolve2AE desktop product | Exclude unless the user chooses full product replacement |

### Blocking technical gap: Resolve module discovery

On this machine, Resolve's module exists at:

```text
C:\ProgramData\Blackmagic Design\DaVinci Resolve\Support\Developer\Scripting\Modules\DaVinciResolveScript.py
```

However, Clackly's configured `python` executable currently reports no import spec for `DaVinciResolveScript`, and neither `RESOLVE_SCRIPT_API` nor `PYTHONPATH` is set. The legacy core adds standard Resolve module paths itself (`D:\Resolve2AE\resolve2ae_core\export.py:26-39`), while Clackly's `resolve/adapter.py` only imports the module without adding those paths (`resolve-command-center/resolve/adapter.py:20-49`).

Before the new Feature can rely on `context.resolve/project/timeline`, Clackly should make its shared Python adapter discover the standard Resolve module path (or provide the equivalent environment to PythonProvider). Fixing the adapter is smaller and benefits every future Python Feature.

### Non-blocking MVP limitations

- No progressive export status: old callback events must initially become buffered logs or a final result.
- No command cancellation/timeout: a stuck Resolve/AE call keeps the palette in its running state.
- Generic `path` validation checks shape, not that the executable exists; the Feature wrapper must validate the AE executable at execution time.
- Generic script Capabilities do not currently expose a side-effect-free availability probe, so AE path existence cannot appear as `missing-dependency` without extending that shared contract. Required config still produces `missing-config` correctly.
- Clackly currently assumes a `python` executable on `PATH`; packaging/interpreter discovery remains a later distribution concern unless the first target is a developer-installed MVP.

## Preliminary MVP Shape

1. Preserve/copy the behavior-tested `resolve2ae_core` under the Clackly application root; do not import `D:\Resolve2AE` at runtime.
2. Add the smallest `execute(context)` wrapper that validates AE path, maps config, forwards status to `context.logger`, invokes `process_and_send`, and returns a JSON-safe terminal result.
3. Add one Capability manifest (`ae.export`) and one Command manifest (`timeline.exportToAfterEffects`).
4. Fix Resolve Python module discovery once in Clackly's shared adapter.
5. Port the existing export snapshots/fakes as the behavior contract, plus one manifest-to-wrapper integration check.
6. Validate the real Workflow Integration path in Resolve Studio and a representative AE version; standalone/Utility fallback is secondary.

## Recommended Scope Boundary

For the first Clackly implementation, migrate only the export Feature and its behavior tests. Do not migrate the PySide window, offline licensing, updater, release automation, installer, diagnostics, or single-instance system. Clackly already owns the equivalent shell concerns, and copying both shells would create two products inside one repository.
