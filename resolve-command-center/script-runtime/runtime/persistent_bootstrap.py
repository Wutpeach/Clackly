"""Line-oriented, persistent Runtime bootstrap for Export-to-AE execution.

This module intentionally owns no Resolve state.  Each ``script-execute``
request delegates to ``python_runner.run_script`` which creates a new
ScriptContext and reacquires lazy Resolve services for that request.
"""

import importlib.util
import json
import os
import platform
import re
import struct
import sys
from pathlib import Path


PROTOCOL = "clackly-persistent-python/1"
# Match RuntimeLauncher's canonical stdout ceiling.  The business response
# legitimately includes a private JSX launch plan of up to 768 KiB.
MAX_LINE_BYTES = 1024 * 1024
MAX_SAFE_REQUEST_ID = (1 << 53) - 1
VERSION = re.compile(r"^(?:0|[1-9]\d*)(?:\.(?:0|[1-9]\d*)){2,}$")


def _reject_nonstandard_number(_value):
    raise ValueError("non-standard JSON number")


def _runtime():
    executable = os.path.realpath(sys.executable)
    if not executable or not os.path.isabs(executable):
        raise RuntimeError("persistent runtime executable is invalid")
    return {
        "version": ".".join(str(part) for part in sys.version_info[:3]),
        "architecture": f"{struct.calcsize('P') * 8}bit",
        "executable": executable,
    }


def _emit(value):
    # ``python_runner`` redirects sys.stdout around feature execution.  The
    # original stream is reserved exclusively for this private protocol.
    payload = json.dumps(value, allow_nan=False, separators=(",", ":")).encode("utf-8")
    if len(payload) + 1 > MAX_LINE_BYTES:
        raise RuntimeError("persistent protocol response exceeded its line limit")
    sys.__stdout__.buffer.write(payload + b"\n")
    sys.__stdout__.buffer.flush()


def _failure(request_id, code="BOOTSTRAP_REQUEST_INVALID"):
    return {
        "requestId": request_id,
        "ok": False,
        "error": {"code": code, "type": "ValueError", "message": "Persistent Bootstrap request is invalid"},
    }


def _valid_request_id(value):
    return isinstance(value, int) and not isinstance(value, bool) and 0 < value <= MAX_SAFE_REQUEST_ID


def _contained_entry(script_root, entry):
    if not isinstance(script_root, str) or not os.path.isabs(script_root) or not os.path.isdir(script_root):
        return None
    if (
        not isinstance(entry, str)
        or not entry.strip()
        or os.path.isabs(entry)
        or ".." in entry.replace("\\", "/").split("/")
    ):
        return None
    root = os.path.realpath(script_root)
    candidate = os.path.realpath(os.path.join(root, entry))
    try:
        contained = os.path.commonpath((root, candidate)) == root
    except ValueError:
        contained = False
    return candidate if contained and os.path.isfile(candidate) else None


def _load_runner():
    bootstrap_root = Path(__file__).resolve().parent
    runner_path = next(
        (item for item in (bootstrap_root / "python_runner.py", bootstrap_root.parent / "python_runner.py") if item.is_file()),
        None,
    )
    if runner_path is None:
        raise FileNotFoundError("Clackly Python runner was not found")
    existing = sys.modules.get("clackly_persistent_python_runner")
    if existing is not None:
        return existing
    spec = importlib.util.spec_from_file_location("clackly_persistent_python_runner", runner_path)
    if spec is None or spec.loader is None:
        raise ImportError("Clackly Python runner could not be loaded")
    runner = importlib.util.module_from_spec(spec)
    sys.modules["clackly_persistent_python_runner"] = runner
    try:
        spec.loader.exec_module(runner)
    except BaseException:
        sys.modules.pop("clackly_persistent_python_runner", None)
        raise
    return runner


def _prepare(request):
    if set(request) != {"requestId", "operation", "scriptRoot", "entry"}:
        return _failure(request.get("requestId"))
    request_id = request.get("requestId")
    entry = _contained_entry(request.get("scriptRoot"), request.get("entry"))
    if not _valid_request_id(request_id) or entry is None:
        return _failure(request_id)
    try:
        runner = _load_runner()
        # Importing the entry warms dependency imports only.  It deliberately
        # does not call execute(), construct a context, or access Resolve.
        runner._load_execute(Path(entry))
        platform.system()
    except Exception:
        return _failure(request_id, "BOOTSTRAP_PREPARE_FAILED")
    return {"requestId": request_id, "ok": True, "prepared": True}


def _script_execute(request):
    if set(request) != {"requestId", "operation", "scriptRoot", "entry", "commandId", "config"}:
        return _failure(request.get("requestId"))
    request_id = request.get("requestId")
    entry = _contained_entry(request.get("scriptRoot"), request.get("entry"))
    command_id = request.get("commandId")
    config = request.get("config")
    if (not _valid_request_id(request_id) or entry is None
            or not isinstance(command_id, str) or not command_id.strip() or not isinstance(config, dict)):
        return _failure(request_id)
    try:
        runner = _load_runner()
        script = runner.run_script(entry, command_id, dict(config))
        return {"requestId": request_id, "ok": True, "runtime": _runtime(), "script": script}
    except Exception:
        return _failure(request_id, "BOOTSTRAP_EXECUTION_FAILED")


def _handle(raw):
    try:
        request = json.loads(raw.decode("utf-8"), parse_constant=_reject_nonstandard_number)
    except (UnicodeDecodeError, ValueError, json.JSONDecodeError):
        return _failure(None)
    if not isinstance(request, dict):
        return _failure(None)
    operation = request.get("operation")
    if operation == "prepare":
        return _prepare(request)
    if operation == "script-execute":
        return _script_execute(request)
    return _failure(request.get("requestId"))


def main():
    try:
        _emit({"protocol": PROTOCOL, "type": "ready", "runtime": _runtime()})
        while True:
            line = sys.stdin.buffer.readline(MAX_LINE_BYTES + 1)
            if not line:
                return
            if len(line) > MAX_LINE_BYTES or not line.endswith(b"\n"):
                _emit(_failure(None))
                return
            _emit(_handle(line[:-1]))
    except Exception:
        # Do not write raw errors to stdout: it is a strict protocol channel.
        return


if __name__ == "__main__":
    main()
