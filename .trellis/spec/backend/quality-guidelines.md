# Quality Guidelines

> Code quality standards for backend development.

---

## Overview

Backend code includes local bridge processes, Resolve scripting integration, Workflow Integration Plugin Resolve actions, startup scripts, and command handler dispatch. Backend modules own external capability calls and must expose narrow, typed JSON contracts to callers.

## Scenario: Capability Dispatch

### 1. Scope / Trigger

- Trigger: adding a command that may have more than one execution backend, including Resolve APIs, scripts, Workflow Integration, keyboard shortcuts, or future automation.
- Commands describe user intent; capability modules decide how that intent is executed.

### 2. Signatures

- Command manifest: `{ id: string, name: string, description: string, category: string, icon: string, keywords: string[], capability: string }`
- Capability metadata: `{ id: string, name: string, description: string, category: string, icon: string, version: string, type: string, providers: string[], executor?: { type: "script", runtime: string, entry: string }, configSchema: object }`
- Capability registry: `createCapabilityRegistry() -> { register(capabilityId, capability), get(capabilityId), getMetadata(capabilityId), getAllCapabilities() }`
- Command executor: `createCommandExecutor({ capabilityRegistry, configManager, findCommand? }) -> executeCommand(commandId)`
- Capability execution: `capability.execute(command, { config })`, where `config.get(key)` is scoped to that capability.
- Marker capability: `createMarkerCapability(backends) -> { metadata, add(options?), execute(command, context?), selectBackend() }`
- Unavailable error: `CapabilityUnavailableError(capability, attemptedBackends)`
- Shortcut manager: `get(name)`, `has(name)`, `canExecute(name)`, and `execute(name, context?)`.

### 3. Contracts

- `command-engine/` validates and routes the `capability` string only. It must not import Resolve APIs, bridge transport, or keyboard implementations.
- Command Registry requires non-empty `description`, `category`, and `icon`, returns only the fixed Command shape, and keeps search limited to id/name/keywords.
- Each host creates a capability registry, registers its host-backed capability objects, and injects the registry into the command executor.
- Registered capabilities keep descriptive data under `capability.metadata`; `register(capabilityId, capability)` and `get(capabilityId)` retain their existing execution-object behavior.
- Every capability declares `metadata.configSchema`; use `{}` when it has no settings. Registry registration validates the schema before storing the capability.
- Handwritten capabilities may omit `metadata.executor`. Metadata-discovered script capabilities declare `executor.type = "script"`; Command metadata never declares an executor or runtime.
- `getMetadata(capabilityId)` returns the full metadata object or `null`. `getAllCapabilities()` returns fresh catalog summaries containing only `id`, `name`, `category`, and `icon`, never execution functions.
- Metadata `providers` names supported provider families such as `resolve-api` and `shortcut`; it does not report host-specific runtime availability or expose internal backend ids.
- `marker.add` checks backends in order: `resolveApi`, `resolveScriptApi`, `workflowPluginApi`, `keyboardShortcut`; `uiAutomation` is reserved and not implemented.
- Hosts inject available execution adapters. Workflow Integration injects the Resolve adapter as `workflowPluginApi`; standalone/Utility injects the health-checked bridge adapter as `resolveScriptApi`.
- Backend fallback happens only during availability selection. Once `addMarker()` starts, its API or semantic error propagates and no lower backend executes.
- Shortcut mappings live in `shortcut/shortcuts.json`. A mapping alone does not mean it can execute: `canExecute()` is true only when a keyboard executor is injected.
- The MVP does not synthesize keys, inspect Resolve Keyboard Customization, bind missing shortcuts, or perform UI automation.

### 4. Validation & Error Matrix

- Unknown command id -> command executor throws `Unknown command`.
- Missing/blank Command presentation fields -> Command Registry rejects the manifest before catalog or execution use.
- Missing command capability handler -> command executor throws `No capability handler registered`.
- Missing capability metadata, blank required string fields, invalid or sparse `providers`, or a metadata id that differs from the registry key -> registration throws `TypeError`.
- Malformed executor metadata, blank runtime/entry, or an unsupported executor type -> registration throws `TypeError` before the host registry changes.
- Unknown capability metadata id -> `getMetadata()` returns `null`.
- Backend missing `addMarker` or reporting `isAvailable() === false` -> capability checks the next backend.
- Backend availability raises `CapabilityUnavailableError` -> capability checks the next backend.
- Backend availability raises an unexpected error -> propagate it; do not hide infrastructure bugs.
- No usable backend -> throw `CapabilityUnavailableError` with the capability id and checked backends.
- Selected backend execution fails -> propagate the same error; do not try keyboard or another backend.
- Shortcut mapping missing or keyboard executor absent -> ShortcutManager refuses execution without sending input.

### 5. Good/Base/Bad Cases

- Good: command metadata contains `"capability": "marker.add"`.
- Good: a registered Command declares its own description/category/icon and appears correctly without renderer overrides.
- Good: the marker capability exposes nested metadata and the registry projects only catalog fields for future UI consumers.
- Base: Workflow Plugin injects only `workflowPluginApi`, so `marker.add` delegates to `resolve/adapter.js`.
- Good: a dead standalone bridge reports unavailable before execution, allowing a future configured keyboard backend to be selected.
- Bad: command metadata contains `"executor": "resolve"` or a keyboard shortcut string.
- Bad: a Command manifest duplicates binding triggers or renderer code supplies presentation defaults by Command id.
- Bad: Electron host registration duplicates marker metadata or computes provider availability for the catalog.
- Bad: catch an `AddMarker` failure and then press `CTRL+M`; the first backend may already have performed a partial action.

### 6. Tests Required

- Assert the highest-priority available backend is selected.
- Assert unavailable higher backends fall through in priority order.
- Assert selected-backend execution errors do not call lower backends.
- Assert no backend produces `CapabilityUnavailableError` with useful metadata.
- Assert registry lookup preserves the same execution object while metadata lookup returns the full metadata object.
- Assert catalog listing returns only `id`, `name`, `category`, and `icon`.
- Assert missing, malformed, id-mismatched, and sparse-provider metadata cannot register.
- Assert handwritten capabilities without `executor` remain valid and malformed script executor metadata cannot register.
- Assert command registry preserves search while returning capability metadata.
- Assert Command Registry requires presentation fields, defensively clones keywords, and omits unsupported help/executor fields.
- Assert ShortcutManager mapping, no-executor behavior, and injected-executor request shape.
- Assert bridge availability uses `/health` and marker execution preserves the existing command-id HTTP payload.

### 7. Wrong vs Correct

#### Wrong

```javascript
// command-engine
if (command.executor === "resolve") {
  return resolveAdapter.addMarker();
}
```

#### Correct

```javascript
const capabilityRegistry = createCapabilityRegistry();
capabilityRegistry.register("marker.add", markerCapability);
capabilityRegistry.getMetadata("marker.add");
capabilityRegistry.getAllCapabilities();
const executeCommand = createCommandExecutor({
  capabilityRegistry,
  configManager,
});
```

## Scenario: Script Capability Runtime

### 1. Scope / Trigger

- Trigger: adding or changing a Capability whose execution is implemented by a local script runtime.
- Phase 6 implements Python only. Lua, Node, shell, and external-process runtimes require a future runtime provider, not Command, Capability, or UI branches.

### 2. Signatures

- Capability executor metadata: `{ type: "script", runtime: "python", entry: string }` where `entry` is relative to the application root.
- Runtime dispatcher: `new ScriptExecutor(Map<runtime, provider>).execute(scriptDefinition, context)`.
- Runtime provider: `provider.execute(scriptDefinition, context) -> Promise<JSONValue>`.
- Script Capability Provider: `execute(scriptDefinition, { command, config })`, where `command.id` is the stable execution identity and `config.get()` returns the capability-scoped snapshot.
- Python feature entry: sync or async `execute(context) -> JSON-serializable result`.
- Python ScriptContext public attributes: `command_id`, `resolve`, `config`, `logger`, `project`, `timeline`.
- Python process request: `{ "commandId": string, "config": object }` on stdin.
- Python process response: `{ "ok": true, "result": JSONValue, "logs": LogRecord[] }` or `{ "ok": false, "error": { "type": string, "message": string }, "logs": LogRecord[] }`.

