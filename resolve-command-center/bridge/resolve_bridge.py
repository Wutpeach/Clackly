import re
from typing import Any, Callable, Dict


class ResolveBridgeError(RuntimeError):
    """Raised for user-facing Resolve bridge failures."""


def _call_optional(target: Any, method_name: str) -> Any:
    method = getattr(target, method_name, None)
    if not callable(method):
        return None
    return method()


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

        resolve = dvr_script.scriptapp("Resolve")
        if resolve is not None:
            return resolve
    except Exception as exc:
        raise ResolveBridgeError(
            "Resolve scripting API is unavailable; run the bridge inside Resolve"
        ) from exc

    raise ResolveBridgeError("Could not connect to Resolve")


def _parse_frame_rate(value: Any) -> float:
    if value is None:
        return 24.0

    text = str(value).strip()
    if not text:
        return 24.0

    if "/" in text:
        numerator, denominator = text.split("/", 1)
        return float(numerator) / float(denominator)

    return float(text)


def _timecode_to_frames(timecode: str, frame_rate: float) -> int:
    match = re.match(r"^(\d+):(\d+):(\d+)([:;])(\d+)$", timecode.strip())
    if not match:
        raise ResolveBridgeError(f"Unsupported timeline timecode: {timecode}")

    hours, minutes, seconds, _separator, frames = match.groups()
    rounded_rate = round(frame_rate)
    return (
        int(hours) * 3600 * rounded_rate
        + int(minutes) * 60 * rounded_rate
        + int(seconds) * rounded_rate
        + int(frames)
    )


def _get_project_timeline() -> tuple[Any, Any]:
    resolve = get_resolve()
    project_manager = _call_optional(resolve, "GetProjectManager")
    if project_manager is None:
        raise ResolveBridgeError("Resolve project manager is unavailable")

    project = _call_optional(project_manager, "GetCurrentProject")
    if project is None:
        raise ResolveBridgeError("No current Resolve project")

    timeline = _call_optional(project, "GetCurrentTimeline")
    if timeline is None:
        raise ResolveBridgeError("No current timeline")

    return project, timeline


def _timeline_setting(timeline: Any, name: str) -> Any:
    getter = getattr(timeline, "GetSetting", None)
    if callable(getter):
        try:
            return getter(name)
        except Exception:
            return None
    return None


def _project_setting(project: Any, name: str) -> Any:
    getter = getattr(project, "GetSetting", None)
    if callable(getter):
        try:
            return getter(name)
        except Exception:
            return None
    return None


def current_timeline_frame(project: Any, timeline: Any) -> int:
    direct_frame = _call_optional(timeline, "GetCurrentFrame")
    if direct_frame is not None:
        return int(direct_frame)

    current_timecode = _call_optional(timeline, "GetCurrentTimecode")
    if not current_timecode:
        raise ResolveBridgeError("Could not read the current playhead timecode")

    frame_rate = _parse_frame_rate(
        _timeline_setting(timeline, "timelineFrameRate")
        or _project_setting(project, "timelineFrameRate")
    )
    current_frames = _timecode_to_frames(str(current_timecode), frame_rate)

    start_timecode = _call_optional(timeline, "GetStartTimecode")
    start_frame = _call_optional(timeline, "GetStartFrame")
    if start_timecode:
        start_frames = _timecode_to_frames(str(start_timecode), frame_rate)
        return current_frames - start_frames + int(start_frame or 0)

    return current_frames


def add_marker() -> Dict[str, Any]:
    project, timeline = _get_project_timeline()
    frame_id = current_timeline_frame(project, timeline)

    add_marker_method = getattr(timeline, "AddMarker", None)
    if not callable(add_marker_method):
        raise ResolveBridgeError("Current timeline does not support markers")

    added = add_marker_method(
        frame_id,
        "Red",
        "Clackly Marker",
        "Added from Clackly",
        1,
        "resolve-command-center"
    )

    if not added:
        raise ResolveBridgeError("Resolve refused to add the marker")

    return {
        "frame": frame_id
    }


COMMAND_HANDLERS: Dict[str, Callable[[], Dict[str, Any]]] = {
    "timeline.addMarker": add_marker
}


def execute_command(command_id: str) -> Dict[str, Any]:
    handler = COMMAND_HANDLERS.get(command_id)
    if handler is None:
        raise ResolveBridgeError(f"Unknown command: {command_id}")

    result = handler()
    return {
        "ok": True,
        "command": command_id,
        **result
    }
