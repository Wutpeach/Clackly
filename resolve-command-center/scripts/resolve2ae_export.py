from pathlib import Path

from resolve2ae_core.export import process_and_send


COMMAND_MODES = {
    "timeline.exportToAfterEffects": "auto",
    "timeline.exportCurrentToAfterEffects": "single",
    "timeline.exportBlueRangeToAfterEffects": "video-range",
    "timeline.exportCyanRangeToAfterEffects": "mixed-range",
}


def execute(context):
    try:
        requested_mode = COMMAND_MODES[context.command_id]
    except KeyError as error:
        raise ValueError(f"Unsupported After Effects export Command: {context.command_id}") from error

    ae_path = context.config.get("aePath")
    if not isinstance(ae_path, str) or not Path(ae_path).is_file():
        raise ValueError("After Effects path must point to an existing executable file")

    prefix = context.config.get("prefix")
    config = {
        "prefix": prefix.strip() if isinstance(prefix, str) and prefix.strip() else "Link",
        "debug_mode": False,
    }
    result = process_and_send(
        context.resolve,
        context.project,
        ae_path,
        context.logger.info,
        config,
        requested_mode,
    )
    if not result["ok"]:
        raise RuntimeError(result["message"])
    return result
