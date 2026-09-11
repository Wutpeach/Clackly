from __future__ import annotations

from contextlib import ExitStack
import json
import shutil
import subprocess
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

    def GetType(self) -> str:
        return "audio"

    def GetUniqueId(self) -> str:
        return f"audio:{self._track_index}:{self._start}:{self._end}:{self._name}"

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

    def GetType(self) -> str:
        return "video"

    def GetUniqueId(self) -> str:
        return f"video:{self._track_index}:{self._start}:{self._end}:{self._name}"

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
        linked_items: list | None = None,
    ) -> None:
        super().__init__(start, end, name=name, track_index=track_index, enabled=enabled)
        self._media = FakeMediaPoolItem(file_path, "0x0", "")
        self._left_offset = left_offset
        self._duration = duration if duration is not None else (end - start)
        self._linked_items = linked_items or []

    def GetMediaPoolItem(self) -> FakeMediaPoolItem:
        return self._media

    def GetLeftOffset(self) -> int:
        return self._left_offset

    def GetDuration(self) -> int:
        return self._duration

    def GetLinkedItems(self) -> list:
        return list(self._linked_items)


_NO_NATIVE_SELECTION = object()


class FakeTimeline:
    def __init__(
        self,
        *,
        video_tracks: dict[int, list],
        audio_tracks: dict[int, list] | None = None,
        disabled_tracks: dict[str, set[int]] | None = None,
        export_payload: dict | None = None,
        export_success: bool = True,
        name: str = "Timeline",
        fps: str = "24",
        start_frame: int = 0,
        resolution: tuple[str, str] = ("1920", "1080"),
        current_tc: str = "00:00:00:00",
        selected_clips=_NO_NATIVE_SELECTION,
        selection_error: Exception | None = None,
    ) -> None:
        self.video_tracks = video_tracks
        self.audio_tracks = audio_tracks or {}
        self.disabled_tracks = disabled_tracks or {}
        self.export_payload = export_payload
        self.export_success = export_success
        self.name = name
        self.fps = fps
        self.start_frame = start_frame
        self.resolution = resolution
        self.current_tc = current_tc
        self.selected_clips = selected_clips
        self.selection_error = selection_error
        if selected_clips is _NO_NATIVE_SELECTION:
            self.GetSelectedClips = None

    def GetSetting(self, key: str) -> str:
        return {
            "timelineFrameRate": self.fps,
            "timelineResolutionWidth": self.resolution[0],
            "timelineResolutionHeight": self.resolution[1],
        }.get(key, "")

    def GetStartFrame(self) -> int:
        return self.start_frame

    def GetCurrentTimecode(self) -> str:
        return self.current_tc

    def GetSelectedClips(self) -> list:
        if self.selection_error:
            raise self.selection_error
        return list(self.selected_clips) if isinstance(self.selected_clips, list) else self.selected_clips

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