### 3. Contracts

- Capability definitions are discovered from sorted JSON manifests and converted into ordinary executable Capability objects before FeatureCatalog and ConfigManager are created.
- The existing Capability Registry remains the only Feature registry. Registration validates all discovered definitions before mutating the host registry, preventing partial registration.
- A script Capability delegates `Capability -> ScriptCapabilityProvider -> ScriptExecutor -> runtime provider`; only the runtime provider knows the interpreter or `node:child_process`.
- Both Electron hosts call the same script registration helper in the same registry-composition position.
- Command Engine, Command Metadata, Interaction Binding, renderer, Feature UI, and the fixed-command HTTP bridge contain no script/runtime selection branches.
- `ScriptCapabilityProvider` forwards only `command.id` plus a defensive plain snapshot from `ConfigManager.forCapability(id)`. Scripts never receive Command presentation metadata, ConfigStorage, ConfigManager, another Capability's settings, Electron, or UI objects.
- PythonProvider resolves `entry` under the application root, rejects absolute/missing/escaping paths including symlink escapes, spawns with `shell: false`, and reserves process stdout for one JSON envelope.
- The Python runner captures feature stdout/stderr as log records, supports sync/async `execute(context)`, and requires JSON-serializable results.
- `context.resolve`, `context.project`, and `context.timeline` are lazy and cached through `resolve.adapter.py`; config-only scripts do not require a live Resolve connection.
- `context.command_id` is read-only. Both JavaScript producers and the Python runner reject a missing, blank, or non-string Command id before feature execution.
- Before importing `DaVinciResolveScript`, the shared adapter tries existing importability, then existing `RESOLVE_SCRIPT_API/Modules` and standard Windows ProgramData module directories without duplicating `sys.path` entries.
- Python scripts are trusted local Capability code. ScriptContext is an API boundary, not an OS/filesystem sandbox.
- One subprocess is used per execution. Add pooling only after measured startup cost justifies shared runtime state.
- `RESOLVE_COMMAND_CENTER_PYTHON_CMD` belongs to the legacy bridge launcher and may contain arguments. PythonProvider must not treat it as a single executable; use its executable-only constructor injection when customization is needed.

### 4. Validation & Error Matrix

- Missing definitions directory -> register zero script Capabilities without error.
- Invalid manifest root/entry, duplicate discovered id, malformed Capability metadata, or malformed executor -> reject before adding any discovered Capability to the host registry.
- Unknown `scriptDefinition.runtime` -> ScriptExecutor rejects without invoking a provider.
- Missing/blank `command.id` or `commandId` -> reject before spawning or executing the feature.
- Absolute, missing, non-file, or application-root-escaping entry -> PythonProvider rejects before spawning.
- Python spawn error, stdin failure, non-zero exit, invalid JSON/envelope/log record, or logger replay failure -> reject with a controlled error naming the script entry.
- Missing/non-callable Python `execute`, import/runtime exception, or non-JSON result -> runner returns a structured error envelope; PythonProvider rejects it.
- Missing Resolve/project/timeline -> error occurs only when the corresponding lazy context service is accessed.
- Once Python execution starts, do not retry another runtime or execution backend.

### 5. Good/Base/Bad Cases

- Good: adding `scripts/export.py`, one Capability manifest with `configSchema` and executor metadata, and one Command manifest makes the Feature discoverable and executable without host/UI/Command Engine edits.
- Base: a config-only Python script reads `context.config`, logs through `context.logger`, and returns a JSON object without connecting to Resolve.
- Good: a Resolve script reads `context.project` and `context.timeline`; only the runtime-owned adapter resolves them.
- Bad: a Command manifest contains `runtime: "python"`, renderer calls a script IPC method, or Capability code imports `node:child_process`.
- Bad: a feature script imports `resolve.adapter`, ConfigStorage, Electron, or Clackly source paths instead of using ScriptContext.
- Bad: adding empty Lua/Node provider classes before those runtimes are implemented.

### 6. Tests Required

- Assert sorted object/array manifest loading, duplicate rejection, defensive definitions, optional-executor compatibility, and atomic registration failure.
- Assert a temporary Script + Capability manifest + Command manifest executes through the real Command executor and appears through FeatureCatalog.
- Assert ScriptExecutor dispatches only the named provider and rejects missing/unsupported runtimes.
- Assert ScriptCapabilityProvider requires a Command id and scoped config, passes only the id plus a defensive plain snapshot, and does not forward Command metadata or ConfigManager.
- Assert PythonProvider path containment, `shell: false`, command/config request, result/log replay, spawn/stdin/exit/protocol/logger failures, and executable-only Python customization.
- Assert the Python runner exposes exactly six public context attributes with read-only `command_id`, keeps Resolve access lazy/cached, supports sync/async scripts, captures stdout/stderr, and rejects missing execute, exceptions, NaN, and other non-JSON results.
- Run full Node/Python tests, Python compile, production build, `git diff --check`, and boundary searches for process/Command Engine/renderer/Resolve ownership.
- Record live Resolve/Workflow Integration execution as a manual validation gap when Resolve is unavailable.

### 7. Wrong vs Correct

#### Wrong

```javascript
// command-engine/executor.js
if (command.runtime === "python") {
  return spawn("python", [command.entry]);
}
```

#### Correct

```javascript
const capability = capabilityRegistry.get(command.capability);
await capability.execute(command, {
  config: configManager.forCapability(command.capability),
});

// Generic script Capability delegates through the registered runtime provider.
await scriptExecutor.execute(metadata.executor, scriptContext);
```

## Scenario: Managed Script Runtime Selection

### 1. Scope / Trigger

- Trigger: adding managed interpreter metadata, runtime compatibility rules, operator overrides, or selection before a Script Runtime provider is constructed.
- Selection is metadata-only: it returns one absolute executable or a typed failure and does not launch a process or change provider wiring.

### 2. Signatures

- Manifest envelope: `{ schemaVersion: 1, profiles: RuntimeProfile[] }` in `resources/runtimes/manifest.json`.
- Runtime profile: `{ id, runtime, implementation, runtimeVersion, platform, architecture, capabilities, host: { application, versionPrefix }, executable, verification: "machine-verified", releaseStatus: "candidate" | "current" | "legacy-pinned" }`.
- Loader: `loadRuntimeRegistry({ runtimeRoot?, fileSystem? }?) -> RuntimeRegistry`.
- Registry: `createRuntimeRegistry({ schemaVersion?, profiles, runtimeRoot }) -> { runtimeRoot, register(profile), get(id), getAll() }`.
- Resolver: `new RuntimeResolver({ registry, runtimeRoot?, fileSystem? }).resolve({ runtime, platform, architecture, capabilityId, host: { application, version }, overrideExecutable? })`.
- Error: `new RuntimeError(code, message, { supportStatus?, details? }?)`.

### 3. Contracts

- Manifest values own interpreter versions and compatibility data; Feature, Capability, Provider, and host composition code must not hard-code Python versions.
- Load and Registry validation are atomic. Profiles use canonical numeric `major.minor.patch` runtime versions, Node platform/architecture names, unique non-empty Capability ids, a numeric host `versionPrefix`, and a contained slash-separated relative executable path.
- Registry records are defensive clones, profile ids are unique, and `getAll()` is stable by id. Registry construction does not inspect payload files, host state, PATH, or running applications.
- Normal resolution matches runtime, platform, architecture, Capability, host application, and numeric host-version prefix. It selects the highest numeric runtime version, then the lexically lowest id; it does not retry a lower profile when the chosen payload is missing.
- Managed payload containment compares canonical executable and canonical runtime-root paths. Manifest validation rejects POSIX and Windows absolute forms on every host.
- `overrideExecutable`, when present, is authoritative and evaluated before the request or Registry. It must be one absolute existing regular file; success is `overridden`, not compatibility-verified, and failure never falls through.
- Resolution returns `{ source: "manifest" | "override", supportStatus, executable, profile }`. Manifest success is `machine-verified`; no match is `unsupported`; a missing/non-file/escaping selected payload is `missing-runtime`.
- Resolver never invokes a process, queries PATH, returns bare `python`/`python3`, probes Resolve, or changes `PythonProvider`. A later composition phase may inject `resolution.executable` through the existing executable-only provider seam.

