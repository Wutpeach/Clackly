# Research: Resolve2AE Windows native crash boundary

- Query: Localize the first import/call behind `scripts/resolve2ae_export.py` exiting `3221225477` (`0xC0000005`) after AE path discovery, identify the likely root cause, and propose the smallest shared fix and validation plan.
- Scope: mixed (repository, installed Resolve/Python runtime, Windows event log, bundled vendor documentation)
- Date: 2026-08-03

## Findings

### Conclusion

The first crashing operation is **not** AE discovery, Qt, `resolve2ae_core` import, or an After Effects subprocess call. It is native initialization of Resolve 20.3.2's `fusionscript.dll` while importing `DaVinciResolveScript` from the Python subprocess selected by `PythonProvider`.

The exact live path is:

```text
interactions:execute
  -> InteractionManager.handle()
  -> executeWorkflowCommand()
  -> Command Engine / ae.export Capability
  -> ScriptCapabilityProvider
  -> PythonProvider spawns PATH "python"
  -> python_runner.py loads scripts/resolve2ae_export.py
  -> execute(): context.resolve                         # first native boundary
  -> resolve.adapter.get_resolve()
  -> import DaVinciResolveScript
  -> DaVinciResolveScript.load_dynamic("fusionscript", ...)
  -> Windows access violation 0xC0000005
```

On this machine, PATH `python` is a Hermes/uv CPython 3.11.15 virtualenv. Resolve's binding crashes under that interpreter and the separately installed CPython 3.12.10, but the same binding imports and returns live Resolve/project/timeline objects under CPython 3.13.1. Windows Event 1000 records the decisive version skew: a CPython 3.11.15 process faulted in `Python313.dll` with exception `0xc0000005`. This is consistent with the Resolve native binding initializing against the registered 3.13 runtime inside an older interpreter process.

The shared root cause is therefore **implicit and incompatible script-runtime interpreter selection at `PythonProvider`**, not Resolve2AE business logic. `registerScriptCapabilities()` already accepts an executable-only `pythonExecutable`, but both Electron hosts omit it and `PythonProvider` defaults to the first `python` on the host PATH.

### Repository trace and code patterns

- `resolve-command-center/electron/main/main.js:104-118` and `resolve-command-center/workflow-plugin/main.js:186-200` register `interactions:execute`; the handlers only delegate to `InteractionManager` and hide the palette after a match.
- `resolve-command-center/interaction/InteractionManager.js:38-54` normalizes the event, exact-matches a binding, and delegates the matched Command id once. There is no native/Python/AE work here.
- `resolve-command-center/command-engine/executor.js:22-37` resolves Command -> Capability, gates feature/config state, and passes capability-scoped configuration.
- `resolve-command-center/capability/script.js:9-13`, `script-runtime/ScriptCapabilityProvider.js:18-35`, and `script-runtime/ScriptExecutor.js:6-18` preserve the Command id/config and route to the runtime provider without native imports.
- `resolve-command-center/capability/registerScripts.js:10-27` has the existing shared interpreter injection seam (`pythonExecutable`) and constructs one `PythonProvider`; both host callers omit the option (`electron/main/main.js:41`, `workflow-plugin/main.js:122`).
- `resolve-command-center/script-runtime/providers/PythonProvider.js:13-25,45-71` defaults to literal `"python"`, resolves the entry, and spawns `[runnerPath, entryPath]` with `shell: false`. `:83-87` reports a nonzero exit and captured stderr; it cannot catch an access violation inside the child.
- `resolve-command-center/script-runtime/python_runner.py:71-80,91-119` dynamically imports the Feature and converts ordinary Python failures into an envelope. Native access violations bypass `except Exception`. Lazy `ScriptContext.resolve` first calls the adapter at `:51-55`.
- `resolve-command-center/scripts/resolve2ae_export.py:1-3` imports only `pathlib` and the local core. `:20-28` validates/maps config. The first native operation is `context.resolve` at `:29-35`; `context.project` would be the next Resolve access.
- `resolve-command-center/resolve/adapter.py:41-81` first checks built-ins/importable `bmd`; neither exists in this external subprocess. It adds the standard module directory and reaches the crashing `import DaVinciResolveScript` at `:66`. `scriptapp("Resolve")` at `:73` is never reached by the failing interpreters.
- The installed `DaVinciResolveScript.py:6-19,25-49` uses `ExtensionFileLoader`/`module_from_spec` to load `C:\Program Files\Blackmagic Design\DaVinci Resolve\fusionscript.dll`. The fault-handler stack stops at its line 15 (`module_from_spec`) and line 46 (the DLL load).
- `resolve-command-center/resolve2ae_core/export.py:15-22` imports only the standard library, and importing it succeeds. Its first AE runtime branch is much later at `:1012-1037` (`get_running_ae_path`, `subprocess.Popen`). The reproduced crash occurs before `process_and_send()` starts, so AE launch/`-r`, bootstrap JSX, and Qt/PySide are excluded. No PySide/PyQt/Qt import exists in the wrapper/core/runtime/adapter search.
- `resolve-command-center/resolve2ae_core/export.py:538-580` shows that even after entry, Resolve timeline calls and OTIO export precede AE launch. No evidence supports changing this core.

