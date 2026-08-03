# Resolve2AE Clackly Integration Plan

## Preconditions

- [ ] User approves the final PRD/design/implementation summary in a subsequent message.
- [ ] Task is started only after approval; no product edits occur while status is `planning`.
- [ ] Baseline worktree changes are reviewed and unrelated user edits are preserved.

## Implementation Checklist

### 1. Establish the behavior baseline

Imported core/test baseline: Resolve2AE commit `073615024e2835be1779cd000ba75c74948b3437`.

- [ ] Run the existing Clackly tests and production build before edits.
- [ ] Copy only `D:\Resolve2AE\resolve2ae_core` and its export-core tests/golden fixtures into the Clackly application root; exclude desktop, license, release, installer, UI, diagnostics, and private operations.
- [ ] Add the copied core tests to the normal Clackly test command and prove all 17 tests/six snapshots pass before adaptation.
- [ ] Record the source commit/version used for the copy in task/developer documentation, not runtime metadata or source-path dependencies.

Rollback point: deleting the isolated core/test copy restores the pre-task runtime.

### 2. Fix shared Windows Resolve discovery

- [ ] Update `resolve/adapter.py` to discover `DaVinciResolveScript` from configured and standard Windows module paths before importing it.
- [ ] Keep Resolve connection and project/timeline lookup centralized in the adapter.
- [ ] Add focused tests for existing importability, configured path, standard Windows path, missing module, and unchanged lazy access behavior.

Rollback point: adapter-only change is independently revertible before the Feature is registered.

### 3. Transport Command identity through Script Runtime

- [ ] Make `ScriptCapabilityProvider` require the existing Command id and pass only `commandId` plus the defensive config snapshot/logger to ScriptExecutor.
- [ ] Make PythonProvider validate and include `commandId` in its stdin JSON request.
- [ ] Make `python_runner.py` validate the request and expose read-only `context.command_id` while preserving lazy Resolve fields and log/result protocol.
- [ ] Update unit/integration tests for valid transport, missing/invalid ids, config isolation, sync/async execution, and the six-field public context.
- [ ] Update `.trellis/spec/backend/quality-guidelines.md` and `resolve-command-center/README.md` to describe the new stable contract.

Rollback point: complete the protocol/spec/test change as one atomic unit; do not leave asymmetric producer/consumer shapes.

### 4. Add explicit export selection without downstream rewrites

- [ ] Add optional `requested_mode="auto"` to the core selection and `process_and_send` seams.
- [ ] Preserve the current `auto` branch and all golden JSX/callback results.
- [ ] Implement `single`, `video-range`, and `mixed-range` only in the selection layer.
- [ ] Return structured JSON-safe terminal results while preserving existing callbacks.
- [ ] Add focused tests for forced single with markers, Blue/Cyan selection, audio de-duplication reuse, missing markers, no timeline/clips, and send errors.
- [ ] Run all copied parity tests after each core change.

Rollback point: requested mode defaults to `auto`; reverting the new selection branches/result contract restores the mechanical copy.

### 5. Add the thin AE Feature

- [ ] Add `scripts/resolve2ae_export.py` with the four-command mode map, config mapping, AE file validation, status logging, core call, and structured failure propagation.
- [ ] Add exactly one `ae.export` Capability definition with `aePath` and optional `prefix` schema.
- [ ] Add four Command definitions pointing to `ae.export`; keep mode/runtime fields out of Command metadata.
- [ ] Add integration coverage proving discovery, one Feature/config scope, correct `command_id`, successful result, and controlled errors.

Rollback point: manifests are added only after the entry runs through the real Script Runtime in tests.

### 6. Add default interaction mappings

- [ ] Expand default bindings with the four primary-card mappings and unmodified auxiliary self-click mappings.
- [ ] Add one exact-shape upgrade from the old untouched marker-only defaults; preserve explicit empty/customized files.
- [ ] Test exact modifier matching, extra modifiers, action Command ids, auxiliary card clicks, migration, defensive listing, and generated interaction help.
- [ ] Confirm no AE/modifier decision appears in renderer or InteractionManager.

Rollback point: remove only the AE binding entries/migration; existing marker binding remains unchanged.

### 7. Documentation and packaging boundary

- [ ] Update runtime onboarding documentation with the AE Feature artifacts, Windows requirements, config, modes, and deliberate limitations.
- [ ] Keep implementation notes/research in `.trellis/`; keep manifests user-facing and minimal.
- [ ] Verify Workflow Plugin Copy/Junction contains the local core and entry without relying on `D:\Resolve2AE`.
- [ ] Do not add desktop dependencies (`PySide6`, `cryptography`, PyInstaller) or new npm/Python packages.

### 8. Automated quality gate

- [ ] Run `npm test` from `resolve-command-center/`.
- [ ] Run `npm run build` from `resolve-command-center/`.
- [ ] Run the focused core unittest discovery command if it is not already included by `npm test`.
- [ ] Run `python -m py_compile` on changed Python runtime/adapter/Feature/core modules.
- [ ] Run `git diff --check`.
- [ ] Search boundaries:
  - renderer and Command Engine contain no `ae.export`, marker-color, After Effects, Python runtime, or mode-routing branches;
  - Feature script does not import ConfigStorage, Electron, or Clackly Resolve adapter;
  - no runtime reference points to `D:\Resolve2AE`;
  - only PythonProvider owns `child_process` invocation.
- [ ] Review failures at the owning shared boundary; do not add caller-specific workarounds.

### 9. Manual Windows acceptance gate

- [ ] Install/build the Workflow Integration plugin and restart Resolve Studio.
- [ ] Validate missing-config recovery and invalid AE executable errors.
- [ ] Configure a real Windows `AfterFX.exe`.
- [ ] Validate main-card Click, Ctrl+Click, Shift+Click, and Ctrl+Shift+Click.
- [ ] Search and execute each of the four Commands with Enter.
- [ ] Validate missing Blue/Cyan marker errors without silent fallback.
- [ ] Validate AE already-running `-r` and cold-start bootstrap paths.
- [ ] Inspect representative AE layers for source media, timing, transforms, speed changes, audio behavior, and LUT application.
- [ ] Record any unavailable real-host check explicitly; do not claim it passed from mocks.

## Risky Files and Review Focus

- `script-runtime/providers/PythonProvider.js` + `script-runtime/python_runner.py`: request symmetry and error envelopes.
- `resolve/adapter.py`: environment/path behavior and import error clarity.
- copied `resolve2ae_core/export.py`: parity-sensitive formulas and large branch surface.
- `interaction/BindingStorage.js`: preserve explicit empty/custom bindings.
- Capability/Command manifests: one Capability, four valid Command ids, no duplicated execution/config metadata.

## Completion Gate

- [ ] Every PRD acceptance criterion has automated or recorded manual evidence.
- [ ] Full-scope Trellis check passes after the last implementation iteration.
- [ ] Shared contract changes are captured in specs before commit.
- [ ] User-visible behavior and known limitations are documented without exposing developer-only notes in runtime UI.
