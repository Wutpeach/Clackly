# Resolve2AE Clackly Integration Design

## Design Summary

Resolve2AE becomes one metadata-discovered Python Feature inside Clackly. The behavior-tested Python core is owned locally by Clackly, while existing Command, Capability, Config, Lifecycle, Interaction, and Electron boundaries remain authoritative.

```text
Command card / keyboard search
  -> Command ID
  -> Command Engine
  -> ae.export Capability
  -> ScriptCapabilityProvider (config + commandId)
  -> PythonProvider / python_runner
  -> scripts/resolve2ae_export.py execute(context)
  -> resolve2ae_core.process_and_send(..., requested_mode)
  -> OTIO + JSX + After Effects
```

No renderer or Command Engine branch knows about AE, Python, marker colors, or export modes.

## Scope and Task Shape

This remains one Trellis task. The runtime additions are small prerequisites of one end-to-end Feature and have no independently useful user deliverable in this project. Splitting them would create task boundaries where Clackly either has unused runtime fields or nonfunctional Commands.

## Ownership Boundaries

| Concern | Owner |
|---|---|
| User intent, searchable name, description | Command manifests |
| Feature identity, config schema, Python entry | `ae.export` Capability manifest |
| Mouse modifier to action Command | Interaction Binding |
| Capability/config/lifecycle gates | Existing Command Engine and managers |
| Python process and request protocol | Existing Script Runtime |
| Resolve connection | Shared Python `resolve/adapter.py` |
| Command id to requested export mode | AE Feature entry wrapper |
| Clip selection, OTIO, formulas, JSX, AE launch | Local `resolve2ae_core` |
| Developer requirements/research | `.trellis/`, never runtime metadata |

## Runtime Metadata

### Capability

One definition under `capability/definitions/`:

```json
{
  "id": "ae.export",
  "name": "Export to After Effects",
  "description": "Send Resolve timeline clips to After Effects",
  "category": "Export",
  "icon": "send",
  "version": "1.0.0",
  "type": "command",
  "providers": ["script"],
  "executor": {
    "type": "script",
    "runtime": "python",
    "entry": "scripts/resolve2ae_export.py"
  },
  "configSchema": {
    "aePath": {
      "type": "path",
      "label": "After Effects Path",
      "required": true
    },
    "prefix": {
      "type": "string",
      "label": "Composition Prefix"
    }
  }
}
```

The wrapper uses `Link` when `prefix` is blank/missing. Debug mode is forced off and is not a user setting.

### Commands

All Commands declare `capability: "ae.export"`:

| Command ID | Mode |
|---|---|
| `timeline.exportToAfterEffects` | `auto` |
| `timeline.exportCurrentToAfterEffects` | `single` |
| `timeline.exportBlueRangeToAfterEffects` | `video-range` |
| `timeline.exportCyanRangeToAfterEffects` | `mixed-range` |

Mode is intentionally absent from Command metadata. The trusted Feature wrapper maps stable Command ids to modes; renderer and generic registries retain their fixed schemas.

## Script Runtime Contract Change

The current Command object reaches `createScriptCapability` but is dropped by `ScriptCapabilityProvider`. Preserve only its stable id across the process boundary:

```text
ScriptCapabilityProvider.execute(definition, { command, config })
  -> ScriptExecutor.execute(definition, { commandId, configSnapshot, logger })
  -> PythonProvider stdin { "commandId": string, "config": object }
  -> ScriptContext.command_id
```

Rules:

- `command.id` / `commandId` must be a non-empty string; malformed direct calls fail before spawning.
- Python runner validates the request again and exposes `command_id` as a property without a setter.
- Existing `resolve`, `project`, `timeline`, `config`, and `logger` semantics remain unchanged and lazy where applicable.
- Only the id crosses the process boundary; no presentation metadata, registry, ConfigManager, or executable object is serialized.
- Update the backend spec and tests that currently require exactly five fields and explicitly forbid Command forwarding.

This is a reusable execution-context fact, not an AE-specific runtime branch.

## Resolve Python Module Discovery

`PythonProvider` launches the host `python` executable. Under Workflow Integration that process does not receive the JavaScript Resolve object and must reconnect through `DaVinciResolveScript`.

`resolve/adapter.py` remains the single connection owner. Before importing `DaVinciResolveScript`, it checks:

1. an existing importable module;
2. `RESOLVE_SCRIPT_API/Modules` when configured;
3. the standard Windows ProgramData scripting modules path;
4. existing `bmd` / `DaVinciResolveScript` connection attempts.

Only existing directories are added to `sys.path`, once. Missing modules retain the current controlled `ResolveAdapterError`. The Feature wrapper uses `context.resolve/project/timeline`; it does not import the adapter.

## Export Core Ownership and Adaptation

Copy `D:\Resolve2AE\resolve2ae_core` into the Clackly application root. Do not import the legacy repository at runtime, add a git submodule, or bring over desktop modules.

First preserve the source and golden snapshots mechanically. Limit core changes to the integration seam:

```python
get_target_clips_logic(timeline, requested_mode="auto")
process_and_send(
    resolve,
    project,
    ae_path,
    status_callback,
    config=None,
    requested_mode="auto",
)
```

Selection behavior:

- `auto`: existing marker scan and playhead fallback unchanged.
- `single`: skip marker scan and use the current playhead.
- `video-range`: use the first qualifying Blue duration marker; no Blue marker is a controlled failure.
- `mixed-range`: use the first qualifying Cyan duration marker and existing audio collection/de-duplication; no Cyan marker is a controlled failure.