### Reproduction and boundary probes

All probes were child-process-only and made no repository/product writes. Resolve 20.3.2 and After Effects 2026 were already running.

#### Environment

```powershell
Get-Command python -All
python -VV
python -c "import sys,struct; print(sys.executable); print(struct.calcsize('P')*8)"
```

Result:

```text
PATH python: C:\Users\Administrator\AppData\Local\hermes\hermes-agent\venv\Scripts\python.exe
Python 3.11.15, 64-bit
Additional installed interpreters: CPython 3.12.10 and 3.13.1, both 64-bit
Resolve.exe: 20.3.2.9
fusionscript.dll: 20.3.2, 3,571,200 bytes
```

The user PATH orders Hermes/3.11 first, Python 3.12 next, and Python 3.13 later. `resolve-command-center/README.md:89-91` confirms this runtime intentionally invokes PATH `python` and has no interpreter discovery.

#### Pure imports versus native import

Equivalent commands (with `resolve-command-center` and the installed Resolve Modules directory inserted into `sys.path`) produced:

```text
import resolve2ae_core.export      -> EXIT 0
import resolve.adapter             -> EXIT 0
find_spec("bmd")                   -> None
find_spec("DaVinciResolveScript") before adapter path injection -> None
ctypes.WinDLL(fusionscript.dll)    -> EXIT 0
import DaVinciResolveScript        -> EXIT -1073741819 (0xC0000005)
resolve.adapter.get_resolve()      -> EXIT -1073741819 (0xC0000005)
```

Loading the DLL as an ordinary Windows library succeeds; initializing it as a Python extension is what crashes.

#### Exact real-runner reproduction

```powershell
$request = @{
  commandId = 'timeline.exportToAfterEffects'
  config = @{ aePath = (Get-Process AfterFX | Select-Object -First 1 -ExpandProperty Path); prefix = 'Link' }
} | ConvertTo-Json -Compress
$request | python script-runtime/python_runner.py scripts/resolve2ae_export.py
$LASTEXITCODE
```

Result: no stdout, no stderr, exit `-1073741819`; Node surfaces the unsigned Windows value `3221225477`.

Repeating with Python's built-in native fault handler:

```powershell
$request | python -X faulthandler script-runtime/python_runner.py scripts/resolve2ae_export.py
```

Result: the same exit plus this stderr boundary:

```text
Windows fatal exception: access violation
DaVinciResolveScript.py:15 in load_dynamic
DaVinciResolveScript.py:46 in <module>
resolve/adapter.py:66 in get_resolve
script-runtime/python_runner.py:54 in resolve
scripts/resolve2ae_export.py:30 in execute
script-runtime/python_runner.py:105 in run_script
```

