import sys
from pathlib import Path
from typing import Any, Callable, Dict

APP_ROOT = Path(__file__).resolve().parent.parent
if str(APP_ROOT) not in sys.path:
    sys.path.insert(0, str(APP_ROOT))

from resolve.adapter import ResolveAdapterError, add_marker, get_resolve

ResolveBridgeError = ResolveAdapterError


COMMAND_HANDLERS: Dict[str, Callable[[], Dict[str, Any]]] = {
    "timeline.addMarker": add_marker
}


def execute_command(command_id: str) -> Dict[str, Any]:
    handler = COMMAND_HANDLERS.get(command_id)
    if handler is None:
        raise ResolveBridgeError(f"Unknown command: {command_id}")

    result = handler()
    return {
        "ok": True,
        "command": command_id,
        **result
    }


def get_resolve_version() -> str:
    resolve = get_resolve()
    getter = getattr(resolve, "GetVersionString", None)
    if not callable(getter):
        raise ResolveBridgeError("Resolve version is unavailable")
    try:
        version = getter()
    except Exception as exc:
        raise ResolveBridgeError("Resolve version is unavailable") from exc
    if not isinstance(version, str) or not version.strip():
        raise ResolveBridgeError("Resolve version is unavailable")
    return version
