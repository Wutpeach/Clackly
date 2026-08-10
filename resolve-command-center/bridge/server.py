import json
import os
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from typing import Any, Dict, Optional

from resolve_bridge import ResolveBridgeError, execute_command, get_resolve_version


DEFAULT_PORT = 49371
DEFAULT_ALLOWED_ORIGIN = "http://127.0.0.1:5173"


def get_port() -> int:
    raw_port = os.environ.get("RESOLVE_COMMAND_CENTER_PORT", str(DEFAULT_PORT))
    try:
        port = int(raw_port)
    except ValueError as exc:
        raise RuntimeError(f"Invalid RESOLVE_COMMAND_CENTER_PORT: {raw_port}") from exc

    if port < 1 or port > 65535:
        raise RuntimeError(f"RESOLVE_COMMAND_CENTER_PORT out of range: {port}")

    return port


def get_allowed_origin() -> str:
    return os.environ.get("RESOLVE_COMMAND_CENTER_ALLOWED_ORIGIN", DEFAULT_ALLOWED_ORIGIN)


def _json_response(handler: BaseHTTPRequestHandler, status: int, payload: Dict[str, Any]) -> None:
    body = json.dumps(payload).encode("utf-8")
    handler.send_response(status)
    handler.send_header("Content-Type", "application/json")
    handler.send_header("Content-Length", str(len(body)))
    handler.send_header("Access-Control-Allow-Origin", get_allowed_origin())
    handler.end_headers()
    handler.wfile.write(body)


class CommandRequestHandler(BaseHTTPRequestHandler):
    server_version = "ResolveCommandCenter/0.1"

    def log_message(self, format: str, *args: Any) -> None:
        print(f"[resolve-command-center] {self.address_string()} - {format % args}")

    def do_OPTIONS(self) -> None:
        self.send_response(204)
        self.send_header("Access-Control-Allow-Origin", get_allowed_origin())
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.send_header("Access-Control-Allow-Methods", "POST, OPTIONS")
        self.end_headers()

    def do_GET(self) -> None:
        if self.path == "/health":
            try:
                _json_response(self, 200, {"ok": True, "resolveVersion": get_resolve_version()})
            except ResolveBridgeError as exc:
                _json_response(self, 503, {"ok": False, "error": str(exc)})
            return

        _json_response(self, 404, {"ok": False, "error": "Not found"})

    def do_POST(self) -> None:
        if self.path != "/command":
            _json_response(self, 404, {"ok": False, "error": "Not found"})
            return

        try:
            content_length = int(self.headers.get("Content-Length", "0"))
            raw_body = self.rfile.read(content_length).decode("utf-8")
            payload = json.loads(raw_body) if raw_body else {}
            command_id = payload.get("command")
            if not isinstance(command_id, str) or not command_id:
                raise ResolveBridgeError("Request body must include a command string")

            _json_response(self, 200, execute_command(command_id, payload))
        except ResolveBridgeError as exc:
            error = {"ok": False, "error": str(exc)}
            if getattr(exc, "code", None):
                error["code"] = exc.code
            if getattr(exc, "details", None):
                error["details"] = exc.details
            _json_response(self, 400, error)
        except json.JSONDecodeError:
            _json_response(self, 400, {"ok": False, "error": "Invalid JSON request body"})
        except Exception as exc:
            _json_response(self, 500, {"ok": False, "error": str(exc)})


def create_server(port: Optional[int] = None) -> ThreadingHTTPServer:
    return ThreadingHTTPServer(("127.0.0.1", port or get_port()), CommandRequestHandler)


def run_server(port: Optional[int] = None) -> None:
    server = create_server(port)
    host, bound_port = server.server_address
    print(f"[resolve-command-center] bridge listening on http://{host}:{bound_port}")
    server.serve_forever()


if __name__ == "__main__":
    run_server()
