import pathlib
import tempfile
import textwrap
import unittest

from python_runner import run_script


class FakeAdapter:
    def __init__(self):
        self.resolve_calls = 0
        self.project_calls = 0

    def get_resolve(self):
        self.resolve_calls += 1
        return "resolve"

    def get_project_and_timeline(self):
        self.project_calls += 1
        return "project", "timeline"


class PythonRunnerTests(unittest.TestCase):
    def run_fixture(self, source, config=None, adapter=None):
        with tempfile.TemporaryDirectory() as directory:
            entry = pathlib.Path(directory, "feature.py")
            entry.write_text(textwrap.dedent(source), encoding="utf-8")
            return run_script(
                str(entry),
                "feature.command",
                config or {},
                adapter or FakeAdapter(),
            )

    def test_supports_async_results_logs_and_exact_public_context(self):
        envelope = self.run_fixture(
            """
            import sys

            async def execute(context):
                context.logger.debug("debug", context.config["value"])
                context.logger.warning("warning")
                print("stdout")
                print("stderr", file=sys.stderr)
                public = sorted(name for name in dir(context) if not name.startswith("_"))
                try:
                    context.command_id = "changed"
                except AttributeError:
                    readonly = True
                return {
                    "value": context.config["value"],
                    "command_id": context.command_id,
                    "readonly": readonly,
                    "context": public,
                }
            """,
            {"value": 3},
        )

        self.assertTrue(envelope["ok"])
        self.assertEqual(envelope["result"], {
            "value": 3,
            "command_id": "feature.command",
            "readonly": True,
            "context": ["command_id", "config", "logger", "project", "resolve", "timeline"],
        })
        self.assertEqual(envelope["logs"], [
            {"level": "debug", "message": "debug 3"},
            {"level": "warning", "message": "warning"},
            {"level": "info", "message": "stdout"},
            {"level": "error", "message": "stderr"},
        ])

    def test_resolve_services_are_lazy_and_cached_through_the_adapter(self):
        adapter = FakeAdapter()
        config_only = self.run_fixture(
            """
            def execute(context):
                return context.config
            """,
            {"safe": True},
            adapter,
        )
        self.assertTrue(config_only["ok"])
        self.assertEqual((adapter.resolve_calls, adapter.project_calls), (0, 0))

        envelope = self.run_fixture(
            """
            def execute(context):
                return {
                    "resolve": context.resolve,
                    "resolve_again": context.resolve,
                    "project": context.project,
                    "timeline": context.timeline,
                }
            """,
            adapter=adapter,
        )
        self.assertTrue(envelope["ok"])
        self.assertEqual((adapter.resolve_calls, adapter.project_calls), (1, 1))

    def test_reports_missing_execute_import_and_runtime_failures(self):
        cases = [
            ("VALUE = 1", "TypeError", "callable execute"),
            ("raise RuntimeError('import failed')", "RuntimeError", "import failed"),
            ("def execute(context):\n    raise ValueError('runtime failed')", "ValueError", "runtime failed"),
        ]
        for source, error_type, message in cases:
            with self.subTest(error_type=error_type):
                envelope = self.run_fixture(source)
                self.assertFalse(envelope["ok"])
                self.assertEqual(envelope["error"]["type"], error_type)
                self.assertIn(message, envelope["error"]["message"])

    def test_reports_non_serializable_results(self):
        for source, error_type, message in [
            ("def execute(context):\n    return {1, 2}", "TypeError", "JSON serializable"),
            ("def execute(context):\n    return float('nan')", "ValueError", "Out of range"),
        ]:
            with self.subTest(error_type=error_type):
                envelope = self.run_fixture(source)
                self.assertFalse(envelope["ok"])
                self.assertEqual(envelope["error"]["type"], error_type)
                self.assertIn(message, envelope["error"]["message"])


if __name__ == "__main__":
    unittest.main()
