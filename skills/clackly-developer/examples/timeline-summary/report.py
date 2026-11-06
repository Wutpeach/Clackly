"""Read-only example for a Dynamic Prepare capable Clackly Host."""
import json


def identity(item, kind):
    try:
        value = item.GetUniqueId()
    except (AttributeError, TypeError):
        raise ValueError(f"无法获取{kind}的稳定 ID；请检查 Resolve 版本。")
    if not isinstance(value, str) or not value.strip():
        raise ValueError(f"无法获取{kind}的稳定 ID；请检查 Resolve 版本。")
    return value


def current_project(context):
    return context.resolve.GetProjectManager().GetCurrentProject()


def token(project_id, timeline_id):
    value = json.dumps([project_id, timeline_id], ensure_ascii=False, separators=(",", ":"))
    if len(value) > 200:
        raise ValueError("项目或时间线 ID 过长，无法安全生成选项。")
    return value


def timelines(project):
    count = project.GetTimelineCount()
    if count > 100:
        raise ValueError("当前项目超过 100 条时间线，无法在此版本中列出全部选项。")
    result = []
    seen = set()
    for index in range(1, count + 1):
        timeline = project.GetTimelineByIndex(index)
        if timeline is None:
            raise ValueError("时间线列表已变化，请刷新后重试。")
        timeline_id = identity(timeline, "时间线")
        if timeline_id in seen:
            raise ValueError("时间线 ID 重复，无法安全选择。")
        seen.add(timeline_id)
        result.append((index, timeline, timeline_id))
    return result


def prepare(context):
    project = current_project(context)
    result = {"$clackly": "prepare", "version": 1, "options": {"timeline": []}}
    if project is None:
        result["message"] = "请先在 Resolve 中打开项目，然后刷新。"
        return result
    project_id = identity(project, "项目")
    entries = timelines(project)
    current = project.GetCurrentTimeline()
    current_id = identity(current, "当前时间线") if current else None
    for index, timeline, timeline_id in entries:
        value = token(project_id, timeline_id)
        name = str(timeline.GetName() or "未命名")
        result["options"]["timeline"].append({"label": f"{index:03d} · {name[:190]}", "value": value})
        if timeline_id == current_id:
            result["defaults"] = {"timeline": value}
    result["message"] = "选择时间线；项目变化后请刷新。" if entries else "项目没有时间线；添加后请刷新。"
    return result


def execute(context):
    inputs = getattr(context, "input", None)
    if getattr(context, "phase", None) != "execute" or not isinstance(inputs, dict) or not inputs.get("timeline"):
        raise ValueError("此命令需要支持动态准备的 Clackly Host，请更新 Host 并重新运行。")
    try:
        ids = json.loads(inputs["timeline"])
        if not isinstance(ids, list) or len(ids) != 2 or any(not isinstance(x, str) or not x for x in ids):
            raise ValueError()
        project_id, timeline_id = ids
    except (ValueError, TypeError):
        raise ValueError("时间线选项无效，请刷新后重试。")
    project = current_project(context)
    if project is None or identity(project, "项目") != project_id:
        raise ValueError("当前项目已关闭或切换，请刷新后重新选择。")
    for _, timeline, candidate_id in timelines(project):
        if candidate_id == timeline_id:
            title = inputs.get("title") or "时间线摘要"
            return {"$clackly": "result", "version": 1, "status": "success",
                    "message": "时间线摘要已生成", "text": title, "fields": [
                        {"label": "项目", "value": str(project.GetName())[:2000]},
                        {"label": "时间线", "value": str(timeline.GetName())[:2000]},
                        {"label": "时间线 ID", "value": timeline_id[:2000]}]}
    raise ValueError("所选时间线已删除或不可用，请刷新后重新选择。")