### 4. Validation & Error Matrix

- Missing/unparseable Manifest, unsupported schema, malformed/sparse profile data, duplicate id, or escaping/absolute executable -> `RUNTIME_MANIFEST_INVALID`.
- Missing/malformed resolve selectors or non-canonical host version -> `RUNTIME_REQUEST_INVALID`.
- Non-string, relative, blank, whitespace-padded, argument-bearing, or otherwise malformed Override -> `RUNTIME_OVERRIDE_INVALID`.
- No compatible profile -> `RUNTIME_UNSUPPORTED` with `supportStatus: "unsupported"`.
- Missing/non-file Override or selected managed payload, or a managed symlink escaping the canonical root -> `RUNTIME_NOT_FOUND` with `supportStatus: "missing-runtime"`.
- Error `details` and returned profiles are defensive; malformed diagnostic inputs must not leak `DataCloneError` or another untyped exception.

### 5. Good/Base/Bad Cases

- Good: a Resolve `20.3.2.9` request matches a profile with `versionPrefix: "20.3.2"`, then selects runtime `3.13.10` over `3.13.9` numerically.
- Base: a valid committed profile may load while its future bundled payload is absent; resolution then returns `RUNTIME_NOT_FOUND`.
- Good: an explicit existing executable wins and reports `overridden` without claiming machine verification.
- Bad: use `which`, `where`, `python`, or `python3` after selection fails, or silently try an older profile when the selected payload is absent.
- Bad: put a Python-version branch in `PythonProvider`, a Feature, or host startup code.

### 6. Tests Required

- Assert versioned Manifest loading, every required field, dense arrays, duplicates, defensive Registry records, and POSIX/Windows path rejection on every test host.
- Assert every selector mismatch, numeric host-prefix matching, numeric runtime ordering, deterministic id tie-breaking, and no retry after the selected payload is missing.
- Assert authoritative Override success plus relative, argument-bearing, missing, function, symbol, and array failures with typed errors and no Registry read.
- Assert regular-file and real-path containment, including symlink escape rejection and a valid payload beneath a symlinked runtime root.
- Assert all support statuses, the committed missing-payload profile, absence of PATH/process lookup, unchanged provider/host wiring, full Node/Python tests, and production build.

### 7. Wrong vs Correct

#### Wrong

```javascript
const executable = process.env.PYTHON || "python";
return spawn(executable, args);
```

#### Correct

```javascript
const registry = loadRuntimeRegistry();
const resolution = new RuntimeResolver({ registry }).resolve(request);
// A later composition phase may inject resolution.executable into PythonProvider.
```

## Scenario: Isolated Managed Runtime Launch

### 1. Scope / Trigger

- Trigger: launching a short-lived managed interpreter for a Bootstrap operation after Runtime Resolver selection.
- The Launcher isolates process, environment, protocol, limits, crash diagnostics, and cleanup; Phase 6.5B does not connect it to `PythonProvider`, Resolve, or Capability/host composition.

### 2. Signatures

- Environment: `createRuntimeEnvironment({ parentEnvironment, temporaryDirectory, platform }) -> childEnvironment`.
- Launcher: `new RuntimeLauncher({ bootstrapPath?, timeoutMs = 10_000, maxStdoutBytes = 1_048_576, maxStderrBytes = 1_048_576, parentEnvironment?, platform?, temporaryRoot?, fileSystem?, spawnProcess? })`.
- Execute: `launcher.execute({ resolution, request }) -> Promise<{ response, process: RuntimeProcessResult }>`.
- Bootstrap request: `{ "operation": "runtime-info" }` through stdin EOF.
- Bootstrap success: `{ "ok": true, "runtime": { "version": "major.minor.patch", "architecture": "64bit", "executable": absolutePath } }` through stdout EOF.
- Bootstrap failure: `{ "ok": false, "error": { "code": string, "type": string, "message": string } }`.
- Process result: `{ exitCode, signal, termination, stdout, stderr, stdoutBytes, stderrBytes, durationMs, nativeCrash }`.

### 3. Contracts

- Accept a plain Resolver-shaped resolution with `source: "manifest" | "override"`; revalidate and canonicalize its absolute regular-file executable immediately before spawn. Never accept a bare command or search PATH.
- Validate a plain JSON-serializable request and an absolute regular-file Bootstrap before creating process state. No request value enters argv.
- Spawn only `resolution.executable` with fixed `[-I, -u, -X, faulthandler, bootstrapPath]`, `shell: false`, `windowsHide: true`, three pipes, and one temporary cwd per request.
- Windows environment contains exactly `SystemRoot`, `WINDIR`, and launcher-owned `TEMP`/`TMP`; non-Windows contains exactly launcher-owned `TMPDIR`. Do not spread/delete from `process.env`, pass `PATH`, or retain Python/venv/Conda/uv variables.
- Exchange one JSON value through stdin/stdout EOF. Bootstrap uses only Python standard library code, imports no Resolve/Feature modules, and writes one UTF-8 response to real stdout.
- Count stdout/stderr Buffer bytes separately, retain at most each configured limit, and copy retained bytes so an oversized chunk's backing allocation is released. Decode only after process close.
- The first timeout or stream overflow kills the single stateless worker once with `SIGKILL`/Windows force termination. Always wait for `close` before parsing output, settling the Promise, or deleting cwd.
- Record asynchronous child `error` and stdin failures, then finalize once on `close`; a specific exit/signal/timeout/overflow dominates a racing stdin error. A synchronous spawn throw is finalized directly.
- Cleanup runs once after every success/failure path. A cleanup-only failure is typed; when another error already exists, keep its code and append bounded cleanup diagnostics.
- A process result is defensive and JSON-safe. Windows high-bit statuses include uppercase hex; uninitiated POSIX signals are crashes; Windows Python abort code `3` requires narrow faulthandler fatal evidence. Do not classify arbitrary stderr text or non-Windows high exit codes as native crashes.
- No retry, runtime fallback, pool, descendant process, Job Object, Probe, Provider switch, or production integration belongs in this boundary.

### 4. Validation & Error Matrix

- Malformed resolution/request/constructor limits/Bootstrap path or non-standard/non-serializable JSON -> `RUNTIME_LAUNCH_REQUEST_INVALID`.
- Bare, relative, missing, or non-file resolved executable -> `RUNTIME_EXECUTABLE_INVALID`.
- Synchronous or asynchronous process start failure -> `RUNTIME_SPAWN_FAILED` after applicable close/cleanup ordering.
- Input pipe failure without a more specific termination -> `RUNTIME_STDIN_FAILED`.
- Deadline exceeded -> `RUNTIME_TIMEOUT`; stdout/stderr byte limit exceeded -> `RUNTIME_OUTPUT_LIMIT` naming stream and limit.
- Uninitiated POSIX signal or Windows native-crash evidence -> `RUNTIME_NATIVE_CRASH`; ordinary non-zero exit -> `RUNTIME_PROCESS_EXITED`.
- Exit 0 plus empty stdout -> `RUNTIME_PROTOCOL_EMPTY`; invalid JSON or malformed success/failure fields -> `RUNTIME_PROTOCOL_INVALID`.
- Valid `ok: false` response -> `RUNTIME_BOOTSTRAP_FAILED` with the structured Bootstrap error.
- Cleanup failure with no earlier failure -> `RUNTIME_TEMP_CLEANUP_FAILED`; otherwise append `cleanupError` without changing the primary code.

### 5. Good/Base/Bad Cases