This demonstrates that `faulthandler` supplies the required diagnostic without changing stdout's single JSON-envelope contract.

#### Interpreter comparison

For each executable, the probe inserted the installed Resolve Modules directory, imported `DaVinciResolveScript`, then called `scriptapp("Resolve")`:

| Interpreter | Import | `scriptapp("Resolve")` |
|---|---:|---:|
| Hermes/uv CPython 3.11.15 | `0xC0000005` | not reached |
| python.org CPython 3.12.10 | `0xC0000005` | not reached |
| python.org CPython 3.13.1 | exit 0 | live `BlackmagicFusion.PyRemoteObject` |

A further read-only 3.13.1 adapter probe successfully returned live `PyRemoteObject` values from `get_resolve()` and `get_project_and_timeline()` (exit 0). It did not call Resolve2AE or launch AE.

#### Windows crash evidence

```powershell
Get-WinEvent -FilterHashtable @{ LogName='Application'; Id=1000 } |
  Where-Object { $_.Message -match 'python|fusionscript' } |
  Select-Object -First 10 TimeCreated,Message
```

Relevant event:

```text
Faulting application: python.exe 3.11.15150.1013
Faulting application path: ...\uv\python\cpython-3.11-windows-x86_64-none\python.exe
Faulting module: Python313.dll 3.13.1150.1013
Faulting module path: ...\Programs\Python\Python313\python313.dll
Exception code: 0xc0000005
```

### Why existing tests missed it

- `script-runtime/providers/PythonProvider.test.js:21-39,42-70,106-139` uses a fake child process. It checks transport and generic exit errors but never starts the selected executable or native Resolve module.
- `script-runtime/test_python_runner.py:9-20,74-100` injects a fake adapter; this correctly protects runner unit tests from Resolve but cannot expose ABI/native-loader failures.
- `resolve/test_adapter.py:63-75,106-170` replaces `DaVinciResolveScript` with Python fakes or temporary pure-Python modules.
- `scripts/test_resolve2ae_export.py:27-75` supplies fake Resolve/project objects and mocks `process_and_send`.
- `script-runtime/integration.test.js:104-118` deliberately uses a missing AE path, so validation returns before `context.resolve` and the native import.
- Core tests mock Resolve and `subprocess.Popen`; their coverage is valuable but downstream of this crash.

### Minimal fix options

1. **Recommended shared product boundary: use the existing executable-only interpreter injection and make it configurable for Script Runtime.** Add one dedicated executable-only setting at `registerScriptCapabilities()`/`PythonProvider` (do not reuse `RESOLVE_COMMAND_CENTER_PYTHON_CMD`, which may contain arguments and is bridge-only). Configure the reported machine to `C:\Users\Administrator\AppData\Local\Programs\Python\Python313\python.exe`. This fixes every Python Feature that uses the shared provider, leaves AE capability config untouched, and avoids core/renderer/Interaction special cases.
2. **Immediate zero-code machine remediation:** ensure Python 3.13.1 precedes Hermes Python 3.11 and CPython 3.12 in the environment inherited when Resolve starts, then fully restart Resolve/Clackly. This proves the diagnosis but is fragile for users and should not be the sole product fix.
3. **Only if unattended distribution requires it:** add interpreter discovery plus a child-process compatibility probe. This is more code and policy than the current requirement needs; `README.md:91` explicitly deferred interpreter discovery. Do not guess compatibility from `>=3.6`: probe the exact installed Resolve binding in an expendable subprocess because a failed import can terminate it.

For retained diagnostics, start the existing runner with `-X faulthandler` or enable `faulthandler` against `sys.__stderr__` at runner startup. PythonProvider already includes child stderr in nonzero-exit errors, so no retry, daemon, or new logging channel is needed.

Do **not** add `try/except` around `DaVinciResolveScript`, guard the wrapper/core, retry the same interpreter, disable AE validation, or change `process_and_send`; none can intercept or prevent a process-level access violation.

