import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

import resolve2ae_export


class Logger:
    def __init__(self):
        self.messages = []

    def info(self, message):
        self.messages.append(message)


class Context:
    def __init__(self, command_id, ae_path, prefix="", config_overrides=None):
        self.command_id = command_id
        self.config = {"aePath": ae_path, "prefix": prefix}
        if config_overrides:
            self.config.update(config_overrides)
        self.logger = Logger()
        self.resolve = "resolve"
        self.project = "project"


class Resolve2AEExportTests(unittest.TestCase):
    def test_maps_all_commands_and_returns_success(self):
        self.assertEqual(
            set(resolve2ae_export.COMMAND_POLICIES),
            {
                "timeline.exportToAfterEffects",
                "timeline.exportAudioToAfterEffects",
                "timeline.exportVideoToAfterEffects",
            },
        )
        with tempfile.TemporaryDirectory() as directory:
            ae_path = Path(directory, "AfterFX.exe")
            ae_path.touch()
            for command_id, (mode, target_policy, media_policy) in resolve2ae_export.COMMAND_POLICIES.items():
                for config_case, overrides, expected_value in (
                    ("missing", {}, False),
                    ("null", {"create1080pPreviewComp": None}, False),
                    ("false", {"create1080pPreviewComp": False}, False),
                    ("true", {"create1080pPreviewComp": True}, True),
                ):
                    with self.subTest(command_id=command_id, config_case=config_case):
                        context = Context(command_id, str(ae_path), "  Shot  ", overrides)
                        success = {
                            "ok": True,
                            "code": "exported",
                            "mode": mode,
                            "target_policy": target_policy,
                            "media_policy": media_policy,
                            "clip_count": 2,
                            "message": "Sent 2 Clips",
                        }
                        with patch.object(
                            resolve2ae_export, "process_and_send", return_value=success
                        ) as process:
                            self.assertEqual(resolve2ae_export.execute(context), success)
                        self.assertEqual(process.call_args.args[:3], (
                            "resolve", "project", str(ae_path)
                        ))
                        self.assertEqual(process.call_args.args[4], {
                            "prefix": "Shot",
                            "debug_mode": False,
                            "create1080pPreviewComp": expected_value,
                        })
                        self.assertEqual(process.call_args.args[5:], (mode, target_policy, media_policy))

    def test_uses_default_prefix_and_propagates_controlled_failures(self):
        with tempfile.TemporaryDirectory() as directory:
            ae_path = Path(directory, "AfterFX.exe")
            ae_path.touch()
            context = Context("timeline.exportToAfterEffects", str(ae_path))
            failed = {
                "ok": False,
                "code": "no-clips",
                "mode": "auto",
                "target_policy": "auto",
                "media_policy": "mixed",
                "clip_count": 0,
                "message": "No Clips",
            }
            with patch.object(
                resolve2ae_export, "process_and_send", return_value=failed
            ) as process:
                with self.assertRaisesRegex(RuntimeError, "No Clips"):
                    resolve2ae_export.execute(context)
            self.assertEqual(process.call_args.args[4]["prefix"], "Link")

        with self.assertRaisesRegex(ValueError, "existing executable file"):
            resolve2ae_export.execute(Context("timeline.exportToAfterEffects", "missing.exe"))
        with self.assertRaisesRegex(ValueError, "Unsupported After Effects export Command"):
            resolve2ae_export.execute(Context("unknown.command", "missing.exe"))
        for retired in (
            "timeline.exportCurrentToAfterEffects",
            "timeline.exportBlueRangeToAfterEffects",
            "timeline.exportCyanRangeToAfterEffects",
        ):
            with self.assertRaisesRegex(ValueError, "Unsupported After Effects export Command"):
                resolve2ae_export.execute(Context(retired, str(ae_path)))


if __name__ == "__main__":
    unittest.main()
