import importlib.util
import json
import os
from pathlib import Path
import struct
import subprocess
import sys
import tempfile
import unittest
from unittest import mock


BOOTSTRAP_PATH = Path(__file__).resolve().parent / "runtime" / "bootstrap.py"
SPEC = importlib.util.spec_from_file_location("runtime_bootstrap", BOOTSTRAP_PATH)
BOOTSTRAP = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(BOOTSTRAP)


class RuntimeBootstrapTests(unittest.TestCase):
    def resolve_request(self, module_path, library_path, **overrides):
        return json.dumps({
            "operation": "resolve-probe",
            "expectedRuntimeVersion": ".".join(str(part) for part in sys.version_info[:3]),
            "expectedResolveVersion": "20.3.2.9",
            "modulePath": str(module_path),
            "libraryPath": str(library_path),
            **overrides,
        }).encode("utf-8")

    def run_fake_module(self, source, **overrides):
        with tempfile.TemporaryDirectory() as temporary_directory:
            root = Path(temporary_directory)
            module_path = root / "DaVinciResolveScript.py"
            library_path = root / "fusionscript.dll"
            module_path.write_text(
                "import os\n__file__ = os.environ['RESOLVE_SCRIPT_LIB']\n" + source,
                encoding="utf-8",
            )
            library_path.write_bytes(b"fixture")
            previous_library = os.environ.get("RESOLVE_SCRIPT_LIB")
            try:
                sys.modules.pop("DaVinciResolveScript", None)
                return BOOTSTRAP.handle(self.resolve_request(module_path, library_path, **overrides))
            finally:
                sys.modules.pop("DaVinciResolveScript", None)
                if str(root) in sys.path:
                    sys.path.remove(str(root))
                if previous_library is None:
                    os.environ.pop("RESOLVE_SCRIPT_LIB", None)
                else:
                    os.environ["RESOLVE_SCRIPT_LIB"] = previous_library

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

    def test_script_execute_reuses_the_existing_runner_envelope(self):
        with tempfile.TemporaryDirectory() as temporary_directory:
            root = Path(temporary_directory)
            entry = root / "feature.py"
            entry.write_text(
                "def execute(context):\n"
                "    context.logger.info('managed')\n"
                "    return {'command': context.command_id, 'value': context.config['value']}\n",
                encoding="utf-8",
            )
            response = BOOTSTRAP.handle(json.dumps({
                "operation": "script-execute",
                "scriptRoot": str(root),
                "entry": "feature.py",
                "commandId": "feature.run",
                "config": {"value": 3},
            }).encode("utf-8"))

        self.assertEqual(response["ok"], True)
        self.assertEqual(response["script"], {
            "ok": True,
            "result": {"command": "feature.run", "value": 3},
            "logs": [{"level": "info", "message": "managed"}],
        })

    def test_script_execute_rejects_entry_escape(self):
        with tempfile.TemporaryDirectory() as temporary_directory:
            root = Path(temporary_directory)
            outside = root / "outside.py"
            script_root = root / "scripts"
            script_root.mkdir()
            outside.write_text("def execute(context): return None\n", encoding="utf-8")
            response = BOOTSTRAP.handle(json.dumps({
                "operation": "script-execute",
                "scriptRoot": str(script_root),
                "entry": "../outside.py",
                "commandId": "feature.run",
                "config": {},
            }).encode("utf-8"))

        self.assertEqual(response["ok"], False)
        self.assertEqual(response["error"]["type"], "FileNotFoundError")

    def test_resolve_probe_reports_runtime_resolve_and_canonical_bridge(self):
        response = self.run_fake_module(
            "class App:\n"
            "    def GetVersionString(self): return '20.3.2'\n"
            "def scriptapp(name): return App() if name == 'Resolve' else None\n"
        )

        self.assertEqual(response["ok"], True)
        self.assertEqual(response["runtime"]["architecture"], "64bit")
        self.assertEqual(response["resolve"], {"version": "20.3.2", "connected": True})
        self.assertTrue(os.path.isabs(response["bridge"]["modulePath"]))
        self.assertTrue(os.path.isabs(response["bridge"]["libraryPath"]))

    def test_resolve_probe_imports_the_exact_supplied_module_file(self):
        with tempfile.TemporaryDirectory() as temporary_directory:
            root = Path(temporary_directory)
            requested_module = root / "explicit_bridge.py"
            requested_module.write_text(
                "import os\n"
                "__file__ = os.environ['RESOLVE_SCRIPT_LIB']\n"
                "class App:\n"
                "    def GetVersionString(self): return '20.3.2'\n"
                "def scriptapp(name): return App()\n",
                encoding="utf-8",
            )
            (root / "DaVinciResolveScript.py").write_text(
                "raise AssertionError('must not import sibling')\n", encoding="utf-8"
            )
            library_path = root / "fusionscript.dll"
            library_path.write_bytes(b"fixture")
            previous_library = os.environ.get("RESOLVE_SCRIPT_LIB")
            try:
                response = BOOTSTRAP.handle(
                    self.resolve_request(requested_module, library_path)
                )
            finally:
                sys.modules.pop("DaVinciResolveScript", None)
                if previous_library is None:
                    os.environ.pop("RESOLVE_SCRIPT_LIB", None)
                else:
                    os.environ["RESOLVE_SCRIPT_LIB"] = previous_library

        self.assertEqual(response["ok"], True)
        self.assertEqual(response["bridge"]["modulePath"], str(requested_module.resolve()))

    def test_resolve_probe_rejects_a_different_loaded_library(self):
        response = self.run_fake_module(
            "__file__ = os.path.realpath(__file__ + '.different')\n"
            "class App:\n"
            "    def GetVersionString(self): return '20.3.2'\n"
            "def scriptapp(name): return App()\n"
        )

        self.assertEqual(response["error"]["code"], "RESOLVE_IMPORT_FAILED")

    def test_resolve_probe_validates_runtime_and_bridge_before_import(self):
        with tempfile.TemporaryDirectory() as temporary_directory:
            root = Path(temporary_directory)
            module_path = root / "DaVinciResolveScript.py"
            library_path = root / "fusionscript.dll"
            module_path.write_text("raise AssertionError('must not import')\n", encoding="utf-8")
            library_path.write_bytes(b"fixture")

            requests = [
                (self.resolve_request(root / "missing.py", root / "missing.dll"), "RESOLVE_MODULE_NOT_FOUND"),
                (self.resolve_request(module_path, root / "missing.dll"), "RESOLVE_LIBRARY_NOT_FOUND"),
                (self.resolve_request(module_path, library_path, expectedRuntimeVersion="3.0.0"), "RUNTIME_VERSION_MISMATCH"),
            ]
            for request, code in requests:
                with self.subTest(code=code):
                    self.assertEqual(BOOTSTRAP.handle(request)["error"]["code"], code)

            with mock.patch.object(BOOTSTRAP.struct, "calcsize", return_value=4):
                response = BOOTSTRAP.handle(self.resolve_request(module_path, library_path))
            self.assertEqual(response["error"]["code"], "RUNTIME_ARCHITECTURE_UNSUPPORTED")

    def test_resolve_probe_maps_controlled_bridge_failures(self):
        cases = [
            ("raise OSError('load')\n", "RESOLVE_IMPORT_FAILED"),
            ("def scriptapp(name): return None\n", "RESOLVE_NOT_RUNNING"),
            ("def scriptapp(name): raise OSError('connect')\n", "RESOLVE_CONNECTION_FAILED"),
            (
                "class App:\n    def GetVersionString(self): raise OSError('version')\n"
                "def scriptapp(name): return App()\n",
                "RESOLVE_VERSION_UNVERIFIED",
            ),
            (
                "class App:\n    def GetVersionString(self): return '19.1.0'\n"
                "def scriptapp(name): return App()\n",
                "RESOLVE_VERSION_UNVERIFIED",
            ),
        ]
        for source, code in cases:
            with self.subTest(code=code):
                response = self.run_fake_module(source)
                self.assertEqual(response["ok"], False)
                self.assertEqual(response["error"]["code"], code)
                self.assertIsInstance(response["error"]["stage"], str)
                self.assertEqual(
                    response["error"]["details"]["runtime"]["version"],
                    ".".join(str(part) for part in sys.version_info[:3]),
                )
                self.assertNotIn("traceback", json.dumps(response).lower())

    def test_resolve_probe_rejects_malformed_versions(self):
        source = (
            "class App:\n    def GetVersionString(self): return '20.3.2'\n"
            "def scriptapp(name): return App()\n"
        )
        for overrides in (
            {"expectedRuntimeVersion": "3.13"},
            {"expectedResolveVersion": "20.3"},
            {"expectedResolveVersion": None},
        ):
            with self.subTest(overrides=overrides):
                response = self.run_fake_module(source, **overrides)
                self.assertEqual(response["error"]["code"], "BOOTSTRAP_REQUEST_INVALID")

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
