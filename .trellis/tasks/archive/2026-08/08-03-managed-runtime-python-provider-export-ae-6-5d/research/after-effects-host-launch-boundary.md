# Research: After Effects host-launch environment boundary

- Query: What is the smallest correct fix for After Effects inheriting the Managed Python worker's isolated environment, while preserving the Runtime allowlist/no-PATH/no-Conda contract and the exact six-public-name `ScriptContext`?
- Scope: mixed
- Date: 2026-08-04

## Findings

### Root cause and complete current flow

The regression is at the nested-process boundary, not in Runtime selection. `RuntimeLauncher` deliberately constructs a Windows environment containing only `SystemRoot`, `WINDIR`, `TEMP`, and `TMP` (`script-runtime/runtime/environment.js:1-28`) and starts Managed Python with that environment (`script-runtime/runtime/launcher.js:349-369`). Python's `subprocess.Popen` inherits the current process environment when `env` is omitted, so both After Effects launches in `resolve2ae_core/export.py:1015-1038` inherit the four-variable Runtime environment. That removes desktop-user locations used for preferences and CEP state, matching the observed preferences readability/writability and CEP-load failures.

Two adjacent failures are part of the same boundary:

1. `get_running_ae_path()` invokes bare `powershell` and `wmic` (`resolve2ae_core/export.py:60-78`). With no `PATH`, running-AE detection is not dependable and silently falls through because both errors are swallowed.
2. `process_and_send()` writes JSX under `tempfile.gettempdir()` (`resolve2ae_core/export.py:571-577`). In Managed Python that is the launcher's private per-run directory, and the launcher recursively removes it before resolving to JavaScript (`script-runtime/runtime/launcher.js:301-312`). Cold-start AE waits three seconds before reading the JSX (`resolve2ae_core/export.py:1021-1037`), so the referenced file can be deleted before AE reads it.

The callers are:

`Command -> capability/script.js -> ScriptCapabilityProvider -> ScriptExecutor -> PythonProvider -> RuntimeManager -> RuntimeLauncher -> bootstrap.py -> python_runner.py -> scripts/resolve2ae_export.py -> resolve2ae_core.process_and_send -> AfterFX.exe`.

The two production compositions are `electron/main/main.js:45-63` and `workflow-plugin/main.js:125-146`. Both already run as the interactive Electron user and therefore already own the correct desktop environment. `RuntimeManager` currently sends only the public script inputs (`entry`, `commandId`, `config`) and returns the nested script envelope (`script-runtime/runtime/manager.js:144-160`). `python_runner.py:39-69` exposes exactly the six public names `command_id`, `config`, `logger`, `resolve`, `project`, and `timeline`; the exact-name regression is in `script-runtime/test_python_runner.py:35-66`.

### Recommended design: a host-owned, post-worker AE launch