- Good: launch the canonical Resolver executable with fixed flags, pass a nested request only through stdin, and return the exact runtime-info response plus bounded process evidence.
- Base: a malformed Bootstrap request returns valid `ok: false` and becomes `RUNTIME_BOOTSTRAP_FAILED` while the process itself exits normally.
- Good: timeout, flood, or `os.abort()` affects only the short-lived worker; the Node parent continues and cwd is gone before rejection.
- Bad: inherit `process.env`, delete only known Python keys, or set `PATH` to make adjacent tools discoverable.
- Bad: call `finish()` from child `error`, clean cwd before `close`, retain an oversized Buffer through `subarray()`, or trust `{ ok: true, runtime: {} }`.
- Bad: switch `PythonProvider` to the Launcher before an explicit integration phase.

### 6. Tests Required

- Assert exact executable, fixed argv/options, stdin-only complex payload, canonical revalidation, Bootstrap file validation, and no spawn/temp creation for invalid input.
- Assert exact Windows/non-Windows environment keys, case-insensitive Windows source lookup, `WINDIR` fallback, and absence of PATH plus every Python/venv/Conda/uv/unrelated variable.
- Assert strict success/error envelope fields, canonical dotted version, `64bit`, absolute executable, non-standard JSON rejection, empty/invalid output, and defensive results/errors.
- Assert byte counts versus retained bytes for stdout and stderr, copied bounded buffers, kill once, Promise pending until close, timeout/overflow precedence, and cleanup before settlement.
- Assert synchronous/async spawn errors, error-then-close ordering, stdin/exit races, cleanup-only/secondary cleanup errors, safe malformed diagnostics, and single settlement.
- Run one real worker for success, structured Python exception, explicit exit, empty/invalid output, both floods, timeout, and abort followed by another successful worker. Avoid one platform-specific abort-code assertion.
- Run the real Bootstrap through absolute `sys.executable` in the isolated environment, focused Runtime/PythonProvider tests, full Node/Python tests, Python compilation, production build, syntax/whitespace checks, and boundary searches proving no production integration or PATH lookup.

### 7. Wrong vs Correct

#### Wrong

```javascript
const child = spawn("python", [bootstrap, JSON.stringify(request)], { env: process.env });
child.once("error", reject); // may settle and clean before close
```

#### Correct

```javascript
const { response, process } = await launcher.execute({
  resolution,
  request: { operation: "runtime-info" },
});
// Launcher owns absolute spawn, stdin JSON, limits, close ordering, and cleanup.
```

## Scenario: Resolve Runtime Compatibility Probe

### 1. Scope / Trigger

- Trigger: verifying a selected Python Runtime against one Resolve version and bridge installation before a later execution policy consumes it.
- The Probe diagnoses and caches compatibility only; it does not change Resolver support provenance or wire `PythonProvider`, Capability, hosts, IPC, or UI.

### 2. Signatures

- Probe: `new RuntimeProbe({ launcher?, resolvePythonProbe?, cache?, cachePath?, fileSystem?, platform?, architecture? }).probe({ resolution, clacklyVersion, resolveVersion, modulePath?, libraryPath?, force? })`.
- Bootstrap request: `{ operation: "resolve-probe", expectedRuntimeVersion: string | null, expectedResolveVersion: string, modulePath: absolutePath, libraryPath: absolutePath }`.
- Status projection: `RuntimeDiagnostics.derive(supportStatus, probeStatus) -> { ok, supportStatus, probeStatus, effectiveStatus, warnings }`.
- Cache envelope: `{ schemaVersion: 1, fingerprint, result }`, where `result` is one passed diagnostic snapshot.

### 3. Contracts

- `supportStatus` remains `machine-verified | overridden | unsupported | missing-runtime`; `probeStatus` is independently `not-run | passed | failed | stale`; `effectiveStatus` is derived as `ready | warning | blocked`.
- A passed machine-verified Runtime is ready. A passed Override is ready with `CUSTOM_RUNTIME_UNVERIFIED`. A passed unsupported Runtime is warning. Missing Runtime, failed, not-run, and stale states are blocked.
- Each uncached Probe calls `RuntimeLauncher` exactly once. Explicit bridge paths cross stdin JSON, and Bootstrap checks runtime/64-bit/version, module, library, import, connection, and live Resolve version in that order.
- Bootstrap sets only the child `RESOLVE_SCRIPT_LIB`, loads the exact canonical module file, and verifies that the imported native module came from the supplied canonical library. Python-level bridge output is suppressed so real stdout remains one envelope; a native abort is still contained and diagnosed by the Launcher.
- Fingerprint schema version 1 contains Clackly version, Runtime id/version/executable mtime, supplied Resolve version, canonical bridge paths/mtimes, platform, architecture, and canonical Override path or `null`. Override cache lookup may reuse the stored observed Python version only while executable path and mtime match.
- Cache only passed snapshots through `ConfigStorage.save()` atomic replacement. Cached support provenance must agree with the managed/Override fingerprint. Read/schema failures are misses, mismatches are stale, force bypasses hits, and every fresh failure clears reusable state. Cache persistence failures remain subordinate diagnostics.

### 4. Validation & Error Matrix

- Missing module/library -> `RESOLVE_MODULE_NOT_FOUND` / `RESOLVE_LIBRARY_NOT_FOUND` before import.
- Bridge import failure -> `RESOLVE_IMPORT_FAILED`; `scriptapp()` returns no app -> `RESOLVE_NOT_RUNNING`; `scriptapp()` raises -> `RESOLVE_CONNECTION_FAILED`.
- Missing, malformed, unreadable, or incompatible live Resolve version -> `RESOLVE_VERSION_UNVERIFIED`.
- Launcher timeout remains `RUNTIME_TIMEOUT`; native termination during the operation maps to `RUNTIME_NATIVE_BRIDGE_CRASH` with bounded Launcher process evidence.
- Corrupt/unreadable/incompatible cache -> miss; cache write/delete failure -> keep the real passed/failed Probe result and attach `CACHE_WRITE_FAILED` / `CACHE_CLEAR_FAILED` diagnostics.

### 5. Good/Base/Bad Cases

- Good: an unchanged Override executable, bridge tuple, and fingerprint returns the cached passed result without spawning and retains `supportStatus: overridden` plus its warning.
- Base: a missing cache launches once, saves a passed result, and reports `cache.status: miss`.
- Bad: promote an Override to machine-verified, inherit PATH/PYTHONPATH/Resolve variables, import the bridge in Node, or reuse a failed/native-crash result.

### 6. Tests Required

- Assert the complete status table, Override warning, unsupported warning readiness, and unchanged support provenance.
- Assert every fingerprint field, managed and Override hits, stale reasons, force bypass, corrupt/read failures, atomic saves, clear-on-failure, and subordinate write/delete diagnostics.
- Exercise every controlled Bootstrap branch with fake modules. Import an aborting fixture only through the real isolated Probe; assert parent survival, cache removal, and a following successful Probe.
- Run focused Runtime/Launcher/PythonProvider tests, Python discovery and compilation, full project tests/build, syntax/whitespace checks, and boundary searches for PATH lookup, duplicate spawn/cache ownership, and production integration.

### 7. Wrong vs Correct

#### Wrong

```javascript
const verified = require(resolution.executable).importResolve();
if (verified) resolution.supportStatus = "machine-verified";
```

#### Correct

```javascript
const result = await runtimeProbe.probe({
  resolution, clacklyVersion, resolveVersion, modulePath, libraryPath
});
// Resolver provenance and isolated Probe state remain independent.
```

## Scenario: Capability Configuration

### 1. Scope / Trigger

- Trigger: adding a capability setting, reading configuration during capability execution, or changing configuration persistence.
- Trigger: auto-initializing a capability-owned setting during host startup.
- Capability execution code declares settings as metadata; it does not build Settings UI or read configuration files. A capability-owned startup initializer may inspect external dependency candidates through an injected filesystem seam.

### 2. Signatures

