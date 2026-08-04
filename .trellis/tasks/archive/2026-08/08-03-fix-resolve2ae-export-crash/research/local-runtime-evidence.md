# Resolve2AE Native Crash — Local Runtime Evidence

## Finding

The reported `3221225477` exit is reproducible at `DaVinciResolveScript` native-module import, before `resolve2ae_export.execute()` reaches Resolve2AE export logic. Clackly resolves bare `python` to a uv-managed CPython 3.11 process, while Resolve 20.3.2's Fusion bridge loads the installed Python 3.13 runtime. Mixing those runtimes terminates the process with `0xC0000005`.

## System Evidence

Windows Application Error event 1000 at the reported failure time records:

```text
Faulting application: python.exe 3.11.15
Application path: C:\Users\Administrator\AppData\Roaming\uv\python\cpython-3.11-windows-x86_64-none\python.exe
Faulting module: python313.dll 3.13.1
Module path: C:\Users\Administrator\AppData\Local\Programs\Python\Python313\python313.dll
Exception code: 0xc0000005
```

The active product versions and native bridge are:

```text
DaVinci Resolve: running from C:\Program Files\Blackmagic Design\DaVinci Resolve\Resolve.exe
fusionscript.dll: 20.3.2, 64-bit installation
Clackly PATH `python`: CPython 3.11.15, 64-bit, uv-managed
Standard installed interpreters: Python 3.12 and Python 3.13
```

## Isolation Probes

Importing the installed Resolve scripting module in isolated child processes gives:

| Interpreter | Result |
|---|---|
| bare `python` / uv CPython 3.11 | `0xc0000005` during `DaVinciResolveScript.py:15 load_dynamic()` |
| standard CPython 3.12 | same native access violation during module creation |
| standard CPython 3.13.1 | imports `fusionscript.dll` and `scriptapp("Resolve")` returns a live Resolve object |
| `python3` on this machine | resolves to the same Python 3.13 executable and succeeds |

Adding the 3.11 `sys.base_prefix` through `os.add_dll_directory()` did not prevent the crash, so module-path discovery alone is not the missing behavior.

## Repository Boundary

- `capability/registerScripts.js` constructs `PythonProvider` without `pythonExecutable`.
- `PythonProvider` therefore defaults to the first bare `python` on the host PATH.
- `python_runner.py` lazily calls `resolve.adapter.get_resolve()` when the Feature reads `context.resolve`.
- `resolve.adapter.get_resolve()` adds the standard Resolve module path and imports `DaVinciResolveScript`; the interpreter exits before Python exception handling can return a protocol envelope.
- `resolve2ae_export.py` and `resolve2ae_core.export.process_and_send()` have not started when the native import crashes.

## Planning Consequences

The fix belongs at the shared Python runtime selection boundary, not in AE path discovery or Resolve2AE core. It should select or explicitly configure an interpreter compatible with the installed Resolve bridge before running script Features, preserve ordinary non-Resolve Python tests, and turn "no compatible interpreter" into a controlled startup/execution error instead of launching a known-incompatible process.

Blind retry after `0xc0000005`, an AE executable change, or exception handling inside `resolve2ae_export.py` cannot fix this failure because the interpreter has already terminated.
