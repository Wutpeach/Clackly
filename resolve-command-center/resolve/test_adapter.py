import importlib
import os
import sys
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

from resolve.adapter import (
    ResolveAdapterError,
    _add_resolve_module_paths,
    add_marker,
    current_timeline_frame,
    parse_frame_rate,
    read_timeline_markers,
    read_timeline_start_frame,
    timecode_to_frames,
    get_resolve,
    get_current_project_name,
    import_media_to_bin,
)


class FakeTimeline:
    def __init__(self, current, start, start_frame=86400, end_frame=90000):
        self.current = current
        self.start = start
        self.start_frame = start_frame
        self.end_frame = end_frame

    def GetCurrentTimecode(self):
        return self.current

    def GetStartTimecode(self):
        return self.start

    def GetStartFrame(self):
        return self.start_frame

    def GetEndFrame(self):
        return self.end_frame

    def GetSetting(self, name):
        return "24" if name == "timelineFrameRate" else None


class FakeMarkerTimeline(FakeTimeline):
    def __init__(self, added=True, markers=None, error=None):
        super().__init__("01:00:10:00", "01:00:00:00")
        self.added = added
        self.markers = markers or {}
        self.error = error
        self.add_marker_args = None

    def AddMarker(self, *args):
        self.add_marker_args = args
        if self.error is not None:
            raise self.error
        return self.added

    def GetMarkers(self):
        return self.markers


class FakeFolder:
    def __init__(self, name, children=None):
        self.name = name
        self.children = children or []

    def GetName(self):
        return self.name

    def GetSubFolderList(self):
        return {index: child for index, child in enumerate(self.children)}


class FakeMediaPool:
    def __init__(self, existing=True, import_result=None):
        self.original = FakeFolder("Original")
        self.clipboard = FakeFolder("Clipboard")
        self.root = FakeFolder("Root", [self.clipboard] if existing else [])
        self.import_result = [{}] if import_result is None else import_result
        self.calls = []

    def GetRootFolder(self):
        return self.root

    def GetCurrentFolder(self):
        return self.original

    def AddSubFolder(self, parent, name):
        self.calls.append(("AddSubFolder", parent, name))
        return self.clipboard

    def SetCurrentFolder(self, folder):
        self.calls.append(("SetCurrentFolder", folder))
        return True

    def ImportMedia(self, paths):
        self.calls.append(("ImportMedia", paths))
        if isinstance(self.import_result, Exception):
            raise self.import_result
        return self.import_result


