# Phase 6.5B Isolated Runtime Launcher Design

## Summary

Add an isolated process boundary beside the Phase 6.5A metadata boundary. The Launcher accepts one successful Resolver-shaped record, launches its canonical absolute executable once, exchanges one JSON request/response with a standard-library Python Bootstrap, returns bounded process diagnostics, and always cleans its per-execution working directory.

```text
RuntimeResolver resolution
  -> RuntimeLauncher.execute({ resolution, request })
     -> validate executable + request
     -> create temporary cwd + RuntimeEnvironment
     -> absolute Python -I -u -X faulthandler bootstrap.py
     -> stdin JSON / stdout JSON / bounded stderr
     -> { response, process: RuntimeProcessResult } | RuntimeError
     -> cleanup temporary cwd

PythonProvider and production execution remain unchanged.
```

## Layout

```text
resolve-command-center/script-runtime/
  runtime/
    errors.js                 # reuse existing RuntimeError unchanged
    environment.js            # pure environment allowlist
    launcher.js               # process lifecycle and protocol owner
    bootstrap.py              # runtime-info only
    fixtures/test_worker.py   # test-only failure worker
  runtime-launcher.test.js    # existing Node glob
  test_runtime_bootstrap.py   # existing Python unittest glob
```

No package script or dependency change is required.

## Contracts

### Runtime Environment

```javascript
createRuntimeEnvironment({ parentEnvironment, temporaryDirectory, platform })
```

- Windows output contains exactly canonical `SystemRoot`, `WINDIR`, `TEMP`, and `TMP`. Read Windows parent keys case-insensitively; require `SystemRoot`, let `WINDIR` fall back to it, and set both temp keys to the invocation directory.
- Non-Windows output contains exactly `TMPDIR` set to the invocation directory.
- Do not copy `PATH`, locale, profile, app-data, Python, virtual-environment, Conda, uv, or unrelated variables.
- Return a fresh plain record. The function does not mutate the parent environment.

### Runtime Launcher

```javascript
new RuntimeLauncher({
  bootstrapPath?,
  timeoutMs = 10_000,
  maxStdoutBytes = 1_048_576,
  maxStderrBytes = 1_048_576,
  parentEnvironment = process.env,
  platform = process.platform,
  temporaryRoot?,
  fileSystem?,
  spawnProcess?
}).execute({ resolution, request })
  -> Promise<{ response, process }>
```

- Require a plain resolution with `source: "manifest" | "override"` and an absolute existing regular-file executable. Canonicalize it immediately before spawn and use only that returned path.
- Require a plain JSON-serializable request before creating temp state.
- Validate the absolute regular-file Bootstrap path.
- Create one temporary directory, construct the allowlisted environment, and spawn with fixed argv `[-I, -u, -X, faulthandler, bootstrapPath]`, `shell: false`, `windowsHide: true`, `cwd` equal to the temp directory, and three pipes.
- Serialize the request once to stdin and delimit by EOF. No request value enters argv.
- Accumulate Buffer chunks, track actual byte counts, retain at most each configured stream limit, and decode UTF-8 only after close.
- Start the timeout only after spawn returns a child. The first timeout/stream overflow sets the termination reason, kills once with `SIGKILL`, and waits for `close` before finalization.
- Record synchronous/asynchronous spawn and stdin errors without double settlement. A non-zero exit/signal dominates a racing stdin error; otherwise surface stdin failure.
- Parse stdout only after exit code 0. Empty, invalid JSON, invalid envelope, and valid `ok: false` Bootstrap responses remain distinct errors.
- Remove the temp directory once in the finalizer after close or spawn failure. If cleanup is the only failure, throw its typed error; otherwise preserve the primary code and append bounded cleanup diagnostics.
- Never retry, select another profile, search PATH, invoke a shell, or launch `PythonProvider`.

### Runtime Process Result

```javascript
{
  exitCode: number | null,
  signal: string | null,
  termination: "exit" | "signal" | "timeout" | "stdout-limit" |
    "stderr-limit" | "spawn-error" | "stdin-error",
  stdout: string,
  stderr: string,
  stdoutBytes: number,
  stderrBytes: number,
  durationMs: number,
  nativeCrash: null | { exitCodeHex: string }
}
```

