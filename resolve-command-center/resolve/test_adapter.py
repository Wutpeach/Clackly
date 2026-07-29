import unittest
from unittest.mock import patch

from resolve.adapter import (
    ResolveAdapterError,
    add_marker,
    current_timeline_frame,
    parse_frame_rate,
    timecode_to_frames,
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


class ResolveAdapterTests(unittest.TestCase):
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
