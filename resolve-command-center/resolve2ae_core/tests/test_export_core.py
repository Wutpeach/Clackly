from __future__ import annotations

from contextlib import ExitStack
import json
import shutil
import unittest
from pathlib import Path
from unittest.mock import patch

from resolve2ae_core import export as export_core


SNAPSHOT_DIR = Path(__file__).resolve().parent / "fixtures" / "export_snapshots_baseline"
WORK_DIR = Path(__file__).resolve().parent / "_tmp_export_core"
FIXED_TIME = 1700000000
AE_PATH = "C:/Program Files/Adobe/AfterFX.exe"


class FakeMediaPoolItem:
    def __init__(self, file_path: str, resolution: str = "1920x1080", input_lut: str = "") -> None:
        self._props = {
            "File Path": file_path,
            "Resolution": resolution,
            "Input LUT": input_lut,
        }

    def GetClipProperty(self, key: str) -> str:
        return self._props.get(key, "")


class FakeAudioItem:
    def __init__(
        self,
        start: int,
        end: int,
        *,
        name: str = "Audio",
        track_index: int = 1,
        enabled: bool = True,
        mapping: dict | None = None,
    ) -> None:
        self._start = start
        self._end = end
        self._name = name
        self._track_index = track_index
        self._enabled = enabled
        self._mapping = mapping

    def GetStart(self) -> int:
        return self._start

    def GetEnd(self) -> int:
        return self._end

    def GetName(self) -> str:
        return self._name

    def GetTrackTypeAndIndex(self) -> tuple[str, int]:
        return ("audio", self._track_index)

    def GetClipEnabled(self) -> bool:
        return self._enabled

    def GetSourceAudioChannelMapping(self):
        return self._mapping


class FakeVideoItem:
    def __init__(
        self,
        *,
        start: int,
        end: int,
        name: str = "Clip",
        track_index: int = 1,
        file_path: str = "C:/media/clip.mov",
        resolution: str = "1920x1080",
        input_lut: str = "",
        linked_items: list | None = None,
        enabled: bool = True,
        left_offset: int = 0,
        duration: int | None = None,
    ) -> None:
        self._start = start
        self._end = end
        self._name = name
        self._track_index = track_index
        self._media = FakeMediaPoolItem(file_path, resolution, input_lut)
        self._linked_items = linked_items or []
        self._enabled = enabled
        self._left_offset = left_offset
        self._duration = duration if duration is not None else (end - start)

    def GetClipEnabled(self) -> bool:
        return self._enabled

    def GetStart(self) -> int:
        return self._start

    def GetEnd(self) -> int:
        return self._end

    def GetName(self) -> str:
        return self._name

    def GetTrackTypeAndIndex(self) -> tuple[str, int]:
        return ("video", self._track_index)

    def GetLinkedItems(self) -> list:
        return list(self._linked_items)

    def GetMediaPoolItem(self) -> FakeMediaPoolItem:
        return self._media

    def GetLeftOffset(self) -> int:
        return self._left_offset

    def GetDuration(self) -> int:
        return self._duration


class FakeTimelineAudioItem(FakeAudioItem):
    def __init__(
        self,
        *,
        start: int,
        end: int,
        name: str = "Audio",
        track_index: int = 1,
        file_path: str = "C:/media/audio.wav",
        enabled: bool = True,
        left_offset: int = 0,
        duration: int | None = None,
    ) -> None:
        super().__init__(start, end, name=name, track_index=track_index, enabled=enabled)
        self._media = FakeMediaPoolItem(file_path, "0x0", "")
        self._left_offset = left_offset
        self._duration = duration if duration is not None else (end - start)

    def GetMediaPoolItem(self) -> FakeMediaPoolItem:
        return self._media

    def GetLeftOffset(self) -> int:
        return self._left_offset

    def GetDuration(self) -> int:
        return self._duration

    def GetLinkedItems(self) -> list:
        return []


class FakeTimeline:
    def __init__(
        self,
        *,
        video_tracks: dict[int, list],
        audio_tracks: dict[int, list] | None = None,
        disabled_tracks: dict[str, set[int]] | None = None,
        markers: dict | None = None,
        export_payload: dict | None = None,
        export_success: bool = True,
        name: str = "Timeline",
        fps: str = "24",
        start_frame: int = 0,
        resolution: tuple[str, str] = ("1920", "1080"),
        current_tc: str = "00:00:00:00",
    ) -> None:
        self.video_tracks = video_tracks
        self.audio_tracks = audio_tracks or {}
        self.disabled_tracks = disabled_tracks or {}
        self.markers = markers or {}
        self.export_payload = export_payload
        self.export_success = export_success
        self.name = name
        self.fps = fps
        self.start_frame = start_frame
        self.resolution = resolution
        self.current_tc = current_tc

    def GetSetting(self, key: str) -> str:
        return {
            "timelineFrameRate": self.fps,
            "timelineResolutionWidth": self.resolution[0],
            "timelineResolutionHeight": self.resolution[1],
        }.get(key, "")

    def GetStartFrame(self) -> int:
        return self.start_frame

    def GetMarkers(self) -> dict:
        return self.markers

    def GetCurrentTimecode(self) -> str:
        return self.current_tc

    def GetTrackCount(self, track_type: str) -> int:
        tracks = self.video_tracks if track_type == "video" else self.audio_tracks
        return max(tracks.keys()) if tracks else 0

    def GetIsTrackEnabled(self, track_type: str, track_index: int) -> bool:
        return track_index not in self.disabled_tracks.get(track_type, set())

    def GetItemListInTrack(self, track_type: str, track_index: int) -> list:
        tracks = self.video_tracks if track_type == "video" else self.audio_tracks
        return list(tracks.get(track_index, []))

    def Export(self, path: str, *_args) -> bool:
        if not self.export_success:
            return False
        with open(path, "w", encoding="utf-8") as handle:
            json.dump(self.export_payload or {}, handle, ensure_ascii=False)
        return True

    def GetName(self) -> str:
        return self.name