- Config field: `{ type: "string" | "number" | "boolean" | "color" | "path" | "folder" | "select", label?: string, required?: boolean, options?: string[] }`
- Config schema: `Record<string, ConfigField>` stored at `capability.metadata.configSchema`.
- Schema labels: `resolveSchemaFieldLabel(key, field) -> string` and `withResolvedSchemaLabels(schema) -> cloned schema`.
- Storage: `new ConfigStorage(filePath)`, `ConfigStorage.fromAppData(appDataPath)`, `load()`, and `save(config)`.
- Manager: `new ConfigManager({ capabilityRegistry, storage, validator? })` with `save(capabilityId, values, { requireComplete? })`, `get(capabilityId, key?)`, `update(capabilityId, patch)`, `reset(capabilityId)`, `assertConfigured(capabilityId)`, and `forCapability(capabilityId)`.
- AE initializer: `initializeAfterEffectsPath(configManager, { environment?, execFileSync?, fileSystem?, platform? }?) -> string | null`.
- Executor context: `capability.execute(command, { config: configManager.forCapability(command.capability) })`.

### 3. Contracts

- Both Electron hosts use `ConfigStorage.fromAppData(app.getPath("appData"))`, resolving to shared `appData/Clackly/config.json`; Workflow Integration keeps its separate `userData` root.
- The stored JSON root maps capability ids to flat configuration objects. ConfigStorage is the only configuration filesystem owner.
- ConfigManager resolves schemas through Capability Registry metadata, preserves unknown capability sections, returns copies, and reloads before reads and writes so long-running hosts observe sequential changes.
- A non-empty explicit Schema `field.label` wins; otherwise the shared label utility formats camelCase and `.`, `_`, `-` separators. ConfigManager uses it for missing-required projections, and FeatureCatalog returns cloned schemas with resolved labels.
- String-like types are strings, numbers are finite, booleans are booleans, and select values must match declared options. This layer does not inspect paths/folders or parse colors.
- Settings IPC calls `save(..., { requireComplete: true })` so missing required fields fail before persistence; non-UI callers may still save partial drafts before `assertConfigured()` gates execution.
- Both hosts call the same capability-owned initializer after Electron becomes ready and before creating windows or registering IPC. The initializer keeps a valid saved value without discovery or writes; on Windows, a missing or stale `ae.export.aePath` tries the running process, HKCU/HKLM App Paths, then the highest numeric standard Adobe installation, accepting existing files only.
- Capability-specific discovery never reads or writes `config.json` directly. It updates only `aePath` through `ConfigManager.update()` and, when a stale value has no replacement, removes only that key through partial `ConfigManager.save()` so sibling values and generic missing-config recovery remain intact.
- Expected process, registry, and directory misses fall through without making startup fatal. ConfigManager/storage errors propagate. PowerShell commands that can return filesystem paths set UTF-8 output explicitly so non-ASCII installations survive Node decoding.
- `reset(capabilityId)` reloads the shared document, removes only that capability section, preserves unrelated and unknown sections, persists the remainder, and returns `{}`.
- The executor checks required configuration before capability execution. The original command remains the first argument; the second context exposes only a capability-scoped `config.get(key)` reader.
- Simultaneous cross-process writes remain last-writer-wins until concurrent Settings writers justify interprocess locking.

### 4. Validation & Error Matrix

- Missing or malformed `configSchema`, unsupported type, invalid label/required flag, or invalid select options -> registry registration throws `TypeError`.
- Missing config file -> ConfigStorage loads `{}`.
- Invalid JSON or non-object storage root -> ConfigStorage throws clearly and does not replace the file.
- Unknown capability id or config key -> ConfigManager throws clearly.
- Stored or submitted type mismatch / invalid select value -> ConfigManager throws `TypeError` before exposing or executing it.
- Valid saved AE path -> return it without subprocess, scan, or configuration write.
- Missing/stale AE path with no valid discovery result -> return `null`; remove only a stale stored key, but do not persist an empty or guessed value.
- Expected Windows strategy failure -> continue in precedence order; configuration read/write failure -> propagate unchanged.
- Missing or blank required string-like fields -> executor rejects before `capability.execute()` and names the capability plus all missing fields.
- Empty schema -> execution proceeds without setup.

### 5. Good/Base/Bad Cases

- Good: capability metadata declares `configSchema`, future UI reads that metadata, and capability execution calls `context.config.get("aePath")`.
- Base: `marker.add` declares `configSchema: {}` and executes exactly as before.
- Good: both hosts share the config file but reload before operations, preserving sequential changes made by the other host.
- Good: a manually selected existing `AfterFX.exe` remains authoritative; a stale path is replaced while `prefix` is preserved.
- Good: `output_folder` projects as `Output folder` in lifecycle messages and Settings without renderer formatting.
- Base: no discoverable AE leaves `aePath` absent so the existing required-field Settings recovery stays accurate.
- Bad: capability code reads Clackly configuration through `node:fs`, receives ConfigStorage, or reads another capability id.
- Bad: a host, renderer, or Python feature duplicates AE discovery, or a registry command's localized output is decoded as UTF-8 without controlling the producer encoding.
- Bad: ConfigManager keeps a startup snapshot of the shared document and later overwrites another host's settings.

### 6. Tests Required

- Assert every supported schema/value type plus malformed and sparse select options.
- Assert missing-file load, invalid JSON/root errors, atomic replacement, failed-write cleanup, and previous-file preservation.
- Assert save/get/update/reset copies, unknown ids/keys, invalid stored values, complete-save required validation, missing/blank required values, and scoped reads.
- Assert two long-running managers observe sequential shared-file changes and preserve unrelated capability sections.
- Assert startup initialization short-circuits a valid saved path, preserves discovery precedence, compares numeric versions, validates files, preserves sibling settings, removes only stale `aePath`, and is a non-Windows no-op.
- Assert both hosts initialize before exposing windows/IPC and that process/App Paths discovery preserves non-ASCII paths with explicit UTF-8 output and hive fallback.
- Assert executor blocks incomplete configuration before execution and otherwise passes the unchanged command plus scoped context.
- Assert both host composition roots use the common appData path while Workflow Integration retains its userData override.
- Assert explicit/fallback Schema labels and nested schema immutability in ConfigManager and FeatureCatalog projections.

### 7. Wrong vs Correct

#### Wrong

```javascript
const config = JSON.parse(fs.readFileSync("config.json"));
await capability.execute(command, config[command.capability]);

// Host/UI-specific discovery duplicates capability rules and bypasses ConfigManager.
settingsWindow.findAfterEffects().then((aePath) => fs.writeFileSync("config.json", aePath));
```

#### Correct

```javascript
configManager.assertConfigured(command.capability);
await capability.execute(command, {
  config: configManager.forCapability(command.capability),
});

// The capability owns discovery; hosts only choose the startup composition point.
initializeAfterEffectsPath(configManager);
```

## Scenario: Feature Lifecycle Projection

### 1. Scope / Trigger

- Trigger: exposing installation, enablement, configuration readiness, dependency readiness, or provider availability to Feature UI.
- Lifecycle is an advisory projection plus a synchronous execution gate; it does not replace Capability execution.

### 2. Signatures

- Lifecycle record: `{ id, installed, enabled, status, message, details: { missing, action } }`.
- Status: `"ready" | "loading" | "missing-config" | "missing-dependency" | "unavailable" | "error"`.
- Manager: `new FeatureStatusManager({ capabilityRegistry, configManager, stateStorage })` with `list()`, `get(id)`, `refresh(id?)`, `setEnabled(id, enabled)`, and `assertEnabled(id)`.
- State storage: `FeatureStateStorage.fromAppData(appDataPath)`, `getEnabled(id)`, and `setEnabled(id, boolean)`.
- Optional Capability probe: `checkAvailability() -> Promise<{ status, message, details }>` where probe status is only `ready`, `missing-dependency`, or `unavailable`.
- Config projection: `ConfigManager.getMissingRequired(id) -> Array<{ key, label }>`.

### 3. Contracts

