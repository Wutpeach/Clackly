import json
import ast
import types
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest
from unittest import mock


RUNTIME = Path(__file__).resolve().parent / "runtime"


class InstallationBridgeProtocolTests(unittest.TestCase):
    def request(self, root, **extra):
        return {"operation": "script-execute", "scriptRoot": str(root), "entry": "feature.py",
                "commandId": "fixture.lazy", "config": {}, **extra}

    def fixture(self, root):
        (root / "feature.py").write_text("def execute(context):\n    return {'lazy': True}\n", encoding="utf-8")
        module = root / "DaVinciResolveScript.py"
        module.write_text("raise AssertionError('bridge must stay lazy')\n", encoding="utf-8")
        library = root / "fusionscript.dll"
        library.write_bytes(b"fixture")
        return {"modulePath": str(module), "libraryPath": str(library)}

    def child(self, bootstrap, payload, root):
        # Keep protocol fixtures under exactly the production isolation flags.
        environment = {key: value for key, value in os.environ.items() if key.upper() in {"SYSTEMROOT", "WINDIR"}}
        environment.update(TEMP=str(root), TMP=str(root), TMPDIR=str(root))
        result = subprocess.run([sys.executable, "-I", "-u", "-X", "faulthandler", str(RUNTIME / bootstrap)],
                                input=payload.encode("utf-8"), stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                                cwd=root, env=environment, timeout=10)
        self.assertEqual(result.returncode, 0, result.stderr.decode("utf-8", errors="replace"))
        return result.stdout.decode("utf-8")

    def test_one_shot_bridge_is_lazy_and_partial_tuple_is_rejected_by_python(self):
        with tempfile.TemporaryDirectory(prefix="clackly bridge ") as temporary:
            root = Path(temporary).resolve()
            bridge = self.fixture(root)
            response = json.loads(self.child("bootstrap.py", json.dumps(self.request(root, bridge=bridge)), root))
            self.assertTrue(response["script"]["ok"])
            self.assertEqual(response["script"]["result"], {"lazy": True})
            partial = {"modulePath": bridge["modulePath"]}
            response = json.loads(self.child("bootstrap.py", json.dumps(self.request(root, bridge=partial)), root))
            self.assertEqual(response["error"]["code"], "BOOTSTRAP_REQUEST_INVALID")

    def test_persistent_prepare_stays_bridge_free_and_rejects_switch_inside_a_used_worker(self):
        with tempfile.TemporaryDirectory(prefix="clackly bridge ") as temporary:
            root = Path(temporary).resolve()
            bridge = self.fixture(root)
            changed = root / "changed.dll"
            changed.write_bytes(b"changed")
            requests = [
                {"requestId": 1, "operation": "prepare", "scriptRoot": str(root), "entry": "feature.py"},
                self.request(root, requestId=2, bridge=bridge),
                self.request(root, requestId=3, bridge={**bridge, "libraryPath": str(changed)}),
                self.request(root, requestId=4, bridge={"modulePath": bridge["modulePath"]}),
            ]
            frames = [json.loads(line) for line in self.child("persistent_bootstrap.py", "".join(json.dumps(item) + "\n" for item in requests), root).splitlines()]
            self.assertEqual(frames[1], {"requestId": 1, "ok": True, "prepared": True})
            self.assertEqual(frames[2]["script"]["result"], {"lazy": True})
            self.assertEqual(frames[3]["error"]["code"], "RESOLVE_BRIDGE_CHANGED")
            self.assertEqual(frames[4]["error"]["code"], "BOOTSTRAP_REQUEST_INVALID")

    def test_missing_selected_library_is_explicit_before_business_execution(self):
        with tempfile.TemporaryDirectory(prefix="clackly bridge ") as temporary:
            root = Path(temporary).resolve()
            bridge = self.fixture(root)
            Path(bridge["libraryPath"]).unlink()
            response = json.loads(self.child("bootstrap.py", json.dumps(self.request(root, bridge=bridge)), root))
            self.assertEqual(response["error"]["code"], "RESOLVE_LIBRARY_NOT_FOUND")

    @unittest.skipUnless(os.name == "nt", "Windows Utility installation layout")
    def test_utility_detects_only_current_executable_sibling_library(self):
        source_path = RUNTIME.parents[1] / "resolve" / "Clackly.py"
        # Utility entrypoints execute on import. Load definitions only, with
        # the unconditional launcher Try statement deliberately excluded.
        tree = ast.parse(source_path.read_text(encoding="utf-8"))
        tree.body = [node for node in tree.body if isinstance(node, (ast.Import, ast.ImportFrom, ast.Assign, ast.FunctionDef))]
        utility = types.ModuleType("clackly_utility_paths")
        exec(compile(tree, str(source_path), "exec"), utility.__dict__)
        with tempfile.TemporaryDirectory(prefix="Resolve 达芬奇 ") as temporary:
            root = Path(temporary).resolve()
            library = root / "fusionscript.dll"
            library.write_bytes(b"fixture")
            (root / "ResolvePython").mkdir()
            for executable in (root / "Resolve.exe", root / "ResolvePython" / "ResolvePython.exe"):
                executable.write_bytes(b"fixture")
                with mock.patch.object(sys, "executable", str(executable)):
                    self.assertEqual(utility._windows_default_resolve_script_lib(), library)
            with mock.patch.object(sys, "executable", str(root / "unrelated.exe")):
                self.assertIsNone(utility._windows_default_resolve_script_lib())
            library.unlink()
            with mock.patch.object(sys, "executable", str(root / "Resolve.exe")):
                self.assertIsNone(utility._windows_default_resolve_script_lib())


if __name__ == "__main__":
    unittest.main()
