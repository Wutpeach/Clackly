import math
import os
import re
import sys
from pathlib import Path
from typing import Any, Dict


class ResolveAdapterError(RuntimeError):
    """Raised for user-facing Resolve adapter failures."""


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


def _call_optional(target: Any, method_name: str) -> Any:
    method = getattr(target, method_name, None)
    if not callable(method):
        return None
    try:
        return method()
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