- Capability Registry remains the only Feature registry and owns `installed`; no lifecycle manifest duplicates metadata.
- `installed`, persisted `enabled`, and readiness `status` are independent dimensions.
- Every record always includes `details.missing` and `details.action`; `message` is presentation text, never a machine-readable branch source.
- `FeatureStateStorage` composes the existing atomic JSON storage and writes only capability-scoped `{ enabled: boolean }` records to shared `appData/Clackly/feature-status.json`.
- Missing enablement means enabled. Reads and writes reload the file and preserve unrelated feature sections.
- Persisted feature entries contain exactly `{ enabled: boolean }`; reject derived or unknown fields instead of silently retaining them.
- Refresh checks configuration before a probe. Missing required config returns schema keys, label-based text, and `open-settings` without probing.
- A Capability without `checkAvailability()` is ready when configured. Probes must be side-effect free and cannot return manager-owned `loading` or `error`.
- Unexpected storage/config/probe failures become a sanitized in-memory `error`; derived status is never persisted and can recover on refresh.
- An error refresh preserves the last known `enabled` dimension instead of resetting a known disabled feature to the default.
- Command execution remains Command ID -> Capability ID -> Capability. `assertEnabled()` runs before existing configuration and execution steps.

### 4. Validation & Error Matrix

- Unknown `get(id)` -> uninstalled record; normal `list()` -> registered capabilities only.
- Unknown `setEnabled` / `assertEnabled` -> reject as unknown Feature.
- Non-boolean enablement, malformed persisted enablement, or persisted keys other than `enabled` -> `TypeError`.
- Missing required config -> `missing-config`, schema keys in `details.missing`, `open-settings` action.
- Named non-empty dependency ids -> `missing-dependency`; missing ids for that status -> sanitized `error`.
- No usable provider without a named dependency -> `unavailable`.
- Malformed probe status/details/action/message or unexpected exception -> sanitized `error`, with no stack or raw error serialization.
- Disabled command -> reject before configuration lookup and `capability.execute()`.

### 5. Good/Base/Bad Cases

- Good: `marker.add.checkAvailability()` calls `selectBackend()` and returns readiness without calling `addMarker()`.
- Base: an older Capability with no probe is ready after its required configuration is complete.
- Good: a disabled Feature can still report `missing-config`; readiness and enablement do not overwrite each other.
- Bad: persisting `status`, `message`, `details`, execution errors, or probe results.
- Bad: changing Command metadata or mapping a Command to a different Capability based on lifecycle status.

### 6. Tests Required

- Cover loading defaults, uninstalled lookup, defensive snapshots, enablement persistence/reloads, and unrelated section preservation.
- Cover config-before-probe precedence, label projection, all readiness statuses, malformed probes, sanitized errors, recovery, and error refresh preserving known enablement.
- Cover side-effect-free marker availability and disabled-before-config/execution ordering.
- Verify both hosts use shared appData state while retaining host-specific providers.

### 7. Wrong vs Correct

#### Wrong

```javascript
if (status.message.includes("Missing")) openSettings();
await capability.execute(command);
```

#### Correct

```javascript
featureStatusManager.assertEnabled(command.capability);
configManager.assertConfigured(command.capability);
await capability.execute(command, { config: configManager.forCapability(command.capability) });
```

## Scenario: Resolve Adapter Boundary

### 1. Scope / Trigger

- Trigger: adding or changing a command that reads from or writes to the DaVinci Resolve scripting API.
- Applies to both the Workflow Integration JavaScript path and the Python Utility fallback.

### 2. Signatures

- JavaScript adapter factory: `createResolveAdapter({ getResolve }) -> { addMarker(): Promise<{ ok: true, frame: number }> }`
- Python adapter action: `add_marker() -> Dict[str, Any]` containing the timeline-relative `frame`.
- Command contract remains `timeline.addMarker` with `capability: marker.add`; callers pass intent and do not pass Resolve objects or arbitrary API method names.

### 3. Contracts

- All Resolve scripting object calls such as `GetProjectManager`, `GetCurrentTimeline`, `GetCurrentTimecode`, and `AddMarker` live under `resolve/`.
- `workflow-plugin/main.js` owns Electron and `WorkflowIntegration.node` lifecycle (`Initialize`, `GetResolve`, callbacks, and `CleanUp`) and delegates Resolve scripting actions to `resolve/adapter.js`.
- `bridge/` owns HTTP transport and command dispatch only; it delegates Python Resolve scripting actions to `resolve/adapter.py`.
- `command-engine/` owns registry/search metadata and dependency-injected capability routing; it must not import Resolve adapters, bridge transport, shortcut implementations, or Resolve APIs.
- `capability/marker.js` selects available backends before execution. Once `addMarker()` starts, its error propagates without falling through to a lower backend.
- `Timeline.AddMarker` receives a zero-based frame id relative to the timeline start, not the absolute `GetStartFrame()` value.
- The adapter derives the marker frame from `GetCurrentTimecode() - GetStartTimecode()` using the timeline frame rate.
- Semicolon timecodes at 29.97 and 59.94 use drop-frame numbering. Drop-frame conversion skips timecode labels only; it does not remove media frames.

### 4. Validation & Error Matrix

- No current project or timeline -> adapter raises a user-facing error.
- Missing current/start timecode or frame rate -> adapter raises a conversion error before calling `AddMarker`.
- Playhead before timeline start or beyond timeline bounds -> adapter rejects the frame id.
- Invalid drop-frame label (for example `01:01:00;00` at 29.97) -> adapter rejects the timecode.
- `AddMarker` returns false with an existing marker at that frame -> adapter reports the duplicate position.
- `AddMarker` throws or returns false otherwise -> adapter reports the timecode and timeline-relative frame.

### 5. Good/Base/Bad Cases

- Good: `workflow-plugin/main.js` injects `resolveAdapter.addMarker` into the `workflowPluginApi` marker backend.
- Base: at 24 fps, `01:00:10:00 - 01:00:00:00` produces frame id `240`.
- Good: at 29.97 drop-frame, `01:01:00;02 - 01:00:00;00` produces frame id `1800`.
- Bad: adding `GetStartFrame()` back to the relative result and passing an absolute value such as `86640` to `AddMarker`.
- Bad: calling `timeline.AddMarker` from `command-engine/`, renderer code, Workflow Plugin routing, or the HTTP bridge.

### 6. Tests Required

- JavaScript adapter tests assert the full `AddMarker` argument list and the relative frame id.
- JavaScript and Python conversion tests cover 24 fps plus valid and invalid 29.97/59.94 drop-frame boundaries.
- Python fallback tests assert parity with JavaScript marker arguments and errors.
- Boundary grep must find Resolve scripting calls only under `resolve/` (test doubles are exempt).
- Manual Resolve validation must confirm the marker appears at the current playhead.

### 7. Wrong vs Correct

#### Wrong

```javascript
// workflow-plugin/main.js
const timeline = project.GetCurrentTimeline();
timeline.AddMarker(frameId, "Red", "Marker", "", 1);
```

#### Correct

```javascript
// workflow-plugin/main.js
const resolveAdapter = createResolveAdapter({ getResolve });
const handlers = {
  "timeline.addMarker": resolveAdapter.addMarker,
};
```

## Scenario: Local Resolve Bridge

### 1. Scope / Trigger

- Trigger: Electron sends local HTTP command requests to a Python bridge that executes Resolve scripting actions.
- Applies when adding bridge endpoints, Resolve handlers, startup scripts, or command payload fields.

### 2. Signatures

- HTTP endpoint: `POST /command`
- Request body: `{ "command": string }`
- Success response: `{ "ok": true, "command": string, ...result }`
- Error response: `{ "ok": false, "error": string }`
- Handler table: `COMMAND_HANDLERS: Dict[str, Callable[[], Dict[str, Any]]]`

### 3. Contracts

