def execute(context):
    version = context.resolve.GetVersionString()
    project = context.resolve.GetProjectManager().GetCurrentProject()
    context.logger.info(context.config["label"], "Resolve", version, "project open:", project is not None)
    return {"version": version, "hasProject": project is not None}
