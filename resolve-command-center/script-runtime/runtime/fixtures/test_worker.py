import json
import os
import struct
import sys
import time


request = json.loads(sys.stdin.buffer.read())
mode = request.get("mode")

if mode == "success":
    response = {
        "ok": True,
        "runtime": {
            "version": ".".join(str(part) for part in sys.version_info[:3]),
            "architecture": f"{8 * struct.calcsize('P')}bit",
            "executable": os.path.realpath(sys.executable),
            "value": request.get("value"),
        },
    }
elif mode == "python-exception":
    try:
        raise RuntimeError("worker failure")
    except RuntimeError as error:
        response = {
            "ok": False,
            "error": {"code": "WORKER_FAILED", "type": type(error).__name__, "message": str(error)},
        }
elif mode == "nonzero":
    sys.stderr.buffer.write(b"worker exited")
    raise SystemExit(7)
elif mode == "empty":
    raise SystemExit(0)
elif mode == "wait":
    time.sleep(60)
    raise SystemExit(0)
elif mode == "invalid-json":
    sys.stdout.buffer.write(b"not-json")
    raise SystemExit(0)
elif mode == "invalid-envelope":
    response = {"ok": True}
elif mode == "stdout-flood":
    sys.stdout.buffer.write(b"x" * 65536)
    raise SystemExit(0)
elif mode == "stderr-flood":
    sys.stderr.buffer.write(b"x" * 65536)
    raise SystemExit(0)
elif mode == "abort":
    os.abort()
else:
    response = {
        "ok": False,
        "error": {"code": "WORKER_MODE_INVALID", "type": "ValueError", "message": "unknown mode"},
    }

sys.stdout.buffer.write(json.dumps(response).encode("utf-8"))