class FakeUnsupportedTimelineItem(FakeVideoItem):
    def GetType(self) -> str:
        return "title"


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
        self.assertEqual(
            self._without_approved_presentation_jsx(actual["jsx"]),
            self._without_approved_presentation_jsx(expected["jsx"]),
        )
        self.assertEqual(actual["statuses"], expected["statuses"][:-2])
        self.assertEqual(actual["popen_calls"], [])

    def _without_approved_presentation_jsx(self, jsx: str) -> str:
        normalized: list[str] = []
        skipping_project_scan = False
        for line in jsx.splitlines():
            if line.startswith("var clacklyTimelineName ="):
                skipping_project_scan = True
                continue
            if skipping_project_scan:
                if line.startswith("var comp = app.project.items.addComp("):
                    skipping_project_scan = False
                    normalized.append("var comp = app.project.items.addComp(<approved-source-name>);")
                continue
            if line.startswith("var comp = app.project.items.addComp("):
                normalized.append("var comp = app.project.items.addComp(<approved-source-name>);")
            elif line not in {"comp.openInViewer();", "app.activate();"}:
                normalized.append(line)
        return "\n".join(normalized)

    def _evaluate_project_item_scan(self, jsx: str, items: list[dict]) -> dict:
        scan_start = jsx.index("var clacklyTimelineName =")
        scan_end = jsx.index("var comp = app.project.items.addComp(", scan_start)
        scanner = jsx[scan_start:scan_end]
        runner = """
const fixtureItems = JSON.parse(process.argv[1]);
class FolderItem { constructor(item) { this.name = item.name; this.id = item.id; } }
class CompItem { constructor(item) { this.name = item.name; this.id = item.id; } }
const app = { project: { items: [null].concat(fixtureItems.map((item) =>
  item.type === "folder" ? new FolderItem(item) : new CompItem(item))) } };
""" + scanner + """
process.stdout.write(JSON.stringify({
  sequence: clacklySequence,
  sourceName: clacklySourceName,
  folderId: clacklySourceFolder ? clacklySourceFolder.id : null
}));
"""
        result = subprocess.run(
            ["node", "-e", runner, json.dumps(items)],
            check=True,
            capture_output=True,
            text=True,
        )
        return json.loads(result.stdout)

    def test_single_video_otio_success_matches_snapshot(self) -> None:
        clip = FakeVideoItem(start=0, end=24, name="ClipA")
        timeline = FakeTimeline(video_tracks={1: [clip]}, export_payload=wrap_tracks(build_otio_clip()))
        actual = self._run_export(
            "single_video_otio_success",
            timeline,
            {"debug_mode": False, "last_known_ae_path": ""},
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
            {"debug_mode": False, "last_known_ae_path": ""},
        )
        self._assert_matches_snapshot("single_video_otio_fallback", actual)

    def test_mixed_video_audio_matches_snapshot(self) -> None:
        linked_audio = FakeAudioItem(0, 24, track_index=1, mapping={"track_mapping": {"1": {"mute": False}}})
        video_with_audio = FakeVideoItem(start=0, end=24, name="ClipMixV", linked_items=[linked_audio])
        audio_clip = FakeTimelineAudioItem(start=0, end=24, name="ClipMixA", track_index=1)
        timeline = FakeTimeline(
            video_tracks={1: [video_with_audio]},
            audio_tracks={1: [audio_clip]},
        )
        actual = self._run_export(
            "mixed_video_audio",
            timeline,
            {"debug_mode": False, "last_known_ae_path": ""},
        )
        self._assert_matches_snapshot("mixed_video_audio", actual)

    def test_opt_in_preview_comp_preserves_source_and_fits_each_axis_uniformly(self) -> None:
        for width, height, expected_fit_percent in (
            (3840, 2160, 50.0),
            (2048, 1536, 70.3125),
            (1920, 1080, 100.0),
        ):
            with self.subTest(source_resolution=(width, height)):
                clip = FakeVideoItem(start=0, end=24, name="PreviewSource")
                timeline = FakeTimeline(
                    video_tracks={1: [clip]},
                    export_success=False,
                    resolution=(str(width), str(height)),
                )
                actual = self._run_export(
                    f"preview_{width}x{height}",
                    timeline,
                    {
                        "debug_mode": False,
                        "create1080pPreviewComp": True,
                    },
                )
                jsx = actual["jsx"]
                source_comp = (
                    "var comp = app.project.items.addComp("
                    "clacklySourceName, "
                    f"{width}, {height}, 1, 1.0, 24.0);"
                )
                preview_comp = (
                    "var previewComp = app.project.items.addComp("
                    "clacklyPreviewName, 1920, 1080, 1, "
                    "comp.duration, comp.frameRate);"
                )
                preview_layer = "var previewLayer = previewComp.layers.add(comp);"
                preview_position = (
                    "previewLayer.property('Position').setValue("
                    "[previewComp.width / 2, previewComp.height / 2]);"
                )
                preview_fit = (
                    "var previewFitPercent = Math.min("
                    "previewComp.width / comp.width, previewComp.height / comp.height) * 100;"
                )
                preview_scale = (
                    "previewLayer.property('Scale').setValue("
                    "[previewFitPercent, previewFitPercent]);"
                )

                self.assertIn(source_comp, jsx)
                self.assertIn("// Clip: PreviewSource", jsx)
                self.assertIn("var layer = comp.layers.add(fileItem);", jsx)
                self.assertIn("comp.parentFolder = clacklySourceFolder;", jsx)
                self.assertIn("previewComp.parentFolder = app.project.rootFolder;", jsx)
                self.assertIn("var clacklyPreviewName = '[1920x1080]-' + clacklyTimelineName + '-' + clacklySequence + '-Preview';", jsx)
                self.assertEqual(jsx.count(preview_comp), 1)
                self.assertEqual(jsx.count(preview_layer), 1)
                self.assertIn(preview_position, jsx)
                self.assertIn(preview_fit, jsx)
                self.assertIn(preview_scale, jsx)
                self.assertLess(jsx.index("// Clip: PreviewSource"), jsx.index(preview_comp))
                self.assertLess(jsx.index(preview_scale), jsx.index("previewComp.openInViewer();"))
                self.assertLess(jsx.index("previewComp.openInViewer();"), jsx.index("app.activate();"))
                self.assertLess(jsx.index(preview_scale), jsx.index("app.endUndoGroup();"))
                self.assertNotIn("comp.width =", jsx)
                self.assertNotIn("comp.height =", jsx)
                self.assertNotIn("comp.name =", jsx)

                preview_block = jsx[jsx.index(preview_comp):jsx.index("app.endUndoGroup();")].lower()
                self.assertNotIn("crop", preview_block)
                self.assertNotIn("fill", preview_block)
                self.assertNotIn("stretch", preview_block)
                self.assertNotIn("mask", preview_block)

                fit_percent = min(1920 / width, 1080 / height) * 100
                self.assertEqual(fit_percent, expected_fit_percent)

    def test_project_item_scan_allocates_independent_max_plus_one_sequences_and_reuses_first_folder(self) -> None:
        timeline = FakeTimeline(
            video_tracks={1: [FakeVideoItem(start=0, end=24)]},
            export_success=False,
            resolution=("2048", "1536"),
            name="Timeline A",
        )
        actual = self._run_export("project_item_scan", timeline, {"debug_mode": False})
        jsx = actual["jsx"]
        self.assertEqual(jsx.count("for (var clacklyItemIndex = 1; clacklyItemIndex <= app.project.items.length; clacklyItemIndex++)"), 1)
        self.assertEqual(jsx.count("app.project.items[clacklyItemIndex]"), 1)
        self.assertIn("clacklyItem instanceof FolderItem", jsx)
        self.assertIn("clacklyItem instanceof CompItem", jsx)

        existing_items = [
            {"type": "folder", "id": "moved-folder", "name": "Clackly Source Comps"},
            {"type": "folder", "id": "later-folder", "name": "Clackly Source Comps"},
            {"type": "comp", "id": "a1", "name": "[3840x2160]-Timeline A-1"},
            {"type": "comp", "id": "a3-preview", "name": "[1920x1080]-Timeline A-3-Preview"},
            {"type": "comp", "id": "a5", "name": "[1280x720]-Timeline A-5"},
            {"type": "comp", "id": "a0", "name": "[1920x1080]-Timeline A-0"},
            {"type": "comp", "id": "renamed", "name": "User renamed Timeline A 99"},
            {"type": "comp", "id": "b1", "name": "[3840x2160]-Timeline B-1"},
        ]
        scanned = self._evaluate_project_item_scan(jsx, existing_items)
        self.assertEqual(scanned, {
            "sequence": 6,
            "sourceName": "[2048x1536]-Timeline A-6",
            "folderId": "moved-folder",
        })
        renamed_folder = self._evaluate_project_item_scan(jsx, [
            {"type": "folder", "id": "renamed-folder", "name": "User Source Comps"},
        ])
        self.assertIsNone(renamed_folder["folderId"])

        other_timeline = FakeTimeline(
            video_tracks={1: [FakeVideoItem(start=0, end=24)]},
            export_success=False,
            name="Timeline B",
        )
        other_jsx = self._run_export("project_item_other_timeline", other_timeline, {"debug_mode": False})["jsx"]
        self.assertEqual(self._evaluate_project_item_scan(other_jsx, existing_items)["sequence"], 2)
        new_timeline = FakeTimeline(
            video_tracks={1: [FakeVideoItem(start=0, end=24)]},
            export_success=False,
            name="Timeline C",
        )
        new_timeline_jsx = self._run_export("project_item_new_timeline", new_timeline, {"debug_mode": False})["jsx"]
        self.assertEqual(self._evaluate_project_item_scan(new_timeline_jsx, existing_items)["sequence"], 1)

        hd_timeline = FakeTimeline(
            video_tracks={1: [FakeVideoItem(start=0, end=24)]},
            export_success=False,
            name="Timeline A",
        )
        hd_jsx = self._run_export(
            "project_item_hd_preview",
            hd_timeline,
            {"debug_mode": False, "create1080pPreviewComp": True},
        )["jsx"]
        hd_source = self._evaluate_project_item_scan(hd_jsx, existing_items)["sourceName"]
        self.assertEqual(hd_source, "[1920x1080]-Timeline A-6")
        self.assertIn("if (!clacklySourceFolder) clacklySourceFolder = app.project.items.addFolder('Clackly Source Comps');", hd_jsx)
        self.assertIn("var clacklyPreviewName = '[1920x1080]-' + clacklyTimelineName + '-' + clacklySequence + '-Preview';", hd_jsx)
        self.assertNotEqual(hd_source, "[1920x1080]-Timeline A-6-Preview")

        safe_timeline = FakeTimeline(
            video_tracks={1: [FakeVideoItem(start=0, end=24)]},
            export_success=False,
            name="O'Reilly\n[Scene]",
        )
        safe_jsx = self._run_export("project_item_safe_name", safe_timeline, {"debug_mode": False})["jsx"]
        self.assertIn('var clacklyTimelineName = "O\'Reilly\\n[Scene]";', safe_jsx)
        self.assertEqual(
            self._evaluate_project_item_scan(safe_jsx, [])["sourceName"],
            "[1920x1080]-O'Reilly\n[Scene]-1",
        )

    def test_false_preview_option_creates_only_root_source_and_activates_it(self) -> None:
        clip = FakeVideoItem(start=0, end=24, name="PreviewDisabled")
        timeline = FakeTimeline(video_tracks={1: [clip]}, export_success=False)
        actual = self._run_export(
            "preview_disabled",
            timeline,
            {
                "debug_mode": False,
                "create1080pPreviewComp": False,
            },
        )

        self.assertNotIn("previewComp", actual["jsx"])
        self.assertNotIn("previewLayer", actual["jsx"])
        self.assertNotIn("app.project.items.addFolder", actual["jsx"])
        self.assertNotIn("comp.parentFolder =", actual["jsx"])
        self.assertEqual(actual["jsx"].count("comp.openInViewer();"), 1)
        self.assertEqual(actual["jsx"].count("app.activate();"), 1)
        self.assertLess(actual["jsx"].index("comp.openInViewer();"), actual["jsx"].index("app.activate();"))

    def test_mixed_playhead_runs_video_otio_enrichment(self) -> None:
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

    def test_video_only_export_mutes_every_video_layer_with_linked_audio(self) -> None:
        linked_audio = FakeAudioItem(0, 24, track_index=1, mapping={"track_mapping": {"1": {"mute": False}}})
        first = FakeVideoItem(start=0, end=24, name="ClipV1", track_index=1, linked_items=[linked_audio])
        second = FakeVideoItem(start=0, end=24, name="ClipV2", track_index=2)
        timeline = FakeTimeline(
            video_tracks={1: [first], 2: [second]},
            audio_tracks={1: [linked_audio]},
            selected_clips=[first, second],
        )
        statuses: list[str] = []
        result = export_core.process_and_send(
            FakeResolve(),
            FakeProject(timeline),
            AE_PATH,
            statuses.append,
            {"prefix": "Link", "debug_mode": False},
            "video-only",
            "video",
        )
        jsx = result["__clacklyDesktopLaunch"]["jsx"]
        self.assertIn("// Clip: ClipV1", jsx)
        self.assertIn("// Clip: ClipV2", jsx)
        self.assertNotIn("// Clip: [Audio]", jsx)
        self.assertNotIn("layer.enabled = false;", jsx)
        self.assertGreaterEqual(jsx.count("layer.audioEnabled = false;"), 2)

    def test_every_product_export_opens_one_final_comp_then_activates_ae(self) -> None:
        video = FakeVideoItem(start=0, end=24, name="ActivationVideo")
        audio = FakeTimelineAudioItem(start=0, end=24, name="ActivationAudio")
        timeline = FakeTimeline(
            video_tracks={1: [video]},
            audio_tracks={1: [audio]},
            export_success=False,
        )
        for command_mode in (
            ("auto", "mixed"),
            ("audio-only", "audio"),
            ("video-only", "video"),
        ):
            with self.subTest(command_mode=command_mode):
                result = export_core.process_and_send(
                    FakeResolve(),
                    FakeProject(timeline),
                    AE_PATH,
                    lambda _message: None,
                    {"debug_mode": False},
                    *command_mode,
                )
                jsx = result["__clacklyDesktopLaunch"]["jsx"]
                self.assertEqual(jsx.count("openInViewer();"), 1)
                self.assertEqual(jsx.count("app.activate();"), 1)
                self.assertLess(jsx.index("openInViewer();"), jsx.index("app.activate();"))
                self.assertLess(jsx.index("app.activate();"), jsx.index("app.endUndoGroup();"))

    def test_legacy_prefix_values_do_not_change_generated_jsx(self) -> None:
        timeline = FakeTimeline(video_tracks={1: [FakeVideoItem(start=0, end=24)]}, export_success=False)
        legacy = self._run_export(
            "legacy_prefix",
            timeline,
            {"prefix": "Legacy Prefix", "debug_mode": False},
        )
        current = self._run_export("no_prefix", timeline, {"debug_mode": False})
        self.assertEqual(legacy["jsx"], current["jsx"])

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

    def _clips(self, timeline, media_policy="mixed") -> list:
        _mode, clips, _fps, _content_type = export_core.get_target_clips_logic(timeline, media_policy)
        return [clip["item"] for clip in clips]

    def test_native_selection_is_authoritative_for_all_media_policies(self) -> None:
        first = FakeVideoItem(start=0, end=24, name="First", track_index=1)
        gap = FakeVideoItem(start=24, end=48, name="Gap", track_index=1)
        second = FakeVideoItem(start=48, end=72, name="Second", track_index=2)
        audio = FakeTimelineAudioItem(start=48, end=72, name="Audio", track_index=2)
        timeline = FakeTimeline(
            video_tracks={1: [first, gap], 2: [second]},
            audio_tracks={2: [audio]},
            selected_clips=[audio, second, first],
        )
        calls = 0

        def selected_once():
            nonlocal calls
            calls += 1
            return [audio, second, first]

        timeline.GetSelectedClips = selected_once
        timeline.GetCurrentTimecode = lambda: (_ for _ in ()).throw(
            AssertionError("explicit selection must not read the playhead")
        )
        expected = {
            "mixed": [first, second, audio],
            "video": [first, second],
            "audio": [audio],
        }
        for policy, clips in expected.items():
            with self.subTest(policy=policy):
                mode, records, _fps, _content_type = export_core.get_target_clips_logic(timeline, policy)
                self.assertEqual("batch", mode)
                self.assertEqual(clips, [record["item"] for record in records])
                self.assertNotIn(gap, [record["item"] for record in records])
        self.assertEqual(3, calls)

    def test_empty_native_selection_uses_playhead(self) -> None:
        current = FakeVideoItem(start=0, end=24, name="Current")
        timeline = FakeTimeline(
            video_tracks={1: [current]},
            selected_clips=[],
        )

        mode, clips, _fps, content_type = export_core.get_target_clips_logic(timeline, "video")

        self.assertEqual(("single", [current], "video"), (
            mode, [record["item"] for record in clips], content_type
        ))

    def test_missing_native_selection_api_uses_playhead(self) -> None:
        current = FakeVideoItem(start=0, end=24, name="Current")
        timeline = FakeTimeline(video_tracks={1: [current]})

        mode, clips, _fps, content_type = export_core.get_target_clips_logic(timeline, "video")

        self.assertEqual(("single", [current], "video"), (
            mode, [record["item"] for record in clips], content_type
        ))

    def test_native_selection_never_falls_back_after_media_or_item_filtering(self) -> None:
        playhead_video = FakeVideoItem(start=0, end=24, name="Playhead")
        selected_audio = FakeTimelineAudioItem(start=0, end=24, name="SelectedAudio")
        unsupported = FakeUnsupportedTimelineItem(start=0, end=24, name="Title")
        no_media = FakeMissingMediaVideoItem(start=0, end=24, name="NoMedia")
        timeline = FakeTimeline(
            video_tracks={1: [playhead_video]},
            audio_tracks={1: [selected_audio]},
            selected_clips=[selected_audio, unsupported, no_media],
        )

        mode, clips, _fps, _content_type = export_core.get_target_clips_logic(timeline, "video")

        self.assertEqual("batch", mode)
        self.assertEqual([], clips)

        no_media_timeline = FakeTimeline(
            video_tracks={1: [playhead_video]},
            selected_clips=[unsupported, no_media],
        )
        mode, clips, _fps, _content_type = export_core.get_target_clips_logic(no_media_timeline, "video")
        self.assertEqual(("batch", []), (mode, clips))

    def test_native_selection_deduplicates_linked_audio_and_skips_disabled_items(self) -> None:
        video = FakeVideoItem(start=0, end=24, name="Video", track_index=1)
        audio = FakeTimelineAudioItem(start=0, end=24, name="Audio", track_index=1, linked_items=[video])
        video._linked_items = [audio]
        disabled = FakeVideoItem(start=48, end=72, name="Disabled", track_index=2, enabled=False)
        timeline = FakeTimeline(
            video_tracks={1: [video], 2: [disabled]},
            audio_tracks={1: [audio]},
            selected_clips=[audio, disabled, video, video],
        )

        self.assertEqual([video], self._clips(timeline, "mixed"))

    def test_native_selection_errors_are_not_interpreted_as_empty_selection(self) -> None:
        current = FakeVideoItem(start=0, end=24, name="Current")
        for selected_clips, selection_error in (({}, None), ([], RuntimeError("bridge failure"))):
            with self.subTest(selected_clips=selected_clips, selection_error=selection_error):
                timeline = FakeTimeline(
                    video_tracks={1: [current]},
                    selected_clips=selected_clips,
                    selection_error=selection_error,
                )
                with self.assertRaises(export_core.NativeSelectionError):
                    self._clips(timeline, "video")

        current.GetTrackTypeAndIndex = lambda: ("audio", 1)
        timeline = FakeTimeline(video_tracks={1: [current]}, selected_clips=[current])
        with self.assertRaisesRegex(export_core.NativeSelectionError, "track metadata"):
            self._clips(timeline, "video")

    def test_process_and_send_rejects_unsupported_modes_before_resolve_access(self) -> None:
        for command_mode in [
            ("audio-only", "video"),
            ("unknown", "mixed"),
        ]:
            with self.subTest(command_mode=command_mode):
                with self.assertRaisesRegex(ValueError, "Unsupported export mode/media policy"):
                    export_core.process_and_send(
                        FakeResolve(),
                        FakeProject(None),
                        AE_PATH,
                        lambda _message: None,
                        {"prefix": "Link", "debug_mode": False},
                        *command_mode,
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
