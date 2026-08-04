import http.client
import json
import threading
import unittest
from unittest.mock import patch

from resolve_bridge import ResolveBridgeError, get_resolve_version
from server import CommandRequestHandler, ThreadingHTTPServer


class ResolveVersionTests(unittest.TestCase):
    def test_reads_the_live_resolve_version(self):
        resolve = type("Resolve", (), {"GetVersionString": lambda self: "20.3.2.9"})()
        with patch("resolve_bridge.get_resolve", return_value=resolve):
            self.assertEqual(get_resolve_version(), "20.3.2.9")

    def test_rejects_missing_or_failing_version_methods(self):
        for resolve in (
            object(),
            type("Resolve", (), {"GetVersionString": lambda self: ""})(),
            type("Resolve", (), {"GetVersionString": lambda self: (_ for _ in ()).throw(RuntimeError())})(),
        ):
            with self.subTest(resolve=resolve), patch("resolve_bridge.get_resolve", return_value=resolve):
                with self.assertRaises(ResolveBridgeError):
                    get_resolve_version()

    def test_health_exposes_live_version_and_fails_closed(self):
        server = ThreadingHTTPServer(("127.0.0.1", 0), CommandRequestHandler)
        thread = threading.Thread(target=server.serve_forever, daemon=True)
        thread.start()
        try:
            for value, status, expected in (
                ("20.3.2.9", 200, {"ok": True, "resolveVersion": "20.3.2.9"}),
                (ResolveBridgeError("unavailable"), 503, {"ok": False, "error": "unavailable"}),
            ):
                effect = {"return_value": value} if isinstance(value, str) else {"side_effect": value}
                with self.subTest(status=status), patch("server.get_resolve_version", **effect):
                    connection = http.client.HTTPConnection(*server.server_address, timeout=2)
                    connection.request("GET", "/health")
                    response = connection.getresponse()
                    payload = json.loads(response.read())
                    connection.close()
                    self.assertEqual(response.status, status)
                    self.assertEqual(payload, expected)
        finally:
            server.shutdown()
            server.server_close()
            thread.join(timeout=2)


if __name__ == "__main__":
    unittest.main()
