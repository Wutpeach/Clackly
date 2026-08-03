# Research: Phase 6.5B isolated runtime launcher

- Query: Determine the smallest repository-native design for `RuntimeLauncher`, `RuntimeEnvironment`, `RuntimeProcessResult`, Runtime execution errors, and a Python Bootstrap `runtime-info` protocol, including Windows environment isolation, JSON framing, timeout/kill behavior, bounded output, crash diagnostics, temporary-directory cleanup, cross-platform workers, test discovery, affected files, and validation.
- Scope: mixed (repository evidence, current Windows machine probes, official Node/Python/Windows documentation)
- Date: 2026-08-03

## Findings

### Executive recommendation

Keep Phase 6.5B beside the existing metadata boundary and independent of production execution:

```text
RuntimeResolver.resolve(request)
  -> resolution { absolute executable, source, supportStatus, profile }
  -> RuntimeLauncher.execute({ resolution, request })
       -> explicit RuntimeEnvironment
       -> one short-lived child + one temporary working directory
       -> Python Bootstrap over stdin/stdout JSON-to-EOF
       -> { result, process: RuntimeProcessResult } | RuntimeError

PythonProvider remains unchanged and does not call RuntimeLauncher in 6.5B.
```

The minimum product surface is two JavaScript modules plus the Bootstrap: `runtime/environment.js`, `runtime/launcher.js`, and `runtime/bootstrap.py`. `RuntimeEnvironment` and `RuntimeProcessResult` should be plain records/functions, not classes; the repository has no type system or behavior that justifies four class hierarchies. `RuntimeLauncher` is the only stateful owner because it owns limits, process creation, timers, and lifecycle. Reuse the existing `RuntimeError` unchanged and emit exact execution codes from the Launcher instead of adding subclasses or a constants module used once.

This phase should not edit `PythonProvider`, `python_runner.py`, `registerScriptCapabilities`, `RuntimeResolver`, the Manifest, either host, Resolve/Resolve2AE, Feature/UI, or package scripts. Production integration remains a later phase.

### Repository evidence: current ownership and gaps

- Phase 6.5A already returns only an absolute canonical regular file from a successful Manifest/Override resolution (`resolve-command-center/script-runtime/runtime/resolver.js:123-148,151-188`). It never launches a process or searches PATH (`.trellis/spec/backend/quality-guidelines.md:219-226`). The launcher should accept that whole resolution record, not a bare executable string, and recheck the file immediately before spawn to close the selection-to-launch race.
- The current error owner is one small `RuntimeError` with `code`, nullable `supportStatus`, and defensive `details` (`resolve-command-center/script-runtime/runtime/errors.js:1-11`). It already accepts stable codes, so Launcher can reuse it unchanged instead of adding subclasses or constants.
- `PythonProvider` is the only current `node:child_process` owner in Script Runtime (`resolve-command-center/script-runtime/providers/PythonProvider.js:1-3,65-71`). It uses `shell: false`, three pipes, one JSON request on stdin, and one JSON response on stdout (`:51,67-71,90-100,142`). Those transport choices are reusable.
- `PythonProvider` currently accumulates unbounded UTF-8 strings, has no timeout/kill path, exposes no signal argument from `close`, has no temporary working directory, and inherits the full parent environment because it omits `env` (`resolve-command-center/script-runtime/providers/PythonProvider.js:54-83`). Its tests use a fake EventEmitter child and cover spawn/error/exit/protocol handling, but not real timeout, kill, output limits, signals, native crashes, environment isolation, or cleanup (`resolve-command-center/script-runtime/providers/PythonProvider.test.js:21-40,106-140`). Phase 6.5B should establish the new launcher separately rather than expanding this production provider.
- The existing Python runner already reserves real stdout for exactly one JSON envelope and consumes one JSON value through stdin EOF (`resolve-command-center/script-runtime/python_runner.py:122-140`). The Bootstrap can reuse that framing without sharing feature-runner code or importing Resolve.
- One subprocess per request is already the project contract and pools are explicitly deferred (`.trellis/spec/backend/quality-guidelines.md:137-144`; archived Phase 6 design `:75-86`).
- Temporary test roots use `fs.mkdtempSync(path.join(os.tmpdir(), "clackly-...-"))` and `fs.rmSync(..., { recursive: true, force: true })` in `runtime.test.js:11-15`, `PythonProvider.test.js:10-18`, and `integration.test.js:14-18,76-78`. Reuse that built-in pattern; no temp dependency exists.
- The only existing case-insensitive Windows environment lookup is `findEnvironmentValue()` (`resolve-command-center/capability/afterEffectsPath.js:44-49`). The new environment builder can reuse the same narrow algorithm locally; promoting a shared general helper for two short callers is not yet justified.
- `windowsHide: true` is already used for Windows subprocess discovery (`resolve-command-center/capability/afterEffectsPath.js:20-25`). The launcher should use it together with `shell: false`.