- Bridge binds to `127.0.0.1` only for MVP local IPC.
- `RESOLVE_COMMAND_CENTER_PORT` controls the bridge port and must parse to `1..65535`.
- `RESOLVE_COMMAND_CENTER_ALLOWED_ORIGIN` controls CORS for browser-based dev tooling.
- `RESOLVE_COMMAND_CENTER_ROOT` points startup scripts to the app root; prefer it for Resolve Utility launches because Resolve may omit `__file__`, and do not hardcode machine-specific absolute paths.
- `RESOLVE_SCRIPT_API` points to the Resolve scripting API directory. Startup scripts preserve an explicit env value, but on Windows may auto-detect the standard vendor install path `C:\ProgramData\Blackmagic Design\DaVinci Resolve\Support\Developer\Scripting` only when `Modules\DaVinciResolveScript.py` exists.
- `RESOLVE_SCRIPT_LIB` points to the Resolve scripting library. Startup scripts preserve an explicit env value, but on Windows may auto-detect the standard vendor install path `C:\Program Files\Blackmagic Design\DaVinci Resolve\fusionscript.dll` only when the file exists.
- `PYTHONPATH` must include the Resolve scripting `Modules` directory before launching the bridge subprocess. If `RESOLVE_SCRIPT_API` is provided or auto-detected, prepend `%RESOLVE_SCRIPT_API%\Modules` while preserving existing `PYTHONPATH` entries.
- Startup diagnostics must log whether Resolve scripting values came from the environment, auto-detection, derivation, or are missing.
- Resolve scripting API access is centralized under `resolve/`, not in bridge, command-engine, renderer, or Workflow Plugin routing code.
- In the Workflow Integration Plugin path, `workflow-plugin/main.js` owns `WorkflowIntegration.node` lifecycle and delegates Resolve scripting actions to `resolve/adapter.js`.
- Workflow Integration plugins should call `InitializePromise` or `Initialize` before Resolve API access, register `ResolveQuit` when available, and call `CleanUp()` during plugin app shutdown.
- `WorkflowIntegration.node` is a Resolve-provided native module copied from the local Resolve Developer examples for development installs; do not commit it to the repository.

### 4. Validation & Error Matrix

- Missing or non-string `command` -> HTTP 400 with an error.
- Unknown command id -> HTTP 400 with an error.
- Invalid JSON -> HTTP 400 with an error.
- Missing Resolve project or timeline -> HTTP 400 with an error from the bridge.
- Unexpected server failure -> HTTP 500 with an error.
- Invalid port env value -> startup/server raises a clear runtime error.
- Missing Resolve scripting env plus failed Windows auto-detection -> bridge `/health` returns HTTP 503 because it cannot provide the required live Resolve version; startup logs must show missing `RESOLVE_SCRIPT_API`, `RESOLVE_SCRIPT_LIB`, and `PYTHONPATH` sources.

### 5. Good/Base/Bad Cases

- Good: Adding a Resolve action by registering a new handler in `COMMAND_HANDLERS`.
- Good: Leaving user-provided `RESOLVE_SCRIPT_API` and `RESOLVE_SCRIPT_LIB` untouched, then prepending the resolved `Modules` directory to `PYTHONPATH`.
- Base: `timeline.addMarker` maps to `add_marker()` and returns the frame id on success.
- Base: Standard Windows Resolve installs work without manual scripting env configuration when the ProgramData scripting module and Program Files `fusionscript.dll` exist.
- Bad: Electron calls `DaVinciResolveScript.scriptapp("Resolve")` directly or sends arbitrary Python code over HTTP.
- Bad: Renderer, command-engine, bridge transport, or Workflow Plugin routing code calls Resolve scripting methods directly.
- Bad: Hardcoding a user-specific Resolve install path such as a home directory, or overwriting explicit scripting env values during auto-detection.

### 6. Tests Required

- Compile Python bridge/startup scripts with `python -m py_compile`.
- Probe startup environment construction with `RESOLVE_SCRIPT_API`, `RESOLVE_SCRIPT_LIB`, and `PYTHONPATH` unset on a standard Windows install; assert defaults are set and the Resolve `Modules` path is first in `PYTHONPATH`.
- Exercise `/health` and invalid `/command` payloads when changing server request handling.
- Manually validate Resolve-only actions in a live Resolve project with an active timeline.

### 7. Wrong vs Correct

#### Wrong

```python
if command_id == "timeline.addMarker":
    ...
```

spread across multiple server branches.

#### Correct

```python
COMMAND_HANDLERS = {
    "timeline.addMarker": add_marker,
}
handler = COMMAND_HANDLERS.get(command_id)
```

#### Wrong

```python
environment["RESOLVE_SCRIPT_API"] = r"C:\Users\alice\Resolve\Scripting"
environment["RESOLVE_SCRIPT_LIB"] = r"C:\custom\fusionscript.dll"
```

#### Correct

```python
if not environment.get("RESOLVE_SCRIPT_API") and standard_module_path.exists():
    environment["RESOLVE_SCRIPT_API"] = str(standard_scripting_dir)
```

---

## Scenario: Interaction Binding Dispatch

### 1. Scope / Trigger

- Trigger: adding or changing mouse interaction bindings, persisted binding fields, or host dispatch into the Command Engine.
- Interaction Binding owns user-operation matching only; Command Registry remains the Command ID -> Capability ID boundary.

### 2. Signatures

- Stored binding: `{ target: string, trigger: { type: "mouse", button: "left" | "right", modifiers: ("CTRL" | "SHIFT" | "ALT")[] }, action: { command: string } }`
- Renderer/IPC event: `{ target: string, type: "mouse", button: number, ctrlKey: boolean, shiftKey: boolean, altKey: boolean }`
- Storage: `BindingStorage.fromAppData(appDataPath)`, `load()`, and `save(bindings)`.
- Manager: `new InteractionManager({ bindingStorage, executeCommand })`, `listBindings() -> Array<{ id, target, trigger, action: { command } }>`, and `handle(event) -> Promise<{ matched: false } | { matched: true, command: string, result: unknown }>`.
- Shared trigger helpers: `normalizeTrigger(trigger)`, `normalizeMouseEventTrigger(event)`, and `triggersEqual(left, right)`.

### 3. Contracts

- Stored bindings map `target` plus an exact mouse `button` and normalized `CTRL`, `SHIFT`, `ALT` set to `action.command`.
- Binding storage and renderer-event normalization use the same shared canonical trigger module and modifier order.
- `BindingStorage` owns validation and `appData/Clackly/bindings.json`; it may compose `ConfigStorage` for atomic JSON persistence but must not store bindings in capability configuration.
- `InteractionManager` accepts plain target/button/modifier facts, performs one exact match, and delegates only the matched Command ID to the injected command executor.
- `listBindings()` returns normalized defensive records in BindingStorage order; both hosts expose the same read-only semantic IPC and no mutation IPC.
- Command Registry remains the only Command ID -> Capability ID mapping owner. Interaction modules do not import command or capability registries.
- Missing files receive the unmodified `timeline.addMarker` left-click compatibility binding once. An explicitly persisted empty object remains empty.
- Unsupported mouse buttons return `{ matched: false }`; malformed events and bindings fail clearly; executor errors propagate unchanged.
- Double-click, global shortcut, key synthesis, shortcut discovery/mutation, priorities, and wildcard modifier matching are outside this boundary.

### 4. Validation & Error Matrix

- Missing bindings file -> persist and return the unmodified `timeline.addMarker` left-click compatibility binding.
- Malformed root, binding, trigger, action, or unknown/duplicate modifier -> throw `TypeError` before persistence or matching.
- Two bindings with the same normalized target/button/modifier signature -> reject as an ambiguous duplicate.
- Unsupported event button such as middle click -> return `{ matched: false }` and do not execute.
- No exact binding -> return `{ matched: false }` and do not execute.
- Unknown `action.command`, missing Capability, missing configuration, or adapter failure -> preserve the existing executor error.

### 5. Good/Base/Bad Cases

- Good: `CTRL+SHIFT` modifiers are normalized once and match regardless of stored input order.
- Base: unmodified left click on target `timeline.addMarker` delegates `timeline.addMarker` to `executeCommand`.
- Good: a modified click can execute a different Command ID that maps to the same Capability without Interaction Binding knowing that Capability ID.
- Bad: storing `capability: "marker.add"` in a binding or importing Command/Capability Registry from `interaction/`.
- Bad: allowing a `CTRL` binding to match a `CTRL+SHIFT` event.

### 6. Tests Required

- Assert first-run creation, persistence, modifier normalization, duplicate normalized-trigger rejection, malformed binding rejection, and defensive results.
- Assert exact left/right matching, individual and combined modifiers, extra-modifier non-match, unmatched behavior, one-call delegation, and unchanged executor errors.
- Assert binding listing includes ids, preserves normalized order, and cannot mutate storage through returned nested objects.
- Run the full Node suite and renderer build after host or IPC composition changes.