class FakeProject:
    def __init__(self, timeline) -> None:
        self.timeline = timeline

    def GetCurrentTimeline(self):
        return self.timeline


class FakeResolve:
    EXPORT_OTIO = 1
    EXPORT_NONE = 0


class FakeMissingMediaVideoItem(FakeVideoItem):
    def GetMediaPoolItem(self):
        return None


class FakeAudioItemWithoutTrackIndex(FakeAudioItem):
    def GetTrackTypeAndIndex(self):
        return ("audio",)


class BrokenLinkedInfoItem:
    def GetTrackTypeAndIndex(self):
        raise RuntimeError("broken linked item")


class BrokenLinkedItemsVideoItem(FakeVideoItem):
    def GetLinkedItems(self) -> list:
        raise RuntimeError("linked items unavailable")


class CaptureOpen:
    def __init__(self) -> None:
        self.writes: dict[str, str] = {}

    def __call__(self, path, mode="r", *args, **kwargs):
        path = str(path)
        if "w" in mode and path.endswith(".jsx"):
            outer = self

            class _Writer:
                def __enter__(self):
                    self.parts: list[str] = []
                    return self

                def write(self, data: str) -> int:
                    self.parts.append(data)
                    return len(data)

                def __exit__(self, exc_type, exc, tb) -> bool:
                    outer.writes[path] = "".join(self.parts)
                    return False

            return _Writer()
        return open(path, mode, *args, **kwargs)


def build_otio_clip(name: str = "ClipA", *, props: list[dict] | None = None, effects: list[dict] | None = None) -> dict:
    base_transform = {
        "OTIO_SCHEMA": "Effect.1",
        "metadata": {
            "Resolve_OTIO": {
                "Effect Name": "Transform",
                "Parameters": [
                    {"Parameter ID": "ZoomX", "Parameter Value": 1.0},
                    {"Parameter ID": "ZoomY", "Parameter Value": 1.0},
                    {"Parameter ID": "Pan", "Parameter Value": 0.0},
                    {"Parameter ID": "Tilt", "Parameter Value": 0.0},
                    {"Parameter ID": "RotationAngle", "Parameter Value": 0.0},
                    {"Parameter ID": "AnchorPoint", "Parameter Value": [0.0, 0.0]},
                ],
            }
        },
    }
    effect_list = [base_transform]
    if props:
        effect_list[0]["metadata"]["Resolve_OTIO"]["Parameters"] = props
    if effects:
        effect_list.extend(effects)
    return {
        "OTIO_SCHEMA": "Clip.2",
        "name": name,
        "source_range": {"duration": {"value": 24, "rate": 24}},
        "effects": effect_list,
    }


def wrap_tracks(*clips: dict) -> dict:
    return {"tracks": {"children": [{"kind": "Video", "children": list(clips)}]}}


def build_props(**overrides) -> dict:
    props = {
        "blend_mode": 0,
        "opacity": 100.0,
        "pan": 0.0,
        "tilt": 0.0,
        "anchor_x": 0.0,
        "anchor_y": 0.0,
        "flip_x": False,
        "flip_y": False,
        "zoom_x": 1.0,
        "zoom_y": 1.0,
        "rotation": 0.0,
        "crop_left": 0.0,
        "crop_right": 0.0,
        "crop_top": 0.0,
        "crop_bottom": 0.0,
        "distortion": 0.0,
        "time_scalar": 1.0,
        "speed_keyframes": None,
        "dynamic_zoom_keyframes": None,
    }
    props.update(overrides)
    return props


