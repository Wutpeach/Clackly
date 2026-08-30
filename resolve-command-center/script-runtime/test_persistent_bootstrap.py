import importlib.util
import io
from pathlib import Path
import tempfile
import unittest


BOOTSTRAP_PATH = Path(__file__).resolve().parent / "runtime" / "persistent_bootstrap.py"
APP_ROOT = BOOTSTRAP_PATH.parents[2]
SPEC = importlib.util.spec_from_file_location("persistent_runtime_bootstrap", BOOTSTRAP_PATH)
BOOTSTRAP = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(BOOTSTRAP)


class PersistentBootstrapTests(unittest.TestCase):
    def tearDown(self):
        # The persistent runner cache is process-local in production. Clearing
        # it here makes each source-level test independent without changing
        # the worker's intentional import reuse contract.
        import sys
        sys.modules.pop("clackly_persistent_python_runner", None)

    def test_prepare_imports_dependencies_without_executing_feature_or_connecting_resolve(self):
        with tempfile.TemporaryDirectory() as temporary_directory:
            root = Path(temporary_directory)
            entry = root / "feature.py"
            entry.write_text(
                "def execute(context):\n"
                "    raise AssertionError('prepare must not execute this feature')\n",
                encoding="utf-8",
            )
            response = BOOTSTRAP._prepare({
                "requestId": 1,
                "operation": "prepare",
                "scriptRoot": str(root),
                "entry": "feature.py",
            })

        self.assertEqual(response, {"requestId": 1, "ok": True, "prepared": True})

    def test_actual_export_prepare_does_not_touch_resolve_adapter(self):
        runner = BOOTSTRAP._load_runner()
        calls = []
        original = runner.resolve_adapter.get_resolve

        def forbidden_resolve():
            calls.append(True)
            raise AssertionError("prepare must not connect to Resolve")

        runner.resolve_adapter.get_resolve = forbidden_resolve
        try:
            response = BOOTSTRAP._prepare({
                "requestId": 1,
                "operation": "prepare",
                "scriptRoot": str(APP_ROOT),
                "entry": "scripts/resolve2ae_export.py",
            })
        finally:
            runner.resolve_adapter.get_resolve = original

        self.assertEqual(response, {"requestId": 1, "ok": True, "prepared": True})
        self.assertEqual(calls, [])

    def test_python_runner_transports_actual_resolve_adapter_failure_type(self):
        runner = BOOTSTRAP._load_runner()
        original = runner.resolve_adapter.get_resolve

        def unavailable_resolve():
            raise runner.resolve_adapter.ResolveAdapterError("fixture unavailable")

        runner.resolve_adapter.get_resolve = unavailable_resolve
        try:
            with tempfile.TemporaryDirectory() as temporary_directory:
                entry = Path(temporary_directory) / "feature.py"
                entry.write_text(
                    "def execute(context):\n"
                    "    return context.resolve\n",
                    encoding="utf-8",
                )
                response = runner.run_script(str(entry), "fixture.resolve", {})
        finally:
            runner.resolve_adapter.get_resolve = original

        self.assertFalse(response["ok"])
        self.assertEqual(response["error"]["type"], "ResolveAdapterError")

    def test_emit_accepts_the_one_mebibyte_protocol_class_and_rejects_larger_lines(self):
        class Capture:
            def __init__(self):
                self.buffer = io.BytesIO()

        capture = Capture()
        original_stdout = BOOTSTRAP.sys.__stdout__
        BOOTSTRAP.sys.__stdout__ = capture
        try:
            bounded = {"jsx": "x" * (BOOTSTRAP.MAX_LINE_BYTES - 32)}
            BOOTSTRAP._emit(bounded)
            self.assertLessEqual(len(capture.buffer.getvalue()), BOOTSTRAP.MAX_LINE_BYTES)
            self.assertGreater(len(capture.buffer.getvalue()), 64 * 1024)
            oversized = {"jsx": "x" * BOOTSTRAP.MAX_LINE_BYTES}
            with self.assertRaises(RuntimeError):
                BOOTSTRAP._emit(oversized)
        finally:
            BOOTSTRAP.sys.__stdout__ = original_stdout

    def test_each_execution_uses_fresh_command_and_config_state(self):
        with tempfile.TemporaryDirectory() as temporary_directory:
            root = Path(temporary_directory)
            entry = root / "feature.py"
            entry.write_text(
                "def execute(context):\n"
                "    context.logger.info(context.config['value'])\n"
                "    return {'command': context.command_id, 'value': context.config['value']}\n",
                encoding="utf-8",
            )
            one = BOOTSTRAP._script_execute({
                "requestId": 1,
                "operation": "script-execute",
                "scriptRoot": str(root),
                "entry": "feature.py",
                "commandId": "fixture.one",
                "config": {"value": "one"},
            })
            two = BOOTSTRAP._script_execute({
                "requestId": 2,
                "operation": "script-execute",
                "scriptRoot": str(root),
                "entry": "feature.py",
                "commandId": "fixture.two",
                "config": {"value": "two"},
            })

        self.assertEqual(one["script"], {
            "ok": True,
            "result": {"command": "fixture.one", "value": "one"},
            "logs": [{"level": "info", "message": "one"}],
        })
        self.assertEqual(two["script"], {
            "ok": True,
            "result": {"command": "fixture.two", "value": "two"},
            "logs": [{"level": "info", "message": "two"}],
        })

    def test_protocol_rejects_unknown_fields_nonfinite_numbers_and_entry_escape(self):
        with tempfile.TemporaryDirectory() as temporary_directory:
            root = Path(temporary_directory)
            (root / "outside.py").write_text("def execute(context): return None\n", encoding="utf-8")
            scripts = root / "scripts"
            scripts.mkdir()
            cases = [
                b'{"requestId":1,"operation":"prepare","scriptRoot":"x","entry":"x","extra":true}',
                b'{"requestId":NaN,"operation":"prepare","scriptRoot":"x","entry":"x"}',
            ]
            for raw in cases:
                self.assertEqual(BOOTSTRAP._handle(raw)["ok"], False)
            escaped = BOOTSTRAP._script_execute({
                "requestId": 1,
                "operation": "script-execute",
                "scriptRoot": str(scripts),
                "entry": "../outside.py",
                "commandId": "fixture",
                "config": {},
            })
        self.assertEqual(escaped["ok"], False)
        self.assertEqual(escaped["error"]["code"], "BOOTSTRAP_REQUEST_INVALID")


if __name__ == "__main__":
    unittest.main()