Downstream transform/OTIO/JSX code receives the same target clip shape and remains shared.

### Structured terminal result

Keep every existing `status_callback` sequence for parity, and additionally return a JSON-safe terminal result:

```python
{
    "ok": bool,
    "code": "exported" | "no-timeline" | "no-clips" | "missing-marker" | "send-error",
    "mode": str,
    "clip_count": int,
    "message": str,
}
```

Existing callers may ignore the result. The new wrapper raises a controlled error when `ok` is false so Electron keeps the palette open and shows the terminal message. This avoids parsing emoji/user-facing callback strings.

Unhandled programming/API errors still propagate into the Python runner's structured error envelope.

## Feature Entry

`scripts/resolve2ae_export.py` is deliberately thin:

1. map `context.command_id` to the requested mode, rejecting unknown ids;
2. read the capability-scoped config snapshot;
3. validate `aePath` is a real file and normalize optional prefix;
4. send core status callbacks to `context.logger.info`;
5. call `process_and_send(context.resolve, context.project, ...)`;
6. raise for a structured failed result or return the successful JSON object.

It contains no export formulas, UI, storage, license, update, or Resolve connection code.

## Interaction Bindings

Primary target `timeline.exportToAfterEffects`:

| Trigger | Action Command |
|---|---|
| Click | `timeline.exportToAfterEffects` |
| Ctrl + Click | `timeline.exportCurrentToAfterEffects` |
| Shift + Click | `timeline.exportBlueRangeToAfterEffects` |
| Ctrl + Shift + Click | `timeline.exportCyanRangeToAfterEffects` |

Each auxiliary Command also receives an unmodified self-binding so its physical card click works. Keyboard Enter continues to execute selected Commands directly.

The existing binding help projection will show all four primary-card actions using Command descriptions. No renderer changes are required.

### Existing development profiles

`BindingStorage` currently materializes defaults once. For the known unreleased/current profile shape:

- missing file → write the expanded defaults;
- file exactly equal to the old single marker default → replace it with expanded defaults;
- explicit `{}` or any customized binding set → preserve it unchanged.

Use one exact-shape migration and one regression test. Do not introduce a general migration framework until more shipped binding shapes exist.

## Configuration and Lifecycle

- Missing/blank `aePath` is handled by existing ConfigManager and produces `missing-config` with `open-settings` recovery.
- Schema `path` validates value shape; the wrapper checks filesystem existence at the execution trust boundary.
- Invalid executable path, missing Resolve/project/timeline, missing required marker, no clips, and AE launch failure are terminal Command errors.
- No script-specific availability probe is added. Adding generic script probes just to preflight an invalid file path is deferred.
- Success hides the palette through existing host behavior.

## User Feedback

The palette shows existing `Running command…` while the child process runs. Core statuses are captured as logs and replayed after completion, not streamed into the renderer. Terminal failure remains visible; success hides the palette.

Streaming progress, cancellation, and timeout are separate Script Runtime features and are not introduced here.

## Windows-First Compatibility

Release validation targets:

- Windows;
- DaVinci Resolve Studio Workflow Integration host;
- the standard Resolve scripting-module installation path;
- a configured Windows `AfterFX.exe`;
- AE already running and AE cold-start/bootstrap paths.

The copied core retains macOS code paths and patched unit coverage where already present, but macOS installation and real-host behavior are not release gates.

## Test Strategy

### Automated

- Preserve and run all 17 legacy core tests and six golden snapshots for `auto`.
- Add selection tests for forced single with markers present, explicit Blue/Cyan modes, and missing-marker failure.
- Add structured result assertions without changing legacy callback/JSX snapshots.
- Add adapter discovery tests for env/standard Windows path and missing module behavior.
- Extend ScriptCapabilityProvider, PythonProvider, Python runner, and integration tests for `commandId`/`command_id` validation and transport.
- Add Command manifest search/Capability association checks.
- Add exact interaction binding/migration/help tests, including extra-modifier non-match and auxiliary self-clicks.
- Run the existing full Node/Python suite and Vite production build.

### Manual Windows gate

Use a representative Resolve timeline containing:

- one clip under the playhead;
- a Blue duration marker over multiple video clips;
- a Cyan duration marker over video and audio;
- at least one transformed/speed-adjusted clip and one LUT clip.

Validate four primary-card mouse triggers, four searched Commands with Enter, missing config, invalid path, missing markers, AE running, and AE cold start. Inspect the created composition/layers, not only the Clackly success state.

## Rollout and Rollback

Implementation order keeps new Commands undiscoverable until runtime and core tests pass. Manifests/default bindings land after the shared runtime and wrapper are functional.

Rollback can remove the AE manifests, bindings, wrapper, and local core without affecting `marker.add`. The `command_id` ScriptContext field and central Resolve discovery are backward-compatible shared improvements, but can also be reverted with their spec/tests if a full rollback is required. No persisted AE data migration is performed.

## Rejected Alternatives

- Rewrite the core in JavaScript: large behavior risk with no framework benefit.
- Four Capabilities: duplicates Settings/config and violates one-Feature ownership.
- Put mode in persisted config: confuses per-execution intent with user settings.
- Put mode fields in Command metadata: expands the global Command schema for one Feature.
- Renderer modifier branches: violates generic command-card contracts.
- Runtime dependency on `D:\Resolve2AE` or git submodule: produces fragile installation and split ownership.
- Port the old desktop shell: duplicates Clackly UI/lifecycle/release responsibilities.