### Recommended contracts (not yet repository facts)

#### `RuntimeEnvironment`

Export one pure function so policy can be tested without spawning:

```text
createRuntimeEnvironment({ parentEnvironment, temporaryDirectory, platform })
  -> plain child environment object
```

For Windows, the exact recommended output is:

```text
SystemRoot = case-insensitive parent SystemRoot (required input)
WINDIR     = case-insensitive parent WINDIR, or SystemRoot
TEMP       = the per-launch temporary directory
TMP        = the per-launch temporary directory
```

This is the minimal operational set for this Bootstrap, not a claim that Windows `CreateProcessW` intrinsically needs four variables. The executable and Bootstrap paths are absolute; `shell: false` means `ComSpec` is unnecessary; the Windows DLL loader checks the executable directory, Known DLLs, and the system directory without requiring PATH. `TEMP`/`TMP` are launcher-owned values, not preserved parent values. `PATH`, `PATHEXT`, `ComSpec`, `USERPROFILE`, `HOMEDRIVE`, `HOMEPATH`, `APPDATA`, `LOCALAPPDATA`, `PROGRAMDATA`, processor metadata, and all unrelated variables should be absent.

On non-Windows test hosts, the corresponding minimum is only `TMPDIR=<temporaryDirectory>`. The Bootstrap writes UTF-8 bytes itself, so it does not need inherited locale variables. Do not spread `process.env` and delete a blacklist: an allowlist is the only way to meet the PRD's exclusion of unrelated variables. Windows names must be read case-insensitively and emitted once in canonical casing because Node documents case-insensitive Windows environment keys and can otherwise select only one duplicate.

The explicit allowlist automatically excludes all required forbidden variables: `PYTHONHOME`, `PYTHONPATH`, `PYTHONUSERBASE`, `PYTHONSTARTUP`, `VIRTUAL_ENV`, `CONDA_PREFIX`, `CONDA_DEFAULT_ENV`, `CONDA_PYTHON_EXE`, and `UV_PYTHON`. It also excludes other unrequested `PYTHON*` variables. Invoke Python with `-I` as a second native isolation layer; Python documents that isolated mode implies `-E`, `-P`, and `-s`.

#### `RuntimeLauncher`

Recommended public shape:

```text
new RuntimeLauncher({
  bootstrapPath?,
  timeoutMs?,
  maxStdoutBytes?,
  maxStderrBytes?,
  fileSystem?,
  spawnProcess?,
  platform?,
  temporaryRoot?
}).execute({
  resolution,
  request
}) -> Promise<{ result: JSONValue, process: RuntimeProcessResult }>
```

Rules:

1. Require a plain Resolver-shaped `resolution` with `source` equal to `manifest` or `override` and an absolute, canonical, existing regular-file `executable`. Reject bare/relative/missing/non-file values before creating a temporary directory or spawning. Structural validation is sufficient; importing or branding a `RuntimeResolver` instance would add coupling without proving provenance.
2. Require a JSON-serializable plain request. Create one temporary directory, then launch exactly `resolution.executable` with fixed arguments `-I`, `-u`, `-X`, `faulthandler`, and the absolute Bootstrap path. No request field enters argv.
3. Use `{ shell: false, windowsHide: true, cwd: temporaryDirectory, env: createRuntimeEnvironment(...), stdio: ["pipe", "pipe", "pipe"] }`.
4. Serialize once with `JSON.stringify`, send UTF-8 through `child.stdin.end()`, and delimit the request by EOF. Read stdout/stderr to EOF and parse stdout once after `close`. Do not use JSONL, a length prefix, command-line JSON, or streaming protocol: there is exactly one request and response per child.
5. Capture Buffer chunks and count bytes before decoding. Retain at most each stream's configured limit, record the stream that overflowed, kill immediately, and wait for `close`. `String.length` is not a byte bound and can undercount UTF-8.
6. Start the timeout after a child object is returned. On timeout or output overflow, call `child.kill("SIGKILL")` and do not settle or remove the working directory until `close`, which Node documents as occurring after stdio closes. A short-lived, stateless Bootstrap has no graceful shutdown state to preserve. This avoids a second grace timer and is forceful on both supported Windows and POSIX test hosts.
7. Record spawn and stdin errors but finalize once. A non-zero exit/signal should dominate a racing `EPIPE`; otherwise report the stored stdin failure. Reject a synchronous spawn throw immediately after cleanup. Do not retry another runtime.
8. Remove the temporary directory in one finalizer after `close` for success, protocol failure, exit, signal, timeout, and output overflow; also finalize after synchronous/asynchronous spawn failure. Cleanup failure must be reported: if it is the only failure, throw `RUNTIME_TEMP_CLEANUP_FAILED`; if another failure already exists, retain that primary code and add a bounded `cleanupError` diagnostic.

