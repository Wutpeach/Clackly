# Phase 6.5B Isolated Runtime Launcher

## Goal

Establish a controlled, short-lived Python subprocess launcher that uses only an absolute executable returned by the Phase 6.5A Runtime Resolver. Native worker crashes, malformed output, timeouts, and process failures must become structured launcher failures without crashing the Clackly main process.

## Background

- Phase 6.5A provides Runtime Manifest, Registry, Resolver, authoritative Override, typed errors, and absolute executable resolution without changing `PythonProvider`.
- The current `PythonProvider` uses one subprocess and stdin/stdout JSON, but inherits the parent environment and has no timeout, output bound, signal/native-crash diagnostics, or isolated temporary directory.
- Phase 6.5B establishes a separate Launcher and Bootstrap contract before production provider integration.

## Requirements

- Add `RuntimeLauncher`, `RuntimeEnvironment`, `RuntimeProcessResult`, and stable Runtime execution error codes under the Managed Runtime boundary.
- Add a Python Bootstrap protocol supporting `runtime-info` and returning `{ "ok": true, "runtime": { "version", "architecture": "64bit", "executable" } }`.
- Launch only the absolute executable in a Resolver-shaped resolution record; revalidate it as an existing regular file immediately before spawn.
- Never invoke or search for `python`, `python3`, `py`, `where python`, or `which python`.
- Build an explicit child environment instead of copying or subtracting from `process.env`.
- Always exclude `PATH`, `PYTHONHOME`, `PYTHONPATH`, `PYTHONUSERBASE`, `PYTHONSTARTUP`, `VIRTUAL_ENV`, `CONDA_PREFIX`, `CONDA_DEFAULT_ENV`, `CONDA_PYTHON_EXE`, `UV_PYTHON`, and unrelated parent variables.
- On Windows pass only `SystemRoot`, `WINDIR`, and launcher-owned `TEMP`/`TMP`; on non-Windows pass only launcher-owned `TMPDIR`.
- Use fixed isolated interpreter flags, `shell: false`, a per-execution temporary working directory, and one short-lived worker per request.
- Send one JSON request through stdin EOF and read one JSON response through stdout EOF; request payload fields must never enter argv.
- Default to a 10-second timeout and separate 1 MiB stdout/stderr limits, with constructor overrides for testing and later operational tuning.
- Capture bounded stdout/stderr, byte counts, exit code, signal, termination reason, duration, spawn/stdin failures, protocol failures, Bootstrap failures, and native-crash evidence.
- On timeout or output overflow, forcefully terminate the single worker, wait for process close, and then clean up its temporary directory.
- Clean up the temporary directory after success, failure, timeout, output overflow, spawn failure, or crash; report cleanup failures without hiding the primary failure.
- Add one test worker covering normal success, structured Python exception, explicit non-zero exit, empty output, infinite wait, invalid JSON, excessive stdout, excessive stderr, and native abort.

## Acceptance Criteria

- [ ] Launcher rejects malformed Resolver records and bare, relative, missing, or non-file executables before spawn.
- [ ] Captured spawn calls use only the canonical absolute resolved executable, fixed Bootstrap arguments, `shell: false`, and no PATH/search command.
- [ ] Child environment contains exactly the platform allowlist and excludes every forbidden Python/virtual-environment variable plus unrelated parent variables.
- [ ] The real Bootstrap succeeds with the isolated environment and returns structured version, `64bit` architecture, and absolute executable data.
- [ ] Complex request data is sent through JSON stdin and never interpolated into the command line.
- [ ] Normal success returns the Bootstrap response plus a defensive `RuntimeProcessResult`.
- [ ] Structured Python exception, explicit non-zero exit, empty output, timeout, invalid JSON/envelope, stdout/stderr overflow, spawn/stdin error, signal, and Windows native status produce distinguishable typed errors with bounded diagnostics.
- [ ] Timeout and output-limit handling kill the worker once, wait for close, and leave no live child process.
- [ ] Temporary directories are removed before resolution/rejection after every terminal path; cleanup failure is typed and does not erase a prior error.
- [ ] An `os.abort()` test worker terminates abnormally while the Node parent and remaining tests continue.
- [ ] Existing Runtime Resolver, Script Runtime, `PythonProvider`, Capability/host composition, Resolve, and Resolve2AE behavior remain unchanged.
- [ ] Focused launcher/Bootstrap tests, full Node/Python tests, Python compilation, production build, syntax, whitespace, and no-PATH boundary checks pass.

## Out of Scope

- Resolve native bridge Probe or Probe Cache.
- Switching or modifying production `PythonProvider` execution.
- Resolve2AE integration or regression validation.
- Runtime download, installation, updating, packaging, or payload bundling.
- Long-lived workers, worker pools, retries, graceful cancellation, process-tree termination, Windows Job Objects, or fallback to another runtime/backend.

## Key Decisions

- `RuntimeLauncher.execute({ resolution, request })` accepts the whole Resolver-shaped record and revalidates its executable; nominal/cryptographic provenance is unnecessary.
- Python starts with fixed `-I -u -X faulthandler <absolute-bootstrap>` arguments. `-I` supplements, but does not replace, the explicit environment allowlist.
- Bootstrap framing is one JSON value per stdin/stdout EOF. JSONL, streaming, length prefixes, command-line payloads, and shared workers add no value for one short request.
- `RuntimeProcessResult` is a defensive JSON-safe record, and the existing `RuntimeError` gains stable execution codes; no new error subclass hierarchy is introduced.
- Timeouts and overflow use immediate `SIGKILL`/Windows force termination because the Bootstrap is stateless and creates no descendants.
- Defaults are 10 seconds and 1 MiB per stream, as approved by the task owner; constructor overrides are the only initial tuning seam.
- Current-machine probes verified the four-key Windows environment and parent survival after `os.abort()`. These prove Launcher mechanics, not Resolve/Python ABI compatibility.
