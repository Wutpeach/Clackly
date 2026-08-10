import math
import os
import re
import sys
from pathlib import Path
from typing import Any, Dict, Optional


class ResolveAdapterError(RuntimeError):
    """Raised for user-facing Resolve adapter failures."""

    def __init__(
        self,
        message: str,
        code: str = "resolve-unavailable",
        details: Optional[Dict[str, Any]] = None,
    ) -> None:
        super().__init__(message)
        self.code = code
        self.details = details or {}


def _add_resolve_module_paths() -> None:
    scripting_api = os.environ.get("RESOLVE_SCRIPT_API")
    program_data = os.environ.get("PROGRAMDATA", r"C:\ProgramData")
    candidates = [
        Path(scripting_api) / "Modules" if scripting_api else None,
        Path(program_data)
        / "Blackmagic Design"
        / "DaVinci Resolve"
        / "Support"
        / "Developer"
        / "Scripting"
        / "Modules",
    ]
    for candidate in reversed(candidates):
        if candidate and candidate.is_dir() and str(candidate) not in sys.path:
            sys.path.insert(0, str(candidate))


def _call_optional(target: Any, method_name: str, *args: Any) -> Any:
    method = getattr(target, method_name, None)
    if not callable(method):
        return None
    try:
        return method(*args)
    except Exception:
        return None


def get_resolve() -> Any:
    builtin_resolve = globals().get("resolve")
    if builtin_resolve is not None:
        return builtin_resolve

    builtin_bmd = globals().get("bmd")
    if builtin_bmd is not None and hasattr(builtin_bmd, "scriptapp"):
        resolve = builtin_bmd.scriptapp("Resolve")
        if resolve is not None:
            return resolve

    try:
        import bmd  # type: ignore

        resolve = bmd.scriptapp("Resolve")
        if resolve is not None:
            return resolve
    except Exception:
        pass

    try:
        import DaVinciResolveScript as dvr_script  # type: ignore
    except Exception:
        _add_resolve_module_paths()
        try:
            import DaVinciResolveScript as dvr_script  # type: ignore
        except Exception as exc:
            raise ResolveAdapterError(
                "Resolve scripting API is unavailable; run the bridge inside Resolve"
            ) from exc

    try:
        resolve = dvr_script.scriptapp("Resolve")
    except Exception as exc:
        raise ResolveAdapterError(
            "Resolve scripting API is unavailable; run the bridge inside Resolve"
        ) from exc
    if resolve is not None:
        return resolve

    raise ResolveAdapterError("Could not connect to Resolve")


def parse_frame_rate(value: Any) -> float:
    if value is None:
        raise ResolveAdapterError("Could not read the timeline frame rate")

    text = str(value).strip()
    if not text:
        raise ResolveAdapterError("Could not read the timeline frame rate")

    match = re.fullmatch(r"(\d+(?:\.\d+)?)(?:/(\d+(?:\.\d+)?))?", text)
    if not match:
        raise ResolveAdapterError(f"Unsupported timeline frame rate: {value}")

    numerator_text, denominator_text = match.groups()
    numerator = float(numerator_text)
    denominator = float(denominator_text) if denominator_text is not None else 1.0
    frame_rate = numerator / denominator if denominator else math.inf

    if not math.isfinite(frame_rate) or frame_rate <= 0 or denominator <= 0:
        raise ResolveAdapterError(f"Unsupported timeline frame rate: {value}")

    return frame_rate


