from pathlib import Path

from resolve2ae_core.export import process_and_send


COMMAND_POLICIES = {
    "timeline.exportToAfterEffects": ("auto", "auto", "mixed"),
    "timeline.exportAudioToAfterEffects": ("audio-only", "auto", "audio"),
    "timeline.exportVideoToAfterEffects": ("video-only", "auto", "video"),
}


def execute(context):
    try:
        requested_mode, target_policy, media_policy = COMMAND_POLICIES[context.command_id]
    except KeyError as error:
        raise ValueError(f"Unsupported After Effects export Command: {context.command_id}") from error

    ae_path = context.config.get("aePath")
    if not isinstance(ae_path, str) or not Path(ae_path).is_file():
        raise ValueError("After Effects path must point to an existing executable file")

    prefix = context.config.get("prefix")
    config = {
        "prefix": prefix.strip() if isinstance(prefix, str) and prefix.strip() else "Link",
        "debug_mode": False,
        "create1080pPreviewComp": context.config.get("create1080pPreviewComp") is True,
    }
    result = process_and_send(
        context.resolve,
        context.project,
        ae_path,
        context.logger.info,
        config,
        requested_mode,
        target_policy,
        media_policy,
    )
    if not result["ok"]:
        raise RuntimeError(result["message"])
    return result
