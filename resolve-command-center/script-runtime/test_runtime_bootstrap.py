import importlib.util
import json
import os
from pathlib import Path
import struct
import subprocess
import sys
import tempfile
import unittest


BOOTSTRAP_PATH = Path(__file__).resolve().parent / "runtime" / "bootstrap.py"
SPEC = importlib.util.spec_from_file_location("runtime_bootstrap", BOOTSTRAP_PATH)
BOOTSTRAP = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(BOOTSTRAP)


class RuntimeBootstrapTests(unittest.TestCase):
    def test_runtime_info_reports_the_real_interpreter(self):
        response = BOOTSTRAP.handle(b'{"operation":"runtime-info"}')

        self.assertEqual(response["ok"], True)
        self.assertEqual(set(response), {"ok", "runtime"})
        self.assertEqual(
            set(response["runtime"]),
            {"version", "architecture", "executable"},
        )
        self.assertEqual(
            response["runtime"]["version"],
            ".".join(str(part) for part in sys.version_info[:3]),
        )
        self.assertEqual(response["runtime"]["architecture"], f"{struct.calcsize('P') * 8}bit")
        self.assertEqual(response["runtime"]["executable"], os.path.realpath(sys.executable))
        self.assertTrue(os.path.isabs(response["runtime"]["executable"]))

    def test_invalid_json_root_and_operation_are_controlled_failures(self):
        for request in (
            b"{",
            b"\xff",
            b"[]",
            b'{"operation":"other"}',
            b'{"operation":"runtime-info","value":NaN}',
        ):
            with self.subTest(request=request):
                response = BOOTSTRAP.handle(request)
                self.assertEqual(response["ok"], False)
                self.assertEqual(response["error"]["code"], "BOOTSTRAP_REQUEST_INVALID")
                self.assertIsInstance(response["error"]["type"], str)
                self.assertIsInstance(response["error"]["message"], str)

    def test_real_bootstrap_succeeds_with_the_isolated_environment(self):
        with tempfile.TemporaryDirectory() as temporary_directory:
            if sys.platform == "win32":
                system_root = next(
                    value for key, value in os.environ.items() if key.lower() == "systemroot"
                )
                environment = {
                    "SystemRoot": system_root,
                    "WINDIR": system_root,
                    "TEMP": temporary_directory,
                    "TMP": temporary_directory,
                }
            else:
                environment = {"TMPDIR": temporary_directory}

            completed = subprocess.run(
                [
                    os.path.realpath(sys.executable),
                    "-I",
                    "-u",
                    "-X",
                    "faulthandler",
                    str(BOOTSTRAP_PATH),
                ],
                input=b'{"operation":"runtime-info"}',
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                cwd=temporary_directory,
                env=environment,
                check=False,
            )

        self.assertEqual(completed.returncode, 0, completed.stderr.decode("utf-8", "replace"))
        self.assertEqual(completed.stderr, b"")
        response = json.loads(completed.stdout)
        self.assertEqual(response["ok"], True)
        self.assertEqual(response["runtime"]["architecture"], f"{struct.calcsize('P') * 8}bit")
        self.assertTrue(os.path.isabs(response["runtime"]["executable"]))


if __name__ == "__main__":
    unittest.main()
