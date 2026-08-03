from contextlib import redirect_stderr, redirect_stdout
import importlib.util
import json
import os
import re
import struct
import sys


VERSION = re.compile(r"^(?:0|[1-9]\d*)(?:\.(?:0|[1-9]\d*)){2,}$")


def failure(error_type, message, code="BOOTSTRAP_REQUEST_INVALID", stage=None, details=None):
    error = {
        "code": code,
        "type": error_type,
        "message": message,
    }
    if stage is not None:
        error["stage"] = stage
    if details:
        error["details"] = details
    return {
        "ok": False,
        "error": error,
    }


def reject_nonstandard_number(_value):
    raise ValueError("non-standard JSON number")


def runtime_record():
    executable = os.path.realpath(sys.executable)
    if not executable or not os.path.isabs(executable):
        return None, failure("RuntimeError", "Bootstrap executable must be absolute")
    return {
        "version": ".".join(str(part) for part in sys.version_info[:3]),
        "architecture": f"{struct.calcsize('P') * 8}bit",
        "executable": executable,
    }, None


def require_version(value):
    return isinstance(value, str) and VERSION.fullmatch(value) is not None


def version_matches(actual, expected):
    actual_parts = tuple(int(part) for part in actual.split("."))
    expected_parts = tuple(int(part) for part in expected.split("."))
    shared = min(len(actual_parts), len(expected_parts))
    return actual_parts[:shared] == expected_parts[:shared]


def import_resolve_module(module_path):
    name = "DaVinciResolveScript"
    spec = importlib.util.spec_from_file_location(name, module_path)
    if spec is None or spec.loader is None:
        raise ImportError("DaVinci Resolve scripting module could not be loaded")
    module = importlib.util.module_from_spec(spec)
    sys.modules[name] = module
    try:
        spec.loader.exec_module(module)
    except BaseException:
        sys.modules.pop(name, None)
        raise
    return sys.modules.get(name, module)


def resolve_probe(request):
    runtime, error = runtime_record()
    if error:
        return error

    def failed(error_type, message, code, stage, details=None):
        return failure(
            error_type,
            message,
            code,
            stage,
            {"runtime": runtime, **(details or {})},
        )

    if runtime["architecture"] != "64bit":
        return failed(
            "RuntimeError",
            "Resolve requires a 64-bit Python Runtime",
            "RUNTIME_ARCHITECTURE_UNSUPPORTED",
            "runtime-architecture",
            {"architecture": runtime["architecture"]},
        )

    expected_runtime = request.get("expectedRuntimeVersion")
    if expected_runtime is not None and not require_version(expected_runtime):
        return failed(
            "ValueError",
            "expectedRuntimeVersion must be a canonical numeric version",
            "BOOTSTRAP_REQUEST_INVALID",
            "request",
        )
    if expected_runtime is not None and runtime["version"] != expected_runtime:
        return failed(
            "RuntimeError",
            "Running Python version does not match the selected Runtime profile",
            "RUNTIME_VERSION_MISMATCH",
            "runtime-version",
            {"expected": expected_runtime, "actual": runtime["version"]},
        )

    expected_resolve = request.get("expectedResolveVersion")
    if not require_version(expected_resolve):
        return failed(
            "ValueError",
            "expectedResolveVersion must be a canonical numeric version",
            "BOOTSTRAP_REQUEST_INVALID",
            "request",
        )

    module_path = request.get("modulePath")
    library_path = request.get("libraryPath")
    if not isinstance(module_path, str) or not os.path.isabs(module_path) or not os.path.isfile(module_path):
        return failed(
            "FileNotFoundError",
            "DaVinciResolveScript.py was not found",
            "RESOLVE_MODULE_NOT_FOUND",
            "module-path",
        )
    module_path = os.path.realpath(module_path)
    if not isinstance(library_path, str) or not os.path.isabs(library_path) or not os.path.isfile(library_path):
        return failed(
            "FileNotFoundError",
            "fusionscript library was not found",
            "RESOLVE_LIBRARY_NOT_FOUND",
            "library-path",
        )
    library_path = os.path.realpath(library_path)

    os.environ["RESOLVE_SCRIPT_LIB"] = library_path
    with open(os.devnull, "w", encoding="utf-8") as sink, redirect_stdout(sink), redirect_stderr(sink):
        try:
            resolve_module = import_resolve_module(module_path)
        except Exception as caught:  # The native module can also abort; the parent maps that crash.
            return failed(
                type(caught).__name__,
                "DaVinci Resolve scripting module failed to load",
                "RESOLVE_IMPORT_FAILED",
                "module-import",
            )
        try:
            loaded_library = os.path.realpath(resolve_module.__file__)
            library_matches = os.path.samefile(loaded_library, library_path)
        except (AttributeError, OSError, TypeError):
            library_matches = False
        if not library_matches:
            return failed(
                "ImportError",
                "DaVinci Resolve scripting module did not load the supplied library",
                "RESOLVE_IMPORT_FAILED",
                "module-import",
            )

        try:
            resolve = resolve_module.scriptapp("Resolve")
        except Exception as caught:
            return failed(
                type(caught).__name__,
                "DaVinci Resolve connection failed",
                "RESOLVE_CONNECTION_FAILED",
                "resolve-connection",
            )
        if resolve is None:
            return failed(
                "RuntimeError",
                "DaVinci Resolve is not running or scripting is unavailable",
                "RESOLVE_NOT_RUNNING",
                "resolve-connection",
            )
        try:
            actual_resolve = resolve.GetVersionString()
        except Exception as caught:
            return failed(
                type(caught).__name__,
                "DaVinci Resolve version could not be read",
                "RESOLVE_VERSION_UNVERIFIED",
                "resolve-version",
            )
    if not require_version(actual_resolve) or not version_matches(
        actual_resolve, expected_resolve
    ):
        return failed(
            "RuntimeError",
            "DaVinci Resolve version could not be verified",
            "RESOLVE_VERSION_UNVERIFIED",
            "resolve-version",
            {"expected": expected_resolve, "actual": actual_resolve if isinstance(actual_resolve, str) else None},
        )

    return {
        "ok": True,
        "runtime": runtime,
        "resolve": {"version": actual_resolve, "connected": True},
        "bridge": {"modulePath": module_path, "libraryPath": library_path},
    }


def handle(raw_request):
    try:
        request = json.loads(raw_request, parse_constant=reject_nonstandard_number)
    except (UnicodeDecodeError, json.JSONDecodeError, ValueError):
        return failure("ValueError", "Bootstrap request must be valid UTF-8 JSON")

    if not isinstance(request, dict):
        return failure("TypeError", "Bootstrap request must be an object")
    operation = request.get("operation")
    if operation == "resolve-probe":
        return resolve_probe(request)
    if operation != "runtime-info":
        return failure("ValueError", "Bootstrap operation must be runtime-info or resolve-probe")

    runtime, error = runtime_record()
    return error or {"ok": True, "runtime": runtime}


def main():
    response = handle(sys.stdin.buffer.read())
    sys.stdout.buffer.write(json.dumps(response, allow_nan=False).encode("utf-8"))


if __name__ == "__main__":
    main()
