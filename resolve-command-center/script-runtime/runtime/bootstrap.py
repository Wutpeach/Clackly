import json
import os
import struct
import sys


def failure(error_type, message):
    return {
        "ok": False,
        "error": {
            "code": "BOOTSTRAP_REQUEST_INVALID",
            "type": error_type,
            "message": message,
        },
    }


def reject_nonstandard_number(_value):
    raise ValueError("non-standard JSON number")


def handle(raw_request):
    try:
        request = json.loads(raw_request, parse_constant=reject_nonstandard_number)
    except (UnicodeDecodeError, json.JSONDecodeError, ValueError):
        return failure("ValueError", "Bootstrap request must be valid UTF-8 JSON")

    if not isinstance(request, dict):
        return failure("TypeError", "Bootstrap request must be an object")
    if request.get("operation") != "runtime-info":
        return failure("ValueError", "Bootstrap operation must be runtime-info")

    executable = os.path.realpath(sys.executable)
    if not executable or not os.path.isabs(executable):
        return failure("RuntimeError", "Bootstrap executable must be absolute")

    return {
        "ok": True,
        "runtime": {
            "version": ".".join(str(part) for part in sys.version_info[:3]),
            "architecture": f"{struct.calcsize('P') * 8}bit",
            "executable": executable,
        },
    }


def main():
    response = handle(sys.stdin.buffer.read())
    sys.stdout.buffer.write(json.dumps(response, allow_nan=False).encode("utf-8"))


if __name__ == "__main__":
    main()