Do not use `exec`/`execFile` `maxBuffer`: the launcher needs streaming counters so it can stop at a byte limit, distinguish stdout from stderr, retain bounded diagnostics, and kill immediately. Do not use worker pools, retries, process-tree libraries, Job Objects, or a general command runner in this phase.

#### `RuntimeProcessResult`

Use one defensive, JSON-safe plain record; no class is needed:

```json
{
  "exitCode": 0,
  "signal": null,
  "termination": "exit",
  "stdout": "<bounded UTF-8>",
  "stderr": "<bounded UTF-8>",
  "stdoutBytes": 123,
  "stderrBytes": 0,
  "durationMs": 42,
  "nativeCrash": null
}
```

`termination` vocabulary should be `exit`, `signal`, `timeout`, `stdout-limit`, `stderr-limit`, `spawn-error`, or `stdin-error`. For Windows abnormal termination, include `nativeCrash: { exitCodeHex: "0xC0000409" }` when the unsigned exit code is in the NTSTATUS failure range (`>= 0xC0000000`). On POSIX, retain the signal string. Do not assert one exact crash code across platforms. The record belongs on successful returns and under `RuntimeError.details.process`; it is diagnostic evidence, not a second error hierarchy.

#### Runtime execution errors

Extend `RuntimeError` with launcher codes. The smallest distinguishable matrix is:

| Code | Controlled condition | Key diagnostics |
|---|---|---|
| `RUNTIME_LAUNCH_REQUEST_INVALID` | malformed resolution/request/Bootstrap path or non-serializable request | field/type |
| `RUNTIME_EXECUTABLE_INVALID` | bare, relative, missing, or non-file resolved executable | executable/source |
| `RUNTIME_SPAWN_FAILED` | synchronous throw or child `error` before start | OS error code/message |
| `RUNTIME_STDIN_FAILED` | input pipe failure with no more specific child termination | OS error code/message + process |
| `RUNTIME_TIMEOUT` | deadline exceeded | timeoutMs + process |
| `RUNTIME_OUTPUT_LIMIT` | stdout or stderr byte limit exceeded | stream/limit + process |
| `RUNTIME_NATIVE_CRASH` | POSIX fatal signal or Windows NTSTATUS-like exit | signal/code/hex + bounded stderr |
| `RUNTIME_PROCESS_EXITED` | ordinary explicit non-zero exit | exitCode + bounded stderr |
| `RUNTIME_PROTOCOL_EMPTY` | exit 0 with empty/whitespace stdout | process |
| `RUNTIME_PROTOCOL_INVALID` | invalid JSON or invalid envelope | bounded stdout + reason |
| `RUNTIME_BOOTSTRAP_FAILED` | valid `{ ok: false, error }` envelope | Bootstrap error + process |
| `RUNTIME_TEMP_CLEANUP_FAILED` | working directory could not be removed and no earlier failure exists | path + OS error |

`RUNTIME_PROCESS_SIGNALLED` is unnecessary if fatal signals map to `RUNTIME_NATIVE_CRASH`; the signal remains in the process result. `supportStatus` stays `null` for execution failures because the Phase 6.5A compatibility classification has already completed.

### Python Bootstrap `runtime-info` protocol

Use a separate `runtime/bootstrap.py`; do not extend `python_runner.py`, which imports the Resolve adapter and owns feature execution (`python_runner.py:11-15,91-119`). The Bootstrap uses only the Python standard library.

Request, framed by stdin EOF:

```json
{"operation":"runtime-info"}
```

Success, framed by stdout EOF:

```json
{
  "ok": true,
  "result": {
    "version": "3.13.1",
    "architecture": "64bit",
    "executable": "C:\\absolute\\managed\\python.exe"
  }
}
```

