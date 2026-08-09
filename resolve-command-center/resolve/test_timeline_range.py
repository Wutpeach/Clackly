import unittest

from resolve.timeline_range import (
    RESOLVE_DURATION_MARKER_SOURCE,
    TimelineRange,
    TimelineRangeScanError,
    resolve_timeline_range,
)


class TimelineRangeTests(unittest.TestCase):
    def test_value_requires_integer_non_empty_half_open_frames(self):
        value = TimelineRange(10, 20)
        self.assertEqual(value.start_frame, 10)
        self.assertEqual(value.end_frame_exclusive, 20)
        self.assertEqual(value.source, RESOLVE_DURATION_MARKER_SOURCE)
        self.assertEqual(TimelineRange(-10, -5).start_frame, -10)

        for start, end in ((1.5, 2), (1, 2.5), (True, 2), (1, False)):
            with self.subTest(start=start, end=end):
                with self.assertRaisesRegex(TypeError, "integer frames"):
                    TimelineRange(start, end)
        for start, end in ((2, 2), (3, 2)):
            with self.subTest(start=start, end=end):
                with self.assertRaisesRegex(ValueError, "greater than start_frame"):
                    TimelineRange(start, end)
        with self.assertRaisesRegex(ValueError, "Unsupported TimelineRange source"):
            TimelineRange(1, 2, "future-source")

    def test_resolves_lowest_numeric_blue_duration_marker_to_absolute_frames(self):
        markers = {
            "100": {"color": "Blue", "duration": 24},
            "5": {"color": "Blue", "duration": 1},
            "20": {"color": "Blue", "duration": "5"},
            "10": {"color": "Cyan", "duration": 24},
        }
        expected = TimelineRange(1020, 1025)
        self.assertEqual(resolve_timeline_range(1000, markers), expected)
        self.assertEqual(resolve_timeline_range(1000, dict(reversed(list(markers.items())))), expected)

    def test_ignores_malformed_info_duration_points_and_other_colors(self):
        markers = {
            "bad-info": None,
            "bad-duration": {"color": "Blue", "duration": "bad"},
            "point": {"color": "Blue", "duration": 1},
            "cyan": {"color": "Cyan", "duration": 24},
            "red": {"color": "Red", "duration": 24},
        }
        self.assertIsNone(resolve_timeline_range(0, markers))
        self.assertIsNone(resolve_timeline_range(0, None))

    def test_none_timeline_start_uses_legacy_86400_offset_and_exclusive_end(self):
        self.assertEqual(
            resolve_timeline_range(None, {"10": {"color": "Blue", "duration": 2}}),
            TimelineRange(86410, 86412),
        )

    def test_malformed_qualifying_frame_preserves_partial_candidate_for_consumer_policy(self):
        with self.assertRaises(TimelineRangeScanError) as raised:
            resolve_timeline_range(1000, {
                "20": {"color": "Blue", "duration": 24},
                "bad-frame": {"color": "Blue", "duration": 24},
            })

        self.assertIsInstance(raised.exception.cause, ValueError)
        self.assertEqual(
            raised.exception.resolve_partial(1000),
            TimelineRange(1020, 1044),
        )

        with self.assertRaises(TimelineRangeScanError) as first_raised:
            resolve_timeline_range(1000, {
                "bad-frame": {"color": "Blue", "duration": 24},
                "20": {"color": "Blue", "duration": 24},
            })
        self.assertIsNone(first_raised.exception.resolve_partial(1000))


if __name__ == "__main__":
    unittest.main()
