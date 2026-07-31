# Phase 6 Script Runtime Implementation Plan

## 6.1 Metadata and Capability Registration

- [x] Extend Capability Registry validation for optional `executor` metadata while preserving existing Capabilities.
- [x] Add a sorted JSON Capability manifest loader using the existing Command manifest conventions.
- [x] Add a generic script-backed Capability that delegates to an injected Script Capability Provider.
- [x] Add one shared registration helper used by both Electron hosts before FeatureCatalog/ConfigManager construction.
- [x] Cover malformed manifests, duplicate ids, malformed executor fields, existing metadata compatibility, and no-host-edit registration.

## 6.2 Execution Provider and Script Runtime

- [x] Add the Script Capability Provider to snapshot scoped config and delegate to `ScriptExecutor`.
- [x] Add `ScriptExecutor` with a runtime-name provider map and unsupported-runtime validation.
- [x] Add only `PythonProvider`; do not add Lua/Node/external placeholders.
- [x] Resolve and contain entry paths under the application root.
- [x] Spawn Python without a shell, send JSON stdin, parse the result envelope, replay logs, and surface controlled process/protocol errors.
- [x] Record the deliberate per-execution subprocess ceiling with a `ponytail:` comment.

## 6.3 Python Runner and ScriptContext

- [x] Add the runtime-owned Python runner and load feature scripts by entry path.
- [x] Support sync/async `execute(context)` and JSON-serializable results.
- [x] Provide `context.resolve`, `context.config`, `context.logger`, `context.project`, and `context.timeline`.
- [x] Reuse `resolve.adapter.py` for lazy Resolve/project/timeline access; do not duplicate Resolve API calls in script runtime or feature scripts.
- [x] Capture stdout/stderr and logger calls without corrupting the JSON protocol.
- [x] Cover missing execute, import/runtime failure, async success, log capture, lazy context with adapter fakes, and non-serializable results.

## 6.4 Composition, Documentation, and Specs

- [x] Register discovered script Capabilities symmetrically in standalone and Workflow Integration hosts.
- [x] Update the package test command to include JavaScript and Python script-runtime tests.
- [x] Document Capability executor metadata, feature onboarding artifacts, Python script contract, trusted-script boundary, and deferred runtimes.
- [x] Update backend specs with the Script Capability/Runtime contract and remove any rule that incorrectly forbids metadata-owned script executors.

## Validation

- [x] `node --test script-runtime/*.test.js script-runtime/providers/*.test.js capability/*.test.js`
- [x] `python -m unittest discover -s script-runtime -p "test_*.py"`
- [x] `python -m py_compile script-runtime/python_runner.py`
- [x] `npm test`
- [x] `npm run build`
- [x] `git diff --check`
- [x] Boundary search: interpreter/`child_process` calls exist only in PythonProvider; renderer and Command Engine contain no script/runtime branches.
- [x] Boundary search: Resolve scripting calls remain under `resolve/`; feature fixtures access Resolve only through context.
- [x] Verify both hosts register the same discovered script Capabilities and existing marker tests remain unchanged.

## Risky Files and Rollback Points

- `capability/registry.js`: optional executor validation must not make handwritten Capabilities invalid.
- Capability manifest loader/registration: duplicate or malformed definitions must fail before partial registration.
- Both host entrypoints: registration order must remain registry -> FeatureCatalog/ConfigManager/lifecycle/executor.
- Python process protocol: stdout is reserved for one envelope; feature output must be redirected to logs.
- `resolve/adapter.py`: prefer no behavior change; expose/reuse existing getters only if the runner cannot consume them directly.

## Review Gate

- [x] A fixture Feature can be added with Script + Capability Metadata/Config Schema + Command Metadata and no host/UI/Command Engine edits.
- [x] Python is the only implemented runtime and future providers require only ScriptExecutor registration.
- [x] ScriptContext contains exactly the five approved services.
- [x] No sandbox, process pool, package manager, timeout framework, generic RPC bus, or bridge rewrite was introduced.
- [x] Final full-scope Trellis check passes before commit.