### Likely affected files

Smallest expected implementation surface:

- `resolve-command-center/capability/registerScripts.js` — wire a dedicated executable-only Script Runtime override into the already-existing `pythonExecutable` seam (or inject it from both hosts if configuration ownership requires host composition).
- `resolve-command-center/script-runtime/python_runner.py` and/or `script-runtime/providers/PythonProvider.js` — enable native fault diagnostics before Feature execution.
- `resolve-command-center/script-runtime/providers/PythonProvider.test.js` and `script-runtime/integration.test.js` — prove executable selection, spawn arguments/diagnostic stderr, and the real generic runner path.
- `resolve-command-center/README.md` — document interpreter compatibility/override and the native import probe.
- `.trellis/spec/backend/quality-guidelines.md` — update via the spec workflow if the new executable selection/diagnostic contract is adopted.

No evidence supports edits to `scripts/resolve2ae_export.py`, `resolve2ae_core/`, AE discovery, Interaction Binding, Command Engine, renderer, or Qt code.

### Validation plan

1. Run the smallest native probe under the configured executable while Resolve is running:

   ```powershell
   & $ConfiguredPython -X faulthandler -c "import sys; sys.path.insert(0, r'C:\ProgramData\Blackmagic Design\DaVinci Resolve\Support\Developer\Scripting\Modules'); import DaVinciResolveScript as d; assert d.scriptapp('Resolve')"
   ```

2. Add/run one automated provider/registration regression proving an absolute executable-only override is the spawned command and that bridge `RESOLVE_COMMAND_CENTER_PYTHON_CMD` is still ignored. Add one nonzero/native-style fake exit assertion showing stderr is retained. Native Resolve presence should remain an opt-in/manual probe, not make CI host-dependent.
3. Run focused checks from `resolve-command-center/`:

   ```powershell
   node --test script-runtime/*.test.js script-runtime/providers/*.test.js capability/*.test.js
   & $ConfiguredPython -m unittest discover -s script-runtime -p "test_*.py"
   & $ConfiguredPython -m unittest discover -s resolve -p "test_*.py"
   & $ConfiguredPython -m unittest discover -s scripts -p "test_*.py"
   & $ConfiguredPython -m unittest discover -s resolve2ae_core/tests -p "test_*.py"
   & $ConfiguredPython -m py_compile script-runtime/python_runner.py resolve/adapter.py scripts/resolve2ae_export.py resolve2ae_core/export.py
   ```

4. Run full project checks with the same configured interpreter first on PATH (the package script invokes literal `python`):

   ```powershell
   npm test
   npm run build
   ```

5. Manual Windows acceptance: restart Resolve after setting the interpreter; execute `Export to After Effects` through the real `interactions:execute` path; verify the currently persisted `ae.export.aePath` is the executable launched/targeted; inspect the created AE composition; repeat one alternate mode. Record Resolve 20.3.2.9, AE 2026, Python 3.13.1, Command id, selected path, and result. A real export remains a validation gap in this research because intentionally invoking Resolve export and AE composition creation is state-changing.

## Files Found

