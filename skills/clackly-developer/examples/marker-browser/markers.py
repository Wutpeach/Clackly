"""Read-only Extension Views example. No project/marker writes or playhead movement."""
import hashlib
import json


def identity(obj):
    value = obj.GetUniqueId()
    if not isinstance(value, str) or not value:
        raise ValueError("无法获取项目或时间线稳定 ID，请检查 Resolve 版本。")
    return value


def fingerprint(marker):
    return hashlib.sha256(json.dumps(marker, sort_keys=True, ensure_ascii=False).encode()).hexdigest()[:24]


def envelope(kind, **data):
    return {"$clackly": "view", "version": 1, "id": "markers", "type": kind, **data}


def global_actions():
    return [{"id": "refresh", "title": "刷新当前视图", "type": "refresh"}]


def snapshot(context):
    if getattr(context, "phase", None) not in ("view", "view_action"):
        raise ValueError("此扩展需要支持 Extension Views 的 Clackly Host。")
    project = context.resolve.GetProjectManager().GetCurrentProject()
    if project is None:
        return None, None, {}, "请打开 Resolve 项目后刷新。"
    timeline = project.GetCurrentTimeline()
    if timeline is None:
        return project, None, {}, "当前项目没有打开的时间线，请打开时间线后刷新。"
    markers = timeline.GetMarkers()
    if not isinstance(markers, dict):
        raise ValueError("无法读取时间线标记，请检查 Resolve 连接后刷新。")
    if len(markers) > 500:
        raise ValueError("当前时间线超过 500 个标记，本版本无法完整显示。")
    return project, timeline, markers, "当前时间线没有标记；源数据变化后可刷新。"


def item(project, timeline, frame, marker, metadata=None):
    project_id, timeline_id, project_name, timeline_name = metadata or (identity(project), identity(timeline), project.GetName(), timeline.GetName())
    token = json.dumps([project_id, timeline_id, frame, fingerprint(marker)], separators=(",", ":"))
    if len(token) > 512:
        raise ValueError("标记身份数据过长，无法安全加载。")
    title = str(marker.get("name") or "未命名标记")[:200]
    note = str(marker.get("note") or "")[:32768]
    fields = [{"label": "项目", "value": str(project_name)[:2000]},
              {"label": "时间线", "value": str(timeline_name)[:2000]},
              {"label": "相对帧", "value": str(frame)},
              {"label": "颜色", "value": str(marker.get("color") or "")[:80]},
              {"label": "持续帧数", "value": str(marker.get("duration", ""))[:2000]}]
    detail = {"title": title, "text": note, "fields": fields,
              "actions": [{"id": "copy", "title": "复制标记信息", "type": "copy"},
                          {"id": "verify", "title": "核对标记当前状态", "type": "extension"},
                          {"id": "refresh", "title": "刷新当前视图", "type": "refresh"}]}
    return {"id": token, "title": title, "subtitle": f"帧 {frame} · {note[:160]}",
            "tag": str(marker.get("color") or "未分类")[:80], "detail": detail,
            "actions": [{"id": "detail", "title": "查看标记详情", "type": "detail"},
                        {"id": "copy", "title": "复制标记信息", "type": "copy"},
                        {"id": "verify", "title": "核对标记当前状态", "type": "extension"}]}


def find_current(context, project, timeline, markers):
    try:
        project_id, timeline_id, frame, digest = json.loads(context.view["itemId"])
    except (ValueError, KeyError, TypeError):
        raise ValueError("标记身份无效，请返回列表并刷新。")
    if project is None or timeline is None or identity(project) != project_id or identity(timeline) != timeline_id:
        raise ValueError("当前项目或时间线已切换，请返回列表并刷新。")
    marker = markers.get(frame)
    if marker is None or fingerprint(marker) != digest:
        raise ValueError("标记已删除或内容已变化，请返回列表并刷新。")
    return item(project, timeline, frame, marker)


def view(context):
    project, timeline, markers, empty = snapshot(context)
    if context.view.get("type") == "detail":
        return envelope("detail", **find_current(context, project, timeline, markers)["detail"])
    metadata = (identity(project), identity(timeline), project.GetName(), timeline.GetName()) if timeline else None
    entries = [item(project, timeline, frame, marker, metadata) for frame, marker in sorted(markers.items())] if timeline else []
    return envelope("list", title="时间线标记", subtitle=f"{metadata[2]} · {metadata[3]}"[:2000] if timeline else "当前 Resolve 时间线",
                    items=entries, emptyMessage=empty, actions=global_actions())


def view_action(context):
    project, timeline, markers, _ = snapshot(context)
    if context.view.get("actionId") != "verify":
        raise ValueError("未知操作。")
    current = find_current(context, project, timeline, markers)
    return {"$clackly": "view-action", "version": 1, "effect": "keep", "message": f"标记仍有效：{current['title']}"}