### 7. Wrong vs Correct

#### Wrong

```javascript
if (event.ctrlKey) capabilityRegistry.get("marker.add").execute();
```

#### Correct

```javascript
const result = await interactionManager.handle(event);
// InteractionManager delegates only binding.action.command to executeCommand().
```

## Scenario: Binding-Derived Interaction Help

### 1. Scope / Trigger

- Trigger: listing executable mouse bindings or projecting help for Command surfaces.
- Interaction Binding remains the trigger owner; Command Metadata supplies only the action description.

### 2. Signatures

- Binding list record: `{ id: string, target: string, trigger: CanonicalMouseTrigger, action: { command: string } }`.
- Preload operation: `listInteractionBindings() -> Promise<BindingRecord[]>`.
- Renderer projection: `getInteractionHelp(targetCommand, commands, bindings) -> Array<{ label: string, description: string }>`.

### 3. Contracts

- Command manifests contain no trigger/help rows. Command Registry validates required presentation strings and returns the fixed defensive Command shape.
- `InteractionManager.listBindings()` is a read-only projection over `BindingStorage.load()` and preserves normalized storage order.
- The renderer selects bindings by `binding.target === targetCommand.id`, resolves `binding.action.command` against loaded Command Metadata, and uses that action Command's `description`.
- Trigger labels are generic: canonical modifiers render in `Ctrl`, `Shift`, `Alt` order followed by `Click` or `Right Click`.
- Palette and Settings call the same pure projection. No layer infers a Capability ID or changes execution routing.

### 4. Validation & Error Matrix

- Missing/malformed Command `description`, `category`, or `icon` -> fail during Command loading.
- Missing action Command metadata -> omit that help row; execution retains its existing unknown-Command error.
- Empty bindings or no bindings for the target -> return `[]`; UI uses the target Command description as the generic hint.
- Malformed bindings remain BindingStorage errors and do not move validation into the renderer.

### 5. Good/Base/Bad Cases

- Good: remapping a target binding to another registered Command changes the displayed description without editing renderer or target Command metadata.
- Base: the default marker binding renders `Click` plus `Add marker at current frame`.
- Good: `SHIFT` plus right click renders `Shift + Right Click` in the same order as normalized storage.
- Bad: copying triggers into a Command manifest or adding a Command-id-specific help table.
- Bad: returning BindingStorage or Command Registry objects through preload instead of plain records.

### 6. Tests Required

- Assert left/right labels, canonical modifier order, remapped action Commands, empty bindings, unresolved action Commands, defensive listing, and unchanged Command ID -> Capability ID mapping.
- Assert standalone and Workflow Integration compose the same `interactions:list` preload/IPC operation.

### 7. Wrong vs Correct

#### Wrong

```javascript
const help = command.id === "timeline.addMarker"
  ? [{ label: "Click", description: command.description }]
  : [];
```

#### Correct

```javascript
const help = getInteractionHelp(command, commands, bindings);
// Bindings own triggers; action Command Metadata owns descriptions.
```

---

## Scenario: Managed Python Runtime Distribution

### 1. Scope / Trigger

- Trigger: packaging a managed Python payload or routing a production Python Capability through it.

### 2. Signatures

- Manager: `RuntimeManager.execute({ runtime, capabilityId, entry, commandId, config }) -> ScriptEnvelope`.
- Lock: `{ runtimeVersion, platform, architecture, asset, license, sigstore, spdx, releaseStatus }`, with every remote input carrying an HTTPS URL and SHA-256.
- Packaged metadata: `{ id, runtimeVersion, architecture, executable, assetSha256, releaseStatus, stagedPaths, provenance }` in `runtime.json`.

### 3. Contracts

- Production Python Features route through `PythonProvider -> RuntimeManager -> RuntimeResolver -> RuntimeProbe/cache -> RuntimeLauncher`; only `RuntimeLauncher` starts the process.
- Hosts supply a canonical live Resolve version. Feature, Capability, Provider, and Manifest code never invent one.
- Managed selection and executable-only Override are authoritative and never search `PATH`, Conda, uv, virtual environments, Store aliases, or the legacy bridge command.
- Resolve-dependent scripts execute only after a successful success-only cached Probe. Fingerprint changes, failures, and native crashes require a new Probe; business execution is never retried.
- Bootstrap `script-execute` validates a relative entry under its canonical staged root and returns the existing nested script envelope. `ScriptContext`, log records, script errors, and JSON results stay compatible.
- Windows staging verifies the committed lock before extraction, disables ambient `site`, copies production Python sources, and emits Runtime/license/Sigstore/SPDX/application-SBOM inventory.
- Electron packages the Runtime outside asar at `process.resourcesPath/runtimes`.

### 4. Validation & Error Matrix

- Missing/malformed host version -> `RESOLVE_VERSION_UNVERIFIED` before Manifest selection or launch.
- Missing payload or invalid authoritative Override -> existing typed Resolver failure without Manifest or PATH fallback.
- Probe failure/native crash -> typed Probe error; no business launch, reusable failure cache, or retry.
- Invalid script request/envelope -> `RUNTIME_REQUEST_INVALID` / `RUNTIME_PROTOCOL_INVALID`.
- Malformed lock, missing asset, hash mismatch, unsafe staging target, incomplete payload, SBOM failure, or artifact mismatch -> build/package failure before release.
- `releaseStatus` remains `candidate` until packaged identity, live Probe miss/hit, Workflow Integration launch, and real Export-to-AE send all pass; patch-family inference is forbidden.

### 5. Good/Base/Bad Cases

- Good: a hostile parent Python environment still executes the single locked packaged interpreter outside asar.
- Base: automated package checks pass while live Resolve is absent; retain `candidate` and report the live gate as blocked.
- Bad: promote a CPython patch release from version-family assumptions, retry another profile, or use system Python after any managed failure.

### 6. Tests Required

- Assert Manager order is Resolve -> Probe/cache -> one execution launch and preserves ScriptContext/log/error/result contracts.
- Assert malformed Override, host context, lock, hashes, staging paths, payloads, and envelopes fail closed.
- Stage/package the locked Runtime, inventory exactly one interpreter plus notices/SBOM, and execute it under hostile Python environment variables.
- Record separate live evidence for Probe miss/hit, Workflow Integration launch, and the real Export-to-AE send before promotion.

### 7. Wrong vs Correct

#### Wrong

```javascript
spawn("python", [entry]); // PATH-selected and unprobed
```

#### Correct

```javascript
await runtimeManager.execute({ runtime: "python", capabilityId, entry, commandId, config });
```

---

## Forbidden Patterns

- Machine-specific absolute paths in startup scripts.
- Running Resolve scripting logic outside `resolve/`.
- Storing execution backend names or keyboard shortcuts in command manifests.
- Falling back to another backend after execution has started.
- Sending executable code over local HTTP; send command ids only.

---

## Required Patterns

- Bind local bridge servers to `127.0.0.1`.
- Validate JSON payload shape at the HTTP boundary.
- Keep Resolve command dispatch in one handler table.
- Keep command-engine dispatch generic and register capabilities from each host.
- Delegate every Resolve scripting action to `resolve/adapter.js` or `resolve/adapter.py`.
- Route command intent through the capability registry before selecting an execution adapter.
- Treat configured shortcuts and executable shortcuts as separate states.
- Make ports, app roots, launch commands, and dev origins configurable through environment variables.

---

## Testing Requirements

- Run `python -m py_compile` for changed Python bridge or startup scripts.
- Run available build/check commands for any caller that depends on the bridge contract.
- Record unresolved live-Resolve validation gaps when the environment cannot run Resolve.

---

## Code Review Checklist

- New bridge request fields have documented validation and error behavior.
- Resolve handler additions are registered in `COMMAND_HANDLERS`.
- Resolve scripting calls are contained under `resolve/`; command-engine and transport layers contain only command ids and delegation.
- Command manifests expose `capability`, not an execution backend.
- Capability tests prove both priority fallback and no fallback after execution begins.
- Startup scripts are idempotent or tolerate existing bridge/app instances.
- No `__pycache__`, `.pyc`, or build cache files are left as source changes.