Controlled Bootstrap failure:

```json
{
  "ok": false,
  "error": {
    "code": "BOOTSTRAP_REQUEST_INVALID",
    "type": "TypeError",
    "message": "Bootstrap request must be an object"
  }
}
```

Validate a plain object and exact operation. Use `platform.python_version()` for the version, `f"{struct.calcsize('P') * 8}bit"` for architecture, and `os.path.realpath(sys.executable)` for the executable. Pointer width is smaller and more deterministic than `platform.architecture()`, whose documentation notes executable probing behavior. Require the executable result to be absolute/non-empty before emitting success.

Write the envelope once through `sys.stdout.buffer.write(json.dumps(..., allow_nan=False).encode("utf-8"))`; never use `print()` for protocol output. Bootstrap request/operation errors produce `{ ok: false }` and exit normally so the launcher can distinguish a worker-reported failure from transport/process failure. Invalid JSON input is a Bootstrap request failure; invalid/empty output means the worker violated the protocol and is a launcher failure.

### Timeout, kill, and native-crash evidence

- Node's `close` event supplies `(code, signal)` and occurs after the process ended and its stdio streams closed; it is the correct single finalization point. `exit` alone is too early for complete output.
- Node's `kill()` only reports that a signal was sent, not that the child is already dead. Waiting for `close` is required before cleanup or success/failure settlement.
- On Windows, supported kill signal names are implemented as forceful process termination and the reported `signal` may be `null`; therefore diagnostics must retain both code and signal and recognize Windows high-bit status codes.
- Current-machine probe supplied by the main session: an uncaught Python exception exited `1` with a traceback; `os.abort()` exited `3221226505` (`0xC0000409`), reported `signal: null`, produced empty stderr, and did not terminate the Node parent. This proves parent isolation and the need for numeric/hex Windows crash diagnostics; it does not prove one portable crash code. Launching with `-X faulthandler` can provide stderr diagnostics for Python fatal faults when the interpreter is still able to emit them.
- Kill scope is the single worker PID. The Bootstrap does not create descendants. Process-tree termination/Windows Job Objects are out of scope unless later Bootstrap operations intentionally create child processes.

### Windows environment evidence

Repository fact: no current Script Runtime code constructs a child environment; `PythonProvider` inherits all parent variables (`PythonProvider.js:67-71`). The PRD explicitly requires an allowlist and removal of nine Python/virtual-environment variables (`prd.md:18-21`).

Official behavior:

- Node `spawn` accepts an explicit `env` object and otherwise defaults to `process.env`.
- Microsoft `CreateProcessW` accepts a caller-supplied environment block; inheritance occurs when the environment pointer is null. Supplying the absolute application path avoids executable PATH search.
- The standard Windows DLL search order includes the executable folder, Known DLLs, and `%SystemRoot%\System32` before PATH. A repository-managed CPython layout must carry its adjacent runtime DLLs; PATH is neither necessary nor an acceptable fallback.

Current-machine probe supplied by the main session: the absolute PATH-resolved CPython 3.11.15 executable launched successfully with `-I -u`, reported `platform.architecture() == "64bit"`, and saw PATH absent when the child environment was limited to `SystemRoot`, `WINDIR`, `COMSPEC`, `TEMP`, `TMP`, `USERPROFILE`, `HOMEDRIVE`, `HOMEPATH`, `APPDATA`, `LOCALAPPDATA`, and `PROGRAMDATA`. This validates environment isolation mechanics only. It does not validate that interpreter against the Phase 6.5A Resolve 20.3.2 compatibility profile, and it does not establish that every variable in that broader probe is required. The recommended four-key environment above removes the keys unnecessary for the actual no-shell `runtime-info` Bootstrap.

### Cross-platform test-worker strategy

Use three layers, all with built-ins:

1. `runtime-launcher.test.js` unit tests inject an EventEmitter child, filesystem seams, and timers only where needed. Assert exact spawn executable/argv/options, environment allowlist, stdin bytes, close/error races, byte caps, one kill, and cleanup.
2. A single real test worker selected by JSON request covers success, structured exception, explicit non-zero exit, empty output, infinite wait, invalid JSON, stdout flood, stderr flood, and abort. Prefer a tiny JavaScript worker launched with absolute `process.execPath` plus injected interpreter arguments for generic process tests, so timeout/kill/overflow/crash behavior runs on every Node test host without searching Python. Keep all modes in one fixture; do not create seven scripts.
3. `test_runtime_bootstrap.py` tests request/envelope validation directly and uses absolute `sys.executable` to start the real Bootstrap subprocess for `runtime-info`. This proves the real Python protocol without PATH lookup. The Node launcher integration may additionally discover `sys.executable` in test-only setup because the existing package already requires a `python` command, but product launcher/Bootstrap code must contain no such search.