class ExportCoreSnapshotTests(unittest.TestCase):
    maxDiff = None

    @classmethod
    def setUpClass(cls) -> None:
        WORK_DIR.mkdir(parents=True, exist_ok=True)

    def setUp(self) -> None:
        self.capture_open = CaptureOpen()
        self.popen_calls: list[dict] = []

    def _case_dir(self, case_name: str) -> Path:
        case_dir = WORK_DIR / case_name
        if case_dir.exists():
            shutil.rmtree(case_dir)
        case_dir.mkdir(parents=True, exist_ok=True)
        return case_dir

    def _run_export(
        self,
        case_name: str,
        timeline,
        config: dict | None,
        *,
        ae_path: str = AE_PATH,
        lut_lookup: str | None = None,
        lut_copy: str | None = None,
        load_config_result: dict | None = None,
        parse_result: tuple[dict, list] | None = None,
        props_result: tuple[dict, str] | None = None,
        print_output: list[str] | None = None,
    ) -> dict:
        case_dir = self._case_dir(case_name)
        statuses: list[str] = []
        config_payload = dict(config) if config is not None else None

        with ExitStack() as stack:
            stack.enter_context(patch("resolve2ae_core.export.time.time", return_value=FIXED_TIME))
            stack.enter_context(patch("resolve2ae_core.export.find_lut_file", side_effect=lambda _name: lut_lookup))
            stack.enter_context(patch("resolve2ae_core.export.copy_lut_to_ae", side_effect=lambda _src, _dest: lut_copy))
            stack.enter_context(patch("resolve2ae_core.export.tempfile.gettempdir", return_value=str(case_dir)))
            stack.enter_context(patch("resolve2ae_core.export.open", new=self.capture_open, create=True))
            if load_config_result is not None:
                stack.enter_context(patch("resolve2ae_core.export.load_config", return_value=load_config_result))
            if parse_result is not None:
                stack.enter_context(patch("resolve2ae_core.export.parse_otio_robust", return_value=parse_result))
            if props_result is not None:
                stack.enter_context(patch("resolve2ae_core.export.find_props_dual_lock", return_value=props_result))
            if print_output is not None:
                stack.enter_context(
                    patch(
                        "builtins.print",
                        side_effect=lambda *args, **kwargs: print_output.append(" ".join(str(arg) for arg in args)),
                    )
                )

            result = export_core.process_and_send(
                FakeResolve(), FakeProject(timeline), ae_path, statuses.append, config_payload
            )

        launch = result.get("__clacklyDesktopLaunch", {})
        return {
            "statuses": statuses,
            "jsx": launch.get("jsx", ""),
            "popen_calls": self.popen_calls,
            "result": result,
        }

    def _normalize_snapshot_payload(self, payload: dict) -> dict:
        normalized_calls = []
        for call in payload.get("popen_calls", []):
            args = list(call.get("args", []))
            if args and isinstance(args[-1], str) and args[-1].endswith(".jsx"):
                jsx_path = Path(args[-1])
                args[-1] = (Path(jsx_path.parent.name) / jsx_path.name).as_posix()
            normalized_calls.append({"args": args, "kwargs": call.get("kwargs", {})})
        return {
            "statuses": payload.get("statuses", []),
            "jsx": payload.get("jsx", ""),
            "popen_calls": normalized_calls,
        }

    def _assert_matches_snapshot(self, snapshot_name: str, actual: dict) -> None:
        expected = json.loads((SNAPSHOT_DIR / f"{snapshot_name}.json").read_text(encoding="utf-8"))
        self.assertEqual(actual["jsx"], expected["jsx"])
        self.assertEqual(actual["statuses"], expected["statuses"][:-2])
        self.assertEqual(actual["popen_calls"], [])

    def test_single_video_otio_success_matches_snapshot(self) -> None:
        clip = FakeVideoItem(start=0, end=24, name="ClipA")
        timeline = FakeTimeline(video_tracks={1: [clip]}, export_payload=wrap_tracks(build_otio_clip()))
        actual = self._run_export(
            "single_video_otio_success",
            timeline,
            {"prefix": "Link", "debug_mode": False, "last_known_ae_path": ""},
        )
        self._assert_matches_snapshot("single_video_otio_success", actual)
        public_result = dict(actual["result"])
        launch = public_result.pop("__clacklyDesktopLaunch")
        self.assertEqual(public_result, {
            "ok": True,
            "code": "exported",
            "mode": "auto",
            "target_policy": "auto",
            "media_policy": "mixed",
            "clip_count": 1,
            "message": "Sent 1 Clips",
        })
        self.assertEqual(launch["type"], "after-effects-jsx")
        self.assertEqual(launch["args"], ["-r", "$CLACKLY_JSX"])

    def test_single_video_otio_fallback_matches_snapshot(self) -> None:
        clip = FakeVideoItem(start=0, end=24, name="ClipA")
        timeline = FakeTimeline(video_tracks={1: [clip]}, export_payload=wrap_tracks(build_otio_clip()), export_success=False)
        actual = self._run_export(
            "single_video_otio_fallback",
            timeline,
            {"prefix": "Link", "debug_mode": False, "last_known_ae_path": ""},
        )
        self._assert_matches_snapshot("single_video_otio_fallback", actual)

    def test_mixed_video_audio_matches_snapshot(self) -> None:
        linked_audio = FakeAudioItem(0, 24, track_index=1, mapping={"track_mapping": {"1": {"mute": False}}})
        video_with_audio = FakeVideoItem(start=0, end=24, name="ClipMixV", linked_items=[linked_audio])
        audio_clip = FakeTimelineAudioItem(start=0, end=24, name="ClipMixA", track_index=1)
        timeline = FakeTimeline(
            video_tracks={1: [video_with_audio]},
            audio_tracks={1: [audio_clip]},
            markers={0: {"color": "Blue", "duration": 24}},
        )
        actual = self._run_export(
            "mixed_video_audio",
            timeline,
            {"prefix": "Link", "debug_mode": False, "last_known_ae_path": ""},
        )
        self._assert_matches_snapshot("mixed_video_audio", actual)

    def test_mixed_single_and_mixed_blue_run_video_otio_enrichment(self) -> None:
        transform_params = [
            {"Parameter ID": "ZoomX", "Parameter Value": 1.2},
            {"Parameter ID": "ZoomY", "Parameter Value": 0.9},
            {"Parameter ID": "Pan", "Parameter Value": 0.1},
            {"Parameter ID": "Tilt", "Parameter Value": -0.2},
            {"Parameter ID": "RotationAngle", "Parameter Value": 5.0},
            {"Parameter ID": "AnchorPoint", "Parameter Value": [0.05, -0.03]},
        ]
        crop_effect = {
            "OTIO_SCHEMA": "Effect.1",
            "metadata": {
                "Resolve_OTIO": {
                    "Effect Name": "Cropping",
                    "Parameters": [
                        {"Parameter ID": "CropLeft", "Parameter Value": 0.1},
                        {"Parameter ID": "CropRight", "Parameter Value": 0.05},
                        {"Parameter ID": "CropTop", "Parameter Value": 0.02},
                        {"Parameter ID": "CropBottom", "Parameter Value": 0.03},
                    ],
                }
            },
        }
        distortion_effect = {
            "OTIO_SCHEMA": "Effect.1",
            "metadata": {
                "Resolve_OTIO": {
                    "Effect Name": "Lens Correction",
                    "Parameters": [{"Parameter ID": "distortionParam", "Parameter Value": 0.2}],
                }
            },
        }
        speed_effect = {
            "OTIO_SCHEMA": "TimeEffect.1",
            "metadata": {"Resolve_OTIO": {"Key Frames": [[0.0, 0.0], [0.5, 0.25], [1.0, 1.0]]}},
        }
        standalone_audio = FakeTimelineAudioItem(start=0, end=24, name="StandaloneA", track_index=1)
        clip = FakeVideoItem(start=0, end=24, name="ClipMixFX", track_index=1)
        timeline = FakeTimeline(
            video_tracks={1: [clip]},
            audio_tracks={1: [standalone_audio]},
            export_payload=wrap_tracks(build_otio_clip(
                "ClipMixFX",
                props=transform_params,
                effects=[crop_effect, distortion_effect, speed_effect],
            )),
        )
        actual = self._run_export(
            "mixed_single_otio_enrichment",
            timeline,
            {"prefix": "Link", "debug_mode": False, "last_known_ae_path": ""},
        )
        self.assertEqual(
            ["Analyzing...", "Exporting OTIO...", "Parsing Data..."],
            actual["statuses"],
        )
        self.assertIn("layer.timeRemapEnabled = true;", actual["jsx"])
        self.assertIn("// Crop Mask", actual["jsx"])
        self.assertIn("// Lens Correction -> Optics Compensation", actual["jsx"])
        self.assertIn("layer.property('Scale').setValue([", actual["jsx"])
        self.assertIn("// Clip: StandaloneA", actual["jsx"])

        blue_timeline = FakeTimeline(
            video_tracks={1: [clip]},
            audio_tracks={1: [standalone_audio]},
            markers={0: {"color": "Blue", "duration": 24}},
            export_payload=wrap_tracks(build_otio_clip(
                "ClipMixFX",
                props=transform_params,
                effects=[crop_effect, distortion_effect, speed_effect],
            )),
        )
        actual = self._run_export(
            "mixed_blue_otio_enrichment",
            blue_timeline,
            {"prefix": "Link", "debug_mode": False, "last_known_ae_path": ""},
        )
        self.assertEqual(
            ["Analyzing...", "Exporting OTIO...", "Parsing Data..."],
            actual["statuses"],
        )
        self.assertIn("var comp = app.project.items.addComp('Link_Timeline_batch_1700000000'", actual["jsx"])
        self.assertIn("// Crop Mask", actual["jsx"])
        self.assertIn("// Lens Correction -> Optics Compensation", actual["jsx"])
        self.assertIn("layer.timeRemapEnabled = true;", actual["jsx"])

    def test_video_only_export_mutes_every_video_layer_with_linked_audio(self) -> None:
        linked_audio = FakeAudioItem(0, 24, track_index=1, mapping={"track_mapping": {"1": {"mute": False}}})
        first = FakeVideoItem(start=0, end=24, name="ClipV1", track_index=1, linked_items=[linked_audio])
        second = FakeVideoItem(start=0, end=24, name="ClipV2", track_index=2)
        timeline = FakeTimeline(
            video_tracks={1: [first], 2: [second]},
            audio_tracks={1: [linked_audio]},
            markers={0: {"color": "Blue", "duration": 24}},
        )
        statuses: list[str] = []
        result = export_core.process_and_send(
            FakeResolve(),
            FakeProject(timeline),
            AE_PATH,
            statuses.append,
            {"prefix": "Link", "debug_mode": False},
            "video-only",
            "auto",
            "video",
        )
        jsx = result["__clacklyDesktopLaunch"]["jsx"]
        self.assertIn("// Clip: ClipV1", jsx)
        self.assertIn("// Clip: ClipV2", jsx)
        self.assertNotIn("// Clip: [Audio]", jsx)
        self.assertNotIn("layer.enabled = false;", jsx)
        self.assertGreaterEqual(jsx.count("layer.audioEnabled = false;"), 2)

    def test_video_with_lut_matches_snapshot(self) -> None:
        clip = FakeVideoItem(start=0, end=24, name="ClipLUT", input_lut="ShowLUT")
        timeline = FakeTimeline(video_tracks={1: [clip]}, export_payload=wrap_tracks(build_otio_clip("ClipLUT")))
        actual = self._run_export(
            "video_with_lut",
            timeline,
            {"prefix": "Link", "debug_mode": False, "last_known_ae_path": ""},
            lut_lookup="C:/LUTs/ShowLUT.cube",
            lut_copy="ShowLUT.cube",
        )
        self._assert_matches_snapshot("video_with_lut", actual)

    def test_video_with_speed_ramp_matches_snapshot(self) -> None:
        speed_effect = {
            "OTIO_SCHEMA": "TimeEffect.1",
            "metadata": {"Resolve_OTIO": {"Key Frames": [[0.0, 0.0], [0.5, 0.25], [1.0, 1.0]]}},
        }
        clip = FakeVideoItem(start=0, end=24, name="ClipA")
        timeline = FakeTimeline(video_tracks={1: [clip]}, export_payload=wrap_tracks(build_otio_clip("ClipA", effects=[speed_effect])))
        actual = self._run_export(
            "video_with_speed_ramp",
            timeline,
            {"prefix": "Link", "debug_mode": False, "last_known_ae_path": ""},
        )
        self._assert_matches_snapshot("video_with_speed_ramp", actual)

    def test_video_with_crop_distortion_matches_snapshot(self) -> None:
        transform_params = [
            {"Parameter ID": "ZoomX", "Parameter Value": 1.2},
            {"Parameter ID": "ZoomY", "Parameter Value": 0.9},
            {"Parameter ID": "Pan", "Parameter Value": 0.1},
            {"Parameter ID": "Tilt", "Parameter Value": -0.2},
            {"Parameter ID": "RotationAngle", "Parameter Value": 5.0},
            {"Parameter ID": "AnchorPoint", "Parameter Value": [0.05, -0.03]},
        ]
        crop_effect = {
            "OTIO_SCHEMA": "Effect.1",
            "metadata": {
                "Resolve_OTIO": {
                    "Effect Name": "Cropping",
                    "Parameters": [
                        {"Parameter ID": "CropLeft", "Parameter Value": 0.1},
                        {"Parameter ID": "CropRight", "Parameter Value": 0.05},
                        {"Parameter ID": "CropTop", "Parameter Value": 0.02},
                        {"Parameter ID": "CropBottom", "Parameter Value": 0.03},
                    ],
                }
            },
        }
        distortion_effect = {
            "OTIO_SCHEMA": "Effect.1",
            "metadata": {
                "Resolve_OTIO": {
                    "Effect Name": "Lens Correction",
                    "Parameters": [{"Parameter ID": "distortionParam", "Parameter Value": 0.2}],
                }
            },
        }
        clip = FakeVideoItem(start=0, end=24, name="ClipFX")
        timeline = FakeTimeline(
            video_tracks={1: [clip]},
            export_payload=wrap_tracks(build_otio_clip("ClipFX", props=transform_params, effects=[crop_effect, distortion_effect])),
        )
        actual = self._run_export(
            "video_with_crop_distortion",
            timeline,
            {"prefix": "Link", "debug_mode": False, "last_known_ae_path": ""},
        )
        self._assert_matches_snapshot("video_with_crop_distortion", actual)

    def test_loads_config_and_debug_speed_ramp_paths(self) -> None:
        debug_logs: list[str] = []
        clip = FakeVideoItem(start=0, end=24, name="ClipDebug", input_lut="ShowLUT")
        timeline = FakeTimeline(video_tracks={1: [clip]}, export_payload=wrap_tracks(build_otio_clip("ClipDebug")))
        actual = self._run_export(
            "debug_speed_ramp",
            timeline,
            None,
            load_config_result={"prefix": "Dbg", "debug_mode": True, "last_known_ae_path": ""},
            parse_result=({}, []),
            props_result=(
                build_props(
                    speed_keyframes=[[-0.25, 0.0], [0.25, 0.1], [0.75, 0.9], [1.25, 1.0]],
                ),
                "Patched",
            ),
            lut_lookup="C:/LUTs/ShowLUT.cube",
            lut_copy="ShowLUT.cube",
            print_output=debug_logs,
        )

        self.assertEqual(
            ["Analyzing...", "Exporting OTIO...", "Parsing Data..."],
            actual["statuses"],
        )
        self.assertIn("layer.timeRemapEnabled = true;", actual["jsx"])
        self.assertNotIn("jsxFile.remove", actual["jsx"])
        self.assertTrue(any("OTIO saved:" in line for line in debug_logs))
        self.assertTrue(any("Matching Report" in line for line in debug_logs))
        self.assertTrue(any("LUT: ShowLUT.cube" in line for line in debug_logs))
        self.assertTrue(any("Speed Ramp:" in line for line in debug_logs))

    def test_constant_speed_returns_a_plan_without_starting_after_effects(self) -> None:
        debug_logs: list[str] = []
        clip = FakeVideoItem(start=0, end=24, name="ClipConst")
        timeline = FakeTimeline(video_tracks={1: [clip]}, export_success=False)

        actual = self._run_export(
            "constant_speed_error",
            timeline,
            {"prefix": "Link", "debug_mode": False, "last_known_ae_path": ""},
            props_result=(build_props(time_scalar=2.0), "Patched"),
            print_output=debug_logs,
        )

        self.assertEqual(
            ["Analyzing...", "Exporting OTIO...", "Generating JSX..."],
            actual["statuses"],
        )
        self.assertIn("layer.stretch = 50.0;", actual["jsx"])
        self.assertEqual(actual["popen_calls"], [])
        self.assertEqual(actual["result"]["code"], "exported")

    def test_dynamic_zoom_keyframes_are_emitted(self) -> None:
        debug_logs: list[str] = []
        clip = FakeVideoItem(start=0, end=24, name="ClipDZ")
        timeline = FakeTimeline(video_tracks={1: [clip]}, export_success=False)
        actual = self._run_export(
            "dynamic_zoom_active",
            timeline,
            {"prefix": "Link", "debug_mode": True, "last_known_ae_path": ""},
            props_result=(
                build_props(
                    dynamic_zoom_keyframes={
                        "scale": {10: 0.5, 20: 1.0},
                        "center": {10: [0.1, -0.2], 20: [0.0, 0.0]},
                    }
                ),
                "Patched",
            ),
            print_output=debug_logs,
        )

        self.assertIn("// Dynamic Zoom Keyframes", actual["jsx"])
        self.assertIn("layer.property('Scale').setValueAtTime(", actual["jsx"])
        self.assertIn("layer.property('Position').setValueAtTime(", actual["jsx"])
        self.assertTrue(any("Dynamic Zoom:" in line for line in debug_logs))

    def test_default_dynamic_zoom_is_ignored_and_falls_back_to_static_transform(self) -> None:
        debug_logs: list[str] = []
        clip = FakeVideoItem(start=0, end=24, name="ClipDZDefault")
        timeline = FakeTimeline(video_tracks={1: [clip]}, export_success=False)
        actual = self._run_export(
            "dynamic_zoom_default",
            timeline,
            {"prefix": "Link", "debug_mode": True, "last_known_ae_path": ""},
            props_result=(
                build_props(
                    dynamic_zoom_keyframes={
                        "scale": {10: 1.0, 20: 1.0},
                        "center": {10: [0.0, 0.0], 20: [0.0, 0.0]},
                    }
                ),
                "Patched",
            ),
            print_output=debug_logs,
        )

        self.assertNotIn("// Dynamic Zoom Keyframes", actual["jsx"])
        self.assertIn("layer.property('Position').setValue([ae_posX, ae_posY]);", actual["jsx"])
        self.assertTrue(any("Dynamic Zoom ignored" in line for line in debug_logs))

    def test_skips_invalid_media_items_and_resolution_fallbacks(self) -> None:
        invalid_media = FakeMissingMediaVideoItem(start=0, end=24, name="NoMedia")
        no_path = FakeVideoItem(start=0, end=24, name="NoPath", file_path="")
        no_resolution = FakeVideoItem(start=0, end=24, name="NoRes", resolution="")
        timeline = FakeTimeline(video_tracks={1: [invalid_media, no_path, no_resolution]}, export_success=False)
        actual = self._run_export(
            "invalid_media_items",
            timeline,
            {"prefix": "Link", "debug_mode": False, "last_known_ae_path": ""},
            props_result=(build_props(), "Patched"),
        )

        self.assertNotIn("// Clip: NoMedia", actual["jsx"])
        self.assertNotIn("// Clip: NoPath", actual["jsx"])
        self.assertIn("// Clip: NoRes", actual["jsx"])

    def test_filters_invalid_linked_audio_before_auto_muting_video(self) -> None:
        non_audio = FakeVideoItem(start=0, end=24, name="LinkedVideo")
        disabled_track = FakeAudioItem(0, 24, name="DisabledTrack", track_index=9)
        no_track_index = FakeAudioItemWithoutTrackIndex(
            0,
            24,
            name="NoTrackIndex",
            mapping={"track_mapping": {"1": {"mute": True}}},
        )
        disabled_clip = FakeAudioItem(0, 24, name="DisabledClip", track_index=10, enabled=False)
        muted_clip = FakeAudioItem(
            0,
            24,
            name="MutedClip",
            track_index=11,
            mapping={"track_mapping": {"1": {"mute": True}}},
        )
        video = FakeVideoItem(
            start=0,
            end=24,
            name="ClipAutoMute",
            linked_items=[non_audio, disabled_track, no_track_index, disabled_clip, muted_clip, BrokenLinkedInfoItem()],
        )
        timeline = FakeTimeline(
            video_tracks={1: [video]},
            export_success=False,
            disabled_tracks={"audio": {9}},
        )
        actual = self._run_export(
            "linked_audio_filters",
            timeline,
            {"prefix": "Link", "debug_mode": False, "last_known_ae_path": ""},
            props_result=(build_props(), "Patched"),
        )

        self.assertIn("layer.audioEnabled = false;", actual["jsx"])

    def test_linked_audio_api_failure_preserves_legacy_audio_behavior(self) -> None:
        video = BrokenLinkedItemsVideoItem(start=0, end=24, name="ClipLegacyAudio")
        timeline = FakeTimeline(video_tracks={1: [video]}, export_success=False)
        actual = self._run_export(
            "linked_audio_outer_exception",
            timeline,
            {"prefix": "Link", "debug_mode": False, "last_known_ae_path": ""},
            props_result=(build_props(), "Patched"),
        )

        self.assertNotIn("layer.audioEnabled = false;", actual["jsx"])

    def test_returns_no_timeline_status_when_project_has_no_timeline(self) -> None:
        project = FakeProject(None)
        statuses: list[str] = []
        result = export_core.process_and_send(
            FakeResolve(), project, AE_PATH, statuses.append, {"prefix": "Link", "debug_mode": False}
        )
        self.assertEqual(["❌ No Timeline"], statuses)
        self.assertEqual(result["code"], "no-timeline")

    def test_returns_no_clips_status_when_timeline_selection_is_empty(self) -> None:
        timeline = FakeTimeline(video_tracks={})
        statuses: list[str] = []
        result = export_core.process_and_send(
            FakeResolve(),
            FakeProject(timeline),
            AE_PATH,
            statuses.append,
            {"prefix": "Link", "debug_mode": False, "last_known_ae_path": ""},
        )
        self.assertEqual(["Analyzing...", "⚠️ No Clips"], statuses)
        self.assertEqual(result["code"], "no-clips")

    def _clips(self, timeline, target_policy="auto", media_policy="mixed") -> list:
        _mode, clips, _fps, _content_type = export_core.get_target_clips_logic(
            timeline, target_policy, media_policy
        )
        return [clip["item"] for clip in clips]

    def test_full_three_by_three_target_and_media_matrix(self) -> None:
        current_video = FakeVideoItem(start=0, end=24, name="Current", track_index=1)
        ranged_video = FakeVideoItem(start=48, end=72, name="Ranged", track_index=2)
        current_audio = FakeTimelineAudioItem(start=0, end=24, name="Audio1", track_index=1)
        ranged_audio = FakeTimelineAudioItem(start=48, end=72, name="Audio2", track_index=2)
        timeline = FakeTimeline(
            video_tracks={1: [current_video], 2: [ranged_video]},
            audio_tracks={1: [current_audio], 2: [ranged_audio]},
            markers={48: {"color": "Blue", "duration": 24}},
        )

        self.assertEqual(self._clips(timeline, "auto", "mixed"), [ranged_video, ranged_audio])
        self.assertEqual(self._clips(timeline, "auto", "video"), [ranged_video])
        self.assertEqual(self._clips(timeline, "auto", "audio"), [ranged_audio])
        self.assertEqual(self._clips(timeline, "single", "mixed"), [current_video, current_audio])
        self.assertEqual(self._clips(timeline, "single", "video"), [current_video])
        self.assertEqual(self._clips(timeline, "single", "audio"), [current_audio])
        self.assertEqual(self._clips(timeline, "blue-range", "mixed"), [ranged_video, ranged_audio])
        self.assertEqual(self._clips(timeline, "blue-range", "video"), [ranged_video])
        self.assertEqual(self._clips(timeline, "blue-range", "audio"), [ranged_audio])

        mode, clips, _fps, content_type = export_core.get_target_clips_logic(
            timeline, "auto", "mixed"
        )
        self.assertEqual((mode, [clip["item"] for clip in clips], content_type), (
            "batch", [ranged_video, ranged_audio], "mixed"
        ))
        mode, clips, _fps, content_type = export_core.get_target_clips_logic(
            timeline, "single", "mixed"
        )
        self.assertEqual((mode, [clip["item"] for clip in clips], content_type), (
            "single", [current_video, current_audio], "mixed"
        ))

    def test_multiple_blue_markers_choose_lowest_numeric_frame_and_ignore_point_and_cyan(self) -> None:
        at_20 = FakeVideoItem(start=20, end=44, name="At20", track_index=1)
        at_100 = FakeVideoItem(start=100, end=124, name="At100", track_index=2)
        timeline = FakeTimeline(
            video_tracks={1: [at_20], 2: [at_100]},
            markers={
                "100": {"color": "Blue", "duration": 24},
                "5": {"color": "Blue", "duration": 1},
                "20": {"color": "Blue", "duration": 24},
                "10": {"color": "Cyan", "duration": 24},
            },
        )
        mode, clips, _fps, _content_type = export_core.get_target_clips_logic(
            timeline, "auto", "video"
        )
        self.assertEqual(mode, "batch")
        self.assertEqual([clip["item"] for clip in clips], [at_20])

        # Enumeration order must not matter: reversed insertion still picks frame 20.
        timeline.markers = dict(reversed(list(timeline.markers.items())))
        mode, clips, _fps, _content_type = export_core.get_target_clips_logic(
            timeline, "auto", "video"
        )
        self.assertEqual([clip["item"] for clip in clips], [at_20])

    def test_malformed_marker_info_and_duration_are_skipped(self) -> None:
        current = FakeVideoItem(start=0, end=24, name="Current")
        timeline = FakeTimeline(
            video_tracks={1: [current]},
            markers={
                "bad-info": None,
                "bad-duration": {"color": "Blue", "duration": "not-a-number"},
                "point": {"color": "Blue", "duration": 1},
                "cyan": {"color": "Cyan", "duration": 24},
                "red": {"color": "Red", "duration": 24},
            },
        )

        mode, clips, _fps, _content_type = export_core.get_target_clips_logic(
            timeline, "auto", "video"
        )
        self.assertEqual(mode, "single")
        self.assertEqual([clip["item"] for clip in clips], [current])
        with self.assertRaisesRegex(export_core.MissingMarkerError, "No Blue duration marker found"):
            export_core.get_target_clips_logic(timeline, "blue-range", "video")

    def test_malformed_qualifying_frame_keeps_current_partial_scan_behavior(self) -> None:
        current = FakeVideoItem(start=0, end=10, name="Current")
        ranged = FakeVideoItem(start=20, end=44, name="Ranged")
        timeline = FakeTimeline(
            video_tracks={1: [current, ranged]},
            markers={
                "20": {"color": "Blue", "duration": 24},
                "bad-frame": {"color": "Blue", "duration": 24},
            },
        )

        mode, clips, _fps, _content_type = export_core.get_target_clips_logic(
            timeline, "auto", "video"
        )
        self.assertEqual(mode, "batch")
        self.assertEqual([clip["item"] for clip in clips], [ranged])
        with self.assertRaisesRegex(ValueError, "invalid literal"):
            export_core.get_target_clips_logic(timeline, "blue-range", "video")

        timeline.markers = dict(reversed(list(timeline.markers.items())))
        mode, clips, _fps, _content_type = export_core.get_target_clips_logic(
            timeline, "auto", "video"
        )
        self.assertEqual(mode, "single")
        self.assertEqual([clip["item"] for clip in clips], [current])

    def test_marker_range_uses_absolute_half_open_coordinates_without_trimming(self) -> None:
        ends_at_start = FakeVideoItem(start=1000, end=1010, name="EndsAtStart")
        overlaps_first_frame = FakeVideoItem(start=1009, end=1011, name="FirstFrame")
        inside = FakeVideoItem(start=1010, end=1015, name="Inside")
        overlaps_last_frame = FakeVideoItem(start=1014, end=1016, name="LastFrame")
        starts_at_end = FakeVideoItem(start=1015, end=1020, name="StartsAtEnd")
        timeline = FakeTimeline(
            video_tracks={1: [
                ends_at_start,
                overlaps_first_frame,
                inside,
                overlaps_last_frame,
                starts_at_end,
            ]},
            markers={"10": {"color": "Blue", "duration": 5}},
            start_frame=1000,
        )

        mode, clips, _fps, _content_type = export_core.get_target_clips_logic(
            timeline, "auto", "video"
        )
        selected = [clip["item"] for clip in clips]
        self.assertEqual(mode, "batch")
        self.assertEqual(selected, [overlaps_first_frame, inside, overlaps_last_frame])
        self.assertEqual(
            [(item.GetStart(), item.GetEnd()) for item in selected],
            [(1009, 1011), (1010, 1015), (1014, 1016)],
        )

    def test_missing_timeline_start_uses_legacy_86400_marker_offset(self) -> None:
        ranged = FakeVideoItem(start=86410, end=86412, name="Ranged")
        timeline = FakeTimeline(
            video_tracks={1: [ranged]},
            markers={"10": {"color": "Blue", "duration": 2}},
            start_frame=None,
        )

        mode, clips, _fps, _content_type = export_core.get_target_clips_logic(
            timeline, "auto", "video"
        )
        self.assertEqual(mode, "batch")
        self.assertEqual([clip["item"] for clip in clips], [ranged])

    def test_single_policy_does_not_read_markers(self) -> None:
        current = FakeVideoItem(start=0, end=24, name="Current")
        timeline = FakeTimeline(video_tracks={1: [current]})

        def fail_marker_read():
            raise AssertionError("single policy must not read markers")

        timeline.GetMarkers = fail_marker_read
        self.assertEqual(self._clips(timeline, "single", "video"), [current])

    def test_timeline_start_errors_propagate_before_every_policy(self) -> None:
        timeline = FakeTimeline(video_tracks={})
        start_error = RuntimeError("start frame API failed")

        def fail_start_read():
            raise start_error

        timeline.GetStartFrame = fail_start_read
        for target_policy in ("single", "auto", "blue-range"):
            with self.subTest(target_policy=target_policy):
                with self.assertRaises(RuntimeError) as raised:
                    export_core.get_target_clips_logic(timeline, target_policy, "video")
                self.assertIs(raised.exception, start_error)

    def test_single_scope_selects_topmost_video_and_audio_independently(self) -> None:
        lower_video = FakeVideoItem(start=0, end=24, name="V1", track_index=1)
        upper_video = FakeVideoItem(start=0, end=24, name="V2", track_index=2)
        lower_audio = FakeTimelineAudioItem(start=0, end=24, name="A1", track_index=1)
        upper_audio = FakeTimelineAudioItem(start=0, end=24, name="A2", track_index=2)
        timeline = FakeTimeline(
            video_tracks={1: [lower_video], 2: [upper_video]},
            audio_tracks={1: [lower_audio], 2: [upper_audio]},
            markers={48: {"color": "Blue", "duration": 24}},
        )
        self.assertEqual(self._clips(timeline, "single", "video"), [upper_video])
        self.assertEqual(self._clips(timeline, "single", "audio"), [upper_audio])
        self.assertEqual(self._clips(timeline, "single", "mixed"), [upper_video, upper_audio])

        disabled = FakeTimeline(
            video_tracks={1: [lower_video], 2: [upper_video]},
            audio_tracks={1: [lower_audio], 2: [upper_audio]},
            disabled_tracks={"video": {2}, "audio": {2}},
        )
        self.assertEqual(self._clips(disabled, "single", "video"), [lower_video])
        self.assertEqual(self._clips(disabled, "single", "audio"), [lower_audio])

    def test_single_mixed_deduplicates_linked_audio_and_falls_back_to_available_class(self) -> None:
        linked_audio = FakeTimelineAudioItem(start=0, end=24, name="Linked", track_index=1)
        video = FakeVideoItem(start=0, end=24, name="Video", track_index=1, linked_items=[linked_audio])
        linked_audio.GetLinkedItems = lambda: [video]
        timeline = FakeTimeline(video_tracks={1: [video]}, audio_tracks={1: [linked_audio]})
        self.assertEqual(self._clips(timeline, "single", "mixed"), [video])

        unlinked_audio = FakeTimelineAudioItem(start=0, end=24, name="Standalone", track_index=1)
        standalone = FakeTimeline(video_tracks={1: [video]}, audio_tracks={1: [unlinked_audio]})
        self.assertEqual(self._clips(standalone, "single", "mixed"), [video, unlinked_audio])

        only_video = FakeTimeline(video_tracks={1: [video]}, audio_tracks={})
        self.assertEqual(self._clips(only_video, "single", "mixed"), [video])
        only_audio = FakeTimeline(video_tracks={}, audio_tracks={1: [unlinked_audio]})
        self.assertEqual(self._clips(only_audio, "single", "mixed"), [unlinked_audio])

    def test_batch_mixed_deduplicates_linked_audio_across_all_overlapping_tracks(self) -> None:
        linked_audio = FakeTimelineAudioItem(start=48, end=72, name="Linked", track_index=1)
        standalone_audio = FakeTimelineAudioItem(start=48, end=72, name="Standalone", track_index=2)
        mixed_video = FakeVideoItem(start=48, end=72, name="Mixed", linked_items=[linked_audio])
        linked_audio.GetLinkedItems = lambda: [mixed_video]
        timeline = FakeTimeline(
            video_tracks={1: [mixed_video]},
            audio_tracks={1: [linked_audio], 2: [standalone_audio]},
            markers={48: {"color": "Blue", "duration": 24}},
        )
        mode, clips, _fps, content_type = export_core.get_target_clips_logic(
            timeline, "auto", "mixed"
        )
        self.assertEqual(mode, "batch")
        self.assertEqual([clip["item"] for clip in clips], [mixed_video, standalone_audio])
        self.assertEqual(content_type, "mixed")

    def test_explicit_range_requires_the_requested_marker(self) -> None:
        timeline = FakeTimeline(
            video_tracks={1: [FakeVideoItem(start=0, end=24)]},
            markers={0: {"color": "Cyan", "duration": 24}},
        )
        statuses: list[str] = []
        result = export_core.process_and_send(
            FakeResolve(),
            FakeProject(timeline),
            AE_PATH,
            statuses.append,
            {"prefix": "Link", "debug_mode": False},
            "video-range",
            "blue-range",
            "video",
        )
        self.assertEqual(statuses, ["Analyzing...", "❌ No Blue duration marker found"])
        self.assertEqual(result, {
            "ok": False,
            "code": "missing-marker",
            "mode": "video-range",
            "target_policy": "blue-range",
            "media_policy": "video",
            "clip_count": 0,
            "message": "No Blue duration marker found",
        })

    def test_explicit_range_propagates_marker_api_errors(self) -> None:
        timeline = FakeTimeline(video_tracks={1: [FakeVideoItem(start=0, end=24)]})

        def fail_marker_read():
            raise RuntimeError("marker API failed")

        timeline.GetMarkers = fail_marker_read

        with self.assertRaisesRegex(RuntimeError, "marker API failed"):
            export_core.get_target_clips_logic(timeline, "blue-range", "video")
        self.assertEqual(
            export_core.get_target_clips_logic(timeline, "auto", "mixed")[0],
            "single",
        )

    def test_process_and_send_rejects_unsupported_triples_before_resolve_access(self) -> None:
        for triple in [
            ("single", "single", "audio"),
            ("single", "single", "video"),
            ("mixed-range", "blue-range", "audio"),
            ("audio-only", "auto", "video"),
            ("unknown", "auto", "mixed"),
        ]:
            with self.subTest(triple=triple):
                with self.assertRaisesRegex(ValueError, "Unsupported export triple"):
                    export_core.process_and_send(
                        FakeResolve(),
                        FakeProject(None),
                        AE_PATH,
                        lambda _message: None,
                        {"prefix": "Link", "debug_mode": False},
                        *triple,
                    )

    def test_returns_desktop_launch_plan_without_starting_after_effects(self) -> None:
        clip = FakeVideoItem(start=0, end=24, name="ClipA")
        timeline = FakeTimeline(video_tracks={1: [clip]}, export_payload=wrap_tracks(build_otio_clip()))
        with patch("subprocess.Popen") as popen:
            actual = self._run_export(
                "desktop_launch_plan",
                timeline,
                {"prefix": "Link", "debug_mode": False, "last_known_ae_path": ""},
            )
        popen.assert_not_called()

        launch = actual["result"]["__clacklyDesktopLaunch"]
        self.assertEqual(actual["statuses"], ["Analyzing...", "Exporting OTIO...", "Parsing Data..."])
        self.assertEqual(actual["popen_calls"], [])
        self.assertEqual(launch["type"], "after-effects-jsx")
        self.assertEqual(launch["executable"], AE_PATH)
        self.assertEqual(launch["args"], ["-r", "$CLACKLY_JSX"])
        self.assertIn("app.beginUndoGroup", launch["jsx"])


if __name__ == "__main__":
    unittest.main()