def timecode_to_frames(timecode: str, frame_rate: float) -> int:
    match = re.match(r"^(\d+):(\d+):(\d+)([:;])(\d+)$", timecode.strip())
    if not match:
        raise ResolveAdapterError(f"Unsupported timeline timecode: {timecode}")

    hours_text, minutes_text, seconds_text, separator, frames_text = match.groups()
    hours = int(hours_text)
    minutes = int(minutes_text)
    seconds = int(seconds_text)
    frames = int(frames_text)
    nominal_rate = round(frame_rate)
    if minutes > 59 or seconds > 59 or frames >= nominal_rate:
        raise ResolveAdapterError(f"Invalid timeline timecode: {timecode}")

    total_frames = (
        hours * 3600 * nominal_rate
        + minutes * 60 * nominal_rate
        + seconds * nominal_rate
        + frames
    )

    if separator == ";":
        drop_frames = round(nominal_rate * 0.0666666667)
        supports_drop_frame = (
            nominal_rate in (30, 60)
            and abs(frame_rate - nominal_rate * 1000 / 1001) < 0.01
        )
        if not supports_drop_frame:
            raise ResolveAdapterError(
                f"Unsupported drop-frame rate {frame_rate} for timecode {timecode}"
            )

        if seconds == 0 and minutes % 10 != 0 and frames < drop_frames:
            raise ResolveAdapterError(f"Invalid drop-frame timeline timecode: {timecode}")

        total_minutes = hours * 60 + minutes
        total_frames -= drop_frames * (total_minutes - total_minutes // 10)

    return total_frames


def get_project_and_timeline() -> tuple[Any, Any]:
    resolve = get_resolve()
    project_manager = _call_optional(resolve, "GetProjectManager")
    if project_manager is None:
        raise ResolveAdapterError("Resolve project manager is unavailable")

    project = _call_optional(project_manager, "GetCurrentProject")
    if project is None:
        raise ResolveAdapterError("No current Resolve project")

    timeline = _call_optional(project, "GetCurrentTimeline")
    if timeline is None:
        raise ResolveAdapterError("No current timeline")

    return project, timeline


def get_current_project() -> Any:
    resolve = get_resolve()
    project_manager = _call_optional(resolve, "GetProjectManager")
    if project_manager is None:
        raise ResolveAdapterError(
            "Resolve project manager is unavailable",
            "resolve-project-unavailable",
        )
    project = _call_optional(project_manager, "GetCurrentProject")
    if project is None:
        raise ResolveAdapterError(
            "No current Resolve project",
            "resolve-project-unavailable",
        )
    return project


def get_current_project_name() -> Dict[str, Any]:
    project = get_current_project()
    name = _call_optional(project, "GetName")
    return {"projectName": str(name).strip() if name else "Untitled Project"}


def _folder_values(value: Any) -> list[Any]:
    if isinstance(value, (list, tuple)):
        return list(value)
    if isinstance(value, dict):
        return list(value.values())
    return []


def import_media_to_bin(disk_path: Any, bin_name: Any) -> Dict[str, Any]:
    if not isinstance(disk_path, str) or not disk_path.strip():
        raise ResolveAdapterError(
            "Clipboard image import requires diskPath",
            "media-pool-import-failed",
        )
    if not isinstance(bin_name, str) or not bin_name.strip():
        raise ResolveAdapterError(
            "Clipboard image import requires binName",
            "media-pool-import-failed",
            {"diskPath": disk_path},
        )

    project = get_current_project()
    media_pool = _call_optional(project, "GetMediaPool")
    if media_pool is None:
        raise ResolveAdapterError(
            "Current Resolve project has no Media Pool",
            "resolve-media-pool-unavailable",
            {"diskPath": disk_path},
        )
    root = _call_optional(media_pool, "GetRootFolder")
    original_folder = _call_optional(media_pool, "GetCurrentFolder")
    if root is None or original_folder is None:
        raise ResolveAdapterError(
            "Resolve Media Pool folders are unavailable",
            "resolve-media-pool-unavailable",
            {"diskPath": disk_path},
        )

    folder_list_method = getattr(root, "GetSubFolderList", None)
    if not callable(folder_list_method):
        raise ResolveAdapterError(
            "Resolve Media Pool folders are unavailable",
            "resolve-media-pool-unavailable",
            {"diskPath": disk_path},
        )
    try:
        folders = _folder_values(folder_list_method())
    except Exception as exc:
        raise ResolveAdapterError(
            "Resolve Media Pool folders are unavailable",
            "resolve-media-pool-unavailable",
            {"diskPath": disk_path, "cause": str(exc)},
        ) from exc

    target_folder = None
    for folder in folders:
        get_name = getattr(folder, "GetName", None)
        if not callable(get_name):
            raise ResolveAdapterError(
                "Resolve Media Pool folder name is unavailable",
                "resolve-media-pool-unavailable",
                {"diskPath": disk_path},
            )
        try:
            folder_name = get_name()
        except Exception as exc:
            raise ResolveAdapterError(
                "Resolve Media Pool folder name is unavailable",
                "resolve-media-pool-unavailable",
                {"diskPath": disk_path, "cause": str(exc)},
            ) from exc
        if folder_name == bin_name:
            target_folder = folder
            break
    if target_folder is None:
        add_subfolder = getattr(media_pool, "AddSubFolder", None)
        try:
            target_folder = add_subfolder(root, bin_name) if callable(add_subfolder) else None
        except Exception as exc:
            raise ResolveAdapterError(
                f"Resolve could not create the {bin_name} Media Pool bin",
                "media-pool-bin-create-failed",
                {"diskPath": disk_path, "binName": bin_name, "cause": str(exc)},
            ) from exc
        if target_folder is None:
            raise ResolveAdapterError(
                f"Resolve could not create the {bin_name} Media Pool bin",
                "media-pool-bin-create-failed",
                {"diskPath": disk_path, "binName": bin_name},
            )

    primary_error: Optional[ResolveAdapterError] = None
    restore_warning: Optional[Dict[str, str]] = None
    switch_attempted = False
    should_switch = original_folder is not target_folder
    try:
        if should_switch:
            switch_attempted = True
            set_current_folder = getattr(media_pool, "SetCurrentFolder", None)
            if not callable(set_current_folder) or not set_current_folder(target_folder):
                raise ResolveAdapterError(
                    f"Resolve could not open the {bin_name} Media Pool bin",
                    "media-pool-bin-open-failed",
                    {"diskPath": disk_path, "binName": bin_name},
                )
        import_media = getattr(media_pool, "ImportMedia", None)
        if not callable(import_media):
            raise RuntimeError("Resolve Media Pool does not support ImportMedia")
        imported_items = import_media([disk_path])
        if not imported_items:
            raise RuntimeError("Resolve ImportMedia returned no imported items")
    except Exception as exc:
        primary_error = exc if (
            isinstance(exc, ResolveAdapterError)
            and exc.code == "media-pool-bin-open-failed"
        ) else ResolveAdapterError(
                "Resolve could not import the Clipboard image",
                "media-pool-import-failed",
                {
                    "diskPath": disk_path,
                    "binName": bin_name,
                    "cause": str(exc),
                },
            )
    finally:
        if should_switch and switch_attempted:
            try:
                restored = set_current_folder(original_folder)
            except Exception:
                restored = False
            if not restored:
                restore_warning = {
                    "code": "media-pool-folder-restore-failed",
                    "message": "Resolve could not restore the previous Media Pool folder",
                }
                print(f"[resolve-command-center] warning: {restore_warning['message']}")

    if primary_error is not None:
        if restore_warning is not None:
            primary_error.details["warning"] = restore_warning
        raise primary_error

    result: Dict[str, Any] = {"mediaPoolBin": bin_name}
    if restore_warning is not None:
        result["warnings"] = [restore_warning]
    return result


def _get_setting(target: Any, name: str) -> Any:
    getter = getattr(target, "GetSetting", None)
    if callable(getter):
        try:
            return getter(name)
        except Exception:
            return None
    return None


def current_timeline_frame(project: Any, timeline: Any) -> tuple[int, str]:
    current_timecode = _call_optional(timeline, "GetCurrentTimecode")
    if not current_timecode:
        raise ResolveAdapterError("Could not read the current playhead timecode")

    frame_rate = parse_frame_rate(
        _get_setting(timeline, "timelineFrameRate")
        or _get_setting(project, "timelineFrameRate")
    )
    start_timecode = _call_optional(timeline, "GetStartTimecode")
    if not start_timecode:
        raise ResolveAdapterError("Could not read the timeline start timecode")

    frame_id = (
        timecode_to_frames(str(current_timecode), frame_rate)
        - timecode_to_frames(str(start_timecode), frame_rate)
    )
    if frame_id < 0:
        raise ResolveAdapterError(
            f"Playhead timecode {current_timecode} is before timeline start {start_timecode}"
        )

    start_frame = _call_optional(timeline, "GetStartFrame")
    end_frame = _call_optional(timeline, "GetEndFrame")
    if start_frame is not None and end_frame is not None:
        last_timeline_frame = int(end_frame) - int(start_frame)
        if frame_id > last_timeline_frame:
            raise ResolveAdapterError(
                f"Playhead {current_timecode} resolves to timeline-relative frame "
                f"{frame_id}, outside the timeline range 0-{last_timeline_frame}"
            )

    return frame_id, str(current_timecode)


def read_timeline_start_frame(timeline: Any) -> Any:
    return timeline.GetStartFrame()


def read_timeline_markers(timeline: Any) -> Any:
    return timeline.GetMarkers()


def add_marker() -> Dict[str, Any]:
    project, timeline = get_project_and_timeline()
    frame_id, current_timecode = current_timeline_frame(project, timeline)

    add_marker_method = getattr(timeline, "AddMarker", None)
    if not callable(add_marker_method):
        raise ResolveAdapterError("Current timeline does not support markers")

    try:
        added = add_marker_method(
            frame_id,
            "Red",
            "Clackly Marker",
            "Added from Clackly",
            1,
            "clackly",
        )
    except Exception as exc:
        raise ResolveAdapterError(
            f"Resolve failed to add a marker at {current_timecode} "
            f"(timeline-relative frame {frame_id}): {exc}"
        ) from exc

    if not added:
        markers = _call_optional(timeline, "GetMarkers") or {}
        marker_exists = any(int(marker_frame) == frame_id for marker_frame in markers)
        if marker_exists:
            raise ResolveAdapterError(
                f"A timeline marker already exists at {current_timecode} "
                f"(timeline-relative frame {frame_id})"
            )

        raise ResolveAdapterError(
            f"Resolve refused to add a marker at {current_timecode} "
            f"(timeline-relative frame {frame_id}); ensure the playhead is inside the timeline"
        )

    return {"frame": frame_id}