class ResolveAdapterTests(unittest.TestCase):
    def test_reads_current_project_name_with_safe_fallback(self):
        named = SimpleNamespace(GetName=lambda: "Demo Project")
        unnamed = SimpleNamespace(GetName=lambda: "")
        with patch("resolve.adapter.get_current_project", return_value=named):
            self.assertEqual(get_current_project_name(), {"projectName": "Demo Project"})
        with patch("resolve.adapter.get_current_project", return_value=unnamed):
            self.assertEqual(get_current_project_name(), {"projectName": "Untitled Project"})

    def test_media_pool_import_reuses_bin_and_restores_original_folder(self):
        media_pool = FakeMediaPool(existing=True)
        project = SimpleNamespace(GetMediaPool=lambda: media_pool)
        with patch("resolve.adapter.get_current_project", return_value=project):
            result = import_media_to_bin("C:/Pictures/image.png", "Clipboard")

        self.assertEqual(result, {"mediaPoolBin": "Clipboard"})
        self.assertEqual(media_pool.calls, [
            ("SetCurrentFolder", media_pool.clipboard),
            ("ImportMedia", ["C:/Pictures/image.png"]),
            ("SetCurrentFolder", media_pool.original),
        ])

    def test_media_pool_import_creates_missing_bin(self):
        media_pool = FakeMediaPool(existing=False)
        project = SimpleNamespace(GetMediaPool=lambda: media_pool)
        with patch("resolve.adapter.get_current_project", return_value=project):
            import_media_to_bin("C:/Pictures/image.png", "Clipboard")
        self.assertEqual(media_pool.calls[0][0], "AddSubFolder")

    def test_media_pool_import_failure_still_restores_original_folder(self):
        media_pool = FakeMediaPool(import_result=RuntimeError("native import failure"))
        project = SimpleNamespace(GetMediaPool=lambda: media_pool)
        with (
            patch("resolve.adapter.get_current_project", return_value=project),
            self.assertRaises(ResolveAdapterError) as raised,
        ):
            import_media_to_bin("C:/Pictures/image.png", "Clipboard")
        self.assertEqual(raised.exception.code, "media-pool-import-failed")
        self.assertEqual(media_pool.calls[-1], ("SetCurrentFolder", media_pool.original))

    def test_reads_raw_timeline_range_facts_without_normalizing_them(self):
        timeline = FakeMarkerTimeline(markers={"20": {"color": "Blue", "duration": 24}})
        timeline.start_frame = None

        self.assertIsNone(read_timeline_start_frame(timeline))
        self.assertIs(read_timeline_markers(timeline), timeline.markers)

    def test_raw_timeline_range_fact_errors_propagate_unchanged(self):
        start_error = RuntimeError("start failed")
        marker_error = RuntimeError("markers failed")
        timeline = FakeMarkerTimeline()
        timeline.GetStartFrame = lambda: (_ for _ in ()).throw(start_error)
        timeline.GetMarkers = lambda: (_ for _ in ()).throw(marker_error)

        with self.assertRaises(RuntimeError) as raised_start:
            read_timeline_start_frame(timeline)
        self.assertIs(raised_start.exception, start_error)
        with self.assertRaises(RuntimeError) as raised_markers:
            read_timeline_markers(timeline)
        self.assertIs(raised_markers.exception, marker_error)

    def test_uses_an_already_importable_resolve_module(self):
        module = SimpleNamespace(scriptapp=lambda name: "resolve" if name == "Resolve" else None)
        with patch.dict(sys.modules, {"bmd": None, "DaVinciResolveScript": module}):
            self.assertEqual(get_resolve(), "resolve")

    def test_wraps_resolve_module_connection_errors(self):
        def fail(_name):
            raise RuntimeError("native connection failed")

        module = SimpleNamespace(scriptapp=fail)
        with patch.dict(sys.modules, {"bmd": None, "DaVinciResolveScript": module}):
            with self.assertRaisesRegex(ResolveAdapterError, "scripting API is unavailable"):
                get_resolve()

    def test_adds_configured_and_standard_windows_module_paths_once(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            configured = root / "configured" / "Modules"
            standard = (
                root
                / "Blackmagic Design"
                / "DaVinci Resolve"
                / "Support"
                / "Developer"
                / "Scripting"
                / "Modules"
            )
            configured.mkdir(parents=True)
            standard.mkdir(parents=True)
            original_path = list(sys.path)
            try:
                with patch.dict(os.environ, {
                    "RESOLVE_SCRIPT_API": str(configured.parent),
                    "PROGRAMDATA": str(root),
                }, clear=False):
                    _add_resolve_module_paths()
                    _add_resolve_module_paths()
                self.assertEqual(sys.path.count(str(configured)), 1)
                self.assertEqual(sys.path.count(str(standard)), 1)
                self.assertLess(sys.path.index(str(configured)), sys.path.index(str(standard)))
            finally:
                sys.path[:] = original_path

    def test_discovers_resolve_module_from_configured_path(self):
        with tempfile.TemporaryDirectory() as directory:
            scripting = Path(directory, "Scripting")
            modules = scripting / "Modules"
            modules.mkdir(parents=True)
            (modules / "DaVinciResolveScript.py").write_text(
                "def scriptapp(name):\n    return 'configured-resolve'\n",
                encoding="utf-8",
            )
            original_path = list(sys.path)
            sys.modules.pop("DaVinciResolveScript", None)
            importlib.invalidate_caches()
            try:
                with (
                    patch.dict(os.environ, {
                        "RESOLVE_SCRIPT_API": str(scripting),
                        "PROGRAMDATA": str(Path(directory, "missing")),
                    }, clear=False),
                    patch.dict(sys.modules, {"bmd": None}),
                ):
                    self.assertEqual(get_resolve(), "configured-resolve")
            finally:
                sys.path[:] = original_path
                sys.modules.pop("DaVinciResolveScript", None)

    def test_discovers_resolve_module_from_standard_windows_path(self):
        with tempfile.TemporaryDirectory() as directory:
            modules = (
                Path(directory)
                / "Blackmagic Design"
                / "DaVinci Resolve"
                / "Support"
                / "Developer"
                / "Scripting"
                / "Modules"
            )
            modules.mkdir(parents=True)
            (modules / "DaVinciResolveScript.py").write_text(
                "def scriptapp(name):\n    return 'standard-resolve'\n",
                encoding="utf-8",
            )
            original_path = list(sys.path)
            sys.modules.pop("DaVinciResolveScript", None)
            importlib.invalidate_caches()
            try:
                with (
                    patch.dict(os.environ, {"PROGRAMDATA": directory}, clear=False),
                    patch.dict(sys.modules, {"bmd": None}),
                ):
                    os.environ.pop("RESOLVE_SCRIPT_API", None)
                    self.assertEqual(get_resolve(), "standard-resolve")
            finally:
                sys.path[:] = original_path
                sys.modules.pop("DaVinciResolveScript", None)

    def test_missing_resolve_module_remains_a_controlled_error(self):
        with (
            patch.dict(os.environ, {
                "RESOLVE_SCRIPT_API": "Z:/missing-resolve-api",
                "PROGRAMDATA": "Z:/missing-program-data",
            }, clear=False),
            patch.dict(sys.modules, {"bmd": None, "DaVinciResolveScript": None}),
        ):
            with self.assertRaisesRegex(ResolveAdapterError, "scripting API is unavailable"):
                get_resolve()

    def test_returns_frame_relative_to_timeline_start(self):
        timeline = FakeTimeline("01:00:10:00", "01:00:00:00")
        self.assertEqual(current_timeline_frame(object(), timeline), (240, "01:00:10:00"))

    def test_accounts_for_drop_frame_timecode(self):
        timeline = FakeTimeline("01:01:00;02", "01:00:00;00")
        timeline.GetSetting = lambda name: "30000/1001"
        self.assertEqual(current_timeline_frame(object(), timeline)[0], 1800)

        timeline.current = "01:10:00;00"
        timeline.end_frame = timeline.start_frame + 20000
        self.assertEqual(current_timeline_frame(object(), timeline)[0], 17982)

        timeline.current = "01:01:00;04"
        timeline.end_frame = timeline.start_frame + 5000
        timeline.GetSetting = lambda name: "60000/1001"
        self.assertEqual(current_timeline_frame(object(), timeline)[0], 3600)

        timeline.current = "01:10:00;00"
        timeline.end_frame = timeline.start_frame + 40000
        self.assertEqual(current_timeline_frame(object(), timeline)[0], 35964)

    def test_rejects_frame_labels_skipped_by_drop_frame_timecode(self):
        frame_rate = parse_frame_rate("30000/1001")
        with self.assertRaisesRegex(
            ResolveAdapterError, "Invalid drop-frame timeline timecode"
        ):
            timecode_to_frames("01:01:00;00", frame_rate)

        frame_rate = parse_frame_rate("60000/1001")
        with self.assertRaisesRegex(
            ResolveAdapterError, "Invalid drop-frame timeline timecode"
        ):
            timecode_to_frames("01:01:00;03", frame_rate)

    def test_rejects_playhead_before_timeline_start(self):
        timeline = FakeTimeline("00:59:59:23", "01:00:00:00")
        with self.assertRaisesRegex(ResolveAdapterError, "before timeline start"):
            current_timeline_frame(object(), timeline)

    def test_parses_fractional_frame_rate(self):
        self.assertAlmostEqual(parse_frame_rate("30000/1001"), 29.97002997)

    def test_rejects_missing_and_malformed_frame_rates(self):
        with self.assertRaisesRegex(ResolveAdapterError, "Could not read"):
            parse_frame_rate(None)
        with self.assertRaisesRegex(ResolveAdapterError, "Unsupported"):
            parse_frame_rate("30000/0")
        with self.assertRaisesRegex(ResolveAdapterError, "Unsupported"):
            parse_frame_rate("30000/1001/2")

    def test_add_marker_passes_timeline_relative_frame(self):
        timeline = FakeMarkerTimeline()
        with patch("resolve.adapter.get_project_and_timeline", return_value=(object(), timeline)):
            result = add_marker()

        self.assertEqual(result, {"frame": 240})
        self.assertEqual(
            timeline.add_marker_args,
            (
                240,
                "Red",
                "Clackly Marker",
                "Added from Clackly",
                1,
                "clackly",
            ),
        )

    def test_add_marker_reports_duplicate_at_relative_frame(self):
        timeline = FakeMarkerTimeline(added=False, markers={240.0: {}})
        with patch("resolve.adapter.get_project_and_timeline", return_value=(object(), timeline)):
            with self.assertRaisesRegex(
                ResolveAdapterError, "already exists.*timeline-relative frame 240"
            ):
                add_marker()

    def test_add_marker_wraps_resolve_api_errors_with_position(self):
        timeline = FakeMarkerTimeline(error=RuntimeError("native failure"))
        with patch("resolve.adapter.get_project_and_timeline", return_value=(object(), timeline)):
            with self.assertRaisesRegex(
                ResolveAdapterError,
                "01:00:10:00.*timeline-relative frame 240.*native failure",
            ):
                add_marker()


if __name__ == "__main__":
    unittest.main()
