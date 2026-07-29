import sys
from pathlib import Path
from typing import Any, Callable, Dict

APP_ROOT = Path(__file__).resolve().parent.parent
if str(APP_ROOT) not in sys.path:
    sys.path.insert(0, str(APP_ROOT))

from resolve.adapter import ResolveAdapterError, add_marker

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