For native abort, assert only that the parent survives and the result is abnormal (`signal` on POSIX or high-bit exit code on Windows). Do not assert Windows `3221226505` on every platform. For timeout/overflow, assert `kill` occurred, `close` was observed, and the temporary directory is gone before the promise rejects.

### Existing test discovery and placement

`resolve-command-center/package.json:12` discovers Node tests only at `script-runtime/*.test.js` and `script-runtime/providers/*.test.js`; it does not include `script-runtime/runtime/*.test.js`. Python discovery uses `python -m unittest discover -s script-runtime -p "test_*.py"`. Therefore:

- place the Node test at `script-runtime/runtime-launcher.test.js`;
- place the Python test at `script-runtime/test_runtime_bootstrap.py`;
- put non-test fixtures under `script-runtime/runtime/fixtures/` if a fixture is needed;
- do not change `package.json` merely to support nested tests.

### Expected affected files

Minimum implementation surface:

- `resolve-command-center/script-runtime/runtime/errors.js` — consume the existing `RuntimeError` unchanged.
- `resolve-command-center/script-runtime/runtime/environment.js` — pure allowlist builder.
- `resolve-command-center/script-runtime/runtime/launcher.js` — executable validation, temp/process ownership, bounded capture, timeout/kill, protocol parsing, result diagnostics.
- `resolve-command-center/script-runtime/runtime/bootstrap.py` — one-operation Python Bootstrap.
- `resolve-command-center/script-runtime/runtime-launcher.test.js` — launcher unit/real-worker tests under the existing Node glob.
- `resolve-command-center/script-runtime/test_runtime_bootstrap.py` — Bootstrap tests under the existing Python glob.
- At most one `resolve-command-center/script-runtime/runtime/fixtures/worker.js` — only if fake-child tests cannot prove real kill/overflow/crash isolation.
- `.trellis/spec/backend/quality-guidelines.md` — later Phase 3 spec update after implementation settles the contract.

Files that should remain unchanged:

- `script-runtime/providers/PythonProvider.js` and its tests;
- `script-runtime/python_runner.py` and its tests;
- `script-runtime/runtime/{loader,registry,resolver}.js`, `runtime.test.js`, and `resources/runtimes/manifest.json` except an import/export only if implementation genuinely needs one;
- Capability/host composition, Resolve, Resolve2AE, Feature/UI, renderer, and `package.json`.

### Validation commands

Run from `resolve-command-center/`:

```powershell
node --test script-runtime/runtime-launcher.test.js script-runtime/runtime.test.js script-runtime/providers/PythonProvider.test.js
python -m unittest discover -s script-runtime -p "test_*.py"
python -m py_compile script-runtime/runtime/bootstrap.py
npm test
npm run build
node --check script-runtime/runtime/environment.js
node --check script-runtime/runtime/launcher.js
rg -n 'spawn|execFile|execSync|where|which|python3|\bpython\b|\bpy\b|process\.env' script-runtime/runtime --glob '!fixtures/**'
rg -n 'PythonProvider|python_runner|registerScriptCapabilities' script-runtime/runtime script-runtime/runtime-launcher.test.js
git diff --check
```

Boundary assertions should additionally inspect captured spawn calls: executable equals the Resolver result's absolute canonical file; argv contains only fixed interpreter flags and Bootstrap path; `shell === false`; PATH and all forbidden variables are absent; request data appears only in stdin.

### Files found