- `resolve-command-center/workflow-plugin/main.js` — Workflow Integration IPC/Command composition and one of two Script Capability registration callers.
- `resolve-command-center/electron/main/main.js` — standalone Electron equivalent.
- `resolve-command-center/interaction/InteractionManager.js` — exact binding-to-Command delegation.
- `resolve-command-center/command-engine/executor.js` — Command-to-Capability/config gate.
- `resolve-command-center/capability/registerScripts.js` — shared PythonProvider composition and existing executable injection seam.
- `resolve-command-center/script-runtime/providers/PythonProvider.js` — PATH interpreter selection, child transport, exit/stderr reporting.
- `resolve-command-center/script-runtime/python_runner.py` — dynamic entry loading, lazy Resolve context, JSON envelope.
- `resolve-command-center/scripts/resolve2ae_export.py` — thin wrapper; first native access at `context.resolve`.
- `resolve-command-center/resolve/adapter.py` — sole Python Resolve connection owner and crashing native import.
- `resolve-command-center/resolve2ae_core/export.py` — stdlib-only export core; AE subprocess occurs far downstream.
- `resolve-command-center/script-runtime/providers/PythonProvider.test.js` — mocked provider tests.
- `resolve-command-center/script-runtime/test_python_runner.py` — fake-adapter runner tests.
- `resolve-command-center/resolve/test_adapter.py` — pure-Python module discovery/connection tests.
- `resolve-command-center/scripts/test_resolve2ae_export.py` — mocked wrapper contract tests.
- `resolve-command-center/script-runtime/integration.test.js` — real runner path currently stops at invalid AE config.
- `.trellis/tasks/archive/2026-08/08-03-resolve2ae-clackly-refactor/design.md` — specifies PATH Python reconnect through `DaVinciResolveScript` and thin wrapper boundary.
- `.trellis/tasks/archive/2026-08/08-03-resolve2ae-clackly-refactor/research/current-state.md` — records earlier module discovery gap and subprocess architecture.
- `.trellis/tasks/archive/2026-08/08-03-auto-detect-ae-path/design.md` and `research/current-state.md` — prove discovery owns startup config only and wrapper retains final validation.

## External References

- Installed Blackmagic documentation: `C:\ProgramData\Blackmagic Design\DaVinci Resolve\Support\Developer\Scripting\README.txt`, last updated 2025-10-07, lines 14-42. It documents 64-bit Python `>=3.6`, the Windows `RESOLVE_SCRIPT_API`, `RESOLVE_SCRIPT_LIB`, and `PYTHONPATH` values, and that Resolve must be running. The broad version claim is insufficient for this observed native combination; empirical subprocess validation is authoritative for Resolve 20.3.2 on this host.
- Installed loader: `C:\ProgramData\Blackmagic Design\DaVinci Resolve\Support\Developer\Scripting\Modules\DaVinciResolveScript.py`, lines 6-49. It dynamically loads the native `fusionscript` extension.
- Python standard facility: `-X faulthandler` (also available through `faulthandler.enable`) captured the Windows access-violation stack on stderr and did not use stdout.
- Installed versions observed: Resolve `20.3.2.9`, `fusionscript.dll` `20.3.2`, After Effects 2026, CPython `3.11.15`, `3.12.10`, and `3.13.1` (64-bit).

## Related Specs

- `.trellis/spec/backend/quality-guidelines.md:111-176` — Script Capability Runtime ownership, lazy Resolve access, executable-only constructor injection, error matrix, and tests.
- `.trellis/spec/backend/quality-guidelines.md:137-156` — PythonProvider must own process invocation; nonzero exits must be controlled; no runtime retry after execution begins.
- `.trellis/spec/backend/quality-guidelines.md:368-415` — Resolve adapter is the shared owner of Resolve scripting API access.
- `.trellis/spec/backend/quality-guidelines.md:530-579` — Interaction Binding only delegates Command ids and propagates execution errors.
- `.trellis/spec/backend/error-handling.md` and `logging-guidelines.md` are placeholders and add no further project-specific contract.

## Caveats / Not Found

- The probes prove the failure boundary and the working interpreter on this machine; they do not establish a universal Python-version matrix for other Resolve releases or installations.
- Blackmagic's bundled README says Python `>=3.6`, but the observed Resolve 20.3.2 native loader is not safe in this host's 3.11/3.12 processes. No more precise vendor compatibility table was bundled.
- A real Resolve-to-AE export was intentionally not run during research because it changes the Resolve/AE state and writes/executes JSX. It remains the manual acceptance step.
- No Qt/PySide/PyQt dependency or import exists in the active wrapper/core/runtime path.
- AE path auto-discovery was already complete before the failure and the native fault is reproduced independently of discovery logic.