The record is a defensive JSON-safe plain object. Successful calls return it as `process`; failed calls attach it at `RuntimeError.details.process`. Windows unsigned exit codes at or above `0xC0000000` include uppercase eight-digit hex; an uninitiated POSIX signal is a native crash without inventing a numeric code.

### Runtime Execution Errors

Keep the existing `RuntimeError` and add stable codes:

| Code | Condition |
|---|---|
| `RUNTIME_LAUNCH_REQUEST_INVALID` | malformed resolution/request/Bootstrap path or non-serializable request |
| `RUNTIME_EXECUTABLE_INVALID` | bare, relative, missing, or non-file executable |
| `RUNTIME_SPAWN_FAILED` | synchronous throw or child spawn error |
| `RUNTIME_STDIN_FAILED` | input pipe failure without a more specific termination |
| `RUNTIME_TIMEOUT` | 10-second/default or injected deadline exceeded |
| `RUNTIME_OUTPUT_LIMIT` | stdout or stderr byte limit exceeded |
| `RUNTIME_NATIVE_CRASH` | uninitiated signal or Windows NTSTATUS-like exit |
| `RUNTIME_PROCESS_EXITED` | ordinary explicit non-zero exit |
| `RUNTIME_PROTOCOL_EMPTY` | exit 0 with empty/whitespace stdout |
| `RUNTIME_PROTOCOL_INVALID` | invalid JSON or invalid response envelope |
| `RUNTIME_BOOTSTRAP_FAILED` | valid structured `ok: false` response |
| `RUNTIME_TEMP_CLEANUP_FAILED` | cleanup is the only failure |

Execution errors retain `supportStatus: null`; compatibility classification already occurred in Phase 6.5A.

## Python Bootstrap Protocol

Request through stdin EOF:

```json
{"operation":"runtime-info"}
```

Success through stdout EOF:

```json
{
  "ok": true,
  "runtime": {
    "version": "3.13.1",
    "architecture": "64bit",
    "executable": "C:\\absolute\\managed\\python.exe"
  }
}
```

Controlled failure:

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

Bootstrap uses only `json`, `os`, `struct`, and `sys`; validates one plain dict and exact operation; derives the dotted version from `sys.version_info`, architecture from pointer width, and executable from real `sys.executable`; and writes one UTF-8 envelope without `print()`. Controlled request/operation failures exit 0 with `ok: false`; unexpected native/process failures remain observable to the Launcher.

## Test Worker and Strategy

One Python fixture selects behavior only from stdin JSON:

- success -> valid success envelope;
- python-exception -> caught exception as valid `ok: false`;
- nonzero -> explicit exit without a valid response;
- empty -> exit 0 without stdout;
- wait -> sleep beyond injected timeout;
- invalid-json -> malformed stdout;
- stdout-flood / stderr-flood -> exceed the injected byte cap;
- abort -> `os.abort()`.

Node tests may resolve the repository test runner's Python to an absolute `sys.executable` in test-only setup; every Launcher spawn assertion still requires the absolute value and forbids search commands. Python unit tests use their already-absolute `sys.executable` for the real Bootstrap.

Cover fake-child event races plus real worker success, exception, exit, timeout, overflow, protocol, abort, cleanup, and isolated environment. Assert only abnormal signal/high-bit status for abort, not one platform-specific code.

## Compatibility and Boundaries

- Phase 6.5A APIs and Manifest remain unchanged.
- `PythonProvider`, `python_runner.py`, `registerScriptCapabilities`, both hosts, Resolve, Resolve2AE, Feature/UI, and renderer remain unchanged.
- The current real Manifest still has no bundled executable. Tests use a temporary Resolver-shaped Override resolution; runtime packaging remains later work.
- Phase 6.5C may use this Launcher for a Resolve bridge Probe. Production Provider switching remains a later explicit phase.

## Risks and Rollback

- Direct PID kill does not terminate descendants; Bootstrap creates none. Add process-tree/Job Object ownership only if a future operation intentionally spawns children.
- High Windows exit codes are evidence, not a universal crash taxonomy; preserve raw numeric/hex code, signal, bounded streams, duration, source, and profile id.
- Rollback deletes the new environment/launcher/Bootstrap/tests. The existing `RuntimeError` module, production wiring, persisted data, and packaged payload state remain unchanged.
