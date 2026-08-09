from dataclasses import dataclass
from typing import Any, Literal


RESOLVE_DURATION_MARKER_SOURCE = "resolve-duration-marker"


@dataclass(frozen=True, slots=True)
class TimelineRange:
    """An absolute Resolve timeline range with an exclusive end frame."""

    start_frame: int
    end_frame_exclusive: int
    source: Literal["resolve-duration-marker"] = RESOLVE_DURATION_MARKER_SOURCE

    def __post_init__(self) -> None:
        if type(self.start_frame) is not int or type(self.end_frame_exclusive) is not int:
            raise TypeError("TimelineRange requires integer frames")
        if self.end_frame_exclusive <= self.start_frame:
            raise ValueError("end_frame_exclusive must be greater than start_frame")
        if self.source != RESOLVE_DURATION_MARKER_SOURCE:
            raise ValueError(f"Unsupported TimelineRange source: {self.source}")


class TimelineRangeScanError(Exception):
    """Preserves an interrupted marker scan and its already found candidate."""

    def __init__(self, cause: Exception, partial_candidate: tuple[int, int] | None) -> None:
        super().__init__(str(cause))
        self.cause = cause
        self._partial_candidate = partial_candidate

    def resolve_partial(self, timeline_start_frame: int | None) -> TimelineRange | None:
        if self._partial_candidate is None:
            return None
        return _build_timeline_range(timeline_start_frame, self._partial_candidate)


def _build_timeline_range(
    timeline_start_frame: int | None,
    candidate: tuple[int, int],
) -> TimelineRange:
    marker_frame, duration = candidate
    timeline_start = 86400 if timeline_start_frame is None else timeline_start_frame
    start_frame = marker_frame + timeline_start
    return TimelineRange(start_frame, start_frame + duration)


def resolve_timeline_range(
    timeline_start_frame: int | None,
    markers: Any,
) -> TimelineRange | None:
    """Resolve the earliest Blue duration marker from raw Resolve timeline facts."""

    candidates: list[tuple[int, int]] = []
    try:
        if markers:
            for frame_index, info in markers.items():
                try:
                    color = info.get("color")
                    duration = int(info.get("duration", 0))
                except Exception:
                    continue
                if color == "Blue" and duration > 1:
                    candidates.append((int(frame_index), duration))
    except Exception as cause:
        partial_candidate = min(candidates, key=lambda entry: entry[0]) if candidates else None
        raise TimelineRangeScanError(cause, partial_candidate) from cause

    if not candidates:
        return None

    candidate = min(candidates, key=lambda entry: entry[0])
    return _build_timeline_range(timeline_start_frame, candidate)