- `.trellis/tasks/08-03-isolated-runtime-launcher-6-5b/prd.md` — Phase 6.5B requirements and acceptance criteria.
- `.trellis/tasks/archive/2026-08/08-03-managed-python-runtime-6-5a/{prd.md,design.md,implement.md,research/current-state.md}` — preceding metadata boundary and explicit launcher handoff.
- `resolve-command-center/script-runtime/runtime/{errors,loader,registry,resolver}.js` — current Managed Runtime implementation.
- `resolve-command-center/script-runtime/runtime.test.js` — resolver/temp-root patterns and existing top-level test placement.
- `resolve-command-center/script-runtime/providers/PythonProvider.js` — current process owner and reusable stdin/stdout/spawn shape.
- `resolve-command-center/script-runtime/providers/PythonProvider.test.js` — current fake-child helper and missing lifecycle cases.
- `resolve-command-center/script-runtime/python_runner.py` and `test_python_runner.py` — existing one-envelope protocol and feature-runner ownership that Bootstrap must not absorb.
- `resolve-command-center/script-runtime/integration.test.js` — real PATH-Python integration and synchronous temp cleanup pattern.
- `resolve-command-center/capability/afterEffectsPath.js` — case-insensitive Windows environment lookup and `windowsHide` precedent.
- `resolve-command-center/package.json` — exact Node/Python test globs and Node-only dependency set.

### External references and versions

- Node.js Child Process API, current documentation: https://nodejs.org/api/child_process.html — explicit `env`, `shell`, `windowsHide`, `error`/`close`, kill, exit code, and signal semantics. Repository runtime used by the prior phase was Node `v22.17.1`; `package.json` has no process-management dependency.
- Microsoft `CreateProcessW`: https://learn.microsoft.com/en-us/windows/win32/api/processthreadsapi/nf-processthreadsapi-createprocessw — absolute application path and caller-supplied environment block behavior.
- Microsoft DLL search order: https://learn.microsoft.com/en-us/windows/win32/dlls/dynamic-link-library-search-order — executable directory, Known DLLs, system folder, and PATH ordering.
- Python command-line/environment docs: https://docs.python.org/3/using/cmdline.html#cmdoption-I and https://docs.python.org/3/using/cmdline.html#environment-variables — isolated mode and Python environment controls.
- Python `platform.architecture()` docs: https://docs.python.org/3/library/platform.html#platform.architecture — reason to prefer pointer width for the required `64bit` value.
- Current Windows machine evidence is CPython 3.11.15 for launcher mechanics only. The Phase 6.5A machine-verified compatibility tuple remains Resolve `20.3.2.9` / bridge `20.3.2` / CPython `3.13.1` x64 (`archive/.../research/current-state.md:213-231`).

### Related specs

- `.trellis/spec/backend/quality-guidelines.md:111-176` — current Script Capability Runtime process/protocol ownership, one-process rule, error matrix, and tests.
- `.trellis/spec/backend/quality-guidelines.md:201-268` — Managed Runtime selection signatures, absolute executable guarantees, no PATH/process lookup, and later integration seam.
- `.trellis/spec/guides/code-reuse-thinking-guide.md` — reuse built-ins/current helpers and avoid abstractions with one consumer.
- `.trellis/spec/guides/cross-layer-thinking-guide.md` — define and validate the JSON/process boundary once.
- `.trellis/spec/backend/error-handling.md`, `directory-structure.md`, and `logging-guidelines.md` remain generic placeholders and add no project-specific launcher rule.

## Caveats / Not Found

- **Resolved task-owner decision:** default to `timeoutMs = 10_000`, `maxStdoutBytes = 1_048_576`, and `maxStderrBytes = 1_048_576`, with constructor overrides for tests and later operational tuning.
- Follow-up current-machine probe: the absolute CPython executable launched successfully with `-I -u -X faulthandler` and an environment containing exactly `SystemRoot`, `WINDIR`, `TEMP`, and `TMP`; it returned version, `64bit`, and its absolute executable with PATH absent. Implementation tests must preserve this four-key contract before it is promoted to spec.
- Node cannot prove a supplied plain object was literally created by `RuntimeResolver`. Accepting the full Resolver-shaped record plus executable revalidation is the smallest enforceable boundary; cryptographic/nominal provenance would be theater.
- Direct PID kill does not terminate descendants. That is sufficient because `runtime-info` creates none. If later Bootstrap operations launch child processes, define a process-tree/Job Object contract in that later phase.
- Cleanup after a process that cannot be killed cannot be made deterministic using only `child.kill`. `SIGKILL`/Windows force termination plus wait-for-`close` covers the current single-worker model; kill failure must remain actionable diagnostics rather than being hidden.
- A Windows NTSTATUS-like high exit code is strong native-crash evidence, not perfect proof. Preserve numeric/hex code, signal, bounded stderr, operation, executable/profile id, duration, and termination reason rather than claiming a universal crash taxonomy.
- The task is complex under Trellis because it changes process lifecycle, environment, protocol, and cross-platform tests. It needs reviewed `design.md` and `implement.md` before activation; this research agent must not create them.
