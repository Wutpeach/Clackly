"""Writes only on explicit confirmed save/batch. Use a disposable Resolve project."""
import hashlib
import json

PREFIX = "Review - "


def identity(obj):
    value = obj.GetUniqueId()
    if not isinstance(value, str) or not value:
        raise ValueError("无法获取原生稳定 ID，请检查 Resolve 版本。")
    return value


def project_now(context, expected=None):
    project = context.resolve.GetProjectManager().GetCurrentProject()
    if project is None or expected is not None and identity(project) != expected:
        raise ValueError("项目已关闭或切换，请返回列表并刷新。")
    return project


def timelines(project):
    count = project.GetTimelineCount()
    if not isinstance(count, int) or not 0 <= count <= 500:
        raise ValueError("无法读取时间线，或项目超过 500 条时间线。")
    result = [project.GetTimelineByIndex(index) for index in range(1, count + 1)]
    if any(timeline is None for timeline in result):
        raise ValueError("时间线列表已变化，请刷新。")
    return result


def digest(name):
    return hashlib.sha256(name.encode("utf-8")).hexdigest()[:24]


def token(project, timeline):
    value = json.dumps([identity(project), identity(timeline), digest(timeline.GetName())], separators=(",", ":"))
    if len(value) > 512:
        raise ValueError("时间线身份数据过长。")
    return value


def target(context, value):
    try:
        project_id, timeline_id, expected_name = json.loads(value)
    except (ValueError, TypeError):
        raise ValueError("时间线身份无效，请返回列表并刷新。")
    project = project_now(context, project_id)
    timeline = next((t for t in timelines(project) if identity(t) == timeline_id), None)
    if timeline is None or digest(timeline.GetName()) != expected_name:
        raise ValueError("时间线已删除或名称已变化，请返回列表并刷新。")
    return project, timeline


def envelope(kind, view_id="timelines", **data):
    return {"$clackly": "view", "version": 1, "id": view_id, "type": kind, **data}


def result(effect, **data):
    return {"$clackly": "view-action", "version": 1, "effect": effect, **data}


def edit_action():
    return {"id": "edit", "title": "编辑时间线名称", "type": "extension"}


def globals_():
    return [{"id": "create", "title": "创建空时间线", "type": "extension"},
            {"id": "refresh", "title": "刷新当前视图", "type": "refresh"}]


def detail(timeline):
    return {"title": timeline.GetName()[:200], "text": "仅编辑名称，不修改剪辑内容。请在可丢弃的测试项目中使用。",
            "fields": [{"label": "时间线 ID", "value": identity(timeline)}],
            "actions": [edit_action(), *globals_()]}


def form(context, creating):
    if creating:
        project = project_now(context)
        view_id = "create:" + identity(project)
        if len(view_id) > 120:
            raise ValueError("项目 ID 过长。")
        name = "Clackly Test"
    else:
        _, timeline = target(context, context.view.get("itemId"))
        view_id, name = "edit", timeline.GetName()
    return envelope("form", view_id, title="创建空时间线" if creating else "编辑时间线名称",
                    subtitle="仅在可丢弃的测试项目中使用；保存后会重新读取列表。",
                    inputs={"name": {"type": "string", "label": "时间线名称", "required": True, "default": name}},
                    submit={"id": "save", "title": "保存", "dangerous": True,
                            "confirm": {"message": "确认在当前测试项目中创建空时间线？" if creating else "确认修改此时间线名称？不修改剪辑内容。"}})


def view(context):
    if context.view.get("type") == "form":
        creating = context.view["viewId"].startswith("create:")
        if creating:
            project_now(context, context.view["viewId"][7:])
        return form(context, creating)
    project = project_now(context)
    if context.view.get("type") == "detail":
        _, timeline = target(context, context.view.get("itemId"))
        return envelope("detail", refreshOnFocus=True, **detail(timeline))
    return list_view(project)


def list_view(project):
    entries = [{"id": token(project, timeline), "title": timeline.GetName()[:200],
                "subtitle": "ID: " + identity(timeline), "detail": detail(timeline),
                "actions": [{"id": "detail", "title": "查看时间线详情", "type": "detail"}, edit_action()]}
               for timeline in timelines(project)]
    return envelope("list", title="时间线管理示例", subtitle=project.GetName()[:2000], items=entries,
                    emptyMessage="当前项目没有时间线，可创建空时间线。", refreshOnFocus=True, actions=globals_(),
                    batchActions=[{"id": "prefix", "title": "批量添加 Review 前缀", "type": "extension",
                                   "dangerous": True, "confirm": {"message": "为已选时间线名称添加 Review - 前缀？此操作没有自动撤销。"}}])


def rename(context, value, name=None):
    project, timeline = target(context, value)
    name = name if name is not None else PREFIX + timeline.GetName()
    project_now(context, identity(project))
    if not timeline.SetName(name):
        raise ValueError("Resolve 拒绝重命名：" + timeline.GetName())


def view_action(context):
    action = context.view.get("actionId")
    if action in ("create", "edit"):
        return result("push", view=form(context, action == "create"))
    if action == "save" and context.view.get("scope") == "form":
        name = context.input["name"].strip()
        if not name or len(name) > 200:
            raise ValueError("名称应为 1–200 个非空字符。")
        if context.view["viewId"].startswith("create:"):
            project = project_now(context, context.view["viewId"][7:])
            if not project.GetMediaPool().CreateEmptyTimeline(name):
                raise ValueError("Resolve 未能创建时间线，请检查项目后重试。")
        else:
            rename(context, context.view.get("itemId"), name)
        # Fresh List also works when editing from a now-stale Detail snapshot.
        return result("push", view=list_view(project_now(context)), message="已保存并重新读取时间线。")
    if action == "prefix" and context.view.get("scope") == "batch":
        errors = []
        for value in context.view["itemIds"]:
            try:
                rename(context, value)
            except Exception as error:
                errors.append({"id": value, "message": f"{json.loads(value)[1]}：{error}"[:2000]})
        return result("refresh", summary={"succeeded": len(context.view["itemIds"]) - len(errors), "failed": len(errors), "errors": errors})
    raise ValueError("未知操作，请重新打开示例。")