Keep `RuntimeLauncher` unchanged. Managed Python should prepare Resolve/JSX output and return one declarative launch plan; `RuntimeManager`, back in the Electron host, should validate that plan, launch the configured `AfterFX.exe` without an `env` option (Node therefore inherits the Electron host's complete desktop environment), and remove the private plan before returning the existing script envelope to `PythonProvider`.

This is the smallest boundary that is correct rather than heuristic:

- Runtime selection, Probe, and Python execution remain isolated and PATH-free.
- No desktop environment, PATH, Conda, credentials, or unrelated host state is serialized into Managed Python.
- The process that owns the desktop environment launches the desktop GUI.
- ScriptContext remains byte-for-byte at six public names; no Context attribute or config key is added.
- The externally observed successful result remains `{ ok, code, mode, clip_count, message }`.
- The existing configured `ae.export.aePath` remains the only executable permitted.

Do not add a generic action framework. Support one optional internal field on the successful Bootstrap script envelope:

```json
{
  "ok": true,
  "result": { "ok": true, "code": "exported", "mode": "auto", "clip_count": 1, "message": "Sent 1 Clips" },
  "logs": [],
  "hostLaunch": {
    "kind": "after-effects",
    "executable": "C:\\Program Files\\Adobe\\...\\AfterFX.exe",
    "arguments": ["-r", "C:\\Users\\...\\Temp\\clackly-ae-...\\ToAE_....jsx"]
  }
}
```

Cold start uses `arguments: []` after Python writes the existing Startup bootstrap; warm start uses exactly `arguments: ["-r", jsxPath]`. No shell command, command line string, working-directory override, environment map, or arbitrary option crosses the protocol.

The feature can return one reserved internal wrapper, and `bootstrap.py` alone unwraps it into `script.result` plus `script.hostLaunch`. Ordinary feature returns remain untouched, and `python_runner.py` needs no change:

```json
{
  "__clacklyHostLaunch": { "kind": "after-effects", "executable": "...", "arguments": [] },
  "result": { "ok": true, "code": "exported", "mode": "auto", "clip_count": 1, "message": "Sent 1 Clips" }
}
```

`RuntimeManager` is the single validation/consumption boundary. Before spawning it must require all of the following:

- request `capabilityId === "ae.export"`;
- `kind === "after-effects"` and no unknown launch fields;
- canonical launch executable equals canonical `request.config.aePath`;
- arguments are exactly `[]` or exactly `["-r", absoluteJsxPath]`;
- the JSX is a regular `.jsx` file contained beneath the host-owned temporary directory supplied for this execution;
- exactly one launch plan; failures never retry or fall back.

Launch with Node `spawn(canonicalExecutable, arguments, { shell: false, windowsHide: false, stdio: "ignore" })`, deliberately omit `env`, wait for either the `spawn` or `error` event, then `unref()`. Map failure to one typed `HOST_LAUNCH_FAILED` error with bounded diagnostics. Do not report `exported` when host launch fails.

### Host-owned temporary path

Both Electron compositions should pass `app.getPath("temp")` into `RuntimeManager`. The Manager validates/canonicalizes that directory and includes it as an internal `hostTemporaryDirectory` field in the Bootstrap request. `bootstrap.py` validates it as an existing absolute directory and scopes `tempfile.tempdir` to it only while executing the feature, restoring the previous value afterward. This changes neither `os.environ` nor ScriptContext and ensures the JSX outlives RuntimeLauncher's cleanup. The JSX's existing self-delete and the cold-start bootstrap's existing self-delete remain the cleanup mechanism.

For Windows running-process detection, replace bare `powershell`/`wmic` fallback with the absolute inbox Windows PowerShell path derived from the allowlisted `WINDIR` (`System32/WindowsPowerShell/v1.0/powershell.exe`). This read-only detection can remain in Python; it needs no PATH or desktop environment. Remove the obsolete `wmic` fallback rather than adding another lookup mechanism.

### Exact affected files

- `resolve-command-center/script-runtime/runtime/manager.js` — own host temp input, validate/consume the single `hostLaunch`, invoke absolute `AfterFX.exe` with inherited Electron environment, strip `hostLaunch`, and preserve the old returned script envelope.
- `resolve-command-center/script-runtime/runtime/bootstrap.py` — validate/scope `hostTemporaryDirectory`; unwrap only the exact reserved AE feature wrapper into the internal envelope field.
- `resolve-command-center/scripts/resolve2ae_export.py` — request deferred launch from the core and return the reserved wrapper while retaining the existing public result.
- `resolve-command-center/resolve2ae_core/export.py` — allow the production entry to collect argv instead of calling `Popen`; keep direct/default behavior for existing standalone core callers; use host temp and an absolute Windows PowerShell path.
- `resolve-command-center/electron/main/main.js` and `resolve-command-center/workflow-plugin/main.js` — pass `app.getPath("temp")` at host composition.

No change is needed in `runtime/environment.js`, `runtime/launcher.js`, `PythonProvider.js`, `python_runner.py`, `ScriptCapabilityProvider.js`, `ScriptExecutor.js`, capability metadata/config schema, or public docs/result schemas except documenting the corrected internal launch boundary.

### Tests to add or update

- `script-runtime/runtime-manager.test.js`: valid warm/cold plan launches only after Resolve -> Probe -> worker; executable must equal configured `aePath`; JSX must be contained under host temp; malformed/extra fields, shell-like arguments, traversal, missing file, non-AE capability, and spawn error fail without retry. Assert spawn options omit `env`, use `shell:false`, `windowsHide:false`, `stdio:"ignore"`, and returned envelope has no `hostLaunch`.
- `script-runtime/test_runtime_bootstrap.py`: normal script envelope remains exact; reserved wrapper becomes `script.hostLaunch`; malformed wrapper is controlled; scoped host temp is visible through `tempfile.gettempdir()` during execution and restored afterward.
- `scripts/test_resolve2ae_export.py`: all four commands preserve the exact public result while producing the internal warm/cold plan; config and six public Context names remain unchanged.
- `resolve2ae_core/tests/test_export_core.py`: default direct caller behavior still calls injected/default process launch; deferred mode records exactly `[aePath, "-r", jsxPath]` or `[aePath]`; cold JSX lives under supplied host temp; Windows detection uses an absolute PowerShell executable and never PATH/WMIC.
- `script-runtime/runtime-launcher.test.js`: retain the existing exact environment assertion at lines 192-226 and add an explicit assertion that `APPDATA`, `LOCALAPPDATA`, `USERPROFILE`, `PATH`, and Conda/Python variables never enter the Runtime process environment.
- `script-runtime/test_python_runner.py`: retain the exact six-public-name assertion at lines 35-66 unchanged.
- `script-runtime/integration.test.js`: one AE-shaped fixture proves private plan -> host spawn -> unchanged public result through the real Manager/Provider command path.
- `scripts/stage-managed-python.test.js`: both production hosts explicitly inject `app.getPath("temp")`; keep existing packaged Runtime/no-PATH checks.

Live acceptance must cover warm AE and cold AE, preferences read/write, CEP load, JSX execution/self-cleanup, and the existing hostile PATH/Conda/Python variants. Automated mocks cannot establish Adobe/CEP correctness.

### Options rejected

#### Explicit allowlisted launch environment passed as request data

This is a smaller diff but not a stable root-cause contract. It makes Clackly guess which of `APPDATA`, `LOCALAPPDATA`, `USERPROFILE`, ProgramData/CommonProgramFiles variants, session/domain variables, TEMP, and vendor/plugin variables AE or CEP will need. The list can regress with Adobe/plugin updates, and the isolated Python process receives desktop-user data even if it never installs it into `os.environ`. Passing the whole host environment is worse: it serializes PATH, Conda, tokens, and unrelated state directly into the worker. Use this only as a temporary diagnostic experiment, not the shipped boundary.

#### `ShellExecute` / `os.startfile` / Explorer delegation

Shell execution does not document that a target gets Explorer's logon environment. It may execute directly, delegate through DDE/COM, or lack a usable process handle depending on association and shell state. If Explorer must be started, it can itself inherit the isolated worker environment. Argument handling for `-r <jsx>` and reliable startup-error reporting also become weaker. It is not a correctness contract.

#### Known-folder reconstruction

Known Folder APIs can return Profile, RoamingAppData, and LocalAppData paths, but they do not reconstruct a complete process environment. Rebuilding an interactive logon environment inside Python duplicates Windows/user/profile policy and still guesses Adobe/CEP/plugin needs. It is more code and less correct than launching from the existing interactive Electron host.

### External references

- Microsoft `CreateProcessW`: when `lpEnvironment` is null, the child uses the parent's environment; an explicit block replaces that inheritance. https://learn.microsoft.com/en-us/windows/win32/api/processthreadsapi/nf-processthreadsapi-createprocessw
- Node.js `child_process.spawn`: `options.env` defaults to `process.env`; omitting `env` is the host-inheritance behavior needed here. https://nodejs.org/api/child_process.html#child_processspawncommand-args-options
- Python 3.13 `subprocess`: an `env` mapping defines the new process environment, and Windows side-by-side assembly can require `%SystemRoot%`. https://docs.python.org/3.13/library/subprocess.html#subprocess.Popen
- Microsoft `ShellExecuteEx`: shell activation can involve DDE and does not guarantee a process handle or define environment rehydration from Explorer. https://learn.microsoft.com/en-us/windows/win32/api/shellapi/nf-shellapi-shellexecuteexa
- Microsoft Known Folder IDs: exposes individual locations such as Profile, RoamingAppData, and LocalAppData, not a desktop process environment block. https://learn.microsoft.com/en-us/windows/win32/shell/knownfolderid

## Related specs

- `.trellis/spec/backend/quality-guidelines.md` — Script Capability Runtime and Managed Script Runtime contracts: exact six public Context names, narrow JSON protocols, no PATH fallback, one process per execution, no retry after execution starts.
- `.trellis/spec/guides/cross-layer-thinking-guide.md` — the internal launch plan is a cross-layer payload and therefore needs one validating owner.
- `.trellis/spec/guides/code-reuse-thinking-guide.md` — reuse the existing Manager/Bootstrap boundary and existing AE path rather than adding a second launcher framework or environment reconstruction utility.
- `.trellis/tasks/08-03-managed-runtime-python-provider-export-ae-6-5d/prd.md` — R2, R3, R7 and acceptance criteria require the unchanged Context/result contracts, exact configured `aePath`, and retained Runtime isolation.
- `.trellis/tasks/08-03-managed-runtime-python-provider-export-ae-6-5d/design.md` — RuntimeManager owns isolated execution; Bootstrap owns the internal script envelope; hosts own live desktop context.

## Caveats / Not Found

- The reported AE preference/CEP dialogs are not persisted in the existing task research files; `implementation-evidence.md` ends before live AE send. This analysis accepts the dispatch's live observation and corroborates its process-inheritance mechanism from code.
- No current host-process launch seam exists. `capability/afterEffectsPath.js` has host-side running-process discovery, but only exports `initializeAfterEffectsPath` (`capability/afterEffectsPath.js:20-42,115-145`); reusing/exporting its private detector is optional, not required if Python switches to absolute PowerShell.
- The exact Node detached/unref behavior should be verified in the packaged Workflow Integration host. The contract-relevant point is `env` omission plus ignored stdio and observed spawn/error, not `detached:true`.
- Host-side launch fixes environment inheritance but does not prove Adobe version/plugin compatibility. Packaged live warm/cold export remains the release gate, and the Runtime lock/Manifest must remain `candidate` until it passes.
