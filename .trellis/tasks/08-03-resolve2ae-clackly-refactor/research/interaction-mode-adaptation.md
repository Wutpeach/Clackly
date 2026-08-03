# Resolve2AE Export Mode → Clackly Interaction Adaptation

## Finding

Clackly can expose Resolve2AE's export modes through one `ae.export` Capability, several Commands, and exact modifier-plus-left-click bindings on one primary Command card. This reuses the current Command/Interaction boundaries and keeps one AE configuration record.

The minimum shared-runtime change is to forward the executing Command id into Python as `context.command_id`. The current chain receives the Command at the Capability boundary but intentionally drops it before the Python process.

## Existing Resolve2AE Modes

`D:\Resolve2AE\resolve2ae_core\export.py:196-331` currently infers mode from timeline state:

- no qualifying marker → `single`, exporting the topmost enabled clip under the playhead (or audio when no video is hit);
- Blue duration marker → `batch`, video only;
- Cyan duration marker → `batch`, video plus de-duplicated linked/standalone audio.

All downstream OTIO, transform, speed, audio, LUT, JSX, and AE-launch behavior is shared. The selection seam is therefore the only part that needs an explicit requested-mode option.

## Existing Clackly Interaction Contract

- A binding maps exact `(target Command, mouse button, CTRL/SHIFT/ALT set)` facts to an action Command id: `resolve-command-center/interaction/BindingStorage.js:39-70`.
- The manager executes only the matched action Command and may execute a Command different from the target card: `resolve-command-center/interaction/InteractionManager.js:38-54`.
- Interaction help already resolves each action Command's description, so modifier guidance requires no renderer-specific AE branches: `.trellis/spec/backend/quality-guidelines.md:583-612`.
- Keyboard Enter executes the selected Command directly rather than passing through mouse bindings: `.trellis/spec/frontend/quality-guidelines.md:253-269`. Separate mode Commands therefore remain keyboard searchable/executable.

This is modifier-plus-mouse interaction, not a new global-hotkey system. Global command shortcuts/key synthesis remain outside the current Interaction Binding boundary.

## Current Script Runtime Gap

The Command is present at `capability.execute(command, { config })` and is passed into `createScriptCapability`, but `ScriptCapabilityProvider` destructures only `config` (`resolve-command-center/capability/script.js:9-13`, `resolve-command-center/script-runtime/ScriptCapabilityProvider.js:18-31`). `PythonProvider` sends only `{ config }`, and Python ScriptContext exposes exactly five fields (`resolve-command-center/script-runtime/providers/PythonProvider.js:45-49`, `resolve-command-center/script-runtime/python_runner.py:38-64`).

Creating four Capabilities to work around this would duplicate AE configuration and Settings entries. Encoding the mode in persisted config would also make a per-invocation intent look like user configuration. Both are worse than forwarding the already-authoritative Command id.

## Minimum Contract Change

1. Preserve the Command id through `ScriptCapabilityProvider → ScriptExecutor → PythonProvider`.
2. Extend the stdin request with a validated non-empty `command_id` string.
3. Expose it as read-only `context.command_id` in the Python runner; keep the remaining ScriptContext fields unchanged.
4. Update the backend Script Runtime spec from five to six public fields and revise the existing “does not forward Command” test contract.
5. Keep runtime selection and mode mapping out of renderer, Interaction Binding, and Command Engine.

## Command and Binding Shape

All four Commands target `ae.export`:

| Command intent | Requested core mode |
|---|---|
| Export to After Effects | `auto` (legacy behavior) |
| Export Current Clip to After Effects | `single` |
| Export Blue Marker Range to After Effects | `video-range` |
| Export Cyan Marker Range with Audio to After Effects | `mixed-range` |

Recommended default bindings on the primary `Export to After Effects` card:

| Trigger | Action Command |
|---|---|
| Click | Auto |
| Ctrl + Click | Force current clip |
| Shift + Click | Blue marker video range |
| Ctrl + Shift + Click | Cyan marker mixed range |

The unmodified click and keyboard execution retain legacy auto behavior. `Shift` represents a range, while adding `Ctrl` selects the broader mixed-media variant. Exact mapping is a product decision.

## Core Adaptation

- Add an optional requested mode to the selection seam and `process_and_send`, defaulting to `auto` so all existing callers and snapshots remain unchanged.
- `single` ignores qualifying markers and uses the playhead.
- `video-range` requires a Blue duration marker.
- `mixed-range` requires a Cyan duration marker.
- A requested range mode without its marker must fail with a clear terminal message rather than silently falling back.
- Preserve first matching marker behavior unless a separate multi-range product requirement is introduced.

## Verification

- Existing 17 Resolve2AE core tests and six golden snapshots must remain unchanged for `auto`.
- Add focused selection tests for forced single in the presence of markers, explicit Blue/Cyan modes, and missing-marker errors.
- Add one test that proves four action Commands share one Capability/config scope.
- Extend ScriptCapabilityProvider, PythonProvider, and Python runner tests for validated `command_id` transport.
- Extend Interaction tests for all default exact modifier bindings and extra-modifier non-matches.
- Live-validate physical modifier clicks and keyboard Command execution through the Workflow Integration host.
